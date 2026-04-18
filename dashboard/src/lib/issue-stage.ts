/**
 * issue-stage.ts
 * FORGE-252 — Workflow stage derivation (pure function, no DB)
 *
 * Stage is NEVER stored. Always re-derived at render time from
 * comments + PR state + issue status.
 *
 * COO revisions (2026-04-17):
 *   - blocked: /^# ❌ REJECTED/m — canonical COO header only, no false positives
 *   - issueStatus param: 'done' | 'completed' also fires shipped
 */

export type WorkflowStage =
  | 'filed'
  | 'planning'
  | 'plan_review'
  | 'executing'
  | 'proof_review'
  | 'shipped'
  | 'blocked';

export interface StageConfig {
  label: string;
  /** Tailwind classes for the pill background + text */
  color: string;
}

export const STAGE_CONFIG: Record<WorkflowStage, StageConfig> = {
  filed:        { label: 'Filed',        color: 'bg-[#21262d] text-[#8b949e]' },
  planning:     { label: 'Planning',     color: 'bg-[#1f3358] text-[#58a6ff]' },
  plan_review:  { label: 'Plan Review',  color: 'bg-[#3a2f00] text-[#d29922]' },
  executing:    { label: 'Executing',    color: 'bg-[#0f2d1f] text-[#3fb950]' },
  proof_review: { label: 'Proof Review', color: 'bg-[#2b1f5c] text-[#a371f7]' },
  shipped:      { label: 'Shipped',      color: 'bg-[#0f2d1f] text-[#3fb950] font-semibold' },
  blocked:      { label: 'Blocked',      color: 'bg-[#3d1f1f] text-[#f85149]' },
};

/**
 * Derive the workflow stage for an issue.
 *
 * Priority order (highest wins):
 *   shipped > blocked > proof_review > executing > plan_review > planning > filed
 *
 * @param comments    - Comment objects (only `body` is inspected)
 * @param prUrl       - PR URL attached to this issue (null if none)
 * @param prMerged    - Whether the PR has been merged
 * @param issueStatus - Issue status string from DB (e.g. 'done', 'completed')
 */
export function deriveStage(
  comments: Array<{ body: string }>,
  prUrl: string | null,
  prMerged: boolean,
  issueStatus: string | null
): WorkflowStage {
  const bodies = comments.map((c) => c.body);

  // shipped — PR merged OR issue status is terminal
  if (prMerged || issueStatus === 'done' || issueStatus === 'completed') {
    return 'shipped';
  }

  // blocked — canonical COO rejection header only: "# ❌ REJECTED" at line start
  const hasRejected = bodies.some((b) => /^# ❌ REJECTED/m.test(b));
  if (hasRejected) return 'blocked';

  // proof_review — PR open (exists, not merged)
  if (prUrl !== null) return 'proof_review';

  // executing — APPROVED comment (case-sensitive) and no PR yet
  const hasApproved = bodies.some((b) => b.includes('APPROVED'));
  if (hasApproved) return 'executing';

  // plan_review — a comment has a Plan heading
  const hasPlan = bodies.some((b) => /^#{1,2} Plan/m.test(b));
  if (hasPlan) return 'plan_review';

  // planning — comment mentions Phase 0.9 or "planning"
  const hasPlanning = bodies.some((b) => /planning|phase 0\.9/i.test(b));
  if (hasPlanning) return 'planning';

  // filed — nothing above matched
  return 'filed';
}
