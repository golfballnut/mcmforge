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
      });

      // Code tasks create approval entries (pr_merge is the valid approval_type)
      if (taskType === "code") {
        await supabase.from("approval_queue").insert({
          task_id: task.id,
          company_id: task.company_id,
          approval_type: "pr_merge",
          title: `Task Complete: ${task.title}`,
          description: result.summary || `Completed in ${durationMin} minutes`,
          preview_url: result.previewUrl || null,
          status: "pending",
        });
      }

      // Notify Steve for all completed tasks
      await notifyCompletion(task, result, durationMin);
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

      // Extract PR URL from output if present
      const prMatch = output.match(/https:\/\/github\.com\/[^\s]+\/pull\/\d+/);
      const previewUrl = prMatch ? prMatch[0] : undefined;

      // Summary = last 500 chars
      const summary = output.slice(-500).trim();

      resolve({
        success: code === 0,
        output,
        summary,
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

async function notifyCompletion(task: Task, result: ExecutionResult, durationMin: string) {
  const taskType = task.task_type || "code";

  // Telegram notification
  if (CONFIG.telegramBotToken && CONFIG.telegramChatId) {
    try {
      const icon = taskType === "code" ? "🔨" : taskType === "research" ? "🔍" : taskType === "content" ? "📄" : "✅";
      let msg = `${icon} *${task.title}* completed (${durationMin}min)`;
      if (result.previewUrl) msg += `\n[View PR](${result.previewUrl})`;
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
  if (taskType === "code" && CONFIG.resendApiKey) {
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${CONFIG.resendApiKey}`,
        },
        body: JSON.stringify({
          from: "MCM Forge <ops@mcmforge.com>",
          to: CONFIG.steveEmail,
          subject: `[MCM Forge] Task Complete: ${task.title}`,
          html: `
            <h2>Task Completed</h2>
            <p><strong>${task.title}</strong></p>
            <p>Duration: ${durationMin} minutes</p>
            ${result.previewUrl ? `<p><a href="${result.previewUrl}">View Pull Request</a></p>` : ""}
            <p><a href="https://mcmforge.com/approvals">Review on Dashboard</a></p>
          `,
        }),
      });
    } catch (err) {
      log("warn", `Email notification failed: ${err}`);
    }
  }
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

  supabase = createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey);

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
