import assert from "node:assert/strict";
import test from "node:test";
import { classifyBooking, isBookingScope } from "./account-bookings";

const ADESSO = new Date("2026-08-07T10:00:00Z");

test("una gita futura e in arrivo, una passata e passata", () => {
  assert.equal(
    classifyBooking(
      {
        departureAt: new Date("2026-09-01T06:30:00Z"),
        date: "2026-09-01",
        cancelledAt: null,
        seatStatus: "confirmed",
      },
      ADESSO,
    ),
    "upcoming",
  );
  assert.equal(
    classifyBooking(
      {
        departureAt: new Date("2026-07-01T06:30:00Z"),
        date: "2026-07-01",
        cancelledAt: null,
        seatStatus: "confirmed",
      },
      ADESSO,
    ),
    "past",
  );
});

test("senza orario di partenza la gita di oggi resta in arrivo", () => {
  // Caso limite reale: alle 10 del mattino la gita di oggi non e ancora
  // "passata". Confrontando la sola data si finirebbe per archiviarla mentre
  // il cliente e ancora in viaggio — e per nascondergli il pulsante dei
  // pagamenti proprio nel giorno in cui serve.
  assert.equal(
    classifyBooking(
      {
        departureAt: null,
        date: "2026-08-07",
        cancelledAt: null,
        seatStatus: "confirmed",
      },
      ADESSO,
    ),
    "upcoming",
  );
});

test("l'annullamento ha la precedenza sulla data", () => {
  // Una gita futura ma annullata non deve comparire fra i viaggi in arrivo.
  assert.equal(
    classifyBooking(
      {
        departureAt: new Date("2026-09-01T06:30:00Z"),
        date: "2026-09-01",
        cancelledAt: new Date("2026-08-01T00:00:00Z"),
        seatStatus: "confirmed",
      },
      ADESSO,
    ),
    "cancelled",
  );
});

test("i posti rilasciati contano come annullati", () => {
  // seatStatus 'released' e lo stato di chi non ha pagato entro la scadenza:
  // il posto non c'e piu, mostrarlo fra i viaggi in arrivo sarebbe una bugia.
  assert.equal(
    classifyBooking(
      {
        departureAt: new Date("2026-09-01T06:30:00Z"),
        date: "2026-09-01",
        cancelledAt: null,
        seatStatus: "released",
      },
      ADESSO,
    ),
    "cancelled",
  );
});

test("departureAt ha la precedenza su date quando entrambi ci sono", () => {
  // Data al futuro ma partenza reale gia avvenuta: vince l'istante preciso.
  assert.equal(
    classifyBooking(
      {
        departureAt: new Date("2026-08-07T05:00:00Z"),
        date: "2026-12-31",
        cancelledAt: null,
        seatStatus: "confirmed",
      },
      ADESSO,
    ),
    "past",
  );
});

test("il filtro accetta solo i tre valori previsti", () => {
  assert.equal(isBookingScope("upcoming"), true);
  assert.equal(isBookingScope("past"), true);
  assert.equal(isBookingScope("cancelled"), true);
  assert.equal(isBookingScope("tutti"), false);
  assert.equal(isBookingScope(""), false);
  assert.equal(isBookingScope(undefined), false);
  assert.equal(isBookingScope(["upcoming"]), false);
});
