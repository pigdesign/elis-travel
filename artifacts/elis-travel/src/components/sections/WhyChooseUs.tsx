import { motion } from "framer-motion";
import { PhoneCall, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/shared/Button";

const REASONS = [
  "Soluzioni personalizzate in base al tuo stile di viaggio",
  "Accesso esclusivo a servizi VIP",
  "Supporto dedicato 24/7 durante il viaggio",
  "Nessun costo nascosto o sorpresa",
  "Conoscenza locale e guide esperte"
];

const REASON_ICON_COLORS = [
  "#ffffff",
  "#ffe0b2",
  "#fff3e0",
  "#ffffff",
  "#ffe0b2",
];

const REASON_TEXT_COLORS = [
  "#ffffff",
  "#fff3e0",
  "#ffe0b2",
  "#ffffff",
  "#fff3e0",
];

export function WhyChooseUs() {
  return (
    <section
      className="py-24 relative overflow-hidden"
      style={{ background: "linear-gradient(135deg, #fa811e 0%, #ff9a3d 100%)" }}
    >
      <div className="container relative z-10 mx-auto px-4 md:px-8">
        <div
          className="rounded-[3rem] p-8 md:p-16 backdrop-blur-sm"
          style={{
            boxSizing: "content-box",
            borderWidth: 0,
            borderStyle: "solid",
            borderColor: "var(--tw-ring-offset-color)",
          }}
        >
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <h2 className="brand-title text-4xl md:text-5xl mb-6" style={{ color: "#ffffff" }}>
                Perché scegliere Elis Travel?
              </h2>
              <p className="text-lg mb-8" style={{ color: "#ffffff" }}>
                Andiamo oltre i pacchetti standard. Creiamo esperienze che rispecchiano i tuoi sogni, con un team che cura ogni dettaglio del viaggio.
              </p>

              <ul className="space-y-4 mb-10">
                {REASONS.map((reason, i) => (
                  <li key={i} className="flex items-center gap-3">
                    <CheckCircle2
                      className="w-8 h-8 shrink-0"
                      style={{ color: REASON_ICON_COLORS[i] }}
                    />
                    <span className="font-semibold text-lg" style={{ color: REASON_TEXT_COLORS[i] }}>
                      {reason}
                    </span>
                  </li>
                ))}
              </ul>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              className="rounded-3xl p-10 text-center max-w-md mx-auto lg:ml-auto"
              style={{
                backgroundColor: "transparent",
                borderWidth: 4,
                borderStyle: "dotted",
                borderColor: "var(--tw-ring-offset-color)",
              }}
            >
              <div
                className="rounded-full flex items-center justify-center mx-auto mb-6"
                style={{
                  color: "#ffffff",
                  backgroundColor: "transparent",
                  width: 98,
                  height: 98,
                }}
              >
                <PhoneCall style={{ width: 40, height: 40 }} />
              </div>
              <h3 className="brand-title text-2xl mb-4" style={{ color: "#ffffff" }}>
                Hai bisogno di aiuto per prenotare?
              </h3>
              <p className="mb-6" style={{ color: "#ffffff" }}>
                Chiama i nostri esperti di viaggio in qualsiasi momento. Siamo qui per aiutarti a organizzare tutto.
              </p>
              <div className="text-3xl font-bold mb-8 tracking-wide" style={{ color: "#ffffff" }}>
                +39 06 1234 5678
              </div>
              <Button size="lg" className="w-full h-14 bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/30 text-[20px] font-bold">
                Chiamaci ora
              </Button>
            </motion.div>

          </div>
        </div>
      </div>
    </section>
  );
}
