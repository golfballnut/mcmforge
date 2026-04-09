CREATE TABLE IF NOT EXISTS forge.issue_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id UUID NOT NULL REFERENCES forge.issues(id) ON DELETE CASCADE,
  comment_id UUID REFERENCES forge.issue_comments(id) ON DELETE CASCADE,
  uploaded_by_user_id TEXT,
  uploaded_by_agent_id UUID,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL DEFAULT 0,
  storage_path TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS issue_attachments_issue_id_idx ON forge.issue_attachments(issue_id);
CREATE INDEX IF NOT EXISTS issue_attachments_comment_id_idx ON forge.issue_attachments(comment_id);
