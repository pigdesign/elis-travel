import { Plus, Trash2, X } from "lucide-react";
import type {
  ScheduleDay,
  ScheduleActivity,
} from "@workspace/api-client-react";
import { CoverImageUploader } from "@/components/shared/CoverImageUploader";
import { AutoGrowTextarea } from "@/components/shared/AutoGrowTextarea";

interface ScheduleEditorProps {
  value: ScheduleDay[];
  onChange: (days: ScheduleDay[]) => void;
  title?: string;
  description?: string;
  testIdPrefix?: string;
  /** false quando il titolo lo mette gia' la scheda che contiene l'editor. */
  showHeader?: boolean;
}

/**
 * Editor admin del programma/itinerario: giorni con attività (ora, titolo,
 * descrizione) e immagine per giornata. Condiviso tra gite e offerte.
 */
export function ScheduleEditor({
  value,
  onChange,
  title = "Programma",
  description = "Struttura la giornata per step. Ogni giorno può avere più attività.",
  testIdPrefix = "schedule",
  showHeader = true,
}: ScheduleEditorProps) {
  return (
    <section className="space-y-3">
      {showHeader && (
        <>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {title}
          </h4>
          <p className="text-xs text-muted-foreground -mt-1">{description}</p>
        </>
      )}
      {value.map((day, di) => (
        <div
          key={di}
          className="border border-border rounded-xl p-3 space-y-2 bg-muted/20"
        >
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-primary shrink-0">
              Giorno {day.dayNumber}
            </span>
            <input
              type="text"
              value={day.title ?? ""}
              onChange={(e) => {
                const s = [...value];
                s[di] = { ...s[di], title: e.target.value };
                onChange(s);
              }}
              placeholder="Titolo giornata (opzionale)"
              className="flex-1 px-2 py-1 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <button
              type="button"
              onClick={() => onChange(value.filter((_, i) => i !== di))}
              className="p-1 text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="pl-1">
            <p className="text-xs text-muted-foreground mb-1">
              Immagine giornata
            </p>
            <CoverImageUploader
              value={day.imageUrl ?? null}
              onChange={(url) => {
                const s = [...value];
                s[di] = { ...s[di], imageUrl: url ?? undefined };
                onChange(s);
              }}
              testIdPrefix={`${testIdPrefix}-day-${di}-image`}
            />
          </div>
          {day.activities.map((act, ai) => (
            <div key={ai} className="flex gap-2 items-start pl-3">
              <input
                type="text"
                value={act.time ?? ""}
                onChange={(e) => {
                  const s = [...value];
                  const acts = [...s[di].activities];
                  acts[ai] = { ...acts[ai], time: e.target.value };
                  s[di] = { ...s[di], activities: acts };
                  onChange(s);
                }}
                placeholder="Ora"
                className="w-16 px-2 py-1 border border-border rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-primary/30 shrink-0"
              />
              <input
                type="text"
                value={act.title}
                onChange={(e) => {
                  const s = [...value];
                  const acts = [...s[di].activities];
                  acts[ai] = { ...acts[ai], title: e.target.value };
                  s[di] = { ...s[di], activities: acts };
                  onChange(s);
                }}
                placeholder="Titolo attività *"
                className="flex-1 px-2 py-1 border border-border rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-primary/30"
              />
              <AutoGrowTextarea
                value={act.description ?? ""}
                onChange={(e) => {
                  const s = [...value];
                  const acts = [...s[di].activities];
                  acts[ai] = { ...acts[ai], description: e.target.value };
                  s[di] = { ...s[di], activities: acts };
                  onChange(s);
                }}
                placeholder="Descrizione"
                className="flex-1 px-2 py-1 border border-border rounded-lg text-xs leading-5 focus:outline-none focus:ring-1 focus:ring-primary/30"
              />
              <button
                type="button"
                onClick={() => {
                  const s = [...value];
                  s[di] = {
                    ...s[di],
                    activities: s[di].activities.filter((_, i) => i !== ai),
                  };
                  onChange(s);
                }}
                className="p-1 text-muted-foreground hover:text-destructive shrink-0"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => {
              const s = [...value];
              const newAct: ScheduleActivity = { title: "" };
              s[di] = { ...s[di], activities: [...s[di].activities, newAct] };
              onChange(s);
            }}
            className="ml-3 text-xs text-primary hover:underline flex items-center gap-1"
          >
            <Plus className="w-3 h-3" /> Aggiungi attività
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => {
          const newDay: ScheduleDay = {
            dayNumber: value.length + 1,
            title: "",
            activities: [],
          };
          onChange([...value, newDay]);
        }}
        className="w-full flex items-center justify-center gap-2 py-2 border border-dashed border-border rounded-xl text-xs text-muted-foreground hover:border-primary hover:text-primary transition-colors"
      >
        <Plus className="w-3.5 h-3.5" />
        Aggiungi giorno
      </button>
    </section>
  );
}
