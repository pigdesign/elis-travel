-- Aggiunge le colonne "Altri costi" (costi fissi a carico dell'agenzia, NON per persona)
-- alla tabella excursions:
--   * other_costs        -> voci nominate { name, price } (come gli extra)
--   * other_costs_total  -> somma sincronizzata delle voci, usata dal margine/conto economico
-- Additiva e idempotente: sicura da eseguire in produzione.
-- PROD: eseguire via Railway CLI (NON drizzle-kit push).
ALTER TABLE excursions
  ADD COLUMN IF NOT EXISTS other_costs jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE excursions
  ADD COLUMN IF NOT EXISTS other_costs_total numeric(10, 2) DEFAULT '0';
