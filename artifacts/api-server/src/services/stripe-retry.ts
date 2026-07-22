export type StripeFailureDisposition = "retryable" | "manual_required";

const RETRYABLE_TYPES = new Set([
  "api_connection_error",
  "api_error",
  "rate_limit_error",
  "StripeConnectionError",
  "StripeAPIError",
  "StripeRateLimitError",
]);

const RETRYABLE_CODES = new Set([
  "balance_insufficient",
  "lock_timeout",
  "rate_limit",
]);

function errorRecord(error: unknown): Record<string, unknown> | null {
  return error && typeof error === "object"
    ? (error as Record<string, unknown>)
    : null;
}

/**
 * Classifica gli errori della chiamata Stripe. Errori di rete, rate limit,
 * conflitti e 5xx sono ripetibili; errori di autenticazione/parametri e gli
 * altri 4xx richiedono invece verifica umana. Gli errori non tipizzati sono
 * trattati come transitori: il limite tentativi impedisce loop infiniti.
 */
export function classifyStripeFailure(
  error: unknown,
): StripeFailureDisposition {
  const record = errorRecord(error);
  const type =
    typeof record?.type === "string"
      ? record.type
      : typeof record?.name === "string"
        ? record.name
        : null;
  const code = typeof record?.code === "string" ? record.code : null;
  const statusCode =
    typeof record?.statusCode === "number"
      ? record.statusCode
      : typeof record?.status === "number"
        ? record.status
        : null;

  if (type && RETRYABLE_TYPES.has(type)) return "retryable";
  if (code && RETRYABLE_CODES.has(code)) return "retryable";
  if (
    statusCode === 409 ||
    statusCode === 429 ||
    (statusCode !== null && statusCode >= 500)
  ) {
    return "retryable";
  }
  if (statusCode !== null && statusCode >= 400 && statusCode < 500) {
    return "manual_required";
  }
  if (
    type &&
    [
      "authentication_error",
      "invalid_request_error",
      "idempotency_error",
      "permission_error",
      "StripeAuthenticationError",
      "StripeInvalidRequestError",
      "StripePermissionError",
    ].includes(type)
  ) {
    return "manual_required";
  }
  return "retryable";
}

/** Backoff esponenziale deterministico: 1m, 2m, 4m ... massimo 6h. */
export function stripeRetryDelayMs(
  attemptCount: number,
  baseMs = 60_000,
  maxMs = 6 * 60 * 60 * 1_000,
): number {
  const normalizedAttempt = Math.max(1, Math.floor(attemptCount));
  return Math.min(baseMs * 2 ** (normalizedAttempt - 1), maxMs);
}

export function stripeRetryAt(
  now: Date,
  attemptCount: number,
): Date {
  return new Date(now.getTime() + stripeRetryDelayMs(attemptCount));
}
