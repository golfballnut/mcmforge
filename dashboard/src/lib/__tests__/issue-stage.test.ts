/**
 * issue-stage.test.ts
 * FORGE-252 — TDD RED phase
 * Tests: all 7 stage derivations for deriveStage()
 * COO revisions applied:
 *   - blocked uses /^# ❌ REJECTED/m (canonical COO header only)
 *   - issueStatus param: 'done' | 'completed' triggers shipped
 */

import { describe, it, expect } from 'vitest';
import { deriveStage, STAGE_CONFIG } from '../issue-stage';

// Helper to create comment arrays
function comments(bodies: string[]) {
  return bodies.map((body) => ({ body }));
}

describe('deriveStage() — filed', () => {
  it('returns filed when no comments, no PR, no terminal status', () => {
    expect(deriveStage(comments([]), null, false, 'todo')).toBe('filed');
  });

  it('returns filed when only irrelevant comments exist', () => {
    expect(deriveStage(comments(['Nice issue', 'Looking at this']), null, false, 'backlog')).toBe('filed');
  });

  it('returns filed when issueStatus is null and nothing else matches', () => {
    expect(deriveStage(comments([]), null, false, null)).toBe('filed');
  });
});

describe('deriveStage() — planning', () => {
  it('returns planning when a comment mentions Phase 0.9', () => {
    expect(deriveStage(comments(['Starting Phase 0.9 now']), null, false, 'todo')).toBe('planning');
  });

  it('returns planning when a comment contains "planning" (case-insensitive)', () => {
    expect(deriveStage(comments(['Currently Planning the approach']), null, false, 'todo')).toBe('planning');
  });
});

describe('deriveStage() — plan_review', () => {
  it('returns plan_review when a comment has ## Plan heading', () => {
    expect(
      deriveStage(comments(['## Plan\nStep 1: do the thing']), null, false, 'todo')
    ).toBe('plan_review');
  });

  it('returns plan_review for # Plan heading too', () => {
    expect(
      deriveStage(comments(['# Plan\nHere is the approach']), null, false, 'todo')
    ).toBe('plan_review');
  });

  it('does NOT return plan_review when APPROVED also present (executing wins)', () => {
    expect(
      deriveStage(comments(['## Plan\nsteps', 'APPROVED — go ahead']), null, false, 'in_progress')
    ).toBe('executing');
  });
});

describe('deriveStage() — executing', () => {
  it('returns executing when APPROVED comment exists and no PR', () => {
    expect(deriveStage(comments(['APPROVED — begin TDD']), null, false, 'in_progress')).toBe('executing');
  });

  it('APPROVED must be case-sensitive — "approved" lowercase does not trigger', () => {
    expect(deriveStage(comments(['approved by someone']), null, false, 'in_progress')).not.toBe('executing');
  });
});

describe('deriveStage() — proof_review', () => {
  it('returns proof_review when PR URL exists and not merged', () => {
    expect(
      deriveStage(comments(['APPROVED']), 'https://github.com/org/repo/pull/42', false, 'in_progress')
    ).toBe('proof_review');
  });

  it('returns proof_review even without APPROVED if PR is open', () => {
    expect(
      deriveStage(comments([]), 'https://github.com/org/repo/pull/99', false, 'in_review')
    ).toBe('proof_review');
  });
});

describe('deriveStage() — shipped', () => {
  it('returns shipped when prMerged is true', () => {
    expect(
      deriveStage(comments(['APPROVED']), 'https://github.com/org/repo/pull/42', true, 'in_progress')
    ).toBe('shipped');
  });

  it('returns shipped when issueStatus is "done"', () => {
    expect(deriveStage(comments([]), null, false, 'done')).toBe('shipped');
  });

  it('returns shipped when issueStatus is "completed"', () => {
    expect(deriveStage(comments([]), null, false, 'completed')).toBe('shipped');
  });

  it('shipped wins over blocked when prMerged is true', () => {
    expect(
      deriveStage(
        comments(['# ❌ REJECTED\nRedo the thing']),
        'https://github.com/org/repo/pull/42',
        true,
        'done'
      )
    ).toBe('shipped');
  });

  it('shipped fires on status=done even with REJECTED comment', () => {
    expect(
      deriveStage(comments(['# ❌ REJECTED\nNeeds rework']), null, false, 'done')
    ).toBe('shipped');
  });
});

describe('deriveStage() — blocked', () => {
  it('returns blocked when a comment starts with canonical # ❌ REJECTED header', () => {
    expect(deriveStage(comments(['# ❌ REJECTED\nWrong approach']), null, false, 'in_progress')).toBe('blocked');
  });

  it('does NOT return blocked for lowercase "blocked" in comment text (false positive prevention)', () => {
    // Plan text saying "this task is blocked by X" should not trigger blocked stage
    expect(deriveStage(comments(['this task is blocked by the infra work']), null, false, 'in_progress')).not.toBe('blocked');
  });

  it('does NOT return blocked for "REJECTED" mid-sentence (must be line-start header)', () => {
    // Only matches when # ❌ REJECTED starts a line
    expect(deriveStage(comments(['plan was REJECTED by COO']), null, false, 'in_progress')).not.toBe('blocked');
  });

  it('blocked wins over executing (no PR scenario)', () => {
    expect(deriveStage(comments(['APPROVED', '# ❌ REJECTED\nredo']), null, false, 'in_progress')).toBe('blocked');
  });

  it('blocked loses to shipped (status=done overrides)', () => {
    expect(deriveStage(comments(['# ❌ REJECTED\nredo']), null, false, 'done')).toBe('shipped');
  });
});

describe('STAGE_CONFIG', () => {
  const STAGES = ['filed', 'planning', 'plan_review', 'executing', 'proof_review', 'shipped', 'blocked'] as const;

  it('has an entry for every stage', () => {
    for (const stage of STAGES) {
      expect(STAGE_CONFIG[stage]).toBeDefined();
    }
  });

  it('every entry has a non-empty label and color string', () => {
    for (const stage of STAGES) {
      expect(typeof STAGE_CONFIG[stage].label).toBe('string');
      expect(STAGE_CONFIG[stage].label.length).toBeGreaterThan(0);
      expect(typeof STAGE_CONFIG[stage].color).toBe('string');
      expect(STAGE_CONFIG[stage].color.length).toBeGreaterThan(0);
    }
  });
});
