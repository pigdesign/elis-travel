import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { customersTable } from "./customers";
import { offersTable } from "./offers";
import { excursionsTable } from "./excursions";

export const leadsTable = pgTable("leads", {
  id: uuid("id").primaryKey().defaultRandom(),
  customerName: text("customer_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  customerId: uuid("customer_id").references(() => customersTable.id, {
    onDelete: "set null",
  }),
  offerId: uuid("offer_id").references(() => offersTable.id, {
    onDelete: "set null",
  }),
  excursionId: uuid("excursion_id").references(() => excursionsTable.id, {
    onDelete: "set null",
  }),
  type: text("type").notNull().default("generic"),
  status: text("status").notNull().default("new"),
  channel: text("channel").default("website"),
  assignedTo: text("assigned_to"),
  lastContactAt: timestamp("last_contact_at"),
  receivedAt: timestamp("received_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const leadNotesTable = pgTable("lead_notes", {
  id: uuid("id").primaryKey().defaultRandom(),
  leadId: uuid("lead_id")
    .notNull()
    .references(() => leadsTable.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  authorName: text("author_name").notNull().default("Staff"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertLeadSchema = createInsertSchema(leadsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const selectLeadSchema = createSelectSchema(leadsTable);
export const insertLeadNoteSchema = createInsertSchema(leadNotesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertLead = z.infer<typeof insertLeadSchema>;
export type Lead = typeof leadsTable.$inferSelect;
export type LeadNote = typeof leadNotesTable.$inferSelect;
