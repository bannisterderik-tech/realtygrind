-- ══════════════════════════════════════════════════════════════════════════════
-- Migration: TC Milestones / Transaction Stages
-- Date: 2026-03-27
-- Purpose: Add structured milestone tracking for TC deals — stage progression,
--          key deadlines, conditions tracking, and extension filing.
-- ══════════════════════════════════════════════════════════════════════════════

-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ 1. Add tc_milestones JSONB column to transactions                       │
-- │    Stores: stage, key deadlines, conditions, extensions                 │
-- │    Structure:                                                            │
-- │    {                                                                     │
-- │      "stage": "ratified",                                               │
-- │      "close_date": "2026-04-15",                                        │
-- │      "inspection_deadline": "2026-03-25",                               │
-- │      "appraisal_deadline": "2026-04-01",                                │
-- │      "financing_deadline": "2026-04-10",                                │
-- │      "conditions_added": false,                                         │
-- │      "conditions_cleared": false,                                       │
-- │      "extension_filed": false,                                          │
-- │      "extension_new_date": null,                                        │
-- │      "extension_notes": "",                                             │
-- │      "closed_at": null,                                                 │
-- │      "fallen_through": false,                                           │
-- │      "fallen_through_reason": ""                                        │
-- │    }                                                                     │
-- └──────────────────────────────────────────────────────────────────────────┘

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS tc_milestones JSONB DEFAULT '{}'::jsonb;

-- No additional RLS needed — existing TC UPDATE policy on transactions
-- already allows TCs to update any column on deals assigned to them.
