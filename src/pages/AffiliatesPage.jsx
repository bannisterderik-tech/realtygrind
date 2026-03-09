import { useState } from 'react'
import { CSS } from '../design'

export default function AffiliatesPage({ theme, onNavigate }) {
  const gold = theme === 'dark' ? '#d97706' : '#b45309'

  const [name, setName]             = useState('')
  const [email, setEmail]           = useState('')
  const [website, setWebsite]       = useState('')
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState('')
  const [referralLink, setReferralLink] = useState('')
  const [copied, setCopied]         = useState(false)

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

        <div style={{ maxWidth:520, margin:'0 auto', padding:'48px 24px 80px' }}>

          {/* ── Hero ──────────────────────────────────────────── */}
          <div style={{ textAlign:'center', marginBottom:40 }}>
            <h1 className="serif" style={{ fontSize:28, fontWeight:700,
              color:'var(--text)', marginBottom:12 }}>
              Earn with RealtyGrind
            </h1>
            <p style={{ fontSize:14, color:'var(--muted)', lineHeight:1.7,
              fontFamily:"'Poppins',sans-serif", maxWidth:400, margin:'0 auto' }}>
              Refer agents to RealtyGrind and earn recurring commissions on every
              subscription. Sign up below to get your unique referral link.
            </p>
          </div>

          {!referralLink ? (
            /* ── Signup form ───────────────────────────────────── */
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
            /* ── Success state ─────────────────────────────────── */
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

              {/* Referral link box */}
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

          {/* ── Support link ──────────────────────────────────── */}
          <div style={{ marginTop:36, textAlign:'center' }}>
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
