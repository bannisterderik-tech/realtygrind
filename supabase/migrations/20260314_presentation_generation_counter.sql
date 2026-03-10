-- ══════════════════════════════════════════════════════════════════
-- Migration: Presentation generation counter on teams table
-- Date: 2026-03-14
-- Tracks total generations per month (not affected by deletions)
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS pres_generations_used INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pres_generations_reset TEXT DEFAULT NULL;
