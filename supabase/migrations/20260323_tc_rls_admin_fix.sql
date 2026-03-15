-- ══════════════════════════════════════════════════════════════════════════════
-- Migration: Fix team_members UPDATE RLS for platform admins
-- Date: 2026-03-22
-- Purpose: Allow platform admins to update team_members (e.g. assign TC roles)
--          in addition to the team owner.
-- ══════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "team_members_update" ON team_members;
CREATE POLICY "team_members_update"
  ON team_members FOR UPDATE
  USING (
    team_id IN (SELECT id FROM teams WHERE created_by = auth.uid())
    OR is_platform_admin()
  );
