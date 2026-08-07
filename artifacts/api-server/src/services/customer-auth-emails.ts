import { type EmailMessage } from "./email.service";
import { agency, escapeHtml, wrapEmailHtml } from "./email-layout";
import { resolveBookingPortalOrigin } from "./booking-access-token";

/**
 * URL di atterraggio del magic link.
 *
 * Il token sta nel FRAGMENT, non nella query string, esattamente come per il
 * portale prenotazione: il fragment non viene inviato al server ne ai proxy,
 * quindi la credenziale non finisce nei log HTTP ne nell'header Referer quando
 * la pagina carica una risorsa esterna.
 */
export function buildAccountAccessUrl(token: string): string {
  const origin = resolveBookingPortalOrigin();
  return `${origin}/accedi#token=${encodeURIComponent(token)}`;
}

function minutesLabel(ms: number): string {
  const minutes = Math.round(ms / 60000);
  return `${minutes} minut${minutes === 1 ? "o" : "i"}`;
}

export function buildMagicLinkEmail(input: {
  to: string;
  token: string;
  ttlMs: number;
}): EmailMessage {
  const url = buildAccountAccessUrl(input.token);
  const validity = minutesLabel(input.ttlMs);
  const a = agency();

  const text = [
    "Ecco il link per entrare nella tua area personale Elis Travel.",
    "",
    url,
    "",
    `Il link vale ${validity} e puo essere usato una sola volta.`,
    "",
    "Se non hai richiesto tu questo accesso puoi ignorare il messaggio:",
    "senza cliccare il link non succede nulla.",
    "",
    `${a.name} · ${a.email}`,
  ].join("\n");

  const html = wrapEmailHtml(
    "Entra nella tua area personale",
    `<p>Ecco il link per entrare nella tua area personale Elis Travel.</p>
     <p style="margin:24px 0;">
       <a href="${escapeHtml(url)}"
          style="display:inline-block;background:#0b5b60;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:6px;font-weight:600;">
         Entra nella mia area personale
       </a>
     </p>
     <p style="font-size:13px;color:#5b6b72;">
       Il link vale <strong>${escapeHtml(validity)}</strong> e puo essere usato una sola volta.
     </p>
     <p style="font-size:13px;color:#5b6b72;">
       Se non hai richiesto tu questo accesso puoi ignorare il messaggio: senza
       cliccare il link non succede nulla.
     </p>
     <p style="font-size:12px;color:#8a979d;word-break:break-all;">
       Se il pulsante non funziona, copia questo indirizzo nel browser:<br/>${escapeHtml(url)}
     </p>`,
  );

  return {
    to: input.to,
    subject: "Il tuo accesso all'area personale — Elis Travel",
    text,
    html,
    replyTo: a.email,
  };
}
