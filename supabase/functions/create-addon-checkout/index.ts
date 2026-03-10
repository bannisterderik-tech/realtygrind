// supabase/functions/create-addon-checkout/index.ts
// Creates a Stripe Checkout session for an add-on subscription (e.g. Presentation Builder).
// Only team owners with an active base plan can purchase add-ons.
//
// Required Supabase secrets:
//   STRIPE_SECRET_KEY                    — sk_live_... or sk_test_...
//   STRIPE_PRICE_PRESENTATIONS_MONTHLY   — price_...
//   STRIPE_PRICE_PRESENTATIONS_ANNUAL    — price_...

import Stripe from 'npm:stripe@14'
import { createClient } from 'npm:@supabase/supabase-js@2'

const PROD_ORIGINS = [
  'https://realtygrind.co',
  'https://www.realtygrind.co',
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
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}

function getSafeReturnUrl(returnUrl: string | undefined): string {
  const fallback = Deno.env.get('APP_URL') || 'https://realtygrind.co'
  if (!returnUrl) return fallback
  try {
    const parsed = new URL(returnUrl)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return fallback
    const allowed = (Deno.env.get('ALLOWED_ORIGINS') || 'realtygrind.co,realtygrind.vercel.app,localhost').split(',').map(s => s.trim())
    if (allowed.some(domain => parsed.hostname === domain || parsed.hostname.endsWith('.' + domain))) {
      return parsed.origin
    }
    return fallback
  } catch {
    return fallback
  }
}

const ADDON_PRICE_MAP: Record<string, string | undefined> = {
  presentations_monthly: Deno.env.get('STRIPE_PRICE_PRESENTATIONS_MONTHLY'),
  presentations_annual:  Deno.env.get('STRIPE_PRICE_PRESENTATIONS_ANNUAL'),
}

Deno.serve(async (req) => {
  const CORS = getCorsHeaders(req)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing Authorization header' }),
        { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    const ct = req.headers.get('content-type') || ''
    if (!ct.includes('application/json')) {
      return new Response(
        JSON.stringify({ error: 'Content-Type must be application/json' }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    let body: Record<string, unknown>
    try { body = await req.json() } catch { return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } }) }
    const { addonId, isAnnual, returnUrl } = body as { addonId: string; isAnnual: boolean; returnUrl?: string }

    if (addonId !== 'presentations') {
      return new Response(
        JSON.stringify({ error: 'Invalid addonId' }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Fetch profile + team to validate ownership
    const { data: profile } = await admin
      .from('profiles')
      .select('*, teams(id, created_by, presentations_addon_status)')
      .eq('id', user.id)
      .single()

    if (!profile) {
      return new Response(
        JSON.stringify({ error: 'Profile not found' }),
        { status: 404, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    // Must be a team owner
    if (!profile.team_id || profile.teams?.created_by !== user.id) {
      return new Response(
        JSON.stringify({ error: 'Only team owners can purchase add-ons.' }),
        { status: 403, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    // Must have an active base plan
    const billing = profile.billing_status
    if (billing !== 'active' && billing !== 'trialing') {
      return new Response(
        JSON.stringify({ error: 'An active subscription is required to purchase add-ons.' }),
        { status: 403, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    // Check if already active
    if (profile.teams?.presentations_addon_status === 'active' || profile.teams?.presentations_addon_status === 'trialing') {
      return new Response(
        JSON.stringify({ error: 'Presentation Builder add-on is already active.' }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    const key = `presentations_${isAnnual ? 'annual' : 'monthly'}`
    const priceId = ADDON_PRICE_MAP[key]
    if (!priceId) {
      console.error(`Missing price config for key: ${key}. Set the STRIPE_PRICE_PRESENTATIONS_* secrets.`)
      return new Response(
        JSON.stringify({ error: 'This add-on is not available right now. Please try again later.' }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
      apiVersion: '2024-04-10',
    })

    const existingCustomer = profile.stripe_customer_id

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      ...(existingCustomer
        ? { customer: existingCustomer }
        : user.email ? { customer_email: user.email } : {}),
      client_reference_id: user.id,
      success_url: `${getSafeReturnUrl(returnUrl)}?checkout=success&addon=${encodeURIComponent(addonId)}`,
      cancel_url:  `${getSafeReturnUrl(returnUrl)}?checkout=cancelled`,
      allow_promotion_codes: true,
      subscription_data: {
        metadata: {
          addonId,
          teamId: profile.team_id,
          userId: user.id,
          source: 'realtygrind',
        },
      },
    })

    return new Response(
      JSON.stringify({ url: session.url }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  } catch (err: unknown) {
    console.error('create-addon-checkout error:', err)
    return new Response(
      JSON.stringify({ error: 'Checkout is temporarily unavailable. Please try again.' }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }
})
