# visual-bug-fix: Workflow

## Step 1: Analyze Screenshot
- Describe what is visually wrong
- Describe the expected/correct behavior
- Identify the specific UI component(s) affected
- Note viewport size/device if visible (mobile vs desktop)

## Step 2: Load Context
- Load company profile from vault to understand tech stack
- Load relevant architecture section (key files, component structure, CSS framework)
- Check recent git log for UI changes that may have caused the regression

## Step 3: Identify Files
- React/Next.js: component files (`.tsx`), style files (`.css/.scss/.module.css`), layout files
- Shopify: liquid templates, CSS/SCSS files, theme settings
- Search codebase for component names, class names, or text visible in screenshot

## Step 4: Read the Code
- Read the FULL component file(s) before making any changes
- Understand current implementation, styling approach, conditional rendering
- Check if the issue is in the component, its parent layout, or a shared style

## Step 5: Plan the Fix (Write It Out First)
- Which file(s) will change
- What lines/blocks will be modified
- What the expected visual result will be
- Keep changes MINIMAL — fix only the reported issue

## Step 6: Implement
- Make the smallest possible change that fixes the issue
- Do NOT refactor surrounding code
- Do NOT change unrelated styles
- Do NOT "improve" things that weren't broken

## Step 7: Self-Review
- Re-read changed files to verify correctness
- Check for regressions: could this break anything else?
- Verify the fix addresses exactly what was shown in the screenshot
- Check responsive behavior if applicable

## Step 8: Create PR
- **Title:** `fix: {brief description of visual issue}`
- **Description:** What was wrong · What was changed and why · Files modified · Side effects
- **Acceptance criteria:** visual issue resolved · no regressions · responsive not broken
