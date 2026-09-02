import { createHash } from "node:crypto";
import { db } from "@workspace/db";
import {
  customerAccountEventsTable,
  normalizeAccountEmail,
  type CustomerAccountEventType,
} from "@workspace/db/schema";
import { sql } from "drizzle-orm";
import { logger } from "../lib/logger";

// ---------------------------------------------------------------------------
// Limiti di frequenza per le richieste di magic link.
//
// Il conteggio sta su customer_account_events, cioe sul database: il
// MemoryStore usato da express-rate-limit si azzera a ogni deploy e vive per
// singolo processo, e questa e l'unica difesa contro l'enumerazione degli
// indirizzi registrati e contro l'uso del form per tempestare di email una
// persona. E precisamente la difesa che non puo stare in memoria.
// ---------------------------------------------------------------------------

export const MAGIC_LINK_LIMITS = {
  perEmailPerHour: 3,
  perEmailPerDay: 10,
  perIpPerQuarterHour: 10,
} as const;

export const WINDOWS_MS = {
  hour: 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
  quarterHour: 15 * 60 * 1000,
} as const;

export type ThrottleDecision = {
  allowed: boolean;
  // 'email' → non si invia ma si risponde come sempre: dire all'utente che e
  // stato superato un limite su QUELL'indirizzo rivelerebbe che esiste.
  // 'ip'    → si puo rispondere 429, non rivela nulla su un account preciso.
  blockedBy: "email" | "ip" | null;
};

/**
 * Decisione pura: separata dalle query per poterla verificare senza database.
 */
export function magicLinkThrottleDecision(counts: {
  emailLastHour: number;
  emailLastDay: number;
  ipLastQuarterHour: number;
}): ThrottleDecision {
  if (counts.ipLastQuarterHour >= MAGIC_LINK_LIMITS.perIpPerQuarterHour) {
    return { allowed: false, blockedBy: "ip" };
  }
  if (
    counts.emailLastHour >= MAGIC_LINK_LIMITS.perEmailPerHour ||
    counts.emailLastDay >= MAGIC_LINK_LIMITS.perEmailPerDay
  ) {
    return { allowed: false, blockedBy: "email" };
  }
  return { allowed: true, blockedBy: null };
}

/**
 * Hash dell'indirizzo. Conservare l'email in chiaro negli eventi
 * moltiplicherebbe i posti da cui puo uscire: per contare basta l'impronta.
 */
export function hashEmailForEvents(email: string): string {
  return createHash("sha256").update(normalizeAccountEmail(email)).digest("hex");
}

/**
 * Registra un evento di account. Non solleva mai: l'audit non deve poter far
 * fallire un'operazione andata a buon fine.
 */
export async function recordAccountEvent(input: {
  eventType: CustomerAccountEventType;
  accountId?: string | null;
  email?: string | null;
  ip?: string | null;
  detail?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    await db.insert(customerAccountEventsTable).values({
      accountId: input.accountId ?? null,
      eventType: input.eventType,
      emailHash: input.email ? hashEmailForEvents(input.email) : null,
      ip: input.ip ?? null,
      detail: input.detail ?? null,
    });
  } catch (error) {
    logger.warn(
      { err: error, eventType: input.eventType },
      "Registrazione evento account fallita",
    );
  }
}

type ThrottleCounts = {
  emailLastHour: number;
  emailLastDay: number;
  ipLastQuarterHour: number;
};

/**
 * I tre conteggi in UNA sola query.
 *
 * La versione con tre `Promise.all` sembrava piu elegante ma era un errore: il
 * pool applicativo ha `max: 3` connessioni (lib/db) e il job di manutenzione ne
 * tiene occupate mentre lavora, quindi tre query simultanee lo esaurivano e la
 * richiesta moriva in timeout dopo 5 secondi. Su un server carico ogni magic
 * link sarebbe finito in errore 500.
 *
 * Un solo giro con `FILTER` costa una connessione e una scansione, e la
 * finestra esterna (24 ore) contiene gia tutte le altre.
 */
async function countMagicLinkEvents(input: {
  emailHash: string;
  ip: string | null;
  now: Date;
}): Promise<ThrottleCounts> {
  const dayStart = new Date(input.now.getTime() - WINDOWS_MS.day);
  const hourStart = new Date(input.now.getTime() - WINDOWS_MS.hour);
  const quarterStart = new Date(
    input.now.getTime() - WINDOWS_MS.quarterHour,
  );

  const rows = await db.execute<ThrottleCounts>(sql`
    SELECT
      count(*) FILTER (
        WHERE email_hash = ${input.emailHash} AND created_at >= ${hourStart}
      )::int AS "emailLastHour",
      count(*) FILTER (
        WHERE email_hash = ${input.emailHash} AND created_at >= ${dayStart}
      )::int AS "emailLastDay",
      count(*) FILTER (
        WHERE ip = ${input.ip} AND created_at >= ${quarterStart}
      )::int AS "ipLastQuarterHour"
    FROM customer_account_events
    WHERE event_type = 'magic_link_requested'
      AND created_at >= ${dayStart}
  `);

  const row = rows.rows[0];
  return {
    emailLastHour: Number(row?.emailLastHour ?? 0),
    emailLastDay: Number(row?.emailLastDay ?? 0),
    ipLastQuarterHour: Number(row?.ipLastQuarterHour ?? 0),
  };
}

/**
 * Verifica i limiti per una richiesta di magic link.
 *
 * Va invocata DOPO aver registrato il tentativo corrente, cosi anche le
 * richieste per indirizzi inesistenti pesano sul conteggio: e cio che rende il
 * limite efficace contro chi prova indirizzi a caso per scoprire quali sono
 * registrati.
 */
export async function checkMagicLinkThrottle(input: {
  email: string;
  ip: string | null;
  now?: Date;
}): Promise<ThrottleDecision> {
  const counts = await countMagicLinkEvents({
    emailHash: hashEmailForEvents(input.email),
    ip: input.ip,
    now: input.now ?? new Date(),
  });
  return magicLinkThrottleDecision(counts);
}

// ---------------------------------------------------------------------------
// Limiti per l'accesso con password.
//
// Stessa scelta del magic link — il conteggio sta sul database e non in
// memoria — ma per un motivo diverso: qui non difendiamo dall'enumerazione,
// difendiamo dal tentare password a raffica. Un contatore per processo che si
// azzera a ogni deploy non serve a niente contro chi prova per ore.
// ---------------------------------------------------------------------------

export const PASSWORD_LOGIN_LIMITS = {
  perEmailPerQuarterHour: 10,
  perIpPerQuarterHour: 30,
} as const;

export function passwordLoginThrottleDecision(counts: {
  emailLastQuarterHour: number;
  ipLastQuarterHour: number;
}): ThrottleDecision {
  if (counts.ipLastQuarterHour >= PASSWORD_LOGIN_LIMITS.perIpPerQuarterHour) {
    return { allowed: false, blockedBy: "ip" };
  }
  if (
    counts.emailLastQuarterHour >=
    PASSWORD_LOGIN_LIMITS.perEmailPerQuarterHour
  ) {
    return { allowed: false, blockedBy: "email" };
  }
  return { allowed: true, blockedBy: null };
}

/**
 * Conta i tentativi falliti nell'ultimo quarto d'ora, per indirizzo e per IP.
 *
 * Come per il magic link: una sola query, non due in parallelo. Il pool ha tre
 * connessioni e il job di manutenzione ne occupa mentre lavora.
 */
export async function checkPasswordLoginThrottle(input: {
  email: string;
  ip: string | null;
  now?: Date;
}): Promise<ThrottleDecision> {
  const now = input.now ?? new Date();
  const quarterStart = new Date(now.getTime() - WINDOWS_MS.quarterHour);
  const emailHash = hashEmailForEvents(input.email);

  const rows = await db.execute<{
    emailLastQuarterHour: number;
    ipLastQuarterHour: number;
  }>(sql`
    SELECT
      count(*) FILTER (WHERE email_hash = ${emailHash})::int
        AS "emailLastQuarterHour",
      count(*) FILTER (WHERE ip = ${input.ip})::int
        AS "ipLastQuarterHour"
    FROM customer_account_events
    WHERE event_type = 'password_login_failed'
      AND created_at >= ${quarterStart}
  `);

  const row = rows.rows[0];
  return passwordLoginThrottleDecision({
    emailLastQuarterHour: Number(row?.emailLastQuarterHour ?? 0),
    ipLastQuarterHour: Number(row?.ipLastQuarterHour ?? 0),
  });
}
