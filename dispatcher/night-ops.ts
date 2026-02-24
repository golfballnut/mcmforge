#!/usr/bin/env tsx
/**
 * MCM Forge Night-Ops
 *
 * Runs every hour on the Mac Mini via pm2 cron.
 * - Checks PM2 process health
 * - Scans for stuck/blocked tasks
 * - Checks open PRs
 * - Sends Telegram alert if something is wrong
 * - At 6 AM ET: compiles daily brief and emails Steve
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
  agentEmail: process.env.AGENT_EMAIL || "agent@mcmforge.com",
  agentPassword: process.env.AGENT_PASSWORD!,
  resendApiKey: process.env.RESEND_API_KEY || "",
  steveEmail: process.env.STEVE_EMAIL || "steve@linkschoice.com",
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || "",
  telegramChatId: process.env.STEVE_TELEGRAM_CHAT_ID || process.env.TELEGRAM_CHAT_ID || "",
  checkIntervalMs: 60 * 60 * 1000, // 1 hour
  briefHourUTC: 11, // 6 AM ET = 11 UTC
  geminiApiKey: process.env.GEMINI_API_KEY || "",
};

let supabase: SupabaseClient;

function log(level: string, msg: string) {
  console.log(`[${new Date().toISOString()}] [night-ops] [${level}] ${msg}`);
}

// ── Health Checks ──────────────────────────────

interface HealthReport {
  timestamp: string;
  pm2: { total: number; online: number; errored: string[] };
  tasks: { stuck: number; blocked: number; inProgress: number; pendingApprovals: number };
  prs: { open: number; list: string[] };
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
  // Stuck = in_progress for more than 45 minutes
  const fortyFiveMinAgo = new Date(Date.now() - 45 * 60 * 1000).toISOString();

  const [stuckRes, blockedRes, inProgressRes, approvalRes] = await Promise.all([
    supabase
      .from("task_queue")
      .select("id", { count: "exact" })
      .eq("status", "in_progress")
      .lt("started_at", fortyFiveMinAgo),
    supabase
      .from("task_queue")
      .select("id", { count: "exact" })
      .eq("status", "blocked"),
    supabase
      .from("task_queue")
      .select("id", { count: "exact" })
      .eq("status", "in_progress"),
    supabase
      .from("approval_queue")
      .select("id", { count: "exact" })
      .eq("status", "pending"),
  ]);

  return {
    stuck: stuckRes.count || 0,
    blocked: blockedRes.count || 0,
    inProgress: inProgressRes.count || 0,
    pendingApprovals: approvalRes.count || 0,
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

async function runHealthCheck(): Promise<HealthReport> {
  const [pm2, tasks, prs] = await Promise.all([
    checkPm2Health(),
    checkTasks(),
    checkOpenPRs(),
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
    alerts,
  };
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

async function sendDailyBriefEmail(report: HealthReport) {
  if (!CONFIG.resendApiKey) {
    log("warn", "No Resend API key — skipping daily brief email");
    return;
  }

  // Get recent completed tasks (last 24h)
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
    ? completed.map((t) =>
        `<li>${t.title} <span style="color:#6b7280;">(${t.task_type})</span>${t.pr_url ? ` — <a href="${t.pr_url}" style="color:#3b82f6;">PR</a>` : ""}</li>`
      ).join("")
    : "<li style='color:#6b7280;'>No tasks completed</li>";

  const pendingHtml = pending.length > 0
    ? pending.map((a) =>
        `<li>${a.title}${a.pr_url ? ` — <a href="${a.pr_url}" style="color:#3b82f6;">Review PR</a>` : ""}</li>`
      ).join("")
    : "<li style='color:#6b7280;'>No pending approvals</li>";

  const alertsHtml = report.alerts.length > 0
    ? `<div style="background:#7f1d1d;border:1px solid #991b1b;border-radius:8px;padding:12px;margin-bottom:16px;">
        <strong style="color:#fca5a5;">Alerts:</strong>
        <ul style="margin:4px 0 0;padding-left:20px;">${report.alerts.map((a) => `<li style="color:#fca5a5;">${a}</li>`).join("")}</ul>
      </div>`
    : "";

  const html = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,sans-serif;background:#0a0a0a;color:#e5e5e5;padding:24px;">
<div style="max-width:560px;margin:0 auto;background:#171717;border:1px solid #333;border-radius:12px;padding:32px;">
  <h1 style="font-size:20px;margin:0 0 4px;color:#fff;">Good Morning, Steve</h1>
  <p style="color:#a3a3a3;margin:0 0 24px;font-size:14px;">MCM Forge Daily Brief — ${new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}</p>

  ${alertsHtml}

  <h2 style="font-size:15px;color:#f97316;margin:0 0 8px;">System Status</h2>
  <p style="font-size:13px;color:#a3a3a3;margin:0 0 16px;">
    PM2: ${report.pm2.online}/${report.pm2.total} online &nbsp;|&nbsp;
    Tasks in progress: ${report.tasks.inProgress} &nbsp;|&nbsp;
    Open PRs: ${report.prs.open}
  </p>

  <h2 style="font-size:15px;color:#22c55e;margin:0 0 8px;">Completed (24h)</h2>
  <ul style="font-size:13px;color:#d4d4d4;padding-left:20px;margin:0 0 16px;">${completedHtml}</ul>

  <h2 style="font-size:15px;color:#eab308;margin:0 0 8px;">Needs Your Approval</h2>
  <ul style="font-size:13px;color:#d4d4d4;padding-left:20px;margin:0 0 16px;">${pendingHtml}</ul>

  <h2 style="font-size:15px;color:#3b82f6;margin:0 0 8px;">Open PRs</h2>
  <ul style="font-size:13px;color:#d4d4d4;padding-left:20px;margin:0 0 16px;">
    ${report.prs.list.map((pr) => `<li>${pr}</li>`).join("")}
  </ul>

  <hr style="border:none;border-top:1px solid #333;margin:24px 0;" />
  <p style="text-align:center;font-size:12px;color:#666;">
    <a href="https://mcmforge.com" style="color:#666;">mcmforge.com</a> &nbsp;|&nbsp;
    <a href="https://mcmforge.com/approvals" style="color:#666;">Approvals</a> &nbsp;|&nbsp;
    <a href="https://mcmforge.com/tasks" style="color:#666;">Tasks</a>
  </p>
</div>
</body></html>`;

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
        subject: `[MCM Forge] Daily Brief — ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
        html,
      }),
    });
    log("info", "Daily brief email sent");
  } catch (err) {
    log("error", `Daily brief email failed: ${err}`);
  }

  // Store brief in brain DB
  await supabase.from("daily_briefs").insert({
    recipient: "steve",
    summary: `PM2: ${report.pm2.online}/${report.pm2.total} | Tasks completed: ${completed.length} | Pending approvals: ${pending.length} | Alerts: ${report.alerts.length}`,
    tasks: completed,
    metrics: { pm2: report.pm2, tasks: report.tasks, prs: report.prs },
    status: "sent",
    email_sent_at: new Date().toISOString(),
  });
}

// ── Main Loop ──────────────────────────────────

let lastBriefDate = "";

async function cycle() {
  log("info", "Running health check...");

  const report = await runHealthCheck();

  log("info", `PM2: ${report.pm2.online}/${report.pm2.total} | Tasks: ${report.tasks.inProgress} active, ${report.tasks.blocked} blocked | PRs: ${report.prs.open} open`);

  // Send Telegram alert if there are issues
  if (report.alerts.length > 0) {
    const alertMsg = `*Night-Ops Alert*\n${report.alerts.map((a) => `- ${a}`).join("\n")}`;
    await sendTelegramAlert(alertMsg);
    log("warn", `Alerts sent: ${report.alerts.join("; ")}`);
  }

  // Daily brief at 6 AM ET (11 UTC)
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  if (now.getUTCHours() === CONFIG.briefHourUTC && lastBriefDate !== todayStr) {
    log("info", "Sending daily brief...");
    await sendDailyBriefEmail(report);
    lastBriefDate = todayStr;
  }

  // Log to communication_log
  await supabase.from("communication_log").insert({
    from_agent: "night-ops",
    to_agent: "steve",
    channel: "internal",
    message: `Health check: PM2 ${report.pm2.online}/${report.pm2.total}, ${report.tasks.inProgress} active tasks, ${report.prs.open} open PRs${report.alerts.length > 0 ? ` | ALERTS: ${report.alerts.join("; ")}` : ""}`,
  });
}

async function main() {
  log("info", "=== MCM Forge Night-Ops Starting ===");
  log("info", `Check interval: ${CONFIG.checkIntervalMs / 60000} min`);
  log("info", `Daily brief hour (UTC): ${CONFIG.briefHourUTC}`);

  if (!CONFIG.supabaseUrl || !CONFIG.supabaseKey || !CONFIG.agentPassword) {
    log("error", "Missing required env vars");
    process.exit(1);
  }

  supabase = createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey);

  const { error: authError } = await supabase.auth.signInWithPassword({
    email: CONFIG.agentEmail,
    password: CONFIG.agentPassword,
  });
  if (authError) {
    log("error", `Auth failed: ${authError.message}`);
    process.exit(1);
  }
  log("info", "Authenticated");

  // Initial check
  await cycle();

  // Hourly loop
  setInterval(cycle, CONFIG.checkIntervalMs);

  log("info", "Night-Ops running. Ctrl+C to stop.");
}

main().catch((err) => {
  log("error", `Fatal: ${err}`);
  process.exit(1);
});
