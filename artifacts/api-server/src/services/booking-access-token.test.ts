import assert from "node:assert/strict";
import test from "node:test";
import {
  accessTokenExpiryMatches,
  normalizeAccessTokenExpiry,
  resolveBookingPortalOrigin,
} from "./booking-access-token";

test("la scadenza del token è canonica al secondo usato nella firma", () => {
  assert.equal(
    normalizeAccessTokenExpiry(
      new Date("2026-07-22T10:11:12.987Z"),
    ).toISOString(),
    "2026-07-22T10:11:12.000Z",
  );
  assert.equal(
    normalizeAccessTokenExpiry(
      new Date("2026-07-22T10:11:12.000Z"),
    ).toISOString(),
    "2026-07-22T10:11:12.000Z",
  );
});

test("un token legacy con millisecondi DB viene riconosciuto al secondo firmato", () => {
  assert.equal(
    accessTokenExpiryMatches(
      new Date("2026-07-22T10:11:12.987Z"),
      new Date("2026-07-22T10:11:12.000Z"),
    ),
    true,
  );
});

test("in produzione il portale richiede un origin HTTPS pubblico", () => {
  assert.equal(
    resolveBookingPortalOrigin("https://elis.example/", "production"),
    "https://elis.example",
  );
  assert.throws(
    () => resolveBookingPortalOrigin(undefined, "production"),
    /required in production/,
  );
  assert.throws(
    () => resolveBookingPortalOrigin("http://localhost:5173", "production"),
    /public HTTPS origin/,
  );
});
