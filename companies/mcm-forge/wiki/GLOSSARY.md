# MCM Forge Glossary

| Term | Definition |
|------|-----------|
| **Run** | One CLI invocation by the orchestrator. Has a lifecycle: queued -> running -> succeeded/failed/cancelled. |
| **Heartbeat** | Scheduled wake-up check. The orchestrator polls agents on a 30s interval to see if they have pending work. |
| **Wakeup** | A request to wake an agent. Lifecycle: queued -> claimed -> completed. Created by @-mentions, delegation, or heartbeat triggers. |
| **Issue** | A work item tracked in the forge.issues table. Lifecycle: backlog -> todo -> in_progress -> in_review -> done. |
| **Routine** | A cron-scheduled recurring task. Defined in forge.routines, executed by the routine loop every 60s. |
| **[SILENT]** | Marker in run output meaning the agent checked its inbox and had nothing to report. Prevents notification spam in the dashboard. |
| **Agent API** | REST service on localhost:3200 that agents use for self-service operations (delegation, comments, status updates). |
| **Orchestrator** | The Node.js process (PM2-managed) that runs the 5 polling loops and spawns CLI sessions. |
| **Adapter** | Maps an agent to a specific CLI (Claude/Codex/Gemini). Set via adapter_type in agent config. |
| **Company** | Top-level organizational unit. All data is company-scoped. |
| **Execution Workspace** | Temporary directory where an agent's CLI session runs. Cleaned up after run completion. |
| **Approval** | Human review gate. Agents can request approval via the Agent API; humans approve/reject in the dashboard. |
| **Cost Event** | Token usage record for billing tracking. Logged per-run by the orchestrator. |
| **Goal** | High-level objective for a company. Issues roll up to goals for progress tracking. |
