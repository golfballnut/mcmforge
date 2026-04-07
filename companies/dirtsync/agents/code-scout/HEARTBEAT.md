# HEARTBEAT.md — DirtSync Code Scout

Run this on every wake. No shortcuts.

## 1. Orient
- Read the assigned issue via Forge API: `GET /api/agent/issues/:id/context`
- Confirm: is there a specific file, feature, or analysis scope defined? If not, comment asking and exit.
- Lock the issue: `POST /api/agent/issues/:id/checkout` (exit if 409 — another agent has it)

## 2. Define Scope
- Identify the analysis type: code audit, architecture mapping, implementation draft, or test gap analysis
- List the exact Swift files and directories to read
- Confirm the output consumer: is this for the iOS Builder, Solutions Architect, or CEO?

## 2b. Plan (MANDATORY before any research)
1. Write a plan: which files to read, what analysis approach, what could go wrong
2. POST the plan as a comment on the issue:
   ```
   curl -X PATCH $FORGE_API_URL/api/agent/issues/$FORGE_ISSUE_ID \
     -H "X-Forge-Agent-Id: $FORGE_AGENT_ID" \
     -H "Content-Type: application/json" \
     -d '{"comment": "## Research Plan\n\n**Files:** ...\n**Approach:** ...\n**Risk:** ..."}'
   ```
3. For trivial lookups (single file, obvious answer): note "Trivial lookup, skipping plan" in comment
4. The plan IS your contract. Don't deviate without updating it.

## 3. Read Source Files
- `cat` or read each file in scope — never analyze from memory
- Record imports, dependencies, @Published properties, service calls, key methods
- Note exact line numbers for any findings

## 4. Map Dependencies
- Trace the dependency graph: what does this code depend on? What depends on it?
- Identify build order: which files must exist before others can compile
- Flag any circular dependencies or shared-state risks

## 5. Produce Analysis
- Structure output using the Analysis Report format from TOOLS.md
- Include exact file paths, method names, and line references
- Issues Found section must list concrete risks with line numbers, not vague concerns

## 6. Post and Update
- Comment the full analysis on the issue via `PATCH /api/agent/issues/:id`
- Update issue status to `done` in the same PATCH call

## 7. Report Results (MANDATORY)
1. POST your research findings as a comment on the issue — this is the DELIVERABLE:
   ```
   curl -X PATCH $FORGE_API_URL/api/agent/issues/$FORGE_ISSUE_ID \
     -H "X-Forge-Agent-Id: $FORGE_AGENT_ID" \
     -H "Content-Type: application/json" \
     -d '{"comment": "## Results\n\n<structured report with sections per topic, measurements, sources>"}'
   ```
2. Format: structured report with sections per topic, measurements, sources
3. If you're running low on turns, POST what you have — partial research is better than none
4. PATCH issue status to `in_review` when research is complete

## 8. Exit
Clean exit. Don't start a new issue. Don't write implementation code.
