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

  // Idempotency: skip events already processed (upsert event ID)
  const { data: existing } = await supabase
    .from('processed_events')
    .select('id')
    .eq('event_id', event.id)
    .maybeSingle()

  if (existing) {
    return new Response(JSON.stringify({ received: true, duplicate: true }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Record event ID (best-effort — table may not exist yet, fail gracefully)
  await supabase
    .from('processed_events')
    .insert({ event_id: event.id, event_type: event.type })
    .then(() => {}, () => {})

  console.log(`Processing event: ${event.type}`)

  // ── checkout.session.completed ─────────────────────────────────────────
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.CheckoutSession

    // Fetch the subscription to get planId + userId from its metadata
    let planId: string | null = null
    let userId: string | null = null
    let billingStatus: string = 'active'
    if (session.subscription) {
      try {
        const sub = await stripe.subscriptions.retrieve(session.subscription as string)
        planId = sub.metadata?.planId || null
        userId = sub.metadata?.userId || null
        billingStatus = sub.status // preserve 'trialing' for trial subscriptions
      } catch (err) {
        console.error('Failed to fetch subscription:', err)
      }
    }

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

  // ── customer.subscription.updated ─────────────────────────────────────
  if (event.type === 'customer.subscription.updated') {
    const sub        = event.data.object as Stripe.Subscription
    const customerId = sub.customer as string
    const status     = sub.status // preserve 'trialing' vs 'active' for UI display

    const updateData: Record<string, unknown> = { billing_status: status }
    // Update plan if metadata present (handles upgrades/downgrades via Stripe Portal)
    const planId = sub.metadata?.planId
    if (planId) updateData.plan = planId

    const { error } = await supabase
      .from('profiles')
      .update(updateData)
      .eq('stripe_customer_id', customerId)

    if (error) console.error('profiles update error (sub updated):', error.message)
  }

  // ── customer.subscription.deleted ─────────────────────────────────────
  if (event.type === 'customer.subscription.deleted') {
    const sub        = event.data.object as Stripe.Subscription
    const customerId = sub.customer as string

    const { error } = await supabase
      .from('profiles')
      .update({ billing_status: 'cancelled', plan: null })
      .eq('stripe_customer_id', customerId)

    if (error) console.error('profiles update error (sub deleted):', error.message)
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
