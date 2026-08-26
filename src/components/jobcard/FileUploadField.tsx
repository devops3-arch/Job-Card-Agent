import { useRef, useState } from "react";
import { X, Upload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
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

  const compressImageFile = async (file: File): Promise<File> => {
    if (!file.type.startsWith("image/")) return file;
    if (file.size <= 800 * 1024) return file;

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("Unable to read image for compression"));
      reader.readAsDataURL(file);
    });

    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Unable to load image for compression"));
      img.src = dataUrl;
    });

    const maxDimension = 1600;
    const ratio = Math.min(1, maxDimension / Math.max(image.width, image.height));
    const width = Math.round(image.width * ratio);
    const height = Math.round(image.height * ratio);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(image, 0, 0, width, height);

    const quality = 0.75;
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, file.type === "image/png" ? "image/png" : "image/jpeg", quality)
    );

    if (!blob) return file;
    const compressedFile = new File([blob], file.name, { type: blob.type });
    return compressedFile.size < file.size ? compressedFile : file;
  };

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    const selected = Array.from(files);
    if (!multiple && selected.length > 1) selected.splice(1);
    console.debug("FileUploadField: files selected", selected.map((file) => ({ name: file.name, size: file.size, type: file.type })));
    setUploading(true);
    try {
      const uploaded: string[] = [];
      for (const file of selected) {
        console.debug("FileUploadField: starting compression for file", file.name, file.size, file.type);
        const fileToUpload = accept === "image/*" ? await compressImageFile(file) : file;
        console.debug("FileUploadField: compression result", file.name, fileToUpload.size, fileToUpload.type);
        const body = new FormData();
        body.append("files", fileToUpload);
        body.append("kind", accept === "audio/*" ? "sound" : "photo");
        console.debug("FileUploadField: sending upload request", { kind: accept === "audio/*" ? "sound" : "photo", fileName: fileToUpload.name });
        const response = await apiFetch("/api/uploads", { method: "POST", body });
        const result = await response.json();
        console.debug("FileUploadField: upload response", response.status, result);
        if (!response.ok || !result.success || !result.fileUrl) {
          const errorMessage = result?.error?.message || result?.message || "Upload failed";
          throw new Error(errorMessage);
        }
        const returnedFiles = Array.isArray(result.files) ? result.files : [{ fileUrl: result.fileUrl, fileName: result.fileName }];
        returnedFiles.forEach((uploadedFile: { fileUrl: string; fileName?: string }) => {
          uploaded.push(uploadedFile.fileUrl);
          if (accept === "image/*") {
            setPreviews((current) => ({ ...current, [uploadedFile.fileUrl]: URL.createObjectURL(file) }));
          }
        });
      }
      const nextFiles = multiple ? [...value, ...uploaded] : uploaded;
      console.debug("FileUploadField: upload complete, updating parent state", nextFiles);
      onChange(nextFiles);
    } catch (error) {
      console.error("FileUploadField: upload failed", error);
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
          {accept === "image/*" && <img src={previews[fileUrl] || fileUrl} alt="Uploaded preview" className="h-12 w-12 rounded object-cover" />}
          <span className="max-w-[14rem] truncate">{fileUrl.split("/").pop()}</span>
          <button type="button" aria-label={`Remove ${fileUrl.split("/").pop()}`} className="min-h-8 min-w-8 rounded text-destructive hover:bg-destructive/10" onClick={() => onChange(value.filter((_, fileIndex) => fileIndex !== index))}><X className="mx-auto h-4 w-4" /></button>
        </div>)}
      </div>}
    </div>
  );
}
