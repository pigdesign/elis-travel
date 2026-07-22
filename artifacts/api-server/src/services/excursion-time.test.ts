import test from "node:test";
import assert from "node:assert/strict";
import {
  calendarDateInRome,
  computeGraceUntil,
  computeBalanceDueAt,
  departureUpdateRequiresReschedule,
  endOfDayInRome,
  hasExcursionDeparted,
  isDepartureOpenForBooking,
  parseDepartureAt,
} from "./excursion-time";

test("l'orario legacy si può valorizzare una sola volta senza riprogrammare", () => {
  const departure = new Date("2026-08-10T06:30:00.000Z");
  assert.equal(departureUpdateRequiresReschedule(null, departure), false);
  assert.equal(departureUpdateRequiresReschedule(departure, departure), false);
  assert.equal(
    departureUpdateRequiresReschedule(
      departure,
      new Date("2026-08-10T07:30:00.000Z"),
    ),
    true,
  );
  assert.equal(departureUpdateRequiresReschedule(departure, null), true);
});

test("parseDepartureAt rifiuta timestamp senza offset", () => {
  assert.equal(parseDepartureAt("2026-08-10T08:30:00"), null);
  assert.equal(
    parseDepartureAt("2026-08-10T08:30:00+02:00")?.toISOString(),
    "2026-08-10T06:30:00.000Z",
  );
});

test("la tolleranza è aggiunta alla deadline ma non supera mai la partenza", () => {
  assert.equal(
    computeGraceUntil({
      deadline: new Date("2026-08-10T05:00:00.000Z"),
      graceMinutes: 30,
      departureAt: new Date("2026-08-10T06:00:00.000Z"),
    }).toISOString(),
    "2026-08-10T05:30:00.000Z",
  );
  assert.equal(
    computeGraceUntil({
      deadline: new Date("2026-08-10T05:50:00.000Z"),
      graceMinutes: 30,
      departureAt: new Date("2026-08-10T06:00:00.000Z"),
    }).toISOString(),
    "2026-08-10T06:00:00.000Z",
  );
});

test("la chiusura amministrativa e ammessa solo dalla partenza in poi", () => {
  const now = new Date("2026-08-10T06:30:00.000Z");
  assert.equal(hasExcursionDeparted(null, now), false);
  assert.equal(hasExcursionDeparted(new Date(now), now), true);
  assert.equal(hasExcursionDeparted("2026-08-10T08:31:00+02:00", now), false);
});

test("la prenotazione richiede una partenza futura e non accetta il confine esatto", () => {
  const now = new Date("2026-08-10T06:30:00.000Z");
  assert.equal(isDepartureOpenForBooking(null, now), false);
  assert.equal(isDepartureOpenForBooking(new Date(now), now), false);
  assert.equal(
    isDepartureOpenForBooking("2026-08-10T08:31:00+02:00", now),
    true,
  );
});

test("calendarDateInRome usa il giorno civile italiano", () => {
  assert.equal(
    calendarDateInRome(new Date("2026-07-21T22:30:00.000Z")),
    "2026-07-22",
  );
});

test("il saldo scade esattamente 48 ore prima dell'istante di partenza", () => {
  assert.equal(
    computeBalanceDueAt("2026-08-10T08:30:00+02:00")?.toISOString(),
    "2026-08-08T06:30:00.000Z",
  );
});

test("computeBalanceDueAt non ripiega sulla sola data", () => {
  assert.equal(computeBalanceDueAt("2026-08-10"), null);
});

test("endOfDayInRome non dipende dal timezone server e rispetta l'ora legale", () => {
  assert.equal(
    endOfDayInRome("2026-01-15")?.toISOString(),
    "2026-01-15T22:59:59.999Z",
  );
  assert.equal(
    endOfDayInRome("2026-07-15")?.toISOString(),
    "2026-07-15T21:59:59.999Z",
  );
  assert.equal(
    endOfDayInRome("2026-03-29")?.toISOString(),
    "2026-03-29T21:59:59.999Z",
  );
  assert.equal(endOfDayInRome("2026-02-30"), null);
});
