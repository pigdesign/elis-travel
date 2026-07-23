const MAX_PORTAL_TOKEN_LENGTH = 512;

export const BOOKING_PORTAL_SESSION_KEY =
  "elis-travel.booking-portal-token";

function usableToken(value: string | null | undefined): string | null {
  const token = value?.trim() ?? "";
  if (
    token.length < 8 ||
    token.length > MAX_PORTAL_TOKEN_LENGTH ||
    /\s/.test(token)
  ) {
    return null;
  }
  return token;
}

/**
 * Il token appena ricevuto (normalmente dal fragment, mai inviato al server)
 * ha sempre precedenza sul valore della scheda.
 * `legacyToken` mantiene validi i link storici /prenotazione/:token.
 */
export function selectBookingPortalToken(input: {
  queryToken?: string | null;
  legacyToken?: string | null;
  sessionToken?: string | null;
}): string {
  return (
    usableToken(input.queryToken) ??
    usableToken(input.legacyToken) ??
    usableToken(input.sessionToken) ??
    ""
  );
}

/** Rimuove sia il token legacy nel path sia qualunque query Stripe. */
export function cleanBookingPortalPath(pathname: string): string {
  const marker = "/prenotazione";
  const markerIndex = pathname.indexOf(marker);
  if (markerIndex < 0) return pathname;
  return pathname.slice(0, markerIndex + marker.length);
}
