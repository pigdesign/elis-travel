import { useCustomerAuth } from "@/contexts/CustomerAuthContext";
import { useLocation } from "wouter";

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
      <div className="mx-auto max-w-3xl px-4 py-12">
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

        <section className="rounded-2xl border border-border/60 bg-white p-6 shadow-sm">
          <h2 className="font-semibold text-foreground mb-2">
            Il tuo account è attivo
          </h2>
          <p className="text-sm text-muted-foreground">
            Da qui potrai consultare i tuoi viaggi, i pagamenti e le scadenze.
            Stiamo completando queste sezioni: nel frattempo continui a gestire
            ogni prenotazione dal link che ti abbiamo inviato via email.
          </p>
        </section>

        <p className="mt-8 text-center text-xs text-muted-foreground">
          Per assistenza scrivi a info@elis-travel.it
        </p>
      </div>
    </div>
  );
}
