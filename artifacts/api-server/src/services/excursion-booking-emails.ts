import { logger } from "../lib/logger";
import {
  getAdminNotificationEmails,
  sendEmail,
  type EmailMessage,
} from "./email.service";
import { buildCancellationUrl } from "./booking-cancellation-token";

export type ExcursionBookingEmailData = {
  bookingId: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string | null;
  seats: number;
  adults: number;
  children: number;
  servizioCasa?: boolean;
  paymentType: "deposit" | "full";
  excursion: {
    id: string;
    name: string;
    location: string;
    date: string;
    pricePerPerson: string | number | null;
  };
};

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDateIt(dateString: string): string {
  try {
    const d = new Date(dateString);
    if (Number.isNaN(d.getTime())) return dateString;
    return d.toLocaleDateString("it-IT", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  } catch {
    return dateString;
  }
}

function formatPrice(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return n.toLocaleString("it-IT", {
    style: "currency",
    currency: "EUR",
  });
}

function getAgencyContacts() {
  return {
    name: process.env.AGENCY_NAME || "Elis Travel",
    email: process.env.AGENCY_CONTACT_EMAIL || "info@elis-travel.it",
    phone: process.env.AGENCY_CONTACT_PHONE || null,
    website: process.env.PUBLIC_SITE_URL || "https://www.elis-travel.it",
  };
}

function getPaymentInstructions(paymentType: "deposit" | "full"): string {
  const fullInstructions = process.env.PAYMENT_INSTRUCTIONS_FULL?.trim();
  const depositInstructions =
    process.env.PAYMENT_INSTRUCTIONS_DEPOSIT?.trim();
  const generic = process.env.PAYMENT_INSTRUCTIONS?.trim();
  if (paymentType === "full" && fullInstructions) return fullInstructions;
  if (paymentType === "deposit" && depositInstructions)
    return depositInstructions;
  if (generic) return generic;
  return "";
}

export function buildCustomerEmail(
  data: ExcursionBookingEmailData,
): EmailMessage {
  const agency = getAgencyContacts();
  const paymentLabel =
    data.paymentType === "full" ? "Saldo intero" : "Acconto";
  const dateLabel = formatDateIt(data.excursion.date);
  const pricePerPerson = formatPrice(data.excursion.pricePerPerson);
  const totalPrice =
    data.excursion.pricePerPerson !== null &&
    data.excursion.pricePerPerson !== undefined
      ? formatPrice(
          Number(data.excursion.pricePerPerson) * data.seats,
        )
      : null;
  const paymentInstructions = getPaymentInstructions(data.paymentType);
  const participantsLabel =
    data.children > 0
      ? `${data.adults} adult${data.adults === 1 ? "o" : "i"} + ${data.children} bambin${data.children === 1 ? "o" : "i"}`
      : `${data.adults} adult${data.adults === 1 ? "o" : "i"}`;

  const subject = `Conferma prenotazione: ${data.excursion.name}`;

  const lines: string[] = [];
  lines.push(`Ciao ${data.customerName},`);
  lines.push("");
  lines.push(
    `abbiamo ricevuto la tua prenotazione per la gita "${data.excursion.name}". Di seguito i dettagli:`,
  );
  lines.push("");
  lines.push(`• Gita: ${data.excursion.name}`);
  lines.push(`• Località: ${data.excursion.location}`);
  lines.push(`• Data: ${dateLabel}`);
  lines.push(`• Partecipanti: ${participantsLabel}`);
  if (pricePerPerson) lines.push(`• Prezzo per persona: ${pricePerPerson}`);
  if (totalPrice) lines.push(`• Totale: ${totalPrice}`);
  lines.push(`• Modalità di pagamento scelta: ${paymentLabel}`);
  lines.push("");
  if (paymentInstructions) {
    lines.push("Istruzioni per il pagamento:");
    lines.push(paymentInstructions);
    lines.push("");
  }
  if (data.servizioCasa) {
    lines.push("Servizio sotto casa:");
    lines.push("Hai richiesto il servizio di trasporto da casa al punto di raccolta. Ti chiediamo di comunicarci il tuo indirizzo di partenza e un recapito telefonico per organizzare il ritiro.");
    lines.push("");
  }
  lines.push("Prossimi passi:");
  if (data.paymentType === "deposit") {
    lines.push(
      "Ti contatteremo a breve per confermare l'acconto e organizzare il saldo.",
    );
  } else {
    lines.push(
      "Ti contatteremo a breve per confermare il pagamento e fornirti tutti i dettagli operativi della gita.",
    );
  }
  lines.push("");
  let cancellationUrl: string | null = null;
  try {
    cancellationUrl = buildCancellationUrl(data.bookingId);
  } catch (err) {
    logger.warn(
      { err, bookingId: data.bookingId },
      "Impossibile generare il link di annullamento prenotazione",
    );
  }
  if (cancellationUrl) {
    lines.push(
      "Se hai bisogno di annullare la prenotazione puoi farlo qui:",
    );
    lines.push(cancellationUrl);
    lines.push("");
  }
  lines.push("Per qualsiasi domanda puoi rispondere a questa email o contattarci:");
  lines.push(`• Email: ${agency.email}`);
  if (agency.phone) lines.push(`• Telefono: ${agency.phone}`);
  lines.push("");
  lines.push(`Grazie per aver scelto ${agency.name}!`);
  lines.push(`${agency.name}`);
  lines.push(agency.website);

  const text = lines.join("\n");

  const detailsRows: string[] = [
    `<tr><td style="padding:6px 0;color:#555;">Gita</td><td style="padding:6px 0;font-weight:600;">${escapeHtml(data.excursion.name)}</td></tr>`,
    `<tr><td style="padding:6px 0;color:#555;">Località</td><td style="padding:6px 0;">${escapeHtml(data.excursion.location)}</td></tr>`,
    `<tr><td style="padding:6px 0;color:#555;">Data</td><td style="padding:6px 0;">${escapeHtml(dateLabel)}</td></tr>`,
    `<tr><td style="padding:6px 0;color:#555;">Partecipanti</td><td style="padding:6px 0;">${escapeHtml(participantsLabel)}</td></tr>`,
  ];
  if (pricePerPerson)
    detailsRows.push(
      `<tr><td style="padding:6px 0;color:#555;">Prezzo per persona</td><td style="padding:6px 0;">${escapeHtml(pricePerPerson)}</td></tr>`,
    );
  if (totalPrice)
    detailsRows.push(
      `<tr><td style="padding:6px 0;color:#555;">Totale</td><td style="padding:6px 0;font-weight:600;">${escapeHtml(totalPrice)}</td></tr>`,
    );
  detailsRows.push(
    `<tr><td style="padding:6px 0;color:#555;">Pagamento</td><td style="padding:6px 0;">${escapeHtml(paymentLabel)}</td></tr>`,
  );

  const paymentBlock = paymentInstructions
    ? `<div style="margin:24px 0;padding:16px;background:#f6f8fa;border-radius:8px;">
        <div style="font-weight:600;margin-bottom:8px;">Istruzioni per il pagamento</div>
        <div style="white-space:pre-wrap;color:#333;">${escapeHtml(paymentInstructions)}</div>
      </div>`
    : "";

  const nextStepsCopy =
    data.paymentType === "deposit"
      ? "Ti contatteremo a breve per confermare l'acconto e organizzare il saldo."
      : "Ti contatteremo a breve per confermare il pagamento e fornirti tutti i dettagli operativi della gita.";

  const html = `<!doctype html>
<html lang="it">
<body style="font-family:Arial, Helvetica, sans-serif;color:#1a1a1a;background:#ffffff;margin:0;padding:24px;">
  <div style="max-width:560px;margin:0 auto;">
    <h2 style="margin:0 0 16px;">Conferma prenotazione</h2>
    <p>Ciao ${escapeHtml(data.customerName)},</p>
    <p>abbiamo ricevuto la tua prenotazione per la gita <strong>${escapeHtml(data.excursion.name)}</strong>. Di seguito trovi tutti i dettagli.</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;">
      ${detailsRows.join("\n      ")}
    </table>
    ${paymentBlock}
    <div style="margin:24px 0;">
      <div style="font-weight:600;margin-bottom:8px;">Prossimi passi</div>
      <div>${escapeHtml(nextStepsCopy)}</div>
    </div>
    ${
      cancellationUrl
        ? `<div style="margin:24px 0;padding:16px;background:#fff7f5;border:1px solid #f1c7bd;border-radius:8px;">
        <div style="font-weight:600;margin-bottom:8px;">Devi annullare la prenotazione?</div>
        <div style="margin-bottom:12px;color:#444;">Puoi annullarla in autonomia con un click. I posti torneranno disponibili automaticamente.</div>
        <a href="${escapeHtml(cancellationUrl)}" style="display:inline-block;padding:10px 16px;background:#c0392b;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">Annulla prenotazione</a>
      </div>`
        : ""
    }
    <div style="margin:24px 0;color:#444;">
      <div>Per qualsiasi domanda puoi rispondere a questa email o contattarci:</div>
      <div>Email: <a href="mailto:${escapeHtml(agency.email)}">${escapeHtml(agency.email)}</a></div>
      ${agency.phone ? `<div>Telefono: ${escapeHtml(agency.phone)}</div>` : ""}
    </div>
    <p style="color:#666;font-size:14px;">Grazie per aver scelto ${escapeHtml(agency.name)}!<br/>${escapeHtml(agency.name)} — ${escapeHtml(agency.website)}</p>
  </div>
</body>
</html>`;

  return {
    to: data.customerEmail,
    subject,
    text,
    html,
    replyTo: agency.email,
  };
}

export function buildAdminEmail(
  data: ExcursionBookingEmailData,
): EmailMessage | null {
  const recipients = getAdminNotificationEmails();
  if (recipients.length === 0) return null;

  const dateLabel = formatDateIt(data.excursion.date);
  const totalPrice =
    data.excursion.pricePerPerson !== null &&
    data.excursion.pricePerPerson !== undefined
      ? formatPrice(
          Number(data.excursion.pricePerPerson) * data.seats,
        )
      : null;
  const paymentLabel =
    data.paymentType === "full" ? "Saldo intero" : "Acconto";
  const participantsLabel =
    data.children > 0
      ? `${data.adults} adult${data.adults === 1 ? "o" : "i"} + ${data.children} bambin${data.children === 1 ? "o" : "i"}`
      : `${data.adults} adult${data.adults === 1 ? "o" : "i"}`;

  const subject = `Nuova prenotazione gita: ${data.excursion.name} (${data.seats} posti)`;

  const textLines = [
    `Nuova prenotazione ricevuta dal sito.`,
    "",
    `Gita: ${data.excursion.name}`,
    `Località: ${data.excursion.location}`,
    `Data: ${dateLabel}`,
    "",
    `Cliente: ${data.customerName}`,
    `Email: ${data.customerEmail}`,
    `Telefono: ${data.customerPhone || "—"}`,
    "",
    `Partecipanti: ${participantsLabel}`,
    `Pagamento: ${paymentLabel}`,
    totalPrice ? `Totale: ${totalPrice}` : "",
    "",
    `ID prenotazione: ${data.bookingId}`,
  ].filter((l) => l !== "");

  const html = `<!doctype html>
<html lang="it">
<body style="font-family:Arial, Helvetica, sans-serif;color:#1a1a1a;">
  <h2>Nuova prenotazione gita</h2>
  <p><strong>${escapeHtml(data.excursion.name)}</strong> — ${escapeHtml(data.excursion.location)} — ${escapeHtml(dateLabel)}</p>
  <table style="border-collapse:collapse;">
    <tr><td style="padding:4px 12px 4px 0;color:#555;">Cliente</td><td style="padding:4px 0;">${escapeHtml(data.customerName)}</td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#555;">Email</td><td style="padding:4px 0;">${escapeHtml(data.customerEmail)}</td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#555;">Telefono</td><td style="padding:4px 0;">${escapeHtml(data.customerPhone || "—")}</td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#555;">Partecipanti</td><td style="padding:4px 0;">${escapeHtml(participantsLabel)}</td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#555;">Pagamento</td><td style="padding:4px 0;">${escapeHtml(paymentLabel)}</td></tr>
    ${totalPrice ? `<tr><td style="padding:4px 12px 4px 0;color:#555;">Totale</td><td style="padding:4px 0;">${escapeHtml(totalPrice)}</td></tr>` : ""}
    ${data.servizioCasa ? `<tr><td style="padding:4px 12px 4px 0;color:#555;">Servizio sotto casa</td><td style="padding:4px 0;color:#e07b00;font-weight:600;">Richiesto</td></tr>` : ""}
    <tr><td style="padding:4px 12px 4px 0;color:#555;">ID prenotazione</td><td style="padding:4px 0;">${escapeHtml(data.bookingId)}</td></tr>
  </table>
</body>
</html>`;

  return {
    to: recipients,
    subject,
    text: textLines.join("\n"),
    html,
    replyTo: data.customerEmail,
  };
}

export type ExcursionBookingCancellationData = {
  bookingId: string;
  customerName: string;
  customerEmail: string | null;
  customerPhone?: string | null;
  seats: number;
  excursion: {
    id: string;
    name: string;
    location: string;
    date: string;
  };
};

export function buildCancellationCustomerEmail(
  data: ExcursionBookingCancellationData,
): EmailMessage | null {
  if (!data.customerEmail) return null;
  const agency = getAgencyContacts();
  const dateLabel = formatDateIt(data.excursion.date);
  const subject = `Annullamento prenotazione: ${data.excursion.name}`;
  const text = [
    `Ciao ${data.customerName},`,
    "",
    `confermiamo l'annullamento della tua prenotazione per la gita "${data.excursion.name}" (${data.excursion.location}, ${dateLabel}).`,
    `Posti annullati: ${data.seats}.`,
    "",
    `Se l'annullamento non è stato richiesto da te, contattaci subito a ${agency.email}.`,
    "",
    `${agency.name}`,
    agency.website,
  ].join("\n");
  const html = `<!doctype html>
<html lang="it"><body style="font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;background:#fff;margin:0;padding:24px;">
  <div style="max-width:560px;margin:0 auto;">
    <h2 style="margin:0 0 16px;">Prenotazione annullata</h2>
    <p>Ciao ${escapeHtml(data.customerName)},</p>
    <p>confermiamo l'annullamento della tua prenotazione per la gita <strong>${escapeHtml(data.excursion.name)}</strong> (${escapeHtml(data.excursion.location)}, ${escapeHtml(dateLabel)}).</p>
    <p>Posti annullati: <strong>${data.seats}</strong>.</p>
    <p style="color:#666;">Se l'annullamento non è stato richiesto da te, contattaci subito a <a href="mailto:${escapeHtml(agency.email)}">${escapeHtml(agency.email)}</a>.</p>
    <p style="color:#666;font-size:14px;">${escapeHtml(agency.name)} — ${escapeHtml(agency.website)}</p>
  </div>
</body></html>`;
  return {
    to: data.customerEmail,
    subject,
    text,
    html,
    replyTo: agency.email,
  };
}

export function buildCancellationAdminEmail(
  data: ExcursionBookingCancellationData,
): EmailMessage | null {
  const recipients = getAdminNotificationEmails();
  if (recipients.length === 0) return null;
  const dateLabel = formatDateIt(data.excursion.date);
  const subject = `Prenotazione annullata dal cliente: ${data.excursion.name} (${data.seats} posti)`;
  const text = [
    `Il cliente ha annullato la prenotazione tramite il link nella email.`,
    "",
    `Gita: ${data.excursion.name}`,
    `Località: ${data.excursion.location}`,
    `Data: ${dateLabel}`,
    "",
    `Cliente: ${data.customerName}`,
    `Email: ${data.customerEmail || "—"}`,
    `Telefono: ${data.customerPhone || "—"}`,
    "",
    `Posti liberati: ${data.seats}`,
    `ID prenotazione: ${data.bookingId}`,
  ].join("\n");
  const html = `<!doctype html>
<html lang="it"><body style="font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;">
  <h2>Prenotazione annullata dal cliente</h2>
  <p><strong>${escapeHtml(data.excursion.name)}</strong> — ${escapeHtml(data.excursion.location)} — ${escapeHtml(dateLabel)}</p>
  <table style="border-collapse:collapse;">
    <tr><td style="padding:4px 12px 4px 0;color:#555;">Cliente</td><td style="padding:4px 0;">${escapeHtml(data.customerName)}</td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#555;">Email</td><td style="padding:4px 0;">${escapeHtml(data.customerEmail || "—")}</td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#555;">Telefono</td><td style="padding:4px 0;">${escapeHtml(data.customerPhone || "—")}</td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#555;">Posti liberati</td><td style="padding:4px 0;">${data.seats}</td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#555;">ID prenotazione</td><td style="padding:4px 0;">${escapeHtml(data.bookingId)}</td></tr>
  </table>
</body></html>`;
  return {
    to: recipients,
    subject,
    text,
    html,
    replyTo: data.customerEmail || undefined,
  };
}

export function dispatchExcursionBookingCancellationEmails(
  data: ExcursionBookingCancellationData,
): void {
  const customerMsg = buildCancellationCustomerEmail(data);
  const adminMsg = buildCancellationAdminEmail(data);
  void Promise.allSettled([
    customerMsg ? sendEmail(customerMsg) : Promise.resolve(),
    adminMsg ? sendEmail(adminMsg) : Promise.resolve(),
  ]).then((results) => {
    for (const r of results) {
      if (r.status === "rejected") {
        logger.error(
          { err: r.reason, bookingId: data.bookingId },
          "Errore invio email di annullamento prenotazione",
        );
      }
    }
  });
}

export function dispatchExcursionBookingEmails(
  data: ExcursionBookingEmailData,
): void {
  const customerMsg = buildCustomerEmail(data);
  const adminMsg = buildAdminEmail(data);

  void Promise.allSettled([
    sendEmail(customerMsg),
    adminMsg ? sendEmail(adminMsg) : Promise.resolve(),
  ]).then((results) => {
    for (const r of results) {
      if (r.status === "rejected") {
        logger.error(
          { err: r.reason, bookingId: data.bookingId },
          "Errore invio email di conferma prenotazione",
        );
      }
    }
  });
}

// ── Stripe payment emails ──────────────────────────────────────────────────

export type CardSavedEmailData = {
  bookingId: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string | null;
  seats: number;
  adults: number;
  children: number;
  servizioCasa?: boolean;
  amountDueCents: number;
  excursion: {
    id: string;
    name: string;
    location: string;
    date: string;
    pricePerPerson: string | number | null;
  };
};

export type ChargedEmailData = CardSavedEmailData;

export type ChargeFailedEmailData = {
  bookingId: string;
  customerName: string;
  customerEmail: string;
  seats: number;
  excursion: {
    id: string;
    name: string;
    location: string;
    date: string;
  };
};

export type ExcursionCancelledEmailData = {
  bookingId: string;
  customerName: string;
  customerEmail: string;
  seats: number;
  excursion: {
    id: string;
    name: string;
    location: string;
    date: string;
  };
};

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("it-IT", { style: "currency", currency: "EUR" });
}

export function buildCardSavedCustomerEmail(data: CardSavedEmailData): EmailMessage {
  const agency = getAgencyContacts();
  const dateLabel = formatDateIt(data.excursion.date);
  const amountLabel = formatCents(data.amountDueCents);
  const subject = `Prenotazione ricevuta: ${data.excursion.name}`;

  const text = [
    `Ciao ${data.customerName},`,
    "",
    `abbiamo ricevuto la tua prenotazione per "${data.excursion.name}" (${data.excursion.location}, ${dateLabel}).`,
    "",
    `Posti riservati: ${data.seats}`,
    `Importo da addebitare alla conferma: ${amountLabel}`,
    "",
    "La tua carta è stata salvata in modo sicuro. Verrà addebitata SOLO se la gita raggiungerà il numero minimo di partecipanti e verrà confermata.",
    "Se la gita non parte, non verrà effettuato nessun addebito.",
    "",
    `Per informazioni: ${agency.email}`,
    `${agency.name} — ${agency.website}`,
  ].join("\n");

  const html = `<!doctype html>
<html lang="it"><body style="font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;background:#fff;margin:0;padding:24px;">
  <div style="max-width:560px;margin:0 auto;">
    <h2 style="margin:0 0 16px;">Prenotazione ricevuta</h2>
    <p>Ciao ${escapeHtml(data.customerName)},</p>
    <p>abbiamo ricevuto la tua prenotazione per <strong>${escapeHtml(data.excursion.name)}</strong> (${escapeHtml(data.excursion.location)}, ${escapeHtml(dateLabel)}).</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;">
      <tr><td style="padding:6px 0;color:#555;">Posti riservati</td><td style="padding:6px 0;font-weight:600;">${data.seats}</td></tr>
      <tr><td style="padding:6px 0;color:#555;">Importo alla conferma</td><td style="padding:6px 0;font-weight:600;">${escapeHtml(amountLabel)}</td></tr>
    </table>
    <div style="margin:20px 0;padding:16px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;">
      <p style="margin:0;color:#166534;">La tua carta è stata salvata in modo sicuro. Verrà addebitata <strong>solo se la gita verrà confermata</strong>. Se la gita non parte, non verrà effettuato nessun addebito.</p>
    </div>
    <p style="color:#666;font-size:14px;">${escapeHtml(agency.name)} — <a href="${escapeHtml(agency.website)}">${escapeHtml(agency.website)}</a></p>
  </div>
</body></html>`;

  return { to: data.customerEmail, subject, text, html, replyTo: agency.email };
}

export function dispatchCardSavedEmail(data: CardSavedEmailData): void {
  void sendEmail(buildCardSavedCustomerEmail(data)).catch((err) => {
    logger.error({ err, bookingId: data.bookingId }, "Errore invio email carta salvata");
  });
}

export function buildChargedCustomerEmail(data: ChargedEmailData): EmailMessage {
  const agency = getAgencyContacts();
  const dateLabel = formatDateIt(data.excursion.date);
  const amountLabel = formatCents(data.amountDueCents);
  const subject = `Pagamento confermato: ${data.excursion.name}`;

  const text = [
    `Ciao ${data.customerName},`,
    "",
    `La gita "${data.excursion.name}" è confermata! È stato addebitato ${amountLabel} sulla tua carta.`,
    "",
    `Data: ${dateLabel}`,
    `Luogo: ${data.excursion.location}`,
    `Posti: ${data.seats}`,
    "",
    "Ti contatteremo con tutti i dettagli operativi (orari, punto di partenza, ecc.).",
    "",
    `${agency.name} — ${agency.website}`,
  ].join("\n");

  const html = `<!doctype html>
<html lang="it"><body style="font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;background:#fff;margin:0;padding:24px;">
  <div style="max-width:560px;margin:0 auto;">
    <h2 style="margin:0 0 16px;">Gita confermata — Pagamento ricevuto</h2>
    <p>Ciao ${escapeHtml(data.customerName)},</p>
    <p>La gita <strong>${escapeHtml(data.excursion.name)}</strong> è confermata! È stato addebitato <strong>${escapeHtml(amountLabel)}</strong> sulla tua carta.</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;">
      <tr><td style="padding:6px 0;color:#555;">Gita</td><td style="padding:6px 0;font-weight:600;">${escapeHtml(data.excursion.name)}</td></tr>
      <tr><td style="padding:6px 0;color:#555;">Data</td><td style="padding:6px 0;">${escapeHtml(dateLabel)}</td></tr>
      <tr><td style="padding:6px 0;color:#555;">Luogo</td><td style="padding:6px 0;">${escapeHtml(data.excursion.location)}</td></tr>
      <tr><td style="padding:6px 0;color:#555;">Posti</td><td style="padding:6px 0;">${data.seats}</td></tr>
      <tr><td style="padding:6px 0;color:#555;">Importo addebitato</td><td style="padding:6px 0;font-weight:600;">${escapeHtml(amountLabel)}</td></tr>
    </table>
    <p>Ti contatteremo a breve con tutti i dettagli operativi della gita.</p>
    <p style="color:#666;font-size:14px;">${escapeHtml(agency.name)} — <a href="${escapeHtml(agency.website)}">${escapeHtml(agency.website)}</a></p>
  </div>
</body></html>`;

  return { to: data.customerEmail, subject, text, html, replyTo: agency.email };
}

export function dispatchChargedEmail(data: ChargedEmailData): void {
  void sendEmail(buildChargedCustomerEmail(data)).catch((err) => {
    logger.error({ err, bookingId: data.bookingId }, "Errore invio email addebito confermato");
  });
}

export function buildChargeFailedCustomerEmail(data: ChargeFailedEmailData): EmailMessage {
  const agency = getAgencyContacts();
  const dateLabel = formatDateIt(data.excursion.date);
  const subject = `Azione richiesta: pagamento fallito per ${data.excursion.name}`;

  const text = [
    `Ciao ${data.customerName},`,
    "",
    `La gita "${data.excursion.name}" (${dateLabel}) è confermata, ma non siamo riusciti ad addebitare la tua carta.`,
    "",
    "Per favore contattaci il prima possibile per regolarizzare il pagamento:",
    `• Email: ${agency.email}`,
    agency.phone ? `• Telefono: ${agency.phone}` : "",
    "",
    `${agency.name} — ${agency.website}`,
  ].filter(Boolean).join("\n");

  const html = `<!doctype html>
<html lang="it"><body style="font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;background:#fff;margin:0;padding:24px;">
  <div style="max-width:560px;margin:0 auto;">
    <h2 style="margin:0 0 16px;color:#b91c1c;">Pagamento non riuscito</h2>
    <p>Ciao ${escapeHtml(data.customerName)},</p>
    <p>La gita <strong>${escapeHtml(data.excursion.name)}</strong> (${escapeHtml(dateLabel)}) è confermata, ma non siamo riusciti ad addebitare la tua carta.</p>
    <div style="margin:20px 0;padding:16px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;">
      <p style="margin:0;color:#991b1b;">Per favore contattaci il prima possibile per regolarizzare il pagamento.</p>
    </div>
    <p>Email: <a href="mailto:${escapeHtml(agency.email)}">${escapeHtml(agency.email)}</a>${agency.phone ? `<br/>Telefono: ${escapeHtml(agency.phone)}` : ""}</p>
    <p style="color:#666;font-size:14px;">${escapeHtml(agency.name)}</p>
  </div>
</body></html>`;

  return { to: data.customerEmail, subject, text, html, replyTo: agency.email };
}

export function buildChargeFailedAdminEmail(data: ChargeFailedEmailData): EmailMessage | null {
  const recipients = getAdminNotificationEmails();
  if (recipients.length === 0) return null;
  const dateLabel = formatDateIt(data.excursion.date);
  const subject = `⚠️ Addebito fallito: ${data.customerName} — ${data.excursion.name}`;
  const text = [
    `Addebito Stripe fallito per la prenotazione ${data.bookingId}.`,
    `Cliente: ${data.customerName} (${data.customerEmail})`,
    `Gita: ${data.excursion.name} — ${dateLabel}`,
    `Posti: ${data.seats}`,
    "Verificare manualmente e contattare il cliente.",
  ].join("\n");
  return { to: recipients, subject, text, html: `<pre>${text}</pre>`, replyTo: data.customerEmail };
}

export function dispatchChargeFailedEmail(data: ChargeFailedEmailData): void {
  void sendEmail(buildChargeFailedCustomerEmail(data)).catch((err) => {
    logger.error({ err, bookingId: data.bookingId }, "Errore invio email addebito fallito al cliente");
  });
  const adminMsg = buildChargeFailedAdminEmail(data);
  if (adminMsg) {
    void sendEmail(adminMsg).catch((err) => {
      logger.error({ err, bookingId: data.bookingId }, "Errore invio email addebito fallito all'admin");
    });
  }
}

export function buildExcursionCancelledCustomerEmail(data: ExcursionCancelledEmailData): EmailMessage {
  const agency = getAgencyContacts();
  const dateLabel = formatDateIt(data.excursion.date);
  const subject = `Gita annullata: ${data.excursion.name}`;

  const text = [
    `Ciao ${data.customerName},`,
    "",
    `La gita "${data.excursion.name}" (${dateLabel}) è stata purtroppo annullata per numero insufficiente di partecipanti.`,
    "",
    "Non è stato effettuato nessun addebito sulla tua carta.",
    "",
    `Per informazioni: ${agency.email}`,
    `${agency.name} — ${agency.website}`,
  ].join("\n");

  const html = `<!doctype html>
<html lang="it"><body style="font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;background:#fff;margin:0;padding:24px;">
  <div style="max-width:560px;margin:0 auto;">
    <h2 style="margin:0 0 16px;">Gita annullata</h2>
    <p>Ciao ${escapeHtml(data.customerName)},</p>
    <p>La gita <strong>${escapeHtml(data.excursion.name)}</strong> (${escapeHtml(dateLabel)}) è stata purtroppo annullata per numero insufficiente di partecipanti.</p>
    <div style="margin:20px 0;padding:16px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;">
      <p style="margin:0;color:#166534;font-weight:600;">Non è stato effettuato nessun addebito sulla tua carta.</p>
    </div>
    <p>Ci scusiamo per l'inconveniente. Speriamo di poterti accogliere nella prossima gita!</p>
    <p>Per informazioni: <a href="mailto:${escapeHtml(agency.email)}">${escapeHtml(agency.email)}</a></p>
    <p style="color:#666;font-size:14px;">${escapeHtml(agency.name)} — <a href="${escapeHtml(agency.website)}">${escapeHtml(agency.website)}</a></p>
  </div>
</body></html>`;

  return { to: data.customerEmail, subject, text, html, replyTo: agency.email };
}

export function dispatchExcursionCancelledEmail(data: ExcursionCancelledEmailData): void {
  void sendEmail(buildExcursionCancelledCustomerEmail(data)).catch((err) => {
    logger.error({ err, bookingId: data.bookingId }, "Errore invio email gita annullata");
  });
}
