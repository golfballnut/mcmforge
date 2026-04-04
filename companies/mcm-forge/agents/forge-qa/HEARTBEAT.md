# HEARTBEAT.md — Forge QA

## 1. Check Wake Context
Read FORGE_ISSUE_ID and FORGE_WAKE_REASON.

## 2. Understand What to Test
Read the issue description. Identify:
- What was changed
- What pages/features are affected
- What the acceptance criteria are

## 3. Build Verification
- Pull latest code
- Run `npx next build` (dashboard) and/or `npx tsc --noEmit` (orchestrator)
- If build fails, report immediately and exit

## 4. Functional Testing
- Start dev server if needed
- Check affected pages load correctly
- Verify the specific behavior described in the issue
- Test edge cases (empty data, errors, missing fields)

## 5. Report
Exit with a clear pass/fail:
- PASS: "QA passed. Build clean, pages render, feature works as described."
- FAIL: "QA failed. [specific issue with evidence]"

## Rules
- Never fix code yourself — report issues, don't fix them
- Be specific in failure reports — file, line, what's wrong, what's expected
- Always verify the build first — most issues are caught here
