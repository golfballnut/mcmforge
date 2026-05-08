import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ActivityTimeline } from '../ActivityTimeline';
import type { TimelineEntry } from '@/lib/crm/types';

const entries: TimelineEntry[] = [
  {
    id: '1', company_id: 'co-1', contact_id: 'c-1', account_id: null, issue_id: null,
    kind: 'note', subject: 'Hi', body: 'Talked to Pam',
    actor_kind: 'human', actor_id: 'steve',
    occurred_at: '2026-05-07T01:00:00Z', source: 'explicit',
  },
  {
    id: '2', company_id: 'co-1', contact_id: 'c-1', account_id: null,
    issue_id: 'iss-1',
    kind: 'comment', subject: 'Issue title',
    body: 'agent posted',
    actor_kind: 'agent', actor_id: 'sonnet',
    occurred_at: '2026-05-07T00:00:00Z', source: 'derived_issue_event',
  },
];

describe('ActivityTimeline', () => {
  it('renders one row per entry', () => {
    render(<ActivityTimeline entries={entries} />);
    expect(screen.getByText('Hi')).toBeInTheDocument();
    expect(screen.getByText('Issue title')).toBeInTheDocument();
  });

  it('shows source badge for derived events', () => {
    render(<ActivityTimeline entries={entries} />);
    expect(screen.getByText(/from issue/i)).toBeInTheDocument();
  });

  it('shows empty state when entries is empty', () => {
    render(<ActivityTimeline entries={[]} />);
    expect(screen.getByText(/no activity/i)).toBeInTheDocument();
  });
});
