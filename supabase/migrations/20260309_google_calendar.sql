-- Add Google Calendar fields to custom_tasks
ALTER TABLE custom_tasks ADD COLUMN IF NOT EXISTS google_event_id TEXT;
ALTER TABLE custom_tasks ADD COLUMN IF NOT EXISTS event_time TEXT;

-- Prevent duplicate syncs of the same Google Calendar event per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_custom_tasks_google_event
  ON custom_tasks(user_id, google_event_id)
  WHERE google_event_id IS NOT NULL;
