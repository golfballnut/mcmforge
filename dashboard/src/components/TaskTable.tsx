"use client";

import { useState, useRef, useEffect, useTransition, useCallback } from "react";
import { updateTask, deleteTask } from "@/app/actions";

/* ── Types ────────────────────────────────────────────────────── */

type TaskRow = {
  id: string;
  company_id: string;
  title: string;
  description: string | null;
  skill_name: string | null;
  status: string;
  priority: string;
  board: string | null;
  assigned_to: string | null;
  cli_target: string | null;
  task_type: string | null;
  branch_name: string | null;
  pr_number: number | null;
  pr_url: string | null;
  preview_url: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  result_summary: string | null;
  artifact_url: string | null;
  cost_cap: number | null;
  retry_count: number | null;
  company_registry: { name: string } | null;
};

type Company = { id: string; name: string };
type Agent = { name: string; agent_type: string };

interface Props {
  tasks: TaskRow[];
  companies: Company[];
  agents: Agent[];
}

/* ── Constants ────────────────────────────────────────────────── */

const STATUSES = ["todo", "in_progress", "review", "approved", "done", "rejected", "blocked"] as const;
const PRIORITIES = ["critical", "high", "medium", "low"] as const;
const CLI_TARGETS = ["claude", "gemini", "codex"] as const;
const TASK_TYPES = ["code", "research", "content", "ops", "chat", "proposal", "spec"] as const;

const STATUS_STYLES: Record<string, string> = {
  todo: "bg-[#f1f3f4] text-[#5f6368] border-[#dadce0]",
  in_progress: "bg-[#e8f0fe] text-[#1a73e8] border-[#d3e3fd]",
  review: "bg-amber-50 text-amber-700 border-amber-200",
  approved: "bg-green-50 text-green-700 border-green-200",
  done: "bg-green-50 text-green-700 border-green-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
  blocked: "bg-red-50 text-red-700 border-red-200",
};

const STATUS_LABELS: Record<string, string> = {
  todo: "Todo",
  in_progress: "In Progress",
  review: "Review",
  approved: "Approved",
  done: "Done",
  rejected: "Rejected",
  blocked: "Blocked",
};

const PRIORITY_STYLES: Record<string, string> = {
  low: "bg-[#f1f3f4] text-[#5f6368] border-[#dadce0]",
  medium: "bg-[#e8f0fe] text-[#1a73e8] border-[#d3e3fd]",
  high: "bg-amber-50 text-amber-700 border-amber-200",
  critical: "bg-red-50 text-red-700 border-red-200",
};

/* ── Inline Dropdown ──────────────────────────────────────────── */

function InlineSelect({
  value,
  options,
  labels,
  styles,
  onSave,
}: {
  value: string;
  options: readonly string[];
  labels?: Record<string, string>;
  styles?: Record<string, string>;
  onSave: (val: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const display = labels?.[value] ?? value;
  const cls = styles?.[value] ?? "bg-[#f1f3f4] text-[#5f6368] border-[#dadce0]";

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border cursor-pointer hover:ring-1 hover:ring-[#1a73e8] transition-all ${cls}`}
      >
        {display}
        <svg className="w-3 h-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 left-0 bg-white border border-[#dadce0] rounded-lg shadow-lg py-1 min-w-[140px]">
          {options.map((opt) => {
            const optCls = styles?.[opt] ?? "";
            const optLabel = labels?.[opt] ?? opt;
            return (
              <button
                key={opt}
                onClick={() => {
                  if (opt !== value) onSave(opt);
                  setOpen(false);
                }}
                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-[#f1f3f4] transition-colors flex items-center gap-2 ${
                  opt === value ? "font-semibold" : ""
                }`}
              >
                {optCls && (
                  <span className={`inline-block w-2 h-2 rounded-full border ${optCls}`} />
                )}
                <span className="capitalize">{optLabel}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Inline Text Select (for assigned_to / unassigned) ──────── */

function AgentSelect({
  value,
  agents,
  onSave,
}: {
  value: string | null;
  agents: Agent[];
  onSave: (val: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1 text-sm hover:bg-[#e8f0fe] px-2 py-0.5 rounded cursor-pointer transition-colors"
      >
        {value ? (
          <span className="text-[#202124]">{value}</span>
        ) : (
          <span className="text-[#5f6368] italic">unassigned</span>
        )}
        <svg className="w-3 h-3 text-[#5f6368]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 left-0 bg-white border border-[#dadce0] rounded-lg shadow-lg py-1 min-w-[160px]">
          <button
            onClick={() => { onSave(null); setOpen(false); }}
            className={`w-full text-left px-3 py-1.5 text-xs hover:bg-[#f1f3f4] transition-colors ${
              !value ? "font-semibold" : ""
            }`}
          >
            <span className="text-[#5f6368] italic">Unassigned</span>
          </button>
          {agents.map((a) => (
            <button
              key={a.name}
              onClick={() => { onSave(a.name); setOpen(false); }}
              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-[#f1f3f4] transition-colors flex items-center gap-2 ${
                a.name === value ? "font-semibold" : ""
              }`}
            >
              <span className="text-[#202124]">{a.name}</span>
              <span className="text-[#80868b]">{a.agent_type}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Task Detail Drawer ───────────────────────────────────────── */

function TaskDrawer({
  task,
  companies,
  agents,
  onClose,
  onSave,
  onDelete,
}: {
  task: TaskRow;
  companies: Company[];
  agents: Agent[];
  onClose: () => void;
  onSave: (id: string, updates: Record<string, unknown>) => void;
  onDelete: (id: string) => void;
}) {
  const [form, setForm] = useState({
    title: task.title,
    description: task.description ?? "",
    status: task.status,
    priority: task.priority,
    assigned_to: task.assigned_to ?? "",
    cli_target: task.cli_target ?? "claude",
    task_type: task.task_type ?? "code",
    company_id: task.company_id ?? "",
    board: task.board ?? "agent",
  });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    startTransition(() => {
      onSave(task.id, {
        ...form,
        assigned_to: form.assigned_to || null,
      });
      onClose();
    });
  }

  function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    startTransition(() => {
      onDelete(task.id);
      onClose();
    });
  }

  const selectCls =
    "w-full px-3 py-2 bg-white border border-[#dadce0] rounded-lg text-[#202124] text-sm focus:outline-none focus:border-[#1a73e8] focus:ring-1 focus:ring-[#1a73e8]";
  const inputCls = selectCls;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white shadow-xl overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-[#dadce0] px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-lg font-medium text-[#202124]">Edit Task</h2>
          <button onClick={onClose} className="text-[#5f6368] hover:text-[#202124]">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Title */}
          <div>
            <label className="block text-xs font-medium text-[#5f6368] uppercase tracking-wider mb-1">Title</label>
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className={inputCls}
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-[#5f6368] uppercase tracking-wider mb-1">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={5}
              className={`${inputCls} resize-y`}
            />
          </div>

          {/* 2-col grid */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#5f6368] uppercase tracking-wider mb-1">Status</label>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={selectCls}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{STATUS_LABELS[s] ?? s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#5f6368] uppercase tracking-wider mb-1">Priority</label>
              <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className={selectCls}>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p} className="capitalize">{p}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#5f6368] uppercase tracking-wider mb-1">Assigned To</label>
              <select value={form.assigned_to} onChange={(e) => setForm({ ...form, assigned_to: e.target.value })} className={selectCls}>
                <option value="">Unassigned</option>
                {agents.map((a) => (
                  <option key={a.name} value={a.name}>{a.name} ({a.agent_type})</option>
                ))}
                <option value="agent-executor">agent-executor</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#5f6368] uppercase tracking-wider mb-1">CLI Target</label>
              <select value={form.cli_target} onChange={(e) => setForm({ ...form, cli_target: e.target.value })} className={selectCls}>
                {CLI_TARGETS.map((c) => (
                  <option key={c} value={c} className="capitalize">{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#5f6368] uppercase tracking-wider mb-1">Type</label>
              <select value={form.task_type} onChange={(e) => setForm({ ...form, task_type: e.target.value })} className={selectCls}>
                {TASK_TYPES.map((t) => (
                  <option key={t} value={t} className="capitalize">{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#5f6368] uppercase tracking-wider mb-1">Company</label>
              <select value={form.company_id} onChange={(e) => setForm({ ...form, company_id: e.target.value })} className={selectCls}>
                <option value="">None</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Read-only metadata */}
          <div className="border-t border-[#dadce0] pt-4 space-y-2 text-xs text-[#5f6368]">
            <div className="flex justify-between">
              <span>ID</span>
              <span className="font-mono text-[#80868b]">{task.id.slice(0, 8)}</span>
            </div>
            <div className="flex justify-between">
              <span>Created by</span>
              <span>{task.created_by ?? "—"}</span>
            </div>
            <div className="flex justify-between">
              <span>Created</span>
              <span>{new Date(task.created_at).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}</span>
            </div>
            {task.started_at && (
              <div className="flex justify-between">
                <span>Started</span>
                <span>{new Date(task.started_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
              </div>
            )}
            {task.completed_at && (
              <div className="flex justify-between">
                <span>Completed</span>
                <span>{new Date(task.completed_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
              </div>
            )}
            {task.branch_name && (
              <div className="flex justify-between">
                <span>Branch</span>
                <span className="font-mono">{task.branch_name}</span>
              </div>
            )}
            {task.pr_url && (
              <div className="flex justify-between">
                <span>PR</span>
                <a href={task.pr_url} target="_blank" rel="noopener noreferrer" className="text-[#1a73e8] hover:underline">
                  #{task.pr_number ?? "link"}
                </a>
              </div>
            )}
            {task.result_summary && (
              <div className="mt-3">
                <span className="block mb-1 font-medium text-[#202124]">Result Summary</span>
                <p className="text-[#5f6368] whitespace-pre-wrap text-xs leading-relaxed bg-[#f8f9fa] rounded p-2 border border-[#dadce0]">
                  {task.result_summary}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t border-[#dadce0] px-6 py-4 flex items-center justify-between">
          <button
            onClick={handleDelete}
            className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
              confirmDelete
                ? "bg-red-600 text-white hover:bg-red-700"
                : "text-red-600 hover:bg-red-50 border border-red-200"
            }`}
          >
            {confirmDelete ? "Confirm Delete" : "Delete"}
          </button>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-1.5 text-sm text-[#5f6368] hover:text-[#202124] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isPending}
              className="px-5 py-1.5 bg-[#1a73e8] hover:bg-[#1765cc] disabled:bg-[#d3e3fd] text-white text-sm font-medium rounded-lg transition-colors"
            >
              {isPending ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Main Table Component ─────────────────────────────────────── */

export default function TaskTable({ tasks: initialTasks, companies, agents }: Props) {
  const [tasks, setTasks] = useState(initialTasks);
  const [drawerTask, setDrawerTask] = useState<TaskRow | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");

  // Sync with server re-renders
  useEffect(() => {
    setTasks(initialTasks);
  }, [initialTasks]);

  const handleInlineUpdate = useCallback(
    async (taskId: string, field: string, value: unknown) => {
      // Optimistic update
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, [field]: value } : t))
      );
      setSaving(taskId);
      await updateTask(taskId, { [field]: value });
      setSaving(null);
    },
    []
  );

  const handleDrawerSave = useCallback(
    async (taskId: string, updates: Record<string, unknown>) => {
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, ...updates } : t))
      );
      await updateTask(taskId, updates);
    },
    []
  );

  const handleDelete = useCallback(async (taskId: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    await deleteTask(taskId);
  }, []);

  const filtered =
    filter === "all"
      ? tasks.filter((t) => t.status !== "draft")
      : tasks.filter((t) => t.status === filter);

  const counts = {
    all: tasks.filter((t) => t.status !== "draft").length,
    todo: tasks.filter((t) => t.status === "todo").length,
    in_progress: tasks.filter((t) => t.status === "in_progress").length,
    review: tasks.filter((t) => t.status === "review").length,
    done: tasks.filter((t) => t.status === "done" || t.status === "approved").length,
  };

  return (
    <>
      {/* Filter tabs */}
      <div className="flex items-center gap-1 mb-4 border-b border-[#dadce0]">
        {[
          { key: "all", label: "All", count: counts.all },
          { key: "todo", label: "Todo", count: counts.todo },
          { key: "in_progress", label: "In Progress", count: counts.in_progress },
          { key: "review", label: "Review", count: counts.review },
          { key: "done", label: "Done", count: counts.done },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              filter === tab.key
                ? "text-[#1a73e8] border-[#1a73e8]"
                : "text-[#5f6368] border-transparent hover:text-[#202124] hover:border-[#dadce0]"
            }`}
          >
            {tab.label}
            <span className="ml-1.5 text-xs text-[#80868b]">{tab.count}</span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white border border-[#dadce0] rounded-lg flex flex-col items-center justify-center py-20 text-[#5f6368]">
          <svg className="w-10 h-10 mb-3 text-[#dadce0]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <p className="text-sm">No tasks {filter !== "all" ? `with status "${filter}"` : "in queue"}</p>
        </div>
      ) : (
        <>
          {/* Mobile: Cards */}
          <div className="md:hidden space-y-3">
            {filtered.map((task) => (
              <div
                key={task.id}
                className="bg-white border border-[#dadce0] rounded-lg p-4"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <button
                    onClick={() => setDrawerTask(task)}
                    className="font-medium text-[#202124] text-sm leading-tight text-left hover:text-[#1a73e8] transition-colors"
                  >
                    {task.title}
                  </button>
                  <InlineSelect
                    value={task.status}
                    options={STATUSES}
                    labels={STATUS_LABELS}
                    styles={STATUS_STYLES}
                    onSave={(v) => handleInlineUpdate(task.id, "status", v)}
                  />
                </div>
                <div className="flex items-center gap-2 flex-wrap text-xs">
                  <InlineSelect
                    value={task.priority}
                    options={PRIORITIES}
                    styles={PRIORITY_STYLES}
                    onSave={(v) => handleInlineUpdate(task.id, "priority", v)}
                  />
                  <span className="text-[#5f6368]">{task.company_registry?.name ?? "unknown"}</span>
                  <span className="text-[#dadce0]">&middot;</span>
                  <AgentSelect
                    value={task.assigned_to}
                    agents={agents}
                    onSave={(v) => handleInlineUpdate(task.id, "assigned_to", v)}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Desktop: Table */}
          <div className="hidden md:block bg-white border border-[#dadce0] rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#dadce0]">
                    <th className="text-left text-xs font-medium text-[#5f6368] uppercase tracking-wider px-4 py-3">Title</th>
                    <th className="text-left text-xs font-medium text-[#5f6368] uppercase tracking-wider px-4 py-3">Status</th>
                    <th className="text-left text-xs font-medium text-[#5f6368] uppercase tracking-wider px-4 py-3">Priority</th>
                    <th className="text-left text-xs font-medium text-[#5f6368] uppercase tracking-wider px-4 py-3">Assigned To</th>
                    <th className="text-left text-xs font-medium text-[#5f6368] uppercase tracking-wider px-4 py-3">Company</th>
                    <th className="text-left text-xs font-medium text-[#5f6368] uppercase tracking-wider px-4 py-3">Created</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#dadce0]">
                  {filtered.map((task) => (
                    <tr
                      key={task.id}
                      className={`hover:bg-[#f1f3f4] transition-colors ${saving === task.id ? "opacity-70" : ""}`}
                    >
                      <td className="px-4 py-3 max-w-xs">
                        <div>
                          <button
                            onClick={() => setDrawerTask(task)}
                            className="font-medium text-[#202124] truncate block text-left hover:text-[#1a73e8] transition-colors"
                          >
                            {task.title}
                          </button>
                          {task.skill_name && (
                            <p className="text-xs text-[#5f6368] mt-0.5 truncate">{task.skill_name}</p>
                          )}
                          {task.pr_url && (
                            <a href={task.pr_url} target="_blank" rel="noopener noreferrer" className="text-xs text-[#1a73e8] hover:underline mt-0.5 inline-block">
                              PR #{task.pr_number ?? "link"} &rarr;
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <InlineSelect
                          value={task.status}
                          options={STATUSES}
                          labels={STATUS_LABELS}
                          styles={STATUS_STYLES}
                          onSave={(v) => handleInlineUpdate(task.id, "status", v)}
                        />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <InlineSelect
                          value={task.priority}
                          options={PRIORITIES}
                          styles={PRIORITY_STYLES}
                          onSave={(v) => handleInlineUpdate(task.id, "priority", v)}
                        />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <AgentSelect
                          value={task.assigned_to}
                          agents={agents}
                          onSave={(v) => handleInlineUpdate(task.id, "assigned_to", v)}
                        />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-[#202124]">
                          {task.company_registry?.name ?? (
                            <span className="text-[#5f6368] italic">unknown</span>
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-[#5f6368] text-xs">
                        {new Date(task.created_at).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}{" "}
                        <span className="text-[#80868b]">
                          {new Date(task.created_at).toLocaleTimeString("en-US", {
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </span>
                      </td>
                      <td className="px-2 py-3">
                        <button
                          onClick={() => setDrawerTask(task)}
                          className="p-1 text-[#5f6368] hover:text-[#202124] hover:bg-[#e8eaed] rounded transition-colors"
                          title="Edit task"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Drawer */}
      {drawerTask && (
        <TaskDrawer
          task={drawerTask}
          companies={companies}
          agents={agents}
          onClose={() => setDrawerTask(null)}
          onSave={handleDrawerSave}
          onDelete={handleDelete}
        />
      )}
    </>
  );
}
