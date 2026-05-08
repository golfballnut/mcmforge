import { test, expect } from '@playwright/test';

// Universal smoke gate for the loop. Every Ralph cycle that touches the dashboard
// (or anything the dashboard reads — schema changes, ETL, etc.) runs this before push.
//
// What it covers:
// - Each protected page navigates and renders SOMETHING (auth gate counts as "rendered")
// - Zero unexpected console errors
// - Story-specific specs handle authenticated assertions separately
//
// What it does NOT cover (those go in story-specific *.spec.ts):
// - Specific issue counts (ETL stories add their own DirtSync count assertions)
// - Authenticated views — those need the auth flow which we set up per story
// - Visual diffs against a baseline (Visual Critic uses screenshots from /test-results)

const PAGES = [
  { path: '/issues',         label: 'issues' },
  { path: '/runs',           label: 'runs' },
  { path: '/agents',         label: 'agents' },
  { path: '/crm',            label: 'crm-landing' },
  { path: '/crm/contacts',   label: 'crm-contacts' },
  { path: '/crm/accounts',   label: 'crm-accounts' },
  { path: '/crm/activities', label: 'crm-activities' },
  { path: '/crm/search',     label: 'crm-search' },
];

for (const { path, label } of PAGES) {
  test(`smoke: ${label} page navigates without errors`, async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => {
      consoleErrors.push(`pageerror: ${err.message}`);
    });

    // domcontentloaded — don't wait for networkidle (Supabase realtime polling
    // can keep the connection warm indefinitely on dev mode).
    const response = await page.goto(path, { waitUntil: 'domcontentloaded' });
    expect(response, `no response for ${path}`).not.toBeNull();
    expect(response!.status(), `unexpected status for ${path}`).toBeLessThan(500);

    // The page must render some title and a body. If the dashboard is auth-gated,
    // the Sign-In page satisfies this — that's correct behavior, not a failure.
    await expect(page).toHaveTitle(/.+/);
    await expect(page.locator('body')).toBeVisible();

    // Filter known-benign console noise.
    const blockers = consoleErrors.filter(
      (e) =>
        !e.includes('Failed to load resource') &&
        !e.includes('Download the React DevTools') &&
        !e.includes('Hydration') &&
        !e.includes('next-flight') &&
        !e.includes('Fast Refresh')
    );
    expect(blockers, `unexpected console errors on ${path}:\n${blockers.join('\n')}`).toEqual([]);
  });
}
