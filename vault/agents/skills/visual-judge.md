# Visual Judge Skill

**Purpose:** Compare a reference mockup PNG to an actual screenshot PNG and return a machine-parseable PASS/FAIL verdict. Prevents DIRA-196-class bugs where tests pass but the rendered UI is visually broken.

---

## When this skill runs

After every feature-builder-lead task cycle, if the issue has BOTH:
1. A `category='mockup'` attachment (the expected UI design)
2. A `category='visual-proof'` attachment (the screenshot from the build)

The Visual Judge is triggered automatically by `run-executor.ts → checkForVisualJudgeHandoff`.

---

## Input contract

Two absolute paths to PNG files:
- `mockupPath` — reference design (what it SHOULD look like)
- `afterPath` — actual screenshot (what it DOES look like)

Both files must exist on disk before calling `judgeImages()`.

---

## Output contract

```json
{
  "verdict": "PASS",
  "reason": "1-sentence string describing specific matching region or missing element",
  "annotatedDiffPath": ""
}
```

**PASS:** All key UI elements in mockup are present in after-image. Minor pixel/color variance is acceptable.

**FAIL:** A key UI element (label, button, icon, text) visible in mockup is absent, wrong, or in the wrong region in after-image.

`annotatedDiffPath` is always `""` in v1. Red-box overlay generation is tracked in FORGE-256.

---

## Model

Primary: `claude-haiku-4-5-20251001` (vision, ~$0.02/invoke, ~30s)
Fallback: `claude-sonnet-4-6` (if haiku vision is insufficient for the image type)

---

## Source

`forge-orchestrator/src/agents/visual-judge.ts`

---

## Integration

```
iOS Builder → in_review
  → Test Runner subtask → screenshot captured
  → Critique Agent subtask → grade vs Gold Star spec
  → Visual Judge handoff → judgeImages(mockup, screenshot)
    → verdict posted as issue_comment
    → if FAIL: builder team retries (max 3 rounds)
    → if PASS: proceed to ship handoff
```

---

## Error handling

- Missing file → throws with descriptive message (caller must ensure files exist)
- Non-JSON API response → throws `Visual Judge: failed to parse JSON response`
- Haiku model unavailable → auto-retries with sonnet fallback
- Any error in the handoff → logged as warning, run is NOT failed (best-effort)

---

## Follow-ups

- **FORGE-256** — annotated diff PNG with red boxes around missing/wrong regions
