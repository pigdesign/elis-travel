import assert from "node:assert/strict";
import test from "node:test";
import {
  balanceRequestDepartureState,
  canCreateBalanceRequestAfterLatest,
} from "./booking-balance";

test("il saldo richiede una partenza strettamente futura", () => {
  const now = new Date("2026-08-10T10:00:00.000Z");
  assert.equal(balanceRequestDepartureState(null, now), "missing_departure");
  assert.equal(
    balanceRequestDepartureState(new Date("2026-08-10T09:59:59.999Z"), now),
    "trip_departed",
  );
  assert.equal(
    balanceRequestDepartureState(new Date(now), now),
    "trip_departed",
  );
  assert.equal(
    balanceRequestDepartureState(new Date("2026-08-10T10:00:00.001Z"), now),
    "open",
  );
});

test("il primo saldo può essere creato", () => {
  assert.equal(
    canCreateBalanceRequestAfterLatest({
      latestRequestStatus: null,
      hasUnresolvedRefund: false,
    }),
    true,
  );
});

test("un saldo rimborsato terminalmente può essere riemesso", () => {
  assert.equal(
    canCreateBalanceRequestAfterLatest({
      latestRequestStatus: "refunded",
      hasUnresolvedRefund: false,
    }),
    true,
  );
});

test("un rimborso ancora aperto impedisce la riemissione del saldo", () => {
  assert.equal(
    canCreateBalanceRequestAfterLatest({
      latestRequestStatus: "refunded",
      hasUnresolvedRefund: true,
    }),
    false,
  );
});

test("le richieste scadute e gli stati economici non terminali restano riutilizzabili o prorogabili", () => {
  for (const status of [
    "pending",
    "scheduled",
    "action_required",
    "expired",
    "paid",
    "refund_required",
    "partially_refunded",
  ]) {
    assert.equal(
      canCreateBalanceRequestAfterLatest({
        latestRequestStatus: status,
        hasUnresolvedRefund: false,
      }),
      false,
      status,
    );
  }
});
