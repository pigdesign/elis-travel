import { motion } from "framer-motion";
import { Button } from "@/components/shared/Button";
import { MapPin, Calendar, Users, Search } from "lucide-react";

export function SearchBar() {
  return (
    <div className="relative z-30 container mx-auto px-4 md:px-8 -mt-24 md:-mt-32 mb-20">
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8 }}
        className="bg-white rounded-[2.5rem] shadow-2xl p-4 md:p-6 lg:p-8 max-w-5xl mx-auto"
      >
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 md:gap-6 items-center">
          
          <div className="flex items-center gap-4 p-4 rounded-2xl hover:bg-muted/50 transition-colors cursor-pointer border md:border-none border-border">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
              <MapPin className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground font-medium mb-1">Location</p>
              <p className="font-bold text-foreground">Where are you going?</p>
            </div>
          </div>

          <div className="hidden md:block w-px h-12 bg-border mx-auto"></div>

          <div className="flex items-center gap-4 p-4 rounded-2xl hover:bg-muted/50 transition-colors cursor-pointer border md:border-none border-border">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground font-medium mb-1">Check in - out</p>
              <p className="font-bold text-foreground">Add dates</p>
            </div>
          </div>

          <div className="hidden md:block w-px h-12 bg-border mx-auto"></div>

          <div className="flex items-center gap-4 p-4 rounded-2xl hover:bg-muted/50 transition-colors cursor-pointer border md:border-none border-border">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground font-medium mb-1">Guests</p>
              <p className="font-bold text-foreground">2 Guests, 1 Room</p>
            </div>
          </div>

          <div className="md:ml-auto mt-2 md:mt-0">
            <Button size="lg" className="w-full md:w-auto h-16 px-8 rounded-full bg-accent hover:bg-accent/90 text-accent-foreground text-lg shadow-lg shadow-accent/30">
              <Search className="w-6 h-6 mr-2" />
              Search
            </Button>
          </div>

        </div>
      </motion.div>
    </div>
  );
}
