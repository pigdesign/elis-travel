-- Aggiunge la colonna `extras` (voci di costo extra nominate) alla tabella excursions.
-- Additiva e idempotente: sicura da eseguire in produzione.
-- PROD: eseguire via Railway CLI (NON drizzle-kit push).
ALTER TABLE excursions
  ADD COLUMN IF NOT EXISTS extras jsonb NOT NULL DEFAULT '[]'::jsonb;
