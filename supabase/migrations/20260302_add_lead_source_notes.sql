-- Add lead_source to listings
ALTER TABLE listings ADD COLUMN IF NOT EXISTS lead_source text DEFAULT null;

-- Add lead_source to transactions
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS lead_source text DEFAULT null;

-- Add notes to listings (JSONB array of { text, ts } objects)
ALTER TABLE listings ADD COLUMN IF NOT EXISTS notes jsonb DEFAULT '[]'::jsonb;

-- Add notes to transactions (JSONB array of { text, ts } objects)
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS notes jsonb DEFAULT '[]'::jsonb;

-- Ensure created_at exists (Supabase adds this by default, but verify)
ALTER TABLE listings ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
