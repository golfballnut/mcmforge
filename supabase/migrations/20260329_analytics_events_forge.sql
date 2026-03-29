-- MCM Forge: analytics_events table
-- Tracks page views, JS errors, and custom events from the dashboard.
-- RLS: anon+authenticated can INSERT; only service_role can SELECT.
-- Always returns 200 from the API — client never retries.

create table if not exists analytics_events (
  id          uuid primary key default gen_random_uuid(),
  event_name  text not null,
  timestamp   timestamptz not null default now(),
  properties  jsonb default '{}',
  user_agent  text,
  referer     text,
  created_at  timestamptz not null default now()
);

-- Index for common queries (event_name + time range)
create index if not exists analytics_events_name_time_idx
  on analytics_events (event_name, timestamp desc);

-- Enable RLS
alter table analytics_events enable row level security;

-- Anyone (anon or authenticated) can INSERT events
create policy "analytics_insert"
  on analytics_events
  for insert
  to anon, authenticated
  with check (true);

-- Only service_role can read (for analysis, dashboards)
-- anon/authenticated cannot SELECT — data stays private
create policy "analytics_service_select"
  on analytics_events
  for select
  to service_role
  using (true);

comment on table analytics_events is
  'MCM Forge dashboard analytics — page views, JS errors, custom events';
