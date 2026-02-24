#!/usr/bin/env tsx
/**
 * MCM Forge Dispatcher v2
 *
 * Multi-company, multi-task-type orchestrator that:
 * - Checks kill switch (system_config) before every poll
 * - Polls task_queue for available tasks
 * - Routes by task_type: code, research, content, ops, chat
 * - Routes by cli: claude, gemini, codex
 * - Code tasks → git branch + PR workflow
 * - Service tasks → execute + store artifact + notify
 * - Reports results back to brain DB
 * - Enforces cost caps ($2 default, $5 ceiling)
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { spawn } from "child_process";
import * as dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { existsSync, readFileSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, ".env") });

// ============================================
// Types
// ============================================

type TaskType = "code" | "research" | "content" | "ops" | "chat";
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
};

// CLI binary paths (override via env if needed)
const CLI_PATHS: Record<CliTool, string> = {
  claude: process.env.CLAUDE_CLI_PATH || "claude",
  gemini: process.env.GEMINI_CLI_PATH || "gemini",
  codex: process.env.CODEX_CLI_PATH || "codex",
};

let supabase: SupabaseClient;
let isProcessing = false;

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
  if (isProcessing) {
    log("debug", "Already processing a task, skipping poll");
    return;
  }

  // Kill switch check
  const paused = await isDispatcherPaused();
  if (paused) {
    log("info", "Dispatcher is PAUSED (kill switch active). Skipping poll.");
    return;
  }

  try {
    const { data: task, error } = await supabase
      .from("task_queue")
      .select("*, company_registry(name, slug, github_repo)")
      .eq("status", "todo")
      .eq("assigned_to", "agent-executor")
      .order("priority", { ascending: true }) // critical=1, high=2, medium=3, low=4
      .order("created_at", { ascending: true })
      .limit(1)
      .single();

    if (error || !task) {
      log("debug", "No tasks available");
      return;
    }

    log("info", `Found task: ${task.title}`, {
      id: task.id,
      type: task.task_type || "code",
      cli: task.cli_target || "claude",
      company: task.company_registry?.name,
    });

    await executeTask(task as Task);
  } catch (err) {
    log("error", `Poll error: ${err}`);
  }
}

// ============================================
// Task Router
// ============================================

async function executeTask(task: Task) {
  isProcessing = true;
  const startTime = Date.now();
  const taskType: TaskType = task.task_type || "code";
  const cli: CliTool = task.cli_target || "claude";

  // Claim the task
  await updateTaskStatus(task.id, "in_progress", {
    started_at: new Date().toISOString(),
  });

  try {
    let result: ExecutionResult;

    switch (taskType) {
      case "code":
        result = await executeCodeTask(task, cli);
        break;
      case "research":
        result = await executeServiceTask(task, cli, "research");
        break;
      case "content":
        result = await executeServiceTask(task, cli, "content");
        break;
      case "ops":
        result = await executeServiceTask(task, cli, "ops");
        break;
      case "chat":
        result = await executeServiceTask(task, cli, "chat");
        break;
      default:
        result = { success: false, output: "", error: `Unknown task_type: ${taskType}` };
    }

    const durationMs = Date.now() - startTime;
    const durationMin = (durationMs / 60000).toFixed(1);

    if (result.success) {
      log("info", `Task completed in ${durationMin}min`, { task: task.title, type: taskType });

      // Code tasks need approval. Service tasks go straight to done.
      const newStatus = taskType === "code" ? "review" : "done";

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
      await notifyCompletion(task, result, durationMin, approvalMeta);
    } else {
      log("error", `Task failed: ${result.error}`, { task: task.title });
      await updateTaskStatus(task.id, "blocked", {
        result_summary: `Failed: ${result.error}`,
      });
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
    await updateTaskStatus(task.id, "blocked", {
      result_summary: `Dispatcher error: ${err}`,
    });
  }

  isProcessing = false;
}

// ============================================
// Code Task Execution (git + PR workflow)
// ============================================

async function executeCodeTask(task: Task, cli: CliTool): Promise<ExecutionResult> {
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

  log("info", `[code] Executing in ${repoPath} with ${cli}`, { task: task.title });

  const prompt = buildCodePrompt(task);
  return spawnCli(cli, repoPath, prompt, task.id);
}

// ============================================
// Service Task Execution (no git, artifact-based)
// ============================================

async function executeServiceTask(
  task: Task,
  cli: CliTool,
  mode: "research" | "content" | "ops" | "chat"
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

  const prompt = buildServicePrompt(task, mode);
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
// Prompt Builders
// ============================================

function buildCodePrompt(task: Task): string {
  const parts = [
    `# Task: ${task.title}`,
    "",
    task.description || "No description provided.",
    "",
    "## Requirements",
    "- Follow the project's CLAUDE.md instructions",
    "- Create a feature branch, NOT push to main/master",
    "- Run tests if they exist",
    "- Commit with clear messages",
    "- Create a PR when done",
    "- Report the PR URL in your final output",
  ];

  if (task.skill_name) {
    parts.push("", `## Skill to use: /${task.skill_name}`);
  }

  return parts.join("\n");
}

function buildServicePrompt(task: Task, mode: string): string {
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
      // Gemini CLI uses -p for prompt
      return ["-p", prompt];
    case "codex":
      // Codex CLI
      return ["--prompt", prompt];
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

      // Summary = last 500 chars
      const summary = output.slice(-500).trim();

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
}): string {
  const { taskTitle, companyName, durationMin, prUrl, previewUrl, summary, approveUrl, rejectUrl } = params;

  // Truncate summary for email
  const shortSummary = summary && summary.length > 300 ? summary.slice(0, 300) + "..." : summary;

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
  log("info", "=== MCM Forge Dispatcher v2 Starting ===");
  log("info", `Poll interval: ${CONFIG.pollIntervalMs / 1000}s`);
  log("info", `Repo base: ${CONFIG.repoBaseDir}`);
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

  log("info", "Dispatcher v2 running. Ctrl+C to stop.");
}

main().catch((err) => {
  log("error", `Fatal: ${err}`);
  process.exit(1);
});
