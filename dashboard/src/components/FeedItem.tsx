"use client";

import { useRouter } from "next/navigation";

export type FeedItemData = {
  id: string;
  type: "task" | "approval" | "message" | "finding";
  title: string;
  summary: string;
  timestamp: string;
  company?: string;
  status?: string;
  href?: string;
  isNew?: boolean;
};

const typeConfig: Record<string, { color: string; icon: string }> = {
  task: { color: "#1a73e8", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" },
  approval: { color: "#34a853", icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" },
  message: { color: "#5f6368", icon: "M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" },
  finding: { color: "#fa7b17", icon: "M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
};

function formatRelativeTime(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export default function FeedItem({ item }: { item: FeedItemData }) {
  const router = useRouter();
  const config = typeConfig[item.type] || typeConfig.message;

  return (
    <button
      onClick={() => item.href && router.push(item.href)}
      className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-[#f1f3f4] transition-colors text-left border-b border-[#dadce0] last:border-b-0 ${
        item.isNew ? "bg-[#e8f0fe]" : "bg-white"
      }`}
    >
      {/* Type icon */}
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
        style={{ backgroundColor: config.color + "15" }}
      >
        <svg
          className="w-4.5 h-4.5"
          style={{ color: config.color }}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={config.icon} />
        </svg>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm truncate ${item.isNew ? "font-semibold text-[#202124]" : "text-[#202124]"}`}>
          {item.title}
        </p>
        <p className="text-xs text-[#5f6368] truncate">{item.summary}</p>
      </div>

      {/* Right: time + company */}
      <div className="flex flex-col items-end gap-1 shrink-0">
        <span className="text-xs text-[#5f6368]">{formatRelativeTime(item.timestamp)}</span>
        {item.company && (
          <span className="text-[10px] bg-[#f1f3f4] text-[#5f6368] px-1.5 py-0.5 rounded">
            {item.company}
          </span>
        )}
      </div>
    </button>
  );
}
