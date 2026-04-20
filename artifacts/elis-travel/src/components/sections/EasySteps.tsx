import { motion } from "framer-motion";
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
    <section className="py-24 bg-background">
      <div className="container mx-auto px-4 md:px-8">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center max-w-2xl mx-auto mb-20"
        >
          <span className="text-primary font-bold tracking-wider uppercase text-sm mb-4 block">Come funziona</span>
          <h2 className="text-4xl md:text-5xl font-bold font-serif mb-6 text-foreground">3 semplici passi per prenotare il tuo prossimo viaggio</h2>
        </motion.div>

        <div className="relative">
          {/* Connecting Line */}
          <div className="hidden md:block absolute top-12 left-[10%] right-[10%] h-0.5 bg-border border-dashed border-t-2" />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 text-center">
            {STEPS.map((step, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.2, duration: 0.5 }}
                className="relative z-10"
              >
                <div className={`w-24 h-24 mx-auto rounded-full ${step.color} flex items-center justify-center mb-6 shadow-lg shadow-black/5`}>
                  <step.icon className="w-10 h-10" />
                </div>
                <div className="absolute top-0 right-1/4 -mt-4 w-8 h-8 rounded-full bg-foreground text-white font-bold flex items-center justify-center border-4 border-background">
                  {index + 1}
                </div>
                <h3 className="text-xl font-bold mb-4 text-foreground">{step.title}</h3>
                <p className="text-muted-foreground">{step.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
