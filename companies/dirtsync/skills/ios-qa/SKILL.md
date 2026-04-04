---
name: ios-qa
description: iOS QA domain knowledge — simulator automation, screenshot evaluation, visual spec verification, accessibility auditing, rejection criteria
---

# iOS QA Engineering Domain Skill

You are a quality gate. Your job is to catch visual and UX defects that compilation alone cannot detect. You verify features against measurable design specs using real simulator screenshots.

## Simulator Automation Reference

### Device Boot Sequence
```bash
# Always clean-start
xcrun simctl shutdown all 2>/dev/null
xcrun simctl boot "iPhone 16"

# Wait for boot (important — install fails if device isn't ready)
xcrun simctl bootstatus "iPhone 16" -b

# Install app
xcrun simctl install booted <path-to-.app>

# Launch app
xcrun simctl launch booted <bundle-id>

# Wait for app to render (give SwiftUI time to layout)
sleep 3
```

### Screenshot Capture
```bash
# Single screenshot
xcrun simctl io booted screenshot output.png

# Multiple screenshots (e.g., different states)
for state in default navigation turn-approaching; do
  xcrun simctl io booted screenshot "qa-${state}.png"
done

# Video recording (for animations)
xcrun simctl io booted recordVideo output.mov &
RECORD_PID=$!
sleep 5
kill $RECORD_PID
```

### Device Matrix Testing
```bash
# Available simulators
xcrun simctl list devices available | grep iPhone

# Key devices to test:
# - iPhone SE (3rd gen) — smallest screen, 375pt width
# - iPhone 16 — standard, 393pt width
# - iPhone 16 Pro Max — largest, 430pt width
```

### App State Setup — DirtSync Navigation HUD

DirtSync has built-in launch arguments for testing navigation states. **USE THESE.**

```bash
# ACTIVE NAVIGATION (shows full Waze-style HUD):
xcrun simctl location booted set 37.8181 -78.3864
xcrun simctl launch booted com.dirtsync.DirtSync -- --uitesting-navigate

# ROUTE PREVIEW (shows route selection sheet):
xcrun simctl launch booted com.dirtsync.DirtSync -- --uitesting-route-preview

# STITCHED NAVIGATION (trail+road hybrid):
xcrun simctl launch booted com.dirtsync.DirtSync -- --uitesting-stitched-navigate

# DEEP LINK (alternative — starts demo navigation):
xcrun simctl openurl booted "dirtsync://navigate"
```

**What `--uitesting-navigate` does**: Starts Ferrostar navigation with a mock route (Kidds Dairy Farm → Sketchy Bridge, 0.41 mi, 6 instructions). Shows: WazeNavTopBar, TurnCardView, SpeedBadgeView, WazeNavBottomBar. No manual nav start needed.

**Mock route coordinates** (UITestingRouteFactory.swift):
- Trailhead: 37.8181, -78.3864
- Sketchy Bridge: 37.8176, -78.3915

**Launch args reference** (MapNavigationHelpers.swift lines 465-529):
- `--uitesting-navigate` — Active Ferrostar HUD
- `--uitesting-route-preview` — Multi-junction selection
- `--uitesting-route-preview-alt` — Auto-switch to alt route after 5s
- `--uitesting-stitched-navigate` — Trail+road junction active nav
- `--uitesting-destination-pin` — Destination pin at Sketchy Bridge

## Visual Evaluation Methodology

### What You Check (Priority Order)

#### 1. Layout Correctness
- Elements positioned per spec (top/bottom/center)
- Proper spacing between elements (minimum 8pt between interactive elements)
- Nothing clipped by Safe Area (notch, home indicator, status bar)
- Correct stacking order (z-index — turn card above map, bottom bar above everything)

#### 2. Typography
- Font sizes meet spec minimums (common: 28pt+ for primary nav, 17pt+ for secondary)
- Font weight matches spec (Bold for glanceable text, Regular for detail)
- Text not truncated — full content visible
- Monospaced for numbers (speeds, distances) to prevent layout shift

#### 3. Color & Contrast
- Colors match spec hex values
- Text contrast ratio ≥ 4.5:1 (WCAG AA) against background
- Urgency colors distinguishable: green (#22C55E), yellow (#F59E0B), red (#DC2626)
- Colors work on both map styles (standard + satellite)

#### 4. Touch Targets
- Minimum 44x44pt for all interactive elements (Apple HIG)
- Adequate spacing between adjacent targets (no accidental taps)
- Visual affordance — buttons look tappable

#### 5. Motion & Animation
- Entrance animations smooth (no jarring pops)
- Urgency pulse visible but not distracting
- No animation on critical info (turn direction should be static, not spinning)

#### 6. Device Compatibility
- iPhone SE: nothing cut off, text still readable
- iPhone 16 Pro Max: no excessive whitespace, elements don't float
- Landscape (if supported): layout adapts

#### 7. Accessibility
- VoiceOver: all elements have accessibility labels
- Dynamic Type: layout doesn't break at larger text sizes
- Reduce Motion: animations respect user preference

### Contrast Ratio Quick Reference
```
White (#FFFFFF) on:
  #22C55E (green)  → 2.1:1 ❌ (use dark text)
  #F59E0B (yellow) → 1.8:1 ❌ (use dark text)
  #DC2626 (red)    → 4.6:1 ✅
  #1C1C1E (black)  → 17.4:1 ✅

Black (#000000) on:
  #22C55E (green)  → 10.0:1 ✅
  #F59E0B (yellow) → 11.6:1 ✅
  #DC2626 (red)    → 4.6:1 ✅
  #FFFFFF (white)  → 21.0:1 ✅
```

## Rejection Quality Standards

### Good Rejection (Actionable)
```
❌ REJECTED — Turn card text too small

Expected: 28pt Bold (per spec)
Actual: 18pt Regular (measured from screenshot)
File: Views/Components/TurnCardView.swift:47
Fix: .font(.system(size: 28, weight: .bold, design: .rounded))
```

### Bad Rejection (Vague)
```
❌ REJECTED — Doesn't look right
```
Never do this. Every rejection must have: expected value, actual value, file path, specific fix.

### When to Escalate (Not Reject)
- Spec is ambiguous or contradictory → escalate to CTO
- Feature works but spec seems wrong → escalate to CEO
- Build environment issue → escalate to CTO
- Cannot reach the screen to test → request UI test harness from engineer

## DirtSync-Specific Knowledge

### HUD Component Z-Layering
```
zIndex=10  WazeNavBottomBar (must receive taps)
zIndex=6   SpeedBadgeView (visual only, non-interactive)
default    TurnCardView, TrailNavigationHUDView
bottom     MapControlsPanel, trail popups
```

### Urgency Distance Thresholds
```
Green:    > 804m (0.5mi) — calm, informational
Yellow:   161–804m (0.1–0.5mi) — approaching, pay attention
Red:      < 161m (0.1mi) — imminent, high visibility
Critical: < 61m (200ft) — pulse animation + haptic
Turn card appears: < 152m (500ft)
```

### Trail Difficulty Colors
```
Easy:     #34C759 (green)   — circle.fill
Moderate: #007AFF (blue)    — square.fill
Hard:     #1C1C1E (black)   — diamond.fill
Expert:   #FF3B30 (red)     — star.fill
```

## Rules
1. No screenshots = no verdict. Period.
2. Partial pass = REJECT. Every criterion must pass.
3. No spec = REJECT with "need measurable criteria."
4. Every rejection includes exact file, line, and fix.
5. If you can't reach the screen state, say so — don't fake it.
