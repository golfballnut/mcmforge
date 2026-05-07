-- 20260507_forge_rls_lockdown.sql
-- WO-1: enable RLS on 10 forge.* tables flagged by Supabase advisor.
-- 9 tables are unused (zero app references) and get RLS-only (service role bypasses).
-- forge.issue_attachments is actively read by the dashboard's authenticated client and
-- gets a permissive `authenticated_all` policy. Tenant isolation deferred to future RBAC WO.

BEGIN;

-- 9 unused / service-role-only tables ----------------------------------------
ALTER TABLE forge.tag_keywords         ENABLE ROW LEVEL SECURITY;
ALTER TABLE forge.file_tag_mappings    ENABLE ROW LEVEL SECURITY;
ALTER TABLE forge.tag_agent_mappings   ENABLE ROW LEVEL SECURITY;
ALTER TABLE forge.trigger_errors       ENABLE ROW LEVEL SECURITY;
ALTER TABLE forge.run_ratings          ENABLE ROW LEVEL SECURITY;
ALTER TABLE forge.gap_taxonomy         ENABLE ROW LEVEL SECURITY;
ALTER TABLE forge.stage_artifacts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE forge.stack_state          ENABLE ROW LEVEL SECURITY;
ALTER TABLE forge.video_diff_runs      ENABLE ROW LEVEL SECURITY;

-- forge.issue_attachments: actively read by dashboard via anon-cookie auth ----
ALTER TABLE forge.issue_attachments    ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  CREATE POLICY "authenticated_all" ON forge.issue_attachments
    FOR ALL TO authenticated
    USING (true) WITH CHECK (true);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMIT;
