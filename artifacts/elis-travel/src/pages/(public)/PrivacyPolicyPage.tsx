import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";

export function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <main className="flex-1 py-16">
        <div className="max-w-4xl mx-auto px-4 md:px-8">
          <h1 className="text-4xl font-serif font-bold text-foreground mb-8">Informativa sulla Privacy</h1>
          <div className="prose prose-slate max-w-none text-muted-foreground space-y-6">
            <p>
              <strong>Ultimo aggiornamento:</strong> {new Date().toLocaleDateString('it-IT')}
            </p>
            <p>
              In questa pagina descriviamo le modalità di gestione del sito in riferimento al trattamento dei dati personali degli utenti che lo consultano.
              L'informativa è resa ai sensi del Regolamento (UE) 2016/679 (GDPR).
            </p>
            
            <h2 className="text-2xl font-bold text-foreground mt-8 mb-4">1. Titolare del Trattamento</h2>
            <p>
              Il Titolare del trattamento è <strong>Elis Travel</strong>.<br />
              [Inserire Dati Aziendali completi: Indirizzo, P.IVA, Email di contatto]
            </p>

            <h2 className="text-2xl font-bold text-foreground mt-8 mb-4">2. Dati Trattati e Finalità</h2>
            <p>Raccogliamo e trattiamo i seguenti dati personali:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Dati di contatto:</strong> Nome, cognome, email, numero di telefono (per rispondere alle richieste e gestire le prenotazioni).</li>
              <li><strong>Dati di navigazione:</strong> Indirizzi IP, log di sistema (per garantire la sicurezza e il corretto funzionamento del sito).</li>
            </ul>

            <h2 className="text-2xl font-bold text-foreground mt-8 mb-4">3. Base Giuridica</h2>
            <p>Il trattamento dei dati si basa su:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Consenso esplicito dell'utente (richieste di contatto).</li>
              <li>Esecuzione di un contratto o misure precontrattuali (prenotazione gite e pacchetti).</li>
              <li>Legittimo interesse del titolare (sicurezza del sito).</li>
            </ul>

            <h2 className="text-2xl font-bold text-foreground mt-8 mb-4">4. Condivisione dei Dati</h2>
            <p>
              I dati potranno essere condivisi con fornitori di servizi terzi (es. sistemi di CRM, hosting) strettamente necessari all'erogazione del servizio, 
              i quali agiscono in qualità di Responsabili del Trattamento. I dati non verranno ceduti o venduti a terzi per finalità di marketing senza esplicito consenso.
            </p>

            <h2 className="text-2xl font-bold text-foreground mt-8 mb-4">5. Diritti dell'Utente</h2>
            <p>
              L'utente ha il diritto di accedere ai propri dati, chiederne la rettifica, la cancellazione, la limitazione del trattamento o opporsi ad esso. 
              Per esercitare questi diritti, contattare il Titolare all'indirizzo email fornito.
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
