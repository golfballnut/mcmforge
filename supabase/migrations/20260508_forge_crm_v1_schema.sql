-- 20260508_forge_crm_v1_schema.sql
-- WO-2: MCMForge CRM v1.
-- Adds 3 tables (crm_accounts, crm_contacts, crm_activities), 1 column (issues.contact_id),
-- 1 view (crm_activity_timeline), and permissive RLS (matches WO-1 pattern).
-- Tenant isolation deferred to future RBAC WO.

BEGIN;

-- ─── Tables ────────────────────────────────────────────────────────────────

CREATE TABLE forge.crm_accounts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES forge.companies(id),
  name          TEXT NOT NULL,
  domain        TEXT,
  account_type  TEXT NOT NULL DEFAULT 'other'
                CHECK (account_type IN ('supplier','customer','partner','other')),
  status        TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active','inactive','churned')),
  custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    UUID REFERENCES auth.users(id),
  UNIQUE (company_id, domain)
);

CREATE INDEX idx_crm_accounts_company_id ON forge.crm_accounts(company_id);
CREATE INDEX idx_crm_accounts_domain     ON forge.crm_accounts(domain);

CREATE TABLE forge.crm_contacts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES forge.companies(id),
  account_id    UUID REFERENCES forge.crm_accounts(id) ON DELETE SET NULL,
  first_name    TEXT,
  last_name     TEXT,
  email         TEXT,
  phone         TEXT,
  title         TEXT,
  status        TEXT NOT NULL DEFAULT 'lead'
                CHECK (status IN ('lead','qualified','won','lost','archived')),
  custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    UUID REFERENCES auth.users(id),
  UNIQUE (company_id, email)
);

CREATE INDEX idx_crm_contacts_company_id ON forge.crm_contacts(company_id);
CREATE INDEX idx_crm_contacts_account_id ON forge.crm_contacts(account_id);
CREATE INDEX idx_crm_contacts_email      ON forge.crm_contacts(email);

CREATE TABLE forge.crm_activities (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES forge.companies(id),
  contact_id  UUID REFERENCES forge.crm_contacts(id) ON DELETE CASCADE,
  account_id  UUID REFERENCES forge.crm_accounts(id) ON DELETE CASCADE,
  issue_id    UUID REFERENCES forge.issues(id) ON DELETE SET NULL,
  kind        TEXT NOT NULL
              CHECK (kind IN ('call','email_sent','email_received','note','meeting')),
  subject     TEXT,
  body        TEXT,
  actor_kind  TEXT NOT NULL CHECK (actor_kind IN ('agent','human')),
  actor_id    TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (contact_id IS NOT NULL OR account_id IS NOT NULL)
);

CREATE INDEX idx_crm_activities_company_id  ON forge.crm_activities(company_id);
CREATE INDEX idx_crm_activities_contact_id  ON forge.crm_activities(contact_id);
CREATE INDEX idx_crm_activities_account_id  ON forge.crm_activities(account_id);
CREATE INDEX idx_crm_activities_occurred_at ON forge.crm_activities(occurred_at DESC);

-- ─── forge.issues column delta ─────────────────────────────────────────────

ALTER TABLE forge.issues
  ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES forge.crm_contacts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_forge_issues_contact_id ON forge.issues(contact_id);

-- ─── Activity timeline view ────────────────────────────────────────────────

CREATE OR REPLACE VIEW forge.crm_activity_timeline
WITH (security_invoker = true)
AS
SELECT
  id, company_id, contact_id, account_id, issue_id,
  kind, subject, body, actor_kind, actor_id, occurred_at,
  'explicit'::text AS source
FROM forge.crm_activities

UNION ALL

SELECT
  ie.id,
  i.company_id,
  i.contact_id,
  c.account_id,
  i.id                                AS issue_id,
  ie.event_type                       AS kind,
  i.title                             AS subject,
  COALESCE(ie.new_value, ie.metadata::text) AS body,
  CASE WHEN ie.actor_type = 'agent' THEN 'agent' ELSE 'human' END AS actor_kind,
  ie.actor_id                         AS actor_id,
  ie.created_at                       AS occurred_at,
  'derived_issue_event'::text         AS source
FROM forge.issue_events ie
JOIN forge.issues i        ON i.id = ie.issue_id
LEFT JOIN forge.crm_contacts c ON c.id = i.contact_id
WHERE i.contact_id IS NOT NULL;

-- ─── updated_at triggers ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION forge.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_crm_accounts_set_updated_at
  BEFORE UPDATE ON forge.crm_accounts
  FOR EACH ROW EXECUTE FUNCTION forge.set_updated_at();

CREATE TRIGGER trg_crm_contacts_set_updated_at
  BEFORE UPDATE ON forge.crm_contacts
  FOR EACH ROW EXECUTE FUNCTION forge.set_updated_at();

-- ─── RLS ───────────────────────────────────────────────────────────────────

ALTER TABLE forge.crm_accounts   ENABLE ROW LEVEL SECURITY;
ALTER TABLE forge.crm_contacts   ENABLE ROW LEVEL SECURITY;
ALTER TABLE forge.crm_activities ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  CREATE POLICY "authenticated_all" ON forge.crm_accounts
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "authenticated_all" ON forge.crm_contacts
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "authenticated_all" ON forge.crm_activities
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── Cross-portfolio search RPC ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION forge.crm_search(q TEXT, max_results INT DEFAULT 50)
RETURNS TABLE (
  kind         TEXT,
  id           UUID,
  title        TEXT,
  detail       TEXT,
  portfolio_co TEXT
)
LANGUAGE sql STABLE
AS $$
  SELECT 'contact'::TEXT,
         c.id,
         COALESCE(NULLIF(TRIM(CONCAT_WS(' ', c.first_name, c.last_name)), ''), c.email),
         c.email,
         co.name
  FROM forge.crm_contacts c
  JOIN forge.companies co ON co.id = c.company_id
  WHERE c.email      ILIKE '%' || q || '%'
     OR c.first_name ILIKE '%' || q || '%'
     OR c.last_name  ILIKE '%' || q || '%'

  UNION ALL

  SELECT 'account'::TEXT,
         a.id,
         a.name,
         a.domain,
         co.name
  FROM forge.crm_accounts a
  JOIN forge.companies co ON co.id = a.company_id
  WHERE a.name   ILIKE '%' || q || '%'
     OR a.domain ILIKE '%' || q || '%'
  LIMIT max_results;
$$;

GRANT EXECUTE ON FUNCTION forge.crm_search(TEXT, INT) TO authenticated;

COMMIT;
