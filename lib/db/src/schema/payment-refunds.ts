import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { excursionBookingsTable } from "./excursions";
import {
  paymentAttemptsTable,
  paymentRequestsTable,
} from "./booking-participants";
import { bookingCancellationCasesTable } from "./booking-cancellation-cases";

// Rimborso economico reale. E distinto dall'annullamento operativo della
// prenotazione: il posto potra essere liberato soltanto quando la policy del
// flusso avra completato o autorizzato questo passaggio.
export const paymentRefundsTable = pgTable(
  "payment_refunds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // RESTRICT preserva la registrazione finanziaria: una prenotazione con un
    // rimborso non puo essere eliminata cancellando implicitamente lo storico.
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => excursionBookingsTable.id, { onDelete: "restrict" }),
    paymentRequestId: uuid("payment_request_id").references(
      () => paymentRequestsTable.id,
      { onDelete: "set null" },
    ),
    paymentAttemptId: uuid("payment_attempt_id").references(
      () => paymentAttemptsTable.id,
      { onDelete: "set null" },
    ),
    cancellationCaseId: uuid("cancellation_case_id").references(
      () => bookingCancellationCasesTable.id,
      { onDelete: "restrict" },
    ),
    amountCents: integer("amount_cents").notNull(),
    reason: text("reason").notNull(),
    // "pending" | "processing" | "succeeded" | "failed" | "manual_required"
    status: text("status").notNull().default("pending"),
    provider: text("provider").notNull().default("stripe"),
    // Referenza esplicita: una business key non e necessariamente derivata dal
    // PI e piu rimborsi parziali possono legarsi allo stesso PaymentIntent.
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    stripeRefundId: text("stripe_refund_id").unique(
      "payment_refunds_stripe_refund_id_uq",
    ),
    // Riferimento operativo restituito o registrato dal provider. Per i
    // rimborsi manuali conserva la contabile inserita dall'amministrazione;
    // gli errori tecnici restano esclusivamente nei campi lastError*.
    providerReference: text("provider_reference"),
    idempotencyKey: text("idempotency_key")
      .notNull()
      .unique("payment_refunds_idempotency_key_uq"),
    lastErrorCode: text("last_error_code"),
    lastErrorMessage: text("last_error_message"),
    // Stato del job persistente. Il contatore misura le esecuzioni del worker,
    // mentre i singoli tentativi provider sono conservati nella tabella
    // payment_refund_attempts per riusare la stessa idempotency key dopo un
    // timeout senza rischiare un doppio rimborso.
    attemptCount: integer("attempt_count").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(8),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    leaseOwner: text("lease_owner"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("payment_refunds_booking_idx").on(t.bookingId),
    index("payment_refunds_payment_request_idx").on(t.paymentRequestId),
    index("payment_refunds_payment_attempt_idx").on(t.paymentAttemptId),
    index("payment_refunds_cancellation_case_idx").on(t.cancellationCaseId),
    index("payment_refunds_stripe_payment_intent_idx").on(
      t.stripePaymentIntentId,
    ),
    index("payment_refunds_status_idx").on(t.status, t.createdAt),
    index("payment_refunds_dispatch_idx").on(
      t.status,
      t.nextAttemptAt,
      t.leaseExpiresAt,
    ),
  ],
);

export type PaymentRefund = typeof paymentRefundsTable.$inferSelect;
