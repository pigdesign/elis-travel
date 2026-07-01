import { useState, useRef, useEffect, useMemo } from "react";
import { useSearch, useLocation } from "wouter";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { useListPublicCatalog, useListPublicExcursionLocations, useListPublicExcursionMonths } from "@workspace/api-client-react";
import { MapPin, Loader2, ArrowRight, Tag, ChevronDown, Search, X } from "lucide-react";
import { useSeo } from "@/lib/seo";
import { ExcursionCard, ProgrammaModal, MonthCombobox, getExcursionMonth } from "@/components/shared/excursion-catalog";

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
  const tipologia = params.get("tipologia") ?? "";
  const month = params.get("month") ?? "";

  // Tipologie disponibili: ricavate dai tag realmente presenti sulle gite (dedup case-insensitive).
  const availableTipologie = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const ex of excursions) {
      for (const t of (ex.tags ?? [])) {
        const name = (t ?? "").trim();
        if (!name) continue;
        const key = name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        list.push(name);
      }
    }
    return list.sort((a, b) => a.localeCompare(b, "it"));
  }, [excursions]);

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
  function setTipologia(v: string) { setFilter("tipologia", v); }
  function setMonth(v: string) { setFilter("month", v); }

  useSeo({
    title: "Gite ed escursioni",
    description:
      "Gite ed escursioni organizzate da Elis Travel: esperienze in giornata e weekend in compagnia. Trova quella che fa per te.",
    canonicalPath: "/gite",
  });

  const filtered = excursions.filter((ex) => {
    if (location && ex.location !== location) return false;
    if (tipologia && !(ex.tags ?? []).some((t) => t.toLowerCase() === tipologia.toLowerCase())) return false;
    if (month && getExcursionMonth(ex.date) !== month) return false;
    return true;
  });

  const hasFilters = location !== "" || tipologia !== "" || month !== "";

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

            {/* Tipologia — chip dinamici dai tag delle gite */}
            <div className="flex items-center gap-3 px-6 py-5 flex-1">
              <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center shrink-0">
                <Tag className="w-5 h-5 text-accent" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">Tipologia</p>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {[{ value: "", label: "Tutti" }, ...availableTipologie.map((t) => ({ value: t, label: t }))].map((cat) => (
                    <button
                      key={cat.value}
                      onClick={() => setTipologia(cat.value)}
                      className={`px-3 py-1 rounded-full text-xs font-bold transition-all whitespace-nowrap ${
                        tipologia === cat.value
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
