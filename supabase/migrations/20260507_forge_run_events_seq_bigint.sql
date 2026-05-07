-- 20260507_forge_run_events_seq_bigint.sql
-- WO-1: widen forge.run_events.seq from INT4 (max 2.1e9) to BIGINT (max ~9.2e18).
-- Date.now() in 2026 returns ~1.78e12, three orders past INT4 max.
-- Pre-fix: 808 lifetime runs produced 0 run_events rows; every insert silently
-- failed with "integer out of range" (error swallowed by .catch(()=>{})).

BEGIN;

ALTER TABLE forge.run_events ALTER COLUMN seq TYPE BIGINT;

COMMIT;
