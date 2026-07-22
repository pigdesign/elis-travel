import assert from "node:assert/strict";
import test from "node:test";
import {
  buildStripeReturnUrl,
  captureStripeReturnFromWindow,
  classifyStripeReconciliationFailure,
  paymentIntentIdFromClientSecret,
  readStripeReturnSignal,
  readVolatileStripeClientSecret,
  saveStripeReturnSignal,
  setupIntentIdFromClientSecret,
  stripeReconciliationFailureFromError,
  stripeReconciliationFailureMessage,
  stripeRecoveryInternals,
} from "./booking-stripe-recovery";

test("distingue un rimborso terminale da una riconciliazione ancora in verifica", () => {
  assert.equal(
    classifyStripeReconciliationFailure({
      data: { code: "PAYMENT_REFUND_INITIATED" },
    }),
    "refund_initiated",
  );
  assert.equal(
    classifyStripeReconciliationFailure({
      code: "PAYMENT_REFUND_INITIATED",
    }),
    "refund_initiated",
  );
  assert.equal(
    classifyStripeReconciliationFailure({
      data: { code: "PAYMENT_RECONCILIATION_PENDING" },
    }),
    "pending",
  );
  assert.equal(
    stripeReconciliationFailureFromError({ code: "card_payments_disabled" }),
    null,
  );
  assert.match(
    stripeReconciliationFailureMessage("refund_initiated"),
    /rimborso/i,
  );
  assert.match(
    stripeReconciliationFailureMessage("pending"),
    /non effettuare un nuovo pagamento/i,
  );
});

test("salva un segnale non segreto anche quando Stripe non esegue redirect", () => {
  const values = new Map<string, string>();
  const fakeWindow = {
    sessionStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    },
  };
  const target = globalThis as unknown as { window?: typeof fakeWindow };
  const previous = target.window;
  target.window = fakeWindow;
  try {
    saveStripeReturnSignal({ kind: "payment", intentId: "pi_local_123" });
    assert.deepEqual(readStripeReturnSignal(), {
      version: 1,
      kind: "payment",
      intentId: "pi_local_123",
      redirectStatus: "succeeded",
      capturedAt: readStripeReturnSignal()?.capturedAt,
    });
    assert.equal(
      values
        .get(stripeRecoveryInternals.returnSignalKey)
        ?.includes("client_secret"),
      false,
    );
  } finally {
    if (previous) target.window = previous;
    else delete target.window;
  }
});

test("costruisce un return URL privo di token e vecchi parametri Stripe", () => {
  assert.equal(
    buildStripeReturnUrl(
      "https://example.test/prenotazione?payment_intent=pi_old&foo=bar#token=secret",
    ),
    "https://example.test/prenotazione?foo=bar&elis_stripe_return=1",
  );
});

test("estrae e valida l'Intent dal relativo client secret", () => {
  assert.equal(paymentIntentIdFromClientSecret("pi_123_secret_abc"), "pi_123");
  assert.equal(
    setupIntentIdFromClientSecret("seti_123_secret_abc"),
    "seti_123",
  );
  assert.equal(paymentIntentIdFromClientSecret("seti_123_secret_abc"), null);
  assert.equal(setupIntentIdFromClientSecret("pi_123_secret_abc"), null);
  assert.equal(paymentIntentIdFromClientSecret("not-a-secret"), null);
});

test("al ritorno Stripe rimuove subito il client secret dall'URL e non lo persiste", () => {
  const values = new Map<string, string>();
  let replacedUrl = "";
  const fakeWindow = {
    location: {
      href: "https://example.test/prenotazione?elis_stripe_return=1&payment_intent=pi_123&payment_intent_client_secret=pi_123_secret_sensitive&redirect_status=succeeded",
    },
    sessionStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    },
    history: {
      state: null,
      replaceState: (_state: unknown, _title: string, url: string) => {
        replacedUrl = url;
      },
    },
  };
  const target = globalThis as unknown as { window?: typeof fakeWindow };
  const previous = target.window;
  target.window = fakeWindow;
  try {
    captureStripeReturnFromWindow();
    assert.equal(replacedUrl, "/prenotazione");
    assert.equal(readStripeReturnSignal()?.intentId, "pi_123");
    assert.equal(
      readVolatileStripeClientSecret("pi_123"),
      "pi_123_secret_sensitive",
    );
    assert.equal(
      values
        .get(stripeRecoveryInternals.returnSignalKey)
        ?.includes("sensitive"),
      false,
    );
  } finally {
    if (previous) target.window = previous;
    else delete target.window;
  }
});
