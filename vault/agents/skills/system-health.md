# Skill: system-health

## Goal
Run a comprehensive health check across all MCM Forge infrastructure and produce a daily status report with red/yellow/green indicators for every service.

## Trigger Keywords
system health, infrastructure check, status report, health check, system status, are systems healthy

## Context
MCM Forge runs on a Mac Mini (Apple Silicon) with PM2 managing dispatcher + night-ops. It depends on:
- **Supabase** (2 projects: MCM Forge brain + DirtSync)
- **Google Workspace** (Calendar, Gmail, Drive, Sheets via OAuth)
- **Vercel** (auto-deploy for mcmforge.com + DirtSync)
- **Anthropic** (Claude API for agents + visual TDD)
- **Resend** (transactional email from ops@mcmforge.com)
- **GitHub** (PRs, repos, CI/CD)
- **Tailscale** (VPN for remote Mini access)

## Execution Steps

### Step 1: Run the health check script
```bash
npx tsx dispatcher/scripts/system-health-check.ts
```
This outputs JSON with health data for all services. Parse the JSON output.

### Step 2: Analyze the results
For each check in the JSON:
- **critical**: Something is broken and needs immediate attention
- **warning**: Degraded or approaching a limit — flag for awareness
- **ok**: Healthy, no action needed
- **skipped**: Service not configured — note as a gap if it should be configured

### Step 3: Format the health report
Use the output format below. Lead with anything red/critical, then warnings, then a green summary.

### Step 4: Recommendations
If any check is critical or warning, provide specific remediation steps. For example:
- Disk > 75%: suggest cleanup commands or files to remove
- PM2 process down: suggest `pm2 restart <name>`
- OAuth token expired: suggest re-auth steps
- API key invalid: flag for Steve to rotate

## Output Format
```
# MCM Forge System Health — {date}

## Overall: {OK / WARNING / CRITICAL}

### Critical Issues
- {service}: {issue description} → {recommended fix}
(or "None — all systems operational")

### Warnings
- {service}: {description}
(or "None")

### Service Status
| Service | Status | Details |
|---------|--------|---------|
| Mac Mini Disk | {status_emoji} {status} | {usage}% used, {available} free |
| Mac Mini Memory | {status_emoji} {status} | {usage}% used, {available}GB free |
| Mac Mini Load | {status_emoji} {status} | {load1}/{load5}/{load15} ({cores} cores) |
| PM2 Processes | {status_emoji} {status} | {online}/{total} online |
| Supabase (Brain) | {status_emoji} {status} | {latency}ms, {row_counts} |
| Supabase (DirtSync) | {status_emoji} {status} | {latency}ms, {trail_count} trails |
| Google Workspace | {status_emoji} {status} | OAuth: {valid/expired} |
| Vercel | {status_emoji} {status} | {deploy_count} recent deploys |
| Anthropic API | {status_emoji} {status} | Key: {valid/invalid}, {latency}ms |
| Resend Email | {status_emoji} {status} | {verified}/{total} domains verified |
| GitHub CLI | {status_emoji} {status} | Auth: {account} |
| Tailscale VPN | {status_emoji} {status} | {peer_count} peers |

### Configuration Gaps
- {List any services returning "skipped" that should be configured}
- {e.g., "VERCEL_TOKEN not set — add to dispatcher/.env to monitor deploys"}

### Recommendations
1. {Actionable item if any issues found}
2. {Or "No action needed — all systems healthy"}
```

Use these status emojis:
- OK = checkmark
- WARNING = warning sign
- CRITICAL = red X
- SKIPPED = dash/minus

## Gotchas
- Do NOT modify any systems — this is READ-ONLY monitoring
- Do NOT attempt to fix issues — only report them with recommended fixes
- If the health check script fails entirely, report that as the critical issue
- Keep the report under 800 words — Steve reads this on his phone
- Disk > 90%, memory > 90%, or any process down = CRITICAL (Steve needs to know immediately)
- Do NOT include raw JSON in the report — summarize it into the table format

## Schedule
- Runs daily at 4 AM ET (9 UTC) via skill_schedule
- Runs BEFORE ai-daily-intel (5 AM) and social-intel (6 AM) so infrastructure issues surface first
- Uses Claude CLI (needs bash access for system commands)

## Model Recommendation
- **Best: Claude** — needs bash access to run the health check script, good at structured reporting
- **Not suitable: Gemini** — limited bash/system access on Mini
- **Not suitable: Codex** — overkill for a reporting task
