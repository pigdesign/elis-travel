import { Clock } from "lucide-react";
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
 */
export function ScheduleTimeline({ days, title, mainVisual, imageAlt }: ScheduleTimelineProps) {
  if (days.length === 0) return null;

  return (
    <div className="rounded-[30px] border border-slate-200/70 bg-white p-6 shadow-[0_18px_50px_rgba(20,36,43,0.08)] md:p-8">
      <h2 className="mb-5 flex items-center gap-2 text-xl font-serif font-bold text-foreground">
        <Clock className="h-5 w-5 text-primary" />
        {title}
      </h2>

      {mainVisual && (
        <div className="mb-6 overflow-hidden rounded-[24px]">
          <img src={mainVisual} alt={imageAlt ?? title} className="h-56 w-full object-cover md:h-72" />
        </div>
      )}

      <div className="space-y-8">
        {days.map((day) => (
          <div key={day.dayNumber}>
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <span className="rounded-full bg-primary px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">
                Giorno {day.dayNumber}
              </span>
              {day.title && (
                <span className="text-base font-semibold text-foreground">{day.title}</span>
              )}
            </div>

            <ol className="relative space-y-6 before:absolute before:bottom-2 before:left-[9px] before:top-2 before:w-px before:bg-accent/35 before:content-['']">
              {day.activities.map((act, i) => (
                <li key={i} className="relative flex gap-4 pl-10">
                  <div className="absolute left-0 top-1.5 z-10 h-[18px] w-[18px] rounded-full border-4 border-white bg-accent shadow-[0_0_0_1px_rgba(255,122,26,0.22)]" />
                  {act.time && (
                    <span className="mt-0.5 w-14 shrink-0 text-xs font-bold tracking-[0.12em] text-primary md:text-sm">
                      {act.time}
                    </span>
                  )}
                  <div className="min-w-0">
                    <div className="text-base font-semibold text-[#14242b]">{act.title}</div>
                    {act.description && (
                      <div className="mt-1 text-sm leading-relaxed text-[#63757c]">
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
    </div>
  );
}
