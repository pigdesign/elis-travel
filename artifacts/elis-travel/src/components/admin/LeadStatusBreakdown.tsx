import { cn } from "@/lib/utils";

export const LEAD_STATUS_KEYS = ["new", "contacted", "quote_sent", "won", "lost"] as const;

export type LeadStatusCounts = Record<string, number>;

// Colori/etichette allineati alla pagina Richieste, definiti una volta sola.
const STATUS_META: { key: string; short: string; full: string; dot: string; chip: string }[] = [
  { key: "new", short: "Nuove", full: "Nuove", dot: "bg-primary", chip: "bg-primary/10 text-primary" },
  { key: "contacted", short: "Cont.", full: "Contattate", dot: "bg-accent", chip: "bg-accent/15 text-accent" },
  { key: "quote_sent", short: "Prev.", full: "Preventivo", dot: "bg-primary/60", chip: "bg-primary/10 text-primary" },
  { key: "won", short: "Vinte", full: "Vinte", dot: "bg-emerald-500", chip: "bg-emerald-100 text-emerald-700" },
  { key: "lost", short: "Perse", full: "Perse", dot: "bg-destructive/70", chip: "bg-destructive/10 text-destructive" },
];

/** Somma i conteggi dei 5 stati. */
export function totalLeadCount(counts: LeadStatusCounts): number {
  return LEAD_STATUS_KEYS.reduce((sum, key) => sum + (counts[key] ?? 0), 0);
}

/**
 * Numerini compatti delle richieste per stato (nuove/contattate/preventivo/vinte/perse).
 * Usato nelle card offerta (labelStyle "short") e nel dettaglio (labelStyle "full").
 */
export function LeadStatusBreakdown({
  counts,
  labelStyle = "short",
  onStatusClick,
  className,
}: {
  counts: LeadStatusCounts;
  labelStyle?: "short" | "full";
  onStatusClick?: (status: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {STATUS_META.map((m) => {
        const count = counts[m.key] ?? 0;
        const label = labelStyle === "full" ? m.full : m.short;
        const base = "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium";
        const dimmed = count === 0 ? "opacity-45" : "";
        const inner = (
          <>
            <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", m.dot)} />
            <span className="font-bold">{count}</span>
            <span>{label}</span>
          </>
        );
        return onStatusClick ? (
          <button
            key={m.key}
            type="button"
            onClick={() => onStatusClick(m.key)}
            title={m.full}
            className={cn(base, m.chip, dimmed, "transition-opacity hover:opacity-80")}
          >
            {inner}
          </button>
        ) : (
          <span key={m.key} title={m.full} className={cn(base, m.chip, dimmed)}>
            {inner}
          </span>
        );
      })}
    </div>
  );
}
