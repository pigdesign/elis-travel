import { Card, CardContent } from "@/components/ui/card";
import { Star } from "lucide-react";

interface TestimonialCardProps {
  avatar: string;
  name: string;
  role: string;
  text: string;
  rating: number;
}

export function TestimonialCard({ avatar, name, role, text, rating }: TestimonialCardProps) {
  return (
    <Card className="rounded-[2rem] border-none shadow-lg bg-white relative mt-8">
      <div className="absolute -top-8 left-8">
        <img
          src={avatar}
          alt={name}
          className="w-16 h-16 rounded-full border-4 border-white object-cover shadow-sm"
        />
      </div>
      <CardContent className="pt-12 pb-8 px-8">
        <div className="flex gap-1 mb-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star
              key={i}
              className={`w-5 h-5 ${i < rating ? "fill-accent text-accent" : "fill-muted text-muted"}`}
            />
          ))}
        </div>
        <p className="text-muted-foreground italic mb-6 leading-relaxed">"{text}"</p>
        <div>
          <div className="font-bold text-foreground text-lg">{name}</div>
          <div className="text-sm text-primary font-medium">{role}</div>
        </div>
      </CardContent>
    </Card>
  );
}
