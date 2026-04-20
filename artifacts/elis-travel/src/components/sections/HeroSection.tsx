import { motion } from "framer-motion";
import { Button } from "@/components/shared/Button";
import { Play } from "lucide-react";
import heroBg from "@assets/Gemini_Generated_Image_3chg7z3chg7z3chg_1776677826049.png";

export function HeroSection() {
  return (
    <section className="relative min-h-[100dvh] flex items-center justify-center overflow-hidden pb-32">
      {/* Background */}
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-black/40 z-10" />
        <img
          src={heroBg}
          alt="Elis Travel Hero"
          className="w-full h-full object-cover"
        />
      </div>

      <div className="container relative z-20 mx-auto px-4 md:px-8 mt-20">
        <div className="max-w-4xl mx-auto text-center text-white">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          >
            <span className="inline-block py-1 px-3 rounded-full bg-white/20 backdrop-blur-md border border-white/30 text-sm font-semibold tracking-widest uppercase mb-6 text-accent">
              Explore The World
            </span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1, ease: "easeOut", delay: 0.2 }}
            className="text-7xl md:text-9xl lg:text-[12rem] leading-none mb-6 text-white drop-shadow-2xl"
          >
            Vietnam
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut", delay: 0.4 }}
            className="text-lg md:text-xl text-white/90 mb-10 max-w-2xl mx-auto leading-relaxed font-light"
          >
            Discover the breathtaking beauty of Ha Long Bay, vibrant culture, and unforgettable landscapes. Your next great adventure begins here with our curated local guides.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut", delay: 0.6 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <Button size="lg" className="h-14 px-8 text-base w-full sm:w-auto bg-primary hover:bg-primary/90 text-white">
              Discover Tours
            </Button>
            <Button size="lg" variant="outline" className="h-14 px-8 text-base w-full sm:w-auto bg-white/10 hover:bg-white/20 text-white border-white/30 backdrop-blur-sm">
              <Play className="w-5 h-5 mr-2" />
              Watch Video
            </Button>
          </motion.div>
        </div>
      </div>

      {/* Bottom Curve */}
      <div className="absolute bottom-0 left-0 w-full overflow-hidden leading-none z-20">
        <svg
          data-name="Layer 1"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 1200 120"
          preserveAspectRatio="none"
          className="relative block w-full h-[60px] md:h-[120px] text-background fill-current"
        >
          <path
            d="M321.39,56.44c58-10.79,114.16-30.13,172-41.86,82.39-16.72,168.19-17.73,250.45-.39C823.78,31,906.67,72,985.66,92.83c70.05,18.48,146.53,26.09,214.34,3V120H0V95.8C59.71,118,130.85,121.32,192.5,108.5,236.4,99.5,279.7,80.4,321.39,56.44Z"
          ></path>
        </svg>
      </div>
    </section>
  );
}
