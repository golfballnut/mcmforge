-- Register the Feature Builder agent for DirtSync
-- Inner Loop pattern: build → test → critique → ship in ONE session (max 8 iterations)
-- Replaces: iOS Builder → Test Runner → Critique Agent → Ship Engineer sequential handoff

INSERT INTO forge.agents (id, company_id, name, title, adapter_type, adapter_config, instructions_file, status)
VALUES (
  gen_random_uuid(),
  '99338dee-5fdc-4cbf-a344-5c08ec112a2b',
  'Feature Builder',
  'Inner Loop Feature Builder — DirtSync',
  'claude',
  '{"model": "claude-sonnet-4-6", "command": "/Users/dirtsyncmini/.local/bin/claude", "maxTurnsPerRun": 120, "cwd": "/Users/dirtsyncmini/DirtSync"}',
  '/Users/dirtsyncmini/MCMForge/companies/dirtsync/agents/feature-builder/AGENTS.md',
  'idle'
);
