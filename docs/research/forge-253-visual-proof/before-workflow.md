# Before FORGE-253: Visual QA Gap

## The DIRA-196 incident

A PR (DIRA-196) passed all XCUITests but shipped with no visible trail labels on the map.
Tests were asserting on proxy metrics (view exists, outlet wired) rather than visual output.

## The gap

1. **No mockup-vs-screenshot comparison** — agents had no way to compare "what the designer wanted" vs "what shipped"
2. **No automated visual verdict** — the only signal was Steve's field test finding the regression
3. **No auto-attached proof artifacts** — screenshots and test logs had to be manually posted to issues, often skipped
4. **Verdict was subjective** — critique agents graded against spec text, not against a reference image

## The pipeline before FORGE-253

```
iOS Builder → Test Runner → Critique Agent → QA Rider → Ship
               (build+test)  (grades spec)    (manual)
```

The Critique Agent had no reference image to compare against. It could only check
that the view rendered at all, not that it rendered correctly.

## Cost of the gap

- DIRA-196: 1 full iteration wasted on a visually-broken feature
- Steve's time to field-test, identify, describe the bug, re-dispatch
- User-facing regression risk if features reached TestFlight in this state
- Every feature with a mockup carried this risk with no automated safety net
