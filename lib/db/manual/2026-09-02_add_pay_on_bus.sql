-- Abilita il saldo incassato a bordo per la singola gita.
-- Vale SOLO per le richieste di tipo "balance": acconto e pagamento in unica
-- soluzione restano su carta/bonifico/ufficio.
-- Default false: il metodo esiste solo dove l'agenzia lo attiva esplicitamente,
-- quindi le gite esistenti non cambiano comportamento.
-- Additiva e idempotente: sicura da eseguire in produzione.
-- PROD: eseguire via Railway CLI (NON drizzle-kit push).
ALTER TABLE excursions
  ADD COLUMN IF NOT EXISTS pay_on_bus_enabled boolean NOT NULL DEFAULT false;
