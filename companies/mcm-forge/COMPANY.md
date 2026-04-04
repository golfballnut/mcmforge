---
name: MCM Forge
description: Reusable AI company template — CEO takes a PRD, hires domain specialists, and ships product through a disciplined pipeline
slug: mcm-forge
schema: agentcompanies/v1
version: 1.0.0
license: MIT
authors:
  - name: Steve McMillian
goals:
  - Ship product through a disciplined pipeline from PRD to production
  - CEO hires domain specialists based on the work, not a fixed org chart
  - Every agent is a domain expert with complete context for their area
  - Right model per agent — expensive models for hard thinking, cheap models for routine work
---

# MCM Forge Company Template

A reusable company template for building AI-powered product teams. Designed to be imported into Paperclip and customized for any product — trail apps, e-commerce, SaaS, anything.

## How This Company Works

**Pipeline workflow:**

1. **You** (the board) give the CEO a PRD or feature idea
2. **CEO** brainstorms the product vision, scopes the work, hires specialists if needed
3. **CTO** turns the product plan into a locked technical execution plan
4. **Domain specialists** (hired per-project) implement the plan with TDD discipline
5. **Code Reviewer** runs a paranoid structural audit before anything ships
6. **Release Engineer** lands the code — merge, PR, deploy, cleanup

Work flows one direction. Each agent knows where work comes from, what they produce, and who gets it next.

## Hiring Model

The CEO and CTO are permanent. Engineers are hired as domain specialists based on the PRD — a Ferrostar navigation expert, a MapLibre rendering specialist, a Supabase backend engineer. Each specialist gets deep domain documentation in their AGENTS.md. When the project is done, specialists can be archived.

## Scope Controls

The CEO operates in three modes:
- **Scope expansion** — find the 10-star version nobody asked for
- **Hold scope** — maximum rigor on the current plan
- **Scope reduction** — strip to the smallest thing that still matters

You set the mode when you hand over the PRD.
