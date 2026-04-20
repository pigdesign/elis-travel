import { motion } from "framer-motion";
import { Button } from "@/components/shared/Button";
import { CheckCircle2 } from "lucide-react";

export function FeatureSection() {
  return (
    <section className="py-24 bg-background overflow-hidden" id="about">
      <div className="container mx-auto px-4 md:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          
          {/* Left: Text Content */}
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
          >
            <span className="text-primary font-bold tracking-wider uppercase text-sm mb-4 block">Our Values</span>
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold font-serif mb-6 text-foreground leading-tight">
              We Recommend Beautiful Destinations Every Month
            </h2>
            <p className="text-muted-foreground text-lg mb-8 leading-relaxed">
              With over 20 years of experience, we curate the most breathtaking travel experiences. We believe that travel should be stress-free, immersive, and transformative.
            </p>

            <ul className="space-y-4 mb-10">
              {['Expert Local Guides', 'Handpicked Accommodations', '24/7 Premium Support'].map((feature, i) => (
                <li key={i} className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-accent/20 flex items-center justify-center text-accent">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <span className="font-semibold text-foreground">{feature}</span>
                </li>
              ))}
            </ul>

            <div className="grid grid-cols-3 gap-6 mb-10 pt-8 border-t border-border">
              <div>
                <div className="text-4xl font-bold text-primary mb-1">20+</div>
                <div className="text-sm text-muted-foreground font-medium">Years Exp</div>
              </div>
              <div>
                <div className="text-4xl font-bold text-primary mb-1">50K</div>
                <div className="text-sm text-muted-foreground font-medium">Happy Clients</div>
              </div>
              <div>
                <div className="text-4xl font-bold text-primary mb-1">150+</div>
                <div className="text-sm text-muted-foreground font-medium">Destinations</div>
              </div>
            </div>

            <Button size="lg" className="h-14 px-8 text-base bg-primary hover:bg-primary/90 text-white">
              Discover More
            </Button>
          </motion.div>

          {/* Right: Images */}
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="relative h-[600px]"
          >
            {/* Decorative blobs */}
            <div className="absolute top-10 right-10 w-64 h-64 bg-accent/20 rounded-full blur-3xl" />
            <div className="absolute bottom-10 left-10 w-64 h-64 bg-primary/20 rounded-full blur-3xl" />
            
            <div className="absolute top-0 right-0 w-[70%] h-[70%] rounded-[3rem] overflow-hidden shadow-2xl border-8 border-white z-10">
              <img src="/images/dest-italy.png" alt="Travel" className="w-full h-full object-cover" />
            </div>
            
            <div className="absolute bottom-0 left-0 w-[60%] h-[60%] rounded-[3rem] overflow-hidden shadow-2xl border-8 border-white z-20">
              <img src="/images/tour-3.png" alt="Travel" className="w-full h-full object-cover" />
            </div>

            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 bg-accent rounded-full z-30 flex items-center justify-center shadow-xl shadow-accent/30 text-accent-foreground">
              <div className="text-center">
                <div className="font-bold text-2xl">4.9/5</div>
                <div className="text-xs uppercase tracking-wider font-bold">Rating</div>
              </div>
            </div>
          </motion.div>

        </div>
      </div>
    </section>
  );
}
