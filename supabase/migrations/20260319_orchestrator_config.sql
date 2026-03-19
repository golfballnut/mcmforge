-- Enable orchestrator feature flag (disabled by default)
-- The orchestrator auto-classifies tasks via Gemini before execution
INSERT INTO system_config (key, value, description)
VALUES ('orchestrator_mode', 'disabled', 'Auto-classify tasks via Gemini before execution. Set to enabled to activate.')
ON CONFLICT (key) DO NOTHING;
