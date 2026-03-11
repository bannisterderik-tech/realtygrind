-- Allow team owners to delete any listing belonging to a member of their team.
-- Uses SECURITY DEFINER helper get_my_team_id() to avoid recursive RLS on profiles.

DROP POLICY IF EXISTS "listings_delete_team_owner" ON listings;
CREATE POLICY "listings_delete_team_owner"
  ON listings FOR DELETE
  USING (
    -- The listing's owner must be on the same team as the caller
    user_id IN (SELECT id FROM profiles WHERE team_id = get_my_team_id())
    -- And the caller must be the team's created_by (owner)
    AND EXISTS (
      SELECT 1 FROM teams WHERE id = get_my_team_id() AND created_by = auth.uid()
    )
  );
