"use client";
import { useState } from "react";
import { AttachmentUpload } from "./IssueActions";

interface Comment {
  id: string;
  body: string;
  author_agent_id: string | null;
  created_at: string;
  author_name?: string | null;
}

interface Attachment {
  id: string;
  filename: string;
  mime_type: string | null;
  storage_path: string;
  created_at: string;
  url: string;
  category: string | null;
}

type Tab = "comments" | "subissues" | "activity" | "attachments";
type AttachmentSubtab = "all" | "user_upload" | "testing" | "comparison" | "video";

const ATTACHMENT_SUBTABS: { value: AttachmentSubtab; label: string }[] = [
  { value: "all", label: "All" },
  { value: "user_upload", label: "User Uploads" },
  { value: "testing", label: "Testing" },
  { value: "comparison", label: "Comparisons" },
  { value: "video", label: "Videos" },
];

function formatRelativeTime(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function IssueTabs({
  issueId,
  comments,
  attachments,
}: {
  issueId: string;
  comments: Comment[];
  attachments: Attachment[];
}) {
  const [active, setActive] = useState<Tab>("comments");
  const [subtab, setSubtab] = useState<AttachmentSubtab>("all");

  const filteredAttachments =
    subtab === "all"
      ? attachments
      : attachments.filter((a) => (a.category ?? "user_upload") === subtab);

  const tabs: { value: Tab; label: string; count?: number }[] = [
    { value: "comments", label: "Comments", count: comments.length },
    { value: "subissues", label: "Sub-issues" },
    { value: "activity", label: "Activity" },
    { value: "attachments", label: "Attachments", count: attachments.length },
  ];

  return (
    <div>
      {/* Tabs */}
      <div className="border-b border-[#30363d] mb-6">
        <div className="flex gap-0 overflow-x-auto">
          {tabs.map((tab) => {
            const isActive = active === tab.value;
            return (
              <button
                key={tab.value}
                onClick={() => setActive(tab.value)}
                className={`px-4 py-2.5 text-sm border-b-2 transition-colors whitespace-nowrap ${
                  isActive
                    ? "border-[#00d4aa] text-[#e6edf3] font-medium"
                    : "border-transparent text-[#8b949e] hover:text-[#e6edf3]"
                }`}
              >
                {tab.label}
                {tab.count !== undefined && tab.count > 0 && (
                  <span className="ml-1.5 text-xs bg-[#30363d] text-[#8b949e] px-1.5 py-0.5 rounded-full">
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Comments */}
      {active === "comments" && (
        <div className="space-y-4 mb-6">
          {comments.length === 0 ? (
            <p className="text-sm text-[#8b949e] py-4 text-center">No comments yet.</p>
          ) : (
            comments.map((comment) => (
              <div
                key={comment.id}
                className="bg-[#161b22] border border-[#30363d] rounded-lg overflow-hidden"
              >
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#30363d] bg-[#0d1117]">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-[#00d4aa] flex items-center justify-center">
                      <span className="text-[10px] font-bold text-[#0d1117]">
                        {(comment.author_name ?? "A")[0].toUpperCase()}
                      </span>
                    </div>
                    <span className="text-sm font-medium text-[#e6edf3]">
                      {comment.author_name ?? "Agent"}
                    </span>
                  </div>
                  <span className="text-xs text-[#8b949e]">{formatRelativeTime(comment.created_at)}</span>
                </div>
                <div className="px-4 py-3 text-sm text-[#e6edf3] leading-relaxed whitespace-pre-wrap">
                  {comment.body}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Sub-issues */}
      {active === "subissues" && (
        <p className="text-sm text-[#8b949e] py-4 text-center">No sub-issues.</p>
      )}

      {/* Activity */}
      {active === "activity" && (
        <p className="text-sm text-[#8b949e] py-4 text-center">No activity yet.</p>
      )}

      {/* Attachments */}
      {active === "attachments" && (
        <div className="mb-6">
          <AttachmentUpload issueId={issueId} />

          {/* Subtabs */}
          <div className="flex gap-1 mb-4 mt-4 overflow-x-auto">
            {ATTACHMENT_SUBTABS.map((st) => {
              const count =
                st.value === "all"
                  ? attachments.length
                  : attachments.filter((a) => (a.category ?? "user_upload") === st.value).length;
              const isActive = subtab === st.value;
              return (
                <button
                  key={st.value}
                  onClick={() => setSubtab(st.value)}
                  className={`px-3 py-1.5 text-xs rounded-md transition-colors whitespace-nowrap ${
                    isActive
                      ? "bg-[#00d4aa] text-[#0d1117] font-medium"
                      : "bg-[#161b22] border border-[#30363d] text-[#8b949e] hover:text-[#e6edf3]"
                  }`}
                >
                  {st.label}
                  {count > 0 && (
                    <span
                      className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] ${
                        isActive ? "bg-[#0d1117]/20 text-[#0d1117]" : "bg-[#30363d] text-[#8b949e]"
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {filteredAttachments.length === 0 ? (
            <p className="text-sm text-[#8b949e] py-8 text-center">
              No attachments in this category.
            </p>
          ) : (
            <div className="flex flex-wrap gap-3">
              {filteredAttachments.map((att) => {
                const isImage = att.mime_type?.startsWith("image/");
                const isVideo = att.mime_type?.startsWith("video/");
                return (
                  <a
                    key={att.id}
                    href={att.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block bg-[#161b22] border border-[#30363d] rounded-lg overflow-hidden hover:border-[#00d4aa] transition-colors"
                    style={{ maxWidth: "200px" }}
                  >
                    {isImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={att.url}
                        alt={att.filename}
                        className="block w-full h-auto"
                        style={{ maxWidth: "200px" }}
                      />
                    ) : isVideo ? (
                      <div className="relative bg-black" style={{ width: "200px", height: "140px" }}>
                        <video
                          src={att.url}
                          className="block w-full h-full object-cover"
                          preload="metadata"
                          muted
                        />
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <div className="w-12 h-12 rounded-full bg-black/60 flex items-center justify-center">
                            <svg className="w-6 h-6 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M8 5v14l11-7z" />
                            </svg>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="p-6 text-center text-xs text-[#8b949e]">File</div>
                    )}
                    <div className="px-2 py-1.5 border-t border-[#30363d]">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="inline-block px-1.5 py-0.5 bg-[#30363d] text-[#8b949e] text-[9px] uppercase tracking-wide rounded">
                          {(att.category ?? "user_upload").replace("_", " ")}
                        </span>
                      </div>
                      <div className="text-xs text-[#e6edf3] truncate" title={att.filename}>
                        {att.filename}
                      </div>
                      <div className="text-[10px] text-[#8b949e]">
                        {formatRelativeTime(att.created_at)}
                      </div>
                    </div>
                  </a>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
