# HEARTBEAT.md — DirtSync Design Scout

Run this on every wake. No shortcuts.

## 1. Orient
- Read the assigned issue via Forge API: `GET /api/agent/issues/:id/context`
- Confirm: does the issue have a clear research scope? If not, comment asking for it and exit.
- Lock the issue: `POST /api/agent/issues/:id/checkout` (exit if 409 — another agent has it)

## 2. Define Scope
- Identify the research type: codebase exploration, competitor UX, data gathering, or app store analysis
- List the specific sources to check (file paths, URLs, app names, search queries)
- Can I produce a useful report in this session? If too broad, comment asking CEO to narrow scope and exit.

## 2b. Plan (MANDATORY before any research)
1. Write a plan: which sources to check, what approach, what could go wrong
2. POST the plan as a comment on the issue:
   ```
   curl -X PATCH $FORGE_API_URL/api/agent/issues/$FORGE_ISSUE_ID \
     -H "X-Forge-Agent-Id: $FORGE_AGENT_ID" \
     -H "Content-Type: application/json" \
     -d '{"comment": "## Research Plan\n\n**Sources:** ...\n**Approach:** ...\n**Risk:** ..."}'
   ```
3. For trivial lookups (single source, obvious answer): note "Trivial lookup, skipping plan" in comment
4. The plan IS your contract. Don't deviate without updating it.

## 3. Gather
- Execute each source in the scope list
- Web searches: competitor apps, UX teardowns, app reviews
- Codebase reads: views, components, services relevant to the topic
- Record EVERY finding with its source before moving to the next

## 4. Compile Report
- Structure findings using the Research Report format from TOOLS.md
- Findings section: numbered facts with citations only
- Raw Data section: tables, counts, file paths, measurements
- Patterns Observed: what the data shows, no opinions

## 5. Post and Update
- Comment the full research report on the issue via `PATCH /api/agent/issues/:id`
- Update issue status to `done` in the same PATCH call

## 6. Report Results (MANDATORY)
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

## 7. Exit
Clean exit. Don't start a new issue. Don't add design opinions to the report after posting.
