import {
  pgTable,
  text,
  timestamp,
  uuid,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { excursionBookingsTable } from "./excursions";
import { paymentRequestsTable } from "./booking-participants";

// Diario delle correzioni fatte a mano dall'amministrazione su una
// prenotazione. Il registro contabile (payment_requests) resta la fonte di
// verita sugli importi: qui si tiene traccia di CHI ha deciso, QUANDO e
// PERCHE, che nel modello a partita doppia non e ricavabile dalle righe.
//
// Senza questo diario aprire la modifica manuale significherebbe permettere di
// riscrivere l'esito economico di una prenotazione senza lasciare traccia. La
// riga non e mai cancellabile dall'interfaccia: sopravvive anche allo storno
// dell'operazione che descrive.
export const bookingAdminActionsTable = pgTable(
  "booking_admin_actions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => excursionBookingsTable.id, { onDelete: "cascade" }),
    // Richiesta di pagamento toccata dall'operazione, quando ce n'e una.
    // `set null` e voluto: se la richiesta sparisce la traccia dell'intervento
    // deve restare.
    paymentRequestId: uuid("payment_request_id").references(
      () => paymentRequestsTable.id,
      { onDelete: "set null" },
    ),
    // "update_booking" | "update_payment_request" | "record_payment" |
    // "reverse_payment"
    action: text("action").notNull(),
    // Motivo scritto dall'operatore. Obbligatorio per storni e correzioni di
    // importo, facoltativo per il resto.
    reason: text("reason"),
    // Prima/dopo dei soli campi cambiati, gia normalizzati.
    details: jsonb("details").notNull().default({}),
    adminUserId: text("admin_user_id"),
    adminName: text("admin_name"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("booking_admin_actions_booking_idx").on(t.bookingId)],
);

export type BookingAdminAction = typeof bookingAdminActionsTable.$inferSelect;
