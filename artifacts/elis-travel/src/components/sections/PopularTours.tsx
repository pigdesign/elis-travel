import { motion } from "framer-motion";
import { TourCard } from "@/components/shared/TourCard";

const TOURS = [
  {
    id: 1,
    title: "Resort & Spa di lusso alle Maldive",
    location: "Maldives",
    duration: "7 giorni, 6 notti",
    price: "$2,400",
    rating: 4.9,
    image: "/images/tour-1.png"
  },
  {
    id: 2,
    title: "Avventura a Roma e al Colosseo",
    location: "Rome, Italy",
    duration: "5 giorni, 4 notti",
    price: "$1,250",
    rating: 4.8,
    image: "/images/tour-2.png"
  },
  {
    id: 3,
    title: "Fuga tropicale a Bali",
    location: "Bali, Indonesia",
    duration: "8 giorni, 7 notti",
    price: "$1,800",
    rating: 4.9,
    image: "/images/tour-3.png"
  }
];

export function PopularTours() {
  return (
    <section className="py-24 bg-muted/30" id="tours">
      <div className="container mx-auto px-4 md:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="flex flex-col items-center text-center mb-16"
        >
          <span className="text-primary font-bold tracking-wider uppercase text-sm mb-4 block">Tour in evidenza</span>
          <h2 className="brand-title brand-title-primary text-[60px] mb-4">Scopri le nostre migliori Offerte</h2>
          <p className="text-muted-foreground max-w-xl">
            Itinerari curati con attenzione per la fuga perfetta. Che tu cerchi relax o avventura, abbiamo il tour ideale per te.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {TOURS.map((tour, index) => (
            <motion.div
              key={tour.id}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1, duration: 0.5 }}
            >
              <TourCard {...tour} />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
