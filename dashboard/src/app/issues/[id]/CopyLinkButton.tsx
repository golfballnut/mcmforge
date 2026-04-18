"use client";

import { useState } from "react";

interface CopyLinkButtonProps {
  identifier: string | null;
  issueId: string;
}

/**
 * CopyLinkButton — FORGE-251
 * Copies the canonical issue URL (identifier-based when available) to clipboard.
 * Produces: https://mcmforge.com/issues/DIRA-196  (not the UUID URL)
 */
export function CopyLinkButton({ identifier, issueId }: CopyLinkButtonProps) {
  const [copied, setCopied] = useState(false);

  // Prefer identifier URL (AC6), fall back to UUID for legacy issues
  const slug = identifier ?? issueId;
  const url = `https://mcmforge.com/issues/${slug}`;

  function handleCopy() {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <button
      onClick={handleCopy}
      aria-label="Copy link to issue"
      title={url}
      className="inline-flex items-center gap-1.5 px-2 py-1 text-xs text-[#8b949e] hover:text-[#e6edf3] bg-[#161b22] border border-[#30363d] rounded transition-colors shrink-0"
    >
      {copied ? (
        <>
          <svg className="w-3 h-3 text-[#3fb950]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Copied!
        </>
      ) : (
        <>
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          Copy link
        </>
      )}
    </button>
  );
}
