"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type SearchResult = {
  type: "issue" | "agent";
  title: string;
  subtitle: string;
  href: string;
};

const typeConfig: Record<string, { color: string; label: string }> = {
  issue: { color: "#fbbc04", label: "Issue" },
  agent: { color: "#00bcd4", label: "Agent" },
};

export default function SearchOverlay({ onClose }: { onClose: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    inputRef.current?.focus();
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  // Global Cmd+K listener
  useEffect(() => {
    function handleGlobalKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    document.addEventListener("keydown", handleGlobalKey);
    return () => document.removeEventListener("keydown", handleGlobalKey);
  }, []);

  const search = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    const pattern = `%${q}%`;

    const [issues, agents] = await Promise.all([
      supabase.from("issues").select("id, title, status").ilike("title", pattern).limit(5),
      supabase.from("agents").select("id, name, adapter_type").ilike("name", pattern).limit(5),
    ]);

    const items: SearchResult[] = [
      ...(issues.data || []).map((t) => ({
        type: "issue" as const,
        title: t.title,
        subtitle: t.status,
        href: "/issues",
      })),
      ...(agents.data || []).map((a) => ({
        type: "agent" as const,
        title: a.name,
        subtitle: a.adapter_type,
        href: "/agents",
      })),
    ];

    setResults(items);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    const timer = setTimeout(() => search(query), 250);
    return () => clearTimeout(timer);
  }, [query, search]);

  function handleSelect(result: SearchResult) {
    router.push(result.href);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/40 flex items-start justify-center pt-[15vh]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-[#dadce0] animate-slide-up overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-[#dadce0]">
          <svg className="w-5 h-5 text-[#5f6368] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search issues and agents..."
            className="flex-1 text-[#202124] text-base bg-transparent outline-none placeholder-[#5f6368]"
          />
          <kbd className="text-xs bg-[#f1f3f4] px-2 py-0.5 rounded border border-[#dadce0] text-[#5f6368]">
            ESC
          </kbd>
        </div>

        <div className="max-h-80 overflow-y-auto">
          {loading && (
            <div className="px-5 py-4 text-sm text-[#5f6368]">Searching...</div>
          )}
          {!loading && query.length >= 2 && results.length === 0 && (
            <div className="px-5 py-8 text-center text-sm text-[#5f6368]">
              No results for &ldquo;{query}&rdquo;
            </div>
          )}
          {!loading && results.length > 0 && (
            <div className="py-2">
              {results.map((result, i) => {
                const config = typeConfig[result.type];
                return (
                  <button
                    key={`${result.type}-${i}`}
                    onClick={() => handleSelect(result)}
                    className="w-full flex items-center gap-3 px-5 py-3 hover:bg-[#f1f3f4] transition-colors text-left"
                  >
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                      style={{ backgroundColor: config.color + "20", color: config.color }}
                    >
                      <span className="text-xs font-bold">{config.label[0]}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#202124] truncate">{result.title}</p>
                      <p className="text-xs text-[#5f6368] truncate">{result.subtitle}</p>
                    </div>
                    <span className="text-xs text-[#5f6368] bg-[#f1f3f4] px-2 py-0.5 rounded shrink-0">
                      {config.label}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          {!loading && query.length < 2 && (
            <div className="px-5 py-8 text-center text-sm text-[#5f6368]">
              Type to search across all MCM Forge data
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
