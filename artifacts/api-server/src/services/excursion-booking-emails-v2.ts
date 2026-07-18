import { db } from "@workspace/db";
import {
  excursionsTable,
  excursionBookingsTable,
  bookingParticipantsTable,
} from "@workspace/db/schema";
import { eq, asc } from "drizzle-orm";
import { logger } from "../lib/logger";
import {
  getAdminNotificationEmails,
  sendEmail,
  type EmailMessage,
} from "./email.service";
import { getPaymentSettings } from "./excursion-pricing";

// ---------------------------------------------------------------------------
// Email transazionali Gite v2. Ogni dispatcher carica i dati che gli servono
// e non lancia mai: gli errori vengono solo loggati (fire-and-forget).
// ---------------------------------------------------------------------------

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function euro(cents: number): string {
  return (cents / 100).toLocaleString("it-IT", { style: "currency", currency: "EUR" });
}

function formatDateIt(dateString: string): string {
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return dateString;
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric" });
}

function formatDateTimeIt(d: Date): string {
  return d.toLocaleString("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function agency() {
  return {
    name: process.env.AGENCY_NAME || "Elis Travel",
    email: process.env.AGENCY_CONTACT_EMAIL || "info@elis-travel.it",
    phone: process.env.AGENCY_CONTACT_PHONE || null,
  };
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

async function loadBooking(bookingId: string): Promise<LoadedBooking | null> {
  const [booking] = await db
    .select()
    .from(excursionBookingsTable)
    .where(eq(excursionBookingsTable.id, bookingId))
    .limit(1);
  if (!booking?.email) return null;
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

// Righe riepilogo partecipanti (testo + html)
function participantLines(ctx: LoadedBooking): { text: string[]; html: string[] } {
  const text: string[] = [];
  const html: string[] = [];
  for (const p of ctx.participants) {
    const label = [
      PARTICIPANT_LABELS[p.participantType] ?? p.participantType,
      p.ageRangeLabel,
      p.pickupPointName ? `raccolta ${p.pickupPointName}` : null,
    ]
      .filter(Boolean)
      .join(" · ");
    text.push(`- ${label}: ${euro(p.finalPriceCents)}`);
    html.push(
      `<li>${escapeHtml(label)}: <strong>${escapeHtml(euro(p.finalPriceCents))}</strong></li>`,
    );
  }
  return { text, html };
}

function baseSummary(ctx: LoadedBooking): { text: string[]; html: string[] } {
  const { booking, excursion } = ctx;
  const parts = participantLines(ctx);
  const total = booking.totalAmountCents ?? 0;
  const residual = total - booking.amountPaidCents;
  const text = [
    `Gita: ${excursion.name} (${excursion.location})`,
    `Data: ${formatDateIt(excursion.date)}`,
    `Codice prenotazione: ${booking.bookingCode ?? booking.id}`,
    `Persone: ${booking.seats}`,
    ...parts.text,
    `Totale: ${euro(total)}`,
    `Pagato: ${euro(booking.amountPaidCents)}`,
    `Residuo: ${euro(Math.max(residual, 0))}`,
  ];
  const html = [
    `<p><strong>${escapeHtml(excursion.name)}</strong> — ${escapeHtml(excursion.location)}<br/>`,
    `Data: ${escapeHtml(formatDateIt(excursion.date))}<br/>`,
    `Codice prenotazione: <strong>${escapeHtml(booking.bookingCode ?? booking.id)}</strong></p>`,
    `<ul>${parts.html.join("")}</ul>`,
    `<p>Totale: <strong>${escapeHtml(euro(total))}</strong><br/>`,
    `Pagato: ${escapeHtml(euro(booking.amountPaidCents))}<br/>`,
    `Residuo: ${escapeHtml(euro(Math.max(residual, 0)))}</p>`,
  ];
  return { text, html };
}

function wrap(subjectTitle: string, bodyHtml: string): string {
  const a = agency();
  return `<!doctype html><html lang="it"><body style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#14242b;line-height:1.55;max-width:640px;margin:0 auto;padding:24px;">
  <h2 style="color:#0b5b60;">${escapeHtml(subjectTitle)}</h2>
  ${bodyHtml}
  <p style="margin-top:28px;font-size:13px;color:#5b6b72;">${escapeHtml(a.name)}${a.phone ? ` · ${escapeHtml(a.phone)}` : ""} · ${escapeHtml(a.email)}</p>
  </body></html>`;
}

function fireAndForget(promise: Promise<EmailMessage | null>, label: string): void {
  void promise
    .then((msg) => (msg ? sendEmail(msg) : undefined))
    .catch((err) => logger.error({ err }, `Invio email fallito: ${label}`));
}

// ---------------------------------------------------------------------------
// 1) Prenotazione registrata con istruzioni di pagamento (bonifico / ufficio)
// ---------------------------------------------------------------------------

export function dispatchBookingInstructionsEmailsV2(bookingId: string): void {
  fireAndForget(buildInstructionsCustomerEmail(bookingId), "istruzioni cliente");
  fireAndForget(buildNewBookingAdminEmail(bookingId), "notifica admin");
}

// Solo notifica admin (prenotazioni con carta: il cliente riceve la ricevuta al pagamento)
export function dispatchNewBookingAdminEmailV2(bookingId: string): void {
  fireAndForget(buildNewBookingAdminEmail(bookingId), "notifica admin");
}

async function buildInstructionsCustomerEmail(bookingId: string): Promise<EmailMessage | null> {
  const ctx = await loadBooking(bookingId);
  if (!ctx) return null;
  const { booking, excursion } = ctx;
  const settings = await getPaymentSettings();
  const summary = baseSummary(ctx);
  const amountLabel = booking.paymentType === "deposit" ? "Acconto da versare" : "Importo da pagare";
  const deadline = booking.paymentDeadline ? formatDateTimeIt(booking.paymentDeadline) : null;
  const causale = `${booking.bookingCode ?? booking.id} - ${booking.customerName.split(" ").slice(-1)[0] ?? ""} - ${excursion.name}`;

  const textLines = [
    `Ciao ${booking.customerName},`,
    ``,
    `abbiamo registrato la tua prenotazione. Ecco il riepilogo:`,
    ...summary.text,
    ``,
    `${amountLabel}: ${euro(booking.amountDueCents ?? 0)}`,
    ...(deadline ? [`Scadenza pagamento: ${deadline}`] : []),
    ``,
  ];
  let methodHtml = "";
  if (booking.paymentMethod === "bank_transfer") {
    textLines.push(
      `Dati per il bonifico:`,
      ...(settings.beneficiary ? [`Intestatario: ${settings.beneficiary}`] : []),
      ...(settings.iban ? [`IBAN: ${settings.iban}`] : []),
      ...(settings.bank ? [`Banca: ${settings.bank}`] : []),
      `Causale (obbligatoria): ${causale}`,
    );
    methodHtml = `<h3>Dati per il bonifico</h3><p>${[
      settings.beneficiary ? `Intestatario: <strong>${escapeHtml(settings.beneficiary)}</strong>` : null,
      settings.iban ? `IBAN: <strong>${escapeHtml(settings.iban)}</strong>` : null,
      settings.bank ? `Banca: ${escapeHtml(settings.bank)}` : null,
      `Causale (obbligatoria): <strong>${escapeHtml(causale)}</strong>`,
    ]
      .filter(Boolean)
      .join("<br/>")}</p>`;
  } else if (booking.paymentMethod === "office") {
    textLines.push(
      `Pagamento in ufficio:`,
      ...(settings.officeAddress ? [`Indirizzo: ${settings.officeAddress}`] : []),
      ...(settings.officeOpeningHours ? [`Orari: ${settings.officeOpeningHours}`] : []),
      `Il posto è riservato temporaneamente fino alla scadenza indicata.`,
      `Presentati citando il codice ${booking.bookingCode ?? booking.id}.`,
    );
    methodHtml = `<h3>Pagamento in ufficio</h3><p>${[
      settings.officeAddress ? `Indirizzo: <strong>${escapeHtml(settings.officeAddress)}</strong>` : null,
      settings.officeOpeningHours ? `Orari: ${escapeHtml(settings.officeOpeningHours)}` : null,
      `Il posto è riservato temporaneamente fino alla scadenza indicata.`,
      `Presentati citando il codice <strong>${escapeHtml(booking.bookingCode ?? booking.id)}</strong>.`,
    ]
      .filter(Boolean)
      .join("<br/>")}</p>`;
  }
  textLines.push(``, `A presto!`);

  const subject = `Prenotazione ${booking.bookingCode ?? ""} — ${excursion.name}`.trim();
  const html = wrap(
    "Prenotazione registrata",
    `<p>Ciao ${escapeHtml(booking.customerName)},<br/>abbiamo registrato la tua prenotazione.</p>
     ${summary.html.join("")}
     <p>${escapeHtml(amountLabel)}: <strong>${escapeHtml(euro(booking.amountDueCents ?? 0))}</strong>${deadline ? `<br/>Scadenza pagamento: <strong>${escapeHtml(deadline)}</strong>` : ""}</p>
     ${methodHtml}`,
  );
  return {
    to: booking.email!,
    subject,
    text: textLines.join("\n"),
    html,
    replyTo: agency().email,
  };
}

async function buildNewBookingAdminEmail(bookingId: string): Promise<EmailMessage | null> {
  const admins = getAdminNotificationEmails();
  if (admins.length === 0) return null;
  const ctx = await loadBooking(bookingId);
  if (!ctx) return null;
  const { booking, excursion } = ctx;
  const summary = baseSummary(ctx);
  const method =
    booking.paymentMethod === "card" ? "Carta" : booking.paymentMethod === "office" ? "In ufficio" : "Bonifico";
  const subject = `Nuova prenotazione ${booking.bookingCode ?? ""}: ${excursion.name} (${booking.seats} persone)`;
  const text = [
    `Nuova prenotazione da ${booking.customerName} (${booking.email}${booking.phone ? `, ${booking.phone}` : ""})`,
    `Metodo: ${method} — ${booking.paymentType === "deposit" ? "acconto" : "totale"}`,
    ...summary.text,
  ].join("\n");
  const html = wrap(
    "Nuova prenotazione",
    `<p>${escapeHtml(booking.customerName)} — ${escapeHtml(booking.email ?? "")}${booking.phone ? ` — ${escapeHtml(booking.phone)}` : ""}<br/>
     Metodo: <strong>${escapeHtml(method)}</strong> (${booking.paymentType === "deposit" ? "acconto" : "totale"})</p>
     ${summary.html.join("")}`,
  );
  return { to: admins, subject, text, html };
}

// ---------------------------------------------------------------------------
// 2) Pagamento ricevuto (carta riuscita o conferma manuale bonifico/ufficio)
// ---------------------------------------------------------------------------

export function dispatchPaymentReceivedEmailV2(bookingId: string, requestType: string): void {
  fireAndForget(buildPaymentReceivedEmail(bookingId, requestType), "pagamento ricevuto");
}

async function buildPaymentReceivedEmail(
  bookingId: string,
  requestType: string,
): Promise<EmailMessage | null> {
  const ctx = await loadBooking(bookingId);
  if (!ctx) return null;
  const { booking, excursion } = ctx;
  const summary = baseSummary(ctx);
  const isSettled =
    booking.totalAmountCents !== null && booking.amountPaidCents >= booking.totalAmountCents;
  const title =
    requestType === "deposit" && !isSettled
      ? "Acconto ricevuto"
      : requestType === "balance"
        ? "Saldo ricevuto"
        : "Pagamento ricevuto";
  const extra =
    requestType === "deposit" && !isSettled
      ? "Il saldo ti verrà richiesto quando la gita sarà confermata."
      : isSettled
        ? "La tua prenotazione è completamente saldata: non resta che partire!"
        : "";
  const subject = `${title}: ${excursion.name} (${booking.bookingCode ?? ""})`.trim();
  const text = [
    `Ciao ${booking.customerName},`,
    ``,
    `${title.toLowerCase()} per la tua prenotazione. Grazie!`,
    ...summary.text,
    ...(extra ? [``, extra] : []),
  ].join("\n");
  const html = wrap(
    title,
    `<p>Ciao ${escapeHtml(booking.customerName)},<br/>abbiamo registrato il tuo pagamento. Grazie!</p>
     ${summary.html.join("")}
     ${extra ? `<p>${escapeHtml(extra)}</p>` : ""}`,
  );
  return { to: booking.email!, subject, text, html, replyTo: agency().email };
}

// ---------------------------------------------------------------------------
// 3) Gita confermata + richiesta saldo
// ---------------------------------------------------------------------------

export function dispatchBalanceRequestEmailV2(bookingId: string): void {
  fireAndForget(buildBalanceRequestEmail(bookingId), "richiesta saldo");
}

async function buildBalanceRequestEmail(bookingId: string): Promise<EmailMessage | null> {
  const ctx = await loadBooking(bookingId);
  if (!ctx) return null;
  const { booking, excursion } = ctx;
  const settings = await getPaymentSettings();
  const summary = baseSummary(ctx);
  const residual = (booking.totalAmountCents ?? 0) - booking.amountPaidCents;
  if (residual <= 0) return null;
  const deadline = booking.paymentDeadline ? formatDateTimeIt(booking.paymentDeadline) : null;
  const causale = `${booking.bookingCode ?? booking.id} - ${booking.customerName.split(" ").slice(-1)[0] ?? ""} - ${excursion.name}`;

  const bankBlock =
    settings.iban || settings.beneficiary
      ? `<h3>Saldo con bonifico</h3><p>${[
          settings.beneficiary ? `Intestatario: <strong>${escapeHtml(settings.beneficiary)}</strong>` : null,
          settings.iban ? `IBAN: <strong>${escapeHtml(settings.iban)}</strong>` : null,
          `Causale: <strong>${escapeHtml(causale)}</strong>`,
        ]
          .filter(Boolean)
          .join("<br/>")}</p>`
      : "";
  const officeBlock = settings.officeAddress
    ? `<p>Oppure paga in ufficio: ${escapeHtml(settings.officeAddress)}${settings.officeOpeningHours ? ` (${escapeHtml(settings.officeOpeningHours)})` : ""}.</p>`
    : "";

  const subject = `La gita è confermata — saldo richiesto: ${excursion.name}`;
  const text = [
    `Ciao ${booking.customerName},`,
    ``,
    `ottime notizie: "${excursion.name}" ha raggiunto il numero minimo di partecipanti ed è CONFERMATA!`,
    ``,
    `Ti chiediamo ora di completare il pagamento del saldo: ${euro(residual)}`,
    ...(deadline ? [`Scadenza: ${deadline}`] : []),
    ``,
    ...summary.text,
    ``,
    ...(settings.iban ? [`Bonifico — IBAN: ${settings.iban}, causale: ${causale}`] : []),
    ...(settings.officeAddress ? [`Oppure in ufficio: ${settings.officeAddress}`] : []),
  ].join("\n");
  const html = wrap(
    "Gita confermata — saldo richiesto",
    `<p>Ciao ${escapeHtml(booking.customerName)},<br/>ottime notizie: <strong>${escapeHtml(excursion.name)}</strong> ha raggiunto il numero minimo di partecipanti ed è <strong>confermata</strong>!</p>
     <p>Saldo da versare: <strong>${escapeHtml(euro(residual))}</strong>${deadline ? `<br/>Scadenza: <strong>${escapeHtml(deadline)}</strong>` : ""}</p>
     ${summary.html.join("")}
     ${bankBlock}
     ${officeBlock}`,
  );
  return { to: booking.email!, subject, text, html, replyTo: agency().email };
}
