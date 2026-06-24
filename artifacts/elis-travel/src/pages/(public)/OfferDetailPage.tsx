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
    <section className="py-8 bg-muted/20">
      <div className="container mx-auto px-4 md:px-8 max-w-5xl">
        <div className="relative rounded-2xl overflow-hidden bg-black aspect-[16/9] shadow-md">
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
                className={`flex-none w-16 h-12 rounded-lg overflow-hidden border-2 transition-colors ${i === current ? "border-primary" : "border-transparent opacity-60 hover:opacity-100"}`}
              >
                <img src={img.imageUrl} alt={`Miniatura ${i + 1}`} className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
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

  return (
    <div className="min-h-screen bg-background">
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
          <section className="relative pt-40 pb-16 bg-gradient-to-br from-primary to-primary/80 text-white overflow-hidden">
            {offer.coverImageUrl && (
              <>
                <div className="absolute inset-0">
                  <img
                    src={offer.coverImageUrl}
                    alt={offer.name}
                    className="w-full h-full object-cover"
                    data-testid="img-offer-cover"
                  />
                </div>
                <div className="absolute inset-0 bg-gradient-to-br from-primary/85 to-primary/70" />
              </>
            )}
            <div className="relative container mx-auto px-4 md:px-8 max-w-5xl">
              <Link
                href="/offerte"
                className="inline-flex items-center gap-1.5 text-white/80 hover:text-white text-sm mb-6"
                data-testid="link-back-to-offers"
              >
                <ArrowLeft className="w-4 h-4" />
                Torna alle offerte
              </Link>
              <h1
                className="text-4xl md:text-5xl font-serif font-bold mb-4"
                data-testid="text-offer-name"
              >
                {offer.name}
              </h1>
              {offer.destination && (
                <div className="flex items-center gap-2 text-white/90 text-lg">
                  <MapPin className="w-5 h-5" />
                  <span data-testid="text-offer-destination">{offer.destination}</span>
                </div>
              )}
            </div>
          </section>

          {galleryImages.length > 0 && (
            <OfferGalleryCarousel images={galleryImages} />
          )}

          <section className="py-12 md:py-16">
            <div className="container mx-auto px-4 md:px-8 max-w-5xl">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-8">
                  {offer.advertisingText && (
                    <div className="bg-white border border-border rounded-2xl p-6 md:p-8 shadow-sm">
                      <h2 className="text-xl font-serif font-bold text-foreground mb-3">
                        Descrizione
                      </h2>
                      <MultilineText text={offer.advertisingText} />
                    </div>
                  )}

                  {offer.highlights && (
                    <div className="bg-white border border-border rounded-2xl p-6 md:p-8 shadow-sm">
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
                        <div className="bg-white border border-border rounded-2xl p-6 shadow-sm">
                          <h3 className="text-lg font-serif font-bold text-foreground mb-3 flex items-center gap-2">
                            <CheckCircle2 className="w-5 h-5 text-green-600" />
                            Cosa è incluso
                          </h3>
                          <MultilineText text={offer.servicesIncluded} />
                        </div>
                      )}
                      {offer.servicesExcluded && (
                        <div className="bg-white border border-border rounded-2xl p-6 shadow-sm">
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
                    !offer.servicesExcluded && (
                      <div className="bg-white border border-border rounded-2xl p-8 shadow-sm text-center text-muted-foreground">
                        Per maggiori dettagli su questa offerta, contattaci tramite il form qui
                        a fianco.
                      </div>
                    )}
                </div>

                <aside className="lg:col-span-1">
                  <div className="bg-white border border-border rounded-2xl p-6 shadow-sm sticky top-24 space-y-5">
                    {priceLabel && (
                      <div>
                        <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                          A partire da
                        </div>
                        <div
                          className="text-3xl font-serif font-bold text-accent"
                          data-testid="text-offer-price"
                        >
                          {priceLabel}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          a persona, salvo disponibilità
                        </div>
                      </div>
                    )}

                    <ul className="space-y-3 text-sm">
                      {durationLabel && (
                        <li className="flex items-start gap-2.5">
                          <Clock className="w-4 h-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                          <div>
                            <div className="text-muted-foreground text-xs">Durata</div>
                            <div className="font-medium text-foreground">{durationLabel}</div>
                          </div>
                        </li>
                      )}
                      {offer.period && (
                        <li className="flex items-start gap-2.5">
                          <Calendar className="w-4 h-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                          <div>
                            <div className="text-muted-foreground text-xs">Periodo</div>
                            <div className="font-medium text-foreground">{offer.period}</div>
                          </div>
                        </li>
                      )}
                      {(validFromLabel || validToLabel) && (
                        <li className="flex items-start gap-2.5">
                          <Tag className="w-4 h-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                          <div>
                            <div className="text-muted-foreground text-xs">Validità</div>
                            <div className="font-medium text-foreground">
                              {validFromLabel ?? "—"}
                              {validToLabel ? ` → ${validToLabel}` : ""}
                            </div>
                          </div>
                        </li>
                      )}
                      {offer.departureCity && (
                        <li className="flex items-start gap-2.5">
                          <Plane className="w-4 h-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                          <div>
                            <div className="text-muted-foreground text-xs">Partenza da</div>
                            <div className="font-medium text-foreground">
                              {offer.departureCity}
                            </div>
                          </div>
                        </li>
                      )}
                      {offer.baseFormula && (
                        <li className="flex items-start gap-2.5">
                          <Tag className="w-4 h-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                          <div>
                            <div className="text-muted-foreground text-xs">Formula</div>
                            <div className="font-medium text-foreground">
                              {offer.baseFormula}
                            </div>
                          </div>
                        </li>
                      )}
                    </ul>

                    <Link href={`/contatti?offerId=${encodeURIComponent(offer.id)}`}>
                      <Button
                        className="w-full bg-accent text-accent-foreground hover:bg-accent/90 inline-flex items-center justify-center gap-2"
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
                        className="text-sm text-primary hover:underline inline-flex items-center gap-1.5 justify-center w-full"
                        data-testid="link-public-offer"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        Scheda completa
                      </a>
                    )}
                  </div>
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
