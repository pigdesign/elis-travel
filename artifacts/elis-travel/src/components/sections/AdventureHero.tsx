import { motion } from "framer-motion";
import { Link } from "wouter";
import { Button } from "@/components/shared/Button";

export function AdventureHero() {
  return (
    <section className="relative overflow-hidden py-24 md:py-32">
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 z-10 bg-black/35" />
        <img
          src="/images/adventure-bg.jpg"
          alt="Adventure Travel"
          className="h-full w-full object-cover"
        />
      </div>

      <div className="absolute inset-x-0 top-0 z-10 h-16 bg-gradient-to-b from-black/70 to-transparent" />

      <div className="container relative z-20 mx-auto px-4 md:px-8 text-white">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="relative mx-auto flex max-w-6xl items-center justify-center"
        >
          <div className="relative z-20 mx-auto mb-[-2.5rem] flex justify-center md:hidden">
            <img
              src="/images/avventura_people.png"
              alt="Coppia pronta per l'avventura"
              className="w-[78%] max-w-[320px] object-contain drop-shadow-[0_18px_30px_rgba(0,0,0,0.45)]"
            />
          </div>

          <img
            src="/images/avventura_people.png"
            alt="Coppia pronta per l'avventura"
            className="pointer-events-none absolute inset-y-0 left-[-1.5rem] z-20 hidden h-full w-auto max-w-none object-contain drop-shadow-[0_22px_40px_rgba(0,0,0,0.45)] md:block lg:left-0"
          />

          <div className="relative w-full max-w-4xl rounded-[2.5rem] border border-white/15 bg-black/35 px-6 pb-10 pt-16 text-center shadow-[0_28px_70px_rgba(0,0,0,0.35)] backdrop-blur-xl md:px-12 md:pb-14 md:pt-14 md:pl-52 lg:px-16 lg:py-16 lg:pl-72">
            <h2 className="brand-title brand-title-accent mb-6 text-4xl md:text-6xl lg:text-7xl">
              Avventura: è il momento di viaggiare
            </h2>
            <p className="mx-auto mb-10 max-w-2xl text-[17px] leading-relaxed text-white/80 md:text-[17px]">
              Non aspettare il momento perfetto. Crealo. Prepara le valigie,
              lascia i pensieri a casa e lascia che ti guidiamo verso le
              meraviglie più spettacolari del mondo.
            </p>
            <Link href="/offerte">
              <Button
                size="lg"
                className="h-14 rounded-full bg-accent px-8 text-base text-accent-foreground shadow-xl shadow-accent/20 hover:bg-accent/90 md:h-16 md:px-10 md:text-lg"
              >
                Prenota la tua avventura
              </Button>
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
