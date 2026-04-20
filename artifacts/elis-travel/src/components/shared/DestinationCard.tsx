import { Card } from "@/components/ui/card";
import { MapPin } from "lucide-react";

interface DestinationCardProps {
  image: string;
  name: string;
  country: string;
  placesCount: number;
}

export function DestinationCard({ image, name, country, placesCount }: DestinationCardProps) {
  return (
    <Card className="group relative overflow-hidden rounded-[2rem] border-none shadow-md aspect-[3/4] cursor-pointer hover-elevate no-default-hover-elevate">
      <img
        src={image}
        alt={name}
        className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
      <div className="absolute bottom-0 left-0 right-0 p-6 text-white">
        <div className="mb-2 bg-accent text-accent-foreground text-xs font-bold px-3 py-1 rounded-full inline-block">
          {placesCount} Places
        </div>
        <h3 className="text-2xl font-bold mb-1 font-serif tracking-wide">{name}</h3>
        <div className="flex items-center gap-1 text-white/80 text-sm">
          <MapPin className="w-4 h-4" />
          {country}
        </div>
      </div>
    </Card>
  );
}
