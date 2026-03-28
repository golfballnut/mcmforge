# Plan Then Code — Workflow

## Pre-Task Context Loading
1. Load company profile and architecture docs from vault
2. Load relevant file contents (read the actual code, don't guess)
3. Load related decision logs from decisions/
4. Check recent PRs (last 5 merged) for patterns and conventions
5. Load codebase-aware skill context

## Step 1: Understand
- Read ALL relevant code files completely (don't skim)
- Understand the current architecture, patterns, and conventions
- Identify the exact scope of what needs to change
- List any assumptions and validate them against the code
- Note: "I think this file does X" is not good enough — read it and confirm

## Step 2: Plan
Write a step-by-step implementation plan with sections:
- Files to Modify (what changes and why)
- Files to Create (if any, with purpose)
- Steps in order (with code snippets or pseudocode)
- What This Does NOT Change (explicitly list out-of-scope items)
- Risks / Edge Cases

## Step 3: Validate
- Does the plan match the task requirements exactly? (no more, no less)
- Does the plan conflict with any known issues or recent changes?
- Would the plan cause merge conflicts with any open PRs?
- Is the plan achievable in one focused PR? (if not, split it)

## Step 4: Execute
- Implement EXACTLY as planned — no improvisation
- If you discover something unexpected, STOP and update the plan before continuing
- Make changes in the order specified in the plan
- No scope creep: if you notice something else that needs fixing, log it as a separate task

## Step 5: Test
- Run any available tests (unit tests, linting, type checking)
- If no automated tests exist, manually verify the changes make sense
- Check for TypeScript errors, import issues, missing dependencies

## Step 6: Create PR
- Title format: `feat: {brief description}` or `fix: {brief description}`
- Description must include:
  - The implementation plan (so reviewer can verify you followed it)
  - What was changed and why
  - What was explicitly NOT changed (scope boundaries)
  - How to test/verify the changes

## Model by Phase
| Phase | Best Model | Why |
|-------|-----------|-----|
| Planning | Gemini | Broad thinking, good at architecture |
| Coding | Claude | Precise, follows plans, good at multi-file |
| Quick fixes | Codex | Fast, focused, minimal |
