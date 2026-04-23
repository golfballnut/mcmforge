# Skill: Stack Currency Sweep

> Routine: Daily at 06:30 ET (`30 10 * * *` UTC)
> Agent: Stack Currency Scout (Gemini adapter — cheap, long-context, pulls changelogs well)
> Duration target: ≤ 5 min, ≤ $0.10
> Output: `[STACK-CURRENCY]` digest comment on dedicated `STACK-CURRENCY` issue + auto-filed action tickets

## Why
Our stack ships updates daily. Last 48h missed: Claude Code 2.1.117 (forked subagents flag), 2.1.118 (subagent cwd-restore fix). Skill files hardcoded `iPhone 16 Pro` when the Mini runs iPhone 17 Pro. Each missed release either costs budget (token cache misses, wasted retries) or leaves silent correctness bugs.

## Targets to scan daily

| Tool / Library | Source of truth | Check frequency |
|---|---|---|
| Claude Code CLI | `https://docs.claude.com/en/docs/claude-code/changelog` | daily |
| Codex CLI | `https://github.com/openai/codex/releases` | daily |
| Gemini CLI | `https://github.com/google-gemini/gemini-cli/releases` | daily |
| Xcode / iOS SDK | `xcrun simctl runtime list` on Mini + Apple Developer release notes | daily |
| MapLibre Native iOS | `https://github.com/maplibre/maplibre-gl-native-distribution/releases` | 3×/week |
| Ferrostar | `https://github.com/stadiamaps/ferrostar/releases` | 3×/week |
| Mapbox Directions API | `https://docs.mapbox.com/api/navigation/directions/` change log | weekly |
| Supabase CLI + JS | `https://github.com/supabase/supabase-js/releases` | weekly |
| gws CLI | `https://github.com/.../gws` releases | weekly |
| Swift toolchain | Xcode version reports | weekly |
| gh CLI | `https://github.com/cli/cli/releases` | weekly |

## Execution

```bash
# 1. Fetch changelogs in parallel (gws on Mini has web access)
for target in claude-code codex gemini-cli maplibre ferrostar; do
  (
    fetch_changelog_for "$target" > "/tmp/stackcheck/$target.md"
  ) &
done
wait

# 2. Build current-state snapshot on Mini
xcrun simctl runtime list > /tmp/stackcheck/ios-sims.txt
/Users/dirtsyncmini/.local/bin/claude --version > /tmp/stackcheck/claude-cli.txt
codex --version >> /tmp/stackcheck/versions.txt
gemini --version >> /tmp/stackcheck/versions.txt

# 3. Diff against last sweep's stored state in forge.stack_state
#    (one row per component with last_known_version + last_checked_at)
```

## Output contract

Post a `[STACK-CURRENCY]` comment on the pinned `DIRA-STACK-SCAN` issue (file it if it doesn't exist). Markdown body:

```markdown
**[STACK-CURRENCY] Daily sweep 2026-MM-DD**

### Upgrades since last sweep (ACTION REQUIRED)
- **Claude Code CLI**: 2.1.117 → 2.1.118 (shipped <timestamp>)
  - Subagent cwd-restore fix (feedback_session_resume_race relevant)
  - → Filed **FORGE-<n>** to update Mini + laptop

### New features worth adopting
- **MapLibre 6.24.0**: <feature> → consider for DIRA-<n>

### Breaking changes
- **Mapbox Directions v5.3**: `exclude=motorway` returns 422 when combined with `alternatives=true` for routes < 2km
  - Our DIRA-266 fixtures unaffected (Cville→Richmond 70mi). Logged as watch-item.

### Environment drift (current Mini state vs skills)
- Mini Xcode sim runtime = iOS 26.4 (iPhone 17 family)
- `waze-parity-screen-ship.md` hardcodes `iPhone 16 Pro`
  - → Filed **FORGE-<n>** to generalise skill

### Current versions (for audit)
| Tool | Version | Last checked |
|---|---|---|
| claude | 2.1.118 | 06:30 ET |
| codex | 0.118.0 | 06:30 ET |
| gemini | 0.38.2 | 06:30 ET |
| Xcode sim runtime | iOS 26.4 | 06:30 ET |
```

Auto-file Forge issues (`FORGE-xxx`) for:
- Any **breaking change** in a tool we depend on → priority `P1`, assignee CEO
- Any **new flag/feature** that solves a tracked pain point (search feedback memory for related issues) → priority `P2`
- Any **env drift** (Mini vs skill files) → priority `P3`, assignee Forge Builder

## Schema

New table `forge.stack_state` persists current-state + history:

```sql
CREATE TABLE forge.stack_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  component text NOT NULL,          -- 'claude-cli','codex-cli','maplibre-ios', ...
  current_version text NOT NULL,
  last_known_version text,
  last_checked_at timestamptz NOT NULL DEFAULT now(),
  last_release_url text,
  action_issue_id uuid REFERENCES forge.issues(id) ON DELETE SET NULL,
  notes text
);
CREATE UNIQUE INDEX stack_state_component_idx ON forge.stack_state (component);
```

## Hard rules

- **Read-only on the code repos.** Routine must never `git commit` or `git push`. Action is filing issues, not patches.
- **Idempotent.** If a release has already been filed (check `stack_state.action_issue_id`), do NOT re-file.
- **Fail-soft.** If a source is unreachable (GitHub rate limit, etc.), log the miss and continue — don't abort the whole sweep.
- **Budget cap**: $0.25/sweep. Enforced by adapter_config.maxTurns=30.

## Escalation

If 3 consecutive sweeps miss the same source, file `[ESCALATE] stack-currency source flaky` to CEO with last 3 error traces.
