-- Add end time for calendar events so AI planner knows event duration
ALTER TABLE custom_tasks ADD COLUMN IF NOT EXISTS event_end_time TEXT;

-- Add team AI guidance field for team owners to provide context for AI schedule generation
-- This is stored in team_prefs JSON, no schema change needed for that.

-- Update sync_gcal_events to accept and store event_end_time
DROP FUNCTION IF EXISTS sync_gcal_events(jsonb);
CREATE OR REPLACE FUNCTION sync_gcal_events(events jsonb)
RETURNS SETOF custom_tasks
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  uid uuid := auth.uid();
  e jsonb;
  rec custom_tasks;
  already_exists boolean;
BEGIN
  FOR e IN SELECT * FROM jsonb_array_elements(events)
  LOOP
    -- Check if this gcal event was previously dismissed (soft-deleted)
    SELECT EXISTS(
      SELECT 1 FROM custom_tasks
      WHERE user_id = uid
        AND google_event_id = e->>'google_event_id'
        AND is_deleted = true
    ) INTO already_exists;

    IF already_exists THEN
      CONTINUE;
    END IF;

    SELECT EXISTS(
      SELECT 1 FROM custom_tasks
      WHERE user_id = uid
        AND google_event_id = e->>'google_event_id'
        AND is_deleted = false
    ) INTO already_exists;

    INSERT INTO custom_tasks (user_id, label, icon, xp, is_default, specific_date, google_event_id, event_time, event_end_time)
    VALUES (
      uid,
      e->>'label',
      '📅',
      10,
      false,
      e->>'specific_date',
      e->>'google_event_id',
      e->>'event_time',
      e->>'event_end_time'
    )
    ON CONFLICT (user_id, google_event_id) WHERE google_event_id IS NOT NULL
    DO UPDATE SET label = EXCLUDED.label, event_time = EXCLUDED.event_time, event_end_time = EXCLUDED.event_end_time;

    IF NOT already_exists THEN
      SELECT * INTO rec FROM custom_tasks
      WHERE user_id = uid AND google_event_id = e->>'google_event_id';
      RETURN NEXT rec;
    END IF;
  END LOOP;
END;
$$;
