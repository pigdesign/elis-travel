-- Gite v2: partecipanti individuali, fasce età, prezzi RIDENT, consensi,
-- richieste di pagamento, scadenze e supplementi per punto di raccolta.
-- Migrazione ADDITIVA e IDEMPOTENTE: sicura da rieseguire, non tocca dati esistenti.
-- Da applicare in produzione via Railway CLI (mai drizzle-kit push in prod).

BEGIN;

-- ---------- Nuove tabelle ----------

CREATE TABLE IF NOT EXISTS age_ranges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  min_age integer NOT NULL,
  max_age integer NOT NULL,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS excursion_age_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  excursion_id uuid NOT NULL REFERENCES excursions(id) ON DELETE CASCADE,
  age_range_id uuid NOT NULL REFERENCES age_ranges(id) ON DELETE CASCADE,
  price numeric(10,2) NOT NULL DEFAULT 0,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT excursion_age_prices_excursion_range_uq UNIQUE (excursion_id, age_range_id)
);

CREATE TABLE IF NOT EXISTS booking_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES excursion_bookings(id) ON DELETE CASCADE,
  participant_type text NOT NULL,
  age_range_id uuid REFERENCES age_ranges(id) ON DELETE SET NULL,
  age_range_label text,
  pickup_point_id uuid REFERENCES excursion_pickup_points(id) ON DELETE SET NULL,
  pickup_point_name text,
  base_price_cents integer NOT NULL DEFAULT 0,
  pickup_surcharge_cents integer NOT NULL DEFAULT 0,
  final_price_cents integer NOT NULL DEFAULT 0,
  first_name text,
  last_name text,
  personal_data jsonb,
  notes text,
  data_completed boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS booking_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES excursion_bookings(id) ON DELETE CASCADE,
  consent_type text NOT NULL,
  accepted boolean NOT NULL,
  policy_version text,
  accepted_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT booking_consents_booking_type_uq UNIQUE (booking_id, consent_type)
);

CREATE TABLE IF NOT EXISTS payment_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES excursion_bookings(id) ON DELETE CASCADE,
  type text NOT NULL,
  amount_cents integer NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  method text,
  deadline timestamp,
  paid_at timestamp,
  transaction_reference text,
  stripe_payment_intent_id text,
  notes text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

-- ---------- Colonne nuove: excursions ----------

ALTER TABLE excursions ADD COLUMN IF NOT EXISTS patient_price numeric(10,2);
ALTER TABLE excursions ADD COLUMN IF NOT EXISTS companion_price numeric(10,2);
ALTER TABLE excursions ADD COLUMN IF NOT EXISTS return_date date;
ALTER TABLE excursions ADD COLUMN IF NOT EXISTS booking_close_date date;
ALTER TABLE excursions ADD COLUMN IF NOT EXISTS deposit_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE excursions ADD COLUMN IF NOT EXISTS deposit_type text NOT NULL DEFAULT 'percent';
ALTER TABLE excursions ADD COLUMN IF NOT EXISTS deposit_value numeric(10,2);
ALTER TABLE excursions ADD COLUMN IF NOT EXISTS deposit_available_after_confirm boolean NOT NULL DEFAULT false;
ALTER TABLE excursions ADD COLUMN IF NOT EXISTS deposit_deadline_date date;
ALTER TABLE excursions ADD COLUMN IF NOT EXISTS balance_deadline_date date;
ALTER TABLE excursions ADD COLUMN IF NOT EXISTS balance_hours_override integer;
ALTER TABLE excursions ADD COLUMN IF NOT EXISTS pay_card_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE excursions ADD COLUMN IF NOT EXISTS pay_bank_transfer_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE excursions ADD COLUMN IF NOT EXISTS pay_office_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE excursions ADD COLUMN IF NOT EXISTS bank_transfer_hours_override integer;
ALTER TABLE excursions ADD COLUMN IF NOT EXISTS office_hours_override integer;
ALTER TABLE excursions ADD COLUMN IF NOT EXISTS full_payment_only_days_before integer;
ALTER TABLE excursions ADD COLUMN IF NOT EXISTS confirmed_at timestamp;
ALTER TABLE excursions ADD COLUMN IF NOT EXISTS waitlist_enabled boolean NOT NULL DEFAULT false;

-- ---------- Colonne nuove: excursion_bookings ----------

ALTER TABLE excursion_bookings ADD COLUMN IF NOT EXISTS booking_code text;
ALTER TABLE excursion_bookings ADD COLUMN IF NOT EXISTS payment_type text;
ALTER TABLE excursion_bookings ADD COLUMN IF NOT EXISTS payment_method text;
ALTER TABLE excursion_bookings ADD COLUMN IF NOT EXISTS total_amount_cents integer;
ALTER TABLE excursion_bookings ADD COLUMN IF NOT EXISTS amount_paid_cents integer NOT NULL DEFAULT 0;
ALTER TABLE excursion_bookings ADD COLUMN IF NOT EXISTS payment_deadline timestamp;

-- ---------- Colonne nuove: excursion_pickup_points ----------

ALTER TABLE excursion_pickup_points ADD COLUMN IF NOT EXISTS surcharge numeric(10,2);

-- ---------- Colonne nuove: pickup_locations ----------

ALTER TABLE pickup_locations ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
ALTER TABLE pickup_locations ADD COLUMN IF NOT EXISTS maps_url text;
ALTER TABLE pickup_locations ADD COLUMN IF NOT EXISTS notes text;

-- ---------- Seed fasce età iniziali (solo se la tabella è vuota) ----------

INSERT INTO age_ranges (label, min_age, max_age, active, sort_order)
SELECT v.label, v.min_age, v.max_age, true, v.sort_order
FROM (VALUES
  ('0-3 anni', 0, 3, 1),
  ('4-11 anni', 4, 11, 2),
  ('12-17 anni', 12, 17, 3)
) AS v(label, min_age, max_age, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM age_ranges);

COMMIT;
