import test from "node:test";
import assert from "node:assert/strict";
import {
  cardPaymentApplicationDisposition,
  decideManualPaymentReplay,
  isExpectedCardPaymentAmount,
  isSuccessfulCardPaymentWithinWindow,
  manualPaymentSeatRecoveryDecision,
  paymentAccountingStatusBeforeTransition,
  paymentStatusAfterPayment,
} from "./excursion-payments";

test("il pagamento manuale non riacquisisce capacità dopo la partenza", () => {
  const now = new Date("2026-08-10T10:00:00.000Z");
  assert.equal(
    manualPaymentSeatRecoveryDecision({
      seatStatus: "released",
      departureAt: new Date("2026-08-10T10:00:00.000Z"),
      now,
    }),
    "departed",
  );
  assert.equal(
    manualPaymentSeatRecoveryDecision({
      seatStatus: "released",
      departureAt: new Date("2026-08-10T11:00:00.000Z"),
      now,
    }),
    "reacquire",
  );
  assert.equal(
    manualPaymentSeatRecoveryDecision({
      seatStatus: "confirmed",
      departureAt: new Date("2026-08-10T09:00:00.000Z"),
      now,
    }),
    "not_required",
  );
  assert.equal(
    manualPaymentSeatRecoveryDecision({
      seatStatus: "released",
      departureAt: null,
      now,
    }),
    "departed",
  );
});

test("un PaymentIntent succeeded non diventa successo UI senza applicazione contabile", () => {
  assert.equal(cardPaymentApplicationDisposition(null), "not_applied");
  assert.equal(
    cardPaymentApplicationDisposition({
      bookingId: "booking-1",
      paymentRequestId: "request-1",
      requestType: "deposit",
      alreadyApplied: true,
      refundInitiated: true,
      refundStatus: "processing",
    }),
    "refund_initiated",
  );
  assert.equal(
    cardPaymentApplicationDisposition({
      bookingId: "booking-1",
      paymentRequestId: "request-1",
      requestType: "deposit",
      alreadyApplied: false,
    }),
    "applied",
  );
});

test("un acconto parziale resta deposit", () => {
  assert.equal(paymentStatusAfterPayment("deposit", 3_000, 10_000), "deposit");
});

test("il raggiungimento del totale prevale sul tipo richiesta", () => {
  assert.equal(paymentStatusAfterPayment("deposit", 10_000, 10_000), "paid");
  assert.equal(paymentStatusAfterPayment("balance", 10_500, 10_000), "paid");
});

test("una richiesta full riuscita chiude il pagamento", () => {
  assert.equal(paymentStatusAfterPayment("full", 10_000, null), "paid");
});

test("il saldo riconosce l'acconto anche dopo il passaggio a balance_requested", () => {
  assert.equal(
    paymentAccountingStatusBeforeTransition({
      paymentStatus: "balance_requested",
      amountPaidCents: 3_000,
      totalAmountCents: 10_000,
    }),
    "deposit",
  );
});

test("un vecchio PaymentIntent sottoimporto non soddisfa la richiesta aggiornata", () => {
  assert.equal(
    isExpectedCardPaymentAmount({
      paidAmountCents: 5_000,
      currency: "eur",
      attemptAmountCents: 5_000,
      requestAmountCents: 7_000,
      alreadyPaidCents: 3_000,
      totalAmountCents: 10_000,
    }),
    false,
  );
  assert.equal(
    isExpectedCardPaymentAmount({
      paidAmountCents: 7_000,
      currency: "eur",
      attemptAmountCents: 7_000,
      requestAmountCents: 7_000,
      alreadyPaidCents: 3_000,
      totalAmountCents: 10_000,
    }),
    true,
  );
});

test("l'importo Stripe deve coincidere anche con il tentativo associato", () => {
  assert.equal(
    isExpectedCardPaymentAmount({
      paidAmountCents: 7_000,
      currency: "eur",
      attemptAmountCents: 5_000,
      requestAmountCents: 7_000,
      alreadyPaidCents: 3_000,
      totalAmountCents: 10_000,
    }),
    false,
  );
});

test("un incasso carta è valido al confine di grace ma non dopo o dalla partenza", () => {
  const now = new Date("2026-08-10T10:00:00.000Z");
  const base = {
    requestStatus: "pending",
    deadline: new Date("2026-08-10T09:00:00.000Z"),
    graceUntil: new Date(now),
    departureAt: new Date("2026-08-10T11:00:00.000Z"),
    seatStatus: "held",
    now,
  };
  assert.equal(isSuccessfulCardPaymentWithinWindow(base), true);
  assert.equal(
    isSuccessfulCardPaymentWithinWindow({
      ...base,
      graceUntil: new Date("2026-08-10T09:59:59.999Z"),
    }),
    false,
  );
  assert.equal(
    isSuccessfulCardPaymentWithinWindow({
      ...base,
      departureAt: new Date(now),
    }),
    false,
  );
  assert.equal(
    isSuccessfulCardPaymentWithinWindow({
      ...base,
      seatStatus: "released",
    }),
    false,
  );
  assert.equal(
    isSuccessfulCardPaymentWithinWindow({
      ...base,
      cancellationRequestStatus: "pending",
    }),
    false,
  );
  assert.equal(
    isSuccessfulCardPaymentWithinWindow({
      ...base,
      cancellationRequestStatus: "approved",
    }),
    false,
  );
  assert.equal(
    isSuccessfulCardPaymentWithinWindow({
      ...base,
      requestMethod: "bank_transfer",
    }),
    false,
  );
});

test("la conferma manuale è limitata a offline e il replay richiede la stessa reference", () => {
  assert.equal(
    decideManualPaymentReplay({
      method: "card",
      status: "pending",
      storedReference: null,
      requestedReference: "contabile-1",
    }),
    "method_not_allowed",
  );
  assert.equal(
    decideManualPaymentReplay({
      method: "bank_transfer",
      status: "paid",
      storedReference: "cro-123",
      requestedReference: "cro-123",
    }),
    "already_applied",
  );
  assert.equal(
    decideManualPaymentReplay({
      method: "office",
      status: "paid",
      storedReference: "ricevuta-1",
      requestedReference: "ricevuta-2",
    }),
    "reference_conflict",
  );
});
