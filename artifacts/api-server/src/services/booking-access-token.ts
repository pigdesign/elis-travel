import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { db } from "@workspace/db";
import { excursionBookingsTable, excursionsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const TOKEN_VERSION = "v1";
const FALLBACK_TTL_MS = 180 * 24 * 60 * 60 * 1000;
const AFTER_DEPARTURE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function tokenSecret(): string {
  const secret =
    process.env.BOOKING_ACCESS_TOKEN_SECRET ||
    process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error(
      "BOOKING_ACCESS_TOKEN_SECRET (or SESSION_SECRET) is required to create booking links.",
    );
  }
  return secret;
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function signature(payload: string): string {
  return createHmac("sha256", tokenSecret()).update(payload).digest("base64url");
}

function buildToken(bookingId: string, expiresAt: Date): string {
  const payload = `${TOKEN_VERSION}.${bookingId}.${Math.floor(expiresAt.getTime() / 1000)}`;
  return `${payload}.${signature(payload)}`;
}

export function normalizeAccessTokenExpiry(value: Date): Date {
  return new Date(Math.floor(value.getTime() / 1000) * 1000);
}

export function accessTokenExpiryMatches(
  storedExpiry: Date,
  parsedExpiry: Date,
): boolean {
  return (
    normalizeAccessTokenExpiry(storedExpiry).getTime() ===
    parsedExpiry.getTime()
  );
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function parseAndVerifyToken(token: string): {
  bookingId: string;
  expiresAt: Date;
  hash: string;
} | null {
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== TOKEN_VERSION) return null;
  const [version, bookingId, expiresRaw, suppliedSignature] = parts;
  if (!bookingId || !expiresRaw || !suppliedSignature) return null;
  const expiresSeconds = Number(expiresRaw);
  if (!Number.isSafeInteger(expiresSeconds) || expiresSeconds <= 0) return null;
  const payload = `${version}.${bookingId}.${expiresRaw}`;
  if (!safeEqual(signature(payload), suppliedSignature)) return null;
  const expiresAt = new Date(expiresSeconds * 1000);
  if (expiresAt.getTime() <= Date.now()) return null;
  return { bookingId, expiresAt, hash: tokenHash(token) };
}

function preferredExpiry(departureAt: Date | null, now = Date.now()): Date {
  const fallback = now + FALLBACK_TTL_MS;
  const afterDeparture = departureAt
    ? departureAt.getTime() + AFTER_DEPARTURE_TTL_MS
    : 0;
  return normalizeAccessTokenExpiry(
    new Date(Math.max(fallback, afterDeparture)),
  );
}

/**
 * Restituisce un bearer token stabile e revocabile per la pagina prenotazione.
 * Il DB conserva soltanto l'hash. Il token puo essere ricostruito per reminder
 * successivi grazie alla firma HMAC e alla scadenza persistita.
 */
export async function ensureBookingAccessToken(bookingId: string): Promise<{
  token: string;
  expiresAt: Date;
}> {
  return db.transaction(async (tx) => {
    // Il row lock serializza due email/retry concorrenti: il secondo processo
    // rilegge e ricostruisce esattamente il token appena persistito dal primo.
    const [booking] = await tx
      .select()
      .from(excursionBookingsTable)
      .where(eq(excursionBookingsTable.id, bookingId))
      .for("update")
      .limit(1);
    if (!booking || booking.cancelledAt) {
      throw new Error("Prenotazione non trovata o annullata.");
    }
    const [excursion] = await tx
      .select({ departureAt: excursionsTable.departureAt })
      .from(excursionsTable)
      .where(eq(excursionsTable.id, booking.excursionId))
      .limit(1);
    if (!excursion) throw new Error("Gita della prenotazione non trovata.");

    if (
      booking.accessTokenHash &&
      booking.accessTokenExpiresAt &&
      booking.accessTokenExpiresAt > new Date()
    ) {
      const expiresAt = normalizeAccessTokenExpiry(
        booking.accessTokenExpiresAt,
      );
      const token = buildToken(booking.id, expiresAt);
      if (safeEqual(tokenHash(token), booking.accessTokenHash)) {
        if (
          booking.accessTokenExpiresAt.getTime() !== expiresAt.getTime()
        ) {
          await tx
            .update(excursionBookingsTable)
            .set({ accessTokenExpiresAt: expiresAt, updatedAt: new Date() })
            .where(eq(excursionBookingsTable.id, booking.id));
        }
        return { token, expiresAt };
      }
    }

    const expiresAt = preferredExpiry(excursion.departureAt);
    const token = buildToken(booking.id, expiresAt);
    await tx
      .update(excursionBookingsTable)
      .set({
        accessTokenHash: tokenHash(token),
        accessTokenExpiresAt: expiresAt,
        updatedAt: new Date(),
      })
      .where(eq(excursionBookingsTable.id, booking.id));

    return { token, expiresAt };
  });
}

export async function verifyBookingAccessToken(token: string): Promise<{
  bookingId: string;
  expiresAt: Date;
} | null> {
  const parsed = parseAndVerifyToken(token);
  if (!parsed) return null;

  // Il token resta leggibile anche dopo l'annullamento: il portale deve poter
  // mostrare decisione e avanzamento del rimborso. Gli endpoint di pagamento
  // applicano comunque i propri guard su cancelledAt/cancellation status.
  const [booking] = await db
    .select({
      id: excursionBookingsTable.id,
      hash: excursionBookingsTable.accessTokenHash,
      expiresAt: excursionBookingsTable.accessTokenExpiresAt,
    })
    .from(excursionBookingsTable)
    .where(eq(excursionBookingsTable.id, parsed.bookingId))
    .limit(1);

  if (
    !booking ||
    !booking.hash ||
    !booking.expiresAt ||
    !accessTokenExpiryMatches(booking.expiresAt, parsed.expiresAt) ||
    !safeEqual(booking.hash, parsed.hash)
  ) {
    return null;
  }

  if (booking.expiresAt.getTime() !== parsed.expiresAt.getTime()) {
    await db
      .update(excursionBookingsTable)
      .set({ accessTokenExpiresAt: parsed.expiresAt, updatedAt: new Date() })
      .where(eq(excursionBookingsTable.id, booking.id));
  }

  return { bookingId: booking.id, expiresAt: parsed.expiresAt };
}

export async function revokeBookingAccessToken(bookingId: string): Promise<void> {
  await db
    .update(excursionBookingsTable)
    .set({ accessTokenHash: null, accessTokenExpiresAt: null, updatedAt: new Date() })
    .where(eq(excursionBookingsTable.id, bookingId));
}

export function resolveBookingPortalOrigin(
  rawOrigin = process.env.PUBLIC_SITE_URL,
  nodeEnv = process.env.NODE_ENV,
): string {
  const production = nodeEnv === "production";
  const candidate = rawOrigin?.trim() || (production ? "" : "http://localhost:5173");
  if (!candidate) {
    throw new Error("PUBLIC_SITE_URL is required in production.");
  }
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error("PUBLIC_SITE_URL must be an absolute HTTP(S) URL.");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("PUBLIC_SITE_URL must use HTTP or HTTPS.");
  }
  if (parsed.search || parsed.hash) {
    throw new Error("PUBLIC_SITE_URL must not contain a query string or fragment.");
  }
  if (
    production &&
    (parsed.protocol !== "https:" ||
      ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname))
  ) {
    throw new Error(
      "PUBLIC_SITE_URL must be a public HTTPS origin in production.",
    );
  }
  return parsed.toString().replace(/\/$/, "");
}

export function validateBookingPortalConfiguration(): void {
  tokenSecret();
  resolveBookingPortalOrigin();
}

export function buildBookingPortalUrl(token: string): string {
  const origin = resolveBookingPortalOrigin();
  // Il fragment non viene inviato a server/reverse proxy e riduce il rischio
  // che il bearer token finisca nei log HTTP o nel referrer.
  return `${origin}/prenotazione#token=${encodeURIComponent(token)}`;
}
