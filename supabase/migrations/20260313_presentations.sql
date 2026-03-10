-- ══════════════════════════════════════════════════════════════════
-- Migration: Presentations table + add-on billing columns on teams
-- Date: 2026-03-13
-- ══════════════════════════════════════════════════════════════════

-- ┌──────────────────────────────────────────────────────────────┐
-- │ 1. PRESENTATIONS TABLE                                      │
-- └──────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS presentations (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id     UUID REFERENCES teams(id) ON DELETE SET NULL,
  title       TEXT NOT NULL DEFAULT 'Untitled Presentation',

  -- Input parameters (stored so user can re-generate)
  style       TEXT NOT NULL DEFAULT 'modern',
  theme       TEXT NOT NULL DEFAULT 'light',
  font        TEXT NOT NULL DEFAULT 'sans-serif',
  color_scheme TEXT NOT NULL DEFAULT 'blue',
  content     TEXT NOT NULL,

  -- Generated output
  html        TEXT,
  slide_count INT DEFAULT 0,

  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS presentations_user_id_idx
  ON presentations (user_id);
CREATE INDEX IF NOT EXISTS presentations_created_at_idx
  ON presentations (created_at DESC);

-- ┌──────────────────────────────────────────────────────────────┐
-- │ 2. ROW LEVEL SECURITY — private only                        │
-- └──────────────────────────────────────────────────────────────┘

ALTER TABLE presentations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "presentations_select_own" ON presentations;
CREATE POLICY "presentations_select_own"
  ON presentations FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "presentations_insert_own" ON presentations;
CREATE POLICY "presentations_insert_own"
  ON presentations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "presentations_update_own" ON presentations;
CREATE POLICY "presentations_update_own"
  ON presentations FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "presentations_delete_own" ON presentations;
CREATE POLICY "presentations_delete_own"
  ON presentations FOR DELETE
  USING (auth.uid() = user_id);

-- Admin bypass
DROP POLICY IF EXISTS "presentations_admin_all" ON presentations;
CREATE POLICY "presentations_admin_all"
  ON presentations FOR ALL
  USING (is_platform_admin());

-- ┌──────────────────────────────────────────────────────────────┐
-- │ 3. ADD-ON BILLING COLUMNS ON TEAMS                          │
-- └──────────────────────────────────────────────────────────────┘

ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS presentations_addon_status TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS presentations_stripe_subscription_id TEXT DEFAULT NULL;

CREATE INDEX IF NOT EXISTS teams_presentations_stripe_sub_idx
  ON teams (presentations_stripe_subscription_id)
  WHERE presentations_stripe_subscription_id IS NOT NULL;
