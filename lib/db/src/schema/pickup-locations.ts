import { pgTable, text, timestamp, integer, boolean, uuid } from "drizzle-orm/pg-core";

export const pickupLocationsTable = pgTable("pickup_locations", {
  id:        uuid("id").primaryKey().defaultRandom(),
  name:      text("name").notNull(),
  city:      text("city").notNull(),
  address:   text("address"),
  // Sigla provincia (es. "IM", "GE"); i punti creati prima dell'introduzione
  // delle province restano null = nessun supplemento applicabile.
  province:  text("province"),
  sortOrder: integer("sort_order").notNull().default(0),
  active:    boolean("active").notNull().default(true),
  mapsUrl:   text("maps_url"),
  notes:     text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type PickupLocation = typeof pickupLocationsTable.$inferSelect;
