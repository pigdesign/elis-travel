import { motion } from "framer-motion";
import { TourCard } from "@/components/shared/TourCard";

const TOURS = [
  {
    id: 1,
    title: "Luxury Maldives Resort & Spa",
    location: "Maldives",
    duration: "7 Days, 6 Nights",
    price: "$2,400",
    rating: 4.9,
    image: "/images/tour-1.png"
  },
  {
    id: 2,
    title: "Rome and Colosseum Adventure",
    location: "Rome, Italy",
    duration: "5 Days, 4 Nights",
    price: "$1,250",
    rating: 4.8,
    image: "/images/tour-2.png"
  },
  {
    id: 3,
    title: "Bali Tropical Island Escape",
    location: "Bali, Indonesia",
    duration: "8 Days, 7 Nights",
    price: "$1,800",
    rating: 4.9,
    image: "/images/tour-3.png"
  }
];

export function PopularTours() {
  return (
    <section className="py-24 bg-muted/30" id="tours">
      <div className="container mx-auto px-4 md:px-8">
        <div className="flex flex-col md:flex-row justify-between items-end mb-16">
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="max-w-2xl"
          >
            <span className="text-primary font-bold tracking-wider uppercase text-sm mb-4 block">Our Featured Tours</span>
            <h2 className="text-4xl md:text-5xl font-bold font-serif text-foreground">Explore Popular Tours</h2>
          </motion.div>
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="mt-6 md:mt-0"
          >
            <p className="text-muted-foreground max-w-md text-right">
              Carefully crafted itineraries for the perfect getaway. Whether you seek relaxation or adventure, we have the perfect tour for you.
            </p>
          </motion.div>
        </div>

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
