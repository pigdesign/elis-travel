import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import {
  countdownLabel,
  daysUntil,
  euro,
  formatDeparture,
  pendingActionLabel,
  type AccountBooking,
} from "@/lib/account-bookings";

type Scope = "upcoming" | "past" | "cancelled";

const TABS: { key: Scope; label: string }[] = [
  { key: "upcoming", label: "In arrivo" },
  { key: "past", label: "Passati" },
  { key: "cancelled", label: "Annullati" },
];

function BookingCard({ booking }: { booking: AccountBooking }) {
  const action = pendingActionLabel(booking);
  const giorni = daysUntil(booking);
  const countdown =
    !booking.cancelledAt && giorni >= 0 ? countdownLabel(giorni) : "";

  return (
    <article className="rounded-2xl border border-border/60 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-foreground">
            {booking.excursionName}
          </h3>
          <p className="text-sm text-muted-foreground">{booking.location}</p>
        </div>
        {countdown && (
          <span className="shrink-0 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            {countdown}
          </span>
        )}
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div className="col-span-2">
          <dt className="text-muted-foreground">Partenza</dt>
          <dd className="text-foreground">{formatDeparture(booking)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Persone</dt>
          <dd className="text-foreground">{booking.seats}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Totale</dt>
          <dd className="text-foreground">{euro(booking.totalAmountCents)}</dd>
        </div>
        {booking.bookingCode && (
          <div className="col-span-2">
            <dt className="text-muted-foreground">Codice</dt>
            <dd className="font-mono text-foreground">{booking.bookingCode}</dd>
          </div>
        )}
      </dl>

      {action && (
        <p
          className={`mt-4 rounded-xl px-3 py-2 text-sm ${
            action.urgent
              ? "bg-destructive/10 text-destructive"
              : "bg-muted/60 text-foreground"
          }`}
        >
          {action.text}
        </p>
      )}

      {/* Il dettaglio resta il portale prenotazione, che ora accetta anche la
          sessione: non duplichiamo pagamenti e annullamento. */}
      <Link
        href={`/prenotazione?b=${booking.bookingId}`}
        className="mt-4 inline-block text-sm font-medium text-primary underline underline-offset-4"
      >
        Apri la prenotazione
      </Link>
    </article>
  );
}

export function AccountTripsPage() {
  const [scope, setScope] = useState<Scope>("upcoming");
  const [bookings, setBookings] = useState<AccountBooking[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let annullato = false;
    setBookings(null);
    setError(null);
    fetch(`/api/account/bookings?scope=${scope}`, { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) throw new Error("Non siamo riusciti a caricare i viaggi.");
        return (await res.json()) as { bookings: AccountBooking[] };
      })
      .then((data) => {
        if (!annullato) setBookings(data.bookings);
      })
      .catch((err: unknown) => {
        if (!annullato) {
          setError(err instanceof Error ? err.message : "Errore imprevisto.");
        }
      });
    return () => {
      annullato = true;
    };
  }, [scope]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/5">
      <Header solid />
      <div className="mx-auto max-w-3xl px-4 pb-16 pt-28">
        <div className="mb-6 flex items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold text-foreground">I miei viaggi</h1>
          <Link
            href="/area-clienti"
            className="text-sm text-primary underline underline-offset-4"
          >
            Torna all'area personale
          </Link>
        </div>

        <div className="mb-6 flex gap-2" role="tablist">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={scope === tab.key}
              onClick={() => setScope(tab.key)}
              className={`rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
                scope === tab.key
                  ? "bg-primary text-primary-foreground"
                  : "border border-border text-foreground hover:bg-muted/50"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {error && (
          <p role="alert" className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </p>
        )}

        {!error && bookings === null && (
          <p className="text-muted-foreground">Caricamento…</p>
        )}

        {!error && bookings?.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border bg-white/60 p-8 text-center">
            <p className="text-foreground font-medium">
              {scope === "upcoming"
                ? "Nessun viaggio in arrivo"
                : scope === "past"
                  ? "Nessun viaggio passato"
                  : "Nessun viaggio annullato"}
            </p>
            {scope === "upcoming" && (
              <p className="mt-2 text-sm text-muted-foreground">
                Se hai prenotato di recente, apri il link "Attiva la tua area
                personale" che trovi nell'email di conferma: la prenotazione si
                collega da sola.
              </p>
            )}
          </div>
        )}

        <div className="space-y-4">
          {bookings?.map((b) => (
            <BookingCard key={b.bookingId} booking={b} />
          ))}
        </div>
      </div>
      <Footer />
    </div>
  );
}
