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

export function WhyChooseUs() {
  return (
    <section className="py-24 bg-accent relative overflow-hidden">
      {/* Decorative background elements */}
      <div className="absolute top-0 left-0 w-full h-full opacity-10">
        <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" className="w-[120%] h-[120%] -translate-x-1/4 -translate-y-1/4">
          <path fill="#000000" d="M42.7,-73.4C55.9,-67.2,67.6,-56.3,76.5,-43.3C85.4,-30.3,91.6,-15.1,91.4,-0.1C91.2,14.9,84.6,29.8,75.4,42.4C66.2,55,54.4,65.3,40.9,72C27.4,78.7,13.7,81.8,-0.1,82C-13.9,82.2,-27.8,79.5,-40.8,72.9C-53.8,66.3,-66,55.8,-73.7,42.6C-81.4,29.4,-84.6,14.7,-84.7,-0.1C-84.8,-14.9,-81.8,-29.8,-74.3,-43C-66.8,-56.2,-54.2,-67.7,-40.4,-73.6C-26.6,-79.5,-13.3,-79.9,0.7,-81C14.7,-82.1,29.5,-79.6,42.7,-73.4Z" transform="translate(100 100)" />
        </svg>
      </div>

      <div className="container relative z-10 mx-auto px-4 md:px-8">
        <div className="bg-primary/5 rounded-[3rem] p-8 md:p-16 border border-primary/10 shadow-2xl backdrop-blur-sm">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <h2 className="brand-title brand-title-primary text-4xl md:text-5xl mb-6">Perché scegliere Elis Travel?</h2>
              <p className="text-foreground/80 text-lg mb-8">
                Andiamo oltre i pacchetti standard. Creiamo esperienze che rispecchiano i tuoi sogni, con un team che cura ogni dettaglio del viaggio.
              </p>
              
              <ul className="space-y-4 mb-10">
                {REASONS.map((reason, i) => (
                  <li key={i} className="flex items-center gap-3">
                    <CheckCircle2 className="w-6 h-6 text-primary shrink-0" />
                    <span className="font-semibold text-foreground/90 text-lg">{reason}</span>
                  </li>
                ))}
              </ul>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              className="bg-white rounded-3xl p-10 text-center shadow-xl max-w-md mx-auto lg:ml-auto"
            >
              <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6 text-primary">
                <PhoneCall className="w-10 h-10" />
              </div>
              <h3 className="brand-title brand-title-accent text-2xl mb-4">Hai bisogno di aiuto per prenotare?</h3>
              <p className="text-muted-foreground mb-6">Chiama i nostri esperti di viaggio in qualsiasi momento. Siamo qui per aiutarti a organizzare tutto.</p>
              <div className="text-3xl font-bold text-primary mb-8 tracking-wide">+39 06 1234 5678</div>
              <Button size="lg" className="w-full h-14 bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/30">
                Chiamaci ora
              </Button>
            </motion.div>

          </div>
        </div>
      </div>
    </section>
  );
}
