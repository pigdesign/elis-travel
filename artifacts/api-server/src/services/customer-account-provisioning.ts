import { db } from "@workspace/db";
import {
  customerAccountBookingsTable,
  customerAccountsTable,
  excursionBookingsTable,
  normalizeAccountEmail,
} from "@workspace/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import { logger } from "../lib/logger";
import { buildAccountAccessUrl } from "./customer-auth-emails";
import { escapeHtml } from "./email-layout";
import { issueCustomerAuthToken } from "./customer-auth-token";
import { recordAccountEvent } from "./customer-auth-throttle";
import { splitCustomerName } from "./customer-name";

// ---------------------------------------------------------------------------
// Creazione dell'account "ombra" a partire da una prenotazione.
//
// Regola non negoziabile: qui NON si collega la prenotazione all'account.
//
// Compilare un modulo non prova nulla — chiunque puo digitare l'indirizzo di
// un altro, e il caso realistico non e l'attacco ma il refuso. Se collegassimo
// subito, una persona che ha gia l'area clienti attiva si troverebbe fra i
// propri viaggi la prenotazione di uno sconosciuto, con la possibilita di
// chiederne l'annullamento.
//
// Il collegamento avviene solo quando qualcuno dimostra di possedere la
// casella, cioe consumando il token di invito che arriva per email. E la stessa
// garanzia su cui poggia il portale prenotazione.
// ---------------------------------------------------------------------------

export type BookingInvite = {
  url: string;
  /** L'account esisteva gia ed era attivo: cambia solo il testo del richiamo. */
  existingActiveAccount: boolean;
};

async function findAccountByEmail(email: string) {
  const [account] = await db
    .select()
    .from(customerAccountsTable)
    // Stessa espressione dell'indice unico: un `eq` diretto mancherebbe le
    // righe salvate con maiuscole o spazi.
    .where(sql`lower(btrim(${customerAccountsTable.email})) = ${email}`)
    .limit(1);
  return account ?? null;
}

/**
 * Restituisce l'account associato all'indirizzo, creandolo in stato `pending`
 * se non esiste. Se esiste, non ne modifica NULLA: un account gia attivo non
 * deve essere toccato da una prenotazione altrui.
 */
export async function ensureShadowAccount(input: {
  email: string;
  createdVia?: "booking" | "admin";
  /** Nome dal form di prenotazione, usato SOLO alla creazione. */
  fullName?: string | null;
}): Promise<typeof customerAccountsTable.$inferSelect | null> {
  const email = normalizeAccountEmail(input.email);
  if (!email) return null;

  const existing = await findAccountByEmail(email);
  if (existing) return existing;

  // Il nome viene registrato solo qui, alla creazione: un account che esiste
  // gia non deve essere riscritto dalla prenotazione di un altro.
  const { firstName, lastName } = splitCustomerName(input.fullName);

  const [created] = await db
    .insert(customerAccountsTable)
    .values({
      email,
      status: "pending",
      createdVia: input.createdVia ?? "booking",
      firstName,
      lastName,
    })
    // Due prenotazioni simultanee con lo stesso indirizzo: la seconda non deve
    // fallire, deve semplicemente ritrovare la riga dell'altra.
    .onConflictDoNothing()
    .returning();

  return created ?? (await findAccountByEmail(email));
}

/**
 * Crea l'account ombra per una prenotazione appena registrata.
 *
 * Va chiamata alla CREAZIONE della prenotazione e non mentre si compone
 * un'email. Legarla alla costruzione dell'email lasciava senza account chi
 * pagava subito con carta, chi aveva totale zero e chi veniva inserito
 * dall'ufficio a pagamento avvenuto: quelle tre strade ricevono la ricevuta,
 * che il richiamo non lo conteneva. Il risultato era un vicolo cieco — nessun
 * account, e su /accedi la risposta generica "se l'indirizzo e registrato" per
 * un'email che non sarebbe mai partita.
 *
 * Non solleva e non attende: un intoppo qui non deve toccare la prenotazione,
 * che e gia registrata e vale di piu.
 */
export function ensureAccountForBooking(bookingId: string): void {
  void (async () => {
    try {
      const [booking] = await db
        .select({
          email: excursionBookingsTable.email,
          customerName: excursionBookingsTable.customerName,
        })
        .from(excursionBookingsTable)
        .where(eq(excursionBookingsTable.id, bookingId))
        .limit(1);
      if (!booking?.email) return;
      await ensureShadowAccount({
        email: booking.email,
        createdVia: "booking",
        fullName: booking.customerName,
      });
    } catch (error) {
      logger.warn(
        { err: error, bookingId },
        "Creazione dell'account area clienti fallita; la prenotazione non e toccata",
      );
    }
  })();
}

/**
 * Vero se la prenotazione risulta gia fra i viaggi di quell'account.
 */
async function alreadyLinked(input: {
  accountId: string;
  bookingId: string;
}): Promise<boolean> {
  const [row] = await db
    .select({ id: customerAccountBookingsTable.id })
    .from(customerAccountBookingsTable)
    .where(
      and(
        eq(customerAccountBookingsTable.accountId, input.accountId),
        eq(customerAccountBookingsTable.bookingId, input.bookingId),
        isNull(customerAccountBookingsTable.revokedAt),
      ),
    )
    .limit(1);
  return row !== undefined;
}

/**
 * Prepara il richiamo "attiva la tua area personale" per una prenotazione.
 *
 * Il token e di tipo `account_invite` ed e legato a QUESTA prenotazione: chi lo
 * consuma dimostra di aver ricevuto l'email e si vede collegare quella
 * prenotazione, e solo quella.
 *
 * Non solleva mai: un problema qui non deve impedire l'invio di una conferma di
 * prenotazione, che e informazione contrattuale.
 */
export async function prepareBookingInvite(
  bookingId: string,
): Promise<BookingInvite | null> {
  try {
    const [booking] = await db
      .select({
        id: excursionBookingsTable.id,
        email: excursionBookingsTable.email,
        customerName: excursionBookingsTable.customerName,
      })
      .from(excursionBookingsTable)
      .where(eq(excursionBookingsTable.id, bookingId))
      .limit(1);

    if (!booking?.email) return null;

    const account = await ensureShadowAccount({
      email: booking.email,
      createdVia: "booking",
      fullName: booking.customerName,
    });
    if (!account || account.status === "blocked") return null;
    // Un indirizzo che rimbalza non riceverebbe comunque il messaggio: inutile
    // emettere un token che nessuno potra usare.
    if (account.emailStatus === "bounced") return null;
    // Gia fra i suoi viaggi: il richiamo sarebbe rumore, e il token emesso
    // resterebbe valido per sette giorni senza servire a niente. Conta da
    // quando il richiamo sta in tutte le email della prenotazione e non solo
    // nella prima.
    if (await alreadyLinked({ accountId: account.id, bookingId: booking.id })) {
      return null;
    }

    const { token } = await issueCustomerAuthToken({
      accountId: account.id,
      purpose: "account_invite",
      bookingId: booking.id,
    });

    await recordAccountEvent({
      eventType: "invite_sent",
      accountId: account.id,
      detail: { bookingId: booking.id },
    });

    return {
      url: buildAccountAccessUrl(token),
      existingActiveAccount: account.status === "active",
    };
  } catch (error) {
    logger.warn(
      { err: error, bookingId },
      "Preparazione invito area clienti fallita; l'email prosegue senza il richiamo",
    );
    return null;
  }
}

/**
 * Blocchi testo e HTML del richiamo, o stringhe vuote se non c'e invito.
 * Restituirli gia formattati tiene i chiamanti liberi da condizionali.
 */
export function inviteSections(invite: BookingInvite | null): {
  text: string[];
  html: string;
} {
  if (!invite) return { text: [], html: "" };

  const title = invite.existingActiveAccount
    ? "Aggiungi questa prenotazione alla tua area personale"
    : "Attiva la tua area personale";
  const body = invite.existingActiveAccount
    ? "Ritrovi questo viaggio insieme agli altri, con pagamenti e scadenze."
    : "Un solo clic, senza password: tutti i tuoi viaggi, pagamenti e scadenze in un posto solo.";

  return {
    text: ["", `${title}: ${body}`, invite.url],
    html: `<div style="margin-top:28px;padding:16px 18px;background:#f2f7f7;border-radius:8px;">
       <p style="margin:0 0 6px;font-weight:600;color:#0b5b60;">${escapeHtml(title)}</p>
       <p style="margin:0 0 12px;font-size:14px;color:#41555c;">${escapeHtml(body)}</p>
       <a href="${escapeHtml(invite.url)}" style="display:inline-block;padding:10px 16px;background:#0b5b60;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px;">${escapeHtml(title)}</a>
     </div>`,
  };
}
