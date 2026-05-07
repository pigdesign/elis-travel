import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/shared/Button";
import {
  MapPin,
  Calendar,
  Users,
  Mail,
  Search,
  User,
  Minus,
  Plus,
  CheckCircle,
  AlertCircle,
  Loader2,
} from "lucide-react";

function formatDateIt(d: string) {
  if (!d) return "";
  const date = new Date(d + "T00:00:00");
  return date.toLocaleDateString("it-IT", { day: "numeric", month: "short" });
}

function formatDateRange(dep: string, ret: string) {
  if (!dep && !ret) return "";
  if (dep && !ret) return `Dal ${formatDateIt(dep)}`;
  return `${formatDateIt(dep)} → ${formatDateIt(ret)}`;
}

function formatPeople(adults: number, children: number) {
  const parts: string[] = [];
  if (adults > 0) parts.push(`${adults} adult${adults === 1 ? "o" : "i"}`);
  if (children > 0) parts.push(`${children} bambin${children === 1 ? "o" : "i"}`);
  return parts.join(", ");
}

function Stepper({
  label,
  value,
  min = 0,
  max = 20,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm font-medium text-foreground">{label}</span>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          className="w-8 h-8 rounded-full border border-border flex items-center justify-center text-foreground hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
        <span className="w-5 text-center font-bold text-sm">{value}</span>
        <button
          type="button"
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          className="w-8 h-8 rounded-full border border-border flex items-center justify-center text-foreground hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

const today = new Date().toISOString().split("T")[0];

export function SearchBar() {
  const [destination, setDestination] = useState("");
  const [departureDate, setDepartureDate] = useState("");
  const [returnDate, setReturnDate] = useState("");
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const [childrenAges, setChildrenAges] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  const [dateOpen, setDateOpen] = useState(false);
  const [personaOpen, setPersonaOpen] = useState(false);

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dateRef = useRef<HTMLDivElement>(null);
  const personaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dateRef.current && !dateRef.current.contains(e.target as Node)) setDateOpen(false);
      if (personaRef.current && !personaRef.current.contains(e.target as Node)) setPersonaOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  async function handleSubmit() {
    if (!email.trim()) {
      setError("L'email è obbligatoria.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Inserisci un'indirizzo email valido.");
      return;
    }
    setLoading(true);
    setError(null);

    const parts: string[] = [];
    if (destination.trim()) parts.push(`Destinazione: ${destination.trim()}`);
    if (departureDate) parts.push(`Partenza: ${departureDate}`);
    if (returnDate) parts.push(`Ritorno: ${returnDate}`);
    const peopleParts: string[] = [];
    if (adults > 0) peopleParts.push(`${adults} adult${adults === 1 ? "o" : "i"}`);
    if (children > 0) {
      const ages = childrenAges.trim() ? ` (età: ${childrenAges.trim()})` : "";
      peopleParts.push(`${children} bambin${children === 1 ? "o" : "i"}${ages}`);
    }
    if (peopleParts.length) parts.push(`Persone: ${peopleParts.join(", ")}`);

    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: name.trim() || "Visitatore",
          email: email.trim(),
          message: parts.length ? parts.join("\n") : undefined,
        }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Errore durante l'invio. Riprova.");
      } else {
        setSuccess(true);
      }
    } catch {
      setError("Errore di rete. Controlla la connessione e riprova.");
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="relative z-30 container mx-auto px-4 md:px-8 -mt-24 md:-mt-32 mb-20">
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white rounded-[2.5rem] shadow-2xl p-8 max-w-5xl mx-auto flex items-center gap-5"
        >
          <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center shrink-0">
            <CheckCircle className="w-6 h-6 text-green-600" />
          </div>
          <div>
            <p className="font-bold text-lg text-foreground">Richiesta inviata con successo!</p>
            <p className="text-muted-foreground text-sm mt-0.5">
              Ti contatteremo al più presto all&apos;indirizzo{" "}
              <span className="font-semibold text-foreground">{email}</span>.
            </p>
          </div>
        </motion.div>
      </div>
    );
  }

  const dateLabel = formatDateRange(departureDate, returnDate);
  const peopleLabel = formatPeople(adults, children);

  return (
    <div className="relative z-30 container mx-auto px-4 md:px-8 -mt-24 md:-mt-32 mb-20">
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8 }}
        className="bg-white rounded-[2.5rem] shadow-2xl p-4 md:p-6 max-w-5xl mx-auto space-y-2"
      >
        {/* ── Riga 1: Località · Partenza/Ritorno · Persone ── */}
        <div className="flex flex-col md:flex-row md:items-stretch md:divide-x md:divide-border gap-3 md:gap-0">

          {/* Località */}
          <label className="flex items-center gap-4 px-4 py-3 rounded-2xl hover:bg-muted/50 transition-colors md:flex-1 cursor-text">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
              <MapPin className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground font-medium">Località</p>
              <input
                type="text"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="Dove vuoi andare?"
                className="font-bold text-foreground text-sm bg-transparent outline-none w-full placeholder:font-bold placeholder:text-muted-foreground/50"
              />
            </div>
          </label>

          {/* Partenza / Ritorno */}
          <div ref={dateRef} className="relative md:flex-1">
            <button
              type="button"
              onClick={() => { setDateOpen((v) => !v); setPersonaOpen(false); }}
              className="w-full flex items-center gap-4 px-4 py-3 rounded-2xl hover:bg-muted/50 transition-colors text-left"
            >
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                <Calendar className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground font-medium">Partenza / Ritorno</p>
                <p className={`font-bold text-sm truncate ${dateLabel ? "text-foreground" : "text-muted-foreground/50"}`}>
                  {dateLabel || "Aggiungi le date"}
                </p>
              </div>
            </button>

            {dateOpen && (
              <div className="absolute top-full left-0 mt-2 bg-white rounded-2xl shadow-2xl border border-border p-5 z-50 flex flex-col sm:flex-row gap-4 min-w-[300px]">
                <div className="flex-1">
                  <label className="text-xs font-semibold text-muted-foreground block mb-1.5">Partenza</label>
                  <input
                    type="date"
                    value={departureDate}
                    min={today}
                    onChange={(e) => {
                      setDepartureDate(e.target.value);
                      if (returnDate && e.target.value > returnDate) setReturnDate("");
                    }}
                    className="w-full border border-border rounded-xl px-3 py-2 text-sm font-medium text-foreground outline-none focus:border-primary"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs font-semibold text-muted-foreground block mb-1.5">Ritorno</label>
                  <input
                    type="date"
                    value={returnDate}
                    min={departureDate || today}
                    onChange={(e) => setReturnDate(e.target.value)}
                    className="w-full border border-border rounded-xl px-3 py-2 text-sm font-medium text-foreground outline-none focus:border-primary"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Persone */}
          <div ref={personaRef} className="relative md:flex-1">
            <button
              type="button"
              onClick={() => { setPersonaOpen((v) => !v); setDateOpen(false); }}
              className="w-full flex items-center gap-4 px-4 py-3 rounded-2xl hover:bg-muted/50 transition-colors text-left"
            >
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                <Users className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground font-medium">Persone</p>
                <p className={`font-bold text-sm truncate ${peopleLabel ? "text-foreground" : "text-muted-foreground/50"}`}>
                  {peopleLabel || "Adulti e bambini"}
                </p>
              </div>
            </button>

            {personaOpen && (
              <div className="absolute top-full left-0 mt-2 bg-white rounded-2xl shadow-2xl border border-border p-5 z-50 w-72 space-y-4">
                <Stepper label="Adulti" value={adults} min={1} max={20} onChange={setAdults} />
                <div className="h-px bg-border" />
                <Stepper label="Bambini" value={children} min={0} max={10} onChange={(v) => { setChildren(v); if (v === 0) setChildrenAges(""); }} />
                {children > 0 && (
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1.5">
                      Età bambini (es. 3, 7)
                    </label>
                    <input
                      type="text"
                      value={childrenAges}
                      onChange={(e) => setChildrenAges(e.target.value)}
                      placeholder={`${children} età separate da virgola`}
                      className="w-full border border-border rounded-xl px-3 py-2 text-sm outline-none focus:border-primary"
                    />
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setPersonaOpen(false)}
                  className="w-full text-sm font-semibold text-primary hover:underline text-center pt-1"
                >
                  Conferma
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Separatore */}
        <div className="hidden md:block h-px bg-border/60 mx-4" />

        {/* ── Riga 2: Nome · Email · Bottone ── */}
        <div className="flex flex-col md:flex-row md:items-center gap-3">

          {/* Nome */}
          <label className="flex items-center gap-4 px-4 py-3 rounded-2xl hover:bg-muted/50 transition-colors md:flex-1 cursor-text bg-muted/20">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
              <User className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground font-medium">Nome (opzionale)</p>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Il tuo nome"
                className="font-bold text-foreground text-sm bg-transparent outline-none w-full placeholder:font-bold placeholder:text-muted-foreground/50"
              />
            </div>
          </label>

          {/* Email */}
          <label className="flex items-center gap-4 px-4 py-3 rounded-2xl hover:bg-muted/50 transition-colors md:flex-1 cursor-text bg-[#e6e6e680]">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
              <Mail className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground font-medium">Email *</p>
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); if (error) setError(null); }}
                placeholder="La tua email"
                className="font-bold text-foreground text-sm bg-transparent outline-none w-full placeholder:font-bold placeholder:text-muted-foreground/50"
              />
            </div>
          </label>

          {/* Bottone */}
          <div className="px-4 md:px-0 shrink-0">
            <Button
              size="lg"
              onClick={handleSubmit}
              disabled={loading}
              className="w-full md:w-auto h-14 px-8 rounded-full hover:bg-accent/90 text-accent-foreground shadow-lg shadow-accent/30 whitespace-nowrap border-t-[#fa811ee6] border-r-[#fa811ee6] border-b-[#fa811ee6] border-l-[#fa811ee6] bg-[#fa811ee6] text-[20px]"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              ) : (
                <Search className="w-5 h-5 mr-2" />
              )}
              Richiedi preventivo
            </Button>
          </div>
        </div>

        {/* Messaggio errore */}
        {error && (
          <div className="flex items-center gap-2 text-red-600 text-sm px-4 pb-1">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}
      </motion.div>
    </div>
  );
}
