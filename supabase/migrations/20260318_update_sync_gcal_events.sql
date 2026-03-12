-- Update sync_gcal_events to accept and store event_time
CREATE OR REPLACE FUNCTION sync_gcal_events(events jsonb)
RETURNS SETOF custom_tasks
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  uid uuid := auth.uid();
  e jsonb;
  rec custom_tasks;
BEGIN
  FOR e IN SELECT * FROM jsonb_array_elements(events)
  LOOP
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
    DO UPDATE SET label = EXCLUDED.label, event_time = EXCLUDED.event_time
    RETURNING * INTO rec;
    -- Only return newly inserted rows (not updates that already existed)
    IF FOUND THEN
      RETURN NEXT rec;
    END IF;
  END LOOP;
END;
$$;
