import { useState, useRef, useEffect } from "react";
import { Link, useSearch, useLocation } from "wouter";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { useListPublicCatalog, useListPublicExcursionLocations, useListPublicExcursionMonths, useGetPublicExcursion } from "@workspace/api-client-react";
import type { PublicCatalogExcursionsItem } from "@workspace/api-client-react";
import { MapPin, Loader2, Mountain, CalendarDays, ArrowRight, Tag, ChevronDown, Search, X, Users, CheckCircle2, Clock, AlertCircle, Euro, BookOpen } from "lucide-react";
import { useSeo, buildSlugUrl } from "@/lib/seo";

function formatPrice(value?: string | null): string | null {
  if (!value) return null;
  const n = parseFloat(value);
  if (Number.isNaN(n)) return null;
  return n % 1 === 0 ? `${n.toFixed(0)}` : `${n.toFixed(2)}`;
}

type StatusBadge = {
  label: string;
  icon: React.ReactNode;
  className: string;
};

function getStatusBadge(ex: PublicCatalogExcursionsItem): StatusBadge | null {
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

function isBookable(ex: PublicCatalogExcursionsItem): boolean {
  if (ex.status !== "open" && ex.status !== "confirmed") return false;
  const capacity = ex.currentCapacity ?? 0;
  const adherents = ex.adherentsCount ?? 0;
  if (capacity > 0 && adherents >= capacity) return false;
  return true;
}

function ProgrammaModal({ excursionId, onClose }: { excursionId: string; onClose: () => void }) {
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

function ExcursionCard({ ex, onViewProgram }: { ex: PublicCatalogExcursionsItem; onViewProgram: (id: string) => void }) {
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

function formatDate(value?: string | null) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
}

function formatMonth(yyyyMm: string): string {
  const [year, month] = yyyyMm.split("-");
  const d = new Date(Number(year), Number(month) - 1, 1);
  return d.toLocaleDateString("it-IT", { month: "long", year: "numeric" });
}

function getExcursionMonth(dateStr?: string | null): string | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function LocationCombobox({
  locations,
  value,
  onChange,
}: {
  locations: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  const filtered = query.trim()
    ? locations.filter((l) => l.toLowerCase().includes(query.toLowerCase()))
    : locations;

  function select(loc: string) {
    onChange(loc);
    setOpen(false);
    setQuery("");
  }

  function clear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange("");
    setOpen(false);
    setQuery("");
  }

  return (
    <div ref={containerRef} className="relative md:w-64 shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-6 py-5 text-left hover:bg-muted/30 transition-colors group"
      >
        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-colors ${open ? "bg-primary/20" : "bg-primary/10 group-hover:bg-primary/20"}`}>
          <MapPin className="w-5 h-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-0.5">Località</p>
          <div className="flex items-center gap-1">
            <span className={`text-sm font-bold truncate flex-1 ${value ? "text-foreground" : "text-muted-foreground/60"}`}>
              {value || "Dove vuoi andare?"}
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
        <div className="absolute left-0 top-full mt-2 w-72 bg-white rounded-2xl shadow-2xl border border-border z-50 overflow-hidden">
          <div className="p-3 border-b border-border">
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-muted/50 border border-border focus-within:border-primary focus-within:bg-white transition-colors">
              <Search className="w-4 h-4 text-muted-foreground shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Cerca località…"
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
              />
              {query && (
                <button type="button" onClick={() => setQuery("")} className="shrink-0 text-muted-foreground hover:text-foreground">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

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
              <MapPin className="w-3.5 h-3.5 shrink-0 opacity-50" />
              Tutte le località
            </button>

            {filtered.length === 0 ? (
              <p className="px-4 py-3 text-sm text-muted-foreground text-center">Nessun risultato</p>
            ) : (
              filtered.map((loc) => (
                <button
                  key={loc}
                  type="button"
                  onClick={() => select(loc)}
                  className={`w-full text-left px-4 py-2.5 text-sm transition-colors flex items-center gap-2 ${
                    value === loc
                      ? "bg-primary/10 text-primary font-semibold"
                      : "text-foreground hover:bg-muted/50"
                  }`}
                >
                  <MapPin className="w-3.5 h-3.5 shrink-0 text-primary/60" />
                  {loc}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MonthCombobox({
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

export function ExcursionsPage() {
  const { data, isLoading } = useListPublicCatalog();
  const { data: locations = [] } = useListPublicExcursionLocations();
  const { data: months = [] } = useListPublicExcursionMonths();
  const excursions = data?.excursions ?? [];
  const [programmaId, setProgrammaId] = useState<string | null>(null);

  const search = useSearch();
  const [, navigate] = useLocation();
  const params = new URLSearchParams(search);
  const location = params.get("location") ?? "";
  const category = params.get("category") ?? "";
  const month = params.get("month") ?? "";

  function setFilter(key: string, value: string) {
    const p = new URLSearchParams(search);
    if (value === "") {
      p.delete(key);
    } else {
      p.set(key, value);
    }
    const qs = p.toString();
    navigate(`/gite${qs ? `?${qs}` : ""}`);
  }

  function setLocation(v: string) { setFilter("location", v); }
  function setCategory(v: string) { setFilter("category", v); }
  function setMonth(v: string) { setFilter("month", v); }

  useSeo({
    title: "Gite ed escursioni",
    description:
      "Gite ed escursioni organizzate da Elis Travel: esperienze in giornata e weekend in compagnia. Trova quella che fa per te.",
    canonicalPath: "/gite",
  });

  const filtered = excursions.filter((ex) => {
    if (location && ex.location !== location) return false;
    if (category && (ex as unknown as Record<string, string>)["category"] !== category) return false;
    if (month && getExcursionMonth(ex.date) !== month) return false;
    return true;
  });

  const hasFilters = location !== "" || category !== "" || month !== "";

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <section
        className="relative pt-60 pb-32 text-white overflow-hidden"
        style={{
          backgroundImage: 'url("/images/adventure-bg-elis.webp")',
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
        }}
      >
        <div className="absolute inset-0 bg-[#47474754]" />
        <div className="container relative z-10 mx-auto px-4 md:px-8 text-center">
          <h1 className="text-4xl md:text-5xl font-serif font-bold mb-4">Gite ed escursioni</h1>
          <p className="text-white/80 max-w-2xl mx-auto text-lg">
            Esperienze in giornata e weekend in compagnia. Richiedi info sulla gita che ti incuriosisce.
          </p>
        </div>
      </section>

      {/* Barra filtri */}
      <div className="relative z-30 container mx-auto px-4 md:px-8 -mt-10 mb-12">
        <div className="bg-white rounded-2xl shadow-2xl max-w-5xl mx-auto overflow-visible">
          <div className="flex flex-col md:flex-row md:divide-x divide-border">

            {/* Località — custom combobox */}
            <LocationCombobox
              locations={locations}
              value={location}
              onChange={setLocation}
            />

            {/* Tipologia — category pills */}
            <div className="flex items-center gap-3 px-6 py-5 flex-1">
              <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center shrink-0">
                <Tag className="w-5 h-5 text-accent" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">Tipologia</p>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {[
                    { value: "", label: "Tutti" },
                    { value: "giornata", label: "In giornata" },
                    { value: "weekend", label: "Weekend" },
                    { value: "mare", label: "Mare" },
                    { value: "montagna", label: "Montagna" },
                    { value: "cultura", label: "Cultura" },
                  ].map((cat) => (
                    <button
                      key={cat.value}
                      onClick={() => setCategory(cat.value)}
                      className={`px-3 py-1 rounded-full text-xs font-bold transition-all whitespace-nowrap ${
                        category === cat.value
                          ? "bg-accent text-white shadow shadow-accent/25 scale-105"
                          : "bg-muted text-muted-foreground hover:bg-accent/10 hover:text-accent"
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Periodo — month combobox */}
            <MonthCombobox
              months={months}
              value={month}
              onChange={setMonth}
            />

            {/* Pulsante azzera / cerca */}
            <div className="flex items-center px-4 py-3 md:py-0 bg-muted/20 md:bg-transparent">
              {hasFilters ? (
                <button
                  onClick={() => navigate("/gite")}
                  className="w-full md:w-auto px-5 py-3 rounded-xl bg-muted text-muted-foreground text-sm font-semibold hover:bg-muted/80 transition-colors"
                >
                  Azzera
                </button>
              ) : (
                <div className="w-full md:w-auto px-5 py-3 rounded-xl bg-accent text-white text-sm font-bold flex items-center gap-2 cursor-default select-none">
                  <ArrowRight className="w-4 h-4" />
                  Cerca
                </div>
              )}
            </div>

          </div>
        </div>
      </div>

      {/* Contatore risultati */}
      {hasFilters && !isLoading && (
        <div className="container mx-auto px-4 md:px-8 -mt-6 mb-6 flex justify-center">
          <span className="text-sm font-semibold text-muted-foreground bg-white border border-border rounded-full px-4 py-1.5 shadow-sm">
            {filtered.length === 0
              ? "Nessuna gita trovata"
              : filtered.length === 1
              ? "1 gita trovata"
              : `${filtered.length} gite trovate`}
          </span>
        </div>
      )}

      <section className="py-20">
        <div className="container mx-auto px-4 md:px-8">
          {isLoading ? (
            <div className="flex justify-center py-20 text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground">
              {hasFilters
                ? "Nessuna gita corrisponde ai filtri selezionati."
                : "Nessuna gita in programma al momento. Torna a trovarci presto!"}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
              {filtered.map((ex) => (
                <ExcursionCard key={ex.id} ex={ex} onViewProgram={setProgrammaId} />
              ))}
            </div>
          )}
        </div>
      </section>

      <Footer />

      {programmaId && (
        <ProgrammaModal excursionId={programmaId} onClose={() => setProgrammaId(null)} />
      )}
    </div>
  );
}
