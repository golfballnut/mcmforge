/**
 * InboxPanel.test.tsx
 * FORGE-363 — TDD (RED -> GREEN)
 *
 * Acceptance criteria:
 * AC1: Renders with data-testid="inbox-panel"
 * AC2: Shows 3 buckets: Failed Runs, Pending Approvals, High-Priority Issues
 * AC3: Empty state per bucket shows "All clear" message
 * AC4: Populated state shows items in each bucket
 * AC5: "View all" link on High-Priority Issues routes to /issues
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import InboxPanel from '@/components/InboxPanel';

describe('InboxPanel — FORGE-363', () => {
  it('renders with data-testid="inbox-panel"', () => {
    render(
      <InboxPanel
        failedRuns={[]}
        pendingApprovals={[]}
        highPriorityIssues={[]}
      />
    );
    expect(screen.getByTestId('inbox-panel')).toBeInTheDocument();
  });

  it('shows 3 bucket headings', () => {
    render(
      <InboxPanel
        failedRuns={[]}
        pendingApprovals={[]}
        highPriorityIssues={[]}
      />
    );
    expect(screen.getByText(/Failed Runs/i)).toBeInTheDocument();
    expect(screen.getByText(/Pending Approvals/i)).toBeInTheDocument();
    expect(screen.getByText(/High[- ]Priority Issues/i)).toBeInTheDocument();
  });

  it('shows empty state per bucket when no items', () => {
    render(
      <InboxPanel
        failedRuns={[]}
        pendingApprovals={[]}
        highPriorityIssues={[]}
      />
    );
    const allClear = screen.getAllByText(/All clear/i);
    expect(allClear.length).toBeGreaterThanOrEqual(3);
  });

  it('shows failed run items when populated', () => {
    const failedRuns = [
      { id: 'run-1', agentName: 'Spec Writer', status: 'failed', finishedAt: new Date().toISOString() },
    ];
    render(
      <InboxPanel
        failedRuns={failedRuns}
        pendingApprovals={[]}
        highPriorityIssues={[]}
      />
    );
    expect(screen.getByText('Spec Writer')).toBeInTheDocument();
  });

  it('shows pending approval items when populated', () => {
    const pendingApprovals = [
      { id: 'appr-1', title: 'Approve PR #99', createdAt: new Date().toISOString() },
    ];
    render(
      <InboxPanel
        failedRuns={[]}
        pendingApprovals={pendingApprovals}
        highPriorityIssues={[]}
      />
    );
    expect(screen.getByText('Approve PR #99')).toBeInTheDocument();
  });

  it('shows high-priority issues with view-all link to /issues', () => {
    const highPriorityIssues = [
      { id: 'issue-1', identifier: 'FORGE-363', title: 'Mission Control', status: 'in_progress' },
    ];
    render(
      <InboxPanel
        failedRuns={[]}
        pendingApprovals={[]}
        highPriorityIssues={highPriorityIssues}
      />
    );
    expect(screen.getByText('FORGE-363')).toBeInTheDocument();
    const viewAllLink = screen.getByRole('link', { name: /view all/i });
    expect(viewAllLink).toHaveAttribute('href', '/issues');
  });
});
