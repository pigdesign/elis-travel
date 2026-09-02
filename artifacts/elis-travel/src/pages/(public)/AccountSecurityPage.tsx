import { useState, type FormEvent } from "react";
import { Link } from "wouter";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";

// Deve coincidere con customer-password.ts lato server: qui e solo per dirlo
// prima di far fare un giro inutile, la verifica vera resta quella del server.
const LUNGHEZZA_MINIMA = 8;

type Stato =
  | { kind: "fermo" }
  | { kind: "salvataggio" }
  | { kind: "fatto"; messaggio: string }
  | { kind: "errore"; messaggio: string };

/**
 * Impostazione della password dell'area clienti.
 *
 * La password e volutamente facoltativa: si entra sempre e comunque con il
 * link via email, che e anche il recupero. Questa pagina serve a chi preferisce
 * non aspettare l'email a ogni accesso.
 */
export function AccountSecurityPage() {
  const { state, setPassword, removePassword } = useCustomerAuth();
  const [nuova, setNuova] = useState("");
  const [conferma, setConferma] = useState("");
  const [attuale, setAttuale] = useState("");
  const [stato, setStato] = useState<Stato>({ kind: "fermo" });

  if (state.status !== "authenticated") return null;
  const { account } = state;

  const salva = async (e: FormEvent) => {
    e.preventDefault();
    if (nuova !== conferma) {
      setStato({
        kind: "errore",
        messaggio: "Le due password non coincidono.",
      });
      return;
    }
    if (nuova.length < LUNGHEZZA_MINIMA) {
      setStato({
        kind: "errore",
        messaggio: `La password deve avere almeno ${LUNGHEZZA_MINIMA} caratteri.`,
      });
      return;
    }
    setStato({ kind: "salvataggio" });
    try {
      await setPassword({
        password: nuova,
        // Il server la chiede solo a chi e entrato con la password: mandarla
        // sempre quando c'e non costa nulla e copre entrambi i casi.
        ...(attuale ? { currentPassword: attuale } : {}),
      });
      setNuova("");
      setConferma("");
      setAttuale("");
      setStato({
        kind: "fatto",
        messaggio: account.hasPassword
          ? "Password aggiornata. Le altre sessioni aperte sono state chiuse."
          : "Password impostata. Da adesso puoi entrare anche senza aspettare l'email.",
      });
    } catch (err) {
      setStato({
        kind: "errore",
        messaggio:
          err instanceof Error ? err.message : "Salvataggio non riuscito.",
      });
    }
  };

  const rimuovi = async () => {
    setStato({ kind: "salvataggio" });
    try {
      await removePassword();
      setStato({
        kind: "fatto",
        messaggio:
          "Password rimossa. Continuerai a entrare con il link via email.",
      });
    } catch (err) {
      setStato({
        kind: "errore",
        messaggio:
          err instanceof Error ? err.message : "Rimozione non riuscita.",
      });
    }
  };

  const campo =
    "w-full px-4 py-3 rounded-xl border border-border bg-muted/30 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors";

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/5">
      <Header solid />
      <div className="mx-auto max-w-2xl px-4 pb-16 pt-28">
        <div className="mb-6 flex items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold text-foreground">
            Come accedi
          </h1>
          <Link
            href="/area-clienti"
            className="text-sm text-primary underline underline-offset-4"
          >
            Torna all'area personale
          </Link>
        </div>

        <div className="rounded-2xl border border-border/60 bg-white p-6 shadow-sm">
          <p className="text-sm text-muted-foreground">
            Entri sempre con il link che ti mandiamo a{" "}
            <strong className="text-foreground">{account.email}</strong>, senza
            ricordare niente. Se preferisci, puoi aggiungere una password ed
            entrare subito senza aspettare l'email.
          </p>

          {stato.kind === "fatto" && (
            <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              {stato.messaggio}
            </p>
          )}
          {stato.kind === "errore" && (
            <p
              role="alert"
              className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
            >
              {stato.messaggio}
            </p>
          )}

          <form
            onSubmit={(e) => {
              void salva(e);
            }}
            className="mt-6 space-y-4"
          >
            {account.hasPassword && (
              <div>
                <label
                  htmlFor="password-attuale"
                  className="block text-sm font-medium text-foreground mb-1.5"
                >
                  Password attuale
                </label>
                <input
                  id="password-attuale"
                  type="password"
                  value={attuale}
                  onChange={(e) => setAttuale(e.target.value)}
                  autoComplete="current-password"
                  className={campo}
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  Se sei entrato con il link e non la ricordi, lascia il campo
                  vuoto.
                </p>
              </div>
            )}

            <div>
              <label
                htmlFor="password-nuova"
                className="block text-sm font-medium text-foreground mb-1.5"
              >
                {account.hasPassword ? "Nuova password" : "Scegli una password"}
              </label>
              <input
                id="password-nuova"
                type="password"
                value={nuova}
                onChange={(e) => setNuova(e.target.value)}
                required
                minLength={LUNGHEZZA_MINIMA}
                autoComplete="new-password"
                className={campo}
              />
              <p className="mt-2 text-xs text-muted-foreground">
                Almeno {LUNGHEZZA_MINIMA} caratteri.
              </p>
            </div>

            <div>
              <label
                htmlFor="password-conferma"
                className="block text-sm font-medium text-foreground mb-1.5"
              >
                Ripeti la password
              </label>
              <input
                id="password-conferma"
                type="password"
                value={conferma}
                onChange={(e) => setConferma(e.target.value)}
                required
                autoComplete="new-password"
                className={campo}
              />
            </div>

            <button
              type="submit"
              disabled={stato.kind === "salvataggio"}
              className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:opacity-95 disabled:opacity-60 transition-opacity"
            >
              {stato.kind === "salvataggio"
                ? "Salvataggio…"
                : account.hasPassword
                  ? "Cambia password"
                  : "Imposta la password"}
            </button>
          </form>

          {account.hasPassword && (
            <div className="mt-6 border-t border-border/60 pt-6">
              <button
                type="button"
                onClick={() => void rimuovi()}
                disabled={stato.kind === "salvataggio"}
                className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground disabled:opacity-60"
              >
                Rimuovi la password e usa solo il link via email
              </button>
            </div>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
}
