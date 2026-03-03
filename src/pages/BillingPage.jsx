import { useState } from 'react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import { PLANS, getPlan, isActiveBilling, getPlanBadge, isTeamMember } from '../lib/plans'

export default function BillingPage({ onNavigate, theme, onToggleTheme }) {
  const { user, profile } = useAuth()
  const [annual, setAnnual] = useState(false)
  const [portalLoading, setPortalLoading] = useState(false)
  const [checkoutLoading, setCheckoutLoading] = useState(null) // planId or null
  const [error, setError] = useState('')

  const currentPlan = getPlan(profile?.plan)
  const badge = getPlanBadge(profile, user?.id)
  const isActive = isActiveBilling(profile?.billing_status)
  const hasSubscription = currentPlan && isActive
  const isMember = isTeamMember(profile, user?.id)
  const teamName = profile?.teams?.name

  // True if this account was set up directly in the DB (no Stripe customer)
  const hasStripeCustomer = !!profile?.stripe_customer_id

  async function openPortal() {
    if (portalLoading || checkoutLoading) return
    if (!hasStripeCustomer) {
      setError('Billing portal is not available — your plan was activated manually. Contact support@realtygrind.com to manage your subscription.')
      return
    }
    setPortalLoading(true); setError('')
    try {
      if (!supabase) { setError('Service unavailable'); return }
      const { data, error: e } = await supabase.functions.invoke('create-portal-session', {
        body: { returnUrl: window.location.origin }
      })
      // Extract the real error message from the edge function response body
      if (e) {
        const body = typeof e.context === 'object' ? e.context : null
        const msg = body?.error || e.message || ''
        // Replace unhelpful SDK errors with a friendly message
        if (msg.includes('Failed to send') || msg.includes('FunctionsFetchError'))
          throw new Error('Could not reach billing service. Please try again later.')
        throw new Error(msg || 'Could not open billing portal.')
      }
      if (data?.error) throw new Error(data.error)
      if (data?.url) window.location.href = data.url
      else throw new Error('No portal URL returned. You may need to subscribe to a plan first.')
    } catch (err) {
      console.error('Portal error:', err)
      const msg = err.message || 'Could not open billing portal.'
      setError(msg.includes('Failed to send') ? 'Could not reach billing service. Please try again later.' : msg)
    } finally {
      setPortalLoading(false)
    }
  }

  async function handleSubscribe(planId) {
    if (checkoutLoading || portalLoading) return
    if (isMember) {
      setError("You're covered by your team's plan. Contact your team owner to manage billing.")
      return
    }
    setCheckoutLoading(planId); setError('')
    try {
      if (!supabase) { setError('Service unavailable'); return }
      const { data, error: e } = await supabase.functions.invoke('create-checkout', {
        body: { planId, isAnnual: annual, returnUrl: window.location.origin }
      })
      if (e) {
        const body = typeof e.context === 'object' ? e.context : null
        const msg = body?.error || e.message || ''
        if (msg.includes('Failed to send') || msg.includes('FunctionsFetchError'))
          throw new Error('Could not reach billing service. Please try again later.')
        throw new Error(msg || 'Could not start checkout.')
      }
      if (data?.error) throw new Error(data.error)
      if (data?.url) window.location.href = data.url
      else throw new Error('Checkout URL not available. Please try again.')
    } catch (err) {
      console.error('Checkout error:', err)
      const msg = err.message || 'Could not start checkout.'
      setError(msg.includes('Failed to send') ? 'Could not reach billing service. Please try again later.' : msg)
    } finally {
      setCheckoutLoading(null)
    }
  }

  return (
    <div className="page">
        <div className="page-inner" style={{ maxWidth:880 }}>

          {/* Header */}
          <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:24 }}>
            <button className="btn-ghost" onClick={() => onNavigate('dashboard')}
              style={{ fontSize:18, padding:'4px 10px', lineHeight:1 }}>&larr;</button>
            <div>
              <div className="serif" style={{ fontSize:26, color:'var(--text)' }}>Billing & Subscription</div>
              <div style={{ fontSize:13, color:'var(--muted)', marginTop:2 }}>
                {isMember ? `You're on ${teamName || 'a team'}` : 'Manage your plan, billing, and payment method'}
              </div>
            </div>
          </div>

          {error && (
            <div className="card" style={{ padding:'14px 20px', marginBottom:18, borderLeft:'3px solid #dc2626',
              background:'rgba(220,38,38,.06)', color:'#dc2626', fontSize:13, fontWeight:600 }}>
              {error}
            </div>
          )}

          {/* ── Team member view — covered by team owner's plan ── */}
          {isMember && (
            <div className="card" style={{ padding:32, marginBottom:24, borderTop:'3px solid #d97706',
              background:'linear-gradient(135deg, rgba(217,119,6,.06) 0%, var(--surface) 55%)', textAlign:'center' }}>
              <div style={{ fontSize:48, marginBottom:16 }}>&#9989;</div>
              <div className="serif" style={{ fontSize:24, color:'var(--text)', marginBottom:8 }}>
                You're covered by {teamName ? `"${teamName}"` : 'your team'}
              </div>
              <div style={{ fontSize:14, color:'var(--muted)', lineHeight:1.7, maxWidth:480, margin:'0 auto 20px' }}>
                Your team owner manages the subscription for all team members.
                You have full access to all features included in your team's plan — no separate charge.
              </div>
              <div style={{ display:'flex', gap:10, justifyContent:'center', flexWrap:'wrap' }}>
                <button className="btn-outline" onClick={() => onNavigate('teams')}
                  style={{ fontSize:13, padding:'10px 20px' }}>
                  Go to Teams
                </button>
                <button className="btn-ghost" onClick={() => onNavigate('dashboard')}
                  style={{ fontSize:13, padding:'10px 20px' }}>
                  Back to Dashboard
                </button>
              </div>
            </div>
          )}

          {/* ── Owner / solo user views below ── */}
          {!isMember && (
            <>
              {/* Past due warning */}
              {profile?.billing_status === 'past_due' && (
                <div className="card" style={{ padding:'16px 22px', marginBottom:18, borderLeft:'3px solid #f59e0b',
                  background:'rgba(245,158,11,.06)', display:'flex', alignItems:'center', gap:14, flexWrap:'wrap' }}>
                  <span style={{ fontSize:22 }}>&#9888;&#65039;</span>
                  <div style={{ flex:1, minWidth:200 }}>
                    <div style={{ fontWeight:700, color:'#f59e0b', fontSize:14 }}>Payment past due</div>
                    <div style={{ fontSize:12, color:'var(--muted)', marginTop:2 }}>
                      Please update your payment method to avoid service interruption.
                    </div>
                  </div>
                  <button className="btn-gold" onClick={openPortal} disabled={portalLoading}
                    style={{ fontSize:13, padding:'8px 18px' }}>
                    {portalLoading ? 'Opening...' : 'Update Payment'}
                  </button>
                </div>
              )}

              {/* Cancelled banner */}
              {profile?.billing_status === 'cancelled' && (
                <div className="card" style={{ padding:'16px 22px', marginBottom:18, borderLeft:'3px solid var(--muted)',
                  background:'rgba(100,100,100,.04)', display:'flex', alignItems:'center', gap:14, flexWrap:'wrap' }}>
                  <span style={{ fontSize:22 }}>&#128683;</span>
                  <div style={{ flex:1, minWidth:200 }}>
                    <div style={{ fontWeight:700, color:'var(--text)', fontSize:14 }}>Subscription ended</div>
                    <div style={{ fontSize:12, color:'var(--muted)', marginTop:2 }}>
                      Choose a plan below to reactivate your subscription.
                    </div>
                  </div>
                </div>
              )}

              {/* Current plan card — only show for active subscribers */}
              {hasSubscription && (
                <div className="card" style={{ padding:28, marginBottom:24, borderTop:`3px solid ${currentPlan.color}`,
                  background:`linear-gradient(135deg, ${currentPlan.color}0d 0%, var(--surface) 55%)` }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:14 }}>
                    <div>
                      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
                        <span style={{ fontSize:11, fontFamily:"'JetBrains Mono',monospace", letterSpacing:.8,
                          textTransform:'uppercase', fontWeight:700, color:currentPlan.color }}>
                          CURRENT PLAN
                        </span>
                        <span style={{ fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:20,
                          background:`${currentPlan.color}18`, color:currentPlan.color, border:`1px solid ${currentPlan.color}30` }}>
                          {badge.label}
                        </span>
                      </div>
                      <div className="serif" style={{ fontSize:28, color:'var(--text)' }}>{currentPlan.name}</div>
                      <div style={{ fontSize:13, color:'var(--muted)', marginTop:4 }}>{currentPlan.desc}</div>
                    </div>
                    <button className="btn-outline" onClick={openPortal} disabled={portalLoading}
                      style={{ fontSize:13, padding:'10px 22px', whiteSpace:'nowrap' }}>
                      {portalLoading ? 'Opening...' : hasStripeCustomer ? 'Manage Subscription' : 'Manage Plan'}
                    </button>
                  </div>

                  {/* Features */}
                  <div style={{ marginTop:20, display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))', gap:6 }}>
                    {currentPlan.features.map((f, i) => (
                      <div key={i} style={{ fontSize:13, color:'var(--text)', display:'flex', alignItems:'center', gap:8, padding:'4px 0' }}>
                        <span style={{ color:currentPlan.color, fontSize:11, fontWeight:700 }}>&#10003;</span> {f}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Plan comparison / upgrade section */}
              <div style={{ marginBottom:12 }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:12, marginBottom:18 }}>
                  <div className="serif" style={{ fontSize:20, color:'var(--text)' }}>
                    {hasSubscription ? 'Change Plan' : 'Choose a Plan'}
                  </div>
                  {/* Annual/monthly toggle */}
                  <div style={{ display:'flex', alignItems:'center', gap:10, fontSize:13 }}>
                    <span style={{ color: annual ? 'var(--muted)' : 'var(--text)', fontWeight: annual ? 400 : 700 }}>Monthly</span>
                    <button onClick={() => setAnnual(a => !a)} style={{
                      width:44, height:24, borderRadius:12, border:'none', cursor:'pointer', position:'relative',
                      background: annual ? 'var(--gold)' : 'var(--b2)', transition:'background .2s'
                    }}>
                      <div style={{ width:18, height:18, borderRadius:9, background:'#fff',
                        position:'absolute', top:3, left: annual ? 23 : 3, transition:'left .2s', boxShadow:'0 1px 3px rgba(0,0,0,.2)' }}/>
                    </button>
                    <span style={{ color: annual ? 'var(--text)' : 'var(--muted)', fontWeight: annual ? 700 : 400 }}>
                      Annual <span style={{ color:'var(--gold)', fontSize:11, fontWeight:700 }}>Save 17%</span>
                    </span>
                  </div>
                </div>

                {/* Plan cards */}
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(250px,1fr))', gap:16 }}>
                  {PLANS.map(plan => {
                    const isCurrent = hasSubscription && plan.id === currentPlan?.id
                    const price = annual ? plan.priceAnn : plan.price
                    return (
                      <div key={plan.id} className="card" style={{
                        padding:24, position:'relative', overflow:'hidden',
                        borderTop: `3px solid ${plan.color}`,
                        opacity: isCurrent ? .55 : 1,
                      }}>
                        {plan.badge && (
                          <div style={{ position:'absolute', top:12, right:-28, transform:'rotate(45deg)',
                            background:plan.color, color:'#fff', fontSize:9, fontWeight:800,
                            padding:'3px 36px', letterSpacing:.6, textTransform:'uppercase' }}>
                            {plan.badge}
                          </div>
                        )}
                        <div className="serif" style={{ fontSize:22, color:'var(--text)', marginBottom:4 }}>{plan.name}</div>
                        <div style={{ fontSize:13, color:'var(--muted)', marginBottom:14, lineHeight:1.5 }}>{plan.desc}</div>
                        <div style={{ display:'flex', alignItems:'baseline', gap:4, marginBottom:16 }}>
                          <span className="serif" style={{ fontSize:36, color:plan.color, fontWeight:700 }}>${price}</span>
                          <span style={{ fontSize:12, color:'var(--muted)' }}>/mo</span>
                          {annual && (
                            <span style={{ fontSize:11, color:'var(--muted)', textDecoration:'line-through', marginLeft:6 }}>
                              ${plan.price}
                            </span>
                          )}
                        </div>
                        <div style={{ marginBottom:18 }}>
                          {plan.features.map((f, i) => (
                            <div key={i} style={{ fontSize:12, color:'var(--text)', display:'flex', alignItems:'center', gap:7, padding:'3px 0' }}>
                              <span style={{ color:plan.color, fontSize:10, fontWeight:700 }}>&#10003;</span> {f}
                            </div>
                          ))}
                        </div>
                        {isCurrent ? (
                          <div style={{ textAlign:'center', fontSize:12, fontWeight:700, color:plan.color, padding:'10px 0' }}>
                            Current Plan
                          </div>
                        ) : hasSubscription ? (
                          <button className="btn-outline" onClick={openPortal} disabled={portalLoading}
                            style={{ width:'100%', fontSize:13, padding:'10px 0' }}>
                            {plan.price > currentPlan.price ? 'Upgrade' : 'Downgrade'} via Portal
                          </button>
                        ) : (
                          <button className="btn-gold" onClick={() => handleSubscribe(plan.id)}
                            disabled={!!checkoutLoading || portalLoading}
                            style={{ width:'100%', fontSize:13, padding:'10px 0', background:plan.color,
                              border:'none', color:'#fff', borderRadius:8, fontWeight:700, cursor:'pointer' }}>
                            {checkoutLoading === plan.id ? 'Redirecting...' : plan.cta}
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Help text */}
              <div style={{ textAlign:'center', padding:'24px 0 40px', fontSize:12, color:'var(--muted)', lineHeight:1.7 }}>
                Solo plan includes a 14-day free trial. Cancel anytime from the billing portal.<br/>
                Need help? Contact us at <span style={{ color:'var(--gold)' }}>support@realtygrind.com</span>
              </div>
            </>
          )}
        </div>
    </div>
  )
}
