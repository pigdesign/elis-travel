import {
  pgTable,
  text,
  timestamp,
  integer,
  numeric,
  uuid,
  date,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { customersTable } from "./customers";

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
  pricePerPerson: numeric("price_per_person", {
    precision: 10,
    scale: 2,
  }).notNull().default("0"),
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
  seats: integer("seats").notNull().default(1),
  paymentStatus: text("payment_status").notNull().default("pending"),
  bookedAt: timestamp("booked_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

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
