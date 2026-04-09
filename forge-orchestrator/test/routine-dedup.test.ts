import { describe, it, expect, vi, beforeEach } from 'vitest';
import { closeOpenPriorIssues } from '../src/loops/routine-scheduler.js';

/**
 * Unit tests for the routine dedup guard.
 *
 * These tests verify that closeOpenPriorIssues() cancels all open issues
 * with the same (companyId, title) before a new routine issue is created.
 * This prevents zombie issues stacking up when the same routine fires repeatedly.
 */

function makeSupabaseMock(matchedRows: { id: string }[]) {
  const selectMock = vi.fn().mockResolvedValue({ data: matchedRows, error: null });
  const inMock = vi.fn(() => ({ select: selectMock }));
  const eqTitle = vi.fn(() => ({ in: inMock }));
  const eqCompany = vi.fn(() => ({ eq: eqTitle }));
  const updateMock = vi.fn(() => ({ eq: eqCompany }));
  return {
    from: vi.fn(() => ({ update: updateMock })),
    _mocks: { updateMock, eqCompany, eqTitle, inMock, selectMock },
  };
}

describe('closeOpenPriorIssues', () => {
  it('returns 0 when no open issues exist', async () => {
    const supabase = makeSupabaseMock([]);
    const count = await closeOpenPriorIssues(supabase as any, 'company-1', 'Fleet Health: PM2 Status FAILED');
    expect(count).toBe(0);
  });

  it('returns the count of cancelled issues', async () => {
    const supabase = makeSupabaseMock([{ id: 'issue-a' }, { id: 'issue-b' }, { id: 'issue-c' }]);
    const count = await closeOpenPriorIssues(supabase as any, 'company-1', 'Fleet Health: PM2 Status FAILED');
    expect(count).toBe(3);
  });

  it('targets only todo and in_progress statuses', async () => {
    const supabase = makeSupabaseMock([{ id: 'issue-a' }]);
    await closeOpenPriorIssues(supabase as any, 'company-1', 'Hourly Factory Health Alert');
    const { inMock } = (supabase as any)._mocks;
    expect(inMock).toHaveBeenCalledWith('status', ['todo', 'in_progress']);
  });

  it('filters by the correct company and title', async () => {
    const supabase = makeSupabaseMock([]);
    await closeOpenPriorIssues(supabase as any, 'company-42', 'Fleet Health: Budget Check FAILED');
    const { eqCompany, eqTitle } = (supabase as any)._mocks;
    expect(eqCompany).toHaveBeenCalledWith('company_id', 'company-42');
    expect(eqTitle).toHaveBeenCalledWith('title', 'Fleet Health: Budget Check FAILED');
  });

  it('returns 0 and does not throw when supabase returns an error', async () => {
    const selectMock = vi.fn().mockResolvedValue({ data: null, error: { message: 'db error' } });
    const inMock = vi.fn(() => ({ select: selectMock }));
    const eqTitle = vi.fn(() => ({ in: inMock }));
    const eqCompany = vi.fn(() => ({ eq: eqTitle }));
    const updateMock = vi.fn(() => ({ eq: eqCompany }));
    const supabase = { from: vi.fn(() => ({ update: updateMock })) };

    const count = await closeOpenPriorIssues(supabase as any, 'company-1', 'Some Routine');
    expect(count).toBe(0);
  });
});
