// Impaginazione condivisa delle email transazionali.
//
// Estratta da excursion-booking-emails-v2.ts quando sono arrivate le email
// dell'area clienti: duplicare il wrapper avrebbe fatto divergere l'aspetto dei
// messaggi al primo ritocco grafico.

export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function agency(): {
  name: string;
  email: string;
  phone: string | null;
} {
  return {
    name: process.env.AGENCY_NAME || "Elis Travel",
    email: process.env.AGENCY_CONTACT_EMAIL || "info@elis-travel.it",
    phone: process.env.AGENCY_CONTACT_PHONE || null,
  };
}

export function wrapEmailHtml(
  subjectTitle: string,
  bodyHtml: string,
): string {
  const a = agency();
  return `<!doctype html><html lang="it"><body style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#14242b;line-height:1.55;max-width:640px;margin:0 auto;padding:24px;">
  <h2 style="color:#0b5b60;">${escapeHtml(subjectTitle)}</h2>
  ${bodyHtml}
  <p style="margin-top:28px;font-size:13px;color:#5b6b72;">${escapeHtml(a.name)}${a.phone ? ` · ${escapeHtml(a.phone)}` : ""} · ${escapeHtml(a.email)}</p>
  </body></html>`;
}
