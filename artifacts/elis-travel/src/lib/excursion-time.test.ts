import test from "node:test";
import assert from "node:assert/strict";
import {
  departureAtToRomeLocal,
  romeLocalDateTimeToIso,
} from "./excursion-time";

test("converte l'ora di Roma con offset invernale ed estivo", () => {
  assert.equal(romeLocalDateTimeToIso("2026-01-15", "08:30"), "2026-01-15T07:30:00.000Z");
  assert.equal(romeLocalDateTimeToIso("2026-07-15", "08:30"), "2026-07-15T06:30:00.000Z");
});

test("rifiuta un orario inesistente nel cambio all'ora legale", () => {
  assert.equal(romeLocalDateTimeToIso("2026-03-29", "02:30"), null);
});

test("round trip conserva data e ora locali", () => {
  const iso = romeLocalDateTimeToIso("2026-10-25", "02:30");
  assert.ok(iso);
  assert.deepEqual(departureAtToRomeLocal(iso), { date: "2026-10-25", time: "02:30" });
});
