import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const SYNC_EVENT_TYPES = ["pull_from_rms", "push_to_rms"] as const;
export type SyncEventType = (typeof SYNC_EVENT_TYPES)[number];

export const SYNC_EVENT_STATUSES = ["success", "failed", "conflict"] as const;
export type SyncEventStatus = (typeof SYNC_EVENT_STATUSES)[number];

export const EXTERNAL_SYSTEMS = ["riviera_rms"] as const;
export type ExternalSystem = (typeof EXTERNAL_SYSTEMS)[number];

export const customersTable = pgTable("customers", {
  id: uuid("id").primaryKey().defaultRandom(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const customerExternalLinksTable = pgTable("customer_external_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  customerId: uuid("customer_id")
    .notNull()
    .references(() => customersTable.id, { onDelete: "cascade" }),
  externalSystem: text("external_system").notNull(),
  externalId: text("external_id").notNull(),
  lastSyncAt: timestamp("last_sync_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const customerSyncEventsTable = pgTable("customer_sync_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: text("event_id").notNull().unique(),
  customerId: uuid("customer_id").references(() => customersTable.id, {
    onDelete: "set null",
  }),
  sourceSystem: text("source_system").notNull(),
  eventType: text("event_type").notNull(),
  status: text("status").notNull().default("pending"),
  payload: text("payload"),
  occurredAt: timestamp("occurred_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertCustomerSchema = createInsertSchema(customersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const selectCustomerSchema = createSelectSchema(customersTable);

export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type Customer = typeof customersTable.$inferSelect;
