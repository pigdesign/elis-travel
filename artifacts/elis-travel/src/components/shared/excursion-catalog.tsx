import { useState, useRef, useEffect } from "react";
import { Link } from "wouter";
import { useGetPublicExcursion } from "@workspace/api-client-react";
import type { PublicExcursionCard } from "@workspace/api-client-react";
import { MapPin, Loader2, Mountain, CalendarDays, ArrowRight, Tag, X, Users, CheckCircle2, Clock, AlertCircle, Euro, BookOpen, ChevronDown } from "lucide-react";
import { buildSlugUrl } from "@/lib/seo";

export function formatPrice(value?: string | null): string | null {
  if (!value) return null;
  const n = parseFloat(value);
  if (Number.isNaN(n)) return null;
  return n % 1 === 0 ? `${n.toFixed(0)}` : `${n.toFixed(2)}`;
}

export function formatDate(value?: string | null) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
}

export function formatMonth(yyyyMm: string): string {
  const [year, month] = yyyyMm.split("-");
  const d = new Date(Number(year), Number(month) - 1, 1);
  return d.toLocaleDateString("it-IT", { month: "long", year: "numeric" });
}

export function getExcursionMonth(dateStr?: string | null): string | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

type StatusBadge = {
  label: string;
  icon: React.ReactNode;
  className: string;
};

export function getStatusBadge(ex: PublicExcursionCard): StatusBadge | null {
  const capacity = ex.currentCapacity ?? 0;
  const adherents = ex.adherentsCount ?? 0;
  const threshold = ex.minThreshold ?? 1;
  const remaining = capacity > 0 ? capacity - adherents : null;

  if (ex.status === "confirmed" || (ex.status === "open" && adherents >= threshold)) {
    return {
      label: "Partenza confermata",
      icon: <CheckCircle2 className="w-3 h-3" />,
      className: "bg-emerald-500 text-white",
    };
  }
  if (ex.status === "open" && remaining !== null && remaining <= 5 && remaining > 0) {
    return {
      label: "Ultimi posti",
      icon: <AlertCircle className="w-3 h-3" />,
      className: "bg-accent text-white",
    };
  }
  if (ex.status === "open" && adherents < threshold) {
    return {
      label: "In raccolta adesioni",
      icon: <Clock className="w-3 h-3" />,
      className: "bg-sky-500 text-white",
    };
  }
  return null;
}

export function isBookable(ex: PublicExcursionCard): boolean {
  if (ex.status !== "open" && ex.status !== "confirmed") return false;
  const capacity = ex.currentCapacity ?? 0;
  const adherents = ex.adherentsCount ?? 0;
  if (capacity > 0 && adherents >= capacity) return false;
  return true;
}

export function ProgrammaModal({ excursionId, onClose }: { excursionId: string; onClose: () => void }) {
  const { data: excursion, isLoading } = useGetPublicExcursion(excursionId);
  const detailUrl = excursion ? buildSlugUrl("gite", excursion.id, excursion.name) : "#";

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handleKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const days = excursion?.schedule ?? [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Panel */}
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-5 pb-4 border-b border-border shrink-0">
          <div>
            <p className="text-xs font-semibold text-primary uppercase tracking-wider mb-1">Programma</p>
            <h2 className="text-lg font-serif font-bold text-foreground leading-snug pr-6">
              {excursion?.name ?? "…"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-muted/50 text-muted-foreground shrink-0 -mt-0.5"
            aria-label="Chiudi"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-5 py-4">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : days.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              Il programma dettagliato non è ancora disponibile.<br />
              Contattaci per maggiori informazioni.
            </div>
          ) : (
            <div className="space-y-6">
              {days.map((day) => (
                <div key={day.dayNumber}>
                  {/* Badge giorno + titolo */}
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xs font-bold text-white bg-primary rounded-full px-3 py-1 shrink-0">
                      Giorno {day.dayNumber}
                    </span>
                    {day.title && (
                      <span className="text-sm font-semibold text-foreground">{day.title}</span>
                    )}
                  </div>

                  {/* Immagine giorno */}
                  {(day as { imageUrl?: string }).imageUrl && (
                    <img
                      src={(day as { imageUrl?: string }).imageUrl}
                      alt={day.title ?? `Giorno ${day.dayNumber}`}
                      className="w-full rounded-xl object-cover aspect-[16/7] mb-3"
                      loading="lazy"
                    />
                  )}

                  {/* Attività */}
                  {day.activities.length > 0 && (
                    <ol className="space-y-2 pl-2 border-l-2 border-primary/20 ml-2">
                      {day.activities.map((act, i) => (
                        <li key={i} className="flex gap-3 pl-4 relative">
                          <div className="absolute -left-[9px] top-1.5 w-3.5 h-3.5 rounded-full bg-white border-2 border-primary/40" />
                          {act.time && (
                            <span className="text-xs font-mono text-primary shrink-0 mt-0.5 w-10">{act.time}</span>
                          )}
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-foreground">{act.title}</div>
                            {act.description && (
                              <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{act.description}</div>
                            )}
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-5 py-4 border-t border-border shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl border-2 border-border text-sm font-semibold text-foreground hover:border-muted-foreground transition-colors"
          >
            Chiudi
          </button>
          <Link href={detailUrl} className="flex-1" onClick={onClose}>
            <button
              type="button"
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-accent hover:bg-accent/90 text-white font-bold text-sm transition-colors"
            >
              <Users className="w-4 h-4" />
              Prenota un posto
            </button>
          </Link>
        </div>
      </div>
    </div>
  );
}

export function ExcursionCard({ ex, onViewProgram }: { ex: PublicExcursionCard; onViewProgram: (id: string) => void }) {
  const dateLabel = formatDate(ex.date);
  const price = formatPrice(ex.pricePerPerson);
  const statusBadge = getStatusBadge(ex);
  const bookable = isBookable(ex);
  const capacity = ex.currentCapacity ?? 0;
  const adherents = ex.adherentsCount ?? 0;
  const remaining = capacity > 0 ? capacity - adherents : null;
  const fillPct = capacity > 0 ? Math.min(100, Math.round((adherents / capacity) * 100)) : null;
  const detailUrl = buildSlugUrl("gite", ex.id, ex.name);

  return (
    <article className="bg-white border border-border rounded-2xl shadow-sm flex flex-col overflow-hidden group transition-shadow hover:shadow-md">
      {/* Immagine */}
      <Link
        href={detailUrl}
        className="block relative aspect-[16/10] bg-gradient-to-br from-primary/20 to-accent/20 overflow-hidden shrink-0"
      >
        {ex.coverImageUrl ? (
          <img
            src={ex.coverImageUrl}
            alt={ex.name}
            loading="lazy"
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-accent/40">
            <Mountain className="w-14 h-14" />
          </div>
        )}

        {/* Badge stato — in alto a destra */}
        {statusBadge && (
          <span className={`absolute top-3 right-3 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold shadow ${statusBadge.className}`}>
            {statusBadge.icon}
            {statusBadge.label}
          </span>
        )}

        {/* Badge categoria — in alto a sinistra */}
        <span className="absolute top-3 left-3 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-black/50 text-white backdrop-blur-sm">
          <Mountain className="w-3 h-3" />
          Gita di gruppo
        </span>
      </Link>

      {/* Corpo card */}
      <div className="p-5 flex flex-col flex-1">
        {/* Titolo */}
        <Link href={detailUrl} className="block mb-2">
          <h2 className="text-[17px] font-serif font-bold text-foreground leading-snug group-hover:text-primary transition-colors line-clamp-2">
            {ex.name}
          </h2>
        </Link>

        {/* Info: location + data */}
        <div className="space-y-1.5 mb-4">
          {ex.location && (
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin className="w-3.5 h-3.5 text-accent shrink-0" />
              <span className="truncate">{ex.location}</span>
            </div>
          )}
          {dateLabel && (
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <CalendarDays className="w-3.5 h-3.5 text-accent shrink-0" />
              <span>{dateLabel}</span>
            </div>
          )}
        </div>

        {/* Disponibilità */}
        {capacity > 0 && remaining !== null && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1.5">
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Users className="w-3 h-3" />
                {remaining <= 0
                  ? "Posti esauriti"
                  : remaining <= 5
                  ? <span className="font-semibold text-accent">Ultimi {remaining} {remaining === 1 ? "posto" : "posti"}!</span>
                  : `${remaining} posti disponibili`}
              </span>
              <span className="text-xs text-muted-foreground">{adherents}/{capacity}</span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${fillPct! >= 90 ? "bg-accent" : fillPct! >= 70 ? "bg-amber-400" : "bg-emerald-500"}`}
                style={{ width: `${fillPct}%` }}
              />
            </div>
          </div>
        )}

        {/* Prezzo */}
        {price && (
          <div className="flex items-center gap-1 mb-5">
            <Euro className="w-4 h-4 text-accent" />
            <span className="text-lg font-bold text-foreground">da {price} €</span>
            <span className="text-xs text-muted-foreground">a persona</span>
          </div>
        )}

        {/* CTA */}
        <div className="mt-auto space-y-2">
          <button
            type="button"
            onClick={() => onViewProgram(ex.id)}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border-2 border-border text-sm font-semibold text-foreground hover:border-primary hover:text-primary transition-colors"
          >
            <BookOpen className="w-4 h-4" />
            Vedi programma
          </button>
          {bookable ? (
            <Link href={detailUrl} className="block">
              <button className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-accent hover:bg-accent/90 text-white font-bold text-sm transition-colors shadow-sm shadow-accent/20">
                <Users className="w-4 h-4" />
                Prenota un posto
                <ArrowRight className="w-4 h-4" />
              </button>
            </Link>
          ) : (
            <Link href={`/contatti?excursionId=${encodeURIComponent(ex.id)}`} className="block">
              <button className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-accent hover:bg-accent/90 text-white font-bold text-sm transition-colors shadow-sm shadow-accent/20">
                <Tag className="w-4 h-4" />
                Richiedi informazioni
                <ArrowRight className="w-4 h-4" />
              </button>
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}

/** Restituisce le parti della data per il "blocco calendario": giorno, mese abbreviato, anno. */
function getDateParts(value?: string | null): { day: string; month: string; year: string } | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return {
    day: d.toLocaleDateString("it-IT", { day: "numeric" }),
    month: d.toLocaleDateString("it-IT", { month: "short" }).replace(".", ""),
    year: d.toLocaleDateString("it-IT", { year: "numeric" }),
  };
}

/**
 * Riga orizzontale per l'elenco delle gite Rident.
 * Layout a lista: blocco data prominente a sinistra, info al centro, CTA a destra.
 * Niente immagine né destinazione — sono tutte gite Rident nello stesso luogo.
 */
export function RidentRow({ ex }: { ex: PublicExcursionCard }) {
  const dateParts = getDateParts(ex.date);
  const price = formatPrice(ex.pricePerPerson);
  const statusBadge = getStatusBadge(ex);
  const bookable = isBookable(ex);
  const capacity = ex.currentCapacity ?? 0;
  const adherents = ex.adherentsCount ?? 0;
  const remaining = capacity > 0 ? capacity - adherents : null;
  const detailUrl = buildSlugUrl("gite", ex.id, ex.name);

  // La pagina Rident usa la palette "verdone" dell'hero: rimappa l'azzurro
  // dello stato "In raccolta adesioni" sul verde petrolio, lasciando invariati
  // gli altri stati (confermata = emerald, ultimi posti = accent).
  const badgeClassName = statusBadge?.className.replace(
    "bg-sky-500 text-white",
    "bg-[#0a6a70] text-white",
  );

  return (
    <article className="bg-white border border-border rounded-2xl shadow-sm flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6 p-4 sm:p-5 transition-shadow hover:shadow-md">
      {/* Blocco data — verdone coerente con l'hero */}
      {dateParts && (
        <div className="flex sm:flex-col items-center justify-center gap-2 sm:gap-0 shrink-0 sm:w-24 rounded-xl bg-[#0b4f54]/[0.06] border border-[#0b4f54]/15 px-4 py-3 text-[#0b4f54]">
          <span className="text-3xl sm:text-4xl font-serif font-bold leading-none">{dateParts.day}</span>
          <span className="text-sm font-semibold uppercase tracking-wide sm:mt-1">{dateParts.month}</span>
          <span className="text-xs text-muted-foreground">{dateParts.year}</span>
        </div>
      )}

      {/* Info centrale */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1.5">
          <Link href={detailUrl} className="min-w-0">
            <h2 className="text-lg font-serif font-bold text-foreground leading-snug truncate hover:text-[#0b4f54] transition-colors">
              {ex.name}
            </h2>
          </Link>
          {statusBadge && (
            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold ${badgeClassName}`}>
              {statusBadge.icon}
              {statusBadge.label}
            </span>
          )}
        </div>

        <div className="flex items-center gap-x-5 gap-y-1 flex-wrap text-sm">
          {capacity > 0 && remaining !== null && (
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Users className="w-4 h-4 text-accent shrink-0" />
              {remaining <= 0
                ? "Posti esauriti"
                : remaining <= 5
                ? <span className="font-semibold text-accent">Ultimi {remaining} {remaining === 1 ? "posto" : "posti"}!</span>
                : `${remaining} posti disponibili`}
            </span>
          )}
          {price && (
            <span className="flex items-center gap-1.5 text-foreground">
              <Euro className="w-4 h-4 text-accent shrink-0" />
              <span className="font-bold">da {price} €</span>
              <span className="text-xs text-muted-foreground">a persona</span>
            </span>
          )}
        </div>
      </div>

      {/* CTA */}
      <div className="flex items-center gap-2 shrink-0 sm:justify-end">
        {bookable ? (
          <Link href={detailUrl}>
            <button className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#0a6a70] hover:bg-[#084f54] text-white font-bold text-sm transition-colors shadow-sm shadow-[#0b4f54]/20 whitespace-nowrap">
              <Users className="w-4 h-4" />
              Prenota un posto
              <ArrowRight className="w-4 h-4" />
            </button>
          </Link>
        ) : (
          <Link href={`/contatti?excursionId=${encodeURIComponent(ex.id)}`}>
            <button className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#0a6a70] hover:bg-[#084f54] text-white font-bold text-sm transition-colors shadow-sm shadow-[#0b4f54]/20 whitespace-nowrap">
              <Tag className="w-4 h-4" />
              Richiedi informazioni
              <ArrowRight className="w-4 h-4" />
            </button>
          </Link>
        )}
      </div>
    </article>
  );
}

export function MonthCombobox({
  months,
  value,
  onChange,
}: {
  months: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  function select(m: string) {
    onChange(m);
    setOpen(false);
  }

  function clear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange("");
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative md:w-56 shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-6 py-5 text-left hover:bg-muted/30 transition-colors group"
      >
        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-colors ${open ? "bg-primary/20" : "bg-primary/10 group-hover:bg-primary/20"}`}>
          <CalendarDays className="w-5 h-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-0.5">Periodo</p>
          <div className="flex items-center gap-1">
            <span className={`text-sm font-bold truncate flex-1 ${value ? "text-foreground" : "text-muted-foreground/60"}`}>
              {value ? formatMonth(value) : "Quando vuoi partire?"}
            </span>
            {value ? (
              <X
                className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground shrink-0"
                onClick={clear}
              />
            ) : (
              <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
            )}
          </div>
        </div>
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-2 w-64 bg-white rounded-2xl shadow-2xl border border-border z-50 overflow-hidden">
          <div className="max-h-56 overflow-y-auto py-1.5">
            <button
              type="button"
              onClick={() => select("")}
              className={`w-full text-left px-4 py-2.5 text-sm transition-colors flex items-center gap-2 ${
                value === ""
                  ? "bg-primary/10 text-primary font-semibold"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              }`}
            >
              <CalendarDays className="w-3.5 h-3.5 shrink-0 opacity-50" />
              Tutti i mesi
            </button>

            {months.length === 0 ? (
              <p className="px-4 py-3 text-sm text-muted-foreground text-center">Nessun mese disponibile</p>
            ) : (
              months.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => select(m)}
                  className={`w-full text-left px-4 py-2.5 text-sm transition-colors flex items-center gap-2 capitalize ${
                    value === m
                      ? "bg-primary/10 text-primary font-semibold"
                      : "text-foreground hover:bg-muted/50"
                  }`}
                >
                  <CalendarDays className="w-3.5 h-3.5 shrink-0 text-primary/60" />
                  {formatMonth(m)}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
