import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  Ban,
  CheckCircle2,
  Link2,
  Loader2,
  Mail,
  Search,
  Unlink,
  UserRound,
} from "lucide-react";
import { useDebounce } from "@/lib/useDebounce";

// Questa pagina usa `fetch` diretto invece del client generato da orval:
// rigenerare @workspace/api-client-react toccherebbe un file condiviso e
// produrrebbe un diff ampio, con rischio di conflitto sul lavoro altrui.
// Le pagine dell'area clienti gia in produzione seguono la stessa scelta.

type AccountRow = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  status: string;
  emailStatus: string;
  createdVia: string;
  lastLoginAt: string | null;
  createdAt: string;
  bookingCount: number;
};

type LinkedBooking = {
  linkId: string;
  bookingId: string;
  bookingCode: string | null;
  customerName: string;
  excursionName: string;
  date: string;
  linkedVia: string;
  linkedAt: string;
  linkedBy: string | null;
  revokedAt: string | null;
};

type AccountEvent = {
  id: string;
  eventType: string;
  ip: string | null;
  detail: Record<string, unknown> | null;
  createdAt: string;
};

type Detail = {
  account: AccountRow & { emailVerifiedAt: string | null };
  bookings: LinkedBooking[];
  events: AccountEvent[];
};

const STATO: Record<string, { label: string; className: string }> = {
  active: { label: "Attivo", className: "bg-emerald-50 text-emerald-700" },
  pending: { label: "Mai entrato", className: "bg-amber-50 text-amber-700" },
  blocked: { label: "Bloccato", className: "bg-red-50 text-red-700" },
};

const ORIGINE: Record<string, string> = {
  booking: "da prenotazione",
  self: "registrazione",
  admin: "creato da staff",
};

const EVENTO: Record<string, string> = {
  magic_link_requested: "Ha chiesto il link di accesso",
  magic_link_consumed: "Ha usato il link di accesso",
  magic_link_failed: "Link non valido o scaduto",
  login: "Accesso riuscito",
  logout: "Uscita",
  invite_sent: "Invito inviato",
  blocked: "Account bloccato",
  unblocked: "Account sbloccato",
  booking_linked: "Prenotazione collegata",
  booking_link_revoked: "Collegamento revocato",
  profile_updated: "Dati aggiornati",
  email_bounced: "Email non recapitata",
};

function dt(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function nomeCompleto(a: { firstName: string | null; lastName: string | null }) {
  return [a.firstName, a.lastName].filter(Boolean).join(" ") || "—";
}

export function CustomerAccountsPage() {
  const [query, setQuery] = useState("");
  const ricerca = useDebounce(query, 300);
  const [accounts, setAccounts] = useState<AccountRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [codice, setCodice] = useState("");

  const caricaElenco = useCallback(async () => {
    const res = await fetch(
      `/api/admin/customer-accounts?q=${encodeURIComponent(ricerca)}`,
      { credentials: "include" },
    );
    if (!res.ok) return;
    const data = (await res.json()) as { accounts: AccountRow[]; total: number };
    setAccounts(data.accounts);
    setTotal(data.total);
  }, [ricerca]);

  const caricaDettaglio = useCallback(async (id: string) => {
    setDetail(null);
    const res = await fetch(`/api/admin/customer-accounts/${id}`, {
      credentials: "include",
    });
    if (!res.ok) return;
    setDetail((await res.json()) as Detail);
  }, []);

  useEffect(() => {
    void caricaElenco();
  }, [caricaElenco]);

  useEffect(() => {
    if (selectedId) void caricaDettaglio(selectedId);
  }, [selectedId, caricaDettaglio]);

  const azione = async (
    path: string,
    init: RequestInit,
    successo: string,
  ) => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(path, {
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        ...init,
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Operazione non riuscita.");
      setMsg({ ok: true, text: successo });
      if (selectedId) await caricaDettaglio(selectedId);
      await caricaElenco();
    } catch (err) {
      setMsg({
        ok: false,
        text: err instanceof Error ? err.message : "Operazione non riuscita.",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-8">
      <header className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
          <UserRound className="h-6 w-6 text-brand-teal-500" />
          Account area clienti
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Chi ha accesso all'area personale, quali prenotazioni vede e cosa ha
          fatto. {total} account registrati.
        </p>
      </header>

      <div className="relative mb-4 max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cerca per email, nome o cognome"
          className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-4 text-sm focus:border-brand-teal-400 focus:outline-none"
        />
      </div>

      {msg && (
        <p
          className={`mb-4 flex items-center gap-2 rounded-xl px-4 py-3 text-sm ${
            msg.ok
              ? "bg-emerald-50 text-emerald-800"
              : "bg-red-50 text-red-700"
          }`}
        >
          {msg.ok ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <AlertCircle className="h-4 w-4" />
          )}
          {msg.text}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        {/* Elenco */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {accounts === null ? (
            <p className="p-6 text-sm text-slate-500">Caricamento…</p>
          ) : accounts.length === 0 ? (
            <p className="p-6 text-sm text-slate-500">
              Nessun account trovato.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {accounts.map((a) => {
                const stato = STATO[a.status] ?? {
                  label: a.status,
                  className: "bg-slate-100 text-slate-600",
                };
                return (
                  <li key={a.id}>
                    <button
                      onClick={() => setSelectedId(a.id)}
                      className={`w-full px-5 py-4 text-left transition-colors hover:bg-slate-50 ${
                        selectedId === a.id ? "bg-brand-teal-50/50" : ""
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-slate-800">
                            {nomeCompleto(a)}
                          </p>
                          <p className="truncate text-sm text-slate-500">
                            {a.email}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${stato.className}`}
                        >
                          {stato.label}
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-slate-400">
                        {a.bookingCount}{" "}
                        {a.bookingCount === 1 ? "prenotazione" : "prenotazioni"}
                        {" · "}
                        {ORIGINE[a.createdVia] ?? a.createdVia}
                        {a.lastLoginAt
                          ? ` · ultimo accesso ${dt(a.lastLoginAt)}`
                          : " · mai entrato"}
                        {a.emailStatus === "bounced" && " · ⚠ email non recapitabile"}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Dettaglio */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          {!selectedId ? (
            <p className="text-sm text-slate-500">
              Scegli un account per vedere prenotazioni collegate e storico
              accessi.
            </p>
          ) : !detail ? (
            <p className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Caricamento…
            </p>
          ) : (
            <>
              <div className="mb-5 border-b border-slate-100 pb-5">
                <h2 className="text-lg font-bold text-slate-900">
                  {nomeCompleto(detail.account)}
                </h2>
                <p className="text-sm text-slate-500">{detail.account.email}</p>
                <p className="mt-2 text-xs text-slate-400">
                  Creato {dt(detail.account.createdAt)} ·{" "}
                  {detail.account.emailVerifiedAt
                    ? `email verificata ${dt(detail.account.emailVerifiedAt)}`
                    : "email non ancora verificata"}
                </p>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    disabled={busy || detail.account.status === "blocked"}
                    onClick={() =>
                      void azione(
                        `/api/admin/customer-accounts/${detail.account.id}/resend-link`,
                        { method: "POST" },
                        `Link di accesso inviato a ${detail.account.email}.`,
                      )
                    }
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    <Mail className="h-4 w-4" />
                    Invia link di accesso
                  </button>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void azione(
                        `/api/admin/customer-accounts/${detail.account.id}/status`,
                        {
                          method: "POST",
                          body: JSON.stringify({
                            blocked: detail.account.status !== "blocked",
                          }),
                        },
                        detail.account.status === "blocked"
                          ? "Account sbloccato."
                          : "Account bloccato: le sessioni attive decadono subito.",
                      )
                    }
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    <Ban className="h-4 w-4" />
                    {detail.account.status === "blocked"
                      ? "Sblocca"
                      : "Blocca accesso"}
                  </button>
                </div>
              </div>

              {/* Prenotazioni collegate */}
              <section className="mb-6">
                <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-400">
                  Prenotazioni collegate
                </h3>
                {detail.bookings.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    Nessuna. Il cliente non vede ancora nessun viaggio.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {detail.bookings.map((b) => (
                      <li
                        key={b.linkId}
                        className={`flex items-start justify-between gap-3 rounded-xl border px-4 py-3 ${
                          b.revokedAt
                            ? "border-slate-100 bg-slate-50 opacity-60"
                            : "border-slate-200"
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-800">
                            {b.excursionName}{" "}
                            {b.bookingCode && (
                              <span className="font-mono text-xs text-slate-500">
                                {b.bookingCode}
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-slate-500">
                            {b.customerName} · collegata {dt(b.linkedAt)} ·{" "}
                            {b.linkedVia === "admin"
                              ? "manualmente dallo staff"
                              : b.linkedVia === "portal_token"
                                ? "dal link della prenotazione"
                                : b.linkedVia === "invite_token"
                                  ? "dall'invito via email"
                                  : b.linkedVia}
                            {b.revokedAt && " · REVOCATA"}
                          </p>
                        </div>
                        {!b.revokedAt && (
                          <button
                            disabled={busy}
                            title="Revoca il collegamento"
                            onClick={() =>
                              void azione(
                                `/api/admin/customer-accounts/${detail.account.id}/bookings/${b.linkId}`,
                                { method: "DELETE" },
                                "Collegamento revocato.",
                              )
                            }
                            className="shrink-0 rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                          >
                            <Unlink className="h-4 w-4" />
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                <div className="mt-3 flex gap-2">
                  <input
                    value={codice}
                    onChange={(e) => setCodice(e.target.value)}
                    placeholder="Codice prenotazione (es. ET-4F7K9)"
                    className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-teal-400 focus:outline-none"
                  />
                  <button
                    disabled={busy || !codice.trim()}
                    onClick={() =>
                      void azione(
                        `/api/admin/customer-accounts/${detail.account.id}/bookings`,
                        {
                          method: "POST",
                          body: JSON.stringify({ bookingCode: codice.trim() }),
                        },
                        `Prenotazione ${codice.trim()} collegata.`,
                      ).then(() => setCodice(""))
                    }
                    className="inline-flex items-center gap-1.5 rounded-lg bg-brand-teal-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-teal-600 disabled:opacity-50"
                  >
                    <Link2 className="h-4 w-4" />
                    Collega
                  </button>
                </div>
                <p className="mt-2 text-xs text-slate-400">
                  Il collegamento manuale è l'unico che non porta con sé una
                  prova di possesso dell'email: resta tracciato con il tuo
                  identificativo.
                </p>
              </section>

              {/* Storico */}
              <section>
                <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-400">
                  Storico accessi
                </h3>
                {detail.events.length === 0 ? (
                  <p className="text-sm text-slate-500">Nessun evento.</p>
                ) : (
                  <ul className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
                    {detail.events.map((e) => (
                      <li
                        key={e.id}
                        className="flex items-baseline justify-between gap-3 text-sm"
                      >
                        <span className="text-slate-700">
                          {EVENTO[e.eventType] ?? e.eventType}
                        </span>
                        <span className="shrink-0 text-xs text-slate-400">
                          {dt(e.createdAt)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
