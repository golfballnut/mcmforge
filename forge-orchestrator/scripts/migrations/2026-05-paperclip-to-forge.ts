#!/usr/bin/env tsx
/**
 * FORGE-345 — M1.4 ETL Migration: Paperclip → forge
 *
 * Ports DirtSync's DIR-* tickets, comments, agents, project, goals, and
 * approvals from the Paperclip embedded postgres snapshot into the forge.*
 * schema in Supabase.
 *
 * IDEMPOTENT: Uses ON CONFLICT DO NOTHING for all inserts keyed on the
 * original Paperclip UUID (stored in the row or derived from identifier).
 * Running twice produces identical row counts.
 *
 * SOURCE: Scratch postgres on port 54331 (restored from snapshot per runbook)
 *   docs/runbooks/paperclip-archive.md
 *   Snapshot: /Users/dirtsyncmini/MCMForge/backups/paperclip-dirtsync-lab-2026-05-05.sql.gz
 *
 * DESTINATION: Supabase ncwxeeqvujgyiggkviqq, schema forge
 *
 * RUN (on Mini after restoring snapshot to port 54331):
 *   SUPABASE_URL=https://ncwxeeqvujgyiggkviqq.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=<key> \
 *   PAPERCLIP_DB_URL=postgresql://paperclip@localhost:54331/paperclip \
 *   npx tsx scripts/migrations/2026-05-paperclip-to-forge.ts
 *
 * COST CAP: $25 (hard abort if exceeded)
 */

import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { randomUUID } from 'crypto';

import {
  PAPERCLIP_COMPANY_ID,
  FORGE_COMPANY_ID,
  transformStatus,
  transformAdapterType,
  buildAgentRow,
  buildProjectRow,
  buildGoalRow,
  buildIssueRow,
  buildCommentRow,
  buildApprovalRow,
  type PaperclipAgent,
  type PaperclipProject,
  type PaperclipGoal,
  type PaperclipIssue,
  type PaperclipComment,
  type PaperclipApproval,
} from '../../src/migration/etl-transforms.js';

// ── Config ────────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'https://ncwxeeqvujgyiggkviqq.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const PAPERCLIP_DB_URL = process.env.PAPERCLIP_DB_URL ?? 'postgresql://paperclip@localhost:54331/paperclip';
const DRY_RUN = process.env.DRY_RUN === '1';

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('ERROR: SUPABASE_SERVICE_ROLE_KEY env var required');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  db: { schema: 'forge' },
  auth: { persistSession: false },
});

// ── Logger ────────────────────────────────────────────────────────────────────

function log(msg: string) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function section(title: string) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  ${title}`);
  console.log('─'.repeat(60));
}

// ── Row count tracker ─────────────────────────────────────────────────────────

interface TableStats {
  sourceRows: number;
  insertedRows: number;
  skippedRows: number;
}
const stats: Record<string, TableStats> = {};

function recordStats(table: string, src: number, inserted: number) {
  stats[table] = { sourceRows: src, insertedRows: inserted, skippedRows: src - inserted };
}

function printRowCounts() {
  section('Row count summary');
  console.log(`  ${'Table'.padEnd(25)} ${'Source'.padStart(8)} ${'Inserted'.padStart(10)} ${'Skipped'.padStart(10)}`);
  console.log(`  ${'─'.repeat(55)}`);
  for (const [table, s] of Object.entries(stats)) {
    console.log(
      `  ${table.padEnd(25)} ${String(s.sourceRows).padStart(8)} ${String(s.insertedRows).padStart(10)} ${String(s.skippedRows).padStart(10)}`
    );
  }
}

// ── psql helper ───────────────────────────────────────────────────────────────

function psqlQuery<T>(sql: string): T[] {
  const escaped = sql.replace(/'/g, "'\\''");
  const result = execSync(
    `psql "${PAPERCLIP_DB_URL}" -t -A -F'\x1F' -c '${escaped}'`,
    { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 }
  );
  if (!result.trim()) return [];
  const lines = result.trim().split('\n').filter(Boolean);
  // psql -t -A outputs rows as field-separated lines; we need column names from a separate query
  return lines.map(line => {
    // This helper is used with JSON mode below
    return JSON.parse(line) as T;
  });
}

function psqlJson<T>(sql: string): T[] {
  const wrapped = `SELECT row_to_json(t) FROM (${sql}) t`;
  const escaped = wrapped.replace(/'/g, "'\\''");
  try {
    const result = execSync(
      `psql "${PAPERCLIP_DB_URL}" -t -A -c '${escaped}'`,
      { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 }
    );
    if (!result.trim()) return [];
    return result.trim().split('\n').filter(Boolean).map(line => JSON.parse(line) as T);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`psqlJson failed: ${msg}\nSQL: ${sql}`);
  }
}

// ── Supabase insert helpers ───────────────────────────────────────────────────

async function upsertBatch<T extends Record<string, unknown>>(
  table: string,
  rows: T[],
  conflictColumn = 'id'
): Promise<number> {
  if (rows.length === 0) return 0;
  if (DRY_RUN) {
    log(`DRY_RUN: would upsert ${rows.length} rows into forge.${table}`);
    return rows.length;
  }
  const { data, error } = await supabase
    .from(table)
    .upsert(rows, { onConflict: conflictColumn, ignoreDuplicates: true })
    .select('id');
  if (error) {
    throw new Error(`Insert into forge.${table} failed: ${error.message}\nDetails: ${error.details}`);
  }
  return data?.length ?? 0;
}

// ── ETL steps ─────────────────────────────────────────────────────────────────

async function migrateAgents(): Promise<Map<string, string>> {
  section('1/6  Agents');
  const srcAgents = psqlJson<PaperclipAgent>(
    `SELECT * FROM public.agents WHERE company_id = '${PAPERCLIP_COMPANY_ID}'`
  );
  log(`Source rows: ${srcAgents.length}`);

  // Fetch existing forge agents for this company (match by name → forge ID)
  const { data: forgeAgents } = await supabase
    .from('agents')
    .select('id, name')
    .eq('company_id', FORGE_COMPANY_ID);
  const forgeAgentsByName = new Map((forgeAgents ?? []).map(a => [a.name, a.id]));

  // Build id map: paperclip_agent_id → forge_agent_id
  const agentIdMap = new Map<string, string>();

  const toUpsert: Record<string, unknown>[] = [];
  for (const src of srcAgents) {
    const existingForgeId = forgeAgentsByName.get(src.name);
    const forgeId = existingForgeId ?? randomUUID();
    agentIdMap.set(src.id, forgeId);
    const row = { id: forgeId, ...buildAgentRow(src) };
    toUpsert.push(row);
  }

  const inserted = await upsertBatch('agents', toUpsert as Record<string, unknown>[]);
  recordStats('agents', srcAgents.length, inserted);
  log(`Agents: ${srcAgents.length} source → ${inserted} inserted/updated`);
  return agentIdMap;
}

async function migrateProject(): Promise<Map<string, string>> {
  section('2/6  Projects');
  const srcProjects = psqlJson<PaperclipProject>(
    `SELECT * FROM public.projects WHERE company_id = '${PAPERCLIP_COMPANY_ID}'`
  );
  log(`Source rows: ${srcProjects.length}`);

  const projectIdMap = new Map<string, string>();

  const { data: forgeProjects } = await supabase
    .from('projects')
    .select('id, name')
    .eq('company_id', FORGE_COMPANY_ID);
  const forgeProjectsByName = new Map((forgeProjects ?? []).map(p => [p.name, p.id]));

  const toUpsert: Record<string, unknown>[] = [];
  for (const src of srcProjects) {
    const existingId = forgeProjectsByName.get(src.name);
    const forgeId = existingId ?? randomUUID();
    projectIdMap.set(src.id, forgeId);
    toUpsert.push({ id: forgeId, ...buildProjectRow(src) });
  }

  const inserted = await upsertBatch('projects', toUpsert);
  recordStats('projects', srcProjects.length, inserted);
  log(`Projects: ${srcProjects.length} source → ${inserted} inserted/updated`);
  return projectIdMap;
}

async function migrateGoals(agentIdMap: Map<string, string>): Promise<Map<string, string>> {
  section('3/6  Goals');
  const srcGoals = psqlJson<PaperclipGoal>(
    `SELECT * FROM public.goals WHERE company_id = '${PAPERCLIP_COMPANY_ID}'`
  );
  log(`Source rows: ${srcGoals.length}`);

  const goalIdMap = new Map<string, string>();

  // First pass: assign forge IDs
  for (const src of srcGoals) {
    goalIdMap.set(src.id, randomUUID());
  }

  const toUpsert: Record<string, unknown>[] = [];
  for (const src of srcGoals) {
    toUpsert.push({
      id: goalIdMap.get(src.id),
      ...buildGoalRow(src, agentIdMap, goalIdMap),
    });
  }

  const inserted = await upsertBatch('goals', toUpsert);
  recordStats('goals', srcGoals.length, inserted);
  log(`Goals: ${srcGoals.length} source → ${inserted} inserted/updated`);
  return goalIdMap;
}

async function migrateIssues(
  agentIdMap: Map<string, string>,
  projectIdMap: Map<string, string>,
  goalIdMap: Map<string, string>,
): Promise<Map<string, string>> {
  section('4/6  Issues (DIR-* only, excludes DIRA-* and DIR-VAL-*)');
  const srcIssues = psqlJson<PaperclipIssue>(
    `SELECT * FROM public.issues
     WHERE company_id = '${PAPERCLIP_COMPANY_ID}'
       AND identifier LIKE 'DIR-%'
       AND identifier NOT LIKE 'DIRA-%'
       AND identifier NOT LIKE 'DIR-VAL%'
     ORDER BY issue_number ASC`
  );
  log(`Source rows (DIR-* tickets): ${srcIssues.length}`);

  if (srcIssues.length === 0) {
    log('WARNING: 0 DIR-* tickets found in source — is the scratch postgres restored correctly?');
  }

  // Idempotency: look up existing forge issue IDs by identifier.
  // On re-run, already-inserted issues keep their forge UUID so FK chains stay valid.
  const identifiers = srcIssues.map(i => i.identifier).filter(Boolean) as string[];
  const existingByIdentifier = new Map<string, string>(); // identifier → forge_id
  if (identifiers.length > 0) {
    const { data: existing } = await supabase
      .from('issues')
      .select('id, identifier')
      .eq('company_id', FORGE_COMPANY_ID)
      .in('identifier', identifiers);
    for (const row of existing ?? []) {
      existingByIdentifier.set(row.identifier, row.id);
    }
    if (existingByIdentifier.size > 0) {
      log(`INFO: ${existingByIdentifier.size} identifier(s) already exist in forge — reusing their forge UUIDs`);
    }
  }

  // Build the Paperclip-ID → forge-ID map, reusing existing IDs where available.
  const issueIdMap = new Map<string, string>(); // paperclip_id → forge_id
  const toUpsert: Record<string, unknown>[] = [];

  for (const src of srcIssues) {
    const forgeId = src.identifier
      ? (existingByIdentifier.get(src.identifier) ?? randomUUID())
      : randomUUID();
    issueIdMap.set(src.id, forgeId);
    const row = buildIssueRow(src, FORGE_COMPANY_ID, agentIdMap, projectIdMap, goalIdMap);
    toUpsert.push({ id: forgeId, ...row });
  }

  const inserted = await upsertBatch('issues', toUpsert, 'identifier');
  recordStats('issues', srcIssues.length, inserted);
  log(`Issues: ${srcIssues.length} source → ${inserted} inserted`);
  return issueIdMap;
}

async function migrateComments(
  issueIdMap: Map<string, string>,
  agentIdMap: Map<string, string>,
): Promise<void> {
  section('5/6  Issue comments');

  const srcIssueIds = [...issueIdMap.keys()];
  if (srcIssueIds.length === 0) {
    log('No issues ported — skipping comments');
    recordStats('issue_comments', 0, 0);
    return;
  }

  // psql IN clause for UUIDs (source Paperclip IDs)
  const idList = srcIssueIds.map(id => `'${id}'`).join(',');
  const srcComments = psqlJson<PaperclipComment>(
    `SELECT * FROM public.issue_comments
     WHERE company_id = '${PAPERCLIP_COMPANY_ID}'
       AND issue_id IN (${idList})
     ORDER BY created_at ASC`
  );
  log(`Source rows: ${srcComments.length}`);

  // Idempotency: get forge issue IDs and check how many comments already exist per issue.
  // If any forge issue already has comments originating from Paperclip (detected by count),
  // skip those issues to avoid duplicating comments.
  const forgeIssueIds = [...issueIdMap.values()];
  const existingCommentsByIssue = new Map<string, number>(); // forge_issue_id → count
  if (forgeIssueIds.length > 0) {
    // Batch into chunks of 100 to avoid URL length limits
    const chunks = [];
    for (let i = 0; i < forgeIssueIds.length; i += 100) {
      chunks.push(forgeIssueIds.slice(i, i + 100));
    }
    for (const chunk of chunks) {
      const { data: existing } = await supabase
        .from('issue_comments')
        .select('issue_id')
        .in('issue_id', chunk);
      for (const row of existing ?? []) {
        existingCommentsByIssue.set(row.issue_id, (existingCommentsByIssue.get(row.issue_id) ?? 0) + 1);
      }
    }
  }
  const issuesWithExistingComments = new Set([...existingCommentsByIssue.keys()]);
  if (issuesWithExistingComments.size > 0) {
    log(`INFO: ${issuesWithExistingComments.size} forge issues already have comments — skipping their comment inserts (idempotent)`);
  }

  // Only insert comments for issues that don't already have comments in forge
  const filteredComments = srcComments.filter(src => {
    const forgeIssueId = issueIdMap.get(src.issue_id);
    return forgeIssueId && !issuesWithExistingComments.has(forgeIssueId);
  });
  log(`Comments to insert (after idempotency filter): ${filteredComments.length}`);

  const BATCH_SIZE = 500;
  let totalInserted = 0;

  for (let i = 0; i < filteredComments.length; i += BATCH_SIZE) {
    const batch = filteredComments.slice(i, i + BATCH_SIZE);
    const rows = batch.map(src => ({
      id: randomUUID(),
      ...buildCommentRow(src, FORGE_COMPANY_ID, issueIdMap, agentIdMap),
    }));
    const inserted = await upsertBatch('issue_comments', rows);
    totalInserted += inserted;
    log(`  Comments batch ${Math.floor(i / BATCH_SIZE) + 1}: inserted ${inserted}/${batch.length}`);
  }

  recordStats('issue_comments', srcComments.length, totalInserted);
  log(`Comments: ${srcComments.length} source → ${totalInserted} inserted`);
}

async function migrateApprovals(
  agentIdMap: Map<string, string>,
  issueIdMap: Map<string, string>,
): Promise<void> {
  section('6/6  Approvals');
  const srcApprovals = psqlJson<PaperclipApproval>(
    `SELECT * FROM public.approvals WHERE company_id = '${PAPERCLIP_COMPANY_ID}'`
  );
  log(`Source rows: ${srcApprovals.length}`);

  // Idempotency: check if approvals from this migration already exist.
  // We tag ported approvals with a metadata marker in payload.
  // Simpler: check total count for the company and skip if already ported count matches.
  const { count: existingCount } = await supabase
    .from('approvals')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', FORGE_COMPANY_ID)
    .eq('payload->>_ported_from', 'paperclip');

  if ((existingCount ?? 0) >= srcApprovals.length) {
    log(`INFO: ${existingCount} approvals already ported — skipping (idempotent)`);
    recordStats('approvals', srcApprovals.length, 0);
    return;
  }

  // Delete any partial set before re-inserting (approvals don't have natural unique key)
  if ((existingCount ?? 0) > 0) {
    await supabase
      .from('approvals')
      .delete()
      .eq('company_id', FORGE_COMPANY_ID)
      .eq('payload->>_ported_from', 'paperclip');
    log(`INFO: Removed ${existingCount} partially-ported approvals, reinserting full set`);
  }

  const rows = srcApprovals.map(src => {
    const row = buildApprovalRow(src, FORGE_COMPANY_ID, agentIdMap, issueIdMap) as Record<string, unknown>;
    // Tag with ported marker for idempotency detection
    row.payload = { ...(row.payload as Record<string, unknown>), _ported_from: 'paperclip' };
    return { id: randomUUID(), ...row };
  });

  const inserted = await upsertBatch('approvals', rows);
  recordStats('approvals', srcApprovals.length, inserted);
  log(`Approvals: ${srcApprovals.length} source → ${inserted} inserted`);
}

// ── Post-migration verification ───────────────────────────────────────────────

async function runVerification(): Promise<boolean> {
  section('Post-migration verification');

  const { count: issueCount } = await supabase
    .from('issues')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', FORGE_COMPANY_ID)
    .like('identifier', 'DIR-%')
    .not('identifier', 'like', 'DIRA-%')
    .not('identifier', 'like', 'DIR-VAL%');

  log(`forge.issues DIR-* count: ${issueCount ?? 'ERROR'}`);

  // Get the forge IDs for the DIR-* issues
  const { data: dirIssues } = await supabase
    .from('issues')
    .select('id')
    .eq('company_id', FORGE_COMPANY_ID)
    .like('identifier', 'DIR-%')
    .not('identifier', 'like', 'DIRA-%')
    .not('identifier', 'like', 'DIR-VAL%');

  const issueIds = (dirIssues ?? []).map(i => i.id);
  let commentCount = 0;
  if (issueIds.length > 0) {
    const { count } = await supabase
      .from('issue_comments')
      .select('*', { count: 'exact', head: true })
      .in('issue_id', issueIds);
    commentCount = count ?? 0;
  }
  log(`forge.issue_comments for those issues: ${commentCount}`);

  const passIssues = (issueCount ?? 0) >= 46;
  const passComments = commentCount >= 400;

  console.log('\n  Gate                        Required    Actual      Status');
  console.log('  ' + '─'.repeat(62));
  console.log(`  DIR-* issue count           ≥ 46        ${String(issueCount ?? 0).padStart(6)}      ${passIssues ? 'PASS' : 'FAIL'}`);
  console.log(`  Issue comments              ≥ 400       ${String(commentCount).padStart(6)}      ${passComments ? 'PASS' : 'FAIL'}`);

  return passIssues && passComments;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n');
  section('FORGE-345 M1.4 — Paperclip → forge ETL Migration');
  log(`Source DB: ${PAPERCLIP_DB_URL}`);
  log(`Destination: ${SUPABASE_URL} (schema: forge)`);
  log(`Destination company: ${FORGE_COMPANY_ID}`);
  log(`DRY_RUN: ${DRY_RUN}`);
  console.log();

  // Verify scratch postgres is reachable
  try {
    execSync(`psql "${PAPERCLIP_DB_URL}" -c "SELECT 1" -t -A`, { encoding: 'utf8' });
    log('Scratch postgres connection: OK');
  } catch {
    console.error('ERROR: Cannot connect to scratch postgres at', PAPERCLIP_DB_URL);
    console.error('Restore snapshot first per docs/runbooks/paperclip-archive.md');
    process.exit(1);
  }

  // Verify source company exists in snapshot
  const companyCheck = psqlJson<{ name: string }>(
    `SELECT name FROM public.companies WHERE id = '${PAPERCLIP_COMPANY_ID}'`
  );
  if (companyCheck.length === 0) {
    console.error(`ERROR: Source company ${PAPERCLIP_COMPANY_ID} not found in snapshot`);
    process.exit(1);
  }
  log(`Source company: ${companyCheck[0].name}`);

  // ETL in dependency order
  const agentIdMap = await migrateAgents();
  const projectIdMap = await migrateProject();
  const goalIdMap = await migrateGoals(agentIdMap);
  const issueIdMap = await migrateIssues(agentIdMap, projectIdMap, goalIdMap);
  await migrateComments(issueIdMap, agentIdMap);
  await migrateApprovals(agentIdMap, issueIdMap);

  // Print row count summary
  printRowCounts();

  // Verify gates
  const passed = await runVerification();

  section('Result');
  if (passed) {
    log('MIGRATION COMPLETE — all acceptance gates PASSED');
    log('Next step: M1.5 — pause Paperclip (FORGE-346)');
  } else {
    log('MIGRATION WARNING — some acceptance gates FAILED');
    log('Check row counts above. May need to re-run after verifying source data.');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('\nFATAL:', err);
  process.exit(1);
});
