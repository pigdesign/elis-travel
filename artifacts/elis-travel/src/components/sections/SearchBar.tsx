import { motion } from "framer-motion";
import { Button } from "@/components/shared/Button";
import { MapPin, Calendar, Users, Mail, Search } from "lucide-react";

export function SearchBar() {
  return (
    <div className="relative z-30 container mx-auto px-4 md:px-8 -mt-24 md:-mt-32 mb-20">
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8 }}
        className="bg-white rounded-[2.5rem] shadow-2xl p-4 md:p-6 max-w-5xl mx-auto space-y-2"
      >
        {/* Riga 1: Località · Check-in/Check-out · Ospiti */}
        <div className="flex flex-col md:flex-row md:items-center md:divide-x md:divide-border gap-3 md:gap-0">
          <div className="flex items-center gap-4 px-4 py-3 rounded-2xl hover:bg-muted/50 transition-colors cursor-pointer md:flex-1">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
              <MapPin className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground font-medium">Località</p>
              <p className="font-bold text-foreground text-sm truncate">Dove vuoi andare?</p>
            </div>
          </div>

          <div className="flex items-center gap-4 px-4 py-3 rounded-2xl hover:bg-muted/50 transition-colors cursor-pointer md:flex-1">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
              <Calendar className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground font-medium">Check-in / Check-out</p>
              <p className="font-bold text-foreground text-sm truncate">Aggiungi le date</p>
            </div>
          </div>

          <div className="flex items-center gap-4 px-4 py-3 rounded-2xl hover:bg-muted/50 transition-colors cursor-pointer md:flex-1">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
              <Users className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground font-medium">Ospiti</p>
              <p className="font-bold text-foreground text-sm truncate">2 ospiti, 1 camera</p>
            </div>
          </div>
        </div>

        {/* Separatore */}
        <div className="hidden md:block h-px bg-border/60 mx-4" />

        {/* Riga 2: Email + Bottone */}
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          <div className="flex items-center gap-4 px-4 py-3 rounded-2xl hover:bg-muted/50 transition-colors cursor-pointer flex-1">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
              <Mail className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground font-medium">Email</p>
              <p className="font-bold text-muted-foreground/60 text-sm truncate">La tua email</p>
            </div>
          </div>

          <div className="px-4 md:px-0 shrink-0">
            <Button
              size="lg"
              className="w-full md:w-auto h-14 px-8 rounded-full bg-accent hover:bg-accent/90 text-accent-foreground shadow-lg shadow-accent/30 whitespace-nowrap"
            >
              <Search className="w-5 h-5 mr-2" />
              Richiedi preventivo
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
