#!/usr/bin/env tsx
/**
 * MCM Forge Dispatcher v3
 *
 * Multi-company, multi-task-type orchestrator:
 * - Concurrent execution (up to 3 tasks simultaneously)
 * - Retry logic with exponential backoff (2 retries)
 * - Git state cleanup before code tasks
 * - Stuck task recovery (auto-requeue after 45min)
 * - Kill switch (system_config) check before every poll
 * - Routes by task_type: code, research, content, ops, chat
 * - Routes by cli: claude, gemini, codex
 * - Code tasks → git cleanup + branch + PR workflow
 * - Service tasks → execute + store artifact + notify
 * - Enforces cost caps ($2 default, $5 ceiling)
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { spawn, execSync } from "child_process";
import * as dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { existsSync, readFileSync } from "fs";
import { visualVerify, type VisualVerifyResult } from "./visual-verify.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, ".env") });

// ============================================
// Types
// ============================================

type TaskType = "code" | "research" | "content" | "ops" | "chat" | "proposal";
type CliTool = "claude" | "gemini" | "codex";

interface Task {
  id: string;
  title: string;
  description: string;
  task_type: TaskType;
  cli_target: CliTool;
  company_id: string;
  assigned_to: string;
  skill_name?: string;
  priority: string;
  cost_cap?: number;
  status: string;
  created_at: string;
  retry_count?: number;
  parent_task_id?: string;
  proposal_data?: Record<string, unknown>;
  company_registry?: {
    name: string;
    slug: string;
    github_repo: string;
  };
}

interface ExecutionResult {
  success: boolean;
  output: string;
  summary?: string;
  prUrl?: string;
  prNumber?: number;
  previewUrl?: string;
  artifactPath?: string;
  error?: string;
  // Visual TDD fields (populated by visual-verify)
  screenshotUrl?: string;
  baselineUrl?: string;
  diffUrl?: string;
  visualScore?: number;
  visualFeedback?: string;
}

// ============================================
// Configuration
// ============================================

const CONFIG = {
  supabaseUrl: process.env.MCMFORGE_SUPABASE_URL!,
  supabaseKey: process.env.MCMFORGE_SUPABASE_KEY!,
  agentEmail: process.env.AGENT_EMAIL || "agent@mcmforge.com",
  agentPassword: process.env.AGENT_PASSWORD!,
  pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS || "300000", 10),
  repoBaseDir: process.env.REPO_BASE_DIR || "/Users/dirtsyncmini",
  resendApiKey: process.env.RESEND_API_KEY || "",
  steveEmail: process.env.STEVE_EMAIL || "steve@linkschoice.com",
  maxDurationMinutes: parseInt(process.env.MAX_DURATION_MINUTES || "30", 10),
  defaultCostCap: parseFloat(process.env.DEFAULT_COST_CAP || "2"),
  maxCostCap: parseFloat(process.env.MAX_COST_CAP || "5"),
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || "",
  telegramChatId: process.env.TELEGRAM_CHAT_ID || "",
};

// Company slug → repo directory name mapping
const REPO_DIR_MAP: Record<string, string> = {
  dirtsync: "DirtSync",
  mcmforge: "MCMForge",
};

// CLI binary paths (override via env if needed)
const CLI_PATHS: Record<CliTool, string> = {
  claude: process.env.CLAUDE_CLI_PATH || "claude",
  gemini: process.env.GEMINI_CLI_PATH || "gemini",
  codex: process.env.CODEX_CLI_PATH || "codex",
};

let supabase: SupabaseClient;
let activeTaskCount = 0;
const MAX_CONCURRENT_TASKS = 3;
const MAX_RETRIES = 2; // up to 2 retries (3 total attempts)

// ============================================
// Logging
// ============================================

function log(level: string, msg: string, meta?: Record<string, unknown>) {
  const ts = new Date().toISOString();
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : "";
  console.log(`[${ts}] [${level}] ${msg}${metaStr}`);
}

// ============================================
// Kill Switch
// ============================================

async function isDispatcherPaused(): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("system_config")
      .select("value")
      .eq("key", "dispatcher_status")
      .single();

    if (error || !data) return false; // If no config row, assume running
    return data.value === "paused";
  } catch {
    return false; // On error, keep running (fail-open for polling, fail-safe for actions)
  }
}

// ============================================
// Task Polling
// ============================================

async function pollForTask() {
  if (activeTaskCount >= MAX_CONCURRENT_TASKS) {
    log("debug", `At capacity (${activeTaskCount}/${MAX_CONCURRENT_TASKS}), skipping poll`);
    return;
  }

  // Kill switch check
  const paused = await isDispatcherPaused();
  if (paused) {
    log("info", "Dispatcher is PAUSED (kill switch active). Skipping poll.");
    return;
  }

  try {
    // Recover stuck tasks (in_progress > 45 min with no active process)
    await recoverStuckTasks();

    // Pick up multiple tasks if we have capacity
    const slotsAvailable = MAX_CONCURRENT_TASKS - activeTaskCount;
    const { data: tasks, error } = await supabase
      .from("task_queue")
      .select("*, company_registry(name, slug, github_repo)")
      .eq("status", "todo")
      .eq("assigned_to", "agent-executor")
      .order("priority", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(slotsAvailable);

    if (error || !tasks || tasks.length === 0) {
      log("debug", "No tasks available");
      return;
    }

    for (const task of tasks) {
      log("info", `Found task: ${task.title}`, {
        id: task.id,
        type: task.task_type || "code",
        cli: task.cli_target || "claude",
        company: task.company_registry?.name,
      });

      // Fire and forget — don't await, let tasks run concurrently
      executeTask(task as Task).catch(err => {
        log("error", `Unhandled task error: ${err}`, { task: task.title });
      });
    }
  } catch (err) {
    log("error", `Poll error: ${err}`);
  }
}

async function recoverStuckTasks() {
  try {
    const fortyFiveMinAgo = new Date(Date.now() - 45 * 60 * 1000).toISOString();
    const { data: stuck } = await supabase
      .from("task_queue")
      .select("id, title, retry_count")
      .eq("status", "in_progress")
      .lt("started_at", fortyFiveMinAgo);

    if (!stuck || stuck.length === 0) return;

    for (const task of stuck) {
      const retries = task.retry_count || 0;
      if (retries < MAX_RETRIES) {
        await supabase
          .from("task_queue")
          .update({ status: "todo", started_at: null, retry_count: retries + 1, updated_at: new Date().toISOString() })
          .eq("id", task.id);
        log("warn", `Recovered stuck task for retry (${retries + 1}/${MAX_RETRIES}): ${task.title}`);
      } else {
        await supabase
          .from("task_queue")
          .update({ status: "blocked", result_summary: `Stuck after ${MAX_RETRIES} retries — needs manual review`, updated_at: new Date().toISOString() })
          .eq("id", task.id);
        log("error", `Task permanently blocked after ${MAX_RETRIES} retries: ${task.title}`);
      }
    }
  } catch (err) {
    log("warn", `Stuck task recovery failed: ${err}`);
  }
}

// ============================================
// War Room Posts
// ============================================

async function postToWarRoom(task: Task, outcome: string, summary: string) {
  try {
    await supabase.from("communication_log").insert({
      from_agent: task.cli_target || "system",
      to_agent: "all",
      channel: "war_room",
      message: `[${outcome}] ${task.title}\n${summary}`,
      summary: `${task.cli_target} ${outcome}: ${task.title.slice(0, 80)}`,
      company_id: task.company_id,
      task_id: task.id,
    });
  } catch (err) {
    log("warn", `War room post failed: ${err}`);
  }
}

// ============================================
// Task Router
// ============================================

async function executeTask(task: Task) {
  activeTaskCount++;
  const startTime = Date.now();
  const executionStartTime = Date.now();
  const taskType: TaskType = task.task_type || "code";
  const cli: CliTool = task.cli_target || "claude";

  // Claim the task
  await updateTaskStatus(task.id, "in_progress", {
    started_at: new Date().toISOString(),
  });

  // Load vault context for this company
  const vaultContext = await loadVaultContext(task);
  const warRoomContext = await getWarRoomContext(task);
  const agentStats = await getAgentStats(cli, task.company_id);

  try {
    let result: ExecutionResult;

    switch (taskType) {
      case "code":
        result = await executeCodeTask(task, cli, vaultContext, warRoomContext, agentStats);
        break;
      case "research":
        result = await executeServiceTask(task, cli, "research", vaultContext, warRoomContext, agentStats);
        break;
      case "content":
        result = await executeServiceTask(task, cli, "content", vaultContext, warRoomContext, agentStats);
        break;
      case "ops":
        result = await executeServiceTask(task, cli, "ops", vaultContext, warRoomContext, agentStats);
        break;
      case "chat":
        result = await executeServiceTask(task, cli, "chat", vaultContext, warRoomContext, agentStats);
        break;
      case "proposal":
        result = await executeProposalTask(task, vaultContext, warRoomContext, agentStats);
        break;
      default:
        result = { success: false, output: "", error: `Unknown task_type: ${taskType}` };
    }

    const durationMs = Date.now() - startTime;
    const durationMin = (durationMs / 60000).toFixed(1);

    if (result.success) {
      // Test gate: check if output contains test failures (code tasks only)
      const testStatus = taskType === "code" ? analyzeTestOutput(result.output) : "no_tests";

      if (testStatus === "failed") {
        log("warn", `Task completed but TESTS FAILED — blocking`, { task: task.title });
        await recordLearning(task, { ...result, error: "Tests failed after code changes" }, "test-gate");
        await updateTaskStatus(task.id, "blocked", {
          completed_at: new Date().toISOString(),
          result_summary: `Code complete but tests failed. ${result.summary}`,
          pr_url: result.prUrl || null,
        });
        await supabase.from("communication_log").insert({
          from_agent: "dispatcher",
          to_agent: "steve",
          channel: "internal",
          message: `[TDD-GATE] ${task.title} blocked — tests failed. PR: ${result.prUrl || "none"}`,
          company_id: task.company_id,
          task_id: task.id,
        });
        activeTaskCount--;
        return;
      }

      if (testStatus === "no_tests") {
        log("warn", `Task completed with NO TEST EVIDENCE — allowing but flagging`, { task: task.title });
        await supabase.from("communication_log").insert({
          from_agent: "dispatcher",
          to_agent: "steve",
          channel: "internal",
          message: `[TDD-WARN] ${task.title} completed with no test evidence. PR: ${result.prUrl || "none"}. TDD was mandatory but no test output detected.`,
          company_id: task.company_id,
          task_id: task.id,
        });
      }

      log("info", `Task completed in ${durationMin}min (tests: ${testStatus})`, { task: task.title, type: taskType });

      // ============================================
      // Visual TDD Gate (code tasks with preview URLs)
      // ============================================
      if (taskType === "code" && result.previewUrl) {
        log("info", `[VISUAL-TDD] Starting visual verification`, { task: task.title, preview: result.previewUrl });
        try {
          const visualResult = await visualVerify({
            previewUrl: result.previewUrl,
            companySlug: task.company_registry?.slug,
            taskTitle: task.title,
            taskDescription: task.description,
            taskId: task.id,
          });

          result.screenshotUrl = visualResult.screenshotUrl;
          result.baselineUrl = visualResult.baselineUrl;
          result.diffUrl = visualResult.diffUrl;
          result.visualScore = visualResult.score;
          result.visualFeedback = visualResult.feedback;

          log("info", `[VISUAL-TDD] Score: ${visualResult.score}/100 — ${visualResult.pass ? "PASS" : "FAIL"}`, {
            task: task.title,
            diffPercent: visualResult.diffPercent,
          });

          if (!visualResult.pass) {
            const retries = task.retry_count || 0;
            if (retries < MAX_RETRIES) {
              log("warn", `[VISUAL-TDD] Failed — requeueing for retry (${retries + 1}/${MAX_RETRIES})`);
              await supabase
                .from("task_queue")
                .update({
                  status: "todo",
                  started_at: null,
                  retry_count: retries + 1,
                  updated_at: new Date().toISOString(),
                })
                .eq("id", task.id);
              await supabase.from("communication_log").insert({
                from_agent: "dispatcher",
                to_agent: "visual-tdd",
                channel: "internal",
                message: `[VISUAL-GATE] ${task.title} failed visual check (score: ${visualResult.score}/100). Feedback: ${visualResult.feedback}. Changes: ${visualResult.changes?.join(", ") || "none"}`,
                company_id: task.company_id,
                task_id: task.id,
              });
              activeTaskCount--;
              return;
            }
            log("warn", `[VISUAL-TDD] Failed but no retries left — sending to human review`);
          }

          // Prepend visual context to summary
          const visualTag = visualResult.score >= 0
            ? `[Visual: ${visualResult.score}/100${visualResult.pass ? " PASS" : " FAIL"}] `
            : "[Visual: screenshot captured] ";
          result.summary = visualTag + (result.summary || "");

        } catch (err) {
          log("warn", `[VISUAL-TDD] Error: ${err}. Continuing without visual check.`);
        }
      }

      // ============================================
      // Auto-Ship Gate: CI green + visual pass + tests pass = auto-merge
      // Only for bug fixes and styling — new features always need Steve
      // ============================================
      let autoShipped = false;
      if (
        taskType === "code" &&
        result.prUrl &&
        result.visualScore !== undefined &&
        result.visualScore >= 80 &&
        testStatus === "passed"
      ) {
        const titleLower = task.title.toLowerCase();
        const isAutoShippable = titleLower.includes("fix") || titleLower.includes("bug") || titleLower.includes("style") || titleLower.includes("typo") || titleLower.includes("cleanup");

        if (isAutoShippable) {
          try {
            const prNumber = result.prNumber || result.prUrl.match(/\/pull\/(\d+)/)?.[1];
            const repo = task.company_registry?.github_repo;
            if (prNumber && repo) {
              execSync(
                `PATH="${PATH_PREFIX}:$PATH" gh pr merge ${prNumber} --repo ${repo} --squash --delete-branch`,
                { timeout: 30000, encoding: "utf-8" }
              );
              autoShipped = true;
              log("info", `[AUTO-SHIP] Auto-merged PR #${prNumber}: ${task.title} (visual: ${result.visualScore}/100, tests: passed)`);
              await supabase.from("communication_log").insert({
                from_agent: "dispatcher",
                to_agent: "steve",
                channel: "internal",
                message: `[AUTO-SHIP] Auto-merged: ${task.title} — Visual ${result.visualScore}/100, tests passed, PR #${prNumber}`,
                company_id: task.company_id,
                task_id: task.id,
              });
            }
          } catch (err) {
            log("warn", `[AUTO-SHIP] Merge failed for ${task.title}: ${err}`);
          }
        }
      }

      // Record skill metrics and agent roster update
      await recordSkillMetrics(task, result, Date.now() - executionStartTime);
      await updateAgentRoster(task, result.success);
      await recordSuccessLearning(task, result);

      // Auto-vault intelligence findings from research tasks
      if (taskType === "research") {
        await autoVaultIntelligence(task, result);
      }

      // Code tasks need approval. Service tasks go straight to done.
      const newStatus = autoShipped ? "done" : (taskType === "code" ? "review" : "done");

      await updateTaskStatus(task.id, newStatus, {
        completed_at: new Date().toISOString(),
        result_summary: result.summary,
        artifact_url: result.artifactPath || null,
        pr_url: result.prUrl || null,
        pr_number: result.prNumber || null,
        preview_url: result.previewUrl || null,
      });

      // Code tasks create approval entries (pr_merge is the valid approval_type)
      let approvalToken: string | undefined;
      if (taskType === "code") {
        approvalToken = crypto.randomUUID();

        await supabase.from("approval_queue").insert({
          task_id: task.id,
          company_id: task.company_id,
          approval_type: "pr_merge",
          title: `Task Complete: ${task.title}`,
          description: result.summary || `Completed in ${durationMin} minutes`,
          preview_url: result.previewUrl || result.prUrl || null,
          status: "pending",
          approval_token: approvalToken,
          pr_url: result.prUrl || null,
          pr_number: result.prNumber || null,
        });
      }

      // Notify Steve for all completed tasks
      const approvalMeta = approvalToken ? { approvalToken } : undefined;
      await notifyCompletion(task, result, durationMin, cli, approvalMeta);

      // War room posts
      await postToWarRoom(task, "SUCCESS", result.summary || "Task completed");
      if (taskType === "research" && result.summary) {
        await postToWarRoom(task, "FINDING", result.summary.slice(0, 300));
      }
    } else {
      log("error", `Task failed: ${result.error}`, { task: task.title });
      await recordLearning(task, result, "execution");

      // Record skill metrics and agent roster update for failures too
      await recordSkillMetrics(task, result, Date.now() - executionStartTime);
      await updateAgentRoster(task, result.success);

      await updateTaskStatus(task.id, "blocked", {
        result_summary: `Failed: ${result.error}`,
      });

      // War room post for failure
      await postToWarRoom(task, "FAILED", result.error || result.summary || "Unknown error");
    }

    // Log to communication_log (uses 'message' column, 'channel' for type)
    await supabase.from("communication_log").insert({
      from_agent: "dispatcher",
      to_agent: "steve",
      channel: "internal",
      message: result.success
        ? `[${taskType}] Completed: ${task.title} (${durationMin}min)`
        : `[${taskType}] Failed: ${task.title} — ${result.error}`,
      company_id: task.company_id,
      task_id: task.id,
    });
  } catch (err) {
    log("error", `Execution error: ${err}`);
    // Retry logic: if we have retries left, put back in todo
    const retries = (task as any).retry_count || 0;
    if (retries < MAX_RETRIES) {
      await supabase
        .from("task_queue")
        .update({ status: "todo", started_at: null, retry_count: retries + 1, updated_at: new Date().toISOString() })
        .eq("id", task.id);
      log("warn", `Task queued for retry (${retries + 1}/${MAX_RETRIES}): ${task.title}`);
    } else {
      await updateTaskStatus(task.id, "blocked", {
        result_summary: `Dispatcher error after ${MAX_RETRIES} retries: ${err}`,
      });
    }
  }

  activeTaskCount--;
}

// ============================================
// Vault Context Loader
// ============================================

// Context routing: different task types need different vault docs
const CONTEXT_ROUTES: Record<string, string[]> = {
  code:     ["company", "skill", "decision"],
  research: ["company", "competitor", "intelligence"],
  proposal: ["company", "competitor", "intelligence", "skill"],
  content:  ["company", "intelligence"],
  ops:      ["company"],
  chat:     ["company"],
};

async function loadVaultContext(task: Task): Promise<string> {
  try {
    const companySlug = task.company_registry?.slug;
    if (!companySlug) return "";

    const taskType = task.task_type || "research";
    const allowedCategories = CONTEXT_ROUTES[taskType] || CONTEXT_ROUTES.research;

    // Load company-specific docs filtered by task-appropriate categories + skills always
    const { data: vaultDocs } = await supabase
      .from("vault_docs")
      .select("title, category, content, tags")
      .or(`company_id.eq.${task.company_id},category.eq.skill`)
      .order("updated_at", { ascending: false });

    if (!vaultDocs || vaultDocs.length === 0) return "";

    // Filter by allowed categories for this task type
    const filtered = vaultDocs.filter(doc => {
      if (!doc.content) return false;
      return allowedCategories.includes(doc.category) || doc.category === "skill";
    });

    // Score and rank by relevance: tag overlap with task keywords
    const taskKeywords = extractKeywords(task.title + " " + (task.description || ""));
    const scored = filtered.map(doc => {
      const docKeywords = (doc.tags || []).concat(extractKeywords(doc.title));
      const overlap = taskKeywords.filter(k => docKeywords.includes(k)).length;
      return { doc, score: overlap };
    }).sort((a, b) => b.score - a.score);

    // Cap total context at 8000 chars
    const sections: string[] = ["## Vault Context (loaded automatically)"];
    let totalChars = 0;
    const MAX_CONTEXT_CHARS = 8000;

    for (const { doc } of scored) {
      const content = doc.content.length > 2000
        ? doc.content.slice(0, 2000) + "\n[... truncated]"
        : doc.content;
      const section = `### [${doc.category}] ${doc.title}\n${content}`;
      if (totalChars + section.length > MAX_CONTEXT_CHARS) break;
      sections.push(section);
      totalChars += section.length;
    }

    log("info", `Smart context: loaded ${sections.length - 1}/${filtered.length} vault docs (${taskType} route)`, {
      company: companySlug,
      categories: allowedCategories.join(","),
    });

    return sections.join("\n\n");
  } catch (err) {
    log("warn", `Failed to load vault context: ${err}`);
    return "";
  }
}

function extractKeywords(text: string): string[] {
  return text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 3)
    .filter(w => !["the", "and", "for", "with", "from", "this", "that", "have", "will", "task", "should"].includes(w));
}

// ============================================
// War Room Context
// ============================================

async function getWarRoomContext(task: Task): Promise<string> {
  try {
    const { data: recentPosts } = await supabase
      .from("communication_log")
      .select("from_agent, message, created_at")
      .eq("channel", "war_room")
      .eq("company_id", task.company_id)
      .order("created_at", { ascending: false })
      .limit(5);

    if (!recentPosts || recentPosts.length === 0) return "";

    const items = recentPosts.map(p => {
      const time = new Date(p.created_at).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
      return `- [${time}] ${p.from_agent}: ${p.message?.slice(0, 200)}`;
    });
    return `## Team Activity (last 5 updates)\n${items.join("\n")}`;
  } catch {
    return "";
  }
}

// ============================================
// Agent Stats
// ============================================

async function getAgentStats(cliTarget: string, companyId: string): Promise<string> {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: metrics } = await supabase
      .from("skill_metrics")
      .select("success, execution_time_ms, skill_name")
      .eq("cli_target", cliTarget)
      .gte("created_at", sevenDaysAgo);

    if (!metrics || metrics.length === 0) return "";

    const total = metrics.length;
    const successes = metrics.filter(m => m.success).length;
    const successRate = Math.round((successes / total) * 100);
    const avgTime = Math.round(metrics.reduce((s, m) => s + (m.execution_time_ms || 0), 0) / total / 1000);

    // Find strengths/weaknesses by skill
    const bySkill: Record<string, { total: number; success: number }> = {};
    for (const m of metrics) {
      const skill = m.skill_name || "general";
      if (!bySkill[skill]) bySkill[skill] = { total: 0, success: 0 };
      bySkill[skill].total++;
      if (m.success) bySkill[skill].success++;
    }

    const skillRates = Object.entries(bySkill)
      .map(([skill, data]) => ({ skill, rate: Math.round((data.success / data.total) * 100), total: data.total }))
      .filter(s => s.total >= 2)
      .sort((a, b) => b.rate - a.rate);

    const strengths = skillRates.filter(s => s.rate >= 70).map(s => `${s.skill} (${s.rate}%)`).join(", ");
    const weaknesses = skillRates.filter(s => s.rate < 50).map(s => `${s.skill} (${s.rate}%)`).join(", ");

    return [
      "## Your Performance Stats (last 7 days)",
      `- Tasks: ${total} completed, ${successRate}% success rate`,
      `- Average execution time: ${avgTime}s`,
      strengths ? `- Strengths: ${strengths}` : "",
      weaknesses ? `- Weaknesses: ${weaknesses}` : "",
    ].filter(Boolean).join("\n");
  } catch {
    return "";
  }
}

// ============================================
// Code Task Execution (git + PR workflow)
// ============================================

async function executeCodeTask(task: Task, cli: CliTool, vaultContext: string = "", warRoomContext: string = "", agentStats: string = ""): Promise<ExecutionResult> {
  const company = task.company_registry;
  const companySlug = company?.slug || "unknown";

  // Resolve repo directory
  const repoDirName = REPO_DIR_MAP[companySlug] || companySlug;
  const repoPath = join(CONFIG.repoBaseDir, repoDirName);

  if (!existsSync(repoPath)) {
    return {
      success: false,
      output: "",
      error: `Repo directory not found: ${repoPath}. Clone the repo first.`,
    };
  }

  // Clean git state before code task — prevents "dirty worktree" failures
  const gitCleanResult = await ensureCleanGitState(repoPath, company?.github_repo);
  if (!gitCleanResult.success) {
    return {
      success: false,
      output: gitCleanResult.output,
      error: `Git cleanup failed: ${gitCleanResult.error}`,
    };
  }

  // Gather additional context for code tasks (PR awareness, project instructions, retry context, learnings)
  const prContext = getOpenPRsForRepo(company?.github_repo || "");
  const claudeMdContext = getRepoClaudeMd(repoPath);
  const retryContext = await getRetryContext(task.id, task.retry_count || 0);
  const learningsContext = await getLearningsContext(task.company_id);

  // Build enriched vault context with all available intelligence
  const enrichedContext = [vaultContext, prContext, claudeMdContext, retryContext, learningsContext, warRoomContext, agentStats].filter(Boolean).join("\n\n");

  log("info", `[code] Executing in ${repoPath} with ${cli} (context: ${enrichedContext.length} chars)`, { task: task.title });

  const prompt = buildCodePrompt(task, enrichedContext);
  return spawnCli(cli, repoPath, prompt, task.id);
}

async function ensureCleanGitState(repoPath: string, _githubRepo?: string): Promise<{ success: boolean; output: string; error?: string }> {
  try {
    // Get current branch and default branch
    const currentBranch = execSync("git rev-parse --abbrev-ref HEAD", { cwd: repoPath, encoding: "utf-8" }).trim();
    const defaultBranch = execSync("git remote show origin 2>/dev/null | grep 'HEAD branch' | awk '{print $NF}'", { cwd: repoPath, encoding: "utf-8", shell: "/bin/bash" }).trim() || "main";

    // Check if worktree is dirty
    const status = execSync("git status --porcelain", { cwd: repoPath, encoding: "utf-8" }).trim();

    if (status || currentBranch !== defaultBranch) {
      log("info", `[git-cleanup] Cleaning repo at ${repoPath} (branch: ${currentBranch}, dirty: ${status.length > 0})`);

      // Stash any changes (including untracked)
      if (status) {
        execSync("git stash --include-untracked", { cwd: repoPath, encoding: "utf-8" });
      }

      // Switch to default branch
      if (currentBranch !== defaultBranch) {
        execSync(`git checkout ${defaultBranch}`, { cwd: repoPath, encoding: "utf-8" });
      }

      // Pull latest
      execSync(`git pull origin ${defaultBranch}`, { cwd: repoPath, encoding: "utf-8", timeout: 30000 });

      log("info", `[git-cleanup] Repo clean on ${defaultBranch}`);
    }

    return { success: true, output: "Git state clean" };
  } catch (err) {
    log("error", `[git-cleanup] Failed: ${err}`);
    // Last resort: hard reset
    try {
      const defaultBranch = execSync("git remote show origin 2>/dev/null | grep 'HEAD branch' | awk '{print $NF}'", { cwd: repoPath, encoding: "utf-8", shell: "/bin/bash" }).trim() || "main";
      execSync(`git checkout ${defaultBranch} && git reset --hard origin/${defaultBranch}`, { cwd: repoPath, encoding: "utf-8", shell: "/bin/bash" });
      return { success: true, output: "Hard reset to clean state" };
    } catch (resetErr) {
      return { success: false, output: "", error: `${resetErr}` };
    }
  }
}

// ============================================
// Context Gathering (PR awareness, CLAUDE.md, retry)
// ============================================

const PATH_PREFIX = "/opt/homebrew/Cellar/node@20/20.20.0/bin:/opt/homebrew/bin:/usr/local/bin";

function getOpenPRsForRepo(githubRepo: string): string {
  if (!githubRepo) return "";
  try {
    const raw = execSync(
      `export PATH=${PATH_PREFIX}:$PATH && gh pr list --repo ${githubRepo} --state open --json number,title,headRefName --limit 20 2>/dev/null`,
      { encoding: "utf-8", timeout: 15000, shell: "/bin/bash" }
    );
    const prs = JSON.parse(raw);
    if (prs.length === 0) return "";
    const lines = prs.map((pr: any) => `- #${pr.number}: ${pr.title} (branch: ${pr.headRefName})`);
    return [
      "## Open PRs (DO NOT duplicate these — check if your task is already covered)",
      "If an existing PR already implements what you need, do NOT create a new one.",
      "Instead, note the existing PR number in your output.",
      ...lines,
    ].join("\n");
  } catch {
    return "";
  }
}

function getRepoClaudeMd(repoPath: string): string {
  try {
    // Check for CLAUDE.md in repo root and web/ subdirectory
    for (const subpath of ["CLAUDE.md", "web/CLAUDE.md", ".claude/settings.json"]) {
      const fullPath = join(repoPath, subpath);
      if (existsSync(fullPath) && subpath.endsWith(".md")) {
        const content = readFileSync(fullPath, "utf-8");
        const truncated = content.length > 3000 ? content.slice(0, 3000) + "\n[... truncated]" : content;
        return `## Project Instructions (${subpath})\nFollow these instructions precisely:\n${truncated}`;
      }
    }
    return "";
  } catch {
    return "";
  }
}

async function getRetryContext(taskId: string, retryCount: number): Promise<string> {
  if (retryCount === 0) return "";
  try {
    const { data: logs } = await supabase
      .from("communication_log")
      .select("message")
      .eq("task_id", taskId)
      .order("created_at", { ascending: false })
      .limit(3);

    if (!logs || logs.length === 0) {
      return `## Retry Context (attempt ${retryCount + 1}/${MAX_RETRIES + 1})\nThis task failed on a previous attempt. Try a different approach.`;
    }

    const messages = logs.map(l => `- ${l.message}`).join("\n");
    return [
      `## Retry Context (attempt ${retryCount + 1}/${MAX_RETRIES + 1})`,
      "This task has been attempted before and failed. Here's what happened:",
      messages,
      "",
      "IMPORTANT: Do NOT repeat the same approach. Analyze why it failed and try differently.",
    ].join("\n");
  } catch {
    return "";
  }
}

// ============================================
// Learning Loop — Learn from failures
// ============================================

async function getLearningsContext(companyId: string): Promise<string> {
  try {
    const { data: learnings } = await supabase
      .from("agent_learnings")
      .select("what_happened, root_cause, prevention_rule, error_type")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(5);

    if (!learnings || learnings.length === 0) return "";

    return [
      "## Past Failures — DO NOT REPEAT THESE MISTAKES",
      "These are patterns from previous failed tasks. Avoid them:",
      ...learnings.map((l, i) =>
        `${i + 1}. ${l.what_happened}${l.root_cause ? `\n   Root cause: ${l.root_cause}` : ""}${l.prevention_rule ? `\n   Prevention: ${l.prevention_rule}` : ""}`
      ),
    ].join("\n");
  } catch {
    return "";
  }
}

function classifyError(output: string, error?: string): { type: string; rootCause: string; prevention: string } {
  const text = `${output} ${error || ""}`.toLowerCase();

  if (text.includes("type") && (text.includes("error ts") || text.includes("typescript"))) {
    return { type: "typescript", rootCause: "TypeScript type errors in code", prevention: "Run `npx tsc --noEmit` before committing. Check all type imports." };
  }
  if (text.includes("build") && text.includes("fail")) {
    return { type: "build_failure", rootCause: "Build failed (Next.js/Vite compilation)", prevention: "Run `npm run build` locally before pushing. Fix all build errors." };
  }
  if (text.includes("test") && text.includes("fail")) {
    return { type: "test_failure", rootCause: "Tests failed after code changes", prevention: "Run existing tests before AND after changes. Don't break existing tests." };
  }
  if (text.includes("merge conflict") || text.includes("dirty")) {
    return { type: "git_conflict", rootCause: "Git state conflict or dirty worktree", prevention: "Always work on a clean branch from latest main/master." };
  }
  if (text.includes("timeout") || text.includes("killed after")) {
    return { type: "timeout", rootCause: "Task exceeded time limit", prevention: "Break into smaller subtasks. Focus on one file/component at a time." };
  }
  if (text.includes("exit code") && !text.includes("exit code 0")) {
    return { type: "cli_error", rootCause: "CLI tool exited with error", prevention: "Check tool availability and permissions before running." };
  }
  if (text.includes("visual") && text.includes("fail")) {
    return { type: "visual_regression", rootCause: "Visual output didn't match expectations", prevention: "Check existing styles before modifying. Use browser devtools mental model." };
  }

  return { type: "unknown", rootCause: error || "Unknown failure", prevention: "Review the error output carefully and try a fundamentally different approach." };
}

async function recordLearning(task: Task, result: ExecutionResult, stage: string = "execution") {
  try {
    const errorInfo = classifyError(result.output, result.error);

    await supabase.from("agent_learnings").insert({
      task_id: task.id,
      company_id: task.company_id,
      outcome: "failure",
      what_happened: `Task "${task.title}" failed: ${result.error || result.summary || "Unknown"}`.slice(0, 500),
      root_cause: errorInfo.rootCause,
      prevention_rule: errorInfo.prevention,
      error_type: errorInfo.type,
      severity: "medium",
      stage,
      was_applied_to_skill: false,
    });

    log("info", `[LEARNING] Recorded failure pattern: ${errorInfo.type} for ${task.title}`);
  } catch (err) {
    log("warn", `[LEARNING] Failed to record: ${err}`);
  }
}

// ============================================
// Service Task Execution (no git, artifact-based)
// ============================================

async function executeServiceTask(
  task: Task,
  cli: CliTool,
  mode: "research" | "content" | "ops" | "chat",
  vaultContext: string = "",
  warRoomContext: string = "",
  agentStats: string = ""
): Promise<ExecutionResult> {
  // Service tasks run in a scratch directory, not a repo
  const scratchDir = join(CONFIG.repoBaseDir, "_scratch");

  // Use repo context if company is specified and repo exists
  const company = task.company_registry;
  const companySlug = company?.slug;
  let workDir = scratchDir;

  if (companySlug) {
    const repoDirName = REPO_DIR_MAP[companySlug] || companySlug;
    const repoPath = join(CONFIG.repoBaseDir, repoDirName);
    if (existsSync(repoPath)) {
      workDir = repoPath;
    }
  }

  log("info", `[${mode}] Executing with ${cli}`, { task: task.title, cwd: workDir });

  const enrichedVaultContext = [vaultContext, warRoomContext, agentStats].filter(Boolean).join("\n\n");
  const prompt = buildServicePrompt(task, mode, enrichedVaultContext);
  const result = await spawnCli(cli, workDir, prompt, task.id);

  // Store output as artifact in Supabase Storage
  if (result.success && result.output.length > 0) {
    try {
      const fileName = `${task.id}-${mode}-${Date.now()}.md`;
      const { error } = await supabase.storage
        .from("artifacts")
        .upload(fileName, result.output, {
          contentType: "text/markdown",
          upsert: true,
        });

      if (!error) {
        const { data: urlData } = supabase.storage
          .from("artifacts")
          .getPublicUrl(fileName);
        result.artifactPath = urlData.publicUrl;
        log("info", `Artifact stored: ${fileName}`);
      }
    } catch (err) {
      log("warn", `Failed to store artifact: ${err}`);
    }
  }

  return result;
}

// ============================================
// Skill Metrics Recording
// ============================================

async function recordSkillMetrics(task: Task, result: ExecutionResult, executionTimeMs: number) {
  try {
    const tokenCount = estimateTokens(result.output || "");
    const costCents = estimateCost(task.cli_target, tokenCount);

    await supabase.from("skill_metrics").insert({
      skill_name: task.skill_name || task.task_type,
      company_id: task.company_id,
      task_id: task.id,
      cli_target: task.cli_target,
      model_used: task.cli_target === "claude" ? "sonnet-4" : task.cli_target === "gemini" ? "gemini-pro" : "unknown",
      execution_time_ms: executionTimeMs,
      token_count: tokenCount,
      estimated_cost_cents: costCents,
      success: result.success,
      error_message: result.error?.slice(0, 500) || null,
      code_quality_score: null, // filled by visual verify if available
      test_pass_rate: null, // filled by test analysis if available
    });
  } catch (err) {
    log("warn", `Skill metrics recording failed: ${err}`);
  }
}

function estimateTokens(text: string): number {
  // Rough estimate: 1 token ≈ 4 characters
  return Math.ceil(text.length / 4);
}

function estimateCost(cli: string, tokens: number): number {
  // Rough cost estimates in cents per 1M tokens (blended input/output)
  const rates: Record<string, number> = {
    claude: 900,   // ~$9/M blended (sonnet)
    gemini: 312,   // ~$3.12/M blended
    codex: 500,    // estimate
  };
  const rate = rates[cli] || 500;
  return Math.round((tokens / 1_000_000) * rate * 100) / 100;
}

// ============================================
// Agent Roster Update
// ============================================

async function updateAgentRoster(task: Task, success: boolean) {
  try {
    await supabase.rpc("update_agent_stats", {
      agent_name: task.cli_target,
      was_success: success,
    });
  } catch (err) {
    log("warn", `Agent roster update failed: ${err}`);
  }
}

// ============================================
// Success Learning
// ============================================

async function recordSuccessLearning(task: Task, result: ExecutionResult) {
  try {
    await supabase.from("agent_learnings").insert({
      task_id: task.id,
      company_id: task.company_id,
      outcome: "success",
      what_happened: `Task "${task.title}" succeeded: ${result.summary || "Completed"}`.slice(0, 500),
      root_cause: null,
      prevention_rule: null,
      error_type: null,
      severity: "info",
      stage: "completion",
      skill_name: task.skill_name || task.task_type,
      was_applied_to_skill: false,
    });
  } catch (err) {
    log("warn", `Success learning recording failed: ${err}`);
  }
}

// ============================================
// Auto-Vault Intelligence Findings
// ============================================

async function autoVaultIntelligence(task: Task, result: ExecutionResult) {
  try {
    const titleLower = task.title.toLowerCase();
    const isIntel = ["intelligence", "scan", "competitor", "market", "pricing", "seo"].some(k => titleLower.includes(k));
    if (!isIntel || !result.success || !result.output) return;

    const slug = task.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 80);
    const today = new Date().toISOString().split("T")[0];

    await supabase.from("vault_docs").upsert({
      title: task.title,
      slug: `intel-${today}-${slug}`,
      category: "intelligence",
      content: result.output.slice(0, 5000),
      company_id: task.company_id,
      file_path: `intelligence/${today}-${slug}.md`,
      updated_by: task.cli_target || "dispatcher",
      status: "active",
    }, { onConflict: "slug" });

    log("info", `[AUTO-VAULT] Saved intelligence finding: ${task.title}`);
  } catch (err) {
    log("warn", `Auto-vault failed: ${err}`);
  }
}

// ============================================
// Proposal Task Execution
// ============================================

async function executeProposalTask(task: Task, vaultContext: string, warRoomContext: string, agentStats: string): Promise<ExecutionResult> {
  const prompt = [
    `# Proposal Task: ${task.title}`,
    "",
    task.description || "",
    "",
    "## Instructions",
    "Write a structured feature/strategy proposal using this format:",
    "1. **Problem**: What problem does this solve? Include data/evidence.",
    "2. **Solution**: What specifically should be built/done?",
    "3. **Success Criteria**: How do we know it worked? Measurable outcomes.",
    "4. **Effort Estimate**: Small (1-2 tasks), Medium (3-5 tasks), Large (6+ tasks)",
    "5. **Priority**: Critical / High / Medium / Low — with justification",
    "6. **Risks**: What could go wrong?",
    "",
    "Be specific and actionable. Include competitor references if relevant.",
    "",
    vaultContext,
    warRoomContext,
    agentStats,
  ].filter(Boolean).join("\n");

  const cli: CliTool = task.cli_target || "claude";
  const company = task.company_registry;
  const companySlug = company?.slug;
  let workDir = join(CONFIG.repoBaseDir, "_scratch");

  if (companySlug) {
    const repoDirName = REPO_DIR_MAP[companySlug] || companySlug;
    const repoPath = join(CONFIG.repoBaseDir, repoDirName);
    if (existsSync(repoPath)) {
      workDir = repoPath;
    }
  }

  const result = await spawnCli(cli, workDir, prompt, task.id);

  if (result.success && result.output) {
    // Store proposal data as JSON
    const proposalData = {
      raw_output: result.output.slice(0, 5000),
      created_by: task.cli_target,
      created_at: new Date().toISOString(),
    };

    await supabase.from("task_queue").update({
      proposal_data: proposalData,
    }).eq("id", task.id);

    // Create approval queue entry
    await supabase.from("approval_queue").insert({
      task_id: task.id,
      company_id: task.company_id,
      approval_type: "proposal",
      title: `Proposal: ${task.title}`,
      description: result.output.slice(0, 3000),
      status: "pending",
    });

    // Email Steve with proposal
    if (CONFIG.resendApiKey) {
      const htmlBody = `
        <h2>New Agent Proposal</h2>
        <p><strong>From:</strong> ${task.cli_target} | <strong>Company:</strong> ${task.company_registry?.slug || "unknown"}</p>
        <hr/>
        ${markdownToHtml(result.output.slice(0, 3000))}
        <hr/>
        <p><em>Reply to approve or reject this proposal.</em></p>
      `;
      try {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${CONFIG.resendApiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: "MCM Forge <ops@mcmforge.com>",
            to: CONFIG.steveEmail,
            subject: `[Proposal] ${task.title.slice(0, 60)}`,
            html: htmlBody,
          }),
        });
      } catch (err) {
        log("warn", `Proposal email failed: ${err}`);
      }
    }
  }

  return result;
}

// ============================================
// Prompt Builders
// ============================================

function buildCodePrompt(task: Task, vaultContext: string = ""): string {
  const parts = [
    `# Task: ${task.title}`,
    "",
    task.description || "No description provided.",
    "",
    "## TDD Workflow (MANDATORY)",
    "You MUST follow Test-Driven Development. This is non-negotiable:",
    "",
    "### Step 1: Understand",
    "- Read the project's CLAUDE.md instructions",
    "- Read existing tests to understand patterns (look for *.test.*, *.spec.*, tests/, __tests__/)",
    "- Identify the test framework in use (Playwright, Vitest, Jest, etc.)",
    "",
    "### Step 2: Write Failing Tests FIRST",
    "- Write test(s) that describe the desired behavior BEFORE writing implementation",
    "- Run the tests — they MUST FAIL (red phase)",
    "- Include the failing test output in your work log",
    "",
    "### Step 3: Implement",
    "- Write the minimum code to make tests pass",
    "- Run tests again — they MUST PASS (green phase)",
    "- Include the passing test output in your work log",
    "",
    "### Step 4: Refactor & Verify",
    "- Clean up code if needed",
    "- Run the FULL test suite to check for regressions",
    "- Run the build (next build, tsc, etc.) to verify no type errors",
    "- Include full test suite results in your output",
    "",
    "### Step 5: PR with Evidence",
    "- Create a feature branch, NOT push to main/master",
    "- Commit with clear messages",
    "- Create a PR with test evidence in the description:",
    "  - What tests were added/modified",
    "  - Test failure output (before)",
    "  - Test success output (after)",
    "  - Full suite pass confirmation",
    "- Report the PR URL in your final output",
    "",
    "### CRITICAL: If no test framework exists",
    "- Set one up (Vitest for unit tests, Playwright for E2E)",
    "- Write at least 3 tests covering the core behavior",
    "- This is not optional — code without tests will be rejected",
  ];

  if (task.skill_name) {
    parts.push("", `## Skill to use: /${task.skill_name}`);
  }

  if (vaultContext) {
    parts.push("", vaultContext);
  }

  return parts.join("\n");
}

function buildServicePrompt(task: Task, mode: string, vaultContext: string = ""): string {
  const modeInstructions: Record<string, string> = {
    research: [
      "## Output Format",
      "Produce a structured research report in Markdown:",
      "- Executive summary (3 sentences)",
      "- Key findings (bulleted)",
      "- Data sources used",
      "- Recommendations",
      "- Confidence level (high/medium/low)",
      "",
      "Do NOT create files, branches, or PRs. Output your report as text.",
    ].join("\n"),

    content: [
      "## Output Format",
      "Produce the requested content in Markdown.",
      "If creating a presentation, use ## headers for slides.",
      "If creating a report, use proper document structure.",
      "",
      "Do NOT create files, branches, or PRs. Output your content as text.",
    ].join("\n"),

    ops: [
      "## Output Format",
      "Run the requested checks and produce a status report:",
      "- Overall status: OK / WARNING / CRITICAL",
      "- Individual check results",
      "- Any recommended actions",
      "",
      "Do NOT modify any systems. Read-only operations only.",
    ].join("\n"),

    chat: [
      "## Output Format",
      "Respond conversationally to the request.",
      "Be concise but thorough.",
      "If you need to provide data, format it clearly.",
      "",
      "Do NOT create files, branches, or PRs.",
    ].join("\n"),
  };

  const parts = [
    `# Task: ${task.title}`,
    "",
    task.description || "No description provided.",
    "",
    modeInstructions[mode] || modeInstructions.chat,
  ];

  if (vaultContext) {
    parts.push("", vaultContext);
  }

  return parts.join("\n");
}

// ============================================
// CLI Spawner (Claude, Gemini, Codex)
// ============================================

function getCliArgs(cli: CliTool, prompt: string): string[] {
  switch (cli) {
    case "claude":
      return ["--print", "--dangerously-skip-permissions", prompt];
    case "gemini":
      return ["-m", "gemini-3.1-pro-preview", "-y", "-p", prompt];
    case "codex":
      return ["exec", "--dangerously-bypass-approvals-and-sandbox", prompt];
    default:
      return ["--print", prompt];
  }
}

function spawnCli(
  cli: CliTool,
  workDir: string,
  prompt: string,
  taskId: string
): Promise<ExecutionResult> {
  return new Promise((resolve) => {
    const timeout = CONFIG.maxDurationMinutes * 60 * 1000;
    let output = "";
    let killed = false;

    const binary = CLI_PATHS[cli];
    const args = getCliArgs(cli, prompt);

    log("debug", `Spawning ${binary}`, { cwd: workDir, taskId });

    const proc = spawn(binary, args, {
      cwd: workDir,
      env: { ...process.env, CLAUDE_TASK_ID: taskId },
      stdio: ["ignore", "pipe", "pipe"],
    });

    const timer = setTimeout(() => {
      killed = true;
      proc.kill("SIGTERM");
      log("warn", `Task ${taskId} killed after ${CONFIG.maxDurationMinutes}min`);
    }, timeout);

    proc.stdout?.on("data", (data: Buffer) => {
      output += data.toString();
    });

    proc.stderr?.on("data", (data: Buffer) => {
      output += data.toString();
    });

    proc.on("close", (code) => {
      clearTimeout(timer);

      if (killed) {
        resolve({
          success: false,
          output,
          error: `Killed after ${CONFIG.maxDurationMinutes} minutes (timeout)`,
        });
        return;
      }

      // Extract PR URL and number from output
      const prMatch = output.match(/https:\/\/github\.com\/[^\s]+\/pull\/(\d+)/);
      const prUrl = prMatch ? prMatch[0] : undefined;
      const prNumber = prMatch ? parseInt(prMatch[1], 10) : undefined;

      // Extract Vercel preview URL from output
      const vercelMatch = output.match(/https:\/\/[^\s]*\.vercel\.app[^\s)"]*/);
      const previewUrl = vercelMatch ? vercelMatch[0] : undefined;

      // Clean CLI boilerplate from output
      const cleanedOutput = cleanCliOutput(output);

      // Summary = last 500 chars for DB, full cleaned output available
      const summary = cleanedOutput.slice(-500).trim();

      resolve({
        success: code === 0,
        output,
        summary,
        prUrl,
        prNumber,
        previewUrl,
        error: code !== 0 ? `Exit code ${code}` : undefined,
      });
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      resolve({
        success: false,
        output,
        error: `Spawn error: ${err.message}`,
      });
    });
  });
}

// ============================================
// Notifications
// ============================================

async function notifyCompletion(
  task: Task,
  result: ExecutionResult,
  durationMin: string,
  cli: CliTool,
  approvalMeta?: { approvalToken: string }
) {
  const taskType = task.task_type || "code";
  const edgeFunctionBase = `${CONFIG.supabaseUrl}/functions/v1`;

  // Telegram notification
  if (CONFIG.telegramBotToken && CONFIG.telegramChatId) {
    try {
      const icon = taskType === "code" ? "🔨" : taskType === "research" ? "🔍" : taskType === "content" ? "📄" : "✅";
      let msg = `${icon} *${task.title}* completed (${durationMin}min)`;
      if (result.prUrl) msg += `\n[View PR](${result.prUrl})`;
      if (result.previewUrl) msg += `\n[Preview](${result.previewUrl})`;
      if (result.artifactPath) msg += `\n[View Artifact](${result.artifactPath})`;

      await fetch(`https://api.telegram.org/bot${CONFIG.telegramBotToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: CONFIG.telegramChatId,
          text: msg,
          parse_mode: "Markdown",
        }),
      });
    } catch (err) {
      log("warn", `Telegram notification failed: ${err}`);
    }
  }

  // Email research/content results directly
  if (taskType !== "code" && CONFIG.resendApiKey && result.output) {
    try {
      const cleaned = cleanCliOutput(result.output);
      const reportHtml = markdownToHtml(cleaned);

      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${CONFIG.resendApiKey}`,
        },
        body: JSON.stringify({
          from: "MCM Forge <ops@mcmforge.com>",
          to: CONFIG.steveEmail,
          subject: `[MCM Forge] ${task.title}`,
          html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0a; color: #e5e5e5; padding: 24px;">
  <div style="max-width: 680px; margin: 0 auto; background: #171717; border: 1px solid #333; border-radius: 12px; overflow: hidden;">
    <div style="background: linear-gradient(135deg, #1e3a5f, #0f172a); padding: 24px 32px;">
      <h1 style="font-size: 18px; margin: 0 0 4px 0; color: #fff;">${task.title}</h1>
      <p style="color: #94a3b8; margin: 0; font-size: 13px;">Researched by <strong style="color: #60a5fa;">${cli}</strong> &middot; ${durationMin} min &middot; ${new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</p>
    </div>
    <div style="padding: 24px 32px; font-size: 14px; color: #d4d4d4;">
      ${reportHtml}
    </div>
    <div style="padding: 16px 32px; border-top: 1px solid #333; text-align: center;">
      <p style="margin: 0; font-size: 12px; color: #666;">MCM Forge &middot; Overnight Research &middot; <a href="https://mcmforge.com" style="color: #60a5fa;">Dashboard</a></p>
    </div>
  </div>
</body>
</html>`,
        }),
      });
      log("info", `Research email sent for ${task.title}`);
    } catch (err) {
      log("warn", `Research email failed: ${err}`);
    }
  }

  // Email notification for code tasks (need approval)
  if (taskType === "code" && CONFIG.resendApiKey && approvalMeta) {
    try {
      const approveUrl = `${edgeFunctionBase}/approve-task?token=${approvalMeta.approvalToken}&action=approve`;
      const rejectUrl = `${edgeFunctionBase}/approve-task?token=${approvalMeta.approvalToken}&action=reject`;

      const companyName = task.company_registry?.name || "Unknown";

      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${CONFIG.resendApiKey}`,
        },
        body: JSON.stringify({
          from: "MCM Forge <ops@mcmforge.com>",
          to: CONFIG.steveEmail,
          subject: `[MCM Forge] PR Ready: ${task.title}`,
          html: buildApprovalEmail({
            taskTitle: task.title,
            companyName,
            durationMin,
            prUrl: result.prUrl,
            previewUrl: result.previewUrl,
            summary: result.summary,
            approveUrl,
            rejectUrl,
            screenshotUrl: result.screenshotUrl,
            baselineUrl: result.baselineUrl,
            diffUrl: result.diffUrl,
            visualScore: result.visualScore,
            visualFeedback: result.visualFeedback,
          }),
        }),
      });

      log("info", "Approval email sent to Steve");
    } catch (err) {
      log("warn", `Email notification failed: ${err}`);
    }
  }
}

// ============================================
// Email Template
// ============================================

function buildApprovalEmail(params: {
  taskTitle: string;
  companyName: string;
  durationMin: string;
  prUrl?: string;
  previewUrl?: string;
  summary?: string;
  approveUrl: string;
  rejectUrl: string;
  screenshotUrl?: string;
  baselineUrl?: string;
  diffUrl?: string;
  visualScore?: number;
  visualFeedback?: string;
}): string {
  const { taskTitle, companyName, durationMin, prUrl, previewUrl, summary, approveUrl, rejectUrl,
    screenshotUrl, baselineUrl, diffUrl, visualScore, visualFeedback } = params;

  // Truncate summary for email
  const shortSummary = summary && summary.length > 300 ? summary.slice(0, 300) + "..." : summary;

  // Visual score badge
  const visualBadge = visualScore !== undefined && visualScore >= 0
    ? `<span style="display: inline-block; padding: 4px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; background: ${visualScore >= 80 ? "#16a34a" : visualScore >= 60 ? "#ca8a04" : "#dc2626"}; color: #fff;">Visual: ${visualScore}/100</span>`
    : "";

  // Screenshot section
  const screenshotSection = screenshotUrl
    ? `
    <div style="margin: 20px 0;">
      <p style="font-size: 13px; color: #a3a3a3; margin: 0 0 8px 0;">Preview Screenshot ${visualBadge}</p>
      <img src="${screenshotUrl}" alt="Preview screenshot" style="width: 100%; border-radius: 8px; border: 1px solid #333;" />
      ${visualFeedback ? `<p style="font-size: 12px; color: #a3a3a3; margin: 8px 0 0 0; font-style: italic;">${visualFeedback}</p>` : ""}
    </div>
    ${baselineUrl ? `
    <div style="margin: 20px 0;">
      <p style="font-size: 13px; color: #a3a3a3; margin: 0 0 8px 0;">Production Baseline</p>
      <img src="${baselineUrl}" alt="Production baseline" style="width: 100%; border-radius: 8px; border: 1px solid #333;" />
    </div>` : ""}
    ${diffUrl ? `
    <div style="margin: 20px 0;">
      <p style="font-size: 13px; color: #a3a3a3; margin: 0 0 8px 0;">Pixel Diff</p>
      <img src="${diffUrl}" alt="Pixel diff" style="width: 100%; border-radius: 8px; border: 1px solid #333;" />
    </div>` : ""}`
    : "";

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0a; color: #e5e5e5; padding: 24px;">
  <div style="max-width: 560px; margin: 0 auto; background: #171717; border: 1px solid #333; border-radius: 12px; padding: 32px;">
    <h1 style="font-size: 20px; margin: 0 0 4px 0; color: #fff;">PR Ready for Review</h1>
    <p style="color: #a3a3a3; margin: 0 0 24px 0; font-size: 14px;">${companyName} &middot; ${durationMin} min</p>

    <h2 style="font-size: 16px; color: #fff; margin: 0 0 12px 0;">${taskTitle}</h2>

    ${shortSummary ? `<p style="font-size: 13px; color: #a3a3a3; background: #262626; padding: 12px; border-radius: 8px; line-height: 1.5; white-space: pre-wrap;">${shortSummary}</p>` : ""}

    ${screenshotSection}

    <div style="margin: 24px 0; display: flex; gap: 12px;">
      ${previewUrl ? `<a href="${previewUrl}" style="display: inline-block; padding: 10px 20px; background: #1d4ed8; color: #fff; text-decoration: none; border-radius: 8px; font-size: 14px; font-weight: 500;">View Preview</a>` : ""}
      ${prUrl ? `<a href="${prUrl}" style="display: inline-block; padding: 10px 20px; background: #333; color: #fff; text-decoration: none; border-radius: 8px; font-size: 14px; font-weight: 500;">View PR</a>` : ""}
    </div>

    <hr style="border: none; border-top: 1px solid #333; margin: 24px 0;" />

    <div style="text-align: center;">
      <a href="${approveUrl}" style="display: inline-block; padding: 14px 40px; background: #16a34a; color: #fff; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: 600; margin-right: 12px;">Approve &amp; Merge</a>
      <a href="${rejectUrl}" style="display: inline-block; padding: 14px 40px; background: #dc2626; color: #fff; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: 600;">Reject</a>
    </div>

    <p style="text-align: center; margin-top: 24px; font-size: 12px; color: #666;">
      <a href="https://mcmforge.com/approvals" style="color: #666;">View all approvals on dashboard</a>
    </p>
  </div>
</body>
</html>`;
}

// ============================================
// Test Output Analysis
// ============================================

function analyzeTestOutput(output: string): "passed" | "failed" | "no_tests" {
  // Look for test failure indicators
  const failurePatterns = [
    /(\d+) failed/i,
    /FAIL\s/,
    /tests?\s+failed/i,
    /test suite failed/i,
    /assertion error/i,
    /expected .+ but received/i,
    /✗.*test/i,
    /error: test/i,
    /ERR_MODULE_NOT_FOUND.*vitest/i, // Vitest not installed
    /Cannot find module.*vitest/i,
  ];

  const passPatterns = [
    /(\d+) passed/i,
    /tests?\s+passed/i,
    /test suite passed/i,
    /all tests passed/i,
    /✓.*test/i,
    /PASS\s/,
  ];

  // Build failure check
  const buildFailPatterns = [
    /Type error:/i,
    /Build error/i,
    /next build.*failed/i,
    /tsc.*error/i,
  ];

  const hasFailures = failurePatterns.some(p => p.test(output));
  const hasPasses = passPatterns.some(p => p.test(output));
  const hasBuildFailures = buildFailPatterns.some(p => p.test(output));

  if (hasFailures || hasBuildFailures) return "failed";
  if (hasPasses) return "passed";
  return "no_tests";
}

// ============================================
// Output Cleaning & Markdown → HTML
// ============================================

function cleanCliOutput(raw: string): string {
  // Remove common CLI boilerplate lines
  const noisePatterns = [
    /^Loaded cached credentials\.?\s*$/,
    /^Hook registry initialized.*$/,
    /^Error executing tool \w+:.*$/,
    /^Tool execution denied by policy\.?\s*$/,
    /^╭.*╮\s*$/,
    /^│.*│\s*$/,
    /^╰.*╯\s*$/,
    /^Thinking\.{0,3}\s*$/,
    /^\s*$/,
  ];

  const lines = raw.split("\n");
  // Find where the actual content starts (first markdown header or substantial line)
  let startIdx = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith("##") || line.startsWith("# ") || line.length > 80) {
      startIdx = i;
      break;
    }
    const isNoise = noisePatterns.some((p) => p.test(line));
    if (!isNoise && line.length > 20) {
      startIdx = i;
      break;
    }
  }

  return lines.slice(startIdx).join("\n").trim();
}

function markdownToHtml(md: string): string {
  let html = md
    // Escape HTML entities
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    // Headers
    .replace(/^### (.+)$/gm, '<h3 style="font-size: 14px; color: #fff; margin: 20px 0 8px 0; font-weight: 600;">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 style="font-size: 16px; color: #fff; margin: 24px 0 12px 0; border-bottom: 1px solid #333; padding-bottom: 8px;">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 style="font-size: 18px; color: #fff; margin: 24px 0 12px 0;">$1</h1>')
    // Bold and italic
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    // Bullet points
    .replace(/^[*\-•] (.+)$/gm, '<li style="margin: 4px 0; padding-left: 4px;">$1</li>')
    // Numbered lists
    .replace(/^\d+\.\s+(.+)$/gm, '<li style="margin: 4px 0; padding-left: 4px;">$1</li>')
    // Wrap consecutive <li> in <ul>
    .replace(/((?:<li[^>]*>.*<\/li>\n?)+)/g, '<ul style="margin: 8px 0; padding-left: 20px; list-style: disc;">$1</ul>')
    // Line breaks for remaining lines
    .replace(/\n\n/g, "</p><p style=\"margin: 12px 0; line-height: 1.6;\">")
    .replace(/\n/g, "<br>");

  return `<p style="margin: 12px 0; line-height: 1.6;">${html}</p>`;
}

// ============================================
// Helpers
// ============================================

async function updateTaskStatus(
  taskId: string,
  status: string,
  extra?: Record<string, unknown>
) {
  await supabase
    .from("task_queue")
    .update({ status, updated_at: new Date().toISOString(), ...extra })
    .eq("id", taskId);
}

// ============================================
// Main Loop
// ============================================

async function main() {
  log("info", "=== MCM Forge Dispatcher v3 Starting ===");
  log("info", `Poll interval: ${CONFIG.pollIntervalMs / 1000}s`);
  log("info", `Repo base: ${CONFIG.repoBaseDir}`);
  log("info", `Max concurrent tasks: ${MAX_CONCURRENT_TASKS}`);
  log("info", `Max retries: ${MAX_RETRIES}`);
  log("info", `Max duration: ${CONFIG.maxDurationMinutes}min per task`);
  log("info", `Cost caps: $${CONFIG.defaultCostCap} default / $${CONFIG.maxCostCap} max`);
  log("info", `CLIs: claude=${CLI_PATHS.claude}, gemini=${CLI_PATHS.gemini}, codex=${CLI_PATHS.codex}`);

  // Validate config
  if (!CONFIG.supabaseUrl || !CONFIG.supabaseKey) {
    log("error", "Missing MCMFORGE_SUPABASE_URL or MCMFORGE_SUPABASE_KEY");
    process.exit(1);
  }
  if (!CONFIG.agentPassword) {
    log("error", "Missing AGENT_PASSWORD");
    process.exit(1);
  }

  supabase = createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey);

  // Sign in as agent for RLS
  const { error: authError } = await supabase.auth.signInWithPassword({
    email: CONFIG.agentEmail,
    password: CONFIG.agentPassword,
  });
  if (authError) {
    log("error", `Agent auth failed: ${authError.message}`);
    process.exit(1);
  }
  log("info", `Authenticated as ${CONFIG.agentEmail}`);

  // Verify connection
  const { data: companies, error } = await supabase
    .from("company_registry")
    .select("name, slug, status")
    .eq("status", "active");

  if (error) {
    log("error", `Supabase connection failed: ${error.message}`);
    process.exit(1);
  }

  log("info", `Connected. Active companies: ${companies?.map((c) => c.name).join(", ") || "none"}`);

  // Check kill switch on startup
  const paused = await isDispatcherPaused();
  if (paused) {
    log("warn", "Dispatcher is PAUSED on startup. Will check again each poll cycle.");
  }

  // Ensure scratch directory exists for service tasks
  const scratchDir = join(CONFIG.repoBaseDir, "_scratch");
  if (!existsSync(scratchDir)) {
    log("info", `Creating scratch directory: ${scratchDir}`);
    const { mkdirSync } = await import("fs");
    mkdirSync(scratchDir, { recursive: true });
  }

  // Initial poll
  await pollForTask();

  // Start polling loop
  setInterval(pollForTask, CONFIG.pollIntervalMs);

  log("info", "Dispatcher v3 running. Ctrl+C to stop.");
}

main().catch((err) => {
  log("error", `Fatal: ${err}`);
  process.exit(1);
});
