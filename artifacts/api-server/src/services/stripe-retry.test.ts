import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyStripeFailure,
  stripeRetryAt,
  stripeRetryDelayMs,
} from "./stripe-retry";

test("classifica rete, rate limit, conflitto e 5xx come ripetibili", () => {
  assert.equal(
    classifyStripeFailure({ type: "api_connection_error" }),
    "retryable",
  );
  assert.equal(classifyStripeFailure({ statusCode: 429 }), "retryable");
  assert.equal(classifyStripeFailure({ statusCode: 409 }), "retryable");
  assert.equal(classifyStripeFailure({ statusCode: 503 }), "retryable");
  assert.equal(
    classifyStripeFailure({ code: "balance_insufficient", statusCode: 400 }),
    "retryable",
  );
});

test("classifica autenticazione e richieste Stripe non valide come manuali", () => {
  assert.equal(
    classifyStripeFailure({ type: "authentication_error" }),
    "manual_required",
  );
  assert.equal(
    classifyStripeFailure({ type: "invalid_request_error", statusCode: 400 }),
    "manual_required",
  );
});

test("backoff cresce in modo deterministico e si ferma a sei ore", () => {
  assert.equal(stripeRetryDelayMs(1), 60_000);
  assert.equal(stripeRetryDelayMs(2), 120_000);
  assert.equal(stripeRetryDelayMs(3), 240_000);
  assert.equal(stripeRetryDelayMs(20), 6 * 60 * 60 * 1_000);
  assert.equal(
    stripeRetryAt(new Date("2026-07-22T10:00:00.000Z"), 2).toISOString(),
    "2026-07-22T10:02:00.000Z",
  );
});
