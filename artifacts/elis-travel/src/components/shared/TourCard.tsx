import { Card, CardContent } from "@/components/ui/card";
import { Button } from "./Button";
import { Star, Clock, MapPin } from "lucide-react";

interface TourCardProps {
  image: string;
  title: string;
  location: string;
  duration: string;
  price: string;
  rating: number;
}

export function TourCard({ image, title, location, duration, price, rating }: TourCardProps) {
  return (
    <Card className="overflow-hidden border-none shadow-lg group rounded-3xl hover-elevate no-default-hover-elevate">
      <div className="relative aspect-[4/3] overflow-hidden">
        <img
          src={image}
          alt={title}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
        />
        <div className="absolute top-4 left-4 bg-white/90 backdrop-blur-sm px-3 py-1.5 rounded-full text-sm font-semibold text-primary flex items-center gap-1 shadow-sm">
          <MapPin className="w-4 h-4" />
          {location}
        </div>
      </div>
      <CardContent className="p-6">
        <div className="flex justify-between items-start mb-4">
          <h3 className="font-bold text-xl leading-tight line-clamp-2 pr-4">{title}</h3>
          <div className="flex items-center gap-1 bg-accent/20 px-2 py-1 rounded-full shrink-0">
            <Star className="w-4 h-4 fill-accent text-accent" />
            <span className="text-sm font-bold">{rating}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground mb-6 text-sm">
          <Clock className="w-4 h-4" />
          <span>{duration}</span>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <span className="text-muted-foreground text-sm">From</span>
            <div className="font-bold text-2xl text-primary">{price}</div>
          </div>
          <Button variant="default" className="bg-primary hover:bg-primary/90 text-white">
            Book Now
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
