import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { excursionBookingsTable, excursionsTable } from "./excursions";

/**
 * Ledger amministrativo di una singola richiesta/decisione di annullamento.
 * I campi analoghi sulla booking sono soltanto la proiezione dell'ultimo caso,
 * utile per compatibilità con le viste esistenti.
 */
export const bookingCancellationCasesTable = pgTable(
  "booking_cancellation_cases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => excursionBookingsTable.id, { onDelete: "restrict" }),
    excursionId: uuid("excursion_id").references(() => excursionsTable.id, {
      onDelete: "set null",
    }),
    // "customer" | "admin" | "excursion"
    source: text("source").notNull(),
    // Chiave business stabile del comando che ha aperto il caso.
    sourceKey: text("source_key").notNull(),
    // "pending" | "rejected" | "superseded" | "approved" | "refunding" |
    // "manual_required" | "completed"
    status: text("status").notNull().default("pending"),
    requestReason: text("request_reason"),
    decisionReason: text("decision_reason"),
    openedByAdminUserId: text("opened_by_admin_user_id"),
    openedByAdminName: text("opened_by_admin_name"),
    decidedByAdminUserId: text("decided_by_admin_user_id"),
    decidedByAdminName: text("decided_by_admin_name"),
    refundableAtDecisionCents: integer("refundable_at_decision_cents"),
    approvedRefundCents: integer("approved_refund_cents"),
    requestedAt: timestamp("requested_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("booking_cancellation_cases_source_key_uq").on(t.sourceKey),
    index("booking_cancellation_cases_booking_idx").on(
      t.bookingId,
      t.createdAt,
    ),
    index("booking_cancellation_cases_status_idx").on(t.status, t.updatedAt),
    index("booking_cancellation_cases_excursion_idx").on(t.excursionId),
  ],
);

export type BookingCancellationCase =
  typeof bookingCancellationCasesTable.$inferSelect;
