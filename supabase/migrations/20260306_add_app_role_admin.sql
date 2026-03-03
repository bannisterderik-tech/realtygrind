-- ══════════════════════════════════════════════════════════════════════════════
-- Migration: Add app_role column for platform admin access
-- Date: 2026-03-06
-- Purpose: Add app_role TEXT column to profiles, seed admin user, add RLS
--          policy allowing admins to read all profiles.
-- ══════════════════════════════════════════════════════════════════════════════

-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ 1. Add app_role column                                                  │
-- └──────────────────────────────────────────────────────────────────────────┘

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS app_role TEXT DEFAULT NULL;

COMMENT ON COLUMN profiles.app_role IS
  'Platform-level role: NULL = regular user, admin = platform owner/operator';

-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ 2. Grant admin role to the platform owner                               │
-- └──────────────────────────────────────────────────────────────────────────┘

UPDATE profiles
SET app_role = 'admin'
WHERE email = 'derik@theoperativegroup.com';

-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ 3. Helper: is_platform_admin() — SECURITY DEFINER                      │
-- │    Used in RLS policies to check if the caller is a platform admin.    │
-- └──────────────────────────────────────────────────────────────────────────┘

CREATE OR REPLACE FUNCTION is_platform_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND app_role = 'admin'
  );
$$;

-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ 4. RLS: platform admins can read all profiles                           │
-- │    Defense-in-depth — the edge function uses service_role key anyway.  │
-- └──────────────────────────────────────────────────────────────────────────┘

DROP POLICY IF EXISTS "profiles_select_admin" ON profiles;
CREATE POLICY "profiles_select_admin"
  ON profiles FOR SELECT
  USING (is_platform_admin());

-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ 5. Partial index for fast app_role lookups                              │
-- └──────────────────────────────────────────────────────────────────────────┘

CREATE INDEX IF NOT EXISTS profiles_app_role_idx
  ON profiles (app_role)
  WHERE app_role IS NOT NULL;
