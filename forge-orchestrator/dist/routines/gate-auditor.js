/**
 * Gate Auditor Routine
 *
 * Run: npx tsx src/routines/gate-auditor.ts
 *
 * Daily audit of every specialist's certification state. For each agent:
 *   1. Ensure a `Certification: <Agent Name>` issue exists (create if missing)
 *   2. Compute recent performance metrics (runs, success rate, cost, cost/run)
 *   3. Post a structured digest comment with current gate + days-at-gate + blockers
 *
 * Manual only until dialed in. Do NOT insert into forge.routines until a full
 * 2-consecutive-clean-run certification (G2) is complete.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { existsSync } from 'node:fs';
import path from 'node:path';
const GATE_NAMES = ['G0 uncertified', 'G1 skill-complete', 'G2 manual dry-run', 'G3 supervised live', 'G4 match test', 'G5 autonomous'];
const GATE_BLOCKERS = {
    0: [
        'AGENTS.md frontmatter complete (skills array, adapter, model)',
        'HEARTBEAT.md has Read LESSONS.md as Step 0',
        'TOOLS.md has all canonical commands',
        'LESSONS.md file exists with header stanza',
        'adapter_config has command, dangerouslySkipPermissions, cwd',
    ],
    1: [
        'Manual dry-run on Mini — every HEARTBEAT step runs',
        'Evidence bundle uploaded as Certification issue attachment',
    ],
    2: [
        'One supervised live run completes [PROOF] with artifact',
        'CEO posts [GATE-PASSED 3] after reviewing the PR',
    ],
    3: [
        '2 more clean G3-level runs on different issues',
        'No silent runs, no guardrail breaches',
    ],
    4: [
        'Match test passes (agent reproduces manually-done task)',
    ],
    5: ['— autonomous cleared —'],
};
async function fetchAgents(supabase) {
    const { data } = await supabase
        .from('agents')
        .select('id, name, company_id, status, certification_gate, session_id, updated_at, instructions_file')
        .neq('status', 'terminated')
        .order('name');
    return (data ?? []);
}
async function fetchRunStats(supabase, agentId, sinceIso) {
    const { data } = await supabase
        .from('runs')
        .select('id, status, cost_usd, started_at, finished_at, summary, created_at')
        .eq('agent_id', agentId)
        .gt('created_at', sinceIso);
    const runs = data ?? [];
    const succeeded = runs.filter(r => r.status === 'succeeded').length;
    const failed = runs.filter(r => ['failed', 'errored'].includes(r.status)).length;
    const cancelled = runs.filter(r => r.status === 'cancelled').length;
    const totalCost = runs.reduce((s, r) => s + Number(r.cost_usd ?? 0), 0);
    const withDuration = runs.filter(r => r.started_at && r.finished_at);
    const avgDurationSec = withDuration.length
        ? Math.round(withDuration.reduce((s, r) => s + (new Date(r.finished_at).getTime() - new Date(r.started_at).getTime()), 0) / withDuration.length / 1000)
        : 0;
    const lastFailed = runs
        .filter(r => ['failed', 'errored', 'cancelled'].includes(r.status))
        .sort((a, b) => (b.created_at > a.created_at ? 1 : -1))[0];
    return {
        total: runs.length,
        succeeded,
        failed,
        cancelled,
        totalCost,
        avgCost: runs.length ? totalCost / runs.length : 0,
        avgDurationSec,
        lastFailedRun: lastFailed ? { id: lastFailed.id, summary: lastFailed.summary, created_at: lastFailed.created_at } : null,
    };
}
async function ensureCertificationIssue(supabase, agent) {
    // Look for existing
    const { data: existing } = await supabase
        .from('issues')
        .select('id, identifier')
        .eq('company_id', agent.company_id)
        .eq('title', `Certification: ${agent.name}`)
        .limit(1);
    if (existing && existing.length > 0) {
        return { id: existing[0].id, identifier: existing[0].identifier, created: false };
    }
    // Create it — bump counter
    const { data: co } = await supabase.from('companies').select('issue_prefix, issue_counter').eq('id', agent.company_id).single();
    const nextNum = (co?.issue_counter ?? 0) + 1;
    await supabase.from('companies').update({ issue_counter: nextNum }).eq('id', agent.company_id);
    const identifier = `${co?.issue_prefix}-${nextNum}`;
    const { data: newIssue } = await supabase.from('issues').insert({
        company_id: agent.company_id,
        title: `Certification: ${agent.name}`,
        description: [
            `## Certification state for ${agent.name}`,
            ``,
            `This issue tracks the agent's journey through G1–G5 gates. See \`vault/agents/skills/agent-certification-gates.md\` for the SOP.`,
            ``,
            `- Agent UUID: \`${agent.id}\``,
            `- Current gate: G${agent.certification_gate}`,
            `- AGENTS.md: \`${agent.instructions_file ?? '(not set)'}\``,
            ``,
            `Gate Auditor posts a daily digest as a comment on this issue. Promotion/demotion is driven by \`[GATE-PASSED N]\` / \`[GATE-FAILED N]\` comments from CEO or Steve.`,
        ].join('\n'),
        status: 'in_progress',
        priority: 'medium',
        issue_number: nextNum,
        identifier,
        origin_kind: 'agent_created',
        origin_id: agent.id,
        assignee_agent_id: agent.id, // self-assigned
    }).select('id, identifier').single();
    if (!newIssue)
        throw new Error(`failed to create Certification issue for ${agent.name}`);
    return { id: newIssue.id, identifier: newIssue.identifier, created: true };
}
function lessonsCountFor(agent, repoRoot) {
    if (!agent.instructions_file)
        return { count: 0, file: null };
    // HEARTBEAT dir typically contains LESSONS.md sibling of AGENTS.md
    const agentDir = path.dirname(agent.instructions_file);
    const lessonsFile = path.join(agentDir, 'LESSONS.md');
    if (!existsSync(lessonsFile))
        return { count: 0, file: lessonsFile };
    try {
        const fs = require('node:fs');
        const body = fs.readFileSync(lessonsFile, 'utf8');
        // each lesson starts with `## ` header
        const count = (body.match(/^##\s/gm) ?? []).length;
        return { count, file: lessonsFile };
    }
    catch {
        return { count: 0, file: lessonsFile };
    }
}
function formatDigest(agent, stats, lessons) {
    const gate = agent.certification_gate;
    const gateName = GATE_NAMES[gate] ?? `G${gate}`;
    const blockers = GATE_BLOCKERS[gate] ?? [];
    const daysAtGate = Math.floor((Date.now() - new Date(agent.updated_at).getTime()) / 86_400_000);
    const successRate = stats.total > 0 ? Math.round((stats.succeeded / stats.total) * 100) : 0;
    const lines = [
        `**[GATE-AUDIT — ${new Date().toISOString().slice(0, 10)}]**`,
        ``,
        `| Field | Value |`,
        `|---|---|`,
        `| Current gate | **${gateName}** |`,
        `| Status | ${agent.status} |`,
        `| Days at current gate | ~${daysAtGate}d |`,
        `| Runs (last 7d) | ${stats.total} total — ${stats.succeeded}✅ ${stats.failed}❌ ${stats.cancelled}⏹ |`,
        `| Success rate (7d) | ${successRate}% |`,
        `| Avg cost / run | $${stats.avgCost.toFixed(2)} |`,
        `| Avg duration | ${stats.avgDurationSec}s |`,
        `| Total spend (7d) | $${stats.totalCost.toFixed(2)} |`,
        `| Lessons captured | ${lessons.count} |`,
        ``,
        `### Blockers to next gate (G${gate + 1})`,
        ...blockers.map(b => `- [ ] ${b}`),
    ];
    if (stats.lastFailedRun) {
        lines.push('', `### Last failed run`, `- ${stats.lastFailedRun.created_at.slice(0, 16)} — ${(stats.lastFailedRun.summary ?? '(no summary)').slice(0, 120)}`);
    }
    if (gate >= 3 && stats.total > 0 && successRate < 70) {
        lines.push('', `⚠️ **Alert:** success rate below 70% at G${gate}+. CEO should review before next dispatch.`);
    }
    return lines.join('\n');
}
async function main() {
    const url = process.env.SUPABASE_URL ?? 'https://ncwxeeqvujgyiggkviqq.supabase.co';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!key) {
        console.error('need SUPABASE_SERVICE_ROLE_KEY');
        process.exit(1);
    }
    const repoRoot = path.resolve(process.cwd(), '..');
    const supabase = createClient(url, key, { db: { schema: 'forge' } });
    const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const dryRun = process.argv.includes('--dry-run');
    const limitArg = process.argv.find(a => a.startsWith('--limit='));
    const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : Infinity;
    const nameArg = process.argv.find(a => a.startsWith('--name='));
    const nameFilter = nameArg ? nameArg.split('=')[1].toLowerCase() : null;
    console.log(`\n=== Gate Auditor — ${dryRun ? 'DRY-RUN' : 'LIVE'}${nameFilter ? ` (filter: ${nameFilter})` : ''} ===\n`);
    let agents = await fetchAgents(supabase);
    if (nameFilter)
        agents = agents.filter(a => a.name.toLowerCase().includes(nameFilter));
    agents = agents.slice(0, limit);
    console.log(`Found ${agents.length} agents to audit\n`);
    let created = 0;
    let posted = 0;
    for (const agent of agents) {
        process.stdout.write(`- ${agent.name.padEnd(40)} G${agent.certification_gate} ${agent.status} … `);
        const stats = await fetchRunStats(supabase, agent.id, sevenDaysAgo);
        const lessons = lessonsCountFor(agent, repoRoot);
        if (dryRun) {
            console.log(`${stats.total} runs, ${lessons.count} lessons (dry-run; not posting)`);
            continue;
        }
        const cert = await ensureCertificationIssue(supabase, agent);
        if (cert.created)
            created++;
        const digest = formatDigest(agent, stats, lessons);
        const { error } = await supabase.from('issue_comments').insert({
            company_id: agent.company_id,
            issue_id: cert.id,
            author_user_id: 'gate-auditor',
            body: digest,
        });
        if (error) {
            console.log(`ERROR: ${error.message}`);
        }
        else {
            posted++;
            console.log(`posted to ${cert.identifier}${cert.created ? ' (new)' : ''}`);
        }
    }
    console.log(`\n--- Summary ---`);
    console.log(`Agents audited: ${agents.length}`);
    console.log(`Certification issues created: ${created}`);
    console.log(`Digests posted: ${posted}`);
}
main().catch(e => { console.error(e); process.exit(1); });
//# sourceMappingURL=gate-auditor.js.map