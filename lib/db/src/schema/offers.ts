import { pgTable, text, timestamp, integer, numeric, uuid, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { relations } from "drizzle-orm";

export const offersTable = pgTable("offers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  // Riga di richiamo sotto il titolo, in locandina e sulla pagina pubblica.
  subtitle: text("subtitle"),
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
  coverImageUrl: text("cover_image_url"),
  schedule: jsonb("schedule"),
  category: text("category"),
  featured: boolean("featured").notNull().default(false),
  lastMinute: boolean("last_minute").notNull().default(false),
  leadsCount: integer("leads_count").notNull().default(0),
  lastInterestAt: timestamp("last_interest_at"),
  mainSource: text("main_source"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const offerImagesTable = pgTable("offer_images", {
  id: uuid("id").primaryKey().defaultRandom(),
  offerId: uuid("offer_id").notNull().references(() => offersTable.id, { onDelete: "cascade" }),
  imageUrl: text("image_url").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const offerDocumentsTable = pgTable("offer_documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  offerId: uuid("offer_id").notNull().references(() => offersTable.id, { onDelete: "cascade" }),
  documentUrl: text("document_url").notNull(),
  fileName: text("file_name"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const offersRelations = relations(offersTable, ({ many }) => ({
  images: many(offerImagesTable),
  documents: many(offerDocumentsTable),
}));

export const offerImagesRelations = relations(offerImagesTable, ({ one }) => ({
  offer: one(offersTable, { fields: [offerImagesTable.offerId], references: [offersTable.id] }),
}));

export const offerDocumentsRelations = relations(offerDocumentsTable, ({ one }) => ({
  offer: one(offersTable, { fields: [offerDocumentsTable.offerId], references: [offersTable.id] }),
}));

export const insertOfferSchema = createInsertSchema(offersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const selectOfferSchema = createSelectSchema(offersTable);
export const insertOfferImageSchema = createInsertSchema(offerImagesTable).omit({ id: true, createdAt: true });
export const selectOfferImageSchema = createSelectSchema(offerImagesTable);
export const insertOfferDocumentSchema = createInsertSchema(offerDocumentsTable).omit({ id: true, createdAt: true });
export const selectOfferDocumentSchema = createSelectSchema(offerDocumentsTable);

export type InsertOffer = z.infer<typeof insertOfferSchema>;
export type Offer = typeof offersTable.$inferSelect;
export type OfferImage = typeof offerImagesTable.$inferSelect;
export type OfferDocument = typeof offerDocumentsTable.$inferSelect;
