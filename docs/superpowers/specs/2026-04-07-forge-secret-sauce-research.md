# Forge Secret Sauce Research

**Author:** AI Ops Architecture Review
**Date:** 2026-04-07
**Status:** Internal critique -- not marketing material

---

## 1. Executive Summary

- **MCM Forge is a working agent orchestrator that does 80% of what Paperclip does, built from scratch in ~2 weeks.** The core loop (poll runs -> claim -> spawn CLI -> record results) is solid and battle-tested. Credit where due.
- **Agent memory is completely broken.** The FTS5 session-search system is disabled due to a Node version mismatch (session-search.ts, lines 7-11). Agents start every run with zero memory of prior work. This is the single biggest gap versus every competitor.
- **The orchestrator is a single point of failure running on one Mac Mini.** No durable execution, no crash recovery, no replay. If the process dies mid-run (which it did overnight Apr 7 per memory notes), orphaned runs sit until the reaper catches them 30 minutes later.
- **Cost tracking records data but doesn't use it.** Budget enforcement queries ALL cost_events on every run claim (run-executor.ts, lines 77-83) -- an O(n) scan that will degrade as data grows. No cost forecasting, no per-issue cost rollup, no alerting beyond auto-pause.
- **Multi-step workflows depend entirely on the CEO agent's prompt engineering.** There is no DAG, no state machine, no workflow definition. The CEO reads issues, creates subtasks, and hopes the next heartbeat picks them up. This is where Forge diverges most from production-grade frameworks.

---

## 2. Paperclip Analysis

### What Paperclip Got Right

1. **Org-chart-as-architecture.** Every agent reports to exactly one manager. Delegation flows down, escalation flows up. MCM Forge copies this pattern faithfully (agents table has `reports_to`), but Forge's CEO agent doesn't actually use the reporting chain programmatically -- it's just metadata.

2. **Heartbeat model.** Agents don't run continuously. They wake, check work, execute, exit. This is efficient for CLI-based agents that cost money per token. Forge implements this via polling (`runPollIntervalMs: 5000` in config.ts, line 36).

3. **Atomic checkout.** One agent owns one task at a time. Paperclip enforces this with 409 Conflict. Forge does the same with `execution_run_id` / `execution_locked_at` (issue-lifecycle.ts, lines 25-49). Good.

4. **Append-only audit trail.** Every decision is logged. Forge has `run_events` and `issue_comments` tables for this. The agent-api.ts creates comments on status changes (line 198).

5. **Goal ancestry.** Tasks trace back to company goals. Forge has a `goals` table but it's underused -- the `context_snapshot` passed to agents (run-executor.ts, line 151) doesn't include goal context.

### What Paperclip Got Wrong

1. **Monolithic server.** Paperclip runs everything on localhost:3100 -- web UI, API, orchestrator, all in one process. When it dies, everything dies. Forge inherited this pattern (the orchestrator is a single Node process on Mini).

2. **No cross-agent communication channel.** Agents talk through tickets only. There's no shared scratchpad, no event bus, no pub/sub. If Agent A needs a result from Agent B, it has to create a ticket, wait for a heartbeat, and poll for the result. Forge has the same limitation.

3. **Brittle session management.** Paperclip had issues with session IDs getting stale. Forge stores `session_id` on agents (run-executor.ts, lines 236-240) but the `clearSession` flag is always `false` in all three adapters -- sessions accumulate forever with no eviction policy.

### What to Steal

1. **Paperclip's `promptTemplate` with variable interpolation** -- Forge already has this via `renderTemplate()` in adapters.
2. **Goal ancestry injection** -- Paperclip injects the full goal chain into every prompt. Forge should do this.
3. **Cost forecasting** -- Paperclip shows projected monthly spend based on current burn rate. Forge only tracks actuals.

---

## 3. MCM Forge Critique

### What's Working

1. **Multi-CLI adapter pattern (claude.ts, gemini.ts, codex.ts).** Clean abstraction. All three adapters share the same interface (`CLIAdapter`), parse output consistently, and the registry pattern makes adding new CLIs trivial. The onboarding file injection (reading AGENTS.md, HEARTBEAT.md, SOUL.md, TOOLS.md from the agent directory) is a genuinely good idea.

2. **Agent API (agent-api.ts).** A clean localhost HTTP API that mirrors Paperclip's endpoints. Agents can self-serve: check inbox, create issues, update status, post comments. The `127.0.0.1` binding (line 275) is a smart security choice.

3. **Issue lifecycle management.** Atomic checkout via `execution_run_id` with optimistic locking (issue-lifecycle.ts, line 39: `.is('execution_run_id', null)`). QA handoff auto-creates subtasks (run-executor.ts, lines 358-451). Issue counter increment for identifiers (agent-api.ts, lines 225-239).

4. **Budget enforcement.** Per-agent monthly budgets with auto-pause (run-executor.ts, lines 72-94). This is a real guardrail that prevents runaway spend.

5. **Onboarding skills (SKILL.md files).** The company-onboarding and agent-onboarding skills are excellent. 7-step and 8-step mandatory procedures with checkpoints, consequences, and completion reports. This is better than Paperclip's docs.

### What's Broken

1. **Agent memory is a no-op.** `session-search.ts` is entirely stubbed out (lines 14-35). The `searchAgentHistory()` function returns an empty array. The `indexRunResult()` function does nothing. The code in run-executor.ts (lines 141-148) that builds `historyContext` from `searchAgentHistory()` always produces an empty string. **Every agent starts every run with amnesia.**

2. **Orphan reaper has contradictory constants.** `ORPHAN_THRESHOLD_MS` is set to 30 minutes (orphan-reaper.ts, line 5) with a comment saying "Opus runs can take 15+ min," but the error message on line 30 says "no update for 10 minutes." The reaper runs every 60 seconds (line 51) but the threshold is 30 minutes. A stuck run blocks its agent for 30 minutes before recovery.

3. **No retry logic.** When a run fails (run-executor.ts, line 289-306), the agent is set to `error` status and... that's it. No automatic retry. No exponential backoff. No dead-letter queue. The agent stays in `error` until someone manually intervenes. Compare this to Temporal where activities automatically retry with configurable backoff.

4. **Race condition in budget checking.** The budget check (run-executor.ts, lines 72-94) reads all cost_events, sums them in JavaScript, then decides whether to proceed. Between the read and the run execution, another run could start and exceed the budget. There's no database-level enforcement (e.g., a check constraint or a transaction).

5. **Run queue is FIFO with no priority.** `claimAndExecuteNextRun` (run-executor.ts, line 41-46) queries runs ordered by `created_at ASC`. There's no priority field on runs, no urgency weighting, no starvation prevention. A flood of low-priority routine runs will block high-priority bug fixes.

6. **No process cleanup on orchestrator crash.** If the Node process dies, `activeRuns` (an in-memory Map, line 12) is lost. Child processes (Claude/Gemini/Codex CLIs) may keep running as orphans on the OS. The orphan reaper only cleans up database state, not OS processes.

7. **`--yolo` flag on Gemini adapter.** gemini.ts line 40: `args.push('--yolo')`. This skips all permission checks. For a scout/research agent this might be acceptable, but the flag is hardcoded for ALL Gemini agents regardless of role.

### Gaps

1. **No workflow engine.** No DAG, no state machine, no conditional branching. Multi-step work requires the CEO to manually create subtasks and hope they execute in order. Compare to LangGraph's explicit graph-based state machines or Temporal's deterministic workflows.

2. **No inter-agent messaging.** Agents communicate only through Supabase issues/comments. There's no real-time channel, no event bus, no shared state. The "agent wire protocol" mentioned in memory (DirtSync/.claude/state/agent-wire.md) is a file-based hack, not a system feature.

3. **No rollback mechanism.** When an agent breaks something (pushes bad code, corrupts data), there's no system-level undo. Devin has fork/rollback built into its architecture. Forge has nothing.

4. **No approval workflow in the orchestrator.** The `approvals` table exists in the schema but there's no code that checks it before executing runs. The CEO's quality gate is purely prompt-based.

5. **No concurrency control across agents.** Two agents can work on the same file simultaneously (a documented problem per memory: `feedback_agent_file_conflicts.md`). The issue-level lock prevents two agents from claiming the same issue, but nothing prevents Agent A (on Issue 1) and Agent B (on Issue 2) from editing the same Swift file.

---

## 4. Industry Best Practices

### Communication

| Pattern | Used By | How It Works | MCM Forge Status |
|---------|---------|-------------|-----------------|
| Ticket-based | Paperclip, MCM Forge | Issues + comments in DB | Implemented |
| Shared conversation | AutoGen/AG2, CrewAI | Group chat with selector | Not implemented |
| Handoffs | OpenAI Agents SDK | Agent passes control + context to next agent | Not implemented |
| Agent-as-tool | OpenAI Agents SDK, LangGraph | One agent calls another as a function | Not implemented |
| Event bus | Temporal, LangGraph | Pub/sub for async coordination | Not implemented |
| Shared scratchpad | Devin | Shared workspace state visible to all agents | Partially (Supabase, but not used this way) |

**Recommendation:** Implement the agent-as-tool pattern. When the CEO needs the App Designer to produce a spec, it should be a synchronous subtask call that returns the result in the same session -- not an async ticket that requires another heartbeat cycle. This alone would cut multi-step workflow latency from hours to minutes.

### Memory

| Pattern | Used By | How It Works | MCM Forge Status |
|---------|---------|-------------|-----------------|
| FTS session search | MCM Forge (designed) | SQLite FTS5 index of past run results | Disabled (Node mismatch) |
| PARA memory files | Paperclip | Projects/Areas/Resources/Archive markdown files | Referenced in memory but not in orchestrator code |
| Conversation history | AutoGen/AG2 | Full message history persisted per conversation | Not implemented |
| Vector store RAG | LangGraph, CrewAI | Embeddings of past work for semantic search | Not implemented |
| Event history replay | Temporal | Full deterministic replay of workflow state | Not implemented |
| Session resume | Claude Agent SDK | Resume from session ID with full context | Implemented (claude.ts line 44) but unreliable |

**Recommendation:** Fix the FTS5 system (it's already written, just broken by a Node version mismatch). In parallel, implement a simpler fallback: query the last 3 runs for this agent from Supabase `runs` table (the data is already there -- `summary`, `result_json`). This requires zero new infrastructure.

### Multi-Step Workflows

| Pattern | Used By | How It Works | MCM Forge Status |
|---------|---------|-------------|-----------------|
| DAG execution | LangGraph | Explicit graph with nodes and edges | Not implemented |
| Sequential crew | CrewAI | Tasks execute in defined order | Not implemented |
| Durable workflow | Temporal | Workflow function with automatic state persistence | Not implemented |
| Parent-child issues | Paperclip, MCM Forge | Parent issue spawns subtasks | Implemented (parent_id on issues) |
| QA handoff | MCM Forge | Auto-create QA subtask on `in_review` | Implemented (run-executor.ts line 263) |

**Recommendation:** Don't build a full DAG engine. Instead, add an `issue_dependencies` table: `{issue_id, depends_on_issue_id}`. The run executor checks dependencies before claiming a run. This gives you ordered multi-step workflows without a workflow engine.

### Quality Gates

| Pattern | Used By | How It Works | MCM Forge Status |
|---------|---------|-------------|-----------------|
| CEO review loop | MCM Forge, Paperclip | Manager agent reviews output, sends back if B+ | Implemented (in CEO prompt) |
| Guardrails | OpenAI Agents SDK | Input/output validation runs in parallel with agent | Not implemented |
| Automated test gate | Devin | Build + test must pass before PR | In CEO prompt (line 88-89 of AGENTS.md) but not enforced by orchestrator |
| Approval workflow | MCM Forge (schema only) | Human approves before execution | Table exists, no code |

**Recommendation:** Wire up the `approvals` table. Before a run executes, check if the agent's role requires approval (e.g., anything that touches production, any spend over $5). Steve approves from the dashboard or phone. This is 2 hours of work and prevents the email-storm scenarios.

### Cost Tracking

| Pattern | Used By | How It Works | MCM Forge Status |
|---------|---------|-------------|-----------------|
| Per-run cost recording | MCM Forge | cost_events table with tokens + cost_cents | Implemented |
| Budget enforcement | MCM Forge, Paperclip | Auto-pause agent at monthly limit | Implemented |
| Cost forecasting | Paperclip | Project remaining spend based on burn rate | Not implemented |
| Per-issue cost rollup | (best practice) | Total cost to resolve an issue across all runs | Data exists (issue_id in cost_events) but no rollup query |
| Cost alerts | (best practice) | Notify when spend rate spikes | Not implemented |

**Recommendation:** Add a materialized view or scheduled query: `SELECT issue_id, SUM(cost_cents) FROM cost_events GROUP BY issue_id`. Surface this on the dashboard. Steve should know "fixing the nav bug cost $4.37 across 6 runs."

### Recovery

| Pattern | Used By | How It Works | MCM Forge Status |
|---------|---------|-------------|-----------------|
| Automatic retry | Temporal, LangGraph | Failed activities retry with backoff | Not implemented |
| Fork/rollback | Devin | Branch off or revert to prior state | Not implemented |
| Orphan reaping | MCM Forge | Kill runs with no heartbeat for 30 min | Implemented |
| OS process cleanup | (required) | Kill child processes on crash | Not implemented |
| Graceful shutdown | (required) | SIGTERM handler that waits for active runs | Not implemented -- process death leaves orphans |

**Recommendation:** Add a SIGTERM handler that sets a `shuttingDown` flag, stops claiming new runs, and waits for active runs to finish (with a timeout). On startup, scan for OS processes matching `FORGE_RUN_ID` env var and kill them before claiming new runs.

---

## 5. Top 10 Recommendations

### 1. Fix Agent Memory (Impact: Critical)
**What:** Restore the FTS5 session search OR implement a Supabase-based fallback that queries the last N runs for each agent.
**Why:** Agents with amnesia repeat mistakes, ask questions already answered, and waste tokens re-discovering context. This is the #1 complaint in the memory files (`feedback_agent_learning_gap.md`).
**How:** Option A: Fix the Node version mismatch on Mini (align PM2 and better-sqlite3). Option B: Replace `searchAgentHistory()` with a Supabase query: `SELECT summary FROM runs WHERE agent_id = $1 AND status = 'succeeded' ORDER BY finished_at DESC LIMIT 3`. Inject results into the prompt the same way the FTS5 code already does (run-executor.ts lines 141-148).
**Effort:** 2-4 hours.

### 2. Add Graceful Shutdown + Process Cleanup (Impact: High)
**What:** Handle SIGTERM/SIGINT. On startup, kill orphaned OS processes. On shutdown, wait for active runs.
**Why:** The orchestrator died overnight Apr 7. CLI processes kept running. The orphan reaper only cleans DB state, not OS processes. This causes wasted spend and potential git conflicts.
**How:** Add `process.on('SIGTERM', ...)` handler. On startup, use `ps aux | grep FORGE_RUN_ID` to find orphans. Track PIDs in `activeRuns` Map (already done) and send SIGTERM to each on shutdown.
**Effort:** 3-4 hours.

### 3. Add Run Priority Queue (Impact: High)
**What:** Add a `priority` column to `runs` table. Sort claim query by priority DESC, then created_at ASC.
**Why:** Currently a flood of routine heartbeats blocks urgent bug fixes. The run queue is pure FIFO (run-executor.ts line 45).
**How:** `ALTER TABLE forge.runs ADD COLUMN priority INT DEFAULT 0`. Update `claimAndExecuteNextRun` query. Set priority based on issue priority when creating wakeups.
**Effort:** 1-2 hours.

### 4. Implement Simple Retry with Backoff (Impact: High)
**What:** When a run fails, re-queue it with `retry_count + 1` up to a max (3). Add exponential delay before retry.
**Why:** Transient failures (network timeouts, rate limits, Claude auth issues) currently require manual intervention. The agent goes to `error` status and stays there.
**How:** Add `retry_count` and `max_retries` columns to `runs`. In the catch block of `executeRun` (run-executor.ts line 289), if `retry_count < max_retries`, insert a new queued run with incremented count and a `not_before` timestamp.
**Effort:** 3-4 hours.

### 5. Wire Up Approvals Table (Impact: High)
**What:** Before executing a run, check if the agent/action requires human approval. If so, create an approval request and don't execute until approved.
**Why:** Prevents email storms, unauthorized pushes, budget overruns. The `approvals` table already exists in the schema but has zero code referencing it.
**How:** Add an `approval_required` field to agent config. In `claimAndExecuteNextRun`, check this field. If true, create an approval row and skip execution. Add a dashboard page to approve/reject. On approval, re-queue the run.
**Effort:** 4-6 hours.

### 6. Inject Goal Context into Agent Prompts (Impact: Medium)
**What:** When building the prompt for an agent, query the goal chain (company goal -> project goal -> issue) and prepend it.
**Why:** Agents make locally optimal but globally wrong decisions because they don't know the north star. Paperclip does this with "goal ancestry."
**How:** In `executeRun` (run-executor.ts), query `forge.goals` for the company and project, add to `contextWithHistory`. This is 20 lines of code.
**Effort:** 1-2 hours.

### 7. Fix the Orphan Reaper Threshold Bug (Impact: Medium)
**What:** Align the threshold constant, the comment, and the error message in orphan-reaper.ts.
**Why:** The constant is 30 min (line 5), the comment says "Opus runs can take 15+ min," and the error says "10 minutes" (line 30). This causes confusion and potentially premature or late reaping.
**How:** Pick one value (20 minutes is reasonable for Opus), update the constant, comment, and error message to match. Add the threshold to ForgeConfig so it's configurable.
**Effort:** 15 minutes.

### 8. Add Issue Dependencies for Ordered Workflows (Impact: Medium)
**What:** Create `forge.issue_dependencies (issue_id, depends_on_issue_id)`. The run executor skips issues whose dependencies aren't `done`.
**Why:** Currently multi-step work relies on the CEO manually sequencing subtasks. With dependencies, the orchestrator enforces execution order automatically.
**How:** New table, one new query in `checkAssignedIssues` (run-executor.ts line 313), and teach the CEO agent to set dependencies when creating subtasks.
**Effort:** 4-6 hours.

### 9. Budget Check Optimization (Impact: Medium)
**What:** Replace the per-run JavaScript sum of all cost_events with a materialized monthly spend column on the agents table, updated by a Supabase trigger.
**Why:** The current approach (run-executor.ts lines 77-83) reads ALL cost events for the agent every time a run is claimed. At 50 runs/day this will become slow within a month.
**How:** Add `current_month_spend_cents` to `forge.agents`. Create a Supabase trigger on `cost_events` INSERT that increments the agent's counter. Reset all counters on the 1st of each month.
**Effort:** 2-3 hours.

### 10. Remove Hardcoded `--yolo` from Gemini Adapter (Impact: Low but Important)
**What:** Make the `--yolo` flag configurable per-agent via `adapter_config`, not hardcoded.
**Why:** `--yolo` skips all permission checks (gemini.ts line 40). Acceptable for a scout agent reading docs, dangerous for an agent that writes code or modifies files. Currently ALL Gemini agents run with no guardrails.
**How:** Check `config.yolo` or `config.autoApprove` in the adapter. Default to false. Set to true only for scout-role agents in their DB config.
**Effort:** 30 minutes.

---

## 6. Quick Wins (Implementable Today)

| # | What | File | Effort | Impact |
|---|------|------|--------|--------|
| 1 | Fix orphan reaper message mismatch | orphan-reaper.ts:5,30 | 15 min | Clarity |
| 2 | Make `--yolo` configurable | gemini.ts:40 | 30 min | Security |
| 3 | Add Supabase-based agent memory fallback | run-executor.ts:141 | 2 hrs | Critical -- agents stop having amnesia |
| 4 | Add run priority column + sort | run-executor.ts:45 | 1 hr | Urgent issues get processed first |
| 5 | Inject goal context into prompts | run-executor.ts:151 | 1 hr | Agents know WHY they're working |
| 6 | Add SIGTERM handler | main entry point | 1 hr | Clean shutdown, no orphan processes |
| 7 | Per-issue cost rollup dashboard query | Dashboard SQL | 1 hr | Steve sees cost per bug fix |

**Total: ~7 hours for all quick wins.** These should be a single day's work.

---

## 7. Strategic Bets (Need Planning First)

### A. Agent-as-Tool Pattern (Synchronous Subtasks)
**Vision:** When the CEO creates a subtask, it can optionally execute synchronously within the CEO's session -- the CEO "calls" the App Designer as a tool and gets the result back immediately instead of waiting for the next heartbeat cycle.
**Why:** Current async-only delegation means a 3-step workflow (CEO -> Designer -> Builder) takes 3 heartbeat cycles minimum (15-90 minutes). Synchronous subtasks could do it in one session.
**Risk:** Increases session duration and cost for the parent agent. Needs turn budget management.
**Prerequisite:** Claude Agent SDK integration (which basically IS this pattern -- Claude Code as a library).

### B. Temporal.io for Durable Execution
**Vision:** Replace the polling loop with Temporal workflows. Each issue becomes a workflow. Each agent run becomes an activity. Temporal handles retry, timeout, replay, and crash recovery automatically.
**Why:** The current single-process polling loop is the weakest part of the architecture. Temporal solves orphan reaping, retry, graceful shutdown, and crash recovery in one move.
**Risk:** Significant infrastructure change. Temporal Server is another process to run. Learning curve.
**Prerequisite:** Evaluate whether the Mac Mini can run Temporal Server alongside 3 CLI agents.

### C. Event-Driven Agent Coordination
**Vision:** Replace Supabase polling with real-time subscriptions (Supabase Realtime or a lightweight Redis pub/sub). When an issue status changes, subscribed agents are notified immediately.
**Why:** The current 5-second polling interval (config.ts line 36) means up to 5 seconds of latency on every state change. For a 10-step workflow, that's 50 seconds of pure waste.
**Risk:** Supabase Realtime has reliability issues at scale. Redis adds infrastructure.
**Prerequisite:** Benchmark Supabase Realtime stability on Mini.

### D. Shared Workspace Isolation
**Vision:** Each agent run gets its own git worktree. Agents can't stomp on each other's files. The orchestrator merges worktrees after successful runs.
**Why:** `feedback_agent_file_conflicts.md` documents the problem: "Multiple agents on same file revert each other." The `worktreeParentDir` config exists (config.ts line 40) but there's no worktree management code.
**Risk:** Git worktree management is complex. Merge conflicts need automated resolution.
**Prerequisite:** Design the worktree lifecycle (create on run start, merge or discard on run end).

### E. Vector-Based Agent Memory
**Vision:** Embed all run results (summaries, code diffs, comments) into a vector store. Agents get RAG-based context: "here are the 3 most relevant past experiences for this task."
**Why:** FTS5 is keyword-based. Semantic search finds relevant past work even when the terminology differs.
**Risk:** Embedding costs, vector DB infrastructure, retrieval quality tuning.
**Prerequisite:** Fix the basic memory system first (Recommendation #1). Vector search is an upgrade, not a replacement.

---

## 8. Sources

### Paperclip
- [Paperclip GitHub](https://github.com/paperclipai/paperclip)
- [Paperclip Homepage](https://paperclip.ing/)
- [Paperclip Core Concepts](https://github.com/paperclipai/paperclip/blob/master/docs/start/core-concepts.md)
- [Paperclip Explained (Towards AI)](https://pub.towardsai.net/paperclip-the-open-source-operating-system-for-zero-human-companies-2c16f3f22182)
- [Build Multi-Agent Company with Paperclip (MindStudio)](https://www.mindstudio.ai/blog/build-multi-agent-company-paperclip-claude-code)
- [Paperclip Tutorial (Marketing Agent Blog)](https://marketingagent.blog/2026/03/16/tutorial-ai-agent-orchestration-with-paperclip/)

### CrewAI
- [CrewAI GitHub](https://github.com/crewAIInc/crewAI)
- [CrewAI Homepage](https://crewai.com/)
- [CrewAI Open Source](https://crewai.com/open-source)
- [CrewAI Multi-Agent Framework Review](https://www.decisioncrafters.com/crewai-multi-agent-orchestration/)

### AutoGen / AG2
- [AutoGen GitHub (Microsoft)](https://github.com/microsoft/autogen)
- [AG2 GitHub](https://github.com/ag2ai/ag2)
- [AutoGen (Microsoft Research)](https://www.microsoft.com/en-us/research/project/autogen/)
- [Microsoft Agent Framework GA Strategy](https://jangwook.net/en/blog/en/microsoft-agent-framework-ga-production-strategy/)

### LangGraph
- [LangGraph Homepage](https://www.langchain.com/langgraph)
- [LangGraph Workflows & Agents Docs](https://docs.langchain.com/oss/python/langgraph/workflows-agents)
- [LangGraph GitHub](https://github.com/langchain-ai/langgraph)
- [Agentic AI with LangGraph 2026](https://adspyder.io/blog/agentic-ai-with-langgraph/)

### Devin / Cognition
- [Devin 2.0 (Cognition)](https://cognition.ai/blog/devin-2)
- [Devin AI Guide 2026](https://aitoolsdevpro.com/ai-tools/devin-guide/)
- [Devin Review 2026](https://vibecoding.app/blog/devin-review)
- [Devin Complete Guide (Digital Applied)](https://www.digitalapplied.com/blog/devin-ai-autonomous-coding-complete-guide)

### Claude Agent SDK
- [Claude Agent SDK Overview (Anthropic Docs)](https://platform.claude.com/docs/en/agent-sdk/overview)
- [Claude Agent SDK Quickstart](https://platform.claude.com/docs/en/agent-sdk/quickstart)
- [Building Agents with Claude Agent SDK (Anthropic Engineering)](https://www.anthropic.com/engineering/building-agents-with-the-claude-agent-sdk)
- [Claude Agent SDK NPM](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk)
- [Claude Agent SDK Python (GitHub)](https://github.com/anthropics/claude-agent-sdk-python)

### OpenAI Agents SDK
- [OpenAI Agents SDK Docs](https://openai.github.io/openai-agents-python/)
- [Agent Orchestration (OpenAI)](https://openai.github.io/openai-agents-python/multi_agent/)
- [New Tools for Building Agents (OpenAI Blog)](https://openai.com/index/new-tools-for-building-agents/)
- [Multi-Agent Portfolio Collaboration (OpenAI Cookbook)](https://developers.openai.com/cookbook/examples/agents_sdk/multi-agent-portfolio-collaboration/multi_agent_portfolio_collaboration)

### Temporal.io
- [Temporal Homepage](https://temporal.io/)
- [Temporal + AI Agents (IntuitionLabs)](https://intuitionlabs.ai/articles/agentic-ai-temporal-orchestration/)
- [Temporal Multi-Agent Architecture](https://temporal.io/blog/using-multi-agent-architectures-with-temporal)
- [Orchestrating Ambient Agents with Temporal](https://temporal.io/blog/orchestrating-ambient-agents-with-temporal)
- [Temporal for AI](https://temporal.io/solutions/ai)

### Framework Comparisons
- [Best Multi-Agent Frameworks 2026 (GuruSup)](https://gurusup.com/blog/best-multi-agent-frameworks-2026)
- [AI Agent Orchestration Frameworks 2026 (Catalyst & Code)](https://www.catalystandcode.com/blog/ai-agent-orchestration-frameworks)
- [AI Agent Frameworks: 8 SDKs (Morph)](https://www.morphllm.com/ai-agent-framework)
- [LangGraph vs CrewAI vs AutoGen 2026 (DEV Community)](https://dev.to/pockit_tools/langgraph-vs-crewai-vs-autogen-the-complete-multi-agent-ai-orchestration-guide-for-2026-2d63)

---

## 9. Plugin Architecture: What Forge Should Steal

### The Problem

Forge has **zero extensibility points**. Every new capability requires editing core files:

- New CLI? Edit `adapters/registry.ts` (hardcoded map, line 6-10)
- New loop? Edit `index.ts` (explicit import + `Promise.all`, lines 31-37)
- New behavior before/after a run? Edit `run-executor.ts` inline
- New quality gate? Edit the CEO's prompt and hope

Compare to what the industry offers:

| Framework | Extension Model | How Plugins Work |
|-----------|----------------|-----------------|
| CrewAI | Tools + Custom Agents | Drop-in tool classes, agent callbacks |
| LangGraph | Nodes + Edges | Any function becomes a graph node |
| Temporal | Activities + Interceptors | Activity = any async function. Interceptors = middleware for all calls |
| OpenAI Agents SDK | Tools + Handoffs + Guardrails | Agents are tools for other agents. Guardrails run in parallel |
| Claude Agent SDK | Tools + Subagents | Any function or subprocess becomes a callable tool |

Forge has none of this. Everything is welded shut.

### The Fix: Lifecycle Hooks + Plugin Registry

Don't build a full plugin framework. Build **three extension points** that cover 90% of needs:

#### Extension Point 1: Run Lifecycle Hooks

```typescript
// forge-orchestrator/src/plugins/types.ts
export interface ForgePlugin {
  name: string;

  // Called before adapter.execute() — can modify prompt, block execution, or inject context
  beforeRun?(ctx: RunContext): Promise<RunContext | 'skip'>;

  // Called after adapter.execute() — can transform results, trigger side effects
  afterRun?(ctx: RunContext, result: AdapterExecuteResult): Promise<AdapterExecuteResult>;

  // Called when a run fails — can decide retry, escalate, or ignore
  onRunError?(ctx: RunContext, error: Error): Promise<'retry' | 'escalate' | 'ignore'>;

  // Called on orchestrator startup — register routes, start services
  onInit?(config: ForgeConfig, supabase: SupabaseClient): Promise<void>;
}
```

**Where it hooks in:** `run-executor.ts` currently has one monolithic `executeRun()` function (lines 96-310). Split it into `beforeRun → execute → afterRun` with plugin calls between each phase.

**What this enables without touching core code:**
- Memory injection (beforeRun reads past runs, injects into context)
- Approval gates (beforeRun checks approvals table, returns 'skip' if not approved)
- Cost alerts (afterRun checks spend, sends Slack/email if threshold crossed)
- Retry logic (onRunError decides based on error type)
- Goal context injection (beforeRun queries goals table)

#### Extension Point 2: Adapter Registry (Dynamic)

```typescript
// forge-orchestrator/src/adapters/registry.ts (proposed)
const adapters: Map<string, CLIAdapter> = new Map();

export function registerAdapter(adapter: CLIAdapter): void {
  adapters.set(adapter.type, adapter);
}

export function getAdapter(type: string): CLIAdapter {
  const adapter = adapters.get(type);
  if (!adapter) throw new Error(`Unknown adapter: ${type}. Available: ${[...adapters.keys()]}`);
  return adapter;
}

// Built-ins registered at startup, but new ones can be added by plugins
registerAdapter(claudeAdapter);
registerAdapter(geminiAdapter);
registerAdapter(codexAdapter);
```

**What this enables:** A plugin can call `registerAdapter()` during `onInit` to add support for new CLIs (Cursor, Windsurf, Aider, local Ollama) without editing core files.

#### Extension Point 3: Event Bus (Lightweight)

```typescript
// forge-orchestrator/src/plugins/events.ts
type ForgeEvent =
  | { type: 'run:started'; runId: string; agentId: string }
  | { type: 'run:completed'; runId: string; result: 'success' | 'failure' }
  | { type: 'run:error'; runId: string; error: string }
  | { type: 'issue:status_changed'; issueId: string; from: string; to: string }
  | { type: 'budget:threshold'; agentId: string; percentUsed: number }
  | { type: 'agent:idle'; agentId: string; idleSince: Date };

const listeners: Map<string, Array<(event: ForgeEvent) => Promise<void>>> = new Map();

export function on(eventType: string, handler: (event: ForgeEvent) => Promise<void>): void { ... }
export function emit(event: ForgeEvent): Promise<void> { ... }
```

**What this enables:** Decoupled reactions. The dashboard can subscribe to `run:completed` for live updates. A Slack notifier can subscribe to `run:error`. A cost monitor can subscribe to `budget:threshold`. None of them need to know about each other.

---

### 10 Plugins to Build (Ranked by Impact)

#### Plugin 1: `memory-injector` — Fix Agent Amnesia
**What:** `beforeRun` hook queries last 3-5 successful runs for the agent from Supabase, formats summaries, injects into the prompt context.
**Why:** This is the #1 gap. Agents repeat mistakes. Every competitor has memory. This plugin replaces the broken FTS5 system with zero new infrastructure.
**How:** Query `forge.runs WHERE agent_id = $1 AND status = 'succeeded' ORDER BY finished_at DESC LIMIT 5`. Format as "## Prior Work\n{summaries}". Prepend to `ctx.bootstrapPrompt`.
**Effort:** 2 hours.
**Files touched:** New file only — `forge-orchestrator/src/plugins/memory-injector.ts`.

#### Plugin 2: `approval-gate` — Wire Up the Approvals Table
**What:** `beforeRun` hook checks if the agent's role or the issue's priority requires human approval. If approval is pending or missing, returns `'skip'`.
**Why:** The `forge.approvals` table exists but has zero code referencing it. This is a safety net that prevents email storms, unauthorized pushes, and budget overruns.
**How:** Check `agent.adapter_config.requiresApproval` or issue priority >= `critical`. If true, query `forge.approvals WHERE run_id = $1 AND status = 'approved'`. If not found, create an approval request and return `'skip'`.
**Effort:** 3 hours.
**Files touched:** New file only — `forge-orchestrator/src/plugins/approval-gate.ts`. Dashboard needs an approve/reject UI (separate work).

#### Plugin 3: `retry-engine` — Automatic Retry with Backoff
**What:** `onRunError` hook classifies the error (transient vs permanent), re-queues with exponential backoff for transient failures, escalates permanent ones to the manager agent.
**Why:** Currently a failed run sets agent to `error` and stops (run-executor.ts line 289). Auth timeouts, rate limits, and network blips shouldn't require Steve to intervene.
**How:** Parse error message for known transient patterns (`ECONNRESET`, `rate_limit`, `auth.*expired`, `timeout`). If transient and `retry_count < 3`, insert new run with `not_before = now + (2^retry_count * 30s)`. If permanent, create an issue comment tagging the manager.
**Effort:** 3 hours.
**Files touched:** New file — `forge-orchestrator/src/plugins/retry-engine.ts`. Requires `retry_count` and `not_before` columns on `forge.runs`.

#### Plugin 4: `goal-context` — Inject Goal Ancestry
**What:** `beforeRun` hook queries the goal chain (company goal → project goal → issue) and prepends "## Mission Context" to the prompt.
**Why:** Agents make locally optimal but globally wrong decisions. Paperclip does this. The `forge.goals` table exists but `context_snapshot` in run-executor.ts (line 151) doesn't include goals.
**How:** Query `forge.goals WHERE company_id = $1`, format as mission statement. Query project-level goals if issue has a `project_id`. 20 lines.
**Effort:** 1 hour.
**Files touched:** New file only — `forge-orchestrator/src/plugins/goal-context.ts`.

#### Plugin 5: `cost-monitor` — Real-Time Spend Alerts
**What:** `afterRun` hook calculates cumulative spend, emits `budget:threshold` events at 50%, 75%, 90%. Optionally sends a Slack webhook or creates a dashboard notification.
**Why:** Budget enforcement only auto-pauses at 100% (run-executor.ts line 88). By then the money is spent. Early warnings let Steve adjust before hitting the ceiling.
**How:** After each run, query `SUM(cost_cents) FROM cost_events WHERE agent_id = $1 AND month = current`. Compare to agent's `monthly_budget_usd * 100`. Emit event at thresholds.
**Effort:** 2 hours.
**Files touched:** New file — `forge-orchestrator/src/plugins/cost-monitor.ts`.

#### Plugin 6: `slack-notifier` — Push Notifications to Steve's Phone
**What:** Event bus listener that forwards selected events (`run:error`, `budget:threshold`, `issue:status_changed` to `done`) to a Slack webhook.
**Why:** Steve manages from his phone. The dashboard is pull-based — he has to check it. Push notifications for critical events close the feedback loop.
**How:** Subscribe to events, format as Slack blocks, POST to webhook URL from env. Filter by severity to avoid noise.
**Effort:** 2 hours.
**Files touched:** New file — `forge-orchestrator/src/plugins/slack-notifier.ts`.

#### Plugin 7: `git-worktree-isolator` — Per-Agent Branch Isolation
**What:** `beforeRun` hook creates a git worktree for the agent's run. `afterRun` hook checks for changes — if clean, delete worktree; if dirty, leave for review.
**Why:** `feedback_agent_file_conflicts.md`: "Multiple agents on same file revert each other." The `worktreeParentDir` config exists (config.ts line 40) but there's no worktree management code.
**How:** `git worktree add /tmp/forge-worktrees/{runId} -b forge/{runId}`. Set `ctx.cwd` to worktree path. On completion, check `git diff --stat`. If clean, `git worktree remove`. If dirty, log for manual merge.
**Effort:** 4 hours.
**Files touched:** New file — `forge-orchestrator/src/plugins/git-worktree-isolator.ts`.

#### Plugin 8: `dependency-gate` — Issue Ordering Without a DAG Engine
**What:** `beforeRun` hook checks if the issue has unresolved dependencies. If any dependency is not `done`, returns `'skip'`.
**Why:** Multi-step workflows (CEO → Designer → Builder) currently rely on prompt engineering and timing. Dependencies make ordering explicit and automatic.
**How:** New table `forge.issue_dependencies(issue_id, depends_on_issue_id)`. Query in `beforeRun`: if any dependency is not `done`, skip. CEO agent taught to set dependencies when creating subtasks.
**Effort:** 4 hours.
**Files touched:** New file — `forge-orchestrator/src/plugins/dependency-gate.ts`. Requires new Supabase table.

#### Plugin 9: `adapter-aider` — Add Aider as a Fourth CLI
**What:** New adapter that wraps [Aider](https://aider.chat) for focused code editing tasks. Registers via `registerAdapter()` during `onInit`.
**Why:** Aider excels at single-file edits with its diff-based approach. Cheaper than Opus for targeted fixes. Gives the orchestrator a fourth tool in the box.
**How:** Implement `CLIAdapter` interface. Aider's CLI: `aider --yes --message "{prompt}" --model sonnet`. Parse output for token usage and cost.
**Effort:** 3 hours.
**Files touched:** New file — `forge-orchestrator/src/adapters/aider.ts` + registration in plugin.

#### Plugin 10: `run-dashboard-events` — Live Dashboard via SSE
**What:** `onInit` registers a Server-Sent Events endpoint at `/events`. Event bus forwards all events to connected dashboard clients. Dashboard gets live updates without polling.
**Why:** The Next.js dashboard currently has no real-time updates. It polls Supabase directly. SSE from the orchestrator gives instant feedback on run starts, completions, errors.
**How:** Add SSE endpoint to agent-api.ts (or separate port). Subscribe to all event bus events. Dashboard connects with `EventSource('/events')`. Fallback to polling if SSE disconnects.
**Effort:** 3 hours.
**Files touched:** New file — `forge-orchestrator/src/plugins/dashboard-events.ts`. Dashboard needs client-side SSE integration (separate work).

---

### Plugin Loading: Keep It Simple

Don't build a dynamic plugin discovery system. Forge runs on one Mac Mini for one user. A simple explicit registration in `index.ts` is fine:

```typescript
// forge-orchestrator/src/index.ts (proposed addition)
import { registerPlugin } from './plugins/registry.js';
import { memoryInjector } from './plugins/memory-injector.js';
import { approvalGate } from './plugins/approval-gate.js';
import { retryEngine } from './plugins/retry-engine.js';
import { goalContext } from './plugins/goal-context.js';
import { costMonitor } from './plugins/cost-monitor.js';

// Register plugins (order matters — first beforeRun wins on 'skip')
registerPlugin(approvalGate);
registerPlugin(memoryInjector);
registerPlugin(goalContext);
registerPlugin(costMonitor);
registerPlugin(retryEngine);
```

**Why not dynamic?** Because:
1. It's one machine, one operator. You don't need npm-style plugin discovery.
2. Explicit imports mean TypeScript catches errors at compile time.
3. Plugin order matters (approval gate must run before memory injection). Explicit is safer.
4. If you ever need dynamic loading, the `ForgePlugin` interface makes it trivial to add later.

### Implementation Priority

```
Week 1 (ship today):  memory-injector + goal-context + cost-monitor
Week 2 (high value):  approval-gate + retry-engine + slack-notifier
Week 3 (isolation):   git-worktree-isolator + dependency-gate
Week 4 (nice-to-have): adapter-aider + dashboard-events
```

Total estimated effort: ~27 hours across all 10 plugins. The plugin framework itself (types + registry + event bus) is maybe 3 hours.

### What NOT to Build

- **No npm plugin ecosystem.** You're not building for other teams. Plugins are just TypeScript files in `src/plugins/`.
- **No plugin config UI.** Plugins are enabled/disabled by commenting out the `registerPlugin()` line. Done.
- **No plugin sandboxing.** Plugins run in-process. They can crash the orchestrator. That's fine — if you can't trust your own plugins on your own Mini, you have bigger problems.
- **No versioned plugin API.** The `ForgePlugin` interface will change. That's fine. Update all plugins when it does. You own all of them.
