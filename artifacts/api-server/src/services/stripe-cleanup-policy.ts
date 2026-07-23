export type ManualCleanupCompletionDecision =
  | "complete"
  | "already_completed"
  | "reference_conflict"
  | "invalid_status";

export function decideManualCleanupCompletion(input: {
  status: string;
  storedReference: string | null;
  requestedReference: string;
}): ManualCleanupCompletionDecision {
  if (input.status === "succeeded") {
    return input.storedReference === input.requestedReference
      ? "already_completed"
      : "reference_conflict";
  }
  return input.status === "manual_required" ? "complete" : "invalid_status";
}

/**
 * Una risorsa Stripe recuperata con una business key idempotente va ritirata se
 * la booking è ormai terminale oppure se il DB non l'ha mai collegata. Il fatto
 * che la richiesta HTTP sia un replay non cambia questa decisione.
 */
export function shouldCleanupRecoveredStripeResource(input: {
  bookingCanUseResource: boolean;
  resourceIsAuthoritativelyLinked: boolean;
}): boolean {
  return !input.bookingCanUseResource || !input.resourceIsAuthoritativelyLinked;
}

/**
 * Dopo che Customer e SetupIntent sono stati collegati alla booking, un errore
 * HTTP successivo non deve cancellare la sola traccia locale delle risorse.
 * Conservare la booking rende sicuro il replay con la stessa business key e
 * permette alla manutenzione di ritirare le risorse alla scadenza.
 */
export function shouldRollbackBookingAfterStripeSetupFailure(input: {
  bookingWasReused: boolean;
  bookingCanUseSetup: boolean;
  setupIsAuthoritativelyLinked: boolean;
  customerIsAuthoritativelyLinked: boolean;
}): boolean {
  if (input.bookingWasReused) return false;
  return !(
    input.bookingCanUseSetup &&
    input.setupIsAuthoritativelyLinked &&
    input.customerIsAuthoritativelyLinked
  );
}

export function planOfflineMethodCardCleanup(
  method: string,
  attempts: readonly {
    id: string;
    stripePaymentIntentId: string | null;
  }[],
): Array<{ attemptId: string; paymentIntentId: string }> {
  if (method !== "bank_transfer" && method !== "office") return [];
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
