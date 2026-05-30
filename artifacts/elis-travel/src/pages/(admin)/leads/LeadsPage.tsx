import { useState, useRef, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import {
  ChevronDown,
  ChevronRight,
  Mail,
  Phone,
  Clock,
  Globe,
  User,
  MessageSquare,
  ExternalLink,
  Mountain,
  Ticket,
  Send,
  UserPlus,
  CheckCircle2,
  X,
} from "lucide-react";
import {
  useListLeads,
  useUpdateLeadStatus,
  useListLeadNotes,
  useAddLeadNote,
  useConvertLeadToCustomer,
  getListLeadsQueryKey,
  getListLeadNotesQueryKey,
  LeadStatusUpdateStatus,
} from "@workspace/api-client-react";
import type { Lead, LeadNote } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

const STATUS_CONFIG: Record<string, { label: string; className: string; dot: string }> = {
  new: { label: "Nuova", className: "bg-primary/10 text-primary", dot: "bg-primary" },
  contacted: { label: "Contattata", className: "bg-accent/15 text-accent", dot: "bg-accent" },
  quote_sent: { label: "Preventivo inviato", className: "bg-primary/20 text-primary", dot: "bg-primary/70" },
  won: { label: "Vinto", className: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500" },
  lost: { label: "Perso", className: "bg-destructive/10 text-destructive", dot: "bg-destructive/70" },
};

const CHANNEL_LABELS: Record<string, string> = {
  website: "Sito web",
  instagram: "Instagram",
  facebook: "Facebook",
  whatsapp: "WhatsApp",
  email: "Email",
  telefono: "Telefono",
};

const STATUS_ORDER = ["new", "contacted", "quote_sent", "won", "lost"] as const;

function timeAgo(date: string | Date): string {
  const now = Date.now();
  const then = new Date(date).getTime();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return `${diff}s fa`;
  if (diff < 3600) return `${Math.floor(diff / 60)}min fa`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h fa`;
  return `${Math.floor(diff / 86400)}g fa`;
}

function formatDateTime(date: string | Date): string {
  return new Date(date).toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type StatusKey = keyof typeof STATUS_CONFIG;

const FILTER_TABS: { key: "all" | StatusKey; label: string }[] = [
  { key: "all", label: "Tutte" },
  { key: "new", label: "Nuove" },
  { key: "contacted", label: "Contattate" },
  { key: "quote_sent", label: "Preventivo" },
  { key: "won", label: "Vinte" },
  { key: "lost", label: "Perse" },
];

function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

function ConvertToCustomerModal({
  lead,
  onClose,
  onConverted,
}: {
  lead: Lead;
  onClose: () => void;
  onConverted: (customerId: string) => void;
}) {
  const { firstName: defaultFirst, lastName: defaultLast } = splitName(lead.customerName);
  const [firstName, setFirstName] = useState(defaultFirst);
  const [lastName, setLastName] = useState(defaultLast);
  const [email, setEmail] = useState(lead.email ?? "");
  const [phone, setPhone] = useState(lead.phone ?? "");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { mutateAsync, isPending } = useConvertLeadToCustomer();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    try {
      const customer = await mutateAsync({
        id: lead.id,
        data: { firstName: firstName.trim(), lastName: lastName.trim(), email: email.trim(), phone: phone.trim() || null },
      });
      onConverted(customer.id);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setErrorMsg(msg ?? "Errore durante la conversione. Riprova.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-primary" />
            Converti in cliente
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Nome *</label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
                className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Cognome *</label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
                className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">Email *</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">Telefono</label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          {errorMsg && (
            <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{errorMsg}</p>
          )}
          <div className="flex items-center gap-2 pt-1">
            <button
              type="submit"
              disabled={isPending}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-md hover:bg-primary/90 disabled:opacity-60"
            >
              {isPending ? "Creazione..." : "Crea cliente"}
            </button>
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">
              Annulla
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function LeadRow({ lead, defaultExpanded = false }: { lead: Lead; defaultExpanded?: boolean }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [noteText, setNoteText] = useState("");
  const [addingNote, setAddingNote] = useState(false);
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [convertedCustomerId, setConvertedCustomerId] = useState<string | null>(
    lead.customerId ?? null
  );
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (defaultExpanded && rowRef.current) {
      rowRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [defaultExpanded]);

  const { data: notes = [] } = useListLeadNotes(lead.id, {
    query: {
      queryKey: getListLeadNotesQueryKey(lead.id),
      enabled: expanded,
    },
  });

  const { mutate: updateStatus, isPending: updatingStatus } = useUpdateLeadStatus({
    mutation: {
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: getListLeadsQueryKey() });
      },
    },
  });

  const { mutate: addNote, isPending: addingNoteLoading } = useAddLeadNote({
    mutation: {
      onSuccess: () => {
        setNoteText("");
        setAddingNote(false);
        void qc.invalidateQueries({ queryKey: getListLeadNotesQueryKey(lead.id) });
      },
    },
  });

  const handleStatusChange = (status: string) => {
    updateStatus({ id: lead.id, data: { status: status as LeadStatusUpdateStatus } });
  };

  const handleAddNote = () => {
    if (!noteText.trim()) return;
    addNote({ id: lead.id, data: { text: noteText.trim(), authorName: "Staff" } });
  };

  const statusCfg = STATUS_CONFIG[lead.status] ?? STATUS_CONFIG["new"];

  const initials = lead.customerName
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div ref={rowRef} className="border-b border-border last:border-0">
      <button
        className="w-full text-left px-4 md:px-6 py-4 flex items-center gap-4 hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm flex-shrink-0">
          {initials}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-foreground">{lead.customerName}</span>
            {lead.type !== "generic" && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                {lead.type === "offer" ? (
                  <Ticket className="w-3 h-3" />
                ) : (
                  <Mountain className="w-3 h-3" />
                )}
                {lead.type === "offer" ? lead.offerName : lead.excursionName}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Mail className="w-3 h-3" />
              {lead.email}
            </span>
            {lead.phone && (
              <span className="flex items-center gap-1">
                <Phone className="w-3 h-3" />
                {lead.phone}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          <span
            className={cn(
              "hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold",
              statusCfg.className
            )}
          >
            <span className={cn("w-1.5 h-1.5 rounded-full", statusCfg.dot)} />
            {statusCfg.label}
          </span>
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {timeAgo(lead.receivedAt)}
          </span>
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {showConvertModal && (
        <ConvertToCustomerModal
          lead={lead}
          onClose={() => setShowConvertModal(false)}
          onConverted={(customerId) => {
            setConvertedCustomerId(customerId);
            setShowConvertModal(false);
            void qc.invalidateQueries({ queryKey: getListLeadsQueryKey() });
          }}
        />
      )}

      {expanded && (
        <div className="px-4 md:px-6 pb-6 pt-2 bg-muted/10 border-t border-border">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Dettagli richiesta
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-start gap-2">
                  <Clock className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <div>
                    <span className="text-muted-foreground">Ricevuta: </span>
                    <span className="text-foreground">{formatDateTime(lead.receivedAt)}</span>
                    <span className="text-muted-foreground ml-1">({timeAgo(lead.receivedAt)})</span>
                  </div>
                </div>

                {lead.channel && (
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <span className="text-muted-foreground">Canale: </span>
                    <span className="text-foreground">
                      {CHANNEL_LABELS[lead.channel] ?? lead.channel}
                    </span>
                  </div>
                )}

                {lead.lastContactAt && (
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <span className="text-muted-foreground">Ultimo contatto: </span>
                    <span className="text-foreground">{formatDateTime(lead.lastContactAt)}</span>
                  </div>
                )}

                {lead.assignedTo && (
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <span className="text-muted-foreground">Assegnato a: </span>
                    <span className="text-foreground font-medium">{lead.assignedTo}</span>
                  </div>
                )}
              </div>

              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Prodotto richiesto
                </h3>
                {lead.offerId || lead.excursionId ? (
                  <button
                    onClick={() => {
                      if (lead.offerId) navigate(`~/admin/offers/${lead.offerId}`);
                      else if (lead.excursionId) navigate(`~/admin/excursions/${lead.excursionId}`);
                    }}
                    className="inline-flex items-center gap-2 px-3 py-2 bg-white border border-border rounded-lg text-sm font-medium hover:bg-muted/30 transition-colors text-primary"
                  >
                    {lead.offerId ? (
                      <Ticket className="w-4 h-4" />
                    ) : (
                      <Mountain className="w-4 h-4" />
                    )}
                    {lead.offerId ? lead.offerName : lead.excursionName}
                    <ExternalLink className="w-3 h-3 ml-1 text-muted-foreground" />
                  </button>
                ) : (
                  <span className="inline-flex items-center gap-2 px-3 py-2 bg-muted border border-border rounded-lg text-sm text-muted-foreground">
                    <Globe className="w-4 h-4" />
                    Richiesta generica
                  </span>
                )}
              </div>

              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Stato lead
                </h3>
                <select
                  value={lead.status}
                  disabled={updatingStatus}
                  onChange={(e) => handleStatusChange(e.target.value)}
                  className={cn(
                    "px-3 py-2 rounded-lg border border-border text-sm font-medium cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/30",
                    "bg-white disabled:opacity-50 disabled:cursor-not-allowed"
                  )}
                >
                  {STATUS_ORDER.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_CONFIG[s].label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Cliente
                </h3>
                {convertedCustomerId ? (
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Collegato
                    </span>
                    <button
                      onClick={() => navigate(`~/admin/customers`)}
                      className="text-xs text-primary hover:underline font-medium"
                    >
                      Vai ai clienti →
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowConvertModal(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary text-xs font-semibold rounded-lg hover:bg-primary/20 transition-colors"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    Converti in cliente
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Note interne
                {notes.length > 0 && (
                  <span className="ml-1 text-primary">({notes.length})</span>
                )}
              </h3>

              <div className="space-y-3">
                {notes.length === 0 && !addingNote && (
                  <p className="text-sm text-muted-foreground italic">Nessuna nota.</p>
                )}
                {(notes as LeadNote[]).map((note) => (
                  <div key={note.id} className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                    <p className="text-sm text-foreground whitespace-pre-wrap">{note.text}</p>
                    <div className="mt-2 flex items-center gap-2 text-xs text-amber-700">
                      <User className="w-3 h-3" />
                      <span>{note.authorName}</span>
                      <span>·</span>
                      <span>{formatDateTime(note.createdAt)}</span>
                    </div>
                  </div>
                ))}

                {addingNote ? (
                  <div className="space-y-2">
                    <textarea
                      ref={textareaRef}
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      placeholder="Scrivi una nota interna..."
                      rows={3}
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white"
                      autoFocus
                    />
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleAddNote}
                        disabled={!noteText.trim() || addingNoteLoading}
                        className="inline-flex items-center gap-2 px-3 py-1.5 bg-amber-500 text-white rounded-lg text-xs font-semibold hover:bg-amber-600 transition-colors disabled:opacity-50"
                      >
                        <Send className="w-3 h-3" />
                        {addingNoteLoading ? "Salvo..." : "Salva nota"}
                      </button>
                      <button
                        onClick={() => { setAddingNote(false); setNoteText(""); }}
                        className="px-3 py-1.5 text-muted-foreground text-xs hover:text-foreground transition-colors"
                      >
                        Annulla
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setAddingNote(true)}
                    className="inline-flex items-center gap-1.5 text-xs text-amber-700 hover:text-amber-900 font-medium transition-colors"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    Aggiungi nota
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function LeadsPage() {
  const [activeFilter, setActiveFilter] = useState<"all" | StatusKey>("all");
  const { data: leads = [], isLoading } = useListLeads();
  const search = useSearch();
  const searchParams = new URLSearchParams(search);
  const focusedLeadId = searchParams.get("lead");
  const filterOfferId = searchParams.get("offerId");

  const [, navigate] = useLocation();

  const newCount = leads.filter((l) => l.status === "new").length;

  let filtered =
    activeFilter === "all" ? leads : leads.filter((l) => l.status === activeFilter);
  
  if (filterOfferId) {
    filtered = filtered.filter(l => l.offerId === filterOfferId);
  }

  const counts: Record<string, number> = {};
  for (const l of leads) {
    if (!filterOfferId || l.offerId === filterOfferId) {
      counts[l.status] = (counts[l.status] ?? 0) + 1;
    }
  }

  const offerNameFilter = filterOfferId ? leads.find(l => l.offerId === filterOfferId)?.offerName : null;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-foreground">Richieste</h1>
            {newCount > 0 && !filterOfferId && (
              <span className="bg-accent text-white text-xs font-bold px-2.5 py-0.5 rounded-full shadow-sm">
                {newCount} nuove
              </span>
            )}
          </div>
          <p className="text-muted-foreground mt-1">
            Gestisci le richieste dei clienti — inbox operativa dello staff.
          </p>
        </div>
      </div>

      {filterOfferId && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Ticket className="w-4 h-4" />
            <span className="text-sm font-medium">
              Filtro attivo: Offerta <strong className="font-bold">{offerNameFilter || "selezionata"}</strong>
            </span>
          </div>
          <button 
            onClick={() => navigate("~/admin/leads")}
            className="text-xs bg-amber-200/50 hover:bg-amber-200 px-2.5 py-1.5 rounded-md font-semibold transition-colors"
          >
            Rimuovi filtro
          </button>
        </div>
      )}

      <div className="flex gap-2 overflow-x-auto pb-1">
        {FILTER_TABS.map((tab) => {
          const count = tab.key === "all" ? (filterOfferId ? filtered.length : leads.length) : (counts[tab.key] ?? 0);
          const isActive = activeFilter === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveFilter(tab.key)}
              className={cn(
                "inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-white border border-border text-muted-foreground hover:bg-primary/5 hover:border-primary/30"
              )}
            >
              {tab.label}
              {count > 0 && (
                <span
                  className={cn(
                    "text-xs font-bold px-1.5 py-0.5 rounded-full",
                    isActive ? "bg-white/20 text-white" : "bg-muted text-muted-foreground"
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="bg-white border border-border rounded-2xl shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-muted-foreground">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            Caricamento richieste...
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            Nessuna richiesta {activeFilter !== "all" ? `con stato "${STATUS_CONFIG[activeFilter]?.label}"` : ""}.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((lead) => (
              <LeadRow
                key={lead.id}
                lead={lead}
                defaultExpanded={lead.id === focusedLeadId}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
