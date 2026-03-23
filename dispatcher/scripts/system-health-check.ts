/**
 * system-health-check.ts
 *
 * Collects health metrics from all MCM Forge infrastructure services.
 * Outputs JSON to stdout for the system-health skill agent to interpret.
 *
 * Usage: npx tsx dispatcher/scripts/system-health-check.ts
 *
 * Checks:
 *   1. Mac Mini system (disk, memory, load, uptime)
 *   2. PM2 processes
 *   3. Supabase (MCM Forge brain + DirtSync)
 *   4. Google Workspace (OAuth token validity)
 *   5. Vercel deployments (if VERCEL_TOKEN configured)
 *   6. Anthropic API key validity
 *   7. Resend email service
 *   8. GitHub CLI auth
 *   9. Tailscale VPN
 */

import { execSync } from "child_process";

type Status = "ok" | "warning" | "critical" | "skipped";

interface HealthCheck {
  name: string;
  status: Status;
  message: string;
  details: Record<string, unknown>;
}

function runCmd(cmd: string, timeoutMs = 10_000): string {
  try {
    return execSync(cmd, { timeout: timeoutMs, encoding: "utf-8" }).trim();
  } catch {
    return "";
  }
}

// ── 1. Mac System ──────────────────────────────

function checkDisk(): HealthCheck {
  const raw = runCmd("df -h / | tail -1");
  if (!raw) return { name: "disk", status: "critical", message: "Could not read disk usage", details: {} };

  const parts = raw.split(/\s+/);
  const usedPercent = parseInt(parts[4]?.replace("%", "") || "0", 10);
  const available = parts[3] || "unknown";

  let status: Status = "ok";
  let message = `${usedPercent}% used, ${available} available`;
  if (usedPercent >= 90) { status = "critical"; message = `CRITICAL: ${message}`; }
  else if (usedPercent >= 75) { status = "warning"; message = `HIGH: ${message}`; }

  return { name: "disk", status, message, details: { usedPercent, available, raw } };
}

function checkMemory(): HealthCheck {
  const raw = runCmd("vm_stat");
  if (!raw) return { name: "memory", status: "critical", message: "Could not read memory stats", details: {} };

  const pageSize = 16384; // Apple Silicon default
  const extract = (label: string): number => {
    const match = raw.match(new RegExp(`${label}:\\s+(\\d+)`));
    return match ? parseInt(match[1], 10) : 0;
  };

  const free = extract("Pages free") * pageSize;
  const active = extract("Pages active") * pageSize;
  const inactive = extract("Pages inactive") * pageSize;
  const wired = extract("Pages wired down") * pageSize;
  const compressed = extract("Pages occupied by compressor") * pageSize;

  const totalUsed = active + wired + compressed;
  const totalAvailable = free + inactive;
  const totalMem = totalUsed + totalAvailable;
  const usedPercent = totalMem > 0 ? Math.round((totalUsed / totalMem) * 100) : 0;
  const availableGB = (totalAvailable / (1024 ** 3)).toFixed(1);

  let status: Status = "ok";
  let message = `${usedPercent}% used, ${availableGB}GB available`;
  if (usedPercent >= 90) { status = "critical"; message = `CRITICAL: ${message}`; }
  else if (usedPercent >= 75) { status = "warning"; message = `HIGH: ${message}`; }

  return { name: "memory", status, message, details: { usedPercent, availableGB, totalUsed, totalAvailable } };
}

function checkLoad(): HealthCheck {
  const raw = runCmd("uptime");
  if (!raw) return { name: "load", status: "critical", message: "Could not read load average", details: {} };

  const loadMatch = raw.match(/load averages?:\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
  if (!loadMatch) return { name: "load", status: "warning", message: "Could not parse load average", details: { raw } };

  const [load1, load5, load15] = [parseFloat(loadMatch[1]), parseFloat(loadMatch[2]), parseFloat(loadMatch[3])];

  // Mac Mini M2 has ~8 cores; load > 8 is concerning
  const cpuCores = parseInt(runCmd("sysctl -n hw.ncpu") || "8", 10);
  const loadRatio = load5 / cpuCores;

  let status: Status = "ok";
  let message = `Load: ${load1}/${load5}/${load15} (${cpuCores} cores)`;
  if (loadRatio > 2) { status = "critical"; message = `OVERLOADED: ${message}`; }
  else if (loadRatio > 1) { status = "warning"; message = `HIGH: ${message}`; }

  // Extract uptime
  const uptimeMatch = raw.match(/up\s+(.+?),\s+\d+\s+users?/);
  const uptime = uptimeMatch ? uptimeMatch[1].trim() : "unknown";

  return { name: "load", status, message, details: { load1, load5, load15, cpuCores, loadRatio, uptime } };
}

// ── 2. PM2 ─────────────────────────────────────

function checkPm2(): HealthCheck {
  const raw = runCmd("pm2 jlist 2>/dev/null");
  if (!raw) return { name: "pm2", status: "critical", message: "PM2 not responding", details: {} };

  try {
    const processes = JSON.parse(raw);
    const total = processes.length;
    const online = processes.filter((p: any) => p.pm2_env?.status === "online").length;
    const errored = processes.filter((p: any) => p.pm2_env?.status === "errored");

    let status: Status = "ok";
    let message = `${online}/${total} processes online`;
    if (errored.length > 0) {
      status = "critical";
      const names = errored.map((p: any) => p.name).join(", ");
      message = `${online}/${total} online — DOWN: ${names}`;
    }

    const processList = processes.map((p: any) => ({
      name: p.name,
      status: p.pm2_env?.status,
      restarts: p.pm2_env?.restart_time,
      uptime: p.pm2_env?.pm_uptime ? Math.round((Date.now() - p.pm2_env.pm_uptime) / 60000) + "m" : "unknown",
      memory: p.monit?.memory ? Math.round(p.monit.memory / (1024 * 1024)) + "MB" : "unknown",
      cpu: p.monit?.cpu ?? "unknown",
    }));

    return { name: "pm2", status, message, details: { total, online, errored: errored.length, processes: processList } };
  } catch {
    return { name: "pm2", status: "warning", message: "Could not parse PM2 output", details: { raw: raw.slice(0, 200) } };
  }
}

// ── 3. Supabase ────────────────────────────────

async function checkSupabase(): Promise<HealthCheck> {
  const url = process.env.MCMFORGE_SUPABASE_URL;
  const key = process.env.MCMFORGE_SUPABASE_KEY;

  if (!url || !key) {
    return { name: "supabase_mcmforge", status: "skipped", message: "MCMFORGE_SUPABASE_URL/KEY not set", details: {} };
  }

  try {
    const start = Date.now();

    // Check connectivity + get row counts for key tables
    const tables = ["task_queue", "war_room", "vault_docs", "skill_metrics", "company_registry"];
    const counts: Record<string, number> = {};

    for (const table of tables) {
      const res = await fetch(`${url}/rest/v1/${table}?select=id&limit=0`, {
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          Prefer: "count=exact",
        },
        signal: AbortSignal.timeout(8_000),
      });

      const countHeader = res.headers.get("content-range");
      const match = countHeader?.match(/\/(\d+)/);
      counts[table] = match ? parseInt(match[1], 10) : -1;
    }

    const latencyMs = Date.now() - start;

    let status: Status = "ok";
    let message = `${latencyMs}ms latency, ${Object.values(counts).filter(c => c >= 0).length}/${tables.length} tables accessible`;
    if (latencyMs > 5000) { status = "warning"; message = `SLOW: ${message}`; }

    return { name: "supabase_mcmforge", status, message, details: { latencyMs, counts } };
  } catch (err) {
    return { name: "supabase_mcmforge", status: "critical", message: `Connection failed: ${err}`, details: {} };
  }
}

async function checkDirtSyncSupabase(): Promise<HealthCheck> {
  const url = process.env.DIRTSYNC_SUPABASE_URL;
  const key = process.env.DIRTSYNC_SUPABASE_KEY;

  if (!url || !key) {
    return { name: "supabase_dirtsync", status: "skipped", message: "DIRTSYNC_SUPABASE_URL/KEY not set", details: {} };
  }

  try {
    const start = Date.now();
    const res = await fetch(`${url}/rest/v1/trails?select=id&limit=0`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Prefer: "count=exact",
      },
      signal: AbortSignal.timeout(8_000),
    });

    const countHeader = res.headers.get("content-range");
    const trailCount = countHeader?.match(/\/(\d+)/)?.[1] || "unknown";
    const latencyMs = Date.now() - start;

    return {
      name: "supabase_dirtsync",
      status: latencyMs > 5000 ? "warning" : "ok",
      message: `${latencyMs}ms latency, ${trailCount} trails`,
      details: { latencyMs, trailCount },
    };
  } catch (err) {
    return { name: "supabase_dirtsync", status: "critical", message: `Connection failed: ${err}`, details: {} };
  }
}

// ── 4. Google Workspace ────────────────────────

async function checkGoogle(): Promise<HealthCheck> {
  // Try gws CLI first (available on laptop)
  const gwsResult = runCmd("gws calendar list --max-results 1 2>&1");

  if (gwsResult && !gwsResult.includes("command not found") && !gwsResult.includes("not found")) {
    if (gwsResult.includes("Error") || gwsResult.includes("invalid_grant")) {
      return { name: "google_workspace", status: "critical", message: `OAuth issue: ${gwsResult.slice(0, 150)}`, details: {} };
    }
    return { name: "google_workspace", status: "ok", message: "OAuth token valid (gws CLI)", details: {} };
  }

  // Fallback: direct Google API call using refresh token (Mini doesn't have gws)
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    // Check if workspace-mcp credentials exist
    const credCheck = runCmd("ls ~/.google_workspace_mcp/credentials/ 2>/dev/null");
    if (credCheck) {
      return { name: "google_workspace", status: "ok", message: "Workspace MCP credentials present (not validated)", details: {} };
    }
    return { name: "google_workspace", status: "warning", message: "No Google OAuth credentials found", details: {} };
  }

  try {
    // Exchange refresh token for access token
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
      signal: AbortSignal.timeout(8_000),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      return { name: "google_workspace", status: "critical", message: `OAuth refresh failed: ${err.slice(0, 100)}`, details: {} };
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    // Quick Calendar API test
    const calRes = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary", {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(5_000),
    });

    if (calRes.ok) {
      return { name: "google_workspace", status: "ok", message: "OAuth token valid, Calendar API responding", details: {} };
    }

    return { name: "google_workspace", status: "warning", message: `Calendar API returned ${calRes.status}`, details: {} };
  } catch (err) {
    return { name: "google_workspace", status: "critical", message: `Google API check failed: ${err}`, details: {} };
  }
}

// ── 5. Vercel ──────────────────────────────────

async function checkVercel(): Promise<HealthCheck> {
  const token = process.env.VERCEL_TOKEN;

  if (!token) {
    return { name: "vercel", status: "skipped", message: "VERCEL_TOKEN not configured — add to dispatcher/.env", details: {} };
  }

  try {
    const res = await fetch("https://api.vercel.com/v6/deployments?limit=5&state=READY", {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8_000),
    });

    if (!res.ok) {
      return { name: "vercel", status: "critical", message: `API error: ${res.status} ${res.statusText}`, details: {} };
    }

    const data = await res.json();
    const deployments = (data.deployments || []).map((d: any) => ({
      name: d.name,
      state: d.state,
      url: d.url,
      created: d.created,
    }));

    return {
      name: "vercel",
      status: "ok",
      message: `${deployments.length} recent deployments`,
      details: { deployments },
    };
  } catch (err) {
    return { name: "vercel", status: "critical", message: `Connection failed: ${err}`, details: {} };
  }
}

// ── 6. Anthropic ───────────────────────────────

async function checkAnthropic(): Promise<HealthCheck> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return { name: "anthropic", status: "warning", message: "ANTHROPIC_API_KEY not set", details: {} };
  }

  try {
    // Minimal API call to verify key validity (count_tokens is cheap)
    const start = Date.now();
    const res = await fetch("https://api.anthropic.com/v1/messages/count_tokens", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        messages: [{ role: "user", content: "health check" }],
      }),
      signal: AbortSignal.timeout(10_000),
    });

    const latencyMs = Date.now() - start;

    if (res.ok) {
      return { name: "anthropic", status: "ok", message: `API key valid, ${latencyMs}ms latency`, details: { latencyMs } };
    }

    const body = await res.text();
    if (res.status === 401) {
      return { name: "anthropic", status: "critical", message: "API key invalid or expired", details: { status: res.status } };
    }
    if (res.status === 429) {
      return { name: "anthropic", status: "warning", message: "Rate limited — may affect task execution", details: { status: res.status } };
    }

    return { name: "anthropic", status: "warning", message: `API responded ${res.status}: ${body.slice(0, 100)}`, details: { status: res.status } };
  } catch (err) {
    return { name: "anthropic", status: "critical", message: `Connection failed: ${err}`, details: {} };
  }
}

// ── 7. Resend ──────────────────────────────────

async function checkResend(): Promise<HealthCheck> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    return { name: "resend", status: "warning", message: "RESEND_API_KEY not set — emails won't send", details: {} };
  }

  try {
    const res = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(8_000),
    });

    if (!res.ok) {
      return { name: "resend", status: "critical", message: `API error: ${res.status}`, details: {} };
    }

    const data = await res.json();
    const domains = (data.data || []).map((d: any) => ({
      name: d.name,
      status: d.status,
    }));

    const verified = domains.filter((d: any) => d.status === "verified").length;
    const total = domains.length;

    return {
      name: "resend",
      status: verified > 0 ? "ok" : "warning",
      message: `${verified}/${total} domains verified`,
      details: { domains },
    };
  } catch (err) {
    return { name: "resend", status: "critical", message: `Connection failed: ${err}`, details: {} };
  }
}

// ── 8. GitHub CLI ──────────────────────────────

function checkGitHub(): HealthCheck {
  const result = runCmd("gh auth status 2>&1");

  if (result.includes("Logged in")) {
    const accountMatch = result.match(/account\s+(\S+)/);
    const account = accountMatch ? accountMatch[1] : "unknown";
    return { name: "github", status: "ok", message: `Authenticated as ${account}`, details: {} };
  }

  if (result.includes("not logged")) {
    return { name: "github", status: "critical", message: "Not authenticated — PRs and repo ops will fail", details: {} };
  }

  return { name: "github", status: "warning", message: `Unexpected: ${result.slice(0, 100)}`, details: {} };
}

// ── 9. Tailscale ───────────────────────────────

function checkTailscale(): HealthCheck {
  const result = runCmd("tailscale status --json 2>/dev/null");

  if (!result) {
    // Try non-JSON
    const basic = runCmd("tailscale status 2>&1");
    if (basic.includes("not running") || basic.includes("stopped")) {
      return { name: "tailscale", status: "critical", message: "Tailscale VPN is not running", details: {} };
    }
    return { name: "tailscale", status: "warning", message: "Could not get Tailscale status", details: {} };
  }

  try {
    const data = JSON.parse(result);
    const selfOnline = data.Self?.Online ?? false;
    const peerCount = Object.keys(data.Peer || {}).length;
    const health = data.Health || [];

    if (!selfOnline) {
      return { name: "tailscale", status: "critical", message: "Tailscale node is offline", details: { peerCount } };
    }

    if (health.length > 0) {
      return { name: "tailscale", status: "warning", message: `Online but ${health.length} health warnings`, details: { peerCount, health } };
    }

    return { name: "tailscale", status: "ok", message: `Online, ${peerCount} peers connected`, details: { peerCount } };
  } catch {
    return { name: "tailscale", status: "warning", message: "Could not parse Tailscale status", details: {} };
  }
}

// ── Main ───────────────────────────────────────

async function main() {
  const checks: HealthCheck[] = [];

  // Sync checks
  checks.push(checkDisk());
  checks.push(checkMemory());
  checks.push(checkLoad());
  checks.push(checkPm2());
  checks.push(checkGitHub());
  checks.push(checkTailscale());

  // Async checks (parallel)
  const asyncResults = await Promise.allSettled([
    checkSupabase(),
    checkDirtSyncSupabase(),
    checkGoogle(),
    checkVercel(),
    checkAnthropic(),
    checkResend(),
  ]);

  for (const result of asyncResults) {
    if (result.status === "fulfilled") {
      checks.push(result.value);
    } else {
      checks.push({ name: "unknown", status: "critical", message: `Check crashed: ${result.reason}`, details: {} });
    }
  }

  // Summary
  const critical = checks.filter(c => c.status === "critical").length;
  const warnings = checks.filter(c => c.status === "warning").length;
  const ok = checks.filter(c => c.status === "ok").length;
  const skipped = checks.filter(c => c.status === "skipped").length;

  const overall: Status = critical > 0 ? "critical" : warnings > 0 ? "warning" : "ok";

  const report = {
    timestamp: new Date().toISOString(),
    overall,
    summary: `${critical} critical, ${warnings} warnings, ${ok} healthy, ${skipped} skipped`,
    checks,
  };

  console.log(JSON.stringify(report, null, 2));
  console.error(`[system-health] ${report.summary}`);
}

main().catch(err => {
  console.error(`[system-health] Fatal: ${err}`);
  process.exit(1);
});
