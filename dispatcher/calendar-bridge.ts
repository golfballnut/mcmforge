#!/usr/bin/env tsx
/**
 * MCM Forge Calendar Bridge
 *
 * Polls Google Calendar for feature/task events and auto-creates
 * task_queue rows in Supabase. This is the "Calendar -> Orders" bridge
 * that lets Steve drop events on Google Calendar and have the Mini
 * pick them up autonomously.
 *
 * - Looks ahead 14 days
 * - Skips noise events (birthdays, daily data checks, status markers)
 * - Deduplicates via calendar_event_id column
 * - Classifies task_type from title keywords
 * - Assigns to the CTO agent for the matching company
 * - Can run standalone: `npx tsx calendar-bridge.ts`
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, ".env") });

// ============================================
// Configuration
// ============================================

const CONFIG = {
  supabaseUrl: process.env.MCMFORGE_SUPABASE_URL!,
  supabaseKey: process.env.MCMFORGE_SUPABASE_KEY!,
  googleClientId: process.env.GOOGLE_OAUTH_CLIENT_ID || "",
  googleClientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET || "",
  googleRefreshToken: process.env.GOOGLE_REFRESH_TOKEN || "",
  lookAheadDays: 14,
};

// ============================================
// Logging
// ============================================

function log(level: string, msg: string, meta?: Record<string, unknown>) {
  const ts = new Date().toISOString();
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : "";
  console.log(`[${ts}] [calendar-bridge] [${level}] ${msg}${metaStr}`);
}

// ============================================
// Google OAuth
// ============================================

let googleAccessToken: string | null = null;
let googleTokenExpiresAt = 0;

async function getGoogleAccessToken(): Promise<string | null> {
  if (!CONFIG.googleClientId || !CONFIG.googleRefreshToken) return null;

  // Return cached token if still valid (with 60s buffer)
  if (googleAccessToken && Date.now() < googleTokenExpiresAt - 60000) {
    return googleAccessToken;
  }

  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: CONFIG.googleClientId,
        client_secret: CONFIG.googleClientSecret,
        refresh_token: CONFIG.googleRefreshToken,
        grant_type: "refresh_token",
      }),
    });
    const data = (await res.json()) as Record<string, unknown>;
    if (data.access_token) {
      googleAccessToken = data.access_token as string;
      googleTokenExpiresAt =
        Date.now() + ((data.expires_in as number) || 3600) * 1000;
      return googleAccessToken;
    }
    log("warn", `Google OAuth refresh failed: ${JSON.stringify(data)}`);
    return null;
  } catch (err) {
    log("warn", `Google OAuth token exchange failed: ${err}`);
    return null;
  }
}

// ============================================
// Skip Patterns
// ============================================

const SKIP_PATTERNS = [
  /daily data check/i,
  /birthday/i,
  /\bDONE\b/,
  /^Week \d+:/i,
  /^BUILD:/i,
];

function shouldSkipEvent(summary: string): boolean {
  return SKIP_PATTERNS.some((pattern) => pattern.test(summary));
}

// ============================================
// Task Type Classification
// ============================================

const CODE_KEYWORDS = [
  "fix",
  "build",
  "add",
  "implement",
  "route",
  "feature",
  "page",
  "view",
  "system",
  "gate",
  "overlay",
];
const CONTENT_KEYWORDS = ["content", "write", "blog", "post", "copy", "email"];
const RESEARCH_KEYWORDS = ["research", "analyze", "investigate", "audit", "review", "compare"];

function classifyTaskType(title: string): string {
  const lower = title.toLowerCase();

  for (const kw of CODE_KEYWORDS) {
    if (lower.includes(kw)) return "code";
  }
  for (const kw of CONTENT_KEYWORDS) {
    if (lower.includes(kw)) return "content";
  }
  for (const kw of RESEARCH_KEYWORDS) {
    if (lower.includes(kw)) return "research";
  }

  return "code"; // default
}

// ============================================
// Company Detection from Event Title
// ============================================

// Map of prefix/keyword patterns to company slugs
const COMPANY_SLUG_PATTERNS: Array<{ pattern: RegExp; slug: string }> = [
  { pattern: /^DirtSync:/i, slug: "dirtsync" },
  { pattern: /\bDirtSync\b/i, slug: "dirtsync" },
  { pattern: /^Links ?Choice:/i, slug: "linkschoice" },
  { pattern: /\bLinks ?Choice\b/i, slug: "linkschoice" },
  { pattern: /^Golf ?Ball ?Nut:/i, slug: "golfballnut" },
  { pattern: /\bGolf ?Ball ?Nut\b/i, slug: "golfballnut" },
  { pattern: /^Hot ?Golf ?Brands:/i, slug: "hotgolfbrands" },
  { pattern: /\bHot ?Golf ?Brands\b/i, slug: "hotgolfbrands" },
  { pattern: /^MCM ?Forge:/i, slug: "mcmforge" },
  { pattern: /\bMCM ?Forge\b/i, slug: "mcmforge" },
];

function detectCompanySlug(summary: string): string {
  for (const { pattern, slug } of COMPANY_SLUG_PATTERNS) {
    if (pattern.test(summary)) return slug;
  }
  return "mcmforge"; // default to MCM Forge if no company detected
}

// ============================================
// Title Cleanup
// ============================================

/**
 * Strip company prefixes like "DirtSync: " from the title
 * so task titles are clean in the queue.
 */
function cleanTitle(summary: string): string {
  return summary
    .replace(/^DirtSync:\s*/i, "")
    .replace(/^Links ?Choice:\s*/i, "")
    .replace(/^Golf ?Ball ?Nut:\s*/i, "")
    .replace(/^Hot ?Golf ?Brands:\s*/i, "")
    .replace(/^MCM ?Forge:\s*/i, "")
    .trim();
}

// ============================================
// CLI Target Selection
// ============================================

function pickCliTarget(taskType: string): string {
  switch (taskType) {
    case "research":
      return "gemini";
    case "content":
      return "gemini";
    default:
      return "claude";
  }
}

// ============================================
// Calendar Event Types
// ============================================

interface CalendarEvent {
  id: string;
  summary?: string;
  description?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  status?: string;
}

interface CalendarListResponse {
  items?: CalendarEvent[];
  nextPageToken?: string;
}

// ============================================
// Core Bridge Logic
// ============================================

export async function runCalendarBridge(): Promise<{
  created: number;
  skipped: number;
}> {
  let created = 0;
  let skipped = 0;

  // Validate config
  if (!CONFIG.supabaseUrl || !CONFIG.supabaseKey) {
    log("error", "Missing MCMFORGE_SUPABASE_URL or MCMFORGE_SUPABASE_KEY");
    return { created, skipped };
  }

  const token = await getGoogleAccessToken();
  if (!token) {
    log("error", "Could not obtain Google access token — skipping bridge run");
    return { created, skipped };
  }

  const supabase = createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey);

  // Authenticate as agent for RLS access
  const agentEmail = process.env.AGENT_EMAIL || "agent@mcmforge.com";
  const agentPassword = process.env.AGENT_PASSWORD;
  if (agentPassword) {
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: agentEmail,
      password: agentPassword,
    });
    if (authError) {
      log("error", `Agent auth failed: ${authError.message}`);
      return { created, skipped };
    }
  }

  // Fetch all company calendars from company_registry
  const { data: companies, error: companyError } = await supabase
    .from("company_registry")
    .select("id, slug, name, google_calendar_id");

  if (companyError || !companies) {
    log("error", `Failed to load company_registry: ${companyError?.message}`);
    return { created, skipped };
  }

  // Build slug -> company lookup
  const companyBySlug = new Map<
    string,
    { id: string; slug: string; name: string; google_calendar_id: string | null }
  >();
  for (const c of companies) {
    companyBySlug.set(c.slug, c);
  }

  // Time window: now -> 14 days ahead
  const now = new Date();
  const timeMin = now.toISOString();
  const timeMax = new Date(
    now.getTime() + CONFIG.lookAheadDays * 24 * 60 * 60 * 1000
  ).toISOString();

  // Collect events from all company calendars + primary
  const calendarIds = new Set<string>();
  calendarIds.add("primary");
  for (const c of companies) {
    if (c.google_calendar_id) {
      calendarIds.add(c.google_calendar_id);
    }
  }

  const allEvents: Array<CalendarEvent & { _calendarId: string }> = [];

  for (const calendarId of calendarIds) {
    try {
      let pageToken: string | undefined;
      do {
        const params = new URLSearchParams({
          timeMin,
          timeMax,
          singleEvents: "true",
          orderBy: "startTime",
          maxResults: "100",
        });
        if (pageToken) params.set("pageToken", pageToken);

        const res = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
            calendarId
          )}/events?${params}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );

        if (!res.ok) {
          log("warn", `Calendar API error for ${calendarId}: ${res.status}`);
          break;
        }

        const data = (await res.json()) as CalendarListResponse;
        if (data.items) {
          for (const event of data.items) {
            allEvents.push({ ...event, _calendarId: calendarId });
          }
        }
        pageToken = data.nextPageToken;
      } while (pageToken);
    } catch (err) {
      log("warn", `Failed to fetch calendar ${calendarId}: ${err}`);
    }
  }

  log("info", `Fetched ${allEvents.length} events from ${calendarIds.size} calendar(s)`);

  // Deduplicate by event ID (same event might appear in multiple calendars)
  const seenEventIds = new Set<string>();
  const uniqueEvents: typeof allEvents = [];
  for (const event of allEvents) {
    if (!seenEventIds.has(event.id)) {
      seenEventIds.add(event.id);
      uniqueEvents.push(event);
    }
  }

  // Filter and process events
  for (const event of uniqueEvents) {
    const summary = event.summary || "";
    if (!summary.trim()) {
      skipped++;
      continue;
    }

    // Skip cancelled events
    if (event.status === "cancelled") {
      skipped++;
      continue;
    }

    // Skip noise events
    if (shouldSkipEvent(summary)) {
      skipped++;
      continue;
    }

    // Check if already in task_queue
    const { data: existing } = await supabase
      .from("task_queue")
      .select("id")
      .eq("calendar_event_id", event.id)
      .limit(1);

    if (existing && existing.length > 0) {
      skipped++;
      continue;
    }

    // Detect company from title
    const companySlug = detectCompanySlug(summary);
    const company = companyBySlug.get(companySlug);
    if (!company) {
      log("warn", `No company found for slug "${companySlug}", skipping: ${summary}`);
      skipped++;
      continue;
    }

    // Clean the title (strip company prefix)
    const title = cleanTitle(summary);

    // Classify task type
    const taskType = classifyTaskType(title);

    // Pick CLI target
    const cliTarget = pickCliTarget(taskType);

    // Look up CTO agent for this company
    let assignedAgentId: string | null = null;
    const { data: ctoAgent } = await supabase
      .from("forge_agents")
      .select("id")
      .eq("role", "cto")
      .eq("company_id", company.id)
      .limit(1)
      .single();

    if (ctoAgent) {
      assignedAgentId = ctoAgent.id;
    }

    // Build the task row
    const taskRow: Record<string, unknown> = {
      title,
      description: event.description || `Calendar event: ${summary}`,
      task_type: taskType,
      cli_target: cliTarget,
      company_id: company.id,
      assigned_to: "agent-executor",
      priority: "high",
      status: "todo",
      calendar_event_id: event.id,
      cost_cap: 5.0,
      skill_name: "plan-then-code",
      created_by: "calendar-bridge",
    };

    if (assignedAgentId) {
      taskRow.assigned_agent_id = assignedAgentId;
    }

    // Insert into task_queue
    const { error: insertError } = await supabase
      .from("task_queue")
      .insert(taskRow);

    if (insertError) {
      log("error", `Failed to insert task for "${title}": ${insertError.message}`);
      continue;
    }

    created++;
    log("info", `Created task: "${title}" (company=${companySlug}, type=${taskType}, cli=${cliTarget})`, {
      eventId: event.id,
      companyId: company.id,
    });
  }

  log("info", `Bridge run complete: ${created} created, ${skipped} skipped`);
  return { created, skipped };
}

// ============================================
// Standalone execution
// ============================================

const isMain =
  process.argv[1] &&
  (process.argv[1].endsWith("calendar-bridge.ts") ||
    process.argv[1].endsWith("calendar-bridge.js"));

if (isMain) {
  runCalendarBridge()
    .then((result) => {
      log("info", `Done: ${JSON.stringify(result)}`);
      process.exit(0);
    })
    .catch((err) => {
      log("error", `Fatal: ${err}`);
      process.exit(1);
    });
}
