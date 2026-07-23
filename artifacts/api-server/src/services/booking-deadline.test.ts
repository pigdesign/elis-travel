import assert from "node:assert/strict";
import test from "node:test";
import {
  canRevisitExpiredSeatHold,
  canReleaseOverdueBooking,
  chooseDeadlineExtensionTarget,
  planExpiredCardAttemptCleanup,
} from "./booking-deadline";

test("la proroga non riapre un acconto storico quando esiste un saldo più recente", () => {
  const deposit = {
    id: "deposit-old",
    status: "expired",
    createdAt: new Date("2026-01-01T10:00:00Z"),
  };
  const balance = {
    id: "balance-current",
    status: "pending",
    createdAt: new Date("2026-02-01T10:00:00Z"),
  };
  assert.equal(
    chooseDeadlineExtensionTarget([deposit, balance], deposit.id),
    null,
  );
  assert.equal(
    chooseDeadlineExtensionTarget([deposit, balance], balance.id)?.id,
    balance.id,
  );
});

test("ogni tentativo Stripe scaduto richiede un cleanup durevole prima del commit", () => {
  assert.deepEqual(
    planExpiredCardAttemptCleanup([
      { id: "local-only", stripePaymentIntentId: null },
      { id: "card-1", stripePaymentIntentId: "pi_1" },
      { id: "card-2", stripePaymentIntentId: "pi_2" },
    ]),
    [
      { attemptId: "card-1", paymentIntentId: "pi_1" },
      { attemptId: "card-2", paymentIntentId: "pi_2" },
    ],
  );
});

test("una richiesta già pagata non è prorogabile", () => {
  const paid = {
    id: "paid",
    status: "paid",
    createdAt: new Date("2026-02-01T10:00:00Z"),
  };
  assert.equal(chooseDeadlineExtensionTarget([paid], paid.id), null);
});

test("una scadenza con fondi non libera posti senza decisione di annullamento", () => {
  assert.equal(canReleaseOverdueBooking(0), true);
  assert.equal(canReleaseOverdueBooking(1), false);
  assert.equal(canReleaseOverdueBooking(3_000), false);
});

test("un secondo passaggio può liberare una booking già expired ma ancora held", () => {
  assert.equal(
    canRevisitExpiredSeatHold({
      releaseSeats: true,
      paymentStatus: "expired",
      seatStatus: "held",
      amountPaidCents: 0,
    }),
    true,
  );
  assert.equal(
    canRevisitExpiredSeatHold({
      releaseSeats: true,
      paymentStatus: "expired",
      seatStatus: "held",
      amountPaidCents: 1,
    }),
    false,
  );
});
