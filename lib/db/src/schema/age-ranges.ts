import {
  pgTable,
  text,
  timestamp,
  integer,
  numeric,
  boolean,
  uuid,
  unique,
} from "drizzle-orm/pg-core";
import { excursionsTable } from "./excursions";

// Fasce età globali per i bambini nelle gite normali (configurabili da admin).
// Gli adulti non hanno una fascia: chi supera il maxAge della fascia più alta
// attiva è adulto (etichetta pubblica derivata dall'impostazione adult_min_age).
export const ageRangesTable = pgTable("age_ranges", {
  id: uuid("id").primaryKey().defaultRandom(),
  label: text("label").notNull(),
  minAge: integer("min_age").notNull(),
  maxAge: integer("max_age").notNull(),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Prezzo per fascia età della singola gita normale. Le fasce sono globali,
// il prezzo è per gita; fascia senza riga = prezzo adulto pieno.
export const excursionAgePricesTable = pgTable(
  "excursion_age_prices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    excursionId: uuid("excursion_id")
      .notNull()
      .references(() => excursionsTable.id, { onDelete: "cascade" }),
    ageRangeId: uuid("age_range_id")
      .notNull()
      .references(() => ageRangesTable.id, { onDelete: "cascade" }),
    // In euro come excursions.pricePerPerson; 0 = gratuito.
    price: numeric("price", { precision: 10, scale: 2 }).notNull().default("0"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [unique("excursion_age_prices_excursion_range_uq").on(t.excursionId, t.ageRangeId)],
);

export type AgeRange = typeof ageRangesTable.$inferSelect;
export type ExcursionAgePrice = typeof excursionAgePricesTable.$inferSelect;
