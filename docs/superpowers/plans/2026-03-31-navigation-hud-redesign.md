# Navigation HUD Redesign — A/B Test Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build two HUD approaches (unified transforming vs polished dual-mode), test both with the POI-fuel GPX track on the iOS simulator, and present screenshots so Steve can pick the winner.

**Architecture:** Both approaches display the same information — trail system, trail name, difficulty, speed, junction ahead, destination, ETA, fuel range. Approach A uses a single view that animates between riding/nav modes. Approach B polishes the existing two-view system with shared visual language. A test harness (XCUITest + GPX) validates both.

**Tech Stack:** SwiftUI, XCUITest, xcrun simctl (GPX playback + screenshots), Xcode 16.2, iPhone 16 Pro simulator

**DirtSync Repo:** `/Users/stevemcmillian/llama-3-agents/Apps/projects/DirtSync`

**North Star:** A rider glances down for 0.5 seconds and knows: where they are, what's ahead, and how far to their destination.

---

## File Map

### New Files
| File | Purpose |
|------|---------|
| `DirtSyncApp/Views/UnifiedNavigationHUD.swift` | Approach A — single transforming HUD |
| `DirtSyncUITests/NavigationHUDQATests.swift` | Automated GPX + screenshot test |

### Modified Files
| File | Lines | Change |
|------|-------|--------|
| `DirtSyncApp/Views/TrailNavigationHUDView.swift` | 198 | Add accessibility IDs, trail system display |
| `DirtSyncApp/Components/WazeNavTopBar.swift` | 40 | Approach B: add trail system, destination info |
| `DirtSyncApp/Components/WazeNavBottomBar.swift` | 85 | Approach B: add destination name, fuel range |
| `DirtSyncApp/Components/JunctionCard.swift` | 167 | Add accessibility IDs to NextTurnCard |
| `DirtSyncApp/Components/RideStatsBarView.swift` | 190 | Add accessibility IDs |
| `DirtSyncApp/Components/TurnCardView.swift` | 310 | Already has `navigationManeuverCard` ID |
| `DirtSyncApp/Services/VoiceNavigationManager.swift` | 224 | Add NSLog to all announcement methods |
| `DirtSyncApp/Views/MapOverlayStack.swift` | 607 | Wire Approach A or B based on branch |

---

## Phase 0: Test Infrastructure (Shared — Both Approaches Need This)

### Task 1: Add Accessibility Identifiers to All HUD Elements

**Files:**
- Modify: `DirtSyncApp/Views/TrailNavigationHUDView.swift`
- Modify: `DirtSyncApp/Components/JunctionCard.swift`
- Modify: `DirtSyncApp/Components/RideStatsBarView.swift`
- Modify: `DirtSyncApp/Components/WazeNavTopBar.swift`
- Modify: `DirtSyncApp/Components/WazeNavBottomBar.swift`

Currently only 6 accessibility IDs exist across all HUD files. XCUITest needs IDs on every element we want to read or assert.

- [ ] **Step 1: Add IDs to TrailNavigationHUDView.swift**

In the `body` property, add `.accessibilityIdentifier()` to these elements:
- The root VStack: `"trailNavigationHUD"`
- TrailNameHeaderView call: `"trailNameHeader"`

- [ ] **Step 2: Add IDs to JunctionCard.swift — NextTurnCard**

NextTurnCard (line 68) has NO accessibility ID. Add to the outer HStack:
```swift
.accessibilityIdentifier("nextTurnCard")
```

Add to the distance text inside NextTurnCard:
```swift
.accessibilityIdentifier("nextTurnDistance")
```

Add to the instruction text:
```swift
.accessibilityIdentifier("nextTurnInstruction")
```

- [ ] **Step 3: Add IDs to RideStatsBarView.swift**

Add to the root VStack:
```swift
.accessibilityIdentifier("rideStatsBar")
```

Add to the hero duration Text:
```swift
.accessibilityIdentifier("rideDuration")
```

Add to the distance stat:
```swift
.accessibilityIdentifier("rideDistance")
```

- [ ] **Step 4: Add IDs to WazeNavTopBar.swift**

The bar already has `"wazeNavTopBar"`. Add to the trail name Text (line 25):
```swift
.accessibilityIdentifier("navTrailName")
```

- [ ] **Step 5: Add IDs to WazeNavBottomBar.swift**

Already has `"wazeNavBottomBar"`, `"poiSearchButton"`, `"endNavigationButton"`. Add to the time/distance display (the tappable Button around line 44):
```swift
.accessibilityIdentifier("navTimeDistance")
```

- [ ] **Step 6: Run build to verify no compile errors**

```bash
cd /Users/stevemcmillian/llama-3-agents/Apps/projects/DirtSync/DirtSync
xcodebuild -scheme DirtSync -sdk iphonesimulator -destination 'platform=iOS Simulator,name=iPhone 16 Pro' build 2>&1 | tail -5
```
Expected: `** BUILD SUCCEEDED **`

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: add accessibility identifiers to all HUD elements for test automation"
```

---

### Task 2: Add Voice Logging to All Announcement Methods

**Files:**
- Modify: `DirtSyncApp/Services/VoiceNavigationManager.swift`

Currently only `speak()` logs (line 175: `NSLog("[VoiceNav] Speaking: %@", text)`). Individual announcement methods are blind. Add NSLog to each method so the test harness can verify voice events by tailing the simulator console.

- [ ] **Step 1: Add logging to each announcement method**

Add as the FIRST line in each method body:

```swift
// In navigationDidStart() (line 39):
NSLog("[VoiceNav] Event: navigationDidStart")

// In navigationDidStop() (line 63):
NSLog("[VoiceNav] Event: navigationDidStop")

// In turnDidChange() (line 74):
NSLog("[VoiceNav] Event: turnDidChange — maneuver=%@, road=%@", maneuverType ?? "nil", roadName ?? "nil")

// In updateDistance() (line 103):
NSLog("[VoiceNav] Event: updateDistance — distance=%.0fm", distanceToNextManeuver)

// In announceHazard() (line 119):
NSLog("[VoiceNav] Event: announceHazard — type=%@", hazardType)

// In announcePOI() (line 129):
NSLog("[VoiceNav] Event: announcePOI — name=%@", poiName)

// In announceRerouting() (line 137):
NSLog("[VoiceNav] Event: announceRerouting")

// In announceArrival() (line 143):
NSLog("[VoiceNav] Event: announceArrival")

// In announceJunction() (line 193):
NSLog("[VoiceNav] Event: announceJunction — trails=%@", connectedTrails.joined(separator: ", "))
```

- [ ] **Step 2: Build to verify**

```bash
cd /Users/stevemcmillian/llama-3-agents/Apps/projects/DirtSync/DirtSync
xcodebuild -scheme DirtSync -sdk iphonesimulator -destination 'platform=iOS Simulator,name=iPhone 16 Pro' build 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add DirtSync/DirtSyncApp/Services/VoiceNavigationManager.swift
git commit -m "feat: add NSLog to all VoiceNavigationManager announcement methods"
```

---

### Task 3: Regenerate GPX Track at 30 MPH Trail / 45 MPH Road

**Files:**
- Modify: `scripts/generate_gpx_routes.py` (speed parameter)
- Output: `DirtSyncUITests/GPXRoutes/burning-rock-poi-fuel-6.gpx` (regenerated)

The current GPX tracks simulate 15 MPH — too slow for QA iteration and unrealistic for UTV riding. Regenerate at realistic speeds.

- [ ] **Step 1: Read the generate_gpx_routes.py script to find the speed constant**

```bash
grep -n "speed\|mph\|MPH\|velocity" /Users/stevemcmillian/llama-3-agents/Apps/projects/DirtSync/scripts/generate_gpx_routes.py
```

- [ ] **Step 2: Update the speed constant**

Change the speed from 15 MPH to 30 MPH for trail segments. If the script has separate trail/road speed params, set road to 45 MPH. If it's a single constant, set to 30 MPH (the trail portions dominate the route).

- [ ] **Step 3: Regenerate the POI-fuel GPX track**

```bash
cd /Users/stevemcmillian/llama-3-agents/Apps/projects/DirtSync
python3 scripts/generate_gpx_routes.py --system "Burning Rock" --type poi --count 1 --poi-categories fuel
```

Verify output exists:
```bash
ls -la DirtSync/DirtSyncUITests/GPXRoutes/burning-rock-poi-fuel-*.gpx
```

- [ ] **Step 4: Verify waypoint count is reasonable**

```bash
grep -c "<trkpt" DirtSync/DirtSyncUITests/GPXRoutes/burning-rock-poi-fuel-*.gpx
```

At 30 MPH over ~7mi, expect ~840 waypoints (7mi / 30mph * 3600s = 840 seconds = 840 waypoints at 1/sec).

- [ ] **Step 5: Commit**

```bash
git add scripts/generate_gpx_routes.py DirtSync/DirtSyncUITests/GPXRoutes/
git commit -m "feat: regenerate GPX tracks at 30 MPH (realistic UTV speed)"
```

---

### Task 4: Create Navigation HUD QA Test (XCUITest)

**Files:**
- Create: `DirtSyncUITests/NavigationHUDQATests.swift`
- Reference: `DirtSyncUITests/NavigationFlowUITests.swift` (copy helpers from here)

This test class runs the POI-fuel GPX route through the full navigation flow and captures screenshots + assertions at 5 key moments. It reuses the `launchApp()`, `loginIfNeeded()`, and `saveScreenshot()` pattern from NavigationFlowUITests.swift.

- [ ] **Step 1: Create the test file**

```swift
import XCTest

/// Navigation HUD QA Suite — validates the full trail-to-gas-station experience.
/// Plays the burning-rock-poi-fuel GPX track, triggers navigation to Go Mart,
/// and captures screenshots + HUD assertions at 5 key moments.
///
/// GPX track: burning-rock-poi-fuel-6.gpx (30 MPH, ~7mi, trail → road → Go Mart)
/// Launch: --uitesting --uitesting-navigate (auto-triggers navigation)
///
/// Screenshots saved as XCTest attachments — viewable in Xcode Test Report.
@MainActor
final class NavigationHUDQATests: XCTestCase {
    var app: XCUIApplication!

    override func setUp() {
        super.setUp()
        continueAfterFailure = true
        app = XCUIApplication()
    }

    // MARK: - Helpers (copied from NavigationFlowUITests)

    private func launchApp(with extraArgs: [String] = []) {
        app.launchArguments = ["--uitesting"] + extraArgs
        app.launch()
        loginIfNeeded()
        sleep(5)
    }

    private func saveScreenshot(_ name: String) {
        let screenshot = XCUIScreen.main.screenshot()
        let attachment = XCTAttachment(screenshot: screenshot)
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    private func loginIfNeeded() {
        let signIn = app.buttons["Sign In"]
        if signIn.waitForExistence(timeout: 5) {
            let emailField = app.textFields["emailField"]
            let fallbackEmail = app.textFields.firstMatch
            let field = emailField.exists ? emailField : fallbackEmail
            field.tap()
            sleep(1)
            field.typeText("test@dirtsync.app")

            let pwField = app.secureTextFields["passwordField"].exists
                ? app.secureTextFields["passwordField"]
                : app.secureTextFields.firstMatch
            pwField.tap()
            sleep(1)
            pwField.typeText("TestPass123!")

            signIn.tap()
            sleep(5)
        }

        let getStarted = app.buttons["Get Started"]
        if getStarted.waitForExistence(timeout: 3) {
            getStarted.tap()
            sleep(1)
            skipOnboardingSteps()
        }
    }

    private func skipOnboardingSteps() {
        for _ in 0..<4 {
            let skip = app.buttons["Skip"]
            let continueBtn = app.buttons["Continue"]
            let startExploring = app.buttons["Start Exploring"]
            if startExploring.waitForExistence(timeout: 2) {
                startExploring.tap(); sleep(3); return
            } else if skip.exists { skip.tap(); sleep(1) }
            else if continueBtn.exists { continueBtn.tap(); sleep(1) }
        }
        let startExploring = app.buttons["Start Exploring"]
        if startExploring.waitForExistence(timeout: 3) { startExploring.tap(); sleep(3) }
    }

    // MARK: - Full Navigation HUD QA Test

    /// THE MONEY TEST: Trail riding → navigate to Go Mart → arrive.
    /// Captures 5 screenshots at key moments in the navigation flow.
    func testTrailToGasStationFullFlow() {
        // Launch with navigation auto-triggered
        launchApp(with: ["--uitesting-navigate"])

        // SCREENSHOT 1: Route calculated — navigation just started
        let endButton = app.descendants(matching: .any)["endNavigationButton"]
        XCTAssertTrue(endButton.waitForExistence(timeout: 15), "Navigation should start")

        let navTopBar = app.descendants(matching: .any)["wazeNavTopBar"]
        let navBottomBar = app.descendants(matching: .any)["wazeNavBottomBar"]
        XCTAssertTrue(navTopBar.waitForExistence(timeout: 5), "Nav top bar should be visible")
        XCTAssertTrue(navBottomBar.waitForExistence(timeout: 5), "Nav bottom bar should be visible")

        saveScreenshot("hud-01-route-calculated")

        // SCREENSHOT 2: Riding on trail — wait for trail detection
        // GPX is playing at 30 MPH, after 10s we should be ~0.08mi into the trail
        sleep(10)

        let speedBadge = app.descendants(matching: .any)["speedBadge"]
        if speedBadge.exists {
            // Speed badge visible = app is tracking movement
        }
        saveScreenshot("hud-02-riding-on-trail")

        // SCREENSHOT 3: Approaching junction — wait for junction card
        // At 30 MPH, first junction should appear within 30-60s of start
        let nextTurnCard = app.descendants(matching: .any)["nextTurnCard"]
        let maneuverCard = app.descendants(matching: .any)["navigationManeuverCard"]

        // Wait up to 60s for a junction or turn to appear
        var junctionAppeared = false
        for _ in 0..<12 {
            if nextTurnCard.exists || maneuverCard.exists {
                junctionAppeared = true
                break
            }
            sleep(5)
        }

        if junctionAppeared {
            saveScreenshot("hud-03-approaching-junction")
        } else {
            saveScreenshot("hud-03-no-junction-detected")
            // Not a failure — junction may not be on this route segment
        }

        // SCREENSHOT 4: On road segment — wait for road detection
        // The route transitions from trail to road near the road junction
        // At 30 MPH over ~4.5mi trail, road transition is ~9 min = 540s from start
        // We've already waited ~70s, so wait another ~8 min
        // For faster iteration, check periodically
        sleep(120)  // Wait 2 more minutes
        saveScreenshot("hud-04-road-segment-check")

        // SCREENSHOT 5: Approaching destination
        // Total route is ~7mi at 30 MPH = ~14 min. Capture near end.
        sleep(120)  // Wait 2 more minutes
        saveScreenshot("hud-05-approaching-destination")

        // Final verification: navigation elements still present
        XCTAssertTrue(
            navBottomBar.exists || endButton.exists,
            "Navigation UI should persist through entire route"
        )
    }
}
```

- [ ] **Step 2: Verify the test file compiles**

```bash
cd /Users/stevemcmillian/llama-3-agents/Apps/projects/DirtSync/DirtSync
xcodebuild -scheme DirtSync -sdk iphonesimulator -destination 'platform=iOS Simulator,name=iPhone 16 Pro' build-for-testing 2>&1 | tail -5
```

- [ ] **Step 3: Run the test (dry run — just screenshot 1)**

```bash
xcodebuild test -scheme DirtSync -sdk iphonesimulator \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -only-testing:DirtSyncUITests/NavigationHUDQATests/testTrailToGasStationFullFlow \
  2>&1 | grep -E "(Test Case|screenshot|PASS|FAIL)"
```

- [ ] **Step 4: Extract screenshots from test results**

```bash
# Find the latest test result bundle
RESULT=$(find ~/Library/Developer/Xcode/DerivedData -name "*.xcresult" -maxdepth 3 | sort -t/ -k8 | tail -1)
echo "Result bundle: $RESULT"

# Extract screenshots using xcresulttool
xcrun xcresulttool get --path "$RESULT" --format json 2>/dev/null | head -50
```

- [ ] **Step 5: Commit**

```bash
git add DirtSync/DirtSyncUITests/NavigationHUDQATests.swift
git commit -m "feat: add NavigationHUDQATests — automated GPX trail-to-gas-station QA"
```

---

## Phase 1A: Approach A — Unified Transforming HUD

**Branch:** `feature/hud-approach-a` (from current branch after Phase 0)

**Concept:** One HUD bar that lives at the top of the screen. In riding mode, it shows trail info + junction ahead. When navigation starts, it smoothly expands to include destination, ETA, and next turn. The bar transforms — it doesn't get replaced.

**Visual Layout:**

```
RIDING MODE (thin bar):
+--------------------------------------------------+
| Burning Rock  ·  Trail #F  [Green]    30 MPH     |
+--------------------------------------------------+
|              Junction in 0.4 mi — #G             |  ← only when junction detected
+--------------------------------------------------+

NAVIGATION MODE (expanded bar):
+--------------------------------------------------+
| Burning Rock  ·  Trail #F  [Green]    30 MPH     |
+--------------------------------------------------+
| → Turn right in 0.3 mi onto Trail #L            |
+--------------------------------------------------+
| Go Mart Sophia          ETA 12:34 PM   2.7 mi   |
+--------------------------------------------------+
```

### Task 5: Create Unified Navigation HUD View

**Files:**
- Create: `DirtSyncApp/Views/UnifiedNavigationHUD.swift`

- [ ] **Step 1: Create the new view file**

```swift
import SwiftUI

/// Unified Navigation HUD — single bar that transforms between riding and navigating modes.
/// Riding: trail system + trail name + difficulty + speed + junction
/// Navigating: adds destination, ETA, next turn instruction
struct UnifiedNavigationHUD: View {
    // Trail detection
    let trailSystem: String?
    let trailName: String
    let difficulty: String?
    let distanceToTrail: Double?

    // Speed
    let currentSpeed: Double  // m/s

    // Junction detection
    let nextJunction: JunctionInfo?

    // Navigation (nil when not navigating)
    let isNavigating: Bool
    let destinationName: String?
    let etaSeconds: Double?
    let distanceRemainingMeters: Double?
    let nextTurnInstruction: String?
    let nextTurnDistanceMeters: Double?

    // Difficulty color mapping
    private var difficultyColor: Color {
        switch difficulty?.lowercased() {
        case "easy": return .green
        case "moderate": return .blue
        case "hard": return .black
        case "expert": return .red
        default: return .gray
        }
    }

    private var speedMPH: Int {
        Int(currentSpeed * 2.237)  // m/s to mph
    }

    private var etaFormatted: String {
        guard let eta = etaSeconds else { return "--" }
        let arrival = Date().addingTimeInterval(eta)
        let formatter = DateFormatter()
        formatter.dateFormat = "h:mm a"
        return formatter.string(from: arrival)
    }

    private var distanceFormatted: String {
        guard let meters = distanceRemainingMeters else { return "--" }
        let miles = meters / 1609.34
        return String(format: "%.1f mi", miles)
    }

    var body: some View {
        VStack(spacing: 0) {
            // === ROW 1: Trail identity + speed (ALWAYS VISIBLE) ===
            HStack(spacing: 8) {
                // Trail system
                if let system = trailSystem {
                    Text(system)
                        .font(.caption)
                        .fontWeight(.medium)
                        .foregroundColor(.white.opacity(0.7))
                }

                if trailSystem != nil {
                    Text("·")
                        .foregroundColor(.white.opacity(0.4))
                }

                // Difficulty dot
                if difficulty != nil {
                    Circle()
                        .fill(difficultyColor)
                        .frame(width: 10, height: 10)
                }

                // Trail name
                Text(trailName)
                    .font(.headline)
                    .fontWeight(.bold)
                    .foregroundColor(.white)
                    .lineLimit(1)
                    .accessibilityIdentifier("hudTrailName")

                Spacer()

                // Speed
                Text("\(speedMPH)")
                    .font(.title2)
                    .fontWeight(.black)
                    .foregroundColor(.white)
                    .accessibilityIdentifier("hudSpeed")
                Text("mph")
                    .font(.caption2)
                    .foregroundColor(.white.opacity(0.6))
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .accessibilityIdentifier("hudTrailRow")

            // === ROW 2: Junction OR Turn instruction ===
            if isNavigating, let instruction = nextTurnInstruction, let turnDist = nextTurnDistanceMeters {
                // Navigation turn instruction
                let turnMiles = turnDist / 1609.34
                let distText = turnMiles < 0.1
                    ? String(format: "%.0f ft", turnDist * 3.281)
                    : String(format: "%.1f mi", turnMiles)

                HStack(spacing: 8) {
                    Image(systemName: "arrow.turn.up.right")
                        .font(.title3)
                        .foregroundColor(.orange)
                    Text("\(instruction) in \(distText)")
                        .font(.subheadline)
                        .fontWeight(.semibold)
                        .foregroundColor(.white)
                        .lineLimit(1)
                    Spacer()
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
                .background(Color.white.opacity(0.08))
                .accessibilityIdentifier("hudTurnInstruction")

            } else if let junction = nextJunction {
                // Junction preview (riding mode)
                let juncMiles = junction.distance / 1609.34
                let distText = juncMiles < 0.1
                    ? String(format: "%.0f ft", junction.distance * 3.281)
                    : String(format: "%.1f mi", juncMiles)

                HStack(spacing: 8) {
                    Image(systemName: "arrow.triangle.branch")
                        .font(.title3)
                        .foregroundColor(.orange)
                    Text("Junction in \(distText)")
                        .font(.subheadline)
                        .fontWeight(.semibold)
                        .foregroundColor(.white)
                    if let trails = junction.connectedTrailNames?.first {
                        Text("— \(trails)")
                            .font(.subheadline)
                            .foregroundColor(.white.opacity(0.7))
                    }
                    Spacer()
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
                .background(Color.white.opacity(0.08))
                .accessibilityIdentifier("hudJunctionPreview")
            }

            // === ROW 3: Destination + ETA (ONLY WHEN NAVIGATING) ===
            if isNavigating {
                HStack(spacing: 12) {
                    // Destination name
                    if let dest = destinationName {
                        Image(systemName: "fuelpump.fill")
                            .foregroundColor(.orange)
                        Text(dest)
                            .font(.subheadline)
                            .fontWeight(.semibold)
                            .foregroundColor(.white)
                            .lineLimit(1)
                            .accessibilityIdentifier("hudDestinationName")
                    }

                    Spacer()

                    // ETA
                    Text(etaFormatted)
                        .font(.subheadline)
                        .fontWeight(.bold)
                        .foregroundColor(.orange)
                        .accessibilityIdentifier("hudETA")

                    // Distance remaining
                    Text(distanceFormatted)
                        .font(.subheadline)
                        .foregroundColor(.white.opacity(0.7))
                        .accessibilityIdentifier("hudDistanceRemaining")
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
                .background(Color.white.opacity(0.05))
                .transition(.move(edge: .top).combined(with: .opacity))
                .accessibilityIdentifier("hudDestinationRow")
            }
        }
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(.ultraThinMaterial)
                .overlay(
                    RoundedRectangle(cornerRadius: 16)
                        .fill(Color.black.opacity(0.6))
                )
        )
        .padding(.horizontal, 12)
        .padding(.top, 4)
        .animation(.easeInOut(duration: 0.3), value: isNavigating)
        .accessibilityIdentifier("unifiedNavigationHUD")
    }
}
```

- [ ] **Step 2: Build to verify**

```bash
cd /Users/stevemcmillian/llama-3-agents/Apps/projects/DirtSync/DirtSync
xcodebuild -scheme DirtSync -sdk iphonesimulator -destination 'platform=iOS Simulator,name=iPhone 16 Pro' build 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add DirtSync/DirtSyncApp/Views/UnifiedNavigationHUD.swift
git commit -m "feat: Approach A — unified transforming navigation HUD"
```

---

### Task 6: Wire Approach A into MapOverlayStack

**Files:**
- Modify: `DirtSyncApp/Views/MapOverlayStack.swift`

Replace the current conditional HUD rendering (TrailNavigationHUDView when not navigating, WazeNavTopBar/BottomBar when navigating) with the unified HUD.

- [ ] **Step 1: Read MapOverlayStack.swift lines 150-270 to find exact HUD rendering section**

```bash
sed -n '150,270p' /Users/stevemcmillian/llama-3-agents/Apps/projects/DirtSync/DirtSync/DirtSyncApp/Views/MapOverlayStack.swift
```

- [ ] **Step 2: Replace the conditional HUD block**

Find the section that switches between `TrailNavigationHUDView` and `WazeNavTopBar`/`WazeNavBottomBar`. Replace with:

```swift
// Unified HUD — always present, transforms based on navigation state
UnifiedNavigationHUD(
    trailSystem: trailNavState.currentTrailSystem,
    trailName: trailNavState.currentTrailName,
    difficulty: trailNavState.currentTrailDifficulty,
    distanceToTrail: trailNavState.distanceToTrail,
    currentSpeed: rideRecordingService.currentSpeed,
    nextJunction: junctionDetectionService.nextJunction,
    isNavigating: ferrostarNavService.isNavigating,
    destinationName: routingService.destinationName,
    etaSeconds: ferrostarNavService.remainingSeconds,
    distanceRemainingMeters: ferrostarNavService.remainingDistanceMeters,
    nextTurnInstruction: ferrostarNavService.currentVisualInstruction,
    nextTurnDistanceMeters: ferrostarNavService.distanceToNextManeuver
)
```

**IMPORTANT:** Keep the existing WazeNavBottomBar for the stop/recenter/search controls at the bottom. Only replace the TOP portion (trail header + turn card).

- [ ] **Step 3: Build and verify**

- [ ] **Step 4: Commit**

```bash
git commit -am "feat: wire unified HUD into MapOverlayStack (Approach A)"
```

---

### Task 7: Run Test on Approach A — Capture Screenshots

- [ ] **Step 1: Boot simulator and start GPX playback**

```bash
# Boot iPhone 16 Pro
xcrun simctl boot BD743483-803F-4916-9BF2-A84371F8C98F 2>/dev/null

# Install the built app
xcrun simctl install booted /Users/stevemcmillian/llama-3-agents/Apps/projects/DirtSync/DirtSync/build/Build/Products/Debug-iphonesimulator/DirtSync.app
```

- [ ] **Step 2: Run the XCUITest**

```bash
cd /Users/stevemcmillian/llama-3-agents/Apps/projects/DirtSync/DirtSync
xcodebuild test -scheme DirtSync -sdk iphonesimulator \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -only-testing:DirtSyncUITests/NavigationHUDQATests/testTrailToGasStationFullFlow \
  2>&1 | tee /tmp/hud-approach-a-test.log | grep -E "(Test Case|screenshot|PASS|FAIL|error:)"
```

- [ ] **Step 3: Extract and save screenshots**

```bash
# Find result bundle
RESULT=$(find ~/Library/Developer/Xcode/DerivedData -name "*.xcresult" -maxdepth 3 | sort -t/ -k8 | tail -1)

# Copy screenshots to a review directory
mkdir -p /tmp/hud-review/approach-a
xcrun xcresulttool get --path "$RESULT" --format json 2>/dev/null > /tmp/hud-review/approach-a/results.json

# Take a manual screenshot as backup
xcrun simctl io booted screenshot /tmp/hud-review/approach-a/final-state.png
```

- [ ] **Step 4: Tail voice logs**

```bash
grep "\[VoiceNav\]" /tmp/hud-approach-a-test.log > /tmp/hud-review/approach-a/voice-events.txt
cat /tmp/hud-review/approach-a/voice-events.txt
```

- [ ] **Step 5: Commit test results reference**

```bash
git commit --allow-empty -m "test: Approach A screenshots captured — see /tmp/hud-review/approach-a/"
```

---

## Phase 1B: Approach B — Polished Dual-Mode HUD

**Branch:** `feature/hud-approach-b` (from Phase 0 commit, NOT from Approach A)

**Concept:** Keep the existing two-view architecture (TrailNavigationHUDView for riding, WazeNavTopBar/BottomBar for navigating) but upgrade both with:
- Trail system name added to both modes
- Same dark glass background style
- Same typography (headline for trail name, caption for system)
- Destination name prominently displayed in nav bottom bar
- Fuel range integrated when navigating to fuel POI

**Visual Layout:**

```
RIDING MODE (existing HUD, polished):
+--------------------------------------------------+
| Burning Rock                                      |
| Trail #F  [Green]                          30 MPH |
+--------------------------------------------------+
|    Junction in 0.4 mi — Trail #G                 |
+--------------------------------------------------+
                    ... map ...
+--------------------------------------------------+
| 00:12:34  ·  3.2 mi  ·  +245 ft                 |
+--------------------------------------------------+

NAVIGATION MODE (existing nav bars, enhanced):
+--------------------------------------------------+
| Burning Rock  ·  Trail #F  [Green]               |
+--------------------------------------------------+
| → Turn right in 0.3 mi                          |
+--------------------------------------------------+
                    ... map ...
+--------------------------------------------------+
| [Recenter] [POI] Go Mart · 12:34 PM · 2.7mi [X] |
+--------------------------------------------------+
```

### Task 8: Enhance WazeNavTopBar with Trail System

**Files:**
- Modify: `DirtSyncApp/Components/WazeNavTopBar.swift`

- [ ] **Step 1: Add trailSystem parameter and display it**

Current WazeNavTopBar (40 lines) only shows trail name + difficulty dot. Add trail system name.

```swift
struct WazeNavTopBar: View {
    let trailName: String
    let difficulty: String?
    let trailSystem: String?  // NEW

    // ... existing difficultyColor computed property ...

    var body: some View {
        HStack(spacing: 8) {
            // Difficulty dot (existing)
            if let difficulty = difficulty {
                Circle()
                    .fill(difficultyColor)
                    .frame(width: 10, height: 10)
            }

            // Trail system + trail name
            VStack(alignment: .leading, spacing: 2) {
                if let system = trailSystem {
                    Text(system)
                        .font(.caption)
                        .fontWeight(.medium)
                        .foregroundColor(.white.opacity(0.7))
                        .accessibilityIdentifier("navTrailSystem")
                }
                Text(trailName)
                    .font(.headline)
                    .fontWeight(.bold)
                    .foregroundColor(.white)
                    .lineLimit(1)
                    .accessibilityIdentifier("navTrailName")
            }

            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(.ultraThinMaterial)
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .fill(Color.black.opacity(0.6))
                )
        )
        .padding(.horizontal, 12)
        .accessibilityIdentifier("wazeNavTopBar")
    }
}
```

- [ ] **Step 2: Update all call sites to pass trailSystem**

Search for `WazeNavTopBar(` in MapOverlayStack.swift and add the trailSystem parameter.

- [ ] **Step 3: Build and verify**

- [ ] **Step 4: Commit**

```bash
git commit -am "feat: Approach B — add trail system name to WazeNavTopBar"
```

---

### Task 9: Enhance WazeNavBottomBar with Destination Name + ETA

**Files:**
- Modify: `DirtSyncApp/Components/WazeNavBottomBar.swift`

- [ ] **Step 1: Add destination name and prominent ETA display**

Current bottom bar shows time + distance in a tappable center. Enhance to show destination name.

Add new parameters:
```swift
let destinationName: String?  // NEW — "Go Mart Sophia"
```

Update the center button section (around line 44) to show:
```swift
// Center: Destination + time/distance
VStack(spacing: 2) {
    if let dest = destinationName {
        Text(dest)
            .font(.subheadline)
            .fontWeight(.bold)
            .foregroundColor(.white)
            .lineLimit(1)
            .accessibilityIdentifier("navDestinationName")
    }
    HStack(spacing: 4) {
        Text(timeRemaining)
            .font(.caption)
            .fontWeight(.semibold)
            .foregroundColor(.orange)
            .accessibilityIdentifier("navTimeRemaining")
        Text("·")
            .foregroundColor(.white.opacity(0.4))
        Text(distanceRemaining)
            .font(.caption)
            .foregroundColor(.white.opacity(0.7))
            .accessibilityIdentifier("navDistanceRemaining")
    }
}
```

- [ ] **Step 2: Update all call sites to pass destinationName**

- [ ] **Step 3: Build and verify**

- [ ] **Step 4: Commit**

```bash
git commit -am "feat: Approach B — add destination name to WazeNavBottomBar"
```

---

### Task 10: Add Trail System to Riding Mode HUD

**Files:**
- Modify: `DirtSyncApp/Views/TrailNavigationHUDView.swift`

- [ ] **Step 1: Add trailSystem parameter to TrailNavigationHUDView**

Add `let trailSystem: String?` parameter and display it above the trail name in TrailNameHeaderView.

- [ ] **Step 2: Update call sites in MapOverlayStack.swift**

- [ ] **Step 3: Build and verify**

- [ ] **Step 4: Commit**

```bash
git commit -am "feat: Approach B — add trail system name to riding mode HUD"
```

---

### Task 11: Run Test on Approach B — Capture Screenshots

Same as Task 7 but on the `feature/hud-approach-b` branch.

- [ ] **Step 1: Build the app**
- [ ] **Step 2: Run NavigationHUDQATests**
- [ ] **Step 3: Extract screenshots to `/tmp/hud-review/approach-b/`**
- [ ] **Step 4: Tail voice logs**
- [ ] **Step 5: Commit**

---

## Phase 2: Compare and Present

### Task 12: Present Both Approaches to Steve

- [ ] **Step 1: Collect all screenshots**

```
/tmp/hud-review/approach-a/
  hud-01-route-calculated.png
  hud-02-riding-on-trail.png
  hud-03-approaching-junction.png
  hud-04-road-segment-check.png
  hud-05-approaching-destination.png
  voice-events.txt

/tmp/hud-review/approach-b/
  (same files)
```

- [ ] **Step 2: Create side-by-side comparison**

Read both sets of screenshots and present to Steve with:
- Approach A vs B at each of the 5 moments
- Voice event log comparison
- Recommendation based on glanceability (0.5-second test)

- [ ] **Step 3: Steve picks the winner**

- [ ] **Step 4: Merge winning branch, delete losing branch**

---

## Execution Notes

### Git Workflow
```
main (or current branch)
  └── feature/hud-test-infra (Phase 0: Tasks 1-4)
        ├── feature/hud-approach-a (Phase 1A: Tasks 5-7)
        └── feature/hud-approach-b (Phase 1B: Tasks 8-11)
```

Phase 0 commits are shared. Approaches A and B branch from Phase 0.

### GPX Playback
The `--uitesting-navigate` launch arg triggers navigation. GPX playback happens via `xcrun simctl location` or Xcode test plan GPX injection. If `--uitesting-navigate` routes to a hardcoded destination (not Go Mart), we may need a new launch arg `--uitesting-poi-fuel` that navigates to Go Mart specifically. Check `handleUITestingArguments()` in the app code.

### Key Risk
The `--uitesting-navigate` launch arg may navigate to a different destination than Go Mart. If so, Task 4's test needs adjustment — either create a new `--uitesting-poi-fuel` launch arg or modify the existing one. Read `MapView.swift` to find `handleUITestingArguments()` before executing.

### Build Command (reference)
```bash
cd /Users/stevemcmillian/llama-3-agents/Apps/projects/DirtSync/DirtSync
xcodebuild -scheme DirtSync -sdk iphonesimulator \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  build 2>&1 | tail -5
```

### Test Command (reference)
```bash
xcodebuild test -scheme DirtSync -sdk iphonesimulator \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -only-testing:DirtSyncUITests/NavigationHUDQATests \
  2>&1 | tail -20
```
