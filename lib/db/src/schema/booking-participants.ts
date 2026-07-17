import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  uuid,
  jsonb,
  unique,
} from "drizzle-orm/pg-core";
import { excursionBookingsTable, excursionPickupPointsTable } from "./excursions";
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
  // Anagrafica raccolta in fase successiva (email/area riservata futura)
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
  (t) => [unique("booking_consents_booking_type_uq").on(t.bookingId, t.consentType)],
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
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type BookingParticipant = typeof bookingParticipantsTable.$inferSelect;
export type BookingConsent = typeof bookingConsentsTable.$inferSelect;
export type PaymentRequest = typeof paymentRequestsTable.$inferSelect;
