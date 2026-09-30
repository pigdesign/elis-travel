import { randomUUID } from "node:crypto";
import { db } from "@workspace/db";
import {
  customerAccountBookingsTable,
  customerAccountEventsTable,
  customerAccountsTable,
  excursionBookingsTable,
  excursionsTable,
  normalizeAccountEmail,
} from "@workspace/db/schema";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { logger } from "../lib/logger";
import {
  buildAccountAccessUrl,
  buildBookingInviteEmail,
} from "./customer-auth-emails";
import { escapeHtml } from "./email-layout";
import { enqueueAndDeliverNow } from "./email-outbox";
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
 * Collega la prenotazione appena creata a chi era gia dentro l'area clienti.
 *
 * E l'unica strada automatica, e non contraddice la regola in cima al file: li
 * si rifiuta di dedurre il proprietario da un'email digitata in un modulo,
 * qui la prova di possesso esiste gia prima della prenotazione — la sessione e
 * aperta perche quella persona ha dimostrato di controllare quella casella,
 * con lo stesso clic che fa fede per l'invito.
 *
 * Due condizioni, entrambe necessarie:
 *
 *  - l'email della prenotazione deve coincidere con quella dell'account. Senza
 *    questo confronto chi prenota per la madre mettendo l'indirizzo di lei si
 *    vedrebbe comparire fra i propri viaggi una prenotazione che la conferma
 *    manda a un'altra persona;
 *  - l'account deve risultare ATTIVO adesso, riletto dal database. La sessione
 *    dura novanta giorni e non puo essere l'unica fonte di verita: nel
 *    frattempo l'account puo essere stato bloccato dal backoffice.
 *
 * Il confronto e con l'email che l'account ha ORA, non con quella salvata nella
 * sessione al momento dell'accesso: se il backoffice l'ha corretta, fa fede la
 * riga, non una copia vecchia di mesi.
 *
 * Va attesa prima di comporre le email: `prepareBookingInvite` salta l'invito
 * quando la prenotazione risulta gia collegata, quindi collegare prima evita di
 * spedire un richiamo che non serve piu.
 *
 * Non solleva mai: un intoppo qui non deve toccare la prenotazione, che e gia
 * registrata e vale di piu. Al massimo il cliente si ritrova l'invito per email
 * e la collega con un clic, cioe il comportamento di prima.
 */
export async function linkBookingToSessionAccount(input: {
  bookingId: string;
  accountId: string;
  ip?: string | null;
}): Promise<boolean> {
  try {
    const [booking] = await db
      .select({ email: excursionBookingsTable.email })
      .from(excursionBookingsTable)
      .where(eq(excursionBookingsTable.id, input.bookingId))
      .limit(1);
    if (!booking?.email) return false;

    const [account] = await db
      .select({
        email: customerAccountsTable.email,
        status: customerAccountsTable.status,
      })
      .from(customerAccountsTable)
      .where(eq(customerAccountsTable.id, input.accountId))
      .limit(1);
    if (!account || account.status !== "active") return false;

    if (
      normalizeAccountEmail(booking.email) !==
      normalizeAccountEmail(account.email)
    ) {
      return false;
    }

    // `unique(account_id, booking_id)` rende l'operazione idempotente: se la
    // prenotazione fosse gia collegata non serve distinguere il caso.
    const inserted = await db
      .insert(customerAccountBookingsTable)
      .values({
        accountId: input.accountId,
        bookingId: input.bookingId,
        linkedVia: "session",
      })
      .onConflictDoNothing()
      .returning({ id: customerAccountBookingsTable.id });

    if (inserted.length === 0) return false;

    await recordAccountEvent({
      eventType: "booking_linked",
      accountId: input.accountId,
      ip: input.ip ?? null,
      detail: { bookingId: input.bookingId, via: "session" },
    });
    return true;
  } catch (error) {
    logger.warn(
      { err: error, bookingId: input.bookingId },
      "Collegamento automatico alla sessione fallito; resta l'invito via email",
    );
    return false;
  }
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

// ---------------------------------------------------------------------------
// Stato dell'area clienti visto dalla singola prenotazione.
//
// Serve al backoffice: chi e al telefono col cliente deve sapere se quella
// gita e gia fra i suoi viaggi o se il richiamo e rimasto per aria, senza
// aprire un'altra pagina e senza doverlo dedurre.
// ---------------------------------------------------------------------------

export type BookingCustomerAreaState = {
  /** Null quando la prenotazione non ha email: senza, nessun account esiste. */
  accountId: string | null;
  email: string | null;
  accountStatus: string | null;
  /** 'bounced' significa che ogni invito e destinato a tornare indietro. */
  emailStatus: string | null;
  linked: boolean;
  linkedVia: string | null;
  linkedAt: string | null;
  /** Ultimo invito emesso PER QUESTA prenotazione, non per l'account. */
  lastInviteAt: string | null;
};

export async function getBookingCustomerAreaState(
  bookingId: string,
): Promise<BookingCustomerAreaState> {
  const vuoto: BookingCustomerAreaState = {
    accountId: null,
    email: null,
    accountStatus: null,
    emailStatus: null,
    linked: false,
    linkedVia: null,
    linkedAt: null,
    lastInviteAt: null,
  };

  const [booking] = await db
    .select({ email: excursionBookingsTable.email })
    .from(excursionBookingsTable)
    .where(eq(excursionBookingsTable.id, bookingId))
    .limit(1);
  if (!booking?.email) return vuoto;

  const email = normalizeAccountEmail(booking.email);
  const account = await findAccountByEmail(email);
  if (!account) return { ...vuoto, email };

  // Il collegamento si cerca per prenotazione e non per account: la stessa
  // gita puo essere nei viaggi di piu account (marito e moglie), e qui
  // interessa quello dell'indirizzo che compare sulla prenotazione.
  const [link] = await db
    .select({
      linkedVia: customerAccountBookingsTable.linkedVia,
      linkedAt: customerAccountBookingsTable.linkedAt,
    })
    .from(customerAccountBookingsTable)
    .where(
      and(
        eq(customerAccountBookingsTable.accountId, account.id),
        eq(customerAccountBookingsTable.bookingId, bookingId),
        isNull(customerAccountBookingsTable.revokedAt),
      ),
    )
    .limit(1);

  const [invite] = await db
    .select({ createdAt: customerAccountEventsTable.createdAt })
    .from(customerAccountEventsTable)
    .where(
      and(
        eq(customerAccountEventsTable.accountId, account.id),
        eq(customerAccountEventsTable.eventType, "invite_sent"),
        sql`${customerAccountEventsTable.detail}->>'bookingId' = ${bookingId}`,
      ),
    )
    .orderBy(desc(customerAccountEventsTable.createdAt))
    .limit(1);

  return {
    accountId: account.id,
    email: account.email,
    accountStatus: account.status,
    emailStatus: account.emailStatus,
    linked: link !== undefined,
    linkedVia: link?.linkedVia ?? null,
    linkedAt: link?.linkedAt?.toISOString() ?? null,
    lastInviteAt: invite?.createdAt?.toISOString() ?? null,
  };
}

export type SendBookingInviteOutcome =
  | "sent"
  | "no_email"
  | "already_linked"
  | "blocked"
  | "bounced";

/**
 * Manda al cliente il richiamo per collegare QUESTA prenotazione.
 *
 * Non e lo stesso di un magic link: quello fa entrare nell'area ma non porta
 * con se nessuna gita. Qui il token e di tipo 'account_invite' ed e legato
 * alla prenotazione, quindi un clic la mette fra i suoi viaggi.
 *
 * Gli esiti diversi da 'sent' non sono errori ma risposte: al backoffice va
 * detto perche non e partito nulla, altrimenti l'operatore riprova a vuoto.
 */
export async function sendBookingInviteEmail(
  bookingId: string,
): Promise<SendBookingInviteOutcome> {
  const stato = await getBookingCustomerAreaState(bookingId);
  if (!stato.email) return "no_email";
  if (stato.linked) return "already_linked";
  if (stato.accountStatus === "blocked") return "blocked";
  if (stato.emailStatus === "bounced") return "bounced";

  // prepareBookingInvite emette il token e registra l'evento 'invite_sent':
  // usarlo qui tiene una sola strada per creare inviti, con le stesse guardie.
  const invite = await prepareBookingInvite(bookingId);
  if (!invite) return "already_linked";

  const [riga] = await db
    .select({ excursionName: excursionsTable.name })
    .from(excursionBookingsTable)
    .innerJoin(
      excursionsTable,
      eq(excursionsTable.id, excursionBookingsTable.excursionId),
    )
    .where(eq(excursionBookingsTable.id, bookingId))
    .limit(1);

  await enqueueAndDeliverNow({
    eventType: "account.booking-invite",
    // Chiave casuale per invio: l'operatore che rimanda il richiamo perche il
    // cliente non l'ha ricevuto non deve vederselo scartare dalla
    // deduplicazione dell'outbox.
    dedupeKey: `booking:${bookingId}:invite:${randomUUID()}`,
    message: buildBookingInviteEmail({
      to: stato.email,
      url: invite.url,
      excursionName: riga?.excursionName ?? null,
      existingActiveAccount: invite.existingActiveAccount,
    }),
  });

  return "sent";
}
