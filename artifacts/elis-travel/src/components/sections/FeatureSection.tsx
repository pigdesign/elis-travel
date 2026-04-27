import { motion } from "framer-motion";
import { Button } from "@/components/shared/Button";
import { CheckCircle2 } from "lucide-react";

export function FeatureSection() {
  return (
    <section className="py-24 bg-background overflow-hidden" id="about">
      <div className="container mx-auto px-4 md:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          
          {/* Left: Text Content */}
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
          >
            <span className="text-primary font-bold tracking-wider uppercase text-sm mb-4 block">I nostri valori</span>
            <h2 className="brand-title brand-title-primary text-4xl md:text-5xl lg:text-6xl mb-6 leading-tight">Gite organizzate in destinazioni bellissime ogni mese</h2>
            <p className="text-muted-foreground text-lg mb-8 leading-relaxed">
              Con oltre 20 anni di esperienza, curiamo le esperienze di viaggio più spettacolari. Crediamo che il viaggio debba essere senza stress, coinvolgente e trasformativo.
            </p>

            <ul className="space-y-4 mb-10">
              {['Guide locali esperte', 'Strutture selezionate', 'Assistenza premium 24/7'].map((feature, i) => (
                <li key={i} className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-accent/20 flex items-center justify-center text-accent">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <span className="font-semibold text-foreground">{feature}</span>
                </li>
              ))}
            </ul>

            <div className="grid grid-cols-3 gap-6 mb-10 pt-8 border-t border-border">
              <div>
                <div className="text-4xl font-bold text-primary mb-1">20+</div>
                <div className="text-sm text-muted-foreground font-medium">Anni di esperienza</div>
              </div>
              <div>
                <div className="text-4xl font-bold text-primary mb-1">30k</div>
                <div className="text-sm text-muted-foreground font-medium">Clienti soddisfatti</div>
              </div>
              <div>
                <div className="text-4xl font-bold text-primary mb-1">130+</div>
                <div className="text-sm text-muted-foreground font-medium">Destinazioni</div>
              </div>
            </div>

            <Button size="lg" className="h-14 px-8 text-base bg-primary hover:bg-primary/90 text-white">
              Scopri di più
            </Button>
          </motion.div>

          {/* Right: Images */}
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="relative h-[600px]"
          >
            {/* Decorative blobs */}
            <div className="absolute top-10 right-10 w-64 h-64 bg-accent/20 rounded-full blur-3xl" />
            <div className="absolute bottom-10 left-10 w-64 h-64 bg-primary/20 rounded-full blur-3xl" />
            
            <div className="absolute top-0 right-0 w-[70%] h-[70%] rounded-[3rem] overflow-hidden shadow-2xl border-8 border-white z-10">
              <img src="/images/dest-italy.png" alt="Travel" className="w-full h-full object-cover" />
            </div>
            
            <div className="absolute bottom-0 left-0 w-[60%] h-[60%] rounded-[3rem] overflow-hidden shadow-2xl border-8 border-white z-20">
              <img src="/images/tour-3.png" alt="Travel" className="w-full h-full object-cover" />
            </div>
          </motion.div>

        </div>
      </div>
    </section>
  );
}
