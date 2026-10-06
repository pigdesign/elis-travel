import { useState } from "react";
import { ChevronDown, Clock } from "lucide-react";
import type { ScheduleDay } from "@workspace/api-client-react";

interface ScheduleTimelineProps {
  days: ScheduleDay[];
  title: string;
  mainVisual?: string | null;
  imageAlt?: string;
}

/**
 * Timeline pubblica del programma/itinerario mostrata al cliente: giorni con
 * attività (ora, titolo, descrizione). Condivisa tra gite e offerte.
 *
 * Sotto i 1024px, nei programmi di più giorni, si vede il primo giorno e un
 * pulsante apre il resto: sul telefono un tour di una settimana occupava da
 * solo una decina di schermate. Da lg in su è sempre tutto aperto.
 */
export function ScheduleTimeline({
  days,
  title,
  mainVisual,
  imageAlt,
}: ScheduleTimelineProps) {
  const [expanded, setExpanded] = useState(false);
  if (days.length === 0) return null;
  const collapsible = days.length > 1 && !expanded;

  return (
    <div className="rounded-[30px] border border-slate-200/70 bg-white p-6 shadow-[0_18px_50px_rgba(20,36,43,0.08)] md:p-8">
      <h2 className="mb-5 flex items-center gap-2 text-xl font-serif font-bold text-foreground">
        <Clock className="h-5 w-5 text-primary" />
        {title}
      </h2>

      {mainVisual && (
        <div className="mb-6 overflow-hidden rounded-[24px]">
          <img
            src={mainVisual}
            alt={imageAlt ?? title}
            className="h-56 w-full object-cover md:h-72"
          />
        </div>
      )}

      <div className="space-y-8">
        {days.map((day, index) => (
          <div key={day.dayNumber} className={collapsible && index > 0 ? "hidden lg:block" : undefined}>
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <span className="rounded-full bg-primary px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">
                Giorno {day.dayNumber}
              </span>
              {day.title && (
                <span className="text-base font-semibold text-foreground">
                  {day.title}
                </span>
              )}
            </div>

            <ol className="relative space-y-6 before:absolute before:bottom-2 before:left-[9px] before:top-2 before:w-px before:bg-accent/35 before:content-['']">
              {day.activities.map((act, i) => (
                <li key={i} className="relative flex gap-4 pl-10">
                  <div className="absolute left-0 top-1.5 z-10 h-[18px] w-[18px] rounded-full border-4 border-white bg-accent shadow-[0_0_0_1px_rgba(255,122,26,0.22)]" />
                  {/* L'orario è testo libero e a volte non è un orario: sotto
                      lg va a capo invece di finire sopra il titolo. */}
                  {act.time && (
                    <span className="mt-0.5 w-14 shrink-0 text-xs font-bold tracking-[0.12em] text-primary max-lg:[overflow-wrap:anywhere] md:text-sm">
                      {act.time}
                    </span>
                  )}
                  <div className="min-w-0">
                    <div className="text-base font-semibold text-[#14242b]">
                      {act.title}
                    </div>
                    {act.description && (
                      <div className="mt-1 whitespace-pre-line text-sm leading-relaxed text-[#63757c]">
                        {act.description}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>

      {collapsible && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-full border border-primary/30 text-sm font-semibold text-primary transition-colors hover:bg-primary/5 lg:hidden"
        >
          Mostra tutto il programma ({days.length} giorni)
          <ChevronDown className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
