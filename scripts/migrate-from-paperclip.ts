#!/usr/bin/env npx tsx
/**
 * Migrate agents, issues, and routines from Paperclip to MCM Forge.
 *
 * Prerequisites:
 *   - Paperclip running at http://127.0.0.1:3100
 *   - SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY set in environment
 *   - forge schema already created in Supabase
 *
 * Usage:
 *   SUPABASE_URL=https://xxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=xxx npx tsx scripts/migrate-from-paperclip.ts
 */

import { createClient } from '@supabase/supabase-js';

const PAPERCLIP_BASE = 'http://127.0.0.1:3100';
const COMPANY_SLUG = 'DIRA'; // DirtSync

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { db: { schema: 'forge' } }
);

async function fetchPaperclip(path: string) {
  const res = await fetch(`${PAPERCLIP_BASE}${path}`);
  if (!res.ok) throw new Error(`Paperclip ${path}: ${res.status}`);
  return res.json();
}

async function getForgeCompanyId(slug: string): Promise<string> {
  const { data } = await supabase.from('companies').select('id').eq('slug', slug).single();
  if (!data) throw new Error(`Company ${slug} not found in forge`);
  return data.id;
}

async function migrateAgents(companyId: string) {
  console.log('Fetching Paperclip agents...');
  const agents = await fetchPaperclip(`/api/companies/${COMPANY_SLUG}/agents`);
  console.log(`Found ${agents.length} agents`);

  const agentIdMap = new Map<string, string>(); // paperclip ID -> forge ID

  // First pass: create agents without reports_to
  for (const agent of agents) {
    const adapterConfig: Record<string, unknown> = {};
    if (agent.adapterConfig) {
      Object.assign(adapterConfig, agent.adapterConfig);
    }
    // Map Paperclip adapter types
    const adapterType = agent.adapterType === 'claude_local' ? 'claude'
      : agent.adapterType === 'gemini_local' ? 'gemini'
      : agent.adapterType === 'codex_local' ? 'codex'
      : 'claude';

    const { data, error } = await supabase.from('agents').insert({
      company_id: companyId,
      name: agent.name,
      role: agent.role || 'engineer',
      title: agent.title || null,
      icon: agent.icon || null,
      status: agent.status === 'active' ? 'idle' : (agent.status || 'idle'),
      adapter_type: adapterType,
      adapter_config: adapterConfig,
      prompt_template: agent.promptTemplate || null,
      instructions_file: agent.instructionsFile || null,
      skills: agent.skills || [],
      budget_monthly_cents: agent.budgetMonthlyCents || 0,
    }).select('id').single();

    if (error) {
      console.error(`Failed to migrate agent ${agent.name}:`, error.message);
      continue;
    }
    agentIdMap.set(agent.id, data.id);
    console.log(`  ✓ ${agent.name} (${adapterType})`);
  }

  // Second pass: set reports_to
  for (const agent of agents) {
    if (agent.reportsTo && agentIdMap.has(agent.reportsTo)) {
      const forgeId = agentIdMap.get(agent.id);
      const reportsToForgeId = agentIdMap.get(agent.reportsTo);
      if (forgeId && reportsToForgeId) {
        await supabase.from('agents').update({ reports_to: reportsToForgeId }).eq('id', forgeId);
      }
    }
  }

  return agentIdMap;
}

async function migrateIssues(companyId: string, agentIdMap: Map<string, string>) {
  console.log('\nFetching Paperclip issues...');
  const issues = await fetchPaperclip(`/api/companies/${COMPANY_SLUG}/issues?limit=1000`);
  console.log(`Found ${issues.length} issues`);

  for (const issue of issues) {
    const assigneeId = issue.assigneeAgentId ? agentIdMap.get(issue.assigneeAgentId) : null;

    const { error } = await supabase.from('issues').insert({
      company_id: companyId,
      title: issue.title,
      description: issue.description || null,
      status: issue.status || 'backlog',
      priority: issue.priority || 'medium',
      assignee_agent_id: assigneeId || null,
      issue_number: issue.issueNumber,
      identifier: issue.identifier,
      origin_kind: issue.originKind || 'manual',
      created_at: issue.createdAt,
      completed_at: issue.completedAt || null,
    });

    if (error) {
      console.error(`Failed to migrate issue ${issue.identifier}:`, error.message);
      continue;
    }
    console.log(`  ✓ ${issue.identifier} — ${issue.title?.slice(0, 60)}`);
  }
}

async function migrateRoutines(companyId: string, agentIdMap: Map<string, string>) {
  console.log('\nFetching Paperclip routines...');
  const routines = await fetchPaperclip(`/api/companies/${COMPANY_SLUG}/routines`);
  console.log(`Found ${routines.length} routines`);

  // Need a project ID — get first project or create one
  let { data: project } = await supabase.from('projects').select('id').eq('company_id', companyId).limit(1).single();
  if (!project) {
    const { data: newProject } = await supabase.from('projects').insert({
      company_id: companyId,
      name: 'DirtSync iOS',
      description: 'Main DirtSync iOS app project',
      repo_url: 'golfballnut/DirtSync',
      repo_branch: 'master',
    }).select('id').single();
    project = newProject;
  }

  for (const routine of routines) {
    const assigneeId = routine.assigneeAgentId ? agentIdMap.get(routine.assigneeAgentId) : null;
    if (!assigneeId) {
      console.log(`  ⚠ Skipping ${routine.title} — no matching agent`);
      continue;
    }

    const { error } = await supabase.from('routines').insert({
      company_id: companyId,
      project_id: project!.id,
      title: routine.title,
      description: routine.description || null,
      assignee_agent_id: assigneeId,
      priority: routine.priority || 'medium',
      status: routine.status === 'active' ? 'active' : 'paused',
      cron_expression: routine.cronExpression || '0 */6 * * *',
      timezone: routine.timezone || 'America/New_York',
      concurrency_policy: routine.concurrencyPolicy || 'skip_if_active',
      catch_up_policy: routine.catchUpPolicy || 'skip_missed',
      prompt_template: routine.promptTemplate || null,
    });

    if (error) {
      console.error(`Failed to migrate routine ${routine.title}:`, error.message);
      continue;
    }
    console.log(`  ✓ ${routine.title}`);
  }
}

async function main() {
  console.log('=== MCM Forge Migration: Paperclip → Forge ===\n');

  const companyId = await getForgeCompanyId('dirtsync');
  console.log(`Company ID: ${companyId}\n`);

  const agentIdMap = await migrateAgents(companyId);
  console.log(`\nMigrated ${agentIdMap.size} agents`);

  await migrateIssues(companyId, agentIdMap);
  await migrateRoutines(companyId, agentIdMap);

  console.log('\n=== Migration complete ===');
}

main().catch(console.error);
