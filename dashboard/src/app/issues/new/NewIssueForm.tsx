"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createIssueAndReturn } from "./actions";
import { AttachmentUploader } from "@/components/AttachmentUploader";
import { AttachmentList } from "@/components/AttachmentList";
import { saveAttachments } from "../[id]/actions";
import type { UploadedAttachment } from "@/lib/storage";

const INPUT_CLASS =
  "w-full px-3 py-2 rounded-md bg-[#0d1117] border border-[#30363d] text-[#e6edf3] text-sm placeholder-[#8b949e] focus:outline-none focus:border-[#00d4aa] focus:ring-1 focus:ring-[#00d4aa]/30 transition-colors";

const SELECT_CLASS =
  "w-full px-3 py-2 rounded-md bg-[#0d1117] border border-[#30363d] text-[#e6edf3] text-sm focus:outline-none focus:border-[#00d4aa] focus:ring-1 focus:ring-[#00d4aa]/30 transition-colors appearance-none";

const LABEL_CLASS = "block text-xs font-medium text-[#8b949e] mb-1.5 uppercase tracking-wide";

interface Props {
  companyId: string;
  companyName: string;
  companyPrefix?: string | null;
  agents: { id: string; name: string; icon?: string | null }[];
  projects: { id: string; name: string }[];
}

export function NewIssueForm({ companyId, companyName, companyPrefix, agents, projects }: Props) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [stagedFiles, setStagedFiles] = useState<UploadedAttachment[]>([]);
  const [issueIdForUpload, setIssueIdForUpload] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // We need to create the issue first to get an ID before we can upload files.
  // Two-step: (1) create issue → get id (2) upload files linked to id.
  // Uploaded files staged before submit use that id after submit.
  // Pre-submit: files stage locally (uploaded to storage) but not linked yet.
  // On submit: create issue, then save attachment records.

  function handleFileUploaded(attachment: UploadedAttachment) {
    setStagedFiles((prev) => [...prev, attachment]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formRef.current) return;
    setError(null);
    const formData = new FormData(formRef.current);

    startTransition(async () => {
      try {
        const issueId = await createIssueAndReturn(formData);
        if (stagedFiles.length > 0) {
          await saveAttachments(issueId, null, stagedFiles);
        }
        router.push(`/issues/${issueId}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create issue");
      }
    });
  }

  const stagedForDisplay = stagedFiles.map((f, i) => ({
    id: `staged-${i}`,
    filename: f.filename,
    mime_type: f.mime_type,
    size_bytes: f.size_bytes,
    storage_path: f.storage_path,
  }));

  // For AttachmentUploader before issue is created, we need a temp issueId.
  // Files are uploaded to storage but records saved after issue creation.
  // Use a stable temp path by generating a placeholder UUID client-side.
  const [tempIssueId] = useState<string>(() =>
    typeof crypto !== "undefined" ? crypto.randomUUID() : Math.random().toString(36).slice(2)
  );

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-5">
      {/* Title */}
      <div>
        <label htmlFor="title" className={LABEL_CLASS}>
          Title <span className="text-[#f85149]">*</span>
        </label>
        <input
          id="title"
          name="title"
          type="text"
          required
          placeholder="Issue title..."
          autoFocus
          className={INPUT_CLASS}
        />
      </div>

      {/* Description */}
      <div>
        <label htmlFor="description" className={LABEL_CLASS}>
          Description
        </label>
        <textarea
          id="description"
          name="description"
          rows={6}
          placeholder="Describe the issue..."
          className={INPUT_CLASS + " resize-y min-h-[120px]"}
        />
      </div>

      {/* Attachments */}
      <div>
        <label className={LABEL_CLASS}>Attachments</label>
        {stagedForDisplay.length > 0 && (
          <div className="mb-2">
            <AttachmentList attachments={stagedForDisplay} />
          </div>
        )}
        <AttachmentUploader
          issueId={tempIssueId}
          onUploaded={handleFileUploaded}
          disabled={pending}
        />
      </div>

      {/* Priority + Status */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="priority" className={LABEL_CLASS}>
            Priority
          </label>
          <div className="relative">
            <select id="priority" name="priority" defaultValue="medium" className={SELECT_CLASS}>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center">
              <svg className="w-4 h-4 text-[#8b949e]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
        </div>

        <div>
          <label htmlFor="status" className={LABEL_CLASS}>
            Status
          </label>
          <div className="relative">
            <select id="status" name="status" defaultValue="todo" className={SELECT_CLASS}>
              <option value="backlog">Backlog</option>
              <option value="todo">Todo</option>
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center">
              <svg className="w-4 h-4 text-[#8b949e]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Company */}
      <input type="hidden" name="company_id" value={companyId} />
      <div>
        <span className={LABEL_CLASS}>Company</span>
        <p className="text-sm text-[#e6edf3]">
          {companyName}{companyPrefix ? ` (${companyPrefix})` : ""}
        </p>
      </div>

      {/* Assignee */}
      <div>
        <label htmlFor="assignee_agent_id" className={LABEL_CLASS}>
          Assignee
        </label>
        <div className="relative">
          <select id="assignee_agent_id" name="assignee_agent_id" defaultValue="" className={SELECT_CLASS}>
            <option value="">Unassigned</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.icon ? `${a.icon} ` : ""}{a.name}
              </option>
            ))}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center">
            <svg className="w-4 h-4 text-[#8b949e]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
      </div>

      {/* Project */}
      <div>
        <label htmlFor="project_id" className={LABEL_CLASS}>
          Project
        </label>
        <div className="relative">
          <select id="project_id" name="project_id" defaultValue="" className={SELECT_CLASS}>
            <option value="">No project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center">
            <svg className="w-4 h-4 text-[#8b949e]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
      </div>

      {error && (
        <p className="text-sm text-[#f85149] px-1">{error}</p>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#30363d]">
        <button
          type="button"
          onClick={() => router.push("/issues")}
          className="px-4 py-2 text-sm text-[#8b949e] hover:text-[#e6edf3] transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending}
          className="px-5 py-2 rounded-md bg-[#00d4aa] text-[#0d1117] text-sm font-semibold hover:bg-[#00e4b8] active:bg-[#00c49a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {pending ? "Creating..." : "Create Issue"}
        </button>
      </div>
    </form>
  );
}
