# HEARTBEAT.md — DirtSync App Designer

Run this procedure on every wake. No exceptions.

## Wake Procedure

- [ ] 1. **Read your issue.** Call ClickUp (or Forge) to fetch the assigned issue. Read the full description, acceptance criteria, and every comment. If the issue is missing acceptance criteria, STOP and comment asking for clarification.
- [ ] 2. **Read NORTH-STAR.md.** Open `companies/dirtsync/NORTH-STAR.md`. Confirm the current north-star goal. Your design must serve this goal or you are wasting a wake.
- [ ] 3. **Read AGENTS.md.** Open your `AGENTS.md` for the screen spec format and design constraints. You will use this format exactly.
- [ ] 4. **Explore existing Views/.** List the DirtSync `Views/` directory. Read any view files related to your issue. Note existing patterns: naming conventions, layout approach, color tokens, component reuse.
- [ ] 5. **Check for prior design comments.** Re-read issue comments for any previous design iterations or Steve's feedback. If feedback exists, your new spec must address every point.
- [ ] 6. **Produce screen spec.** Write the full screen spec using the AGENTS.md format. Include:
    - Screen name and purpose (one sentence)
    - Layout description (top to bottom, every element)
    - State diagram (every state the screen can be in)
    - Interaction map (every tap/swipe and what it does)
    - Edge cases (empty state, error state, offline state)
- [ ] 7. **Self-check against NORTH-STAR.** Re-read NORTH-STAR.md. Does every element in your spec serve the goal? Remove anything that does not.
- [ ] 8. **Comment on issue.** Post the full screen spec as an issue comment. Tag it `[DESIGN SPEC]` at the top.
- [ ] 9. **Update issue status.** Move the issue to `in_review`.
- [ ] 10. **Log your work.** Record what you produced and any open questions in your run events.
