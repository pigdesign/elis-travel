import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import type { TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type AutoGrowTextareaProps = Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "rows"
> & {
  /** Righe minime mostrate quando il campo è vuoto. */
  minRows?: number;
};

/**
 * Textarea che cresce in altezza con il testo digitato, mantenendo la
 * maniglia di trascinamento in basso a destra. Se l'utente trascina la
 * maniglia, l'altezza scelta a mano vince e l'adattamento automatico si ferma.
 */
export function AutoGrowTextarea({
  minRows = 1,
  value,
  className,
  ...rest
}: AutoGrowTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  /** Altezza impostata dall'adattamento automatico, per riconoscere il resize manuale. */
  const autoHeightRef = useRef<number | null>(null);
  const manualRef = useRef(false);

  const adjust = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    const cs = getComputedStyle(el);
    // scrollHeight non include i bordi: con box-sizing border-box vanno riaggiunti.
    const borders =
      cs.boxSizing === "border-box"
        ? parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth)
        : 0;
    const next = el.scrollHeight + borders;
    el.style.height = `${next}px`;
    el.style.overflowY = "hidden";
    autoHeightRef.current = next;
  }, []);

  useLayoutEffect(() => {
    if (!manualRef.current) adjust();
  }, [value, adjust]);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let lastWidth = el.offsetWidth;
    const ro = new ResizeObserver(() => {
      const width = el.offsetWidth;
      if (width !== lastWidth) {
        // Cambio di larghezza (modale ridimensionata): il testo si ri-manda a capo.
        lastWidth = width;
        if (!manualRef.current) adjust();
        return;
      }
      if (
        !manualRef.current &&
        autoHeightRef.current !== null &&
        Math.abs(el.offsetHeight - autoHeightRef.current) > 1
      ) {
        // Maniglia trascinata: da qui in poi comanda l'altezza scelta a mano.
        manualRef.current = true;
        el.style.overflowY = "auto";
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [adjust]);

  return (
    <textarea
      ref={ref}
      rows={minRows}
      value={value}
      className={cn("resize-y", className)}
      {...rest}
    />
  );
}
