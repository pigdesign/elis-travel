import { motion } from "framer-motion";
import bgImg from "@assets/Gemini_Generated_Image_madap7madap7mada_1777289660530.png";
import { MapPin, CalendarCheck, PlaneTakeoff } from "lucide-react";
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
    <section
      className="py-24 overflow-hidden relative"
      style={{
        backgroundImage: `url(${bgImg})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <div className="absolute inset-0 bg-black/35" />
      <div className="relative z-10 container mx-auto px-4 md:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="lg:self-start"
          >
            <span className="text-accent font-bold tracking-wider uppercase text-sm mb-4 block">Come funziona</span>
            <h2 className="brand-title brand-title-primary md:text-5xl mb-8 text-[#ffffff] text-[61px]">
              3 semplici passi per
              <br />
              prenotare il tuo prossimo viaggio
            </h2>
          </motion.div>

          <div className="space-y-4">
            {STEPS.map((step, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: 40 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.15, duration: 0.5 }}
                className="flex items-center gap-4 rounded-[1.6rem] bg-white p-4 md:p-5 shadow-[0_16px_40px_rgba(9,168,195,0.12)]"
              >
                <div className="w-16 h-16 rounded-2xl bg-primary text-white flex items-center justify-center font-black text-2xl shrink-0">
                  {String(index + 1).padStart(2, "0")}
                </div>
                <div className="flex-1">
                  <h3 className="brand-title brand-title-primary text-base md:text-lg mb-1">{step.title}</h3>
                  <p className="text-xs md:text-sm text-muted-foreground max-w-[260px]">{step.desc}</p>
                </div>
                <div className="w-16 h-16 rounded-full border-4 border-accent/80 flex items-center justify-center text-accent shrink-0">
                  <step.icon className="w-7 h-7" />
                </div>
              </motion.div>
            ))}
          </div>

        </div>
      </div>
    </section>
  );
}
