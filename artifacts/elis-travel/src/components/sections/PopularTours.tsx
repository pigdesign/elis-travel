import { useState, useEffect, useRef, useCallback } from "react";
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

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    function update() {
      setVisible(mq.matches ? 3 : 1);
    }
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const needsCarousel = featured.length > visible;

  // Clone `visible` items on each side for seamless infinite loop
  const extItems = needsCarousel
    ? [...featured.slice(-visible), ...featured, ...featured.slice(0, visible)]
    : featured;

  const startIndex = needsCarousel ? visible : 0;
  const [rawIndex, setRawIndex] = useState(startIndex);
  const rawIndexRef = useRef(startIndex);

  // Sync ref with state so event handlers read fresh value
  rawIndexRef.current = rawIndex;

  // Reset when visible or featured length changes
  useEffect(() => {
    const idx = needsCarousel ? visible : 0;
    rawIndexRef.current = idx;
    setRawIndex(idx);
  }, [visible, featured.length, needsCarousel]);

  const trackRef = useRef<HTMLDivElement>(null);
  const jumping = useRef(false);

  function setIndex(i: number) {
    rawIndexRef.current = i;
    setRawIndex(i);
  }

  const go = useCallback(
    (dir: 1 | -1) => {
      if (jumping.current) return;
      setIndex(rawIndexRef.current + dir);
    },
    [],
  );

  function handleTransitionEnd() {
    if (!needsCarousel) return;
    const cur = rawIndexRef.current;
    let newIndex = cur;

    if (cur >= featured.length + visible) {
      // Slid past end clones → jump to equivalent real position
      newIndex = cur - featured.length;
    } else if (cur < visible) {
      // Slid before start clones → jump to equivalent real position
      newIndex = cur + featured.length;
    }

    if (newIndex !== cur) {
      jumping.current = true;
      if (trackRef.current) trackRef.current.style.transition = "none";
      setIndex(newIndex);
      // Re-enable transition after layout has settled
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (trackRef.current) trackRef.current.style.transition = "";
          jumping.current = false;
        }),
      );
    }
  }

  if (!data || featured.length === 0) return null;

  const N = extItems.length;
  const trackWidthPct = (N / visible) * 100;
  const translatePct = -(rawIndex * 100) / N;

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

        {/* Carousel — arrows are flex siblings, fully external to the card area */}
        <div className="flex items-center gap-4">
          {needsCarousel && (
            <button
              onClick={() => go(-1)}
              className="flex-none w-11 h-11 rounded-full bg-white shadow-md flex items-center justify-center border border-border hover:shadow-lg transition-all shrink-0"
              aria-label="Precedente"
            >
              <ChevronLeft className="w-5 h-5 text-foreground" />
            </button>
          )}

          <div className="overflow-hidden flex-1 min-w-0">
            <div
              ref={trackRef}
              className="flex transition-transform duration-500 ease-in-out"
              style={{
                width: `${trackWidthPct}%`,
                transform: `translateX(${translatePct}%)`,
              }}
              onTransitionEnd={handleTransitionEnd}
            >
              {extItems.map((offer, idx) => (
                <div
                  key={`${offer.id}-${idx}`}
                  style={{ width: `${100 / N}%` }}
                  className="px-3"
                >
                  <FeaturedOfferCard offer={offer} />
                </div>
              ))}
            </div>
          </div>

          {needsCarousel && (
            <button
              onClick={() => go(1)}
              className="flex-none w-11 h-11 rounded-full bg-white shadow-md flex items-center justify-center border border-border hover:shadow-lg transition-all shrink-0"
              aria-label="Successiva"
            >
              <ChevronRight className="w-5 h-5 text-foreground" />
            </button>
          )}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2 }}
          className="text-center mt-14"
        >
          <Link href="/offerte?featured=true">
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
