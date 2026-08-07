import { createHash, randomBytes } from "node:crypto";
import { db } from "@workspace/db";
import {
  customerAuthTokensTable,
  type CustomerAuthToken,
  type CustomerTokenPurpose,
} from "@workspace/db/schema";
import { and, eq, gt, isNull, ne, sql } from "drizzle-orm";

// Durata di vita per scopo. Il magic link e volutamente breve: e una
// credenziale di accesso che viaggia in chiaro dentro una casella di posta.
// L'invito dura di piu perche accompagna una conferma di prenotazione, che il
// cliente puo riprendere in mano giorni dopo.
export const TOKEN_TTL_MS: Record<CustomerTokenPurpose, number> = {
  magic_link: 15 * 60 * 1000,
  email_verify: 24 * 60 * 60 * 1000,
  account_invite: 7 * 24 * 60 * 60 * 1000,
  password_reset: 60 * 60 * 1000,
};

// 32 byte di entropia: non indovinabile, e la lunghezza resta gestibile in un
// fragment di URL.
const TOKEN_BYTES = 32;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Emette un token e ne persiste soltanto l'hash.
 *
 * Il valore in chiaro esiste solo nel valore di ritorno e nell'email: chi legge
 * il database non puo accedere a nessun account.
 */
export async function issueCustomerAuthToken(input: {
  accountId: string;
  purpose: CustomerTokenPurpose;
  bookingId?: string | null;
  requestedIp?: string | null;
  now?: Date;
}): Promise<{ token: string; expiresAt: Date }> {
  const now = input.now ?? new Date();
  const expiresAt = new Date(now.getTime() + TOKEN_TTL_MS[input.purpose]);
  const token = randomBytes(TOKEN_BYTES).toString("base64url");

  await db.insert(customerAuthTokensTable).values({
    accountId: input.accountId,
    purpose: input.purpose,
    bookingId: input.bookingId ?? null,
    tokenHash: hashToken(token),
    expiresAt,
    requestedIp: input.requestedIp ?? null,
  });

  return { token, expiresAt };
}

/**
 * Consuma un token in modo atomico.
 *
 * La condizione `used_at IS NULL` sta DENTRO la UPDATE, non in una SELECT
 * precedente: leggere e poi scrivere lascerebbe una finestra in cui due
 * richieste simultanee riescono entrambe. Non e un caso di scuola — i client di
 * posta e gli scanner antivirus aprono i link in anticipo, e capita davvero che
 * la stessa richiesta arrivi due volte a distanza di millisecondi.
 *
 * Se non torna nessuna riga il token era gia usato, scaduto o inesistente: al
 * chiamante non serve distinguere, e non deve dirlo all'utente.
 */
export async function consumeCustomerAuthToken(input: {
  token: string;
  purpose: CustomerTokenPurpose;
  now?: Date;
}): Promise<CustomerAuthToken | null> {
  const now = input.now ?? new Date();
  if (!input.token) return null;

  const [consumed] = await db
    .update(customerAuthTokensTable)
    .set({ usedAt: now })
    .where(
      and(
        eq(customerAuthTokensTable.tokenHash, hashToken(input.token)),
        eq(customerAuthTokensTable.purpose, input.purpose),
        isNull(customerAuthTokensTable.usedAt),
        gt(customerAuthTokensTable.expiresAt, now),
      ),
    )
    .returning();

  return consumed ?? null;
}

/**
 * Invalida gli altri token ancora aperti dello stesso scopo.
 *
 * Chiamata dopo un accesso riuscito: se l'utente ha cliccato "non ho ricevuto
 * l'email" tre volte, i link precedenti restano validi nella sua casella per
 * tutta la loro durata. Chiuderli riduce la finestra utile a chi dovesse
 * mettere le mani su quella casella in seguito.
 */
export async function invalidateOtherTokens(input: {
  accountId: string;
  purpose: CustomerTokenPurpose;
  exceptTokenId?: string;
  now?: Date;
}): Promise<number> {
  const now = input.now ?? new Date();
  const rows = await db
    .update(customerAuthTokensTable)
    .set({ usedAt: now })
    .where(
      and(
        eq(customerAuthTokensTable.accountId, input.accountId),
        eq(customerAuthTokensTable.purpose, input.purpose),
        isNull(customerAuthTokensTable.usedAt),
        input.exceptTokenId
          ? ne(customerAuthTokensTable.id, input.exceptTokenId)
          : undefined,
      ),
    )
    .returning({ id: customerAuthTokensTable.id });
  return rows.length;
}

/**
 * Elimina i token scaduti da piu di 30 giorni. Non e sicurezza — sono gia
 * inutilizzabili — ma evita che la tabella cresca senza limite.
 */
export async function pruneExpiredAuthTokens(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const rows = await db
    .delete(customerAuthTokensTable)
    .where(sql`${customerAuthTokensTable.expiresAt} < ${cutoff}`)
    .returning({ id: customerAuthTokensTable.id });
  return rows.length;
}
