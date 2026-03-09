import { useState } from 'react'
import { CSS } from '../design'
import { PLANS } from '../lib/plans'

const STEPS = [
  { emoji:'1️⃣', title:'Sign Up', desc:'Fill out the form below and get your unique referral link instantly.' },
  { emoji:'2️⃣', title:'Share Your Link', desc:'Send it to agents in your network — social, email, DMs, anywhere.' },
  { emoji:'3️⃣', title:'Earn 20% for 12 Months', desc:'Get paid every month for a full year on each referral\'s subscription.' },
]

const BENEFITS = [
  { emoji:'💸', title:'12 Months of Revenue', desc:'Earn 20% of every payment for a full year — not just the first month.' },
  { emoji:'🚫', title:'No Earnings Cap', desc:'Refer as many agents as you want. There is no limit on commissions.' },
  { emoji:'📊', title:'Real-Time Dashboard', desc:'Track clicks, signups, and earnings live from your affiliate portal.' },
  { emoji:'⚡', title:'Instant Link', desc:'Sign up and get your referral link in seconds. No approval wait.' },
]

const AFF_FAQS = [
  { q:'How much can I earn?',
    a:'You earn 20% of every subscription payment your referrals make, every month for 12 months from their signup date.' },
  { q:'When do I get paid?',
    a:'Commissions are paid monthly through Partnero. You can track your earnings in real time from your affiliate dashboard.' },
  { q:'Is there a minimum payout?',
    a:'Yes — the minimum payout threshold is $50. Once you reach it, your earnings are sent automatically.' },
  { q:'Can I refer my own team members?',
    a:'Yes. If you refer agents who sign up for any plan, you earn commissions on their subscriptions.' },
  { q:'How long do I earn commissions?',
    a:'You earn 20% for 12 months from the date each referral signs up. After 12 months, that referral\'s commissions end — but there is no limit to how many agents you can refer.' },
  { q:'How do I track my referrals?',
    a:'After signing up you will receive a link to your Partnero affiliate dashboard where you can see clicks, signups, and earnings in real time.' },
]

export default function AffiliatesPage({ theme, onNavigate }) {
  const gold = theme === 'dark' ? '#d97706' : '#b45309'

  const [name, setName]             = useState('')
  const [email, setEmail]           = useState('')
  const [website, setWebsite]       = useState('')
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState('')
  const [referralLink, setReferralLink] = useState('')
  const [copied, setCopied]         = useState(false)
  const [openFaq, setOpenFaq]       = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/affiliate-signup`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            email: email.trim(),
            ...(name.trim()    ? { name: name.trim() }       : {}),
            ...(website.trim() ? { website: website.trim() }  : {}),
          }),
        }
      )
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error || 'Something went wrong.')
      setReferralLink(data.referral_link)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(referralLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* fallback: user can manually select */ }
  }

  const sectionStyle = { padding:'48px 24px' }
  const sectionLabel = { fontSize:11, fontWeight:700, letterSpacing:1.2, textTransform:'uppercase',
    color:gold, fontFamily:"'JetBrains Mono',monospace", marginBottom:12 }
  const sectionHead = { fontSize:26, fontWeight:700, color:'var(--text)', marginBottom:16 }

  return (
    <>
      <style>{CSS}</style>
      <div style={{ minHeight:'100vh', background:'var(--bg)' }}>

        {/* ── Top bar ─────────────────────────────────────────── */}
        <div style={{ padding:'16px 24px', borderBottom:'1px solid var(--b1)',
          background:'var(--surface)', display:'flex', alignItems:'center', gap:12 }}>
          <button onClick={() => onNavigate('back')}
            style={{ background:'none', border:'none', cursor:'pointer',
              fontSize:14, color:gold, fontWeight:600, fontFamily:"'Poppins',sans-serif" }}>
            ← Back
          </button>
          <span className="serif" style={{ fontSize:18, fontWeight:700, color:'var(--text)' }}>
            Affiliate Program
          </span>
        </div>

        <div style={{ maxWidth:780, margin:'0 auto' }}>

          {/* ═══════════════════════════════════════════════════════
              1. HERO
          ═══════════════════════════════════════════════════════ */}
          <section style={{ ...sectionStyle, paddingTop:64, paddingBottom:56, textAlign:'center' }}>
            <div style={{ display:'inline-block', padding:'6px 18px', borderRadius:20,
              background:`${gold}14`, border:`1px solid ${gold}30`, marginBottom:20 }}>
              <span style={{ fontSize:13, fontWeight:600, color:gold, fontFamily:"'Poppins',sans-serif" }}>
                💰 20% Commissions for 12 Months
              </span>
            </div>
            <h1 className="serif" style={{ fontSize:'clamp(32px, 5vw, 44px)', fontWeight:700,
              color:'var(--text)', marginBottom:16, lineHeight:1.15 }}>
              Earn with RealtyGrind
            </h1>
            <p style={{ fontSize:16, color:'var(--muted)', lineHeight:1.7,
              fontFamily:"'Poppins',sans-serif", maxWidth:520, margin:'0 auto' }}>
              Refer real estate agents to RealtyGrind and earn 20% of every subscription
              payment they make — every month for a full year.
            </p>
          </section>

          {/* ═══════════════════════════════════════════════════════
              2. HOW IT WORKS
          ═══════════════════════════════════════════════════════ */}
          <section style={sectionStyle}>
            <div style={sectionLabel}>HOW IT WORKS</div>
            <div className="serif" style={sectionHead}>Three steps to passive income</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(200px, 1fr))', gap:16 }}>
              {STEPS.map((s, i) => (
                <div key={i} className="card" style={{ padding:24, textAlign:'center' }}>
                  <div style={{ fontSize:32, marginBottom:12 }}>{s.emoji}</div>
                  <div className="serif" style={{ fontSize:18, fontWeight:700, color:'var(--text)', marginBottom:8 }}>
                    {s.title}
                  </div>
                  <div style={{ fontSize:13, color:'var(--muted)', lineHeight:1.6, fontFamily:"'Poppins',sans-serif" }}>
                    {s.desc}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* ═══════════════════════════════════════════════════════
              3. COMMISSION BREAKDOWN
          ═══════════════════════════════════════════════════════ */}
          <section style={sectionStyle}>
            <div style={sectionLabel}>YOUR EARNINGS</div>
            <div className="serif" style={sectionHead}>See what you could make</div>
            <div className="card" style={{
              padding:28, borderTop:`3px solid ${gold}`,
              background:`linear-gradient(135deg, ${gold}0d 0%, var(--surface) 55%)`,
            }}>
              <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
                {PLANS.map(plan => {
                  const commission = (plan.price * 0.2).toFixed(2)
                  return (
                    <div key={plan.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
                      padding:'14px 0', borderBottom:'1px solid var(--b1)' }}>
                      <div>
                        <div style={{ fontSize:15, fontWeight:600, color:'var(--text)', fontFamily:"'Poppins',sans-serif" }}>
                          {plan.name}
                        </div>
                        <div style={{ fontSize:12, color:'var(--muted)', fontFamily:"'Poppins',sans-serif" }}>
                          ${plan.price}/mo subscription
                        </div>
                      </div>
                      <div style={{ textAlign:'right' }}>
                        <div className="serif" style={{ fontSize:22, fontWeight:700, color:gold }}>
                          ${commission}
                        </div>
                        <div style={{ fontSize:11, color:'var(--muted)', fontFamily:"'JetBrains Mono',monospace" }}>
                          per referral / mo
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
              <div style={{ marginTop:20, padding:'14px 18px', borderRadius:10,
                background:'var(--bg2)', textAlign:'center' }}>
                <span style={{ fontSize:14, color:'var(--text)', fontFamily:"'Poppins',sans-serif", fontWeight:500 }}>
                  Just 5 Team referrals = <strong style={{ color:gold }}>$199/mo</strong> in passive income
                </span>
              </div>
            </div>
          </section>

          {/* ═══════════════════════════════════════════════════════
              4. BENEFITS
          ═══════════════════════════════════════════════════════ */}
          <section style={sectionStyle}>
            <div style={sectionLabel}>WHY AGENTS LOVE IT</div>
            <div className="serif" style={sectionHead}>Built for real estate professionals</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(220px, 1fr))', gap:16 }}>
              {BENEFITS.map((b, i) => (
                <div key={i} className="card" style={{ padding:22 }}>
                  <div style={{ fontSize:28, marginBottom:10 }}>{b.emoji}</div>
                  <div className="serif" style={{ fontSize:16, fontWeight:700, color:'var(--text)', marginBottom:6 }}>
                    {b.title}
                  </div>
                  <div style={{ fontSize:13, color:'var(--muted)', lineHeight:1.6, fontFamily:"'Poppins',sans-serif" }}>
                    {b.desc}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* ═══════════════════════════════════════════════════════
              5. SIGNUP FORM
          ═══════════════════════════════════════════════════════ */}
          <section style={sectionStyle} id="signup">
            <div style={{ textAlign:'center', marginBottom:24 }}>
              <div style={sectionLabel}>JOIN NOW</div>
              <div className="serif" style={sectionHead}>Get your referral link</div>
            </div>
            <div style={{ maxWidth:520, margin:'0 auto' }}>
              {!referralLink ? (
                <div className="card" style={{ padding:'28px' }}>
                  <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:16 }}>
                    <div>
                      <div className="label" style={{ marginBottom:6 }}>Full Name</div>
                      <input className="field-input" type="text" placeholder="Jane Smith"
                        value={name} onChange={e => setName(e.target.value)} />
                    </div>
                    <div>
                      <div className="label" style={{ marginBottom:6 }}>
                        Email <span style={{ color:'var(--red)' }}>*</span>
                      </div>
                      <input className="field-input" type="email" placeholder="you@brokerage.com"
                        value={email} onChange={e => setEmail(e.target.value)} required />
                    </div>
                    <div>
                      <div className="label" style={{ marginBottom:6 }}>
                        Website <span style={{ color:'var(--dim)', fontWeight:400, textTransform:'none' }}>(optional)</span>
                      </div>
                      <input className="field-input" type="url" placeholder="https://yoursite.com"
                        value={website} onChange={e => setWebsite(e.target.value)} />
                    </div>

                    {error && (
                      <div style={{ background:'rgba(220,38,38,.06)', border:'1px solid rgba(220,38,38,.2)',
                        borderRadius:8, padding:'10px 14px', fontSize:13, color:'var(--red)' }}>
                        {error}
                      </div>
                    )}

                    <button type="submit" className="btn-gold" disabled={loading}
                      style={{ width:'100%', padding:'13px', fontSize:15, marginTop:4 }}>
                      {loading ? 'Creating account…' : 'Join Affiliate Program'}
                    </button>
                  </form>
                </div>
              ) : (
                <div className="card" style={{ padding:'28px', textAlign:'center' }}>
                  <div style={{ fontSize:36, marginBottom:12 }}>🎉</div>
                  <h2 className="serif" style={{ fontSize:22, fontWeight:700,
                    color:'var(--text)', marginBottom:8 }}>
                    You're In!
                  </h2>
                  <p style={{ fontSize:13, color:'var(--muted)', marginBottom:24,
                    fontFamily:"'Poppins',sans-serif", lineHeight:1.6 }}>
                    Share your unique referral link with agents. You'll earn commissions
                    on every subscription they start.
                  </p>
                  <div style={{
                    background:'var(--bg2)', border:'1.5px solid var(--b2)',
                    borderRadius:10, padding:'12px 16px', display:'flex',
                    alignItems:'center', gap:10, marginBottom:20,
                  }}>
                    <input readOnly value={referralLink}
                      style={{
                        flex:1, background:'transparent', border:'none',
                        color:gold, fontSize:13, fontWeight:600,
                        fontFamily:"'JetBrains Mono',monospace",
                        outline:'none', minWidth:0,
                      }} />
                    <button onClick={handleCopy} className="btn-gold"
                      style={{ padding:'8px 16px', fontSize:12, flexShrink:0 }}>
                      {copied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                  <div style={{ background:'rgba(5,150,105,.06)', border:'1px solid rgba(5,150,105,.2)',
                    borderRadius:8, padding:'10px 14px', fontSize:13, color:'var(--green)' }}>
                    Check your email for affiliate program details and your dashboard login.
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* ═══════════════════════════════════════════════════════
              6. FAQ
          ═══════════════════════════════════════════════════════ */}
          <section style={sectionStyle}>
            <div style={{ textAlign:'center', marginBottom:28 }}>
              <div style={sectionLabel}>FAQ</div>
              <div className="serif" style={sectionHead}>Common questions</div>
            </div>
            <div style={{ maxWidth:600, margin:'0 auto' }}>
              {AFF_FAQS.map((faq, i) => (
                <div key={i} style={{ borderBottom:'1px solid var(--b2)' }}>
                  <button onClick={() => setOpenFaq(openFaq === i ? null : i)}
                    style={{
                      width:'100%', textAlign:'left', padding:'18px 0',
                      background:'none', border:'none', cursor:'pointer',
                      display:'flex', alignItems:'center', justifyContent:'space-between',
                      gap:12, fontFamily:"'Poppins',sans-serif",
                    }}>
                    <span style={{ fontSize:14, fontWeight:600, color:'var(--text)', lineHeight:1.4 }}>
                      {faq.q}
                    </span>
                    <span style={{ fontSize:18, color:'var(--muted)', flexShrink:0,
                      transform: openFaq === i ? 'rotate(45deg)' : 'none', transition:'transform .2s' }}>
                      +
                    </span>
                  </button>
                  {openFaq === i && (
                    <div style={{ padding:'0 0 18px', fontSize:13, color:'var(--muted)',
                      lineHeight:1.7, fontFamily:"'Poppins',sans-serif" }}>
                      {faq.a}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* ── Support link ──────────────────────────────────── */}
          <div style={{ padding:'24px 24px 80px', textAlign:'center' }}>
            <p style={{ fontSize:12, color:'var(--dim)', lineHeight:1.7,
              fontFamily:"'Poppins',sans-serif" }}>
              Questions? Email{' '}
              <a href="mailto:support@realtygrind.co"
                style={{ color:gold, textDecoration:'none', fontWeight:600 }}>
                support@realtygrind.co
              </a>
            </p>
          </div>
        </div>
      </div>
    </>
  )
}
