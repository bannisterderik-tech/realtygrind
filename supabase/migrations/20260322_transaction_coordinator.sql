-- ══════════════════════════════════════════════════════════════════════════════
-- Migration: Transaction Coordinator (TC) Support
-- Date: 2026-03-22
-- Purpose: Allow team/brokerage owners to add TC seats. TCs see all pending
--          deals assigned to them across the team, with enhanced checklists.
-- ══════════════════════════════════════════════════════════════════════════════

-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ 1. Add tc_id column to transactions                                     │
-- │    Links a pending deal to its assigned transaction coordinator.         │
-- └──────────────────────────────────────────────────────────────────────────┘

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS tc_id UUID REFERENCES profiles(id);

-- Index for fast lookup of deals assigned to a TC
CREATE INDEX IF NOT EXISTS idx_transactions_tc_id ON transactions (tc_id) WHERE tc_id IS NOT NULL;

-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ 2. Add tc_checklist column to transactions                              │
-- │    Separate from the agent's checklist — TC has their own task list.    │
-- └──────────────────────────────────────────────────────────────────────────┘

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS tc_checklist JSONB DEFAULT '[]'::jsonb;

-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ 3. RLS: Allow TCs to SELECT transactions assigned to them               │
-- └──────────────────────────────────────────────────────────────────────────┘

DROP POLICY IF EXISTS "transactions_select_tc" ON transactions;
CREATE POLICY "transactions_select_tc"
  ON transactions FOR SELECT
  USING (tc_id = auth.uid());

-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ 4. RLS: Allow TCs to UPDATE tc_checklist on transactions assigned to    │
-- │    them (they should NOT be able to modify agent fields like price,     │
-- │    address, commission, or the agent's own checklist).                  │
-- └──────────────────────────────────────────────────────────────────────────┘

DROP POLICY IF EXISTS "transactions_update_tc" ON transactions;
CREATE POLICY "transactions_update_tc"
  ON transactions FOR UPDATE
  USING (tc_id = auth.uid())
  WITH CHECK (tc_id = auth.uid());

-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ 5. RLS: Allow TCs to read profiles of team members (for deal context)  │
-- │    Already covered by profiles_select_teammates — TC is a team member. │
-- └──────────────────────────────────────────────────────────────────────────┘

-- No additional policy needed — TCs are team members and already have
-- teammate read access via profiles_select_teammates.

-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ 6. Allow team owners to UPDATE tc_id on any team transaction            │
-- │    (assign/reassign TC to deals)                                        │
-- └──────────────────────────────────────────────────────────────────────────┘

DROP POLICY IF EXISTS "transactions_update_team_owner" ON transactions;
CREATE POLICY "transactions_update_team_owner"
  ON transactions FOR UPDATE
  USING (
    user_id IN (SELECT id FROM profiles WHERE team_id = get_my_team_id())
    AND get_my_team_id() IN (SELECT id FROM teams WHERE created_by = auth.uid())
  )
  WITH CHECK (
    user_id IN (SELECT id FROM profiles WHERE team_id = get_my_team_id())
    AND get_my_team_id() IN (SELECT id FROM teams WHERE created_by = auth.uid())
  );

-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ 7. Helper: get_team_tcs() — returns TC user_ids for the caller's team  │
-- └──────────────────────────────────────────────────────────────────────────┘

CREATE OR REPLACE FUNCTION get_team_tcs()
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT user_id FROM team_members
  WHERE team_id = (SELECT team_id FROM profiles WHERE id = auth.uid())
    AND role = 'tc';
$$;

COMMENT ON FUNCTION get_team_tcs IS
  'Returns user_ids of all transaction coordinators in the calling user''s team.';
