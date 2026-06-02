import { useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2, GripVertical } from "lucide-react";
import {
  useGetOfferImages,
  useAddOfferImage,
  useDeleteOfferImage,
  useReorderOfferImages,
  type OfferGalleryImage,
} from "@workspace/api-client-react";

const MAX_BYTES = 8 * 1024 * 1024;

interface OfferGalleryUploaderProps {
  offerId: string;
}

export function OfferGalleryUploader({ offerId }: OfferGalleryUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const { data: images = [], isLoading } = useGetOfferImages(offerId);
  const { mutateAsync: addImage } = useAddOfferImage(offerId);
  const { mutate: deleteImage, isPending: isDeleting } = useDeleteOfferImage(offerId);
  const { mutate: reorder } = useReorderOfferImages(offerId);

  // drag-to-reorder state
  const dragIdxRef = useRef<number | null>(null);

  async function handleFile(file: File) {
    setUploadError(null);
    if (!file.type.startsWith("image/")) {
      setUploadError("Il file deve essere un'immagine.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setUploadError("L'immagine è troppo grande (max 8 MB).");
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/storage/uploads/ftp", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Caricamento file fallito.");
      const { publicUrl } = (await res.json()) as { publicUrl: string };
      await addImage(publicUrl);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Errore upload.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function onDragStart(idx: number) {
    dragIdxRef.current = idx;
  }

  function onDrop(targetIdx: number) {
    const srcIdx = dragIdxRef.current;
    if (srcIdx === null || srcIdx === targetIdx) return;
    const newOrder = [...images];
    const [moved] = newOrder.splice(srcIdx, 1);
    newOrder.splice(targetIdx, 0, moved);
    reorder(newOrder.map((img) => img.id));
    dragIdxRef.current = null;
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        Caricamento galleria…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {images.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {images.map((img: OfferGalleryImage, idx: number) => (
            <div
              key={img.id}
              draggable
              onDragStart={() => onDragStart(idx)}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); onDrop(idx); }}
              className={`relative group rounded-xl overflow-hidden aspect-square border border-border bg-muted cursor-grab active:cursor-grabbing ${dragOver ? "ring-2 ring-primary" : ""}`}
            >
              <img
                src={img.imageUrl}
                alt={`Foto ${idx + 1}`}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                <GripVertical className="w-4 h-4 text-white/70" />
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => deleteImage(img.id)}
                  className="p-1.5 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors"
                  aria-label="Elimina immagine"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <span className="absolute top-1 left-1 bg-black/50 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-md">
                {idx + 1}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-3">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
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
            <ImagePlus className="w-4 h-4" />
          )}
          {uploading ? "Caricamento…" : "Aggiungi foto"}
        </button>
        <p className="text-xs text-muted-foreground">
          JPG, PNG, WebP · Max 8 MB · Trascina per riordinare
        </p>
      </div>

      {uploadError && (
        <p className="text-xs text-red-600">{uploadError}</p>
      )}
    </div>
  );
}
