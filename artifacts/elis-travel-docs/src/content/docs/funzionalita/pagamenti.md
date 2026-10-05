---
title: Pagamenti
description: Comprendere acconti, saldi, scadenze e stati di pagamento.
---

La gita stabilisce quali metodi sono disponibili: carta, bonifico, pagamento in ufficio e, quando abilitato, pagamento sul bus. Può prevedere pagamento totale oppure acconto e saldo.

## Regola prima della conferma

Per una gita **aperta ma non ancora confermata non viene incassato né richiesto alcun pagamento**, indipendentemente dall'importo e dal metodo scelti dal cliente.

| Scelta del cliente                    | Prima della conferma                                                               | Alla conferma della gita                                              |
| ------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Carta + acconto                       | La carta viene salvata in modo sicuro, senza addebito                              | Viene addebitato l'acconto autorizzato                                |
| Carta + importo completo              | La carta viene salvata in modo sicuro, senza addebito                              | Viene addebitata l'intera quota autorizzata                           |
| Bonifico + acconto o importo completo | La scelta viene registrata, ma IBAN, causale e scadenza non vengono ancora inviati | La richiesta diventa attiva e il cliente riceve istruzioni e scadenza |
| Ufficio + acconto o importo completo  | La scelta viene registrata, ma non viene ancora richiesto di pagare                | La richiesta diventa attiva e il cliente riceve istruzioni e scadenza |

Se la gita viene annullata senza essere stata confermata, la carta non viene addebitata e non parte alcuna richiesta di pagamento. Per una nuova prenotazione inserita quando la gita è **già confermata**, si applica invece il normale flusso di pagamento immediato previsto dalla configurazione.

:::note[Consenso per la carta]
Il cliente deve accettare esplicitamente il salvataggio della carta e il futuro addebito dell'importo scelto. La versione accettata deve corrispondere ai Termini e Condizioni pubblicati su Iubenda al momento dell'addebito. Se la versione cambia, l'addebito automatico viene fermato e serve una nuova accettazione.
:::

## Dopo la conferma

La conferma della gita avvia una sola volta le operazioni rimaste in attesa:

- addebita su carta l'acconto o l'importo completo autorizzato;
- attiva le richieste per bonifico o pagamento in ufficio e invia le relative istruzioni;
- crea la richiesta di saldo quando un acconto risulta effettivamente pagato;
- lascia in evidenza i casi che richiedono un intervento del cliente o della segreteria.

Il comando di conferma è idempotente: può essere rielaborato per recuperare un'operazione interrotta senza duplicare addebiti o richieste già concluse.

## Operazioni della segreteria

- verificare lo stato dalla prenotazione completa;
- prima della conferma, verificare che non risultino incassi e che le richieste bonifico/ufficio siano ancora programmate;
- registrare un bonifico, un pagamento in ufficio o un incasso sul bus realmente ricevuto;
- creare la richiesta di saldo;
- correggere metodo, importo o scadenza di una richiesta ancora aperta;
- prorogare la scadenza di una richiesta;
- stornare un incasso manuale inserito per errore, conservandone lo storico;
- gestire i casi scaduti secondo la policy aziendale;
- aprire e risolvere cancellazioni e rimborsi.

:::danger[Non confermare sulla fiducia]
**Segna come pagato** registra un evento finanziario. Usalo solo dopo avere verificato l’incasso sul conto o in cassa, l’importo e il codice prenotazione.
:::

Le operazioni sui pagamenti devono partire sempre dalla prenotazione corretta. Non usare il solo nome cliente come riferimento: confronta anche codice, gita e importo. Gli incassi effettuati con carta non devono essere stornati come incassi manuali, perché hanno movimentato denaro tramite il circuito di pagamento.
