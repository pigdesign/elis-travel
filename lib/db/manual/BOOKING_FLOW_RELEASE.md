# Rilascio del flusso prenotazioni gite

La migrazione `2026-07-21_booking_flow_foundations.sql` è additiva e
idempotente, ma deve precedere il nuovo backend. Non viene eseguita
automaticamente all'avvio: un errore di configurazione non deve modificare il
database di produzione.

## Sequenza obbligatoria

1. Creare un backup/snapshot del database e tenere disabilitati i pagamenti
   carta (`excursion_card_payments_enabled=false` e
   `future_card_charge_enabled=false`).
2. Ruotare le credenziali database che in passato erano presenti in script o
   file versionati e verificare che nessun helper locale con URL inline venga
   incluso nel commit o nell'immagine di deploy.
3. Verificare che sia già stata applicata `2026-07-17_gite_v2.sql`.
4. Eseguire il preflight sul database target:

   ```sh
   pnpm --filter @workspace/api-server run migrate:booking-flow -- --check
   ```

   Al primo rilascio il comando termina intenzionalmente con codice `2` se
   mancano soltanto le fondazioni booking-flow: in quel caso `--apply` resta
   consentito. Non procedere invece se il report segnala prerequisiti Gite v2
   mancanti o incoerenze nei dati.

5. Risolvere prima del rilascio eventuali codici/tentativi duplicati, importi
   incoerenti o booking v3 con un numero errato di partecipanti.
6. Applicare esplicitamente la migrazione:

   ```sh
   BOOKING_FLOW_MIGRATION_CONFIRM=APPLY_BOOKING_FLOW_FOUNDATIONS \
     pnpm --filter @workspace/api-server run migrate:booking-flow -- --apply
   ```

7. Compilare `departureAt` per ogni gita `open` o `confirmed`. Il backfill
   iniziale `null -> data/ora futura` è consentito anche in presenza di
   prenotazioni; gli spostamenti successivi richiedono invece un futuro flusso
   di riprogrammazione dedicato.
8. Configurare e verificare almeno `PUBLIC_SITE_URL`,
   `BOOKING_ACCESS_TOKEN_SECRET`, provider email, Stripe e webhook. In
   produzione `PUBLIC_SITE_URL` deve essere un'origine HTTPS pubblica. Eseguire
   build e migrazione con la versione Node dichiarata dal repository
   (`20.19.0`).
9. Distribuire backend e frontend insieme, quindi ripetere `--check` e provare
   su staging: prenotazione gratuita, bonifico, ufficio, carta totale,
   SetupIntent acconto, conferma gita, saldo, annullamento e rimborso.
10. Abilitare prima il flag carta generale. Abilitare l'addebito futuro solo
    dopo aver configurato anche la versione del consenso e completato il test
    reale controllato.

## Automazioni operative

I reminder automatici del saldo sono disattivati per impostazione predefinita.
`BOOKING_AUTOMATIC_REMINDERS_ENABLED=true` va impostato soltanto dopo
l'approvazione del processo e dei testi da parte dell'amministrazione. Recovery
finanziario, cleanup Stripe, riconciliazione outbox e invio delle comunicazioni
già dovute restano invece attivi perché sono meccanismi tecnici di affidabilità.

La tolleranza di pagamento è configurabile dall'area amministrativa e viene
mostrata nelle richieste di pagamento. Una proroga modifica la richiesta
esistente e genera una comunicazione dedicata; non cambia la data di partenza
della gita.

## Arresto sicuro

In caso di anomalia disabilitare entrambi i flag carta e non eliminare colonne
o tabelle: la migrazione è additiva. Gli incassi, i rimborsi e i cleanup in
stato `manual_required` devono essere riconciliati dall'amministrazione prima
di un nuovo tentativo di rilascio.
