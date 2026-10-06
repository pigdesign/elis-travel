import { normalizeAccountEmail } from "@workspace/db/schema";

// ---------------------------------------------------------------------------
// Quando una prenotazione aperta dal portale puo finire fra i viaggi di chi e
// dentro l'area clienti senza chiedergli niente.
//
// Due prove servono insieme: il link del portale (chi lo usa ha in mano QUELLA
// prenotazione) e la sessione o il link di accesso (chi lo usa controlla la
// casella dell'account). Se l'email della prenotazione e quella dell'account,
// le due prove dicono la stessa cosa e chiedere un clic non aggiunge niente:
// e la stessa casella che riceve gia conferme, istruzioni e link del portale.
//
// Se le email sono diverse il caso e ambiguo — il figlio che apre la
// prenotazione della madre, il capogruppo, il link inoltrato — e la scelta
// resta alla persona, con il pulsante.
// ---------------------------------------------------------------------------

export type PortalLinkDecision =
  | "link"
  | "already_linked"
  | "needs_confirmation"
  | "revoked"
  | "account_inactive";

/**
 * Vero se i due indirizzi sono la stessa casella, con la stessa normalizzazione
 * dell'indice unico sugli account. Un indirizzo vuoto non coincide con niente.
 */
export function sameBookingEmail(
  bookingEmail: string | null | undefined,
  accountEmail: string | null | undefined,
): boolean {
  const booking = normalizeAccountEmail(bookingEmail ?? "");
  const account = normalizeAccountEmail(accountEmail ?? "");
  return booking !== "" && booking === account;
}

export function decidePortalLink(input: {
  accountStatus: string | null;
  accountEmail: string | null;
  bookingEmail: string | null;
  existingLink: { revoked: boolean } | null;
  /** Falso solo per il clic esplicito sul pulsante. */
  requireSameEmail: boolean;
}): PortalLinkDecision {
  if (input.accountStatus !== "active") return "account_inactive";
  if (input.existingLink && !input.existingLink.revoked) {
    return "already_linked";
  }
  // Un collegamento revocato e una decisione dell'agenzia: non lo riapre ne
  // il clic del cliente ne un accesso, altrimenti la revoca non servirebbe.
  if (input.existingLink?.revoked) return "revoked";
  if (
    input.requireSameEmail &&
    !sameBookingEmail(input.bookingEmail, input.accountEmail)
  ) {
    return "needs_confirmation";
  }
  return "link";
}
