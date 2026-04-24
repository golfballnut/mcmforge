import { SupabaseClient } from '@supabase/supabase-js';
import { ForgeConfig } from '../config.js';
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
export declare const TAG_PATTERNS: {
    gatePassed: RegExp;
    gateFailed: RegExp;
    dispatchOk: RegExp;
    approved: RegExp;
    proof: RegExp;
    blockedAt: RegExp;
};
export interface COOConfig {
    ceoAgentIds: Set<string>;
    stevenUserIdPrefix: string;
}
export type ParsedTag = {
    type: 'gate_passed';
    gate: number;
} | {
    type: 'gate_failed';
    gate: number;
} | {
    type: 'dispatch_ok';
} | {
    type: 'approved';
} | {
    type: 'proof';
} | {
    type: 'blocked_mention';
    agentName: string;
};
/**
 * Pure function: given a comment body, return the meta-tags detected.
 * Exported for unit testing.
 */
export declare function parseMetaTags(body: string): ParsedTag[];
interface CommentRow {
    id: string;
    company_id: string;
    issue_id: string;
    body: string;
    author_agent_id: string | null;
    author_user_id: string | null;
    created_at: string;
}
/**
 * Rule 2 enforcement: [PROOF] comments must have ≥1 attachment from same author
 * on the same issue within the 10 minutes before the comment.
 */
export declare function validateProofHasAttachment(supabase: SupabaseClient, comment: CommentRow): Promise<{
    valid: boolean;
    attachmentCount: number;
}>;
/**
 * Rule 1 enforcement helper: return the agent's current certification_gate.
 */
export declare function getAgentGate(supabase: SupabaseClient, agentId: string): Promise<number>;
/**
 * Actions — executed when a tag is recognized. Each action returns a short
 * human-readable summary for the audit comment.
 */
export declare function executeGatePassed(supabase: SupabaseClient, comment: CommentRow, newGate: number, cooConfig: COOConfig): Promise<string | null>;
export declare function executeGateFailed(supabase: SupabaseClient, comment: CommentRow, failedGate: number, cooConfig: COOConfig): Promise<string | null>;
export declare function executeBlockedMention(supabase: SupabaseClient, comment: CommentRow, mentionedAgentName: string): Promise<string | null>;
export declare function executeProofValidation(supabase: SupabaseClient, comment: CommentRow): Promise<string | null>;
export declare function executeDispatchOk(supabase: SupabaseClient, comment: CommentRow, cooConfig: COOConfig): Promise<string | null>;
export declare function executeApproved(supabase: SupabaseClient, comment: CommentRow, cooConfig: COOConfig): Promise<string | null>;
/**
 * Single-comment evaluator. Exported for unit testing.
 */
export declare function evaluateComment(supabase: SupabaseClient, comment: CommentRow, cooConfig: COOConfig): Promise<string[]>;
export declare function tick(supabase: SupabaseClient, cooConfig: COOConfig): Promise<{
    commentsProcessed: number;
    actionsTaken: number;
}>;
export declare function startCOORouter(supabase: SupabaseClient, config: ForgeConfig): Promise<void>;
export {};
//# sourceMappingURL=coo-router.d.ts.map