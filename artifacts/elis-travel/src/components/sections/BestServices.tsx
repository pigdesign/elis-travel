import { motion } from "framer-motion";
import { Sailboat, Calendar, UserCheck } from "lucide-react";
import travelerImg from "@assets/elis_travel_offerte.png_1776682556019.jpg";

const SERVICES = [
  {
    icon: Sailboat,
    title: "Viaggio esclusivo",
    desc: "Prestiamo attenzione a ogni dettaglio del servizio che ti offriamo.",
    stepLabel: "Fase",
    stepNum: "01",
    iconColor: "#00B4D8",
    stepColor: "#00B4D8",
  },
  {
    icon: Calendar,
    title: "Prenotazione facile",
    desc: "Ti seguiamo con un processo di prenotazione semplice e assistenza completa.",
    stepLabel: "Fase",
    stepNum: "02",
    iconColor: "#F97316",
    stepColor: "#F97316",
  },
  {
    icon: UserCheck,
    title: "Guida professionale",
    desc: "Durante la vacanza sarai accompagnato dalla nostra guida professionale.",
    stepLabel: "Fase",
    stepNum: "03",
    iconColor: "#FB923C",
    stepColor: "#FB923C",
  },
];

export function BestServices() {
  return (
    <section className="relative mt-20 text-white overflow-hidden" style={{ backgroundColor: "#3ca8a7" }}>
      {/* Top Curve */}
      <div className="absolute top-0 left-0 w-full overflow-hidden leading-none z-10 -translate-y-full rotate-180">
        <svg
          data-name="Layer 1"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 1200 120"
          preserveAspectRatio="none"
          className="relative block w-full h-[60px] md:h-[120px] fill-current"
          style={{ color: "#3ca8a7" }}
        >
          <path d="M321.39,56.44c58-10.79,114.16-30.13,172-41.86,82.39-16.72,168.19-17.73,250.45-.39C823.78,31,906.67,72,985.66,92.83c70.05,18.48,146.53,26.09,214.34,3V120H0V95.8C59.71,118,130.85,121.32,192.5,108.5,236.4,99.5,279.7,80.4,321.39,56.44Z"></path>
        </svg>
      </div>
      {/* Full-height traveler image — absolute on the left */}
      <motion.div
        initial={{ opacity: 0, x: -30 }}
        whileInView={{ opacity: 1, x: 0 }}
        viewport={{ once: true }}
        className="hidden lg:block absolute inset-y-0 left-0 w-[30%] z-10"
      >
        <img
          src={travelerImg}
          alt="Traveler"
          className="h-full object-contain object-bottom flex flex-col text-right w-[671px]"
        />
      </motion.div>
      {/* Mobile image (normal flow) */}
      <div className="lg:hidden w-full h-72 overflow-hidden">
        <img src={travelerImg} alt="Traveler" className="w-full h-full object-cover object-top" />
      </div>
      <div className="relative z-20 mx-auto pt-[150px] pb-[150px] pl-[30px] pr-[30px] max-w-7xl rotate-[360deg]">
        <div className="flex flex-col lg:flex-row">
          {/* Spacer for image column on desktop */}
          <div className="hidden lg:block lg:w-[30%] flex-shrink-0" />

          {/* RIGHT: Content */}
          <div className="lg:w-[58%] lg:pl-12">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <h2 className="brand-title brand-title-accent mb-6 text-[#ffffff] text-center text-[83px] font-extrabold">
                Offriamo i migliori <span className="text-white">servizi</span>
              </h2>
              <p className="text-white/80 text-lg max-w-xl mb-8">
                Vivi soluzioni di viaggio complete pensate per darti serenità. Pensiamo a tutto noi, così puoi concentrarti solo sull'esplorare il mondo.
              </p>
            </motion.div>
            
            {/* 3 Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mt-10 items-stretch">
              {SERVICES.map((service, index) => (
                /* Outer wrapper: handles motion + provides overflow:visible context for the badge */
                (<motion.div
                  key={index}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1, duration: 0.5 }}
                  className="relative"
                  style={{ paddingBottom: "14px", paddingLeft: "14px" }}
                >
                  {/* Card */}
                  <div
                    className="relative bg-white flex flex-col items-center text-center hover:-translate-y-1.5 transition-transform duration-300 h-full"
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
                </motion.div>)
              ))}
            </div>
            
          </div>
          
        </div>
      </div>
    </section>
  );
}
