"use client";
import { useTransition, useState } from "react";
import {
  updateIssueStatus,
  updateIssuePriority,
  assignIssue,
  addComment,
  uploadIssueAttachment,
} from "./actions";

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

const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export function AttachmentUpload({ issueId }: { issueId: string }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setMessage({ kind: "error", text: "Only PNG, JPG, GIF, or WebP images are allowed." });
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setMessage({ kind: "error", text: "File exceeds 10MB limit." });
      return;
    }

    setMessage(null);
    const formData = new FormData();
    formData.append("file", file);

    startTransition(async () => {
      const res = await uploadIssueAttachment(issueId, formData);
      if (res?.error) {
        setMessage({ kind: "error", text: res.error });
      } else {
        setMessage({ kind: "success", text: `Uploaded ${file.name}` });
      }
    });
  }

  return (
    <div className="mb-6">
      <label
        className={`inline-flex items-center gap-2 px-3 py-1.5 bg-[#161b22] border border-[#30363d] rounded text-xs text-[#e6edf3] cursor-pointer hover:border-[#00d4aa] transition-colors ${
          pending ? "opacity-50 cursor-not-allowed" : ""
        }`}
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        {pending ? "Uploading..." : "Upload screenshot"}
        <input
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          className="hidden"
          disabled={pending}
          onChange={handleChange}
        />
      </label>
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

export function CommentForm({
  issueId,
  companyId,
}: {
  issueId: string;
  companyId: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [body, setBody] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) return;
    startTransition(async () => {
      await addComment(issueId, companyId ?? "", trimmed);
      setBody("");
    });
  }

  return (
    <form onSubmit={handleSubmit} className="bg-[#161b22] border border-[#30363d] rounded-lg overflow-hidden">
      <textarea
        rows={3}
        placeholder="Leave a comment..."
        value={body}
        onChange={(e) => setBody(e.target.value)}
        disabled={pending}
        className="w-full px-4 py-3 bg-transparent text-sm text-[#e6edf3] placeholder-[#8b949e] resize-none focus:outline-none disabled:opacity-50"
      />
      <div className="flex items-center justify-between px-4 py-2.5 border-t border-[#30363d]">
        <span className="text-xs text-[#8b949e]">Markdown supported</span>
        <button
          type="submit"
          disabled={pending || !body.trim()}
          className="px-3 py-1.5 bg-[#00d4aa] text-[#0d1117] text-xs font-medium rounded hover:bg-[#00e4b8] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {pending ? "Posting..." : "Comment"}
        </button>
      </div>
    </form>
  );
}
