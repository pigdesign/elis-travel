import assert from "node:assert/strict";
import test from "node:test";
import { decidePortalLink, sameBookingEmail } from "./booking-link-policy";

const base = {
  accountStatus: "active",
  accountEmail: "mario@example.it",
  bookingEmail: "mario@example.it",
  existingLink: null,
  requireSameEmail: true,
} as const;

test("stessa casella anche con maiuscole e spazi", () => {
  assert.equal(
    sameBookingEmail(" Mario@Example.it ", "mario@example.it"),
    true,
  );
  assert.equal(sameBookingEmail("mario@example.it", "maria@example.it"), false);
});

test("un indirizzo vuoto non coincide con niente", () => {
  assert.equal(sameBookingEmail("", ""), false);
  assert.equal(sameBookingEmail(null, "mario@example.it"), false);
  assert.equal(sameBookingEmail("  ", "  "), false);
});

test("automatico: stessa email e account attivo -> collega", () => {
  assert.equal(decidePortalLink(base), "link");
});

test("automatico: email diversa -> chiede conferma", () => {
  assert.equal(
    decidePortalLink({ ...base, bookingEmail: "mamma@example.it" }),
    "needs_confirmation",
  );
});

test("clic esplicito: collega anche con email diversa", () => {
  assert.equal(
    decidePortalLink({
      ...base,
      bookingEmail: "mamma@example.it",
      requireSameEmail: false,
    }),
    "link",
  );
});

test("gia collegata: nessun nuovo collegamento, anche con email diversa", () => {
  assert.equal(
    decidePortalLink({
      ...base,
      bookingEmail: "mamma@example.it",
      existingLink: { revoked: false },
    }),
    "already_linked",
  );
});

test("revocata dall'agenzia: non la riapre ne l'automatico ne il clic", () => {
  for (const requireSameEmail of [true, false]) {
    assert.equal(
      decidePortalLink({
        ...base,
        existingLink: { revoked: true },
        requireSameEmail,
      }),
      "revoked",
    );
  }
});

test("account non attivo o assente: mai collegata", () => {
  for (const accountStatus of ["pending", "blocked", null]) {
    assert.equal(
      decidePortalLink({ ...base, accountStatus }),
      "account_inactive",
    );
  }
});
