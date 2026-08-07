import assert from "node:assert/strict";
import test from "node:test";
import {
  countdownLabel,
  daysUntil,
  euro,
  pendingActionLabel,
  type AccountBooking,
} from "./account-bookings";

const base: AccountBooking = {
  bookingId: "b1",
  bookingCode: "ET-TEST01",
  excursionName: "Gita di prova",
  location: "Andora",
  departureAt: null,
  date: "2026-09-01",
  seats: 2,
  totalAmountCents: 10000,
  amountPaidCents: 0,
  residualCents: 10000,
  paymentStatus: "pending",
  seatStatus: "held",
  cancelledAt: null,
  cancellationRequestStatus: null,
  pendingAction: null,
};

test("il conto alla rovescia usa i giorni di calendario, non le 24 ore", () => {
  // Stasera alle 22, partenza domani alle 6: sono 8 ore, ma per una persona
  // e "domani". Contare gli istanti direbbe "fra 0 giorni".
  const stasera = new Date("2026-08-07T22:00:00");
  assert.equal(
    daysUntil({ departureAt: "2026-08-08T06:00:00", date: "2026-08-08" }, stasera),
    1,
  );
  assert.equal(countdownLabel(1), "domani");
});

test("le etichette del conto alla rovescia", () => {
  assert.equal(countdownLabel(0), "oggi");
  assert.equal(countdownLabel(1), "domani");
  assert.equal(countdownLabel(5), "fra 5 giorni");
  assert.equal(countdownLabel(-1), "");
});

test("senza orario di partenza si conta dal giorno", () => {
  const oggi = new Date("2026-08-07T09:00:00");
  assert.equal(daysUntil({ departureAt: null, date: "2026-08-07" }, oggi), 0);
  assert.equal(daysUntil({ departureAt: null, date: "2026-08-10" }, oggi), 3);
});

test("nessuna azione richiesta: nessuna etichetta", () => {
  assert.equal(pendingActionLabel(base), null);
});

test("la richiesta di annullamento non e un pagamento", () => {
  const b = { ...base, pendingAction: { kind: "cancellation_pending" as const } };
  const label = pendingActionLabel(b);
  assert.equal(label?.text, "Richiesta di annullamento in esame");
  assert.equal(label?.urgent, false);
});

test("un pagamento vicino alla scadenza e urgente, uno lontano no", () => {
  const fraDueGiorni = new Date(Date.now() + 2 * 86400000).toISOString();
  const fraDieciGiorni = new Date(Date.now() + 10 * 86400000).toISOString();

  const urgente = pendingActionLabel({
    ...base,
    pendingAction: { kind: "payment_due", amountCents: 5000, deadline: fraDueGiorni },
  });
  assert.equal(urgente?.urgent, true);

  const tranquillo = pendingActionLabel({
    ...base,
    pendingAction: { kind: "payment_due", amountCents: 5000, deadline: fraDieciGiorni },
  });
  assert.equal(tranquillo?.urgent, false);
});

test("una scadenza gia passata viene detta scaduta", () => {
  const ieri = new Date(Date.now() - 86400000).toISOString();
  const label = pendingActionLabel({
    ...base,
    pendingAction: { kind: "payment_due", amountCents: 5000, deadline: ieri },
  });
  assert.ok(label?.text.includes("scaduta"));
  assert.equal(label?.urgent, true);
});

test("un pagamento senza scadenza non allarma", () => {
  const label = pendingActionLabel({
    ...base,
    pendingAction: { kind: "payment_due", amountCents: 5000, deadline: null },
  });
  assert.equal(label?.urgent, false);
  assert.ok(label?.text.includes("50,00"));
});

test("gli importi sono in euro italiani", () => {
  assert.equal(euro(0), "0,00 €".replace(" ", " "));
  assert.ok(euro(12345).includes("123,45"));
});
