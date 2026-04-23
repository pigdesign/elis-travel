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
} from "lucide-react";
import {
  useListLeads,
  useUpdateLeadStatus,
  useListLeadNotes,
  useAddLeadNote,
  getListLeadsQueryKey,
  getListLeadNotesQueryKey,
  LeadStatusUpdateStatus,
} from "@workspace/api-client-react";
import type { Lead, LeadNote } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

const STATUS_CONFIG: Record<string, { label: string; className: string; dot: string }> = {
  new: { label: "Nuova", className: "bg-blue-100 text-blue-700", dot: "bg-blue-500" },
  contacted: { label: "Contattata", className: "bg-yellow-100 text-yellow-700", dot: "bg-yellow-500" },
  quote_sent: { label: "Preventivo inviato", className: "bg-purple-100 text-purple-700", dot: "bg-purple-500" },
  won: { label: "Vinto", className: "bg-green-100 text-green-700", dot: "bg-green-500" },
  lost: { label: "Perso", className: "bg-red-100 text-red-700", dot: "bg-red-400" },
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

function LeadRow({ lead, defaultExpanded = false }: { lead: Lead; defaultExpanded?: boolean }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [noteText, setNoteText] = useState("");
  const [addingNote, setAddingNote] = useState(false);
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
  const focusedLeadId = new URLSearchParams(search).get("lead");

  const newCount = leads.filter((l) => l.status === "new").length;

  const filtered =
    activeFilter === "all" ? leads : leads.filter((l) => l.status === activeFilter);

  const counts: Record<string, number> = {};
  for (const l of leads) {
    counts[l.status] = (counts[l.status] ?? 0) + 1;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-foreground">Richieste</h1>
            {newCount > 0 && (
              <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                {newCount} nuove
              </span>
            )}
          </div>
          <p className="text-muted-foreground mt-1">
            Gestisci le richieste dei clienti — inbox operativa dello staff.
          </p>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {FILTER_TABS.map((tab) => {
          const count = tab.key === "all" ? leads.length : (counts[tab.key] ?? 0);
          const isActive = activeFilter === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveFilter(tab.key)}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "bg-white border border-border text-muted-foreground hover:bg-muted/30"
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
