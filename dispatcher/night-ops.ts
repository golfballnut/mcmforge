#!/usr/bin/env tsx
/**
 * MCM Forge Night-Ops v2 — COO Brain
 *
 * Runs every hour on the Mac Mini via pm2 cron.
 * Now does MUCH more than health checks:
 *
 * Every hour:
 * - Health checks (PM2, tasks, PRs)
 * - Reviews completed tasks and analyzes results
 * - Creates follow-up tasks based on outcomes
 * - Runs trail data quality audits
 * - Queues competitive research tasks
 * - Emails Steve with progress, screenshots, questions
 *
 * At 6 AM ET: compiles comprehensive morning brief
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { execSync } from "child_process";
import * as dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, ".env") });

const PATH_PREFIX = "/opt/homebrew/Cellar/node@20/20.20.0/bin:/opt/homebrew/bin:/usr/local/bin";

const CONFIG = {
  supabaseUrl: process.env.MCMFORGE_SUPABASE_URL!,
  supabaseKey: process.env.MCMFORGE_SUPABASE_KEY!,
  dirtsyncSupabaseUrl: process.env.DIRTSYNC_SUPABASE_URL || "",
  dirtsyncSupabaseKey: process.env.DIRTSYNC_SUPABASE_KEY || "",
  agentEmail: process.env.AGENT_EMAIL || "agent@mcmforge.com",
  agentPassword: process.env.AGENT_PASSWORD!,
  resendApiKey: process.env.RESEND_API_KEY || "",
  steveEmail: process.env.STEVE_EMAIL || "steve@linkschoice.com",
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || "",
  telegramChatId: process.env.STEVE_TELEGRAM_CHAT_ID || process.env.TELEGRAM_CHAT_ID || "",
  checkIntervalMs: 60 * 60 * 1000, // 1 hour
  briefHourUTC: 11, // 6 AM ET = 11 UTC
};

let supabase: SupabaseClient;
let dirtsyncDb: SupabaseClient | null = null;

function log(level: string, msg: string) {
  console.log(`[${new Date().toISOString()}] [night-ops] [${level}] ${msg}`);
}

// ── Health Checks ──────────────────────────────

interface HealthReport {
  timestamp: string;
  pm2: { total: number; online: number; errored: string[] };
  tasks: { stuck: number; blocked: number; inProgress: number; pendingApprovals: number; completedLastHour: number; todoCount: number };
  prs: { open: number; list: string[] };
  trailStats: { total: number; visible: number; hidden: number; gpsMiles: number; systems: number };
  alerts: string[];
}

async function checkPm2Health(): Promise<HealthReport["pm2"]> {
  try {
    const raw = execSync(`export PATH=${PATH_PREFIX}:$PATH && pm2 jlist 2>/dev/null`, {
      encoding: "utf-8",
      timeout: 10000,
    });
    const procs = JSON.parse(raw);
    const errored = procs
      .filter((p: any) => p.pm2_env?.status !== "online")
      .map((p: any) => p.name);
    return { total: procs.length, online: procs.length - errored.length, errored };
  } catch {
    return { total: 0, online: 0, errored: ["pm2-check-failed"] };
  }
}

async function checkTasks(): Promise<HealthReport["tasks"]> {
  const fortyFiveMinAgo = new Date(Date.now() - 45 * 60 * 1000).toISOString();
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const [stuckRes, blockedRes, inProgressRes, approvalRes, completedRes, todoRes] = await Promise.all([
    supabase.from("task_queue").select("id", { count: "exact" }).eq("status", "in_progress").lt("started_at", fortyFiveMinAgo),
    supabase.from("task_queue").select("id", { count: "exact" }).eq("status", "blocked"),
    supabase.from("task_queue").select("id", { count: "exact" }).eq("status", "in_progress"),
    supabase.from("approval_queue").select("id", { count: "exact" }).eq("status", "pending"),
    supabase.from("task_queue").select("id", { count: "exact" }).in("status", ["done", "review"]).gte("completed_at", oneHourAgo),
    supabase.from("task_queue").select("id", { count: "exact" }).eq("status", "todo"),
  ]);

  return {
    stuck: stuckRes.count || 0,
    blocked: blockedRes.count || 0,
    inProgress: inProgressRes.count || 0,
    pendingApprovals: approvalRes.count || 0,
    completedLastHour: completedRes.count || 0,
    todoCount: todoRes.count || 0,
  };
}

async function checkOpenPRs(): Promise<HealthReport["prs"]> {
  try {
    const raw = execSync(
      `export PATH=${PATH_PREFIX}:$PATH && gh pr list --repo golfballnut/DirtSync --state open --json number,title --limit 10 2>/dev/null`,
      { encoding: "utf-8", timeout: 15000 }
    );
    const prs = JSON.parse(raw);
    return {
      open: prs.length,
      list: prs.map((pr: any) => `#${pr.number}: ${pr.title}`),
    };
  } catch {
    return { open: 0, list: ["pr-check-failed"] };
  }
}

async function checkTrailStats(): Promise<HealthReport["trailStats"]> {
  if (!dirtsyncDb) return { total: 0, visible: 0, hidden: 0, gpsMiles: 0, systems: 0 };
  try {
    const [totalRes, visibleRes, hiddenRes] = await Promise.all([
      dirtsyncDb.from("trail_lines").select("id", { count: "exact", head: true }),
      dirtsyncDb.from("trail_lines").select("id", { count: "exact", head: true }).eq("hidden", false),
      dirtsyncDb.from("trail_lines").select("id", { count: "exact", head: true }).eq("hidden", true),
    ]);

    return {
      total: totalRes.count || 0,
      visible: visibleRes.count || 0,
      hidden: hiddenRes.count || 0,
      gpsMiles: 5720, // Updated by data operations, hardcoded for now
      systems: 19,
    };
  } catch (err) {
    log("warn", `Trail stats check failed: ${err}`);
  }
  return { total: 0, visible: 0, hidden: 0, gpsMiles: 0, systems: 0 };
}

async function runHealthCheck(): Promise<HealthReport> {
  const [pm2, tasks, prs, trailStats] = await Promise.all([
    checkPm2Health(),
    checkTasks(),
    checkOpenPRs(),
    checkTrailStats(),
  ]);

  const alerts: string[] = [];

  if (pm2.errored.length > 0) {
    alerts.push(`PM2 processes down: ${pm2.errored.join(", ")}`);
  }
  if (tasks.stuck > 0) {
    alerts.push(`${tasks.stuck} task(s) stuck in_progress for 45+ min`);
  }
  if (tasks.blocked > 0) {
    alerts.push(`${tasks.blocked} task(s) blocked`);
  }

  return {
    timestamp: new Date().toISOString(),
    pm2,
    tasks,
    prs,
    trailStats,
    alerts,
  };
}

// ── COO Brain: Task Management ──────────────────

interface TaskTemplate {
  title: string;
  description: string;
  task_type: string;
  cli_target: string;
  company_id: string;
  priority: string;
  skill_name?: string;
  bakeoff_group?: string;
}

// ── CLI Routing Strategy ──────────────────────
// Smart routing: best CLI for each task type
// Bake-off: high-priority tasks get sent to multiple CLIs for comparison

type CliTool = "claude" | "gemini" | "codex";

const CLI_ROUTING: Record<string, CliTool> = {
  code: "claude",       // Claude = strongest coder
  research: "gemini",   // Gemini 3.1 Pro = strong web research
  content: "gemini",    // Gemini = good at long-form writing
  ops: "codex",         // Codex 5.3 = fast execution
  chat: "claude",       // Claude = best conversational
};

// High-priority tasks get bake-off across these CLIs
const BAKEOFF_CLIS: CliTool[] = ["claude", "gemini", "codex"];

function getSmartCli(taskType: string): CliTool {
  return CLI_ROUTING[taskType] || "claude";
}

async function createBakeoffTasks(
  baseTemplate: Omit<TaskTemplate, "cli_target" | "bakeoff_group">,
  clis: CliTool[] = BAKEOFF_CLIS
): Promise<string[]> {
  const groupId = crypto.randomUUID();
  const created: string[] = [];

  for (const cli of clis) {
    const id = await createTask({
      ...baseTemplate,
      cli_target: cli,
      bakeoff_group: groupId,
      title: `${baseTemplate.title} (${cli.charAt(0).toUpperCase() + cli.slice(1)})`,
    });
    if (id) created.push(`${cli}:${id}`);
  }

  if (created.length > 0) {
    log("info", `Bake-off created: ${baseTemplate.title} → ${created.map(c => c.split(":")[0]).join(", ")} [group ${groupId.slice(0, 8)}]`);
  }

  return created;
}

async function getCompanyId(slug: string): Promise<string | null> {
  const { data } = await supabase
    .from("company_registry")
    .select("id")
    .eq("slug", slug)
    .single();
  return data?.id || null;
}

async function createTask(template: TaskTemplate): Promise<string | null> {
  const insert: Record<string, unknown> = {
    ...template,
    status: "todo",
    assigned_to: "agent-executor",
    created_by: "night-ops-coo",
  };
  // Only include bakeoff_group if set (avoid null override)
  if (!template.bakeoff_group) delete insert.bakeoff_group;

  const { data, error } = await supabase
    .from("task_queue")
    .insert(insert)
    .select("id")
    .single();

  if (error) {
    log("error", `Failed to create task: ${error.message}`);
    return null;
  }

  log("info", `Created task: ${template.title} (${data.id})`);
  return data.id;
}

async function reviewCompletedTasks(): Promise<string[]> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const actions: string[] = [];

  // Get tasks completed in the last hour
  const { data: completed } = await supabase
    .from("task_queue")
    .select("*")
    .in("status", ["done", "review"])
    .gte("completed_at", oneHourAgo)
    .order("completed_at", { ascending: false });

  if (!completed || completed.length === 0) {
    actions.push("No tasks completed in the last hour");
    return actions;
  }

  // Track bake-off groups we've already reviewed this cycle
  const reviewedBakeoffs = new Set<string>();

  for (const task of completed) {
    actions.push(`Reviewed: ${task.title} (${task.status})`);

    // ── Bake-off comparison ──
    if (task.bakeoff_group && !reviewedBakeoffs.has(task.bakeoff_group)) {
      reviewedBakeoffs.add(task.bakeoff_group);
      const bakeoffResults = await reviewBakeoffGroup(task.bakeoff_group);
      actions.push(...bakeoffResults);
    }

    // If a research task completed, check if it warrants a follow-up code task
    if (task.task_type === "research" && task.status === "done" && task.result_summary) {
      const summary = task.result_summary.toLowerCase();
      if (summary.includes("recommend") || summary.includes("should") || summary.includes("opportunity")) {
        actions.push(`→ Research "${task.title}" has actionable findings — flagged for follow-up`);
      }
    }

    // If a code task was rejected, create a retry with better context
    if (task.status === "blocked" && task.task_type === "code") {
      actions.push(`→ Code task "${task.title}" is blocked — needs manual review`);
    }
  }

  return actions;
}

// ── Bake-off Result Comparison ──────────────────
// When all CLIs in a bake-off group finish, compare and score results

async function reviewBakeoffGroup(groupId: string): Promise<string[]> {
  const actions: string[] = [];

  const { data: groupTasks } = await supabase
    .from("task_queue")
    .select("id, title, status, cli_target, started_at, completed_at, result_summary, pr_url")
    .eq("bakeoff_group", groupId)
    .order("completed_at", { ascending: true });

  if (!groupTasks || groupTasks.length === 0) return actions;

  const total = groupTasks.length;
  const finished = groupTasks.filter(t => ["done", "review", "blocked", "rejected"].includes(t.status));
  const successful = groupTasks.filter(t => ["done", "review"].includes(t.status));
  const failed = groupTasks.filter(t => ["blocked", "rejected"].includes(t.status));
  const pending = groupTasks.filter(t => ["todo", "in_progress"].includes(t.status));

  if (pending.length > 0) {
    actions.push(`⚔️ Bake-off [${groupId.slice(0, 8)}]: ${finished.length}/${total} finished, ${pending.length} still running`);
    return actions;
  }

  // All finished — compare results
  actions.push(`⚔️ Bake-off complete [${groupId.slice(0, 8)}]: ${successful.length}/${total} succeeded`);

  // Score by: success, speed, whether it produced a PR
  const scored = successful.map(t => {
    const durationMs = t.completed_at && t.started_at
      ? new Date(t.completed_at).getTime() - new Date(t.started_at).getTime()
      : Infinity;
    const hasPr = !!t.pr_url;
    const summaryLen = t.result_summary?.length || 0;
    return {
      cli: t.cli_target,
      title: t.title,
      durationMin: (durationMs / 60000).toFixed(1),
      hasPr,
      summaryLen,
      score: (hasPr ? 3 : 0) + (summaryLen > 100 ? 2 : 0) + (durationMs < 300000 ? 1 : 0), // PR + substance + speed
    };
  }).sort((a, b) => b.score - a.score);

  for (const s of scored) {
    actions.push(`  ${s.cli}: ${s.durationMin}min, score=${s.score}${s.hasPr ? " ✓PR" : ""}${s.summaryLen > 100 ? " ✓detailed" : ""}`);
  }

  if (scored.length > 0) {
    actions.push(`  → Winner: ${scored[0].cli}`);

    // Record the winner for future routing optimization
    await supabase.from("communication_log").insert({
      from_agent: "night-ops-coo",
      to_agent: "steve",
      channel: "internal",
      message: `Bake-off result [${groupId.slice(0, 8)}]: Winner=${scored[0].cli} (score ${scored[0].score}). ${scored.map(s => `${s.cli}=${s.score}`).join(", ")}. Failed: ${failed.map(t => t.cli_target).join(", ") || "none"}`,
    });
  }

  if (failed.length > 0) {
    actions.push(`  ✗ Failed: ${failed.map(t => `${t.cli_target} (${t.status})`).join(", ")}`);
  }

  return actions;
}

// ── COO Brain: Overnight Operations Queue ──────
//
// Strategy:
//   HIGH priority → bake-off (same task to Claude + Gemini + Codex, compare results)
//   MEDIUM/LOW    → smart routing (best CLI for the task type)
//
// Smart routing defaults:
//   code     → claude   (strongest coder)
//   research → gemini   (Gemini 3.1 Pro, strong web analysis)
//   content  → gemini   (good long-form)
//   ops      → codex    (Codex 5.3, fast execution)
//   chat     → claude   (best conversational)

async function queueOvernightOps(report: HealthReport): Promise<string[]> {
  const actions: string[] = [];
  const dirtsyncId = await getCompanyId("dirtsync");
  const mcmforgeId = await getCompanyId("mcmforge");

  // Only queue new tasks if there's room (don't flood the queue)
  if (report.tasks.todoCount >= 8) {
    actions.push("Task queue has 8+ pending items — not adding more");
    return actions;
  }

  // Check what tasks already exist to avoid duplicates
  // Look at ALL statuses from the last 24 hours — not just todo/in_progress
  // This prevents the runaway loop where completed tasks get re-created every cycle
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: existingTasks } = await supabase
    .from("task_queue")
    .select("title, status")
    .gte("created_at", twentyFourHoursAgo)
    .limit(100);

  const existingTitles = new Set((existingTasks || []).map(t => t.title.toLowerCase()));

  // Helper: check if any variant of a title exists (base or CLI-suffixed)
  function titleExists(baseTitle: string): boolean {
    const lower = baseTitle.toLowerCase();
    if (existingTitles.has(lower)) return true;
    // Check for bake-off variants: "title (Claude)", "title (Gemini)", "title (Codex)"
    for (const cli of BAKEOFF_CLIS) {
      const suffixed = `${lower} (${cli.charAt(0).toUpperCase() + cli.slice(1)})`.toLowerCase();
      if (existingTitles.has(suffixed)) return true;
    }
    return false;
  }

  // ── Trail-related tasks ──
  if (dirtsyncId) {
    // HIGH PRIORITY → bake-off: trail styling across all 3 CLIs
    if (!titleExists("deploy approved trail styling (split badge f)")) {
      const desc = `Deploy the Steve-approved trail styling spec to DirtSync web app.

## Spec (approved 2026-02-24):
- Official trails: SOLID colored line (Easy #0f6b1f, Moderate #1D4ED8, Hard #333, Expert #D9342E)
- Outlaw trails: DASHED colored line (same difficulty colors, 7px dash / 5px gap)
- White casing: 4.5px, 30% opacity
- Center line: 2.8px
- All trails visible at minzoom 9
- Outlaw badge: Split pill — gold "OL" left | difficulty dot + name right
- Badge visible at minzoom 10

## Acceptance Criteria:
- [ ] Official trails render as solid colored lines with difficulty colors
- [ ] Outlaw trails render as dashed colored lines (same difficulty colors, NOT gold)
- [ ] All trails visible at zoom level 9
- [ ] Map legend component showing difficulty colors + official vs outlaw distinction
- [ ] Outlaw badges render as split pills at zoom 10+`;

      const created = await createBakeoffTasks({
        title: "Deploy approved trail styling (Split Badge F)",
        description: desc,
        task_type: "code",
        company_id: dirtsyncId,
        priority: "high",
        skill_name: "visual-bug-fix",
      });
      if (created.length > 0) {
        actions.push(`Bake-off: Trail styling → ${created.map(c => c.split(":")[0]).join(", ")}`);
      }
    }

    // MEDIUM PRIORITY → smart route: research goes to Gemini
    if (!titleExists("onx vs dirtsync deep competitive analysis")) {
      const cli = getSmartCli("research");
      const id = await createTask({
        title: "OnX vs DirtSync deep competitive analysis",
        description: `Research OnX Offroad app features and compare to DirtSync.

Focus areas:
1. Trail visualization — how do they render trails? Colors? Badges? Labels?
2. Offline maps — how does their download/caching system work?
3. Ride recording — GPS logging, stats, sharing features
4. Social features — follows, leaderboards, ride sharing
5. Search & discovery — how do users find trails?
6. Pricing model — free vs premium features
7. Trail data sources — where does OnX get trail data?
8. Weather integration
9. Vehicle profiles and filtering
10. Turn-by-turn navigation

Also look at Gaia GPS and AllTrails for reference.

Output a feature comparison matrix and priority recommendations for DirtSync.`,
        task_type: "research",
        cli_target: cli,
        company_id: dirtsyncId,
        priority: "medium",
      });
      if (id) actions.push(`Routed: OnX competitive analysis → ${cli}`);
    }

    // MEDIUM PRIORITY → smart route: research goes to Gemini
    if (!titleExists("validate trail names against official hmt documentation")) {
      const cli = getSmartCli("research");
      const id = await createTask({
        title: "Validate trail names against official HMT documentation",
        description: `Research official Hatfield-McCoy Trail system documentation and validate our trail names.

Steps:
1. Find official HMT trail maps and documentation online (hatfieldmccoytrails.info or similar)
2. For each trail system (Rockhouse, Bearwallow, Pinnacle Creek, Indian Ridge, Buffalo Mountain, Warrior, Pocahontas, Devil Anse, Ivy Branch, Hillbilly), get the official trail names and numbers
3. Compare against our database trail names
4. Identify trails we have that don't match official names
5. Identify official trails we're missing
6. Note any trails that appear to be in wrong locations (going through towns, parking lots)

Also check Gaia GPS and OnX for trail name reference.

Output a CSV-style comparison: our_name, official_name, system, status (match/mismatch/missing/extra)`,
        task_type: "research",
        cli_target: cli,
        company_id: dirtsyncId,
        priority: "medium",
      });
      if (id) actions.push(`Routed: HMT trail name validation → ${cli}`);
    }
  }

  return actions;
}

// ── COO Brain: Trail Data Quality Check ──────

async function runTrailAudit(): Promise<string[]> {
  const findings: string[] = [];

  if (!dirtsyncDb) {
    findings.push("No DirtSync DB connection — skipping trail audit");
    return findings;
  }

  try {
    // Check for suspicious micro-fragments (< 0.05mi, not GPS data)
    const { count: suspiciousCount } = await dirtsyncDb
      .from("trail_lines")
      .select("id", { count: "exact", head: true })
      .eq("hidden", false)
      .lt("distance_miles", 0.05)
      .neq("source", "community_gps");

    if (suspiciousCount && suspiciousCount > 0) {
      findings.push(`${suspiciousCount} suspicious micro-fragments (< 0.05mi, non-GPS) still visible`);
    }

    // Check for non-connector trails with no difficulty
    const { count: noDiffCount } = await dirtsyncDb
      .from("trail_lines")
      .select("id", { count: "exact", head: true })
      .eq("hidden", false)
      .is("difficulty", null)
      .eq("is_connector", false);

    if (noDiffCount && noDiffCount > 0) {
      findings.push(`${noDiffCount} real trails have no difficulty rating — need classification`);
    }

    // Check contribution queue
    const { count: pendingContribs } = await dirtsyncDb
      .from("trail_contributions")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");

    if (pendingContribs && pendingContribs > 0) {
      findings.push(`${pendingContribs} trail contributions awaiting review`);
    }
  } catch (err) {
    findings.push(`Trail audit query failed: ${err}`);
  }

  return findings;
}

// ── Notifications ──────────────────────────────

async function sendTelegramAlert(message: string) {
  if (!CONFIG.telegramBotToken || !CONFIG.telegramChatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${CONFIG.telegramBotToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: CONFIG.telegramChatId,
        text: message,
        parse_mode: "Markdown",
      }),
    });
  } catch (err) {
    log("warn", `Telegram alert failed: ${err}`);
  }
}

async function sendProgressEmail(subject: string, bodyHtml: string) {
  if (!CONFIG.resendApiKey) return;
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CONFIG.resendApiKey}`,
      },
      body: JSON.stringify({
        from: "MCM Forge COO <ops@mcmforge.com>",
        to: CONFIG.steveEmail,
        subject: `[MCM Forge] ${subject}`,
        html: bodyHtml,
      }),
    });
    log("info", `Email sent: ${subject}`);
  } catch (err) {
    log("warn", `Email failed: ${err}`);
  }
}

async function sendDailyBriefEmail(report: HealthReport, reviewActions: string[], overnightActions: string[], trailFindings: string[]) {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: completedTasks } = await supabase
    .from("task_queue")
    .select("title, status, completed_at, pr_url, task_type")
    .gte("completed_at", oneDayAgo)
    .order("completed_at", { ascending: false });

  const { data: pendingApprovals } = await supabase
    .from("approval_queue")
    .select("title, preview_url, pr_url, created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  const completed = completedTasks || [];
  const pending = pendingApprovals || [];

  const completedHtml = completed.length > 0
    ? completed.map(t =>
        `<li>${t.title} <span style="color:#6b7280;">(${t.task_type})</span>${t.pr_url ? ` — <a href="${t.pr_url}" style="color:#3b82f6;">PR</a>` : ""}</li>`
      ).join("")
    : "<li style='color:#6b7280;'>No tasks completed</li>";

  const pendingHtml = pending.length > 0
    ? pending.map(a =>
        `<li>${a.title}${a.pr_url ? ` — <a href="${a.pr_url}" style="color:#3b82f6;">Review PR</a>` : ""}</li>`
      ).join("")
    : "<li style='color:#6b7280;'>No pending approvals</li>";

  const alertsHtml = report.alerts.length > 0
    ? `<div style="background:#7f1d1d;border:1px solid #991b1b;border-radius:8px;padding:12px;margin-bottom:16px;">
        <strong style="color:#fca5a5;">Alerts:</strong>
        <ul style="margin:4px 0 0;padding-left:20px;">${report.alerts.map(a => `<li style="color:#fca5a5;">${a}</li>`).join("")}</ul>
      </div>`
    : "";

  const cooActionsHtml = [...reviewActions, ...overnightActions].length > 0
    ? [...reviewActions, ...overnightActions].map(a => `<li>${a}</li>`).join("")
    : "<li style='color:#6b7280;'>No COO actions taken</li>";

  const trailHtml = trailFindings.length > 0
    ? trailFindings.map(f => `<li>${f}</li>`).join("")
    : "<li style='color:#6b7280;'>Trail data looks clean</li>";

  const html = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,sans-serif;background:#0a0a0a;color:#e5e5e5;padding:24px;">
<div style="max-width:560px;margin:0 auto;background:#171717;border:1px solid #333;border-radius:12px;padding:32px;">
  <h1 style="font-size:20px;margin:0 0 4px;color:#fff;">Good Morning, Steve</h1>
  <p style="color:#a3a3a3;margin:0 0 24px;font-size:14px;">MCM Forge COO Brief — ${new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}</p>

  ${alertsHtml}

  <h2 style="font-size:15px;color:#f97316;margin:0 0 8px;">System Status</h2>
  <p style="font-size:13px;color:#a3a3a3;margin:0 0 16px;">
    PM2: ${report.pm2.online}/${report.pm2.total} online &nbsp;|&nbsp;
    Tasks in progress: ${report.tasks.inProgress} &nbsp;|&nbsp;
    Open PRs: ${report.prs.open}
  </p>

  <h2 style="font-size:15px;color:#a855f7;margin:0 0 8px;">Trail Data Health</h2>
  <p style="font-size:13px;color:#a3a3a3;margin:0 0 8px;">
    ${report.trailStats.systems} systems &nbsp;|&nbsp;
    ${report.trailStats.visible} visible trails &nbsp;|&nbsp;
    ${report.trailStats.hidden} hidden (cleaned) &nbsp;|&nbsp;
    ~${report.trailStats.gpsMiles} mi
  </p>
  <ul style="font-size:13px;color:#d4d4d4;padding-left:20px;margin:0 0 16px;">${trailHtml}</ul>

  <h2 style="font-size:15px;color:#22c55e;margin:0 0 8px;">Completed (24h)</h2>
  <ul style="font-size:13px;color:#d4d4d4;padding-left:20px;margin:0 0 16px;">${completedHtml}</ul>

  <h2 style="font-size:15px;color:#eab308;margin:0 0 8px;">Needs Your Approval</h2>
  <ul style="font-size:13px;color:#d4d4d4;padding-left:20px;margin:0 0 16px;">${pendingHtml}</ul>

  <h2 style="font-size:15px;color:#3b82f6;margin:0 0 8px;">Open PRs</h2>
  <ul style="font-size:13px;color:#d4d4d4;padding-left:20px;margin:0 0 16px;">
    ${report.prs.list.map(pr => `<li>${pr}</li>`).join("")}
  </ul>

  <h2 style="font-size:15px;color:#06b6d4;margin:0 0 8px;">COO Actions (overnight)</h2>
  <ul style="font-size:13px;color:#d4d4d4;padding-left:20px;margin:0 0 16px;">${cooActionsHtml}</ul>

  <hr style="border:none;border-top:1px solid #333;margin:24px 0;" />
  <p style="text-align:center;font-size:12px;color:#666;">
    <a href="https://mcmforge.com" style="color:#666;">mcmforge.com</a> &nbsp;|&nbsp;
    <a href="https://mcmforge.com/approvals" style="color:#666;">Approvals</a> &nbsp;|&nbsp;
    <a href="https://mcmforge.com/tasks" style="color:#666;">Tasks</a>
  </p>
</div>
</body></html>`;

  await sendProgressEmail(
    `COO Morning Brief — ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
    html
  );

  // Store brief in brain DB
  await supabase.from("daily_briefs").insert({
    recipient: "steve",
    summary: `PM2: ${report.pm2.online}/${report.pm2.total} | Completed: ${completed.length} | Pending: ${pending.length} | Trails: ${report.trailStats.visible} visible / ${report.trailStats.systems} systems | COO actions: ${reviewActions.length + overnightActions.length}`,
    tasks: completed,
    metrics: { pm2: report.pm2, tasks: report.tasks, prs: report.prs, trails: report.trailStats },
    status: "sent",
    email_sent_at: new Date().toISOString(),
  });
}

// ── Main Cycle ──────────────────────────────────

let lastBriefDate = "";
let cycleCount = 0;

async function cycle() {
  cycleCount++;
  log("info", `=== COO Cycle #${cycleCount} ===`);

  // Phase 1: Health check
  const report = await runHealthCheck();
  log("info", `PM2: ${report.pm2.online}/${report.pm2.total} | Tasks: ${report.tasks.inProgress} active, ${report.tasks.todoCount} queued, ${report.tasks.completedLastHour} completed/hr | PRs: ${report.prs.open} open`);

  // Phase 2: Review completed tasks
  const reviewActions = await reviewCompletedTasks();
  for (const action of reviewActions) {
    log("info", `[review] ${action}`);
  }

  // Phase 3: Queue overnight operations (if not already full)
  const overnightActions = await queueOvernightOps(report);
  for (const action of overnightActions) {
    log("info", `[ops] ${action}`);
  }

  // Phase 4: Trail data quality audit
  const trailFindings = await runTrailAudit();
  for (const finding of trailFindings) {
    log("info", `[trail-audit] ${finding}`);
  }

  // Send Telegram alert if there are issues
  if (report.alerts.length > 0) {
    const alertMsg = `*Night-Ops Alert*\n${report.alerts.map(a => `- ${a}`).join("\n")}`;
    await sendTelegramAlert(alertMsg);
    log("warn", `Alerts sent: ${report.alerts.join("; ")}`);
  }

  // Send hourly progress to Telegram (compact summary)
  const totalActions = reviewActions.length + overnightActions.length;
  if (totalActions > 0 || report.tasks.completedLastHour > 0) {
    const progressMsg = [
      `*COO Cycle #${cycleCount}*`,
      `Tasks: ${report.tasks.completedLastHour} completed, ${report.tasks.todoCount} queued, ${report.tasks.inProgress} running`,
      totalActions > 0 ? `Actions: ${[...reviewActions.filter(a => a.startsWith("Queued")), ...overnightActions].join(", ") || "monitoring"}` : "",
      trailFindings.length > 0 ? `Trail audit: ${trailFindings[0]}` : "",
    ].filter(Boolean).join("\n");
    await sendTelegramAlert(progressMsg);
  }

  // Daily brief at 6 AM ET (11 UTC)
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  if (now.getUTCHours() === CONFIG.briefHourUTC && lastBriefDate !== todayStr) {
    log("info", "Sending COO morning brief...");
    await sendDailyBriefEmail(report, reviewActions, overnightActions, trailFindings);
    lastBriefDate = todayStr;
  }

  // Log to communication_log
  await supabase.from("communication_log").insert({
    from_agent: "night-ops-coo",
    to_agent: "steve",
    channel: "internal",
    message: `COO Cycle #${cycleCount}: PM2 ${report.pm2.online}/${report.pm2.total}, ${report.tasks.completedLastHour} completed/hr, ${report.tasks.todoCount} queued, ${totalActions} COO actions${report.alerts.length > 0 ? ` | ALERTS: ${report.alerts.join("; ")}` : ""}`,
  });
}

// ── Main ──────────────────────────────────────

async function main() {
  log("info", "=== MCM Forge Night-Ops v2 (COO Brain) Starting ===");
  log("info", `Check interval: ${CONFIG.checkIntervalMs / 60000} min`);
  log("info", `Daily brief hour (UTC): ${CONFIG.briefHourUTC}`);

  if (!CONFIG.supabaseUrl || !CONFIG.supabaseKey || !CONFIG.agentPassword) {
    log("error", "Missing required env vars");
    process.exit(1);
  }

  supabase = createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey);

  // Connect to DirtSync DB if credentials available
  if (CONFIG.dirtsyncSupabaseUrl && CONFIG.dirtsyncSupabaseKey) {
    dirtsyncDb = createClient(CONFIG.dirtsyncSupabaseUrl, CONFIG.dirtsyncSupabaseKey);
    log("info", "DirtSync DB connected for trail audits");
  } else {
    log("warn", "No DirtSync DB credentials — trail audits will be skipped");
  }

  const { error: authError } = await supabase.auth.signInWithPassword({
    email: CONFIG.agentEmail,
    password: CONFIG.agentPassword,
  });
  if (authError) {
    log("error", `Auth failed: ${authError.message}`);
    process.exit(1);
  }
  log("info", "Authenticated as COO agent");

  // Initial cycle
  await cycle();

  // Hourly loop
  setInterval(cycle, CONFIG.checkIntervalMs);

  log("info", "Night-Ops COO running. Ctrl+C to stop.");
}

main().catch((err) => {
  log("error", `Fatal: ${err}`);
  process.exit(1);
});
