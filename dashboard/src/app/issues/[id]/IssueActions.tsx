"use client";
import { useTransition, useState, useRef, useCallback } from "react";
import {
  updateIssueStatus,
  updateIssuePriority,
  assignIssue,
  addComment,
  addCommentWithAttachmentPaths,
  uploadIssueAttachmentRecord,
} from "./actions";
import { createClient as createBrowserSupabase } from "@/lib/supabase/client";

// ── Status dropdown ──────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: "backlog",     label: "Backlog",     dot: "bg-[#8b949e]", color: "text-[#8b949e]" },
  { value: "todo",        label: "Todo",        dot: "bg-[#58a6ff]", color: "text-[#58a6ff]" },
  { value: "in_progress", label: "In Progress", dot: "bg-[#d29922]", color: "text-[#d29922]" },
  { value: "in_review",   label: "In Review",   dot: "bg-[#a371f7]", color: "text-[#a371f7]" },
  { value: "done",        label: "Done",        dot: "bg-[#3fb950]", color: "text-[#3fb950]" },
  { value: "cancelled",   label: "Cancelled",   dot: "bg-[#f85149]", color: "text-[#f85149]" },
];

const PRIORITY_OPTIONS = [
  { value: "critical", label: "Critical", color: "text-[#f85149]" },
  { value: "high",     label: "High",     color: "text-[#d29922]" },
  { value: "medium",   label: "Medium",   color: "text-[#8b949e]" },
  { value: "low",      label: "Low",      color: "text-[#8b949e]" },
];

interface Agent {
  id: string;
  name: string;
}

export function StatusDropdown({
  issueId,
  currentStatus,
}: {
  issueId: string;
  currentStatus: string;
}) {
  const [pending, startTransition] = useTransition();
  const current = STATUS_OPTIONS.find((s) => s.value === currentStatus) ?? STATUS_OPTIONS[0];

  return (
    <select
      disabled={pending}
      defaultValue={currentStatus}
      onChange={(e) => {
        const val = e.target.value;
        startTransition(() => updateIssueStatus(issueId, val));
      }}
      className={`bg-transparent border-none text-xs cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#00d4aa] rounded disabled:opacity-50 ${current.color}`}
    >
      {STATUS_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value} className="bg-[#161b22] text-[#e6edf3]">
          {opt.label}
        </option>
      ))}
    </select>
  );
}

export function PriorityDropdown({
  issueId,
  currentPriority,
}: {
  issueId: string;
  currentPriority: string;
}) {
  const [pending, startTransition] = useTransition();
  const current = PRIORITY_OPTIONS.find((p) => p.value === currentPriority) ?? PRIORITY_OPTIONS[2];

  return (
    <select
      disabled={pending}
      defaultValue={currentPriority}
      onChange={(e) => {
        const val = e.target.value;
        startTransition(() => updateIssuePriority(issueId, val));
      }}
      className={`bg-transparent border-none text-xs cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#00d4aa] rounded disabled:opacity-50 ${current.color}`}
    >
      {PRIORITY_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value} className="bg-[#161b22] text-[#e6edf3]">
          {opt.label}
        </option>
      ))}
    </select>
  );
}

export function AssigneeDropdown({
  issueId,
  currentAgentId,
  agents,
}: {
  issueId: string;
  currentAgentId: string | null;
  agents: Agent[];
}) {
  const [pending, startTransition] = useTransition();

  return (
    <select
      disabled={pending}
      defaultValue={currentAgentId ?? ""}
      onChange={(e) => {
        const val = e.target.value || null;
        startTransition(() => assignIssue(issueId, val));
      }}
      className="bg-transparent border-none text-xs text-[#e6edf3] cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#00d4aa] rounded disabled:opacity-50 max-w-[140px] truncate"
    >
      <option value="" className="bg-[#161b22] text-[#8b949e]">Unassigned</option>
      {agents.map((agent) => (
        <option key={agent.id} value={agent.id} className="bg-[#161b22] text-[#e6edf3]">
          {agent.name}
        </option>
      ))}
    </select>
  );
}

// ── Attachment upload ────────────────────────────────────────────────────────

const ALLOWED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "video/mp4",
  "video/webm",
  "video/quicktime",
];
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_UPLOAD_BYTES = 50 * 1024 * 1024;
function maxBytesFor(type: string) {
  return type.startsWith("video/") ? MAX_VIDEO_UPLOAD_BYTES : MAX_UPLOAD_BYTES;
}

const CATEGORY_OPTIONS = [
  { value: "pass", label: "Pass ✓" },
  { value: "fail", label: "Fail ✗" },
  { value: "user_upload", label: "User Upload" },
  { value: "testing", label: "Testing" },
  { value: "comparison", label: "Comparison" },
  { value: "video", label: "Video" },
];

export function AttachmentUpload({ issueId }: { issueId: string }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [category, setCategory] = useState<string>("user_upload");

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;

    const valid: File[] = [];
    const rejected: string[] = [];
    for (const file of files) {
      if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
        rejected.push(`${file.name} (invalid type)`);
        continue;
      }
      const limit = maxBytesFor(file.type);
      if (file.size > limit) {
        const mb = limit / (1024 * 1024);
        rejected.push(`${file.name} (exceeds ${mb}MB)`);
        continue;
      }
      valid.push(file);
    }

    if (valid.length === 0) {
      setMessage({ kind: "error", text: `No valid files. Rejected: ${rejected.join(", ")}` });
      return;
    }

    setMessage(null);
    let completed = 0;
    setProgress({ current: 0, total: valid.length });

    startTransition(async () => {
      const supabase = createBrowserSupabase();
      const results = await Promise.all(
        valid.map(async (file) => {
          try {
            // Upload directly to Supabase Storage from browser (bypasses Vercel 4.5MB body limit)
            const ext = file.name.split(".").pop() || "bin";
            const storagePath = `task-attachments/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
            const { error: uploadError } = await supabase.storage
              .from("artifacts")
              .upload(storagePath, file, { contentType: file.type, upsert: false });
            if (uploadError) throw new Error(uploadError.message);

            // Create DB record via server action (tiny JSON payload)
            const res = await uploadIssueAttachmentRecord(
              issueId, storagePath, file.name, file.type, file.size, category
            );
            completed += 1;
            setProgress({ current: completed, total: valid.length });
            return { file, error: res?.error ?? null };
          } catch (err) {
            completed += 1;
            setProgress({ current: completed, total: valid.length });
            return { file, error: err instanceof Error ? err.message : "Upload failed" };
          }
        }),
      );

      const succeeded = results.filter((r) => !r.error);
      const failed = results.filter((r) => r.error);
      setProgress(null);

      const parts: string[] = [];
      if (succeeded.length > 0) parts.push(`Uploaded ${succeeded.length} file${succeeded.length === 1 ? "" : "s"}`);
      if (failed.length > 0) parts.push(`${failed.length} failed: ${failed.map((f) => f.file.name).join(", ")}`);
      if (rejected.length > 0) parts.push(`Rejected: ${rejected.join(", ")}`);

      setMessage({
        kind: failed.length > 0 || rejected.length > 0 ? "error" : "success",
        text: parts.join(" · "),
      });
    });
  }

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 flex-wrap">
      <label
        className={`inline-flex items-center gap-2 px-3 py-1.5 bg-[#161b22] border border-[#30363d] rounded text-xs text-[#e6edf3] cursor-pointer hover:border-[#00d4aa] transition-colors ${
          pending ? "opacity-50 cursor-not-allowed" : ""
        }`}
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        {pending
          ? progress
            ? `Uploading ${progress.current} of ${progress.total}...`
            : "Uploading..."
          : "Upload screenshots"}
        <input
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp,video/mp4,video/webm,video/quicktime"
          multiple
          className="hidden"
          disabled={pending}
          onChange={handleChange}
        />
      </label>
        <select
          disabled={pending}
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="px-2 py-1.5 bg-[#161b22] border border-[#30363d] rounded text-xs text-[#e6edf3] cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#00d4aa] disabled:opacity-50"
        >
          {CATEGORY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value} className="bg-[#161b22] text-[#e6edf3]">
              {opt.label}
            </option>
          ))}
        </select>
      </div>
      {message && (
        <p
          className={`mt-2 text-xs ${
            message.kind === "success" ? "text-[#3fb950]" : "text-[#f85149]"
          }`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}

// ── Comment form ─────────────────────────────────────────────────────────────

interface PendingFile {
  file: File;
  category: string;
  previewUrl: string | null;
}

const COMMENT_CATEGORY_OPTIONS = [
  { value: "pass", label: "Pass \u2713" },
  { value: "fail", label: "Fail \u2717" },
  { value: "user_upload", label: "User Upload" },
  { value: "testing", label: "Testing" },
];

const COMMENT_ALLOWED_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "video/mp4",
  "video/webm",
  "video/quicktime",
];

export function CommentForm({
  issueId,
  companyId,
}: {
  issueId: string;
  companyId: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [fileCategory, setFileCategory] = useState("user_upload");
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback(
    (incoming: File[]) => {
      setError(null);
      const valid: PendingFile[] = [];
      const rejected: string[] = [];
      for (const f of incoming) {
        if (!COMMENT_ALLOWED_TYPES.includes(f.type)) {
          rejected.push(`${f.name} (invalid type)`);
          continue;
        }
        const limit = f.type.startsWith("video/") ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
        if (f.size > limit) {
          rejected.push(`${f.name} (too large)`);
          continue;
        }
        const previewUrl = f.type.startsWith("image/") ? URL.createObjectURL(f) : null;
        valid.push({ file: f, category: fileCategory, previewUrl });
      }
      if (rejected.length > 0) setError(`Rejected: ${rejected.join(", ")}`);
      if (valid.length > 0) setFiles((prev) => [...prev, ...valid]);
    },
    [fileCategory],
  );

  function removeFile(index: number) {
    setFiles((prev) => {
      const removed = prev[index];
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const dropped = Array.from(e.dataTransfer.files);
    if (dropped.length > 0) addFiles(dropped);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (selected.length > 0) addFiles(selected);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = body.trim();
    if (!trimmed && files.length === 0) return;
    const commentBody = trimmed || "(attached files)";

    startTransition(async () => {
      if (files.length > 0) {
        // Upload files directly to Supabase Storage from browser (bypasses Vercel 4.5MB body limit)
        const supabase = createBrowserSupabase();
        const attachments: { storagePath: string; filename: string; mimeType: string; sizeBytes: number; category: string }[] = [];

        for (const pf of files) {
          const ext = pf.file.name.split(".").pop() || "bin";
          const storagePath = `task-attachments/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
          const { error: uploadError } = await supabase.storage
            .from("artifacts")
            .upload(storagePath, pf.file, { contentType: pf.file.type, upsert: false });

          if (uploadError) {
            setError(`Upload failed for ${pf.file.name}: ${uploadError.message}`);
            return;
          }

          attachments.push({
            storagePath,
            filename: pf.file.name,
            mimeType: pf.file.type,
            sizeBytes: pf.file.size,
            category: pf.category,
          });
        }

        // Send only metadata to server action (tiny JSON, no file bytes)
        await addCommentWithAttachmentPaths(issueId, companyId ?? "", commentBody, attachments);
      } else {
        await addComment(issueId, companyId ?? "", commentBody);
      }
      // Clean up preview URLs
      for (const pf of files) {
        if (pf.previewUrl) URL.revokeObjectURL(pf.previewUrl);
      }
      setBody("");
      setFiles([]);
      setError(null);
    });
  }

  const canSubmit = !pending && (body.trim().length > 0 || files.length > 0);

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-[#161b22] border border-[#30363d] rounded-lg overflow-hidden"
    >
      <textarea
        rows={3}
        placeholder="Leave a comment..."
        value={body}
        onChange={(e) => setBody(e.target.value)}
        disabled={pending}
        className="w-full px-4 py-3 bg-transparent text-sm text-[#e6edf3] placeholder-[#8b949e] resize-none focus:outline-none disabled:opacity-50"
      />

      {/* Drop zone + file previews */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`mx-4 mb-2 border-2 border-dashed rounded-lg transition-colors ${
          dragOver
            ? "border-[#00d4aa] bg-[#00d4aa]/5"
            : files.length > 0
            ? "border-[#30363d] bg-[#0d1117]"
            : "border-[#30363d]"
        }`}
      >
        {files.length > 0 ? (
          <div className="p-3">
            <div className="flex flex-wrap gap-2 mb-2">
              {files.map((pf, idx) => (
                <div
                  key={idx}
                  className="relative group bg-[#161b22] border border-[#30363d] rounded overflow-hidden"
                  style={{ width: "80px", height: "80px" }}
                >
                  {pf.previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={pf.previewUrl}
                      alt={pf.file.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <svg className="w-6 h-6 text-[#8b949e]" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </div>
                  )}
                  {/* Category badge */}
                  <span
                    className="absolute bottom-0.5 left-0.5 px-1 py-px text-[8px] uppercase tracking-wide rounded font-semibold"
                    style={{
                      backgroundColor:
                        pf.category === "pass" ? "#3fb95030" :
                        pf.category === "fail" ? "#f8514930" : "#30363d",
                      color:
                        pf.category === "pass" ? "#3fb950" :
                        pf.category === "fail" ? "#f85149" : "#8b949e",
                    }}
                  >
                    {pf.category === "pass" ? "\u2713" : pf.category === "fail" ? "\u2717" : pf.category.replace("_", " ")}
                  </span>
                  {/* Remove button */}
                  <button
                    type="button"
                    onClick={() => removeFile(idx)}
                    className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-[#f85149] text-white text-[10px] leading-none flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-[#8b949e]">
              Drop more files or click &quot;Attach&quot; below
            </p>
          </div>
        ) : (
          <div className="py-4 text-center">
            <p className="text-xs text-[#8b949e]">
              Drag &amp; drop images or videos here
            </p>
          </div>
        )}
      </div>

      {error && (
        <p className="mx-4 mb-2 text-xs text-[#f85149]">{error}</p>
      )}

      {/* Bottom toolbar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-t border-[#30363d] gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={pending}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-[#0d1117] border border-[#30363d] rounded text-xs text-[#8b949e] hover:text-[#e6edf3] hover:border-[#00d4aa] transition-colors disabled:opacity-50"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
            Attach
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp,video/mp4,video/webm,video/quicktime"
            multiple
            className="hidden"
            disabled={pending}
            onChange={handleFileInput}
          />
          <select
            value={fileCategory}
            onChange={(e) => setFileCategory(e.target.value)}
            disabled={pending}
            className="px-2 py-1.5 bg-[#0d1117] border border-[#30363d] rounded text-xs text-[#e6edf3] cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#00d4aa] disabled:opacity-50"
          >
            {COMMENT_CATEGORY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value} className="bg-[#161b22] text-[#e6edf3]">
                {opt.label}
              </option>
            ))}
          </select>
          <span className="text-xs text-[#8b949e]">Markdown supported</span>
        </div>
        <button
          type="submit"
          disabled={!canSubmit}
          className="px-3 py-1.5 bg-[#00d4aa] text-[#0d1117] text-xs font-medium rounded hover:bg-[#00e4b8] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {pending ? "Posting..." : files.length > 0 ? `Comment (${files.length} file${files.length === 1 ? "" : "s"})` : "Comment"}
        </button>
      </div>
    </form>
  );
}
