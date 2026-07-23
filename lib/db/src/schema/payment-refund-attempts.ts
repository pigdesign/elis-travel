import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { paymentRefundsTable } from "./payment-refunds";

// Tentativo effettivo verso Stripe per un rimborso. E separato dal numero di
// esecuzioni del worker: una chiamata con esito incerto viene ripetuta con la
// stessa idempotency key; soltanto un refund Stripe definitivamente fallito
// apre un nuovo tentativo provider.
export const paymentRefundAttemptsTable = pgTable(
  "payment_refund_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    paymentRefundId: uuid("payment_refund_id")
      .notNull()
      .references(() => paymentRefundsTable.id, { onDelete: "restrict" }),
    attemptNumber: integer("attempt_number").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    // "pending" | "processing" | "succeeded" | "failed" |
    // "manual_required"
    status: text("status").notNull().default("pending"),
    stripeRefundId: text("stripe_refund_id"),
    lastErrorCode: text("last_error_code"),
    lastErrorMessage: text("last_error_message"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("payment_refund_attempts_refund_number_uq").on(
      t.paymentRefundId,
      t.attemptNumber,
    ),
    unique("payment_refund_attempts_idempotency_key_uq").on(t.idempotencyKey),
    unique("payment_refund_attempts_stripe_refund_id_uq").on(t.stripeRefundId),
    index("payment_refund_attempts_refund_idx").on(t.paymentRefundId),
  ],
);

export type PaymentRefundAttempt =
  typeof paymentRefundAttemptsTable.$inferSelect;
