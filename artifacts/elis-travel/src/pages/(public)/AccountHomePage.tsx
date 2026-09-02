import { useCustomerAuth } from "@/contexts/CustomerAuthContext";
import { useLocation } from "wouter";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";

/**
 * Panoramica dell'area clienti — versione minima della Fase 1.
 *
 * Serve a chiudere il flusso di accesso con una destinazione reale. I viaggi,
 * i pagamenti e il profilo arrivano nelle fasi successive: qui non inventiamo
 * dati che il backend non espone ancora.
 */
export function AccountHomePage() {
  const { state, logout } = useCustomerAuth();
  const [, navigate] = useLocation();

  if (state.status !== "authenticated") return null;
  const { account } = state;

  const nome = account.firstName?.trim() || null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/5">
      <Header solid />
      <div className="mx-auto max-w-3xl px-4 pb-16 pt-28">
        <header className="flex items-start justify-between gap-4 mb-10">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">
              {nome ? `Ciao ${nome}` : "La tua area personale"}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {account.email}
            </p>
          </div>
          {/* Uscita ben visibile: la sessione dura 90 giorni e questi computer
              sono spesso condivisi in famiglia. */}
          <button
            type="button"
            onClick={() => {
              void logout().then(() => navigate("/"));
            }}
            className="shrink-0 rounded-xl border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/50 transition-colors"
          >
            Esci
          </button>
        </header>

        <nav className="grid gap-4 sm:grid-cols-2">
          <a
            href="/area-clienti/viaggi"
            className="rounded-2xl border border-border/60 bg-white p-6 shadow-sm transition-colors hover:border-primary/40"
          >
            <h2 className="font-semibold text-foreground">I miei viaggi</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Prenotazioni in arrivo, passate e annullate, con le scadenze di
              pagamento.
            </p>
          </a>
          <a
            href="/area-clienti/accesso"
            className="rounded-2xl border border-border/60 bg-white p-6 shadow-sm transition-colors hover:border-primary/40"
          >
            <h2 className="font-semibold text-foreground">Come accedi</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {account.hasPassword
                ? "Entri con la password oppure con il link via email."
                : "Entri con il link via email. Se preferisci puoi aggiungere una password."}
            </p>
          </a>
          <div className="rounded-2xl border border-dashed border-border/60 bg-white/60 p-6">
            <h2 className="font-semibold text-muted-foreground">
              Pagamenti e documenti
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              In arrivo. Per ora trovi gli importi dentro ogni prenotazione.
            </p>
          </div>
        </nav>

        <p className="mt-8 text-center text-xs text-muted-foreground">
          Per assistenza scrivi a info@elis-travel.it
        </p>
      </div>
      <Footer />
    </div>
  );
}
