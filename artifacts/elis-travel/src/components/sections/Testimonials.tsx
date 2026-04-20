import { motion } from "framer-motion";
import { TestimonialCard } from "@/components/shared/TestimonialCard";

const TESTIMONIALS = [
  {
    id: 1,
    name: "Sarah Johnson",
    role: "Traveler",
    avatar: "https://i.pravatar.cc/150?u=a042581f4e29026024d",
    rating: 5,
    text: "Elis Travel planned our entire Italy trip and it was flawless. From the private Colosseum tour to the hidden gems in Cinque Terre, every detail was perfect."
  },
  {
    id: 2,
    name: "Marco Rossi",
    role: "Photographer",
    avatar: "https://i.pravatar.cc/150?u=a042581f4e29026704d",
    rating: 5,
    text: "The attention to detail is unmatched. They found us boutique hotels with the most incredible views. I highly recommend their services to anyone looking for a unique trip."
  },
  {
    id: 3,
    name: "Emma Davis",
    role: "Honeymooner",
    avatar: "https://i.pravatar.cc/150?u=a04258114e29026702d",
    rating: 5,
    text: "Our honeymoon to the Maldives was literally a dream come true. Elis Travel took care of everything so we could just relax and enjoy our time together."
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
          <span className="text-primary font-bold tracking-wider uppercase text-sm mb-4 block">Top Reviews</span>
          <h2 className="text-4xl md:text-5xl font-bold font-serif text-foreground">What Our Clients Say</h2>
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
