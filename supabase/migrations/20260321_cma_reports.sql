-- CMA Reports table + team add-on columns
-- Stores AI-generated Comparative Market Analysis reports

-- ── Add CMA add-on columns to teams ─────────────────────────────────────────
ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS cma_addon_status TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS cma_stripe_subscription_id TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS cma_generations_used INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cma_generations_reset TEXT DEFAULT NULL;

-- ── CMA Reports table ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cma_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
  subject_address TEXT NOT NULL,
  subject_data JSONB DEFAULT '{}'::jsonb,
  comps_raw JSONB DEFAULT '[]'::jsonb,
  comps_analyzed JSONB DEFAULT '[]'::jsonb,
  pricing_strategy JSONB DEFAULT '{}'::jsonb,
  market_context JSONB DEFAULT '{}'::jsonb,
  html TEXT,
  status TEXT NOT NULL DEFAULT 'generating',
  style TEXT NOT NULL DEFAULT 'modern',
  theme TEXT NOT NULL DEFAULT 'light',
  color_scheme TEXT NOT NULL DEFAULT '#2563eb',
  search_radius NUMERIC DEFAULT 2,
  days_back INT DEFAULT 180,
  max_comps INT DEFAULT 15,
  property_type TEXT DEFAULT 'Single Family',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Indexes ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_cma_reports_user_id ON cma_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_cma_reports_team_id ON cma_reports(team_id);
CREATE INDEX IF NOT EXISTS idx_cma_reports_created_at ON cma_reports(created_at DESC);

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE cma_reports ENABLE ROW LEVEL SECURITY;

-- Users can read their own reports
CREATE POLICY cma_reports_select ON cma_reports
  FOR SELECT USING (auth.uid() = user_id);

-- Users can insert their own reports
CREATE POLICY cma_reports_insert ON cma_reports
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own reports
CREATE POLICY cma_reports_update ON cma_reports
  FOR UPDATE USING (auth.uid() = user_id);

-- Users can delete their own reports
CREATE POLICY cma_reports_delete ON cma_reports
  FOR DELETE USING (auth.uid() = user_id);

-- Service role bypass (for edge functions)
CREATE POLICY cma_reports_service ON cma_reports
  FOR ALL USING (auth.role() = 'service_role');
