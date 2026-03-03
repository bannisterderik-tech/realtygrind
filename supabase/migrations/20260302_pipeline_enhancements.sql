-- Pipeline enhancements: listing dates, deal side tracking, offer lead source
-- Run via: supabase db push  (or paste in SQL editor)

-- Listing contract dates
ALTER TABLE listings ADD COLUMN IF NOT EXISTS list_date DATE;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS expires_date DATE;

-- Track buyer/seller side and original lead source on transactions (for closed deals)
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS deal_side TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS original_lead_source TEXT;
