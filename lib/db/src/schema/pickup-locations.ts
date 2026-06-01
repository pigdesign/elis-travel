import { pgTable, text, timestamp, integer, uuid } from "drizzle-orm/pg-core";

export const pickupLocationsTable = pgTable("pickup_locations", {
  id:        uuid("id").primaryKey().defaultRandom(),
  name:      text("name").notNull(),
  city:      text("city").notNull(),
  address:   text("address"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type PickupLocation = typeof pickupLocationsTable.$inferSelect;
