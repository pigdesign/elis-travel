import assert from "node:assert/strict";
import test from "node:test";
import { splitCustomerName } from "./customer-name";

test("nome e cognome semplici", () => {
  assert.deepEqual(splitCustomerName("Mario Rossi"), {
    firstName: "Mario",
    lastName: "Rossi",
  });
});

test("i cognomi composti restano interi", () => {
  // "De Luca" non va spezzato: il cognome e tutto cio che segue il nome.
  assert.deepEqual(splitCustomerName("Anna De Luca"), {
    firstName: "Anna",
    lastName: "De Luca",
  });
});

test("un nome solo non inventa un cognome", () => {
  assert.deepEqual(splitCustomerName("Giovanni"), {
    firstName: "Giovanni",
    lastName: null,
  });
});

test("spazi in eccesso non producono campi vuoti", () => {
  // Il copia-incolla nei form lascia spesso spazi doppi o iniziali.
  assert.deepEqual(splitCustomerName("  Luca   Bianchi  "), {
    firstName: "Luca",
    lastName: "Bianchi",
  });
});

test("valori assenti o vuoti danno due null", () => {
  assert.deepEqual(splitCustomerName(""), { firstName: null, lastName: null });
  assert.deepEqual(splitCustomerName("   "), { firstName: null, lastName: null });
  assert.deepEqual(splitCustomerName(null), { firstName: null, lastName: null });
  assert.deepEqual(splitCustomerName(undefined), {
    firstName: null,
    lastName: null,
  });
});
