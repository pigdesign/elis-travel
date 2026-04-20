import { motion } from "framer-motion";
import { MapPin, CalendarCheck, PlaneTakeoff } from "lucide-react";
import summerHero from "@assets/image_1776684583552.png";

const STEPS = [
  {
    icon: MapPin,
    title: "Scegli la destinazione",
    desc: "Scegli tra la nostra ampia selezione di destinazioni curate con attenzione in tutto il mondo.",
    color: "bg-blue-100 text-blue-600"
  },
  {
    icon: CalendarCheck,
    title: "Prenota un tour",
    desc: "Scegli l'itinerario perfetto e prenota facilmente il tuo posto con la nostra piattaforma sicura.",
    color: "bg-primary/20 text-primary"
  },
  {
    icon: PlaneTakeoff,
    title: "Goditi il viaggio",
    desc: "Prepara le valigie, lascia a noi la logistica e goditi un viaggio indimenticabile.",
    color: "bg-accent/20 text-accent"
  }
];

export function EasySteps() {
  return (
    <section className="py-24 bg-background overflow-hidden">
      <div className="container mx-auto px-4 md:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-[0.9fr_1.2fr_1fr] gap-10 items-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="lg:self-start"
          >
            <span className="text-primary font-bold tracking-wider uppercase text-sm mb-4 block">Come funziona</span>
            <h2 className="brand-title brand-title-primary text-4xl md:text-5xl mb-8 leading-tight">
              3 semplici passi per prenotare il tuo prossimo viaggio
            </h2>
            <div className="rounded-[2rem] overflow-hidden shadow-2xl bg-white">
              <div className="relative h-[340px]">
                <img src={summerHero} alt="Viaggio estivo" className="w-full h-full object-cover object-center" />
              </div>
              <div className="bg-accent text-accent-foreground p-6">
                <p className="text-sm font-semibold uppercase tracking-wider">Offerta speciale</p>
                <div className="flex items-end gap-2 mt-2">
                  <span className="text-6xl font-black leading-none">48</span>
                  <div className="pb-2">
                    <span className="text-2xl font-black">%</span>
                    <p className="text-sm font-semibold">di sconto</p>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>

          <div className="space-y-5">
            {STEPS.map((step, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: 40 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.15, duration: 0.5 }}
                className="flex items-center gap-4 rounded-[2rem] bg-white p-4 md:p-5 shadow-[0_16px_40px_rgba(9,168,195,0.12)]"
              >
                <div className="w-16 h-16 rounded-2xl bg-primary text-white flex items-center justify-center font-black text-2xl shrink-0">
                  {String(index + 1).padStart(2, "0")}
                </div>
                <div className="flex-1">
                  <h3 className="brand-title brand-title-accent text-lg mb-1">{step.title}</h3>
                  <p className="text-sm text-muted-foreground">{step.desc}</p>
                </div>
                <div className="w-16 h-16 rounded-full border-4 border-accent/80 flex items-center justify-center text-accent shrink-0">
                  <step.icon className="w-7 h-7" />
                </div>
              </motion.div>
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            className="hidden lg:block relative"
          >
            <div className="absolute inset-0 -left-6 -top-6 rounded-full bg-primary/10 blur-3xl" />
            <img src={summerHero} alt="Viaggiatrice estiva" className="relative z-10 w-full h-auto object-contain drop-shadow-2xl" />
            <div className="absolute right-4 top-8 text-accent font-script text-7xl -rotate-90 origin-right">
              Summer!
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
