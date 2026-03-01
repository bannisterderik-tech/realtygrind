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
    return new Response(`Webhook Error: ${msg}`, { status: 400 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  console.log(`Processing event: ${event.type}`)

  // ── checkout.session.completed ─────────────────────────────────────────
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.CheckoutSession
    const email   = session.customer_details?.email

    // Fetch the subscription to get planId from its metadata
    // (session.subscription_data does NOT exist on the event payload)
    let planId: string | null = null
    let billingStatus: string = 'active'
    if (session.subscription) {
      try {
        const sub = await stripe.subscriptions.retrieve(session.subscription as string)
        planId = sub.metadata?.planId || null
        billingStatus = sub.status // preserve 'trialing' for trial subscriptions
      } catch (err) {
        console.error('Failed to fetch subscription:', err)
      }
    }

    if (email) {
      const { error } = await supabase
        .from('profiles')
        .update({
          plan:                    planId,
          billing_status:          billingStatus,
          stripe_customer_id:      session.customer as string,
          stripe_subscription_id:  session.subscription as string,
        })
        .eq('email', email)

      if (error) console.error('profiles update error (checkout):', error.message)
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
