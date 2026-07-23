import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { excursionBookingsTable } from "./excursions";

// Snapshot immutabile del messaggio da consegnare. Conservare destinatari e
// contenuto nell'outbox evita che un retry ricostruisca un'email differente dopo
// una modifica alla prenotazione o ai template.
export type EmailOutboxPayload = {
  to: string[];
  cc?: string[];
  bcc?: string[];
  from?: string;
  replyTo?: string;
  subject: string;
  html?: string;
  text?: string;
  headers?: Record<string, string>;
};

export const emailOutboxTable = pgTable(
  "email_outbox",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Facoltativo per consentire anche notifiche di sistema; SET NULL mantiene
    // lo storico di consegna se una prenotazione viene eliminata.
    bookingId: uuid("booking_id").references(() => excursionBookingsTable.id, {
      onDelete: "set null",
    }),
    eventType: text("event_type").notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    payload: jsonb("payload").$type<EmailOutboxPayload>().notNull(),
    // "pending" | "processing" | "sent" | "failed"
    status: text("status").notNull().default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(8),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    leaseOwner: text("lease_owner"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    lastError: text("last_error"),
    providerMessageId: text("provider_message_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("email_outbox_dedupe_key_uq").on(t.dedupeKey),
    index("email_outbox_dispatch_idx").on(t.status, t.nextAttemptAt),
    index("email_outbox_booking_idx").on(t.bookingId),
  ],
);

export type EmailOutboxEntry = typeof emailOutboxTable.$inferSelect;
