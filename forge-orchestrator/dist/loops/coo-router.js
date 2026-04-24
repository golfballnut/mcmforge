import { logger } from '../utils/logger.js';
/**
 * COO Router — the deterministic rules engine enforcing the 8 Dummy-Proof Rules.
 *
 * Watches forge.issue_comments for meta-grammar tags and executes routing actions.
 * NOT an LLM. Every decision is rule-based, testable, and auditable.
 *
 * Meta-grammar (per vault/agents/skills/agent-comment-protocol.md):
 *   [GATE-PASSED N]   — CEO marks agent at gate N (0..5). Only CEO + Steve may post.
 *   [GATE-FAILED N]   — CEO drops agent from gate N back to N-1.
 *   [DISPATCH-OK]     — CEO authorizes a supervised dispatch on this issue.
 *   [APPROVED]        — Steve or CEO approves a [PROOF]; unlocks merge path.
 *   [PROOF] / **[PROOF — …** — validated against attachments; auto-reject if no upload.
 *   [BLOCKED] @agent  — handoff to mentioned agent; COO reassigns + triggers heartbeat.
 *
 * Every action the COO takes is logged AS A COMMENT so humans can audit the routing
 * decisions after the fact. Nothing silent.
 */
// Public for unit tests
export const TAG_PATTERNS = {
    gatePassed: /\[GATE-PASSED\s+(\d)\]/i,
    gateFailed: /\[GATE-FAILED\s+(\d)\]/i,
    dispatchOk: /\[DISPATCH-OK\]/i,
    approved: /\[APPROVED\]/i,
    proof: /\[PROOF(?:[\s\]]|—)/i,
    // Capture "@Name Word Word" where follow-on words must start with uppercase
    // (convention: agent names are TitleCase). Stops at first lowercase word, which
    // prevents "@Agent please fix" from swallowing "please fix" into the name.
    blockedAt: /\[BLOCKED\][^\n]*?@([A-Z][\w\-]*(?:\s+[A-Z][\w\-]+){0,3})/,
};
/**
 * Pure function: given a comment body, return the meta-tags detected.
 * Exported for unit testing.
 */
export function parseMetaTags(body) {
    const tags = [];
    const gp = body.match(TAG_PATTERNS.gatePassed);
    if (gp)
        tags.push({ type: 'gate_passed', gate: parseInt(gp[1], 10) });
    const gf = body.match(TAG_PATTERNS.gateFailed);
    if (gf)
        tags.push({ type: 'gate_failed', gate: parseInt(gf[1], 10) });
    if (TAG_PATTERNS.dispatchOk.test(body))
        tags.push({ type: 'dispatch_ok' });
    if (TAG_PATTERNS.approved.test(body))
        tags.push({ type: 'approved' });
    if (TAG_PATTERNS.proof.test(body))
        tags.push({ type: 'proof' });
    const bl = body.match(TAG_PATTERNS.blockedAt);
    if (bl)
        tags.push({ type: 'blocked_mention', agentName: bl[1].trim() });
    return tags;
}
/**
 * Rule 2 enforcement: [PROOF] comments must have ≥1 attachment from same author
 * on the same issue within the 10 minutes before the comment.
 */
export async function validateProofHasAttachment(supabase, comment) {
    const tenMinBefore = new Date(new Date(comment.created_at).getTime() - 10 * 60_000).toISOString();
    const query = supabase
        .from('issue_attachments')
        .select('id', { count: 'exact', head: true })
        .eq('issue_id', comment.issue_id)
        .gte('created_at', tenMinBefore)
        .lte('created_at', comment.created_at);
    if (comment.author_agent_id) {
        query.eq('uploaded_by_agent_id', comment.author_agent_id);
    }
    else if (comment.author_user_id) {
        query.eq('uploaded_by_user_id', comment.author_user_id);
    }
    const { count, error } = await query;
    if (error) {
        logger.warn({ err: error, commentId: comment.id }, 'COO: attachment count query failed');
        return { valid: true, attachmentCount: 0 }; // fail-open — don't block on query errors
    }
    return { valid: (count ?? 0) > 0, attachmentCount: count ?? 0 };
}
/**
 * Rule 1 enforcement helper: return the agent's current certification_gate.
 */
export async function getAgentGate(supabase, agentId) {
    const { data } = await supabase
        .from('agents')
        .select('certification_gate')
        .eq('id', agentId)
        .single();
    return data?.certification_gate ?? 0;
}
async function postCOOComment(supabase, companyId, issueId, body) {
    const { error } = await supabase.from('issue_comments').insert({
        company_id: companyId,
        issue_id: issueId,
        author_agent_id: null, // COO is a system actor, not an agent
        author_user_id: 'coo-router',
        body,
    });
    if (error)
        logger.warn({ err: error, body: body.slice(0, 80) }, 'COO: failed to post routing comment');
}
/**
 * Actions — executed when a tag is recognized. Each action returns a short
 * human-readable summary for the audit comment.
 */
export async function executeGatePassed(supabase, comment, newGate, cooConfig) {
    // Only CEO or Steve may promote
    const authorIsAuthorized = (comment.author_agent_id && cooConfig.ceoAgentIds.has(comment.author_agent_id)) ||
        (comment.author_user_id?.includes(cooConfig.stevenUserIdPrefix));
    if (!authorIsAuthorized) {
        return `gate-passed tag ignored — author not authorized to promote`;
    }
    // Find the target agent. Convention: the issue's assignee is being promoted,
    // OR the comment body includes "for <agent name>". Simple heuristic for v1: use the issue assignee.
    const { data: issue } = await supabase
        .from('issues')
        .select('assignee_agent_id')
        .eq('id', comment.issue_id)
        .single();
    if (!issue?.assignee_agent_id) {
        return `gate-passed tag ignored — issue has no assignee`;
    }
    const { data: agent } = await supabase
        .from('agents')
        .select('id, name, certification_gate')
        .eq('id', issue.assignee_agent_id)
        .single();
    if (!agent)
        return `gate-passed tag ignored — assignee agent not found`;
    // Safety: can only promote sequentially. G0→G1→G2 etc.
    if (newGate !== agent.certification_gate + 1) {
        return `gate-passed tag ignored — non-sequential promotion (agent ${agent.name} at G${agent.certification_gate}, tag claims G${newGate})`;
    }
    await supabase
        .from('agents')
        .update({ certification_gate: newGate, updated_at: new Date().toISOString() })
        .eq('id', agent.id);
    return `agent ${agent.name} promoted G${agent.certification_gate} → G${newGate}`;
}
export async function executeGateFailed(supabase, comment, failedGate, cooConfig) {
    const authorIsAuthorized = (comment.author_agent_id && cooConfig.ceoAgentIds.has(comment.author_agent_id)) ||
        (comment.author_user_id?.includes(cooConfig.stevenUserIdPrefix));
    if (!authorIsAuthorized)
        return `gate-failed tag ignored — author not authorized`;
    const { data: issue } = await supabase
        .from('issues')
        .select('assignee_agent_id')
        .eq('id', comment.issue_id)
        .single();
    if (!issue?.assignee_agent_id)
        return `gate-failed tag ignored — issue has no assignee`;
    const { data: agent } = await supabase
        .from('agents')
        .select('id, name, certification_gate')
        .eq('id', issue.assignee_agent_id)
        .single();
    if (!agent)
        return `gate-failed tag ignored — assignee agent not found`;
    const newGate = Math.max(0, failedGate - 1);
    await supabase
        .from('agents')
        .update({ certification_gate: newGate, updated_at: new Date().toISOString() })
        .eq('id', agent.id);
    return `agent ${agent.name} dropped G${agent.certification_gate} → G${newGate} (failed G${failedGate})`;
}
export async function executeBlockedMention(supabase, comment, mentionedAgentName) {
    // Find the mentioned agent (case-insensitive, same company)
    const { data: agents } = await supabase
        .from('agents')
        .select('id, name, status, certification_gate')
        .eq('company_id', comment.company_id);
    const target = agents?.find(a => a.name.toLowerCase() === mentionedAgentName.toLowerCase());
    if (!target)
        return `blocked-mention ignored — no agent named "${mentionedAgentName}" in this company`;
    // Rule: only dispatch agents at G3+. Below G3 = post but don't reassign (human must intervene).
    if (target.certification_gate < 3) {
        return `handoff to ${target.name} NOTED but NOT dispatched — agent at G${target.certification_gate}, needs G3+ for auto-dispatch`;
    }
    if (target.status === 'paused' || target.status === 'terminated') {
        return `handoff to ${target.name} NOTED but NOT dispatched — agent status is ${target.status}`;
    }
    // Reassign the issue and let the mention-watcher/heartbeat loop pick it up.
    await supabase
        .from('issues')
        .update({
        assignee_agent_id: target.id,
        status: 'todo',
        updated_at: new Date().toISOString(),
    })
        .eq('id', comment.issue_id);
    return `handoff: issue reassigned to ${target.name} (G${target.certification_gate}); next heartbeat will dispatch`;
}
export async function executeProofValidation(supabase, comment) {
    const { valid, attachmentCount } = await validateProofHasAttachment(supabase, comment);
    if (valid) {
        return `proof validated — ${attachmentCount} attachment(s) found within 10min window`;
    }
    return `**PROOF REJECTED** — no attachment uploaded by this author on this issue within 10min before the comment. Rule 2 of agent-comment-protocol.md requires ≥1 uploaded artifact per [PROOF]. Re-upload via POST /api/agent/issues/{id}/attachments and repost.`;
}
export async function executeDispatchOk(supabase, comment, cooConfig) {
    const authorIsAuthorized = (comment.author_agent_id && cooConfig.ceoAgentIds.has(comment.author_agent_id)) ||
        (comment.author_user_id?.includes(cooConfig.stevenUserIdPrefix));
    if (!authorIsAuthorized)
        return `dispatch-ok tag ignored — author not authorized`;
    // Record an issue_event so run-executor can check for permission.
    await supabase.from('issue_events').insert({
        issue_id: comment.issue_id,
        event_type: 'dispatch_authorized',
        actor_type: 'coo',
        actor_id: 'coo-router',
        metadata: { comment_id: comment.id },
    });
    return `dispatch-ok recorded — supervised dispatch authorized for this issue`;
}
export async function executeApproved(supabase, comment, cooConfig) {
    const authorIsAuthorized = (comment.author_agent_id && cooConfig.ceoAgentIds.has(comment.author_agent_id)) ||
        (comment.author_user_id?.includes(cooConfig.stevenUserIdPrefix));
    if (!authorIsAuthorized)
        return `approved tag ignored — author not authorized`;
    await supabase
        .from('issues')
        .update({ status: 'in_review', updated_at: new Date().toISOString() })
        .eq('id', comment.issue_id);
    await supabase.from('issue_events').insert({
        issue_id: comment.issue_id,
        event_type: 'approved',
        actor_type: comment.author_agent_id ? 'agent' : 'user',
        actor_id: comment.author_agent_id ?? comment.author_user_id ?? 'unknown',
        metadata: { comment_id: comment.id },
    });
    return `approval recorded — issue moved to in_review; merge allowed`;
}
/**
 * Single-comment evaluator. Exported for unit testing.
 */
export async function evaluateComment(supabase, comment, cooConfig) {
    const actions = [];
    const tags = parseMetaTags(comment.body);
    for (const tag of tags) {
        try {
            let summary = null;
            if (tag.type === 'gate_passed')
                summary = await executeGatePassed(supabase, comment, tag.gate, cooConfig);
            else if (tag.type === 'gate_failed')
                summary = await executeGateFailed(supabase, comment, tag.gate, cooConfig);
            else if (tag.type === 'dispatch_ok')
                summary = await executeDispatchOk(supabase, comment, cooConfig);
            else if (tag.type === 'approved')
                summary = await executeApproved(supabase, comment, cooConfig);
            else if (tag.type === 'proof')
                summary = await executeProofValidation(supabase, comment);
            else if (tag.type === 'blocked_mention')
                summary = await executeBlockedMention(supabase, comment, tag.agentName);
            if (summary)
                actions.push(summary);
        }
        catch (err) {
            logger.error({ err, tag, commentId: comment.id }, 'COO: action execution failed');
            actions.push(`action failed for tag ${tag.type}: ${err.message}`);
        }
    }
    return actions;
}
let lastCheckedAt = new Date().toISOString();
export async function tick(supabase, cooConfig) {
    const { data: newComments, error } = await supabase
        .from('issue_comments')
        .select('id, company_id, issue_id, body, author_agent_id, author_user_id, created_at')
        .gt('created_at', lastCheckedAt)
        .order('created_at', { ascending: true })
        .limit(50);
    if (error) {
        logger.warn({ err: error }, 'COO tick: comment fetch failed');
        return { commentsProcessed: 0, actionsTaken: 0 };
    }
    if (!newComments?.length) {
        lastCheckedAt = new Date().toISOString();
        return { commentsProcessed: 0, actionsTaken: 0 };
    }
    let actionsTaken = 0;
    for (const comment of newComments) {
        // Skip our own routing comments to avoid loops
        if (comment.author_user_id === 'coo-router')
            continue;
        const actions = await evaluateComment(supabase, comment, cooConfig);
        if (actions.length > 0) {
            actionsTaken += actions.length;
            const auditBody = [
                `**[COO]** routing actions taken on the comment above:`,
                ...actions.map((a, i) => `${i + 1}. ${a}`),
            ].join('\n');
            await postCOOComment(supabase, comment.company_id, comment.issue_id, auditBody);
            logger.info({ commentId: comment.id, actionCount: actions.length, actions }, 'COO actions');
        }
    }
    lastCheckedAt = new Date().toISOString();
    return { commentsProcessed: newComments.length, actionsTaken };
}
export async function startCOORouter(supabase, config) {
    // Seed the CEO agent ids from env or a convention.
    // For v1: CEO is any agent with name 'Forge COO' or 'CEO'.
    const { data: ceoAgents } = await supabase
        .from('agents')
        .select('id, name')
        .in('name', ['Forge COO', 'CEO', 'MCM Forge COO']);
    const cooConfig = {
        ceoAgentIds: new Set((ceoAgents ?? []).map(a => a.id)),
        stevenUserIdPrefix: 'steve',
    };
    logger.info({ ceoAgentCount: cooConfig.ceoAgentIds.size, interval: 30_000 }, 'COO router started');
    setInterval(async () => {
        try {
            const result = await tick(supabase, cooConfig);
            if (result.actionsTaken > 0) {
                logger.info(result, 'COO tick complete');
            }
        }
        catch (err) {
            logger.error({ err }, 'COO tick threw');
        }
    }, 30_000);
}
//# sourceMappingURL=coo-router.js.map