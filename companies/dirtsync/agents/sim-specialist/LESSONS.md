# Lessons Learned — DirtSync Simulator Specialist

Append new entries at the top. See `vault/agents/skills/lessons-learned-loop.md` for format.

---

## 2026-04-20 — Onboarding scar: sim-green without login means nothing
**Bug:** DIRA-213 "verified" by a fresh-install sim run with 0 `"only track your presence"` warnings. Actually proved nothing — `RiderPresenceService` never initialized because no login occurred.
**Attempted fix:** None (CEO caught it pre-merge).
**Outcome:** lesson absorbed into this agent's onboarding; every run must grep the service's own NSLog tag count BEFORE claiming pass. Zero hits = inconclusive.
**Why:** Swift services behind auth gates don't execute without a session. Logs that don't mention the service mean nothing happened, not that nothing went wrong.
**Cost:** $2.87 of Feature Builder wasted on the incorrect "verification" run.
**Tag:** sim-proof, presence, auth, login-required
