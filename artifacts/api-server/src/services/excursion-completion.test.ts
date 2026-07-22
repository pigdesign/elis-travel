import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyExcursionCompletionBlockers,
  type CompletionBookingSnapshot,
} from "./excursion-completion";

function booking(
  overrides: Partial<CompletionBookingSnapshot> = {},
): CompletionBookingSnapshot {
  return {
    id: "booking-1",
    bookingCode: "ET-TEST1",
    cancelledAt: null,
    seatStatus: "confirmed",
    seats: 1,
    workflowVersion: 3,
    paymentStatus: "paid",
    totalAmountCents: 10_000,
    amountPaidCents: 10_000,
    cancellationRequestStatus: null,
    participants: [
      {
        id: "participant-1",
        firstName: "Ada",
        lastName: "Lovelace",
        dataCompleted: true,
      },
    ],
    paymentRequests: [
      { id: "request-1", type: "full", status: "paid", amountCents: 10_000 },
    ],
    paymentAttempts: [],
    refunds: [],
    cancellationCases: [],
    stripeCleanupJobs: [],
    ...overrides,
  };
}

function issueCodes(snapshot: CompletionBookingSnapshot): string[] {
  return classifyExcursionCompletionBlockers([snapshot]).flatMap((blocker) =>
    blocker.issues.map((issue) => issue.code),
  );
}

test("una prenotazione saldata e anagraficamente completa consente la chiusura", () => {
  assert.deepEqual(classifyExcursionCompletionBlockers([booking()]), []);
});

test("blocca saldo residuo, stato economico e richiesta non conclusi", () => {
  const codes = issueCodes(
    booking({
      paymentStatus: "balance_requested",
      amountPaidCents: 3_000,
      paymentRequests: [
        { id: "request-balance", type: "balance", status: "pending", amountCents: 7_000 },
      ],
    }),
  );

  assert.deepEqual(codes, [
    "OUTSTANDING_BALANCE",
    "PAYMENT_STATUS_OPEN",
    "PAYMENT_REQUEST_OPEN",
  ]);
});

test("blocca annullamento pendente e ogni rimborso non riuscito", () => {
  const codes = issueCodes(
    booking({
      cancellationRequestStatus: "pending",
      refunds: [
        { id: "refund-1", status: "processing", amountCents: 5_000 },
        { id: "refund-2", status: "succeeded", amountCents: 2_000 },
      ],
    }),
  );

  assert.deepEqual(codes, ["CANCELLATION_PENDING", "REFUND_INCOMPLETE"]);
});

test("non presume completi i partecipanti di una prenotazione legacy senza dettagli", () => {
  assert.deepEqual(issueCodes(booking({ workflowVersion: 2, participants: [] })), [
    "PARTICIPANT_DETAILS_MISSING",
  ]);
});

test("blocca conteggio e anagrafica partecipanti incoerenti", () => {
  const codes = issueCodes(
    booking({
      seats: 2,
      participants: [
        {
          id: "participant-1",
          firstName: "  ",
          lastName: "Rossi",
          dataCompleted: false,
        },
      ],
    }),
  );

  assert.deepEqual(codes, [
    "PARTICIPANT_COUNT_MISMATCH",
    "PARTICIPANT_DATA_INCOMPLETE",
  ]);
});

test("una prenotazione cancellata blocca soltanto per il rimborso ancora aperto", () => {
  const cancelled = booking({
    cancelledAt: new Date("2026-07-01T10:00:00Z"),
    paymentStatus: "refund_required",
    amountPaidCents: 0,
    participants: [],
    refunds: [{ id: "refund-1", status: "failed", amountCents: 10_000 }],
  });

  assert.deepEqual(issueCodes(cancelled), [
    "REFUND_REQUIRED",
    "REFUND_INCOMPLETE",
  ]);
});

test("una prenotazione cancellata amministrativamente chiusa non richiede saldo o anagrafiche", () => {
  const cancelled = booking({
    cancelledAt: new Date("2026-07-01T10:00:00Z"),
    paymentStatus: "refunded",
    amountPaidCents: 0,
    participants: [],
    paymentRequests: [
      { id: "request-1", type: "full", status: "refunded", amountCents: 10_000 },
    ],
    refunds: [{ id: "refund-1", status: "succeeded", amountCents: 10_000 }],
  });

  assert.deepEqual(classifyExcursionCompletionBlockers([cancelled]), []);
});

test("una prenotazione scaduta con posti rilasciati non blocca la chiusura", () => {
  const expired = booking({
    seatStatus: "released",
    paymentStatus: "expired",
    amountPaidCents: 0,
    participants: [],
    paymentRequests: [
      { id: "request-1", type: "full", status: "expired", amountCents: 10_000 },
    ],
  });

  assert.deepEqual(classifyExcursionCompletionBlockers([expired]), []);
});

test("una prenotazione rilasciata continua a bloccare finche il rimborso non riesce", () => {
  const released = booking({
    seatStatus: "released",
    paymentStatus: "refund_required",
    amountPaidCents: 0,
    participants: [],
    paymentRequests: [
      { id: "request-1", type: "full", status: "refund_required", amountCents: 10_000 },
    ],
    refunds: [{ id: "refund-1", status: "processing", amountCents: 10_000 }],
  });

  assert.deepEqual(issueCodes(released), [
    "REFUND_REQUIRED",
    "REFUND_INCOMPLETE",
  ]);
});

test("blocca casi di annullamento approvati o in rimborso, ma non quelli respinti", () => {
  assert.deepEqual(
    issueCodes(
      booking({
        cancellationCases: [
          { id: "case-rejected", status: "rejected" },
          { id: "case-refunding", status: "refunding" },
        ],
      }),
    ),
    ["CANCELLATION_CASE_OPEN"],
  );
  assert.deepEqual(
    issueCodes(
      booking({
        cancellationCases: [{ id: "case-completed", status: "completed" }],
      }),
    ),
    [],
  );
});

test("un caso superseded dall'annullamento gita è terminale per la chiusura", () => {
  assert.deepEqual(
    issueCodes(
      booking({
        cancellationCases: [
          { id: "case-superseded", status: "superseded" },
        ],
      }),
    ),
    [],
  );
});

test("blocca cleanup Stripe aperti anche su prenotazioni già rilasciate", () => {
  const released = booking({
    seatStatus: "released",
    paymentStatus: "expired",
    amountPaidCents: 0,
    participants: [],
    paymentRequests: [],
    stripeCleanupJobs: [
      {
        id: "cleanup-1",
        status: "failed",
        operation: "cancel_payment_intent",
      },
    ],
  });
  assert.deepEqual(issueCodes(released), ["STRIPE_CLEANUP_OPEN"]);
});

test("blocca la chiusura se un tentativo Stripe è ancora utilizzabile", () => {
  const released = booking({
    seatStatus: "released",
    paymentStatus: "expired",
    amountPaidCents: 0,
    participants: [],
    paymentRequests: [],
    paymentAttempts: [
      {
        id: "attempt-1",
        status: "processing",
        stripePaymentIntentId: "pi_1",
      },
    ],
  });
  assert.deepEqual(issueCodes(released), ["PAYMENT_ATTEMPT_OPEN"]);
});

test("un attempt failed con PaymentIntent resta aperto finché non viene cancellato", () => {
  assert.deepEqual(
    issueCodes(
      booking({
        paymentAttempts: [
          {
            id: "attempt-failed",
            status: "failed",
            stripePaymentIntentId: "pi_retryable",
          },
        ],
      }),
    ),
    ["PAYMENT_ATTEMPT_OPEN"],
  );
});
