import {
  pgTable,
  text,
  timestamp,
  integer,
  numeric,
  uuid,
  date,
  jsonb,
  boolean,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { customersTable } from "./customers";
import { pickupLocationsTable } from "./pickup-locations";

// Voce di costo "Extra" nominata, salvata nella colonna jsonb `extras`.
export type ExcursionExtra = { name: string; price: number };

export const excursionVehiclesTable = pgTable("excursion_vehicles", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  capacity: integer("capacity").notNull(),
  fixedCost: numeric("fixed_cost", { precision: 10, scale: 2 }).notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const excursionsTable = pgTable("excursions", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  location: text("location").notNull(),
  date: date("date").notNull(),
  // Istante reale di partenza. `date` resta disponibile per catalogo e
  // compatibilita con le gite storiche, mentre scadenze e automazioni usano
  // questo valore timezone-aware quando presente.
  departureAt: timestamp("departure_at", { withTimezone: true }),
  status: text("status").notNull().default("draft"),
  // "standard" = gita pubblica normale (elenco /gite); "rident" = gita pubblica
  // mostrata nella pagina dedicata /rident (con voce di menu propria), fuori
  // dall'elenco/filtri delle gite standard ma comunque indicizzabile.
  category: text("category").notNull().default("standard"),
  // Tag tematici liberi (es. "weekend", "cultura"), usati dal filtro pubblico "Tipologia".
  // Concetto distinto da category: si applicano solo alle gite standard.
  tags: text("tags").array().notNull().default([]),
  vehicleId: uuid("vehicle_id").references(() => excursionVehiclesTable.id, {
    onDelete: "set null",
  }),
  currentCapacity: integer("current_capacity").notNull().default(0),
  minThreshold: integer("min_threshold").notNull().default(1),
  adherentsCount: integer("adherents_count").notNull().default(0),
  depositsCount: integer("deposits_count").notNull().default(0),
  balancesCount: integer("balances_count").notNull().default(0),
  vehicleFixedCost: numeric("vehicle_fixed_cost", {
    precision: 10,
    scale: 2,
  }).default("0"),
  mealCostPerPerson: numeric("meal_cost_per_person", {
    precision: 10,
    scale: 2,
  }).default("0"),
  entranceCostPerPerson: numeric("entrance_cost_per_person", {
    precision: 10,
    scale: 2,
  }).default("0"),
  extraCostPerPerson: numeric("extra_cost_per_person", {
    precision: 10,
    scale: 2,
  }).default("0"),
  // Scomposizione nominata del costo "Extra": voci interne { name, price }.
  // La somma dei price viene tenuta sincronizzata in extraCostPerPerson, che
  // resta la fonte usata da margine/conto economico/report.
  extras: jsonb("extras").$type<ExcursionExtra[]>().notNull().default([]),
  pricePerPerson: numeric("price_per_person", {
    precision: 10,
    scale: 2,
  })
    .notNull()
    .default("0"),
  // Supplemento a persona per provincia del punto di raccolta scelto,
  // specifico di questa gita: { "IM": 10, "GE": 0 }. Chiave = sigla provincia.
  provinceSurcharges: jsonb("province_surcharges")
    .$type<Record<string, number>>()
    .notNull()
    .default({}),
  // ---- Gite v2: prezzi RIDENT (usati solo se category = "rident") ----
  patientPrice: numeric("patient_price", { precision: 10, scale: 2 }),
  companionPrice: numeric("companion_price", { precision: 10, scale: 2 }),
  // ---- Gite v2: date aggiuntive ----
  returnDate: date("return_date"),
  bookingCloseDate: date("booking_close_date"),
  // ---- Gite v2: configurazione acconto ----
  depositEnabled: boolean("deposit_enabled").notNull().default(true),
  // "percent" | "fixed"; depositValue null = fallback sull'impostazione globale deposit_percentage
  depositType: text("deposit_type").notNull().default("percent"),
  depositValue: numeric("deposit_value", { precision: 10, scale: 2 }),
  // Acconto ancora selezionabile dopo la conferma della gita (default: solo totale)
  depositAvailableAfterConfirm: boolean("deposit_available_after_confirm")
    .notNull()
    .default(false),
  depositDeadlineDate: date("deposit_deadline_date"),
  // ---- Gite v2: saldo ----
  balanceDeadlineDate: date("balance_deadline_date"),
  // Override delle ore globali (payment_deadline_balance_hours) per questa gita
  balanceHoursOverride: integer("balance_hours_override"),
  // ---- Gite v2: metodi di pagamento abilitati ----
  payCardEnabled: boolean("pay_card_enabled").notNull().default(true),
  payBankTransferEnabled: boolean("pay_bank_transfer_enabled")
    .notNull()
    .default(true),
  payOfficeEnabled: boolean("pay_office_enabled").notNull().default(true),
  // Override delle ore globali di scadenza per bonifico / ufficio
  bankTransferHoursOverride: integer("bank_transfer_hours_override"),
  officeHoursOverride: integer("office_hours_override"),
  // Giorni prima della partenza da cui è ammesso solo il pagamento completo
  // (null = fallback sull'impostazione globale full_payment_only_days_before)
  fullPaymentOnlyDaysBefore: integer("full_payment_only_days_before"),
  // Momento della conferma manuale admin (base per le scadenze saldo)
  confirmedAt: timestamp("confirmed_at"),
  // Fase 2: solo flag, nessuna logica waitlist ancora attiva
  waitlistEnabled: boolean("waitlist_enabled").notNull().default(false),
  switchThreshold: integer("switch_threshold"),
  switchVehicleId: uuid("switch_vehicle_id").references(
    () => excursionVehiclesTable.id,
    { onDelete: "set null" },
  ),
  switchVehicleAdditionalCost: numeric("switch_vehicle_additional_cost", {
    precision: 10,
    scale: 2,
  }),
  operationalNotes: text("operational_notes"),
  coverImageUrl: text("cover_image_url"),
  schedule: jsonb("schedule"),
  included: text("included"),
  excluded: text("excluded"),
  generalInfo: text("general_info"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const excursionBookingsTable = pgTable("excursion_bookings", {
  id: uuid("id").primaryKey().defaultRandom(),
  excursionId: uuid("excursion_id")
    .notNull()
    .references(() => excursionsTable.id, { onDelete: "cascade" }),
  customerId: uuid("customer_id").references(() => customersTable.id, {
    onDelete: "set null",
  }),
  customerName: text("customer_name").notNull(),
  email: text("email"),
  phone: text("phone"),
  seats: integer("seats").notNull().default(1),
  adults: integer("adults").notNull().default(1),
  children: integer("children").notNull().default(0),
  paymentStatus: text("payment_status").notNull().default("pending"),
  servizioCasa: boolean("servizio_casa").notNull().default(false),
  // Snapshot dell'indirizzo indicato al momento della prenotazione per il
  // servizio di ritiro a domicilio. Resta nullable per le prenotazioni senza
  // servizio casa e per lo storico precedente all'introduzione del campo.
  homePickupAddress: text("home_pickup_address"),
  pickupPointId: uuid("pickup_point_id").references(
    (): AnyPgColumn => excursionPickupPointsTable.id,
    { onDelete: "set null" },
  ),
  bookedAt: timestamp("booked_at").notNull().defaultNow(),
  cancelledAt: timestamp("cancelled_at"),
  stripeCustomerId: text("stripe_customer_id"),
  stripePaymentMethodId: text("stripe_payment_method_id"),
  stripeSetupIntentId: text("stripe_setup_intent_id"),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  amountDueCents: integer("amount_due_cents"),
  // ---- Gite v2 ----
  // Codice breve leggibile (es. "ET-4F7K9") usato in causale bonifico ed email.
  // Null per le prenotazioni precedenti a Gite v2.
  bookingCode: text("booking_code").unique(
    "excursion_bookings_booking_code_uq",
  ),
  // "deposit" | "full" | "balance": cosa ha scelto di pagare il cliente
  paymentType: text("payment_type"),
  // "card" | "bank_transfer" | "office"
  paymentMethod: text("payment_method"),
  // Totale prenotazione in centesimi (snapshot storico calcolato dal server);
  // amountDueCents resta l'importo della richiesta corrente (acconto o totale).
  totalAmountCents: integer("total_amount_cents"),
  amountPaidCents: integer("amount_paid_cents").notNull().default(0),
  paymentDeadline: timestamp("payment_deadline"),
  // Versione del flusso che ha creato la prenotazione. Il default 2 mantiene
  // esplicitamente il comportamento delle righe esistenti; il nuovo flusso
  // dovra scrivere la propria versione senza affidarsi al default.
  workflowVersion: integer("workflow_version").notNull().default(2),
  // Chiave di idempotenza generata dal client per un singolo tentativo di
  // prenotazione. Postgres consente piu NULL in una colonna UNIQUE, quindi le
  // prenotazioni storiche non richiedono backfill.
  bookingAttemptId: text("booking_attempt_id").unique(
    "excursion_bookings_booking_attempt_id_uq",
  ),
  // Le prenotazioni pubbliche abilitano esplicitamente le comunicazioni. Per
  // gli inserimenti amministrativi il default prudente evita invii inattesi.
  customerNotificationsEnabled: boolean("customer_notifications_enabled")
    .notNull()
    .default(false),
  // Stato della riserva posti, separato dallo stato economico.
  // Valori previsti dal nuovo flusso: "held" | "confirmed" | "released".
  seatStatus: text("seat_status").notNull().default("held"),
  seatHoldExpiresAt: timestamp("seat_hold_expires_at", {
    withTimezone: true,
  }),
  seatReleasedAt: timestamp("seat_released_at", { withTimezone: true }),
  seatReleaseReason: text("seat_release_reason"),
  // Le prenotazioni gia pagate non vengono annullate direttamente dal link
  // pubblico: questi campi tracciano la richiesta sottoposta all'amministrazione.
  cancellationRequestedAt: timestamp("cancellation_requested_at", {
    withTimezone: true,
  }),
  // "pending" | "approved" | "rejected" | "completed"
  cancellationRequestStatus: text("cancellation_request_status"),
  cancellationRequestReason: text("cancellation_request_reason"),
  // Decisione economica dell'amministrazione. `approved` indica che posti e
  // richieste aperte sono stati chiusi, mentre `completed` viene impostato solo
  // quando tutti gli eventuali rimborsi (Stripe o manuali) sono conclusi.
  cancellationDecisionAt: timestamp("cancellation_decision_at", {
    withTimezone: true,
  }),
  cancellationCompletedAt: timestamp("cancellation_completed_at", {
    withTimezone: true,
  }),
  cancellationResolutionNote: text("cancellation_resolution_note"),
  // Importi lordi deliberati: amountPaidCents resta lo storico degli incassi e
  // non viene riscritto dopo il rimborso.
  cancellationRefundAmountCents: integer("cancellation_refund_amount_cents"),
  cancellationPenaltyAmountCents: integer("cancellation_penalty_amount_cents"),
  // Nel database viene conservato soltanto l'hash del token del portale.
  accessTokenHash: text("access_token_hash").unique(
    "excursion_bookings_access_token_hash_uq",
  ),
  accessTokenExpiresAt: timestamp("access_token_expires_at", {
    withTimezone: true,
  }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const excursionPickupPointsTable = pgTable("excursion_pickup_points", {
  id: uuid("id").primaryKey().defaultRandom(),
  excursionId: uuid("excursion_id")
    .notNull()
    .references(() => excursionsTable.id, { onDelete: "cascade" }),
  pickupLocationId: uuid("pickup_location_id")
    .notNull()
    .references(() => pickupLocationsTable.id, { onDelete: "cascade" }),
  pickupTime: text("pickup_time"),
  sortOrder: integer("sort_order").notNull().default(0),
  // Supplemento specifico del punto per questa gita (euro, a persona).
  // Null = fallback sul supplemento provincia (excursions.provinceSurcharges).
  surcharge: numeric("surcharge", { precision: 10, scale: 2 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type ExcursionPickupPoint =
  typeof excursionPickupPointsTable.$inferSelect;

export const insertExcursionSchema = createInsertSchema(excursionsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const selectExcursionSchema = createSelectSchema(excursionsTable);
export const insertExcursionBookingSchema = createInsertSchema(
  excursionBookingsTable,
).omit({ id: true, createdAt: true, updatedAt: true });

export type InsertExcursion = z.infer<typeof insertExcursionSchema>;
export type Excursion = typeof excursionsTable.$inferSelect;
export type ExcursionVehicle = typeof excursionVehiclesTable.$inferSelect;
export type ExcursionBooking = typeof excursionBookingsTable.$inferSelect;
