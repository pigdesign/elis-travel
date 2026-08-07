import { useEffect, useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";
import {
  readAccountTokenFromLocation,
  stripTokenFromUrl,
} from "@/lib/account-access-token";
import { Header } from "@/components/layout/Header";
import logoImg from "@assets/logo2.webp";

type Phase =
  | { kind: "form" }
  | { kind: "sending" }
  | { kind: "sent"; message: string }
  | { kind: "consuming" }
  | { kind: "error"; message: string };

/**
 * Pagina unica di accesso all'area clienti.
 *
 * Serve due situazioni: la richiesta del link e l'atterraggio dal link
 * ricevuto. Tenerle insieme evita una rotta in piu e fa si che chi clicca un
 * link scaduto si trovi gia davanti al modulo per richiederne uno nuovo.
 */
export function AccountLoginPage() {
  const { state, requestMagicLink, consumeToken } = useCustomerAuth();
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "form" });

  // Il token viene letto una sola volta al montaggio e subito rimosso dalla
  // barra degli indirizzi, prima ancora di sapere se e valido: non deve finire
  // in cronologia, preferiti o screenshot.
  const [initialToken] = useState(() => {
    if (typeof window === "undefined") return "";
    const token = readAccountTokenFromLocation({
      hash: window.location.hash,
      search: window.location.search,
    });
    if (token) stripTokenFromUrl();
    return token;
  });

  useEffect(() => {
    if (!initialToken) return;
    setPhase({ kind: "consuming" });
    void consumeToken(initialToken)
      .then(() => navigate("/area-clienti"))
      .catch((err: unknown) => {
        setPhase({
          kind: "error",
          message:
            err instanceof Error
              ? err.message
              : "Link non valido o scaduto.",
        });
      });
  }, [initialToken, consumeToken, navigate]);

  // Chi ha gia una sessione valida non deve vedere il modulo di accesso.
  useEffect(() => {
    if (!initialToken && state.status === "authenticated") {
      navigate("/area-clienti");
    }
  }, [initialToken, state.status, navigate]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setPhase({ kind: "sending" });
    try {
      const { message } = await requestMagicLink(email);
      setPhase({ kind: "sent", message });
    } catch (err) {
      setPhase({
        kind: "error",
        message:
          err instanceof Error
            ? err.message
            : "Non siamo riusciti a inviare il link. Riprova.",
      });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-accent/5">
      <Header solid />
      <div className="mx-auto flex min-h-screen w-full max-w-md items-center justify-center px-4 pb-16 pt-28">
       <div className="w-full">
        <div className="bg-white rounded-3xl shadow-xl p-8 border border-border/50">
          <div className="flex flex-col items-center mb-8">
            <img
              src={logoImg}
              alt="Elis Travel"
              className="w-auto h-24 object-contain mb-2"
            />
            <h1 className="text-xl font-semibold text-foreground mt-2">
              La tua area personale
            </h1>
            <p className="text-muted-foreground text-sm mt-1 text-center">
              I tuoi viaggi, i pagamenti e le scadenze in un posto solo.
            </p>
          </div>

          {phase.kind === "consuming" && (
            <p className="text-center text-muted-foreground py-8">
              Stiamo verificando il link…
            </p>
          )}

          {phase.kind === "sent" && (
            <div className="text-center py-4">
              <div className="text-4xl mb-3" aria-hidden="true">
                ✉️
              </div>
              <p className="text-foreground font-medium mb-2">
                Controlla la tua email
              </p>
              <p className="text-sm text-muted-foreground">{phase.message}</p>
              <p className="text-xs text-muted-foreground mt-4">
                Il link vale 15 minuti. Se non lo trovi, guarda nella posta
                indesiderata.
              </p>
              <button
                type="button"
                onClick={() => setPhase({ kind: "form" })}
                className="mt-6 text-sm text-primary underline underline-offset-4"
              >
                Usa un altro indirizzo
              </button>
            </div>
          )}

          {(phase.kind === "form" ||
            phase.kind === "sending" ||
            phase.kind === "error") && (
            <>
              {phase.kind === "error" && (
                <div
                  role="alert"
                  className="mb-4 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
                >
                  {phase.message}
                </div>
              )}

              <form
                onSubmit={(e) => {
                  void handleSubmit(e);
                }}
                className="space-y-4"
              >
                <div>
                  <label
                    htmlFor="account-email"
                    className="block text-sm font-medium text-foreground mb-1.5"
                  >
                    Il tuo indirizzo email
                  </label>
                  <input
                    id="account-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="nome@esempio.it"
                    required
                    autoComplete="email"
                    autoFocus
                    className="w-full px-4 py-3 rounded-xl border border-border bg-muted/30 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                  />
                  <p className="mt-2 text-xs text-muted-foreground">
                    Usa lo stesso indirizzo con cui hai prenotato.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={phase.kind === "sending"}
                  className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:opacity-95 disabled:opacity-60 transition-opacity"
                >
                  {phase.kind === "sending"
                    ? "Invio in corso…"
                    : "Inviami il link di accesso"}
                </button>
              </form>

              <p className="mt-6 text-center text-xs text-muted-foreground">
                Nessuna password da ricordare: ti mandiamo un link che ti fa
                entrare con un clic.
              </p>
            </>
          )}
        </div>
      </div>
       </div>
    </div>
  );
}
