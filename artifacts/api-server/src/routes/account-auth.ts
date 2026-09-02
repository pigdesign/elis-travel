import { randomUUID } from "node:crypto";
import { Router, type Request } from "express";
import { db } from "@workspace/db";
import {
  customerAccountBookingsTable,
  customerAccountsTable,
  excursionBookingsTable,
  normalizeAccountEmail,
} from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import { logger } from "../lib/logger";
import { requireCustomer } from "../middlewares/requireCustomer";
import { enqueueAndDeliverNow } from "../services/email-outbox";
import {
  buildMagicLinkEmail,
} from "../services/customer-auth-emails";
import {
  TOKEN_TTL_MS,
  consumeCustomerAuthToken,
  invalidateOtherTokens,
  issueCustomerAuthToken,
} from "../services/customer-auth-token";
import {
  checkMagicLinkThrottle,
  checkPasswordLoginThrottle,
  recordAccountEvent,
} from "../services/customer-auth-throttle";
import {
  checkPasswordPolicy,
  hashPassword,
  verifyPassword,
} from "../services/customer-password";
import {
  isBookingScope,
  listAccountBookings,
} from "../services/account-bookings";
import { splitCustomerName } from "../services/customer-name";

const router = Router();

// Stessa postura del portale prenotazione: niente cache intermedia e nessun
// referrer in uscita, perche queste risposte parlano di un account preciso.
router.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  next();
});

// Risposta unica per ogni esito della richiesta di accesso. Non deve mai
// lasciar capire se l'indirizzo e registrato: e cio che impedisce di usare il
// form come oracolo per scoprire i clienti dell'agenzia.
const GENERIC_MAGIC_LINK_REPLY = {
  ok: true,
  message:
    "Se l'indirizzo e registrato, riceverai un'email con il link di accesso.",
} as const;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function clientIp(req: Request): string | null {
  // `trust proxy` e attivo, quindi req.ip tiene gia conto di X-Forwarded-For.
  return req.ip ?? null;
}

function readEmail(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const raw = (body as Record<string, unknown>).email;
  if (typeof raw !== "string") return null;
  const normalized = normalizeAccountEmail(raw);
  if (normalized.length > 320 || !EMAIL_PATTERN.test(normalized)) return null;
  return normalized;
}

function accountSummary(account: {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  mobile: string | null;
  status: string;
  lastLoginAt: Date | null;
  passwordHash: string | null;
}) {
  return {
    id: account.id,
    email: account.email,
    firstName: account.firstName,
    lastName: account.lastName,
    phone: account.phone,
    mobile: account.mobile,
    status: account.status,
    lastLoginAt: account.lastLoginAt,
    // Solo il fatto che esista, mai l'hash: serve all'interfaccia per sapere
    // se offrire "cambia password" o "imposta una password".
    hasPassword: account.passwordHash !== null,
  };
}

/**
 * Apre la sessione dell'area clienti per un account gia verificato.
 *
 * La rigenerazione dell'identificativo prima di scriverci dentro non e
 * facoltativa: senza, un identificativo noto all'attaccante prima del login
 * resterebbe valido dopo (session fixation).
 */
async function openCustomerSession(
  req: Request,
  account: { id: string; email: string },
  via: "magic_link" | "password",
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    req.session.regenerate((err) => (err ? reject(err) : resolve()));
  });
  req.session.customerAccount = {
    accountId: account.id,
    email: account.email,
    via,
  };
  await new Promise<void>((resolve, reject) => {
    req.session.save((err) => (err ? reject(err) : resolve()));
  });
}

/**
 * Richiesta di magic link.
 *
 * La risposta e sempre la stessa e non attende l'invio: sia per non tenere
 * fermo l'utente, sia perche un tempo di risposta diverso fra account esistente
 * e inesistente rivelerebbe cio che il messaggio generico nasconde.
 */
router.post("/account/magic-link", async (req, res) => {
  const email = readEmail(req.body);
  const ip = clientIp(req);

  if (!email) {
    res.status(400).json({ error: "Indirizzo email non valido." });
    return;
  }

  // Registrato PRIMA di ogni verifica: cosi anche i tentativi su indirizzi
  // inesistenti pesano sul limite, che e il punto dell'intera difesa.
  await recordAccountEvent({
    eventType: "magic_link_requested",
    email,
    ip,
  });

  const throttle = await checkMagicLinkThrottle({ email, ip });
  if (!throttle.allowed) {
    if (throttle.blockedBy === "ip") {
      // Un limite per IP non dice nulla su un account specifico: qui possiamo
      // essere espliciti senza rivelare niente.
      res.status(429).json({
        error: "Troppe richieste da questa connessione. Riprova tra 15 minuti.",
      });
      return;
    }
    // Limite per indirizzo: risposta identica al caso normale.
    logger.info({ ip }, "Magic link non inviato: limite per indirizzo");
    res.json(GENERIC_MAGIC_LINK_REPLY);
    return;
  }

  try {
    const [account] = await db
      .select()
      .from(customerAccountsTable)
      // Confronto sull'espressione normalizzata, la stessa dell'indice unico:
      // un `eq` diretto non troverebbe una riga salvata con maiuscole o spazi,
      // e sarebbe anche l'unico modo per NON usare l'indice.
      .where(
        sql`lower(btrim(${customerAccountsTable.email})) = ${email}`,
      )
      .limit(1);

    const deliverable =
      account &&
      account.status !== "blocked" &&
      account.emailStatus !== "bounced";

    if (deliverable) {
      const { token } = await issueCustomerAuthToken({
        accountId: account.id,
        purpose: "magic_link",
        requestedIp: ip,
      });
      await enqueueAndDeliverNow({
        eventType: "account.magic-link",
        // Una chiave per richiesta: ogni magic link e un messaggio distinto e
        // la deduplicazione dell'outbox non deve sopprimere il secondo
        // tentativo di chi non ha ricevuto il primo.
        //
        // Il suffisso e casuale e non un timestamp: con Date.now() due
        // richieste nello stesso millisecondo producono la stessa chiave e la
        // seconda email viene scartata senza errore. Non e teorico, si e visto
        // nella prova end-to-end (3 token emessi, 2 email accodate).
        dedupeKey: `account:${account.id}:magic-link:${randomUUID()}`,
        message: buildMagicLinkEmail({
          to: account.email,
          token,
          ttlMs: TOKEN_TTL_MS.magic_link,
        }),
      });
    } else if (account) {
      logger.info(
        { accountId: account.id, status: account.status },
        "Magic link non inviato: account bloccato o indirizzo non recapitabile",
      );
    }
  } catch (error) {
    // Nemmeno un errore interno deve cambiare la risposta osservabile.
    logger.error({ err: error }, "Richiesta magic link fallita");
  }

  res.json(GENERIC_MAGIC_LINK_REPLY);
});

/**
 * Consumo del magic link o dell'invito: attiva l'account e apre la sessione.
 */
router.post("/account/magic-link/consume", async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const token = typeof body.token === "string" ? body.token.trim() : "";
  const ip = clientIp(req);

  if (!token || token.length > 512) {
    res.status(400).json({ error: "Link di accesso non valido." });
    return;
  }

  // Un solo endpoint per entrambi gli scopi: chi clicca non sa (e non deve
  // sapere) se il link ricevuto era un accesso o un invito.
  const consumed =
    (await consumeCustomerAuthToken({ token, purpose: "magic_link" })) ??
    (await consumeCustomerAuthToken({ token, purpose: "account_invite" }));

  if (!consumed) {
    await recordAccountEvent({ eventType: "magic_link_failed", ip });
    res.status(400).json({
      error:
        "Link non valido o scaduto. Richiedine uno nuovo dalla pagina di accesso.",
    });
    return;
  }

  const [account] = await db
    .select()
    .from(customerAccountsTable)
    .where(eq(customerAccountsTable.id, consumed.accountId))
    .limit(1);

  if (!account || account.status === "blocked") {
    await recordAccountEvent({
      eventType: "magic_link_failed",
      accountId: consumed.accountId,
      ip,
    });
    res.status(403).json({
      error: "Questo account non e attivo. Contatta l'agenzia.",
    });
    return;
  }

  const now = new Date();
  const [updated] = await db
    .update(customerAccountsTable)
    .set({
      status: "active",
      // Il possesso del link prova il controllo della casella: e esattamente
      // cio che la verifica dell'indirizzo deve accertare.
      emailVerifiedAt: account.emailVerifiedAt ?? now,
      emailStatus:
        account.emailStatus === "bounced" ? "unknown" : account.emailStatus,
      emailBouncedAt: account.emailStatus === "bounced" ? null : account.emailBouncedAt,
      lastLoginAt: now,
      updatedAt: now,
    })
    .where(eq(customerAccountsTable.id, account.id))
    .returning();

  // Un invito nasce da una prenotazione e autorizza QUELLA prenotazione: e la
  // prova di possesso circoscritta a un oggetto preciso.
  if (consumed.bookingId) {
    await db
      .insert(customerAccountBookingsTable)
      .values({
        accountId: account.id,
        bookingId: consumed.bookingId,
        linkedVia: "invite_token",
      })
      .onConflictDoNothing();

    // Se l'account non ha ancora un nome, lo prende dalla prenotazione appena
    // collegata: serve a rivolgersi al cliente per nome invece che con
    // un'etichetta generica. Riempie solo i campi vuoti, non sovrascrive mai
    // un profilo gia compilato.
    if (!account.firstName && !account.lastName) {
      const [linkedBooking] = await db
        .select({ customerName: excursionBookingsTable.customerName })
        .from(excursionBookingsTable)
        .where(eq(excursionBookingsTable.id, consumed.bookingId))
        .limit(1);
      const nome = splitCustomerName(linkedBooking?.customerName);
      if (nome.firstName) {
        await db
          .update(customerAccountsTable)
          .set({ ...nome, updatedAt: new Date() })
          .where(eq(customerAccountsTable.id, account.id));
      }
    }
    await recordAccountEvent({
      eventType: "booking_linked",
      accountId: account.id,
      ip,
      detail: { bookingId: consumed.bookingId, via: "invite_token" },
    });
  }

  await invalidateOtherTokens({
    accountId: account.id,
    purpose: "magic_link",
    exceptTokenId: consumed.id,
  });

  await openCustomerSession(req, account, "magic_link");

  await recordAccountEvent({
    eventType: "magic_link_consumed",
    accountId: account.id,
    ip,
  });
  await recordAccountEvent({
    eventType: "login",
    accountId: account.id,
    ip,
  });

  res.json({ account: accountSummary(updated ?? account) });
});

/**
 * Accesso con email e password.
 *
 * E una comodita aggiunta, non la via principale: la password si puo impostare
 * solo da dentro una sessione gia aperta, quindi chi arriva qui l'ha scelta
 * deliberatamente. Chi non l'ha impostata usa il link, e chi l'ha dimenticata
 * pure — il link e anche il recupero, e per questo non esiste un "password
 * dimenticata" separato.
 */
router.post("/account/login", async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const email = readEmail(body);
  const password = typeof body.password === "string" ? body.password : "";
  const ip = clientIp(req);

  if (!email || !password) {
    res.status(400).json({ error: "Email e password sono obbligatori." });
    return;
  }

  const throttle = await checkPasswordLoginThrottle({ email, ip });
  if (!throttle.allowed) {
    // Qui, a differenza del magic link, dirlo non rivela niente: il limite
    // conta i FALLIMENTI, e fallisce anche chi prova un indirizzo inesistente.
    res.status(429).json({
      error: "Troppi tentativi. Riprova tra 15 minuti.",
    });
    return;
  }

  const [account] = await db
    .select()
    .from(customerAccountsTable)
    .where(sql`lower(btrim(${customerAccountsTable.email})) = ${email}`)
    .limit(1);

  // Il confronto si fa SEMPRE, anche senza account e anche senza password
  // impostata: verifyPassword lavora su un hash fittizio quando non ne ha uno
  // vero, cosi il tempo di risposta non distingue un indirizzo registrato da
  // uno inventato. Senza, il form di accesso tornerebbe a essere l'oracolo che
  // il messaggio generico del magic link serve a evitare.
  const passwordOk = await verifyPassword(
    password,
    account?.passwordHash ?? null,
  );

  if (!account || account.status !== "active" || !passwordOk) {
    await recordAccountEvent({
      eventType: "password_login_failed",
      accountId: account?.id ?? null,
      email,
      ip,
    });
    res.status(401).json({ error: "Email o password non corretti." });
    return;
  }

  const now = new Date();
  const [updated] = await db
    .update(customerAccountsTable)
    .set({ lastLoginAt: now, updatedAt: now })
    .where(eq(customerAccountsTable.id, account.id))
    .returning();

  await openCustomerSession(req, account, "password");
  await recordAccountEvent({ eventType: "login", accountId: account.id, ip });

  res.json({ account: accountSummary(updated ?? account) });
});

/**
 * Chiude le altre sessioni dello stesso account.
 *
 * Cambiare password senza questo passaggio non servirebbe a niente nel caso
 * che conta: chi ha lasciato la sessione aperta su un computer altrui la
 * ritroverebbe valida per i novanta giorni successivi.
 */
async function revokeOtherSessions(input: {
  accountId: string;
  keepSid: string;
}): Promise<void> {
  try {
    await db.execute(sql`
      DELETE FROM customer_sessions
      WHERE sess -> 'customerAccount' ->> 'accountId' = ${input.accountId}
        AND sid <> ${input.keepSid}
    `);
  } catch (error) {
    // La password e comunque cambiata: un errore qui non deve far fallire
    // l'operazione, ma deve lasciare traccia.
    logger.error({ err: error }, "Revoca delle altre sessioni cliente fallita");
  }
}

/**
 * Imposta o cambia la password.
 *
 * La password attuale viene chiesta solo a chi e entrato CON la password.
 * Chi e entrato dal link ha appena dimostrato di possedere la casella, che e
 * una prova piu forte — ed e esattamente la persona che la password l'ha
 * dimenticata: pretenderla da lei significherebbe non avere nessun modo di
 * cambiarla.
 */
router.post("/account/password", requireCustomer, async (req, res) => {
  const account = req.customerAccount!;
  const body = (req.body ?? {}) as Record<string, unknown>;
  const password = body.password;
  const currentPassword =
    typeof body.currentPassword === "string" ? body.currentPassword : "";

  const mustProveCurrent =
    account.passwordHash !== null &&
    req.session.customerAccount?.via === "password";

  if (mustProveCurrent) {
    const ok = await verifyPassword(currentPassword, account.passwordHash);
    if (!ok) {
      res.status(403).json({ error: "La password attuale non e corretta." });
      return;
    }
  }

  const policy = checkPasswordPolicy(password);
  if (!policy.ok) {
    res.status(400).json({ error: policy.error });
    return;
  }

  const now = new Date();
  await db
    .update(customerAccountsTable)
    .set({ passwordHash: await hashPassword(password as string), updatedAt: now })
    .where(eq(customerAccountsTable.id, account.id));

  await revokeOtherSessions({
    accountId: account.id,
    keepSid: req.sessionID,
  });
  // Da adesso questa sessione vale quanto una aperta con la password: chi la
  // usa ha appena dimostrato di conoscerla.
  if (req.session.customerAccount) {
    req.session.customerAccount.via = "password";
  }

  await recordAccountEvent({
    eventType: "password_set",
    accountId: account.id,
    ip: clientIp(req),
  });

  res.json({ ok: true, hasPassword: true });
});

/**
 * Rimuove la password e torna al solo accesso con link.
 */
router.delete("/account/password", requireCustomer, async (req, res) => {
  const account = req.customerAccount!;

  if (account.passwordHash === null) {
    res.json({ ok: true, hasPassword: false });
    return;
  }

  await db
    .update(customerAccountsTable)
    .set({ passwordHash: null, updatedAt: new Date() })
    .where(eq(customerAccountsTable.id, account.id));

  await revokeOtherSessions({
    accountId: account.id,
    keepSid: req.sessionID,
  });
  if (req.session.customerAccount) {
    req.session.customerAccount.via = "magic_link";
  }

  await recordAccountEvent({
    eventType: "password_removed",
    accountId: account.id,
    ip: clientIp(req),
  });

  res.json({ ok: true, hasPassword: false });
});

router.post("/account/logout", async (req, res) => {
  const accountId = req.session?.customerAccount?.accountId ?? null;
  req.session.destroy((err) => {
    if (err) {
      res.status(500).json({ error: "Errore durante l'uscita." });
      return;
    }
    res.clearCookie("elis.cust");
    res.json({ ok: true });
  });
  if (accountId) {
    await recordAccountEvent({ eventType: "logout", accountId });
  }
});

router.get("/account/me", requireCustomer, (req, res) => {
  res.json({ account: accountSummary(req.customerAccount!) });
});

/**
 * Elenco dei viaggi dell'account.
 *
 * Senza `scope` restituisce tutto: la panoramica ha bisogno dell'insieme
 * completo per calcolare "cosa manca" senza fare tre chiamate.
 */
router.get("/account/bookings", requireCustomer, async (req, res) => {
  const raw = req.query.scope;
  if (raw !== undefined && !isBookingScope(raw)) {
    res.status(400).json({
      error: "Filtro non valido. Valori ammessi: upcoming, past, cancelled.",
    });
    return;
  }

  const bookings = await listAccountBookings({
    accountId: req.customerAccount!.id,
    scope: raw,
  });
  res.json({ bookings });
});

export default router;
