import assert from "node:assert/strict";
import test from "node:test";
import {
  decideManualCleanupCompletion,
  planOfflineMethodCardCleanup,
  shouldCleanupRecoveredStripeResource,
  shouldRollbackBookingAfterStripeSetupFailure,
} from "./stripe-cleanup-policy";

test("il completamento cleanup e idempotente solo con lo stesso riferimento", () => {
  assert.equal(
    decideManualCleanupCompletion({
      status: "succeeded",
      storedReference: "stripe-dashboard-123",
      requestedReference: "stripe-dashboard-123",
    }),
    "already_completed",
  );
  assert.equal(
    decideManualCleanupCompletion({
      status: "succeeded",
      storedReference: "stripe-dashboard-123",
      requestedReference: "stripe-dashboard-999",
    }),
    "reference_conflict",
  );
});

test("il passaggio a un metodo offline pianifica tutti i PI prima del detach", () => {
  const attempts = [
    { id: "attempt-1", stripePaymentIntentId: "pi_1" },
    { id: "attempt-local", stripePaymentIntentId: null },
  ];
  assert.deepEqual(planOfflineMethodCardCleanup("bank_transfer", attempts), [
    { attemptId: "attempt-1", paymentIntentId: "pi_1" },
  ]);
  assert.deepEqual(planOfflineMethodCardCleanup("office", attempts), [
    { attemptId: "attempt-1", paymentIntentId: "pi_1" },
  ]);
  assert.deepEqual(planOfflineMethodCardCleanup("card", attempts), []);
});

test("un errore post-link conserva la booking e rende SetupIntent e Customer recuperabili", () => {
  assert.equal(
    shouldRollbackBookingAfterStripeSetupFailure({
      bookingWasReused: false,
      bookingCanUseSetup: true,
      setupIsAuthoritativelyLinked: true,
      customerIsAuthoritativelyLinked: true,
    }),
    false,
  );
  assert.equal(
    shouldRollbackBookingAfterStripeSetupFailure({
      bookingWasReused: false,
      bookingCanUseSetup: true,
      setupIsAuthoritativelyLinked: false,
      customerIsAuthoritativelyLinked: true,
    }),
    true,
  );
  assert.equal(
    shouldRollbackBookingAfterStripeSetupFailure({
      bookingWasReused: true,
      bookingCanUseSetup: false,
      setupIsAuthoritativelyLinked: false,
      customerIsAuthoritativelyLinked: false,
    }),
    false,
  );
});

test("solo manual_required puo essere chiuso manualmente", () => {
  assert.equal(
    decideManualCleanupCompletion({
      status: "manual_required",
      storedReference: null,
      requestedReference: "stripe-dashboard-123",
    }),
    "complete",
  );
  assert.equal(
    decideManualCleanupCompletion({
      status: "processing",
      storedReference: null,
      requestedReference: "stripe-dashboard-123",
    }),
    "invalid_status",
  );
});

test("un SetupIntent idempotente ma non collegato viene sempre accodato al cleanup", () => {
  assert.equal(
    shouldCleanupRecoveredStripeResource({
      bookingCanUseResource: true,
      resourceIsAuthoritativelyLinked: false,
    }),
    true,
  );
  assert.equal(
    shouldCleanupRecoveredStripeResource({
      bookingCanUseResource: false,
      resourceIsAuthoritativelyLinked: true,
    }),
    true,
  );
  assert.equal(
    shouldCleanupRecoveredStripeResource({
      bookingCanUseResource: true,
      resourceIsAuthoritativelyLinked: true,
    }),
    false,
  );
});
