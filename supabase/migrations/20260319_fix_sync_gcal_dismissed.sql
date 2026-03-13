-- Fix sync_gcal_events: don't re-insert dismissed (is_deleted) events
-- and only return genuinely NEW rows (not updates to existing ones).
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

    -- Skip dismissed events entirely
    IF already_exists THEN
      CONTINUE;
    END IF;

    -- Check if it already exists (non-deleted) to decide if it's new
    SELECT EXISTS(
      SELECT 1 FROM custom_tasks
      WHERE user_id = uid
        AND google_event_id = e->>'google_event_id'
        AND is_deleted = false
    ) INTO already_exists;

    INSERT INTO custom_tasks (user_id, label, icon, xp, is_default, specific_date, google_event_id, event_time)
    VALUES (
      uid,
      e->>'label',
      '📅',
      10,
      false,
      e->>'specific_date',
      e->>'google_event_id',
      e->>'event_time'
    )
    ON CONFLICT (user_id, google_event_id) WHERE google_event_id IS NOT NULL
    DO UPDATE SET label = EXCLUDED.label, event_time = EXCLUDED.event_time;

    -- Only return genuinely new rows (not updates to existing ones)
    IF NOT already_exists THEN
      SELECT * INTO rec FROM custom_tasks
      WHERE user_id = uid AND google_event_id = e->>'google_event_id';
      RETURN NEXT rec;
    END IF;
  END LOOP;
END;
$$;
