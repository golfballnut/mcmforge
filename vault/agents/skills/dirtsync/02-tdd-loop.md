# Phase 2: TDD Loop

**This is the core. RED → test audit → fix → GREEN. Max 3 iterations.**

---

## Step 4.5: Reproduce the Bug — RED

**You MUST prove the bug exists BEFORE writing any fix.**

1. Build current master (no changes yet)
2. Run on simulator with the pre-flight basemap (satellite)
3. Screenshot the EXACT failure — the frame where the bug is visible
4. Upload as "fail" category attachment

```bash
xcrun simctl io $SIM screenshot qa-screenshots/<issue-slug>-RED.png
```

**If you CANNOT reproduce:** STOP. Post "BLOCKED: Cannot reproduce on master" and wait for COO.

**Post to issue:** "Step 4.5: Bug reproduced (RED) — screenshot shows [what's wrong]"

**Track:** `step_4.5: {done: true, reproduced: true, screenshot: "filename.png"}`

---

## Step 4.75: Write the Failing Test — RED

**Write a test that defines "fixed." Run it. It MUST fail.**

```bash
xcodebuild test -scheme DirtSync -destination "platform=iOS Simulator,name=iPhone 16 Pro" \
  -only-testing:DirtSyncTests/YourTestClass/testYourTest 2>&1 | tail -10
```

**CRITICAL — test type depends on what you're testing:**

| What | Test Type | Why |
|------|-----------|-----|
| Anything visible (labels, markers, HUD, colors, layout) | **XCUITest** | Must launch app and assert element visible on screen |
| Pure logic (distance threshold, state machine, data parsing) | Unit test | Config check is OK for non-visual logic |
| Both (logic + visual result) | **Both** | Unit test for logic, XCUITest for visual proof |

**If you wrote a unit test for a visual feature:** DELETE IT. Start over with XCUITest.

```swift
// WRONG — checks config, passes even when cleanup hides the label:
XCTAssertEqual(labelsLayer.minimumZoomLevel, 10) // useless

// RIGHT — proves the user can see it:
let app = XCUIApplication()
app.launch()
XCTAssert(app.staticTexts["Burning Rock"].waitForExistence(timeout: 10))
```

**If the test passes immediately:** Your test is wrong. It's not testing the bug. Fix the test.

**Post to issue:** "Step 4.75: Failing test written — [TestClass/testName], assertion: [what], result: FAIL — [message]"

**Track:** `step_4.75: {done: true, test_name: "TestClass/testName", test_type: "xcuitest", result: "FAIL"}`

---

## Step 4.8: Audit Your Test — BEFORE Fixing

**STOP. Do NOT write fix code yet. Grade your test first.**

Go through every checkbox. If ANY is unchecked, rewrite the test.

```
## Step 4.8: Test Audit
- [ ] TEST TYPE: XCUITest that launches the app? (required for visual features)
- [ ] BASEMAP: Runs on satellite? (matches Step 0.75)
- [ ] RENDERS NOT CONFIG: Asserts something VISIBLE? (not a property check)
- [ ] SURVIVES CLEANUP: Would still catch the bug after cleanup/opacity/z-order changes?
- [ ] ASYNC READY: Waits for tiles, style, cleanup? (sleep/waitForExistence)
- [ ] ALL CRITERIA: Covers ALL acceptance criteria?
- [ ] MEANINGFUL NAME: Name describes expected behavior?
- [ ] ACTUALLY FAILS: Did this test fail in Step 4.75? (pass = wrong test)
```

**Red flag patterns — if your test has ANY, it's WRONG:**
- `XCTAssertEqual(*.minimumZoomLevel, *)` — config check
- `XCTAssertEqual(*.textOpacity, *)` — property check, cleanup can change it
- `XCTAssertNotNil(style.layer(withIdentifier:))` — layer exists but may be invisible
- Any visual test without `app.launch()`

**If audit fails:** Rewrite test. Return to Step 4.75.

**Post to issue:** "Step 4.8: Test audit — [PASS/FAIL], red flags: [none/list]"

**Track:** `step_4.8: {done: true, audit_passed: true, red_flags: []}`

---

## Step 5: Make the Fix

Edit the code. Keep changes minimal — only fix what the issue describes.

**Iteration cap: 3 attempts.** If test still fails after 3:
1. STOP coding
2. Post: "STUCK after 3 iterations — [what you tried]"
3. Diagnose root cause — what assumption is wrong?
4. Check knowledge base + specialist LESSONS.md
5. If still stuck: mark BLOCKED, wait for COO

**Post to issue:** "Step 5: Changes — [file:line] [what changed], iteration [1/2/3]"

**Track:** `step_5: {done: true, iteration: N, files_changed: ["file.swift"]}`

---

## Step 6: Build

```bash
xcodebuild build -scheme DirtSync -destination "platform=iOS Simulator,name=iPhone 16 Pro" 2>&1 | tail -5
```

**If build FAILS:** Fix the error. Do not continue until build passes.

**Track:** `step_6: {done: true, build: "pass"}`

---

## Step 6.5: Run Test — GREEN

Run YOUR test from Step 4.75:
```bash
xcodebuild test -scheme DirtSync -destination "platform=iOS Simulator,name=iPhone 16 Pro" \
  -only-testing:DirtSyncTests/YourTestClass/testYourTest 2>&1 | tail -10
```

- **PASS** → continue
- **FAIL** → go back to Step 5. Iteration count += 1.

Then run the FULL suite:
```bash
xcodebuild test -scheme DirtSync -destination "platform=iOS Simulator,name=iPhone 16 Pro" 2>&1 | tail -20
```

**If ANY existing test fails:** Fix it. Your fix must not break anything.

**Post to issue:** "Step 6.5: [TestName] now PASSES. Full suite: X/X pass, 0 failures"

**Track:** `step_6.5: {done: true, test_passed: true, regression_passed: true, total_tests: N}`

---

**Phase 2 complete. Check: does this issue involve anything VISIBLE?**
- **YES** → Load `03-visual-proof.md`
- **NO** (pure logic) → Load `04-ship.md`
