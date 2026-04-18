/**
 * issues-list.test.tsx
 * FORGE-251 — TDD (RED -> GREEN)
 * Tests: identifier visible on rows, comment count, attachment count,
 *        search by identifier, mobile responsive class, link hrefs.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import IssuesClient from '@/app/issues/IssuesClient';

// Mock the realtime hook — return initialIssues as-is (no Supabase in tests)
vi.mock('@/lib/hooks/use-realtime', () => ({
  useRealtimeIssues: (initial: unknown[]) => initial,
}));

const MOCK_ISSUES = [
  {
    id: 'uuid-001',
    identifier: 'DIRA-196',
    title: 'Trail labels are wrong',
    description: null,
    status: 'todo',
    priority: 'high',
    assignee_agent_id: null,
    company_id: 'company-1',
    project_id: null,
    origin_kind: null,
    created_at: new Date(Date.now() - 60_000).toISOString(),
    completed_at: null,
    agent_name: null,
    agent_skills: null,
    comment_count: 3,
    attachment_count: 2,
  },
  {
    id: 'uuid-002',
    identifier: 'FORGE-251',
    title: 'Issue identifier counts',
    description: null,
    status: 'in_progress',
    priority: 'critical',
    assignee_agent_id: null,
    company_id: 'company-1',
    project_id: null,
    origin_kind: null,
    created_at: new Date(Date.now() - 3_600_000).toISOString(),
    completed_at: null,
    agent_name: null,
    agent_skills: null,
    comment_count: 0,
    attachment_count: 0,
  },
  {
    id: 'uuid-003',
    identifier: null,
    title: 'Issue with no identifier',
    description: null,
    status: 'backlog',
    priority: 'low',
    assignee_agent_id: null,
    company_id: 'company-1',
    project_id: null,
    origin_kind: null,
    created_at: new Date(Date.now() - 7_200_000).toISOString(),
    completed_at: null,
    agent_name: null,
    agent_skills: null,
    comment_count: 0,
    attachment_count: 0,
  },
];

describe('IssuesClient — list row rendering (FORGE-251)', () => {
  beforeEach(() => {
    render(<IssuesClient initialIssues={MOCK_ISSUES} />);
  });

  it('AC1: shows identifier on every row that has one', () => {
    // identifier should appear at least once in the document for each issue
    expect(screen.getAllByText('DIRA-196').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('FORGE-251').length).toBeGreaterThanOrEqual(1);
  });

  it('AC1: row link href uses identifier when available', () => {
    // Link for uuid-001 should use DIRA-196 slug
    const links = document.querySelectorAll('a[href*="DIRA-196"]');
    expect(links.length).toBeGreaterThanOrEqual(1);
  });

  it('AC1: row link href falls back to UUID when no identifier', () => {
    const links = document.querySelectorAll('a[href*="uuid-003"]');
    expect(links.length).toBeGreaterThanOrEqual(1);
  });

  it('AC2: shows comment count of 3 on the DIRA-196 row', () => {
    const row = screen.getByText('Trail labels are wrong').closest('a');
    expect(row).toBeTruthy();
    // Row textContent must contain "3" (the comment count)
    expect(row!.textContent).toContain('3');
  });

  it('AC2: shows comment count of 0 on zero-count row (not absent)', () => {
    const row = screen.getByText('Issue identifier counts').closest('a');
    expect(row).toBeTruthy();
    // Count must be present even when 0
    expect(row!.textContent).toContain('0');
  });

  it('AC3: shows attachment count of 2 on the DIRA-196 row', () => {
    const row = screen.getByText('Trail labels are wrong').closest('a');
    expect(row).toBeTruthy();
    expect(row!.textContent).toContain('2');
  });

  it('AC5: search by identifier prefix filters to matching rows only', async () => {
    const user = userEvent.setup();
    const input = screen.getByPlaceholderText('Search issues...');
    await user.type(input, 'DIRA');
    expect(screen.getByText('Trail labels are wrong')).toBeTruthy();
    expect(screen.queryByText('Issue identifier counts')).toBeNull();
  });

  it('AC5: search by partial number matches identifier', async () => {
    const user = userEvent.setup();
    const input = screen.getByPlaceholderText('Search issues...');
    await user.type(input, '196');
    expect(screen.getByText('Trail labels are wrong')).toBeTruthy();
    expect(screen.queryByText('Issue identifier counts')).toBeNull();
  });

  it('AC5: search by full identifier is exact match', async () => {
    const user = userEvent.setup();
    const input = screen.getByPlaceholderText('Search issues...');
    await user.type(input, 'DIRA-196');
    expect(screen.getByText('Trail labels are wrong')).toBeTruthy();
    expect(screen.queryByText('Issue identifier counts')).toBeNull();
  });
});

describe('IssuesClient — mobile viewport responsive classes (FORGE-251)', () => {
  it('AC5-mobile: grid rows have the 2-column mobile breakpoint class (no fixed 120px ID col on small screens)', () => {
    const { container } = render(<IssuesClient initialIssues={MOCK_ISSUES} />);
    // jsdom doesn't support bracket notation in CSS attr selectors.
    // Walk the DOM manually to find elements whose class contains the mobile grid token.
    const allElements = Array.from(container.querySelectorAll('*'));
    const hasMobileGrid = allElements.some(
      (el) => el.className && typeof el.className === 'string' && el.className.includes('grid-cols-[1fr_')
    );
    expect(hasMobileGrid).toBe(true);
  });
});

// ─── FORGE-252 tests ──────────────────────────────────────────────────────────

// Mock issues with stage_comments for stage derivation
const MOCK_ISSUES_WITH_STAGES = [
  {
    id: 'uuid-101',
    identifier: 'FORGE-252',
    title: 'Card view feature',
    description: null,
    status: 'in_progress',
    priority: 'high',
    assignee_agent_id: null,
    company_id: 'company-1',
    project_id: null,
    origin_kind: null,
    created_at: new Date(Date.now() - 60_000).toISOString(),
    completed_at: null,
    agent_name: 'swift-coder',
    agent_skills: null,
    comment_count: 2,
    attachment_count: 0,
    stage_comments: [{ body: 'APPROVED — go ahead' }],
    pr_url: null,
  },
  {
    id: 'uuid-102',
    identifier: 'FORGE-100',
    title: 'Shipped feature',
    description: null,
    status: 'done',
    priority: 'medium',
    assignee_agent_id: null,
    company_id: 'company-1',
    project_id: null,
    origin_kind: null,
    created_at: new Date(Date.now() - 7_200_000).toISOString(),
    completed_at: null,
    agent_name: null,
    agent_skills: null,
    comment_count: 5,
    attachment_count: 1,
    stage_comments: [],
    pr_url: null,
  },
  {
    id: 'uuid-103',
    identifier: 'FORGE-099',
    title: 'Blocked issue',
    description: null,
    status: 'in_progress',
    priority: 'critical',
    assignee_agent_id: null,
    company_id: 'company-1',
    project_id: null,
    origin_kind: null,
    created_at: new Date(Date.now() - 3_600_000).toISOString(),
    completed_at: null,
    agent_name: null,
    agent_skills: null,
    comment_count: 1,
    attachment_count: 0,
    stage_comments: [{ body: '# ❌ REJECTED\nNeeds rework' }],
    pr_url: null,
  },
];

describe('IssuesClient — view toggle (FORGE-252)', () => {
  it('renders a list-view toggle button', () => {
    const { container } = render(<IssuesClient initialIssues={MOCK_ISSUES_WITH_STAGES} />);
    const listBtn = container.querySelector('button[aria-label="List view"]');
    expect(listBtn).toBeTruthy();
  });

  it('renders a card-view toggle button', () => {
    const { container } = render(<IssuesClient initialIssues={MOCK_ISSUES_WITH_STAGES} />);
    const cardBtn = container.querySelector('button[aria-label="Card view"]');
    expect(cardBtn).toBeTruthy();
  });

  it('switches to card layout when card button is clicked', async () => {
    const user = userEvent.setup();
    const { container } = render(<IssuesClient initialIssues={MOCK_ISSUES_WITH_STAGES} />);
    // Switch to All tab first so done-status issues are visible
    await user.click(screen.getByText('All'));
    const cardBtn = container.querySelector('button[aria-label="Card view"]') as HTMLElement;
    await user.click(cardBtn);
    const cards = container.querySelectorAll('[data-testid="issue-card"]');
    expect(cards.length).toBe(MOCK_ISSUES_WITH_STAGES.length);
  });

  it('switches back to list layout when list button is clicked', async () => {
    const user = userEvent.setup();
    const { container } = render(<IssuesClient initialIssues={MOCK_ISSUES_WITH_STAGES} />);
    const cardBtn = container.querySelector('button[aria-label="Card view"]') as HTMLElement;
    const listBtn = container.querySelector('button[aria-label="List view"]') as HTMLElement;
    await user.click(cardBtn);
    await user.click(listBtn);
    const cards = container.querySelectorAll('[data-testid="issue-card"]');
    expect(cards.length).toBe(0);
  });

  it('persists card selection to localStorage', async () => {
    const user = userEvent.setup();
    const { container } = render(<IssuesClient initialIssues={MOCK_ISSUES_WITH_STAGES} />);
    const cardBtn = container.querySelector('button[aria-label="Card view"]') as HTMLElement;
    await user.click(cardBtn);
    expect(localStorage.getItem('forge_issues_view_mode')).toBe('card');
  });

  it('persists list selection to localStorage', async () => {
    const user = userEvent.setup();
    const { container } = render(<IssuesClient initialIssues={MOCK_ISSUES_WITH_STAGES} />);
    const cardBtn = container.querySelector('button[aria-label="Card view"]') as HTMLElement;
    const listBtn = container.querySelector('button[aria-label="List view"]') as HTMLElement;
    await user.click(cardBtn);
    await user.click(listBtn);
    expect(localStorage.getItem('forge_issues_view_mode')).toBe('list');
  });
});

describe('IssuesClient — stage pills on list rows (FORGE-252)', () => {
  it('shows "Executing" stage pill for the APPROVED issue', () => {
    render(<IssuesClient initialIssues={MOCK_ISSUES_WITH_STAGES} />);
    expect(screen.getAllByText('Executing').length).toBeGreaterThanOrEqual(1);
  });

  it('shows "Shipped" stage pill for the done-status issue (switch to All tab)', async () => {
    const user = userEvent.setup();
    render(<IssuesClient initialIssues={MOCK_ISSUES_WITH_STAGES} />);
    // done-status issues are in "closed" — switch to All tab to see them
    await user.click(screen.getByText('All'));
    expect(screen.getAllByText('Shipped').length).toBeGreaterThanOrEqual(1);
  });

  it('shows "Blocked" stage pill for the REJECTED issue', () => {
    render(<IssuesClient initialIssues={MOCK_ISSUES_WITH_STAGES} />);
    expect(screen.getAllByText('Blocked').length).toBeGreaterThanOrEqual(1);
  });
});

describe('IssuesClient — card layout (FORGE-252)', () => {
  it('card grid has grid-cols-1 base class (mobile single column)', async () => {
    const user = userEvent.setup();
    const { container } = render(<IssuesClient initialIssues={MOCK_ISSUES_WITH_STAGES} />);
    const cardBtn = container.querySelector('button[aria-label="Card view"]') as HTMLElement;
    await user.click(cardBtn);
    const grid = container.querySelector('[class*="grid-cols-1"]');
    expect(grid).toBeTruthy();
  });

  it('card grid has sm:grid-cols-2 tablet breakpoint class', async () => {
    const user = userEvent.setup();
    const { container } = render(<IssuesClient initialIssues={MOCK_ISSUES_WITH_STAGES} />);
    const cardBtn = container.querySelector('button[aria-label="Card view"]') as HTMLElement;
    await user.click(cardBtn);
    const allEls = Array.from(container.querySelectorAll('*'));
    const hasTablet = allEls.some(
      (el) => el.className && typeof el.className === 'string' && el.className.includes('sm:grid-cols-2')
    );
    expect(hasTablet).toBe(true);
  });

  it('each card shows identifier', async () => {
    const user = userEvent.setup();
    const { container } = render(<IssuesClient initialIssues={MOCK_ISSUES_WITH_STAGES} />);
    const cardBtn = container.querySelector('button[aria-label="Card view"]') as HTMLElement;
    await user.click(cardBtn);
    expect(screen.getAllByText('FORGE-252').length).toBeGreaterThanOrEqual(1);
  });

  it('card view shows stage pills on cards', async () => {
    const user = userEvent.setup();
    const { container } = render(<IssuesClient initialIssues={MOCK_ISSUES_WITH_STAGES} />);
    // Switch to All tab so done-status issues are visible
    await user.click(screen.getByText('All'));
    const cardBtn = container.querySelector('button[aria-label="Card view"]') as HTMLElement;
    await user.click(cardBtn);
    // All three stages should be visible on the cards
    expect(screen.getAllByText('Executing').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Shipped').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Blocked').length).toBeGreaterThanOrEqual(1);
  });
});
