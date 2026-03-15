-- ══════════════════════════════════════════════════════════════════════════════
-- Migration: Mortgage Rates Cache Table
-- Date: 2026-03-28
-- Purpose: National average mortgage rates, cached daily. One row updated by
--          the fetch-mortgage-rates edge function. Read by all authenticated users.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS mortgage_rates (
  id           INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),   -- singleton row
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  conventional_30  NUMERIC(5,3),   -- e.g. 6.875
  conventional_15  NUMERIC(5,3),
  fha_30           NUMERIC(5,3),
  va_30            NUMERIC(5,3),
  dscr             NUMERIC(5,3),
  jumbo_30         NUMERIC(5,3),
  source           TEXT DEFAULT 'FRED PMMS',
  raw_json         JSONB DEFAULT '{}'::jsonb   -- full API response for debugging
);

-- Seed the singleton row so upsert works
INSERT INTO mortgage_rates (id) VALUES (1) ON CONFLICT DO NOTHING;

-- RLS: any authenticated user can read
ALTER TABLE mortgage_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read mortgage rates"
  ON mortgage_rates FOR SELECT
  TO authenticated
  USING (true);

-- Only service_role (edge functions) can update
CREATE POLICY "Service role can update mortgage rates"
  ON mortgage_rates FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);
