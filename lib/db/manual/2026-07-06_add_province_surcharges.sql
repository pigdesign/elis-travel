-- Province dei punti di raccolta + supplementi di prezzo per provincia sulle gite.
-- `pickup_locations.province`: sigla provincia (es. 'IM'); null per i punti storici
--   finché l'admin non la imposta in Impostazioni (nessun supplemento applicabile).
-- `excursions.province_surcharges`: mappa { "IM": 10 } = euro a persona per chi
--   sceglie un punto di raccolta di quella provincia, specifica di ogni gita.
-- Additiva e idempotente: sicura da eseguire in produzione.
-- PROD: eseguire via Railway CLI (NON drizzle-kit push).
ALTER TABLE pickup_locations
  ADD COLUMN IF NOT EXISTS province text;
ALTER TABLE excursions
  ADD COLUMN IF NOT EXISTS province_surcharges jsonb NOT NULL DEFAULT '{}'::jsonb;
