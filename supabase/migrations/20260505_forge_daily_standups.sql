-- FORGE-360: Daily standup card
-- Creates forge.daily_standups table.
-- UPSERT on date so re-generating same day overwrites (not duplicates).

create table if not exists forge.daily_standups (
  date        date        primary key,
  body_md     text        not null,
  source_payload jsonb    default '{}'::jsonb,
  generated_at  timestamptz default now(),
  company_id  uuid        not null references forge.companies(id) on delete cascade
);

-- Index for company-scoped queries (dashboard reads latest row per company)
create index if not exists daily_standups_company_id_date_idx
  on forge.daily_standups (company_id, date desc);

-- Enable Row Level Security (read-only for authed users, service role for writes)
alter table forge.daily_standups enable row level security;

-- Authed dashboard users can read their company's standups
create policy "Authed users read own company standups"
  on forge.daily_standups
  for select
  using (
    company_id in (
      select id from forge.companies
    )
  );

-- Only service role can insert/update (orchestrator uses service key)
create policy "Service role full access"
  on forge.daily_standups
  for all
  using (auth.role() = 'service_role');
