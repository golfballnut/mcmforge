import { describe, it, expect } from 'vitest';
import { isIdleText, isSubstantiveComment, IDLE_PATTERNS } from '../src/lib/idlePatterns.js';

describe('isIdleText', () => {
  it('matches "nothing to do" variants', () => {
    expect(isIdleText('nothing to do right now')).toBe(true);
    expect(isIdleText('There is Nothing To Do here')).toBe(true);
  });

  it('matches "awaiting review"', () => {
    expect(isIdleText('awaiting review from Steve')).toBe(true);
    expect(isIdleText('PR is Awaiting Review')).toBe(true);
  });

  it('matches "waiting for steve"', () => {
    expect(isIdleText('waiting for Steve to approve')).toBe(true);
  });

  it('matches "holding for"', () => {
    expect(isIdleText('holding for approval')).toBe(true);
  });

  it('matches "no new work" and "no pending work"', () => {
    expect(isIdleText('no new work in inbox')).toBe(true);
    expect(isIdleText('no pending work assigned')).toBe(true);
  });

  it('does not match real work summaries', () => {
    expect(isIdleText('Implemented the artifact collector service with 3 new files')).toBe(false);
    expect(isIdleText('Fixed the company routing bug. PR #36 open.')).toBe(false);
    expect(isIdleText('Fleet health OK — 8/8 checks passed.')).toBe(false);
  });

  it('does not match empty string', () => {
    expect(isIdleText('')).toBe(false);
  });
});

describe('isSubstantiveComment', () => {
  it('returns false for short comments even if not idle', () => {
    expect(isSubstantiveComment('Done.')).toBe(false);
    expect(isSubstantiveComment('OK')).toBe(false);
  });

  it('returns false for idle comments even if long', () => {
    const longIdle = 'nothing to do right now, just waiting for review from the team to move forward';
    expect(isSubstantiveComment(longIdle)).toBe(false);
  });

  it('returns true for a long, non-idle comment', () => {
    const real = 'Implemented the dedup guard in routine-scheduler.ts. Tests pass. Branch: agent/forge-routine-idempotency. PR #42 open.';
    expect(isSubstantiveComment(real)).toBe(true);
  });

  it('returns false for exactly 50 chars (threshold is > 50)', () => {
    const exactly50 = 'a'.repeat(50);
    expect(isSubstantiveComment(exactly50)).toBe(false);
  });

  it('returns true for 51 non-idle chars', () => {
    const fiftyone = 'Shipped the feature with full test coverage passing!';
    expect(fiftyone.length).toBeGreaterThan(50);
    expect(isSubstantiveComment(fiftyone)).toBe(true);
  });
});
