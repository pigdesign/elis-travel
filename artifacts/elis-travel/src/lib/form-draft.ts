// Bozze locali dei form lunghi del backoffice.
//
// Il contenuto di un form vive solo nella memoria di React: basta chiudere il
// modale, cambiare pagina, ricaricare la scheda — o che Chrome scarti la scheda
// rimasta in background — perche' tutto quello che e' stato digitato sparisca
// senza un avviso. Qui la copia finisce in localStorage a ogni modifica, cosi'
// e' recuperabile al rientro qualunque sia stata la causa della perdita.
//
// localStorage e non sessionStorage: sessionStorage muore con la scheda, che e'
// proprio uno dei casi da coprire.

const PREFIX = "elis.draft.";

/** Oltre questo tempo una bozza non viene piu' proposta: e' quasi certamente
 *  roba dimenticata, e riproporla confonderebbe piu' di quanto aiuti. */
export const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type StoredDraft<T> = {
  savedAt: number;
  value: T;
};

export function draftStorageKey(key: string): string {
  return `${PREFIX}${key}`;
}

// Ogni accesso e' protetto: in navigazione privata, con i cookie di terze parti
// bloccati o a quota piena localStorage lancia. Una bozza non salvata e' un
// peccato, un form che esplode e' un danno.
function getStorage(): Storage | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readDraft<T>(
  key: string,
  ttlMs: number = DRAFT_TTL_MS,
): StoredDraft<T> | null {
  const storage = getStorage();
  if (!storage) return null;

  try {
    const raw = storage.getItem(draftStorageKey(key));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as StoredDraft<T>;
    if (!parsed || typeof parsed.savedAt !== "number" || !("value" in parsed)) {
      storage.removeItem(draftStorageKey(key));
      return null;
    }
    if (Date.now() - parsed.savedAt > ttlMs) {
      storage.removeItem(draftStorageKey(key));
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeDraft<T>(key: string, value: T): void {
  const storage = getStorage();
  if (!storage) return;

  try {
    const payload: StoredDraft<T> = { savedAt: Date.now(), value };
    storage.setItem(draftStorageKey(key), JSON.stringify(payload));
  } catch {
    // Quota piena: si prova a fare spazio buttando le bozze scadute e si
    // riprova una volta sola. Se non basta, si rinuncia in silenzio — il form
    // continua a funzionare, semplicemente senza rete di sicurezza.
    pruneExpiredDrafts();
    try {
      storage.setItem(
        draftStorageKey(key),
        JSON.stringify({ savedAt: Date.now(), value }),
      );
    } catch {
      /* ignorato di proposito */
    }
  }
}

export function removeDraft(key: string): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(draftStorageKey(key));
  } catch {
    /* ignorato di proposito */
  }
}

/** Elimina le bozze oltre il TTL. Chiamata all'apertura di un form: tiene
 *  pulito lo storage senza bisogno di un job dedicato. */
export function pruneExpiredDrafts(ttlMs: number = DRAFT_TTL_MS): void {
  const storage = getStorage();
  if (!storage) return;

  try {
    const expired: string[] = [];
    for (let i = 0; i < storage.length; i += 1) {
      const storageKey = storage.key(i);
      if (!storageKey || !storageKey.startsWith(PREFIX)) continue;

      const raw = storage.getItem(storageKey);
      if (!raw) continue;

      try {
        const parsed = JSON.parse(raw) as StoredDraft<unknown>;
        if (
          typeof parsed?.savedAt !== "number" ||
          Date.now() - parsed.savedAt > ttlMs
        ) {
          expired.push(storageKey);
        }
      } catch {
        expired.push(storageKey);
      }
    }
    // La rimozione avviene fuori dal ciclo: togliere una chiave mentre si
    // scorre per indice fa saltare l'elemento successivo.
    expired.forEach((storageKey) => storage.removeItem(storageKey));
  } catch {
    /* ignorato di proposito */
  }
}

/** Etichetta discorsiva dell'eta' di una bozza, per il banner di ripristino. */
export function describeDraftAge(
  savedAt: number,
  now: number = Date.now(),
): string {
  const seconds = Math.max(0, Math.round((now - savedAt) / 1000));
  if (seconds < 60) return "pochi secondi fa";

  const minutes = Math.round(seconds / 60);
  if (minutes < 60)
    return minutes === 1 ? "1 minuto fa" : `${minutes} minuti fa`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? "1 ora fa" : `${hours} ore fa`;

  const days = Math.round(hours / 24);
  return days === 1 ? "1 giorno fa" : `${days} giorni fa`;
}
