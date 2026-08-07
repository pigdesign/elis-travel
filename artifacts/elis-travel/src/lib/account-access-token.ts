const MIN_TOKEN_LENGTH = 8;
const MAX_TOKEN_LENGTH = 512;

/**
 * Estrae il token di accesso dall'URL di atterraggio.
 *
 * Il token arriva nel FRAGMENT (`/accedi#token=...`), che il browser non invia
 * al server: non finisce nei log HTTP ne nell'header Referer. Leggiamo anche la
 * query string perche alcuni client di posta riscrivono i link per tracciarli e
 * possono spostarvi il fragment — ma resta un ripiego, non il percorso previsto.
 */
export function readAccountTokenFromLocation(input: {
  hash: string;
  search: string;
}): string {
  const fromHash = new URLSearchParams(
    input.hash.replace(/^#/, ""),
  ).get("token");
  const fromQuery = new URLSearchParams(input.search).get("token");
  return usableToken(fromHash) ?? usableToken(fromQuery) ?? "";
}

function usableToken(value: string | null | undefined): string | null {
  const token = value?.trim() ?? "";
  if (
    token.length < MIN_TOKEN_LENGTH ||
    token.length > MAX_TOKEN_LENGTH ||
    /\s/.test(token)
  ) {
    return null;
  }
  return token;
}

/**
 * Il token non deve restare nella barra degli indirizzi: verrebbe copiato nei
 * preferiti, nella cronologia condivisa e negli screenshot. Va rimosso appena
 * letto, anche se il consumo poi fallisce.
 */
export function stripTokenFromUrl(): void {
  if (typeof window === "undefined") return;
  const clean = window.location.pathname;
  window.history.replaceState(window.history.state, "", clean);
}
