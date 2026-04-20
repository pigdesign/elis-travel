import { motion } from "framer-motion";
import { Sailboat, Calendar, UserCheck } from "lucide-react";
import travelerImg from "@assets/Gemini_Generated_Image_5c6ka05c6ka05c6k_1776682365578.png";
import coastalImg from "../../assets/coastal-hero.png";

const SERVICES = [
  {
    icon: Sailboat,
    title: "Exclusive Trip",
    desc: "We pay attention to every quality in the service we provide to you.",
    stepLabel: "Step",
    stepNum: "01",
    iconColor: "#00B4D8",
    stepColor: "#00B4D8",
  },
  {
    icon: Calendar,
    title: "Easy Booking",
    desc: "Booking process and full support service assistance from us.",
    stepLabel: "Step",
    stepNum: "02",
    iconColor: "#F97316",
    stepColor: "#F97316",
  },
  {
    icon: UserCheck,
    title: "Professional Guide",
    desc: "While on vacation will be guided by our professional guide.",
    stepLabel: "Step",
    stepNum: "03",
    iconColor: "#FB923C",
    stepColor: "#FB923C",
  },
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
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mt-10 items-stretch">
              {SERVICES.map((service, index) => (
                /* Outer wrapper: handles motion + provides overflow:visible context for the badge */
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1, duration: 0.5 }}
                  className="relative"
                  style={{ paddingBottom: "14px", paddingLeft: "14px" }}
                >
                  {/* Card — asymmetric border-radius: top-left & bottom-right prominent */}
                  <div
                    className="relative bg-white flex flex-col items-center text-center hover:-translate-y-1.5 transition-transform duration-300"
                    style={{
                      borderTopLeftRadius: "46px",
                      borderTopRightRadius: "18px",
                      borderBottomRightRadius: "46px",
                      borderBottomLeftRadius: "18px",
                      boxShadow: "0 6px 28px rgba(0,0,0,0.09)",
                      minHeight: "260px",
                      padding: "38px 22px 52px",
                    }}
                  >
                    {/* Icon — linear, no circle background */}
                    <div className="mb-5 mt-2">
                      <service.icon
                        className="w-10 h-10"
                        strokeWidth={1.5}
                        style={{ color: service.iconColor }}
                      />
                    </div>

                    {/* Title */}
                    <h3
                      className="text-base font-semibold mb-3 leading-snug text-primary"
                    >
                      {service.title}
                    </h3>

                    {/* Description */}
                    <p className="text-sm text-gray-400 leading-relaxed flex-1">
                      {service.desc}
                    </p>
                  </div>

                  {/* Step badge — bleeds outside the card at bottom-left */}
                  <div
                    className="absolute flex flex-col items-start justify-end"
                    style={{
                      bottom: "0px",
                      left: "0px",
                      width: "64px",
                      height: "64px",
                      backgroundColor: service.stepColor,
                      borderRadius: "14px 28px 14px 14px",
                      padding: "8px 10px",
                      zIndex: 10,
                    }}
                  >
                    <span
                      className="text-white font-semibold block"
                      style={{ fontSize: "8px", letterSpacing: "0.06em", lineHeight: 1 }}
                    >
                      {service.stepLabel}
                    </span>
                    <span
                      className="text-white font-black block"
                      style={{ fontSize: "22px", lineHeight: 1.1 }}
                    >
                      {service.stepNum}
                    </span>
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
