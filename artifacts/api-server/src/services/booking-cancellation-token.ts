import crypto from "node:crypto";

function getSecret(): string {
  const secret =
    process.env.BOOKING_CANCELLATION_SECRET ||
    process.env.SESSION_SECRET ||
    "";
  if (!secret) {
    throw new Error(
      "BOOKING_CANCELLATION_SECRET (o SESSION_SECRET) non configurato",
    );
  }
  return secret;
}

export function generateBookingCancellationToken(bookingId: string): string {
  const h = crypto.createHmac("sha256", getSecret());
  h.update(`cancel:${bookingId}`);
  return h.digest("hex");
}

export function verifyBookingCancellationToken(
  bookingId: string,
  token: string,
): boolean {
  if (!bookingId || !token) return false;
  let expected: string;
  try {
    expected = generateBookingCancellationToken(bookingId);
  } catch {
    return false;
  }
  const a = Buffer.from(expected, "hex");
  let b: Buffer;
  try {
    b = Buffer.from(token, "hex");
  } catch {
    return false;
  }
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function buildCancellationUrl(bookingId: string): string {
  const base = (
    process.env.PUBLIC_API_URL ||
    process.env.PUBLIC_SITE_URL ||
    ""
  ).replace(/\/$/, "");
  const token = generateBookingCancellationToken(bookingId);
  const path = `/api/excursions/bookings/${bookingId}/cancel?token=${token}`;
  return base ? `${base}${path}` : path;
}
