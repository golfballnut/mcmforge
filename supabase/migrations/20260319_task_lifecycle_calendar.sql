-- Task Lifecycle Calendar Integration
-- Adds Google Calendar event tracking to task lifecycle
-- 2026-03-19

-- Add google_calendar_id to company_registry
ALTER TABLE company_registry ADD COLUMN IF NOT EXISTS google_calendar_id TEXT;

-- Add calendar_event_id to task_queue (stores Google Calendar event ID for updates)
ALTER TABLE task_queue ADD COLUMN IF NOT EXISTS calendar_event_id TEXT;

-- Add calendar_html_link to task_queue (stores the direct URL returned by Calendar API)
ALTER TABLE task_queue ADD COLUMN IF NOT EXISTS calendar_html_link TEXT;
