import { useRef, useState } from "react";
import { X, Upload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetch, resolveFileUrl } from "@/lib/api";
import { toast } from "sonner";

interface Props {
  label: string;
  accept: "image/*" | "audio/*";
  value: string[];
  onChange: (files: string[]) => void;
  multiple?: boolean;
}

export default function FileUploadField({ label, accept, value, onChange, multiple = false }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [previews, setPreviews] = useState<Record<string, string>>({});

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    const selected = Array.from(files);
    if (!multiple && selected.length > 1) selected.splice(1);
    console.log(`[FileUploadField] Starting upload for ${label}:`, selected.map((file) => file.name));
    setUploading(true);
    try {
      const uploaded: string[] = [];
      for (const file of selected) {
        console.log(`[FileUploadField] Preparing file for upload: ${file.name}`);
        const body = new FormData();
        body.append("files", file);
        body.append("kind", accept === "audio/*" ? "sound" : "photo");
        console.log(`[FileUploadField] Sending upload request to /api/uploads`);
        const response = await apiFetch("/api/uploads", { method: "POST", body });
        const result = await response.json();
        console.log(`[FileUploadField] Upload response for ${file.name}:`, result);
        if (!response.ok || !result.success || !result.fileUrl) {
          throw new Error(result?.error?.message || "Upload failed");
        }
        const returnedFiles = Array.isArray(result.files) ? result.files : [{ fileUrl: result.fileUrl, fileName: result.fileName }];
        returnedFiles.forEach((uploadedFile: { fileUrl: string }) => {
          uploaded.push(uploadedFile.fileUrl);
          if (accept === "image/*") {
            setPreviews((current) => ({ ...current, [uploadedFile.fileUrl]: URL.createObjectURL(file) }));
          }
        });
      }
      onChange(multiple ? [...value, ...uploaded] : uploaded);
      console.log(`[FileUploadField] Upload completed for ${label}:`, uploaded);
    } catch (error) {
      console.error(`[FileUploadField] Upload failed for ${label}:`, error);
      toast.error(error instanceof Error ? error.message : "File upload failed");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-2">
      <span className="field-label">{label}</span>
      <div className="flex flex-wrap items-center gap-2">
        <input ref={inputRef} className="hidden" type="file" accept={accept} multiple={multiple} onChange={(event) => upload(event.target.files)} />
        <Button type="button" variant="outline" className="min-h-11" disabled={uploading} onClick={() => inputRef.current?.click()}>
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {uploading ? "Uploading..." : "Choose File"}
        </Button>
        {value.length > 0 && <span className="text-sm text-muted-foreground">{value.length} file{value.length === 1 ? "" : "s"} uploaded</span>}
      </div>
      {value.length > 0 && <div className="flex flex-wrap gap-2">
        {value.map((fileUrl, index) => <div key={`${fileUrl}-${index}`} className="flex items-center gap-2 rounded-lg border bg-muted/30 p-2 text-xs">
          {accept === "image/*" && <img src={previews[fileUrl] || resolveFileUrl(fileUrl)} alt="Uploaded preview" className="h-12 w-12 rounded object-cover" />}
          <span className="max-w-[14rem] truncate">{fileUrl.split("/").pop()}</span>
          <button type="button" aria-label={`Remove ${fileUrl.split("/").pop()}`} className="min-h-8 min-w-8 rounded text-destructive hover:bg-destructive/10" onClick={() => onChange(value.filter((_, fileIndex) => fileIndex !== index))}><X className="mx-auto h-4 w-4" /></button>
        </div>)}
      </div>}
    </div>
  );
}
