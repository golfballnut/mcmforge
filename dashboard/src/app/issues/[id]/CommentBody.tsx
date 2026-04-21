"use client";

import React from "react";

/**
 * Minimal safe markdown-ish renderer for comment bodies.
 *
 * Renders:
 *  - `![alt](url)` as <img>
 *  - `[text](url)` as <a>
 *  - raw http(s) URLs as clickable <a>
 *
 * Everything else is rendered as plain text. React escapes automatically so
 * there is no XSS surface. Whitespace preserved via the container's
 * whitespace-pre-wrap class.
 */

type Segment =
  | { kind: "text"; value: string }
  | { kind: "image"; alt: string; url: string }
  | { kind: "link"; text: string; url: string };

// Strict http(s) URL allow-list prefix check — refuse javascript:, data:, etc.
function isSafeUrl(url: string): boolean {
  return /^https?:\/\//i.test(url.trim());
}

export function parseCommentBody(body: string): Segment[] {
  if (!body) return [];

  // Matches (greedy on left, non-greedy on inner): ![alt](url) OR [text](url) OR bare http(s) URL
  const pattern = /!\[([^\]]*)\]\(([^)\s]+)\)|\[([^\]]+)\]\(([^)\s]+)\)|(https?:\/\/[^\s)]+)/g;

  const segments: Segment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(body)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ kind: "text", value: body.slice(lastIndex, match.index) });
    }

    if (match[1] !== undefined) {
      // image
      const alt = match[1] || "attachment";
      const url = match[2];
      if (isSafeUrl(url)) {
        segments.push({ kind: "image", alt, url });
      } else {
        segments.push({ kind: "text", value: match[0] });
      }
    } else if (match[3] !== undefined) {
      // text link
      const text = match[3];
      const url = match[4];
      if (isSafeUrl(url)) {
        segments.push({ kind: "link", text, url });
      } else {
        segments.push({ kind: "text", value: match[0] });
      }
    } else if (match[5] !== undefined) {
      // bare URL
      const url = match[5];
      if (isSafeUrl(url)) {
        segments.push({ kind: "link", text: url, url });
      } else {
        segments.push({ kind: "text", value: match[0] });
      }
    }

    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < body.length) {
    segments.push({ kind: "text", value: body.slice(lastIndex) });
  }

  return segments;
}

export function CommentBody({ body }: { body: string }) {
  const segments = parseCommentBody(body);

  return (
    <div className="px-4 py-3 text-sm text-[#e6edf3] leading-relaxed whitespace-pre-wrap">
      {segments.map((seg, i) => {
        if (seg.kind === "text") {
          return <React.Fragment key={i}>{seg.value}</React.Fragment>;
        }
        if (seg.kind === "image") {
          return (
            <a
              key={i}
              href={seg.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block my-2"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={seg.url}
                alt={seg.alt}
                className="block rounded-lg border border-[#30363d] max-w-full hover:border-[#00d4aa] transition-colors"
                style={{ maxHeight: "400px" }}
              />
            </a>
          );
        }
        // link
        return (
          <a
            key={i}
            href={seg.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#58a6ff] hover:underline break-all"
          >
            {seg.text}
          </a>
        );
      })}
    </div>
  );
}
