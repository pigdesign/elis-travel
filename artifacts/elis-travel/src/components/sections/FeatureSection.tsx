import { motion } from "framer-motion";
import { Link } from "wouter";
import { Button } from "@/components/shared/Button";
import { CheckCircle2 } from "lucide-react";

// Le due foto sovrapposte: sul desktop nella colonna di destra, sotto lg
// subito dopo il testo introduttivo (prima finivano in fondo alla sezione).
const PHOTOS = (
  <>
    {/* Decorative blobs */}
    <div className="absolute top-10 right-10 w-64 h-64 bg-accent/20 rounded-full blur-3xl" />
    <div className="absolute bottom-10 left-10 w-64 h-64 bg-primary/20 rounded-full blur-3xl" />

    <div className="absolute top-0 right-0 w-[70%] h-[70%] rounded-[3rem] overflow-hidden shadow-2xl border-8 border-white z-10">
      <img src="/images/dest-italy.webp" alt="Travel" className="w-full h-full object-cover" />
    </div>

    <div className="absolute bottom-0 left-0 w-[60%] h-[60%] rounded-[3rem] overflow-hidden shadow-2xl border-8 border-white z-20">
      <img src="/images/tour-3.webp" alt="Travel" className="w-full h-full object-cover" />
    </div>
  </>
);

export function FeatureSection() {
  return (
    <section className="py-12 md:py-24 bg-background overflow-hidden" id="about">
      <div className="container mx-auto px-4 md:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 lg:gap-16 items-center">
          
          {/* Left: Text Content */}
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
          >
            <span className="text-primary font-bold tracking-wider uppercase text-sm mb-4 block">I nostri valori</span>
            <h2 className="brand-title brand-title-primary text-4xl md:text-5xl xl:text-6xl mb-6 leading-tight">Gite organizzate in destinazioni bellissime ogni mese</h2>
            <p className="text-muted-foreground text-lg mb-8 leading-relaxed">
              Con oltre 20 anni di esperienza, curiamo le esperienze di viaggio più spettacolari. Crediamo che il viaggio debba essere senza stress, coinvolgente e trasformativo.
            </p>

            <div className="relative h-[320px] sm:h-[440px] mb-8 lg:hidden">{PHOTOS}</div>

            <ul className="space-y-4 mb-8 md:mb-10">
              {['Guide locali esperte', 'Strutture selezionate', 'Assistenza premium 24/7'].map((feature, i) => (
                <li key={i} className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-accent/20 flex items-center justify-center text-accent">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <span className="font-semibold text-foreground">{feature}</span>
                </li>
              ))}
            </ul>

            <div className="grid grid-cols-3 gap-3 sm:gap-6 mb-8 md:mb-10 pt-6 md:pt-8 border-t border-border">
              <div>
                <div className="text-3xl sm:text-4xl font-bold text-primary mb-1">20+</div>
                <div className="text-sm text-muted-foreground font-medium">Anni di esperienza</div>
              </div>
              <div>
                <div className="text-3xl sm:text-4xl font-bold text-primary mb-1">30k</div>
                <div className="text-sm text-muted-foreground font-medium">Clienti soddisfatti</div>
              </div>
              <div>
                <div className="text-3xl sm:text-4xl font-bold text-primary mb-1">130+</div>
                <div className="text-sm text-muted-foreground font-medium">Destinazioni</div>
              </div>
            </div>

            <div className="flex justify-center lg:block">
              <Link href="/gite">
                <Button size="lg" className="h-14 px-8 text-base bg-primary hover:bg-primary/90 text-white">
                  Scopri le gite ElisTravel
                </Button>
              </Link>
            </div>
          </motion.div>

          {/* Right: Images */}
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="relative hidden lg:block h-[600px]"
          >
            {PHOTOS}
          </motion.div>

        </div>
      </div>
    </section>
  );
}
