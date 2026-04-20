"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type ChangelogIssue = {
  id: string;
  identifier: string | null;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  tags: string[] | null;
  pr_url: string | null;
  created_at: string;
  updated_at: string;
};

type SourceKey =
  | "claude-code"
  | "anthropic-sdk"
  | "anthropic-blog"
  | "xcode"
  | "swift"
  | "maplibre-ios"
  | "ferrostar"
  | "valhalla"
  | "supabase-js"
  | "ios"
  | "other";

const SOURCE_ORDER: SourceKey[] = [
  "claude-code",
  "anthropic-sdk",
  "anthropic-blog",
  "xcode",
  "swift",
  "maplibre-ios",
  "ferrostar",
  "valhalla",
  "supabase-js",
  "ios",
  "other",
];

const SOURCE_LABEL: Record<SourceKey, string> = {
  "claude-code": "Claude Code",
  "anthropic-sdk": "Anthropic SDK",
  "anthropic-blog": "Anthropic Blog",
  xcode: "Xcode",
  swift: "Swift",
  "maplibre-ios": "MapLibre iOS",
  ferrostar: "Ferrostar",
  valhalla: "Valhalla",
  "supabase-js": "Supabase JS",
  ios: "iOS",
  other: "Other",
};

const LAST_VIEW_KEY = "changelogs:last-view";

function classifySource(issue: ChangelogIssue): SourceKey {
  const title = issue.title.toLowerCase();
  const tags = (issue.tags ?? []).map((t) => t.toLowerCase());

  const hay = title + " " + tags.join(" ");

  if (hay.includes("claude code") || hay.includes("claude-code")) return "claude-code";
  if (
    hay.includes("anthropic") &&
    (hay.includes("sdk") || hay.includes("api"))
  )
    return "anthropic-sdk";
  if (hay.includes("anthropic") && hay.includes("blog")) return "anthropic-blog";
  if (hay.includes("maplibre")) return "maplibre-ios";
  if (hay.includes("ferrostar")) return "ferrostar";
  if (hay.includes("valhalla")) return "valhalla";
  if (hay.includes("supabase")) return "supabase-js";
  if (hay.includes("xcode")) return "xcode";
  if (hay.includes("swift")) return "swift";
  if (hay.includes("ios release") || hay.includes("ios-release") || /\bios\b/.test(hay))
    return "ios";
  return "other";
}

function relativeTime(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  return `${Math.floor(day / 30)}mo ago`;
}

function priorityColor(p: string): string {
  switch (p) {
    case "urgent":
      return "#f85149";
    case "high":
      return "#d29922";
    case "medium":
      return "#58a6ff";
    case "low":
      return "#8b949e";
    default:
      return "#8b949e";
  }
}

function StatusDot({ status }: { status: string }) {
  const color =
    status === "done"
      ? "#3fb950"
      : status === "in_progress"
      ? "#58a6ff"
      : status === "in_review"
      ? "#d29922"
      : status === "cancelled"
      ? "#8b949e"
      : "#e6edf3";
  return (
    <span
      className="w-1.5 h-1.5 rounded-full shrink-0"
      style={{ backgroundColor: color }}
      title={status}
    />
  );
}

export default function ChangelogsClient({
  issues,
}: {
  issues: ChangelogIssue[];
}) {
  const [lastView, setLastView] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setLastView(
      typeof window !== "undefined"
        ? window.localStorage.getItem(LAST_VIEW_KEY)
        : null
    );
    setMounted(true);
  }, []);

  const { grouped, totalUnread } = useMemo(() => {
    const g: Record<SourceKey, ChangelogIssue[]> = {
      "claude-code": [],
      "anthropic-sdk": [],
      "anthropic-blog": [],
      xcode: [],
      swift: [],
      "maplibre-ios": [],
      ferrostar: [],
      valhalla: [],
      "supabase-js": [],
      ios: [],
      other: [],
    };
    let unread = 0;
    const lastMs = lastView ? new Date(lastView).getTime() : 0;
    for (const issue of issues) {
      const key = classifySource(issue);
      g[key].push(issue);
      if (mounted && lastMs > 0 && new Date(issue.created_at).getTime() > lastMs) {
        unread += 1;
      } else if (mounted && lastMs === 0) {
        // Never viewed — treat all as unread so badge surfaces first run.
        unread += 1;
      }
    }
    return { grouped: g, totalUnread: unread };
  }, [issues, lastView, mounted]);

  function handleMarkSeen() {
    const now = new Date().toISOString();
    if (typeof window !== "undefined") {
      window.localStorage.setItem(LAST_VIEW_KEY, now);
    }
    setLastView(now);
  }

  const hasAny = issues.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-xl font-semibold tracking-wide text-[#e6edf3] uppercase">
            Changelogs
          </h1>
          <span className="px-2 py-0.5 text-xs font-mono rounded-full bg-[#161b22] border border-[#30363d] text-[#8b949e]">
            {issues.length}
          </span>
          {mounted && totalUnread > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-mono bg-[#00d4aa]/15 border border-[#00d4aa]/30 text-[#00d4aa]">
              {totalUnread} unread
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {mounted && totalUnread > 0 && (
            <button
              onClick={handleMarkSeen}
              className="text-xs text-[#8b949e] hover:text-[#e6edf3] px-3 py-1.5 border border-[#30363d] rounded-md hover:bg-[#161b22] transition-colors"
            >
              Mark all seen
            </button>
          )}
        </div>
      </div>

      <p className="text-sm text-[#8b949e]">
        Daily scan of watched sources. Actionable findings filed here by the
        Changelog Expert routine (8am ET).
      </p>

      {!hasAny ? (
        <div className="border border-[#30363d] bg-[#161b22] rounded-lg p-12 text-center">
          <p className="text-sm text-[#8b949e]">
            No changelog issues yet.
          </p>
          <p className="text-xs text-[#484f58] mt-1">
            The Changelog Expert routine runs at 8am ET and files issues when
            actionable library changes appear.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {SOURCE_ORDER.map((key) => {
            const rows = grouped[key];
            if (!rows.length) return null;
            return (
              <section key={key}>
                <div className="flex items-center gap-2 mb-2">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-[#8b949e]">
                    {SOURCE_LABEL[key]}
                  </h2>
                  <span className="text-xs text-[#484f58]">{rows.length}</span>
                </div>
                <div className="border border-[#30363d] rounded-lg overflow-hidden">
                  {rows.map((issue, i) => {
                    const lastMs = lastView
                      ? new Date(lastView).getTime()
                      : 0;
                    const isUnread =
                      mounted &&
                      (lastMs === 0 ||
                        new Date(issue.created_at).getTime() > lastMs);
                    return (
                      <Link
                        key={issue.id}
                        href={`/issues/${issue.identifier ?? issue.id}`}
                        className={`grid grid-cols-[80px_1fr_90px_70px] gap-x-3 px-4 py-2.5 items-center text-sm transition-colors ${
                          i !== rows.length - 1
                            ? "border-b border-[#21262d]"
                            : ""
                        } ${
                          isUnread
                            ? "bg-[#161b22] hover:bg-[#1c2333]"
                            : "bg-[#0d1117] hover:bg-[#161b22]"
                        }`}
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          {isUnread && (
                            <span
                              className="w-1.5 h-1.5 rounded-full bg-[#00d4aa] shrink-0"
                              title="Unread since last view"
                            />
                          )}
                          <span className="text-xs font-mono text-[#8b949e] truncate">
                            {issue.identifier ?? issue.id.slice(0, 6)}
                          </span>
                        </div>
                        <div className="min-w-0 flex items-center gap-2">
                          <StatusDot status={issue.status} />
                          <span className="truncate text-[#e6edf3]">
                            {issue.title.replace(/^\[changelog\]\s*/i, "")}
                          </span>
                        </div>
                        <span
                          className="text-xs font-medium"
                          style={{ color: priorityColor(issue.priority) }}
                        >
                          {issue.priority}
                        </span>
                        <span className="text-xs text-[#8b949e] text-right">
                          {relativeTime(issue.created_at)}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
