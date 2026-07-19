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
  }).notNull().default("0"),
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
  payBankTransferEnabled: boolean("pay_bank_transfer_enabled").notNull().default(true),
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
    { onDelete: "set null" }
  ),
  switchVehicleAdditionalCost: numeric("switch_vehicle_additional_cost", {
    precision: 10,
    scale: 2,
  }),
  operationalNotes: text("operational_notes"),
  coverImageUrl: text("cover_image_url"),
  schedule:     jsonb("schedule"),
  included:     text("included"),
  excluded:     text("excluded"),
  generalInfo:  text("general_info"),
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
  bookingCode: text("booking_code"),
  // "deposit" | "full" | "balance": cosa ha scelto di pagare il cliente
  paymentType: text("payment_type"),
  // "card" | "bank_transfer" | "office"
  paymentMethod: text("payment_method"),
  // Totale prenotazione in centesimi (snapshot storico calcolato dal server);
  // amountDueCents resta l'importo della richiesta corrente (acconto o totale).
  totalAmountCents: integer("total_amount_cents"),
  amountPaidCents: integer("amount_paid_cents").notNull().default(0),
  paymentDeadline: timestamp("payment_deadline"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const excursionPickupPointsTable = pgTable("excursion_pickup_points", {
  id:               uuid("id").primaryKey().defaultRandom(),
  excursionId:      uuid("excursion_id").notNull().references(() => excursionsTable.id, { onDelete: "cascade" }),
  pickupLocationId: uuid("pickup_location_id").notNull().references(() => pickupLocationsTable.id, { onDelete: "cascade" }),
  pickupTime:       text("pickup_time"),
  sortOrder:        integer("sort_order").notNull().default(0),
  // Supplemento specifico del punto per questa gita (euro, a persona).
  // Null = fallback sul supplemento provincia (excursions.provinceSurcharges).
  surcharge:        numeric("surcharge", { precision: 10, scale: 2 }),
  createdAt:        timestamp("created_at").notNull().defaultNow(),
});

export type ExcursionPickupPoint = typeof excursionPickupPointsTable.$inferSelect;

export const insertExcursionSchema = createInsertSchema(excursionsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const selectExcursionSchema = createSelectSchema(excursionsTable);
export const insertExcursionBookingSchema = createInsertSchema(
  excursionBookingsTable
).omit({ id: true, createdAt: true, updatedAt: true });

export type InsertExcursion = z.infer<typeof insertExcursionSchema>;
export type Excursion = typeof excursionsTable.$inferSelect;
export type ExcursionVehicle = typeof excursionVehiclesTable.$inferSelect;
export type ExcursionBooking = typeof excursionBookingsTable.$inferSelect;
