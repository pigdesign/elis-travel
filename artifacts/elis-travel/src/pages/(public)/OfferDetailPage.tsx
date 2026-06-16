import { Link } from "wouter";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/shared/Button";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useGetPublicOffer } from "@workspace/api-client-react";
import { useSeo, extractIdFromSlug, buildSlugUrl, truncate } from "@/lib/seo";
import {
  MapPin,
  Send,
  Loader2,
  ArrowLeft,
  Calendar,
  Clock,
  Plane,
  Tag,
  Building2,
  CheckCircle2,
  XCircle,
  Sparkles,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

interface GalleryImage {
  id: string;
  imageUrl: string;
  sortOrder: number;
}

function OfferGalleryCarousel({ images }: { images: GalleryImage[] }) {
  const [current, setCurrent] = useState(0);

  if (images.length === 0) return null;

  const prev = () => setCurrent((i) => (i === 0 ? images.length - 1 : i - 1));
  const next = () => setCurrent((i) => (i === images.length - 1 ? 0 : i + 1));

  return (
    <div className="rounded-[30px] border border-slate-200/70 bg-white p-4 shadow-[0_18px_50px_rgba(20,36,43,0.08)] md:p-6">
      <div className="relative rounded-[22px] overflow-hidden bg-black aspect-[16/9]">
        <img
          key={images[current].id}
          src={images[current].imageUrl}
          alt={`Foto ${current + 1}`}
          className="w-full h-full object-cover transition-opacity duration-300"
        />

        {images.length > 1 && (
          <>
            <button
              onClick={prev}
              className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-colors"
              aria-label="Foto precedente"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={next}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-colors"
              aria-label="Foto successiva"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
              {images.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrent(i)}
                  className={`w-2 h-2 rounded-full transition-colors ${i === current ? "bg-white" : "bg-white/40"}`}
                  aria-label={`Vai alla foto ${i + 1}`}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {images.length > 1 && (
        <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
          {images.map((img, i) => (
            <button
              key={img.id}
              onClick={() => setCurrent(i)}
              className={`flex-none w-16 h-12 rounded-xl overflow-hidden border-2 transition-colors ${i === current ? "border-accent" : "border-transparent opacity-60 hover:opacity-100"}`}
            >
              <img src={img.imageUrl} alt={`Miniatura ${i + 1}`} className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface OfferDetailPageProps {
  offerIdOrSlug: string;
}

function formatDate(value?: string | null) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
}

function formatPrice(value?: string | null) {
  if (!value) return null;
  const n = Number(value);
  if (Number.isNaN(n)) return null;
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: n % 1 === 0 ? 0 : 2,
  }).format(n);
}

function MultilineText({ text }: { text: string }) {
  return (
    <div className="text-foreground/80 leading-relaxed whitespace-pre-line">{text}</div>
  );
}

export function OfferDetailPage({ offerIdOrSlug }: OfferDetailPageProps) {
  const offerId = extractIdFromSlug(offerIdOrSlug);
  const { data: rawOffer, isLoading, isError } = useGetPublicOffer(offerId);
  const offer = rawOffer as (typeof rawOffer & { images?: GalleryImage[] }) | undefined;
  const galleryImages = offer?.images ?? [];
  const [, setLocation] = useLocation();

  const seoTitle = offer?.name
    ? `${offer.name}${offer.destination ? ` — ${offer.destination}` : ""}`
    : isError
      ? "Offerta non trovata"
      : "Offerta viaggio";
  const seoDescription = offer
    ? truncate(
        offer.advertisingText ||
          offer.highlights ||
          [offer.name, offer.destination, offer.period]
            .filter(Boolean)
            .join(" — ") ||
          "Scopri questa offerta viaggio di Elis Travel.",
      )
    : "Dettagli offerta viaggio Elis Travel.";

  useSeo({
    title: seoTitle,
    description: seoDescription,
    type: "product",
    canonicalPath: offer ? buildSlugUrl("offerte", offer.id, offer.name) : undefined,
    noindex: !offer,
  });

  useEffect(() => {
    if (!offer) return;
    const expected = buildSlugUrl("offerte", offer.id, offer.name);
    const current = `/offerte/${offerIdOrSlug}`;
    if (current !== expected) {
      setLocation(expected, { replace: true });
    }
  }, [offer, offerIdOrSlug, setLocation]);

  const validFromLabel = formatDate(offer?.validFrom);
  const validToLabel = formatDate(offer?.validTo);
  const priceLabel = formatPrice(offer?.publicPrice);

  const durationLabel = (() => {
    if (!offer) return null;
    const days = offer.durationDays;
    const nights = offer.durationNights;
    if (!days && !nights) return null;
    const parts: string[] = [];
    if (days) parts.push(`${days} ${days === 1 ? "giorno" : "giorni"}`);
    if (nights) parts.push(`${nights} ${nights === 1 ? "notte" : "notti"}`);
    return parts.join(" / ");
  })();

  const heroBadgeLabel = durationLabel ? durationLabel.toUpperCase() : "OFFERTA VIAGGIO";

  const heroDescription = offer
    ? truncate(
        offer.advertisingText?.replace(/\s+/g, " ") ??
          [offer.destination ? `Destinazione: ${offer.destination}` : null, offer.period]
            .filter(Boolean)
            .join(" — ") ??
          "Un'esperienza di viaggio organizzata da Elis Travel.",
        180,
      )
    : "";

  // Card shown in hero (price + CTA only)
  const heroPriceCard = offer ? (
    <div className="rounded-[28px] border border-white/70 bg-white p-6 shadow-[0_18px_55px_rgba(20,36,43,0.16)] md:p-8">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#6d7e85]">
        A partire da
      </div>
      {priceLabel ? (
        <>
          <div
            className="mt-3 text-4xl font-serif font-bold leading-none text-accent md:text-5xl"
            data-testid="text-offer-price"
          >
            {priceLabel}
          </div>
          <div className="mt-2 text-sm text-muted-foreground">
            a persona, salvo disponibilità
          </div>
        </>
      ) : (
        <div className="mt-3 text-base font-medium text-foreground">
          Quota su richiesta
        </div>
      )}

      <div className="my-5 h-px bg-slate-200" />

      <Link href={`/contatti?offerId=${encodeURIComponent(offer.id)}`}>
        <Button
          className="w-full bg-accent text-accent-foreground hover:bg-accent/90 inline-flex items-center justify-center gap-2 rounded-full"
          data-testid="button-request-info"
        >
          <Send className="w-4 h-4" />
          Richiedi informazioni
        </Button>
      </Link>

      {offer.publicLink && (
        <a
          href={offer.publicLink}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 text-sm text-primary hover:underline inline-flex items-center gap-1.5 justify-center w-full"
          data-testid="link-public-offer"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Scheda completa
        </a>
      )}
    </div>
  ) : null;

  // Sidebar card with trip details (desktop content section)
  const detailsCard = offer ? (
    <div className="rounded-[28px] border border-slate-200/70 bg-white p-6 shadow-[0_18px_50px_rgba(20,36,43,0.08)]">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#6d7e85] mb-4">
        Dettagli viaggio
      </div>
      <ul className="space-y-4 text-sm">
        {durationLabel && (
          <li className="flex items-start gap-3">
            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div>
              <div className="text-xs text-muted-foreground">Durata</div>
              <div className="font-semibold text-foreground">{durationLabel}</div>
            </div>
          </li>
        )}
        {offer.period && (
          <li className="flex items-start gap-3">
            <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div>
              <div className="text-xs text-muted-foreground">Periodo</div>
              <div className="font-semibold text-foreground">{offer.period}</div>
            </div>
          </li>
        )}
        {(validFromLabel || validToLabel) && (
          <li className="flex items-start gap-3">
            <Tag className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div>
              <div className="text-xs text-muted-foreground">Validità</div>
              <div className="font-semibold text-foreground">
                {validFromLabel ?? "—"}
                {validToLabel ? ` → ${validToLabel}` : ""}
              </div>
            </div>
          </li>
        )}
        {offer.departureCity && (
          <li className="flex items-start gap-3">
            <Plane className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div>
              <div className="text-xs text-muted-foreground">Partenza da</div>
              <div className="font-semibold text-foreground">{offer.departureCity}</div>
            </div>
          </li>
        )}
        {offer.baseFormula && (
          <li className="flex items-start gap-3">
            <Tag className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div>
              <div className="text-xs text-muted-foreground">Formula</div>
              <div className="font-semibold text-foreground">{offer.baseFormula}</div>
            </div>
          </li>
        )}
        {offer.tourOperator && (
          <li className="flex items-start gap-3">
            <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div>
              <div className="text-xs text-muted-foreground">Tour operator</div>
              <div className="font-semibold text-foreground">{offer.tourOperator}</div>
            </div>
          </li>
        )}
      </ul>
    </div>
  ) : null;

  return (
    <div className="min-h-screen bg-[#f7faf9]">
      <Header />

      {isLoading ? (
        <div className="pt-40 pb-20 flex justify-center text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : isError || !offer ? (
        <section className="pt-40 pb-20">
          <div className="container mx-auto px-4 md:px-8 text-center max-w-xl">
            <h1 className="text-3xl font-serif font-bold text-foreground mb-3">
              Offerta non trovata
            </h1>
            <p className="text-muted-foreground mb-8">
              Questa offerta non è più disponibile o è stata rimossa.
            </p>
            <Link href="/offerte">
              <Button className="inline-flex items-center gap-2">
                <ArrowLeft className="w-4 h-4" />
                Torna alle offerte
              </Button>
            </Link>
          </div>
        </section>
      ) : (
        <>
          {/* Hero */}
          <section className="relative overflow-hidden bg-[#f7faf9] pt-32 text-white md:pt-40 lg:pb-16">
            <div className="absolute inset-0">
              {offer.coverImageUrl ? (
                <img
                  src={offer.coverImageUrl}
                  alt={offer.name}
                  className="h-full w-full object-cover"
                  data-testid="img-offer-cover"
                />
              ) : (
                <div className="h-full w-full bg-gradient-to-br from-[#0b4f54] via-[#007f86] to-[#2bb7c6]" />
              )}
            </div>
            <div className="absolute inset-0 bg-[linear-gradient(110deg,rgba(8,34,39,0.92)_0%,rgba(0,111,115,0.70)_46%,rgba(0,111,115,0.34)_100%)]" />
            <div className="absolute inset-x-0 bottom-[-1px] z-10 overflow-hidden leading-none">
              <svg
                viewBox="0 0 1440 270"
                preserveAspectRatio="none"
                className="h-[220px] w-full md:h-[270px] lg:h-[330px]"
                aria-hidden="true"
              >
                <path
                  d="M0,120 C220,244 432,238 654,198 C894,154 1077,74 1220,54 C1312,42 1388,50 1440,78 L1440,270 L0,270 Z"
                  fill="#f7faf9"
                />
              </svg>
            </div>

            <div className="relative container mx-auto max-w-6xl px-4 md:px-8">
              <div className="relative grid items-start gap-10 lg:grid-cols-[minmax(0,1.55fr)_minmax(290px,0.85fr)] lg:pb-24">
                <div className="max-w-3xl pb-24 md:pb-28 lg:pb-36">
                  <Link
                    href="/offerte"
                    className="mb-6 inline-flex items-center gap-1.5 text-sm text-white/80 transition-colors hover:text-white"
                    data-testid="link-back-to-offers"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Torna alle offerte
                  </Link>

                  <div className="mb-5 inline-flex items-center rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#dff7f9] backdrop-blur-sm">
                    {heroBadgeLabel}
                  </div>

                  <h1
                    className="max-w-2xl text-4xl font-serif font-bold leading-[0.95] tracking-[-0.03em] md:text-6xl lg:text-7xl"
                    data-testid="text-offer-name"
                  >
                    {offer.name}
                  </h1>

                  <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3 text-sm text-white/92 md:text-base">
                    {offer.destination && (
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-[#dff7f9]" />
                        <span data-testid="text-offer-destination">{offer.destination}</span>
                      </div>
                    )}
                    {offer.period && (
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-[#dff7f9]" />
                        <span>{offer.period}</span>
                      </div>
                    )}
                  </div>

                  {heroDescription && (
                    <p className="mt-5 max-w-2xl text-sm leading-relaxed text-white/84 md:text-base">
                      {heroDescription}
                    </p>
                  )}
                </div>

                {/* Price card — desktop, floats into content below */}
                <div className="relative z-20 hidden self-end lg:block lg:translate-y-24">
                  {heroPriceCard}
                </div>
              </div>
            </div>
          </section>

          {/* Price card — mobile only */}
          <section className="relative z-20 pb-6 pt-2 md:pt-4 lg:hidden">
            <div className="container mx-auto max-w-6xl px-4 md:px-8">
              <div className="mx-auto max-w-xl">
                {heroPriceCard}
              </div>
              {/* Trip details on mobile */}
              {detailsCard && (
                <div className="mx-auto max-w-xl mt-6">
                  {detailsCard}
                </div>
              )}
            </div>
          </section>

          {/* Main content */}
          <section className="pb-20 md:pb-24">
            <div className="container mx-auto max-w-6xl px-4 md:px-8">
              <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1.55fr)_minmax(290px,0.85fr)]">
                <div className="space-y-8">
                  {galleryImages.length > 0 && (
                    <OfferGalleryCarousel images={galleryImages} />
                  )}

                  {offer.advertisingText && (
                    <div className="rounded-[30px] border border-slate-200/70 bg-white p-6 shadow-[0_18px_50px_rgba(20,36,43,0.08)] md:p-8">
                      <h2 className="text-xl font-serif font-bold text-foreground mb-3">
                        Descrizione
                      </h2>
                      <MultilineText text={offer.advertisingText} />
                    </div>
                  )}

                  {offer.highlights && (
                    <div className="rounded-[30px] border border-slate-200/70 bg-white p-6 shadow-[0_18px_50px_rgba(20,36,43,0.08)] md:p-8">
                      <h2 className="text-xl font-serif font-bold text-foreground mb-3 flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-accent" />
                        Punti forti
                      </h2>
                      <MultilineText text={offer.highlights} />
                    </div>
                  )}

                  {(offer.servicesIncluded || offer.servicesExcluded) && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {offer.servicesIncluded && (
                        <div className="rounded-[28px] border border-slate-200/70 bg-white p-6 shadow-[0_18px_50px_rgba(20,36,43,0.08)]">
                          <h3 className="text-lg font-serif font-bold text-foreground mb-3 flex items-center gap-2">
                            <CheckCircle2 className="w-5 h-5 text-green-600" />
                            Cosa è incluso
                          </h3>
                          <MultilineText text={offer.servicesIncluded} />
                        </div>
                      )}
                      {offer.servicesExcluded && (
                        <div className="rounded-[28px] border border-slate-200/70 bg-white p-6 shadow-[0_18px_50px_rgba(20,36,43,0.08)]">
                          <h3 className="text-lg font-serif font-bold text-foreground mb-3 flex items-center gap-2">
                            <XCircle className="w-5 h-5 text-red-500" />
                            Cosa non è incluso
                          </h3>
                          <MultilineText text={offer.servicesExcluded} />
                        </div>
                      )}
                    </div>
                  )}

                  {!offer.advertisingText &&
                    !offer.highlights &&
                    !offer.servicesIncluded &&
                    !offer.servicesExcluded &&
                    galleryImages.length === 0 && (
                      <div className="rounded-[30px] border border-slate-200/70 bg-white p-8 shadow-[0_18px_50px_rgba(20,36,43,0.08)] text-center text-muted-foreground">
                        Per maggiori dettagli su questa offerta, contattaci tramite il pulsante qui a fianco.
                      </div>
                    )}
                </div>

                {/* Sidebar desktop — trip details */}
                <aside className="hidden lg:block lg:sticky lg:top-24 lg:self-start space-y-6">
                  {detailsCard}
                </aside>
              </div>
            </div>
          </section>
        </>
      )}

      <Footer />
    </div>
  );
}
