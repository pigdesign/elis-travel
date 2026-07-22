import assert from "node:assert/strict";
import test from "node:test";
import {
  authoritativeOccupiedSeats,
  decideExcursionCapacity,
} from "./excursion-capacity";

test("una nuova prenotazione non può superare i posti disponibili", () => {
  assert.equal(
    decideExcursionCapacity({
      capacity: 50,
      occupiedSeats: 48,
      additionalSeats: 3,
    }).allowed,
    false,
  );
  assert.equal(
    decideExcursionCapacity({
      capacity: 50,
      occupiedSeats: 48,
      additionalSeats: 2,
    }).allowed,
    true,
  );
});

test("una capienza positiva non può scendere sotto i posti occupati", () => {
  const decision = decideExcursionCapacity({
    capacity: 39,
    occupiedSeats: 40,
  });
  assert.equal(decision.allowed, false);
  assert.equal(decision.requiredSeats, 40);
});

test("zero conserva la semantica esistente di capienza illimitata", () => {
  assert.equal(
    decideExcursionCapacity({ capacity: 0, occupiedSeats: 500 }).allowed,
    true,
  );
});

test("il guard usa il valore più prudente tra righe attive e contatore", () => {
  assert.equal(authoritativeOccupiedSeats(12, 15), 15);
  assert.equal(authoritativeOccupiedSeats(18, 15), 18);
});
