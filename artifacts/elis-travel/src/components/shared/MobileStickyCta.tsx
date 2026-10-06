import { useEffect, useState, type ReactNode, type RefObject } from "react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

/**
 * Decide quando mostrare la barra: solo dopo che la card del prezzo è uscita
 * dallo schermo verso l'alto, e mai mentre è a vista uno dei blocchi in
 * `hideWhileVisible` (per esempio il form di prenotazione, che ha già i suoi
 * pulsanti).
 *
 * `enabled` deve diventare true nello stesso render in cui compaiono i blocchi
 * osservati (per esempio quando arrivano i dati): è quello che fa ripartire
 * l'osservazione, i ref da soli non provocano un nuovo render.
 */
export function useStickyCtaVisibility(
  anchorRef: RefObject<HTMLElement | null>,
  hideWhileVisible: RefObject<HTMLElement | null>[] = [],
  enabled = true,
): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const anchor = anchorRef.current;
    if (!enabled || !anchor) {
      setVisible(false);
      return;
    }
    const blockers = hideWhileVisible
      .map((ref) => ref.current)
      .filter((el): el is HTMLElement => el !== null);
    let anchorAbove = false;
    const blockersInView = new Set<Element>();

    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === anchor) {
          anchorAbove = !entry.isIntersecting && entry.boundingClientRect.top < 0;
        } else if (entry.isIntersecting) {
          blockersInView.add(entry.target);
        } else {
          blockersInView.delete(entry.target);
        }
      }
      setVisible(anchorAbove && blockersInView.size === 0);
    });
    observer.observe(anchor);
    blockers.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  // Il pulsante delle preferenze cookie di iubenda sta nello stesso angolo:
  // finché la barra è su, lo spostiamo sopra di lei (vedi index.css).
  useEffect(() => {
    document.body.classList.toggle("has-sticky-cta", visible);
    return () => document.body.classList.remove("has-sticky-cta");
  }, [visible]);

  return visible;
}

/**
 * Barra fissa in basso con prezzo e azione principale, solo sotto i 1024px:
 * sul telefono la card del prezzo sparisce presto e il pulsante per prenotare
 * resterebbe migliaia di pixel più giù. Da lg in su non esiste.
 */
export function MobileStickyCta({
  visible,
  price,
  priceNote,
  label,
  href,
  icon,
}: {
  visible: boolean;
  price: string | null;
  priceNote?: string;
  label: string;
  href: string;
  icon?: ReactNode;
}) {
  const className =
    "inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-full bg-accent px-5 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90";
  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 border-t border-border bg-white/95 shadow-[0_-8px_30px_rgba(20,36,43,0.12)] backdrop-blur-md transition-transform duration-300 lg:hidden",
        visible ? "translate-y-0" : "pointer-events-none translate-y-full",
      )}
      aria-hidden={!visible}
      data-testid="mobile-sticky-cta"
    >
      <div className="container mx-auto flex items-center justify-between gap-4 px-4 py-3 md:px-8">
        <div className="min-w-0">
          {price ? (
            <>
              <div className="text-xl font-serif font-bold leading-tight text-accent">{price}</div>
              {priceNote && <div className="text-xs text-muted-foreground">{priceNote}</div>}
            </>
          ) : (
            <div className="text-sm font-medium text-foreground">Quota su richiesta</div>
          )}
        </div>
        {href.startsWith("#") ? (
          <a href={href} className={className} tabIndex={visible ? 0 : -1}>
            {icon}
            {label}
          </a>
        ) : (
          <Link href={href} className={className} tabIndex={visible ? 0 : -1}>
            {icon}
            {label}
          </Link>
        )}
      </div>
    </div>
  );
}
