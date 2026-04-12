# TOOLS.md — Changelog Expert

Reference commands, source URLs, and file schemas. Load on demand.

---

## Watch List — Exact Fetch Commands

### 1. Claude Code
```bash
curl -sSL "https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md" | head -200
```
Parse for headers like `## X.Y.Z` or `## [X.Y.Z]`.

### 2. MapLibre iOS
GitHub releases API. The iOS repo was consolidated into the unified `maplibre-native` monorepo in 2024 — the old `maplibre-gl-native-ios` URL now 404s. Always use the unified repo:
```bash
curl -sSL -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/maplibre/maplibre-native/releases?per_page=20"
```
Filter releases by tag prefix `ios-` since the monorepo tags all platforms (ios-, android-, gl-js-, etc.). Example tags: `ios-v6.5.0`, `ios-v6.6.0`. Parse: `.[] | select(.tag_name | startswith("ios-")) | .tag_name, .body`.

**If this URL also returns 404 in the future**, fall back to the GitHub web URL `https://github.com/maplibre/maplibre-native/releases` via WebFetch. Do NOT fabricate a version if the source cannot be reached — file a meta-issue instead (see HEARTBEAT step 2).

### 3. Ferrostar
```bash
curl -sSL -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/stadiamaps/ferrostar/releases?per_page=10"
```

### 4. Valhalla
```bash
curl -sSL -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/valhalla/valhalla/releases?per_page=10"
```

### 5. Swift
```bash
curl -sSL "https://raw.githubusercontent.com/apple/swift/main/CHANGELOG.md" | head -500
```

### 6. Supabase JS SDK
```bash
curl -sSL -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/supabase/supabase-js/releases?per_page=10"
```

### 7. Anthropic SDK (Python + TypeScript)
```bash
curl -sSL -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/anthropics/anthropic-sdk-python/releases?per_page=10"

curl -sSL -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/anthropics/anthropic-sdk-typescript/releases?per_page=10"
```

### 8. Xcode / iOS release notes (JS-rendered — use WebFetch)
`https://developer.apple.com/documentation/xcode-release-notes`
`https://developer.apple.com/documentation/ios-release-notes`

If WebFetch is unavailable on this agent's tool budget, skip these and note "Xcode/iOS: manual source — add to LESSONS.md if ever needed."

### 9. Anthropic blog (Claude Code + API updates)
```bash
curl -sSL "https://www.anthropic.com/news" | head -200
```
Parse titles for Claude Code / API / Agent SDK updates. Ignore everything else.

---

## Rate Limit Notes

- GitHub API: 60 requests/hour unauthenticated, 5000/hour authenticated. We have ~9 sources. 60/hour is plenty.
- If you hit a 403 rate limit: wait and retry once. If still 403, skip that source and note in summary.

---

## LAST_SEEN.json — Schema

```json
{
  "claude-code": "2.1.94",
  "maplibre-ios": "6.5.0",
  "ferrostar": "0.28.1",
  "valhalla": "3.5.1",
  "swift": "6.0.1",
  "supabase-js": "2.47.0",
  "anthropic-sdk-python": "0.45.0",
  "anthropic-sdk-typescript": "0.28.0",
  "claude-code-blog": "2026-04-05",
  "last_run_utc": "2026-04-09T13:00:00Z"
}
```

**Rules:**
- Keys are kebab-case identifiers matching the watch list.
- Values are version strings (or ISO dates for blog sources).
- `last_run_utc` is an ISO timestamp in UTC, always updated.
- Missing keys are treated as "never seen" — first run populates them.
- Do NOT remove keys from this file. If a source is retired, update its value to `"retired"` and skip it on future runs.

---

## Example Forge Issue Body

```markdown
## What changed

MapLibre iOS 6.6.0 introduces `MLNMapView.offlineStorage.downloadPreloadedPackage(_:)` — an API to register a bundled MBTiles pack as an offline region WITHOUT re-downloading it over the network.

## Why it matters to us

We ship `trails.mbtiles` (5.2MB) bundled in the app at `DirtSync/DirtSyncApp/Resources/trails.mbtiles`. Currently we use a custom `OfflineMapService.swift` workaround to point MapLibre at the bundled file. This new API replaces that workaround with first-party support.

**Past bug this would have prevented:** The "bundled pack not registered" error class that iOS Builder hit 3 times in March (see Feature Builder LESSONS.md tag:maplibre).

## Suggested owner

Map Rendering Expert

## Links

- CHANGELOG: https://github.com/maplibre/maplibre-gl-native-ios/releases/tag/v6.6.0
- Previous version we were on: 6.5.0

## Classification

**Category:** Actionable
**Priority:** medium
```

---

## Dedup Check — Recent Issues Query

Before filing a new issue, check for existing ones:

```
GET /api/agent/issues?company_id=<id>&search=<library-name>+<version>&limit=5
```

If an issue with a matching title exists and was created in the last 7 days, do NOT file a duplicate. Note in the summary: "MapLibre 6.6.0 — issue already filed as DIRA-XXX, skipping."

---

## Cost Accounting

- Fetch phase: ~9 curl calls, zero token cost (Bash tool).
- Classify phase: reading 9 CHANGELOG diffs, ~2-5K tokens each, total ~40K input tokens.
- Issue filing: ~1K tokens per issue, typically 0-3 issues/day.
- Summary post: ~500 tokens.

Target: under $0.50/day using Sonnet. If a run exceeds $1.00, append a LESSONS.md entry explaining why and flag Forge COO.
