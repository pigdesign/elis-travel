import { motion } from "framer-motion";
import { Sailboat, Calendar, UserCheck } from "lucide-react";
import travelerImg from "../../assets/traveler-landmarks.png";
import coastalImg from "../../assets/coastal-hero.png";

const SERVICES = [
  {
    icon: Sailboat,
    title: "Exclusive Trip",
    desc: "Seamless flight booking experience with best rates.",
    step: "Step 01",
    color: "text-teal-600",
    bgColor: "bg-teal-600",
    bgLight: "bg-teal-100",
  },
  {
    icon: Calendar,
    title: "Easy Booking",
    desc: "Luxury and comfortable stays at prime locations.",
    step: "Step 02",
    color: "text-amber-500",
    bgColor: "bg-amber-500",
    bgLight: "bg-amber-100",
  },
  {
    icon: UserCheck,
    title: "Professional Guide",
    desc: "Curated packages tailored to your preferences.",
    step: "Step 03",
    color: "text-lime-600",
    bgColor: "bg-lime-600",
    bgLight: "bg-lime-100",
  }
];

export function BestServices() {
  return (
    <section className="relative py-20 mt-20 bg-primary text-white overflow-hidden">
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
        <div className="flex flex-col lg:flex-row items-center gap-12">
          
          {/* LEFT: Traveler Image */}
          <motion.div 
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="lg:w-[45%] flex-shrink-0 w-full"
          >
            <img 
              src={travelerImg} 
              alt="Traveler" 
              className="w-full max-w-[480px] mx-auto object-contain rounded-2xl mix-blend-luminosity hover:mix-blend-normal transition-all duration-500" 
            />
          </motion.div>
          
          {/* RIGHT: Content */}
          <div className="lg:w-[55%]">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold font-serif mb-6">
                We offer Best <span className="text-accent">Services</span>
              </h2>
              <p className="text-white/80 text-lg max-w-xl mb-8">
                Experience comprehensive travel solutions designed to give you peace of mind. We take care of everything so you can focus on exploring the world.
              </p>
            </motion.div>
            
            {/* 3 Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 mt-8">
              {SERVICES.map((service, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1, duration: 0.5 }}
                  className="relative bg-white rounded-[1.5rem] p-6 pb-12 text-center shadow-lg hover:-translate-y-2 transition-transform duration-300 overflow-hidden group"
                >
                  <div className={`w-14 h-14 mx-auto rounded-full flex items-center justify-center mb-4 ${service.bgLight} ${service.color}`}>
                    <service.icon className="w-7 h-7" />
                  </div>
                  <h3 className={`text-lg font-bold mb-2 ${service.color}`}>{service.title}</h3>
                  <p className="text-sm text-gray-500 leading-relaxed">{service.desc}</p>
                  
                  {/* Step Badge */}
                  <div className={`absolute bottom-0 left-0 px-4 py-1.5 rounded-tr-[1rem] ${service.bgColor} text-white text-xs font-bold`}>
                    {service.step}
                  </div>
                </motion.div>
              ))}
            </div>
            
            {/* Coastal pill image */}
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.4 }}
              className="mt-8 rounded-[2rem] overflow-hidden shadow-2xl"
            >
              <img src={coastalImg} alt="Coastal View" className="w-full h-40 md:h-48 object-cover hover:scale-105 transition-transform duration-700" />
            </motion.div>
          </div>
          
        </div>
      </div>
    </section>
  );
}
