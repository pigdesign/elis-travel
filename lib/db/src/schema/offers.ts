import { pgTable, text, timestamp, integer, numeric, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const offersTable = pgTable("offers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  destination: text("destination").notNull(),
  tourOperator: text("tour_operator"),
  status: text("status").notNull().default("draft"),
  validFrom: timestamp("valid_from"),
  validTo: timestamp("valid_to"),
  baseFormula: text("base_formula"),
  departureCity: text("departure_city"),
  durationDays: integer("duration_days"),
  durationNights: integer("duration_nights"),
  period: text("period"),
  publicPrice: numeric("public_price", { precision: 10, scale: 2 }),
  advertisingText: text("advertising_text"),
  servicesIncluded: text("services_included"),
  servicesExcluded: text("services_excluded"),
  highlights: text("highlights"),
  pricingNotes: text("pricing_notes"),
  internalNotes: text("internal_notes"),
  publicLink: text("public_link"),
  leadsCount: integer("leads_count").notNull().default(0),
  lastInterestAt: timestamp("last_interest_at"),
  mainSource: text("main_source"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertOfferSchema = createInsertSchema(offersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const selectOfferSchema = createSelectSchema(offersTable);

export type InsertOffer = z.infer<typeof insertOfferSchema>;
export type Offer = typeof offersTable.$inferSelect;
