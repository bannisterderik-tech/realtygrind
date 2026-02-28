-- Add Stripe billing columns to profiles
-- Run this in Supabase Dashboard → SQL Editor, or via `supabase db push`

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS plan                  TEXT,
  ADD COLUMN IF NOT EXISTS billing_status        TEXT DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS stripe_customer_id    TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;

-- Index for webhook lookups by stripe_customer_id
CREATE INDEX IF NOT EXISTS profiles_stripe_customer_id_idx
  ON profiles (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

-- Index for webhook lookups by email
CREATE INDEX IF NOT EXISTS profiles_email_idx
  ON profiles (email)
  WHERE email IS NOT NULL;

COMMENT ON COLUMN profiles.plan IS 'Stripe plan: solo | team | brokerage';
COMMENT ON COLUMN profiles.billing_status IS 'free | trialing | active | past_due | cancelled';
COMMENT ON COLUMN profiles.stripe_customer_id IS 'Stripe customer ID (cus_...)';
COMMENT ON COLUMN profiles.stripe_subscription_id IS 'Stripe subscription ID (sub_...)';
