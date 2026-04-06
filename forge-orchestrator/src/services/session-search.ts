import Database from 'better-sqlite3';
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { logger } from '../utils/logger.js';

/**
 * FTS5-backed session search for cross-run agent memory.
 *
 * After each run, the orchestrator indexes the agent's result text.
 * Before each run, the orchestrator queries for relevant past results
 * and injects them into the agent's prompt context.
 *
 * Inspired by Hermes Agent's FTS5 session search pattern.
 * No vector database needed — SQLite + FTS5 is fast, local, and free.
 */

let db: Database.Database | null = null;

function getDb(dataDir: string): Database.Database {
  if (db) return db;

  mkdirSync(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, 'session-search.sqlite');

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  // Create tables if they don't exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS run_results (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      agent_name TEXT NOT NULL,
      company_id TEXT NOT NULL,
      result_text TEXT NOT NULL,
      cost_usd REAL,
      turns_used INTEGER,
      status TEXT,
      issue_id TEXT,
      created_at TEXT NOT NULL
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS run_results_fts USING fts5(
      result_text,
      agent_name,
      content='run_results',
      content_rowid='rowid'
    );

    -- Triggers to keep FTS in sync
    CREATE TRIGGER IF NOT EXISTS run_results_ai AFTER INSERT ON run_results BEGIN
      INSERT INTO run_results_fts(rowid, result_text, agent_name)
      VALUES (new.rowid, new.result_text, new.agent_name);
    END;

    CREATE TRIGGER IF NOT EXISTS run_results_ad AFTER DELETE ON run_results BEGIN
      INSERT INTO run_results_fts(run_results_fts, rowid, result_text, agent_name)
      VALUES ('delete', old.rowid, old.result_text, old.agent_name);
    END;
  `);

  logger.info({ dbPath }, 'Session search database initialized');
  return db;
}

/**
 * Index a completed run's result for future search.
 */
export function indexRunResult(dataDir: string, params: {
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
  const db = getDb(dataDir);

  try {
    db.prepare(`
      INSERT OR REPLACE INTO run_results (id, agent_id, agent_name, company_id, result_text, cost_usd, turns_used, status, issue_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      params.runId,
      params.agentId,
      params.agentName,
      params.companyId,
      params.resultText,
      params.costUsd,
      params.turnsUsed,
      params.status,
      params.issueId,
      new Date().toISOString(),
    );
  } catch (err) {
    logger.error({ err, runId: params.runId }, 'Failed to index run result');
  }
}

/**
 * Search past run results for an agent. Returns the most relevant results
 * that the agent can use as context for its current task.
 */
export function searchAgentHistory(dataDir: string, params: {
  agentId: string;
  query?: string;
  limit?: number;
}): Array<{ runId: string; resultText: string; status: string; issueId: string | null; createdAt: string }> {
  const db = getDb(dataDir);
  const limit = params.limit || 3;

  try {
    if (params.query) {
      // Full-text search across this agent's results
      return db.prepare(`
        SELECT r.id as runId, r.result_text as resultText, r.status, r.issue_id as issueId, r.created_at as createdAt
        FROM run_results r
        JOIN run_results_fts fts ON fts.rowid = r.rowid
        WHERE run_results_fts MATCH ? AND r.agent_id = ?
        ORDER BY rank
        LIMIT ?
      `).all(params.query, params.agentId, limit) as any[];
    } else {
      // Just return the most recent results for this agent
      return db.prepare(`
        SELECT id as runId, result_text as resultText, status, issue_id as issueId, created_at as createdAt
        FROM run_results
        WHERE agent_id = ?
        ORDER BY created_at DESC
        LIMIT ?
      `).all(params.agentId, limit) as any[];
    }
  } catch (err) {
    logger.error({ err, agentId: params.agentId }, 'Failed to search agent history');
    return [];
  }
}
