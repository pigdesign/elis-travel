import { Link } from "wouter";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/shared/Button";
import { useListPublicCatalog } from "@workspace/api-client-react";
import { MapPin, Send, Loader2, Mountain, CalendarDays, ArrowRight } from "lucide-react";
import { useSeo, buildSlugUrl } from "@/lib/seo";

function formatDate(value?: string | null) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
}

export function ExcursionsPage() {
  const { data, isLoading } = useListPublicCatalog();
  const excursions = data?.excursions ?? [];
  useSeo({
    title: "Gite ed escursioni",
    description:
      "Gite ed escursioni organizzate da Elis Travel: esperienze in giornata e weekend in compagnia. Trova quella che fa per te.",
    canonicalPath: "/gite",
  });

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
                    <div className="p-6 flex flex-col flex-1">
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
                          data-testid={`button-view-excursion-${ex.id}`}
                        >
                          Vedi dettagli
                          <ArrowRight className="w-4 h-4" />
                        </Button>
                      </Link>
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
