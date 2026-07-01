import { useState, useRef, useEffect, useMemo } from "react";
import { X, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

const fieldCls =
  "w-full border border-border rounded-xl px-2 py-1.5 text-sm bg-background focus-within:ring-2 focus-within:ring-primary/30 focus-within:border-primary transition";

/**
 * Campo "a tag" multi-valore con autocompletamento e creazione al volo.
 * - I valori selezionati sono chip con ✕.
 * - Digitando compaiono i suggerimenti (esclusi quelli già scelti) + "＋ Aggiungi «…»".
 * Confronto senza distinzione maiuscole/minuscole per evitare duplicati.
 */
export function TagMultiCombobox({
  values,
  onChange,
  suggestions,
  placeholder,
  disabled = false,
}: {
  values: string[];
  onChange: (values: string[]) => void;
  suggestions: string[];
  placeholder?: string;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
  const selectedLower = useMemo(
    () => new Set(values.map((v) => v.toLowerCase())),
    [values]
  );

  const filtered = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const raw of suggestions) {
      const name = raw.trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (seen.has(key) || selectedLower.has(key)) continue;
      seen.add(key);
      if (!q || name.toLowerCase().includes(q.toLowerCase())) list.push(name);
    }
    return list.sort((a, b) => a.localeCompare(b, "it"));
  }, [suggestions, q, selectedLower]);

  const alreadyKnown =
    q.length > 0 &&
    (selectedLower.has(q.toLowerCase()) ||
      suggestions.some((s) => s.trim().toLowerCase() === q.toLowerCase()));
  const showCreate = q.length > 0 && !alreadyKnown;

  function add(v: string) {
    const t = v.trim();
    if (!t) return;
    if (!selectedLower.has(t.toLowerCase())) onChange([...values, t]);
    setQuery("");
    // Resta aperto per aggiungere più tag di seguito.
    inputRef.current?.focus();
  }

  function removeAt(idx: number) {
    onChange(values.filter((_, i) => i !== idx));
  }

  return (
    <div ref={containerRef} className="relative">
      <div
        className={cn(fieldCls, "flex flex-wrap items-center gap-1.5 min-h-[38px] cursor-text")}
        onClick={() => !disabled && inputRef.current?.focus()}
      >
        {values.map((v, idx) => (
          <span
            key={`${v}-${idx}`}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium px-2.5 py-0.5"
          >
            {v}
            {!disabled && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeAt(idx);
                }}
                className="hover:text-primary/70"
                aria-label={`Rimuovi ${v}`}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </span>
        ))}
        <input
          ref={inputRef}
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
              if (filtered.length > 0) add(filtered[0]);
              else if (showCreate) add(q);
            } else if (e.key === "Escape") {
              setOpen(false);
            } else if (e.key === "Backspace" && query === "" && values.length > 0) {
              removeAt(values.length - 1);
            }
          }}
          placeholder={values.length === 0 ? placeholder : ""}
          className="flex-1 min-w-[80px] bg-transparent outline-none text-sm py-0.5"
        />
      </div>
      {open && (filtered.length > 0 || showCreate) && (
        <div className="absolute z-20 mt-1 w-full max-h-56 overflow-auto rounded-xl border border-border bg-white shadow-lg py-1">
          {filtered.map((s) => (
            <button
              type="button"
              key={s}
              onClick={() => add(s)}
              className="w-full text-left px-3 py-2 text-sm hover:bg-primary/5 transition-colors"
            >
              {s}
            </button>
          ))}
          {showCreate && (
            <button
              type="button"
              onClick={() => add(q)}
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
