import assert from "node:assert/strict";
import test from "node:test";
import {
  CUSTOMER_SESSION_PATHS,
  isCustomerSessionPath,
} from "./session-routing";

test("i path dell'area clienti usano la sessione cliente", () => {
  assert.equal(isCustomerSessionPath("/api/account"), true);
  assert.equal(isCustomerSessionPath("/api/account/me"), true);
  assert.equal(isCustomerSessionPath("/api/account/magic-link"), true);
  assert.equal(isCustomerSessionPath("/api/booking-portal"), true);
  assert.equal(isCustomerSessionPath("/api/booking-portal/cancellation"), true);
});

test("i path admin restano sulla sessione admin", () => {
  assert.equal(isCustomerSessionPath("/api/auth/login"), false);
  assert.equal(isCustomerSessionPath("/api/admin/excursions"), false);
});

// Regressione: questi due endpoint sono protetti da requireAuth ma NON stanno
// sotto /api/admin. Se finissero sulla sessione cliente, l'upload di immagini e
// documenti dal backoffice risponderebbe 401.
test("gli upload dello storage restano sulla sessione admin", () => {
  assert.equal(isCustomerSessionPath("/api/storage/uploads/ftp"), false);
  assert.equal(isCustomerSessionPath("/api/storage/uploads/request-url"), false);
});

test("il prefisso non deve combaciare a meta segmento", () => {
  // Un ipotetico /api/accounting non e area clienti: senza il confronto sul
  // segmento intero erediterebbe la sessione a 90 giorni.
  assert.equal(isCustomerSessionPath("/api/accounting"), false);
  assert.equal(isCustomerSessionPath("/api/account-export"), false);
  assert.equal(isCustomerSessionPath("/api/booking-portal-admin"), false);
});

test("le route pubbliche non rientrano nell'area clienti", () => {
  assert.equal(isCustomerSessionPath("/api/excursions"), false);
  assert.equal(isCustomerSessionPath("/api/leads"), false);
  assert.equal(isCustomerSessionPath("/api/healthz"), false);
  assert.equal(isCustomerSessionPath("/api/webhooks/stripe"), false);
});

test("l'elenco dei path clienti resta quello atteso", () => {
  // Il valore e un contratto con app.ts: se cambia, va cambiato anche il
  // ragionamento sul perche la lista enumera i clienti e non gli admin.
  assert.deepEqual([...CUSTOMER_SESSION_PATHS], [
    "/api/account",
    "/api/booking-portal",
  ]);
});
