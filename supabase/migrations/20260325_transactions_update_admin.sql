-- ══════════════════════════════════════════════════════════════════════════════
-- Migration: Allow platform admins to update any transaction (for TC assignment)
-- Date: 2026-03-25
-- ══════════════════════════════════════════════════════════════════════════════

-- Existing policy only allows user_id = auth.uid(). Platform admins need to
-- update tc_id/tc_checklist on any team member's transactions.
DROP POLICY IF EXISTS "transactions_update_admin" ON transactions;
CREATE POLICY "transactions_update_admin"
  ON transactions FOR UPDATE
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());
