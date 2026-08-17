import assert from "node:assert/strict";
import test from "node:test";
import {
  clearSessionExpired,
  getSessionExpired,
  isAdminAuthError,
  markSessionExpired,
  subscribeSessionExpiry,
} from "./session-expiry";

test("riconosce un 401 su una chiamata del backoffice", () => {
  assert.equal(
    isAdminAuthError({
      status: 401,
      url: "https://manage.elis-travel.it/api/admin/excursions/abc",
    }),
    true,
  );
  assert.equal(
    isAdminAuthError({ status: 401, url: "/api/storage/uploads/ftp" }),
    true,
  );
});

test("non scambia per sessione scaduta i 401 che non lo sono", () => {
  // Area clienti: sessione separata, non c'entra col backoffice.
  assert.equal(
    isAdminAuthError({ status: 401, url: "/api/account/me" }),
    false,
  );
  assert.equal(
    isAdminAuthError({ status: 401, url: "/api/booking-portal/xyz" }),
    false,
  );
  // Risponde 401 anche solo visitando il sito da sloggati: e' assenza di
  // sessione, non scadenza.
  assert.equal(isAdminAuthError({ status: 401, url: "/api/auth/me" }), false);
  assert.equal(
    isAdminAuthError({ status: 401, url: "/api/catalog/products" }),
    false,
  );
  // Il gate Basic Auth risponde 401 sulle risorse statiche: niente fascia.
  assert.equal(isAdminAuthError({ status: 401, url: "/favicon.ico" }), false);
  // Altri stati non c'entrano.
  assert.equal(
    isAdminAuthError({ status: 500, url: "/api/admin/excursions" }),
    false,
  );
  assert.equal(isAdminAuthError(null), false);
  assert.equal(isAdminAuthError(new Error("rete")), false);
});

test("il segnale si accende, avvisa gli iscritti e si spegne", () => {
  clearSessionExpired();
  let notifications = 0;
  const unsubscribe = subscribeSessionExpiry(() => {
    notifications += 1;
  });

  try {
    assert.equal(getSessionExpired(), false);

    markSessionExpired();
    assert.equal(getSessionExpired(), true);
    assert.equal(notifications, 1);

    // Gia' acceso: non deve rinotificare a ogni 401 successivo.
    markSessionExpired();
    assert.equal(notifications, 1);

    clearSessionExpired();
    assert.equal(getSessionExpired(), false);
    assert.equal(notifications, 2);

    clearSessionExpired();
    assert.equal(notifications, 2);
  } finally {
    unsubscribe();
    clearSessionExpired();
  }
});

test("dopo la disiscrizione non arrivano piu' notifiche", () => {
  clearSessionExpired();
  let notifications = 0;
  const unsubscribe = subscribeSessionExpiry(() => {
    notifications += 1;
  });
  unsubscribe();

  try {
    markSessionExpired();
    assert.equal(notifications, 0);
    assert.equal(getSessionExpired(), true);
  } finally {
    clearSessionExpired();
  }
});
