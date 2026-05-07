/**
 * LiveAgentsGrid.test.tsx
 * FORGE-363 — TDD (RED -> GREEN)
 *
 * Acceptance criteria:
 * AC1: Renders with data-testid="live-agents-grid"
 * AC2: Filters out archived agents
 * AC3: Renders compact agent cards (name + status dot + last run result)
 * AC4: Does NOT render an 8-column <table> element
 * AC5: Shows empty state when no active agents
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import LiveAgentsGrid from '@/components/LiveAgentsGrid';

// Mock useRealtimeAgents hook — LiveAgentsGrid uses it for live updates
vi.mock('@/lib/hooks/use-realtime', () => ({
  useRealtimeAgents: (initial: unknown[]) => initial,
}));

const MOCK_AGENTS = [
  {
    id: 'agent-1',
    name: 'Spec Writer',
    status: 'idle',
    adapter_config: { cwd: '/home/agents/spec-writer' },
    last_heartbeat_at: null,
  },
  {
    id: 'agent-2',
    name: 'Factory Coder',
    status: 'running',
    adapter_config: { cwd: '/home/agents/coder' },
    last_heartbeat_at: new Date().toISOString(),
  },
  {
    id: 'agent-archived',
    name: 'Old Agent',
    status: 'archived',
    adapter_config: { cwd: '/home/agents/old' },
    last_heartbeat_at: null,
  },
];

const MOCK_RUNS: Record<string, { status: string; summary: string | null }> = {
  'agent-1': { status: 'succeeded', summary: 'Completed FORGE-362 spec' },
  'agent-2': { status: 'running', summary: null },
};

describe('LiveAgentsGrid — FORGE-363', () => {
  it('renders with data-testid="live-agents-grid"', () => {
    render(
      <LiveAgentsGrid
        initialAgents={MOCK_AGENTS}
        latestRunMap={MOCK_RUNS}
      />
    );
    expect(screen.getByTestId('live-agents-grid')).toBeInTheDocument();
  });

  it('does NOT render an 8-column table element', () => {
    render(
      <LiveAgentsGrid
        initialAgents={MOCK_AGENTS}
        latestRunMap={MOCK_RUNS}
      />
    );
    const tables = document.querySelectorAll('table');
    // No table at all, or table with fewer than 8 columns
    for (const table of Array.from(tables)) {
      const headerCells = table.querySelectorAll('thead th');
      expect(headerCells.length).toBeLessThan(8);
    }
  });

  it('filters out archived agents', () => {
    render(
      <LiveAgentsGrid
        initialAgents={MOCK_AGENTS}
        latestRunMap={MOCK_RUNS}
      />
    );
    expect(screen.queryByText('Old Agent')).not.toBeInTheDocument();
  });

  it('shows active agents by name', () => {
    render(
      <LiveAgentsGrid
        initialAgents={MOCK_AGENTS}
        latestRunMap={MOCK_RUNS}
      />
    );
    expect(screen.getByText('Spec Writer')).toBeInTheDocument();
    expect(screen.getByText('Factory Coder')).toBeInTheDocument();
  });

  it('shows empty state when no active agents', () => {
    render(
      <LiveAgentsGrid
        initialAgents={[]}
        latestRunMap={{}}
      />
    );
    expect(screen.getByText(/no active agents/i)).toBeInTheDocument();
  });
});
