-- ══════════════════════════════════════════════════════════════════════════════
-- Migration: RPC to auto-assign pending deals to a TC
-- Date: 2026-03-26
-- Purpose: When a TC loads their dashboard, call this function to assign
--          any unassigned pending deals from their team to them.
--          Uses SECURITY DEFINER to bypass RLS since TCs can't see
--          unassigned transactions (tc_id is NULL, not their uid).
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION assign_pending_deals_to_tc()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  caller_team_id UUID;
  caller_role TEXT;
  default_checklist JSONB;
  assigned_count INTEGER := 0;
BEGIN
  -- Get caller's team and role
  SELECT p.team_id, tm.role INTO caller_team_id, caller_role
  FROM profiles p
  JOIN team_members tm ON tm.user_id = p.id AND tm.team_id = p.team_id
  WHERE p.id = auth.uid();

  -- Only TCs can self-assign
  IF caller_role != 'tc' OR caller_team_id IS NULL THEN
    RETURN 0;
  END IF;

  -- Default TC checklist
  default_checklist := '[
    {"label":"Open escrow / title order","done":false,"dueDate":null},
    {"label":"Confirm earnest money deposit","done":false,"dueDate":null},
    {"label":"Send executed contract to all parties","done":false,"dueDate":null},
    {"label":"Order home inspection","done":false,"dueDate":null},
    {"label":"Review inspection report","done":false,"dueDate":null},
    {"label":"Negotiate inspection repairs","done":false,"dueDate":null},
    {"label":"Confirm inspection resolution","done":false,"dueDate":null},
    {"label":"Order appraisal","done":false,"dueDate":null},
    {"label":"Review appraisal results","done":false,"dueDate":null},
    {"label":"Resolve appraisal issues (if any)","done":false,"dueDate":null},
    {"label":"Verify buyer loan approval / underwriting","done":false,"dueDate":null},
    {"label":"Track loan conditions & docs","done":false,"dueDate":null},
    {"label":"Confirm clear-to-close from lender","done":false,"dueDate":null},
    {"label":"Order title search / review title commitment","done":false,"dueDate":null},
    {"label":"Resolve title exceptions","done":false,"dueDate":null},
    {"label":"Confirm HOA docs received (if applicable)","done":false,"dueDate":null},
    {"label":"Verify seller disclosures complete","done":false,"dueDate":null},
    {"label":"Confirm home warranty ordered (if applicable)","done":false,"dueDate":null},
    {"label":"Schedule final walkthrough","done":false,"dueDate":null},
    {"label":"Confirm final walkthrough completed","done":false,"dueDate":null},
    {"label":"Review closing disclosure / settlement statement","done":false,"dueDate":null},
    {"label":"Confirm all parties signed closing docs","done":false,"dueDate":null},
    {"label":"Verify funds wired / received","done":false,"dueDate":null},
    {"label":"Confirm recording of deed","done":false,"dueDate":null},
    {"label":"Distribute keys / access to buyer","done":false,"dueDate":null},
    {"label":"Send closing package to agent","done":false,"dueDate":null},
    {"label":"File transaction in compliance system","done":false,"dueDate":null}
  ]'::jsonb;

  -- Assign all unassigned pending deals from team members to this TC
  UPDATE transactions
  SET tc_id = auth.uid(),
      tc_checklist = default_checklist
  WHERE tc_id IS NULL
    AND type = 'pending'
    AND status != 'archived'
    AND user_id IN (SELECT id FROM profiles WHERE team_id = caller_team_id);

  GET DIAGNOSTICS assigned_count = ROW_COUNT;
  RETURN assigned_count;
END;
$$;

COMMENT ON FUNCTION assign_pending_deals_to_tc IS
  'Auto-assigns unassigned pending deals from the TC''s team to them. Returns count of deals assigned.';
