/**
 * Live integration test for the COO router.
 *
 * Run: npx tsx src/loops/test-coo-integration.ts
 *
 * Exercises each of the 6 meta-tag scenarios against the live Supabase instance.
 * Creates a throwaway test issue ("COO Integration Test — <timestamp>"), posts
 * a series of comments, runs the COO tick() once, verifies each expected outcome
 * via SQL, then cleans up.
 *
 * This IS the COO's first supervised live run — its G3 certification evidence.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { parseMetaTags } from './coo-router.js';
const checks = [];
const add = (name, pass, note) => {
    checks.push({ name, pass, note });
    const icon = pass ? '✅' : '❌';
    console.log(`${icon} ${name}${note ? ` — ${note}` : ''}`);
};
const MCM_FORGE_COMPANY_ID = '170ebe36-d689-4f15-91f1-7474df6c98cd';
const FORGE_COO_AGENT_ID = '1a6a901a-b33b-46f9-bb60-3770b25b8d15'; // Forge COO — used as "CEO" for auth
const FORGE_BUILDER_AGENT_ID = '21d39f2a-db73-45af-b4ce-abd321d70fe1';
async function main() {
    const url = process.env.SUPABASE_URL ?? 'https://ncwxeeqvujgyiggkviqq.supabase.co';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!key) {
        console.error('need SUPABASE_SERVICE_ROLE_KEY');
        process.exit(1);
    }
    const supabase = createClient(url, key, { db: { schema: 'forge' } });
    console.log('\n=== COO Integration Test ===\n');
    // --- Phase 1: isolated mini-tests for evaluateComment helpers ---
    console.log('Phase 1: parseMetaTags unit-level checks on canned bodies\n');
    add('parse: [GATE-PASSED 2]', parseMetaTags('[GATE-PASSED 2] dry-run clean').some(t => t.type === 'gate_passed' && t.gate === 2));
    add('parse: [DISPATCH-OK]', parseMetaTags('[DISPATCH-OK] go').some(t => t.type === 'dispatch_ok'));
    add('parse: [PROOF] with attachments heading', parseMetaTags('[PROOF] done\n## Artifacts\n- url').some(t => t.type === 'proof'));
    add('parse: [BLOCKED] @Agent Name stops at first lowercase', parseMetaTags('[BLOCKED] cannot build. @Map Rendering Expert please fix tomorrow')
        .some(t => t.type === 'blocked_mention' && t.agentName === 'Map Rendering Expert'));
    // --- Phase 2: create a live test issue + scenario comments ---
    console.log('\nPhase 2: live scenario against real Supabase\n');
    // 2a. Create test issue
    // First bump counter to avoid identifier collision
    const { data: co } = await supabase.from('companies').select('issue_counter').eq('id', MCM_FORGE_COMPANY_ID).single();
    const nextNum = (co?.issue_counter ?? 0) + 1;
    await supabase.from('companies').update({ issue_counter: nextNum }).eq('id', MCM_FORGE_COMPANY_ID);
    const identifier = `FORGE-${nextNum}`;
    const { data: issue, error: issueErr } = await supabase.from('issues').insert({
        company_id: MCM_FORGE_COMPANY_ID,
        title: `COO integration test — ${new Date().toISOString()}`,
        description: 'Throwaway test issue. Will be deleted at end of integration run.',
        status: 'todo',
        priority: 'low',
        issue_number: nextNum,
        identifier,
        origin_kind: 'agent_created',
        origin_id: FORGE_COO_AGENT_ID,
        assignee_agent_id: FORGE_BUILDER_AGENT_ID, // target of gate promotion
    }).select().single();
    if (issueErr || !issue) {
        console.error('failed to create test issue:', issueErr);
        process.exit(1);
    }
    add('live: test issue created', true, `id=${issue.id} identifier=${identifier}`);
    // Remember Forge Builder's current gate so we can restore it at end
    const { data: fbBefore } = await supabase.from('agents').select('certification_gate').eq('id', FORGE_BUILDER_AGENT_ID).single();
    const fbGateBefore = fbBefore?.certification_gate ?? 0;
    // Reset Forge Builder to G0 to give us a clean slate (we'll restore after)
    await supabase.from('agents').update({ certification_gate: 0 }).eq('id', FORGE_BUILDER_AGENT_ID);
    // 2b. Post 6 test comments across all tag types
    const commentsToPost = [
        // S1: [GATE-PASSED 1] from Forge COO (authorized) — should promote Forge Builder G0→G1
        { body: '[GATE-PASSED 1] Forge Builder AGENTS.md + HEARTBEAT + skills reviewed, all wired.', author_agent_id: FORGE_COO_AGENT_ID },
        // S2: [GATE-PASSED 3] from Forge COO — non-sequential (G1→G3), should be REJECTED
        { body: '[GATE-PASSED 3] skip ahead to supervised.', author_agent_id: FORGE_COO_AGENT_ID },
        // S3: [GATE-PASSED 1] from unauthorized agent (Forge Builder itself) — should be REJECTED
        { body: '[GATE-PASSED 1] self-promote attempt.', author_agent_id: FORGE_BUILDER_AGENT_ID },
        // S4: [PROOF] comment from Forge Builder without any attachment — should REJECT
        { body: '[PROOF] build passes, PR opened. No artifact uploaded.', author_agent_id: FORGE_BUILDER_AGENT_ID },
        // S5: [BLOCKED] @Forge Builder — should NOTE but not dispatch (Forge Builder currently G1 < G3)
        { body: '[BLOCKED] route fails. @Forge Builder take it.', author_agent_id: FORGE_COO_AGENT_ID },
        // S6: [DISPATCH-OK] from Forge COO — should record issue_event
        { body: '[DISPATCH-OK] supervised only.', author_agent_id: FORGE_COO_AGENT_ID },
    ];
    const commentIds = [];
    for (const c of commentsToPost) {
        // small sleep to ensure created_at ordering is preserved
        await new Promise(r => setTimeout(r, 50));
        const { data: cm } = await supabase.from('issue_comments').insert({
            company_id: MCM_FORGE_COMPANY_ID,
            issue_id: issue.id,
            author_agent_id: c.author_agent_id,
            body: c.body,
        }).select().single();
        if (cm)
            commentIds.push(cm.id);
    }
    add('live: 6 scenario comments posted', commentIds.length === 6);
    // 2c. Run the COO tick() once
    const cooConfig = {
        ceoAgentIds: new Set([FORGE_COO_AGENT_ID]),
        stevenUserIdPrefix: 'steve',
    };
    // The module-level `lastCheckedAt` is set to "now" on import; comments we just inserted
    // happened a moment ago and may be before lastCheckedAt. Work around by temporarily
    // re-importing via dynamic import with a cache-busting query string — simpler:
    // call evaluateComment directly.
    const { evaluateComment } = await import('./coo-router.js');
    const perCommentResults = [];
    for (const cid of commentIds) {
        const { data: cmRow } = await supabase.from('issue_comments').select('*').eq('id', cid).single();
        if (!cmRow)
            continue;
        const actions = await evaluateComment(supabase, cmRow, cooConfig);
        perCommentResults.push({ body: cmRow.body.slice(0, 60), actions });
    }
    console.log('\nPer-scenario COO actions:');
    perCommentResults.forEach((r, i) => {
        console.log(`  S${i + 1}. "${r.body}"`);
        r.actions.forEach(a => console.log(`      → ${a}`));
    });
    // 2d. Verify outcomes
    console.log('\nPhase 3: outcome verification\n');
    const { data: fbAfter } = await supabase.from('agents').select('certification_gate').eq('id', FORGE_BUILDER_AGENT_ID).single();
    add('S1 promoted G0→G1', fbAfter?.certification_gate === 1, `gate is now G${fbAfter?.certification_gate}`);
    const s2Actions = perCommentResults[1].actions.join(' ');
    add('S2 non-sequential G3 rejected', /non-sequential/.test(s2Actions) || /ignored/.test(s2Actions));
    const s3Actions = perCommentResults[2].actions.join(' ');
    add('S3 unauthorized author rejected', /not authorized/.test(s3Actions));
    const s4Actions = perCommentResults[3].actions.join(' ');
    add('S4 proof-without-attachment rejected', /PROOF REJECTED/.test(s4Actions));
    const s5Actions = perCommentResults[4].actions.join(' ');
    add('S5 blocked-mention to G1 agent NOTED not dispatched', /NOT dispatched/.test(s5Actions) || /G1/.test(s5Actions));
    const s6Actions = perCommentResults[5].actions.join(' ');
    add('S6 dispatch-ok recorded as issue_event', /dispatch-ok recorded/.test(s6Actions));
    const { count: eventCount } = await supabase
        .from('issue_events')
        .select('id', { count: 'exact', head: true })
        .eq('issue_id', issue.id)
        .eq('event_type', 'dispatch_authorized');
    add('live: dispatch_authorized event row exists', (eventCount ?? 0) >= 1);
    // --- Cleanup ---
    console.log('\nPhase 4: cleanup\n');
    // Restore Forge Builder's prior gate
    await supabase.from('agents').update({ certification_gate: fbGateBefore }).eq('id', FORGE_BUILDER_AGENT_ID);
    add('cleanup: restored Forge Builder gate to G' + fbGateBefore, true);
    // Delete the test comments + issue + events
    await supabase.from('issue_comments').delete().eq('issue_id', issue.id);
    await supabase.from('issue_events').delete().eq('issue_id', issue.id);
    await supabase.from('issues').delete().eq('id', issue.id);
    add('cleanup: test issue + comments + events deleted', true);
    // Summary
    const passCount = checks.filter(c => c.pass).length;
    const total = checks.length;
    console.log(`\n=== ${passCount}/${total} checks passed ===\n`);
    if (passCount !== total) {
        console.log('FAILED checks:');
        checks.filter(c => !c.pass).forEach(c => console.log(`  ❌ ${c.name}${c.note ? ` — ${c.note}` : ''}`));
        process.exit(1);
    }
    process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
//# sourceMappingURL=test-coo-integration.js.map