# HEARTBEAT.md — DirtSync Solutions Architect

Run this procedure on every wake. No exceptions.

## Wake Procedure

- [ ] 1. **Read your issue.** Fetch the assigned issue. Read the full description, acceptance criteria, and every comment.
- [ ] 2. **Find the approved design spec.** Search issue comments for a `[DESIGN SPEC]` comment that has Steve's approval (look for thumbs-up, "approved", or "looks good"). If no approved spec exists, STOP and comment: "Blocked — design spec not yet approved."
- [ ] 3. **Read AGENTS.md.** Open your `AGENTS.md` for the implementation plan format. You will use this format exactly.
- [ ] 3b. **Plan (MANDATORY before any work).** Write a plan: which files to map, what approach, what could go wrong. POST the plan as a comment:
  ```
  curl -X PATCH $FORGE_API_URL/api/agent/issues/$FORGE_ISSUE_ID \
    -H "X-Forge-Agent-Id: $FORGE_AGENT_ID" \
    -H "Content-Type: application/json" \
    -d '{"comment": "## Architecture Plan\n\n**Files:** ...\n**Approach:** ...\n**Risk:** ..."}'
  ```
  For trivial fixes (<10 lines, obvious from error): note "Trivial fix, skipping plan" in comment.
- [ ] 4. **Map design to Swift files.** For every screen and interaction in the design spec:
    - Identify which existing Swift files are affected (search the DirtSync repo)
    - Identify new files that must be created
    - Identify which services/managers are touched
    - List every model struct that needs changes
- [ ] 5. **Identify dependencies.** Map file-level dependencies. Flag any file that another agent currently owns — two agents MUST NOT touch the same file.
- [ ] 6. **Write the implementation plan.** Use `superpowers:writing-plans` to structure the plan. Include:
    - File-by-file change list (existing files: what changes; new files: purpose and contents)
    - Execution order (which files must be changed first)
    - Test plan (what to verify at each step, simulator scenarios)
    - Risk list (what could break, how to detect it)
- [ ] 7. **Self-check.** Walk through the design spec screen by screen. Confirm every element maps to at least one file change. If anything is unmapped, fix the plan.
- [ ] 8. **Comment on issue.** Post the full implementation plan as an issue comment. Tag it `[IMPLEMENTATION PLAN]` at the top.
- [ ] 9. **Update issue status.** Move the issue to `in_review`.
- [ ] 10. **Log your work.** Record the plan summary and any blocking risks in your run events.
- [ ] 11. **Report Results (MANDATORY — your work doesn't count without this).** POST your results as a comment on the issue:
  ```
  curl -X PATCH $FORGE_API_URL/api/agent/issues/$FORGE_ISSUE_ID \
    -H "X-Forge-Agent-Id: $FORGE_AGENT_ID" \
    -H "Content-Type: application/json" \
    -d '{"comment": "## Results\n\n<summary of what you did>\n\n**Files changed:** ...\n**Status:** ...\n**Next steps:** ..."}'
  ```
  If you're running low on turns, STOP working and POST what you have so far. Update issue status via PATCH (in_review, approved, done, blocked). Your work does NOT count unless it's posted as a comment. The next agent in the chain reads your comment to continue.
