import { useState } from "react";
import { Link } from "wouter";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";

type Stato = "pronto" | "invio" | "collegata" | "errore";

/**
 * Invito a collegare al proprio account la prenotazione aperta col link email.
 *
 * Compare solo con un token valido in mano: il possesso di quel link dimostra
 * di aver ricevuto l'email di questa prenotazione. E' cosi che si risolvono in
 * un clic i casi che un collegamento automatico sbaglierebbe — il capogruppo
 * che prenota per venti, l'indirizzo di famiglia condiviso, il figlio che
 * prenota per i genitori.
 */
export function ClaimBookingBanner({ token }: { token: string }) {
  const { state } = useCustomerAuth();
  const [stato, setStato] = useState<Stato>("pronto");
  const [messaggio, setMessaggio] = useState<string | null>(null);

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
          scadenze in un posto solo. Nessuna password.
        </p>
        <Link
          href="/accedi"
          className="mt-3 inline-block rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
        >
          Accedi o attiva l'area personale
        </Link>
      </div>
    );
  }

  if (stato === "collegata") {
    return (
      <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4">
        <p className="text-sm text-emerald-800">
          {messaggio ?? "Prenotazione collegata al tuo account."}{" "}
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
      const res = await fetch("/api/booking-portal/claim", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-booking-token": token,
        },
        credentials: "include",
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        alreadyLinked?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Collegamento non riuscito.");
      }
      setMessaggio(
        data.alreadyLinked
          ? "Questa prenotazione era gia collegata al tuo account."
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
        La ritrovi nell'area personale insieme agli altri viaggi, senza dover
        cercare l'email.
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
