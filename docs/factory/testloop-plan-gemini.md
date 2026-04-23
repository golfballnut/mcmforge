### 1. Stage Architecture Table

| Stage | Role | Model | Max Turns | Input Source | Output Target | Cost Est. |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **SPEC** | Architect | 3.5 Sonnet | 10 | `forge.runs.context` | `forge.issue_comments` [PLAN] | $0.20 |
| **CODER** | Implementer | 3.5 Sonnet | 35 | `[PLAN]` + Files | Filesystem (Unstaged) | $1.20 |
| **TESTER** | Auditor | 3.5 Haiku | 15 | `xcodebuild` stdout | `forge.issue_comments` [RESULT] | $0.15 |
| **FIXER** | Debugger | 3.5 Sonnet | 25 | `[RESULT]` + Files | Git Commit | $1.50 |
| **CRITIC** | Vision QA | 3.5 Sonnet | 10 | Sim PNG + GDrive Ref | `forge.issue_comments` [GRADE] | $0.50 |
| **SHIPPER** | Release Eng | 3.5 Haiku | 10 | Git Status | GitHub PR URL | $0.10 |

### 2. Orchestrator Changes (State Machine)
*   **Stage Transition:** Add a `stage` column to `forge.runs`. On subprocess exit code `0`, the orchestrator queries `forge.issue_comments` for the current `run_id`. If a specific tag is found (e.g., `[TEST-RESULT] PASS`), it inserts the next stage's row into `forge.runs`.
*   **Retry Counter:** Add `metadata.retry_count` to `forge.runs`. The orchestrator increments this during FIXER -> TESTER loops. If `retry_count > 3`, it marks the parent issue as `STALLED`.

### 3. Concrete File List
1.  `src/orchestrator/next-stage.ts`: Logic to map `(CurrentStage, ExitStatus, LastCommentTag) -> NextStage`.
2.  `src/agents/spec_prompt.md`: System prompt forcing the agent to output a valid JSON plan in comments.
3.  `src/agents/tester_runner.sh`: Wrapper script that runs `xcodebuild`, captures logs, and pipes to `claude --edit` for summarization.
4.  `src/agents/critic_vision.ts`: Uses Claude Vision to compare `sim_latest.png` vs `gold_star_ref.png` and output a grade.
5.  `src/db/schema_patch.sql`: DDL for `forge.stage_results` to store binary artifacts like screenshot base64s.

### 4. Failure Handling: Test Runner → Fixer
The **TESTER** agent is strictly forbidden from editing code. It runs the shell command and reads the output.
1.  **Detection:** TESTER identifies strings like `** TEST FAILED **`.
2.  **Reporting:** TESTER posts a comment: `[TEST-RESULT] FAIL: <failed_test_name> | Error: <line_number>`.
3.  **Dispatch:** Orchestrator sees `[TEST-RESULT] FAIL`, checks `retry_count < 3`, and queues a **FIXER** run.
4.  **Context:** The FIXER agent is initialized with the `[TEST-RESULT]` comment as its primary instruction, skipping the expensive full-repo exploration.

### 5. Kill-Switch
*   **Cost Ceiling:** Orchestrator calculates `SELECT sum(cost_usd) FROM forge.runs WHERE issue_id = X`. If result `> $8.00`, kill all active runs for that issue and tag as `EXHAUSTED`.
*   **Turn Limit:** Any individual stage exceeding its specific `max_turns` is SIGKILLed by the orchestrator.

### 6. Risk & Mitigation
*   **Risk: Context Drift.** A stage might lose track of the original AC (Acceptance Criteria) if it only reads the previous stage's output.
*   **Mitigation:** Every stage initialization *must* prepend the original `SPEC [PLAN]` and `Issue AC` to the agent's system prompt as "Immutable Requirements," ensuring the FIXER doesn't drift into "hallucination fixing" that ignores the original goal.
