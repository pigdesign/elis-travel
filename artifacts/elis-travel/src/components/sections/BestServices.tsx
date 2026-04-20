import { motion } from "framer-motion";
import { Plane, Building, Map, Ship } from "lucide-react";

const SERVICES = [
  {
    icon: Plane,
    title: "Flight Booking",
    desc: "Seamless flight booking experience with best rates."
  },
  {
    icon: Building,
    title: "Hotel Booking",
    desc: "Luxury and comfortable stays at prime locations."
  },
  {
    icon: Map,
    title: "Tour Packages",
    desc: "Curated packages tailored to your preferences."
  },
  {
    icon: Ship,
    title: "Cruise Deals",
    desc: "Unforgettable journeys across the pristine oceans."
  }
];

export function BestServices() {
  return (
    <section className="relative py-32 mt-20 bg-primary text-white">
      {/* Top Curve */}
      <div className="absolute top-0 left-0 w-full overflow-hidden leading-none z-10 -translate-y-full rotate-180">
        <svg
          data-name="Layer 1"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 1200 120"
          preserveAspectRatio="none"
          className="relative block w-full h-[60px] md:h-[120px] text-primary fill-current"
        >
          <path d="M321.39,56.44c58-10.79,114.16-30.13,172-41.86,82.39-16.72,168.19-17.73,250.45-.39C823.78,31,906.67,72,985.66,92.83c70.05,18.48,146.53,26.09,214.34,3V120H0V95.8C59.71,118,130.85,121.32,192.5,108.5,236.4,99.5,279.7,80.4,321.39,56.44Z"></path>
        </svg>
      </div>

      <div className="container relative z-20 mx-auto px-4 md:px-8">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center max-w-2xl mx-auto mb-20"
        >
          <span className="text-accent font-bold tracking-wider uppercase text-sm mb-4 block">What We Serve</span>
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold font-serif mb-6">We Offer Best Services</h2>
          <p className="text-white/80 text-lg">
            Comprehensive travel solutions designed to give you peace of mind while exploring the world.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {SERVICES.map((service, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1, duration: 0.5 }}
              className="bg-white rounded-[2rem] p-8 text-center text-foreground shadow-xl hover:-translate-y-2 transition-transform duration-300"
            >
              <div className="w-20 h-20 mx-auto bg-accent/20 rounded-full flex items-center justify-center mb-6 text-accent">
                <service.icon className="w-10 h-10" />
              </div>
              <h3 className="text-xl font-bold mb-4">{service.title}</h3>
              <p className="text-muted-foreground">{service.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
