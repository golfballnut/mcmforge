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

  // Extract the key insight for the task title (first sentence of summary)
  const firstSentence = (task.result_summary || "").split(/[.!?\n]/)[0].trim();
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

  // Phase 4.5: Escalate stale approvals
  await escalateStaleApprovals();

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
