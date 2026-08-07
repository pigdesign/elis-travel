import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

// Area clienti — creazione delle tabelle di identita e accesso.
//
// Interamente additiva: nessun ALTER TABLE, nessun vincolo nuovo su tabelle
// esistenti. In particolare NON viene toccata `customers`, che e sotto
// last-write-wins con RMS Riviera: aggiungervi un indice unico sull'email
// farebbe fallire il sync in ingresso quando RMS produce indirizzi condivisi
// (marito e moglie sulla stessa casella sono due righe legittime).
//
// Idempotente: rieseguibile senza effetti.
const STATEMENTS: Array<[string, string]> = [
  [
    "customer_accounts",
    `CREATE TABLE IF NOT EXISTS customer_accounts (
       id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       customer_id        uuid REFERENCES customers(id) ON DELETE SET NULL,
       email              text NOT NULL,
       email_verified_at  timestamptz,
       email_status       text NOT NULL DEFAULT 'unknown',
       email_bounced_at   timestamptz,
       password_hash      text,
       status             text NOT NULL DEFAULT 'pending',
       last_login_at      timestamptz,
       created_via        text NOT NULL,
       first_name         text,
       last_name          text,
       phone              text,
       mobile             text,
       profile_updated_at timestamptz,
       created_at         timestamptz NOT NULL DEFAULT now(),
       updated_at         timestamptz NOT NULL DEFAULT now()
     )`,
  ],
  [
    "customer_accounts — indice unico email",
    // L'espressione deve coincidere ESATTAMENTE con normalizeAccountEmail()
    // nello schema Drizzle, altrimenti l'indice non viene usato dalle query.
    `CREATE UNIQUE INDEX IF NOT EXISTS customer_accounts_email_uq
       ON customer_accounts (lower(btrim(email)))`,
  ],
  [
    "customer_accounts — indice anagrafica",
    `CREATE INDEX IF NOT EXISTS customer_accounts_customer_idx
       ON customer_accounts (customer_id)`,
  ],
  [
    "customer_identities",
    `CREATE TABLE IF NOT EXISTS customer_identities (
       id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       account_id       uuid NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
       provider         text NOT NULL,
       provider_user_id text NOT NULL,
       email_at_link    text,
       linked_at        timestamptz NOT NULL DEFAULT now(),
       CONSTRAINT customer_identities_provider_uq UNIQUE (provider, provider_user_id)
     )`,
  ],
  [
    "customer_identities — indice account",
    `CREATE INDEX IF NOT EXISTS customer_identities_account_idx
       ON customer_identities (account_id)`,
  ],
  [
    "customer_auth_tokens",
    `CREATE TABLE IF NOT EXISTS customer_auth_tokens (
       id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       account_id   uuid NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
       purpose      text NOT NULL,
       booking_id   uuid REFERENCES excursion_bookings(id) ON DELETE SET NULL,
       token_hash   text NOT NULL,
       expires_at   timestamptz NOT NULL,
       used_at      timestamptz,
       requested_ip text,
       created_at   timestamptz NOT NULL DEFAULT now(),
       CONSTRAINT customer_auth_tokens_hash_uq UNIQUE (token_hash)
     )`,
  ],
  [
    "customer_auth_tokens — indice lookup",
    `CREATE INDEX IF NOT EXISTS customer_auth_tokens_lookup_idx
       ON customer_auth_tokens (account_id, purpose, expires_at)`,
  ],
  [
    "customer_account_bookings",
    `CREATE TABLE IF NOT EXISTS customer_account_bookings (
       id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       account_id uuid NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
       booking_id uuid NOT NULL REFERENCES excursion_bookings(id) ON DELETE CASCADE,
       linked_via text NOT NULL,
       linked_at  timestamptz NOT NULL DEFAULT now(),
       linked_by  text,
       revoked_at timestamptz,
       CONSTRAINT customer_account_bookings_uq UNIQUE (account_id, booking_id)
     )`,
  ],
  [
    "customer_account_bookings — indice prenotazione",
    `CREATE INDEX IF NOT EXISTS customer_account_bookings_booking_idx
       ON customer_account_bookings (booking_id)`,
  ],
  [
    "customer_account_events",
    `CREATE TABLE IF NOT EXISTS customer_account_events (
       id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       account_id uuid REFERENCES customer_accounts(id) ON DELETE SET NULL,
       event_type text NOT NULL,
       email_hash text,
       ip         text,
       detail     jsonb,
       created_at timestamptz NOT NULL DEFAULT now()
     )`,
  ],
  [
    "customer_account_events — indici di conteggio",
    // Questi due indici non sono cosmetici: sono cio che rende il rate limiting
    // per email e per IP una query economica su ogni richiesta di magic link.
    `CREATE INDEX IF NOT EXISTS customer_account_events_email_idx
       ON customer_account_events (email_hash, event_type, created_at)`,
  ],
  [
    "customer_account_events — indice IP",
    `CREATE INDEX IF NOT EXISTS customer_account_events_ip_idx
       ON customer_account_events (ip, event_type, created_at)`,
  ],
  [
    "customer_account_events — indice account",
    `CREATE INDEX IF NOT EXISTS customer_account_events_account_idx
       ON customer_account_events (account_id, created_at)`,
  ],
  [
    "customer_travelers",
    `CREATE TABLE IF NOT EXISTS customer_travelers (
       id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       account_id              uuid NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
       first_name              text NOT NULL,
       last_name               text NOT NULL,
       relationship            text,
       birth_date              date,
       default_pickup_point_id uuid REFERENCES pickup_locations(id) ON DELETE SET NULL,
       notes                   text,
       archived_at             timestamptz,
       created_at              timestamptz NOT NULL DEFAULT now(),
       updated_at              timestamptz NOT NULL DEFAULT now()
     )`,
  ],
  [
    "customer_travelers — indice account",
    `CREATE INDEX IF NOT EXISTS customer_travelers_account_idx
       ON customer_travelers (account_id)`,
  ],
  [
    "customer_preferences",
    `CREATE TABLE IF NOT EXISTS customer_preferences (
       account_id              uuid PRIMARY KEY REFERENCES customer_accounts(id) ON DELETE CASCADE,
       default_pickup_point_id uuid REFERENCES pickup_locations(id) ON DELETE SET NULL,
       province                text,
       marketing_email         boolean NOT NULL DEFAULT false,
       marketing_whatsapp      boolean NOT NULL DEFAULT false,
       consent_updated_at      timestamptz,
       updated_at              timestamptz NOT NULL DEFAULT now()
     )`,
  ],
  [
    "loyalty_transactions",
    `CREATE TABLE IF NOT EXISTS loyalty_transactions (
       id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       account_id   uuid NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
       delta_points integer NOT NULL,
       reason       text NOT NULL,
       booking_id   uuid REFERENCES excursion_bookings(id) ON DELETE SET NULL,
       note         text,
       expires_at   timestamptz,
       created_by   text,
       created_at   timestamptz NOT NULL DEFAULT now()
     )`,
  ],
  [
    "loyalty_transactions — indice account",
    `CREATE INDEX IF NOT EXISTS loyalty_transactions_account_idx
       ON loyalty_transactions (account_id, created_at)`,
  ],
];

async function migrate() {
  for (const [label, statement] of STATEMENTS) {
    await db.execute(sql.raw(statement));
    console.log(`  ✓ ${label}`);
  }
  console.log("\n✓ Tabelle area clienti pronte");
  process.exit(0);
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
