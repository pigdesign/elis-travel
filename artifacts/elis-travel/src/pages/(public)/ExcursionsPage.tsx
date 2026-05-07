import { useState, useRef, useEffect } from "react";
import { Link, useSearch, useLocation } from "wouter";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/shared/Button";
import { useListPublicCatalog, useListPublicExcursionLocations, useListPublicExcursionMonths } from "@workspace/api-client-react";
import { MapPin, Send, Loader2, Mountain, CalendarDays, ArrowRight, Tag, ChevronDown, Search, X } from "lucide-react";
import { useSeo, buildSlugUrl } from "@/lib/seo";

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
          backgroundImage: 'url("/images/adventure-bg-elis.jpg")',
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
              {filtered.map((ex) => {
                const dateLabel = formatDate(ex.date);
                return (
                  <article
                    key={ex.id}
                    className="bg-white border border-border rounded-2xl shadow-sm flex flex-col overflow-hidden"
                    data-testid={`card-excursion-${ex.id}`}
                  >
                    <Link
                      href={buildSlugUrl("gite", ex.id, ex.name)}
                      className="block aspect-[16/10] bg-gradient-to-br from-primary/20 to-accent/20 overflow-hidden relative"
                      data-testid={`link-excursion-cover-${ex.id}`}
                    >
                      {ex.coverImageUrl ? (
                        <img
                          src={ex.coverImageUrl}
                          alt={ex.name}
                          loading="lazy"
                          className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
                          data-testid={`img-excursion-${ex.id}`}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-accent/50">
                          <Mountain className="w-12 h-12" />
                        </div>
                      )}
                    </Link>
                    <div className="p-6 flex flex-col flex-1 bg-[#f9fafb]">
                      <Link
                        href={buildSlugUrl("gite", ex.id, ex.name)}
                        className="block group"
                        data-testid={`link-excursion-detail-${ex.id}`}
                      >
                        <h2 className="text-xl font-serif font-bold text-foreground mb-2 group-hover:text-primary transition-colors">
                          {ex.name}
                        </h2>
                      </Link>
                      {ex.location && (
                        <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-1">
                          <MapPin className="w-4 h-4" />
                          <span>{ex.location}</span>
                        </div>
                      )}
                      {dateLabel && (
                        <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-4">
                          <CalendarDays className="w-4 h-4" />
                          <span>{dateLabel}</span>
                        </div>
                      )}
                      <div className="mt-auto pt-4 space-y-2">
                        <Link href={buildSlugUrl("gite", ex.id, ex.name)}>
                          <Button
                            variant="outline"
                            className="w-full inline-flex items-center justify-center gap-2"
                            style={{
                              marginTop: "21px",
                              marginBottom: "21px",
                              paddingTop: "15px",
                              paddingBottom: "15px",
                              border: "3px solid #00000026",
                            }}
                            data-testid={`button-view-excursion-${ex.id}`}
                          >
                            Vedi dettagli
                            <ArrowRight className="w-4 h-4" />
                          </Button>
                        </Link>
                        <Link href={`/contatti?excursionId=${encodeURIComponent(ex.id)}`}>
                          <Button
                            className="w-full bg-accent text-accent-foreground hover:bg-accent/90 inline-flex items-center justify-center gap-2 font-bold text-[16px] pt-[15px] pb-[15px]"
                            style={{ borderColor: "#ea812b" }}
                            data-testid={`button-request-info-excursion-${ex.id}`}
                          >
                            <Send className="w-4 h-4" />
                            Richiedi informazioni
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <Footer />
    </div>
  );
}
