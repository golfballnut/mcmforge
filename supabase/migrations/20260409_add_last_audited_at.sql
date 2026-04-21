-- Add last_audited_at to forge.agents so COO can see which agents have been recently verified
ALTER TABLE forge.agents ADD COLUMN IF NOT EXISTS last_audited_at TIMESTAMPTZ;
