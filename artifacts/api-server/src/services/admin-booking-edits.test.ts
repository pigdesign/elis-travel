import assert from "node:assert/strict";
import test from "node:test";
import {
  adminBookingTotalDecision,
  isDuplicateManualPayment,
  summaryStatusAfterManualMovement,
  adminManualPaymentPlan,
  adminPaymentReversalDecision,
  adminRequestAmountDecision,
  adminRequestMethodDecision,
  BookingProfileValidationError,
  normalizeAdminActionReason,
  normalizeBookingProfile,
  openRequestsRealignment,
} from "./admin-booking-edits";

const balanceRequest = {
  requestStatus: "pending",
  requestType: "balance",
  currentMethod: null as string | null,
  nextMethod: "office",
  onBusAvailable: true,
};

test("l'amministrazione assegna un metodo alla richiesta che non ne ha", () => {
  assert.equal(adminRequestMethodDecision(balanceRequest), "apply");
});

test("il saldo scaduto resta correggibile dall'agenzia", () => {
  assert.equal(
    adminRequestMethodDecision({ ...balanceRequest, requestStatus: "expired" }),
    "apply",
  );
});

test("una richiesta gia saldata non cambia piu metodo", () => {
  for (const status of ["paid", "cancelled", "refunded"]) {
    assert.equal(
      adminRequestMethodDecision({ ...balanceRequest, requestStatus: status }),
      "status_not_editable",
      status,
    );
  }
});

test("la carta non e assegnabile da un operatore", () => {
  assert.equal(
    adminRequestMethodDecision({ ...balanceRequest, nextMethod: "card" }),
    "method_not_allowed",
  );
});

test("una richiesta su carta si sposta su un metodo offline", () => {
  assert.equal(
    adminRequestMethodDecision({
      ...balanceRequest,
      currentMethod: "card",
      nextMethod: "bank_transfer",
    }),
    "apply",
  );
});

test("il bus resta riservato al saldo e solo dove e abilitato", () => {
  assert.equal(
    adminRequestMethodDecision({
      ...balanceRequest,
      requestType: "deposit",
      nextMethod: "on_bus",
    }),
    "on_bus_requires_balance",
  );
  assert.equal(
    adminRequestMethodDecision({
      ...balanceRequest,
      nextMethod: "on_bus",
      onBusAvailable: false,
    }),
    "on_bus_not_available",
  );
  assert.equal(
    adminRequestMethodDecision({ ...balanceRequest, nextMethod: "on_bus" }),
    "apply",
  );
});

test("riassegnare lo stesso metodo non e un errore ma non produce scritture", () => {
  assert.equal(
    adminRequestMethodDecision({ ...balanceRequest, currentMethod: "office" }),
    "unchanged",
  );
});

const amountInput = {
  requestStatus: "pending",
  requestType: "balance",
  currentAmountCents: 10000,
  nextAmountCents: 8000,
  totalAmountCents: 20000,
  paidOnOtherRequestsCents: 10000,
};

test("l'importo di una richiesta aperta si corregge entro il residuo", () => {
  assert.equal(adminRequestAmountDecision(amountInput), "apply");
  assert.equal(
    adminRequestAmountDecision({ ...amountInput, nextAmountCents: 10000 }),
    "unchanged",
  );
});

test("non si puo chiedere piu del residuo", () => {
  assert.equal(
    adminRequestAmountDecision({ ...amountInput, nextAmountCents: 10001 }),
    "exceeds_residual",
  );
});

test("importi non positivi rifiutati", () => {
  for (const nextAmountCents of [0, -1, 1.5, Number.NaN]) {
    assert.equal(
      adminRequestAmountDecision({ ...amountInput, nextAmountCents }),
      "invalid_amount",
      String(nextAmountCents),
    );
  }
});

test("un acconto pari al residuo non e un acconto", () => {
  assert.equal(
    adminRequestAmountDecision({
      ...amountInput,
      requestType: "deposit",
      nextAmountCents: 10000,
      paidOnOtherRequestsCents: 10000,
    }),
    "deposit_not_partial",
  );
});

test("senza totale storico l'importo resta libero", () => {
  assert.equal(
    adminRequestAmountDecision({
      ...amountInput,
      totalAmountCents: null,
      nextAmountCents: 99999,
    }),
    "apply",
  );
});

test("un incasso che coincide con una richiesta aperta salda quella richiesta", () => {
  assert.deepEqual(
    adminManualPaymentPlan({
      amountCents: 5000,
      totalAmountCents: 20000,
      alreadyPaidCents: 0,
      openRequests: [{ id: "req-1", type: "deposit", amountCents: 5000 }],
    }),
    { kind: "settle", requestId: "req-1" },
  );
});

test("una prenotazione storica senza richieste genera la riga giusta", () => {
  assert.deepEqual(
    adminManualPaymentPlan({
      amountCents: 20000,
      totalAmountCents: 20000,
      alreadyPaidCents: 0,
      openRequests: [],
    }),
    { kind: "create", type: "full" },
  );
  assert.deepEqual(
    adminManualPaymentPlan({
      amountCents: 5000,
      totalAmountCents: 20000,
      alreadyPaidCents: 0,
      openRequests: [],
    }),
    { kind: "create", type: "deposit" },
  );
  assert.deepEqual(
    adminManualPaymentPlan({
      amountCents: 5000,
      totalAmountCents: 20000,
      alreadyPaidCents: 10000,
      openRequests: [],
    }),
    { kind: "create", type: "balance" },
  );
});

test("un incasso non puo superare il residuo", () => {
  assert.deepEqual(
    adminManualPaymentPlan({
      amountCents: 10001,
      totalAmountCents: 20000,
      alreadyPaidCents: 10000,
      openRequests: [],
    }),
    { kind: "invalid", reason: "exceeds_residual" },
  );
});

test("senza totale non si registra un incasso", () => {
  assert.deepEqual(
    adminManualPaymentPlan({
      amountCents: 5000,
      totalAmountCents: null,
      alreadyPaidCents: 0,
      openRequests: [],
    }),
    { kind: "invalid", reason: "total_required" },
  );
});

test("saldato il dovuto, le richieste aperte residue si chiudono", () => {
  assert.deepEqual(
    openRequestsRealignment({
      residualCents: 0,
      openRequests: [
        { id: "req-1", amountCents: 10000 },
        { id: "req-2", amountCents: 4000 },
      ],
    }),
    { cancel: ["req-1", "req-2"], setAmount: null },
  );
});

test("l'unica richiesta aperta viene riallineata al residuo", () => {
  assert.deepEqual(
    openRequestsRealignment({
      residualCents: 6000,
      openRequests: [{ id: "req-1", amountCents: 10000 }],
    }),
    { cancel: [], setAmount: { id: "req-1", amountCents: 6000 } },
  );
  assert.deepEqual(
    openRequestsRealignment({
      residualCents: 6000,
      openRequests: [{ id: "req-1", amountCents: 6000 }],
    }),
    { cancel: [], setAmount: null },
  );
});

test("con piu richieste aperte non si indovina la ripartizione", () => {
  assert.deepEqual(
    openRequestsRealignment({
      residualCents: 6000,
      openRequests: [
        { id: "req-1", amountCents: 4000 },
        { id: "req-2", amountCents: 4000 },
      ],
    }),
    { cancel: [], setAmount: null },
  );
});

test("si storna solo un incasso registrato a mano", () => {
  assert.equal(
    adminPaymentReversalDecision({
      requestStatus: "paid",
      method: "office",
      hasSucceededCardAttempt: false,
    }),
    "apply",
  );
  assert.equal(
    adminPaymentReversalDecision({
      requestStatus: "pending",
      method: "office",
      hasSucceededCardAttempt: false,
    }),
    "not_paid",
  );
  assert.equal(
    adminPaymentReversalDecision({
      requestStatus: "paid",
      method: "card",
      hasSucceededCardAttempt: false,
    }),
    "card_requires_refund",
  );
  // Metodo riscritto a mano ma incasso Stripe realmente andato a buon fine:
  // il denaro e uscito dal conto del cliente e va restituito, non stornato.
  assert.equal(
    adminPaymentReversalDecision({
      requestStatus: "paid",
      method: "office",
      hasSucceededCardAttempt: true,
    }),
    "card_requires_refund",
  );
});

test("il totale non scende sotto quanto gia incassato", () => {
  assert.equal(
    adminBookingTotalDecision({
      nextTotalCents: 9000,
      currentTotalCents: 20000,
      amountPaidCents: 10000,
    }),
    "below_collected",
  );
  assert.equal(
    adminBookingTotalDecision({
      nextTotalCents: 10000,
      currentTotalCents: 20000,
      amountPaidCents: 10000,
    }),
    "apply",
  );
  assert.equal(
    adminBookingTotalDecision({
      nextTotalCents: 20000,
      currentTotalCents: 20000,
      amountPaidCents: 10000,
    }),
    "unchanged",
  );
  assert.equal(
    adminBookingTotalDecision({
      nextTotalCents: -1,
      currentTotalCents: null,
      amountPaidCents: 0,
    }),
    "invalid_amount",
  );
});

const currentProfile = {
  customerName: "Mario Rossi",
  email: "mario@example.com" as string | null,
  phone: "3331112222" as string | null,
  customerNotificationsEnabled: true,
  servizioCasa: false,
  homePickupAddress: null as string | null,
};

test("i campi non inviati restano quelli attuali", () => {
  assert.deepEqual(normalizeBookingProfile({}, currentProfile), currentProfile);
});

test("il telefono si aggiorna e si puo svuotare", () => {
  assert.equal(
    normalizeBookingProfile({ phone: " 3339998877 " }, currentProfile).phone,
    "3339998877",
  );
  assert.equal(
    normalizeBookingProfile({ phone: "" }, currentProfile).phone,
    null,
  );
});

test("togliere l'email spegne le comunicazioni solo se richiesto insieme", () => {
  assert.throws(
    () => normalizeBookingProfile({ email: "" }, currentProfile),
    BookingProfileValidationError,
  );
  assert.deepEqual(
    normalizeBookingProfile(
      { email: "", customerNotificationsEnabled: false },
      currentProfile,
    ).customerNotificationsEnabled,
    false,
  );
});

test("email non valida rifiutata", () => {
  assert.throws(
    () => normalizeBookingProfile({ email: "non-una-email" }, currentProfile),
    BookingProfileValidationError,
  );
});

test("il ritiro a domicilio pretende l'indirizzo e lo lascia andare con se", () => {
  assert.throws(
    () => normalizeBookingProfile({ servizioCasa: true }, currentProfile),
    BookingProfileValidationError,
  );
  const withHome = normalizeBookingProfile(
    { servizioCasa: true, homePickupAddress: " Via Roma 1 " },
    currentProfile,
  );
  assert.equal(withHome.homePickupAddress, "Via Roma 1");
  assert.equal(
    normalizeBookingProfile({ servizioCasa: false }, { ...withHome })
      .homePickupAddress,
    null,
  );
});

test("il motivo e obbligatorio solo dove il denaro cambia", () => {
  assert.equal(normalizeAdminActionReason("  ", { required: false }), null);
  assert.equal(
    normalizeAdminActionReason(" errore di cassa ", { required: true }),
    "errore di cassa",
  );
  assert.throws(
    () => normalizeAdminActionReason("", { required: true }),
    BookingProfileValidationError,
  );
});

test("un versamento parziale lascia la prenotazione in acconto, non saldata", () => {
  assert.equal(
    summaryStatusAfterManualMovement({
      amountPaidCents: 5000,
      totalAmountCents: 20000,
      fallbackStatus: "full_requested",
    }),
    "deposit",
  );
  assert.equal(
    summaryStatusAfterManualMovement({
      amountPaidCents: 20000,
      totalAmountCents: 20000,
      fallbackStatus: "full_requested",
    }),
    "paid",
  );
  // Storno dell'unico incasso: si torna allo stato di attesa indicato.
  assert.equal(
    summaryStatusAfterManualMovement({
      amountPaidCents: 0,
      totalAmountCents: 20000,
      fallbackStatus: "deposit_requested",
    }),
    "deposit_requested",
  );
  // Prenotazione storica senza totale: qualunque incasso resta un acconto
  // finche qualcuno non stabilisce quanto vale la prenotazione.
  assert.equal(
    summaryStatusAfterManualMovement({
      amountPaidCents: 9900,
      totalAmountCents: null,
      fallbackStatus: "pending",
    }),
    "deposit",
  );
});

test("lo stesso riferimento non entra due volte in contabilita", () => {
  const existing = [
    { amountCents: 5000, transactionReference: "CRO-123" },
    { amountCents: 3000, transactionReference: null },
  ];
  assert.equal(
    isDuplicateManualPayment({
      amountCents: 5000,
      transactionReference: " cro-123 ",
      existing,
    }),
    true,
  );
  assert.equal(
    isDuplicateManualPayment({
      amountCents: 5000,
      transactionReference: "CRO-999",
      existing,
    }),
    false,
  );
  // Stesso riferimento ma importo diverso: e un secondo versamento vero.
  assert.equal(
    isDuplicateManualPayment({
      amountCents: 4000,
      transactionReference: "CRO-123",
      existing,
    }),
    false,
  );
});
