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

**MANDATORY: Every [PROOF] comment must link at least ONE artifact in Google Drive** under the `MCM Forge Proof/{company}/{IDENTIFIER} — {title}/` folder (see "How to Upload an Artifact" below). No link = no proof. Steve: "I see agents talking but no screenshots or screen records of bug fixes." This rule closes that gap.

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
- A `### Proof artifacts — Google Drive` heading with one hyperlink per artifact (folder link + per-file links)
- A one-line interpretation per artifact ("after-fix screenshot shows 0 warnings in console")

**Example:**
```
[PROOF] Build tail:
  Route /costs: 2.1 kB (142ms)
  ✓ Compiled successfully
Branch: agent/forge-42-cost-chart
PR: feat(FORGE-42): cost breakdown chart

### Proof artifacts — Google Drive
Folder: [MCM Forge / FORGE-42 — Cost breakdown chart](https://drive.google.com/drive/folders/…)
- [2026-04-23_curl-test.txt](https://drive.google.com/file/d/…/view) — `GET /api/costs 200 OK { total: 4.82 }`
- [2026-04-23_before-chart.png](https://drive.google.com/file/d/…/view) — empty state, pre-fix
- [2026-04-23_after-chart.png](https://drive.google.com/file/d/…/view) — rendered BarChart with 3 categories
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

## How to Upload an Artifact (for [PROOF]) — Google Drive

Proof artifacts live in Google Drive, not Supabase storage. Drive handles videos + large screenshots natively, is browsable cross-device, and gives Steve a single place to curate proof over time without a separate UI.

**Folder convention — agents MUST follow exactly:**
```
MCM Forge Proof/
└── {company}/              ← "DirtSync", "MCM Forge", etc. (title case, spaces allowed)
    └── {IDENTIFIER} — {title}/   ← e.g. "DIRA-267 — Waze-parity Home screen"
        └── YYYY-MM-DD_{descriptor}.{ext}
```

The root `MCM Forge Proof` folder already exists at Drive ID `11nELNPmv8GmuCbhpLNTTQfYT_SY5pFPj`. Agents create the `{company}` subfolder on first use, and the `{IDENTIFIER} — {title}` subfolder on first upload for a given issue. Re-use existing folders — search by name before creating.

**Upload via `gws` CLI (available on the Mini + laptop):**
```bash
# 1. Find or create the issue folder (idempotent — search first)
ISSUE_FOLDER_ID=$(gws drive files list \
  --params "{\"q\":\"name='${IDENTIFIER} — ${TITLE}' and '${PARENT_ID}' in parents and trashed=false\",\"fields\":\"files(id)\"}" \
  --format json 2>/dev/null \
  | python3 -c "import json,sys; d=json.load(sys.stdin)['files']; print(d[0]['id'] if d else '')")

if [ -z "$ISSUE_FOLDER_ID" ]; then
  ISSUE_FOLDER_ID=$(gws drive files create \
    --json "{\"name\":\"${IDENTIFIER} — ${TITLE}\",\"mimeType\":\"application/vnd.google-apps.folder\",\"parents\":[\"${PARENT_ID}\"]}" \
    --format json 2>/dev/null | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")
fi

# 2. Upload the file. gws requires the file to be inside cwd; cd to /tmp first.
cd /tmp && FILE_ID=$(gws drive files create \
  --json "{\"name\":\"$(date +%Y-%m-%d)_after-chart.png\",\"parents\":[\"${ISSUE_FOLDER_ID}\"],\"description\":\"After fix: BarChart renders 3 cost categories\"}" \
  --upload after-chart.png \
  --upload-content-type image/png \
  --format json 2>/dev/null | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")

# 3. Grant anyone-with-link: reader so the URL works for Steve + anyone reading the issue
gws drive permissions create \
  --params "{\"fileId\":\"${FILE_ID}\"}" \
  --json '{"type":"anyone","role":"reader"}' >/dev/null 2>&1

# 4. Build the shareable URL (file view link, not download)
echo "https://drive.google.com/file/d/${FILE_ID}/view"
```

**Then paste the URL into the [PROOF] comment body** under a `### Proof artifacts — Google Drive` heading, using markdown link syntax: `[YYYY-MM-DD_descriptor.ext](https://drive.google.com/file/d/…/view)`.

**Size caps:** Drive's per-file ceiling is 5 TB. Practical: keep screenshots under 10 MB (PNG compression), videos under 200 MB (transcode with `ffmpeg -c:v libx264 -preset fast -crf 28 -vf "scale=-2:720"` for ~20 MB per 10 min sim footage).

**No Drive link = [PROOF] is rejected.** Don't post [PROOF] with only a text summary — the rule is there because every prior agent quietly skipped this and Steve had no visual evidence of anything that shipped.

**Never delete proof folders.** Drive links are durable only while the file exists. If you need to tidy, move to `MCM Forge Proof/_archive/{company}/…` — do not trash.

**Supabase storage is deprecated for new proof** — it still exists for legacy attachments (pre-2026-04-23) but all new proof goes to Drive. Don't mix links from both in the same comment.

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
