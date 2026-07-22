import assert from "node:assert/strict";
import test from "node:test";
import {
  acceptedPaymentIntentReference,
  adminCancellationSourceKey,
  allocateCancellationRefund,
  assertCancellationDecisionReason,
  assertManualCompletionReference,
  BookingCancellationError,
  cancellationRefundIdempotencyKey,
  cancellationResolutionResponseStatus,
  classifyCancellationReconciliation,
  isTerminalCancellationCaseWithoutRefund,
  type RefundablePaymentSource,
} from "./booking-cancellations";

test("la risposta di risoluzione usa solo lo stato finale riconciliato", () => {
  assert.equal(cancellationResolutionResponseStatus(false), "approved");
  assert.equal(cancellationResolutionResponseStatus(true), "completed");
});

function source(
  key: string,
  kind: "card" | "manual",
  amountCents: number,
): RefundablePaymentSource {
  return {
    key,
    kind,
    amountCents,
    paymentRequestId: `${key}-request`,
    paymentAttemptId: kind === "card" ? `${key}-attempt` : null,
    paymentIntentId: kind === "card" ? `pi_${key}` : null,
    method: kind === "card" ? "card" : "bank_transfer",
  };
}

test("il rimborso usa prima gli incassi carta e lascia offline solo il residuo", () => {
  const allocations = allocateCancellationRefund(
    [source("bank", "manual", 5_000), source("card", "card", 4_000)],
    6_000,
  );
  assert.deepEqual(
    allocations.map((item) => [item.key, item.refundAmountCents]),
    [
      ["card", 4_000],
      ["bank", 2_000],
    ],
  );
});

test("un rimborso parziale si ferma sulla prima fonte senza eccedere l'incasso", () => {
  const allocations = allocateCancellationRefund(
    [source("deposit", "card", 3_000), source("balance", "card", 7_000)],
    2_500,
  );
  assert.equal(allocations.length, 1);
  assert.equal(allocations[0]?.refundAmountCents, 2_500);
});

test("un rimborso completo può essere suddiviso su più PaymentIntent", () => {
  const allocations = allocateCancellationRefund(
    [source("a", "card", 3_000), source("b", "card", 7_000)],
    10_000,
  );
  assert.equal(
    allocations.reduce((sum, item) => sum + item.refundAmountCents, 0),
    10_000,
  );
  assert.equal(allocations.length, 2);
});

test("rifiuta importi superiori agli incassi riconciliati", () => {
  assert.throws(
    () => allocateCancellationRefund([source("a", "card", 3_000)], 3_001),
    (error) =>
      error instanceof BookingCancellationError &&
      error.code === "financial_source_conflict",
  );
});

test("rifiuta fonti duplicate prima di allocare e prevenire un over-refund", () => {
  assert.throws(
    () =>
      allocateCancellationRefund(
        [source("same", "card", 3_000), source("same", "card", 3_000)],
        4_000,
      ),
    (error) =>
      error instanceof BookingCancellationError &&
      error.code === "financial_source_conflict",
  );
});

test("rifiuta una somma degli incassi oltre Number.MAX_SAFE_INTEGER", () => {
  assert.throws(
    () =>
      allocateCancellationRefund(
        [
          source("max", "card", Number.MAX_SAFE_INTEGER),
          source("extra", "manual", 1),
        ],
        1,
      ),
    (error) =>
      error instanceof BookingCancellationError &&
      error.code === "financial_source_conflict",
  );
});

test("il transactionReference applicato prevale sul puntatore all'ultimo PI", () => {
  assert.equal(
    acceptedPaymentIntentReference({
      transactionReference: "pi_applied",
      stripePaymentIntentId: "pi_later_duplicate",
    }),
    "pi_applied",
  );
});

test("le business key di case, allocation e comando admin sono deterministiche", () => {
  const caseId = "11111111-1111-4111-8111-111111111111";
  const commandId = "22222222-2222-4222-8222-222222222222";
  assert.equal(
    cancellationRefundIdempotencyKey(caseId, "pi_paid"),
    cancellationRefundIdempotencyKey(caseId, "pi_paid"),
  );
  assert.notEqual(
    cancellationRefundIdempotencyKey(caseId, "pi_paid"),
    cancellationRefundIdempotencyKey(caseId, "pi_other"),
  );
  assert.equal(
    adminCancellationSourceKey("booking-1", commandId),
    adminCancellationSourceKey("booking-1", commandId),
  );
  assert.equal(
    adminCancellationSourceKey("BOOKING-1", commandId.toUpperCase()),
    adminCancellationSourceKey("booking-1", commandId),
  );
});

test("la riconciliazione attende refund esterni al case e cleanup persistenti", () => {
  const base = {
    expectedRefundCents: 3_000,
    caseRefunds: [{ amountCents: 3_000, status: "succeeded" }],
    activeAttemptsCount: 0,
    cleanupJobs: [] as Array<{ status: string }>,
  };
  assert.equal(
    classifyCancellationReconciliation({
      ...base,
      unresolvedBookingRefunds: [{ status: "processing" }],
    }),
    "refunding",
  );
  assert.equal(
    classifyCancellationReconciliation({
      ...base,
      unresolvedBookingRefunds: [],
      cleanupJobs: [{ status: "pending" }],
    }),
    "refunding",
  );
  assert.equal(
    classifyCancellationReconciliation({
      ...base,
      unresolvedBookingRefunds: [],
    }),
    "completed",
  );
});

test("mismatch economici e lavorazioni manuali impediscono il completamento", () => {
  assert.equal(
    classifyCancellationReconciliation({
      expectedRefundCents: 3_001,
      caseRefunds: [{ amountCents: 3_000, status: "succeeded" }],
      unresolvedBookingRefunds: [],
      activeAttemptsCount: 0,
      cleanupJobs: [],
    }),
    "manual_required",
  );
  assert.equal(
    classifyCancellationReconciliation({
      expectedRefundCents: 0,
      caseRefunds: [{ amountCents: 0, status: "succeeded" }],
      unresolvedBookingRefunds: [],
      activeAttemptsCount: 0,
      cleanupJobs: [],
    }),
    "manual_required",
  );
  assert.equal(
    classifyCancellationReconciliation({
      expectedRefundCents: 3_000,
      caseRefunds: [{ amountCents: 3_000, status: "manual_required" }],
      unresolvedBookingRefunds: [{ status: "manual_required" }],
      activeAttemptsCount: 0,
      cleanupJobs: [],
    }),
    "manual_required",
  );
});

test("superseded è terminale senza confonderlo con rejected", () => {
  assert.equal(isTerminalCancellationCaseWithoutRefund("superseded"), true);
  assert.equal(isTerminalCancellationCaseWithoutRefund("rejected"), true);
  assert.equal(isTerminalCancellationCaseWithoutRefund("refunding"), false);
});

test("reject e rimborso con penale richiedono una motivazione", () => {
  assert.throws(
    () => assertCancellationDecisionReason({ decision: "reject", note: null }),
    (error) =>
      error instanceof BookingCancellationError &&
      error.code === "decision_reason_required",
  );
  assert.throws(
    () => assertCancellationDecisionReason({ decision: "reject", note: "   " }),
    (error) =>
      error instanceof BookingCancellationError &&
      error.code === "decision_reason_required",
  );
  assert.throws(
    () =>
      assertCancellationDecisionReason({
        decision: "approve",
        note: null,
        approvedRefundCents: 2_000,
        refundableAtDecisionCents: 3_000,
      }),
    (error) =>
      error instanceof BookingCancellationError &&
      error.code === "decision_reason_required",
  );
  assert.doesNotThrow(() =>
    assertCancellationDecisionReason({
      decision: "approve",
      note: null,
      approvedRefundCents: 3_000,
      refundableAtDecisionCents: 3_000,
    }),
  );
});

test("retry manuale accetta solo lo stesso providerReference", () => {
  assert.doesNotThrow(() =>
    assertManualCompletionReference("CONTABILE-1", "CONTABILE-1"),
  );
  for (const existing of [null, "CONTABILE-2"] as const) {
    assert.throws(
      () => assertManualCompletionReference(existing, "CONTABILE-1"),
      (error) =>
        error instanceof BookingCancellationError &&
        error.code === "financial_source_conflict",
    );
  }
});
