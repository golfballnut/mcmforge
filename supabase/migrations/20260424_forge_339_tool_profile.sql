-- FORGE-339: Scoped tool profiles for specialist agents
-- Adds tool_profile JSONB to forge.agents + scope-violation guard trigger on forge.stage_artifacts.
--
-- tool_profile shape:
--   {
--     "allowed_tools":       string[],   -- explicit --allowedTools list (empty = no restriction)
--     "denied_mcp_servers":  string[],   -- server names to block, e.g. ["supabase"] → --disallowedTools mcp__supabase__*
--     "issue_scope":         "full" | "single_ticket"  -- controls FORGE_ALLOWED_* env injection
--   }

SET search_path = forge;

-- 1. Add tool_profile column to forge.agents
ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS tool_profile JSONB NOT NULL DEFAULT '{}'::jsonb;

-- 2. Seed specialist agents: deny Supabase MCP + enforce single_ticket scope.
--    Targets agents whose metadata carries factory_stage (spec/coder/fixer/test_runner/visual_critic/shipper).
--    We use a JSON containment check so non-specialist agents are untouched.
UPDATE agents
SET tool_profile = jsonb_build_object(
  'denied_mcp_servers', jsonb_build_array('supabase'),
  'issue_scope', 'single_ticket'
)
WHERE
  (metadata->>'factory_stage') IS NOT NULL
  AND tool_profile = '{}'::jsonb;

-- 3. Trigger function: reject stage_artifact inserts/updates where output_json->>'identifier'
--    does not match the identifier of the associated issue.
--    Belt-and-suspenders: an agent that has drifted cross-ticket cannot write artifacts.
--    Permissive when output_json or identifier is absent (non-spec artifacts, lead artifacts, etc.)
CREATE OR REPLACE FUNCTION forge_fn_scope_violation_reject()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_issue_identifier TEXT;
  v_artifact_identifier TEXT;
BEGIN
  -- Only check when output_json has an 'identifier' key
  v_artifact_identifier := NEW.output_json->>'identifier';
  IF v_artifact_identifier IS NULL OR v_artifact_identifier = '' THEN
    RETURN NEW;
  END IF;

  -- Only check when there is an associated issue
  IF NEW.issue_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT identifier INTO v_issue_identifier
  FROM forge.issues
  WHERE id = NEW.issue_id;

  -- If issue not found, allow (don't block on referential anomalies)
  IF v_issue_identifier IS NULL THEN
    RETURN NEW;
  END IF;

  IF v_artifact_identifier <> v_issue_identifier THEN
    RAISE EXCEPTION '[SCOPE-LOCK-ERROR] cross-ticket artifact: output_json.identifier=% does not match issue.identifier=% (issue_id=%)',
      v_artifact_identifier, v_issue_identifier, NEW.issue_id
    USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

-- 4. Attach trigger to forge.stage_artifacts
DROP TRIGGER IF EXISTS forge_trigger_scope_violation_reject ON stage_artifacts;

CREATE TRIGGER forge_trigger_scope_violation_reject
  BEFORE INSERT OR UPDATE ON stage_artifacts
  FOR EACH ROW
  EXECUTE FUNCTION forge_fn_scope_violation_reject();
