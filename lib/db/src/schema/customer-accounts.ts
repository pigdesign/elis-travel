import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { customersTable } from "./customers";
import { excursionBookingsTable } from "./excursions";
import { pickupLocationsTable } from "./pickup-locations";

// ---------------------------------------------------------------------------
// Area clienti — identita, accesso e proprieta delle prenotazioni.
//
// Le credenziali NON stanno su `customers`: quella tabella e sotto
// last-write-wins con RMS Riviera e un sync in ingresso non deve poter toccare
// stato dell'account, verifica email o collegamenti. Qui vive tutto cio che
// e nostro e non viene sincronizzato.
// ---------------------------------------------------------------------------

export const CUSTOMER_ACCOUNT_STATUSES = [
  "pending",
  "active",
  "blocked",
] as const;
export type CustomerAccountStatus =
  (typeof CUSTOMER_ACCOUNT_STATUSES)[number];

export const CUSTOMER_EMAIL_STATUSES = [
  "unknown",
  "deliverable",
  "bounced",
] as const;
export type CustomerEmailStatus = (typeof CUSTOMER_EMAIL_STATUSES)[number];

export const CUSTOMER_ACCOUNT_ORIGINS = ["booking", "self", "admin"] as const;
export type CustomerAccountOrigin =
  (typeof CUSTOMER_ACCOUNT_ORIGINS)[number];

/**
 * Normalizzazione dell'indirizzo di accesso. Deve coincidere ESATTAMENTE con
 * l'espressione dell'indice unico piu sotto, altrimenti l'indice non viene
 * usato e due varianti dello stesso indirizzo creerebbero due account.
 */
export function normalizeAccountEmail(email: string): string {
  return email.trim().toLowerCase();
}

export const customerAccountsTable = pgTable(
  "customer_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Collegamento all'anagrafica: nullable e NON unico. Un account puo esistere
    // prima di avere un'anagrafica, e due account (marito e moglie) possono
    // legittimamente puntare alla stessa riga di famiglia.
    customerId: uuid("customer_id").references(() => customersTable.id, {
      onDelete: "set null",
    }),
    email: text("email").notNull(),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    // Stato di recapito, alimentato dal webhook bounce di Resend. Con il magic
    // link come unico accesso, un indirizzo che rimbalza rende l'account
    // irraggiungibile: va reso visibile in backoffice, non scoperto per caso.
    emailStatus: text("email_status").notNull().default("unknown"),
    emailBouncedAt: timestamp("email_bounced_at", { withTimezone: true }),
    // Sempre null in fase 1: al lancio si accede solo via magic link. La colonna
    // esiste per non richiedere una migration se la password verra introdotta.
    passwordHash: text("password_hash"),
    status: text("status").notNull().default("pending"),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdVia: text("created_via").notNull(),
    // Dati di profilo dell'area riservata. Stanno QUI e non su `customers`
    // perche customerId non e unico: scrivere il profilo sull'anagrafica
    // condivisa farebbe sovrascrivere a vicenda due account della stessa
    // famiglia, e la corruzione verrebbe pure propagata a RMS.
    firstName: text("first_name"),
    lastName: text("last_name"),
    phone: text("phone"),
    mobile: text("mobile"),
    profileUpdatedAt: timestamp("profile_updated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // L'unico vincolo di unicita che introduciamo in tutto il progetto.
    // Deliberatamente NON su customers.email: quella tabella e di RMS e le
    // email condivise in famiglia vi sono legittime.
    uniqueIndex("customer_accounts_email_uq").on(
      sql`lower(btrim(${t.email}))`,
    ),
    index("customer_accounts_customer_idx").on(t.customerId),
  ],
);

export const CUSTOMER_IDENTITY_PROVIDERS = ["password", "google"] as const;
export type CustomerIdentityProvider =
  (typeof CUSTOMER_IDENTITY_PROVIDERS)[number];

/**
 * Metodi di accesso collegati a un account. Creata fin da subito anche senza
 * Google attivo: costo nullo ora, evita una migration in produzione dopo.
 */
export const customerIdentitiesTable = pgTable(
  "customer_identities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => customerAccountsTable.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    providerUserId: text("provider_user_id").notNull(),
    emailAtLink: text("email_at_link"),
    linkedAt: timestamp("linked_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("customer_identities_provider_uq").on(t.provider, t.providerUserId),
    index("customer_identities_account_idx").on(t.accountId),
  ],
);

export const CUSTOMER_TOKEN_PURPOSES = [
  "magic_link",
  "email_verify",
  "account_invite",
  "password_reset",
] as const;
export type CustomerTokenPurpose =
  (typeof CUSTOMER_TOKEN_PURPOSES)[number];

/**
 * Token monouso per accesso, verifica e invito.
 *
 * In tabella finisce solo l'hash: chi legge il database non puo accedere a
 * nessun account. Il consumo deve avvenire con un UPDATE condizionale
 * (`SET used_at = now() WHERE id = ? AND used_at IS NULL RETURNING *`): un
 * controllo seguito da scrittura sarebbe soggetto a race, e i client email che
 * fanno prefetch dei link la innescano davvero.
 */
export const customerAuthTokensTable = pgTable(
  "customer_auth_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => customerAccountsTable.id, { onDelete: "cascade" }),
    purpose: text("purpose").notNull(),
    // Ambito dell'invito: un token 'account_invite' nasce DA una prenotazione e
    // autorizza il collegamento di QUELLA prenotazione. E il modo in cui la
    // prova di possesso dell'email viene circoscritta a un oggetto preciso.
    bookingId: uuid("booking_id").references(() => excursionBookingsTable.id, {
      onDelete: "set null",
    }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    requestedIp: text("requested_ip"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("customer_auth_tokens_hash_uq").on(t.tokenHash),
    index("customer_auth_tokens_lookup_idx").on(
      t.accountId,
      t.purpose,
      t.expiresAt,
    ),
  ],
);

export const BOOKING_LINK_ORIGINS = [
  "invite_token",
  "portal_token",
  "admin",
  "backfill",
] as const;
export type BookingLinkOrigin = (typeof BOOKING_LINK_ORIGINS)[number];

/**
 * Proprieta di una prenotazione da parte di un account.
 *
 * L'autorizzazione non si deduce da un confronto di email: due persone diverse
 * possono usare lo stesso indirizzo, un capogruppo prenota per venti, un figlio
 * per i genitori, e un semplice refuso metterebbe la prenotazione di uno nella
 * lista di un altro. Ogni riga qui e una decisione deliberata e revocabile, e
 * `linkedVia` ne conserva la provenienza: due valori corrispondono a una prova
 * di possesso ('invite_token', 'portal_token') e due a una scelta umana
 * ('admin', 'backfill' supervisionato). Nessun percorso euristico.
 *
 * `excursion_bookings.customer_id` NON partecipa a questa decisione: resta un
 * collegamento CRM best-effort.
 */
export const customerAccountBookingsTable = pgTable(
  "customer_account_bookings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => customerAccountsTable.id, { onDelete: "cascade" }),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => excursionBookingsTable.id, { onDelete: "cascade" }),
    linkedVia: text("linked_via").notNull(),
    linkedAt: timestamp("linked_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    linkedBy: text("linked_by"),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [
    unique("customer_account_bookings_uq").on(t.accountId, t.bookingId),
    index("customer_account_bookings_booking_idx").on(t.bookingId),
  ],
);

export const CUSTOMER_ACCOUNT_EVENT_TYPES = [
  "magic_link_requested",
  "magic_link_consumed",
  "magic_link_failed",
  "login",
  "logout",
  // Accesso con password: opzionale, impostabile solo da dentro una sessione
  // gia autenticata. I tentativi falliti sono qui e non altrove perche e da
  // qui che si conta per limitarli, esattamente come per il magic link.
  "password_set",
  "password_removed",
  "password_login_failed",
  "invite_sent",
  "blocked",
  "unblocked",
  "booking_linked",
  "booking_link_revoked",
  "profile_updated",
  "email_bounced",
] as const;
export type CustomerAccountEventType =
  (typeof CUSTOMER_ACCOUNT_EVENT_TYPES)[number];

/**
 * Audit degli eventi di account E base del rate limiting.
 *
 * Le due funzioni stanno insieme di proposito: il limite per indirizzo e per IP
 * si calcola contando le righe su una finestra temporale, quindi e durabile,
 * condiviso fra processi e sopravvive ai deploy. Il MemoryStore di
 * express-rate-limit non ha nessuna di queste proprieta, ed e proprio la difesa
 * contro enumerazione ed email bombing a non poter stare in memoria.
 *
 * La riga va scritta a OGNI tentativo, anche quando l'indirizzo non esiste
 * (`accountId` null, `emailHash` valorizzato): e cio che rende il limite
 * efficace contro chi prova indirizzi a caso.
 *
 * Dell'indirizzo si conserva solo l'hash: basta per contare, inutile a chi
 * dovesse mettere le mani sul database.
 */
export const customerAccountEventsTable = pgTable(
  "customer_account_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id").references(() => customerAccountsTable.id, {
      onDelete: "set null",
    }),
    eventType: text("event_type").notNull(),
    emailHash: text("email_hash"),
    ip: text("ip"),
    detail: jsonb("detail").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("customer_account_events_email_idx").on(
      t.emailHash,
      t.eventType,
      t.createdAt,
    ),
    index("customer_account_events_ip_idx").on(t.ip, t.eventType, t.createdAt),
    index("customer_account_events_account_idx").on(t.accountId, t.createdAt),
  ],
);

/**
 * Rubrica viaggiatori: compagni di viaggio ricorrenti, per precompilare il form
 * partecipanti alla prenotazione successiva.
 *
 * Appesa all'account e non a `customers`: e un oggetto dell'area riservata, non
 * anagrafica da sincronizzare con RMS. Non ha relazione con
 * `booking_participants`, che resta uno snapshot storico immutabile.
 *
 * ATTENZIONE: `birthDate` contiene tipicamente date di nascita di minori
 * (le fasce eta bambini determinano il prezzo). Va trattato a parte
 * nell'informativa privacy.
 */
export const customerTravelersTable = pgTable(
  "customer_travelers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => customerAccountsTable.id, { onDelete: "cascade" }),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    relationship: text("relationship"),
    birthDate: date("birth_date"),
    defaultPickupPointId: uuid("default_pickup_point_id").references(
      () => pickupLocationsTable.id,
      { onDelete: "set null" },
    ),
    notes: text("notes"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("customer_travelers_account_idx").on(t.accountId)],
);

/**
 * Preferenze di viaggio e consensi marketing. `province` si aggancia alla
 * logica dei supplementi gia presente in `excursions.province_surcharges`.
 * I consensi marketing sono opt-in esplicito: default false.
 */
export const customerPreferencesTable = pgTable("customer_preferences", {
  accountId: uuid("account_id")
    .primaryKey()
    .references(() => customerAccountsTable.id, { onDelete: "cascade" }),
  defaultPickupPointId: uuid("default_pickup_point_id").references(
    () => pickupLocationsTable.id,
    { onDelete: "set null" },
  ),
  province: text("province"),
  marketingEmail: boolean("marketing_email").notNull().default(false),
  marketingWhatsapp: boolean("marketing_whatsapp").notNull().default(false),
  consentUpdatedAt: timestamp("consent_updated_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const LOYALTY_REASONS = [
  "booking_completed",
  "manual_adjustment",
  "redeemed",
] as const;
export type LoyaltyReason = (typeof LOYALTY_REASONS)[number];

/**
 * Ledger dei punti fedelta. APPEND-ONLY: il saldo e la somma dei delta non
 * scaduti, mai un contatore modificabile. Costa uguale scriverlo cosi adesso e
 * permette di ricalcolare retroattivamente sullo storico quando le regole di
 * maturazione verranno definite — cosa impossibile con un contatore.
 *
 * In fase 1 nessuno ci scrive.
 */
export const loyaltyTransactionsTable = pgTable(
  "loyalty_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => customerAccountsTable.id, { onDelete: "cascade" }),
    deltaPoints: integer("delta_points").notNull(),
    reason: text("reason").notNull(),
    bookingId: uuid("booking_id").references(() => excursionBookingsTable.id, {
      onDelete: "set null",
    }),
    note: text("note"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("loyalty_transactions_account_idx").on(t.accountId, t.createdAt)],
);

export type CustomerAccount = typeof customerAccountsTable.$inferSelect;
export type CustomerIdentity = typeof customerIdentitiesTable.$inferSelect;
export type CustomerAuthToken = typeof customerAuthTokensTable.$inferSelect;
export type CustomerAccountBooking =
  typeof customerAccountBookingsTable.$inferSelect;
export type CustomerAccountEvent =
  typeof customerAccountEventsTable.$inferSelect;
export type CustomerTraveler = typeof customerTravelersTable.$inferSelect;
export type CustomerPreferences =
  typeof customerPreferencesTable.$inferSelect;
export type LoyaltyTransaction = typeof loyaltyTransactionsTable.$inferSelect;
