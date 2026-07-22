const RECOVERY_CONTEXT_KEY = "elis-travel.stripe-recovery-context.v1";
const RETURN_SIGNAL_KEY = "elis-travel.stripe-return-signal.v1";
const RETURN_MARKER = "elis_stripe_return";
const RECOVERY_MAX_AGE_MS = 2 * 60 * 60 * 1000;

type PaymentType = "deposit" | "full";
type PaymentMethod = "card" | "bank_transfer" | "office" | null;
type CardFlow = "pay_now" | "save_for_confirmation" | "no_payment_required";

export type PublicBookingRecoverySummary = {
  id: string;
  bookingCode: string;
  seats: number;
  totalCents: number;
  amountDueCents: number;
  paymentType: PaymentType;
  paymentMethod: PaymentMethod;
  paymentStatus: string;
  paymentDeadline: string | null;
  paymentGraceUntil?: string | null;
  message: string;
  cardFlow?: CardFlow;
};

export type StripeRecoveryContext =
  | {
      version: 1;
      flow: "public_payment" | "public_setup";
      expectedIntentId: string;
      excursionId: string;
      booking: PublicBookingRecoverySummary;
      createdAt: number;
    }
  | {
      version: 1;
      flow: "portal_payment";
      expectedIntentId: string;
      paymentRequestId: string;
      attemptId: string;
      createdAt: number;
    };

export type StripeRecoveryContextInput = StripeRecoveryContext extends infer T
  ? T extends StripeRecoveryContext
    ? Omit<T, "version" | "createdAt">
    : never
  : never;

export type StripeReturnSignal = {
  version: 1;
  kind: "payment" | "setup";
  intentId: string;
  redirectStatus: string | null;
  capturedAt: number;
};

export type StripeReconciliationFailureKind = "refund_initiated" | "pending";

let volatileClientSecret: string | null = null;
let captureAttempted = false;

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function isFresh(timestamp: unknown, now = Date.now()): timestamp is number {
  return (
    typeof timestamp === "number" &&
    Number.isFinite(timestamp) &&
    timestamp <= now + 60_000 &&
    now - timestamp <= RECOVERY_MAX_AGE_MS
  );
}

function isPaymentIntentId(value: unknown): value is string {
  return typeof value === "string" && /^pi_[A-Za-z0-9_]+$/.test(value);
}

function isSetupIntentId(value: unknown): value is string {
  return typeof value === "string" && /^seti_[A-Za-z0-9_]+$/.test(value);
}

function isAttemptId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 8 &&
    value.length <= 128 &&
    /^[A-Za-z0-9_-]+$/.test(value)
  );
}

function isUuidLike(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 8 &&
    value.length <= 128 &&
    /^[A-Za-z0-9_-]+$/.test(value)
  );
}

function validPublicSummary(
  value: unknown,
): value is PublicBookingRecoverySummary {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    isUuidLike(row.id) &&
    typeof row.bookingCode === "string" &&
    row.bookingCode.length >= 4 &&
    typeof row.seats === "number" &&
    Number.isInteger(row.seats) &&
    row.seats > 0 &&
    typeof row.totalCents === "number" &&
    Number.isInteger(row.totalCents) &&
    row.totalCents >= 0 &&
    typeof row.amountDueCents === "number" &&
    Number.isInteger(row.amountDueCents) &&
    row.amountDueCents >= 0 &&
    (row.paymentType === "deposit" || row.paymentType === "full") &&
    row.paymentMethod === "card" &&
    typeof row.paymentStatus === "string" &&
    (typeof row.paymentDeadline === "string" || row.paymentDeadline === null) &&
    typeof row.message === "string"
  );
}

function parseContext(raw: string | null): StripeRecoveryContext | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (value.version !== 1 || !isFresh(value.createdAt)) return null;
    if (
      (value.flow === "public_payment" || value.flow === "public_setup") &&
      isUuidLike(value.excursionId) &&
      validPublicSummary(value.booking) &&
      ((value.flow === "public_payment" &&
        isPaymentIntentId(value.expectedIntentId)) ||
        (value.flow === "public_setup" &&
          isSetupIntentId(value.expectedIntentId)))
    ) {
      return value as StripeRecoveryContext;
    }
    if (
      value.flow === "portal_payment" &&
      isPaymentIntentId(value.expectedIntentId) &&
      isUuidLike(value.paymentRequestId) &&
      isAttemptId(value.attemptId)
    ) {
      return value as StripeRecoveryContext;
    }
  } catch {
    // Dati di sessione corrotti o appartenenti a una versione precedente.
  }
  return null;
}

function parseSignal(raw: string | null): StripeReturnSignal | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (
      value.version !== 1 ||
      !isFresh(value.capturedAt) ||
      (value.kind !== "payment" && value.kind !== "setup") ||
      (value.kind === "payment"
        ? !isPaymentIntentId(value.intentId)
        : !isSetupIntentId(value.intentId)) ||
      (typeof value.redirectStatus !== "string" &&
        value.redirectStatus !== null)
    ) {
      return null;
    }
    return value as StripeReturnSignal;
  } catch {
    return null;
  }
}

function intentIdFromClientSecret(
  clientSecret: string,
  kind: "payment" | "setup",
): string | null {
  const separator = clientSecret.indexOf("_secret_");
  if (separator <= 0) return null;
  const intentId = clientSecret.slice(0, separator);
  return kind === "payment"
    ? isPaymentIntentId(intentId)
      ? intentId
      : null
    : isSetupIntentId(intentId)
      ? intentId
      : null;
}

export function paymentIntentIdFromClientSecret(
  clientSecret: string,
): string | null {
  return intentIdFromClientSecret(clientSecret, "payment");
}

export function setupIntentIdFromClientSecret(
  clientSecret: string,
): string | null {
  return intentIdFromClientSecret(clientSecret, "setup");
}

export function buildStripeReturnUrl(href: string): string {
  const url = new URL(href);
  for (const key of [
    "payment_intent",
    "payment_intent_client_secret",
    "setup_intent",
    "setup_intent_client_secret",
    "redirect_status",
    RETURN_MARKER,
  ]) {
    url.searchParams.delete(key);
  }
  url.searchParams.set(RETURN_MARKER, "1");
  url.hash = "";
  return url.toString();
}

/**
 * Cattura una sola volta il ritorno Stripe prima che il router ripulisca l'URL.
 * Il client secret resta esclusivamente in memoria; sessionStorage conserva solo
 * l'ID dell'Intent necessario alla riconciliazione server-side.
 */
export function captureStripeReturnFromWindow(): void {
  if (captureAttempted || typeof window === "undefined") return;
  captureAttempted = true;

  const url = new URL(window.location.href);
  const paymentIntentId = url.searchParams.get("payment_intent");
  const setupIntentId = url.searchParams.get("setup_intent");
  const paymentSecret = url.searchParams.get("payment_intent_client_secret");
  const setupSecret = url.searchParams.get("setup_intent_client_secret");
  const hasMarker = url.searchParams.get(RETURN_MARKER) === "1";
  const hasStripeReturn =
    hasMarker ||
    (Boolean(url.searchParams.get("redirect_status")) &&
      (Boolean(paymentIntentId) || Boolean(setupIntentId)));
  if (!hasStripeReturn) return;

  let signal: StripeReturnSignal | null = null;
  if (
    paymentIntentId &&
    isPaymentIntentId(paymentIntentId) &&
    (!paymentSecret ||
      intentIdFromClientSecret(paymentSecret, "payment") === paymentIntentId)
  ) {
    signal = {
      version: 1,
      kind: "payment",
      intentId: paymentIntentId,
      redirectStatus: url.searchParams.get("redirect_status"),
      capturedAt: Date.now(),
    };
    volatileClientSecret = paymentSecret;
  } else if (
    setupIntentId &&
    isSetupIntentId(setupIntentId) &&
    (!setupSecret ||
      intentIdFromClientSecret(setupSecret, "setup") === setupIntentId)
  ) {
    signal = {
      version: 1,
      kind: "setup",
      intentId: setupIntentId,
      redirectStatus: url.searchParams.get("redirect_status"),
      capturedAt: Date.now(),
    };
    volatileClientSecret = setupSecret;
  }

  const session = storage();
  if (signal && session) {
    session.setItem(RETURN_SIGNAL_KEY, JSON.stringify(signal));
  }

  for (const key of [
    "payment_intent",
    "payment_intent_client_secret",
    "setup_intent",
    "setup_intent_client_secret",
    "redirect_status",
    RETURN_MARKER,
  ]) {
    url.searchParams.delete(key);
  }
  window.history.replaceState(
    window.history.state,
    "",
    `${url.pathname}${url.search}${url.hash}`,
  );
}

export function saveStripeRecoveryContext(
  context: StripeRecoveryContextInput,
): void {
  const session = storage();
  if (!session) return;
  session.setItem(
    RECOVERY_CONTEXT_KEY,
    JSON.stringify({ ...context, version: 1, createdAt: Date.now() }),
  );
}

export function readStripeRecoveryContext(): StripeRecoveryContext | null {
  const session = storage();
  if (!session) return null;
  const parsed = parseContext(session.getItem(RECOVERY_CONTEXT_KEY));
  if (!parsed) session.removeItem(RECOVERY_CONTEXT_KEY);
  return parsed;
}

export function readStripeReturnSignal(): StripeReturnSignal | null {
  const session = storage();
  if (!session) return null;
  const parsed = parseSignal(session.getItem(RETURN_SIGNAL_KEY));
  if (!parsed) session.removeItem(RETURN_SIGNAL_KEY);
  return parsed;
}

/**
 * Registra anche gli esiti conclusi senza redirect (`redirect: if_required`).
 * In questo modo un reload durante la riconciliazione riprende lo stesso Intent
 * e non propone mai un secondo pagamento.
 */
export function saveStripeReturnSignal(input: {
  kind: "payment" | "setup";
  intentId: string;
  redirectStatus?: string | null;
}): void {
  const validIntent =
    input.kind === "payment"
      ? isPaymentIntentId(input.intentId)
      : isSetupIntentId(input.intentId);
  const session = storage();
  if (!validIntent || !session) return;
  const signal: StripeReturnSignal = {
    version: 1,
    kind: input.kind,
    intentId: input.intentId,
    redirectStatus: input.redirectStatus ?? "succeeded",
    capturedAt: Date.now(),
  };
  session.setItem(RETURN_SIGNAL_KEY, JSON.stringify(signal));
}

function reconciliationErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const row = error as Record<string, unknown>;
  if (typeof row.code === "string") return row.code;
  if (row.data && typeof row.data === "object") {
    const nestedCode = (row.data as Record<string, unknown>).code;
    if (typeof nestedCode === "string") return nestedCode;
  }
  return null;
}

export function stripeReconciliationFailureFromError(
  error: unknown,
): StripeReconciliationFailureKind | null {
  const code = reconciliationErrorCode(error);
  if (code === "PAYMENT_REFUND_INITIATED") return "refund_initiated";
  if (code === "PAYMENT_RECONCILIATION_PENDING") return "pending";
  return null;
}

export function classifyStripeReconciliationFailure(
  error: unknown,
): StripeReconciliationFailureKind {
  return stripeReconciliationFailureFromError(error) ?? "pending";
}

export function stripeReconciliationFailureMessage(
  kind: StripeReconciliationFailureKind,
): string {
  return kind === "refund_initiated"
    ? "Il pagamento è stato ricevuto, ma la prenotazione non era più pagabile: l'importo è stato preso in carico per il rimborso. Non effettuare un nuovo pagamento e contatta l'agenzia per verificarne lo stato."
    : "Stripe ha ricevuto il pagamento, ma l'aggiornamento della prenotazione è ancora in verifica. Non effettuare un nuovo pagamento: controlla il link di gestione ricevuto via email o contatta l'agenzia.";
}

export function readVolatileStripeClientSecret(
  expectedIntentId: string,
): string | null {
  if (!volatileClientSecret) return null;
  const paymentId = paymentIntentIdFromClientSecret(volatileClientSecret);
  const setupId = setupIntentIdFromClientSecret(volatileClientSecret);
  return paymentId === expectedIntentId || setupId === expectedIntentId
    ? volatileClientSecret
    : null;
}

export function clearStripeReturnSignal(): void {
  storage()?.removeItem(RETURN_SIGNAL_KEY);
  volatileClientSecret = null;
}

export function clearStripeRecovery(): void {
  storage()?.removeItem(RECOVERY_CONTEXT_KEY);
  clearStripeReturnSignal();
}

export const stripeRecoveryInternals = {
  contextKey: RECOVERY_CONTEXT_KEY,
  returnSignalKey: RETURN_SIGNAL_KEY,
  returnMarker: RETURN_MARKER,
};
