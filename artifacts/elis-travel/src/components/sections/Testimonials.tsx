import { motion } from "framer-motion";
import { TestimonialCard } from "@/components/shared/TestimonialCard";

const TESTIMONIALS = [
  {
    id: 1,
    name: "Sarah Johnson",
    role: "Viaggiatrice",
    avatar: "https://i.pravatar.cc/150?u=a042581f4e29026024d",
    rating: 5,
    text: "Elis Travel ha organizzato tutto il nostro viaggio in Italia ed è stato impeccabile. Dal tour privato del Colosseo alle gemme nascoste delle Cinque Terre, ogni dettaglio era perfetto."
  },
  {
    id: 2,
    name: "Marco Rossi",
    role: "Fotografo",
    avatar: "https://i.pravatar.cc/150?u=a042581f4e29026704d",
    rating: 5,
    text: "L'attenzione ai dettagli è impareggiabile. Ci hanno trovato hotel boutique con viste incredibili. Consiglio i loro servizi a chiunque cerchi un viaggio unico."
  },
  {
    id: 3,
    name: "Emma Davis",
    role: "In luna di miele",
    avatar: "https://i.pravatar.cc/150?u=a04258114e29026702d",
    rating: 5,
    text: "La nostra luna di miele alle Maldive è stata letteralmente un sogno che si è avverato. Elis Travel ha pensato a tutto, così abbiamo potuto rilassarci e goderci il tempo insieme."
  }
];

export function Testimonials() {
  return (
    <section className="py-32 bg-muted/20 relative overflow-hidden">
      {/* Massive background text */}
      <div className="absolute top-10 left-0 w-full overflow-hidden flex justify-center pointer-events-none opacity-[0.03] z-0 select-none">
        <h2 className="text-[15rem] font-bold text-primary whitespace-nowrap leading-none tracking-tighter">
          TESTIMONIALS
        </h2>
      </div>

      <div className="container relative z-10 mx-auto px-4 md:px-8">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center max-w-2xl mx-auto mb-20"
        >
          <span className="text-primary font-bold tracking-wider uppercase text-sm mb-4 block">Recensioni top</span>
          <h2 className="brand-title brand-title-primary text-4xl md:text-5xl">Cosa dicono i nostri clienti</h2>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-12">
          {TESTIMONIALS.map((review, index) => (
            <motion.div
              key={review.id}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1, duration: 0.5 }}
            >
              <TestimonialCard {...review} />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
