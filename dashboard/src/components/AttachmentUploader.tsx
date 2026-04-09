"use client";
import { useRef, useState } from "react";
import { uploadAttachment, UploadedAttachment } from "@/lib/storage";

interface Props {
  issueId: string;
  onUploaded: (attachment: UploadedAttachment) => void;
  disabled?: boolean;
}

export function AttachmentUploader({ issueId, onUploaded, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        const result = await uploadAttachment(issueId, file);
        onUploaded(result);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="mt-2">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
        className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-md border border-dashed text-xs cursor-pointer transition-colors ${
          dragOver
            ? "border-[#00d4aa] bg-[#00d4aa]/10 text-[#00d4aa]"
            : "border-[#30363d] text-[#8b949e] hover:border-[#8b949e] hover:text-[#e6edf3]"
        } ${disabled || uploading ? "pointer-events-none opacity-50" : ""}`}
      >
        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
        </svg>
        {uploading ? "Uploading..." : "Attach files or drag & drop"}
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        disabled={disabled || uploading}
        onChange={(e) => handleFiles(e.target.files)}
      />
      {error && <p className="text-xs text-[#f85149] mt-1">{error}</p>}
    </div>
  );
}
