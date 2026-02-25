# Skill: Visual Bug Fix

## Purpose
Take a screenshot of a UI issue, analyze it, find the relevant code, fix it, and verify the fix.

## When to Use
- User sends a screenshot via Telegram showing a visual/UI issue
- CSS problems, layout issues, missing elements, wrong colors, broken responsive design
- Anything that can be verified visually before and after the fix
- Misaligned components, overflow text, broken images, wrong fonts

## Pre-Task Context Loading
1. Load company profile from vault (e.g., [[companies/dirtsync.md]]) to understand tech stack
2. Load relevant architecture section (key files, component structure, CSS framework)
3. Load known issues list to check if this is already documented
4. Check recent PRs for related UI changes that may have caused the regression

## Required Capabilities
- **Vision** -- must be able to analyze screenshots (rules out Codex)
- **Code editing** -- must be able to read/write files and create PRs
- **Context awareness** -- should load [[agents/skills/codebase-aware.md]] first

## Execution Steps

### Step 1: Analyze Screenshot
- Describe what is visually wrong in the screenshot
- Describe what the expected/correct behavior should be
- Identify the specific UI component(s) affected
- Note the viewport size/device if visible (mobile vs desktop)

### Step 2: Identify Files
- Use architecture knowledge from company profile to find relevant files
- For React/Next.js: look for component files (.tsx), style files (.css/.scss/.module.css), layout files
- For Shopify: look for liquid templates, CSS/SCSS files, theme settings
- Search codebase for component names, class names, or text visible in screenshot

### Step 3: Read the Code
- Read the full component file(s) before making any changes
- Understand the current implementation, styling approach, and any conditional rendering
- Check if the issue is in the component, its parent layout, or a shared style
- Look for recent changes (git log) that might have introduced the bug

### Step 4: Plan the Fix
- Write a brief plan with specific changes:
  - Which file(s) will change
  - What lines/blocks will be modified
  - What the expected visual result will be
- Keep changes minimal -- fix only the reported issue, no scope creep

### Step 5: Implement
- Make the smallest possible change that fixes the issue
- Do NOT refactor surrounding code
- Do NOT change unrelated styles
- Do NOT "improve" things that weren't broken

### Step 6: Self-Review
- Re-read the changed files to verify correctness
- Check for regressions: could this change break anything else?
- Verify the fix addresses exactly what was shown in the screenshot
- Check responsive behavior if applicable (did you break mobile/desktop?)

### Step 7: Create PR
- **Title format:** `fix: {brief description of visual issue}`
- **Description must include:**
  - What was wrong (reference the screenshot)
  - What was changed and why
  - Which files were modified
  - Any potential side effects to watch for

## Acceptance Criteria Template
- [ ] The visual issue from the screenshot is resolved
- [ ] No regressions to surrounding UI elements
- [ ] Changes are minimal and focused (no scope creep)
- [ ] PR description explains the problem and solution
- [ ] Responsive behavior is not broken (if applicable)
- [ ] No unrelated files were modified

## Model Recommendation
- **Best: Claude** -- vision capability for screenshot analysis + strong code editing + follows instructions precisely
- **Fallback: Gemini** -- also has vision capability, good at CSS/UI work
- **Not suitable: Codex** -- no vision capability, cannot analyze screenshots

## Common Pitfalls
- Fixing the symptom instead of the root cause (e.g., adding `!important` instead of fixing specificity)
- Scope creep -- "while I'm here, let me also fix this other thing"
- Not checking mobile/desktop responsive behavior after CSS changes
- Hardcoding pixel values instead of using the existing design system tokens

## Related Skills
- [[agents/skills/codebase-aware.md]] -- load before starting
- [[agents/skills/code-review.md]] -- use to verify the fix
