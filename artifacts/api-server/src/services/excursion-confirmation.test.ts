import assert from "node:assert/strict";
import test from "node:test";
import {
  confirmationAutoChargeBlockReason,
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
