// supabase/functions/create-portal-session/index.ts
// Creates a Stripe Customer Portal session so users can manage their subscription,
// update payment methods, and upgrade/downgrade plans.
//
// Required Supabase secrets:
//   STRIPE_SECRET_KEY          — sk_live_... or sk_test_...
//   SUPABASE_SERVICE_ROLE_KEY  — already set automatically

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
    let body: Record<string, unknown>
    try { body = await req.json() } catch { body = {} }
    const { returnUrl } = body as { returnUrl?: string }

    // Authenticate the caller
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    // Fetch stripe_customer_id from profile using service role
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )
    const { data: profile } = await admin
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .single()

    if (!profile?.stripe_customer_id) {
      return new Response(
        JSON.stringify({ error: 'No billing account found. Subscribe to a plan first.' }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
      apiVersion: '2024-04-10',
    })

    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: getSafeReturnUrl(returnUrl),
    })

    return new Response(
      JSON.stringify({ url: session.url }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  } catch (err: unknown) {
    console.error('create-portal-session error:', err)
    return new Response(
      JSON.stringify({ error: 'Portal is temporarily unavailable. Please try again.' }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }
})
