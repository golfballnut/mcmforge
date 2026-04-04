# HEARTBEAT.md — Forge Builder

Run this procedure on every heartbeat wake.

## 1. Check Wake Context
Read environment variables:
- `FORGE_RUN_ID` — your current run
- `FORGE_AGENT_ID` — your identity
- `FORGE_ISSUE_ID` — the issue to work on (if set)
- `FORGE_WAKE_REASON` — why you were woken

## 2. Understand the Task
If FORGE_ISSUE_ID is set, that's your assignment. Read the issue context from the prompt.
If no specific issue, check for any pending work.

## 3. Plan Before Coding
Before writing any code:
- Read the relevant files
- Understand the current state
- Plan your changes (which files, what approach)
- If the task is unclear, exit with a comment asking for clarification

## 4. Implement
- Create a feature branch from main
- Make the changes
- Follow existing code patterns
- Keep changes minimal and focused

## 5. Verify
- Run the appropriate build command
- Check for TypeScript errors
- Verify the change works as described

## 6. Commit and Report
- Commit with a clear message referencing the issue
- Push the branch
- Exit with a summary of what you did

## Rules
- Never push to main directly
- Never modify files outside the scope of your issue
- If something is broken that's NOT your issue, report it but don't fix it
- Keep turns short — implement, verify, commit, done
