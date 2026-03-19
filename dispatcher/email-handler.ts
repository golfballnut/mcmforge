/**
 * Email Reply Handler — Polls Gmail for replies to escalation emails.
 *
 * When Steve replies to an "[MCM Forge] Agent needs help: ..." email,
 * this handler extracts his instructions, unblocks the task, and
 * resets it for retry.
 *
 * Called by night-ops.ts as Phase 1.7 in the hourly cycle.
 */

import { SupabaseClient } from "@supabase/supabase-js";

// ── Types ────────────────────────────────────────

export interface EmailHandlerDeps {
  supabase: SupabaseClient;
  googleClientId: string;
  googleClientSecret: string;
  googleRefreshToken: string;
  log: (level: string, msg: string) => void;
  sendTelegramAlert: (msg: string) => Promise<void>;
}

interface GmailMessage {
  id: string;
  threadId: string;
  payload: {
    headers: { name: string; value: string }[];
    mimeType: string;
    body?: { data?: string; size: number };
    parts?: GmailPart[];
  };
}

interface GmailPart {
  mimeType: string;
  body?: { data?: string; size: number };
  parts?: GmailPart[];
}

// ── Google OAuth ─────────────────────────────────

let cachedAccessToken: string | null = null;
let tokenExpiresAt = 0;
let scopeWarningLogged = false;

async function getGoogleAccessToken(config: {
  googleClientId: string;
  googleClientSecret: string;
  googleRefreshToken: string;
}, log: (level: string, msg: string) => void): Promise<string | null> {
  if (!config.googleClientId || !config.googleRefreshToken) {
    log("debug", "[email] Google OAuth not configured, skipping");
    return null;
  }

  // Return cached token if still valid (60s buffer)
  if (cachedAccessToken && Date.now() < tokenExpiresAt - 60000) {
    return cachedAccessToken;
  }

  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.googleClientId,
        client_secret: config.googleClientSecret,
        refresh_token: config.googleRefreshToken,
        grant_type: "refresh_token",
      }),
    });
    const data = (await res.json()) as Record<string, unknown>;
    if (data.access_token) {
      cachedAccessToken = data.access_token as string;
      tokenExpiresAt = Date.now() + ((data.expires_in as number) || 3600) * 1000;
      return cachedAccessToken;
    }
    log("warn", `[email] Google OAuth refresh failed: ${JSON.stringify(data)}`);
    return null;
  } catch (err) {
    log("warn", `[email] Google OAuth token exchange failed: ${err}`);
    return null;
  }
}

// ── Gmail API Helpers ────────────────────────────

async function listGmailMessages(
  token: string,
  query: string,
  maxResults = 10,
): Promise<{ id: string; threadId: string }[]> {
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=${maxResults}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 403) {
    const body = await res.text();
    if (body.includes("Insufficient Permission")) {
      return []; // Caller handles scope warning
    }
  }

  if (!res.ok) return [];
  const data = (await res.json()) as { messages?: { id: string; threadId: string }[] };
  return data.messages || [];
}

async function getGmailMessage(token: string, messageId: string): Promise<GmailMessage | null> {
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  return (await res.json()) as GmailMessage;
}

async function markGmailMessageRead(token: string, messageId: string): Promise<boolean> {
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/modify`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ removeLabelIds: ["UNREAD"] }),
  });
  return res.ok;
}

// ── Reply Parsing ────────────────────────────────

/** Decode base64url string (Gmail API encoding) */
function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64").toString("utf-8");
}

/** Extract text body from Gmail message (prefer text/plain, fall back to text/html) */
function extractBody(message: GmailMessage): string {
  // Check for simple body (no parts)
  if (message.payload.body?.data) {
    return decodeBase64Url(message.payload.body.data);
  }

  // Walk parts looking for text/plain first, then text/html
  function findPart(parts: GmailPart[] | undefined, mimeType: string): string | null {
    if (!parts) return null;
    for (const part of parts) {
      if (part.mimeType === mimeType && part.body?.data) {
        return decodeBase64Url(part.body.data);
      }
      // Recurse into nested parts (multipart/alternative etc.)
      const nested = findPart(part.parts, mimeType);
      if (nested) return nested;
    }
    return null;
  }

  const plain = findPart(message.payload.parts, "text/plain");
  if (plain) return plain;

  const html = findPart(message.payload.parts, "text/html");
  if (html) return stripHtmlTags(html);

  return "";
}

/** Naive HTML tag stripper for fallback body extraction */
function stripHtmlTags(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&middot;/g, "\u00B7")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Extract Steve's reply text, stripping quoted original email */
function extractReplyText(body: string): string {
  // Split on common reply delimiters — keep only what's before them
  let reply = body;

  // Gmail: "On Mon, Mar 19, 2026 at 2:00 PM ... wrote:"
  const gmailDelimiter = reply.search(/\nOn .+wrote:\s*\n/);
  if (gmailDelimiter > 0) reply = reply.slice(0, gmailDelimiter);

  // Outlook: "---------- Original Message ----------"
  const outlookDelimiter = reply.search(/\n-{5,}\s*(Original|Forwarded)\s*Message\s*-{5,}/i);
  if (outlookDelimiter > 0) reply = reply.slice(0, outlookDelimiter);

  // Apple Mail / generic: lines starting with ">"
  reply = reply
    .split("\n")
    .filter((line) => !line.startsWith(">"))
    .join("\n");

  return reply.trim();
}

/** Get header value from Gmail message */
function getHeader(message: GmailMessage, name: string): string {
  const header = message.payload.headers.find(
    (h) => h.name.toLowerCase() === name.toLowerCase(),
  );
  return header?.value || "";
}

/** Extract task title from escalation email subject */
function extractTitleFromSubject(subject: string): string | null {
  // Subject: "Re: [MCM Forge] Agent needs help: TASK TITLE"
  // or: "[MCM Forge] Agent needs help: TASK TITLE"
  const match = subject.match(/Agent needs help:\s*(.+)$/i);
  if (!match) return null;
  return match[1].trim();
}

/** Find task ID by title match (primary) or UUID in body (fallback) */
async function resolveTaskId(
  subject: string,
  bodyText: string,
  supabase: SupabaseClient,
  log: (level: string, msg: string) => void,
): Promise<string | null> {
  const title = extractTitleFromSubject(subject);

  // Strategy 1: Match by title + blocked status
  if (title) {
    const { data } = await supabase
      .from("task_queue")
      .select("id")
      .eq("status", "blocked")
      .eq("title", title)
      .order("updated_at", { ascending: false })
      .limit(1)
      .single();

    if (data?.id) return data.id;

    // Try ilike for slight formatting differences
    const { data: fuzzy } = await supabase
      .from("task_queue")
      .select("id")
      .eq("status", "blocked")
      .ilike("title", `%${title}%`)
      .order("updated_at", { ascending: false })
      .limit(1)
      .single();

    if (fuzzy?.id) return fuzzy.id;
  }

  // Strategy 2: UUID regex from quoted body (escalation email contains task ID)
  const uuidMatch = bodyText.match(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
  );
  if (uuidMatch) {
    const { data } = await supabase
      .from("task_queue")
      .select("id, status")
      .eq("id", uuidMatch[0])
      .single();

    if (data?.id) {
      log("info", `[email] Resolved task via UUID in body: ${data.id} (status: ${data.status})`);
      return data.id;
    }
  }

  return null;
}

// ── Main Entry Point ─────────────────────────────

export async function checkEscalationReplies(deps: EmailHandlerDeps): Promise<string[]> {
  const { supabase, log, sendTelegramAlert } = deps;
  const actions: string[] = [];

  try {
    // Get OAuth token
    const token = await getGoogleAccessToken(
      {
        googleClientId: deps.googleClientId,
        googleClientSecret: deps.googleClientSecret,
        googleRefreshToken: deps.googleRefreshToken,
      },
      log,
    );

    if (!token) return actions;

    // Search Gmail for unread replies to escalation emails
    const query =
      'subject:"[MCM Forge] Agent needs help" from:steve@linkschoice.com is:unread newer_than:7d';

    const messages = await listGmailMessages(token, query);

    // Check for scope issues (empty result on first call could be scope problem)
    if (messages.length === 0) {
      // Verify scope by making a simple API call
      const testRes = await fetch(
        "https://gmail.googleapis.com/gmail/v1/users/me/profile",
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (testRes.status === 403 && !scopeWarningLogged) {
        log(
          "warn",
          "[email] Gmail scope not authorized. Add gmail.modify scope to OAuth app and re-authorize dirtsyncapp@gmail.com.",
        );
        scopeWarningLogged = true;
      }
      return actions;
    }

    log("info", `[email] Found ${messages.length} unread escalation reply(ies)`);

    for (const msgRef of messages) {
      try {
        const message = await getGmailMessage(token, msgRef.id);
        if (!message) {
          log("warn", `[email] Could not fetch message ${msgRef.id}`);
          continue;
        }

        const subject = getHeader(message, "Subject");
        const fullBody = extractBody(message);
        const replyText = extractReplyText(fullBody);

        // Skip empty replies
        if (!replyText || replyText.length < 3) {
          log("warn", `[email] Empty reply for subject: ${subject}`);
          await markGmailMessageRead(token, msgRef.id);
          actions.push(`Skipped empty reply: ${subject.slice(0, 60)}`);
          continue;
        }

        // Find the task
        const taskId = await resolveTaskId(subject, fullBody, supabase, log);

        if (!taskId) {
          log("warn", `[email] No blocked task found for: ${subject}`);
          await markGmailMessageRead(token, msgRef.id);
          actions.push(`No task found: ${subject.slice(0, 60)}`);
          continue;
        }

        // Check current task status
        const { data: task } = await supabase
          .from("task_queue")
          .select("id, title, status, description")
          .eq("id", taskId)
          .single();

        if (!task) {
          await markGmailMessageRead(token, msgRef.id);
          actions.push(`Task ${taskId.slice(0, 8)} not found in DB`);
          continue;
        }

        if (task.status !== "blocked") {
          log("info", `[email] Task ${taskId.slice(0, 8)} already ${task.status}, skipping`);
          await markGmailMessageRead(token, msgRef.id);
          actions.push(`Already resolved: ${task.title?.slice(0, 50)}`);
          continue;
        }

        // Unblock the task: prepend Steve's instructions
        const dateStr = new Date().toISOString().slice(0, 10);
        const updatedDescription = `--- OWNER INSTRUCTIONS (received ${dateStr}) ---\n${replyText}\n--- END OWNER INSTRUCTIONS ---\n\n${task.description || ""}`;

        const { error: updateError } = await supabase
          .from("task_queue")
          .update({
            status: "todo",
            retry_count: 0,
            description: updatedDescription,
          })
          .eq("id", taskId);

        if (updateError) {
          log("warn", `[email] Failed to unblock task ${taskId.slice(0, 8)}: ${updateError.message}`);
          actions.push(`Update failed: ${task.title?.slice(0, 50)}`);
          continue;
        }

        // War room post
        await supabase.from("communication_log").insert({
          from_agent: "email-handler",
          to_agent: "all",
          channel: "war_room",
          message: `[EMAIL-REPLY] Steve unblocked: ${task.title}\nInstructions: ${replyText.slice(0, 200)}`,
          summary: `Email reply unblocked: ${task.title?.slice(0, 80)}`,
          task_id: taskId,
        });

        // Telegram notification
        await sendTelegramAlert(
          `Task *${task.title}* unblocked with your instructions — retrying`,
        );

        // Mark email as read
        await markGmailMessageRead(token, msgRef.id);

        log("info", `[email] Unblocked task ${taskId.slice(0, 8)}: ${task.title}`);
        actions.push(`Unblocked: ${task.title?.slice(0, 50)}`);
      } catch (msgErr) {
        log("warn", `[email] Error processing message ${msgRef.id}: ${msgErr}`);
        actions.push(`Error: ${msgRef.id.slice(0, 8)}`);
      }
    }
  } catch (err) {
    log("warn", `[email] Email handler failed: ${err}`);
  }

  return actions;
}
