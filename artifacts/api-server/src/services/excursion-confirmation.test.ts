import assert from "node:assert/strict";
import test from "node:test";
import {
  confirmationAutoChargeBlockReason,
  requiresTermsReacceptance,
  confirmationChargeIdempotencyKey,
  confirmationFinalState,
  savedCardDepositChargePlan,
  shouldRunConfirmationWorkflow,
} from "./excursion-confirmation";

test("la risposta di conferma segue sempre lo stato finale autorevole", () => {
  assert.equal(confirmationFinalState("confirmed"), "confirmed");
  assert.equal(confirmationFinalState("cancelled"), "superseded");
  assert.equal(confirmationFinalState("completed"), "superseded");
  assert.equal(confirmationFinalState("open"), "superseded");
  assert.equal(confirmationFinalState(null), "not_found");
});

test("una richiesta esplicita confirmed riprende il workflow anche se lo stato era gia confermato", () => {
  assert.equal(
    shouldRunConfirmationWorkflow({
      statusExplicitlyRequested: true,
      requestedStatus: "confirmed",
    }),
    true,
  );
  assert.equal(
    shouldRunConfirmationWorkflow({
      statusExplicitlyRequested: false,
      requestedStatus: "confirmed",
    }),
    false,
  );
});

test("la conferma addebita solo l'acconto autorizzato, mai il residuo completo", () => {
  assert.deepEqual(
    savedCardDepositChargePlan({
      authorizedDepositCents: 5_000,
      residualCents: 20_000,
    }),
    { requestType: "deposit", amountCents: 5_000 },
  );
  assert.deepEqual(
    savedCardDepositChargePlan({
      authorizedDepositCents: 25_000,
      residualCents: 20_000,
    }),
    { requestType: "deposit", amountCents: 20_000 },
  );
});

test("la business key di addebito resta stabile tra i retry", () => {
  const input = {
    excursionId: "trip-1",
    bookingId: "booking-1",
    requestType: "deposit",
  };
  assert.equal(
    confirmationChargeIdempotencyKey(input),
    confirmationChargeIdempotencyKey({ ...input }),
  );
});

test("i kill switch vengono ricontrollati al momento della conferma", () => {
  const enabled = {
    stripeConfigured: true,
    futureCardChargeEnabled: true,
    cardPaymentsEnabled: true,
    excursionCardPaymentsEnabled: true,
    amountCents: 3_000,
    acceptedTermsVersion: "19 agosto 2026",
    currentTermsVersion: "19 agosto 2026",
  };
  assert.equal(confirmationAutoChargeBlockReason(enabled), null);
  assert.equal(
    confirmationAutoChargeBlockReason({
      ...enabled,
      futureCardChargeEnabled: false,
    }),
    "future_card_charge_disabled",
  );
  assert.equal(
    confirmationAutoChargeBlockReason({
      ...enabled,
      cardPaymentsEnabled: false,
    }),
    "card_payments_disabled",
  );
  assert.equal(
    confirmationAutoChargeBlockReason({
      ...enabled,
      excursionCardPaymentsEnabled: false,
    }),
    "excursion_card_payments_disabled",
  );
  assert.equal(
    confirmationAutoChargeBlockReason({ ...enabled, amountCents: 49 }),
    "stripe_amount_below_minimum",
  );
});

test("la versione dei T&C accettata deve coincidere con quella pubblicata", () => {
  const base = {
    stripeConfigured: true,
    futureCardChargeEnabled: true,
    cardPaymentsEnabled: true,
    excursionCardPaymentsEnabled: true,
    amountCents: 3_000,
  };

  // Versione invariata: l'autorizzazione copre il testo in vigore, si addebita.
  assert.equal(
    confirmationAutoChargeBlockReason({
      ...base,
      acceptedTermsVersion: "19 agosto 2026",
      currentTermsVersion: "19 agosto 2026",
    }),
    null,
  );

  // Testo cambiato dopo la prenotazione: niente addebito automatico, la
  // prenotazione passa a lavorazione manuale per una nuova accettazione.
  assert.equal(
    confirmationAutoChargeBlockReason({
      ...base,
      acceptedTermsVersion: "19 agosto 2026",
      currentTermsVersion: "2 settembre 2026",
    }),
    "terms_version_changed",
  );

  // Iubenda irraggiungibile e nessun valore noto: non si addebita cio che non
  // si puo verificare.
  assert.equal(
    confirmationAutoChargeBlockReason({
      ...base,
      acceptedTermsVersion: "19 agosto 2026",
      currentTermsVersion: null,
    }),
    "terms_version_unavailable",
  );

  // Prenotazione senza versione registrata (autorizzazioni precedenti a questa
  // integrazione): stessa cautela.
  assert.equal(
    confirmationAutoChargeBlockReason({
      ...base,
      acceptedTermsVersion: null,
      currentTermsVersion: "19 agosto 2026",
    }),
    "terms_version_unavailable",
  );

  // I kill switch restano prioritari sul controllo di versione.
  assert.equal(
    confirmationAutoChargeBlockReason({
      ...base,
      futureCardChargeEnabled: false,
      acceptedTermsVersion: null,
      currentTermsVersion: null,
    }),
    "future_card_charge_disabled",
  );
});

test("la nuova accettazione si chiede solo a chi puo davvero darla", () => {
  const base = {
    acceptedTermsVersion: "19 agosto 2026",
    currentTermsVersion: "2 settembre 2026",
    hasSavedCard: true,
    cancelled: false,
  };

  // Testo cambiato, carta salvata, prenotazione viva: si chiede.
  assert.equal(requiresTermsReacceptance(base), true);

  // Stessa versione: non c'e niente da riaccettare.
  assert.equal(
    requiresTermsReacceptance({
      ...base,
      currentTermsVersion: "19 agosto 2026",
    }),
    false,
  );

  // Iubenda irraggiungibile: il problema e nostro, non del cliente. Non ha
  // senso chiedergli di accettare un testo che non riusciamo a leggere.
  assert.equal(
    requiresTermsReacceptance({ ...base, currentTermsVersion: null }),
    false,
  );

  // Nessuna carta salvata: non c'e alcun addebito futuro da autorizzare.
  assert.equal(
    requiresTermsReacceptance({ ...base, hasSavedCard: false }),
    false,
  );

  // Prenotazione annullata: non le si chiede piu nulla.
  assert.equal(requiresTermsReacceptance({ ...base, cancelled: true }), false);
});
