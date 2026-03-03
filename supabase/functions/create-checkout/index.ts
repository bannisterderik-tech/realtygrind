// supabase/functions/create-checkout/index.ts
// Creates a Stripe Checkout session and returns the hosted checkout URL.
//
// Required Supabase secrets (set via `supabase secrets set KEY=value`):
//   STRIPE_SECRET_KEY            — sk_live_... or sk_test_...
//   STRIPE_PRICE_SOLO_MONTHLY    — price_...
//   STRIPE_PRICE_SOLO_ANNUAL     — price_...
//   STRIPE_PRICE_TEAM_MONTHLY    — price_...
//   STRIPE_PRICE_TEAM_ANNUAL     — price_...
//   STRIPE_PRICE_BROKERAGE_MONTHLY — price_...
//   STRIPE_PRICE_BROKERAGE_ANNUAL  — price_...

import Stripe from 'npm:stripe@14'
import { createClient } from 'npm:@supabase/supabase-js@2'

const ALLOWED_ORIGIN = Deno.env.get('APP_ORIGIN') || 'https://realtygrind.com'
const CORS = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Validate returnUrl to prevent open redirects — only allow same-origin or known app URLs
function getSafeReturnUrl(returnUrl: string | undefined): string {
  const fallback = Deno.env.get('APP_URL') || 'https://realtygrind.com'
  if (!returnUrl) return fallback
  try {
    const parsed = new URL(returnUrl)
    // Only allow https and known origins
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return fallback
    const allowed = (Deno.env.get('ALLOWED_ORIGINS') || 'realtygrind.com,localhost').split(',').map(s => s.trim())
    if (allowed.some(domain => parsed.hostname === domain || parsed.hostname.endsWith('.' + domain))) {
      return parsed.origin
    }
    return fallback
  } catch {
    return fallback
  }
}

const PRICE_MAP: Record<string, string | undefined> = {
  solo_monthly:       Deno.env.get('STRIPE_PRICE_SOLO_MONTHLY'),
  solo_annual:        Deno.env.get('STRIPE_PRICE_SOLO_ANNUAL'),
  team_monthly:       Deno.env.get('STRIPE_PRICE_TEAM_MONTHLY'),
  team_annual:        Deno.env.get('STRIPE_PRICE_TEAM_ANNUAL'),
  brokerage_monthly:  Deno.env.get('STRIPE_PRICE_BROKERAGE_MONTHLY'),
  brokerage_annual:   Deno.env.get('STRIPE_PRICE_BROKERAGE_ANNUAL'),
}

Deno.serve(async (req) => {
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
    // Require authentication
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
    const customerEmail = user.email
    const userId = user.id

    let body: Record<string, unknown>
    try { body = await req.json() } catch { return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } }) }
    const { planId, isAnnual, returnUrl } = body as { planId: string; isAnnual: boolean; returnUrl?: string }

    // Validate planId is a known string
    const VALID_PLANS = ['solo', 'team', 'brokerage']
    if (typeof planId !== 'string' || !VALID_PLANS.includes(planId)) {
      return new Response(
        JSON.stringify({ error: 'Invalid planId' }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    const key = `${planId}_${isAnnual ? 'annual' : 'monthly'}`
    const priceId = PRICE_MAP[key]
    if (!priceId) {
      console.error(`Missing price config for key: ${key}. Set the STRIPE_PRICE_* secrets.`)
      return new Response(
        JSON.stringify({ error: 'This plan is not available right now. Please try again later or contact support.' }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
      apiVersion: '2024-04-10',
    })

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      ...(customerEmail ? { customer_email: customerEmail } : {}),
      ...(userId ? { client_reference_id: userId } : {}),
      success_url: `${getSafeReturnUrl(returnUrl)}?checkout=success&plan=${encodeURIComponent(planId)}`,
      cancel_url:  `${getSafeReturnUrl(returnUrl)}?checkout=cancelled`,
      allow_promotion_codes: true,
      subscription_data: {
        trial_period_days: 14,
        metadata: { planId, userId: user.id, source: 'realtygrind' },
      },
    })

    return new Response(
      JSON.stringify({ url: session.url }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  } catch (err: unknown) {
    console.error('create-checkout error:', err)
    return new Response(
      JSON.stringify({ error: 'Checkout is temporarily unavailable. Please try again.' }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }
})
