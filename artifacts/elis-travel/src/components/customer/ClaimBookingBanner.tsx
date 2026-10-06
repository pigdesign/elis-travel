import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";
import { rememberBookingForLogin } from "@/lib/booking-after-login";

type Stato =
  | "verifica"
  | "conferma"
  | "invio"
  | "collegata"
  | "errore"
  | "nascosto";

type ClaimResponse = {
  ok?: boolean;
  alreadyLinked?: boolean;
  needsConfirmation?: boolean;
  error?: string;
};

async function claim(
  token: string,
  automatic: boolean,
): Promise<ClaimResponse> {
  const res = await fetch("/api/booking-portal/claim", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-booking-token": token,
    },
    credentials: "include",
    body: JSON.stringify({ automatic }),
  });
  const data = (await res.json().catch(() => ({}))) as ClaimResponse;
  if (!res.ok) {
    throw new Error(data.error ?? "Collegamento non riuscito.");
  }
  return data;
}

/**
 * La prenotazione aperta col link email e l'area personale.
 *
 * Compare solo con un token valido in mano: il possesso di quel link dimostra
 * di aver ricevuto l'email di questa prenotazione.
 *
 * Chi e gia dentro con lo stesso indirizzo della prenotazione se la ritrova fra
 * i viaggi senza fare niente: il collegamento parte da solo all'apertura. Il
 * pulsante resta per la prenotazione intestata a un altro indirizzo — il
 * capogruppo che prenota per venti, l'indirizzo di famiglia, il figlio che
 * prenota per i genitori — dove la scelta spetta alla persona.
 *
 * Chi non e dentro viene mandato all'accesso portandosi dietro la prenotazione:
 * entrando la trova gia fra i suoi viaggi.
 */
export function ClaimBookingBanner({ token }: { token: string }) {
  const { state } = useCustomerAuth();
  const [, navigate] = useLocation();
  const [stato, setStato] = useState<Stato>("verifica");
  const [messaggio, setMessaggio] = useState<string | null>(null);
  // Vero solo quando il server ha detto che le email non coincidono: e l'unico
  // caso in cui il testo puo spiegare perche serve il clic.
  const [emailDiversa, setEmailDiversa] = useState(false);
  const authenticated = state.status === "authenticated";

  useEffect(() => {
    if (!token || !authenticated) return;
    let annullato = false;
    setStato("verifica");
    void claim(token, true)
      .then((data) => {
        if (annullato) return;
        if (data.ok) {
          setMessaggio(
            data.alreadyLinked
              ? "Questa prenotazione è fra i tuoi viaggi."
              : "Abbiamo aggiunto questa prenotazione ai tuoi viaggi.",
          );
          setStato("collegata");
          return;
        }
        setEmailDiversa(Boolean(data.needsConfirmation));
        setStato(data.needsConfirmation ? "conferma" : "nascosto");
      })
      .catch(() => {
        // Il tentativo automatico non deve allarmare: si torna al pulsante, e
        // se il problema persiste sara il clic a mostrare il motivo.
        if (!annullato) setStato("conferma");
      });
    return () => {
      annullato = true;
    };
  }, [token, authenticated]);

  // Senza token non c'e prova di possesso: nessun invito da mostrare.
  if (!token) return null;
  if (state.status === "loading") return null;

  if (state.status === "unauthenticated") {
    return (
      <div className="mb-6 rounded-2xl border border-primary/20 bg-primary/5 px-5 py-4">
        <p className="font-medium text-foreground">
          Vuoi ritrovare questa prenotazione senza cercare l'email?
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Con l'area personale hai tutti i tuoi viaggi, i pagamenti e le
          scadenze in un posto solo. Nessuna password. Entrando, questa
          prenotazione sarà già fra i tuoi viaggi.
        </p>
        <button
          type="button"
          onClick={() => {
            rememberBookingForLogin(token);
            navigate("/accedi");
          }}
          className="mt-3 inline-block rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
        >
          Accedi o attiva l'area personale
        </button>
      </div>
    );
  }

  if (stato === "verifica" || stato === "nascosto") return null;

  if (stato === "collegata") {
    return (
      <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4">
        <p className="text-sm text-emerald-800">
          {messaggio ?? "Questa prenotazione è fra i tuoi viaggi."}{" "}
          <Link
            href="/area-clienti/viaggi"
            className="font-semibold underline underline-offset-4"
          >
            Vedi i miei viaggi
          </Link>
        </p>
      </div>
    );
  }

  const collega = async () => {
    setStato("invio");
    setMessaggio(null);
    try {
      const data = await claim(token, false);
      if (!data.ok) throw new Error(data.error ?? "Collegamento non riuscito.");
      setMessaggio(
        data.alreadyLinked
          ? "Questa prenotazione era già collegata al tuo account."
          : "Prenotazione collegata al tuo account.",
      );
      setStato("collegata");
    } catch (err) {
      setMessaggio(
        err instanceof Error ? err.message : "Collegamento non riuscito.",
      );
      setStato("errore");
    }
  };

  return (
    <div className="mb-6 rounded-2xl border border-primary/20 bg-primary/5 px-5 py-4">
      <p className="font-medium text-foreground">
        Collega questa prenotazione al tuo account
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        {emailDiversa
          ? "È stata fatta con un indirizzo email diverso da quello del tuo account. Se è tua, collegala: la ritroverai nell'area personale insieme agli altri viaggi."
          : "La ritrovi nell'area personale insieme agli altri viaggi, senza dover cercare l'email."}
      </p>
      {stato === "errore" && messaggio && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {messaggio}
        </p>
      )}
      <button
        type="button"
        onClick={() => void collega()}
        disabled={stato === "invio"}
        className="mt-3 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
      >
        {stato === "invio" ? "Collegamento…" : "Collega al mio account"}
      </button>
    </div>
  );
}
