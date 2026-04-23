import { useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";

interface CoverImageUploaderProps {
  value: string | null | undefined;
  onChange: (url: string | null) => void | Promise<void>;
  className?: string;
  testIdPrefix?: string;
}

const MAX_BYTES = 8 * 1024 * 1024;

export function CoverImageUploader({
  value,
  onChange,
  className,
  testIdPrefix = "cover-image",
}: CoverImageUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    if (!file.type.startsWith("image/")) {
      setError("Il file deve essere un'immagine.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("L'immagine è troppo grande (max 8 MB).");
      return;
    }
    setBusy(true);
    try {
      const reqRes = await fetch("/api/storage/uploads/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: file.name,
          size: file.size,
          contentType: file.type,
        }),
      });
      if (!reqRes.ok) throw new Error("Impossibile generare l'URL di upload.");
      const reqJson = (await reqRes.json()) as {
        uploadURL: string;
        objectPath: string;
      };

      const putRes = await fetch(reqJson.uploadURL, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!putRes.ok) throw new Error("Caricamento file fallito.");

      const publicUrl = `/api/storage${reqJson.objectPath}`;
      await onChange(publicUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore upload immagine.");
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className={className}>
      <div className="flex items-start gap-4">
        <div className="w-32 h-24 rounded-xl bg-muted border border-border overflow-hidden flex items-center justify-center flex-shrink-0">
          {value ? (
            <img
              src={value}
              alt="Anteprima copertina"
              className="w-full h-full object-cover"
              data-testid={`${testIdPrefix}-preview`}
            />
          ) : (
            <ImagePlus className="w-8 h-8 text-muted-foreground" />
          )}
        </div>
        <div className="flex-1 min-w-0 space-y-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            data-testid={`${testIdPrefix}-input`}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
            }}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            data-testid={`${testIdPrefix}-upload-button`}
          >
            {busy ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ImagePlus className="w-4 h-4" />
            )}
            {value ? "Sostituisci immagine" : "Carica immagine"}
          </button>
          {value && !busy && (
            <button
              type="button"
              onClick={() => void onChange(null)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors ml-2"
              data-testid={`${testIdPrefix}-remove-button`}
            >
              <Trash2 className="w-4 h-4" />
              Rimuovi
            </button>
          )}
          <p className="text-xs text-muted-foreground">
            Formati supportati: JPG, PNG, WebP. Max 8 MB.
          </p>
          {error && (
            <p
              className="text-xs text-red-600"
              data-testid={`${testIdPrefix}-error`}
            >
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
