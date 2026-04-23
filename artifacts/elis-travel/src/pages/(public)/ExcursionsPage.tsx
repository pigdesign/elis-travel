import { Link } from "wouter";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/shared/Button";
import { useListPublicCatalog } from "@workspace/api-client-react";
import { MapPin, Send, Loader2, Mountain, CalendarDays } from "lucide-react";

function formatDate(value?: string | null) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
}

export function ExcursionsPage() {
  const { data, isLoading } = useListPublicCatalog();
  const excursions = data?.excursions ?? [];

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <section className="relative pt-40 pb-20 bg-gradient-to-br from-primary to-primary/80 text-white">
        <div className="container mx-auto px-4 md:px-8 text-center">
          <h1 className="text-4xl md:text-5xl font-serif font-bold mb-4">Gite ed escursioni</h1>
          <p className="text-white/80 max-w-2xl mx-auto text-lg">
            Esperienze in giornata e weekend in compagnia. Richiedi info sulla gita che ti incuriosisce.
          </p>
        </div>
      </section>

      <section className="py-20">
        <div className="container mx-auto px-4 md:px-8">
          {isLoading ? (
            <div className="flex justify-center py-20 text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : excursions.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground">
              Nessuna gita in programma al momento. Torna a trovarci presto!
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
              {excursions.map((ex) => {
                const dateLabel = formatDate(ex.date);
                return (
                  <article
                    key={ex.id}
                    className="bg-white border border-border rounded-2xl p-6 shadow-sm flex flex-col"
                    data-testid={`card-excursion-${ex.id}`}
                  >
                    <div className="w-12 h-12 rounded-full bg-accent/15 text-accent flex items-center justify-center mb-4">
                      <Mountain className="w-6 h-6" />
                    </div>
                    <h2 className="text-xl font-serif font-bold text-foreground mb-2">
                      {ex.name}
                    </h2>
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
                    <div className="mt-auto pt-4">
                      <Link href={`/contatti?excursionId=${encodeURIComponent(ex.id)}`}>
                        <Button
                          className="w-full bg-accent text-accent-foreground hover:bg-accent/90 inline-flex items-center justify-center gap-2"
                          data-testid={`button-request-info-excursion-${ex.id}`}
                        >
                          <Send className="w-4 h-4" />
                          Richiedi informazioni
                        </Button>
                      </Link>
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
