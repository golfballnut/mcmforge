/**
 * Session Manager — v6 Dispatcher Core
 *
 * Manages persistent Claude sessions via the Agent SDK.
 * Sessions are keyed by persona:companyId and tracked in Supabase.
 * Falls back gracefully on any SDK error.
 */

import { query } from "@anthropic-ai/claude-agent-sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { type AgentPersona, sessionKey, PERSONAS } from "./agent-personas.js";

// ============================================
// Types
// ============================================

export interface AgentSession {
  dbId: string;               // agent_sessions row UUID
  sessionId: string;          // Claude SDK session UUID
  persona: string;
  companyId: string | null;
  status: "active" | "expired" | "error";
  createdAt: Date;
  lastUsedAt: Date;
  expiresAt: Date;
  taskCount: number;
}

export interface SessionResponse {
  success: boolean;
  output: string;
  sessionId: string;
  error?: string;
}

// ============================================
// Constants
// ============================================

const MAX_ACTIVE_SESSIONS = 4;
const SESSION_EXPIRY_BUFFER_MS = 30 * 60 * 1000; // Don't resume if <30min left

// ============================================
// Logging (matches dispatcher convention)
// ============================================

function log(level: string, msg: string, meta?: Record<string, unknown>) {
  const ts = new Date().toISOString();
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : "";
  console.log(`[${ts}] [session-mgr] [${level}] ${msg}${metaStr}`);
}

// ============================================
// SessionManager
// ============================================

export class SessionManager {
  private supabase: SupabaseClient;
  private activeLocks: Set<string> = new Set(); // session keys currently in use

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  /**
   * Get an existing active session or create a new one.
   * Returns null if we're at capacity and can't free a slot.
   */
  async getOrCreateSession(
    persona: AgentPersona,
    companyId: string | null,
  ): Promise<AgentSession | null> {
    const key = sessionKey(persona.name, companyId);

    // Check if this session key is currently locked (in-use by another task)
    if (this.activeLocks.has(key)) {
      log("info", `Session ${key} is locked, will create parallel session`);
      return this.createSession(persona, companyId);
    }

    // Look for existing active session in DB
    const { data: existing } = await this.supabase
      .from("agent_sessions")
      .select("*")
      .eq("agent_persona", persona.name)
      .eq("company_id", companyId)
      .eq("status", "active")
      .order("last_used_at", { ascending: false })
      .limit(1)
      .single();

    if (existing) {
      const session = this.rowToSession(existing);

      // Check if session is still valid
      if (this.isSessionValid(session, persona)) {
        log("info", `Resuming session ${key}`, {
          sessionId: session.sessionId,
          taskCount: session.taskCount,
        });
        return session;
      }

      // Expired — mark it
      await this.expireSession(session, "expired (age or task limit)");
    }

    // Create new session
    return this.createSession(persona, companyId);
  }

  /**
   * Send a prompt to a session. Handles resume vs new session automatically.
   * The workDir is used for --cwd but the SDK manages this internally.
   */
  async sendToSession(
    session: AgentSession,
    prompt: string,
    workDir: string,
    options?: { timeoutMs?: number },
  ): Promise<SessionResponse> {
    const key = sessionKey(session.persona, session.companyId);
    this.activeLocks.add(key);
    const timeoutMs = options?.timeoutMs || 30 * 60 * 1000;

    try {
      const result = await this.executeQuery(session, prompt, workDir, timeoutMs);

      // Update tracking
      session.taskCount++;
      session.lastUsedAt = new Date();
      session.sessionId = result.sessionId; // May change on first turn

      await this.supabase
        .from("agent_sessions")
        .update({
          session_id: result.sessionId,
          last_used_at: session.lastUsedAt.toISOString(),
          task_count: session.taskCount,
          current_task_id: null, // Clear after completion
        })
        .eq("id", session.dbId);

      return result;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      log("error", `Session send failed: ${errMsg}`, { key });

      // Mark session as errored
      await this.supabase
        .from("agent_sessions")
        .update({ status: "error", error_message: errMsg })
        .eq("id", session.dbId);

      return {
        success: false,
        output: "",
        sessionId: session.sessionId,
        error: `Session error: ${errMsg}`,
      };
    } finally {
      this.activeLocks.delete(key);
    }
  }

  /**
   * Mark a session as expired in the DB.
   */
  async expireSession(session: AgentSession, reason: string): Promise<void> {
    log("info", `Expiring session ${session.dbId}: ${reason}`);
    await this.supabase
      .from("agent_sessions")
      .update({ status: "expired", error_message: reason })
      .eq("id", session.dbId);
  }

  /**
   * Clean up all sessions past their expiry time.
   */
  async cleanupExpiredSessions(): Promise<number> {
    const now = new Date().toISOString();
    const { data } = await this.supabase
      .from("agent_sessions")
      .update({ status: "expired", error_message: "auto-expired by cleanup" })
      .eq("status", "active")
      .lt("expires_at", now)
      .select("id");

    const count = data?.length || 0;
    if (count > 0) {
      log("info", `Cleaned up ${count} expired sessions`);
    }
    return count;
  }

  /**
   * Get current active session count and status for health reporting.
   */
  async getSessionHealth(): Promise<{
    active: number;
    expired24h: number;
    errors24h: number;
    sessions: Array<{ persona: string; companyId: string | null; taskCount: number; ageMin: number }>;
  }> {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [activeRes, expiredRes, errorRes] = await Promise.all([
      this.supabase.from("agent_sessions").select("*").eq("status", "active"),
      this.supabase.from("agent_sessions").select("id", { count: "exact" }).eq("status", "expired").gte("created_at", oneDayAgo),
      this.supabase.from("agent_sessions").select("id", { count: "exact" }).eq("status", "error").gte("created_at", oneDayAgo),
    ]);

    const activeSessions = (activeRes.data || []).map((row: any) => ({
      persona: row.agent_persona,
      companyId: row.company_id,
      taskCount: row.task_count,
      ageMin: Math.round((Date.now() - new Date(row.created_at).getTime()) / 60000),
    }));

    return {
      active: activeSessions.length,
      expired24h: expiredRes.count || 0,
      errors24h: errorRes.count || 0,
      sessions: activeSessions,
    };
  }

  // ============================================
  // Private Methods
  // ============================================

  private async createSession(
    persona: AgentPersona,
    companyId: string | null,
  ): Promise<AgentSession | null> {
    // Check capacity
    const { count } = await this.supabase
      .from("agent_sessions")
      .select("id", { count: "exact" })
      .eq("status", "active");

    if ((count || 0) >= MAX_ACTIVE_SESSIONS) {
      // Try to free the least-recently-used non-COO session
      const freed = await this.freeLruSession();
      if (!freed) {
        log("warn", "At session capacity, cannot create new session");
        return null;
      }
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + persona.sessionDurationHours * 60 * 60 * 1000);

    const { data, error } = await this.supabase
      .from("agent_sessions")
      .insert({
        session_id: "pending", // Will be set after first SDK call
        agent_persona: persona.name,
        company_id: companyId,
        status: "active",
        created_at: now.toISOString(),
        last_used_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
        task_count: 0,
      })
      .select()
      .single();

    if (error || !data) {
      log("error", `Failed to create session row: ${error?.message}`);
      return null;
    }

    const key = sessionKey(persona.name, companyId);
    log("info", `Created new session ${key}`, { dbId: data.id });

    return this.rowToSession(data);
  }

  private async freeLruSession(): Promise<boolean> {
    // Find the oldest active non-COO session
    const { data } = await this.supabase
      .from("agent_sessions")
      .select("*")
      .eq("status", "active")
      .neq("agent_persona", "coo")
      .order("last_used_at", { ascending: true })
      .limit(1)
      .single();

    if (!data) return false;

    const session = this.rowToSession(data);
    const key = sessionKey(session.persona, session.companyId);

    // Don't free if currently locked
    if (this.activeLocks.has(key)) return false;

    await this.expireSession(session, "freed for capacity");
    return true;
  }

  private isSessionValid(session: AgentSession, persona: AgentPersona): boolean {
    const now = Date.now();

    // Check time-based expiry (with buffer)
    if (session.expiresAt.getTime() - now < SESSION_EXPIRY_BUFFER_MS) {
      return false;
    }

    // Check task count limit
    if (session.taskCount >= persona.maxTasksPerSession) {
      return false;
    }

    return true;
  }

  private async executeQuery(
    session: AgentSession,
    prompt: string,
    workDir: string,
    timeoutMs: number,
  ): Promise<SessionResponse> {
    let output = "";
    let resolvedSessionId = session.sessionId;

    const queryOptions: Record<string, unknown> = {
      model: "claude-sonnet-4-6",
      permissionMode: "bypassPermissions",
      cwd: workDir,
    };

    // Resume if this session has handled tasks before (has a real session ID)
    if (session.taskCount > 0 && session.sessionId !== "pending") {
      queryOptions.resume = session.sessionId;
    }

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Session query timeout")), timeoutMs)
    );

    const queryPromise = (async () => {
      const response = query({ prompt, options: queryOptions });

      for await (const message of response) {
        // Capture session ID from init message
        if (
          message.type === "system" &&
          (message as any).subtype === "init" &&
          (message as any).session_id
        ) {
          resolvedSessionId = (message as any).session_id;
        }

        // Capture assistant text output
        if (message.type === "assistant" && (message as any).message?.content) {
          const text = ((message as any).message.content as any[])
            .filter((b: any) => b.type === "text")
            .map((b: any) => b.text)
            .join("");
          output += text;
        }

        // Capture final result if present
        if ((message as any).result !== undefined) {
          output = String((message as any).result);
        }
      }
    })();

    await Promise.race([queryPromise, timeoutPromise]);

    return {
      success: true,
      output,
      sessionId: resolvedSessionId,
    };
  }

  private rowToSession(row: any): AgentSession {
    return {
      dbId: row.id,
      sessionId: row.session_id,
      persona: row.agent_persona,
      companyId: row.company_id,
      status: row.status,
      createdAt: new Date(row.created_at),
      lastUsedAt: new Date(row.last_used_at),
      expiresAt: new Date(row.expires_at),
      taskCount: row.task_count || 0,
    };
  }
}
