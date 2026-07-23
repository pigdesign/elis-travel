import assert from "node:assert/strict";
import test from "node:test";
import {
  buildHomePickupBookingFields,
  canRequestHomePickup,
} from "./excursion-home-pickup";

test("il servizio casa è selezionabile sia per gite standard sia RIDENT con punti attivi", () => {
  for (const tripType of ["standard", "rident"] as const) {
    assert.equal(
      canRequestHomePickup({ tripType, hasPickupPoints: true }),
      true,
      tripType,
    );
  }
});

test("il servizio casa non è proposto senza punti di raccolta", () => {
  assert.equal(
    canRequestHomePickup({
      tripType: "rident",
      hasPickupPoints: false,
    }),
    false,
  );
});

test("il payload invia indirizzo normalizzato solo quando il servizio è richiesto", () => {
  assert.deepEqual(buildHomePickupBookingFields(false, " Via Roma 10 "), {});
  assert.deepEqual(buildHomePickupBookingFields(true, " Via Roma 10 "), {
    servizioCasa: true,
    homePickupAddress: "Via Roma 10",
  });
});
