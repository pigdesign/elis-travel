import { useCallback, useEffect, useState, type ReactNode } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { cn } from "@/lib/utils";

/**
 * Carosello infinito per il telefono: la scheda attiva sta al centro e da
 * entrambi i lati si vede un pezzo di quelle vicine, così si capisce che si
 * può scorrere nei due sensi. Va messo dentro il `container` della sezione:
 * esce dal suo padding per arrivare ai bordi dello schermo.
 *
 * Chi lo usa lo nasconde da md in su (`className="md:hidden"`) e lì mostra la
 * sua griglia di sempre.
 */
export function MobileLoopCarousel({
  slides,
  slideClassName = "basis-[78%] sm:basis-[46%]",
  className,
  label,
}: {
  slides: ReactNode[];
  /** Larghezza di ogni scheda rispetto allo schermo. */
  slideClassName?: string;
  className?: string;
  /** Nome del carosello per i lettori di schermo. */
  label: string;
}) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true, align: "center" });
  const [selected, setSelected] = useState(0);

  const onSelect = useCallback(() => {
    if (emblaApi) setSelected(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    onSelect();
    emblaApi.on("select", onSelect);
    emblaApi.on("reInit", onSelect);
    return () => {
      emblaApi.off("select", onSelect);
      emblaApi.off("reInit", onSelect);
    };
  }, [emblaApi, onSelect]);

  return (
    <div className={cn("-mx-4", className)} role="region" aria-roledescription="carosello" aria-label={label}>
      <div className="overflow-hidden" ref={emblaRef}>
        {/* Spazio tra le schede come padding simmetrico: la scheda attiva
            resta esattamente al centro. */}
        <div className="flex touch-pan-y">
          {slides.map((slide, index) => (
            <div
              key={index}
              className={cn("min-w-0 shrink-0 grow-0 px-2", slideClassName)}
              role="group"
              aria-roledescription="scheda"
              aria-label={`${index + 1} di ${slides.length}`}
            >
              {slide}
            </div>
          ))}
        </div>
      </div>

      {slides.length > 1 && (
        <div className="mt-5 flex justify-center gap-1.5">
          {slides.map((_, index) => (
            <button
              key={index}
              type="button"
              onClick={() => emblaApi?.scrollTo(index)}
              aria-label={`Vai alla scheda ${index + 1}`}
              aria-current={index === selected}
              className="flex h-6 w-6 items-center justify-center"
            >
              <span
                className={cn(
                  "block h-2 rounded-full transition-all",
                  index === selected ? "w-5 bg-accent" : "w-2 bg-foreground/20",
                )}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
