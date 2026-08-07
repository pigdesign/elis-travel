// Instradamento fra la sessione admin e quella dell'area clienti.
//
// Le due sessioni hanno cookie, store e durate diversi e su una richiesta deve
// girarne esattamente una: se entrambe fossero montate sullo stesso path si
// sovrascriverebbero req.session a vicenda. La decisione e quindi un if/else,
// e questo modulo ne contiene il solo predicato in modo che sia testabile.
//
// La lista enumera i path dell'AREA CLIENTI, non quelli admin: sono i path che
// introduciamo noi e di cui conosciamo l'elenco completo. Elencare quelli admin
// significherebbe indovinarli, e non coincidono con /api/admin — per esempio
// /api/storage/uploads/* e protetto da requireAuth e resterebbe senza sessione.
// Tutto cio che non e area clienti conserva il comportamento precedente.
export const CUSTOMER_SESSION_PATHS = [
  "/api/account",
  "/api/booking-portal",
] as const;

/**
 * Vero se la richiesta appartiene all'area clienti e deve usare la sessione
 * cliente. Il confronto e sul segmento intero: `/api/accounting` non deve
 * ricadere in `/api/account`.
 */
export function isCustomerSessionPath(
  pathname: string,
  prefixes: readonly string[] = CUSTOMER_SESSION_PATHS,
): boolean {
  return prefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
