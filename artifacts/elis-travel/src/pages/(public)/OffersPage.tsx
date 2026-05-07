import { useState } from "react";
import { Link } from "wouter";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/shared/Button";
import { useListPublicCatalog, useListPublicOfferDestinations } from "@workspace/api-client-react";
import { MapPin, Send, Loader2, Ticket, ArrowRight, Star, Clock } from "lucide-react";
import { useSeo, buildSlugUrl } from "@/lib/seo";

const CATEGORIES = [
  { value: "", label: "Tutti" },
  { value: "crociera", label: "Crociere" },
  { value: "vacanza", label: "Vacanze" },
];

export function OffersPage() {
  const { data, isLoading } = useListPublicCatalog();
  const { data: destinations = [] } = useListPublicOfferDestinations();
  const offers = data?.offers ?? [];

  const [category, setCategory] = useState("");
  const [destination, setDestination] = useState("");
  const [featured, setFeatured] = useState(false);
  const [lastMinute, setLastMinute] = useState(false);

  useSeo({
    title: "Offerte viaggio",
    description:
      "Esplora le offerte viaggio di Elis Travel: pacchetti vacanza, voli e soggiorni in Italia e nel mondo. Richiedi informazioni in un click.",
    canonicalPath: "/offerte",
  });

  const filtered = offers.filter((o) => {
    if (category && o.category !== category) return false;
    if (destination && o.destination !== destination) return false;
    if (featured && !o.featured) return false;
    if (lastMinute && !o.lastMinute) return false;
    return true;
  });

  const hasFilters = category !== "" || destination !== "" || featured || lastMinute;

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
      <div className="relative z-30 container mx-auto px-4 md:px-8 -mt-8 mb-14">
        <div className="bg-white rounded-2xl shadow-2xl max-w-5xl mx-auto overflow-hidden">
          <div className="flex flex-col md:flex-row md:divide-x divide-border">

            {/* Destinazione */}
            <button
              className="flex items-center gap-3 px-6 py-5 text-left hover:bg-muted/30 transition-colors md:w-64 shrink-0 group"
              onClick={() => {}}
            >
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                <MapPin className="w-5 h-5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-0.5">Destinazione</p>
                <div className="relative">
                  <select
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full bg-transparent text-sm font-bold text-foreground appearance-none cursor-pointer focus:outline-none pr-4 truncate"
                  >
                    <option value="">Dove vuoi andare?</option>
                    {destinations.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
              </div>
            </button>

            {/* Tipologia */}
            <div className="flex items-center gap-3 px-6 py-5 flex-1">
              <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center shrink-0">
                <Ticket className="w-5 h-5 text-accent" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">Tipologia</p>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {CATEGORIES.map((cat) => (
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

            {/* In Evidenza + Last Minute */}
            <div className="flex items-center gap-2 px-6 py-5 shrink-0">
              <button
                onClick={() => setFeatured((v) => !v)}
                className={`inline-flex flex-col items-center gap-1 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  featured
                    ? "bg-amber-50 text-amber-700 ring-2 ring-amber-400"
                    : "text-muted-foreground hover:bg-amber-50 hover:text-amber-700"
                }`}
              >
                <Star className={`w-5 h-5 ${featured ? "fill-amber-400 text-amber-400" : ""}`} />
                In Evidenza
              </button>
              <button
                onClick={() => setLastMinute((v) => !v)}
                className={`inline-flex flex-col items-center gap-1 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  lastMinute
                    ? "bg-red-50 text-red-600 ring-2 ring-red-400"
                    : "text-muted-foreground hover:bg-red-50 hover:text-red-600"
                }`}
              >
                <Clock className={`w-5 h-5 ${lastMinute ? "text-red-500" : ""}`} />
                Last Minute
              </button>
            </div>

            {/* Pulsante cerca / reset */}
            <div className="flex items-center px-4 py-3 md:py-0 bg-muted/20 md:bg-transparent">
              {hasFilters ? (
                <button
                  onClick={() => {
                    setCategory("");
                    setDestination("");
                    setFeatured(false);
                    setLastMinute(false);
                  }}
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

      <section className="py-20">
        <div className="container mx-auto px-4 md:px-8">
          {isLoading ? (
            <div className="flex justify-center py-20 text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground">
              {hasFilters
                ? "Nessuna offerta corrisponde ai filtri selezionati."
                : "Nessuna offerta disponibile al momento. Torna a trovarci presto!"}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
              {filtered.map((offer) => (
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
                    {/* Badges */}
                    <div className="absolute top-3 left-3 flex gap-1.5">
                      {offer.featured && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-amber-500 text-white shadow">
                          <Star className="w-3 h-3" />
                          In Evidenza
                        </span>
                      )}
                      {offer.lastMinute && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-red-500 text-white shadow">
                          <Clock className="w-3 h-3" />
                          Last Minute
                        </span>
                      )}
                    </div>
                    {offer.category && (
                      <span className="absolute top-3 right-3 px-2 py-0.5 rounded-full text-xs font-semibold bg-white/90 text-foreground shadow capitalize">
                        {offer.category === "crociera" ? "Crociera" : offer.category === "vacanza" ? "Vacanza" : offer.category}
                      </span>
                    )}
                  </Link>
                  <div className="p-6 flex flex-col flex-1 bg-[#f9fafb]">
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
                          className="w-full bg-accent text-accent-foreground hover:bg-accent/90 inline-flex items-center justify-center gap-2 font-bold text-[16px] pt-[15px] pb-[15px]"
                          style={{ borderColor: "#ea812b" }}
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
