# HEARTBEAT.md — DirtSync iOS Builder

Run this on every wake. No shortcuts.

## 0. Read Your Lessons (MANDATORY — before Orient)

Before anything else on every wake:

1. Read `LESSONS.md` in this agent directory (`companies/dirtsync/agents/ios-builder/LESSONS.md`).
2. If missing, create with header per `vault/agents/skills/lessons-learned-loop.md`.
3. Scan for entries relevant to the current issue (match by tag, title keywords, or file path).
4. For any matching entry with `Outcome: worked`, try that fix FIRST. Do not waste a strike re-learning.
5. For any entry with `Outcome: didn't work`, do not repeat that approach.

See `vault/agents/skills/lessons-learned-loop.md`. This step is non-negotiable.

## 1. Orient
- Read the assigned issue
- Read all comments for context
- Check: do I have acceptance criteria? If not, comment asking for them and exit.

## 2. Plan (MANDATORY before any work)
1. Identify the Swift files I need to change
2. Identify the test file (create one if needed)
3. Can I finish in this session? If not, break into smaller pieces.
4. POST the plan as a comment on the issue:
   ```
   curl -X PATCH $FORGE_API_URL/api/agent/issues/$FORGE_ISSUE_ID \
     -H "X-Forge-Agent-Id: $FORGE_AGENT_ID" \
     -H "Content-Type: application/json" \
     -d '{"comment": "## Plan\n\n<your plan here>\n\n**Files:** ...\n**Approach:** ...\n**Risk:** ..."}'
   ```
5. For trivial fixes (<10 lines, obvious from error): note "Trivial fix, skipping plan" in comment
6. For code work: the plan IS your contract. Don't deviate without updating it.

## 3. Execute
- **Step 0 (MANDATORY):** Detect your environment. Run `xcrun simctl list devices booted` to find the booted simulator name and UUID.
  - If XcodeBuildMCP is available (check for `mcp__XcodeBuildMCP__session_show_defaults`), use MCP tools.
  - If NOT available, use bash commands directly (this is the case on Mac Mini).
- `git checkout -b agent/<issue-slug>` (or use existing branch if resuming)
- Make the code changes
- Build:
  ```bash
  # Get simulator name from booted devices
  SIM_NAME=$(xcrun simctl list devices booted | grep -oP '^\s+\K[^(]+' | head -1 | xargs)
  xcodebuild -scheme DirtSync -destination "platform=iOS Simulator,name=$SIM_NAME" build 2>&1 | tail -20
  ```
- Run tests if applicable:
  ```bash
  xcodebuild test -scheme DirtSync -destination "platform=iOS Simulator,name=$SIM_NAME" -only-testing:DirtSyncUITests/NavHUDGoldStarTests 2>&1 | tail -30
  ```

## 4. Verify (MANDATORY — every item checked or you CANNOT mark in_review)
- [ ] Build passes (zero errors)
- [ ] Feature works as described in acceptance criteria
- [ ] No regressions in existing navigation/maps
- [ ] No new warnings introduced
- [ ] **SCREENSHOT TAKEN** — use the procedure below. NO EXCEPTIONS.

### Screenshot Procedure (works on Mac Mini and local)
```bash
# 1. Get simulator UUID
SIM_UUID=$(xcrun simctl list devices booted | grep -oE '[A-F0-9-]{36}' | head -1)

# 2. Install fresh build
APP_PATH=$(find ~/Library/Developer/Xcode/DerivedData -name "DirtSync.app" -path "*/Debug-iphonesimulator/*" -maxdepth 5 | head -1)
xcrun simctl install "$SIM_UUID" "$APP_PATH"

# 3. Terminate any existing instance
xcrun simctl terminate "$SIM_UUID" app.dirtsync.DirtSync 2>/dev/null

# 4. Launch with test flags (for nav changes)
xcrun simctl launch "$SIM_UUID" app.dirtsync.DirtSync --uitesting --uitesting-navigate

# 5. Wait for app + nav to initialize
sleep 10

# 6. Take screenshot
xcrun simctl io "$SIM_UUID" screenshot /tmp/dira-screenshot-after.png
echo "Screenshot saved to /tmp/dira-screenshot-after.png"
```

**LOGIN BLOCKER:** If the app shows a login screen instead of nav, the simulator has no cached session. In that case:
1. Run the XCUITest login flow: `xcodebuild test -scheme DirtSync -destination "platform=iOS Simulator,name=$SIM_NAME" -only-testing:DirtSyncUITests/NavHUDGoldStarTests/testLogin_QAAgentCredentials 2>&1 | tail -20`
2. Credentials: agent@dirtsync.app / AgentTest2026
3. After login test passes, the session is cached. Re-run the screenshot procedure above.
4. If the test file doesn't exist on your branch, write one or manually log in:
   ```bash
   # Type credentials via XCUITest-style approach
   # Or comment on the issue: "BLOCKED — simulator not logged in. Need XCUITest or manual login."
   ```

**If you cannot take a screenshot for ANY reason, you MUST explain why in your comment. Do NOT silently skip this step.**

## 5. Deliver
- `git push -u origin agent/<slug>`
- `gh pr create --base master --title "..." --body "..."`
- Update issue status

## 6. Report Results (MANDATORY — your work doesn't count without this)

**HARD RULE: No screenshots = No in_review. PERIOD.**

If you changed ANY UI, you MUST include BEFORE and AFTER screenshots in your issue comment. If you can't take a screenshot (build fails, simulator won't launch), explain why — but you CANNOT mark in_review without visual proof.

1. Take screenshot BEFORE your change (or describe the prior state)
2. Take screenshot AFTER your change — call `mcp__XcodeBuildMCP__screenshot` 
3. POST results with screenshots as a comment on the issue:
   ```
   curl -X PATCH $FORGE_API_URL/api/agent/issues/$FORGE_ISSUE_ID \
     -H "X-Forge-Agent-Id: $FORGE_AGENT_ID" \
     -H "Content-Type: application/json" \
     -d '{"comment": "## Results\n\n<summary>\n\n**Files changed:** ...\n**Build:** PASS/FAIL\n**PR:** <link>\n\n### Screenshots\n**Before:** <describe or path>\n**After:** <screenshot path from mcp__XcodeBuildMCP__screenshot>\n\n**Status:** in_review"}'
   ```
4. If you're running low on turns, STOP working and POST what you have so far
5. Update issue status via PATCH (in_review, approved, done, blocked)
6. Your work does NOT count unless it's posted as a comment with screenshots. The QA Rider reads your comment and screenshots to verify.

## 7. Append Lessons Learned (MANDATORY — before exit)

For every **non-trivial bug** you hit this run, append one entry to the TOP of `companies/dirtsync/agents/ios-builder/LESSONS.md`:

```
## YYYY-MM-DD — <short title>
**Bug:** <what broke>
**Attempted fix:** <what you tried>
**Outcome:** <worked | didn't work | partial>
**Why:** <root cause or "unknown">
**Cost:** $<run cost>
**Tag:** <keyword>
```

One entry per non-trivial bug. Append-only, newest at top. Commit with your work on the same branch. See `vault/agents/skills/lessons-learned-loop.md`.

## 8. Exit
Clean exit. Don't start new work.
