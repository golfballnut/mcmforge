# TDD Workflow — Reference

## Anti-Patterns (DO NOT)
- Write tests after code — that's verification, not TDD
- Skip tests because "it's a small change"
- Mock everything — test real behavior where possible
- Write tests that always pass (test the right thing, not a tautology)
- Skip the red phase — if you never see failure, you can't trust the test

## Gotchas from Past Failures
- TypeScript type errors in new files cause CI failure — always run `npx tsc --noEmit`
- Missing test evidence in PR description → PR gets rejected
- Testing mocks instead of real modules → false confidence

## Framework Setup (Vitest — if not already configured)
```bash
npm install -D vitest
# vitest.config.ts
import { defineConfig } from 'vitest/config'
export default defineConfig({ test: { environment: 'node' } })
```

Add to package.json:
```json
"scripts": { "test": "vitest run" }
```
