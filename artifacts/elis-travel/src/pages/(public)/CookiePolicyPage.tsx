import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";

export function CookiePolicyPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <main className="flex-1 py-16">
        <div className="max-w-4xl mx-auto px-4 md:px-8">
          <h1 className="text-4xl font-serif font-bold text-foreground mb-8">Cookie Policy</h1>
          <div className="prose prose-slate max-w-none text-muted-foreground space-y-6">
            <p>
              <strong>Ultimo aggiornamento:</strong> {new Date().toLocaleDateString('it-IT')}
            </p>
            <p>
              Questo sito web utilizza i cookie per garantire il corretto funzionamento delle procedure e migliorare l'esperienza di uso delle applicazioni online.
            </p>
            
            <h2 className="text-2xl font-bold text-foreground mt-8 mb-4">1. Cosa sono i Cookie?</h2>
            <p>
              I cookie sono brevi frammenti di testo (lettere e/o numeri) che permettono al server web di memorizzare sul client (il browser) informazioni da riutilizzare 
              nel corso della medesima visita al sito (cookie di sessione) o in seguito, anche a distanza di giorni (cookie persistenti).
            </p>

            <h2 className="text-2xl font-bold text-foreground mt-8 mb-4">2. Tipologie di Cookie Utilizzati</h2>
            
            <h3 className="text-xl font-semibold text-foreground mt-6 mb-2">Cookie Tecnici (Strettamente necessari)</h3>
            <p>
              Utilizziamo cookie tecnici indispensabili per il corretto funzionamento del sito. Ad esempio, utilizziamo cookie di sessione per mantenere l'accesso 
              all'area riservata da parte degli amministratori. Questi cookie non richiedono il preventivo consenso dell'utente.
            </p>

            <h3 className="text-xl font-semibold text-foreground mt-6 mb-2">Cookie Analitici e di Terze Parti</h3>
            <p>
              Al momento, il sito potrebbe integrare servizi di terze parti (come mappe, video o widget social) che potrebbero a loro volta installare cookie. 
              In futuro potremmo integrare strumenti di analisi (es. Google Analytics). L'installazione di questi cookie è soggetta al consenso dell'utente tramite 
              l'apposito banner.
            </p>

            <h2 className="text-2xl font-bold text-foreground mt-8 mb-4">3. Gestione delle Preferenze sui Cookie</h2>
            <p>
              L'utente può decidere se accettare o meno i cookie utilizzando le impostazioni del proprio browser. La disabilitazione totale o parziale dei cookie tecnici 
              può compromettere l'utilizzo delle funzionalità del sito.
            </p>
            <p>
              Per gestire le preferenze specifiche espresse tramite il nostro banner, puoi cliccare sul pulsante "Gestisci Preferenze" in basso a sinistra (quando disponibile).
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
