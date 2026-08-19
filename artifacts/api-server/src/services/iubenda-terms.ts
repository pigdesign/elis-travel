import { logger } from "../lib/logger";

/**
 * Versione dei Termini e Condizioni, letta da Iubenda.
 *
 * La clausola che autorizza l'addebito differito della carta vive dentro i T&C
 * pubblicati su Iubenda, che pero non espone ne un numero di versione ne un
 * hash: l'unico marcatore e la riga "Ultima modifica: <data>" dentro l'HTML del
 * documento. Quella data e quindi la nostra versione, con granularita
 * giornaliera.
 *
 * Conseguenza da tenere a mente: la data copre l'INTERO documento, non la sola
 * clausola sull'addebito. Una correzione a un capitolo qualsiasi dei T&C la fa
 * cambiare, e da quel momento gli acconti gia autorizzati non vengono piu
 * addebitati in automatico (vedi excursion-confirmation.ts).
 */

const DOCUMENT_ID = process.env["IUBENDA_DOCUMENT_ID"] || "57118125";
const ENDPOINT = `https://www.iubenda.com/api/terms-and-conditions/${DOCUMENT_ID}`;

/** Il testo cambia raramente e la data ha granularita giornaliera. */
const CACHE_TTL_MS = 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8_000;

interface CacheEntry {
  version: string;
  at: number;
}

let cache: CacheEntry | null = null;
let inFlight: Promise<string | null> | null = null;

/** Azzera la cache: serve dopo aver pubblicato una modifica su Iubenda. */
export function resetTermsVersionCache(): void {
  cache = null;
  inFlight = null;
}

export function extractTermsVersion(html: string): string | null {
  // Spazi e tabulazioni, non \s: quest'ultimo attraverserebbe l'a capo e, con
  // una riga "Ultima modifica:" vuota, prenderebbe per versione il testo della
  // riga successiva.
  const match = html.match(/Ultima modifica:[ \t]*([^<\n]+)/);
  const value = match?.[1]?.trim();
  return value ? value : null;
}

async function fetchTermsVersion(): Promise<string | null> {
  const res = await fetch(ENDPOINT, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`Iubenda ha risposto ${res.status}`);
  }
  const body = (await res.json()) as { content?: unknown };
  if (typeof body.content !== "string") {
    throw new Error("Risposta Iubenda senza contenuto");
  }
  const version = extractTermsVersion(body.content);
  if (!version) {
    throw new Error("Data di ultima modifica non trovata nel documento");
  }
  return version;
}

/**
 * Versione corrente dei T&C, oppure `null` se non e stato possibile
 * determinarla.
 *
 * Un guasto di rete non deve far fallire una prenotazione o un addebito
 * legittimo: se la chiamata non riesce si continua con l'ultimo valore noto,
 * anche scaduto. Solo quando non esiste alcun valore noto si restituisce
 * `null`, e chi chiama si ferma in sicurezza.
 */
export async function getCurrentTermsVersion(): Promise<string | null> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) return cache.version;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const version = await fetchTermsVersion();
      if (version) cache = { version, at: Date.now() };
      return version;
    } catch (err) {
      if (cache) {
        logger.warn(
          { err, versioneInUso: cache.version },
          "Versione T&C non aggiornabile da Iubenda: uso l'ultimo valore noto",
        );
        return cache.version;
      }
      logger.error(
        { err },
        "Versione T&C non determinabile e nessun valore in cache",
      );
      return null;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}
