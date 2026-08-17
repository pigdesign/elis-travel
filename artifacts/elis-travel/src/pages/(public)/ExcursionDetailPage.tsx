import { Link } from "wouter";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/shared/Button";
import { ScheduleTimeline } from "@/components/shared/ScheduleTimeline";
import {
  ExcursionBookingForm,
  isCheckoutStep,
  type BookingStep,
} from "@/components/shared/ExcursionBookingForm";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useGetPublicExcursion } from "@workspace/api-client-react";
import { useSeo, extractIdFromSlug, buildSlugUrl, truncate } from "@/lib/seo";
import {
  MapPin,
  Loader2,
  ArrowLeft,
  CalendarDays,
  Users,
  CheckCircle2,
  Ticket,
  Clock,
  Bus,
  Info,
  Download,
  X as XIcon,
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

function formatEuro(n: number) {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: n % 1 === 0 ? 0 : 2,
  }).format(n);
}

export function ExcursionDetailPage({ excursionIdOrSlug }: ExcursionDetailPageProps) {
  const excursionId = extractIdFromSlug(excursionIdOrSlug);
  const { data: excursion, isLoading, isError, error } = useGetPublicExcursion(excursionId);
  const [, setLocation] = useLocation();

  // Quando la prenotazione arriva al pagamento la pagina smette di presentare
  // la gita: chi sta pagando ha già scelto, e i blocchi promozionali (con i
  // loro "Prenota un posto") diventano solo un invito a sbagliare.
  const [bookingStep, setBookingStep] = useState<BookingStep>("form");
  const inCheckout = isCheckoutStep(bookingStep);
  // Stabile: il form la usa come dipendenza di un effect.
  const handleStepChange = useCallback((next: BookingStep) => {
    setBookingStep(next);
  }, []);

  // Entrando nel pagamento la pagina si accorcia di colpo: senza questo, chi
  // aveva scrollato resta appeso a un punto che non esiste più.
  const bookingRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!inCheckout) return;
    bookingRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [inCheckout]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

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
    // noindex solo se la gita non è disponibile (non trovata / non caricata).
    // Le Rident sono pubbliche e indicizzabili come le standard.
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

  const scheduleDays = excursion?.schedule ?? [];
  const includedItems = excursion?.included?.split("\n").map((item) => item.trim()).filter(Boolean) ?? [];
  const excludedItems = excursion?.excluded?.split("\n").map((item) => item.trim()).filter(Boolean) ?? [];
  const durationLabel =
    scheduleDays.length > 1 ? `${scheduleDays.length} giorni` : "1 giorno";
  const participantRangeLabel = excursion?.currentCapacity
    ? `Min. ${excursion.minThreshold ?? 1} - Max. ${excursion.currentCapacity} persone`
    : excursion?.minThreshold
      ? `Minimo ${excursion.minThreshold} partecipanti`
      : "Gruppo organizzato";
  const heroBadgeLabel =
    scheduleDays.length > 1 ? `GITA DI ${scheduleDays.length} GIORNI` : "GITA DI 1 GIORNO";
  const heroDescription = excursion?.generalInfo
    ? truncate(excursion.generalInfo.replace(/\s+/g, " "), 180)
    : `Scopri ${excursion?.name ?? "questa gita"}${excursion?.location ? ` a ${excursion.location}` : ""}. Un'esperienza organizzata da Elis Travel tra natura, tappe curate e panorami da ricordare.`;
  const mainVisual =
    scheduleDays.find((day) => day.imageUrl)?.imageUrl ?? excursion?.coverImageUrl ?? null;
  const remainingSeats = excursion?.currentCapacity
    ? Math.max(0, (excursion.currentCapacity ?? 0) - (excursion.adherentsCount ?? 0))
    : undefined;
  const availabilityClass =
    !seatsInfo?.available
      ? "text-red-600"
      : seatsInfo?.urgent
        ? "text-accent"
        : "text-[#14242b]";
  const quickFacts = [
    { icon: Clock, label: "Durata", value: durationLabel },
    { icon: Users, label: "Disponibilita", value: seatsInfo?.label ?? "Su richiesta" },
    { icon: Bus, label: "Partecipanti", value: participantRangeLabel },
    { icon: MapPin, label: "Destinazione", value: excursion?.location ?? "Da definire" },
  ];
  const priceCard = (
    <div className="rounded-[28px] border border-white/70 bg-white p-6 shadow-[0_18px_55px_rgba(20,36,43,0.16)] md:p-8">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#6d7e85]">
        Quota di partecipazione
      </div>
      {priceLabel ? (
        <>
          <div
            className="mt-3 text-4xl font-serif font-bold leading-none text-accent md:text-5xl"
            data-testid="text-excursion-price"
          >
            {priceLabel}
          </div>
          <div className="mt-2 text-sm text-muted-foreground">a persona</div>
        </>
      ) : (
        <div className="mt-3 text-base font-medium text-foreground">
          Quota su richiesta
        </div>
      )}

      <div className="my-5 h-px bg-slate-200" />

      <div className="space-y-3 text-sm">
        <div className="flex items-start gap-3">
          <Users className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div>
            <div className="text-xs text-muted-foreground">Disponibilita</div>
            <div className={`font-semibold ${availabilityClass}`} data-testid="text-excursion-availability">
              {seatsInfo?.label ?? "Posti su richiesta"}
            </div>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <Bus className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div>
            <div className="text-xs text-muted-foreground">Partecipanti</div>
            <div className="font-semibold text-foreground">{participantRangeLabel}</div>
          </div>
        </div>
      </div>

      {minThresholdLabel && (
        <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-900">
          {minThresholdLabel}
        </div>
      )}

      <a
        href="#prenota"
        className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-accent px-5 py-3.5 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90"
        data-testid="button-scroll-to-booking"
      >
        <Ticket className="h-4 w-4" />
        Prenota un posto
      </a>

      {/* Niente locandina per le gite Rident: l'impianto grafico è pensato per
          le gite standard e queste sono di natura diversa. Il tasto sparisce
          qui, ma l'endpoint rifiuta comunque per conto suo. */}
      {excursion && excursion.category !== "rident" && (
        <a
          href={`/api/catalog/products/excursions/${excursion.id}/pdf`}
          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full border border-primary/30 bg-white px-5 py-3.5 text-sm font-semibold text-primary transition-colors hover:bg-primary/5"
          data-testid="button-download-pdf"
        >
          <Download className="h-4 w-4" />
          Scarica il PDF della gita
        </a>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-[#f7faf9]">
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
          <section className="relative overflow-hidden bg-[#f7faf9] pt-32 text-white md:pt-40 lg:pb-16">
            <div className="absolute inset-0">
              {excursion.coverImageUrl ? (
                <img
                  src={excursion.coverImageUrl}
                  alt={excursion.name}
                  className="h-full w-full object-cover"
                  data-testid="img-excursion-cover"
                />
              ) : (
                <div className="h-full w-full bg-gradient-to-br from-[#0b4f54] via-[#007f86] to-[#2bb7c6]" />
              )}
            </div>
            <div className="absolute inset-0 bg-black/35" />
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
                    href="/gite"
                    className="mb-6 inline-flex items-center gap-1.5 text-sm text-white/80 transition-colors hover:text-white"
                    data-testid="link-back-to-excursions"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Torna alle gite
                  </Link>

                  <div className="mb-5 inline-flex items-center rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#dff7f9] backdrop-blur-sm">
                    {heroBadgeLabel}
                  </div>

                  <h1
                    className="max-w-2xl text-4xl font-serif font-bold leading-[0.95] tracking-[-0.03em] md:text-6xl lg:text-7xl"
                    data-testid="text-excursion-name"
                  >
                    {excursion.name}
                  </h1>

                  {excursion.subtitle && (
                    <p
                      className="mt-4 max-w-2xl text-lg font-medium text-white/90 md:text-xl"
                      data-testid="text-excursion-subtitle"
                    >
                      {excursion.subtitle}
                    </p>
                  )}

                  <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3 text-sm text-white/92 md:text-base">
                    {excursion.location && (
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-[#dff7f9]" />
                        <span data-testid="text-excursion-location">{excursion.location}</span>
                      </div>
                    )}
                    {dateLabel && (
                      <div className="flex items-center gap-2">
                        <CalendarDays className="h-4 w-4 text-[#dff7f9]" />
                        <span data-testid="text-excursion-date" className="capitalize">
                          {dateLabel}
                        </span>
                      </div>
                    )}
                  </div>

                  <p className="mt-5 max-w-2xl text-sm leading-relaxed text-white/84 md:text-base">
                    {heroDescription}
                  </p>
                </div>

                {/* Durante il pagamento sparisce anche la card prezzo: il suo
                    "Prenota un posto" ripartirebbe da capo una prenotazione già
                    in corso. */}
                {!inCheckout && (
                  <div className="relative z-20 hidden self-end lg:block lg:translate-y-24">
                    {priceCard}
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="relative z-20 pb-10 pt-2 md:pt-4 lg:pt-0">
            <div className="container mx-auto max-w-6xl px-4 md:px-8">
              {!inCheckout && (
                <div className="mx-auto mb-6 max-w-xl lg:hidden">
                  {priceCard}
                </div>
              )}

              <div
                className={`grid gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(290px,0.85fr)] ${
                  inCheckout ? "hidden" : ""
                }`}
              >
                <div className="rounded-[28px] border border-white/80 bg-white/95 p-4 shadow-[0_14px_40px_rgba(20,36,43,0.08)] backdrop-blur-sm md:p-6">
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    {quickFacts.map((fact) => {
                      const Icon = fact.icon;
                      return (
                        <div key={fact.label} className="flex items-start gap-3 rounded-2xl px-2 py-2">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                            <Icon className="h-5 w-5" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-medium uppercase tracking-wide text-[#6d7e85]">
                              {fact.label}
                            </div>
                            <div className="mt-1 text-sm font-semibold text-[#14242b]">
                              {fact.value}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="hidden lg:block" />
              </div>
            </div>
          </section>

          <section className="pb-20 md:pb-24">
            <div className="container mx-auto max-w-6xl px-4 md:px-8">
              <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1.55fr)_minmax(290px,0.85fr)]">
                <div className="space-y-8">
                  {!inCheckout && (
                    <ScheduleTimeline
                      days={scheduleDays}
                      title="Programma della giornata"
                      mainVisual={mainVisual}
                      imageAlt={excursion?.name}
                    />
                  )}

                  {!inCheckout &&
                    excursion.pickupPoints &&
                    excursion.pickupPoints.length > 0 && (
                    <div className="rounded-[30px] border border-slate-200/70 bg-white p-6 shadow-[0_18px_50px_rgba(20,36,43,0.08)] md:p-8">
                      <h2 className="mb-4 flex items-center gap-2 text-xl font-serif font-bold text-foreground">
                        <Bus className="h-5 w-5 text-primary" />
                        Punti di raccolta
                      </h2>
                      <ul className="mb-4 space-y-3">
                        {excursion.pickupPoints.map((pp) => (
                          <li
                            key={pp.id}
                            className="flex flex-col gap-3 rounded-[22px] border border-slate-200 bg-[#f7faf9] px-4 py-4 md:flex-row md:items-center"
                          >
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                              <MapPin className="h-5 w-5" />
                            </div>
                            <div className="flex-1">
                              <div className="text-sm font-semibold text-foreground">
                                {pp.name}
                              </div>
                              <div className="text-xs leading-relaxed text-muted-foreground">
                                {[pp.city, pp.address].filter(Boolean).join(" · ")}
                              </div>
                            </div>
                            {(pp.surcharge ?? 0) !== 0 && (
                              <div className="inline-flex items-center rounded-full bg-accent/10 px-3 py-1 text-sm font-semibold text-accent">
                                {(pp.surcharge ?? 0) > 0 ? "+" : "−"}{formatEuro(Math.abs(pp.surcharge ?? 0))}/persona
                              </div>
                            )}
                            {pp.pickupTime && (
                              <div className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-sm font-semibold text-primary">
                                <Clock className="h-3.5 w-3.5" />
                                {pp.pickupTime}
                              </div>
                            )}
                          </li>
                        ))}
                      </ul>
                      <div className="flex items-start gap-2 rounded-[20px] bg-primary/5 px-4 py-3 text-xs leading-relaxed text-[#54656c]">
                        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        Servizio "sotto casa" disponibile su richiesta: contattaci per organizzare il trasferimento dal tuo indirizzo al punto di partenza.
                      </div>
                    </div>
                  )}

                  <div ref={bookingRef} className="scroll-mt-28">
                    <ExcursionBookingForm
                      excursion={excursion}
                      onStepChange={handleStepChange}
                    />
                  </div>
                </div>

                <aside
                  className={`space-y-6 lg:sticky lg:top-24 lg:self-start ${
                    inCheckout ? "hidden" : ""
                  }`}
                >
                  {includedItems.length > 0 && (
                    <div className="rounded-[28px] border border-slate-200/70 bg-white p-6 shadow-[0_18px_50px_rgba(20,36,43,0.08)]">
                      <h2 className="mb-4 text-xl font-serif font-bold text-foreground">
                        La quota include
                      </h2>
                      <ul className="space-y-3">
                        {includedItems.map((item, i) => (
                          <li key={i} className="flex items-start gap-3 text-sm leading-relaxed text-[#394b52]">
                            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {excludedItems.length > 0 && (
                    <div className="rounded-[28px] border border-slate-200/70 bg-white p-6 shadow-[0_18px_50px_rgba(20,36,43,0.08)]">
                      <h2 className="mb-4 text-xl font-serif font-bold text-foreground">
                        La quota non include
                      </h2>
                      <ul className="space-y-3">
                        {excludedItems.map((item, i) => (
                          <li key={i} className="flex items-start gap-3 text-sm leading-relaxed text-[#394b52]">
                            <XIcon className="mt-0.5 h-4 w-4 shrink-0 text-[#ff7a1a]" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {excursion.generalInfo && (
                    <div className="overflow-hidden rounded-[28px] bg-[linear-gradient(180deg,#0b5b60_0%,#006f73_100%)] p-6 text-white shadow-[0_18px_50px_rgba(20,36,43,0.16)]">
                      <h2 className="mb-4 flex items-center gap-2 text-xl font-serif font-bold">
                        <Info className="h-5 w-5 text-[#dff7f9]" />
                        Informazioni utili
                      </h2>
                      <p className="text-sm leading-relaxed text-white/88 whitespace-pre-line">
                        {excursion.generalInfo}
                      </p>

                      {mainVisual && (
                        <div className="mt-5 overflow-hidden rounded-[24px] border border-white/10">
                          <img
                            src={mainVisual}
                            alt={`Panorama di ${excursion.name}`}
                            className="h-52 w-full object-cover"
                          />
                        </div>
                      )}
                    </div>
                  )}
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
