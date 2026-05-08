# Feature tests (prod-targeted)

Single-purpose Playwright specs that run against a deployed environment (default `https://mcmforge.com`). Each spec exercises ONE critical path end-to-end with real auth, real DB, real orchestrator. Not part of the `npm run test:e2e` smoke loop.

## Run

```bash
cd dashboard
PAM_TEST_PASSWORD='<pam-password>' \
  npx playwright test --config=playwright.feature-tests.config.ts
```

Override target with `E2E_BASE_URL=<url>` (e.g., a Vercel preview URL). Default is `https://mcmforge.com`.

## What's here

- `auth.setup.ts` — signs in as `pam@mcmforge.com` once per run, saves cookie state to `.auth/pam.json` (gitignored). Requires `PAM_TEST_PASSWORD`.
- `wo-2.5-preview-draft.spec.ts` — asserts the AgentEyePanel renders streamed text within 90s when "Generate preview" is clicked on a fixture contact.

## Fixture data (live in prod, do not delete)

| Resource | UUID | Purpose |
|---|---|---|
| `forge.crm_accounts` "Test Co (e2e fixture)" | `792b9845-487d-4aaa-b51e-49f805811a87` | Account the contact lives under |
| `forge.crm_contacts` "Sample Pam Contact" | `d3124755-ec47-4a8e-8c9a-567516531c77` | Fixture contact the test navigates to |
| `forge.crm_activities` "Initial outreach" | `814c903f-a79c-4564-ac36-b21006afd457` | Provides one timeline entry |
| `auth.users` `pam@mcmforge.com` | `8b037f09-6c5c-40e0-895e-385ec423d744` | Test user (authenticated, no role) |

## Folding into the regular suite

Once a feature test has been green for ~7 days and you trust it, move the spec out of `feature-tests/` into the parent `e2e/` directory and run it via the standard `npm run test:e2e` against localhost. (You'll likely need to seed equivalent fixtures into the local Supabase branch — see the SQL in this folder's git history.)
