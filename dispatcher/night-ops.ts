#!/usr/bin/env tsx
/**
 * MCM Forge Night-Ops v3 — COO Brain
 *
 * Runs every hour on the Mac Mini via PM2.
 *
 * Every hour:
 * - Health checks (PM2, tasks, PRs across all companies)
 * - Reviews completed tasks + bake-off scoring
 * - Dynamic task generation from vault decisions + data quality findings
 * - Trail data quality audits (live queries, not hardcoded)
 * - Stale approval escalation (4h reminder, 24h auto-reject)
 * - Emails Steve with progress
 *
 * At 6 AM ET: comprehensive morning brief
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { execSync } from "child_process";
import * as dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { SessionManager } from "./session-manager.js";
import { PERSONAS } from "./agent-personas.js";
import { checkEscalationReplies } from "./email-handler.js";

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
  googleClientId: process.env.GOOGLE_OAUTH_CLIENT_ID || "",
  googleClientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET || "",
  googleRefreshToken: process.env.GOOGLE_REFRESH_TOKEN || "",
  checkIntervalMs: 60 * 60 * 1000, // 1 hour
  briefHourUTC: 11, // 6 AM ET = 11 UTC
};

let supabase: SupabaseClient;
let dirtsyncDb: SupabaseClient | null = null;
let sessionManager: SessionManager | null = null;

function log(level: string, msg: string) {
  console.log(`[${new Date().toISOString()}] [night-ops] [${level}] ${msg}`);
}

// ============================================
// COO Session (v6) — Intelligent analysis via persistent session
// ============================================

const SCRATCH_DIR = "/Users/dirtsyncmini/_scratch";

/**
 * Send an analysis prompt to the COO session.
 * Returns the analysis text, or empty string on failure.
 */
async function cooAnalyze(prompt: string): Promise<string> {
  if (!sessionManager) return "";
  try {
    const cooPersona = PERSONAS.coo;
    const session = await sessionManager.getOrCreateSession(cooPersona, null);
    if (!session) return "";
    const result = await sessionManager.sendToSession(session, prompt, SCRATCH_DIR, { timeoutMs: 5 * 60 * 1000 });
    return result.success ? result.output : "";
  } catch (err) {
    log("warn", `COO analyze failed: ${err}`);
    return "";
  }
}

async function isSessionModeEnabled(): Promise<boolean> {
  try {
    const { data } = await supabase
      .from("system_config")
      .select("value")
      .eq("key", "session_mode")
      .single();
    return data?.value === "enabled";
  } catch {
    return false;
  }
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
    // Query all companies with github repos from the registry
    const { data: companies } = await supabase
      .from("company_registry")
      .select("slug, github_repo")
      .eq("status", "active")
      .not("github_repo", "is", null);

    const allPrs: string[] = [];

    for (const company of (companies || [])) {
      if (!company.github_repo) continue;
      try {
        const raw = execSync(
          `export PATH=${PATH_PREFIX}:$PATH && gh pr list --repo ${company.github_repo} --state open --json number,title --limit 10 2>/dev/null`,
          { encoding: "utf-8", timeout: 15000 }
        );
        const prs = JSON.parse(raw);
        for (const pr of prs) {
          allPrs.push(`[${company.slug}] #${pr.number}: ${pr.title}`);
        }
      } catch {
        allPrs.push(`[${company.slug}] pr-check-failed`);
      }
    }

    return { open: allPrs.length, list: allPrs.slice(0, 15) };
  } catch {
    return { open: 0, list: ["pr-check-failed"] };
  }
}

async function checkTrailStats(): Promise<HealthReport["trailStats"]> {
  if (!dirtsyncDb) return { total: 0, visible: 0, hidden: 0, gpsMiles: 0, systems: 0 };
  try {
    const [totalRes, visibleRes, hiddenRes, milesRes, systemsRes] = await Promise.all([
      dirtsyncDb.from("trail_lines").select("id", { count: "exact", head: true }),
      dirtsyncDb.from("trail_lines").select("id", { count: "exact", head: true }).eq("hidden", false),
      dirtsyncDb.from("trail_lines").select("id", { count: "exact", head: true }).eq("hidden", true),
      dirtsyncDb.from("trail_lines").select("distance_miles").eq("hidden", false).not("distance_miles", "is", null),
      dirtsyncDb.from("trail_lines").select("system_name").eq("hidden", false).not("system_name", "is", null),
    ]);

    // Calculate actual miles from DB
    const totalMiles = (milesRes.data || []).reduce((sum: number, t: any) => sum + (t.distance_miles || 0), 0);
    // Count unique systems
    const uniqueSystems = new Set((systemsRes.data || []).map((t: any) => t.system_name)).size;

    return {
      total: totalRes.count || 0,
      visible: visibleRes.count || 0,
      hidden: hiddenRes.count || 0,
      gpsMiles: Math.round(totalMiles),
      systems: uniqueSystems,
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
  cost_cap?: number;
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

// Bake-off ONLY for research tasks (Claude always wins code — Session 15 data)
const BAKEOFF_CLIS: CliTool[] = ["claude", "gemini"];

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

    // Research → Action: auto-create follow-up tasks from actionable findings
    if (task.task_type === "research" && task.status === "done" && task.result_summary) {
      const followUp = await createFollowUpFromResearch(task);
      if (followUp) {
        actions.push(`→ Auto-created ${followUp.type} task from research: "${followUp.title}"`);
      }
    }

    // If a code task was blocked, record the pattern for learning
    if (task.status === "blocked" && task.task_type === "code") {
      actions.push(`→ Code task "${task.title}" is blocked — needs manual review`);
    }
  }

  // Review completed bakeoff groups
  const { data: completedBakeoffs } = await supabase
    .from("task_queue")
    .select("id, title, bakeoff_group, cli_target, result_summary, status")
    .not("bakeoff_group", "is", null)
    .in("status", ["done", "review"])
    .order("created_at", { ascending: false })
    .limit(20);

  if (completedBakeoffs && completedBakeoffs.length > 0) {
    const groups: Record<string, typeof completedBakeoffs> = {};
    for (const task of completedBakeoffs) {
      if (!task.bakeoff_group) continue;
      if (!groups[task.bakeoff_group]) groups[task.bakeoff_group] = [];
      groups[task.bakeoff_group].push(task);
    }

    for (const [groupId, tasks] of Object.entries(groups)) {
      if (tasks.length < 2) continue; // Need both entries
      if (reviewedBakeoffs.has(groupId)) continue; // Already reviewed this cycle
      const allDone = tasks.every(t => t.status === "done" || t.status === "review");
      if (!allDone) continue;

      // Simple comparison: both done, pick winner by summary length as proxy
      const winner = tasks.reduce((a, b) =>
        (a.result_summary || "").length > (b.result_summary || "").length ? a : b
      );

      // Post to war room
      await supabase.from("communication_log").insert({
        from_agent: "night-ops",
        to_agent: "all",
        channel: "war_room",
        message: `[CODE-OFF RESULT] "${tasks[0].title}"\nWinner: ${winner.cli_target}\n${tasks.map(t => `${t.cli_target}: ${(t.result_summary || "No summary").slice(0, 100)}`).join("\n")}`,
        summary: `Code-off winner: ${winner.cli_target} on "${tasks[0].title?.slice(0, 50)}"`,
        company_id: null,
        task_id: winner.id,
      });

      actions.push(`Code-off result: ${winner.cli_target} won "${tasks[0].title?.slice(0, 60)}"`);
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

// ── Research → Action Pipeline ──────────────────
// When research finds actionable insights, auto-create follow-up tasks

async function createFollowUpFromResearch(task: any): Promise<{ title: string; type: string } | null> {
  const summary = (task.result_summary || "").toLowerCase();

  // Only create follow-ups for research with concrete recommendations
  const hasAction = summary.includes("recommend") || summary.includes("should implement") ||
    summary.includes("opportunity") || summary.includes("action item") ||
    summary.includes("we should") || summary.includes("quick win");

  if (!hasAction) return null;

  // Extract the key insight for the task title (first sentence of summary)
  const firstSentence = (task.result_summary || "").split(/[.!?\n]/)[0].trim();

  // Don't create follow-ups if we already have too many tasks
  const { count } = await supabase
    .from("task_queue")
    .select("id", { count: "exact" })
    .eq("status", "todo");
  if ((count || 0) >= 5) return null;

  // Determine follow-up type from the research content
  let followUpType = "research"; // default: deeper research
  let followUpCli: CliTool = "gemini";

  if (summary.includes("implement") || summary.includes("build") || summary.includes("add feature") || summary.includes("create page") || summary.includes("landing page")) {
    followUpType = "code";
    followUpCli = "claude";
  } else if (summary.includes("marketing") || summary.includes("seo") || summary.includes("content") || summary.includes("email campaign") || summary.includes("social")) {
    followUpType = "content";
    followUpCli = "gemini";
  }

  // Upgrade to proposal if research contains strategic recommendations
  if (summary.includes("recommend") || summary.includes("strategy") || summary.includes("plan") || summary.includes("proposal")) {
    if (followUpType === "research") { // only upgrade if not already code
      followUpType = "proposal";
      followUpCli = "claude";
    }
  }

  // Save to research_findings table
  try {
    await supabase.from("research_findings").insert({
      topic: task.title,
      finding: (task.result_summary || "").slice(0, 2000),
      recommendation: firstSentence,
      urgency: summary.includes("urgent") || summary.includes("critical") ? "high" : "medium",
      proposed_action: followUpType,
      status: "new",
      company_id: task.company_id,
      task_id: task.id,
    });
  } catch (err) {
    log("warn", `Failed to save research finding: ${err}`);
  }

  // Urgent intel alert
  if (summary.includes("critical") || summary.includes("urgent") || summary.includes("breaking")) {
    const alertMsg = `URGENT INTEL: ${task.title}\n${firstSentence}`;
    await sendTelegramAlert(alertMsg);
    log("info", `[URGENT] Sent Telegram alert for: ${task.title}`);
  }

  const actionTitle = firstSentence.length > 80
    ? firstSentence.slice(0, 77) + "..."
    : firstSentence;

  // Check dedup against existing tasks
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const { data: existingTasks } = await supabase
    .from("task_queue")
    .select("title")
    .gte("created_at", cutoff)
    .limit(200);

  const existingTitles = (existingTasks || []).map(t => t.title);
  if (titleMatchesExisting(actionTitle, existingTitles)) return null;

  const id = await createTask({
    title: `Action: ${actionTitle}`,
    description: [
      `## Follow-up from research: "${task.title}"`,
      "",
      "### Research Findings",
      task.result_summary || "No summary available",
      "",
      "### Your Task",
      "Implement the PRIMARY recommendation from the research above.",
      "Focus on the highest-impact, most concrete action item.",
      followUpType === "code" ? "Create a PR with the implementation. Include tests." : "",
      followUpType === "content" ? "Create the content asset. Save output as a markdown artifact." : "",
      followUpType === "proposal" ? "Create a structured proposal with cost/benefit analysis and implementation plan." : "",
    ].filter(Boolean).join("\n"),
    task_type: followUpType,
    company_id: task.company_id,
    priority: "medium",
    cli_target: followUpCli,
  });

  if (!id) return null;

  log("info", `[RESEARCH→ACTION] Created ${followUpType} task from research: ${task.title}`);
  return { title: actionTitle, type: followUpType };
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

// ── Cron Parser (minimal, hand-rolled) ──────────────────
// 5-field format: minute hour day-of-month month day-of-week (UTC)
// Supports: specific values, wildcards (*), comma-separated lists (1,3,5)

function parseCronField(field: string, min: number, max: number): number[] {
  if (field === "*") {
    const values: number[] = [];
    for (let i = min; i <= max; i++) values.push(i);
    return values;
  }
  return field.split(",").map(v => {
    const n = parseInt(v, 10);
    if (isNaN(n) || n < min || n > max) {
      throw new Error(`Invalid cron value: ${v} (range ${min}-${max})`);
    }
    return n;
  });
}

function getNextCronTime(cronExpr: string, after: Date = new Date()): Date {
  const parts = cronExpr.trim().split(/\s+/);
  if (parts.length !== 5) throw new Error(`Invalid cron expression: ${cronExpr}`);

  const minutes = parseCronField(parts[0], 0, 59);
  const hours = parseCronField(parts[1], 0, 23);
  const daysOfMonth = parseCronField(parts[2], 1, 31);
  const months = parseCronField(parts[3], 1, 12);
  const daysOfWeek = parseCronField(parts[4], 0, 6);

  // Start one minute after reference time
  const candidate = new Date(after);
  candidate.setUTCSeconds(0, 0);
  candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);

  // Search up to 400 days to avoid infinite loop
  const limit = new Date(after.getTime() + 400 * 24 * 60 * 60 * 1000);

  while (candidate < limit) {
    if (
      months.includes(candidate.getUTCMonth() + 1) &&
      daysOfMonth.includes(candidate.getUTCDate()) &&
      daysOfWeek.includes(candidate.getUTCDay()) &&
      hours.includes(candidate.getUTCHours()) &&
      minutes.includes(candidate.getUTCMinutes())
    ) {
      return candidate;
    }
    candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);
  }

  throw new Error(`No cron match within 400 days for: ${cronExpr}`);
}

// ── Normalized Dedup ──────────────────────────────
// Prevents the spam loop by comparing task INTENT, not exact titles

function normalizeTaskTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\s*\((claude|gemini|codex)\)\s*/gi, "") // Strip CLI suffixes
    .replace(/^(implement|deploy|fix|build|create|add|update|set up|setup):\s*/i, "") // Strip action prefixes
    .replace(/[^a-z0-9\s]/g, "") // Strip special chars
    .split(/\s+/)
    .filter(w => w.length > 2) // Skip tiny words
    .sort()
    .join(" ")
    .trim();
}

function titleMatchesExisting(baseTitle: string, existingTitles: string[]): boolean {
  const normalized = normalizeTaskTitle(baseTitle);
  if (!normalized) return false;

  for (const existing of existingTitles) {
    // Exact normalized match
    if (normalizeTaskTitle(existing) === normalized) return true;

    // Fuzzy match: >60% word overlap
    const baseWords = new Set(normalized.split(" "));
    const existWords = new Set(normalizeTaskTitle(existing).split(" "));
    if (baseWords.size === 0 || existWords.size === 0) continue;
    const overlap = [...baseWords].filter(w => existWords.has(w)).length;
    const similarity = overlap / Math.max(baseWords.size, existWords.size);
    if (similarity > 0.6) return true;
  }
  return false;
}

// Check if open PRs already cover a feature
function hasOpenPRForFeature(githubRepo: string, keywords: string[]): boolean {
  if (!githubRepo || keywords.length === 0) return false;
  try {
    const raw = execSync(
      `export PATH=${PATH_PREFIX}:$PATH && gh pr list --repo ${githubRepo} --state open --json title --limit 30 2>/dev/null`,
      { encoding: "utf-8", timeout: 15000 }
    );
    const prs = JSON.parse(raw);
    const prTitles = prs.map((p: any) => p.title.toLowerCase());
    return keywords.some(kw =>
      prTitles.some((t: string) => t.includes(kw.toLowerCase()))
    );
  } catch {
    return false;
  }
}

async function queueOvernightOps(report: HealthReport): Promise<string[]> {
  const actions: string[] = [];

  // Only queue new tasks if there's room (don't flood the queue)
  if (report.tasks.todoCount >= 5) {
    actions.push(`Task queue has ${report.tasks.todoCount} pending — not adding more`);
    return actions;
  }

  // Check what tasks already exist to avoid duplicates (48h window, ALL statuses)
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const { data: existingTasks } = await supabase
    .from("task_queue")
    .select("title, status")
    .gte("created_at", cutoff)
    .limit(200);

  const existingTitleList = (existingTasks || []).map(t => t.title);

  // Check what research was completed in last 24h (prevent repeat research)
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: recentCompleted } = await supabase
    .from("task_queue")
    .select("title, task_type")
    .eq("status", "done")
    .gte("completed_at", twentyFourHoursAgo)
    .limit(100);

  const recentResearchTitles = (recentCompleted || [])
    .filter(t => t.task_type === "research")
    .map(t => t.title);

  // Load pending vault decisions — check for approved specs that need implementation
  const taskTemplates = await getTaskTemplatesFromVault();

  // Get active companies for PR checks
  const { data: companies } = await supabase
    .from("company_registry")
    .select("id, slug, github_repo")
    .eq("status", "active")
    .not("github_repo", "is", null);
  const companyRepoMap = new Map((companies || []).map(c => [c.id, c.github_repo]));

  // Company rotation: ensure every active company gets attention
  const { data: companyMetrics } = await supabase
    .from("company_task_metrics")
    .select("*");

  const neglectedCompanies = (companyMetrics || [])
    .filter(c => {
      if (!c.last_task_at) return true; // never had a task
      const hoursSinceTask = (Date.now() - new Date(c.last_task_at).getTime()) / (1000 * 60 * 60);
      return hoursSinceTask > 48;
    })
    .map(c => c.slug);

  if (neglectedCompanies.length > 0) {
    log("info", `[ROTATION] Neglected companies (>48h no tasks): ${neglectedCompanies.join(", ")}`);
    // Prioritize templates from neglected companies
    taskTemplates.sort((a, b) => {
      const aNeglected = neglectedCompanies.some(slug => {
        const match = companyMetrics?.find(c => c.slug === slug);
        return match && a.company_id === match.id;
      }) ? 1 : 0;
      const bNeglected = neglectedCompanies.some(slug => {
        const match = companyMetrics?.find(c => c.slug === slug);
        return match && b.company_id === match.id;
      }) ? 1 : 0;
      return bNeglected - aNeglected;
    });
  }

  for (const template of taskTemplates) {
    // Normalized dedup — catches title variants
    if (titleMatchesExisting(template.title, existingTitleList)) {
      log("debug", `Dedup: skipping "${template.title}" (normalized match)`);
      continue;
    }

    // Research frequency cap — skip if same research done in last 24h
    if (template.task_type === "research" && titleMatchesExisting(template.title, recentResearchTitles)) {
      log("debug", `Research cap: skipping "${template.title}" (completed in last 24h)`);
      continue;
    }

    // PR-aware check — skip if open PRs already cover this feature
    const githubRepo = companyRepoMap.get(template.company_id) || "";
    if (template.task_type === "code" && githubRepo) {
      const keywords = template.title.toLowerCase().split(/\s+/).filter(w => w.length > 3);
      if (hasOpenPRForFeature(githubRepo, keywords.slice(0, 3))) {
        log("info", `PR-aware skip: "${template.title}" (open PR already covers this)`);
        actions.push(`Skipped: ${template.title} (open PR exists)`);
        continue;
      }
    }

    if (report.tasks.todoCount + actions.length >= 5) break; // don't over-queue

    // Code tasks always go to Claude (no more bake-offs — Claude always wins)
    // Research bake-offs only for high-priority research
    if (template.priority === "high" && template.task_type === "research") {
      const created = await createBakeoffTasks({
        title: template.title,
        description: template.description,
        task_type: template.task_type,
        company_id: template.company_id,
        priority: template.priority,
        skill_name: template.skill_name,
      });
      if (created.length > 0) {
        actions.push(`Research bake-off: ${template.title} → ${created.map(c => c.split(":")[0]).join(", ")}`);
      }
    } else {
      // All code → Claude, research → Gemini, else → smart route
      const cli = template.task_type === "code" ? "claude" as CliTool : getSmartCli(template.task_type);
      const id = await createTask({
        ...template,
        cli_target: cli,
      });
      if (id) actions.push(`Routed: ${template.title} → ${cli}`);
    }
  }

  // Weekly code-off: same task, both agents (code tasks only, max 1 per week)
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: recentBakeoffs } = await supabase
    .from("task_queue")
    .select("id")
    .not("bakeoff_group", "is", null)
    .gte("created_at", oneWeekAgo);

  if ((!recentBakeoffs || recentBakeoffs.length === 0) && actions.length > 0) {
    // Find a suitable code task for a code-off
    const codeTemplate = taskTemplates.find(t => t.task_type === "code" && t.priority !== "low");
    if (codeTemplate) {
      const bakeoffGroup = crypto.randomUUID();
      const claudeId = await createTask({ ...codeTemplate, cli_target: "claude", bakeoff_group: bakeoffGroup });
      const geminiId = await createTask({ ...codeTemplate, cli_target: "gemini", bakeoff_group: bakeoffGroup });
      if (claudeId && geminiId) {
        actions.push(`Code-off created: "${codeTemplate.title}" (Claude vs Gemini)`);
        log("info", `[CODE-OFF] Created bakeoff: ${codeTemplate.title}`);
      }
    }
  }

  if (actions.length === 0) {
    actions.push("No new tasks needed — queue is up to date");
  }

  return actions;
}

// Load task templates dynamically from vault decisions and trail audit findings
async function getTaskTemplatesFromVault(): Promise<Array<TaskTemplate & { company_id: string }>> {
  const templates: Array<TaskTemplate & { company_id: string }> = [];

  // Get active companies
  const { data: companies } = await supabase
    .from("company_registry")
    .select("id, slug, name")
    .eq("status", "active");

  if (!companies) return templates;

  const companyMap = new Map(companies.map(c => [c.slug, c.id]));
  const dirtsyncId = companyMap.get("dirtsync");

  // Check vault for approved decisions that need implementation
  const { data: decisions } = await supabase
    .from("vault_docs")
    .select("title, content, company_id")
    .eq("category", "decision")
    .order("created_at", { ascending: false })
    .limit(10);

  if (decisions) {
    for (const doc of decisions) {
      // Look for decision docs that mention "approved" and have acceptance criteria
      const content = doc.content?.toLowerCase() || "";
      if (content.includes("approved") && content.includes("acceptance criteria") && doc.company_id) {
        templates.push({
          title: `Implement: ${doc.title}`,
          description: doc.content?.slice(0, 3000) || doc.title,
          task_type: "code",
          cli_target: "claude",
          company_id: doc.company_id,
          priority: "high",
          skill_name: "plan-then-code",
        });
      }
    }
  }

  // Trail-data driven tasks (only if DirtSync exists and has issues)
  if (dirtsyncId && dirtsyncDb) {
    // Check if trail difficulty classification is needed
    const { count: noDiffCount } = await dirtsyncDb
      .from("trail_lines")
      .select("id", { count: "exact", head: true })
      .eq("hidden", false)
      .is("difficulty", null)
      .eq("is_connector", false);

    if (noDiffCount && noDiffCount > 100) {
      templates.push({
        title: "Classify trail difficulty ratings from GPS data",
        description: `${noDiffCount} trails need difficulty classification. Analyze trail geometry (elevation gain, distance, steepness) to assign difficulty ratings (easy/moderate/hard/expert). Use the trail_lines table distance_miles and geometry to estimate difficulty.`,
        task_type: "code",
        cli_target: "claude",
        company_id: dirtsyncId,
        priority: "medium",
      });
    }
  }

  // ── Ideation & Shipping Tasks ──────────────────
  // Agents should bring US ideas, not just execute orders

  if (dirtsyncId) {
    // Weekly feature proposals (check if already done this week)
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Start of week
    const weekStartStr = weekStart.toISOString();

    const { count: proposalsThisWeek } = await supabase
      .from("task_queue")
      .select("id", { count: "exact", head: true })
      .ilike("title", "%feature proposal%")
      .gte("created_at", weekStartStr);

    if (!proposalsThisWeek || proposalsThisWeek < 3) {
      templates.push({
        title: "Feature proposal: identify top DirtSync improvement",
        description: [
          "Research competitors (OnX Off-Road, Gaia GPS, AllTrails) and identify ONE high-impact feature we should build next.",
          "",
          "Your proposal must include:",
          "1. What specific user problem it solves",
          "2. How competitors handle it (with specifics)",
          "3. Concrete implementation approach (which files, which APIs)",
          "4. Effort estimate (Small/Medium/Large)",
          "5. Why THIS feature over alternatives",
          "",
          "Focus on features that differentiate DirtSync from OnX.",
          "Check vault/competitors/onx.md for competitive context.",
          "Check vault/companies/dirtsync.md for current capabilities.",
          "",
          "Output a structured proposal using the Feature Proposal skill format.",
        ].join("\n"),
        task_type: "research",
        cli_target: "gemini",
        company_id: dirtsyncId,
        priority: "medium",
        skill_name: "feature-proposal",
      });
    }

    // Daily: Review open PRs and recommend best to merge
    templates.push({
      title: "PR triage: review open PRs and recommend merge/close",
      description: [
        "Review all open PRs on golfballnut/DirtSync.",
        "For each PR, assess:",
        "1. Does CI pass?",
        "2. Does it match an approved spec in the vault?",
        "3. Is it a duplicate of another PR?",
        "4. Is the code quality acceptable?",
        "",
        "Output:",
        "- MERGE: list PRs ready to merge (CI green, matches spec)",
        "- CLOSE: list duplicate/stale PRs to close (with reason)",
        "- FIX: list PRs that need small fixes before merge",
        "",
        "Run: gh pr list --repo golfballnut/DirtSync --state open",
        "For each promising PR: gh pr checks {number} --repo golfballnut/DirtSync",
      ].join("\n"),
      task_type: "research",
      cli_target: "claude",
      company_id: dirtsyncId,
      priority: "high",
    });
  }

  // ========== Revenue Business Templates ==========

  // Hot Golf Brands (priority: first after DirtSync)
  const hotGolfId = await getCompanyId("hotgolfbrands");
  if (hotGolfId) {
    templates.push({
      title: "Research: Hot Golf Brands competitor pricing analysis",
      description: [
        "## Competitor Pricing Research",
        "Analyze competitor pricing for bulk mesh golf ball bags (48-count and 100-count).",
        "Check: Amazon, eBay, Walmart, direct competitors.",
        "Report: price ranges, shipping costs, bundle deals, customer reviews.",
        "Recommend: optimal pricing strategy for HGB launch.",
      ].join("\n"),
      task_type: "research",
      cli_target: "gemini",
      company_id: hotGolfId,
      priority: "medium",
    });

    templates.push({
      title: "Research: Hot Golf Brands Google Shopping setup strategy",
      description: [
        "## Google Shopping Strategy",
        "Research requirements for Google Shopping integration with Shopify.",
        "Cover: Merchant Center setup, product feed optimization, bidding strategy.",
        "Recommend: budget allocation and expected ROAS for golf ball category.",
      ].join("\n"),
      task_type: "research",
      cli_target: "gemini",
      company_id: hotGolfId,
      priority: "medium",
    });

    templates.push({
      title: "Research: Hot Golf Brands launch marketing plan",
      description: [
        "## Launch Marketing Plan",
        "Create a launch marketing plan for hotgolfbrands.com.",
        "Include: social media strategy, email marketing, influencer outreach.",
        "Focus: budget-conscious golf audience, bulk buyers, golf course managers.",
      ].join("\n"),
      task_type: "research",
      cli_target: "gemini",
      company_id: hotGolfId,
      priority: "low",
    });
  }

  // Golf Ball Nut
  const gbnId = await getCompanyId("golfballnut");
  if (gbnId) {
    templates.push({
      title: "Research: Golf Ball Nut email re-engagement strategy",
      description: [
        "## Email Re-engagement Strategy",
        "GBN has a 300K+ email list. Design a re-engagement campaign:",
        "1. Segment analysis: active vs dormant subscribers",
        "2. Win-back email sequence (3-5 emails)",
        "3. Subject line strategies for golf audience",
        "4. Cross-sell opportunities with Hot Golf Brands",
        "5. Expected re-engagement rates and revenue projections",
      ].join("\n"),
      task_type: "research",
      cli_target: "gemini",
      company_id: gbnId,
      priority: "medium",
    });

    templates.push({
      title: "Research: Golf Ball Nut SEO audit and opportunities",
      description: [
        "## SEO Audit",
        "Comprehensive SEO audit for golfballnut.com:",
        "- Current organic traffic and keyword rankings",
        "- Technical SEO issues (page speed, mobile, structured data)",
        "- Content gaps vs competitors (lostgolfballs.com, etc.)",
        "- Local SEO opportunities",
        "- Recommend top 5 quick-win actions",
      ].join("\n"),
      task_type: "research",
      cli_target: "gemini",
      company_id: gbnId,
      priority: "medium",
    });
  }

  // Links Choice
  const lcId = await getCompanyId("linkschoice");
  if (lcId) {
    templates.push({
      title: "Research: Links Choice B2B outreach strategy",
      description: [
        "## B2B Sales Strategy",
        "Links Choice processes 20M+ golf balls/year at their plant.",
        "Research B2B outreach strategy for golf course partnerships:",
        "- Target: golf courses, driving ranges, resellers",
        "- Value prop: bulk pricing, quality grades, custom sorting",
        "- Outreach channels: email, LinkedIn, trade shows",
        "- Recommend: initial outreach template and target list criteria",
      ].join("\n"),
      task_type: "research",
      cli_target: "gemini",
      company_id: lcId,
      priority: "low",
    });

    templates.push({
      title: "Research: Links Choice market and capacity analysis",
      description: [
        "## Market Analysis",
        "Analyze the recycled golf ball market:",
        "- Market size and growth trends",
        "- Key competitors and their capacity",
        "- Links Choice competitive advantages (20M/year plant)",
        "- Pricing trends by grade (AAAA, AAA, AA)",
        "- Recommend: capacity utilization strategy",
      ].join("\n"),
      task_type: "research",
      cli_target: "gemini",
      company_id: lcId,
      priority: "low",
    });
  }

  // ========== Intelligence Scanning Templates ==========

  // Daily AI/tech scanning (Gemini)
  const mcmforgeId = await getCompanyId("mcmforge");
  if (mcmforgeId) {
    templates.push({
      title: "Intelligence: Daily AI model and tool updates scan",
      description: [
        "## Daily AI Intelligence Scan",
        "Check for new releases and updates in AI/ML tools:",
        "- New model releases (OpenAI, Anthropic, Google, Meta)",
        "- Tool updates (Cursor, Copilot, Claude Code, Windsurf)",
        "- New frameworks or libraries gaining traction",
        "- Pricing changes or new tiers",
        "Report: summarize top 3-5 findings with links and relevance to MCM Forge.",
      ].join("\n"),
      task_type: "research",
      cli_target: "gemini",
      company_id: mcmforgeId,
      priority: "low",
    });
  }

  // Weekly competitor monitoring per business (rotate)
  const dayOfWeek = new Date().getDay(); // 0=Sun, 1=Mon, etc.
  const competitorTargets = [
    { slug: "dirtsync", competitors: "OnX Hunt, AllTrails, Gaia GPS", day: 1 },
    { slug: "golfballnut", competitors: "lostgolfballs.com, 2ndswing.com, Amazon golf ball sellers", day: 3 },
    { slug: "hotgolfbrands", competitors: "Amazon bulk golf balls, Walmart golf balls, eBay bulk sellers", day: 5 },
  ];

  for (const target of competitorTargets) {
    if (dayOfWeek === target.day) {
      const compId = await getCompanyId(target.slug);
      if (compId) {
        templates.push({
          title: `Intelligence: ${target.slug} weekly competitor scan`,
          description: [
            `## Weekly Competitor Monitoring — ${target.slug}`,
            `Competitors to monitor: ${target.competitors}`,
            "Check for: new features, pricing changes, marketing campaigns, customer reviews.",
            "Rate each finding: Critical / High / Medium / Low urgency.",
            "Recommend: specific actions we should take in response.",
          ].join("\n"),
          task_type: "research",
          cli_target: "gemini",
          company_id: compId,
          priority: "medium",
        });
      }
    }
  }

  return templates;
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

// ── Skill Scheduler ──────────────────────────────

interface SkillSchedule {
  id: string;
  skill_name: string;
  company_id: string;
  cli_target: string;
  cron_expression: string;
  task_type: string;
  priority: string;
  cost_cap: number;
  task_description_template: string | null;
  last_run_at: string | null;
  next_run_at: string | null;
}

async function runSkillScheduler(): Promise<string[]> {
  const actions: string[] = [];

  try {
    // 1. Query all enabled schedules that are due
    const now = new Date().toISOString();
    const { data: dueSchedules, error } = await supabase
      .from("skill_schedule")
      .select("*")
      .eq("enabled", true)
      .lte("next_run_at", now);

    if (error) {
      log("warn", `[scheduler] Query failed: ${error.message}`);
      return actions;
    }

    if (!dueSchedules || dueSchedules.length === 0) {
      return actions;
    }

    log("info", `[scheduler] ${dueSchedules.length} skill(s) due to run`);

    for (const schedule of dueSchedules as SkillSchedule[]) {
      try {
        // 2a. Dedup: skip if same skill+company already queued or running
        const { count: existingCount } = await supabase
          .from("task_queue")
          .select("id", { count: "exact", head: true })
          .eq("skill_name", schedule.skill_name)
          .eq("company_id", schedule.company_id)
          .in("status", ["todo", "in_progress"]);

        if (existingCount && existingCount > 0) {
          log("info", `[scheduler] Skipping ${schedule.skill_name} — already queued/running`);
          actions.push(`Skipped: ${schedule.skill_name} (already in queue)`);

          // Still advance next_run_at so we don't re-trigger every cycle
          const nextRun = getNextCronTime(schedule.cron_expression);
          await supabase
            .from("skill_schedule")
            .update({ next_run_at: nextRun.toISOString() })
            .eq("id", schedule.id);
          continue;
        }

        // 2b. Resolve company name for template substitution
        const { data: company } = await supabase
          .from("company_registry")
          .select("name, slug")
          .eq("id", schedule.company_id)
          .single();

        const companyName = company?.name || "Unknown";
        const dateStr = new Date().toISOString().slice(0, 10);

        // 2c. Build description from template
        let description = schedule.task_description_template
          || `Run ${schedule.skill_name} skill for ${companyName}`;
        description = description
          .replace(/\{company_name\}/g, companyName)
          .replace(/\{date\}/g, dateStr)
          .replace(/\{skill_name\}/g, schedule.skill_name);

        // 2d. Create task via existing createTask()
        const taskId = await createTask({
          title: `[Scheduled] ${schedule.skill_name} — ${companyName}`,
          description,
          task_type: schedule.task_type,
          cli_target: schedule.cli_target,
          company_id: schedule.company_id,
          priority: schedule.priority,
          skill_name: schedule.skill_name,
          cost_cap: schedule.cost_cap,
        });

        if (taskId) {
          // 2e. Advance schedule: last_run_at + next_run_at
          const nextRun = getNextCronTime(schedule.cron_expression);
          await supabase
            .from("skill_schedule")
            .update({
              last_run_at: new Date().toISOString(),
              next_run_at: nextRun.toISOString(),
            })
            .eq("id", schedule.id);

          actions.push(`Scheduled: ${schedule.skill_name} → ${schedule.cli_target} (next: ${nextRun.toISOString().slice(0, 16)})`);
          log("info", `[scheduler] Created task ${taskId} for ${schedule.skill_name}, next run: ${nextRun.toISOString()}`);
        }
      } catch (schedErr) {
        log("warn", `[scheduler] Failed to process ${schedule.skill_name}: ${schedErr}`);
        actions.push(`Error: ${schedule.skill_name} — ${schedErr}`);
      }
    }

    // 3. War room log
    if (actions.length > 0) {
      await supabase.from("communication_log").insert({
        from_agent: "night-ops-coo",
        to_agent: "steve",
        channel: "war_room",
        message: `Skill Scheduler: ${actions.join("; ")}`,
      });
    }
  } catch (err) {
    log("warn", `[scheduler] Scheduler failed: ${err}`);
  }

  return actions;
}

// ── Stale Approval Escalation ──────────────────

async function escalateStaleApprovals() {
  try {
    const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Get pending approvals
    const { data: stale } = await supabase
      .from("approval_queue")
      .select("id, title, task_id, created_at, pr_url")
      .eq("status", "pending")
      .lt("created_at", fourHoursAgo);

    if (!stale || stale.length === 0) return;

    for (const approval of stale) {
      const age = Date.now() - new Date(approval.created_at).getTime();
      const ageHours = Math.round(age / 3600000);

      if (approval.created_at < twentyFourHoursAgo) {
        // 24h+ → auto-reject
        await supabase
          .from("approval_queue")
          .update({ status: "rejected", decided_by: "coo-auto", decided_at: new Date().toISOString(), decision_notes: "Auto-rejected: no response after 24 hours" })
          .eq("id", approval.id);

        await supabase
          .from("task_queue")
          .update({ status: "rejected", result_summary: "PR auto-rejected — no approval after 24h", updated_at: new Date().toISOString() })
          .eq("id", approval.task_id);

        log("warn", `Auto-rejected stale approval (${ageHours}h): ${approval.title}`);
        await sendTelegramAlert(`Auto-rejected: *${approval.title}* (no response after ${ageHours}h)`);
      } else {
        // 4-24h → reminder
        await sendTelegramAlert(`Reminder: *${approval.title}* waiting for approval (${ageHours}h)\n${approval.pr_url || "No PR link"}`);
        log("info", `[escalation] Sent reminder for ${approval.title} (${ageHours}h stale)`);
      }
    }
  } catch (err) {
    log("warn", `Approval escalation failed: ${err}`);
  }
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

  // Agent leaderboard (7-day)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: leaderboardData } = await supabase
    .from("skill_metrics")
    .select("cli_target, success, execution_time_ms, estimated_cost_cents")
    .gte("created_at", sevenDaysAgo);

  let leaderboardHtml = "";
  if (leaderboardData && leaderboardData.length > 0) {
    const byAgent: Record<string, { total: number; success: number; totalTime: number; totalCost: number }> = {};
    for (const m of leaderboardData) {
      const agent = m.cli_target || "unknown";
      if (!byAgent[agent]) byAgent[agent] = { total: 0, success: 0, totalTime: 0, totalCost: 0 };
      byAgent[agent].total++;
      if (m.success) byAgent[agent].success++;
      byAgent[agent].totalTime += m.execution_time_ms || 0;
      byAgent[agent].totalCost += Number(m.estimated_cost_cents || 0);
    }

    const rows = Object.entries(byAgent)
      .sort((a, b) => b[1].total - a[1].total)
      .map(([agent, stats]) => {
        const rate = Math.round((stats.success / stats.total) * 100);
        const avgTime = Math.round(stats.totalTime / stats.total / 1000);
        const cost = (stats.totalCost / 100).toFixed(2);
        return `<tr><td><strong>${agent}</strong></td><td>${stats.total}</td><td>${rate}%</td><td>${avgTime}s</td><td>$${cost}</td></tr>`;
      }).join("");

    leaderboardHtml = `
      <h3 style="font-size:14px;color:#f59e0b;margin:16px 0 8px;">Agent Leaderboard (7-day)</h3>
      <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:12px;color:#d4d4d4;border-color:#444;">
        <tr style="background:#262626;"><th>Agent</th><th>Tasks</th><th>Success</th><th>Avg Time</th><th>Cost</th></tr>
        ${rows}
      </table>
    `;
  }

  // Compute usage (24h)
  const { data: computeData } = await supabase
    .from("skill_metrics")
    .select("cli_target, token_count, estimated_cost_cents, success, company_id")
    .gte("created_at", oneDayAgo);

  let computeHtml = "";
  if (computeData && computeData.length > 0) {
    const totalTokens = computeData.reduce((s, m) => s + (m.token_count || 0), 0);
    const totalCost = computeData.reduce((s, m) => s + Number(m.estimated_cost_cents || 0), 0) / 100;
    const successCount = computeData.filter(m => m.success).length;
    const wastePercent = Math.round(((computeData.length - successCount) / computeData.length) * 100);

    // By agent
    const byAgentCost: Record<string, number> = {};
    for (const m of computeData) {
      const agent = m.cli_target || "unknown";
      byAgentCost[agent] = (byAgentCost[agent] || 0) + Number(m.estimated_cost_cents || 0);
    }
    const agentBreakdown = Object.entries(byAgentCost)
      .map(([a, c]) => `${a} $${(c / 100).toFixed(2)}`).join(" | ");

    computeHtml = `
      <h3 style="font-size:14px;color:#10b981;margin:16px 0 8px;">Compute Usage (24h)</h3>
      <ul style="font-size:12px;color:#d4d4d4;padding-left:20px;margin:0 0 8px;">
        <li>Total tokens: ~${(totalTokens / 1000).toFixed(0)}K (est. $${totalCost.toFixed(2)})</li>
        <li>By agent: ${agentBreakdown}</li>
        <li>Productive: ${100 - wastePercent}% | Wasted (failures): ${wastePercent}%</li>
      </ul>
    `;
  }

  // War Room highlights (24h)
  const { data: warRoomPosts } = await supabase
    .from("communication_log")
    .select("from_agent, message, created_at")
    .eq("channel", "war_room")
    .gte("created_at", oneDayAgo)
    .order("created_at", { ascending: false })
    .limit(10);

  let warRoomHtml = "";
  if (warRoomPosts && warRoomPosts.length > 0) {
    const items = warRoomPosts.map(p => {
      const time = new Date(p.created_at).toLocaleString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });
      return `<li><strong>${p.from_agent}</strong> [${time}]: ${(p.message || "").slice(0, 150)}</li>`;
    }).join("");
    warRoomHtml = `<h3 style="font-size:14px;color:#8b5cf6;margin:16px 0 8px;">War Room (24h)</h3><ul style="font-size:12px;color:#d4d4d4;padding-left:20px;margin:0 0 8px;">${items}</ul>`;
  }

  // Per-company task breakdown
  const { data: companyBreakdown } = await supabase
    .from("company_task_metrics")
    .select("*");

  let companyHtml = "";
  if (companyBreakdown && companyBreakdown.length > 0) {
    const companyRows = companyBreakdown
      .sort((a: any, b: any) => (b.last_7d || 0) - (a.last_7d || 0))
      .map((c: any) => {
        const lastTask = c.last_task_at ? new Date(c.last_task_at).toLocaleDateString() : "Never";
        return `<tr><td><strong>${c.name}</strong></td><td>${c.total_tasks || 0}</td><td>${c.completed || 0}</td><td>${c.last_7d || 0}</td><td>${lastTask}</td></tr>`;
      }).join("");
    companyHtml = `
      <h3 style="font-size:14px;color:#ec4899;margin:16px 0 8px;">Company Coverage</h3>
      <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:12px;color:#d4d4d4;border-color:#444;">
        <tr style="background:#262626;"><th>Company</th><th>Total</th><th>Done</th><th>Last 7d</th><th>Last Task</th></tr>
        ${companyRows}
      </table>
    `;
  }

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

  ${leaderboardHtml}
  ${computeHtml}
  ${warRoomHtml}
  ${companyHtml}

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

// ── Learning → Skill Updates ──────────────────────

async function applyLearningsToSkills() {
  try {
    // Find unapplied failure patterns (3+ occurrences of same error_type)
    const { data: learnings } = await supabase
      .from("agent_learnings")
      .select("id, error_type, prevention_rule, skill_name, company_id")
      .eq("was_applied_to_skill", false)
      .eq("outcome", "failure");

    if (!learnings || learnings.length === 0) return;

    // Group by error_type
    const byType: Record<string, typeof learnings> = {};
    for (const l of learnings) {
      const key = l.error_type || "unknown";
      if (!byType[key]) byType[key] = [];
      byType[key].push(l);
    }

    for (const [errorType, items] of Object.entries(byType)) {
      if (items.length < 3) continue; // Need 3+ occurrences to act

      // Create a content task to update the relevant skill
      const preventionRules = items
        .map(i => i.prevention_rule)
        .filter(Boolean)
        .slice(0, 5)
        .join("\n- ");

      const skillName = items[0].skill_name || "general";

      await createTask({
        title: `Update skill: address recurring ${errorType} failures`,
        description: [
          `## Skill Update: ${errorType} pattern`,
          `This error pattern has occurred ${items.length} times.`,
          "",
          "### Prevention rules to incorporate:",
          `- ${preventionRules}`,
          "",
          "### Task:",
          `Update the "${skillName}" skill document to include these prevention rules.`,
          "Add specific instructions to avoid this error pattern in future tasks.",
        ].join("\n"),
        task_type: "content",
        cli_target: "claude",
        company_id: items[0].company_id || (await getCompanyId("mcmforge")) || "",
        priority: "low",
      });

      // Mark learnings as applied
      const ids = items.map(i => i.id).filter(Boolean);
      if (ids.length > 0) {
        await supabase
          .from("agent_learnings")
          .update({ was_applied_to_skill: true, applied_at: new Date().toISOString() })
          .in("id", ids);
      }

      log("info", `[LEARNING→SKILL] Created skill update for ${errorType} (${items.length} occurrences)`);
    }
  } catch (err) {
    log("warn", `applyLearningsToSkills failed: ${err}`);
  }
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

  // Phase 1.5: Skill scheduler (create tasks for due schedules)
  const schedulerActions = await runSkillScheduler();
  for (const action of schedulerActions) {
    log("info", `[scheduler] ${action}`);
  }

  // Phase 1.7: Check email replies for escalation responses
  const emailActions = await checkEscalationReplies({
    supabase,
    googleClientId: CONFIG.googleClientId,
    googleClientSecret: CONFIG.googleClientSecret,
    googleRefreshToken: CONFIG.googleRefreshToken,
    log,
    sendTelegramAlert,
  });
  for (const action of emailActions) {
    log("info", `[email] ${action}`);
  }

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

  // Phase 4.5: Escalate stale approvals
  await escalateStaleApprovals();

  // Phase 5: Apply learnings to skills
  await applyLearningsToSkills();

  // Phase 6: Session cleanup (v6)
  if (sessionManager) {
    try {
      const cleaned = await sessionManager.cleanupExpiredSessions();
      if (cleaned > 0) log("info", `[sessions] Cleaned ${cleaned} expired sessions`);
      const health = await sessionManager.getSessionHealth();
      if (health.active > 0 || health.errors24h > 0) {
        log("info", `[sessions] Active: ${health.active}, Expired(24h): ${health.expired24h}, Errors(24h): ${health.errors24h}`);
      }
    } catch (err) {
      log("warn", `[sessions] Health check failed: ${err}`);
    }
  }

  // Send Telegram alert if there are issues
  if (report.alerts.length > 0) {
    const alertMsg = `*Night-Ops Alert*\n${report.alerts.map(a => `- ${a}`).join("\n")}`;
    await sendTelegramAlert(alertMsg);
    log("warn", `Alerts sent: ${report.alerts.join("; ")}`);
  }

  // Send hourly progress to Telegram (compact summary)
  const totalActions = reviewActions.length + overnightActions.length + schedulerActions.length + emailActions.length;
  if (totalActions > 0 || report.tasks.completedLastHour > 0) {
    const progressMsg = [
      `*COO Cycle #${cycleCount}*`,
      `Tasks: ${report.tasks.completedLastHour} completed, ${report.tasks.todoCount} queued, ${report.tasks.inProgress} running`,
      totalActions > 0 ? `Actions: ${[...reviewActions.filter(a => a.startsWith("Queued")), ...overnightActions].join(", ") || "monitoring"}` : "",
      schedulerActions.length > 0 ? `Scheduler: ${schedulerActions.join(", ")}` : "",
      emailActions.length > 0 ? `Email: ${emailActions.join(", ")}` : "",
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
  log("info", "=== MCM Forge Night-Ops v6 (COO Brain) Starting ===");
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

  // Initialize session manager for v6
  sessionManager = new SessionManager(supabase);
  log("info", "Session manager initialized (v6)");

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
