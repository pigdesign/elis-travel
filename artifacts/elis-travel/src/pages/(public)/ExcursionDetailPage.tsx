import { Link } from "wouter";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/shared/Button";
import { ScheduleTimeline } from "@/components/shared/ScheduleTimeline";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import {
  useGetPublicExcursion,
  useCreatePublicExcursionBooking,
  confirmPublicExcursionBookingCard,
  getGetPublicExcursionQueryKey,
} from "@workspace/api-client-react";
import type { PublicPickupPoint } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, CardElement, useStripe, useElements } from "@stripe/react-stripe-js";

const stripePublishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined;
const stripePromise = stripePublishableKey ? loadStripe(stripePublishableKey) : null;
import { useSeo, extractIdFromSlug, buildSlugUrl, truncate } from "@/lib/seo";
import {
  MapPin,
  Loader2,
  ArrowLeft,
  CalendarDays,
  Users,
  CheckCircle2,
  AlertCircle,
  Ticket,
  Clock,
  Bus,
  Info,
  Check,
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

export function ExcursionDetailPage({ excursionIdOrSlug }: ExcursionDetailPageProps) {
  const excursionId = extractIdFromSlug(excursionIdOrSlug);
  const { data: excursion, isLoading, isError, error } = useGetPublicExcursion(excursionId);
  const [, setLocation] = useLocation();

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
    // Le gite Rident restano fuori dai motori di ricerca: raggiungibili solo via link diretto.
    noindex: !excursion || excursion.category === "rident",
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

                <div className="relative z-20 hidden self-end lg:block lg:translate-y-24">
                  {priceCard}
                </div>
              </div>
            </div>
          </section>

          <section className="relative z-20 pb-10 pt-2 md:pt-4 lg:pt-0">
            <div className="container mx-auto max-w-6xl px-4 md:px-8">
              <div className="mx-auto mb-6 max-w-xl lg:hidden">
                {priceCard}
              </div>

              <div className="grid gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(290px,0.85fr)]">
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
                  <ScheduleTimeline
                    days={scheduleDays}
                    title="Programma della giornata"
                    mainVisual={mainVisual}
                    imageAlt={excursion?.name}
                  />

                  {excursion.pickupPoints && excursion.pickupPoints.length > 0 && (
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

                  <BookingCard
                    excursionId={excursion.id}
                    seatsAvailable={seatsInfo?.available ?? true}
                    remainingSeats={remainingSeats}
                    priceLabel={priceLabel}
                    pickupPoints={excursion.pickupPoints ?? []}
                    cardPaymentsEnabled={excursion.cardPaymentsEnabled === true}
                  />
                </div>

                <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
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

interface BookingCardProps {
  excursionId: string;
  seatsAvailable: boolean;
  remainingSeats?: number;
  priceLabel: string | null;
  pickupPoints?: PublicPickupPoint[];
  cardPaymentsEnabled: boolean;
}

// Inner component that uses Stripe hooks (must be inside Elements)
function StripeCardStep({
  excursionId,
  bookingId,
  clientSecret,
  amountLabel,
  onBack,
  onSuccess,
}: {
  excursionId: string;
  bookingId: string;
  clientSecret: string;
  amountLabel: string | null;
  onBack: () => void;
  onSuccess: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [cardError, setCardError] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);

  const handleCardSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setCardError(null);
    setIsConfirming(true);

    const cardElement = elements.getElement(CardElement);
    if (!cardElement) {
      setCardError("Elemento carta non trovato. Ricarica la pagina.");
      setIsConfirming(false);
      return;
    }

    const { setupIntent, error } = await stripe.confirmCardSetup(clientSecret, {
      payment_method: { card: cardElement },
    });

    if (error || !setupIntent) {
      setCardError(error?.message ?? "Errore durante la verifica della carta.");
      setIsConfirming(false);
      return;
    }

    try {
      await confirmPublicExcursionBookingCard(excursionId, bookingId, {
        setupIntentId: setupIntent.id,
      });
      onSuccess();
    } catch {
      setCardError("Carta verificata ma si è verificato un errore. Contattaci per assistenza.");
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <div id="prenota" className="rounded-[30px] border border-slate-200/70 bg-white p-6 shadow-[0_18px_50px_rgba(20,36,43,0.08)] md:p-8">
      <h2 className="mb-1 flex items-center gap-2 text-xl font-serif font-bold text-foreground">
        <Ticket className="h-5 w-5 text-accent" />
        Inserisci i dati della carta
      </h2>
      <p className="mb-1 text-sm text-muted-foreground">
        La carta verrà salvata in modo sicuro e addebitata <strong>solo se la gita viene confermata</strong>.
      </p>
      {amountLabel && (
        <p className="mb-5 text-sm font-semibold text-foreground">
          Importo che verrà addebitato alla conferma: {amountLabel}
        </p>
      )}
      <form onSubmit={handleCardSubmit} className="space-y-5">
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3.5">
          <CardElement
            options={{
              style: {
                base: {
                  fontSize: "14px",
                  color: "#1a1a1a",
                  "::placeholder": { color: "#94a3b8" },
                },
              },
            }}
          />
        </div>
        {cardError && (
          <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>{cardError}</span>
          </div>
        )}
        <Button
          type="submit"
          disabled={isConfirming || !stripe}
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-accent text-accent-foreground hover:bg-accent/90"
        >
          {isConfirming ? (
            <><Loader2 className="w-4 h-4 animate-spin" />Verifica in corso…</>
          ) : (
            <><Check className="w-4 h-4" />Conferma prenotazione</>
          )}
        </Button>
        <button
          type="button"
          onClick={onBack}
          disabled={isConfirming}
          className="w-full text-center text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
        >
          ← Torna al modulo
        </button>
        <p className="text-center text-xs text-muted-foreground">
          Pagamento sicuro gestito da Stripe. I tuoi dati non vengono mai condivisi con noi.
        </p>
      </form>
    </div>
  );
}

function BookingCard({
  excursionId,
  seatsAvailable,
  remainingSeats,
  priceLabel,
  pickupPoints,
  cardPaymentsEnabled,
}: BookingCardProps) {
  const queryClient = useQueryClient();
  const points = pickupPoints ?? [];
  const hasPickupPoints = points.length > 0;
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const [paymentType, setPaymentType] = useState<"deposit" | "full">("deposit");
  const [pickupPointId, setPickupPointId] = useState("");
  const [servizioCasa, setServizioCasa] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [step, setStep] = useState<"form" | "stripe" | "done">("form");
  const [successMode, setSuccessMode] = useState<"card" | "offline">("card");
  const [stripeData, setStripeData] = useState<{
    bookingId: string;
    clientSecret: string;
    amountLabel: string | null;
  } | null>(null);

  const { mutateAsync, isPending } = useCreatePublicExcursionBooking({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({
          queryKey: getGetPublicExcursionQueryKey(excursionId),
        });
      },
    },
  });

  if (!seatsAvailable) {
    return (
      <div
        id="prenota"
        className="rounded-[30px] border border-red-200 bg-red-50 p-6 shadow-[0_18px_50px_rgba(20,36,43,0.08)] md:p-8"
        data-testid="card-booking-soldout"
      >
        <h2 className="mb-2 flex items-center gap-2 text-xl font-serif font-bold text-red-800">
          <AlertCircle className="h-5 w-5" />
          Posti esauriti
        </h2>
        <p className="text-sm leading-relaxed text-red-700">
          Tutti i posti per questa gita sono gia stati prenotati. Contattaci per essere
          inserito in lista d'attesa o verificare eventuali nuove disponibilita.
        </p>
      </div>
    );
  }

  const resetForm = () => {
    setStep("form");
    setStripeData(null);
    setName("");
    setEmail("");
    setPhone("");
    setAdults(1);
    setChildren(0);
    setPaymentType("deposit");
    setPickupPointId("");
    setPrivacyAccepted(false);
    setErrorMsg(null);
    setSuccessMode("card");
  };

  if (step === "done") {
    const successText =
      successMode === "card"
        ? "La tua carta è stata salvata. Riceverai una email di conferma. Verrai addebitato solo quando la gita raggiunge il numero minimo e viene confermata."
        : "La tua richiesta è stata registrata. Riceverai una email con le istruzioni per completare il pagamento offline.";

    return (
      <div
        id="prenota"
        className="rounded-[30px] border border-emerald-200 bg-emerald-50 p-6 shadow-[0_18px_50px_rgba(20,36,43,0.08)] md:p-8"
        data-testid="card-booking-success"
      >
        <h2 className="mb-3 flex items-center gap-2 text-xl font-serif font-bold text-emerald-800">
          <CheckCircle2 className="h-5 w-5" />
          Prenotazione confermata!
        </h2>
        <p className="mb-4 text-sm text-emerald-900">
          {successText}
        </p>
        <button
          type="button"
          onClick={resetForm}
          className="text-sm font-medium text-emerald-800 underline hover:text-emerald-900"
          data-testid="button-new-booking"
        >
          Effettua una nuova prenotazione
        </button>
      </div>
    );
  }

  if (step === "stripe" && stripeData) {
    if (!stripePromise) {
      return (
        <div id="prenota" className="rounded-[30px] border border-slate-200/70 bg-white p-6 shadow-[0_18px_50px_rgba(20,36,43,0.08)] md:p-8">
          <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold mb-1">Pagamento non configurato</p>
              <p>La chiave Stripe pubblica non è impostata (<code>VITE_STRIPE_PUBLISHABLE_KEY</code>). Configura le variabili d'ambiente e riavvia il server.</p>
            </div>
          </div>
          <button type="button" onClick={() => setStep("form")} className="mt-4 w-full text-center text-xs text-muted-foreground hover:text-foreground">← Torna al modulo</button>
        </div>
      );
    }
    return (
      <Elements stripe={stripePromise}>
        <StripeCardStep
          excursionId={excursionId}
          bookingId={stripeData.bookingId}
          clientSecret={stripeData.clientSecret}
          amountLabel={stripeData.amountLabel}
          onBack={() => setStep("form")}
          onSuccess={() => {
            void queryClient.invalidateQueries({ queryKey: getGetPublicExcursionQueryKey(excursionId) });
            setSuccessMode("card");
            setStep("done");
          }}
        />
      </Elements>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!name.trim() || !email.trim() || !phone.trim()) {
      setErrorMsg("Nome, email e telefono sono obbligatori.");
      return;
    }
    if (!privacyAccepted) {
      setErrorMsg("Devi accettare l'Informativa sulla Privacy per poter inviare la richiesta.");
      return;
    }
    try {
      const res = await mutateAsync({
        id: excursionId,
        data: {
          customerName: name.trim(),
          email: email.trim(),
          phone: phone.trim(),
          adults,
          children: children || undefined,
          paymentType,
          servizioCasa: servizioCasa || undefined,
          pickupPointId: pickupPointId || undefined,
        },
      });
      if (res.setupIntentClientSecret) {
        const pct = res.depositPercentage;
        const priceNum = priceLabel ? Number(priceLabel.replace(/[^0-9.,]/g, "").replace(",", ".")) : null;
        let amountLabel: string | null = null;
        if (priceNum && pct && paymentType === "deposit") {
          const amt = priceNum * (adults + children) * (pct / 100);
          amountLabel = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(amt);
        } else if (priceNum && paymentType === "full") {
          const amt = priceNum * (adults + children);
          amountLabel = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(amt);
        }
        setStripeData({ bookingId: res.id, clientSecret: res.setupIntentClientSecret, amountLabel });
        setStep("stripe");
      } else {
        // Fallback: no Stripe configured
        setSuccessMode("offline");
        setStep("done");
      }
    } catch (err: unknown) {
      const e = err as { data?: { error?: string }; message?: string };
      setErrorMsg(
        e?.data?.error ?? e?.message ?? "Impossibile completare la prenotazione. Riprova.",
      );
    }
  };

  return (
    <div
      id="prenota"
      className="rounded-[30px] border border-slate-200/70 bg-white p-6 shadow-[0_18px_50px_rgba(20,36,43,0.08)] md:p-8"
      data-testid="card-booking-form"
    >
      <h2 className="mb-1 flex items-center gap-2 text-xl font-serif font-bold text-foreground">
        <Ticket className="h-5 w-5 text-accent" />
        Prenota un posto
      </h2>
      <p className="mb-6 text-sm text-muted-foreground">
        Compila il form per riservare il tuo posto. Scegli se versare un acconto o pagare
        l'intero importo.
      </p>
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="bk-name" className="mb-1.5 block text-xs font-semibold text-foreground">
              Nome e cognome *
            </label>
            <input
              id="bk-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-foreground outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/10"
              data-testid="input-booking-name"
            />
          </div>
          <div>
            <label htmlFor="bk-email" className="mb-1.5 block text-xs font-semibold text-foreground">
              Email *
            </label>
            <input
              id="bk-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-foreground outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/10"
              data-testid="input-booking-email"
            />
          </div>
          <div>
            <label htmlFor="bk-phone" className="mb-1.5 block text-xs font-semibold text-foreground">
              Telefono *
            </label>
            <input
              id="bk-phone"
              type="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-foreground outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/10"
              data-testid="input-booking-phone"
            />
          </div>
          <div>
            <label htmlFor="bk-adults" className="mb-1.5 block text-xs font-semibold text-foreground">
              Adulti (≥12 anni) *
            </label>
            <input
              id="bk-adults"
              type="number"
              min={1}
              max={remainingSeats ?? undefined}
              required
              value={adults}
              onChange={(e) => {
                const v = Math.max(1, Number(e.target.value) || 1);
                const total = v + children;
                if (remainingSeats !== undefined && total > remainingSeats) {
                  setAdults(Math.max(1, remainingSeats - children));
                } else {
                  setAdults(v);
                }
              }}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-foreground outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/10"
              data-testid="input-booking-adults"
            />
          </div>
          <div>
            <label htmlFor="bk-children" className="mb-1.5 block text-xs font-semibold text-foreground">
              Bambini (&lt;12 anni)
            </label>
            <input
              id="bk-children"
              type="number"
              min={0}
              max={remainingSeats !== undefined ? Math.max(0, remainingSeats - adults) : undefined}
              value={children}
              onChange={(e) => {
                const v = Math.max(0, Number(e.target.value) || 0);
                const total = adults + v;
                if (remainingSeats !== undefined && total > remainingSeats) {
                  setChildren(Math.max(0, remainingSeats - adults));
                } else {
                  setChildren(v);
                }
              }}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-foreground outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/10"
              data-testid="input-booking-children"
            />
          </div>
        </div>

        <div>
          <div className="mb-2 block text-xs font-semibold text-foreground">
            Modalità di pagamento *
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label
              className={
                "flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-colors " +
                (paymentType === "deposit"
                  ? "border-accent bg-accent/5 shadow-[0_8px_24px_rgba(255,122,26,0.10)]"
                  : "border-slate-200 hover:bg-[#f7faf9]")
              }
              data-testid="radio-payment-deposit"
            >
              <input
                type="radio"
                name="paymentType"
                value="deposit"
                checked={paymentType === "deposit"}
                onChange={() => setPaymentType("deposit")}
                className="mt-1 accent-accent"
              />
              <div>
                <div className="text-sm font-semibold text-foreground">Acconto</div>
                <div className="text-xs text-muted-foreground">
                  Prenota con acconto; il saldo si salda il giorno della gita
                </div>
              </div>
            </label>
            <label
              className={
                "flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-colors " +
                (paymentType === "full"
                  ? "border-accent bg-accent/5 shadow-[0_8px_24px_rgba(255,122,26,0.10)]"
                  : "border-slate-200 hover:bg-[#f7faf9]")
              }
              data-testid="radio-payment-full"
            >
              <input
                type="radio"
                name="paymentType"
                value="full"
                checked={paymentType === "full"}
                onChange={() => setPaymentType("full")}
                className="mt-1 accent-accent"
              />
              <div>
                <div className="text-sm font-semibold text-foreground">Importo completo</div>
                <div className="text-xs text-muted-foreground">
                  {priceLabel ? `Quota completa: ${priceLabel} a persona` : "Prenota con quota completa"}
                </div>
              </div>
            </label>
          </div>
        </div>

        {hasPickupPoints && (
          <div>
            <label htmlFor="bk-pickup" className="mb-1.5 block text-xs font-semibold text-foreground">
              Punto di raccolta <span className="font-normal text-muted-foreground">(opzionale)</span>
            </label>
            <select
              id="bk-pickup"
              value={pickupPointId}
              onChange={(e) => setPickupPointId(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-foreground outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/10"
              data-testid="select-booking-pickup"
            >
              <option value="">Nessuna preferenza / decido dopo</option>
              {points.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.city ? ` – ${p.city}` : ""}
                  {p.pickupTime ? ` (ore ${p.pickupTime})` : ""}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Indica da quale punto di raccolta preferisci partire. Potrai modificarlo contattandoci.
            </p>
          </div>
        )}

        {hasPickupPoints && (
          <label className="group flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-[#f7faf9] px-4 py-4">
            <input
              type="checkbox"
              checked={servizioCasa}
              onChange={(e) => setServizioCasa(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-accent shrink-0"
              data-testid="checkbox-servizio-casa"
            />
            <div>
              <span className="text-sm font-semibold text-foreground transition-colors group-hover:text-accent">
                Richiedo il servizio di trasporto da casa
              </span>
              <p className="text-xs text-muted-foreground mt-0.5">
                Disponibile su richiesta. Ti contatteremo per organizzare il ritiro e comunicarti eventuali costi aggiuntivi.
              </p>
            </div>
          </label>
        )}

        {errorMsg && (
          <div
            className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
            data-testid="text-booking-error"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <div className="pt-1">
          <label className="flex cursor-pointer items-start gap-2">
              <input
                type="checkbox"
                checked={privacyAccepted}
                onChange={(e) => setPrivacyAccepted(e.target.checked)}
                className="mt-1 shrink-0 accent-accent"
              />
              <span className="text-xs text-muted-foreground leading-snug">
                Ho letto e accetto l'<Link href="/privacy-policy" className="text-primary hover:underline" target="_blank">Informativa sulla Privacy</Link>. Acconsento al trattamento dei dati personali. *
              </span>
          </label>
        </div>

        <Button
          type="submit"
          disabled={isPending}
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-accent text-accent-foreground hover:bg-accent/90"
          data-testid="button-submit-booking"
        >
          {isPending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Invio in corso…
            </>
          ) : (
            <>
              <Ticket className="w-4 h-4" />
              {cardPaymentsEnabled ? "Avanti: inserisci carta" : "Invia prenotazione"}
            </>
          )}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          {cardPaymentsEnabled
            ? "La carta verrà addebitata solo se la gita raggiunge il numero minimo e viene confermata. Se non parte, nessun addebito."
            : "Riceverai una email con le istruzioni per completare il pagamento offline."}
        </p>
      </form>
    </div>
  );
}
