import bcrypt from "bcryptjs";

// ---------------------------------------------------------------------------
// Password dell'area clienti — opzionale, mai obbligatoria.
//
// L'accesso primario resta il link via email: un account nasce da una
// prenotazione, quindi nel momento in cui viene creato il cliente non ha
// scelto nessuna password e non puo averla. La password si imposta DOPO, da
// dentro una sessione gia autenticata, ed e una comodita per chi non vuole
// aspettare l'email a ogni accesso — non un secondo fattore e non un
// sostituto: il recupero passa comunque dal link, quindi la casella di posta
// resta la chiave ultima dell'account in entrambi i casi.
// ---------------------------------------------------------------------------

// bcrypt ignora silenziosamente tutto cio che eccede i 72 byte: una password
// piu lunga verrebbe troncata e due password diverse con lo stesso prefisso
// aprirebbero lo stesso account. Meglio rifiutarla e dirlo.
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_BYTES = 72;

const BCRYPT_COST = 12;

export type PasswordCheck = { ok: true } | { ok: false; error: string };

/**
 * Validazione della password scelta. Volutamente minima: lunghezza e nulla
 * piu. Le regole su maiuscole e simboli spingono verso password prevedibili
 * annotate su un foglio, e qui la superficie da difendere e gia piccola
 * perche la password non e l'unico accesso.
 */
export function checkPasswordPolicy(password: unknown): PasswordCheck {
  if (typeof password !== "string") {
    return { ok: false, error: "Password non valida." };
  }
  if (password.length < PASSWORD_MIN_LENGTH) {
    return {
      ok: false,
      error: `La password deve avere almeno ${PASSWORD_MIN_LENGTH} caratteri.`,
    };
  }
  if (Buffer.byteLength(password, "utf8") > PASSWORD_MAX_BYTES) {
    return {
      ok: false,
      error: "La password e troppo lunga: usane una piu breve.",
    };
  }
  return { ok: true };
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

/**
 * Verifica la password contro l'hash memorizzato.
 *
 * Con `hash` null esegue comunque un confronto contro un hash fittizio: senza,
 * un account senza password risponderebbe in un millisecondo e uno con
 * password in qualche centinaio, e la differenza direbbe a chiunque quali
 * indirizzi sono registrati e attivi.
 */
export async function verifyPassword(
  password: string,
  hash: string | null,
): Promise<boolean> {
  if (!hash) {
    await bcrypt.compare(password, DUMMY_HASH);
    return false;
  }
  return bcrypt.compare(password, hash);
}

// Hash di una stringa senza significato, con lo stesso costo di quelli veri:
// serve solo a far spendere a un tentativo fallito lo stesso tempo di uno
// riuscito.
const DUMMY_HASH =
  "$2a$12$C6UzMDM.H6dfI/f/IKcEe.wnZ0lMlvpb0uWnq2SKUnEbA1D2Z1Sxq";
