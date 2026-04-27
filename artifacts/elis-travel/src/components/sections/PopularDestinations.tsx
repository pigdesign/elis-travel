import { motion } from "framer-motion";
import { DestinationCard } from "@/components/shared/DestinationCard";

const DESTINATIONS = [
  {
    id: 1,
    name: "Cinque Terre",
    country: "Italy",
    image: "/images/dest-italy.png",
    placesCount: 15
  },
  {
    id: 2,
    name: "Santorini",
    country: "Greece",
    image: "/images/dest-greece.png",
    placesCount: 22
  },
  {
    id: 3,
    name: "Kyoto",
    country: "Japan",
    image: "/images/dest-japan.png",
    placesCount: 18
  },
  {
    id: 4,
    name: "Swiss Alps",
    country: "Switzerland",
    image: "/images/dest-swiss.png",
    placesCount: 12
  }
];

export function PopularDestinations() {
  return (
    <section className="py-20 bg-background" id="destinations">
      <div className="container mx-auto px-4 md:px-8 text-[#0489ae] border-t-[#0489ae] border-r-[#0489ae] border-b-[#0489ae] border-l-[#0489ae] text-[63px]">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center max-w-2xl mx-auto mb-16"
        >
          <span className="text-primary font-bold tracking-wider uppercase text-sm mb-4 block">Mete top</span>
          <h2 className="brand-title md:text-5xl mb-6 text-[#0489ae] border-t-[#0489ae] border-r-[#0489ae] border-b-[#0489ae] border-l-[#0489ae] text-[61px]">Esplora le destinazioni più amate</h2>
          <p className="text-muted-foreground text-lg">
            Scopri la nostra selezione curata dei luoghi più belli del mondo.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {DESTINATIONS.map((dest, index) => (
            <motion.div
              key={dest.id}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1, duration: 0.5 }}
            >
              <DestinationCard {...dest} />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
