import { motion } from "framer-motion";
import { TestimonialCard } from "@/components/shared/TestimonialCard";

// SEGNAPOSTO: questi tre testi sono di esempio e NON vanno pubblicati come
// recensioni di clienti. Prima del lancio vanno sostituiti con recensioni vere
// (Google, email o messaggi dei clienti, con il loro consenso), riportate come
// le ha scritte il cliente: nome e iniziale del cognome, gita e periodo, fonte.
// Recensioni inventate presentate come vere sono vietate dal Codice del Consumo
// (art. 23, introdotto dal D.Lgs. 26/2023).
const TESTIMONIALS = [
  {
    id: 1,
    name: "Giulia B.",
    trip: "Viaggiatrice",
    rating: 5,
    text: "Elis Travel ha organizzato tutto il nostro viaggio in Italia ed è stato impeccabile. Dal tour privato del Colosseo alle gemme nascoste delle Cinque Terre, ogni dettaglio era perfetto."
  },
  {
    id: 2,
    name: "Marco R.",
    trip: "Fotografo",
    rating: 5,
    text: "L'attenzione ai dettagli è impareggiabile. Ci hanno trovato hotel boutique con viste incredibili. Consiglio i loro servizi a chiunque cerchi un viaggio unico."
  },
  {
    id: 3,
    name: "Elena M.",
    trip: "In luna di miele",
    rating: 5,
    text: "La nostra luna di miele alle Maldive è stata letteralmente un sogno che si è avverato. Elis Travel ha pensato a tutto, così abbiamo potuto rilassarci e goderci il tempo insieme."
  }
];

export function Testimonials() {
  return (
    <section className="py-20 md:py-32 bg-muted/20 relative overflow-hidden">
      <div className="container relative z-10 mx-auto px-4 md:px-8">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center max-w-2xl mx-auto mb-12 md:mb-20"
        >
          <span className="text-primary font-bold tracking-wider uppercase text-sm mb-4 block">Recensioni top</span>
          <h2 className="brand-title brand-title-primary text-4xl md:text-5xl" style={{ color: "#fa811e" }}>Cosa dicono i nostri clienti</h2>
        </motion.div>

        <div className="-mx-4 mt-12 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 scrollbar-none md:mx-0 md:grid md:snap-none md:grid-cols-3 md:gap-8 md:overflow-visible md:px-0 md:pb-0">
          {TESTIMONIALS.map((review, index) => (
            <motion.div
              key={review.id}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1, duration: 0.5 }}
              className="h-full w-[85%] shrink-0 snap-center sm:w-[60%] md:w-auto"
            >
              <TestimonialCard {...review} />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
