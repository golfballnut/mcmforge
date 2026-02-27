"use client";

import { useState, useTransition, useRef } from "react";
import { createTask, uploadAttachment } from "@/app/actions";

type Company = { id: string; name: string };

type Attachment = { url: string; name: string };

export default function NewTaskForm({ companies }: { companies: Company[] }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ error?: string; success?: boolean } | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    for (const file of Array.from(files)) {
      const fd = new FormData();
      fd.append("file", file);
      const res = await uploadAttachment(fd);
      if (res.url) {
        setAttachments((prev) => [...prev, { url: res.url, name: res.name ?? file.name }]);
      }
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  function removeAttachment(idx: number) {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSubmit(formData: FormData) {
    // Append attachment URLs to the form data
    for (const att of attachments) {
      formData.append("attachment_url", att.url);
    }
    startTransition(async () => {
      const res = await createTask(formData);
      if (res?.success) {
        setOpen(false);
        setResult(null);
        setAttachments([]);
      } else {
        setResult(res);
      }
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-4 py-2 bg-[#1a73e8] hover:bg-[#1765cc] text-white text-sm font-medium rounded-lg transition-colors mb-6"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        New Task
      </button>
    );
  }

  return (
    <div className="bg-white border border-[#dadce0] rounded-lg p-6 mb-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-medium text-[#202124]">Create Task</h2>
        <button
          onClick={() => { setOpen(false); setResult(null); setAttachments([]); }}
          className="text-[#5f6368] hover:text-[#202124]"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {result?.error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
          {result.error}
        </div>
      )}

      <form action={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-[#202124] mb-1">Title</label>
          <input
            name="title"
            required
            placeholder="e.g. Fix map toolbar responsive layout"
            className="w-full px-3 py-2 bg-white border border-[#dadce0] rounded-lg text-[#202124] placeholder-[#5f6368] focus:outline-none focus:border-[#1a73e8] focus:ring-1 focus:ring-[#1a73e8]"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-[#202124] mb-1">Description</label>
          <textarea
            name="description"
            rows={4}
            placeholder="Describe the bug or feature. Include what you see, what you expect, and any context."
            className="w-full px-3 py-2 bg-white border border-[#dadce0] rounded-lg text-[#202124] placeholder-[#5f6368] focus:outline-none focus:border-[#1a73e8] focus:ring-1 focus:ring-[#1a73e8] resize-y"
          />
        </div>

        {/* File Attachments */}
        <div>
          <label className="block text-sm font-medium text-[#202124] mb-1">Attachments</label>
          <div className="flex items-center gap-3">
            <label className="inline-flex items-center gap-2 px-3 py-1.5 border border-[#dadce0] rounded-lg text-sm text-[#5f6368] hover:bg-[#f1f3f4] cursor-pointer transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
              {uploading ? "Uploading..." : "Attach files"}
              <input
                ref={fileRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleFileChange}
                accept="image/*,.pdf,.doc,.docx,.xlsx,.csv,.txt"
              />
            </label>
            <span className="text-xs text-[#80868b]">Images, PDFs, docs</span>
          </div>
          {attachments.length > 0 && (
            <div className="mt-2 space-y-1">
              {attachments.map((att, i) => (
                <div key={i} className="flex items-center gap-2 text-xs text-[#202124] bg-[#f1f3f4] rounded px-2 py-1">
                  <svg className="w-3.5 h-3.5 text-[#5f6368] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                  </svg>
                  <span className="truncate">{att.name}</span>
                  <button type="button" onClick={() => removeAttachment(i)} className="ml-auto text-[#5f6368] hover:text-red-600">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-[#202124] mb-1">Company</label>
            <select
              name="company_id"
              className="w-full px-3 py-2 bg-white border border-[#dadce0] rounded-lg text-[#202124] focus:outline-none focus:border-[#1a73e8]"
            >
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-[#202124] mb-1">Priority</label>
            <select
              name="priority"
              defaultValue="high"
              className="w-full px-3 py-2 bg-white border border-[#dadce0] rounded-lg text-[#202124] focus:outline-none focus:border-[#1a73e8]"
            >
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-[#202124] mb-1">Type</label>
            <select
              name="task_type"
              defaultValue="code"
              className="w-full px-3 py-2 bg-white border border-[#dadce0] rounded-lg text-[#202124] focus:outline-none focus:border-[#1a73e8]"
            >
              <option value="code">Code</option>
              <option value="research">Research</option>
              <option value="content">Content</option>
              <option value="ops">Ops</option>
              <option value="chat">Chat</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-[#202124] mb-1">CLI</label>
            <select
              name="cli_target"
              defaultValue="claude"
              className="w-full px-3 py-2 bg-white border border-[#dadce0] rounded-lg text-[#202124] focus:outline-none focus:border-[#1a73e8]"
            >
              <option value="claude">Claude</option>
              <option value="gemini">Gemini</option>
              <option value="codex">Codex</option>
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={() => { setOpen(false); setResult(null); setAttachments([]); }}
            className="px-4 py-2 text-sm text-[#5f6368] hover:text-[#202124] transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isPending || uploading}
            className="px-6 py-2 bg-[#1a73e8] hover:bg-[#1765cc] disabled:bg-[#d3e3fd] disabled:text-[#1a73e8] text-white text-sm font-medium rounded-lg transition-colors"
          >
            {isPending ? "Creating..." : "Create Task"}
          </button>
        </div>
      </form>
    </div>
  );
}
