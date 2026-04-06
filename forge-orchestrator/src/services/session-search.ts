import { logger } from '../utils/logger.js';

/**
 * FTS5-backed session search for cross-run agent memory.
 *
 * DISABLED: better-sqlite3 native module has Node version mismatch on Mini
 * (PM2 runs Node 20, module compiled for Node 25).
 *
 * These functions are no-ops until we fix the Node version alignment.
 * The orchestrator works fine without session search — agents just don't
 * get history context injected into their prompts.
 */

export function indexRunResult(_dataDir: string, _params: {
  runId: string;
  agentId: string;
  agentName: string;
  companyId: string;
  resultText: string;
  costUsd: number | null;
  turnsUsed: number | null;
  status: string;
  issueId: string | null;
}): void {
  // no-op until better-sqlite3 Node version is fixed
}

export function searchAgentHistory(_dataDir: string, _params: {
  agentId: string;
  query?: string;
  limit?: number;
}): Array<{ runId: string; resultText: string; status: string; issueId: string | null; createdAt: string }> {
  // no-op until better-sqlite3 Node version is fixed
  return [];
}
