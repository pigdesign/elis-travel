import { useRef, useState } from "react";
import { FilePlus, FileText, Loader2, Trash2 } from "lucide-react";

const MAX_BYTES = 10 * 1024 * 1024;

export interface PendingDocument {
  tempId: string;
  documentUrl: string;
  fileName: string;
}

interface PendingDocumentsUploaderProps {
  value: PendingDocument[];
  onChange: (docs: PendingDocument[]) => void;
}

export function PendingDocumentsUploader({ value, onChange }: PendingDocumentsUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(file: File) {
    setUploadError(null);
    if (file.type !== "application/pdf") {
      setUploadError("Il file deve essere un PDF.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setUploadError("Il PDF è troppo grande (max 10 MB).");
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/storage/uploads/ftp", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Caricamento file fallito.");
      const { publicUrl } = (await res.json()) as { publicUrl: string };
      onChange([
        ...value,
        { tempId: crypto.randomUUID(), documentUrl: publicUrl, fileName: file.name },
      ]);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Errore upload.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function remove(tempId: string) {
    onChange(value.filter((d) => d.tempId !== tempId));
  }

  return (
    <div className="space-y-3">
      {value.length > 0 && (
        <ul className="space-y-2">
          {value.map((doc) => (
            <li
              key={doc.tempId}
              className="flex items-center gap-3 rounded-xl border border-border bg-muted/40 px-3 py-2"
            >
              <FileText className="w-5 h-5 text-primary flex-shrink-0" />
              <span className="flex-1 min-w-0 truncate text-sm text-foreground">
                {doc.fileName || "Documento PDF"}
              </span>
              <button
                type="button"
                onClick={() => remove(doc.tempId)}
                className="p-1.5 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors"
                aria-label="Rimuovi documento"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-3">
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
          }}
        />
        <button
          type="button"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {uploading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <FilePlus className="w-4 h-4" />
          )}
          {uploading ? "Caricamento…" : "Aggiungi PDF"}
        </button>
        <p className="text-xs text-muted-foreground">
          Solo PDF · Max 10 MB · Allegati al salvataggio
        </p>
      </div>

      {uploadError && <p className="text-xs text-red-600">{uploadError}</p>}
    </div>
  );
}
