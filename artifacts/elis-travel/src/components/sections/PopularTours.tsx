import { useState, useEffect } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { useListPublicCatalog } from "@workspace/api-client-react";
import { ChevronLeft, ChevronRight, ArrowRight, MapPin, Ticket, Star, Clock } from "lucide-react";
import { buildSlugUrl } from "@/lib/seo";
import type { PublicCatalogOffersItem } from "@workspace/api-client-react";

function FeaturedOfferCard({ offer }: { offer: PublicCatalogOffersItem }) {
  return (
    <Link
      href={buildSlugUrl("offerte", offer.id, offer.name)}
      className="block group h-full"
    >
      <div className="bg-white rounded-3xl overflow-hidden shadow-lg hover:shadow-xl transition-shadow duration-300 h-full flex flex-col">
        <div className="relative aspect-[4/3] overflow-hidden bg-gradient-to-br from-primary/20 to-accent/20">
          {offer.coverImageUrl ? (
            <img
              src={offer.coverImageUrl}
              alt={offer.name}
              loading="lazy"
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-accent/40">
              <Ticket className="w-14 h-14" />
            </div>
          )}
          {offer.destination && (
            <div className="absolute top-4 left-4 bg-white/90 backdrop-blur-sm px-3 py-1.5 rounded-full text-sm font-semibold text-primary flex items-center gap-1 shadow-sm">
              <MapPin className="w-4 h-4" />
              {offer.destination}
            </div>
          )}
          <div className="absolute top-4 right-4 flex gap-1.5">
            {offer.featured && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-amber-500 text-white shadow">
                <Star className="w-3 h-3" />
                Evidenza
              </span>
            )}
            {offer.lastMinute && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-red-500 text-white shadow">
                <Clock className="w-3 h-3" />
                Last Minute
              </span>
            )}
          </div>
        </div>
        <div className="p-6 flex flex-col flex-1">
          <h3 className="font-bold text-xl leading-tight line-clamp-2 mb-3 group-hover:text-primary transition-colors">
            {offer.name}
          </h3>
          {offer.category && (
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4 capitalize">
              {offer.category}
            </span>
          )}
          <div className="mt-auto flex items-center justify-between pt-4 border-t border-border">
            {offer.publicPrice != null ? (
              <div>
                <span className="text-xs text-muted-foreground block">Da</span>
                <span className="font-bold text-xl text-primary">
                  {new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(offer.publicPrice)}
                </span>
              </div>
            ) : (
              <span className="text-sm text-muted-foreground">Scopri l&apos;offerta</span>
            )}
            <ArrowRight className="w-5 h-5 text-accent group-hover:translate-x-1 transition-transform" />
          </div>
        </div>
      </div>
    </Link>
  );
}

export function PopularTours() {
  const { data } = useListPublicCatalog();
  const featured = (data?.offers ?? []).filter((o) => o.featured);

  const [visible, setVisible] = useState(3);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    function update() {
      setVisible(mq.matches ? 3 : 1);
      setCurrentIndex(0);
    }
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const maxIndex = Math.max(0, featured.length - visible);
  const canPrev = currentIndex > 0;
  const canNext = currentIndex < maxIndex;

  function prev() {
    setCurrentIndex((i) => Math.max(0, i - 1));
  }
  function next() {
    setCurrentIndex((i) => Math.min(maxIndex, i + 1));
  }

  if (!data || featured.length === 0) return null;

  const trackWidthPct = featured.length > 0 ? (featured.length / visible) * 100 : 100;
  const translatePct = featured.length > 0 ? -(currentIndex * 100) / featured.length : 0;

  return (
    <section className="py-24 bg-muted/30" id="tours">
      <div className="container mx-auto px-4 md:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="flex flex-col items-center text-center mb-16"
        >
          <span className="text-primary font-bold tracking-wider uppercase text-sm mb-4 block">
            Tour in evidenza
          </span>
          <h2 className="brand-title brand-title-primary text-[60px] mb-4">
            Scopri le nostre migliori Offerte
          </h2>
          <p className="text-muted-foreground max-w-xl">
            Itinerari curati con attenzione per la fuga perfetta. Che tu cerchi relax o avventura,
            abbiamo il tour ideale per te.
          </p>
        </motion.div>

        <div className="relative">
          {featured.length > visible && (
            <>
              <button
                onClick={prev}
                disabled={!canPrev}
                className="absolute -left-5 top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full bg-white shadow-lg flex items-center justify-center border border-border transition-all hover:shadow-xl disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="Precedente"
              >
                <ChevronLeft className="w-5 h-5 text-foreground" />
              </button>
              <button
                onClick={next}
                disabled={!canNext}
                className="absolute -right-5 top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full bg-white shadow-lg flex items-center justify-center border border-border transition-all hover:shadow-xl disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="Successiva"
              >
                <ChevronRight className="w-5 h-5 text-foreground" />
              </button>
            </>
          )}

          <div className="overflow-hidden">
            <div
              className="flex transition-transform duration-500 ease-in-out"
              style={{
                width: `${trackWidthPct}%`,
                transform: `translateX(${translatePct}%)`,
              }}
            >
              {featured.map((offer, idx) => (
                <motion.div
                  key={offer.id}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: idx * 0.08, duration: 0.4 }}
                  style={{ width: `${100 / featured.length}%` }}
                  className="px-4"
                >
                  <FeaturedOfferCard offer={offer} />
                </motion.div>
              ))}
            </div>
          </div>

          {featured.length > visible && (
            <div className="flex justify-center gap-2 mt-8">
              {Array.from({ length: maxIndex + 1 }).map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentIndex(i)}
                  className={`w-2.5 h-2.5 rounded-full transition-all ${
                    i === currentIndex ? "bg-accent scale-110" : "bg-muted-foreground/30 hover:bg-muted-foreground/50"
                  }`}
                  aria-label={`Vai alla slide ${i + 1}`}
                />
              ))}
            </div>
          )}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2 }}
          className="text-center mt-14"
        >
          <Link href="/offerte">
            <span className="inline-flex items-center gap-2 px-8 py-4 rounded-full bg-accent text-white font-bold text-base shadow-lg shadow-accent/25 hover:bg-accent/90 hover:shadow-xl transition-all">
              Scopri tutte le offerte
              <ArrowRight className="w-5 h-5" />
            </span>
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
