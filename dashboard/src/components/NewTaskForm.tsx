"use client";

import { useState, useTransition } from "react";
import { createTask } from "@/app/actions";

type Company = { id: string; name: string };

export default function NewTaskForm({ companies }: { companies: Company[] }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ error?: string; success?: boolean } | null>(null);

  async function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const res = await createTask(formData);
      if (res?.success) {
        setOpen(false);
        setResult(null);
      } else {
        setResult(res);
      }
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white text-sm font-medium rounded-lg transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        New Task
      </button>
    );
  }

  return (
    <div className="bg-stone-900 border border-stone-700 rounded-lg p-6 mb-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white">Create Task</h2>
        <button
          onClick={() => { setOpen(false); setResult(null); }}
          className="text-stone-400 hover:text-white"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {result?.error && (
        <div className="mb-4 p-3 bg-red-900/50 border border-red-800 rounded text-red-300 text-sm">
          {result.error}
        </div>
      )}

      <form action={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-stone-300 mb-1">Title</label>
          <input
            name="title"
            required
            placeholder="e.g. Fix map toolbar responsive layout"
            className="w-full px-3 py-2 bg-stone-800 border border-stone-700 rounded-lg text-stone-100 placeholder-stone-500 focus:outline-none focus:border-orange-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-stone-300 mb-1">Description</label>
          <textarea
            name="description"
            rows={4}
            placeholder="Describe the bug or feature. Include what you see, what you expect, and any context."
            className="w-full px-3 py-2 bg-stone-800 border border-stone-700 rounded-lg text-stone-100 placeholder-stone-500 focus:outline-none focus:border-orange-500 resize-y"
          />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-stone-300 mb-1">Company</label>
            <select
              name="company_id"
              className="w-full px-3 py-2 bg-stone-800 border border-stone-700 rounded-lg text-stone-100 focus:outline-none focus:border-orange-500"
            >
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-300 mb-1">Priority</label>
            <select
              name="priority"
              defaultValue="high"
              className="w-full px-3 py-2 bg-stone-800 border border-stone-700 rounded-lg text-stone-100 focus:outline-none focus:border-orange-500"
            >
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-300 mb-1">Type</label>
            <select
              name="task_type"
              defaultValue="code"
              className="w-full px-3 py-2 bg-stone-800 border border-stone-700 rounded-lg text-stone-100 focus:outline-none focus:border-orange-500"
            >
              <option value="code">Code</option>
              <option value="research">Research</option>
              <option value="content">Content</option>
              <option value="ops">Ops</option>
              <option value="chat">Chat</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-300 mb-1">CLI</label>
            <select
              name="cli_target"
              defaultValue="claude"
              className="w-full px-3 py-2 bg-stone-800 border border-stone-700 rounded-lg text-stone-100 focus:outline-none focus:border-orange-500"
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
            onClick={() => { setOpen(false); setResult(null); }}
            className="px-4 py-2 text-sm text-stone-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="px-6 py-2 bg-orange-600 hover:bg-orange-500 disabled:bg-orange-800 disabled:text-orange-400 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {isPending ? "Creating..." : "Create Task"}
          </button>
        </div>
      </form>
    </div>
  );
}
