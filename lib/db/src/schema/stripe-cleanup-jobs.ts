import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { excursionBookingsTable } from "./excursions";

// Operazioni compensative Stripe che devono sopravvivere a restart, timeout e
// indisponibilita temporanee: cancellazione PI/SI e rimozione Customer creati
// per checkout poi scaduti o falliti.
export const stripeCleanupJobsTable = pgTable(
  "stripe_cleanup_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id").references(() => excursionBookingsTable.id, {
      onDelete: "set null",
    }),
    operation: text("operation").notNull(),
    stripeResourceId: text("stripe_resource_id").notNull(),
    // "pending" | "processing" | "failed" | "succeeded" |
    // "manual_required"
    status: text("status").notNull().default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(8),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    leaseOwner: text("lease_owner"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    lastErrorCode: text("last_error_code"),
    lastErrorMessage: text("last_error_message"),
    // Riferimento inserito dall'amministrazione dopo aver verificato o
    // completato l'operazione direttamente sul provider.
    manualCompletionReference: text("manual_completion_reference"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("stripe_cleanup_jobs_operation_resource_uq").on(
      t.operation,
      t.stripeResourceId,
    ),
    index("stripe_cleanup_jobs_dispatch_idx").on(
      t.status,
      t.nextAttemptAt,
      t.leaseExpiresAt,
    ),
    index("stripe_cleanup_jobs_booking_idx").on(t.bookingId),
  ],
);

export type StripeCleanupJob = typeof stripeCleanupJobsTable.$inferSelect;
