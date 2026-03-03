-- ══════════════════════════════════════════════════════════════════════════════
-- Migration: Protect privileged columns from client-side tampering
-- Date: 2026-03-08
-- Purpose: CRITICAL SECURITY FIX — prevent authenticated users from modifying
--          admin role, billing status, plan, Stripe IDs, or AI credits via
--          direct Supabase client updates. These columns may only be changed
--          by service_role (edge functions, webhooks, admin operations).
-- ══════════════════════════════════════════════════════════════════════════════

-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ 1. BEFORE UPDATE trigger: preserve privileged columns                   │
-- │    When auth.uid() is present (client request), privileged columns are  │
-- │    silently reset to their OLD values — the UPDATE succeeds but only   │
-- │    non-privileged columns are changed.                                  │
-- │    When auth.uid() is NULL (service_role), all columns are writable.   │
-- └──────────────────────────────────────────────────────────────────────────┘

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
  END IF;
  RETURN NEW;
END;
$$;

-- Drop if exists to make migration re-runnable
DROP TRIGGER IF EXISTS protect_privileged_columns ON profiles;

CREATE TRIGGER protect_privileged_columns
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION protect_privileged_profile_columns();

COMMENT ON FUNCTION protect_privileged_profile_columns IS
  'Prevents client-side tampering with admin role, billing, Stripe, and credit '
  'columns. Only service_role (edge functions) can modify these fields. '
  'Client UPDATE requests silently preserve the old values.';
