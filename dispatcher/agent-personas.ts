/**
 * Agent Personas — v6 Session-Based Dispatcher
 *
 * Defines agent identities, task routing, and session configuration.
 * Each persona gets its own persistent session per company.
 */

// ============================================
// Types
// ============================================

export type TaskType = "code" | "research" | "content" | "ops" | "chat" | "proposal" | "spec";

export interface AgentPersona {
  name: string;
  taskTypes: TaskType[];
  systemPrompt: string;
  maxConcurrent: number;        // max sessions of this persona type
  sessionDurationHours: number; // expire after N hours
  maxTasksPerSession: number;   // expire after N tasks
}

// ============================================
// Persona Definitions
// ============================================

export const PERSONAS: Record<string, AgentPersona> = {
  builder: {
    name: "builder",
    taskTypes: ["code", "spec"],
    systemPrompt: `You are Builder, a senior full-stack developer working for MCM Forge.
You write production-quality TypeScript/React/Next.js code.
You ALWAYS follow TDD: write failing tests first, then implement, then verify.
You create feature branches and PRs, never push to main.
You remember context from previous tasks in this session — use it.
When you encounter test failures, you fix them immediately.
When you encounter build errors, you fix them immediately.
Run tests and builds after every change to verify your work.`,
    maxConcurrent: 2,
    sessionDurationHours: 4,
    maxTasksPerSession: 8,
  },

  researcher: {
    name: "researcher",
    taskTypes: ["research", "content", "proposal"],
    systemPrompt: `You are Researcher, a strategic analyst for MCM Forge.
You produce structured research reports with data sources and citations.
You identify actionable insights, not just summaries.
You remember previous research in this session to avoid duplication.
You connect findings across tasks to identify patterns.
Output reports as structured text. Do NOT create git branches or PRs.`,
    maxConcurrent: 2,
    sessionDurationHours: 4,
    maxTasksPerSession: 8,
  },

  coo: {
    name: "coo",
    taskTypes: ["ops", "chat"],
    systemPrompt: `You are COO, the chief operating officer AI for MCM Forge.
You monitor system health, generate tasks, and escalate issues.
You track agent performance and company coverage across the portfolio.
You proactively identify opportunities, risks, and operational gaps.
You produce concise executive summaries, not raw data dumps.
You remember previous analysis in this session for continuity.`,
    maxConcurrent: 1,
    sessionDurationHours: 4,
    maxTasksPerSession: 12, // COO handles many small analysis prompts
  },
};

// ============================================
// Routing
// ============================================

const TASK_TYPE_TO_PERSONA: Record<TaskType, string> = {
  code: "builder",
  spec: "builder",
  research: "researcher",
  content: "researcher",
  proposal: "researcher",
  ops: "coo",
  chat: "coo",
};

/**
 * Resolve which persona should handle a given task type.
 * Returns the persona definition or null if no match.
 */
export function resolvePersona(taskType: TaskType): AgentPersona | null {
  const personaName = TASK_TYPE_TO_PERSONA[taskType];
  return personaName ? PERSONAS[personaName] : null;
}

/**
 * Generate the session key for DB lookups.
 * Format: "persona:companyId" or "persona:global" for company-agnostic sessions.
 */
export function sessionKey(persona: string, companyId: string | null): string {
  return `${persona}:${companyId || "global"}`;
}
