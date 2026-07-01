import { useState, useMemo } from "react";
import { useSearch, useLocation } from "wouter";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { useListPublicRident } from "@workspace/api-client-react";
import { Loader2 } from "lucide-react";
import { useSeo } from "@/lib/seo";
import { ExcursionCard, ProgrammaModal, MonthCombobox, getExcursionMonth } from "@/components/shared/excursion-catalog";

export function RidentPage() {
  const { data, isLoading } = useListPublicRident();
  const excursions = data?.excursions ?? [];
  const [programmaId, setProgrammaId] = useState<string | null>(null);

  const search = useSearch();
  const [, navigate] = useLocation();
  const params = new URLSearchParams(search);
  const month = params.get("month") ?? "";

  // Mesi disponibili: ricavati dalle date delle gite Rident caricate (dedup + ordinati).
  const months = useMemo(() => {
    const set = new Set<string>();
    for (const ex of excursions) {
      const m = getExcursionMonth(ex.date);
      if (m) set.add(m);
    }
    return Array.from(set).sort();
  }, [excursions]);

  function setMonth(v: string) {
    const p = new URLSearchParams(search);
    if (v === "") p.delete("month");
    else p.set("month", v);
    const qs = p.toString();
    navigate(`/rident${qs ? `?${qs}` : ""}`);
  }

  // Pagina riservata: mai indicizzata dai motori di ricerca.
  useSeo({
    title: "Gite Rident",
    description: "Le gite riservate Rident di Elis Travel.",
    canonicalPath: "/rident",
    noindex: true,
  });

  const filtered = excursions.filter((ex) => {
    if (month && getExcursionMonth(ex.date) !== month) return false;
    return true;
  });

  const hasFilters = month !== "";

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <section className="relative pt-60 pb-32 text-white overflow-hidden bg-gradient-to-br from-[#0b4f54] via-[#007f86] to-[#2bb7c6]">
        <div className="container relative z-10 mx-auto px-4 md:px-8 text-center">
          <h1 className="text-4xl md:text-5xl font-serif font-bold mb-4">Gite Rident</h1>
          <p className="text-white/80 max-w-2xl mx-auto text-lg">
            Le gite riservate Rident. Scegli quella che ti interessa e prenota il tuo posto.
          </p>
        </div>
      </section>

      {/* Barra filtro — solo Periodo */}
      <div className="relative z-30 container mx-auto px-4 md:px-8 -mt-10 mb-12 flex justify-center">
        <div className="bg-white rounded-2xl shadow-2xl overflow-visible inline-flex items-stretch divide-x divide-border">
          <MonthCombobox
            months={months}
            value={month}
            onChange={setMonth}
          />
          {hasFilters && (
            <div className="flex items-center px-4">
              <button
                onClick={() => navigate("/rident")}
                className="px-5 py-3 rounded-xl bg-muted text-muted-foreground text-sm font-semibold hover:bg-muted/80 transition-colors"
              >
                Azzera
              </button>
            </div>
          )}
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
                ? "Nessuna gita corrisponde al periodo selezionato."
                : "Nessuna gita Rident in programma al momento."}
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
