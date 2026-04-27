import { Link } from "wouter";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/shared/Button";
import { useListPublicCatalog } from "@workspace/api-client-react";
import { MapPin, Send, Loader2, Ticket, ArrowRight, Tag } from "lucide-react";
import { useSeo, buildSlugUrl } from "@/lib/seo";

export function OffersPage() {
  const { data, isLoading } = useListPublicCatalog();
  const offers = data?.offers ?? [];
  useSeo({
    title: "Offerte viaggio",
    description:
      "Esplora le offerte viaggio di Elis Travel: pacchetti vacanza, voli e soggiorni in Italia e nel mondo. Richiedi informazioni in un click.",
    canonicalPath: "/offerte",
  });

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <section
        className="relative pt-60 pb-32 text-white overflow-hidden"
        style={{
          backgroundImage: 'url("/images/offerte-hero.jpg")',
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
        }}
      >
        <div className="absolute inset-0 bg-[#47474754]" />
        <div className="container relative z-10 mx-auto px-4 md:px-8 text-center">
          <h1 className="text-4xl md:text-5xl font-serif font-bold mb-4">Offerte viaggio</h1>
          <p className="text-white/80 max-w-2xl mx-auto text-lg">
            Scopri le nostre proposte di viaggio e richiedi informazioni con un click.
          </p>
        </div>
      </section>
      {/* Barra filtri */}
      <div className="relative z-30 container mx-auto px-4 md:px-8 -mt-10 mb-12">
        <div className="bg-white rounded-[2rem] shadow-2xl p-5 md:p-6 max-w-5xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-center gap-4">
            {/* Ricerca destinazione */}
            <div className="flex items-center gap-3 flex-1 px-4 py-3 rounded-2xl bg-muted/40 hover:bg-muted/60 transition-colors cursor-pointer">
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                <MapPin className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">Destinazione</p>
                <p className="font-bold text-foreground text-sm">Dove vuoi andare?</p>
              </div>
            </div>

            <div className="hidden md:block w-px h-10 bg-border/60" />

            {/* Categorie */}
            <div className="flex items-center gap-2 flex-wrap">
              {["Tutti", "Italia", "Europa", "Asia", "Africa", "America"].map((cat, i) => (
                <button
                  key={cat}
                  className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors whitespace-nowrap ${
                    i === 0
                      ? "bg-accent text-white shadow-sm shadow-accent/30"
                      : "bg-muted/50 text-foreground/70 hover:bg-primary/10 hover:text-primary"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            <div className="hidden md:block w-px h-10 bg-border/60" />

            {/* Budget */}
            <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-muted/40 hover:bg-muted/60 transition-colors cursor-pointer shrink-0">
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                <Tag className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">Budget</p>
                <p className="font-bold text-foreground text-sm">Qualsiasi</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <section className="py-20">
        <div className="container mx-auto px-4 md:px-8">
          {isLoading ? (
            <div className="flex justify-center py-20 text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : offers.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground">
              Nessuna offerta disponibile al momento. Torna a trovarci presto!
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
              {offers.map((offer) => (
                <article
                  key={offer.id}
                  className="bg-white border border-border rounded-2xl shadow-sm flex flex-col overflow-hidden"
                  data-testid={`card-offer-${offer.id}`}
                >
                  <Link
                    href={buildSlugUrl("offerte", offer.id, offer.name)}
                    className="block aspect-[16/10] bg-gradient-to-br from-primary/20 to-accent/20 overflow-hidden relative"
                    data-testid={`link-offer-cover-${offer.id}`}
                  >
                    {offer.coverImageUrl ? (
                      <img
                        src={offer.coverImageUrl}
                        alt={offer.name}
                        loading="lazy"
                        className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
                        data-testid={`img-offer-${offer.id}`}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-accent/50">
                        <Ticket className="w-12 h-12" />
                      </div>
                    )}
                  </Link>
                  <div className="p-6 flex flex-col flex-1">
                  <Link
                    href={buildSlugUrl("offerte", offer.id, offer.name)}
                    className="block group"
                    data-testid={`link-offer-detail-${offer.id}`}
                  >
                    <h2 className="text-xl font-serif font-bold text-foreground mb-2 group-hover:text-primary transition-colors">
                      {offer.name}
                    </h2>
                  </Link>
                  {offer.destination && (
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-4">
                      <MapPin className="w-4 h-4" />
                      <span>{offer.destination}</span>
                    </div>
                  )}
                  <div className="mt-auto pt-4 space-y-2">
                    <Link href={buildSlugUrl("offerte", offer.id, offer.name)}>
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
                        data-testid={`button-view-offer-${offer.id}`}
                      >
                        Vedi dettagli
                        <ArrowRight className="w-4 h-4" />
                      </Button>
                    </Link>
                    <Link href={`/contatti?offerId=${encodeURIComponent(offer.id)}`}>
                      <Button
                        className="w-full bg-accent text-accent-foreground hover:bg-accent/90 inline-flex items-center justify-center gap-2"
                        data-testid={`button-request-info-offer-${offer.id}`}
                      >
                        <Send className="w-4 h-4" />
                        Richiedi informazioni
                      </Button>
                    </Link>
                  </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
      <Footer />
    </div>
  );
}
