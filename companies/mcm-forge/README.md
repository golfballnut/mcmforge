# MCM Forge — Company Template

A reusable AI company template for [Paperclip](https://github.com/paperclipai/paperclip). Give the CEO a PRD, it hires domain specialists and ships product through a disciplined pipeline.

## How It Works

```
You (board) → PRD
  → CEO (founder mode) → brainstorm → product plan → hire specialists
    → CTO (eng lead mode) → technical execution plan → assign tasks
      → Domain Specialists (hired per-project) → TDD implementation
        → Code Reviewer (paranoid reviewer mode) → structural audit
          → Release Engineer (release machine mode) → PR → merge
```

## Org Chart

| Agent | Title | Reports To | Model | Skills |
|-------|-------|------------|-------|--------|
| CEO | Chief Executive Officer | Board | Opus | brainstorming, writing-plans, create-agent |
| CTO | Chief Technology Officer | CEO | Sonnet | writing-plans, systematic-debugging |
| Code Reviewer | Senior Code Reviewer | CTO | Sonnet | requesting-code-review, verification |
| Release Engineer | Release Engineer | CTO | Sonnet | finishing-branch, verification |
| *Specialists* | *Hired per-project* | *CTO* | *Varies* | *Domain-specific* |

## Key Design Decisions

- **CEO brainstorms before anything else.** No skipping the design phase.
- **Specialists are hired, not permanent.** The CEO reads the PRD and proposes the right domain experts. Each gets deep documentation in their AGENTS.md — not a generic "you are an engineer" prompt.
- **Right model per agent.** Opus for strategy (CEO). Sonnet for complex technical work. Haiku, Gemini, or Codex for routine tasks. Don't burn expensive tokens on simple work.
- **Code Reviewer is paranoid, not pedantic.** Structural bugs that survive CI, not style nitpicks.
- **Release Engineer lands the plane.** Branches don't die after the interesting work is done.

## Getting Started

```bash
# Import into Paperclip
paperclipai company import ./companies/mcm-forge

# Or from GitHub
paperclipai company import golfballnut/mcmforge/companies/mcm-forge
```

After import, use the `/paperclip-agent-setup` skill to configure budgets, heartbeat intervals, PARA memory, and runtime settings for each agent.

## Skills

7 referenced skills from [Anthropic's superpowers](https://github.com/anthropics/claude-code):

| Skill | Used By | Purpose |
|-------|---------|---------|
| brainstorming | CEO | Explore intent before building |
| writing-plans | CEO, CTO | Break work into bite-sized tasks |
| systematic-debugging | CTO | 4-phase root cause investigation |
| test-driven-development | Specialists | RED → GREEN → REFACTOR |
| verification-before-completion | Code Reviewer, Release Engineer | Evidence before assertions |
| requesting-code-review | Code Reviewer | Quality gate checklist |
| finishing-a-development-branch | Release Engineer | Merge/PR/cleanup workflow |

## Spec Compliance

Built to the [Agent Companies Specification](https://agentcompanies.io/specification) (`agentcompanies/v1`).

Built for [Paperclip](https://github.com/paperclipai/paperclip).
