"use client";

import { useState, useMemo } from "react";
import { ingestUrl } from "./actions";

// ─── Types ──────────────────────────────────────────────────────────────────

type KnowledgeEntry = {
  id: string;
  title: string;
  body: string | null;
  tags: string[] | null;
  confidence: string | null;
  source_type: string | null;
  source_issue_ids: string[] | null;
  created_at: string;
  updated_at: string;
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return `${Math.floor(diffDay / 30)}mo ago`;
}

function confidenceColor(c: string | null): {
  bg: string;
  text: string;
  label: string;
} {
  switch (c) {
    case "proven":
      return { bg: "rgba(63,185,80,0.15)", text: "#3fb950", label: "Proven" };
    case "disproven":
      return {
        bg: "rgba(248,81,73,0.15)",
        text: "#f85149",
        label: "Disproven",
      };
    case "suspected":
    default:
      return {
        bg: "rgba(210,153,34,0.15)",
        text: "#d29922",
        label: "Suspected",
      };
  }
}

function sourceTypeLabel(s: string | null): string {
  switch (s) {
    case "manual":
      return "Manual";
    case "synthesized":
      return "Synthesized";
    case "agent":
      return "Agent";
    default:
      return s ?? "Unknown";
  }
}

// ─── Icons ──────────────────────────────────────────────────────────────────

function IconChevron({ open }: { open: boolean }) {
  return (
    <svg
      className={`w-4 h-4 transition-transform ${open ? "rotate-90" : ""}`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M9 5l7 7-7 7"
      />
    </svg>
  );
}

function IconSearch() {
  return (
    <svg
      className="w-3.5 h-3.5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z"
      />
    </svg>
  );
}

function IconLink() {
  return (
    <svg
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
      />
    </svg>
  );
}

// ─── Ingestion Form ─────────────────────────────────────────────────────────

function IngestionForm() {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{
    error?: string;
    success?: boolean;
  } | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setResult(null);
    const form = e.currentTarget;
    const formData = new FormData(form);
    const res = await ingestUrl(formData);
    setResult(res);
    setPending(false);
    if (res.success) {
      form.reset();
    }
  }

  return (
    <div
      className="rounded-lg border p-4"
      style={{ backgroundColor: "#161b22", borderColor: "#30363d" }}
    >
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[#58a6ff]">
          <IconLink />
        </span>
        <span className="text-sm font-medium text-[#e6edf3]">
          Ingest External URL
        </span>
      </div>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1 min-w-0">
          <input
            name="url"
            type="url"
            required
            placeholder="Paste a URL to add external knowledge..."
            className="w-full px-3 py-2 rounded-md text-sm bg-[#0d1117] border border-[#30363d] text-[#e6edf3] placeholder-[#484f58] outline-none focus:border-[#58a6ff] transition-colors"
          />
        </div>
        <div className="sm:w-48">
          <input
            name="tags"
            type="text"
            placeholder="maplibre, routing, ios"
            className="w-full px-3 py-2 rounded-md text-sm bg-[#0d1117] border border-[#30363d] text-[#e6edf3] placeholder-[#484f58] outline-none focus:border-[#58a6ff] transition-colors font-mono"
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="px-4 py-2 rounded-md text-sm font-medium border border-[#30363d] bg-[#21262d] text-[#e6edf3] hover:bg-[#30363d] hover:border-[#8b949e] transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
        >
          {pending ? "Ingesting..." : "Ingest"}
        </button>
      </form>
      {result?.error && (
        <p className="mt-2 text-xs text-[#f85149]">{result.error}</p>
      )}
      {result?.success && (
        <p className="mt-2 text-xs text-[#3fb950]">
          URL ingested successfully.
        </p>
      )}
    </div>
  );
}

// ─── Knowledge Card ─────────────────────────────────────────────────────────

function KnowledgeCard({
  entry,
  isExpanded,
  onToggle,
  onTagClick,
}: {
  entry: KnowledgeEntry;
  isExpanded: boolean;
  onToggle: () => void;
  onTagClick: (tag: string) => void;
}) {
  const conf = confidenceColor(entry.confidence);
  const issueCount = entry.source_issue_ids?.length ?? 0;

  return (
    <div
      className="rounded-lg border transition-colors"
      style={{
        backgroundColor: isExpanded ? "#1c2333" : "#161b22",
        borderColor: isExpanded ? "#58a6ff" : "#30363d",
      }}
    >
      {/* Header row */}
      <button
        onClick={onToggle}
        className="w-full text-left px-4 py-3 flex items-start gap-3"
      >
        <span className="mt-0.5 shrink-0 text-[#8b949e]">
          <IconChevron open={isExpanded} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-[#e6edf3] truncate">
            {entry.title}
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-1.5">
            {/* Tags */}
            {(entry.tags ?? []).map((tag) => (
              <span
                key={tag}
                onClick={(e) => {
                  e.stopPropagation();
                  onTagClick(tag);
                }}
                className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-[#30363d] text-[#8b949e] hover:text-[#e6edf3] hover:border-[#8b949e] transition-colors cursor-pointer"
              >
                {tag}
              </span>
            ))}
            {/* Confidence badge */}
            <span
              className="text-[10px] font-medium px-1.5 py-0.5 rounded"
              style={{ backgroundColor: conf.bg, color: conf.text }}
            >
              {conf.label}
            </span>
            {/* Source type badge */}
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[#21262d] text-[#8b949e]">
              {sourceTypeLabel(entry.source_type)}
            </span>
          </div>
        </div>
        <span className="text-[10px] text-[#484f58] shrink-0 whitespace-nowrap mt-1">
          {relativeTime(entry.updated_at)}
        </span>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-4 pb-4 pl-11">
          <div className="border-t border-[#30363d] pt-3 mt-1">
            {/* Body */}
            <div
              className="text-sm text-[#c9d1d9] whitespace-pre-wrap break-words font-mono leading-relaxed max-h-96 overflow-y-auto"
              style={{ fontSize: "12px" }}
            >
              {entry.body ?? "(empty)"}
            </div>
            {/* Meta */}
            <div className="flex flex-wrap gap-4 mt-4 text-[10px] text-[#484f58]">
              <span>
                Created:{" "}
                {new Date(entry.created_at).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </span>
              <span>
                Source issues: {issueCount}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Client Component ──────────────────────────────────────────────────

export default function KnowledgeClient({
  initialData,
}: {
  initialData: KnowledgeEntry[];
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Compute all unique tags
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    for (const entry of initialData) {
      for (const tag of entry.tags ?? []) {
        tagSet.add(tag);
      }
    }
    return Array.from(tagSet).sort();
  }, [initialData]);

  // Filter entries
  const filtered = useMemo(() => {
    let list = initialData;
    if (activeTag) {
      list = list.filter((e) => (e.tags ?? []).includes(activeTag));
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((e) => e.title.toLowerCase().includes(q));
    }
    return list;
  }, [initialData, activeTag, searchQuery]);

  // Stats
  const lastUpdated =
    initialData.length > 0 ? relativeTime(initialData[0].updated_at) : "never";

  // Coverage: count entries with confidence=proven / total
  const provenCount = initialData.filter(
    (e) => e.confidence === "proven"
  ).length;
  const coverage =
    initialData.length > 0
      ? Math.round((provenCount / initialData.length) * 100)
      : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold" style={{ color: "#e6edf3" }}>
          Knowledge Base
        </h1>
        <p className="text-sm mt-1" style={{ color: "#8b949e" }}>
          {initialData.length} entr{initialData.length === 1 ? "y" : "ies"}{" "}
          &middot; {coverage}% proven &middot; Last updated {lastUpdated}
        </p>
      </div>

      {/* Ingestion form */}
      <IngestionForm />

      {/* Search + Tag filter bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {/* Search */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-[#161b22] border border-[#30363d] sm:w-72">
          <span className="text-[#8b949e]">
            <IconSearch />
          </span>
          <input
            type="text"
            placeholder="Filter by title..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 bg-transparent text-sm text-[#e6edf3] placeholder-[#484f58] outline-none"
          />
        </div>

        {/* Tag chips */}
        <div className="flex flex-wrap gap-1.5">
          {activeTag && (
            <button
              onClick={() => setActiveTag(null)}
              className="text-[10px] font-mono px-2 py-1 rounded border border-[#f85149] text-[#f85149] hover:bg-[#f85149]/10 transition-colors"
            >
              Clear filter
            </button>
          )}
          {allTags.map((tag) => (
            <button
              key={tag}
              onClick={() =>
                setActiveTag(activeTag === tag ? null : tag)
              }
              className={`text-[10px] font-mono px-2 py-1 rounded border transition-colors ${
                activeTag === tag
                  ? "border-[#58a6ff] text-[#58a6ff] bg-[#58a6ff]/10"
                  : "border-[#30363d] text-[#8b949e] hover:text-[#e6edf3] hover:border-[#8b949e]"
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      {/* Entry list */}
      {filtered.length === 0 ? (
        <div
          className="rounded-lg border p-12 text-center"
          style={{ backgroundColor: "#161b22", borderColor: "#30363d" }}
        >
          <p className="text-sm text-[#8b949e]">
            {initialData.length === 0
              ? "No knowledge entries yet. Ingest a URL or let agents synthesize knowledge."
              : "No entries match your filters."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((entry) => (
            <KnowledgeCard
              key={entry.id}
              entry={entry}
              isExpanded={expandedId === entry.id}
              onToggle={() =>
                setExpandedId(expandedId === entry.id ? null : entry.id)
              }
              onTagClick={(tag) =>
                setActiveTag(activeTag === tag ? null : tag)
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
