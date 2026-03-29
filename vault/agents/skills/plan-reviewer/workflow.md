# Plan Reviewer — 8-Point Checklist

Score each criterion 0 or 1. Total score = `round(sum * 10 / 8)`.

## 1. Scope Match
Does the plan match the task requirements exactly? No more, no less.
- RED FLAG: Plan adds features not in the task description
- RED FLAG: Plan ignores explicit requirements
- GOOD: "What This Does NOT Change" section explicitly bounds the work

## 2. Production Safety
Does the plan touch working production code? Are changes isolated?
- RED FLAG: Modifies Claude CLI args that work in production (leave unchanged)
- RED FLAG: Changes to dispatcher polling, task claiming, or status transitions without feature flag
- GOOD: New code is additive, existing paths unchanged

## 3. Version Compatibility
Do tool versions match what's deployed on the Mac Mini?
- Claude Code: v2.1.76 | Node.js: v20.20.0 | Gemini CLI: v0.29.7 | Codex CLI: v0.99.0
- RED FLAG: Uses APIs or flags from newer versions
- RED FLAG: Assumes npm packages not in current package.json

## 4. Edge Cases
Are all failure modes handled? What happens when X fails?
- RED FLAG: No error handling for external calls (CLI spawn, DB queries, API calls)
- RED FLAG: No null/undefined checks on optional fields
- GOOD: Every external call wrapped in try/catch or has fallback behavior

## 5. Non-blocking
Will failures crash the dispatcher or just log warnings?
- RED FLAG: Unhandled promise rejection possible
- RED FLAG: Thrown error could propagate to main loop
- GOOD: All new functions wrapped in try/catch, failures log and continue

## 6. Env Var Reuse
Are existing env vars reused, not duplicated?
- RED FLAG: Creates new env var that duplicates existing one
- RED FLAG: Hardcodes values that should come from config
- GOOD: Uses CONFIG object values passed via deps

## 7. Rollback
Can this be rolled back instantly?
- RED FLAG: Database migration that can't be reversed (DROP COLUMN, data transformation)
- RED FLAG: No feature flag for major behavior change
- GOOD: All new columns are additive (ADD COLUMN IF NOT EXISTS)

## 8. Step Completeness
Are steps sequenced correctly? Could a developer follow without guessing?
- RED FLAG: References a function/file that doesn't exist yet without creating it first
- RED FLAG: Steps have circular dependencies
- RED FLAG: Missing test/verification step
- GOOD: Clear order, each step buildable independently

## Output Format

Return ONLY valid JSON:
```
{"score": 8, "issues": [{"severity": "high", "issue": "Plan touches Claude CLI args", "suggestion": "Leave Claude args unchanged"}], "approved": true, "summary": "Solid plan, minor scope concern."}
```

Fields: `score` (0-10), `issues` (array with severity/issue/suggestion), `approved` (true if score >= 9), `summary` (1-2 sentences).
