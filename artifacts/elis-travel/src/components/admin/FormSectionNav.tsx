import { useCallback, useEffect, useRef, useState } from "react";
import type { ComponentType, ReactNode, RefObject } from "react";
import { cn } from "@/lib/utils";

/**
 * Sezioni a scheda + indice laterale per i form admin lunghi (gite, offerte).
 * Le sezioni restano tutte montate e nell'ordine del documento: l'indice serve
 * solo a saltarci sopra, così validazione, bozze e scroll all'errore continuano
 * a funzionare come prima.
 */

export interface FormSectionItem {
  id: string;
  label: string;
}

export interface FormSectionGroup {
  label: string;
  items: FormSectionItem[];
}

/** Attributo usato per ritrovare le sezioni dentro il corpo scrollabile. */
const SECTION_ATTR = "data-form-section";

export function FormSection({
  id,
  title,
  icon: Icon,
  description,
  children,
}: {
  id: string;
  title: string;
  icon: ComponentType<{ className?: string }>;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      id={`section-${id}`}
      {...{ [SECTION_ATTR]: id }}
      className="scroll-mt-2 space-y-3 rounded-xl border border-border/70 bg-white p-4 shadow-[0_1px_2px_rgba(20,36,43,0.04)] md:p-5"
    >
      <div className="flex items-center gap-2 border-b border-border/60 pb-2">
        <Icon className="h-4 w-4 flex-shrink-0 text-primary" />
        <h4 className="text-sm font-bold text-foreground">{title}</h4>
      </div>
      {description && (
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}
      {children}
    </section>
  );
}

export function FormSectionNav({
  groups,
  activeId,
  onSelect,
}: {
  groups: FormSectionGroup[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <nav
      aria-label="Sezioni del form"
      className="hidden w-52 flex-shrink-0 flex-col gap-4 overflow-y-auto border-r border-border/60 bg-muted/20 px-3 py-5 lg:flex"
    >
      {groups.map((group) => (
        <div key={group.label}>
          {/* Il titolo del gruppo porta alla sua prima sezione. */}
          <button
            type="button"
            onClick={() => {
              const first = group.items[0];
              if (first) onSelect(first.id);
            }}
            className="w-full rounded-md px-2 py-1 text-left text-[11px] font-bold uppercase tracking-wider text-foreground/70 transition-colors hover:bg-muted/60 hover:text-primary"
          >
            {group.label}
          </button>
          <ul className="mt-1 space-y-0.5">
            {group.items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onSelect(item.id)}
                  className={cn(
                    "w-full rounded-md px-2 py-1.5 text-left text-xs transition-colors",
                    activeId === item.id
                      ? "bg-primary/10 font-semibold text-primary"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  )}
                >
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** Porta in vista la sezione richiesta dall'indice. */
export function scrollToSection(
  root: HTMLElement | null,
  id: string,
  behavior: ScrollBehavior = "smooth",
) {
  root
    ?.querySelector(`[${SECTION_ATTR}="${id}"]`)
    ?.scrollIntoView({ behavior, block: "start" });
}

/**
 * Evidenzia nell'indice la sezione che stai guardando.
 * `ids` deve essere nell'ordine del documento.
 *
 * `activate` serve ai click sull'indice: accende subito la voce scelta e la
 * tiene accesa finché non scorri tu. Senza, le ultime sezioni non si
 * accenderebbero mai, perché a fondo pagina il riquadro non può scorrere oltre
 * e loro non arrivano mai in cima.
 */
export function useActiveSection(
  ids: string[],
  rootRef: RefObject<HTMLElement | null>,
) {
  const [activeId, setActiveId] = useState(ids[0] ?? "");
  const lockedRef = useRef(false);
  const key = ids.join("|");

  const compute = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    const found = key
      .split("|")
      .map(
        (id) => [id, root.querySelector(`[${SECTION_ATTR}="${id}"]`)] as const,
      )
      .filter((pair): pair is readonly [string, Element] => pair[1] !== null);
    if (found.length === 0) return;

    // Fondo raggiunto: quello che guardi è l'ultimo blocco, comunque sia messo.
    if (root.scrollTop + root.clientHeight >= root.scrollHeight - 4) {
      setActiveId(found[found.length - 1][0]);
      return;
    }
    // Altrimenti: l'ultima sezione già entrata nella fascia alta del riquadro.
    const line = root.getBoundingClientRect().top + root.clientHeight * 0.25;
    let current = found[0][0];
    for (const [id, el] of found) {
      if (el.getBoundingClientRect().top <= line) current = id;
    }
    setActiveId(current);
  }, [key, rootRef]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let raf = 0;
    const onScroll = () => {
      if (lockedRef.current) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(compute);
    };
    // Se scorri tu, la scelta fatta dall'indice non comanda più.
    const release = () => {
      lockedRef.current = false;
    };
    root.addEventListener("scroll", onScroll, { passive: true });
    root.addEventListener("wheel", release, { passive: true });
    root.addEventListener("touchmove", release, { passive: true });
    root.addEventListener("pointerdown", release);
    root.addEventListener("keydown", release);
    compute();
    return () => {
      cancelAnimationFrame(raf);
      root.removeEventListener("scroll", onScroll);
      root.removeEventListener("wheel", release);
      root.removeEventListener("touchmove", release);
      root.removeEventListener("pointerdown", release);
      root.removeEventListener("keydown", release);
    };
  }, [compute, rootRef]);

  const activate = useCallback((id: string) => {
    lockedRef.current = true;
    setActiveId(id);
  }, []);

  return { activeId, activate };
}
