import { motion } from "framer-motion";
import { Button } from "@/components/shared/Button";

export function AdventureHero() {
  return (
    <section className="relative py-32 flex items-center justify-center overflow-hidden">
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-primary/60 mix-blend-multiply z-10" />
        <img
          src="/images/adventure-bg.png"
          alt="Adventure Travel"
          className="w-full h-full object-cover"
        />
      </div>

      <div className="container relative z-20 mx-auto px-4 md:px-8 text-center text-white">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="max-w-3xl mx-auto bg-black/20 backdrop-blur-md p-8 md:p-16 rounded-[3rem] border border-white/20"
        >
          <h2 className="text-5xl md:text-7xl font-bold font-serif mb-6 text-accent">Avventura: è il momento di viaggiare</h2>
          <p className="text-lg md:text-xl text-white/90 mb-10 leading-relaxed font-light">
            Non aspettare il momento perfetto. Crealo. Prepara le valigie, lascia i pensieri a casa e lascia che ti guidiamo verso le meraviglie più spettacolari del mondo.
          </p>
          <Button size="lg" className="h-16 px-10 text-lg bg-accent hover:bg-accent/90 text-accent-foreground rounded-full shadow-xl shadow-accent/20">
            Prenota la tua avventura
          </Button>
        </motion.div>
      </div>
    </section>
  );
}
