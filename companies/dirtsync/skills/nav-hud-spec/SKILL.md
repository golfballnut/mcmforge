---
name: nav-hud-spec
description: Gold Star spec for DirtSync nav HUD — component specs, measurements, colors, instant-fail checklist
---

# Nav HUD Gold Star Spec

Load this skill when working on navigation UI components.

## Components

### 1. Trail Header Bar (ALWAYS VISIBLE)
Shows which trail the rider is on. This is what makes DirtSync a TRAIL app.
- Difficulty color dot: Green=Easy, Blue=Moderate, Black=Hard, Black/Red=Expert, Gold=Single Track
- Trail name from TrailDetectionService
- System name smaller underneath (suppressed when redundant with trail name)
- Updates when rider crosses trail boundary

### 2. Destination in ETA Bar
```
To Burning Rock Trailhead
3 min · 1.1 mi · Arriving 10:25 AM
[progress bar]                    [^] [X]
```

### 3. Recenter Button
Appears when rider pans map. Tapping restores `.followWithCourse`.
- CRITICAL: NEVER call `setCenterCoordinate` — kills tracking silently
- Use `mapView.userTrackingMode = .followWithCourse`

### 4. Zoom +/- Buttons
Riders wear gloves — can't pinch. Physical buttons on right side.

## Element Dimensions

| Element | Spec Value | Tolerance |
|---------|-----------|-----------|
| Turn icon | 58x58 circle | ±2pt |
| Distance font | 34pt Heavy | ±1pt |
| Card corner radius | 20pt | ±2pt |
| Orange accent line | 2.5pt | ±0.5pt |
| Speed badge circle | 74pt | ±2pt |
| Speed font | 34pt Heavy rounded | ±1pt |
| mph label | 10pt semibold lowercase | exact |
| ETA time font | 22pt Heavy | ±1pt |
| Progress bar height | 2.5pt | ±0.5pt |
| End button | 40x40 circle | ±2pt |

## Colors

| Element | Hex |
|---------|-----|
| Orange accent | #FF9500 → #EA580C gradient |
| Card overlay | #121218 at 85% |
| Card border | white at 10% |
| Speed over-limit | #D11717 (Waze red) |
| End button | #FF3B30 (iOS red) |

## Instant Fail Checklist
- Login screen or onboarding visible
- System dialog blocking the UI
- Speed showing "0 mph" in nav screenshot
- Debug/test trail names
- Map tiles missing
- Elements overlapping
- Text truncated or clipped

## The 10/10 Bar
A screenshot is 10/10 when a stranger would download the app based on it alone.
