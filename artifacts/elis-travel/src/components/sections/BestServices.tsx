import { motion } from "framer-motion";
import { Sailboat, Calendar, UserCheck } from "lucide-react";
import travelerImg from "@assets/elis_travel_offerte.png_1776682556019.webp";

// Colori delle tre fasi (grafica di Davide): badge sfumato e icona nello
// stesso tono.
const SERVICES = [
  {
    icon: Sailboat,
    title: "Viaggio esclusivo",
    desc: "Prestiamo attenzione a ogni dettaglio del servizio che ti offriamo.",
    stepNum: "01",
    color: "#00B4D8",
    badge: "linear-gradient(145deg, #2cc9ec 0%, #0096c7 100%)",
  },
  {
    icon: Calendar,
    title: "Prenotazione facile",
    desc: "Ti seguiamo con un processo di prenotazione semplice e assistenza completa.",
    stepNum: "02",
    color: "#F97316",
    badge: "linear-gradient(145deg, #fb9a3c 0%, #f2650a 100%)",
  },
  {
    icon: UserCheck,
    title: "Guida professionale",
    desc: "Durante la vacanza sarai accompagnato dalla nostra guida professionale.",
    stepNum: "03",
    color: "#14A88F",
    badge: "linear-gradient(145deg, #2fcaa9 0%, #0f9a82 100%)",
  },
];

export function BestServices() {
  return (
    <section className="relative mt-[60px] md:mt-20 text-white overflow-hidden" style={{ backgroundColor: "#3ca8a7" }}>
      {/* Top Curve */}
      <div className="absolute top-0 left-0 w-full overflow-hidden leading-none z-10 -translate-y-full rotate-180">
        <svg
          data-name="Layer 1"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 1200 120"
          preserveAspectRatio="none"
          className="relative block w-full h-[60px] md:h-[120px] fill-current"
          style={{ color: "#3ca8a7" }}
        >
          <path d="M321.39,56.44c58-10.79,114.16-30.13,172-41.86,82.39-16.72,168.19-17.73,250.45-.39C823.78,31,906.67,72,985.66,92.83c70.05,18.48,146.53,26.09,214.34,3V120H0V95.8C59.71,118,130.85,121.32,192.5,108.5,236.4,99.5,279.7,80.4,321.39,56.44Z"></path>
        </svg>
      </div>

      {/* Desktop image — absolute in section, full height, natural proportions */}
      <motion.div
        initial={{ opacity: 0, x: -30 }}
        whileInView={{ opacity: 1, x: 0 }}
        viewport={{ once: true }}
        className="hidden lg:block absolute z-10"
        style={{
          top: 0,
          bottom: 0,
          left: "max(0px, calc(50% - 36rem))",
          width: "32rem",
        }}
      >
        <img
          src={travelerImg}
          alt="Traveler"
          style={{
            position: "absolute",
            bottom: 0,
            left: "50%",
            transform: "translateX(-50%)",
            height: "100%",
            width: "auto",
            maxWidth: "none",
          }}
        />
      </motion.div>

      {/* Sotto lg (grafica di Davide): il viaggiatore grande a sinistra, tagliato
          dal bordo dello schermo, indica col dito il titolo nella colonna a
          destra; la prima card gli copre le ginocchia. Tutte le misure sono in
          "u" = 1vw, con un tetto sui tablet così la scena non diventa enorme
          (riferimento: telefono da 390px, u = 3,9px). */}
      <div
        className="relative lg:hidden"
        style={{ ["--u" as string]: "min(1vw, 4.6px)", height: "calc(var(--u) * 124)" }}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 overflow-hidden"
          style={{
            height: "calc(var(--u) * 124 + 64px)",
            // sfuma il bordo destro della foto (dietro l'uomo ha un alone più
            // chiaro) e il fondo, che finisce sotto la prima card
            maskImage:
              "linear-gradient(to bottom, black calc(100% - 96px), transparent), linear-gradient(to right, black calc(var(--u) * 58), transparent calc(var(--u) * 71))",
            WebkitMaskImage:
              "linear-gradient(to bottom, black calc(100% - 96px), transparent), linear-gradient(to right, black calc(var(--u) * 58), transparent calc(var(--u) * 71))",
            maskComposite: "intersect",
            WebkitMaskComposite: "source-in",
          }}
        >
          <img
            src={travelerImg}
            alt=""
            className="absolute max-w-none select-none"
            style={{
              // la foto finisce a 71,5u: la sfumatura a destra deve chiudersi prima
              width: "calc(var(--u) * 118)",
              left: "calc(var(--u) * -46.5)",
              top: "calc(var(--u) * -5.1)",
            }}
          />
        </div>

        {/* i due trattini accanto al dito */}
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute left-0 top-0"
          style={{ width: "calc(var(--u) * 100)", height: "calc(var(--u) * 124)" }}
          viewBox="0 0 100 124"
          fill="none"
          stroke="white"
          strokeWidth="0.9"
          strokeLinecap="round"
        >
          <line x1="44.6" y1="23.2" x2="47.2" y2="27.4" />
          <line x1="40.4" y1="28.6" x2="44.8" y2="30.2" />
        </svg>

        <div
          className="relative pr-3 sm:pr-8"
          style={{ paddingLeft: "calc(var(--u) * 53)", paddingTop: "calc(var(--u) * 25)" }}
        >
          <h2
            className="brand-title brand-title-accent mb-3 text-[#ffffff] text-left font-extrabold"
            style={{ fontSize: "calc(var(--u) * 8.4)" }}
          >
            Offriamo i migliori <span className="text-white">servizi</span>
          </h2>
          <p className="text-white/90 leading-snug" style={{ fontSize: "calc(var(--u) * 4)" }}>
            Vivi soluzioni di viaggio complete pensate per darti serenità. Pensiamo a tutto noi, così puoi concentrarti solo sull'esplorare il mondo.
          </p>
        </div>
      </div>

      {/* Content container */}
      <div className="relative z-20 mx-auto max-w-6xl">
        <div className="flex flex-col lg:flex-row">
          {/* Spacer: mirrors image column width */}
          <div className="hidden lg:block flex-shrink-0" style={{ width: "30rem" }} />

          {/* RIGHT: Content */}
          <div className="flex-1 px-5 sm:px-8 lg:pl-12 lg:pr-[30px] pt-0 pb-12 md:pb-[70px] lg:py-[70px]">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="hidden lg:block"
            >
              <h2 className="brand-title brand-title-accent mb-6 text-[#ffffff] text-center text-[64px] xl:text-[83px] font-extrabold">
                Offriamo i migliori <span className="text-white">servizi</span>
              </h2>
              <p className="text-white/80 text-lg max-w-xl mb-8">
                Vivi soluzioni di viaggio complete pensate per darti serenità. Pensiamo a tutto noi, così puoi concentrarti solo sull'esplorare il mondo.
              </p>
            </motion.div>
            
            {/* Le tre fasi: righe compatte, una sotto l'altra, con il badge
                "Fase" che sporge in alto a sinistra (grafica di Davide). Niente
                freccia: le righe non portano a un'altra pagina. */}
            <div className="space-y-4 lg:mt-10 lg:space-y-5">
              {SERVICES.map((service, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1, duration: 0.5 }}
                  className="relative pl-3 pt-2 sm:pl-4 sm:pt-2.5"
                >
                  <div className="flex min-h-[96px] items-center gap-3 rounded-[26px] bg-white py-4 pl-[64px] pr-5 shadow-[0_6px_28px_rgba(0,0,0,0.09)] transition-transform duration-300 hover:-translate-y-1 sm:min-h-[104px] sm:gap-4 sm:pl-[80px] sm:pr-6">
                    <service.icon
                      className="h-9 w-9 shrink-0 sm:h-10 sm:w-10"
                      strokeWidth={1.5}
                      style={{ color: service.color }}
                    />
                    <div className="min-w-0 flex-1">
                      <h3 className="text-[15px] font-bold leading-snug text-[#0d3b66] sm:text-base">
                        {service.title}
                      </h3>
                      <p className="mt-0.5 text-[13px] leading-snug text-gray-500 sm:text-sm">
                        {service.desc}
                      </p>
                    </div>
                  </div>
                  <div
                    className="absolute left-0 top-0 flex h-[64px] w-[64px] flex-col items-center justify-center rounded-2xl text-white shadow-[0_8px_20px_rgba(0,0,0,0.18)] sm:h-[76px] sm:w-[76px] sm:rounded-[20px]"
                    style={{ background: service.badge }}
                  >
                    <span className="text-[11px] font-semibold leading-none sm:text-xs">Fase</span>
                    <span className="mt-1 text-[26px] font-black leading-none sm:text-[30px]">
                      {service.stepNum}
                    </span>
                  </div>
                </motion.div>
              ))}
            </div>
            
          </div>
          
        </div>
      </div>
    </section>
  );
}
