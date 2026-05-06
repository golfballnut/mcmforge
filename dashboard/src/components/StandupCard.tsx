"use client";

import { useState, useEffect, useCallback } from "react";
import { createBrowserClient } from "@supabase/ssr";

interface StandupRow {
  date: string;
  body_md: string;
  company_id: string;
  generated_at: string;
}

interface StandupCardProps {
  companyId: string;
  initialStandup?: StandupRow | null;
  isProduction?: boolean;
}

function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default function StandupCard({
  companyId,
  initialStandup,
  isProduction = false,
}: StandupCardProps) {
  const [standup, setStandup] = useState<StandupRow | null>(
    initialStandup ?? null
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const hasToday = standup?.date === today;

  // Poll for fresh row on mount if we don't have today's standup
  useEffect(() => {
    const sb = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { db: { schema: "forge" } }
    );

    let mounted = true;
    sb.from("daily_standups")
      .select("date, body_md, company_id, generated_at")
      .eq("company_id", companyId)
      .order("date", { ascending: false })
      .limit(1)
      .single()
      .then(({ data }) => {
        if (mounted && data) setStandup(data as StandupRow);
      });

    return () => {
      mounted = false;
    };
  }, [companyId]);

  const regenerate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/standup/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          (err as { error?: string }).error ?? `HTTP ${res.status}`
        );
      }
      const row = (await res.json()) as StandupRow;
      setStandup(row);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate standup");
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  return (
    <div
      data-testid="standup-card"
      className="rounded-lg border p-5 flex flex-col gap-3"
      style={{ backgroundColor: "#161b22", borderColor: "#30363d" }}
    >
      {/* Header row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className="text-xs uppercase tracking-wider font-semibold"
            style={{ color: "#8b949e" }}
          >
            Daily Standup
          </span>
          {standup && (
            <span
              className="text-xs tabular-nums"
              style={{ color: hasToday ? "#3fb950" : "#8b949e" }}
            >
              {formatDate(standup.date)}
            </span>
          )}
        </div>
        {isProduction ? (
          <span
            data-testid="standup-cron-hint"
            className="text-xs"
            style={{ color: "#8b949e" }}
          >
            Generates daily at 7am ET
          </span>
        ) : (
          <button
            onClick={regenerate}
            disabled={loading}
            data-testid="standup-regenerate-btn"
            className="text-xs px-3 py-1 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              backgroundColor: loading ? "#21262d" : "#21262d",
              color: loading ? "#8b949e" : "#58a6ff",
              border: "1px solid #30363d",
            }}
          >
            {loading ? "Generating..." : "Regenerate"}
          </button>
        )}
      </div>

      {/* Body */}
      {loading && !standup ? (
        <div
          className="text-sm animate-pulse"
          style={{ color: "#8b949e" }}
          data-testid="standup-loading"
        >
          Generating standup...
        </div>
      ) : standup ? (
        <p
          className="text-sm leading-relaxed whitespace-pre-wrap"
          style={{ color: "#e6edf3" }}
          data-testid="standup-body"
        >
          {standup.body_md}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <p
            className="text-sm"
            style={{ color: "#8b949e" }}
            data-testid="standup-empty"
          >
            No standup yet today — click Regenerate
          </p>
        </div>
      )}

      {/* Loading overlay over existing content */}
      {loading && standup && (
        <div
          className="text-xs"
          style={{ color: "#8b949e" }}
          data-testid="standup-loading"
        >
          Regenerating...
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="text-xs" style={{ color: "#f85149" }}>
          {error}
        </p>
      )}
    </div>
  );
}
