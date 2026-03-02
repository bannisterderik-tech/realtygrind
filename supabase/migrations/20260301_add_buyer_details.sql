-- Add buyer_details JSONB column to listings table
-- Used by buyer rep agreements (unit_count=0) to store financial info, agreement dates, and search criteria
-- Run this in Supabase Dashboard → SQL Editor, or via `supabase db push`

ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS buyer_details JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN listings.buyer_details IS 'JSONB for buyer rep details: preApproval, paymentRange, downPayment, lastCallDate, dateSigned, dateExpires, locationPrefs, mustHaves, niceToHaves, timeline';
