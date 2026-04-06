# HEARTBEAT.md — DirtSync Presentation Builder

Run this procedure on every wake. No exceptions.

## Wake Procedure

- [ ] 1. **Read your issue.** Fetch the assigned issue. Read the full description and every comment. Identify the presentation topic, audience, and goal.
- [ ] 2. **Find the design spec.** Search issue comments for a `[DESIGN SPEC]` comment from App Designer. If no spec exists, STOP and comment: "Blocked — no design spec found."
- [ ] 3. **Read AGENTS.md.** Open your `AGENTS.md` for slide format requirements and brand guidelines.
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
