#!/usr/bin/env tsx
/**
 * MCM Forge Dispatcher
 *
 * Brain-level task orchestrator that:
 * - Polls mcmforge-brain task_queue for available tasks
 * - Looks up company → repo directory from company_registry
 * - Spawns Claude Code CLI in the correct repo
 * - Reports results back to task_queue + approval_queue
 * - Sends notifications on completion/failure
 *
 * Replaces the single-company DirtSync executor with a
 * multi-company dispatcher that routes by company_id.
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { spawn } from "child_process";
import * as dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { existsSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, ".env") });

// ============================================
// Configuration
// ============================================

const CONFIG = {
  supabaseUrl: process.env.MCMFORGE_SUPABASE_URL!,
  supabaseServiceKey: process.env.MCMFORGE_SUPABASE_SERVICE_KEY!,
  pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS || "300000", 10),
  repoBaseDir: process.env.REPO_BASE_DIR || "/Users/dirtsyncmini",
  resendApiKey: process.env.RESEND_API_KEY || "",
  steveEmail: process.env.STEVE_EMAIL || "steve@linkschoice.com",
  maxDurationMinutes: parseInt(process.env.MAX_DURATION_MINUTES || "30", 10),
  maxCostPerTask: parseFloat(process.env.MAX_COST_PER_TASK || "10"),
};

// Company slug → repo directory name mapping
// Override if repo dir differs from slug
const REPO_DIR_MAP: Record<string, string> = {
  dirtsync: "DirtSync",
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
// Task Polling
// ============================================

async function pollForTask() {
  if (isProcessing) {
    log("info", "Already processing a task, skipping poll");
    return;
  }

  try {
    // Find oldest todo task assigned to agent-executor
    const { data: task, error } = await supabase
      .from("task_queue")
      .select("*, company_registry(name, slug, github_repo)")
      .eq("status", "todo")
      .eq("assigned_to", "agent-executor")
      .order("created_at", { ascending: true })
      .limit(1)
      .single();

    if (error || !task) {
      log("debug", "No tasks available");
      return;
    }

    log("info", `Found task: ${task.title}`, {
      id: task.id,
      company: task.company_registry?.name,
    });

    await executeTask(task);
  } catch (err) {
    log("error", `Poll error: ${err}`);
  }
}

// ============================================
// Task Execution
// ============================================

async function executeTask(task: Record<string, unknown>) {
  isProcessing = true;
  const startTime = Date.now();
  const company = task.company_registry as Record<string, string> | null;
  const companySlug = company?.slug || "unknown";

  // Resolve repo directory
  const repoDirName = REPO_DIR_MAP[companySlug] || companySlug;
  const repoPath = join(CONFIG.repoBaseDir, repoDirName);

  if (!existsSync(repoPath)) {
    log("error", `Repo not found: ${repoPath}`, { company: companySlug });
    await updateTaskStatus(task.id as string, "blocked", {
      description: `Repo directory not found: ${repoPath}. Clone the repo first.`,
    });
    isProcessing = false;
    return;
  }

  // Claim the task
  await updateTaskStatus(task.id as string, "in_progress", {
    started_at: new Date().toISOString(),
  });

  log("info", `Executing in ${repoPath}`, { task: task.title });

  try {
    // Build the prompt for Claude Code
    const prompt = buildPrompt(task);

    // Spawn Claude Code CLI
    const result = await spawnClaude(repoPath, prompt, task.id as string);

    const durationMs = Date.now() - startTime;
    const durationMin = (durationMs / 60000).toFixed(1);

    if (result.success) {
      log("info", `Task completed in ${durationMin}min`, {
        task: task.title,
      });

      // Mark task as review (needs Steve's approval)
      await updateTaskStatus(task.id as string, "review", {
        completed_at: new Date().toISOString(),
      });

      // Create approval queue entry
      await supabase.from("approval_queue").insert({
        task_id: task.id,
        company_id: task.company_id,
        approval_type: "task_completion",
        title: `Task Complete: ${task.title}`,
        description: result.summary || `Completed in ${durationMin} minutes`,
        preview_url: result.previewUrl || null,
        status: "pending",
      });

      log("info", "Approval created for Steve");
    } else {
      log("error", `Task failed: ${result.error}`, { task: task.title });
      await updateTaskStatus(task.id as string, "blocked", {
        description: `Execution failed: ${result.error}`,
      });
    }

    // Log to communication_log
    await supabase.from("communication_log").insert({
      from_agent: "dispatcher",
      to_agent: "steve",
      message_type: result.success ? "task_complete" : "task_failed",
      content: result.success
        ? `Completed: ${task.title} (${durationMin}min)`
        : `Failed: ${task.title} — ${result.error}`,
      company_id: task.company_id,
    });
  } catch (err) {
    log("error", `Execution error: ${err}`);
    await updateTaskStatus(task.id as string, "blocked", {
      description: `Dispatcher error: ${err}`,
    });
  }

  isProcessing = false;
}

// ============================================
// Claude Code CLI
// ============================================

function buildPrompt(task: Record<string, unknown>): string {
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

interface ClaudeResult {
  success: boolean;
  output: string;
  summary?: string;
  previewUrl?: string;
  error?: string;
}

function spawnClaude(
  repoPath: string,
  prompt: string,
  taskId: string
): Promise<ClaudeResult> {
  return new Promise((resolve) => {
    const timeout = CONFIG.maxDurationMinutes * 60 * 1000;
    let output = "";
    let killed = false;

    const proc = spawn(
      "claude",
      [
        "--print",
        "--dangerously-skip-permissions",
        prompt,
      ],
      {
        cwd: repoPath,
        env: { ...process.env, CLAUDE_TASK_ID: taskId },
        stdio: ["ignore", "pipe", "pipe"],
      }
    );

    // Timeout guard
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
      const prMatch = output.match(
        /https:\/\/github\.com\/[^\s]+\/pull\/\d+/
      );
      const previewUrl = prMatch ? prMatch[0] : undefined;

      // Get last 500 chars as summary
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
  log("info", "=== MCM Forge Dispatcher Starting ===");
  log("info", `Poll interval: ${CONFIG.pollIntervalMs / 1000}s`);
  log("info", `Repo base: ${CONFIG.repoBaseDir}`);
  log("info", `Max duration: ${CONFIG.maxDurationMinutes}min per task`);

  // Validate config
  if (!CONFIG.supabaseUrl || !CONFIG.supabaseServiceKey) {
    log("error", "Missing MCMFORGE_SUPABASE_URL or MCMFORGE_SUPABASE_SERVICE_KEY");
    process.exit(1);
  }

  supabase = createClient(CONFIG.supabaseUrl, CONFIG.supabaseServiceKey);

  // Verify connection
  const { data: companies, error } = await supabase
    .from("company_registry")
    .select("name, slug, status")
    .eq("status", "active");

  if (error) {
    log("error", `Supabase connection failed: ${error.message}`);
    process.exit(1);
  }

  log("info", `Connected. Active companies: ${companies?.map((c) => c.name).join(", ")}`);

  // Initial poll
  await pollForTask();

  // Start polling loop
  setInterval(pollForTask, CONFIG.pollIntervalMs);

  log("info", "Dispatcher running. Ctrl+C to stop.");
}

main().catch((err) => {
  log("error", `Fatal: ${err}`);
  process.exit(1);
});
