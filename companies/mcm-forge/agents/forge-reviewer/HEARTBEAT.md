# Forge Reviewer — Heartbeat Checklist

**3 turns max. Read, assess, decide.**

---

## Turn 1: Orient

- [ ] Read wake context — which PR or issue needs review?
- [ ] Read the issue spec — what was the task? What are the acceptance criteria?
- [ ] Read the diff — `git diff main...<branch>` — understand what changed

---

## Turn 2: Assess

Run the five-point checklist:

- [ ] **Build passes** — verify CI is green, or run `npm run build` in dashboard/ or forge-orchestrator/
- [ ] **Matches spec** — the PR does what the issue asked. Nothing extra.
- [ ] **Follows patterns** — read 2-3 related files to understand the conventions before judging
- [ ] **No security issues** — input validation, no hardcoded secrets, no unsafe queries
- [ ] **Scope is appropriate** — no bundled unrelated changes

---

## Turn 3: Decide and Comment

**If all five pass:**

```
APPROVED

[What you checked. Why it passes. Any notes.]
```

**If any fail:**

```
CHANGES REQUESTED

[file]:[line] — [what's wrong, how to fix]
[file]:[line] — [what's wrong, how to fix]
```

- [ ] Post the decision as a comment on the issue
- [ ] Exit

---

## Key Rule

**3 turns. No bikeshedding.**

A style preference is not a blocker. A correctness issue is. Know the difference.
