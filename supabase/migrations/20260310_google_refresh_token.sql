-- ══════════════════════════════════════════════════════════════════════════════
-- Migration: Add Google OAuth refresh token column + protect it
-- Date: 2026-03-10
-- Purpose: Store Google Calendar refresh tokens server-side so the connection
--          persists across devices and survives logouts. Only the google-auth
--          edge function (service_role) can write this column.
-- ══════════════════════════════════════════════════════════════════════════════

-- 1. Add column for Google OAuth refresh token
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS google_refresh_token TEXT;

COMMENT ON COLUMN profiles.google_refresh_token IS
  'Google OAuth2 refresh token for Calendar API. Written only by the google-auth '
  'edge function (service_role). Never exposed to the client via RLS.';

-- 2. Update the privileged-columns trigger to also protect google_refresh_token
CREATE OR REPLACE FUNCTION protect_privileged_profile_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- service_role bypasses RLS and has auth.uid() = NULL → allow all changes
  IF auth.uid() IS NOT NULL THEN
    -- Client request: silently preserve privileged columns
    NEW.app_role                := OLD.app_role;
    NEW.billing_status          := OLD.billing_status;
    NEW.plan                    := OLD.plan;
    NEW.stripe_customer_id      := OLD.stripe_customer_id;
    NEW.stripe_subscription_id  := OLD.stripe_subscription_id;
    NEW.ai_credits_used         := OLD.ai_credits_used;
    NEW.ai_credits_reset        := OLD.ai_credits_reset;
    NEW.email                   := OLD.email;
    NEW.google_refresh_token    := OLD.google_refresh_token;
  END IF;
  RETURN NEW;
END;
$$;
