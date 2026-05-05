import { execSync } from 'node:child_process';
import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../utils/logger.js';

export interface GitCommit {
  timestamp: string;
  subject: string;
  author: string;
}

export interface RunStats {
  total: number;
  succeeded: number;
  failed: number;
  totalCostUsd: number;
}

export interface OpenIssue {
  id: string;
  title: string;
  status: string;
  updated_at: string;
}

export interface StandupData {
  openIssues: OpenIssue[];
  runStats: RunStats;
  recentCommits: GitCommit[];
}

/**
 * Fetch all data needed to compose a daily standup.
 * - Issues: open issues with activity in last 24h
 * - Runs: last 24h count, status breakdown, total cost
 * - Git log: last 24h commits with subject + author
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchStandupData(supabase: SupabaseClient<any, any, any>, companyId: string): Promise<StandupData> {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // ── Issues: open + active in last 24h ─────────────────────────────────────
  const { data: issueRows, error: issuesError } = await supabase
    .from('issues')
    .select('id, title, status, updated_at')
    .eq('company_id', companyId)
    .gte('updated_at', since24h);

  if (issuesError) {
    logger.warn({ err: issuesError }, '[standup] issues query failed, using empty');
  }
  const openIssues: OpenIssue[] = (issueRows ?? []) as OpenIssue[];

  // ── Runs: last 24h ─────────────────────────────────────────────────────────
  const { data: runRows, error: runsError } = await supabase
    .from('runs')
    .select('id, status, cost_usd')
    .eq('company_id', companyId)
    .gte('created_at', since24h);

  if (runsError) {
    logger.warn({ err: runsError }, '[standup] runs query failed, using empty');
  }
  const runs = runRows ?? [];
  const runStats: RunStats = {
    total: runs.length,
    succeeded: runs.filter((r: { status: string }) => r.status === 'succeeded').length,
    failed: runs.filter((r: { status: string }) => r.status === 'failed' || r.status === 'timed_out').length,
    totalCostUsd: runs.reduce((sum: number, r: { cost_usd?: string }) => sum + (parseFloat(r.cost_usd ?? '0') || 0), 0),
  };

  // ── Git log: last 24h ──────────────────────────────────────────────────────
  const recentCommits = fetchGitCommits(since24h);

  return { openIssues, runStats, recentCommits };
}

function fetchGitCommits(since: string): GitCommit[] {
  try {
    const raw = execSync(
      `git log --since="${since}" --format="%aI|%s|%an" --no-merges`,
      { encoding: 'buffer' },
    ).toString('utf-8').trim();

    if (!raw) return [];

    return raw.split('\n').filter(Boolean).map((line) => {
      const [timestamp, subject, author] = line.split('|');
      return { timestamp: timestamp ?? '', subject: subject ?? '', author: author ?? '' };
    });
  } catch (err) {
    logger.warn({ err }, '[standup] git log failed, returning empty commits');
    return [];
  }
}
