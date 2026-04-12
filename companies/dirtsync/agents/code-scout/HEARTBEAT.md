# HEARTBEAT.md — Gold Star Gap Scanner

## 0. Read Your Lessons (MANDATORY — before anything else)

1. Read `LESSONS.md` in this agent directory (`companies/dirtsync/agents/code-scout/LESSONS.md`). Create with header if missing.
2. Scan for past lessons relevant to the current task (e.g. SSH failures, grep pattern mismatches, ID naming convention gotchas).
3. If a past lesson with `Outcome: worked` matches, try that approach first.

See `vault/agents/skills/lessons-learned-loop.md`.

## Startup
1. Read issue from Forge API: `GET /api/agent/me/inbox`
2. Get issue context: `GET /api/agent/issues/:id/context`

## Scan Loop

### Step 1: Inventory Accessibility IDs in Components
SSH to Mini and grep all accessibilityIdentifier calls:
```bash
ssh dirtsyncmini@100.125.184.57 'cd /Users/dirtsyncmini/DirtSync && grep -rn "accessibilityIdentifier" DirtSync/DirtSyncApp/ | grep -v ".build/"'
```

### Step 2: Inventory Test Assertions
```bash
ssh dirtsyncmini@100.125.184.57 'cd /Users/dirtsyncmini/DirtSync && grep -rn "accessibilityIdentifier\|XCTAssert\|\.exists" DirtSync/DirtSyncUITests/GoldStar*.swift'
```

### Step 3: Compare — Find Untested IDs
Cross-reference: which IDs in Step 1 are NOT referenced in Step 2?

### Step 4: Check State Coverage
For each test, does it check both `element.exists` AND `!element.exists`?
Nav elements should be tested in both nav and free-ride modes.

### Step 5: Check Data Accuracy
Which tests only check `.exists` but not `.label` content?
Flag: "testS3_SpeedBadge_Present checks exists but not the speed value"

### Step 6: List Untested Screens
```bash
ssh dirtsyncmini@100.125.184.57 'cd /Users/dirtsyncmini/DirtSync && ls DirtSync/DirtSyncApp/Views/*.swift DirtSync/DirtSyncApp/Components/*.swift 2>/dev/null'
```
Compare against test file names — which Views/Components have no Gold Star suite?

### Step 7: Post Results (MANDATORY)
```
PATCH /api/agent/issues/:id
{
  "comment": "## Gold Star Gap Scan\n\n### Untested IDs\n...\n\n### Recommended Tests\n...",
  "status": "done"
}
```

**If you exit without posting results, the run is FAILED.**

## BAIL-OUT RULES
- SSH fails 2x → post error → mark blocked
- No files found → post "repo may not be synced" → mark blocked

## Final Step — Append Lessons Learned (MANDATORY — before exit)

For every **non-trivial bug** you hit this run, append one entry to the TOP of `companies/dirtsync/agents/code-scout/LESSONS.md` using the format in `vault/agents/skills/lessons-learned-loop.md`. Commit with your work.
