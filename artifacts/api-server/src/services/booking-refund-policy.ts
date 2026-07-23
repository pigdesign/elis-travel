export const LEGACY_REFUND_IDEMPOTENCY_PREFIX = "late-payment-refund-";
export const MAX_REFUND_IDEMPOTENCY_KEY_LENGTH = 180;

export type RefundRegistrationIdentity = {
  bookingId: string;
  paymentRequestId: string | null;
  paymentAttemptId?: string | null;
  paymentIntentId: string;
  amountCents: number;
  idempotencyKey?: string;
};

export type NormalizedRefundRegistration = {
  bookingId: string;
  paymentRequestId: string | null;
  paymentAttemptId: string | null;
  paymentIntentId: string;
  amountCents: number;
  idempotencyKey: string;
};

function validReference(value: string): boolean {
  return value.length > 0 && value === value.trim();
}

export function normalizeRefundRegistration(
  input: RefundRegistrationIdentity,
): NormalizedRefundRegistration {
  if (!validReference(input.bookingId)) {
    throw new Error("bookingId rimborso non valido.");
  }
  if (
    input.paymentRequestId !== null &&
    !validReference(input.paymentRequestId)
  ) {
    throw new Error("paymentRequestId rimborso non valido.");
  }
  if (
    input.paymentAttemptId !== undefined &&
    input.paymentAttemptId !== null &&
    !validReference(input.paymentAttemptId)
  ) {
    throw new Error("paymentAttemptId rimborso non valido.");
  }
  if (
    !validReference(input.paymentIntentId) ||
    !input.paymentIntentId.startsWith("pi_")
  ) {
    throw new Error("PaymentIntent rimborso non valido.");
  }
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) {
    throw new Error("Importo rimborso non valido.");
  }

  const idempotencyKey =
    input.idempotencyKey ??
    `${LEGACY_REFUND_IDEMPOTENCY_PREFIX}${input.paymentIntentId}`;
  if (
    !validReference(idempotencyKey) ||
    idempotencyKey.length > MAX_REFUND_IDEMPOTENCY_KEY_LENGTH ||
    /[\u0000-\u001f\u007f]/.test(idempotencyKey)
  ) {
    throw new Error("Chiave idempotente rimborso non valida.");
  }

  return {
    bookingId: input.bookingId,
    paymentRequestId: input.paymentRequestId,
    paymentAttemptId: input.paymentAttemptId ?? null,
    paymentIntentId: input.paymentIntentId,
    amountCents: input.amountCents,
    idempotencyKey,
  };
}

export function refundRegistrationMatches(
  existing: NormalizedRefundRegistration,
  requested: NormalizedRefundRegistration,
): boolean {
  return (
    existing.idempotencyKey === requested.idempotencyKey &&
    existing.bookingId === requested.bookingId &&
    existing.paymentRequestId === requested.paymentRequestId &&
    existing.paymentAttemptId === requested.paymentAttemptId &&
    existing.paymentIntentId === requested.paymentIntentId &&
    existing.amountCents === requested.amountCents
  );
}

/**
 * I rimborsi di annullamento possono essere parziali e distribuiti su piu PI:
 * lo stato aggregato viene riconciliato soltanto dal servizio cancellazioni.
 */
export function refundReasonDefersAggregateReconciliation(
  reason: string,
): boolean {
  return (
    reason.startsWith("customer_cancellation") ||
    reason.startsWith("excursion_cancellation")
  );
}
