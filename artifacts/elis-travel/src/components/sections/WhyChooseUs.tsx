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
