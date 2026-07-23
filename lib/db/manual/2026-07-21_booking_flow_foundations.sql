-- Fondazioni additive per il nuovo flusso prenotazioni gite:
-- orario di partenza, ciclo di vita dei posti, idempotenza, portale cliente,
-- richieste di pagamento con tolleranza e outbox email persistente.
--
-- Migrazione IDEMPOTENTE: sicura da rieseguire e senza modifiche distruttive.
-- Da applicare in produzione via Railway CLI (mai drizzle-kit push in prod).

BEGIN;

-- Serializza due release concorrenti sullo stesso database.
SELECT pg_advisory_xact_lock(
  hashtextextended('elis-travel:booking-flow-foundations:2026-07-21', 0)
);

-- ---------- Orario effettivo della gita ----------

ALTER TABLE excursions
  ADD COLUMN IF NOT EXISTS departure_at timestamptz;

-- ---------- Versione flusso e ciclo di vita della prenotazione ----------

-- Snapshot operativo del ritiro a domicilio. Il campo resta nullable per le
-- prenotazioni che non richiedono il servizio casa e per lo storico.
ALTER TABLE excursion_bookings
  ADD COLUMN IF NOT EXISTS home_pickup_address text;

-- Il default 2 classifica in modo compatibile le righe legacy. Il nuovo flusso
-- deve impostare esplicitamente la propria versione durante l'INSERT.
ALTER TABLE excursion_bookings
  ADD COLUMN IF NOT EXISTS workflow_version integer NOT NULL DEFAULT 2;
ALTER TABLE excursion_bookings
  ADD COLUMN IF NOT EXISTS booking_attempt_id text;
-- Backfill one-shot: le righe pubbliche storiche mantengono le email abilitate,
-- quelle create dal modulo admin namespaced diventano opt-in. La verifica della
-- presenza della colonna è essenziale: su una riesecuzione non dobbiamo
-- sovrascrivere una scelta `true` salvata dopo la prima migrazione.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_attribute
    WHERE attrelid = 'excursion_bookings'::regclass
      AND attname = 'customer_notifications_enabled'
      AND NOT attisdropped
  ) THEN
    ALTER TABLE excursion_bookings
      ADD COLUMN customer_notifications_enabled boolean NOT NULL DEFAULT true;
    UPDATE excursion_bookings
    SET customer_notifications_enabled = false
    WHERE booking_attempt_id LIKE 'admin:%';
  END IF;
END $$;
ALTER TABLE excursion_bookings
  ALTER COLUMN customer_notifications_enabled SET DEFAULT false;
ALTER TABLE excursion_bookings
  ADD COLUMN IF NOT EXISTS seat_status text NOT NULL DEFAULT 'held';
ALTER TABLE excursion_bookings
  ADD COLUMN IF NOT EXISTS seat_hold_expires_at timestamptz;
ALTER TABLE excursion_bookings
  ADD COLUMN IF NOT EXISTS seat_released_at timestamptz;
ALTER TABLE excursion_bookings
  ADD COLUMN IF NOT EXISTS seat_release_reason text;
ALTER TABLE excursion_bookings
  ADD COLUMN IF NOT EXISTS cancellation_requested_at timestamptz;
ALTER TABLE excursion_bookings
  ADD COLUMN IF NOT EXISTS cancellation_request_status text;
ALTER TABLE excursion_bookings
  ADD COLUMN IF NOT EXISTS cancellation_request_reason text;
ALTER TABLE excursion_bookings
  ADD COLUMN IF NOT EXISTS cancellation_decision_at timestamptz;
ALTER TABLE excursion_bookings
  ADD COLUMN IF NOT EXISTS cancellation_completed_at timestamptz;
ALTER TABLE excursion_bookings
  ADD COLUMN IF NOT EXISTS cancellation_resolution_note text;
ALTER TABLE excursion_bookings
  ADD COLUMN IF NOT EXISTS cancellation_refund_amount_cents integer;
ALTER TABLE excursion_bookings
  ADD COLUMN IF NOT EXISTS cancellation_penalty_amount_cents integer;
ALTER TABLE excursion_bookings
  ADD COLUMN IF NOT EXISTS access_token_hash text;
ALTER TABLE excursion_bookings
  ADD COLUMN IF NOT EXISTS access_token_expires_at timestamptz;

-- Le cancellazioni legacy hanno gia liberato il contatore posti nel vecchio
-- flusso. Allinearle a "released" evita che il nuovo stato le consideri ancora
-- riservate. La condizione rende il backfill idempotente.
UPDATE excursion_bookings
SET seat_status = 'released',
    seat_released_at = COALESCE(seat_released_at, now()),
    seat_release_reason = COALESCE(seat_release_reason, 'legacy_cancelled')
WHERE cancelled_at IS NOT NULL
  AND seat_status = 'held';

-- Fallire con un messaggio operativo prima di creare l'indice e piu sicuro
-- del generico errore PostgreSQL. Non scegliamo automaticamente quale codice
-- conservare: eventuali duplicati legacy devono essere risolti e tracciati
-- dall'amministrazione prima del rilascio.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM excursion_bookings
    WHERE booking_code IS NOT NULL
    GROUP BY booking_code
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'Preflight fallito: esistono booking_code duplicati. Correggerli prima di applicare la migrazione.';
  END IF;
END $$;

-- In PostgreSQL un indice UNIQUE ammette piu NULL: le prenotazioni storiche non
-- richiedono alcun backfill o deduplicazione.
CREATE UNIQUE INDEX IF NOT EXISTS excursion_bookings_booking_code_uq
  ON excursion_bookings (booking_code);

CREATE UNIQUE INDEX IF NOT EXISTS excursion_bookings_booking_attempt_id_uq
  ON excursion_bookings (booking_attempt_id);

CREATE UNIQUE INDEX IF NOT EXISTS excursion_bookings_access_token_hash_uq
  ON excursion_bookings (access_token_hash);

-- ---------- Richieste di pagamento ----------

ALTER TABLE payment_requests
  ADD COLUMN IF NOT EXISTS grace_until timestamptz;
ALTER TABLE payment_requests
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id text;

-- Non viene introdotta intenzionalmente alcuna unicita su (booking_id, type):
-- lo storico puo contenere piu tentativi/richieste dello stesso tipo.

CREATE TABLE IF NOT EXISTS payment_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_request_id uuid NOT NULL REFERENCES payment_requests(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'stripe',
  status text NOT NULL DEFAULT 'pending',
  amount_cents integer NOT NULL,
  idempotency_key text NOT NULL,
  stripe_payment_intent_id text,
  last_error_code text,
  last_error_message text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS payment_attempts_idempotency_key_uq
  ON payment_attempts (idempotency_key);

-- PostgreSQL ammette piu NULL nell'indice: i tentativi non ancora associati a
-- un PaymentIntent possono convivere senza valori sentinella.
CREATE UNIQUE INDEX IF NOT EXISTS payment_attempts_stripe_payment_intent_id_uq
  ON payment_attempts (stripe_payment_intent_id);

CREATE INDEX IF NOT EXISTS payment_attempts_payment_request_idx
  ON payment_attempts (payment_request_id);

-- ---------- Casi amministrativi di annullamento ----------

-- Lo storico dei casi e immutabile rispetto alla proiezione presente sulla
-- prenotazione. In questo modo due richieste successive non condividono email,
-- decisioni o allocation di rimborso.
CREATE TABLE IF NOT EXISTS booking_cancellation_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES excursion_bookings(id) ON DELETE RESTRICT,
  excursion_id uuid REFERENCES excursions(id) ON DELETE SET NULL,
  source text NOT NULL,
  source_key text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  request_reason text,
  decision_reason text,
  opened_by_admin_user_id text,
  opened_by_admin_name text,
  decided_by_admin_user_id text,
  decided_by_admin_name text,
  refundable_at_decision_cents integer,
  approved_refund_cents integer,
  requested_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE booking_cancellation_cases
  ADD COLUMN IF NOT EXISTS opened_by_admin_user_id text;
ALTER TABLE booking_cancellation_cases
  ADD COLUMN IF NOT EXISTS opened_by_admin_name text;
ALTER TABLE booking_cancellation_cases
  ADD COLUMN IF NOT EXISTS decided_by_admin_user_id text;
ALTER TABLE booking_cancellation_cases
  ADD COLUMN IF NOT EXISTS decided_by_admin_name text;

CREATE UNIQUE INDEX IF NOT EXISTS booking_cancellation_cases_source_key_uq
  ON booking_cancellation_cases (source_key);

CREATE INDEX IF NOT EXISTS booking_cancellation_cases_booking_idx
  ON booking_cancellation_cases (booking_id, created_at);

CREATE INDEX IF NOT EXISTS booking_cancellation_cases_status_idx
  ON booking_cancellation_cases (status, updated_at);

CREATE INDEX IF NOT EXISTS booking_cancellation_cases_excursion_idx
  ON booking_cancellation_cases (excursion_id);

-- Preserva le richieste gia pendenti create dal vecchio flusso. Senza questo
-- backfill la proiezione sulla booking non avrebbe un caso risolvibile dalla UI.
INSERT INTO booking_cancellation_cases (
  booking_id,
  excursion_id,
  source,
  source_key,
  status,
  request_reason,
  requested_at,
  created_at,
  updated_at
)
SELECT
  booking.id,
  booking.excursion_id,
  'customer',
  'legacy-cancellation:' || booking.id::text || ':' ||
    COALESCE(EXTRACT(EPOCH FROM booking.cancellation_requested_at)::bigint::text, 'unknown'),
  'pending',
  booking.cancellation_request_reason,
  COALESCE(booking.cancellation_requested_at, now()),
  COALESCE(booking.cancellation_requested_at, now()),
  now()
FROM excursion_bookings booking
WHERE booking.cancellation_request_status = 'pending'
  AND NOT EXISTS (
    SELECT 1
    FROM booking_cancellation_cases cancellation_case
    WHERE cancellation_case.booking_id = booking.id
      AND cancellation_case.status = 'pending'
  )
ON CONFLICT (source_key) DO NOTHING;

-- ---------- Rimborsi reali ----------

CREATE TABLE IF NOT EXISTS payment_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES excursion_bookings(id) ON DELETE RESTRICT,
  payment_request_id uuid REFERENCES payment_requests(id) ON DELETE SET NULL,
  payment_attempt_id uuid REFERENCES payment_attempts(id) ON DELETE SET NULL,
  cancellation_case_id uuid,
  amount_cents integer NOT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  provider text NOT NULL DEFAULT 'stripe',
  stripe_payment_intent_id text,
  stripe_refund_id text,
  provider_reference text,
  idempotency_key text NOT NULL,
  last_error_code text,
  last_error_message text,
  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 8,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_attempt_at timestamptz,
  lease_owner text,
  lease_expires_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Compatibilita con una precedente esecuzione parziale della migrazione.
ALTER TABLE payment_refunds
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0;
ALTER TABLE payment_refunds
  ADD COLUMN IF NOT EXISTS max_attempts integer NOT NULL DEFAULT 8;
ALTER TABLE payment_refunds
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE payment_refunds
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz;
ALTER TABLE payment_refunds
  ADD COLUMN IF NOT EXISTS lease_owner text;
ALTER TABLE payment_refunds
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz;
ALTER TABLE payment_refunds
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text;
ALTER TABLE payment_refunds
  ADD COLUMN IF NOT EXISTS cancellation_case_id uuid;
ALTER TABLE payment_refunds
  ADD COLUMN IF NOT EXISTS provider_reference text;

-- ADD COLUMN IF NOT EXISTS non aggiunge un vincolo a una colonna eventualmente
-- creata da un'esecuzione parziale: il blocco garantisce anche quel caso.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'payment_refunds_cancellation_case_id_fkey'
      AND conrelid = 'payment_refunds'::regclass
  ) THEN
    ALTER TABLE payment_refunds
      ADD CONSTRAINT payment_refunds_cancellation_case_id_fkey
      FOREIGN KEY (cancellation_case_id)
      REFERENCES booking_cancellation_cases(id)
      ON DELETE RESTRICT;
  END IF;
END $$;

-- Backfill compatibile con i record creati dalla prima versione, nella quale
-- il PaymentIntent era incorporato nella sola business key late-payment.
UPDATE payment_refunds
SET stripe_payment_intent_id = substring(
  idempotency_key FROM length('late-payment-refund-') + 1
)
WHERE stripe_payment_intent_id IS NULL
  AND left(
    idempotency_key,
    length('late-payment-refund-pi_')
  ) = 'late-payment-refund-pi_';

CREATE UNIQUE INDEX IF NOT EXISTS payment_refunds_stripe_refund_id_uq
  ON payment_refunds (stripe_refund_id);

CREATE UNIQUE INDEX IF NOT EXISTS payment_refunds_idempotency_key_uq
  ON payment_refunds (idempotency_key);

CREATE INDEX IF NOT EXISTS payment_refunds_booking_idx
  ON payment_refunds (booking_id);

CREATE INDEX IF NOT EXISTS payment_refunds_payment_request_idx
  ON payment_refunds (payment_request_id);

CREATE INDEX IF NOT EXISTS payment_refunds_payment_attempt_idx
  ON payment_refunds (payment_attempt_id);

CREATE INDEX IF NOT EXISTS payment_refunds_cancellation_case_idx
  ON payment_refunds (cancellation_case_id);

CREATE INDEX IF NOT EXISTS payment_refunds_stripe_payment_intent_idx
  ON payment_refunds (stripe_payment_intent_id);

CREATE INDEX IF NOT EXISTS payment_refunds_status_idx
  ON payment_refunds (status, created_at);

CREATE INDEX IF NOT EXISTS payment_refunds_dispatch_idx
  ON payment_refunds (status, next_attempt_at, lease_expires_at);

-- Un timeout di rete non deve aprire un secondo rimborso: il worker riprende
-- lo stesso tentativo provider e la stessa idempotency key. Un nuovo tentativo
-- nasce soltanto dopo un esito Stripe definitivamente failed/canceled.
CREATE TABLE IF NOT EXISTS payment_refund_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_refund_id uuid NOT NULL REFERENCES payment_refunds(id) ON DELETE RESTRICT,
  attempt_number integer NOT NULL,
  idempotency_key text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  stripe_refund_id text,
  last_error_code text,
  last_error_message text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS payment_refund_attempts_refund_number_uq
  ON payment_refund_attempts (payment_refund_id, attempt_number);

CREATE UNIQUE INDEX IF NOT EXISTS payment_refund_attempts_idempotency_key_uq
  ON payment_refund_attempts (idempotency_key);

CREATE UNIQUE INDEX IF NOT EXISTS payment_refund_attempts_stripe_refund_id_uq
  ON payment_refund_attempts (stripe_refund_id);

CREATE INDEX IF NOT EXISTS payment_refund_attempts_refund_idx
  ON payment_refund_attempts (payment_refund_id);

-- ---------- Cleanup Stripe persistente ----------

CREATE TABLE IF NOT EXISTS stripe_cleanup_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid REFERENCES excursion_bookings(id) ON DELETE SET NULL,
  operation text NOT NULL,
  stripe_resource_id text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 8,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_attempt_at timestamptz,
  lease_owner text,
  lease_expires_at timestamptz,
  last_error_code text,
  last_error_message text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS stripe_cleanup_jobs_operation_resource_uq
  ON stripe_cleanup_jobs (operation, stripe_resource_id);

CREATE INDEX IF NOT EXISTS stripe_cleanup_jobs_dispatch_idx
  ON stripe_cleanup_jobs (status, next_attempt_at, lease_expires_at);

CREATE INDEX IF NOT EXISTS stripe_cleanup_jobs_booking_idx
  ON stripe_cleanup_jobs (booking_id);

-- Compatibilita con una precedente esecuzione parziale della migrazione.
ALTER TABLE stripe_cleanup_jobs
  ADD COLUMN IF NOT EXISTS manual_completion_reference text;

-- ---------- Outbox email persistente ----------

CREATE TABLE IF NOT EXISTS email_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid REFERENCES excursion_bookings(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  dedupe_key text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 8,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_attempt_at timestamptz,
  lease_owner text,
  lease_expires_at timestamptz,
  sent_at timestamptz,
  last_error text,
  provider_message_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS email_outbox_dedupe_key_uq
  ON email_outbox (dedupe_key);

CREATE INDEX IF NOT EXISTS email_outbox_dispatch_idx
  ON email_outbox (status, next_attempt_at);

CREATE INDEX IF NOT EXISTS email_outbox_booking_idx
  ON email_outbox (booking_id);

COMMIT;
