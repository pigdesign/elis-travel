import { Link } from "wouter";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/shared/Button";
import { useEffect } from "react";
import { useLocation } from "wouter";
import { useGetPublicExcursion } from "@workspace/api-client-react";
import { useSeo, extractIdFromSlug, buildSlugUrl, truncate } from "@/lib/seo";
import {
  MapPin,
  Send,
  Loader2,
  ArrowLeft,
  CalendarDays,
  Users,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

interface ExcursionDetailPageProps {
  excursionIdOrSlug: string;
}

function formatDate(value?: string | null) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatPrice(value?: string | null) {
  if (!value) return null;
  const n = Number(value);
  if (Number.isNaN(n) || n <= 0) return null;
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: n % 1 === 0 ? 0 : 2,
  }).format(n);
}

export function ExcursionDetailPage({ excursionIdOrSlug }: ExcursionDetailPageProps) {
  const excursionId = extractIdFromSlug(excursionIdOrSlug);
  const { data: excursion, isLoading, isError } = useGetPublicExcursion(excursionId);
  const [, setLocation] = useLocation();

  const dateForSeo = (() => {
    if (!excursion?.date) return null;
    const d = new Date(excursion.date);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
  })();
  const seoTitle = excursion?.name
    ? `${excursion.name}${excursion.location ? ` — ${excursion.location}` : ""}`
    : isError
      ? "Gita non trovata"
      : "Gita organizzata";
  const seoDescription = excursion
    ? truncate(
        [
          excursion.name,
          excursion.location ? `a ${excursion.location}` : null,
          dateForSeo ? `il ${dateForSeo}` : null,
          "— gita organizzata da Elis Travel. Richiedi info e prenota il tuo posto.",
        ]
          .filter(Boolean)
          .join(" "),
      )
    : "Dettagli gita organizzata Elis Travel.";

  useSeo({
    title: seoTitle,
    description: seoDescription,
    type: "product",
    canonicalPath: excursion ? buildSlugUrl("gite", excursion.id, excursion.name) : undefined,
    noindex: !excursion,
  });

  useEffect(() => {
    if (!excursion) return;
    const expected = buildSlugUrl("gite", excursion.id, excursion.name);
    const current = `/gite/${excursionIdOrSlug}`;
    if (current !== expected) {
      setLocation(expected, { replace: true });
    }
  }, [excursion, excursionIdOrSlug, setLocation]);

  const dateLabel = formatDate(excursion?.date);
  const priceLabel = formatPrice(excursion?.pricePerPerson);

  const seatsInfo = (() => {
    if (!excursion) return null;
    const capacity = excursion.currentCapacity ?? 0;
    const adherents = excursion.adherentsCount ?? 0;
    const remaining = Math.max(0, capacity - adherents);
    if (capacity <= 0) return null;
    if (remaining === 0) {
      return { label: "Posti esauriti", available: false };
    }
    if (remaining <= 5) {
      return { label: `Ultimi ${remaining} posti disponibili`, available: true, urgent: true };
    }
    return { label: `${remaining} posti disponibili`, available: true };
  })();

  const minThresholdLabel = (() => {
    if (!excursion) return null;
    const min = excursion.minThreshold ?? 0;
    const adherents = excursion.adherentsCount ?? 0;
    if (min <= 0 || adherents >= min) return null;
    return `Servono almeno ${min} partecipanti per confermare la gita.`;
  })();

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {isLoading ? (
        <div className="pt-40 pb-20 flex justify-center text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : isError || !excursion ? (
        <section className="pt-40 pb-20">
          <div className="container mx-auto px-4 md:px-8 text-center max-w-xl">
            <h1 className="text-3xl font-serif font-bold text-foreground mb-3">
              Gita non trovata
            </h1>
            <p className="text-muted-foreground mb-8">
              Questa gita non è più disponibile o è stata rimossa.
            </p>
            <Link href="/gite">
              <Button className="inline-flex items-center gap-2">
                <ArrowLeft className="w-4 h-4" />
                Torna alle gite
              </Button>
            </Link>
          </div>
        </section>
      ) : (
        <>
          <section className="relative pt-40 pb-16 bg-gradient-to-br from-primary to-primary/80 text-white overflow-hidden">
            {excursion.coverImageUrl && (
              <>
                <div className="absolute inset-0">
                  <img
                    src={excursion.coverImageUrl}
                    alt={excursion.name}
                    className="w-full h-full object-cover"
                    data-testid="img-excursion-cover"
                  />
                </div>
                <div className="absolute inset-0 bg-gradient-to-br from-primary/85 to-primary/70" />
              </>
            )}
            <div className="relative container mx-auto px-4 md:px-8 max-w-5xl">
              <Link
                href="/gite"
                className="inline-flex items-center gap-1.5 text-white/80 hover:text-white text-sm mb-6"
                data-testid="link-back-to-excursions"
              >
                <ArrowLeft className="w-4 h-4" />
                Torna alle gite
              </Link>
              <h1
                className="text-4xl md:text-5xl font-serif font-bold mb-4"
                data-testid="text-excursion-name"
              >
                {excursion.name}
              </h1>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-white/90 text-base">
                {excursion.location && (
                  <div className="flex items-center gap-2">
                    <MapPin className="w-5 h-5" />
                    <span data-testid="text-excursion-location">{excursion.location}</span>
                  </div>
                )}
                {dateLabel && (
                  <div className="flex items-center gap-2">
                    <CalendarDays className="w-5 h-5" />
                    <span data-testid="text-excursion-date" className="capitalize">
                      {dateLabel}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="py-12 md:py-16">
            <div className="container mx-auto px-4 md:px-8 max-w-5xl">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-6">
                  <div className="bg-white border border-border rounded-2xl p-6 md:p-8 shadow-sm">
                    <h2 className="text-xl font-serif font-bold text-foreground mb-4">
                      La gita in breve
                    </h2>
                    <ul className="space-y-3 text-sm">
                      {dateLabel && (
                        <li className="flex items-start gap-2.5">
                          <CalendarDays className="w-4 h-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                          <div>
                            <div className="text-muted-foreground text-xs">Data</div>
                            <div className="font-medium text-foreground capitalize">
                              {dateLabel}
                            </div>
                          </div>
                        </li>
                      )}
                      {excursion.location && (
                        <li className="flex items-start gap-2.5">
                          <MapPin className="w-4 h-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                          <div>
                            <div className="text-muted-foreground text-xs">Destinazione</div>
                            <div className="font-medium text-foreground">
                              {excursion.location}
                            </div>
                          </div>
                        </li>
                      )}
                      {seatsInfo && (
                        <li className="flex items-start gap-2.5">
                          <Users className="w-4 h-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                          <div>
                            <div className="text-muted-foreground text-xs">Disponibilità</div>
                            <div
                              className={
                                "font-medium " +
                                (!seatsInfo.available
                                  ? "text-red-600"
                                  : seatsInfo.urgent
                                    ? "text-amber-600"
                                    : "text-foreground")
                              }
                              data-testid="text-excursion-availability"
                            >
                              {seatsInfo.label}
                            </div>
                          </div>
                        </li>
                      )}
                    </ul>

                    {minThresholdLabel && (
                      <div className="mt-5 flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                        <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                        <span>{minThresholdLabel}</span>
                      </div>
                    )}
                  </div>

                  <div className="bg-white border border-border rounded-2xl p-6 md:p-8 shadow-sm">
                    <h2 className="text-xl font-serif font-bold text-foreground mb-3 flex items-center gap-2">
                      <CheckCircle2 className="w-5 h-5 text-green-600" />
                      Richiedi info per partecipare
                    </h2>
                    <p className="text-muted-foreground text-sm leading-relaxed">
                      Vuoi prenotare un posto o ricevere il programma dettagliato? Compila il
                      form e il nostro team ti ricontatterà al più presto con tutte le
                      informazioni utili (programma, orari, punto di ritrovo).
                    </p>
                  </div>
                </div>

                <aside className="lg:col-span-1">
                  <div className="bg-white border border-border rounded-2xl p-6 shadow-sm sticky top-24 space-y-5">
                    {priceLabel ? (
                      <div>
                        <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                          Quota di partecipazione
                        </div>
                        <div
                          className="text-3xl font-serif font-bold text-accent"
                          data-testid="text-excursion-price"
                        >
                          {priceLabel}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">a persona</div>
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground">
                        Quota su richiesta — contattaci per il dettaglio.
                      </div>
                    )}

                    <Link href={`/contatti?excursionId=${encodeURIComponent(excursion.id)}`}>
                      <Button
                        className="w-full bg-accent text-accent-foreground hover:bg-accent/90 inline-flex items-center justify-center gap-2"
                        data-testid="button-request-info"
                      >
                        <Send className="w-4 h-4" />
                        Richiedi informazioni
                      </Button>
                    </Link>
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
