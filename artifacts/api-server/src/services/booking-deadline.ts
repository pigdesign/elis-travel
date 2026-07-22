export type DeadlineRequestSnapshot = {
  id: string;
  status: string;
  createdAt: Date;
};

const EXTENDABLE_REQUEST_STATUSES = new Set([
  "pending",
  "action_required",
  "expired",
]);

/**
 * Una proroga puo agire soltanto sull'obbligazione insoluta piu recente. In
 * questo modo un vecchio acconto non viene riaperto insieme a un saldo nato
 * successivamente.
 */
export function chooseDeadlineExtensionTarget<
  T extends DeadlineRequestSnapshot,
>(requests: T[], requestedId: string): T | null {
  const latest = requests
    .filter((request) => EXTENDABLE_REQUEST_STATUSES.has(request.status))
    .sort(
      (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
    )[0];
  return latest?.id === requestedId ? latest : null;
}

/** Con fondi incassati la liberazione richiede una decisione amministrativa. */
export function canReleaseOverdueBooking(amountPaidCents: number): boolean {
  return amountPaidCents <= 0;
}

export function canRevisitExpiredSeatHold(input: {
  releaseSeats: boolean;
  paymentStatus: string;
  seatStatus: string;
  amountPaidCents: number;
}): boolean {
  return (
    input.releaseSeats &&
    input.paymentStatus === "expired" &&
    input.seatStatus === "held" &&
    canReleaseOverdueBooking(input.amountPaidCents)
  );
}

export type ExpiringPaymentAttemptSnapshot = {
  id: string;
  stripePaymentIntentId: string | null;
};

/**
 * Produce il piano durevole da registrare nella stessa transazione che scade
 * la richiesta. I tentativi solo locali vengono chiusi senza lavoro provider;
 * ogni PaymentIntent, invece, deve avere un job prima del commit.
 */
export function planExpiredCardAttemptCleanup(
  attempts: readonly ExpiringPaymentAttemptSnapshot[],
): Array<{ attemptId: string; paymentIntentId: string }> {
  return attempts.flatMap((attempt) =>
    attempt.stripePaymentIntentId
      ? [
          {
            attemptId: attempt.id,
            paymentIntentId: attempt.stripePaymentIntentId,
          },
        ]
      : [],
  );
}
