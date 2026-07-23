import { useCallback, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, Mail, RefreshCw } from "lucide-react";
import { Button } from "@/components/shared/Button";

type OutboxEntry = {
  id: string;
  eventType: string;
  status: string;
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt: string;
  sentAt: string | null;
  lastError: string | null;
  recipients: string[];
  subject: string;
  createdAt: string;
};

type OutboxResponse = {
  counts: Record<string, number>;
  entries: OutboxEntry[];
};

async function adminRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/admin${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "Operazione non riuscita.");
  return data;
}

export function EmailOutboxPanel() {
  const [data, setData] = useState<OutboxResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const next = await adminRequest<OutboxResponse>("/email-outbox");
    setData(next);
  }, []);

  useEffect(() => {
    void refresh()
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Outbox non disponibile."))
      .finally(() => setLoading(false));
  }, [refresh]);

  const runNow = async () => {
    setBusy("process");
    setError(null);
    try {
      await adminRequest("/email-outbox/process", { method: "POST", body: "{}" });
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Invio non riuscito.");
    } finally {
      setBusy(null);
    }
  };

  const retry = async (id: string) => {
    setBusy(id);
    setError(null);
    try {
      await adminRequest(`/email-outbox/${id}/retry`, { method: "POST", body: "{}" });
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Retry non riuscito.");
    } finally {
      setBusy(null);
    }
  };

  const problems = data?.entries.filter((entry) =>
    ["failed", "processing", "pending"].includes(entry.status),
  ).slice(0, 12) ?? [];

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
            <Mail className="h-5 w-5 text-primary" /> Consegna email operative
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Le email vengono accodate nel database e ritentate automaticamente. Qui sono visibili errori e tentativi in attesa.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => void runNow()} disabled={busy !== null}>
          {busy === "process" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Elabora ora
        </Button>
      </div>

      {loading ? (
        <Loader2 className="mx-auto my-8 h-5 w-5 animate-spin text-primary" />
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <div className="rounded-xl bg-slate-50 p-3"><strong>{data?.counts.pending ?? 0}</strong><br />In attesa</div>
            <div className="rounded-xl bg-slate-50 p-3"><strong>{data?.counts.processing ?? 0}</strong><br />In invio</div>
            <div className="rounded-xl bg-emerald-50 p-3 text-emerald-800"><strong>{data?.counts.sent ?? 0}</strong><br />Inviate</div>
            <div className="rounded-xl bg-red-50 p-3 text-red-800"><strong>{data?.counts.failed ?? 0}</strong><br />Con errore</div>
          </div>

          {problems.length === 0 ? (
            <p className="mt-4 flex items-center gap-2 text-sm text-emerald-700">
              <CheckCircle2 className="h-4 w-4" /> Nessun invio problematico.
            </p>
          ) : (
            <div className="mt-4 space-y-2">
              {problems.map((entry) => (
                <div key={entry.id} className="rounded-xl border border-border p-3 text-xs">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">{entry.subject}</p>
                      <p className="truncate text-muted-foreground">{entry.recipients.join(", ")}</p>
                      <p className="mt-1 text-muted-foreground">Stato: {entry.status} · tentativo {entry.attemptCount}/{entry.maxAttempts}</p>
                      {entry.lastError && (
                        <p className="mt-1 flex items-start gap-1 text-red-700">
                          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {entry.lastError}
                        </p>
                      )}
                    </div>
                    {entry.status === "failed" && (
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => void retry(entry.id)}
                        className="shrink-0 rounded-lg border border-border px-2.5 py-1.5 font-medium hover:bg-muted disabled:opacity-50"
                      >
                        {busy === entry.id ? "…" : "Riprova"}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      {error && <p className="mt-3 text-xs text-red-700">{error}</p>}
    </section>
  );
}
