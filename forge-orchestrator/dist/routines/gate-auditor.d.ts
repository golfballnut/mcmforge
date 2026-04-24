/**
 * Gate Auditor Routine
 *
 * Run: npx tsx src/routines/gate-auditor.ts
 *
 * Daily audit of every specialist's certification state. For each agent:
 *   1. Ensure a `Certification: <Agent Name>` issue exists (create if missing)
 *   2. Compute recent performance metrics (runs, success rate, cost, cost/run)
 *   3. Post a structured digest comment with current gate + days-at-gate + blockers
 *
 * Manual only until dialed in. Do NOT insert into forge.routines until a full
 * 2-consecutive-clean-run certification (G2) is complete.
 */
import 'dotenv/config';
//# sourceMappingURL=gate-auditor.d.ts.map