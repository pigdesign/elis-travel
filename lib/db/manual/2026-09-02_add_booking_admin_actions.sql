-- Diario delle correzioni manuali dell'amministrazione su una prenotazione.
-- Serve a rendere tracciabili le nuove operazioni di backoffice (cambio
-- metodo, correzione importo, registrazione incasso, storno): il registro
-- payment_requests dice quanto e stato incassato, questa tabella dice chi ha
-- deciso e perche.
-- Nuova tabella, nessuna colonna esistente toccata: additiva e idempotente,
-- sicura da eseguire in produzione.
-- PROD: eseguire via Railway CLI (NON drizzle-kit push).
CREATE TABLE IF NOT EXISTS booking_admin_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES excursion_bookings(id) ON DELETE CASCADE,
  payment_request_id uuid REFERENCES payment_requests(id) ON DELETE SET NULL,
  action text NOT NULL,
  reason text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  admin_user_id text,
  admin_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS booking_admin_actions_booking_idx
  ON booking_admin_actions (booking_id);
