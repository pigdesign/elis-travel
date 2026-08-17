-- Aggiunge il sottotitolo a gite e offerte (crociere/vacanze).
-- Riga di richiamo sotto il titolo, visibile sia in locandina che sul sito.
-- Nullable, additiva e idempotente: sicura da eseguire in produzione.
-- PROD: eseguire via Railway CLI (NON drizzle-kit push).
ALTER TABLE excursions
  ADD COLUMN IF NOT EXISTS subtitle text;
ALTER TABLE offers
  ADD COLUMN IF NOT EXISTS subtitle text;
