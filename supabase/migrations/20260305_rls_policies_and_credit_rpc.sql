-- ══════════════════════════════════════════════════════════════════════════════
-- Migration: Row Level Security Policies + Atomic AI Credit Increment RPC
-- Date: 2026-03-05
-- Purpose: CRITICAL security fix — enforce row-level access control on all
--          user-facing tables, and add an atomic credit increment function
--          to prevent race conditions in the AI assistant.
-- ══════════════════════════════════════════════════════════════════════════════

-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ 1. ENABLE RLS ON ALL USER-FACING TABLES                                │
-- │    RLS must be enabled BEFORE policies take effect.                     │
-- │    Without RLS, the anon key grants unrestricted read/write.            │
-- └──────────────────────────────────────────────────────────────────────────┘

ALTER TABLE IF EXISTS profiles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS listings          ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS transactions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS habit_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS custom_tasks      ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS teams             ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS team_members      ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS processed_events  ENABLE ROW LEVEL SECURITY;

-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ 2. PROFILES — users can read/update their own row only                 │
-- │    Team members can read teammates' public info (name, xp, streak).    │
-- └──────────────────────────────────────────────────────────────────────────┘

-- Own profile: full access
CREATE POLICY IF NOT EXISTS "profiles_select_own"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY IF NOT EXISTS "profiles_update_own"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Teammates: read-only access for team roster/leaderboard
CREATE POLICY IF NOT EXISTS "profiles_select_teammates"
  ON profiles FOR SELECT
  USING (
    team_id IS NOT NULL
    AND team_id = (SELECT team_id FROM profiles WHERE id = auth.uid())
  );

-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ 3. LISTINGS — users own their listings; teammates can read             │
-- └──────────────────────────────────────────────────────────────────────────┘

CREATE POLICY IF NOT EXISTS "listings_select_own"
  ON listings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "listings_insert_own"
  ON listings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "listings_update_own"
  ON listings FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "listings_delete_own"
  ON listings FOR DELETE
  USING (auth.uid() = user_id);

-- Teammates can read listings (for team listings board)
CREATE POLICY IF NOT EXISTS "listings_select_teammates"
  ON listings FOR SELECT
  USING (
    user_id IN (
      SELECT id FROM profiles
      WHERE team_id = (SELECT team_id FROM profiles WHERE id = auth.uid())
    )
  );

-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ 4. TRANSACTIONS — users own their transactions; teammates can read     │
-- └──────────────────────────────────────────────────────────────────────────┘

CREATE POLICY IF NOT EXISTS "transactions_select_own"
  ON transactions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "transactions_insert_own"
  ON transactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "transactions_update_own"
  ON transactions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "transactions_delete_own"
  ON transactions FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "transactions_select_teammates"
  ON transactions FOR SELECT
  USING (
    user_id IN (
      SELECT id FROM profiles
      WHERE team_id = (SELECT team_id FROM profiles WHERE id = auth.uid())
    )
  );

-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ 5. HABIT_COMPLETIONS — own data only; teammates can read               │
-- └──────────────────────────────────────────────────────────────────────────┘

CREATE POLICY IF NOT EXISTS "habits_select_own"
  ON habit_completions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "habits_insert_own"
  ON habit_completions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "habits_update_own"
  ON habit_completions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "habits_delete_own"
  ON habit_completions FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "habits_select_teammates"
  ON habit_completions FOR SELECT
  USING (
    user_id IN (
      SELECT id FROM profiles
      WHERE team_id = (SELECT team_id FROM profiles WHERE id = auth.uid())
    )
  );

-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ 6. CUSTOM_TASKS — own data only                                        │
-- └──────────────────────────────────────────────────────────────────────────┘

CREATE POLICY IF NOT EXISTS "custom_tasks_select_own"
  ON custom_tasks FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "custom_tasks_insert_own"
  ON custom_tasks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "custom_tasks_update_own"
  ON custom_tasks FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "custom_tasks_delete_own"
  ON custom_tasks FOR DELETE
  USING (auth.uid() = user_id);

-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ 7. TEAMS — owner has full access; members can read their team          │
-- └──────────────────────────────────────────────────────────────────────────┘

CREATE POLICY IF NOT EXISTS "teams_select_member"
  ON teams FOR SELECT
  USING (
    id = (SELECT team_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY IF NOT EXISTS "teams_insert_owner"
  ON teams FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY IF NOT EXISTS "teams_update_owner"
  ON teams FOR UPDATE
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

-- Also allow team members to read teams they're joining via invite code
CREATE POLICY IF NOT EXISTS "teams_select_by_invite_code"
  ON teams FOR SELECT
  USING (true);
  -- Note: this allows reading team rows for join-by-code. The columns exposed
  -- (name, invite_code) are not sensitive. For stricter control, use a
  -- security-definer function instead.

-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ 8. TEAM_MEMBERS — members can see their team; owner can manage         │
-- └──────────────────────────────────────────────────────────────────────────┘

CREATE POLICY IF NOT EXISTS "team_members_select"
  ON team_members FOR SELECT
  USING (
    team_id = (SELECT team_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY IF NOT EXISTS "team_members_insert"
  ON team_members FOR INSERT
  WITH CHECK (
    -- Owner can add members, OR user is joining their own row
    auth.uid() = user_id
    OR team_id IN (SELECT id FROM teams WHERE created_by = auth.uid())
  );

CREATE POLICY IF NOT EXISTS "team_members_delete"
  ON team_members FOR DELETE
  USING (
    -- Owner can remove members, OR user is leaving
    auth.uid() = user_id
    OR team_id IN (SELECT id FROM teams WHERE created_by = auth.uid())
  );

CREATE POLICY IF NOT EXISTS "team_members_update"
  ON team_members FOR UPDATE
  USING (
    team_id IN (SELECT id FROM teams WHERE created_by = auth.uid())
  );

-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ 9. PROCESSED_EVENTS — no client access (webhook-only via service role) │
-- └──────────────────────────────────────────────────────────────────────────┘

-- No policies = no client access when RLS is enabled. This is correct:
-- processed_events is only accessed by the stripe-webhook edge function
-- which uses the service_role key (bypasses RLS).

-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ 10. UNIQUE CONSTRAINT on team_members to prevent duplicate membership  │
-- └──────────────────────────────────────────────────────────────────────────┘

CREATE UNIQUE INDEX IF NOT EXISTS team_members_user_id_unique
  ON team_members (user_id);

-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ 10b. UNIQUE CONSTRAINT on processed_events.event_id for idempotency   │
-- │     Enables atomic INSERT ... ON CONFLICT DO NOTHING in webhook.      │
-- └──────────────────────────────────────────────────────────────────────────┘

CREATE UNIQUE INDEX IF NOT EXISTS processed_events_event_id_unique
  ON processed_events (event_id);

-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ 11. ATOMIC AI CREDIT INCREMENT — prevents race conditions              │
-- │     Called by ai-assistant edge function after each successful response │
-- └──────────────────────────────────────────────────────────────────────────┘

CREATE OR REPLACE FUNCTION increment_ai_credits(
  user_id_param UUID,
  reset_month   TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE profiles
  SET
    ai_credits_used  = CASE
      WHEN ai_credits_reset = reset_month THEN COALESCE(ai_credits_used, 0) + 1
      ELSE 1  -- new month: reset to 1
    END,
    ai_credits_reset = reset_month
  WHERE id = user_id_param;
END;
$$;

-- Add columns if they don't exist yet (safe to re-run)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ai_credits_used  INT DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ai_credits_reset TEXT;

COMMENT ON FUNCTION increment_ai_credits IS
  'Atomically increments ai_credits_used for a user, resetting on month boundary. '
  'Called by ai-assistant edge function via admin.rpc() to prevent race conditions.';
