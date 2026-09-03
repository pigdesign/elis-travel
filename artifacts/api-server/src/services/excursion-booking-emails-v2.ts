import { db } from "@workspace/db";
import {
  excursionsTable,
  excursionBookingsTable,
  bookingParticipantsTable,
  paymentRequestsTable,
} from "@workspace/db/schema";
import { and, eq, asc, desc } from "drizzle-orm";
import { logger } from "../lib/logger";
import { getAdminNotificationEmails, type EmailMessage } from "./email.service";
import {
  getPaymentSettings,
  isOnBusPaymentAvailable,
} from "./excursion-pricing";
import { enqueueEmail } from "./email-outbox";
import {
  buildBookingPortalUrl,
  ensureBookingAccessToken,
} from "./booking-access-token";
import { isPaymentBlockedByCancellation } from "./booking-cancellation-guard";
import {
  inviteSections,
  prepareBookingInvite,
} from "./customer-account-provisioning";

// ---------------------------------------------------------------------------
// Email transazionali Gite v2. I dispatcher costruiscono uno snapshot del
// messaggio e lo salvano nell'outbox persistente; il job di manutenzione cura
// invio, retry e deduplicazione.
// ---------------------------------------------------------------------------

// Impaginazione e dati agenzia vivono in email-layout.ts: li condividiamo con
// le email dell'area clienti. L'alias `wrap` mantiene invariati i punti di uso.
import {
  agency,
  escapeHtml,
  wrapEmailHtml as wrap,
} from "./email-layout";

function euro(cents: number): string {
  return (cents / 100).toLocaleString("it-IT", {
    style: "currency",
    currency: "EUR",
  });
}

function formatDateIt(dateString: string): string {
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return dateString;
  return d.toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function formatDateTimeIt(d: Date): string {
  return d.toLocaleString("it-IT", {
    timeZone: "Europe/Rome",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const PARTICIPANT_LABELS: Record<string, string> = {
  adult: "Adulto",
  child: "Bambino",
  patient: "Paziente",
  companion: "Accompagnatore",
};

type LoadedBooking = {
  booking: typeof excursionBookingsTable.$inferSelect;
  excursion: typeof excursionsTable.$inferSelect;
  participants: (typeof bookingParticipantsTable.$inferSelect)[];
};

async function loadBookingSnapshot(
  bookingId: string,
): Promise<LoadedBooking | null> {
  const [booking] = await db
    .select()
    .from(excursionBookingsTable)
    .where(eq(excursionBookingsTable.id, bookingId))
    .limit(1);
  if (!booking) return null;
  const [excursion] = await db
    .select()
    .from(excursionsTable)
    .where(eq(excursionsTable.id, booking.excursionId))
    .limit(1);
  if (!excursion) return null;
  const participants = await db
    .select()
    .from(bookingParticipantsTable)
    .where(eq(bookingParticipantsTable.bookingId, bookingId))
    .orderBy(asc(bookingParticipantsTable.sortOrder));
  return { booking, excursion, participants };
}

async function loadBooking(bookingId: string): Promise<LoadedBooking | null> {
  const loaded = await loadBookingSnapshot(bookingId);
  return loaded?.booking.email ? loaded : null;
}

async function loadBookingForAdmin(
  bookingId: string,
): Promise<LoadedBooking | null> {
  return loadBookingSnapshot(bookingId);
}

async function loadLatestPaymentRequest(
  bookingId: string,
  requestType?: string,
) {
  const [request] = await db
    .select()
    .from(paymentRequestsTable)
    .where(
      requestType
        ? and(
            eq(paymentRequestsTable.bookingId, bookingId),
            eq(paymentRequestsTable.type, requestType),
          )
        : eq(paymentRequestsTable.bookingId, bookingId),
    )
    .orderBy(desc(paymentRequestsTable.createdAt))
    .limit(1);
  return request ?? null;
}

async function loadPaymentRequestById(bookingId: string, requestId: string) {
  const [request] = await db
    .select()
    .from(paymentRequestsTable)
    .where(
      and(
        eq(paymentRequestsTable.id, requestId),
        eq(paymentRequestsTable.bookingId, bookingId),
      ),
    )
    .limit(1);
  return request ?? null;
}

function graceLine(
  deadline: Date | null,
  graceUntil: Date | null,
): string | null {
  if (!graceUntil || (deadline && graceUntil <= deadline)) return null;
  return `Periodo di tolleranza fino a: ${formatDateTimeIt(graceUntil)}`;
}

// Righe riepilogo partecipanti (testo + html)
function participantLines(ctx: LoadedBooking): {
  text: string[];
  html: string[];
} {
  const text: string[] = [];
  const html: string[] = [];
  const total = ctx.booking.totalAmountCents ?? 0;
  const freeBooking = total === 0;
  const pricesAvailable = ctx.participants.some(
    (participant) =>
      participant.basePriceCents > 0 ||
      participant.pickupSurchargeCents > 0 ||
      participant.finalPriceCents > 0,
  );
  for (const p of ctx.participants) {
    const fullName = [p.firstName?.trim(), p.lastName?.trim()]
      .filter(Boolean)
      .join(" ");
    const label = [
      fullName || null,
      PARTICIPANT_LABELS[p.participantType] ?? p.participantType,
      p.ageRangeLabel,
      p.pickupPointName ? `raccolta ${p.pickupPointName}` : null,
    ]
      .filter(Boolean)
      .join(" · ");
    const price = freeBooking
      ? "gratuito"
      : pricesAvailable
        ? euro(p.finalPriceCents)
        : null;
    text.push(`- ${label}${price ? `: ${price}` : ""}`);
    html.push(
      `<li>${escapeHtml(label)}${price ? `: <strong>${escapeHtml(price)}</strong>` : ""}</li>`,
    );
  }
  return { text, html };
}

function baseSummary(ctx: LoadedBooking): { text: string[]; html: string[] } {
  const { booking, excursion } = ctx;
  const parts = participantLines(ctx);
  const total = booking.totalAmountCents ?? 0;
  const residual = total - booking.amountPaidCents;
  const departure = excursion.departureAt
    ? formatDateTimeIt(excursion.departureAt)
    : formatDateIt(excursion.date);
  const text = [
    `Gita: ${excursion.name} (${excursion.location})`,
    `Partenza: ${departure}`,
    `Codice prenotazione: ${booking.bookingCode ?? booking.id}`,
    `Persone: ${booking.seats}`,
    ...(booking.servizioCasa
      ? [
          `Ritiro a domicilio: ${booking.homePickupAddress?.trim() || "ATTENZIONE: indirizzo non registrato"}`,
        ]
      : []),
    ...parts.text,
    `Totale: ${euro(total)}`,
    `Pagato: ${euro(booking.amountPaidCents)}`,
    `Residuo: ${euro(Math.max(residual, 0))}`,
  ];
  const html = [
    `<p><strong>${escapeHtml(excursion.name)}</strong> — ${escapeHtml(excursion.location)}<br/>`,
    `Partenza: ${escapeHtml(departure)}<br/>`,
    `Codice prenotazione: <strong>${escapeHtml(booking.bookingCode ?? booking.id)}</strong></p>`,
    ...(booking.servizioCasa
      ? [
          `<p><strong>Ritiro a domicilio:</strong> ${escapeHtml(booking.homePickupAddress?.trim() || "ATTENZIONE: indirizzo non registrato")}</p>`,
        ]
      : []),
    `<ul>${parts.html.join("")}</ul>`,
    `<p>Totale: <strong>${escapeHtml(euro(total))}</strong><br/>`,
    `Pagato: ${escapeHtml(euro(booking.amountPaidCents))}<br/>`,
    `Residuo: ${escapeHtml(euro(Math.max(residual, 0)))}</p>`,
  ];
  return { text, html };
}

async function queueBuiltEmail(opts: {
  bookingId: string;
  eventType: string;
  dedupeKey: string;
  message: Promise<EmailMessage | null>;
  label: string;
}): Promise<void> {
  try {
    const message = await opts.message;
    if (!message) return;
    await enqueueEmail({
      bookingId: opts.bookingId,
      eventType: opts.eventType,
      dedupeKey: opts.dedupeKey,
      message,
    });
  } catch (err) {
    logger.error(
      { err, bookingId: opts.bookingId },
      `Accodamento email fallito: ${opts.label}`,
    );
  }
}

// ---------------------------------------------------------------------------
// 1) Prenotazione registrata con istruzioni di pagamento (bonifico / ufficio)
// ---------------------------------------------------------------------------

export async function dispatchBookingInstructionsEmailsV2(
  bookingId: string,
): Promise<void> {
  await Promise.all([
    dispatchBookingInstructionsCustomerEmailV2(bookingId),
    queueBuiltEmail({
      bookingId,
      eventType: "booking.created.admin",
      dedupeKey: `booking:${bookingId}:created-admin:v2`,
      message: buildNewBookingAdminEmail(bookingId),
      label: "notifica admin",
    }),
  ]);
}

/**
 * Accoda soltanto le istruzioni per il cliente. Le prenotazioni create
 * dall'amministrazione usano questa variante perché la notifica admin viene
 * sempre inviata, mentre l'email cliente dipende dalla scelta esplicita nel
 * modulo manuale.
 */
export async function dispatchBookingInstructionsCustomerEmailV2(
  bookingId: string,
): Promise<void> {
  await queueBuiltEmail({
    bookingId,
    eventType: "booking.instructions.customer",
    dedupeKey: `booking:${bookingId}:instructions:v2`,
    message: buildInstructionsCustomerEmail(bookingId),
    label: "istruzioni cliente",
  });
}

// Solo notifica admin (prenotazioni con carta: il cliente riceve la ricevuta al pagamento)
export async function dispatchNewBookingAdminEmailV2(
  bookingId: string,
): Promise<void> {
  await queueBuiltEmail({
    bookingId,
    eventType: "booking.created.admin",
    dedupeKey: `booking:${bookingId}:created-admin:v2`,
    message: buildNewBookingAdminEmail(bookingId),
    label: "notifica admin",
  });
}

export async function dispatchCardSavedEmailV2(
  bookingId: string,
): Promise<void> {
  await queueBuiltEmail({
    bookingId,
    eventType: "booking.card-saved.customer",
    dedupeKey: `booking:${bookingId}:card-saved:v2`,
    message: buildCardSavedEmail(bookingId),
    label: "carta salvata",
  });
}

async function buildCardSavedEmail(
  bookingId: string,
): Promise<EmailMessage | null> {
  const ctx = await loadBooking(bookingId);
  if (!ctx) return null;
  const { booking, excursion } = ctx;
  if (
    booking.paymentStatus !== "card_saved" ||
    isPaymentBlockedByCancellation(booking)
  )
    return null;
  const summary = baseSummary(ctx);
  const access = await ensureBookingAccessToken(bookingId);
  const portalUrl = buildBookingPortalUrl(access.token);
  const amount = booking.amountDueCents ?? 0;
  const cardInvite = inviteSections(await prepareBookingInvite(bookingId));
  const subject = `Carta salvata, nessun addebito — ${excursion.name}`;
  const text = [
    `Ciao ${booking.customerName},`,
    "",
    "la carta è stata salvata correttamente e non è stato effettuato alcun addebito.",
    `Se la gita verrà confermata, ElisTravel addebiterà l'acconto di ${euro(amount)} secondo l'autorizzazione fornita. Se la gita non verrà confermata, non verrà addebitato nulla.`,
    "",
    ...summary.text,
    "",
    `Consulta la prenotazione: ${portalUrl}`,
    ...cardInvite.text,
  ].join("\n");
  const html = wrap(
    "Carta salvata, nessun addebito",
    `<p>Ciao ${escapeHtml(booking.customerName)},<br/>la carta è stata salvata correttamente e <strong>non è stato effettuato alcun addebito</strong>.</p>
     <p>Se la gita verrà confermata, ElisTravel addebiterà l'acconto di <strong>${escapeHtml(euro(amount))}</strong> secondo l'autorizzazione fornita. Se la gita non verrà confermata, non verrà addebitato nulla.</p>
     ${summary.html.join("")}
     <p style="margin-top:24px;"><a href="${escapeHtml(portalUrl)}" style="display:inline-block;padding:12px 18px;background:#0b5b60;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">Consulta la prenotazione</a></p>
     ${cardInvite.html}`,
  );
  return {
    to: booking.email!,
    subject,
    text,
    html,
    replyTo: agency().email,
  };
}

// ---------------------------------------------------------------------------
// Conferma della gita: evento distinto dalla ricevuta del pagamento.
// ---------------------------------------------------------------------------

export async function dispatchExcursionConfirmedEmailV2(
  bookingId: string,
): Promise<void> {
  await queueBuiltEmail({
    bookingId,
    eventType: "booking.excursion-confirmed.customer",
    dedupeKey: `booking:${bookingId}:excursion-confirmed:v2`,
    message: buildExcursionConfirmedEmail(bookingId),
    label: "conferma gita cliente",
  });
}

async function buildExcursionConfirmedEmail(
  bookingId: string,
): Promise<EmailMessage | null> {
  const ctx = await loadBooking(bookingId);
  if (!ctx) return null;
  const { booking, excursion } = ctx;
  if (
    excursion.status !== "confirmed" ||
    booking.cancelledAt ||
    booking.seatStatus === "released" ||
    isPaymentBlockedByCancellation(booking)
  ) {
    return null;
  }
  const residual = Math.max(
    (booking.totalAmountCents ?? 0) - booking.amountPaidCents,
    0,
  );
  const balance =
    residual > 0 ? await loadLatestPaymentRequest(bookingId, "balance") : null;
  const activeBalance =
    balance && ["pending", "action_required"].includes(balance.status)
      ? balance
      : null;
  const access = await ensureBookingAccessToken(bookingId);
  const portalUrl = buildBookingPortalUrl(access.token);
  const summary = baseSummary(ctx);
  const deadline = activeBalance?.deadline
    ? formatDateTimeIt(activeBalance.deadline)
    : null;
  const tolerance = activeBalance
    ? graceLine(activeBalance.deadline, activeBalance.graceUntil)
    : null;
  const financialText =
    residual <= 0
      ? "La prenotazione è già completamente saldata."
      : activeBalance
        ? `Il saldo di ${euro(activeBalance.amountCents)} è disponibile nel portale${deadline ? ` con scadenza ${deadline}` : ""}.${tolerance ? ` ${tolerance}.` : ""}`
        : `Risulta ancora un residuo di ${euro(residual)}. Consulta il portale o contatta l'agenzia per le modalità di saldo.`;
  const invite = inviteSections(await prepareBookingInvite(bookingId));
  const subject = `Gita confermata — ${excursion.name} (${booking.bookingCode ?? ""})`;
  const text = [
    `Ciao ${booking.customerName},`,
    "",
    `la gita ${excursion.name} è confermata.`,
    financialText,
    "",
    ...summary.text,
    "",
    `Gestisci la prenotazione${residual > 0 ? " e il saldo" : ""}: ${portalUrl}`,
    ...invite.text,
  ].join("\n");
  const html = wrap(
    "Gita confermata",
    `<p>Ciao ${escapeHtml(booking.customerName)},<br/>la gita <strong>${escapeHtml(excursion.name)}</strong> è confermata.</p>
     <p>${escapeHtml(financialText)}</p>
     ${summary.html.join("")}
     <p style="margin-top:24px;"><a href="${escapeHtml(portalUrl)}" style="display:inline-block;padding:12px 18px;background:#0b5b60;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">${residual > 0 ? "Gestisci e paga il saldo" : "Consulta la prenotazione"}</a></p>
     ${invite.html}`,
  );
  return { to: booking.email!, subject, text, html, replyTo: agency().email };
}

export async function dispatchPaymentDeadlineExtendedEmailV2(input: {
  bookingId: string;
  paymentRequestId: string;
  deadline: Date;
  graceUntil: Date;
}): Promise<void> {
  await queueBuiltEmail({
    bookingId: input.bookingId,
    eventType: "booking.payment-deadline-extended.customer",
    dedupeKey: `payment-request:${input.paymentRequestId}:deadline-extended:${input.deadline.toISOString()}:${input.graceUntil.toISOString()}:v2`,
    message: buildPaymentDeadlineExtendedEmail(input),
    label: "proroga scadenza cliente",
  });
}

async function buildPaymentDeadlineExtendedEmail(input: {
  bookingId: string;
  paymentRequestId: string;
  deadline: Date;
  graceUntil: Date;
}): Promise<EmailMessage | null> {
  const ctx = await loadBooking(input.bookingId);
  if (!ctx) return null;
  const request = await loadPaymentRequestById(
    input.bookingId,
    input.paymentRequestId,
  );
  if (
    !request ||
    !["pending", "action_required"].includes(request.status) ||
    request.deadline?.getTime() !== input.deadline.getTime() ||
    request.graceUntil?.getTime() !== input.graceUntil.getTime() ||
    ctx.booking.cancelledAt ||
    ctx.booking.seatStatus === "released" ||
    isPaymentBlockedByCancellation(ctx.booking)
  ) {
    return null;
  }
  const access = await ensureBookingAccessToken(input.bookingId);
  const portalUrl = buildBookingPortalUrl(access.token);
  const deadline = formatDateTimeIt(input.deadline);
  const tolerance = graceLine(input.deadline, input.graceUntil);
  const label =
    request.type === "balance"
      ? "saldo"
      : request.type === "deposit"
        ? "acconto"
        : "pagamento";
  const subject = `Nuova scadenza ${label} — ${ctx.excursion.name}`;
  const text = [
    `Ciao ${ctx.booking.customerName},`,
    "",
    `l'amministrazione ha prorogato la scadenza del ${label} di ${euro(request.amountCents)}.`,
    `Nuova scadenza: ${deadline}`,
    ...(tolerance ? [tolerance] : []),
    "",
    `Paga o consulta le istruzioni: ${portalUrl}`,
  ].join("\n");
  const html = wrap(
    `Nuova scadenza ${label}`,
    `<p>Ciao ${escapeHtml(ctx.booking.customerName)},<br/>l'amministrazione ha prorogato la scadenza del ${escapeHtml(label)} di <strong>${escapeHtml(euro(request.amountCents))}</strong>.</p>
     <p>Nuova scadenza: <strong>${escapeHtml(deadline)}</strong>${tolerance ? `<br/>${escapeHtml(tolerance)}` : ""}</p>
     <p style="margin-top:24px;"><a href="${escapeHtml(portalUrl)}" style="display:inline-block;padding:12px 18px;background:#0b5b60;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">Paga / consulta istruzioni</a></p>`,
  );
  return {
    to: ctx.booking.email!,
    subject,
    text,
    html,
    replyTo: agency().email,
  };
}

export async function dispatchCancellationRequestedEmailsV2(
  bookingId: string,
  cancellationCaseId?: string,
): Promise<void> {
  const dedupeScope = cancellationCaseId ?? bookingId;
  await Promise.all([
    queueBuiltEmail({
      bookingId,
      eventType: "booking.cancellation-requested.customer",
      dedupeKey: `cancellation-case:${dedupeScope}:requested-customer:v2`,
      message: buildCancellationRequestedCustomerEmail(bookingId),
      label: "ricezione richiesta annullamento cliente",
    }),
    queueBuiltEmail({
      bookingId,
      eventType: "booking.cancellation-requested.admin",
      dedupeKey: `cancellation-case:${dedupeScope}:requested-admin:v2`,
      message: buildCancellationRequestedAdminEmail(bookingId),
      label: "richiesta annullamento admin",
    }),
  ]);
}

async function buildCancellationRequestedCustomerEmail(
  bookingId: string,
): Promise<EmailMessage | null> {
  const ctx = await loadBooking(bookingId);
  if (!ctx) return null;
  const { booking, excursion } = ctx;
  const subject = `Richiesta di annullamento ricevuta — ${excursion.name}`;
  const text = [
    `Ciao ${booking.customerName},`,
    "",
    `abbiamo ricevuto la richiesta di annullamento per ${excursion.name}.`,
    "La prenotazione non è ancora annullata e i posti restano riservati finché l'amministrazione non verifica le condizioni economiche e l'eventuale rimborso.",
    `Codice prenotazione: ${booking.bookingCode ?? booking.id}`,
  ].join("\n");
  const html = wrap(
    "Richiesta di annullamento ricevuta",
    `<p>Ciao ${escapeHtml(booking.customerName)},<br/>abbiamo ricevuto la richiesta di annullamento per <strong>${escapeHtml(excursion.name)}</strong>.</p>
     <p>La prenotazione non è ancora annullata e i posti restano riservati finché l'amministrazione non verifica le condizioni economiche e l'eventuale rimborso.</p>
     <p>Codice: <strong>${escapeHtml(booking.bookingCode ?? booking.id)}</strong></p>`,
  );
  return { to: booking.email!, subject, text, html, replyTo: agency().email };
}

async function buildCancellationRequestedAdminEmail(
  bookingId: string,
): Promise<EmailMessage | null> {
  const admins = getAdminNotificationEmails();
  if (admins.length === 0) return null;
  const ctx = await loadBooking(bookingId);
  if (!ctx) return null;
  const { booking, excursion } = ctx;
  const reason = booking.cancellationRequestReason?.trim() || null;
  const subject =
    `Azione richiesta: annullamento ${booking.bookingCode ?? ""}`.trim();
  const text = [
    `${booking.customerName} ha richiesto l'annullamento di ${excursion.name}.`,
    `Codice: ${booking.bookingCode ?? booking.id}`,
    `Pagato: ${euro(booking.amountPaidCents)}`,
    ...(reason ? [`Motivo indicato dal cliente: ${reason}`] : []),
    "Verificare penali/rimborso prima di liberare i posti.",
  ].join("\n");
  const html = wrap(
    "Richiesta annullamento da gestire",
    `<p><strong>${escapeHtml(booking.customerName)}</strong> ha richiesto l'annullamento di ${escapeHtml(excursion.name)}.</p>
     <p>Codice: <strong>${escapeHtml(booking.bookingCode ?? booking.id)}</strong><br/>Pagato: <strong>${escapeHtml(euro(booking.amountPaidCents))}</strong>${reason ? `<br/>Motivo indicato dal cliente: ${escapeHtml(reason)}` : ""}</p>
     <p>Verificare penali e rimborso prima di liberare i posti.</p>`,
  );
  return { to: admins, subject, text, html };
}

export type BookingCancellationEmailPhase =
  | "approved"
  | "rejected"
  | "completed"
  | "excursion_cancelled";

/**
 * Comunica una decisione di annullamento usando sempre uno snapshot riletto dal
 * database. La chiave include la fase: approvazione e completamento del
 * rimborso sono due eventi distinti, ma ciascuno resta idempotente.
 */
export async function dispatchBookingCancellationEmailV2(
  bookingId: string,
  phase: BookingCancellationEmailPhase,
  cancellationCaseId?: string,
): Promise<void> {
  const dedupeScope = cancellationCaseId ?? bookingId;
  await queueBuiltEmail({
    bookingId,
    eventType: `booking.cancellation.${phase}.customer`,
    dedupeKey: `cancellation-case:${dedupeScope}:${phase}:customer:v2`,
    message: buildBookingCancellationEmail(bookingId, phase),
    label: `annullamento ${phase}`,
  });
}

async function buildBookingCancellationEmail(
  bookingId: string,
  phase: BookingCancellationEmailPhase,
): Promise<EmailMessage | null> {
  const ctx = await loadBooking(bookingId);
  if (!ctx) return null;
  const { booking, excursion } = ctx;
  const code = booking.bookingCode ?? booking.id;
  const refund = Math.max(booking.cancellationRefundAmountCents ?? 0, 0);
  const penalty = Math.max(booking.cancellationPenaltyAmountCents ?? 0, 0);
  const note = booking.cancellationResolutionNote?.trim() || null;

  if (phase === "rejected") {
    const subject = `Richiesta di annullamento non accolta — ${excursion.name}`;
    const text = [
      `Ciao ${booking.customerName},`,
      "",
      `la richiesta di annullamento della prenotazione ${code} non è stata accolta. La prenotazione e i posti restano attivi.`,
      ...(note ? [`Nota dell'agenzia: ${note}`] : []),
      "Per chiarimenti contatta l'agenzia.",
    ].join("\n");
    const html = wrap(
      "Richiesta di annullamento non accolta",
      `<p>Ciao ${escapeHtml(booking.customerName)},<br/>la richiesta di annullamento della prenotazione <strong>${escapeHtml(code)}</strong> per ${escapeHtml(excursion.name)} non è stata accolta. La prenotazione e i posti restano attivi.</p>${note ? `<p><strong>Nota dell'agenzia:</strong> ${escapeHtml(note)}</p>` : ""}<p>Per chiarimenti contatta l'agenzia.</p>`,
    );
    return { to: booking.email!, subject, text, html, replyTo: agency().email };
  }

  if (phase === "completed") {
    const subject = `Annullamento concluso — ${excursion.name}`;
    const refundLine =
      refund > 0
        ? `Il rimborso deliberato di ${euro(refund)} risulta completato.`
        : "L'annullamento non prevede somme da rimborsare.";
    const text = [
      `Ciao ${booking.customerName},`,
      "",
      `l'annullamento della prenotazione ${code} è concluso.`,
      refundLine,
      ...(penalty > 0
        ? [
            `Importo trattenuto secondo la decisione comunicata: ${euro(penalty)}.`,
          ]
        : []),
      ...(note ? [`Nota dell'agenzia: ${note}`] : []),
    ].join("\n");
    const html = wrap(
      "Annullamento concluso",
      `<p>Ciao ${escapeHtml(booking.customerName)},<br/>l'annullamento della prenotazione <strong>${escapeHtml(code)}</strong> per ${escapeHtml(excursion.name)} è concluso.</p><p>${escapeHtml(refundLine)}${penalty > 0 ? `<br/>Importo trattenuto: <strong>${escapeHtml(euro(penalty))}</strong>.` : ""}</p>${note ? `<p><strong>Nota dell'agenzia:</strong> ${escapeHtml(note)}</p>` : ""}`,
    );
    return { to: booking.email!, subject, text, html, replyTo: agency().email };
  }

  const excursionCancelled = phase === "excursion_cancelled";
  const title = excursionCancelled
    ? "Gita annullata"
    : "Annullamento approvato";
  const subject = `${title} — ${excursion.name}`;
  const refundLine =
    refund > 0
      ? `È stato disposto un rimborso di ${euro(refund)}. Riceverai una comunicazione finale quando tutti i passaggi saranno conclusi.`
      : penalty > 0
        ? `In base alla decisione amministrativa non è previsto un rimborso; l'importo trattenuto è ${euro(penalty)}.`
        : "Non risultano pagamenti da rimborsare.";
  const text = [
    `Ciao ${booking.customerName},`,
    "",
    excursionCancelled
      ? `la gita ${excursion.name} è stata annullata e la prenotazione ${code} è stata chiusa.`
      : `la richiesta di annullamento della prenotazione ${code} è stata approvata e i posti sono stati liberati.`,
    refundLine,
    ...(note ? [`Nota dell'agenzia: ${note}`] : []),
  ].join("\n");
  const html = wrap(
    title,
    `<p>Ciao ${escapeHtml(booking.customerName)},<br/>${excursionCancelled ? `la gita <strong>${escapeHtml(excursion.name)}</strong> è stata annullata e la prenotazione <strong>${escapeHtml(code)}</strong> è stata chiusa.` : `la richiesta di annullamento della prenotazione <strong>${escapeHtml(code)}</strong> è stata approvata e i posti sono stati liberati.`}</p><p>${escapeHtml(refundLine)}</p>${note ? `<p><strong>Nota dell'agenzia:</strong> ${escapeHtml(note)}</p>` : ""}`,
  );
  return { to: booking.email!, subject, text, html, replyTo: agency().email };
}

async function buildInstructionsCustomerEmail(
  bookingId: string,
): Promise<EmailMessage | null> {
  const ctx = await loadBooking(bookingId);
  if (!ctx) return null;
  const { booking, excursion } = ctx;
  const settings = await getPaymentSettings();
  const summary = baseSummary(ctx);
  const request = await loadLatestPaymentRequest(
    bookingId,
    booking.paymentType ?? undefined,
  );
  const access = await ensureBookingAccessToken(bookingId);
  const portalUrl = buildBookingPortalUrl(access.token);
  const amountLabel =
    booking.paymentType === "deposit"
      ? "Acconto da versare"
      : "Importo da pagare";
  const deadline = booking.paymentDeadline
    ? formatDateTimeIt(booking.paymentDeadline)
    : null;
  const tolerance = graceLine(
    request?.deadline ?? null,
    request?.graceUntil ?? null,
  );
  const causale = `${booking.bookingCode ?? booking.id} - ${booking.customerName.split(" ").slice(-1)[0] ?? ""} - ${excursion.name}`;

  const textLines = [
    `Ciao ${booking.customerName},`,
    ``,
    `abbiamo registrato la tua prenotazione. Ecco il riepilogo:`,
    ...summary.text,
    ``,
    `${amountLabel}: ${euro(booking.amountDueCents ?? 0)}`,
    ...(deadline ? [`Scadenza pagamento: ${deadline}`] : []),
    ...(tolerance ? [tolerance] : []),
    ``,
  ];
  let methodHtml = "";
  if (booking.paymentMethod === "bank_transfer") {
    textLines.push(
      `Dati per il bonifico:`,
      ...(settings.beneficiary
        ? [`Intestatario: ${settings.beneficiary}`]
        : []),
      ...(settings.iban ? [`IBAN: ${settings.iban}`] : []),
      ...(settings.bank ? [`Banca: ${settings.bank}`] : []),
      `Causale (obbligatoria): ${causale}`,
    );
    methodHtml = `<h3>Dati per il bonifico</h3><p>${[
      settings.beneficiary
        ? `Intestatario: <strong>${escapeHtml(settings.beneficiary)}</strong>`
        : null,
      settings.iban
        ? `IBAN: <strong>${escapeHtml(settings.iban)}</strong>`
        : null,
      settings.bank ? `Banca: ${escapeHtml(settings.bank)}` : null,
      `Causale (obbligatoria): <strong>${escapeHtml(causale)}</strong>`,
    ]
      .filter(Boolean)
      .join("<br/>")}</p>`;
  } else if (booking.paymentMethod === "office") {
    textLines.push(
      `Pagamento in ufficio:`,
      ...(settings.officeAddress
        ? [`Indirizzo: ${settings.officeAddress}`]
        : []),
      ...(settings.officeOpeningHours
        ? [`Orari: ${settings.officeOpeningHours}`]
        : []),
      `Il posto è riservato temporaneamente fino alla scadenza indicata.`,
      `Presentati citando il codice ${booking.bookingCode ?? booking.id}.`,
    );
    methodHtml = `<h3>Pagamento in ufficio</h3><p>${[
      settings.officeAddress
        ? `Indirizzo: <strong>${escapeHtml(settings.officeAddress)}</strong>`
        : null,
      settings.officeOpeningHours
        ? `Orari: ${escapeHtml(settings.officeOpeningHours)}`
        : null,
      `Il posto è riservato temporaneamente fino alla scadenza indicata.`,
      `Presentati citando il codice <strong>${escapeHtml(booking.bookingCode ?? booking.id)}</strong>.`,
    ]
      .filter(Boolean)
      .join("<br/>")}</p>`;
  }
  // Richiamo all'area clienti: agganciato a QUESTA prenotazione e mai
  // bloccante — se fallisce, la conferma parte comunque senza il riquadro.
  const invite = inviteSections(await prepareBookingInvite(bookingId));

  textLines.push(
    ``,
    `Gestisci la prenotazione o richiedi l'annullamento: ${portalUrl}`,
    ...invite.text,
    ``,
    `A presto!`,
  );

  const subject =
    `Prenotazione ${booking.bookingCode ?? ""} — ${excursion.name}`.trim();
  const html = wrap(
    "Prenotazione registrata",
    `<p>Ciao ${escapeHtml(booking.customerName)},<br/>abbiamo registrato la tua prenotazione.</p>
     ${summary.html.join("")}
     <p>${escapeHtml(amountLabel)}: <strong>${escapeHtml(euro(booking.amountDueCents ?? 0))}</strong>${deadline ? `<br/>Scadenza pagamento: <strong>${escapeHtml(deadline)}</strong>` : ""}${tolerance ? `<br/>${escapeHtml(tolerance)}` : ""}</p>
     ${methodHtml}
     <p style="margin-top:24px;"><a href="${escapeHtml(portalUrl)}" style="display:inline-block;padding:12px 18px;background:#0b5b60;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">Gestisci prenotazione / richiedi annullamento</a></p>
     ${invite.html}`,
  );
  return {
    to: booking.email!,
    subject,
    text: textLines.join("\n"),
    html,
    replyTo: agency().email,
  };
}

async function buildNewBookingAdminEmail(
  bookingId: string,
): Promise<EmailMessage | null> {
  const admins = getAdminNotificationEmails();
  if (admins.length === 0) return null;
  const ctx = await loadBookingForAdmin(bookingId);
  if (!ctx) return null;
  const { booking, excursion } = ctx;
  const summary = baseSummary(ctx);
  const method =
    booking.paymentMethod === "card"
      ? "Carta"
      : booking.paymentMethod === "office"
        ? "In ufficio"
        : booking.paymentMethod === "bank_transfer"
          ? "Bonifico"
          : booking.paymentMethod === "on_bus"
            ? "Sul bus"
            : "Nessun pagamento richiesto";
  const paymentLabel =
    (booking.totalAmountCents ?? 0) === 0
      ? "gratuita"
      : booking.paymentType === "deposit"
        ? "acconto"
        : "totale";
  const subject = `Nuova prenotazione ${booking.bookingCode ?? ""}: ${excursion.name} (${booking.seats} persone)`;
  const text = [
    `Nuova prenotazione da ${booking.customerName} (${booking.email ?? "email non indicata"}${booking.phone ? `, ${booking.phone}` : ""})`,
    `Metodo: ${method} — ${paymentLabel}`,
    ...summary.text,
  ].join("\n");
  const html = wrap(
    "Nuova prenotazione",
    `<p>${escapeHtml(booking.customerName)} — ${escapeHtml(booking.email ?? "email non indicata")}${booking.phone ? ` — ${escapeHtml(booking.phone)}` : ""}<br/>
     Metodo: <strong>${escapeHtml(method)}</strong> (${escapeHtml(paymentLabel)})</p>
     ${summary.html.join("")}`,
  );
  return { to: admins, subject, text, html };
}

// ---------------------------------------------------------------------------
// 2) Pagamento ricevuto (carta riuscita o conferma manuale bonifico/ufficio)
// ---------------------------------------------------------------------------

export async function dispatchPaymentReceivedEmailV2(
  bookingId: string,
  requestType: string,
  paymentRequestId?: string,
): Promise<void> {
  const request = paymentRequestId
    ? await loadPaymentRequestById(bookingId, paymentRequestId)
    : await loadLatestPaymentRequest(bookingId, requestType);
  if (paymentRequestId && (!request || request.type !== requestType)) {
    logger.error(
      { bookingId, paymentRequestId, requestType },
      "Ricevuta non accodata: payment request esplicita non coerente",
    );
    return;
  }
  await Promise.all([
    queueBuiltEmail({
      bookingId,
      eventType: "booking.payment-received.customer",
      dedupeKey: request
        ? `payment-request:${request.id}:payment-received-customer:v2`
        : `booking:${bookingId}:payment-received:${requestType}:v2`,
      message: buildPaymentReceivedEmail(bookingId, requestType),
      label: "pagamento ricevuto",
    }),
    ...(request?.method === "card"
      ? [
          queueBuiltEmail({
            bookingId,
            eventType: "booking.payment-received.admin",
            dedupeKey: `payment-request:${request.id}:payment-received-admin:v2`,
            message: buildPaymentReceivedAdminEmail(bookingId, request.id),
            label: "incasso carta admin",
          }),
        ]
      : []),
  ]);
}

async function buildPaymentReceivedEmail(
  bookingId: string,
  requestType: string,
): Promise<EmailMessage | null> {
  const ctx = await loadBooking(bookingId);
  if (!ctx) return null;
  const { booking, excursion } = ctx;
  const summary = baseSummary(ctx);
  const access = await ensureBookingAccessToken(bookingId);
  const portalUrl = buildBookingPortalUrl(access.token);
  const noPaymentRequired = (booking.totalAmountCents ?? 0) === 0;
  const isSettled =
    booking.totalAmountCents !== null &&
    booking.amountPaidCents >= booking.totalAmountCents;
  const title = noPaymentRequired
    ? "Prenotazione confermata"
    : requestType === "deposit"
      ? "Acconto ricevuto"
      : requestType === "balance"
        ? "Saldo ricevuto"
        : "Pagamento ricevuto";
  const balanceRequest =
    requestType === "deposit" && !isSettled
      ? await loadLatestPaymentRequest(bookingId, "balance")
      : null;
  const activeBalanceRequest =
    balanceRequest &&
    ["pending", "action_required"].includes(balanceRequest.status)
      ? balanceRequest
      : null;
  const balanceDeadline = activeBalanceRequest?.deadline
    ? formatDateTimeIt(activeBalanceRequest.deadline)
    : null;
  const balanceTolerance = activeBalanceRequest
    ? graceLine(activeBalanceRequest.deadline, activeBalanceRequest.graceUntil)
    : null;
  const extra = noPaymentRequired
    ? "Il totale è pari a zero: non è richiesto alcun pagamento."
    : requestType === "deposit" && !isSettled && activeBalanceRequest
      ? `La gita è confermata e il saldo di ${euro(activeBalanceRequest.amountCents)} è già disponibile dal link qui sotto${balanceDeadline ? `, con scadenza ${balanceDeadline}` : ""}.${balanceTolerance ? ` ${balanceTolerance}.` : ""}`
      : requestType === "deposit" && !isSettled
        ? excursion.status === "confirmed"
          ? "La gita è confermata. L'amministrazione ti comunicherà modalità e scadenza del saldo."
          : "Il saldo ti verrà richiesto quando la gita sarà confermata."
        : isSettled &&
            !booking.cancelledAt &&
            booking.seatStatus !== "released" &&
            !isPaymentBlockedByCancellation(booking)
          ? "La tua prenotazione è completamente saldata: non resta che partire!"
          : isSettled
            ? "Questa ricevuta conferma l'incasso registrato. Fai riferimento alle eventuali comunicazioni successive sullo stato o sull'annullamento della prenotazione."
            : "";
  const invite = inviteSections(await prepareBookingInvite(bookingId));
  const subject =
    `${title}: ${excursion.name} (${booking.bookingCode ?? ""})`.trim();
  const text = [
    `Ciao ${booking.customerName},`,
    ``,
    noPaymentRequired
      ? "la tua prenotazione è confermata e non richiede alcun pagamento."
      : `${title.toLowerCase()} per la tua prenotazione. Grazie!`,
    ...summary.text,
    ...(extra ? [``, extra] : []),
    "",
    `Gestisci la prenotazione o richiedi l'annullamento: ${portalUrl}`,
    ...invite.text,
  ].join("\n");
  const html = wrap(
    title,
    `<p>Ciao ${escapeHtml(booking.customerName)},<br/>${noPaymentRequired ? "la tua prenotazione è confermata e non richiede alcun pagamento." : "abbiamo registrato il tuo pagamento. Grazie!"}</p>
     ${summary.html.join("")}
     ${extra ? `<p>${escapeHtml(extra)}</p>` : ""}
     <p style="margin-top:24px;"><a href="${escapeHtml(portalUrl)}" style="display:inline-block;padding:12px 18px;background:#0b5b60;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">Gestisci prenotazione / richiedi annullamento</a></p>
     ${invite.html}`,
  );
  return { to: booking.email!, subject, text, html, replyTo: agency().email };
}

async function buildPaymentReceivedAdminEmail(
  bookingId: string,
  paymentRequestId: string,
): Promise<EmailMessage | null> {
  const admins = getAdminNotificationEmails();
  if (admins.length === 0) return null;
  const ctx = await loadBooking(bookingId);
  if (!ctx) return null;
  const [request] = await db
    .select()
    .from(paymentRequestsTable)
    .where(
      and(
        eq(paymentRequestsTable.id, paymentRequestId),
        eq(paymentRequestsTable.bookingId, bookingId),
      ),
    )
    .limit(1);
  if (!request || request.method !== "card" || request.status !== "paid") {
    return null;
  }
  const { booking, excursion } = ctx;
  const code = booking.bookingCode ?? booking.id;
  const residual = Math.max(
    (booking.totalAmountCents ?? 0) - booking.amountPaidCents,
    0,
  );
  const label =
    request.type === "deposit"
      ? "acconto"
      : request.type === "balance"
        ? "saldo"
        : "totale";
  const subject = `Incasso carta ${label} ${code} — ${excursion.name}`;
  const text = [
    `Incasso carta registrato per ${excursion.name}.`,
    `Codice prenotazione: ${code}`,
    `Cliente: ${booking.customerName}`,
    `Richiesta: ${request.id} (${label})`,
    `Importo incassato: ${euro(request.amountCents)}`,
    `Totale pagato: ${euro(booking.amountPaidCents)}`,
    `Residuo: ${euro(residual)}`,
  ].join("\n");
  const html = wrap(
    "Incasso carta registrato",
    `<p><strong>${escapeHtml(excursion.name)}</strong><br/>Codice prenotazione: <strong>${escapeHtml(code)}</strong><br/>Cliente: ${escapeHtml(booking.customerName)}</p>
     <p>Richiesta: ${escapeHtml(request.id)} (${escapeHtml(label)})<br/>Importo incassato: <strong>${escapeHtml(euro(request.amountCents))}</strong><br/>Totale pagato: ${escapeHtml(euro(booking.amountPaidCents))}<br/>Residuo: ${escapeHtml(euro(residual))}</p>`,
  );
  return { to: admins, subject, text, html };
}

// ---------------------------------------------------------------------------
// 3) Gita confermata + richiesta saldo
// ---------------------------------------------------------------------------

export async function dispatchBalanceRequestEmailV2(
  bookingId: string,
  paymentRequestId?: string,
): Promise<void> {
  const request = paymentRequestId
    ? await loadPaymentRequestById(bookingId, paymentRequestId)
    : await loadLatestPaymentRequest(bookingId, "balance");
  if (paymentRequestId && (!request || request.type !== "balance")) {
    logger.error(
      { bookingId, paymentRequestId },
      "Richiesta saldo non accodata: payment request esplicita non coerente",
    );
    return;
  }
  await queueBuiltEmail({
    bookingId,
    eventType: "booking.balance-requested.customer",
    dedupeKey: request
      ? `payment-request:${request.id}:balance-requested-customer:v2`
      : `booking:${bookingId}:balance-requested:v2`,
    message: buildBalanceRequestEmail(bookingId, request?.id),
    label: "richiesta saldo",
  });
}

/**
 * Termini aggiornati dopo che il cliente aveva autorizzato l'addebito.
 *
 * Non e una richiesta di pagamento: il cliente non deve pagare nulla e non
 * deve scegliere un metodo. Deve solo confermare che accetta anche il testo
 * nuovo, altrimenti l'acconto resta fermo. L'email dell'azione pagamento
 * ordinaria direbbe la cosa sbagliata.
 */
async function buildTermsReacceptanceEmail(
  bookingId: string,
  paymentRequestId?: string,
): Promise<EmailMessage | null> {
  const ctx = await loadBooking(bookingId);
  if (!ctx) return null;
  const { booking, excursion } = ctx;
  if (isPaymentBlockedByCancellation(booking)) return null;
  if (paymentRequestId) {
    const request = await loadPaymentRequestById(bookingId, paymentRequestId);
    if (!request || request.status !== "action_required") return null;
  }
  const access = await ensureBookingAccessToken(bookingId);
  const portalUrl = buildBookingPortalUrl(access.token);
  const subject = `Conferma i Termini aggiornati — ${excursion.name}`;
  const text = [
    `Ciao ${booking.customerName},`,
    "",
    `abbiamo aggiornato i Termini e Condizioni dopo la tua prenotazione per ${excursion.name}.`,
    "",
    "Non ti abbiamo addebitato nulla e non ti addebiteremo nulla finche non ci",
    "confermi che accetti anche il testo nuovo. La tua carta resta salvata e",
    "vale sempre la regola di prima: si paga solo se la gita viene confermata.",
    "",
    "Apri il portale della tua prenotazione e conferma con un clic:",
    portalUrl,
  ].join("\n");
  const html = wrap(
    "Conferma i Termini aggiornati",
    `<p>Ciao ${escapeHtml(booking.customerName)},<br/>abbiamo aggiornato i Termini e Condizioni dopo la tua prenotazione per <strong>${escapeHtml(excursion.name)}</strong>.</p>
     <p><strong>Non ti abbiamo addebitato nulla</strong> e non ti addebiteremo nulla finche non ci confermi che accetti anche il testo nuovo. La tua carta resta salvata e vale sempre la regola di prima: si paga solo se la gita viene confermata.</p>
     <p style="margin:24px 0"><a href="${escapeHtml(portalUrl)}" style="display:inline-block;padding:12px 20px;border-radius:999px;background:#0b5b60;color:#fff;text-decoration:none;font-weight:700">Conferma i Termini aggiornati</a></p>`,
  );
  return { to: booking.email!, subject, text, html, replyTo: agency().email };
}

export async function dispatchTermsReacceptanceEmailV2(
  bookingId: string,
  paymentRequestId?: string,
): Promise<void> {
  const scope = paymentRequestId ?? bookingId;
  await queueBuiltEmail({
    bookingId,
    eventType: "booking.terms-reacceptance.customer",
    dedupeKey: `payment-request:${scope}:terms-reacceptance-customer:v2`,
    message: buildTermsReacceptanceEmail(bookingId, paymentRequestId),
    label: "nuova accettazione Termini",
  });
}

export async function dispatchPaymentActionRequiredEmailV2(
  bookingId: string,
  requestType: string,
  paymentRequestId?: string,
): Promise<void> {
  const request = paymentRequestId
    ? await loadPaymentRequestById(bookingId, paymentRequestId)
    : await loadLatestPaymentRequest(bookingId, requestType);
  if (paymentRequestId && (!request || request.type !== requestType)) {
    logger.error(
      { bookingId, paymentRequestId, requestType },
      "Azione pagamento non accodata: payment request esplicita non coerente",
    );
    return;
  }
  const scope = request?.id ?? `${bookingId}:${requestType}`;
  await Promise.all([
    queueBuiltEmail({
      bookingId,
      eventType: "booking.payment-action-required.customer",
      dedupeKey: `payment-request:${scope}:payment-action-required-customer:v2`,
      message: buildPaymentActionRequiredEmail(
        bookingId,
        requestType,
        request?.id,
      ),
      label: "azione pagamento richiesta",
    }),
    queueBuiltEmail({
      bookingId,
      eventType: "booking.payment-action-required.admin",
      dedupeKey: `payment-request:${scope}:payment-action-required-admin:v2`,
      message: buildPaymentActionRequiredAdminEmail(
        bookingId,
        request?.id ?? null,
        requestType,
      ),
      label: "azione pagamento admin",
    }),
  ]);
}

export async function dispatchBalanceReminderEmailV2(
  bookingId: string,
  paymentRequestId: string,
  phase: "before_due" | "due" | "grace_ending",
): Promise<void> {
  await queueBuiltEmail({
    bookingId,
    eventType: `booking.balance-reminder.${phase}`,
    dedupeKey: `payment-request:${paymentRequestId}:reminder:${phase}:v2`,
    message: buildBalanceReminderEmail(bookingId, paymentRequestId, phase),
    label: `promemoria saldo ${phase}`,
  });
}

async function buildBalanceReminderEmail(
  bookingId: string,
  paymentRequestId: string,
  phase: "before_due" | "due" | "grace_ending",
): Promise<EmailMessage | null> {
  const ctx = await loadBooking(bookingId);
  if (!ctx) return null;
  const { booking, excursion } = ctx;
  const request = await loadPaymentRequestById(bookingId, paymentRequestId);
  if (
    !request ||
    request.type !== "balance" ||
    !["pending", "action_required"].includes(request.status)
  ) {
    return null;
  }
  const residual = Math.max(
    (booking.totalAmountCents ?? 0) - booking.amountPaidCents,
    0,
  );
  if (residual <= 0 || isPaymentBlockedByCancellation(booking)) return null;
  const access = await ensureBookingAccessToken(bookingId);
  const portalUrl = buildBookingPortalUrl(access.token);
  const deadline = request.deadline ? formatDateTimeIt(request.deadline) : null;
  const tolerance = graceLine(request.deadline, request.graceUntil);
  // Chi salda a bordo non ha una scadenza da rincorrere: il promemoria serve a
  // ricordargli l'importo esatto da portare, non a sollecitare un ritardo.
  const payingOnBus = request.method === "on_bus";
  const intro = payingOnBus
    ? "Ti ricordiamo che salderai direttamente sul bus il giorno della partenza."
    : phase === "before_due"
      ? "Ti ricordiamo che il saldo della tua prenotazione è in scadenza."
      : phase === "due"
        ? "Il saldo della tua prenotazione è arrivato a scadenza."
        : "Il periodo di tolleranza sta per terminare: completa il saldo o contatta subito l'agenzia.";
  const amountLine = payingOnBus
    ? `Da portare in contanti: ${euro(residual)}`
    : `Importo residuo: ${euro(residual)}`;
  const subject = payingOnBus
    ? `Saldo a bordo — ${excursion.name}`
    : `Promemoria saldo — ${excursion.name}`;
  const text = [
    `Ciao ${booking.customerName},`,
    "",
    intro,
    amountLine,
    ...(payingOnBus || !deadline ? [] : [`Scadenza: ${deadline}`]),
    ...(payingOnBus || !tolerance ? [] : [tolerance]),
    payingOnBus
      ? `Se preferisci pagare prima della partenza, puoi cambiare metodo qui: ${portalUrl}`
      : `Paga o scegli un altro metodo: ${portalUrl}`,
  ].join("\n");
  const html = wrap(
    payingOnBus ? "Saldo a bordo" : "Promemoria saldo",
    `<p>Ciao ${escapeHtml(booking.customerName)},<br/>${escapeHtml(intro)}</p>
     <p>${escapeHtml(payingOnBus ? "Da portare in contanti" : "Importo residuo")}: <strong>${escapeHtml(euro(residual))}</strong>${!payingOnBus && deadline ? `<br/>Scadenza: <strong>${escapeHtml(deadline)}</strong>` : ""}${!payingOnBus && tolerance ? `<br/>${escapeHtml(tolerance)}` : ""}</p>
     <p style="margin:24px 0"><a href="${escapeHtml(portalUrl)}" style="display:inline-block;padding:12px 20px;border-radius:999px;background:#0b5b60;color:#fff;text-decoration:none;font-weight:700">${escapeHtml(payingOnBus ? "Cambia metodo o paga prima" : "Gestisci il saldo")}</a></p>`,
  );
  return { to: booking.email!, subject, text, html, replyTo: agency().email };
}

async function buildPaymentActionRequiredEmail(
  bookingId: string,
  requestType: string,
  paymentRequestId?: string,
): Promise<EmailMessage | null> {
  const ctx = await loadBooking(bookingId);
  if (!ctx) return null;
  const { booking, excursion } = ctx;
  const request = paymentRequestId
    ? await loadPaymentRequestById(bookingId, paymentRequestId)
    : await loadLatestPaymentRequest(bookingId, requestType);
  if (
    !request ||
    request.type !== requestType ||
    request.status !== "action_required"
  ) {
    return null;
  }
  const residual = Math.max(
    (booking.totalAmountCents ?? 0) - booking.amountPaidCents,
    0,
  );
  if (residual <= 0 || isPaymentBlockedByCancellation(booking)) return null;
  const access = await ensureBookingAccessToken(bookingId);
  const portalUrl = buildBookingPortalUrl(access.token);
  const amount = Math.min(request.amountCents, residual);
  const label =
    requestType === "deposit"
      ? "acconto"
      : requestType === "full"
        ? "totale"
        : "saldo";
  const subject = `Completa il pagamento ${label} — ${excursion.name}`;
  const text = [
    `Ciao ${booking.customerName},`,
    "",
    `non siamo riusciti a completare automaticamente il pagamento ${label}.`,
    `Importo da pagare: ${euro(amount)}`,
    "Apri il portale per scegliere uno dei metodi attualmente disponibili:",
    portalUrl,
  ].join("\n");
  const html = wrap(
    "Completa il pagamento",
    `<p>Ciao ${escapeHtml(booking.customerName)},<br/>non siamo riusciti a completare automaticamente il pagamento ${escapeHtml(label)} per <strong>${escapeHtml(excursion.name)}</strong>.</p>
     <p>Importo da pagare: <strong>${escapeHtml(euro(amount))}</strong></p>
     <p>Apri il portale per scegliere uno dei metodi attualmente disponibili.</p>
     <p style="margin:24px 0"><a href="${escapeHtml(portalUrl)}" style="display:inline-block;padding:12px 20px;border-radius:999px;background:#0b5b60;color:#fff;text-decoration:none;font-weight:700">Completa il pagamento</a></p>`,
  );
  return { to: booking.email!, subject, text, html, replyTo: agency().email };
}

async function buildPaymentActionRequiredAdminEmail(
  bookingId: string,
  paymentRequestId: string | null,
  requestType: string,
): Promise<EmailMessage | null> {
  const admins = getAdminNotificationEmails();
  if (admins.length === 0) return null;
  const ctx = await loadBooking(bookingId);
  if (!ctx) return null;
  const request = paymentRequestId
    ? await loadPaymentRequestById(bookingId, paymentRequestId)
    : null;
  if (
    paymentRequestId &&
    (!request ||
      request.type !== requestType ||
      request.status !== "action_required")
  ) {
    return null;
  }
  const { booking, excursion } = ctx;
  const code = booking.bookingCode ?? booking.id;
  const amount = Math.min(
    request?.amountCents ?? booking.amountDueCents ?? 0,
    Math.max((booking.totalAmountCents ?? 0) - booking.amountPaidCents, 0),
  );
  const subject = `Azione pagamento richiesta ${code} — ${excursion.name}`;
  const text = [
    `L'addebito automatico non è stato completato per ${excursion.name}.`,
    `Codice prenotazione: ${code}`,
    `Cliente: ${booking.customerName}`,
    `Tipo: ${requestType}`,
    ...(paymentRequestId ? [`Richiesta: ${paymentRequestId}`] : []),
    `Importo da gestire: ${euro(amount)}`,
    "Il cliente ha ricevuto il link al portale; verificare che resti almeno un metodo operativo disponibile.",
  ].join("\n");
  const html = wrap(
    "Pagamento da completare",
    `<p>L'addebito automatico non è stato completato per <strong>${escapeHtml(excursion.name)}</strong>.</p>
     <p>Codice: <strong>${escapeHtml(code)}</strong><br/>Cliente: ${escapeHtml(booking.customerName)}<br/>Tipo: ${escapeHtml(requestType)}${paymentRequestId ? `<br/>Richiesta: ${escapeHtml(paymentRequestId)}` : ""}<br/>Importo da gestire: <strong>${escapeHtml(euro(amount))}</strong></p>
     <p>Il cliente ha ricevuto il link al portale; verificare che resti almeno un metodo operativo disponibile.</p>`,
  );
  return { to: admins, subject, text, html };
}

async function buildBalanceRequestEmail(
  bookingId: string,
  paymentRequestId?: string,
): Promise<EmailMessage | null> {
  const ctx = await loadBooking(bookingId);
  if (!ctx) return null;
  const { booking, excursion } = ctx;
  const settings = await getPaymentSettings();
  const summary = baseSummary(ctx);
  const residual = (booking.totalAmountCents ?? 0) - booking.amountPaidCents;
  if (residual <= 0 || isPaymentBlockedByCancellation(booking)) return null;
  const access = await ensureBookingAccessToken(bookingId);
  const portalUrl = buildBookingPortalUrl(access.token);
  const deadline = booking.paymentDeadline
    ? formatDateTimeIt(booking.paymentDeadline)
    : null;
  const request = paymentRequestId
    ? await loadPaymentRequestById(bookingId, paymentRequestId)
    : await loadLatestPaymentRequest(bookingId, "balance");
  if (!request || request.type !== "balance") return null;
  const tolerance = graceLine(
    request?.deadline ?? null,
    request?.graceUntil ?? null,
  );
  const causale = `${booking.bookingCode ?? booking.id} - ${booking.customerName.split(" ").slice(-1)[0] ?? ""} - ${excursion.name}`;

  const bankBlock =
    excursion.payBankTransferEnabled && settings.iban
      ? `<h3>Saldo con bonifico</h3><p>${[
          settings.beneficiary
            ? `Intestatario: <strong>${escapeHtml(settings.beneficiary)}</strong>`
            : null,
          settings.iban
            ? `IBAN: <strong>${escapeHtml(settings.iban)}</strong>`
            : null,
          `Causale: <strong>${escapeHtml(causale)}</strong>`,
        ]
          .filter(Boolean)
          .join("<br/>")}</p>`
      : "";
  const officeBlock =
    excursion.payOfficeEnabled && settings.officeAddress
      ? `<p>Oppure paga in ufficio: ${escapeHtml(settings.officeAddress)}${settings.officeOpeningHours ? ` (${escapeHtml(settings.officeOpeningHours)})` : ""}.</p>`
      : "";
  // Il saldo a bordo va annunciato con l'importo esatto: chi sceglie questa
  // strada deve presentarsi alla partenza con la somma gia pronta.
  const onBusAvailable = isOnBusPaymentAvailable(excursion, settings, "balance");
  const onBusBlock = onBusAvailable
    ? `<p>Oppure salda direttamente <strong>sul bus</strong> il giorno della partenza: porta ${escapeHtml(euro(residual))} in contanti e indicalo dal portale, così sappiamo che ti aspettiamo.</p>`
    : "";

  const subject = `La gita è confermata — saldo richiesto: ${excursion.name}`;
  const text = [
    `Ciao ${booking.customerName},`,
    ``,
    `ottime notizie: "${excursion.name}" ha raggiunto il numero minimo di partecipanti ed è CONFERMATA!`,
    ``,
    `Ti chiediamo ora di completare il pagamento del saldo: ${euro(residual)}`,
    ...(deadline ? [`Scadenza: ${deadline}`] : []),
    ...(tolerance ? [tolerance] : []),
    `Gestisci e paga il saldo: ${portalUrl}`,
    ``,
    ...summary.text,
    ``,
    ...(excursion.payBankTransferEnabled && settings.iban
      ? [`Bonifico — IBAN: ${settings.iban}, causale: ${causale}`]
      : []),
    ...(excursion.payOfficeEnabled && settings.officeAddress
      ? [`Oppure in ufficio: ${settings.officeAddress}`]
      : []),
    ...(onBusAvailable
      ? [
          `Oppure sul bus il giorno della partenza: porta ${euro(residual)} in contanti e segnalalo dal portale.`,
        ]
      : []),
  ].join("\n");
  const html = wrap(
    "Gita confermata — saldo richiesto",
    `<p>Ciao ${escapeHtml(booking.customerName)},<br/>ottime notizie: <strong>${escapeHtml(excursion.name)}</strong> ha raggiunto il numero minimo di partecipanti ed è <strong>confermata</strong>!</p>
     <p>Saldo da versare: <strong>${escapeHtml(euro(residual))}</strong>${deadline ? `<br/>Scadenza: <strong>${escapeHtml(deadline)}</strong>` : ""}${tolerance ? `<br/>${escapeHtml(tolerance)}` : ""}</p>
     <p style="margin:24px 0"><a href="${escapeHtml(portalUrl)}" style="display:inline-block;padding:12px 20px;border-radius:999px;background:#0b5b60;color:#fff;text-decoration:none;font-weight:700">Paga o gestisci il saldo</a></p>
     ${summary.html.join("")}
     ${bankBlock}
     ${officeBlock}
     ${onBusBlock}`,
  );
  return { to: booking.email!, subject, text, html, replyTo: agency().email };
}
