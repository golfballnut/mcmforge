-- Migration: 20260329_skill_package_columns.sql
-- Adds progressive disclosure columns to vault_docs table.
-- Existing rows remain valid (file_role defaults to 'full', parent_slug is NULL).

ALTER TABLE vault_docs
  ADD COLUMN IF NOT EXISTS file_role TEXT NOT NULL DEFAULT 'full'
    CHECK (file_role IN ('full', 'core', 'workflow', 'reference', 'config', 'run-history')),
  ADD COLUMN IF NOT EXISTS parent_slug TEXT;

-- Index for progressive disclosure queries: fetch all components of a skill
CREATE INDEX IF NOT EXISTS idx_vault_docs_parent_slug
  ON vault_docs(parent_slug)
  WHERE parent_slug IS NOT NULL;

-- Index for role-based filtering used in loadVaultContext
CREATE INDEX IF NOT EXISTS idx_vault_docs_file_role
  ON vault_docs(file_role)
  WHERE file_role != 'full';

-- Comment explaining the design
COMMENT ON COLUMN vault_docs.file_role IS
  'Progressive disclosure role: full (legacy flat skill), core (always loaded), workflow (loaded when skill matches task), reference (loaded on retry), config/run-history (internal, never in prompts)';
COMMENT ON COLUMN vault_docs.parent_slug IS
  'For package components: references the parent skill slug (e.g. plan-then-code). NULL for flat/full docs.';
