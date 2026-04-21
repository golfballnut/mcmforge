# Skill: Agent Comment Protocol

Every specialist posts structured comments on their assigned issue throughout a run. These comments are the human-in-the-loop channel — the CEO and Steve read them in real time to monitor progress, catch blockers, and verify work before merge.

## The 5 Tags

### [START]
Post immediately after picking up the issue, before touching any code.

**What to include:**
- What you understood the issue to be asking (1-2 sentences)
- Which files you plan to modify (file list)
- Estimated time or iteration count

**Example:**
```
[START] FORGE-42: Add cost breakdown chart to dashboard.
Plan: (1) read CostPage.tsx, (2) add BarChart component using recharts, (3) wire Supabase query.
Files: dashboard/src/app/costs/page.tsx. Est: 15 min.
```

---

### [PROGRESS]
Post on every major state transition: after checkout, after each implement phase, after build passes, after push.

**What to include:**
- What just completed
- Whether it succeeded or failed
- What's next

**Example:**
```
[PROGRESS] Build passes (0 errors). About to push branch agent/forge-42-cost-chart and open PR.
```

---

### [BLOCKED]
Post immediately when stuck for more than 2 minutes on any obstacle.

**What to include:**
- Exactly what you tried
- The error or missing information
- 2-3 options for how to unblock (let the COO pick)

**Example:**
```
[BLOCKED] Build fails: "Module not found: recharts". Not in package.json.
Options: (A) run npm install recharts and commit package-lock update, (B) use a different charting lib already installed, (C) wait for COO to approve the dep addition.
```

---

### [PROOF]
Post when the PR is ready, BEFORE calling `gh pr create`. Include concrete artifacts — not assertions.

**MANDATORY: Every [PROOF] comment must be accompanied by at least ONE uploaded artifact** via `POST /api/agent/issues/{id}/attachments` (the one-shot upload endpoint — see "How to Upload an Artifact" below). No upload = no proof. Steve: "I see agents talking but no screenshots or screen records of bug fixes." This rule closes that gap.

**What to upload (by agent type):**
| Agent type | Minimum artifact |
|---|---|
| Backend / API (Forge Builder, etc.) | `curl-test.txt` — the exact curl command + response body proving the endpoint works. Or a `before.log` + `after.log` pair showing the fix eliminates the symptom. |
| UI / frontend (any agent touching dashboard or DirtSync views) | Before screenshot + after screenshot (PNG) of the affected view. Use the sim if iOS; use Playwright if web. |
| Simulator specialist | Full evidence bundle — session.mp4 + 3 screenshots + log.txt + assertions.json. See `ios-simulator-mastery.md`. |
| Map Rendering / iOS native fixes | A 30-60 second screen recording (MP4) of the sim showing the fix in action + a log.txt excerpt showing the relevant NSLog output. |
| Data pipelines / scripts | A before/after SQL snapshot or row count as text, plus the script's stdout log as text file. |

**What to include in the comment body:**
- Build output (last 5-10 lines)
- PR branch + PR command you're about to run
- The `publicUrl` of every artifact you just uploaded (put them under an `## Artifacts` heading)
- A one-line interpretation per artifact ("after-fix screenshot shows 0 warnings in console")

**Example:**
```
[PROOF] Build tail:
  Route /costs: 2.1 kB (142ms)
  ✓ Compiled successfully
Branch: agent/forge-42-cost-chart
PR: feat(FORGE-42): cost breakdown chart

## Artifacts
- https://.../artifacts/agent-proof/<issue>/curl-test.txt — `GET /api/costs 200 OK { total: 4.82 }`
- https://.../artifacts/agent-proof/<issue>/before-chart.png — empty state, pre-fix
- https://.../artifacts/agent-proof/<issue>/after-chart.png — rendered BarChart with 3 categories
```

---

### [DONE]
Post as the last action before exiting. Summarize the run.

**What to include:**
- What shipped (1 sentence)
- Branch and PR link
- Approximate cost and time
- Link to LESSONS.md entry if any was added

**Example:**
```
[DONE] FORGE-42: Cost chart shipped. Branch: agent/forge-42-cost-chart. PR #47.
~$0.18 / 8 min. No new lessons.
```

---

## How to Post a Comment

```bash
curl -s -X POST "$FORGE_API_URL/api/agent/issues/{issueId}/comments" \
  -H "X-Forge-Agent-Id: $FORGE_AGENT_ID" \
  -H "X-Forge-Run-Id: $FORGE_RUN_ID" \
  -H "Content-Type: application/json" \
  -d '{"body": "[START] ...", "tags": ["START"]}'
```

The `tags` field is optional metadata. The tag itself MUST appear in the body text as the first word (e.g. `[START]`).

---

## How to Upload an Artifact (for [PROOF])

**Endpoint:** `POST /api/agent/issues/{issueId}/attachments` (one-shot — does Supabase storage upload + DB row atomically). Shipped in FORGE-275.

```bash
# Base64 the file, then POST it
B64=$(base64 -i /tmp/qa/after-chart.png)
curl -s -X POST "$FORGE_API_URL/api/agent/issues/{issueId}/attachments" \
  -H "X-Forge-Agent-Id: $FORGE_AGENT_ID" \
  -H "X-Forge-Run-Id: $FORGE_RUN_ID" \
  -H "Content-Type: application/json" \
  -d "{
    \"filename\": \"after-chart.png\",
    \"mimeType\": \"image/png\",
    \"base64\": \"$B64\",
    \"category\": \"agent_proof\",
    \"caption\": \"After fix: BarChart renders 3 cost categories\"
  }"
# Response 201: { "id", "storagePath", "publicUrl", "sizeBytes" }
```

**Then paste `publicUrl` into the [PROOF] comment body.** The dashboard renders these inline so Steve can see them without clicking.

**Size caps:** images 10 MB, video 50 MB, text/json 2 MB. If your video exceeds 50 MB, compress first: `ffmpeg -i src.mp4 -c:v libx264 -preset fast -crf 28 -vf "scale=-2:720" out.mp4` (yields ~20 MB for 10 min of sim footage).

**No upload = [PROOF] is rejected.** Don't post [PROOF] with only a text summary — the rule is there because every prior agent quietly skipped this and Steve had no visual evidence of anything that shipped.

---

## HEARTBEAT Integration

Each HEARTBEAT.md should require these posts at the following lifecycle points:

| Lifecycle point | Tag | Requirement |
|-----------------|-----|-------------|
| After LESSONS.md read, before any code | [START] | MANDATORY |
| After issue checkout | [PROGRESS] | MANDATORY |
| After each implement phase / major decision | [PROGRESS] | MANDATORY |
| After build passes | [PROGRESS] | MANDATORY |
| After push, before `gh pr create` | [PROOF] | MANDATORY + ≥1 artifact upload |
| Any time stuck >2 min | [BLOCKED] | MANDATORY |
| Last action before exit | [DONE] | MANDATORY |

**Rule: Silence = broken.** If the COO sees no [START] comment on an issue after 5 minutes, the run is assumed stuck. If there's no [DONE], the run is assumed crashed. Post on every transition.
