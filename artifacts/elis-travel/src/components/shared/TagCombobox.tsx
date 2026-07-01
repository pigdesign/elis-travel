import { useState, useRef, useEffect, useMemo } from "react";
import { X, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

const fieldCls =
  "w-full border border-border rounded-xl px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition";

/**
 * Campo "a tag" a valore singolo con autocompletamento e creazione al volo.
 * - Valore impostato → chip con ✕ per cambiarlo.
 * - Vuoto → input con dropdown dei suggerimenti + riga "＋ Aggiungi «…»" se il testo non esiste.
 * I suggerimenti sono deduplicati senza distinzione maiuscole/minuscole.
 */
export function TagCombobox({
  value,
  onChange,
  suggestions,
  placeholder,
  allowCreate = true,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  placeholder?: string;
  allowCreate?: boolean;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  const q = query.trim();
  const filtered = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const raw of suggestions) {
      const name = raw.trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      if (!q || name.toLowerCase().includes(q.toLowerCase())) list.push(name);
    }
    return list.sort((a, b) => a.localeCompare(b, "it"));
  }, [suggestions, q]);

  const exactExists = filtered.some((s) => s.toLowerCase() === q.toLowerCase());
  const showCreate = allowCreate && q.length > 0 && !exactExists;

  function select(v: string) {
    onChange(v.trim());
    setQuery("");
    setOpen(false);
  }

  if (value) {
    return (
      <div ref={containerRef}>
        <div className={cn(fieldCls, "flex items-center gap-2 flex-wrap min-h-[38px]")}>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium px-2.5 py-0.5">
            {value}
            {!disabled && (
              <button
                type="button"
                onClick={() => onChange("")}
                className="hover:text-primary/70"
                aria-label="Rimuovi tour operator"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={query}
        disabled={disabled}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (filtered.length > 0) select(filtered[0]);
            else if (showCreate) select(q);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        placeholder={placeholder}
        className={fieldCls}
      />
      {open && (filtered.length > 0 || showCreate) && (
        <div className="absolute z-20 mt-1 w-full max-h-56 overflow-auto rounded-xl border border-border bg-white shadow-lg py-1">
          {filtered.map((s) => (
            <button
              type="button"
              key={s}
              onClick={() => select(s)}
              className="w-full text-left px-3 py-2 text-sm hover:bg-primary/5 transition-colors"
            >
              {s}
            </button>
          ))}
          {showCreate && (
            <button
              type="button"
              onClick={() => select(q)}
              className="w-full text-left px-3 py-2 text-sm text-primary font-medium hover:bg-primary/5 transition-colors flex items-center gap-2"
            >
              <Plus className="w-3.5 h-3.5 flex-shrink-0" />
              Aggiungi «{q}»
            </button>
          )}
        </div>
      )}
    </div>
  );
}
