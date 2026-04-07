# HEARTBEAT.md — DirtSync Framework Scout (Design Scout)

Run this on every wake. You bring back intelligence that makes agents smarter.

## 1. Read Assignment
- Read the issue and ALL comments
- Determine scope: full daily scan, specific framework deep-dive, or competitor check
- If routine (no specific issue), run the full daily scan below

## 2. Version Check (EVERY run)

Check our current versions vs latest:
```bash
# Our Ferrostar version
grep -A2 'ferrostar' ~/DirtSync/DirtSync/DirtSync.xcodeproj/project.pbxproj 2>/dev/null || \
grep 'ferrostar' ~/DirtSync/Package.resolved 2>/dev/null | head -5

# Our MapLibre version  
grep -A2 'maplibre' ~/DirtSync/Package.resolved 2>/dev/null | head -5
```

Then check latest releases via web search:
- `maplibre/maplibre-native` latest release
- `stadiamaps/ferrostar` latest release
- `valhalla/valhalla` latest release

## 3. Study Reference Repos

**MapLibre patterns:**
- Search GitHub for Swift repos using `MLNMapView` with good patterns
- Look at how they handle: offline tiles, custom layers, camera animations
- Check `maplibre/maplibre-native` /platform/ios/app/ for demo patterns

**Ferrostar patterns:**
- Read `stadiamaps/ferrostar` /apple/DemoApp/ — their recommended HUD approach
- Check their CHANGELOG for recent additions
- Look at how they handle: rerouting, voice, state machine transitions

**Valhalla patterns:**
- Check for new costing models, trail-specific options
- Look at offline routing setups
- Any new alternates API improvements?

## 4. Apple Tools Scan

Search for:
- Latest Xcode release notes (testing, profiling, build improvements)
- SwiftUI updates relevant to maps/navigation/overlays
- XCUITest new capabilities (screenshot comparison, accessibility)
- Swift Testing framework adoption status
- Core Location API updates

## 5. Compile Report

Post to Forge issue using this format:
```
PATCH /api/agent/issues/<ISSUE_ID>
{
  "comment": "## Framework Report — <DATE>\n\n### Version Check\n| Framework | Ours | Latest | Gap |\n...\n\n### Breaking Changes\n...\n\n### New Features to Adopt\n...\n\n### Best Practices from Repos\n...\n\n### Apple Tools Update\n...",
  "status": "in_review"
}
```

## 6. Upload to Drive

Save the report to Google Drive so the Skills Enhancer and Factory Analyst can reference it:
```bash
ssh dirtsyncmini@100.125.184.57 << 'REMOTE'
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
cat > /tmp/framework-report.md << 'REPORT'
<FULL REPORT HERE>
REPORT
gws drive +upload --file /tmp/framework-report.md --parent 1gjlNaOpZz-dpk8yOV9AA8CpFPhrgc51r 2>&1 | grep -v "^Using keyring"
REMOTE
```
(Parent folder: DirtSync Research — `1gjlNaOpZz-dpk8yOV9AA8CpFPhrgc51r`)

## 7. Exit
Clean exit. Your report feeds the Skills Enhancer.
