-- ══════════════════════════════════════════════════════════════════════════════
-- Migration: Add decrement_ai_credit RPC
-- Date: 2026-03-07
-- Purpose: Allows the ai-assistant edge function to roll back a reserved
--          credit when the Claude API call fails (502, timeout, etc.)
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION decrement_ai_credit(user_id_param UUID)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE profiles
  SET ai_credits_used = GREATEST(0, COALESCE(ai_credits_used, 0) - 1)
  WHERE id = user_id_param;
$$;

COMMENT ON FUNCTION decrement_ai_credit IS
  'Atomically decrements ai_credits_used by 1 (floor 0). '
  'Called by ai-assistant edge function to roll back a reserved credit '
  'when the Claude API call fails after optimistic increment.';
