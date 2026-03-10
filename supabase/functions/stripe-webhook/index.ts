// supabase/functions/stripe-webhook/index.ts
// Handles Stripe webhook events to keep billing status in sync.
//
// Required Supabase secrets:
//   STRIPE_SECRET_KEY        — sk_live_... or sk_test_...
//   STRIPE_WEBHOOK_SECRET    — whsec_... (from Stripe Dashboard → Webhooks)
//   SUPABASE_SERVICE_ROLE_KEY — already set automatically in Supabase
//
// Stripe webhook events to enable in dashboard:
//   checkout.session.completed
//   customer.subscription.updated
//   customer.subscription.deleted
//   invoice.payment_failed

import Stripe from 'npm:stripe@14'
import { createClient } from 'npm:@supabase/supabase-js@2'

Deno.serve(async (req) => {
  // Only accept POST requests from Stripe
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const signature = req.headers.get('stripe-signature')
  if (!signature) {
    return new Response('Missing stripe-signature header', { status: 400 })
  }

  const body = await req.text()

  const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
    apiVersion: '2024-04-10',
  })

  // Reverse map: Stripe price_id → planId
  // Used to derive the actual plan when metadata is stale (e.g. after Portal upgrades)
  const PRICE_TO_PLAN: Record<string, string> = {}
  for (const [envKey, plan] of [
    ['STRIPE_PRICE_SOLO_MONTHLY', 'solo'],
    ['STRIPE_PRICE_SOLO_ANNUAL', 'solo'],
    ['STRIPE_PRICE_TEAM_MONTHLY', 'team'],
    ['STRIPE_PRICE_TEAM_ANNUAL', 'team'],
    ['STRIPE_PRICE_BROKERAGE_MONTHLY', 'brokerage'],
    ['STRIPE_PRICE_BROKERAGE_ANNUAL', 'brokerage'],
  ] as const) {
    const id = Deno.env.get(envKey)
    if (id) PRICE_TO_PLAN[id] = plan
  }

  // Add-on price reverse map (price_id → addon name)
  const ADDON_PRICES: Record<string, string> = {}
  const presMonthly = Deno.env.get('STRIPE_PRICE_PRESENTATIONS_MONTHLY')
  const presAnnual = Deno.env.get('STRIPE_PRICE_PRESENTATIONS_ANNUAL')
  if (presMonthly) ADDON_PRICES[presMonthly] = 'presentations'
  if (presAnnual) ADDON_PRICES[presAnnual] = 'presentations'

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      Deno.env.get('STRIPE_WEBHOOK_SECRET')!
    )
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('Webhook signature verification failed:', msg)
    return new Response('Webhook signature verification failed', { status: 400 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // Idempotency: atomic INSERT — if event_id already exists the unique
  // constraint rejects it, guaranteeing at-most-once processing even when
  // Stripe retries the same event concurrently.
  const { error: idempotencyErr } = await supabase
    .from('processed_events')
    .insert({ event_id: event.id, event_type: event.type })

  if (idempotencyErr) {
    // 23505 = unique_violation → event was already processed
    if (idempotencyErr.code === '23505') {
      return new Response(JSON.stringify({ received: true, duplicate: true }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }
    // Other errors (table missing, etc.) — log but continue processing
    // so Stripe doesn't keep retrying indefinitely.
    console.warn('Idempotency insert failed (continuing):', idempotencyErr.message)
  }

  console.log(`Processing event: ${event.type}`)

  // ── checkout.session.completed ─────────────────────────────────────────
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.CheckoutSession

    // Fetch the subscription to get planId + userId from its metadata
    let planId: string | null = null
    let userId: string | null = null
    let billingStatus: string = 'active'
    let addonId: string | null = null
    let teamId: string | null = null
    if (session.subscription) {
      try {
        const sub = await stripe.subscriptions.retrieve(session.subscription as string)
        planId = sub.metadata?.planId || null
        userId = sub.metadata?.userId || null
        addonId = sub.metadata?.addonId || null
        teamId = sub.metadata?.teamId || null
        billingStatus = sub.status // preserve 'trialing' for trial subscriptions
      } catch (err) {
        console.error('Failed to fetch subscription:', err)
      }
    }

    // ── Add-on checkout (e.g. Presentation Builder) ──
    if (addonId === 'presentations' && teamId) {
      const { error } = await supabase.from('teams').update({
        presentations_addon_status: billingStatus,
        presentations_stripe_subscription_id: session.subscription as string,
      }).eq('id', teamId)
      if (error) console.error('teams update error (addon checkout):', error.message)
      // Also enable the tool in team_prefs
      const { data: team } = await supabase.from('teams').select('team_prefs').eq('id', teamId).single()
      if (team) {
        const prefs = team.team_prefs || {}
        const aiTools = prefs.ai_tools || {}
        aiTools.presentations_enabled = true
        await supabase.from('teams').update({ team_prefs: { ...prefs, ai_tools: aiTools } }).eq('id', teamId)
      }
    } else {
      // ── Base plan checkout ──
      const updatePayload = {
        plan:                    planId,
        billing_status:          billingStatus,
        stripe_customer_id:      session.customer as string,
        stripe_subscription_id:  session.subscription as string,
      }

      // Prefer userId from metadata (reliable), fall back to email (fragile)
      if (userId) {
        const { error } = await supabase
          .from('profiles')
          .update(updatePayload)
          .eq('id', userId)

        if (error) console.error('profiles update error (checkout by userId):', error.message)
      } else {
        const email = session.customer_details?.email
        if (email) {
          const { error } = await supabase
            .from('profiles')
            .update(updatePayload)
            .eq('email', email)

          if (error) console.error('profiles update error (checkout by email):', error.message)
        }
      }
    }
  }

  // ── customer.subscription.updated ─────────────────────────────────────
  if (event.type === 'customer.subscription.updated') {
    const sub        = event.data.object as Stripe.Subscription
    const customerId = sub.customer as string
    const status     = sub.status

    // Check if this is an add-on subscription
    const priceId = sub.items?.data?.[0]?.price?.id
    const isAddon = priceId ? ADDON_PRICES[priceId] : null

    if (isAddon === 'presentations') {
      // Update teams table by subscription ID
      const { error } = await supabase.from('teams').update({
        presentations_addon_status: status,
      }).eq('presentations_stripe_subscription_id', sub.id)
      if (error) console.error('teams update error (addon sub updated):', error.message)
    } else {
      // Base plan update
      const updateData: Record<string, unknown> = { billing_status: status }

      // Derive plan from the subscription's ACTUAL price — not metadata.
      const derivedPlan = priceId ? PRICE_TO_PLAN[priceId] : null
      const metadataPlan = sub.metadata?.planId
      const planId = derivedPlan || metadataPlan
      if (planId) updateData.plan = planId

      const { error } = await supabase
        .from('profiles')
        .update(updateData)
        .eq('stripe_customer_id', customerId)

      if (error) console.error('profiles update error (sub updated):', error.message)
    }
  }

  // ── customer.subscription.deleted ─────────────────────────────────────
  if (event.type === 'customer.subscription.deleted') {
    const sub        = event.data.object as Stripe.Subscription
    const customerId = sub.customer as string

    // Check if this is an add-on subscription
    const { data: addonTeam } = await supabase.from('teams')
      .select('id')
      .eq('presentations_stripe_subscription_id', sub.id)
      .single()

    if (addonTeam) {
      const { error } = await supabase.from('teams').update({
        presentations_addon_status: 'cancelled',
      }).eq('id', addonTeam.id)
      if (error) console.error('teams update error (addon sub deleted):', error.message)
    } else {
      // Base plan deletion
      const { error } = await supabase
        .from('profiles')
        .update({ billing_status: 'cancelled', plan: null })
        .eq('stripe_customer_id', customerId)

      if (error) console.error('profiles update error (sub deleted):', error.message)
    }
  }

  // ── invoice.payment_failed ──────────────────────────────────────────────
  // Reduces latency between payment failure and UI showing past_due banner.
  // Without this, we'd wait for the async subscription.updated event.
  if (event.type === 'invoice.payment_failed') {
    const invoice    = event.data.object as Stripe.Invoice
    const customerId = invoice.customer as string

    if (customerId) {
      const { error } = await supabase
        .from('profiles')
        .update({ billing_status: 'past_due' })
        .eq('stripe_customer_id', customerId)

      if (error) console.error('profiles update error (payment_failed):', error.message)
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
