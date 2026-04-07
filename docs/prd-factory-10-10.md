# PRD: Factory 10/10 — Autonomous App Shipping

## Vision
Steve creates an issue on his phone. He walks away. He comes back to a thoroughly tested, feature-rich app ready to distribute to users via TestFlight. No debugging, no manual patches, no babysitting agents.

## Success Criteria
Steve can:
1. Create an issue with a one-line description
2. Walk away for 24 hours
3. Come back to an email with: screenshot proof, test results, PR link
4. Approve the PR
5. App auto-builds to TestFlight

## Current State: 1/10
- Plumbing exists (orchestrator, 14 agents, Mini, simulator)
- No agent has completed a full issue autonomously with screenshot proof
- Tests don't run clean on Mini
- No TestFlight pipeline
- No real trail testing

## Target State: 10/10

---

## Phase 1: Factory Floor Works (1/10 → 4/10)
**Goal:** One issue ships through the full pipeline without intervention.

### P1.1: Fix Mini Build Environment
- [ ] Ferrostar version synced (DONE — commit 9198f8d6)
- [ ] MapStyleManager duplicate removed (DONE — commit 9c40c200)
- [ ] All XCUITests compile and run on Mini
- [ ] NavHUDGoldStarTests: 8/8 pass on Mini
- [ ] Test file auto-added to Xcode project (not manual pbxproj edits)

### P1.2: Test Runner Completes Full Cycle
- [ ] Pull branch on Mini (git fetch + reset --hard)
- [ ] Build succeeds
- [ ] Run tests (specific suite, not full)
- [ ] Take screenshot
- [ ] Email screenshot to Steve
- [ ] Post results to Forge issue
- [ ] Mark in_review
- [ ] All in one run, no retries

### P1.3: Critique Agent Grades
- [ ] Auto-queued after Test Runner marks in_review
- [ ] Reads Test Runner's screenshot
- [ ] Grades against Gold Star spec
- [ ] Posts element-by-element review
- [ ] If <10/10: rejects with specific fix list, iOS Builder auto-wakes
- [ ] If 10/10: approves, Ship Engineer auto-wakes

### P1.4: Ship Engineer Creates PR
- [ ] Reads QA/Critique approval
- [ ] Rebases on master
- [ ] Creates PR with structured body
- [ ] Emails Steve the PR link

**Exit criteria:** One DIRA issue flows: iOS Builder → Test Runner → Critique → Ship. Steve gets email. PR exists.

---

## Phase 2: Quality Gate (4/10 → 6/10)
**Goal:** Every shipped feature is 10/10 quality. No regressions.

### P2.1: Nightly Regression Suite
- [ ] Routine runs all XCUITests on Mini every night at 2 AM
- [ ] Email report: pass/fail counts, screenshots of failures
- [ ] If regressions: auto-create issues assigned to iOS Builder
- [ ] Track pass rate over time (should trend toward 100%)

### P2.2: Real Trail Test Data
- [ ] Replace Kidds Dairy factory routes with Burning Rock real trails
- [ ] GPX files at realistic speeds (15-35 mph)
- [ ] Test all 4 urgency states (navy, orange, red, arrived)
- [ ] Test trail-to-road transitions
- [ ] Test offline mode (no network)

### P2.3: Full User Journey Tests
- [ ] Launch → map loads
- [ ] Search destination → route selection
- [ ] Start navigation → HUD renders
- [ ] Ride recording → save ride
- [ ] View ride history
- [ ] Each journey is one XCUITest class

### P2.4: Offline Testing
- [ ] Airplane mode simulation in tests
- [ ] Map tiles load from cache
- [ ] Trail routing works (Valhalla offline)
- [ ] No crashes, no spinners, no blank screens
- [ ] Network recovery syncs gracefully

**Exit criteria:** Nightly tests run. 95%+ pass rate. All user journeys covered. Offline verified.

---

## Phase 3: Distribution Pipeline (6/10 → 8/10)
**Goal:** App goes from PR merge to TestFlight automatically.

### P3.1: TestFlight Build Pipeline
- [ ] xcodebuild archive produces .ipa
- [ ] Code signing configured (provisioning profile, certificates)
- [ ] altool or Transporter uploads to App Store Connect
- [ ] TestFlight build appears within 30 minutes of merge

### P3.2: Version Management
- [ ] Auto-increment build number on each merge
- [ ] Version follows semver (1.x.y)
- [ ] Release notes generated from merged PR descriptions

### P3.3: Smoke Test After Upload
- [ ] After TestFlight build processes, Test Runner downloads and verifies
- [ ] Basic smoke test: app launches, map loads, navigation starts
- [ ] Email Steve: "Build X.Y.Z ready on TestFlight"

**Exit criteria:** PR merge → TestFlight build appears. Steve gets email. App installs on real device.

---

## Phase 4: Self-Improving Factory (8/10 → 10/10)
**Goal:** Factory gets smarter without human intervention.

### P4.1: Learning Loop
- [ ] Factory Analyst runs daily, produces reports
- [ ] Recurring failures auto-update agent instructions
- [ ] Agent Advisor writes lessons to HEARTBEAT.md files
- [ ] Success rate trends tracked weekly

### P4.2: Research Routines
- [ ] Framework Watch: daily check for Ferrostar/MapLibre/Valhalla updates
- [ ] Competitor Watch: weekly Waze/Strava/onX screenshot comparison
- [ ] Cost Watch: daily agent spend summary, alert on anomalies
- [ ] Security Watch: dependency vulnerability scanning

### P4.3: Feature Pipeline
- [ ] Routines discover opportunities (new framework features, competitor gaps)
- [ ] CEO agent evaluates and creates goals
- [ ] Goals auto-decompose into issues
- [ ] Assembly line builds, tests, ships
- [ ] Steve only approves goals and PRs

### P4.4: Multi-App Template
- [ ] Factory configuration extracted into template
- [ ] New app = new company + new agents + same pipeline
- [ ] Agent instructions parameterized (not DirtSync-specific)

**Exit criteria:** Factory runs 7 days without intervention. Features ship. Quality stays at 10/10. Steve only approves.

---

## Agent Assignments

| Phase | Agent | Role |
|-------|-------|------|
| P1 | **Factory Analyst** | Diagnose blockers, recommend fixes |
| P1 | **Test Runner** | Prove the test→screenshot→email cycle |
| P1 | **Critique Agent** | Grade first screenshot |
| P1 | **iOS Builder** | Fix any code issues Critique finds |
| P1 | **Ship Engineer** | Create first autonomous PR |
| P2 | **Test Writer** | Write regression + journey + offline tests |
| P2 | **Test Runner** | Run nightly suite |
| P2 | **QA Rider** | Deep QA on real trail data |
| P3 | **iOS Builder** | Set up archive + signing + upload |
| P3 | **Ship Engineer** | Wire merge → TestFlight |
| P4 | **Factory Analyst** | Daily reports, learning loop |
| P4 | **Design Scout** | Framework + competitor watch |
| P4 | **CEO** | Evaluate opportunities, create goals |

## Timeline
- **Phase 1:** 2-3 days (prove the pipeline)
- **Phase 2:** 3-5 days (quality + coverage)
- **Phase 3:** 2-3 days (distribution)
- **Phase 4:** Ongoing (self-improvement)

**Total to walk-away confidence: ~10 days**

## Cost Estimate
- Phase 1: ~$30 (agents iterating on pipeline)
- Phase 2: ~$50 (test writing + nightly runs)
- Phase 3: ~$20 (build pipeline setup)
- Phase 4: ~$5/day ongoing (routines + reports)
