"use client";

import { useState, useRef, useCallback } from "react";

interface Attachment {
  id: string;
  file_name: string;
  file_url: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImage(mimeType: string): boolean {
  return mimeType.startsWith("image/");
}

export function AttachmentsSection({
  issueId,
  initialAttachments,
}: {
  issueId: string;
  initialAttachments: Attachment[];
}) {
  const [attachments, setAttachments] = useState<Attachment[]>(initialAttachments);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedUrl, setExpandedUrl] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadFile = useCallback(async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/issues/${issueId}/attachments`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || "Upload failed");
      }
      const attachment = await res.json();
      setAttachments((prev) => [...prev, attachment]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }, [issueId]);

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;
    uploadFile(files[0]);
  }, [uploadFile]);

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  };

  const onDragLeave = () => setDragging(false);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-5">
      <h3 className="text-sm font-semibold text-[#e6edf3] mb-4">
        Attachments
        {attachments.length > 0 && (
          <span className="ml-2 text-xs bg-[#30363d] text-[#8b949e] px-1.5 py-0.5 rounded-full">
            {attachments.length}
          </span>
        )}
      </h3>

      {/* Drop zone */}
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-4 mb-4 text-center cursor-pointer transition-colors ${
          dragging
            ? "border-[#00d4aa] bg-[#00d4aa]/5"
            : "border-[#30363d] hover:border-[#8b949e]"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        {uploading ? (
          <p className="text-sm text-[#8b949e]">Uploading…</p>
        ) : (
          <p className="text-sm text-[#8b949e]">
            Drop a file here or <span className="text-[#00d4aa]">click to upload</span>
          </p>
        )}
      </div>

      {error && (
        <p className="text-xs text-[#f85149] mb-3">{error}</p>
      )}

      {/* Attachment list */}
      {attachments.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {attachments.map((a) =>
            isImage(a.mime_type) ? (
              <button
                key={a.id}
                onClick={() => setExpandedUrl(a.file_url)}
                className="group relative aspect-square rounded overflow-hidden border border-[#30363d] hover:border-[#00d4aa] transition-colors"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={a.file_url}
                  alt={a.file_name}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-1">
                  <span className="text-[10px] text-white truncate">{a.file_name}</span>
                </div>
              </button>
            ) : (
              <a
                key={a.id}
                href={a.file_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-col items-center justify-center gap-1 aspect-square rounded border border-[#30363d] hover:border-[#00d4aa] transition-colors p-2"
              >
                <svg className="w-6 h-6 text-[#8b949e]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span className="text-[10px] text-[#8b949e] truncate w-full text-center">{a.file_name}</span>
                <span className="text-[9px] text-[#484f58]">{formatBytes(a.size_bytes)}</span>
              </a>
            )
          )}
        </div>
      )}

      {/* Lightbox */}
      {expandedUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-8"
          onClick={() => setExpandedUrl(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={expandedUrl}
            alt="Attachment preview"
            className="max-w-full max-h-full rounded shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            className="absolute top-4 right-4 text-white/70 hover:text-white text-2xl leading-none"
            onClick={() => setExpandedUrl(null)}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
