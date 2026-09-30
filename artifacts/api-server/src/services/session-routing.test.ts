import assert from "node:assert/strict";
import test from "node:test";
import {
  CUSTOMER_SESSION_PATHS,
  CUSTOMER_SESSION_PATTERNS,
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

test("la creazione di una prenotazione vede la sessione cliente", () => {
  // Serve a collegare subito la gita a chi e gia dentro l'area clienti.
  assert.equal(
    isCustomerSessionPath("/api/excursions/7a0f6f1e-1111-2222-3333-444455556666/book"),
    true,
  );
});

// Regressione: il raggio d'azione e UNA rotta, non il prefisso /api/excursions.
// La sessione cliente e `rolling` e scrive sullo store a ogni richiesta; /quote
// viene chiamata a ogni ricalcolo di prezzo nel modulo di prenotazione.
test("le altre rotte delle gite restano fuori", () => {
  assert.equal(isCustomerSessionPath("/api/excursions/abc/quote"), false);
  assert.equal(isCustomerSessionPath("/api/excursions/bookings/abc/cancel"), false);
  // Deve combaciare fino in fondo, niente sotto-percorsi.
  assert.equal(isCustomerSessionPath("/api/excursions/abc/book/extra"), false);
  assert.equal(isCustomerSessionPath("/api/excursions/abc/booking"), false);
});

// Regressione: la creazione dal backoffice e /api/admin/excursions/:id/bookings.
// Se finisse sulla sessione cliente, l'ufficio perderebbe requireAuth.
test("la creazione dall'ufficio resta sulla sessione admin", () => {
  assert.equal(isCustomerSessionPath("/api/admin/excursions/abc/bookings"), false);
  assert.equal(isCustomerSessionPath("/api/admin/excursions/abc/book"), false);
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
  // Stesso contratto per le rotte singole: ogni aggiunta qui allarga la
  // sessione a novanta giorni e va pesata, non fatta di passaggio.
  assert.deepEqual(
    CUSTOMER_SESSION_PATTERNS.map((pattern) => pattern.source),
    [/^\/api\/excursions\/[^/]+\/book$/.source],
  );
});
