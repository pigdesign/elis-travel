import { Link } from "wouter";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/shared/Button";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import {
  useGetPublicExcursion,
  useCreatePublicExcursionBooking,
  getGetPublicExcursionQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
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

                  {/* Programma */}
                  {excursion.schedule && excursion.schedule.length > 0 && (
                    <div className="bg-white border border-border rounded-2xl p-6 md:p-8 shadow-sm">
                      <h2 className="text-xl font-serif font-bold text-foreground mb-5 flex items-center gap-2">
                        <Clock className="w-5 h-5 text-primary" />
                        Programma della giornata
                      </h2>
                      <div className="space-y-6">
                        {excursion.schedule.map((day) => (
                          <div key={day.dayNumber}>
                            <div className="flex items-center gap-2 mb-3">
                              <span className="text-xs font-bold text-white bg-primary rounded-full px-2.5 py-0.5">
                                Giorno {day.dayNumber}
                              </span>
                              {day.title && (
                                <span className="text-sm font-semibold text-foreground">{day.title}</span>
                              )}
                            </div>
                            {day.imageUrl && (
                              <div className="mb-4 rounded-xl overflow-hidden">
                                <img
                                  src={day.imageUrl}
                                  alt={day.title ?? `Giorno ${day.dayNumber}`}
                                  className="w-full h-48 object-cover"
                                />
                              </div>
                            )}
                            <ol className="space-y-2 pl-2 border-l-2 border-primary/20 ml-2">
                              {day.activities.map((act, i) => (
                                <li key={i} className="flex gap-3 pl-4 relative">
                                  <div className="absolute -left-[9px] top-1 w-3.5 h-3.5 rounded-full bg-white border-2 border-primary/40" />
                                  {act.time && (
                                    <span className="text-xs font-mono text-primary shrink-0 mt-0.5 w-10">{act.time}</span>
                                  )}
                                  <div>
                                    <div className="text-sm font-semibold text-foreground">{act.title}</div>
                                    {act.description && (
                                      <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{act.description}</div>
                                    )}
                                  </div>
                                </li>
                              ))}
                            </ol>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Include / non include */}
                  {(excursion.included || excursion.excluded) && (
                    <div className="bg-white border border-border rounded-2xl p-6 md:p-8 shadow-sm">
                      <h2 className="text-xl font-serif font-bold text-foreground mb-5">
                        La quota
                      </h2>
                      <div className="grid sm:grid-cols-2 gap-6">
                        {excursion.included && (
                          <div>
                            <h3 className="text-sm font-semibold text-emerald-700 mb-2 flex items-center gap-1.5">
                              <Check className="w-4 h-4" /> Include
                            </h3>
                            <ul className="space-y-1.5">
                              {excursion.included.split("\n").filter(Boolean).map((item, i) => (
                                <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                                  {item.trim()}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {excursion.excluded && (
                          <div>
                            <h3 className="text-sm font-semibold text-red-600 mb-2 flex items-center gap-1.5">
                              <XIcon className="w-4 h-4" /> Non include
                            </h3>
                            <ul className="space-y-1.5">
                              {excursion.excluded.split("\n").filter(Boolean).map((item, i) => (
                                <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                                  <XIcon className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                                  {item.trim()}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Punti di raccolta */}
                  {excursion.pickupPoints && excursion.pickupPoints.length > 0 && (
                    <div className="bg-white border border-border rounded-2xl p-6 md:p-8 shadow-sm">
                      <h2 className="text-xl font-serif font-bold text-foreground mb-4 flex items-center gap-2">
                        <Bus className="w-5 h-5 text-primary" />
                        Punti di raccolta
                      </h2>
                      <ul className="space-y-2 mb-4">
                        {excursion.pickupPoints.map((pp) => (
                          <li key={pp.id} className="flex items-center gap-3 px-4 py-3 rounded-xl border border-border bg-muted/20">
                            <MapPin className="w-4 h-4 text-accent shrink-0" />
                            <div className="flex-1">
                              <span className="text-sm font-semibold text-foreground">{pp.name}</span>
                              <span className="text-xs text-muted-foreground ml-1.5">{pp.city}</span>
                              {pp.address && <span className="text-xs text-muted-foreground ml-1">· {pp.address}</span>}
                            </div>
                            {pp.pickupTime && (
                              <div className="flex items-center gap-1 text-sm font-mono text-primary">
                                <Clock className="w-3.5 h-3.5" />
                                {pp.pickupTime}
                              </div>
                            )}
                          </li>
                        ))}
                      </ul>
                      <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/30 rounded-xl px-3 py-2.5">
                        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        Servizio "sotto casa" disponibile su richiesta — contattaci per organizzare il trasferimento dal tuo indirizzo al punto di partenza.
                      </div>
                    </div>
                  )}

                  {/* Info utili */}
                  {excursion.generalInfo && (
                    <div className="bg-white border border-border rounded-2xl p-6 md:p-8 shadow-sm">
                      <h2 className="text-xl font-serif font-bold text-foreground mb-4 flex items-center gap-2">
                        <Info className="w-5 h-5 text-primary" />
                        Informazioni utili
                      </h2>
                      <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">
                        {excursion.generalInfo}
                      </p>
                    </div>
                  )}

                  <BookingCard
                    excursionId={excursion.id}
                    seatsAvailable={seatsInfo?.available ?? true}
                    remainingSeats={
                      excursion.currentCapacity
                        ? Math.max(0, (excursion.currentCapacity ?? 0) - (excursion.adherentsCount ?? 0))
                        : undefined
                    }
                    priceLabel={priceLabel}
                    hasPickupPoints={!!(excursion.pickupPoints && excursion.pickupPoints.length > 0)}
                  />
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

                    <a
                      href="#prenota"
                      className="inline-flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-md bg-accent text-accent-foreground hover:bg-accent/90 font-medium text-sm"
                      data-testid="button-scroll-to-booking"
                    >
                      <Ticket className="w-4 h-4" />
                      Prenota un posto
                    </a>
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

interface BookingCardProps {
  excursionId: string;
  seatsAvailable: boolean;
  remainingSeats?: number;
  priceLabel: string | null;
  hasPickupPoints?: boolean;
}

function BookingCard({ excursionId, seatsAvailable, remainingSeats, priceLabel, hasPickupPoints }: BookingCardProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const [paymentType, setPaymentType] = useState<"deposit" | "full">("deposit");
  const [servizioCasa, setServizioCasa] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{
    adults: number;
    children: number;
    paymentStatus: string;
    message: string;
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
        className="bg-red-50 border border-red-200 rounded-2xl p-6 md:p-8"
        data-testid="card-booking-soldout"
      >
        <h2 className="text-xl font-serif font-bold text-red-800 mb-2 flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          Posti esauriti
        </h2>
        <p className="text-red-700 text-sm leading-relaxed">
          Tutti i posti per questa gita sono già stati prenotati. Contattaci per essere
          inserito nella lista d'attesa.
        </p>
      </div>
    );
  }

  if (confirmation) {
    return (
      <div
        id="prenota"
        className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 md:p-8"
        data-testid="card-booking-success"
      >
        <h2 className="text-xl font-serif font-bold text-emerald-800 mb-3 flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5" />
          Prenotazione registrata
        </h2>
        <p className="text-emerald-900 text-sm mb-3">{confirmation.message}</p>
        <ul className="text-sm text-emerald-900 space-y-1 mb-4">
          <li>
            <strong>Adulti:</strong> {confirmation.adults}
          </li>
          {confirmation.children > 0 && (
            <li>
              <strong>Bambini ({"<"}12 anni):</strong> {confirmation.children}
            </li>
          )}
          <li>
            <strong>Modalità di pagamento:</strong>{" "}
            {confirmation.paymentStatus === "full_requested" ? "Importo completo" : "Acconto"}
          </li>
        </ul>
        <button
          type="button"
          onClick={() => {
            setConfirmation(null);
            setName("");
            setEmail("");
            setPhone("");
            setAdults(1);
            setChildren(0);
            setPaymentType("deposit");
          }}
          className="text-sm text-emerald-800 underline hover:text-emerald-900"
          data-testid="button-new-booking"
        >
          Effettua una nuova prenotazione
        </button>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!name.trim() || !email.trim()) {
      setErrorMsg("Nome ed email sono obbligatori.");
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
          phone: phone.trim() || undefined,
          adults,
          children: children || undefined,
          paymentType,
          servizioCasa: servizioCasa || undefined,
        },
      });
      setConfirmation({
        adults: res.adults,
        children: res.children,
        paymentStatus: res.paymentStatus,
        message: res.message,
      });
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
      className="bg-white border border-border rounded-2xl p-6 md:p-8 shadow-sm"
      data-testid="card-booking-form"
    >
      <h2 className="text-xl font-serif font-bold text-foreground mb-1 flex items-center gap-2">
        <Ticket className="w-5 h-5 text-accent" />
        Prenota un posto
      </h2>
      <p className="text-muted-foreground text-sm mb-5">
        Compila il form per riservare il tuo posto. Scegli se versare un acconto o pagare
        l'intero importo.
      </p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="bk-name" className="block text-xs font-medium text-foreground mb-1">
              Nome e cognome *
            </label>
            <input
              id="bk-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-accent"
              data-testid="input-booking-name"
            />
          </div>
          <div>
            <label htmlFor="bk-email" className="block text-xs font-medium text-foreground mb-1">
              Email *
            </label>
            <input
              id="bk-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-accent"
              data-testid="input-booking-email"
            />
          </div>
          <div>
            <label htmlFor="bk-phone" className="block text-xs font-medium text-foreground mb-1">
              Telefono
            </label>
            <input
              id="bk-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-accent"
              data-testid="input-booking-phone"
            />
          </div>
          <div>
            <label htmlFor="bk-adults" className="block text-xs font-medium text-foreground mb-1">
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
              className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-accent"
              data-testid="input-booking-adults"
            />
          </div>
          <div>
            <label htmlFor="bk-children" className="block text-xs font-medium text-foreground mb-1">
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
              className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-accent"
              data-testid="input-booking-children"
            />
          </div>
        </div>

        <div>
          <div className="block text-xs font-medium text-foreground mb-2">
            Modalità di pagamento *
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label
              className={
                "flex items-start gap-2 p-3 border rounded-md cursor-pointer transition-colors " +
                (paymentType === "deposit"
                  ? "border-accent bg-accent/5"
                  : "border-border hover:bg-muted/30")
              }
              data-testid="radio-payment-deposit"
            >
              <input
                type="radio"
                name="paymentType"
                value="deposit"
                checked={paymentType === "deposit"}
                onChange={() => setPaymentType("deposit")}
                className="mt-1"
              />
              <div>
                <div className="font-medium text-sm text-foreground">Acconto</div>
                <div className="text-xs text-muted-foreground">
                  Versa un acconto e salda alla partenza
                </div>
              </div>
            </label>
            <label
              className={
                "flex items-start gap-2 p-3 border rounded-md cursor-pointer transition-colors " +
                (paymentType === "full"
                  ? "border-accent bg-accent/5"
                  : "border-border hover:bg-muted/30")
              }
              data-testid="radio-payment-full"
            >
              <input
                type="radio"
                name="paymentType"
                value="full"
                checked={paymentType === "full"}
                onChange={() => setPaymentType("full")}
                className="mt-1"
              />
              <div>
                <div className="font-medium text-sm text-foreground">Importo completo</div>
                <div className="text-xs text-muted-foreground">
                  {priceLabel ? `Paghi subito ${priceLabel} a persona` : "Paghi subito l'intera quota"}
                </div>
              </div>
            </label>
          </div>
        </div>

        {hasPickupPoints && (
          <label className="flex items-start gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={servizioCasa}
              onChange={(e) => setServizioCasa(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-accent shrink-0"
              data-testid="checkbox-servizio-casa"
            />
            <div>
              <span className="text-sm font-medium text-foreground group-hover:text-accent transition-colors">
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
            className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700"
            data-testid="text-booking-error"
          >
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
          )}

          <div className="pt-2">
            <label className="flex items-start gap-2 cursor-pointer">
              <input 
                type="checkbox" 
                checked={privacyAccepted}
                onChange={(e) => setPrivacyAccepted(e.target.checked)}
                className="mt-1 shrink-0 accent-primary" 
              />
              <span className="text-xs text-muted-foreground leading-snug">
                Ho letto e accetto l'<Link href="/privacy-policy" className="text-primary hover:underline" target="_blank">Informativa sulla Privacy</Link>. Acconsento al trattamento dei dati personali. *
              </span>
            </label>
          </div>

          <Button
          type="submit"
          disabled={isPending}
          className="w-full bg-accent text-accent-foreground hover:bg-accent/90 inline-flex items-center justify-center gap-2"
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
              Prenota ora
            </>
          )}
        </Button>
        <p className="text-xs text-muted-foreground text-center">
          Il pagamento avverrà offline: ti contatteremo per perfezionarlo.
        </p>
      </form>
    </div>
  );
}
