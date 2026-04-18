# After FORGE-253: Visual Judge + Auto-Attach

## The new pipeline

```
iOS Builder → Test Runner → Critique Agent → Visual Judge → QA Rider → Ship
               (build+test)  (grades spec)   (compares PNG)  (final)
```

### Visual Judge (new, fires after Critique Agent)

When an issue has both a `category='mockup'` attachment and a `category='visual-proof'` PNG:

1. Downloads both images from Supabase Storage
2. Sends both to `claude-haiku-4-5-20251001` vision API
3. Receives structured JSON: `{ verdict: "PASS"|"FAIL", reason: string, annotatedDiffPath: "" }`
4. Posts verdict as issue comment immediately
5. If FAIL: the reason names the specific region and missing element
   - Example: `"No text detected in expected trail-label region at z15 (upper-left quadrant)"`
6. Builder team sees the exact failure in the issue before Steve ever opens the app

### Auto-Attach (new, fires on orchestrator startup)

Any file committed under `docs/research/<issue-id>-visual-proof/`:

1. Gets uploaded to Supabase Storage at `artifacts/<identifier>/filename`
2. Gets an `issue_attachments` row inserted with `category='visual-proof'`
3. Appears on the issue detail page within seconds
4. Re-runs are idempotent — files already uploaded are skipped (no duplicate rows)

Supported mime types: `image/png`, `image/jpeg`, `video/webm`, `video/mp4`, `video/quicktime`, `text/plain`

## What this prevents

| Scenario | Before | After |
|----------|--------|-------|
| Trail labels missing | Passes tests, Steve finds it in field | FAIL verdict with region description, iteration blocked |
| Proof screenshots | Agent must manually POST uploads | Auto-attached when committed to `docs/research/` |
| DIRA-196 repeat | Undetected until field test | Caught at Visual Judge phase, ~2 min after screenshot taken |

## Cost savings

- DIRA-196-class bugs caught before Steve field tests
- Zero manual upload friction for proof artifacts
- Specific region-level failure reasons eliminate guesswork in the fix iteration
- Model cost: ~$0.02/invoke (haiku) — cheaper than one minute of Steve's debugging time

## Follow-ups

- **FORGE-256** — red-box overlay on `annotatedDiffPath` (v1 returns `""`)
- PR webhook trigger for auto-attach (v1 uses startup scan)
