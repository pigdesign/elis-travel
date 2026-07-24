import test from "node:test";
import assert from "node:assert/strict";
import type { Excursion } from "@workspace/db/schema";
import {
  availablePaymentMethods,
  buildQuote,
  cardPaymentsEnabledFromSetting,
  computePaymentDeadline,
  depositAmountCents,
  eurosToCents,
  generateBookingCode,
  isDepositAvailable,
  isNoPaymentRequired,
  isStripeChargeAmountSupported,
  quoteAmountsForBookingAttempt,
  quotedAmountSnapshotDecision,
  requiresSavedCardAuthorization,
  type PaymentSettings,
  type PricingContext,
  type PricingPickupPoint,
} from "./excursion-pricing";

test("la carta resta disabilitata finché il kill switch non è esplicitamente true", () => {
  assert.equal(cardPaymentsEnabledFromSetting(undefined), false);
  assert.equal(cardPaymentsEnabledFromSetting(""), false);
  assert.equal(cardPaymentsEnabledFromSetting("false"), false);
  assert.equal(cardPaymentsEnabledFromSetting("true"), true);
});

const settings: PaymentSettings = {
  depositPercentage: 30,
  cardPaymentsEnabled: true,
  futureCardChargeEnabled: false,
  futureCardChargeConsentVersion: null,
  cardCheckoutHoldMinutes: 30,
  paymentGraceMinutes: 120,
  bankHours: 48,
  officeHours: 48,
  balanceHours: 48,
  nearDepartureHours: 48,
  fullOnlyDaysBefore: 5,
  autoReleaseSeats: false,
  iban: null,
  beneficiary: null,
  bank: null,
  officeAddress: null,
  officeOpeningHours: null,
  termsVersion: "1",
  privacyVersion: "1",
  mediaVersion: "1",
  adultMinAge: 18,
};

function excursion(overrides: Partial<Excursion> = {}): Excursion {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    name: "Test",
    location: "Imperia",
    date: "2026-09-10",
    departureAt: new Date("2026-09-10T06:00:00.000Z"),
    status: "open",
    depositEnabled: true,
    depositType: "percent",
    depositValue: "30",
    depositAvailableAfterConfirm: false,
    fullPaymentOnlyDaysBefore: null,
    ...overrides,
  } as Excursion;
}

const POINT_A = "10000000-0000-4000-8000-000000000001";
const POINT_B = "10000000-0000-4000-8000-000000000002";

function pickupPoint(
  overrides: Partial<PricingPickupPoint> = {},
): PricingPickupPoint {
  return {
    id: POINT_A,
    name: "Imperia Centro",
    city: "Imperia",
    province: "IM",
    pickupTime: null,
    sortOrder: 0,
    surchargeCents: 0,
    mapsUrl: null,
    active: true,
    ...overrides,
  };
}

test("la variazione prezzo per provincia si somma o sottrae al prezzo base (gita standard)", () => {
  const contextWith = (surchargeCents: number): PricingContext => ({
    excursion: excursion({ pricePerPerson: "150" }),
    excursionRowVersion: "1",
    isRident: false,
    ageRanges: [],
    agePriceCents: new Map(),
    pickupPoints: [pickupPoint({ surchargeCents })],
  });
  const finalFor = (surchargeCents: number) =>
    buildQuote(
      contextWith(surchargeCents),
      {
        participants: [{ type: "adult" }],
        pickupPointId: POINT_A,
        paymentType: "full",
      },
      settings,
      new Date("2026-08-01T00:00:00Z"),
    ).participants[0].finalPriceCents;

  assert.equal(finalFor(1_000), 16_000); // base 150 + supplemento 10 = 160
  assert.equal(finalFor(-2_000), 13_000); // base 150 - sconto 20 = 130
  assert.equal(finalFor(0), 15_000); // provincia non configurata = 150
});

test("uno sconto per provincia superiore al prezzo base viene rifiutato", () => {
  const context: PricingContext = {
    excursion: excursion({ pricePerPerson: "150" }),
    excursionRowVersion: "1",
    isRident: false,
    ageRanges: [],
    agePriceCents: new Map(),
    pickupPoints: [pickupPoint({ surchargeCents: -20_000 })], // -200 su base 150
  };
  assert.throws(
    () =>
      buildQuote(
        context,
        {
          participants: [{ type: "adult" }],
          pickupPointId: POINT_A,
          paymentType: "full",
        },
        settings,
        new Date("2026-08-01T00:00:00Z"),
      ),
    /prezzo base/,
  );
});

test("in una gita RIDENT la variazione di provincia è calcolata per singolo partecipante", () => {
  const context: PricingContext = {
    excursion: excursion({
      category: "rident",
      pricePerPerson: "150",
      patientPrice: "150",
    }),
    excursionRowVersion: "1",
    isRident: true,
    ageRanges: [],
    agePriceCents: new Map(),
    pickupPoints: [
      pickupPoint({ id: POINT_A, province: "IM", surchargeCents: 1_000 }),
      pickupPoint({ id: POINT_B, province: "SV", surchargeCents: -2_000 }),
    ],
  };
  const quote = buildQuote(
    context,
    {
      participants: [
        { type: "patient", pickupPointId: POINT_A },
        { type: "patient", pickupPointId: POINT_B },
      ],
      paymentType: "full",
    },
    settings,
    new Date("2026-08-01T00:00:00Z"),
  );
  const finalByPoint = Object.fromEntries(
    quote.participants.map((p) => [p.pickupPointId, p.finalPriceCents]),
  );
  assert.equal(finalByPoint[POINT_A], 16_000); // +10 → 160
  assert.equal(finalByPoint[POINT_B], 13_000); // -20 → 130
});

test("in una gita standard con punti divisi ogni partecipante riceve la sua tariffa", () => {
  const context: PricingContext = {
    excursion: excursion({ pricePerPerson: "150" }),
    excursionRowVersion: "1",
    isRident: false,
    ageRanges: [],
    agePriceCents: new Map(),
    pickupPoints: [
      pickupPoint({ id: POINT_A, province: "IM", surchargeCents: 1_000 }),
      pickupPoint({ id: POINT_B, province: "SV", surchargeCents: -2_000 }),
    ],
  };
  const quote = buildQuote(
    context,
    {
      participants: [
        { type: "adult", pickupPointId: POINT_A },
        { type: "adult", pickupPointId: POINT_B },
      ],
      pickupPointId: null,
      paymentType: "full",
    },
    settings,
    new Date("2026-08-01T00:00:00Z"),
  );

  assert.deepEqual(
    quote.participants.map((p) => ({
      pickupPointId: p.pickupPointId,
      finalPriceCents: p.finalPriceCents,
    })),
    [
      { pickupPointId: POINT_A, finalPriceCents: 16_000 },
      { pickupPointId: POINT_B, finalPriceCents: 13_000 },
    ],
  );
  assert.equal(quote.totalCents, 29_000);
});

test("conversione euro in centesimi arrotonda una sola volta", () => {
  assert.equal(eurosToCents("12.345"), 1235);
  assert.equal(eurosToCents(null), 0);
});

test("acconto percentuale e fisso non superano mai il totale", () => {
  assert.equal(depositAmountCents(excursion(), settings, 10_000, 2), 3_000);
  assert.equal(
    depositAmountCents(
      excursion({ depositType: "fixed", depositValue: "80" }),
      settings,
      10_000,
      2,
    ),
    10_000,
  );
});

test("una gita già confermata non offre mai l'acconto alle nuove prenotazioni", () => {
  assert.equal(
    isDepositAvailable(
      excursion({ status: "confirmed", depositAvailableAfterConfirm: true }),
      settings,
      new Date("2026-08-01T00:00:00Z"),
    ),
    false,
  );
});

test("la deadline iniziale non supera l'orario reale di partenza", () => {
  const deadline = computePaymentDeadline({
    from: new Date("2026-09-09T20:00:00.000Z"),
    hours: 24,
    excursion: excursion(),
  });
  assert.equal(deadline.toISOString(), "2026-09-10T06:00:00.000Z");
});

test("nome e cognome accettati dal preventivo non modificano il prezzo", () => {
  const context: PricingContext = {
    excursion: excursion({ pricePerPerson: "42" }),
    excursionRowVersion: "1",
    isRident: false,
    ageRanges: [],
    agePriceCents: new Map(),
    pickupPoints: [],
  };
  const quoteWithNames = buildQuote(
    context,
    {
      participants: [{ type: "adult", firstName: "Anna", lastName: "Rossi" }],
      paymentType: "full",
    },
    settings,
    new Date("2026-08-01T00:00:00Z"),
  );
  const quoteWithoutNames = buildQuote(
    context,
    { participants: [{ type: "adult" }], paymentType: "full" },
    settings,
    new Date("2026-08-01T00:00:00Z"),
  );

  assert.deepEqual(quoteWithNames, quoteWithoutNames);
  assert.equal(quoteWithNames.totalCents, 4_200);
});

test("bonifico e ufficio sono disponibili solo con istruzioni operative", () => {
  const configuredExcursion = excursion({
    payCardEnabled: true,
    payBankTransferEnabled: true,
    payOfficeEnabled: true,
  });
  assert.deepEqual(
    availablePaymentMethods(configuredExcursion, settings, true),
    { card: true, bankTransfer: false, office: false },
  );
  assert.deepEqual(
    availablePaymentMethods(
      configuredExcursion,
      {
        ...settings,
        iban: "IT60X0542811101000000123456",
        officeAddress: "Via Roma 1, Imperia",
      },
      true,
    ),
    { card: true, bankTransfer: true, office: true },
  );
});

test("zero euro non richiede pagamento e Stripe parte da 50 centesimi", () => {
  assert.equal(isNoPaymentRequired({ totalCents: 0, amountDueCents: 0 }), true);
  assert.equal(
    isNoPaymentRequired({ totalCents: 1, amountDueCents: 0 }),
    false,
  );
  assert.equal(isStripeChargeAmountSupported(0), false);
  assert.equal(isStripeChargeAmountSupported(49), false);
  assert.equal(isStripeChargeAmountSupported(50), true);
});

test("i nuovi codici prenotazione usano otto caratteri non ambigui", () => {
  assert.match(generateBookingCode(), /^ET-[A-HJ-NP-Z2-9]{8}$/);
});

test("un acconto carta su gita aperta richiede sempre autorizzazione salvata", () => {
  assert.equal(
    requiresSavedCardAuthorization({
      paymentMethod: "card",
      paymentType: "deposit",
      excursionStatus: "open",
      depositAllowed: true,
    }),
    true,
  );
  assert.equal(
    requiresSavedCardAuthorization({
      paymentMethod: "card",
      paymentType: "full",
      excursionStatus: "open",
      depositAllowed: true,
    }),
    false,
  );
});

test("un prezzo cambiato richiede una nuova conferma esplicita", () => {
  assert.equal(
    quotedAmountSnapshotDecision({
      quotedTotalCents: 10_000,
      quotedAmountDueCents: 3_000,
      authoritativeTotalCents: 12_000,
      authoritativeAmountDueCents: 3_600,
    }),
    "changed",
  );
});

test("il replay dopo risposta persa usa lo snapshot persistito anche se il catalogo cambia", () => {
  assert.deepEqual(
    quoteAmountsForBookingAttempt({
      persisted: { totalCents: 10_000, amountDueCents: 3_000 },
      current: { totalCents: 12_000, amountDueCents: 12_000 },
    }),
    { totalCents: 10_000, amountDueCents: 3_000 },
  );
});
