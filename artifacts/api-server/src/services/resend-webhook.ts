import { createHmac, timingSafeEqual } from "node:crypto";

// ---------------------------------------------------------------------------
// Verifica della firma dei webhook Resend (formato Svix).
//
// Senza firma, chiunque conosca l'URL potrebbe dichiarare che l'indirizzo di un
// cliente rimbalza e togliergli l'accesso: il webhook e l'unico ingresso non
// autenticato dell'applicazione oltre a quello di Stripe.
//
// La verifica e scritta a mano invece di aggiungere il pacchetto `svix`: sono
// venti righe di HMAC, e il progetto ha `minimumReleaseAge` di 24 ore sulle
// dipendenze, quindi ogni pacchetto nuovo e un passaggio in piu al deploy.
// ---------------------------------------------------------------------------

/** Oltre questa distanza dal presente il messaggio e considerato un replay. */
export const TOLLERANZA_MS = 5 * 60 * 1000;

export type FirmaEsito =
  | { valida: true }
  | { valida: false; motivo: string };

function confrontoCostante(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Verifica la firma di un messaggio Resend.
 *
 * `body` deve essere il corpo GREZZO: se il JSON viene analizzato e
 * riserializzato prima di arrivare qui, anche un solo spazio di differenza
 * invalida la firma. Per questo la rotta si registra prima di express.json().
 */
export function verificaFirmaResend(input: {
  secret: string;
  body: string;
  svixId: string | undefined;
  svixTimestamp: string | undefined;
  svixSignature: string | undefined;
  now?: number;
}): FirmaEsito {
  const { secret, body, svixId, svixTimestamp, svixSignature } = input;
  if (!secret) return { valida: false, motivo: "secret non configurato" };
  if (!svixId || !svixTimestamp || !svixSignature) {
    return { valida: false, motivo: "intestazioni di firma mancanti" };
  }

  const timestamp = Number(svixTimestamp);
  if (!Number.isFinite(timestamp)) {
    return { valida: false, motivo: "timestamp non valido" };
  }
  const now = input.now ?? Date.now();
  if (Math.abs(now - timestamp * 1000) > TOLLERANZA_MS) {
    // Un messaggio autentico ma vecchio puo essere stato intercettato e
    // rigiocato: la firma da sola non lo distinguerebbe.
    return { valida: false, motivo: "messaggio troppo vecchio o futuro" };
  }

  // Il segreto e "whsec_" + chiave in base64.
  const chiave = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const atteso = createHmac("sha256", chiave)
    .update(`${svixId}.${svixTimestamp}.${body}`)
    .digest();

  // L'intestazione puo contenere piu firme separate da spazio, ognuna nella
  // forma "v1,<base64>": durante una rotazione del segreto ne convivono due.
  const firme = svixSignature.split(" ");
  for (const firma of firme) {
    const [versione, valore] = firma.split(",");
    if (versione !== "v1" || !valore) continue;
    let ricevuto: Buffer;
    try {
      ricevuto = Buffer.from(valore, "base64");
    } catch {
      continue;
    }
    if (confrontoCostante(atteso, ricevuto)) return { valida: true };
  }

  return { valida: false, motivo: "firma non corrispondente" };
}

/**
 * Rimbalzi permanenti e temporanei richiedono risposte opposte.
 *
 * Il provider distingue "Permanent" (casella inesistente, dominio inattivo:
 * non cambiera) da "Transient" (server occupato, casella piena, greylisting,
 * mittente momentaneamente rifiutato: si risolve). Trattarli allo stesso modo
 * significherebbe togliere l'accesso a un cliente perche il suo provider ha
 * avuto un'ora storta — e senza password quell'accesso e l'unico che ha.
 */
function rimbalzoPermanente(data: EventoResend["data"]): boolean {
  const bounce = data?.bounce;
  if (!bounce || typeof bounce !== "object") {
    // Senza classificazione non si presume il peggio: meglio riprovare a
    // scrivere a un indirizzo morto che chiudere fuori un cliente vivo.
    return false;
  }
  const tipo = (bounce as { type?: unknown }).type;
  return typeof tipo === "string" && tipo.toLowerCase() === "permanent";
}

export type AzioneEmail =
  | {
      tipo: "segna_non_recapitabile";
      email: string;
      motivo: string;
      /** Diagnostica grezza del provider: il "perche" del rifiuto. */
      dettaglio?: Record<string, unknown> | null;
    }
  | { tipo: "segna_recapitabile"; email: string }
  | {
      /** Problema passeggero: si annota, non si tocca lo stato dell'account. */
      tipo: "solo_segnalazione";
      email: string;
      motivo: string;
      dettaglio?: Record<string, unknown> | null;
    }
  | { tipo: "ignora"; motivo: string };

type EventoResend = {
  type?: unknown;
  data?: {
    to?: unknown;
    email?: unknown;
    bounce?: unknown;
    reason?: unknown;
  } | null;
};

/**
 * Il messaggio del server di destinazione, cosi com'e. Senza, sappiamo che un
 * indirizzo rifiuta ma non se e "casella inesistente", "casella piena" o
 * "messaggio classificato come indesiderato" — che portano a rimedi diversi.
 */
function diagnosticaProvider(
  data: EventoResend["data"],
): Record<string, unknown> | null {
  if (!data) return null;
  const out: Record<string, unknown> = {};
  if (data.bounce && typeof data.bounce === "object") {
    Object.assign(out, data.bounce as Record<string, unknown>);
  }
  if (typeof data.reason === "string") out.reason = data.reason;
  return Object.keys(out).length > 0 ? out : null;
}

function primoDestinatario(data: EventoResend["data"]): string | null {
  if (!data) return null;
  const to = data.to;
  if (typeof to === "string" && to.trim()) return to.trim();
  if (Array.isArray(to)) {
    const primo = to.find((v) => typeof v === "string" && v.trim());
    if (typeof primo === "string") return primo.trim();
  }
  return null;
}

/**
 * Traduce un evento Resend nell'azione da compiere sull'account.
 *
 * Funzione pura, separata dalla scrittura sul database: e la parte con le
 * decisioni, ed e quella che vale la pena verificare senza infrastruttura.
 *
 * Il reclamo per spam viene trattato come un rimbalzo: la persona ha dichiarato
 * di non volere i nostri messaggi, e continuare a scrivergli danneggerebbe la
 * reputazione del dominio oltre che infastidirla.
 *
 * Il rimbalzo "morbido" (casella piena, server temporaneamente irraggiungibile)
 * NON tocca l'account: si risolve da solo e disattivare l'accesso per una
 * casella piena sarebbe sproporzionato.
 */
export function azionePerEvento(evento: unknown): AzioneEmail {
  if (!evento || typeof evento !== "object") {
    return { tipo: "ignora", motivo: "payload non valido" };
  }
  const e = evento as EventoResend;
  const tipo = typeof e.type === "string" ? e.type : "";
  const email = primoDestinatario(e.data);

  if (!email) return { tipo: "ignora", motivo: `destinatario assente (${tipo})` };

  switch (tipo) {
    case "email.bounced":
      return rimbalzoPermanente(e.data)
        ? {
            tipo: "segna_non_recapitabile",
            email,
            motivo: "indirizzo rifiutato in modo definitivo",
            dettaglio: diagnosticaProvider(e.data),
          }
        : {
            tipo: "solo_segnalazione",
            email,
            motivo: "consegna fallita in modo temporaneo",
            dettaglio: diagnosticaProvider(e.data),
          };
    case "email.complained":
      return {
        tipo: "segna_non_recapitabile",
        email,
        motivo: "segnalato come indesiderato dal destinatario",
        dettaglio: diagnosticaProvider(e.data),
      };
    case "email.delivered":
      return { tipo: "segna_recapitabile", email };
    default:
      return { tipo: "ignora", motivo: `evento non gestito (${tipo})` };
  }
}
