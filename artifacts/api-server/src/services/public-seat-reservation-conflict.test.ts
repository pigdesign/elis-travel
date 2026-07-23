import assert from "node:assert/strict";
import test from "node:test";
import { classifyPublicSeatReservationUpdateMiss } from "./public-seat-reservation-conflict";

const future = new Date("2027-06-10T06:00:00.000Z");
const now = new Date("2027-06-01T10:00:00.000Z");

test("una versione riga diversa con posti disponibili e un conflitto, non un falso full", () => {
  assert.deepEqual(
    classifyPublicSeatReservationUpdateMiss({
      current: {
        status: "open",
        departureAt: future,
        currentCapacity: 5,
        adherentsCount: 0,
        rowVersion: "102",
      },
      expectedStatus: "open",
      expectedRowVersion: "101",
      requestedSeats: 1,
      now,
    }),
    { kind: "changed" },
  );
});

test("full viene restituito solo con la stessa versione e capienza realmente insufficiente", () => {
  assert.deepEqual(
    classifyPublicSeatReservationUpdateMiss({
      current: {
        status: "open",
        departureAt: future,
        currentCapacity: 5,
        adherentsCount: 4,
        rowVersion: "101",
      },
      expectedStatus: "open",
      expectedRowVersion: "101",
      requestedSeats: 2,
      now,
    }),
    { kind: "full", remaining: 1 },
  );
});

test("capienza zero resta illimitata e un miss inatteso non diventa full", () => {
  assert.deepEqual(
    classifyPublicSeatReservationUpdateMiss({
      current: {
        status: "open",
        departureAt: future,
        currentCapacity: 0,
        adherentsCount: 50,
        rowVersion: "101",
      },
      expectedStatus: "open",
      expectedRowVersion: "101",
      requestedSeats: 2,
      now,
    }),
    { kind: "changed" },
  );
});

test("stato chiuso e partenza trascorsa hanno precedenza sul conflitto", () => {
  assert.deepEqual(
    classifyPublicSeatReservationUpdateMiss({
      current: {
        status: "cancelled",
        departureAt: future,
        currentCapacity: 5,
        adherentsCount: 0,
        rowVersion: "102",
      },
      expectedStatus: "open",
      expectedRowVersion: "101",
      requestedSeats: 1,
      now,
    }),
    { kind: "closed" },
  );
  assert.deepEqual(
    classifyPublicSeatReservationUpdateMiss({
      current: {
        status: "open",
        departureAt: new Date("2027-06-01T09:00:00.000Z"),
        currentCapacity: 5,
        adherentsCount: 0,
        rowVersion: "102",
      },
      expectedStatus: "open",
      expectedRowVersion: "101",
      requestedSeats: 1,
      now,
    }),
    { kind: "departed" },
  );
});
