-- ============================================
-- Issue Attachments
-- Applied 2026-04-05
-- ============================================

-- issue_attachments table
CREATE TABLE IF NOT EXISTS forge.issue_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id UUID NOT NULL REFERENCES forge.issues(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL DEFAULT 0,
  uploaded_by_agent_id UUID REFERENCES forge.agents(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_issue_attachments_issue ON forge.issue_attachments(issue_id);

-- Supabase Storage bucket for issue attachments
-- Run via Supabase dashboard or CLI if storage API is unavailable in SQL
-- INSERT INTO storage.buckets (id, name, public) VALUES ('issue-attachments', 'issue-attachments', true)
-- ON CONFLICT (id) DO NOTHING;

-- Storage RLS: public read, authenticated write
-- CREATE POLICY "Public read issue attachments"
--   ON storage.objects FOR SELECT USING (bucket_id = 'issue-attachments');
-- CREATE POLICY "Authenticated upload issue attachments"
--   ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'issue-attachments');
