import assert from "node:assert/strict";
import test from "node:test";
import {
  cleanBookingPortalPath,
  selectBookingPortalToken,
} from "./booking-portal-token";

test("il token del link prevale sulla sessione e il legacy resta compatibile", () => {
  assert.equal(
    selectBookingPortalToken({
      queryToken: "v1.query-token",
      legacyToken: "v1.legacy-token",
      sessionToken: "v1.session-token",
    }),
    "v1.query-token",
  );
  assert.equal(
    selectBookingPortalToken({
      legacyToken: "v1.legacy-token",
      sessionToken: "v1.session-token",
    }),
    "v1.legacy-token",
  );
});

test("rifiuta token vuoti o anomali e ripiega sulla sessione", () => {
  assert.equal(
    selectBookingPortalToken({
      queryToken: " bad token ",
      sessionToken: "v1.session-token",
    }),
    "v1.session-token",
  );
  assert.equal(selectBookingPortalToken({ queryToken: "short" }), "");
});

test("ripulisce token legacy e parametri di ritorno Stripe", () => {
  assert.equal(
    cleanBookingPortalPath("/prenotazione/v1.secret-token"),
    "/prenotazione",
  );
  assert.equal(
    cleanBookingPortalPath("/elis/prenotazione/v1.secret-token"),
    "/elis/prenotazione",
  );
});
