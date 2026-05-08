import { test, expect } from '@playwright/test';

// WO-2.5 critical path against production.
//
// Asserts: Pam (a real authenticated user) navigates to a known fixture
// contact, clicks "Agent's view" → "Generate preview", and the AgentEyePanel
// renders streamed text from Claude within 90 seconds.
//
// This exercises the entire chain end-to-end:
//   1. Cookie auth via /login (set up in auth.setup.ts)
//   2. Vercel-hosted /crm/contacts/[id] server render
//   3. POST /api/crm/preview-draft → forge.runs row queued
//   4. Mini orchestrator polls forge.runs, dispatches CRM Preview Drafter
//   5. Claude CLI streams stream-json events into forge.run_events
//   6. SSE stream /api/crm/preview-draft/stream walks payload.message.content[]
//      and pushes 'text' chunks to the browser
//   7. AgentEyePanel appends each chunk to the [data-testid="preview-draft-result"] box
//
// If this test goes red, exactly one of those seven hops is broken — which is
// far more diagnostic than a manual "click and watch" smoke.

const FIXTURE_CONTACT_ID = 'd3124755-ec47-4a8e-8c9a-567516531c77'; // Sample Pam Contact (forge.crm_contacts)

test('preview-draft streams text within 90s for the fixture contact', async ({ page }) => {
  test.setTimeout(150_000); // 90s draft + auth + nav slack

  await page.goto(`/crm/contacts/${FIXTURE_CONTACT_ID}`);

  // The contact must actually be loaded — guard against a 404/redirect
  // making the rest of the test silently meaningless.
  await expect(page.locator('h1')).toContainText('Sample', { timeout: 15_000 });

  // Open the agent panel. Label is "Agent's view →" (smart quote + arrow).
  await page.getByRole('button', { name: /Agent.*view/i }).click();

  // Click Generate preview — fires POST /api/crm/preview-draft.
  await page.getByTestId('preview-draft-button').click();

  // The single assertion: streamed text appears in the result box.
  // 90s ceiling matches the SSE stream's safety timeout in
  // app/api/crm/preview-draft/stream/route.ts.
  await expect(page.getByTestId('preview-draft-result'))
    .toContainText(/.+/, { timeout: 90_000 });
});
