import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeRefundRegistration,
  refundReasonDefersAggregateReconciliation,
  refundRegistrationMatches,
} from "./booking-refund-policy";

const base = {
  bookingId: "booking-1",
  paymentRequestId: null,
  paymentAttemptId: null,
  paymentIntentId: "pi_123456",
  amountCents: 5_000,
};

test("mantiene la chiave late-payment retrocompatibile e accetta request legacy null", () => {
  const normalized = normalizeRefundRegistration(base);
  assert.equal(normalized.paymentRequestId, null);
  assert.equal(normalized.idempotencyKey, "late-payment-refund-pi_123456");
});

test("chiavi business distinte permettono rimborsi parziali sullo stesso PI", () => {
  const first = normalizeRefundRegistration({
    ...base,
    amountCents: 2_000,
    idempotencyKey: "customer-cancellation-case-1-allocation-1",
  });
  const second = normalizeRefundRegistration({
    ...base,
    amountCents: 3_000,
    idempotencyKey: "customer-cancellation-case-1-allocation-2",
  });
  assert.notEqual(first.idempotencyKey, second.idempotencyKey);
  assert.equal(refundRegistrationMatches(first, second), false);
});

test("rileva conflitti di PI, importo, booking e riferimenti a parita di chiave", () => {
  const expected = normalizeRefundRegistration({
    ...base,
    idempotencyKey: "refund-business-key",
  });
  for (const changed of [
    { ...expected, paymentIntentId: "pi_other" },
    { ...expected, amountCents: 4_999 },
    { ...expected, bookingId: "booking-2" },
    { ...expected, paymentRequestId: "request-2" },
    { ...expected, paymentAttemptId: "attempt-2" },
  ]) {
    assert.equal(refundRegistrationMatches(expected, changed), false);
  }
});

test("rifiuta importi, PI e chiavi idempotenti non validi", () => {
  assert.throws(() => normalizeRefundRegistration({ ...base, amountCents: 0 }));
  assert.throws(() =>
    normalizeRefundRegistration({ ...base, paymentIntentId: "not-a-pi" }),
  );
  assert.throws(() =>
    normalizeRefundRegistration({ ...base, idempotencyKey: " key-con-spazi " }),
  );
});

test("solo i motivi cancellation delegano la riconciliazione aggregata", () => {
  assert.equal(
    refundReasonDefersAggregateReconciliation("customer_cancellation"),
    true,
  );
  assert.equal(
    refundReasonDefersAggregateReconciliation("customer_cancellation_partial"),
    true,
  );
  assert.equal(
    refundReasonDefersAggregateReconciliation("excursion_cancellation_operator"),
    true,
  );
  assert.equal(
    refundReasonDefersAggregateReconciliation("late_payment_after_seat_release"),
    false,
  );
});
