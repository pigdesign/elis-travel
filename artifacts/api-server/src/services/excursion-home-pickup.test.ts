import assert from "node:assert/strict";
import test from "node:test";
import {
  HomePickupValidationError,
  normalizeHomePickupRequest,
} from "./excursion-home-pickup";

test("normalizza e conserva l'indirizzo solo quando il servizio è richiesto", () => {
  assert.deepEqual(
    normalizeHomePickupRequest(
      {
        servizioCasa: true,
        homePickupAddress: "  Via   Roma 10, Genova  ",
      },
      { available: true },
    ),
    {
      servizioCasa: true,
      homePickupAddress: "Via Roma 10, Genova",
    },
  );
  assert.deepEqual(
    normalizeHomePickupRequest(
      { servizioCasa: false, homePickupAddress: "dato da ignorare" },
      { available: true },
    ),
    { servizioCasa: false, homePickupAddress: null },
  );
});

test("rifiuta servizio non disponibile, indirizzo assente o troppo lungo", () => {
  assert.throws(
    () =>
      normalizeHomePickupRequest(
        { servizioCasa: true, homePickupAddress: "Via Roma 10" },
        { available: false },
      ),
    HomePickupValidationError,
  );
  assert.throws(
    () =>
      normalizeHomePickupRequest(
        { servizioCasa: true, homePickupAddress: "   " },
        { available: true },
      ),
    HomePickupValidationError,
  );
  assert.throws(
    () =>
      normalizeHomePickupRequest(
        { servizioCasa: true, homePickupAddress: "x".repeat(501) },
        { available: true },
      ),
    HomePickupValidationError,
  );
});
