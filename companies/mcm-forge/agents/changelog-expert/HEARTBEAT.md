# HEARTBEAT.md — MCM Forge Changelog Expert

Run this on every wake. You are the factory's external knowledge scout.

## 0. Read Your Lessons (MANDATORY — before anything else)

1. Read `LESSONS.md` in this agent directory (`companies/mcm-forge/agents/changelog-expert/LESSONS.md`). Create with header if missing.
2. Scan for lessons about source fetch failures, parser gotchas, or false-positive classifications. If a past lesson warns about a specific source, heed it.

See `vault/agents/skills/lessons-learned-loop.md`.

## 1. Load LAST_SEEN State

Read `companies/mcm-forge/agents/changelog-expert/LAST_SEEN.json`. This file tracks the last version you saw for each watched source.

If the file is empty or missing, this is the **first run**. Treat every version as baseline — no issues will be filed this run. Your only job on first run is to populate `LAST_SEEN.json`.

Example shape:
```json
{
  "claude-code": "2.1.94",
  "maplibre-ios": "6.5.0",
  "ferrostar": "0.28.1",
  "valhalla": "3.5.1",
  "supabase-js": "2.47.0",
  "last_run_utc": "2026-04-09T13:00:00Z"
}
```

## 2. Fetch Each CHANGELOG

For each source in the watch list (see TOOLS.md for exact commands):

1. Fetch the CHANGELOG via `curl` for GitHub-hosted sources. Use WebFetch if the source is JS-rendered.
2. Parse out the latest version tag.
3. Compare against `LAST_SEEN.json`.
4. If version matches last seen, skip this source (no new entries).
5. If version is newer, extract the entries between `LAST_SEEN[source]` and the latest version.

**If a fetch fails:** note it in the summary as `<source>: fetch failed — <error>` and continue. Do NOT retry more than twice. Do NOT fabricate entries.

**If a source moved (404, domain change):** mark it in LESSONS.md as a lesson, file a meta-issue to Forge COO to update the source URL, and skip.

## 3. Classify Each New Entry

For each entry in the fetched delta, classify:

- **Actionable** — new API we'd use, deprecation affecting us, security fix, bug fix for something we hit, pricing change. Security fixes are always priority:high.
- **FYI** — interesting but not blocking. Goes in the daily summary, not as an issue.
- **Ignore** — typos, internal refactors, features in areas we don't touch.

Classification rules are in AGENTS.md under "What You Classify As Actionable." Do NOT invent new categories.

**Dedup check:** Before filing, search recent Forge issues for the same library + keywords. If an issue already exists for this change, do NOT file a duplicate. Note it in the summary instead.

## 4. File Actionable Issues

For each Actionable entry, create a Forge issue via:

```
POST /api/agent/issues
Headers:
  x-forge-agent-id: <your agent uuid>
  x-forge-run-id: <your run uuid if available>
  Content-Type: application/json

Body:
{
  "company_id": "<routed company — DirtSync for ios libs, MCM Forge for harness/orchestrator libs>",
  "title": "[changelog] <lib> <version> — <short description>",
  "description": "<formatted body per AGENTS.md Output section>",
  "priority": "medium" | "high",
  "status": "todo",
  "origin_kind": "routine",
  "origin_id": "<your routine id if you can resolve it>"
}
```

Routing rules:
- iOS / map / nav libraries (Xcode, Swift, MapLibre, Ferrostar, Valhalla, iOS release notes) → `company_id = 99338dee` (DirtSync)
- Orchestrator / harness libraries (Claude Code, Anthropic SDK, Supabase JS) → `company_id = 170ebe36` (MCM Forge)
- If unsure: default to MCM Forge (COO will re-route if needed)

## 5. Update LAST_SEEN.json

Write the new versions + current UTC timestamp to `LAST_SEEN.json`. Commit this file change with the rest of your work.

```json
{
  "claude-code": "2.1.95",
  "maplibre-ios": "6.6.0",
  ...
  "last_run_utc": "2026-04-10T13:00:00Z"
}
```

## 6. Post Daily Summary to Your Own Issue

The routine scheduler creates an issue when it wakes you. Post the daily summary as a comment on that issue:

```
PATCH /api/agent/issues/<ISSUE_ID>
Headers:
  x-forge-agent-id: <your agent uuid>
  Content-Type: application/json

Body:
{
  "comment": "<daily summary per AGENTS.md Output section>",
  "status": "in_review"
}
```

Summary must include:
- Table of every source checked (from / to / status)
- List of new issues filed (title + id)
- First-run note if applicable
- Any fetch failures

## 7. Append Lessons Learned (MANDATORY — before exit)

For every **non-trivial bug** you hit this run (source parser broke, classification rule fired wrong, dedup missed a duplicate), append an entry to the TOP of `companies/mcm-forge/agents/changelog-expert/LESSONS.md` using the format in `vault/agents/skills/lessons-learned-loop.md`. One entry per non-trivial bug, newest at top. Commit with your work.

## 8. Exit

Clean exit. The daily summary is the deliverable. Do NOT poll for more work.
