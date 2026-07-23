import assert from "node:assert/strict";
import test from "node:test";
import { validateExcursionAdminInput } from "./excursion-admin-validation";

test("rifiuta prezzi negativi o non rappresentabili in centesimi sicuri", () => {
  assert.equal(
    validateExcursionAdminInput({ pricePerPerson: -1 }, "fixed")?.field,
    "pricePerPerson",
  );
  assert.equal(
    validateExcursionAdminInput({ patientPrice: Number.MAX_VALUE }, "fixed")
      ?.field,
    "patientPrice",
  );
});

test("valida l'acconto secondo il tipo effettivo", () => {
  assert.equal(
    validateExcursionAdminInput({ depositValue: 101 }, "percent")?.field,
    "depositValue",
  );
  assert.equal(
    validateExcursionAdminInput({ depositValue: 101 }, "fixed"),
    null,
  );
});

test("rifiuta intervalli, extra e supplementi non validi", () => {
  assert.equal(
    validateExcursionAdminInput({ bankTransferHoursOverride: -2 }, "percent")
      ?.field,
    "bankTransferHoursOverride",
  );
  assert.equal(
    validateExcursionAdminInput(
      { extras: [{ name: "Ingresso", price: -3 }] },
      "percent",
    )?.field,
    "extras",
  );
  assert.equal(
    validateExcursionAdminInput({ provinceSurcharges: { IM: -5 } }, "percent")
      ?.field,
    "provinceSurcharges",
  );
});

test("accetta zero, null e valori economici coerenti", () => {
  assert.equal(
    validateExcursionAdminInput(
      {
        pricePerPerson: "0",
        depositValue: "30",
        currentCapacity: 50,
        balanceHoursOverride: null,
        extras: [{ name: "", price: 0 }],
        provinceSurcharges: { IM: 0, SV: "12.50" },
      },
      "percent",
    ),
    null,
  );
});
