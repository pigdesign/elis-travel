import assert from "node:assert/strict";
import test from "node:test";
import {
  MISSING_PARTICIPANT_DETAILS_WARNING,
  buildMissingParticipantDetails,
  hasCompletePickupReportParticipant,
} from "./pickup-report";

test("segnala le prenotazioni attive prive di partecipanti senza inventare persone", () => {
  const result = buildMissingParticipantDetails(
    [
      {
        bookingId: "booking-detailed",
        bookingCode: "ET-001",
        customerName: "Anna Rossi",
        phone: "+39 111",
        seats: 2,
        servizioCasa: false,
        homePickupAddress: null,
      },
      {
        bookingId: "booking-missing",
        bookingCode: null,
        customerName: "Mario Bianchi",
        phone: null,
        seats: 3,
        servizioCasa: true,
        homePickupAddress: "Via Roma 10, Genova",
      },
    ],
    [
      {
        bookingId: "booking-detailed",
        firstName: "Anna",
        lastName: "Rossi",
        dataCompleted: true,
      },
      {
        bookingId: "booking-detailed",
        firstName: "Paolo",
        lastName: "Verdi",
        dataCompleted: true,
      },
    ],
  );

  assert.deepEqual(result, [
    {
      bookingId: "booking-missing",
      bookingCode: null,
      customerName: "Mario Bianchi",
      referente: "Mario Bianchi",
      phone: null,
      seats: 3,
      servizioCasa: true,
      homePickupAddress: "Via Roma 10, Genova",
      participantsDetailed: false,
      warning: `${MISSING_PARTICIPANT_DETAILS_WARNING} Sono presenti 0 nominativi per 3 posti.`,
    },
  ]);
});

test("segnala cardinalità diversa dai posti e righe anagrafiche incomplete", () => {
  const bookings = [
    {
      bookingId: "booking-partial",
      bookingCode: "ET-002",
      customerName: "Mario Bianchi",
      phone: null,
      seats: 3,
      servizioCasa: false,
      homePickupAddress: null,
    },
    {
      bookingId: "booking-incomplete",
      bookingCode: "ET-003",
      customerName: "Luisa Neri",
      phone: null,
      seats: 1,
      servizioCasa: false,
      homePickupAddress: null,
    },
  ];
  const participants = [
    {
      bookingId: "booking-partial",
      firstName: "Mario",
      lastName: "Bianchi",
      dataCompleted: true,
    },
    {
      bookingId: "booking-partial",
      firstName: "Giulia",
      lastName: "Bianchi",
      dataCompleted: true,
    },
    {
      bookingId: "booking-incomplete",
      firstName: "Luisa",
      lastName: " ",
      dataCompleted: true,
    },
  ];

  const result = buildMissingParticipantDetails(bookings, participants);

  assert.equal(result.length, 2);
  assert.match(result[0]!.warning, /2 nominativi per 3 posti/);
  assert.match(result[1]!.warning, /1 riga ha nome, cognome/);
  assert.equal(hasCompletePickupReportParticipant(participants[2]!), false);
});
