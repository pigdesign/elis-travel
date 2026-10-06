import { Card, CardContent } from "@/components/ui/card";
import { Quote, Star } from "lucide-react";

interface TestimonialCardProps {
  /** Come lo mostra la fonte: di solito nome e iniziale del cognome. */
  name: string;
  /** Il viaggio a cui si riferisce, per esempio "Gita a Fiume · settembre 2026". */
  trip: string;
  text: string;
  rating: number;
  /** Da dove viene la recensione, per esempio "Google". */
  source?: string;
}

export function TestimonialCard({
  name,
  trip,
  text,
  rating,
  source,
}: TestimonialCardProps) {
  return (
    <Card className="h-full rounded-[2rem] border-none shadow-lg bg-white">
      <CardContent className="flex h-full flex-col px-8 pb-8 pt-8">
        <div className="mb-5 flex items-center justify-between">
          <Quote
            className="h-9 w-9 text-accent/30"
            aria-hidden="true"
            strokeWidth={1.5}
          />
          <div
            className="flex gap-1"
            role="img"
            aria-label={`${rating} stelle su 5`}
          >
            {Array.from({ length: 5 }).map((_, i) => (
              <Star
                key={i}
                aria-hidden="true"
                className={`h-5 w-5 ${i < rating ? "fill-accent text-accent" : "fill-muted text-muted"}`}
              />
            ))}
          </div>
        </div>
        <p className="mb-8 leading-relaxed text-muted-foreground">{text}</p>
        <div className="mt-auto border-t border-border/60 pt-5">
          <div className="text-lg font-bold text-foreground">{name}</div>
          <div className="text-sm font-medium text-primary">{trip}</div>
          {source && (
            <div className="mt-1 text-xs text-muted-foreground">
              Recensione {source}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
