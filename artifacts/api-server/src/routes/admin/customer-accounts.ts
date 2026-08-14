import { Router } from "express";
import { db } from "@workspace/db";
import {
  customerAccountBookingsTable,
  customerAccountEventsTable,
  customerAccountsTable,
  excursionBookingsTable,
  excursionsTable,
} from "@workspace/db/schema";
import { and, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { enqueueAndDeliverNow } from "../../services/email-outbox";
import { buildMagicLinkEmail } from "../../services/customer-auth-emails";
import {
  TOKEN_TTL_MS,
  invalidateOtherTokens,
  issueCustomerAuthToken,
} from "../../services/customer-auth-token";
import { recordAccountEvent } from "../../services/customer-auth-throttle";
import { randomUUID } from "node:crypto";

// ---------------------------------------------------------------------------
// Strumenti di backoffice per gli account cliente.
//
// Servono al supporto telefonico: "non riesco a entrare", "non vedo il mio
// viaggio", "ho cambiato email". Sono le tre chiamate che arrivano davvero.
// ---------------------------------------------------------------------------

const router = Router();
const PAGE_SIZE = 20;

const UUID = /^[0-9a-f-]{36}$/i;

function actor(req: { session?: { adminUser?: { id: string } } }): string | null {
  return req.session?.adminUser?.id ?? null;
}

/**
 * Elenco account, con ricerca per email o nome.
 *
 * Autonomo e non annidato sotto i clienti: `customer_accounts.customer_id` e
 * nullable, quindi un account puo non essere raggiungibile passando
 * dall'anagrafica. Cercarlo sarebbe impossibile senza questa vista.
 */
router.get("/customer-accounts", async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const page = Math.max(1, Number(req.query.page) || 1);

  const filter = q
    ? or(
        ilike(customerAccountsTable.email, `%${q}%`),
        ilike(customerAccountsTable.firstName, `%${q}%`),
        ilike(customerAccountsTable.lastName, `%${q}%`),
      )
    : undefined;

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: customerAccountsTable.id,
        email: customerAccountsTable.email,
        firstName: customerAccountsTable.firstName,
        lastName: customerAccountsTable.lastName,
        status: customerAccountsTable.status,
        emailStatus: customerAccountsTable.emailStatus,
        createdVia: customerAccountsTable.createdVia,
        lastLoginAt: customerAccountsTable.lastLoginAt,
        createdAt: customerAccountsTable.createdAt,
        bookingCount: sql<number>`(
          select count(*)::int from customer_account_bookings cab
           where cab.account_id = ${customerAccountsTable.id}
             and cab.revoked_at is null
        )`,
      })
      .from(customerAccountsTable)
      .where(filter)
      .orderBy(desc(customerAccountsTable.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(customerAccountsTable)
      .where(filter),
  ]);

  res.json({ accounts: rows, total, page, pageSize: PAGE_SIZE });
});

/** Scheda completa: stato, prenotazioni collegate, ultimi eventi. */
router.get("/customer-accounts/:id", async (req, res) => {
  const { id } = req.params;
  if (!UUID.test(id)) {
    res.status(400).json({ error: "Identificativo non valido." });
    return;
  }

  const [account] = await db
    .select()
    .from(customerAccountsTable)
    .where(eq(customerAccountsTable.id, id))
    .limit(1);
  if (!account) {
    res.status(404).json({ error: "Account non trovato." });
    return;
  }

  const [bookings, events] = await Promise.all([
    db
      .select({
        linkId: customerAccountBookingsTable.id,
        bookingId: excursionBookingsTable.id,
        bookingCode: excursionBookingsTable.bookingCode,
        customerName: excursionBookingsTable.customerName,
        excursionName: excursionsTable.name,
        date: excursionsTable.date,
        linkedVia: customerAccountBookingsTable.linkedVia,
        linkedAt: customerAccountBookingsTable.linkedAt,
        linkedBy: customerAccountBookingsTable.linkedBy,
        revokedAt: customerAccountBookingsTable.revokedAt,
      })
      .from(customerAccountBookingsTable)
      .innerJoin(
        excursionBookingsTable,
        eq(excursionBookingsTable.id, customerAccountBookingsTable.bookingId),
      )
      .innerJoin(
        excursionsTable,
        eq(excursionsTable.id, excursionBookingsTable.excursionId),
      )
      .where(eq(customerAccountBookingsTable.accountId, id))
      .orderBy(desc(customerAccountBookingsTable.linkedAt)),
    db
      .select({
        id: customerAccountEventsTable.id,
        eventType: customerAccountEventsTable.eventType,
        ip: customerAccountEventsTable.ip,
        detail: customerAccountEventsTable.detail,
        createdAt: customerAccountEventsTable.createdAt,
      })
      .from(customerAccountEventsTable)
      .where(eq(customerAccountEventsTable.accountId, id))
      .orderBy(desc(customerAccountEventsTable.createdAt))
      .limit(50),
  ]);

  // La password non esiste in fase 1, ma il campo c'e: non deve mai uscire.
  const { passwordHash: _omesso, ...safe } = account;
  res.json({ account: safe, bookings, events });
});

/**
 * Reinvia il link di accesso.
 *
 * Il caso reale e il cliente al telefono che non trova l'email. Il messaggio
 * parte verso l'indirizzo registrato, MAI verso uno dettato a voce: cambiare
 * destinatario dell'accesso e un'operazione che non deve passare da qui.
 */
router.post("/customer-accounts/:id/resend-link", async (req, res) => {
  const { id } = req.params;
  if (!UUID.test(id)) {
    res.status(400).json({ error: "Identificativo non valido." });
    return;
  }

  const [account] = await db
    .select()
    .from(customerAccountsTable)
    .where(eq(customerAccountsTable.id, id))
    .limit(1);
  if (!account) {
    res.status(404).json({ error: "Account non trovato." });
    return;
  }
  if (account.status === "blocked") {
    res.status(409).json({
      error: "Account bloccato: sbloccalo prima di inviare un nuovo accesso.",
    });
    return;
  }

  const { token } = await issueCustomerAuthToken({
    accountId: account.id,
    purpose: "magic_link",
  });
  await enqueueAndDeliverNow({
    eventType: "account.magic-link",
    dedupeKey: `account:${account.id}:magic-link:${randomUUID()}`,
    message: buildMagicLinkEmail({
      to: account.email,
      token,
      ttlMs: TOKEN_TTL_MS.magic_link,
    }),
  });
  await recordAccountEvent({
    eventType: "invite_sent",
    accountId: account.id,
    detail: { by: actor(req), via: "admin" },
  });

  res.json({ ok: true, sentTo: account.email });
});

/** Blocca o sblocca l'accesso. */
router.post("/customer-accounts/:id/status", async (req, res) => {
  const { id } = req.params;
  const body = (req.body ?? {}) as { blocked?: unknown };
  if (!UUID.test(id) || typeof body.blocked !== "boolean") {
    res.status(400).json({ error: "Richiesta non valida." });
    return;
  }

  // Uno sblocco riporta a 'pending': l'account tornera 'active' al primo
  // accesso riuscito, cosi lo stato resta il riflesso di cio che e successo.
  const nuovo = body.blocked ? "blocked" : "pending";
  const [updated] = await db
    .update(customerAccountsTable)
    .set({ status: nuovo, updatedAt: new Date() })
    .where(eq(customerAccountsTable.id, id))
    .returning({ id: customerAccountsTable.id, status: customerAccountsTable.status });

  if (!updated) {
    res.status(404).json({ error: "Account non trovato." });
    return;
  }

  await recordAccountEvent({
    eventType: body.blocked ? "blocked" : "unblocked",
    accountId: id,
    detail: { by: actor(req) },
  });

  res.json({ ok: true, status: updated.status });
});

/**
 * Collega manualmente una prenotazione a un account.
 *
 * E' l'ultima risorsa, per i casi che nemmeno il link email risolve: cliente
 * che ha cambiato casella, prenotazione inserita a mano dall'ufficio senza
 * indirizzo. Resta tracciato con `linked_via: 'admin'` e l'identificativo di
 * chi l'ha deciso, perche e l'unico collegamento che non porta con se una
 * prova di possesso.
 */
router.post("/customer-accounts/:id/bookings", async (req, res) => {
  const { id } = req.params;
  const body = (req.body ?? {}) as { bookingCode?: unknown };
  const code =
    typeof body.bookingCode === "string" ? body.bookingCode.trim() : "";

  if (!UUID.test(id) || !code) {
    res.status(400).json({ error: "Indica il codice della prenotazione." });
    return;
  }

  const [account] = await db
    .select({ id: customerAccountsTable.id })
    .from(customerAccountsTable)
    .where(eq(customerAccountsTable.id, id))
    .limit(1);
  if (!account) {
    res.status(404).json({ error: "Account non trovato." });
    return;
  }

  // Si cerca per codice leggibile, quello che il cliente detta al telefono.
  const [booking] = await db
    .select({ id: excursionBookingsTable.id })
    .from(excursionBookingsTable)
    .where(ilike(excursionBookingsTable.bookingCode, code))
    .limit(1);
  if (!booking) {
    res.status(404).json({ error: `Nessuna prenotazione con codice ${code}.` });
    return;
  }

  const inserted = await db
    .insert(customerAccountBookingsTable)
    .values({
      accountId: id,
      bookingId: booking.id,
      linkedVia: "admin",
      linkedBy: actor(req),
    })
    .onConflictDoNothing()
    .returning({ id: customerAccountBookingsTable.id });

  if (inserted.length === 0) {
    // Puo essere un collegamento revocato in precedenza: riattivarlo e piu
    // utile che rispondere "esiste gia" e lasciare l'operatore senza strada.
    await db
      .update(customerAccountBookingsTable)
      .set({ revokedAt: null, linkedVia: "admin", linkedBy: actor(req) })
      .where(
        and(
          eq(customerAccountBookingsTable.accountId, id),
          eq(customerAccountBookingsTable.bookingId, booking.id),
        ),
      );
  }

  await recordAccountEvent({
    eventType: "booking_linked",
    accountId: id,
    detail: { bookingId: booking.id, via: "admin", by: actor(req) },
  });

  res.json({ ok: true, bookingId: booking.id });
});

/** Revoca un collegamento. Non cancella la riga: resta lo storico. */
router.delete("/customer-accounts/:id/bookings/:linkId", async (req, res) => {
  const { id, linkId } = req.params;
  if (!UUID.test(id) || !UUID.test(linkId)) {
    res.status(400).json({ error: "Identificativo non valido." });
    return;
  }

  const [revoked] = await db
    .update(customerAccountBookingsTable)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(customerAccountBookingsTable.id, linkId),
        eq(customerAccountBookingsTable.accountId, id),
        isNull(customerAccountBookingsTable.revokedAt),
      ),
    )
    .returning({ bookingId: customerAccountBookingsTable.bookingId });

  if (!revoked) {
    res.status(404).json({ error: "Collegamento non trovato o gia revocato." });
    return;
  }

  await recordAccountEvent({
    eventType: "booking_link_revoked",
    accountId: id,
    detail: { bookingId: revoked.bookingId, by: actor(req) },
  });

  res.json({ ok: true });
});

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Cambia l'indirizzo di accesso di un account.
 *
 * E' il percorso di recupero per un indirizzo che rimbalza: senza password,
 * un account la cui casella non riceve piu e definitivamente irraggiungibile,
 * e questa e l'unica via d'uscita.
 *
 * Proprio per questo e anche l'operazione piu delicata del backoffice: chi la
 * esegue prende di fatto il controllo dell'account. Va usata solo dopo aver
 * verificato l'identita di chi chiama, e resta tracciata con il vecchio e il
 * nuovo indirizzo.
 *
 * L'account torna a 'pending' e perde la verifica: il nuovo indirizzo dovra
 * dimostrarsi valido ricevendo un link, esattamente come il primo.
 */
router.post("/customer-accounts/:id/email", async (req, res) => {
  const { id } = req.params;
  const body = (req.body ?? {}) as { email?: unknown };
  const nuova =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

  if (!UUID.test(id) || !nuova || !EMAIL_PATTERN.test(nuova)) {
    res.status(400).json({ error: "Indirizzo email non valido." });
    return;
  }

  const [account] = await db
    .select()
    .from(customerAccountsTable)
    .where(eq(customerAccountsTable.id, id))
    .limit(1);
  if (!account) {
    res.status(404).json({ error: "Account non trovato." });
    return;
  }
  if (account.email.trim().toLowerCase() === nuova) {
    res.status(409).json({ error: "E' gia l'indirizzo attuale." });
    return;
  }

  // L'indice unico lo impedirebbe comunque, ma un 500 non direbbe all'operatore
  // cosa e successo.
  const [occupato] = await db
    .select({ id: customerAccountsTable.id })
    .from(customerAccountsTable)
    .where(sql`lower(btrim(${customerAccountsTable.email})) = ${nuova}`)
    .limit(1);
  if (occupato) {
    res.status(409).json({
      error: "Esiste gia un account con questo indirizzo.",
    });
    return;
  }

  const precedente = account.email;
  await db
    .update(customerAccountsTable)
    .set({
      email: nuova,
      emailStatus: "unknown",
      emailBouncedAt: null,
      emailVerifiedAt: null,
      status: "pending",
      updatedAt: new Date(),
    })
    .where(eq(customerAccountsTable.id, id));

  await recordAccountEvent({
    eventType: "profile_updated",
    accountId: id,
    detail: { campo: "email", da: precedente, a: nuova, by: actor(req) },
  });

  // I link gia emessi puntano al vecchio proprietario della casella: vanno
  // chiusi prima di aprirne uno nuovo.
  await invalidateOtherTokens({ accountId: id, purpose: "magic_link" });

  const { token } = await issueCustomerAuthToken({
    accountId: id,
    purpose: "magic_link",
  });
  await enqueueAndDeliverNow({
    eventType: "account.magic-link",
    dedupeKey: `account:${id}:magic-link:${randomUUID()}`,
    message: buildMagicLinkEmail({
      to: nuova,
      token,
      ttlMs: TOKEN_TTL_MS.magic_link,
    }),
  });

  res.json({ ok: true, email: nuova });
});

export default router;
