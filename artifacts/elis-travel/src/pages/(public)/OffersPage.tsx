import { Link } from "wouter";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/shared/Button";
import { useListPublicCatalog } from "@workspace/api-client-react";
import { MapPin, Send, Loader2, Ticket, ArrowRight } from "lucide-react";

export function OffersPage() {
  const { data, isLoading } = useListPublicCatalog();
  const offers = data?.offers ?? [];

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <section className="relative pt-40 pb-20 bg-gradient-to-br from-primary to-primary/80 text-white">
        <div className="container mx-auto px-4 md:px-8 text-center">
          <h1 className="text-4xl md:text-5xl font-serif font-bold mb-4">Offerte viaggio</h1>
          <p className="text-white/80 max-w-2xl mx-auto text-lg">
            Scopri le nostre proposte di viaggio e richiedi informazioni con un click.
          </p>
        </div>
      </section>

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
                  className="bg-white border border-border rounded-2xl p-6 shadow-sm flex flex-col"
                  data-testid={`card-offer-${offer.id}`}
                >
                  <div className="w-12 h-12 rounded-full bg-accent/15 text-accent flex items-center justify-center mb-4">
                    <Ticket className="w-6 h-6" />
                  </div>
                  <Link
                    href={`/offerte/${encodeURIComponent(offer.id)}`}
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
                    <Link href={`/offerte/${encodeURIComponent(offer.id)}`}>
                      <Button
                        variant="outline"
                        className="w-full inline-flex items-center justify-center gap-2"
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
