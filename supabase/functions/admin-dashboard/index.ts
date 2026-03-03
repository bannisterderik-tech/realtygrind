// supabase/functions/admin-dashboard/index.ts
// Platform admin dashboard — returns platform-wide stats and full user list.
// Auth: JWT + app_role='admin' verification via service role.
//
// Required Supabase secrets (all set automatically):
//   SUPABASE_SERVICE_ROLE_KEY
//   SUPABASE_ANON_KEY

import { createClient } from 'npm:@supabase/supabase-js@2'

const PROD_ORIGINS = [
  'https://realtygrind.vercel.app',
]
const DEV_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:4173',
]
const ALLOWED_ORIGINS = Deno.env.get('ENVIRONMENT') === 'production'
  ? PROD_ORIGINS
  : [...PROD_ORIGINS, ...DEV_ORIGINS]

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('Origin') || ''
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  }
}

const PLAN_PRICES: Record<string, number> = {
  solo: 29,
  team: 199,
  brokerage: 499,
}

function currentMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

Deno.serve(async (req) => {
  const CORS = getCorsHeaders(req)

  function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'GET' && req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const supabaseUrl    = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey        = Deno.env.get('SUPABASE_ANON_KEY')!

    // ── 1. Auth: verify JWT ─────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401)

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data: { user }, error: authErr } = await userClient.auth.getUser()
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401)

    // ── 2. Admin client + role check ────────────────────────────────────────
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: callerProfile } = await admin
      .from('profiles')
      .select('app_role')
      .eq('id', user.id)
      .single()

    if (callerProfile?.app_role !== 'admin') {
      return json({ error: 'Forbidden: admin access required' }, 403)
    }

    // ── 3. Fetch all profiles (service role bypasses RLS) ───────────────────
    const { data: profiles, error: profilesErr } = await admin
      .from('profiles')
      .select('id, full_name, email, plan, billing_status, xp, streak, team_id, ai_credits_used, ai_credits_reset, stripe_customer_id, stripe_subscription_id, app_role')
      .order('xp', { ascending: false })

    if (profilesErr) {
      console.error('profiles query error:', profilesErr)
      return json({ error: 'Failed to fetch user data' }, 500)
    }

    // ── 4. Fetch team names for display ─────────────────────────────────────
    const { data: teams } = await admin
      .from('teams')
      .select('id, name, created_by')

    const teamMap: Record<string, string> = {}
    for (const t of (teams || [])) {
      teamMap[t.id] = t.name || 'Unnamed Team'
    }

    const allProfiles = profiles || []
    const month = currentMonth()

    // ── 5. Compute aggregate stats ──────────────────────────────────────────
    const byPlan: Record<string, number> = { solo: 0, team: 0, brokerage: 0, free: 0 }
    const byBilling: Record<string, number> = { active: 0, trialing: 0, past_due: 0, cancelled: 0, free: 0 }
    let mrrEstimate = 0
    let aiCreditsTotal = 0
    let aiCreditsThisMonth = 0

    for (const p of allProfiles) {
      const planKey = p.plan || 'free'
      byPlan[planKey] = (byPlan[planKey] || 0) + 1

      const billingKey = p.billing_status || 'free'
      byBilling[billingKey] = (byBilling[billingKey] || 0) + 1

      if (p.billing_status === 'active' || p.billing_status === 'trialing') {
        mrrEstimate += PLAN_PRICES[p.plan] || 0
      }

      aiCreditsTotal += p.ai_credits_used || 0
      if (p.ai_credits_reset === month) {
        aiCreditsThisMonth += p.ai_credits_used || 0
      }
    }

    const teamIds = new Set(allProfiles.map(p => p.team_id).filter(Boolean))

    const stats = {
      total_users:           allProfiles.length,
      by_plan:               byPlan,
      by_billing:            byBilling,
      paying_users:          (byBilling.active || 0) + (byBilling.trialing || 0),
      mrr_estimate:          mrrEstimate,
      trial_count:           byBilling.trialing || 0,
      ai_credits_used_total: aiCreditsTotal,
      ai_credits_this_month: aiCreditsThisMonth,
      total_teams:           teamIds.size,
    }

    // ── 6. Enrich users with team name ──────────────────────────────────────
    const users = allProfiles.map(p => ({
      ...p,
      team_name: p.team_id ? (teamMap[p.team_id] || null) : null,
    }))

    return json({ stats, users })

  } catch (err) {
    console.error('admin-dashboard error:', err)
    return json({ error: 'An unexpected error occurred.' }, 500)
  }
})
