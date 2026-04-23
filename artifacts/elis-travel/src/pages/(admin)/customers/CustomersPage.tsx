import { useState, useCallback } from "react";
import { useDebounce } from "@/lib/useDebounce";
import {
  useListCustomers,
  useGetCustomer,
  useCreateCustomer,
  useUpdateCustomer,
  useLinkCustomerToRms,
  useSyncCustomerToRms,
  useSearchRmsCustomers,
  useImportCustomerFromRms,
  getListCustomersQueryKey,
  getGetCustomerQueryKey,
  getSearchRmsCustomersQueryKey,
} from "@workspace/api-client-react";
import type { CustomerSummary, CustomerDetail, RmsSearchResult } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Users,
  Search,
  Plus,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Link2,
  X,
  ChevronRight,
  ArrowUpDown,
  Clock,
  Mail,
  Phone,
  ExternalLink,
  ChevronLeft,
  Download,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/shared/Button";

function formatDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
}
function formatDateTime(d: string | Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const EVENT_TYPE_LABEL: Record<string, string> = {
  pull_from_rms: "Importato da RMS",
  push_to_rms: "Inviato a RMS",
};
const EVENT_STATUS_CFG: Record<string, { label: string; className: string }> = {
  success: { label: "Riuscito", className: "bg-green-100 text-green-700" },
  failed: { label: "Fallito", className: "bg-red-100 text-red-700" },
  conflict: { label: "Conflitto", className: "bg-yellow-100 text-yellow-700" },
};

function RmsBadge({ linked, lastSyncAt }: { linked: boolean; lastSyncAt?: string | null }) {
  if (!linked) return null;
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700"
      title={lastSyncAt ? `Ultima sync: ${formatDateTime(lastSyncAt)}` : "Collegato a RMS"}
    >
      <Link2 className="w-3 h-3" />
      RMS
    </span>
  );
}

function PageLevelRmsSearch({ onImported }: { onImported: () => void }) {
  const [q, setQ] = useState("");
  const debQ = useDebounce(q, 500);
  const params = { q: debQ };

  const { data: results = [], isFetching, error } = useSearchRmsCustomers(
    params,
    { query: { queryKey: getSearchRmsCustomersQueryKey(params), enabled: debQ.length >= 2 } },
  );

  const qc = useQueryClient();
  const { mutate: importFromRms, isPending: importing, variables: importingVars } = useImportCustomerFromRms({
    mutation: {
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: getListCustomersQueryKey() });
        onImported();
      },
    },
  });

  const handleImport = (r: RmsSearchResult) => {
    importFromRms({ data: { rmsExternalId: r.id, firstName: r.firstName, lastName: r.lastName, email: r.email, phone: r.phone ?? null } });
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Cerca un cliente su RivieraTransferRMS e importalo direttamente nell'anagrafica locale con collegamento automatico.
      </p>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cerca su RMS per nome o email (min 2 caratteri)…"
          className="w-full pl-9 pr-10 py-2.5 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        {isFetching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />}
        {q && !isFetching && (
          <button onClick={() => setQ("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      {error && (
        <div className="flex items-center gap-2 p-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          Impossibile contattare RMS. Riprova più tardi.
        </div>
      )}
      {debQ.length >= 2 && !isFetching && (results as RmsSearchResult[]).length === 0 && !error && (
        <p className="text-sm text-muted-foreground italic">Nessun risultato su RMS per "{debQ}".</p>
      )}
      {(results as RmsSearchResult[]).length > 0 && (
        <div className="space-y-2">
          {(results as RmsSearchResult[]).map((r) => {
            const isImporting = importing && importingVars?.data?.rmsExternalId === r.id;
            return (
              <div key={r.id} className="flex items-center justify-between p-3 border border-border rounded-lg bg-white">
                <div>
                  <div className="font-medium text-sm">{r.firstName} {r.lastName}</div>
                  <div className="text-xs text-muted-foreground">{r.email}{r.phone ? ` · ${r.phone}` : ""}</div>
                  <div className="text-xs text-muted-foreground font-mono">ID RMS: {r.id}</div>
                </div>
                <Button
                  onClick={() => handleImport(r)}
                  disabled={importing}
                  className="text-xs bg-green-600 text-white hover:bg-green-700 px-3 py-1.5 h-auto ml-3 flex-shrink-0"
                >
                  {isImporting ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Download className="w-3 h-3 mr-1" />Importa</>}
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CustomerDetailPanel({
  customerId,
  onClose,
}: {
  customerId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { data: customer, isLoading } = useGetCustomer(customerId);

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<{ firstName: string; lastName: string; email: string; phone: string }>({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
  });

  const [rmsSearchQuery, setRmsSearchQuery] = useState("");
  const debouncedRmsQ = useDebounce(rmsSearchQuery, 500);
  const rmsSearchParams = { q: debouncedRmsQ };
  const { data: rmsResults = [], isFetching: rmsSearching, error: rmsError } = useSearchRmsCustomers(
    rmsSearchParams,
    {
      query: {
        queryKey: getSearchRmsCustomersQueryKey(rmsSearchParams),
        enabled: debouncedRmsQ.length >= 2,
      },
    },
  );

  const { mutate: updateCustomer, isPending: updating } = useUpdateCustomer({
    mutation: {
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: getGetCustomerQueryKey(customerId) });
        void qc.invalidateQueries({ queryKey: getListCustomersQueryKey() });
        setEditing(false);
      },
    },
  });

  const { mutate: linkToRms, isPending: linking } = useLinkCustomerToRms({
    mutation: {
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: getGetCustomerQueryKey(customerId) });
        void qc.invalidateQueries({ queryKey: getListCustomersQueryKey() });
        setRmsSearchQuery("");
      },
    },
  });

  const { mutate: importFromRms, isPending: importing } = useImportCustomerFromRms({
    mutation: {
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: getListCustomersQueryKey() });
        setRmsSearchQuery("");
      },
    },
  });

  const { mutate: syncToRms, isPending: syncing } = useSyncCustomerToRms({
    mutation: {
      onSuccess: () => {
        setTimeout(() => {
          void qc.invalidateQueries({ queryKey: getGetCustomerQueryKey(customerId) });
        }, 1500);
      },
    },
  });

  const startEdit = () => {
    if (!customer) return;
    setForm({
      firstName: customer.firstName,
      lastName: customer.lastName,
      email: customer.email,
      phone: customer.phone ?? "",
    });
    setEditing(true);
  };

  const handleSave = () => {
    updateCustomer({
      id: customerId,
      data: {
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        phone: form.phone || null,
      },
    });
  };

  const handleLink = (rmsId: string) => {
    linkToRms({ id: customerId, data: { rmsExternalId: rmsId } });
  };

  const handleImportFromRms = (r: RmsSearchResult) => {
    importFromRms({
      data: {
        rmsExternalId: r.id,
        firstName: r.firstName,
        lastName: r.lastName,
        email: r.email,
        phone: r.phone ?? null,
      },
    });
  };

  const handleSync = () => {
    syncToRms({ id: customerId });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }
  if (!customer) return null;

  const c = customer as CustomerDetail;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-lg">
            {c.firstName[0]}{c.lastName[0]}
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">{c.firstName} {c.lastName}</h2>
            <div className="text-sm text-muted-foreground">{c.email}</div>
          </div>
          <RmsBadge linked={c.rmsLinked} lastSyncAt={c.rmsLastSyncAt} />
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="w-5 h-5" />
        </button>
      </div>

      {!editing ? (
        <div className="bg-white border border-border rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Dati anagrafici</h3>
            <button onClick={startEdit} className="text-xs text-primary font-medium hover:underline">Modifica</button>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-muted-foreground">Nome</div>
              <div className="font-medium">{c.firstName}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Cognome</div>
              <div className="font-medium">{c.lastName}</div>
            </div>
            <div>
              <div className="text-muted-foreground flex items-center gap-1"><Mail className="w-3 h-3" /> Email</div>
              <div className="font-medium">{c.email}</div>
            </div>
            <div>
              <div className="text-muted-foreground flex items-center gap-1"><Phone className="w-3 h-3" /> Telefono</div>
              <div className="font-medium">{c.phone ?? "—"}</div>
            </div>
          </div>
          <div className="text-xs text-muted-foreground">Cliente dal {formatDate(c.createdAt)}</div>
        </div>
      ) : (
        <div className="bg-white border border-border rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Modifica dati</h3>
          <div className="grid grid-cols-2 gap-3">
            {(["firstName", "lastName"] as const).map((f) => (
              <div key={f}>
                <label className="block text-xs font-medium text-foreground mb-1">
                  {f === "firstName" ? "Nome" : "Cognome"}
                </label>
                <input
                  type="text"
                  value={form[f]}
                  onChange={(e) => setForm((p) => ({ ...p, [f]: e.target.value }))}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            ))}
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Telefono</label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={handleSave}
              disabled={updating}
              className="bg-primary text-primary-foreground hover:bg-primary/90 text-sm px-4 py-2"
            >
              {updating ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salva"}
            </Button>
            <button onClick={() => setEditing(false)} className="text-sm text-muted-foreground hover:text-foreground px-4 py-2">
              Annulla
            </button>
          </div>
        </div>
      )}

      <div className="bg-white border border-border rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <Link2 className="w-4 h-4" />
            RivieraTransferRMS
          </h3>
          {c.rmsLinked && (
            <Button
              onClick={handleSync}
              disabled={syncing}
              className="text-xs bg-blue-600 text-white hover:bg-blue-700 px-3 py-1.5 h-auto"
            >
              {syncing ? (
                <><Loader2 className="w-3 h-3 animate-spin mr-1" />Sincronizzazione...</>
              ) : (
                <><RefreshCw className="w-3 h-3 mr-1" />Sincronizza su RMS</>
              )}
            </Button>
          )}
        </div>

        {c.rmsLinked ? (
          <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm">
            <CheckCircle2 className="w-5 h-5 text-blue-600 flex-shrink-0" />
            <div>
              <div className="font-medium text-blue-900">Collegato a RMS</div>
              <div className="text-blue-700 text-xs font-mono">ID esterno: {c.rmsExternalId}</div>
              {c.rmsLastSyncAt && (
                <div className="text-blue-600 text-xs">Ultima sync: {formatDateTime(c.rmsLastSyncAt)}</div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Cliente non collegato a RMS. Cerca il profilo corrispondente e collegalo, oppure importalo come nuovo cliente locale.
            </p>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={rmsSearchQuery}
                onChange={(e) => setRmsSearchQuery(e.target.value)}
                placeholder="Cerca su RMS per nome o email…"
                className="w-full pl-9 pr-4 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              {rmsSearching && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
              )}
            </div>
            {rmsError && (
              <div className="flex items-center gap-2 p-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                Impossibile contattare RMS. Riprova più tardi.
              </div>
            )}
            {debouncedRmsQ.length >= 2 && !rmsSearching && (rmsResults as RmsSearchResult[]).length === 0 && !rmsError && (
              <p className="text-sm text-muted-foreground italic">Nessun risultato su RMS per "{debouncedRmsQ}".</p>
            )}
            {(rmsResults as RmsSearchResult[]).length > 0 && (
              <div className="space-y-2">
                {(rmsResults as RmsSearchResult[]).map((r) => (
                  <div key={r.id} className="p-3 border border-border rounded-lg bg-white space-y-2">
                    <div>
                      <div className="font-medium text-sm">{r.firstName} {r.lastName}</div>
                      <div className="text-xs text-muted-foreground">{r.email}{r.phone ? ` · ${r.phone}` : ""}</div>
                      <div className="text-xs text-muted-foreground font-mono">ID RMS: {r.id}</div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={() => handleLink(r.id)}
                        disabled={linking || importing}
                        className="text-xs bg-blue-600 text-white hover:bg-blue-700 px-3 py-1.5 h-auto"
                        title="Collega questo cliente locale al profilo RMS selezionato"
                      >
                        {linking ? <Loader2 className="w-3 h-3 animate-spin" /> : <>
                          <Link2 className="w-3 h-3 mr-1" />Collega
                        </>}
                      </Button>
                      <Button
                        onClick={() => handleImportFromRms(r)}
                        disabled={linking || importing}
                        className="text-xs bg-green-600 text-white hover:bg-green-700 px-3 py-1.5 h-auto"
                        title="Importa come nuovo cliente locale (deduplicazione per email)"
                      >
                        {importing ? <Loader2 className="w-3 h-3 animate-spin" /> : <>
                          <ExternalLink className="w-3 h-3 mr-1" />Importa come nuovo
                        </>}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {c.syncEvents && c.syncEvents.length > 0 && (
        <div className="bg-white border border-border rounded-xl p-5 space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Storico sincronizzazioni
          </h3>
          <div className="space-y-2">
            {c.syncEvents.map((e) => {
              const cfg = EVENT_STATUS_CFG[e.status] ?? { label: e.status, className: "bg-gray-100 text-gray-700" };
              return (
                <div key={e.id} className="flex items-center justify-between text-sm py-2 border-b border-border last:border-0">
                  <div className="flex items-center gap-2">
                    <ArrowUpDown className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="font-medium">{EVENT_TYPE_LABEL[e.eventType] ?? e.eventType}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn("px-2 py-0.5 rounded-full text-xs font-semibold", cfg.className)}>
                      {cfg.label}
                    </span>
                    <span className="text-xs text-muted-foreground">{formatDateTime(e.occurredAt)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function NewCustomerModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", phone: "" });
  const [error, setError] = useState<string | null>(null);

  const { mutate: createCustomer, isPending } = useCreateCustomer({
    mutation: {
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: getListCustomersQueryKey() });
        onClose();
      },
      onError: (err: unknown) => {
        const e = err as { data?: { error?: string } };
        setError(e.data?.error ?? "Errore durante la creazione.");
      },
    },
  });

  const handleSubmit = (ev: React.FormEvent) => {
    ev.preventDefault();
    setError(null);
    createCustomer({ data: { firstName: form.firstName, lastName: form.lastName, email: form.email, phone: form.phone || null } });
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-foreground">Nuovo cliente</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Nome *</label>
              <input type="text" value={form.firstName} onChange={(e) => setForm(p => ({ ...p, firstName: e.target.value }))} required className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" placeholder="Mario" />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Cognome *</label>
              <input type="text" value={form.lastName} onChange={(e) => setForm(p => ({ ...p, lastName: e.target.value }))} required className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" placeholder="Rossi" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">Email *</label>
            <input type="email" value={form.email} onChange={(e) => setForm(p => ({ ...p, email: e.target.value }))} required className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" placeholder="mario@email.it" />
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">Telefono</label>
            <input type="tel" value={form.phone} onChange={(e) => setForm(p => ({ ...p, phone: e.target.value }))} className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" placeholder="+39 333 1234567" />
          </div>
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}
          <div className="flex gap-3 pt-1">
            <Button type="submit" disabled={isPending} className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90">
              {isPending ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Creazione...</> : "Crea cliente"}
            </Button>
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">
              Annulla
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

type Tab = "customers" | "rms-import";

export function CustomersPage() {
  const [activeTab, setActiveTab] = useState<Tab>("customers");
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedQ = useDebounce(searchQuery, 350);
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);

  const queryParams = { ...(debouncedQ ? { q: debouncedQ } : {}), page };
  const { data, isLoading } = useListCustomers(queryParams);

  const customers: CustomerSummary[] = (data as { items?: CustomerSummary[] })?.items ?? [];
  const totalPages: number = (data as { totalPages?: number })?.totalPages ?? 1;
  const total: number = (data as { total?: number })?.total ?? 0;

  const handleSelect = useCallback((id: string) => {
    setSelectedId((prev) => (prev === id ? null : id));
  }, []);

  const handleSearchChange = (v: string) => {
    setSearchQuery(v);
    setPage(1);
  };

  return (
    <div className="flex gap-6 h-full">
      <div className={cn("flex-1 min-w-0 space-y-5 transition-all", selectedId ? "lg:max-w-[55%]" : "")}>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
              <Users className="w-7 h-7 text-primary" />
              Clienti
            </h1>
            <p className="text-muted-foreground mt-1">
              Anagrafica clienti locale con integrazione RivieraTransferRMS.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => setShowNewModal(true)}
              className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Nuovo cliente
            </Button>
          </div>
        </div>

        <div className="flex gap-1 p-1 bg-muted rounded-xl w-fit">
          <button
            onClick={() => setActiveTab("customers")}
            className={cn(
              "px-4 py-2 text-sm font-medium rounded-lg transition-colors",
              activeTab === "customers" ? "bg-white shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Users className="w-4 h-4 inline mr-1.5" />
            Lista clienti {total > 0 && <span className="text-xs text-muted-foreground ml-1">({total})</span>}
          </button>
          <button
            onClick={() => setActiveTab("rms-import")}
            className={cn(
              "px-4 py-2 text-sm font-medium rounded-lg transition-colors",
              activeTab === "rms-import" ? "bg-white shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Download className="w-4 h-4 inline mr-1.5" />
            Importa da RMS
          </button>
        </div>

        {activeTab === "customers" && (
          <>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Cerca per nome o email…"
                className="w-full pl-10 pr-4 py-2.5 border border-border rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 shadow-sm"
              />
              {searchQuery && (
                <button onClick={() => handleSearchChange("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="bg-white border border-border rounded-2xl shadow-sm overflow-hidden">
              {isLoading ? (
                <div className="p-12 text-center text-muted-foreground">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto mb-3 text-primary" />
                  Caricamento clienti…
                </div>
              ) : customers.length === 0 ? (
                <div className="p-12 text-center text-muted-foreground">
                  {debouncedQ ? `Nessun cliente trovato per "${debouncedQ}".` : "Nessun cliente ancora. Creane uno!"}
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {customers.map((c) => {
                    const isSelected = selectedId === c.id;
                    return (
                      <button
                        key={c.id}
                        onClick={() => handleSelect(c.id)}
                        className={cn(
                          "w-full text-left px-5 py-4 flex items-center gap-4 transition-colors hover:bg-muted/30",
                          isSelected && "bg-primary/5 border-l-2 border-primary"
                        )}
                      >
                        <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm flex-shrink-0">
                          {c.firstName[0]}{c.lastName[0]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-foreground">{c.firstName} {c.lastName}</span>
                            <RmsBadge linked={c.rmsLinked} lastSyncAt={c.rmsLastSyncAt} />
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-3">
                            <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{c.email}</span>
                            {c.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{c.phone}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-xs text-muted-foreground">{formatDate(c.createdAt)}</span>
                          <ChevronRight className={cn("w-4 h-4 text-muted-foreground transition-transform", isSelected && "rotate-90")} />
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2">
                <Button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1 || isLoading}
                  className="text-xs px-3 py-1.5 h-auto bg-white border border-border text-foreground hover:bg-muted/30"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-sm text-muted-foreground">
                  Pagina {page} di {totalPages}
                </span>
                <Button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages || isLoading}
                  className="text-xs px-3 py-1.5 h-auto bg-white border border-border text-foreground hover:bg-muted/30"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            )}
          </>
        )}

        {activeTab === "rms-import" && (
          <div className="bg-white border border-border rounded-2xl shadow-sm p-6">
            <div className="flex items-center gap-2 mb-4">
              <Download className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold text-foreground">Importa da RivieraTransferRMS</h2>
            </div>
            <PageLevelRmsSearch onImported={() => setActiveTab("customers")} />
          </div>
        )}
      </div>

      {selectedId && (
        <div className="hidden lg:block w-[420px] flex-shrink-0 bg-white border border-border rounded-2xl shadow-sm p-6 overflow-y-auto max-h-[calc(100vh-8rem)] self-start sticky top-0">
          <CustomerDetailPanel
            customerId={selectedId}
            onClose={() => setSelectedId(null)}
          />
        </div>
      )}

      {selectedId && (
        <div className="fixed inset-0 bg-black/40 z-40 lg:hidden" onClick={() => setSelectedId(null)}>
          <div
            className="absolute right-0 top-0 bottom-0 w-full max-w-md bg-white shadow-xl overflow-y-auto p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <CustomerDetailPanel customerId={selectedId} onClose={() => setSelectedId(null)} />
          </div>
        </div>
      )}

      {showNewModal && <NewCustomerModal onClose={() => setShowNewModal(false)} />}
    </div>
  );
}
