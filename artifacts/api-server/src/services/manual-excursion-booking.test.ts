import assert from "node:assert/strict";
import test from "node:test";
import {
  ManualBookingValidationError,
  isManuallyBookableExcursionStatus,
  manualBookingAccounting,
  manualBookingCommandFingerprint,
  manualParticipantDetailsAreUnchanged,
  normalizeManualBookingClientCommandId,
  normalizeManualCustomerNotifications,
  normalizeManualBookingFinancials,
  normalizeManualBookingParticipants,
} from "./manual-excursion-booking";

test("le comunicazioni cliente di una prenotazione manuale sono opt-in", () => {
  assert.equal(normalizeManualCustomerNotifications(undefined, null), false);
  assert.equal(
    normalizeManualCustomerNotifications(true, "anna@example.com"),
    true,
  );
  assert.throws(
    () => normalizeManualCustomerNotifications(true, null),
    ManualBookingValidationError,
  );
});

test("normalizza una prenotazione standard e deriva conteggi dalle righe", () => {
  const result = normalizeManualBookingParticipants(
    [
      { type: "adult", firstName: " Anna ", lastName: " Rossi " },
      { type: "child", firstName: " Luca ", lastName: " Rossi " },
    ],
    false,
  );
  assert.equal(result.seats, 2);
  assert.equal(result.adults, 1);
  assert.equal(result.children, 1);
  assert.deepEqual(result.participants[0], {
    type: "adult",
    firstName: "Anna",
    lastName: "Rossi",
    ageRangeId: null,
    ageRangeLabel: null,
    pickupPointId: null,
    pickupPointName: null,
    sortOrder: 0,
  });
});

test("valida raccolta RIDENT e fascia età dei bambini", () => {
  const pickupPoints = new Map([["pickup-1", "Stazione"]]);
  const ageRanges = new Map([["age-1", "3-10 anni"]]);
  const rident = normalizeManualBookingParticipants(
    [
      {
        type: "patient",
        firstName: "Anna",
        lastName: "Rossi",
        pickupPointId: "pickup-1",
      },
    ],
    true,
    { activePickupPoints: pickupPoints },
  );
  assert.equal(rident.participants[0]?.pickupPointName, "Stazione");

  const standard = normalizeManualBookingParticipants(
    [
      { type: "adult", firstName: "Anna", lastName: "Rossi" },
      {
        type: "child",
        firstName: "Luca",
        lastName: "Rossi",
        ageRangeId: "age-1",
      },
    ],
    false,
    {
      activePickupPoints: pickupPoints,
      activeAgeRanges: ageRanges,
      standardPickupPointId: "pickup-1",
    },
  );
  assert.equal(standard.participants[1]?.ageRangeLabel, "3-10 anni");
  assert.equal(standard.participants[1]?.pickupPointName, "Stazione");

  assert.throws(
    () =>
      normalizeManualBookingParticipants(
        [{ type: "patient", firstName: "Anna", lastName: "Rossi" }],
        true,
        { activePickupPoints: pickupPoints },
      ),
    ManualBookingValidationError,
  );
  assert.throws(
    () =>
      normalizeManualBookingParticipants(
        [
          { type: "adult", firstName: "Anna", lastName: "Rossi" },
          { type: "child", firstName: "Luca", lastName: "Rossi" },
        ],
        false,
        {
          activePickupPoints: pickupPoints,
          activeAgeRanges: ageRanges,
          standardPickupPointId: "pickup-1",
        },
      ),
    ManualBookingValidationError,
  );
});

test("riconosce un replace partecipanti identico senza riscrivere lo storico", () => {
  const normalized = normalizeManualBookingParticipants(
    [{ type: "adult", firstName: "Anna", lastName: "Rossi" }],
    false,
  ).participants;
  assert.equal(
    manualParticipantDetailsAreUnchanged(
      [
        {
          participantType: "adult",
          ageRangeId: null,
          ageRangeLabel: null,
          pickupPointId: null,
          pickupPointName: null,
          firstName: "Anna",
          lastName: "Rossi",
          dataCompleted: true,
          sortOrder: 0,
        },
      ],
      normalized,
    ),
    true,
  );
  assert.equal(
    manualParticipantDetailsAreUnchanged(
      [
        {
          participantType: "adult",
          ageRangeId: null,
          ageRangeLabel: null,
          pickupPointId: null,
          pickupPointName: null,
          firstName: "Anna",
          lastName: "Bianchi",
          dataCompleted: true,
          sortOrder: 0,
        },
      ],
      normalized,
    ),
    false,
  );
});

test("RIDENT richiede almeno un paziente e rifiuta tipi standard", () => {
  assert.throws(
    () =>
      normalizeManualBookingParticipants(
        [{ type: "companion", firstName: "Anna", lastName: "Rossi" }],
        true,
      ),
    ManualBookingValidationError,
  );
  assert.throws(
    () =>
      normalizeManualBookingParticipants(
        [{ type: "adult", firstName: "Anna", lastName: "Rossi" }],
        true,
      ),
    ManualBookingValidationError,
  );
});

test("solo gite aperte o confermate accettano prenotazioni manuali", () => {
  assert.equal(isManuallyBookableExcursionStatus("open"), true);
  assert.equal(isManuallyBookableExcursionStatus("confirmed"), true);
  assert.equal(isManuallyBookableExcursionStatus("draft"), false);
  assert.equal(isManuallyBookableExcursionStatus("completed"), false);
  assert.equal(isManuallyBookableExcursionStatus("cancelled"), false);
});

test("pagamenti manuali confermati allineano posto e contatori", () => {
  assert.deepEqual(manualBookingAccounting("pending", 3), {
    seatStatus: "held",
    depositsDelta: 0,
    balancesDelta: 0,
  });
  assert.deepEqual(manualBookingAccounting("deposit", 3), {
    seatStatus: "confirmed",
    depositsDelta: 3,
    balancesDelta: 0,
  });
  assert.deepEqual(manualBookingAccounting("paid", 3), {
    seatStatus: "confirmed",
    depositsDelta: 0,
    balancesDelta: 3,
  });
});

test("una prenotazione manuale gratuita è saldata senza metodo o riferimento", () => {
  const free = normalizeManualBookingFinancials(
    {
      paymentStatus: "paid",
      totalAmountCents: 0,
      paymentAmountCents: 0,
      paymentMethod: null,
    },
    {
      excursionStatus: "confirmed",
      departureAt: new Date("2026-07-25T10:00:00.000Z"),
      graceMinutes: 60,
      seats: 2,
      now: new Date("2026-07-20T10:00:00.000Z"),
    },
  );
  assert.equal(free.paymentStatus, "paid");
  assert.equal(free.paymentMethod, null);
  assert.equal(free.totalAmountCents, 0);
  assert.equal(free.amountPaidCents, 0);
  assert.equal(free.amountDueCents, 0);
  assert.equal(free.transactionReference, null);
  assert.equal(free.seatStatus, "confirmed");
  assert.equal(free.balancesDelta, 2);

  assert.throws(
    () =>
      normalizeManualBookingFinancials(
        {
          paymentStatus: "paid",
          totalAmountCents: 0,
          paymentAmountCents: 0,
          paymentMethod: "office",
        },
        {
          excursionStatus: "open",
          departureAt: new Date("2026-07-25T10:00:00.000Z"),
          graceMinutes: 0,
          seats: 1,
        },
      ),
    ManualBookingValidationError,
  );
});

test("crea una vera richiesta offline pendente con tolleranza", () => {
  const now = new Date("2026-07-20T10:00:00.000Z");
  const result = normalizeManualBookingFinancials(
    {
      paymentStatus: "deposit_requested",
      totalAmountCents: 25_000,
      paymentAmountCents: 5_000,
      paymentMethod: "bank_transfer",
      paymentDeadline: "2026-07-21T10:00:00.000Z",
    },
    {
      excursionStatus: "open",
      departureAt: new Date("2026-07-25T10:00:00.000Z"),
      graceMinutes: 90,
      seats: 2,
      now,
    },
  );
  assert.equal(result.requestStatus, "pending");
  assert.equal(result.amountPaidCents, 0);
  assert.equal(result.amountDueCents, 5_000);
  assert.equal(result.seatStatus, "held");
  assert.equal(result.graceUntil?.toISOString(), "2026-07-21T11:30:00.000Z");
  assert.equal(
    result.seatHoldExpiresAt?.toISOString(),
    "2026-07-21T11:30:00.000Z",
  );
});

test("la tolleranza non mantiene i posti oltre la partenza", () => {
  const result = normalizeManualBookingFinancials(
    {
      paymentStatus: "full_requested",
      totalAmountCents: 25_000,
      paymentAmountCents: 25_000,
      paymentMethod: "bank_transfer",
      paymentDeadline: "2026-07-25T09:30:00.000Z",
    },
    {
      excursionStatus: "open",
      departureAt: new Date("2026-07-25T10:00:00.000Z"),
      graceMinutes: 90,
      seats: 1,
      now: new Date("2026-07-20T10:00:00.000Z"),
    },
  );
  assert.equal(result.graceUntil?.toISOString(), "2026-07-25T10:00:00.000Z");
  assert.equal(
    result.seatHoldExpiresAt?.toISOString(),
    "2026-07-25T10:00:00.000Z",
  );
  assert.throws(
    () =>
      normalizeManualBookingFinancials(
        {
          paymentStatus: "full_requested",
          totalAmountCents: 25_000,
          paymentAmountCents: 25_000,
          paymentMethod: "office",
          paymentDeadline: "2026-07-25T10:00:00.000Z",
        },
        {
          excursionStatus: "open",
          departureAt: new Date("2026-07-25T10:00:00.000Z"),
          graceMinutes: 0,
          seats: 1,
          now: new Date("2026-07-20T10:00:00.000Z"),
        },
      ),
    ManualBookingValidationError,
  );
});

test("un incasso offline richiede riferimento e importi coerenti", () => {
  const context = {
    excursionStatus: "open",
    departureAt: new Date("2026-07-25T10:00:00.000Z"),
    graceMinutes: 60,
    seats: 2,
    now: new Date("2026-07-20T10:00:00.000Z"),
  };
  const paid = normalizeManualBookingFinancials(
    {
      paymentStatus: "paid",
      totalAmountCents: 25_000,
      paymentAmountCents: 25_000,
      paymentMethod: "office",
      transactionReference: "RIC-42",
    },
    context,
  );
  assert.equal(paid.requestStatus, "paid");
  assert.equal(paid.amountPaidCents, 25_000);
  assert.equal(paid.amountDueCents, 0);
  assert.equal(paid.transactionReference, "RIC-42");
  assert.equal(paid.balancesDelta, 2);
  assert.throws(
    () =>
      normalizeManualBookingFinancials(
        {
          paymentStatus: "deposit",
          totalAmountCents: 25_000,
          paymentAmountCents: 5_000,
          paymentMethod: "office",
        },
        context,
      ),
    ManualBookingValidationError,
  );
});

test("l'acconto incassato chiude la richiesta corrente senza azzerare il totale", () => {
  const result = normalizeManualBookingFinancials(
    {
      paymentStatus: "deposit",
      totalAmountCents: 25_000,
      paymentAmountCents: 5_000,
      paymentMethod: "bank_transfer",
      transactionReference: "TRN-42",
    },
    {
      excursionStatus: "open",
      departureAt: new Date("2026-07-25T10:00:00.000Z"),
      graceMinutes: 60,
      seats: 1,
      now: new Date("2026-07-20T10:00:00.000Z"),
    },
  );
  assert.equal(result.amountPaidCents, 5_000);
  assert.equal(result.amountDueCents, 0);
  assert.equal(result.totalAmountCents, 25_000);
});

test("il comando manuale usa UUID namespaced e fingerprint stabile", () => {
  assert.equal(
    normalizeManualBookingClientCommandId(
      "550E8400-E29B-41D4-A716-446655440000",
    ),
    "admin:550e8400-e29b-41d4-a716-446655440000",
  );
  assert.throws(
    () => normalizeManualBookingClientCommandId("non-un-uuid"),
    ManualBookingValidationError,
  );

  const participants = normalizeManualBookingParticipants(
    [{ type: "adult", firstName: "Anna", lastName: "Rossi" }],
    false,
  ).participants;
  const financial = normalizeManualBookingFinancials(
    {
      paymentStatus: "paid",
      totalAmountCents: 10_000,
      paymentAmountCents: 10_000,
      paymentMethod: "office",
      transactionReference: "CASSA-1",
    },
    {
      excursionStatus: "open",
      departureAt: new Date("2026-07-25T10:00:00.000Z"),
      graceMinutes: 60,
      seats: 1,
      now: new Date("2026-07-20T10:00:00.000Z"),
    },
  );
  const command = {
    excursionId: "excursion-1",
    customerName: "Anna Rossi",
    customerId: null,
    email: "anna@example.com",
    phone: null,
    customerNotificationsEnabled: false,
    participants,
    financial,
    servizioCasa: false,
    homePickupAddress: null,
  };
  const first = manualBookingCommandFingerprint(command);
  assert.equal(first, manualBookingCommandFingerprint(command));
  assert.notEqual(
    first,
    manualBookingCommandFingerprint({
      ...command,
      phone: "+39 333 0000000",
    }),
  );
  assert.notEqual(
    first,
    manualBookingCommandFingerprint({
      ...command,
      customerNotificationsEnabled: true,
    }),
  );
});

test("una gita confermata accetta soltanto richiesta o incasso del totale", () => {
  assert.throws(
    () =>
      normalizeManualBookingFinancials(
        {
          paymentStatus: "deposit_requested",
          totalAmountCents: 25_000,
          paymentAmountCents: 5_000,
          paymentMethod: "bank_transfer",
          paymentDeadline: "2026-07-21T10:00:00.000Z",
        },
        {
          excursionStatus: "confirmed",
          departureAt: new Date("2026-07-25T10:00:00.000Z"),
          graceMinutes: 60,
          seats: 1,
          now: new Date("2026-07-20T10:00:00.000Z"),
        },
      ),
    ManualBookingValidationError,
  );
});
