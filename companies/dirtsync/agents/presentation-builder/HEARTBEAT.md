# HEARTBEAT.md — DirtSync Presentation Builder

Run this procedure on every wake. No exceptions.

## Wake Procedure

- [ ] 1. **Read your issue.** Fetch the assigned issue. Read the full description and every comment. Identify the presentation topic, audience, and goal.
- [ ] 2. **Find the design spec.** Search issue comments for a `[DESIGN SPEC]` comment from App Designer. If no spec exists, STOP and comment: "Blocked — no design spec found."
- [ ] 3. **Read AGENTS.md.** Open your `AGENTS.md` for slide format requirements and brand guidelines.
- [ ] 3b. **Plan (MANDATORY before any work).** Write a plan: which slides, what assets, what approach, what could go wrong. POST the plan as a comment:
  ```
  curl -X PATCH $FORGE_API_URL/api/agent/issues/$FORGE_ISSUE_ID \
    -H "X-Forge-Agent-Id: $FORGE_AGENT_ID" \
    -H "Content-Type: application/json" \
    -d '{"comment": "## Presentation Plan\n\n**Slides:** ...\n**Approach:** ...\n**Risk:** ..."}'
  ```
  For trivial updates: note "Trivial update, skipping plan" in comment.
- [ ] 4. **Gather assets.** Collect all screenshots, diagrams, and specs referenced in the design spec. Download any linked images to local temp files.
- [ ] 5. **Build the presentation.** Use `gws slides create` to create a new Google Slides deck. Follow this structure:
    - Slide 1: Title slide with DirtSync branding
    - Slide 2: Problem / context (why this matters)
    - Slides 3-N: Screen specs, one screen per slide, with annotated layouts
    - Final slide: Summary of what ships and when
- [ ] 6. **Add content to each slide.** Use `gws slides add-slide` for each slide. Include speaker notes explaining the design rationale.
- [ ] 7. **Share the deck.** Run `gws slides share <presentation-id> --email steve@linkschoice.com --role writer`.
- [ ] 8. **Verify sharing.** Run `gws slides get <presentation-id>` and confirm steve@linkschoice.com appears in permissions.
- [ ] 9. **Comment on issue.** Post a comment with:
    - `[PRESENTATION]` tag at the top
    - The full presentation URL
    - Slide count and summary of contents
- [ ] 10. **Update issue status.** Move the issue to `in_review`.
- [ ] 11. **Log your work.** Record the presentation ID and URL in your run events.
- [ ] 12. **Report Results (MANDATORY — your work doesn't count without this).** POST your results as a comment on the issue:
  ```
  curl -X PATCH $FORGE_API_URL/api/agent/issues/$FORGE_ISSUE_ID \
    -H "X-Forge-Agent-Id: $FORGE_AGENT_ID" \
    -H "Content-Type: application/json" \
    -d '{"comment": "## Results\n\n<summary of what you did>\n\n**Files changed:** ...\n**Status:** ...\n**Next steps:** ..."}'
  ```
  If you're running low on turns, STOP working and POST what you have so far. Update issue status via PATCH (in_review, approved, done, blocked). Your work does NOT count unless it's posted as a comment. The next agent in the chain reads your comment to continue.
