import { useEffect, useState } from "react";
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
          <p className="px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">
            {group.label}
          </p>
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
 * Evidenzia nell'indice la sezione in cima all'area visibile.
 * `ids` deve essere nell'ordine del documento.
 */
export function useActiveSection(
  ids: string[],
  rootRef: RefObject<HTMLElement | null>,
) {
  const [activeId, setActiveId] = useState(ids[0] ?? "");
  const key = ids.join("|");

  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === "undefined") return;
    const order = key.split("|");
    const elements = order
      .map((id) => root.querySelector(`[${SECTION_ATTR}="${id}"]`))
      .filter((el): el is Element => el !== null);
    if (elements.length === 0) return;

    const visible = new Set<string>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = entry.target.getAttribute(SECTION_ATTR);
          if (!id) continue;
          if (entry.isIntersecting) visible.add(id);
          else visible.delete(id);
        }
        const first = order.find((id) => visible.has(id));
        if (first) setActiveId(first);
      },
      // La fascia alta del corpo decide la sezione "corrente".
      { root, rootMargin: "0px 0px -75% 0px", threshold: 0 },
    );
    elements.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [key, rootRef]);

  return activeId;
}
