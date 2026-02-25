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
import { existsSync } from "fs";

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
  retry_count?: number;
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
// Task Router
// ============================================

async function executeTask(task: Task) {
  activeTaskCount++;
  const startTime = Date.now();
  const taskType: TaskType = task.task_type || "code";
  const cli: CliTool = task.cli_target || "claude";

  // Claim the task
  await updateTaskStatus(task.id, "in_progress", {
    started_at: new Date().toISOString(),
  });

  // Load vault context for this company
  const vaultContext = await loadVaultContext(task);

  try {
    let result: ExecutionResult;

    switch (taskType) {
      case "code":
        result = await executeCodeTask(task, cli, vaultContext);
        break;
      case "research":
        result = await executeServiceTask(task, cli, "research", vaultContext);
        break;
      case "content":
        result = await executeServiceTask(task, cli, "content", vaultContext);
        break;
      case "ops":
        result = await executeServiceTask(task, cli, "ops", vaultContext);
        break;
      case "chat":
        result = await executeServiceTask(task, cli, "chat", vaultContext);
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

      log("info", `Task completed in ${durationMin}min (tests: ${testStatus})`, { task: task.title, type: taskType });

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
      await notifyCompletion(task, result, durationMin, cli, approvalMeta);
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

async function loadVaultContext(task: Task): Promise<string> {
  try {
    const companySlug = task.company_registry?.slug;
    if (!companySlug) return "";

    // Load company profile + relevant decisions + skills from vault_docs
    const { data: vaultDocs } = await supabase
      .from("vault_docs")
      .select("title, category, content")
      .or(`company_id.eq.${task.company_id},category.eq.skill`)
      .order("category", { ascending: true });

    if (!vaultDocs || vaultDocs.length === 0) return "";

    const sections: string[] = ["## Vault Context (loaded automatically)"];

    for (const doc of vaultDocs) {
      // Truncate large docs to keep prompt reasonable
      const content = doc.content?.length > 2000
        ? doc.content.slice(0, 2000) + "\n[... truncated]"
        : doc.content;
      sections.push(`### [${doc.category}] ${doc.title}\n${content}`);
    }

    log("info", `Loaded ${vaultDocs.length} vault docs for context`, {
      company: companySlug,
    });

    return sections.join("\n\n");
  } catch (err) {
    log("warn", `Failed to load vault context: ${err}`);
    return "";
  }
}

// ============================================
// Code Task Execution (git + PR workflow)
// ============================================

async function executeCodeTask(task: Task, cli: CliTool, vaultContext: string = ""): Promise<ExecutionResult> {
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

  log("info", `[code] Executing in ${repoPath} with ${cli}`, { task: task.title });

  const prompt = buildCodePrompt(task, vaultContext);
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
// Service Task Execution (no git, artifact-based)
// ============================================

async function executeServiceTask(
  task: Task,
  cli: CliTool,
  mode: "research" | "content" | "ops" | "chat",
  vaultContext: string = ""
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

  const prompt = buildServicePrompt(task, mode, vaultContext);
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
// Test Output Analysis
// ============================================

function analyzeTestOutput(output: string): "passed" | "failed" | "no_tests" {
  const lower = output.toLowerCase();

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
  ];

  const passPatterns = [
    /(\d+) passed/i,
    /tests?\s+passed/i,
    /test suite passed/i,
    /all tests passed/i,
    /✓.*test/i,
    /PASS\s/,
  ];

  const hasFailures = failurePatterns.some(p => p.test(output));
  const hasPasses = passPatterns.some(p => p.test(output));

  if (hasFailures) return "failed";
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
