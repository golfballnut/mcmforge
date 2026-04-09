import { getAttachmentUrl } from "@/lib/storage";

interface Attachment {
  id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  storage_path: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${Math.round(bytes / (1024 * 1024))}MB`;
}

function FileIcon({ mimeType }: { mimeType: string }) {
  const isImage = mimeType.startsWith("image/");
  return (
    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      {isImage ? (
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      ) : (
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
      )}
    </svg>
  );
}

export function AttachmentList({ attachments }: { attachments: Attachment[] }) {
  if (attachments.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 mt-3">
      {attachments.map((a) => {
        const isImage = a.mime_type.startsWith("image/");
        const url = getAttachmentUrl(a.storage_path);
        return (
          <a
            key={a.id}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-[#0d1117] border border-[#30363d] text-xs text-[#8b949e] hover:border-[#58a6ff] hover:text-[#e6edf3] transition-colors max-w-[200px]"
            title={`${a.filename} (${formatSize(a.size_bytes)})`}
          >
            <FileIcon mimeType={a.mime_type} />
            <span className="truncate">{a.filename}</span>
            <span className="shrink-0 text-[#484f58]">{formatSize(a.size_bytes)}</span>
          </a>
        );
      })}
    </div>
  );
}

// Inline image thumbnails for image attachments
export function AttachmentThumbnails({ attachments }: { attachments: Attachment[] }) {
  const images = attachments.filter((a) => a.mime_type.startsWith("image/"));
  if (images.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 mt-3">
      {images.map((a) => {
        const url = getAttachmentUrl(a.storage_path);
        return (
          <a key={a.id} href={url} target="_blank" rel="noopener noreferrer"
            className="block w-20 h-20 rounded-md overflow-hidden border border-[#30363d] hover:border-[#58a6ff] transition-colors"
            title={a.filename}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={a.filename} className="w-full h-full object-cover" />
          </a>
        );
      })}
    </div>
  );
}
