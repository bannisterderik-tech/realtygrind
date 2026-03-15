-- ══════════════════════════════════════════════════════════════════════════════
-- Migration: Add 'tc' to team_members role check constraint
-- Date: 2026-03-24
-- Purpose: The existing CHECK constraint on team_members.role only allows
--          'owner' and 'member'. Add 'tc' for transaction coordinators.
-- ══════════════════════════════════════════════════════════════════════════════

-- Drop the existing check constraint and recreate with 'tc' included
ALTER TABLE team_members DROP CONSTRAINT IF EXISTS team_members_role_check;
ALTER TABLE team_members ADD CONSTRAINT team_members_role_check
  CHECK (role IN ('owner', 'member', 'tc'));
