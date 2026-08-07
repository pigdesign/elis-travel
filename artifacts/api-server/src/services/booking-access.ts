import { db } from "@workspace/db";
import {
  customerAccountBookingsTable,
  customerAccountsTable,
} from "@workspace/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { verifyBookingAccessToken } from "./booking-access-token";

// ---------------------------------------------------------------------------
// Due vie verso la stessa prenotazione: il link ricevuto via email e la
// sessione dell'area clienti.
//
// La logica sta qui e non nelle rotte perche il punto di autorizzazione deve
// restare uno solo: due percorsi che decidono separatamente chi puo vedere
// pagamenti e annullamenti sono due occasioni di sbagliare.
// ---------------------------------------------------------------------------

export type BookingAccessVia = "portal_token" | "account_session";

export type BookingAccess = {
  bookingId: string;
  via: BookingAccessVia;
};

/**
 * Decide se il token ha la precedenza sulla sessione.
 *
 * Il token identifica DA SOLO la prenotazione, quindi quando c'e va usato:
 * e il percorso dei link gia inviati, che deve continuare a funzionare
 * identico anche per chi nel frattempo si e fatto un account.
 */
export function shouldUseToken(input: {
  token: string;
  bookingId: string | null;
  accountId: string | null;
}): boolean {
  if (input.token) return true;
  return !(input.accountId && input.bookingId);
}

/**
 * Verifica che l'account possieda davvero quella prenotazione.
 *
 * Legge `customer_account_bookings`, mai `excursion_bookings.customer_id`:
 * quest'ultimo e un collegamento anagrafico best-effort, non una decisione di
 * autorizzazione, e puo essere stato scritto da un confronto di email.
 *
 * Lo stato dell'account viene riletto qui e non preso dalla sessione: con
 * sessioni da 90 giorni, un account bloccato conserverebbe altrimenti accesso
 * ai propri viaggi per tre mesi.
 */
async function accountOwnsBooking(input: {
  accountId: string;
  bookingId: string;
}): Promise<boolean> {
  const [row] = await db
    .select({ id: customerAccountBookingsTable.id })
    .from(customerAccountBookingsTable)
    .innerJoin(
      customerAccountsTable,
      eq(customerAccountsTable.id, customerAccountBookingsTable.accountId),
    )
    .where(
      and(
        eq(customerAccountBookingsTable.accountId, input.accountId),
        eq(customerAccountBookingsTable.bookingId, input.bookingId),
        isNull(customerAccountBookingsTable.revokedAt),
        eq(customerAccountsTable.status, "active"),
      ),
    )
    .limit(1);
  return Boolean(row);
}

export async function resolveBookingAccess(input: {
  token: string;
  bookingId: string | null;
  accountId: string | null;
}): Promise<BookingAccess | null> {
  if (shouldUseToken(input)) {
    const verified = await verifyBookingAccessToken(input.token);
    return verified
      ? { bookingId: verified.bookingId, via: "portal_token" }
      : null;
  }

  // Il ramo sessione richiede entrambi: shouldUseToken lo garantisce gia, ma
  // il controllo esplicito evita che una modifica futura lo aggiri.
  if (!input.accountId || !input.bookingId) return null;

  const owns = await accountOwnsBooking({
    accountId: input.accountId,
    bookingId: input.bookingId,
  });
  return owns
    ? { bookingId: input.bookingId, via: "account_session" }
    : null;
}
