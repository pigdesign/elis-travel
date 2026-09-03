import assert from "node:assert/strict";
import test from "node:test";
import {
  balancePaymentWindowForMethod,
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

test("un saldo annullato dall'amministrazione puo essere riemesso", () => {
  assert.equal(
    canCreateBalanceRequestAfterLatest({
      latestRequestStatus: "cancelled",
      hasUnresolvedRefund: false,
    }),
    true,
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

test("il saldo a bordo resta esigibile fino alla partenza", () => {
  const now = new Date("2026-08-01T10:00:00.000Z");
  const departureAt = new Date("2026-08-10T06:00:00.000Z");
  const onBus = balancePaymentWindowForMethod({
    method: "on_bus",
    departureAt,
    balanceHours: 48,
    graceMinutes: 120,
    now,
  });
  assert.deepEqual(onBus, { deadline: departureAt, graceUntil: departureAt });

  // Tornando a un metodo da pagare prima di salire si riprende la scadenza
  // canonica del saldo, senza regalare i giorni guadagnati con il bus.
  const bankTransfer = balancePaymentWindowForMethod({
    method: "bank_transfer",
    departureAt,
    balanceHours: 48,
    graceMinutes: 120,
    now,
  });
  assert.equal(
    bankTransfer?.deadline.toISOString(),
    "2026-08-08T06:00:00.000Z",
  );
  assert.equal(
    bankTransfer?.graceUntil.toISOString(),
    "2026-08-08T08:00:00.000Z",
  );
});

test("un saldo gia dovuto resta pagabile da adesso e mai oltre la partenza", () => {
  const now = new Date("2026-08-09T12:00:00.000Z");
  const departureAt = new Date("2026-08-10T06:00:00.000Z");
  const window = balancePaymentWindowForMethod({
    method: "office",
    departureAt,
    balanceHours: 48,
    // Tolleranza volutamente piu lunga della partenza: deve essere tagliata li.
    graceMinutes: 1_440,
    now,
  });
  assert.equal(window?.deadline.toISOString(), now.toISOString());
  assert.equal(window?.graceUntil.toISOString(), departureAt.toISOString());
});

test("senza una partenza nota la finestra del saldo non viene toccata", () => {
  assert.equal(
    balancePaymentWindowForMethod({
      method: "on_bus",
      departureAt: null,
      balanceHours: 48,
      graceMinutes: 120,
      now: new Date("2026-08-01T10:00:00.000Z"),
    }),
    null,
  );
});
