import assert from "node:assert/strict";
import test from "node:test";
import {
  cancellationCaseIdFromOutboxKey,
  deadlineSnapshotFromOutboxKey,
  outboxSuppressionReason,
  paymentRequestIdFromOutboxKey,
  type OutboxApplicabilityInput,
  type OutboxBookingState,
  type OutboxPaymentRequestState,
} from "./email-outbox-applicability";

const BOOKING_ID = "11111111-1111-4111-8111-111111111111";
const REQUEST_ID = "22222222-2222-4222-8222-222222222222";
const CASE_ID = "33333333-3333-4333-8333-333333333333";
const NOW = new Date("2026-07-22T10:00:00.000Z");

function booking(
  overrides: Partial<OutboxBookingState> = {},
): OutboxBookingState {
  return {
    id: BOOKING_ID,
    seatStatus: "held",
    paymentStatus: "deposit_requested",
    paymentMethod: "bank_transfer",
    paymentType: "deposit",
    totalAmountCents: 10_000,
    amountPaidCents: 0,
    cancelledAt: null,
    cancellationRequestStatus: null,
    customerNotificationsEnabled: true,
    ...overrides,
  };
}

function paymentRequest(
  overrides: Partial<OutboxPaymentRequestState> = {},
): OutboxPaymentRequestState {
  return {
    id: REQUEST_ID,
    bookingId: BOOKING_ID,
    type: "deposit",
    status: "pending",
    method: "bank_transfer",
    deadline: new Date("2026-07-22T09:00:00.000Z"),
    graceUntil: new Date("2026-07-22T11:00:00.000Z"),
    paidAt: null,
    transactionReference: null,
    ...overrides,
  };
}

function reason(overrides: Partial<OutboxApplicabilityInput>): string | null {
  return outboxSuppressionReason({
    eventType: "booking.instructions.customer",
    dedupeKey: `booking:${BOOKING_ID}:instructions:v2`,
    booking: booking(),
    paymentRequest: paymentRequest(),
    now: NOW,
    ...overrides,
  });
}

test("estrae soltanto identificativi UUID dalle dedupe key canoniche", () => {
  assert.equal(
    paymentRequestIdFromOutboxKey(
      `payment-request:${REQUEST_ID}:payment-received-customer:v2`,
    ),
    REQUEST_ID,
  );
  assert.equal(
    paymentRequestIdFromOutboxKey(
      `payment-request:${BOOKING_ID}:deposit:payment-action-required:v2`,
    ),
    BOOKING_ID,
  );
  assert.equal(
    paymentRequestIdFromOutboxKey("booking:x:instructions:v2"),
    null,
  );
  assert.equal(
    cancellationCaseIdFromOutboxKey(
      `cancellation-case:${CASE_ID}:completed:customer:v2`,
    ),
    CASE_ID,
  );
});

test("istruzioni offline restano valide nella tolleranza ma non oltre graceUntil", () => {
  assert.equal(reason({}), null);
  assert.equal(
    reason({
      now: new Date("2026-07-22T11:00:00.001Z"),
    }),
    "payment_window_expired",
  );
  assert.equal(
    reason({
      paymentRequest: paymentRequest({ method: "office" }),
    }),
    "instructions_method_mismatch",
  );
  assert.equal(
    reason({ booking: booking({ seatStatus: "released" }) }),
    "booking_inactive",
  );
  assert.equal(
    reason({ booking: booking({ amountPaidCents: 10_000 }) }),
    "booking_settled",
  );
});

test("carta salvata parte soltanto nello stato scheduled ancora attivo", () => {
  const input = {
    eventType: "booking.card-saved.customer",
    dedupeKey: `booking:${BOOKING_ID}:card-saved:v2`,
    booking: booking({
      paymentStatus: "card_saved",
      paymentMethod: "card",
    }),
    paymentRequest: paymentRequest({
      type: "deposit",
      method: "card",
      status: "scheduled",
      deadline: null,
      graceUntil: null,
    }),
    now: NOW,
  } satisfies OutboxApplicabilityInput;
  assert.equal(outboxSuppressionReason(input), null);
  assert.equal(
    outboxSuppressionReason({
      ...input,
      paymentRequest: paymentRequest({
        type: "deposit",
        method: "card",
        status: "paid",
      }),
    }),
    "saved_card_request_stale",
  );
});

test("action-required collega la request della dedupe key e il suo stato", () => {
  const input = {
    eventType: "booking.payment-action-required.customer",
    dedupeKey: `payment-request:${REQUEST_ID}:payment-action-required-customer:v2`,
    booking: booking({
      paymentStatus: "charge_failed",
      paymentMethod: "card",
    }),
    paymentRequest: paymentRequest({
      method: "card",
      status: "action_required",
    }),
    now: NOW,
  } satisfies OutboxApplicabilityInput;
  assert.equal(outboxSuppressionReason(input), null);
  assert.equal(
    outboxSuppressionReason({
      ...input,
      paymentRequest: paymentRequest({ method: "card", status: "pending" }),
    }),
    "action_required_state_stale",
  );
  assert.equal(
    outboxSuppressionReason({
      ...input,
      paymentRequest: paymentRequest({
        id: "44444444-4444-4444-8444-444444444444",
        method: "card",
        status: "action_required",
      }),
    }),
    "payment_request_key_mismatch",
  );
});

test("una ricevuta paid resta fattuale anche a booking saldata e cancellata", () => {
  assert.equal(
    outboxSuppressionReason({
      eventType: "booking.payment-received.customer",
      dedupeKey: `payment-request:${REQUEST_ID}:payment-received-customer:v2`,
      booking: booking({
        seatStatus: "released",
        amountPaidCents: 10_000,
        cancelledAt: new Date("2026-07-22T10:01:00.000Z"),
        cancellationRequestStatus: "completed",
      }),
      paymentRequest: paymentRequest({
        status: "paid",
        paidAt: new Date("2026-07-22T09:55:00.000Z"),
        transactionReference: "pi_paid",
      }),
      now: NOW,
    }),
    null,
  );
});

test("il consenso persistente blocca qualsiasi comunicazione cliente", () => {
  assert.equal(
    reason({ booking: booking({ customerNotificationsEnabled: false }) }),
    "customer_notifications_disabled",
  );
});

test("una proroga viene soppressa quando deadline o grace sono state superate da una nuova proroga", () => {
  const key = `payment-request:${REQUEST_ID}:deadline-extended:2026-07-22T12:00:00.000Z:2026-07-22T13:00:00.000Z:v2`;
  assert.deepEqual(deadlineSnapshotFromOutboxKey(key), {
    deadline: new Date("2026-07-22T12:00:00.000Z"),
    graceUntil: new Date("2026-07-22T13:00:00.000Z"),
  });
  const input = {
    eventType: "booking.payment-deadline-extended.customer",
    dedupeKey: key,
    booking: booking(),
    paymentRequest: paymentRequest({
      deadline: new Date("2026-07-22T12:00:00.000Z"),
      graceUntil: new Date("2026-07-22T13:00:00.000Z"),
    }),
    now: NOW,
  } satisfies OutboxApplicabilityInput;
  assert.equal(outboxSuppressionReason(input), null);
  assert.equal(
    outboxSuppressionReason({
      ...input,
      paymentRequest: paymentRequest({
        deadline: new Date("2026-07-22T14:00:00.000Z"),
        graceUntil: new Date("2026-07-22T15:00:00.000Z"),
      }),
    }),
    "deadline_extension_superseded",
  );
});

test("conferma gita e richiesta cancellazione non partono da snapshot stale", () => {
  assert.equal(
    outboxSuppressionReason({
      eventType: "booking.excursion-confirmed.customer",
      dedupeKey: `booking:${BOOKING_ID}:excursion-confirmed:v2`,
      booking: booking(),
      excursionStatus: "confirmed",
      now: NOW,
    }),
    null,
  );
  assert.equal(
    outboxSuppressionReason({
      eventType: "booking.excursion-confirmed.customer",
      dedupeKey: `booking:${BOOKING_ID}:excursion-confirmed:v2`,
      booking: booking(),
      excursionStatus: "cancelled",
      now: NOW,
    }),
    "excursion_not_confirmed",
  );
  assert.equal(
    outboxSuppressionReason({
      eventType: "booking.cancellation-requested.customer",
      dedupeKey: `cancellation-case:${CASE_ID}:requested-customer:v2`,
      booking: booking(),
      cancellationCase: {
        id: CASE_ID,
        bookingId: BOOKING_ID,
        source: "customer",
        status: "approved",
      },
      now: NOW,
    }),
    "cancellation_request_stale",
  );
});
