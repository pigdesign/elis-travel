import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";

export function TermsConditionsPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <main className="flex-1 py-16">
        <div className="max-w-4xl mx-auto px-4 md:px-8">
          <h1 className="text-4xl font-serif font-bold text-foreground mb-8">Termini e Condizioni</h1>
          <div className="prose prose-slate max-w-none text-muted-foreground space-y-6">
            <p>
              <strong>Ultimo aggiornamento:</strong> {new Date().toLocaleDateString('it-IT')}
            </p>
            <p>
              Le presenti Condizioni Generali regolano l'utilizzo del sito web e dei servizi offerti da <strong>Elis Travel</strong>.
            </p>
            
            <h2 className="text-2xl font-bold text-foreground mt-8 mb-4">1. Oggetto del Servizio</h2>
            <p>
              Il sito permette agli utenti di consultare il catalogo di gite organizzate e pacchetti viaggio, richiedere informazioni e inviare richieste di prenotazione.
            </p>

            <h2 className="text-2xl font-bold text-foreground mt-8 mb-4">2. Prenotazione Gite di Gruppo</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Soglia Minima:</strong> Le gite di gruppo sono soggette al raggiungimento di un numero minimo di partecipanti. Se tale numero non viene raggiunto, la gita potrà essere annullata o riprogrammata.</li>
              <li><strong>Pagamenti:</strong> A seguito della richiesta, l'utente riceverà istruzioni per il pagamento di un acconto o del saldo. La prenotazione si considera confermata solo al ricevimento del pagamento.</li>
              <li><strong>Assegnazione Mezzo:</strong> Il mezzo di trasporto (es. van o pullman) potrà variare in base al numero definitivo di partecipanti.</li>
            </ul>

            <h2 className="text-2xl font-bold text-foreground mt-8 mb-4">3. Politiche di Cancellazione</h2>
            <p>
              In caso di annullamento da parte dell'utente, le penali applicate variano in base al preavviso fornito. Tali dettagli saranno specificati nel documento di conferma inviato in fase di prenotazione.
              In caso di annullamento della gita da parte dell'Agenzia (es. mancato raggiungimento della soglia minima o cause di forza maggiore), verrà garantito il rimborso integrale delle somme versate.
            </p>

            <h2 className="text-2xl font-bold text-foreground mt-8 mb-4">4. Pacchetti e Offerte (Tour Operator Terzi)</h2>
            <p>
              Per i pacchetti vacanza forniti da Tour Operator esterni, si applicano integralmente le Condizioni Generali di Contratto del singolo fornitore. Elis Travel agisce in veste di intermediario.
            </p>

            <h2 className="text-2xl font-bold text-foreground mt-8 mb-4">5. Responsabilità</h2>
            <p>
              L'Agenzia non è responsabile per danni, ritardi o disservizi imputabili a cause di forza maggiore o a responsabilità esclusive di terzi fornitori (vettori, strutture ricettive).
            </p>

            <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl mt-12 text-sm text-amber-800">
              <strong>Nota:</strong> Questo è un testo di esempio. Si prega di far redigere e validare il documento finale da un consulente legale.
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
