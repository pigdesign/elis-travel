import assert from "node:assert/strict";
import test from "node:test";
import {
  MISSING_PARTICIPANT_DETAILS_WARNING,
  buildMissingParticipantDetails,
  buildOnBusCollections,
  buildPickupReportPayment,
  hasCompletePickupReportParticipant,
  onBusCollectionAmountCents,
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

test("gli incassi a bordo seguono il residuo reale della prenotazione", () => {
  // Un versamento arrivato dopo la scelta del bus riduce quanto si incassa
  // alla partenza; la richiesta congelata non e la fonte autorevole.
  assert.equal(
    onBusCollectionAmountCents({
      requestAmountCents: 7_000,
      totalAmountCents: 10_000,
      amountPaidCents: 5_000,
    }),
    5_000,
  );
  assert.equal(
    onBusCollectionAmountCents({
      requestAmountCents: 7_000,
      totalAmountCents: 10_000,
      amountPaidCents: 3_000,
    }),
    7_000,
  );
  // Un saldo gia coperto non deve comparire nella lista dell'accompagnatore.
  assert.equal(
    onBusCollectionAmountCents({
      requestAmountCents: 7_000,
      totalAmountCents: 10_000,
      amountPaidCents: 10_000,
    }),
    0,
  );
});

test("la lista di bordo somma solo gli incassi ancora dovuti", () => {
  const { collections, totalCents } = buildOnBusCollections([
    {
      bookingId: "booking-1",
      bookingCode: "ET-001",
      referente: "Anna Rossi",
      phone: "+39 111",
      seats: 2,
      requestAmountCents: 7_000,
      totalAmountCents: 10_000,
      amountPaidCents: 3_000,
    },
    {
      bookingId: "booking-2",
      bookingCode: "ET-002",
      referente: "Marco Bianchi",
      phone: null,
      seats: 1,
      requestAmountCents: 3_500,
      totalAmountCents: 5_000,
      amountPaidCents: 5_000,
    },
  ]);
  assert.equal(collections.length, 1);
  assert.equal(collections[0]?.bookingId, "booking-1");
  assert.equal(collections[0]?.amountCents, 7_000);
  assert.equal(totalCents, 7_000);
});

test("lo stato di pagamento distingue saldato, incasso a bordo e residuo aperto", () => {
  assert.deepEqual(
    buildPickupReportPayment({
      paymentStatus: "paid",
      paymentMethod: "card",
      totalAmountCents: 10_000,
      amountPaidCents: 10_000,
      onBusCents: 0,
    }),
    {
      state: "paid",
      dueCents: 0,
      onBusCents: 0,
      totalCents: 10_000,
      paidCents: 10_000,
      method: "card",
    },
  );

  // L'incasso a bordo ha la precedenza: l'accompagnatore deve vedere subito
  // quanto ritira, anche quando il residuo totale e piu alto.
  const onBus = buildPickupReportPayment({
    paymentStatus: "deposit",
    paymentMethod: "on_bus",
    totalAmountCents: 10_000,
    amountPaidCents: 3_000,
    onBusCents: 5_000,
  });
  assert.equal(onBus.state, "due_on_bus");
  assert.equal(onBus.onBusCents, 5_000);
  assert.equal(onBus.dueCents, 7_000);

  const due = buildPickupReportPayment({
    paymentStatus: "deposit",
    paymentMethod: "bank_transfer",
    totalAmountCents: 10_000,
    amountPaidCents: 3_000,
    onBusCents: 0,
  });
  assert.equal(due.state, "due");
  assert.equal(due.dueCents, 7_000);
});

test("senza totale registrato non si inventa un residuo da chiedere a bordo", () => {
  const unknown = buildPickupReportPayment({
    paymentStatus: "pending",
    paymentMethod: null,
    totalAmountCents: null,
    amountPaidCents: 0,
    onBusCents: 0,
  });
  assert.equal(unknown.state, "unknown");
  assert.equal(unknown.dueCents, 0);

  // Le prenotazioni storiche gia saldate restano tali anche senza importi.
  assert.equal(
    buildPickupReportPayment({
      paymentStatus: "paid",
      paymentMethod: "office",
      totalAmountCents: null,
      amountPaidCents: 0,
      onBusCents: 0,
    }).state,
    "paid",
  );

  // Un versamento superiore al totale non produce un residuo negativo.
  assert.equal(
    buildPickupReportPayment({
      paymentStatus: "paid",
      paymentMethod: "card",
      totalAmountCents: 5_000,
      amountPaidCents: 6_000,
      onBusCents: 0,
    }).dueCents,
    0,
  );
});
