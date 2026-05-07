import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

/**
 * FORGE-363: Dashboard Mission Control simplification.
 *
 * Validates (on authenticated sessions):
 * 1. StandupCard still at top (not regressed)
 * 2. InboxPanel (data-testid="inbox-panel") present below standup
 * 3. LiveAgentsGrid (data-testid="live-agents-grid") present below inbox, no 8-col table
 * 4. Agent Performance table removed from /
 * 5. Knowledge Health stat removed from /
 * 6. Sidebar Agents group collapse/expand with localStorage persistence
 * 7. No console errors
 * 8. Screenshot saved
 *
 * Auth: home page is auth-gated. Tests skip gracefully if not authenticated.
 */

const SCREENSHOT_DIR = path.join(__dirname, '..', 'test-results');

function isAuthGate(url: string): boolean {
  return url.includes('/login') || url.includes('/auth') || url.includes('/sign-in');
}

test.describe('FORGE-363 — Mission Control home', () => {
  test('home page: structure correct (standup → inbox → agents grid)', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => {
      consoleErrors.push(`pageerror: ${err.message}`);
    });

    const response = await page.goto('/', { waitUntil: 'domcontentloaded' });
    expect(response, 'No response from /').not.toBeNull();
    expect(response!.status(), 'Unexpected HTTP error on /').toBeLessThan(500);

    // Ensure screenshot directory exists
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

    // Save screenshot regardless of auth state
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'mission-control-home.png'),
      fullPage: true,
    });

    // If redirected to login, bail gracefully — auth not set up in this run
    if (isAuthGate(page.url())) {
      console.log('Auth gate detected — skipping authenticated assertions');
      return;
    }

    // Assert StandupCard visible at top
    const standupCard = page.locator('[data-testid="standup-card"]');
    await expect(standupCard).toBeVisible({ timeout: 10_000 });

    // Assert InboxPanel present below standup
    const inboxPanel = page.locator('[data-testid="inbox-panel"]');
    await expect(inboxPanel).toBeVisible({ timeout: 10_000 });

    // Assert 3 buckets visible inside InboxPanel
    await expect(inboxPanel.getByText(/Failed Runs/i)).toBeVisible();
    await expect(inboxPanel.getByText(/Pending Approvals/i)).toBeVisible();
    await expect(inboxPanel.getByText(/High[- ]Priority Issues/i)).toBeVisible();

    // Assert LiveAgentsGrid present below InboxPanel
    const liveGrid = page.locator('[data-testid="live-agents-grid"]');
    await expect(liveGrid).toBeVisible({ timeout: 10_000 });

    // Assert NO 8-column table in LiveAgentsGrid
    const tables = liveGrid.locator('table');
    const tableCount = await tables.count();
    for (let i = 0; i < tableCount; i++) {
      const headerCells = await tables.nth(i).locator('thead th').count();
      expect(headerCells, 'LiveAgentsGrid must not have an 8-column table').toBeLessThan(8);
    }

    // Assert Agent Performance table NOT visible on /
    const agentPerfCount = await page.locator('text=Agent Performance').count();
    expect(agentPerfCount, 'Agent Performance table must not appear on home page').toBe(0);

    // Assert Knowledge Health stat card NOT visible on /
    const knowledgeHealthStat = page.locator('[data-testid="knowledge-health-stat"]');
    await expect(knowledgeHealthStat).toHaveCount(0);

    // Filter console errors — ignore known non-blocking noise
    const blockers = consoleErrors.filter(
      (e) =>
        !e.includes('Failed to load resource') &&
        !e.includes('Download the React DevTools') &&
        !e.includes('Hydration') &&
        !e.includes('next-flight') &&
        !e.includes('Fast Refresh') &&
        !e.includes('Warning:'),
    );
    expect(blockers, `Unexpected console errors:\n${blockers.join('\n')}`).toEqual([]);
  });

  test('sidebar: Agents group label is interactive', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    if (isAuthGate(page.url())) {
      console.log('Auth gate detected — skipping sidebar assertions');
      return;
    }

    // Wait for sidebar to render
    const agentsGroupLabel = page.locator('[data-testid="sidebar-agents-group-label"]');
    await expect(agentsGroupLabel).toBeVisible({ timeout: 10_000 });

    // Default state: collapsed (per spec)
    const agentsList = page.locator('[data-testid="sidebar-agents-list"]');
    await expect(agentsList).toBeHidden();

    // Click to expand
    await agentsGroupLabel.click();
    await expect(agentsList).toBeVisible();

    // Click to collapse
    await agentsGroupLabel.click();
    await expect(agentsList).toBeHidden();
  });

  test('sidebar: collapse state persists across page reloads (localStorage)', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    if (isAuthGate(page.url())) {
      console.log('Auth gate detected — skipping localStorage persistence assertions');
      return;
    }

    const agentsGroupLabel = page.locator('[data-testid="sidebar-agents-group-label"]');
    await expect(agentsGroupLabel).toBeVisible({ timeout: 10_000 });

    // Expand agents list (default is collapsed)
    await agentsGroupLabel.click();
    const agentsList = page.locator('[data-testid="sidebar-agents-list"]');
    await expect(agentsList).toBeVisible();

    // Reload page
    await page.reload({ waitUntil: 'domcontentloaded' });

    if (isAuthGate(page.url())) {
      console.log('Auth gate after reload — skipping persistence check');
      return;
    }

    // Agents list should still be visible (localStorage persisted expanded state)
    await expect(page.locator('[data-testid="sidebar-agents-group-label"]')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('[data-testid="sidebar-agents-list"]')).toBeVisible();
  });
});
