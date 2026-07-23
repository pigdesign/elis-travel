import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  uuid,
  jsonb,
  index,
  unique,
} from "drizzle-orm/pg-core";
import {
  excursionBookingsTable,
  excursionPickupPointsTable,
} from "./excursions";
import { ageRangesTable } from "./age-ranges";

// Partecipante individuale di una prenotazione gita.
// Prenotazioni precedenti a Gite v2 non hanno righe qui: l'admin le mostra
// come "dati partecipanti non dettagliati" (fallback sui contatori adults/children).
// I campi *Cents sono snapshot storici al momento della prenotazione: non vanno
// mai ricalcolati se prezzi o supplementi cambiano in seguito.
export const bookingParticipantsTable = pgTable("booking_participants", {
  id: uuid("id").primaryKey().defaultRandom(),
  bookingId: uuid("booking_id")
    .notNull()
    .references(() => excursionBookingsTable.id, { onDelete: "cascade" }),
  // "adult" | "child" (gite normali) — "patient" | "companion" (gite RIDENT)
  participantType: text("participant_type").notNull(),
  ageRangeId: uuid("age_range_id").references(() => ageRangesTable.id, {
    onDelete: "set null",
  }),
  // Etichetta fascia al momento della prenotazione (leggibile anche se la fascia cambia)
  ageRangeLabel: text("age_range_label"),
  pickupPointId: uuid("pickup_point_id").references(
    () => excursionPickupPointsTable.id,
    { onDelete: "set null" },
  ),
  pickupPointName: text("pickup_point_name"),
  basePriceCents: integer("base_price_cents").notNull().default(0),
  pickupSurchargeCents: integer("pickup_surcharge_cents").notNull().default(0),
  finalPriceCents: integer("final_price_cents").notNull().default(0),
  // Obbligatoria nel checkout pubblico corrente; resta nullable soltanto per
  // prenotazioni legacy e per eventuali import amministrativi incompleti.
  firstName: text("first_name"),
  lastName: text("last_name"),
  personalData: jsonb("personal_data").$type<Record<string, unknown>>(),
  notes: text("notes"),
  dataCompleted: boolean("data_completed").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Consensi della prenotazione: terms e privacy obbligatori, media facoltativo.
// Una riga per tipo, sempre scritta (accepted true/false) con versione del testo.
export const bookingConsentsTable = pgTable(
  "booking_consents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => excursionBookingsTable.id, { onDelete: "cascade" }),
    // "terms" | "privacy" | "media"
    consentType: text("consent_type").notNull(),
    accepted: boolean("accepted").notNull(),
    policyVersion: text("policy_version"),
    acceptedAt: timestamp("accepted_at").notNull().defaultNow(),
  },
  (t) => [
    unique("booking_consents_booking_type_uq").on(t.bookingId, t.consentType),
  ],
);

// Richiesta di pagamento legata a una prenotazione: acconto, totale o saldo.
// Il saldo viene creato (una sola volta) alla conferma della gita.
export const paymentRequestsTable = pgTable("payment_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  bookingId: uuid("booking_id")
    .notNull()
    .references(() => excursionBookingsTable.id, { onDelete: "cascade" }),
  // "deposit" | "full" | "balance"
  type: text("type").notNull(),
  amountCents: integer("amount_cents").notNull(),
  // "pending" | "paid" | "expired" | "cancelled"
  status: text("status").notNull().default("pending"),
  // "card" | "bank_transfer" | "office"
  method: text("method"),
  deadline: timestamp("deadline"),
  paidAt: timestamp("paid_at"),
  transactionReference: text("transaction_reference"),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  // Periodo di tolleranza amministrativo successivo alla deadline. Non cambia
  // la scadenza contrattuale, ma impedisce al job di scadere la richiesta prima
  // del termine concesso.
  graceUntil: timestamp("grace_until", { withTimezone: true }),
  // Ultima Checkout Session associata alla richiesta. Non e un vincolo unico:
  // una richiesta puo generare piu tentativi Stripe nel tempo.
  stripeCheckoutSessionId: text("stripe_checkout_session_id"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Singolo tentativo tecnico di incasso per una richiesta di pagamento. Una
// richiesta puo avere piu tentativi (per esempio dopo un checkout abbandonato),
// senza duplicare l'obbligazione economica rappresentata da payment_requests.
export const paymentAttemptsTable = pgTable(
  "payment_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    paymentRequestId: uuid("payment_request_id")
      .notNull()
      .references(() => paymentRequestsTable.id, { onDelete: "cascade" }),
    provider: text("provider").notNull().default("stripe"),
    // "pending" | "processing" | "cancellation_pending" | "succeeded" |
    // "failed" | "cancelled"
    status: text("status").notNull().default("pending"),
    amountCents: integer("amount_cents").notNull(),
    idempotencyKey: text("idempotency_key")
      .notNull()
      .unique("payment_attempts_idempotency_key_uq"),
    stripePaymentIntentId: text("stripe_payment_intent_id").unique(
      "payment_attempts_stripe_payment_intent_id_uq",
    ),
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
  (t) => [index("payment_attempts_payment_request_idx").on(t.paymentRequestId)],
);

export type BookingParticipant = typeof bookingParticipantsTable.$inferSelect;
export type BookingConsent = typeof bookingConsentsTable.$inferSelect;
export type PaymentRequest = typeof paymentRequestsTable.$inferSelect;
export type PaymentAttempt = typeof paymentAttemptsTable.$inferSelect;
