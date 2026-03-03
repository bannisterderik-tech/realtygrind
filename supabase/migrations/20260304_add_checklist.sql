-- Transaction checklist: contract-to-close task tracking for pending deals
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS checklist JSONB DEFAULT '[]'::jsonb;
