import { useState, useEffect } from 'react'
import { ThemeToggle, RANKS } from '../design'
import { PLANS } from '../lib/plans'

// ── Data ─────────────────────────────────────────────────────────────────────

const FAQS = [
  { q:'Is there a free trial?',
    a:'The Solo plan includes a 14-day free trial so you can try it risk-free.' },
  { q:'Can I skip a habit without breaking my streak?',
    a:'Yes — hit the X on any habit to skip it for the day. Your streak stays completely intact. Restore it anytime.' },
  { q:'How does the team plan work?',
    a:'One team leader creates the team and invites agents via email. Everyone gets their own dashboard, and the leader sees the full roster, leaderboard, coaching notes, and daily standups.' },
  { q:'Can I add my own daily tasks?',
    a:'Yes. Create custom daily tasks with your own labels, icons, and XP values. You can also rename built-in habits and adjust XP weights.' },
  { q:'What is XP and how does it work?',
    a:'XP (experience points) are earned by completing daily habits, closing deals, and winning team challenges. As XP accumulates you climb through ranks: Bronze, Silver, Gold, Platinum, Diamond.' },
  { q:'Does it work on mobile?',
    a:'Yes — RealtyGrind is fully responsive and works great on any phone or tablet. No app download needed.' },
  { q:'What is the AI Coaching Assistant?',
    a:'The AI Assistant is a built-in coach powered by Claude that reads your live listings, pipeline, and goals. Ask it anything — listing pricing strategy, comp analysis, goal tracking, prospecting tips. Solo gets 50 credits/mo, Team gets 250 shared, Brokerage gets unlimited. 1 credit = 1 message.' },
  { q:'How does the pipeline tracker work?',
    a:'Add offers made and received, move them to pending, then closed. Each deal is a single record that moves between stages — no duplicates, no mess. Commission totals and goal progress update automatically.' },
  { q:'What are accountability groups?',
    a:'Team leaders can create sub-groups of agents with a designated group leader. Group leaders can coach their members, run group challenges, and track group performance with ring-based progress tracking.' },
  { q:'How does the buyer needs board work?',
    a:'Team members post what their buyers are looking for — area, price range, property type. Teammates reply with matching properties they find. It keeps the whole team working together to close buyer deals faster.' },
]

const TESTIMONIALS = [
  { name:'Sarah K.', title:"Buyer's Agent · Austin, TX", avatar:'S',
    quote:'I tried spreadsheets, a journal, three different apps. RealtyGrind is the first thing that made me actually consistent.',
    stat:'6x prospecting increase' },
  { name:'Marcus T.', title:'Team Leader · Atlanta, GA', avatar:'M',
    quote:'I run a 12-agent team. Before this I had zero visibility into who was working. Now I see everything.',
    stat:'12 agents, full visibility' },
  { name:'Jenna R.', title:'Listing Agent · Denver, CO', avatar:'J',
    quote:'The XP system sounds silly until you are chasing Diamond rank at 11pm. Gamification works. My GCI is up 40%.',
    stat:'40% GCI increase' },
]

const DEMO_HABITS = [
  { id:1, label:'Prospecting',  icon:'📞', xp:25, color:'#0ea5e9' },
  { id:2, label:'Appointments', icon:'🤝', xp:30, color:'#10b981' },
  { id:3, label:'Showings',     icon:'🏠', xp:20, color:'#8b5cf6' },
  { id:4, label:'New Listing',  icon:'📋', xp:40, color:'#f97316' },
  { id:5, label:'Follow-ups',   icon:'✉️', xp:20, color:'#06b6d4' },
]

const AI_DEMO = [
  { role:'user', text:'My listing at 142 Maple St has been sitting for 22 days. What should I do?' },
  { role:'ai', text:"Based on your listing data, here's my analysis:\n\n**Why it's sitting:**\n- 22 days is above the area median of 14 DOM\n- Price may be 3-5% above recent comps\n\n**Recommended actions:**\n1. **Price adjustment** — Consider reducing to $470-475K to hit \"new listing\" feeds\n2. **Refresh marketing** — New photos, twilight shots generate 2x engagement\n3. **Open house blitz** — Back-to-back opens this weekend\n4. **Agent outreach** — Top 20 buyer agents, \"price improvement\" email" },
  { role:'user', text:'How am I tracking against my monthly goal?' },
  { role:'ai', text:"You're at **2 closings** vs your goal of **4**.\n\n- 3 offers made, 2 pending, 2 closed\n- Commission this month: $18,200\n- Need 2 more closings in 12 days\n\n**To close the gap:**\n- Follow up with title on your 2 pending deals today\n- Ramp prospecting to 25 calls/day this week" },
]

// ── CSS ──────────────────────────────────────────────────────────────────────
const LCSS = `
.serif{font-family:'Playfair Display',serif;}

/* Nav */
.lp-nav{position:fixed;top:0;left:0;right:0;z-index:100;border-bottom:1px solid var(--b1);padding:0 32px;height:64px;display:flex;align-items:center;justify-content:space-between;}
.lp-nav-link{font-size:13px;font-weight:500;color:var(--muted);cursor:pointer;font-family:Poppins,sans-serif;transition:color .15s;}
.lp-nav-link:hover{color:var(--text);}

/* Buttons */
.lp-gold-btn{background:var(--gold);color:#fff;border:none;border-radius:10px;font-family:Poppins,sans-serif;font-weight:700;cursor:pointer;box-shadow:0 4px 18px rgba(180,83,9,.27);font-size:16px;padding:14px 32px;}
.lp-gold-btn:hover{opacity:.9;}
.lp-outline-btn{background:transparent;border:1.5px solid var(--b3);color:var(--text);border-radius:10px;padding:14px 28px;font-size:15px;font-weight:600;cursor:pointer;font-family:Poppins,sans-serif;transition:border-color .2s;}
.lp-outline-btn:hover{border-color:var(--text);}

/* Hamburger */
.lp-hamburger{display:none;flex-direction:column;gap:5px;cursor:pointer;padding:6px;border:none;background:transparent;z-index:101;}
.lp-hamburger span{display:block;width:22px;height:2px;background:var(--text);border-radius:2px;}
.lp-mobile-menu{position:fixed;inset:0;z-index:200;display:flex;flex-direction:column;padding:28px 24px;overflow-y:auto;}
.lp-mobile-link{font-size:24px;font-weight:800;color:var(--text);font-family:'Playfair Display',serif;padding:20px 0;border-bottom:1px solid var(--b2);cursor:pointer;}

/* Layout */
.lp-max{max-width:1100px;margin:0 auto;}
.lp-section{padding:96px 24px;}

/* Split layout */
.lp-split{display:grid;grid-template-columns:1fr 1fr;gap:64px;align-items:center;}

/* Habit demo */
.lp-habit-row{display:flex;align-items:center;gap:12px;padding:11px 14px;border-radius:12px;cursor:pointer;border:1.5px solid transparent;margin-bottom:6px;user-select:none;}
.lp-habit-row:hover{background:var(--surface);border-color:var(--b2);}
.lp-habit-row.done{background:var(--surface);border-color:var(--b2);}

/* Pipeline */
.lp-pipe-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;}
.lp-pipe-col{background:var(--surface);border:1px solid var(--b2);border-radius:14px;padding:14px;min-height:120px;}
.lp-pipe-deal{background:var(--bg);border:1px solid var(--b2);border-radius:8px;padding:8px 10px;margin-top:8px;font-size:12px;font-family:Poppins,sans-serif;}

/* Rank bar */
.lp-rank-bar-wrap{background:var(--b1);border-radius:8px;height:12px;overflow:hidden;}
.lp-rank-bar-fill{height:100%;border-radius:8px;}

/* AI demo chat */
.lp-ai-chat{background:var(--surface);border:1px solid var(--b2);border-radius:20px;overflow:hidden;max-width:520px;}
.lp-ai-header{padding:14px 20px;border-bottom:1px solid var(--b2);display:flex;align-items:center;gap:10px;}
.lp-ai-messages{padding:20px;display:flex;flex-direction:column;gap:14px;max-height:420px;overflow-y:auto;}
.lp-ai-msg{max-width:92%;padding:12px 16px;border-radius:14px;font-size:12.5px;line-height:1.7;font-family:Poppins,sans-serif;}
.lp-ai-msg.user{align-self:flex-end;background:rgba(180,83,9,.1);border:1px solid rgba(180,83,9,.2);color:var(--text);}
.lp-ai-msg.ai{align-self:flex-start;background:var(--bg2);border:1px solid var(--b1);color:var(--text);}
.lp-ai-input{padding:12px 20px;border-top:1px solid var(--b2);display:flex;align-items:center;gap:10px;}
.lp-ai-input-field{flex:1;background:var(--bg2);border:1.5px solid var(--b2);border-radius:10px;padding:10px 14px;font-size:12px;color:var(--muted);font-family:Poppins,sans-serif;}

/* Testimonials */
.lp-test-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;}
.lp-testimonial{background:var(--surface);border:1px solid var(--b2);border-radius:20px;padding:28px 24px;}

/* Pricing */
.lp-pricing-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;}

/* FAQ */
.lp-faq-item{border-bottom:1px solid var(--b2);}
.lp-faq-q{width:100%;text-align:left;padding:20px 0;background:transparent;border:none;cursor:pointer;display:flex;justify-content:space-between;align-items:center;font-size:15px;font-weight:600;color:var(--text);font-family:Poppins,sans-serif;gap:12px;}
.lp-faq-a{font-size:13px;color:var(--muted);line-height:1.8;font-family:Poppins,sans-serif;overflow:hidden;max-height:0;padding-bottom:0;transition:max-height .25s ease,padding-bottom .25s ease;}
.lp-faq-a.open{max-height:300px;padding-bottom:20px;}

/* Hero grid */
.lp-hero-grid{display:grid;grid-template-columns:1fr 1fr;gap:60px;align-items:center;}

/* Feature showcase mockup */
.lp-mockup-frame{border-radius:20px;overflow:hidden;box-shadow:0 28px 80px rgba(0,0,0,.18);border:1px solid var(--b2);}
.lp-mockup-chrome{padding:10px 16px;display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--b2);}
.lp-mockup-dot{width:10px;height:10px;border-radius:50%;}
.lp-mockup-body{padding:18px 20px;font-family:Poppins,sans-serif;}

/* Feature number */
.lp-feat-num{width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:800;font-family:'JetBrains Mono',monospace;flex-shrink:0;}

/* Responsive */
@media(max-width:900px){
  .lp-hero-grid{grid-template-columns:1fr;}
  .lp-split{grid-template-columns:1fr;gap:32px;}
  .lp-test-grid{grid-template-columns:1fr;}
  .lp-pricing-grid{grid-template-columns:1fr;}
  .lp-pipe-grid{grid-template-columns:repeat(2,1fr);}
  .lp-ai-chat{max-width:100%;}
  .lp-nav-links{display:none !important;}
  .lp-nav-ctas{display:none !important;}
  .lp-hamburger{display:flex !important;}
  .lp-section{padding:72px 24px;}
}
@media(max-width:640px){
  .lp-section{padding:56px 16px;}
  .lp-nav{padding:0 16px;}
}
@media(max-width:480px){
  .lp-hero-grid .lp-mockup-frame{display:none;}
  .lp-pipe-grid{grid-template-columns:1fr;}
}
`

// ── Mockup wrapper ──────────────────────────────────────────────────────────
function MockupFrame({ theme, children, title }) {
  return (
    <div className="lp-mockup-frame" style={{ background: theme === 'dark' ? '#1a1a1a' : '#fff' }}>
      <div className="lp-mockup-chrome" style={{ background: theme === 'dark' ? '#111' : '#f5f5f4' }}>
        <div className="lp-mockup-dot" style={{ background:'#ff5f57' }} />
        <div className="lp-mockup-dot" style={{ background:'#febc2e' }} />
        <div className="lp-mockup-dot" style={{ background:'#28c840' }} />
        <span style={{ marginLeft:8, fontSize:11, color:'var(--muted)', flex:1, textAlign:'center' }}>{title || 'RealtyGrind'}</span>
      </div>
      <div className="lp-mockup-body">{children}</div>
    </div>
  )
}

// ── Static dashboard mockup ─────────────────────────────────────────────────
function DashboardMockup({ theme }) {
  const habits = [
    { label:'Prospecting',  color:'#0ea5e9', done:true },
    { label:'Appointments', color:'#10b981', done:true },
    { label:'Showings',     color:'#8b5cf6', done:false },
    { label:'New Listing',  color:'#f97316', done:true },
    { label:'Follow-ups',   color:'#f43f5e', done:false },
  ]
  return (
    <MockupFrame theme={theme}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
        <div>
          <div style={{ fontSize:11, color:'var(--muted)' }}>Good morning, Alex</div>
          <div style={{ fontSize:16, fontWeight:700, color:'var(--text)' }}>Tuesday Grind</div>
        </div>
        <div style={{ fontSize:22, fontWeight:800, color:'#d97706' }}>72%</div>
      </div>
      <div style={{ fontSize:9, fontWeight:700, color:'var(--muted)', letterSpacing:1, marginBottom:8 }}>TODAY'S HABITS</div>
      {habits.map(h => (
        <div key={h.label} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:7 }}>
          <div style={{ width:16, height:16, borderRadius:4, border:`2px solid ${h.done ? h.color : 'var(--b3)'}`, background: h.done ? h.color : 'transparent', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            {h.done && <span style={{ color:'#fff', fontSize:9 }}>✓</span>}
          </div>
          <div style={{ fontSize:11, color:'var(--text)', flex:1 }}>{h.label}</div>
        </div>
      ))}
      <div style={{ marginTop:12, background:'var(--surface)', borderRadius:10, padding:'8px 12px', display:'flex', alignItems:'center', gap:10, border:'1px solid var(--b2)' }}>
        <span style={{ fontSize:14 }}>🥇</span>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:11, fontWeight:700, color:'#d97706' }}>Gold Rank · 2,340 XP</div>
          <div style={{ fontSize:9, color:'var(--muted)' }}>660 XP to Platinum</div>
        </div>
      </div>
    </MockupFrame>
  )
}

// ── Feature section label ───────────────────────────────────────────────────
function FeatLabel({ color, children, num }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
      <div className="lp-feat-num" style={{ background:`${color}18`, color, border:`1px solid ${color}30` }}>{num}</div>
      <div style={{ fontSize:11, fontWeight:700, letterSpacing:1.5, textTransform:'uppercase', color, fontFamily:'Poppins,sans-serif' }}>{children}</div>
    </div>
  )
}

// ── Feature section wrapper ─────────────────────────────────────────────────
function FeatureSection({ reverse, tinted, theme, label, labelColor, num, title, boldWord, desc, bullets, aiNote, children }) {
  const gold = theme === 'dark' ? '#d97706' : '#b45309'
  return (
    <section className="lp-section" style={tinted ? {
      background: theme === 'dark' ? 'rgba(255,255,255,.02)' : 'rgba(0,0,0,.02)',
      borderTop:'1px solid var(--b1)', borderBottom:'1px solid var(--b1)',
    } : undefined}>
      <div className="lp-max">
        <div className="lp-split" style={reverse ? { direction:'rtl' } : undefined}>
          <div style={reverse ? { direction:'ltr' } : undefined}>
            <FeatLabel color={labelColor} num={num}>{label}</FeatLabel>
            <h2 className="serif" style={{ fontSize:'clamp(28px,4vw,46px)', fontWeight:800, lineHeight:1.1, letterSpacing:'-.025em', marginBottom:18 }}>
              {title} <span style={{ color:gold }}>{boldWord}</span>
            </h2>
            <p style={{ fontSize:15, color:'var(--muted)', lineHeight:1.75, marginBottom:24, fontFamily:'Poppins,sans-serif' }}>{desc}</p>
            {bullets && (
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {bullets.map(([icon, text]) => (
                  <div key={text} style={{ display:'flex', alignItems:'center', gap:10, fontSize:13, fontFamily:'Poppins,sans-serif', color:'var(--text)' }}>
                    <span style={{ fontSize:15, flexShrink:0, width:20 }}>{icon}</span>{text}
                  </div>
                ))}
              </div>
            )}
            {aiNote && (
              <div style={{ marginTop:18, display:'flex', alignItems:'flex-start', gap:10, padding:'12px 16px', borderRadius:12, background:'rgba(139,92,246,.06)', border:'1px solid rgba(139,92,246,.15)' }}>
                <span style={{ fontSize:14, flexShrink:0, lineHeight:1.6 }}>🤖</span>
                <div style={{ fontSize:12, color:'var(--muted)', lineHeight:1.6, fontFamily:'Poppins,sans-serif' }}>
                  <strong style={{ color:'#8b5cf6' }}>AI powered</strong> — {aiNote}
                </div>
              </div>
            )}
          </div>
          <div style={reverse ? { direction:'ltr' } : undefined}>{children}</div>
        </div>
      </div>
    </section>
  )
}

// ── Main Component ────────────────────────────────────────────────────────
export default function LandingPage({ theme, onToggleTheme, onGetStarted, onSubscribe, onShowTerms, onShowAffiliates }) {
  const gold = theme === 'dark' ? '#d97706' : '#b45309'
  const goldBg = theme === 'dark' ? 'rgba(217,119,6,.12)' : 'rgba(180,83,9,.08)'

  const [menuOpen, setMenuOpen] = useState(false)
  const [openFaq, setOpenFaq] = useState(null)
  const [annual, setAnnual] = useState(false)
  const [checkedHabits, setCheckedHabits] = useState(new Set([0, 1]))

  function toggleHabit(idx) {
    setCheckedHabits(prev => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }
  const demoXp = DEMO_HABITS.filter((_, i) => checkedHabits.has(i)).reduce((a, h) => a + h.xp, 0)

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [menuOpen])

  useEffect(() => {
    const id = 'lcss-landing'
    if (!document.getElementById(id)) {
      const s = document.createElement('style')
      s.id = id
      s.textContent = LCSS
      document.head.appendChild(s)
    }
    return () => { document.getElementById(id)?.remove() }
  }, [])

  function scrollTo(id) {
    document.getElementById(id)?.scrollIntoView({ behavior:'smooth', block:'start' })
    setMenuOpen(false)
  }

  return (
    <div data-theme={theme} style={{ background:'var(--bg)', color:'var(--text)', minHeight:'100vh' }}>

      {/* ── Mobile Menu ─────────────────────────────────────────── */}
      {menuOpen && (
        <div className="lp-mobile-menu" style={{ background: theme === 'dark' ? 'rgba(10,10,10,.97)' : 'rgba(255,255,255,.97)' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:40 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <span style={{ fontSize:24 }}>🏡</span>
              <span className="serif" style={{ fontSize:22, fontWeight:800 }}>RealtyGrind</span>
            </div>
            <button onClick={() => setMenuOpen(false)} style={{ fontSize:28, background:'none', border:'none', cursor:'pointer', color:'var(--muted)', lineHeight:1 }}>✕</button>
          </div>
          {['Features','Pricing','FAQ'].map(l => (
            <div key={l} className="lp-mobile-link" onClick={() => scrollTo(l.toLowerCase())}>{l}</div>
          ))}
          <div className="lp-mobile-link" onClick={() => { onShowAffiliates(); setMenuOpen(false) }}>Affiliates</div>
          <div style={{ marginTop:40, display:'flex', flexDirection:'column', gap:12 }}>
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              <span style={{ fontSize:13, color:'var(--muted)', fontFamily:'Poppins,sans-serif' }}>Theme</span>
              <ThemeToggle theme={theme} onToggle={onToggleTheme} />
            </div>
            <button onClick={() => { onGetStarted(); setMenuOpen(false) }} style={{ padding:'14px', borderRadius:12, border:'1.5px solid var(--b3)', background:'transparent', color:'var(--text)', fontSize:16, fontWeight:600, cursor:'pointer', fontFamily:'Poppins,sans-serif' }}>Sign In</button>
            <button onClick={() => { onGetStarted(); setMenuOpen(false) }} className="lp-gold-btn" style={{ padding:'14px', fontSize:16, borderRadius:12 }}>Start Free →</button>
          </div>
        </div>
      )}

      {/* ── Nav ─────────────────────────────────────────────────── */}
      <nav className="lp-nav" style={{ background: theme === 'dark' ? '#0c0b09' : '#f5f3ee' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ fontSize:22 }}>🏡</span>
          <span className="serif" style={{ fontSize:20, fontWeight:800 }}>RealtyGrind</span>
        </div>
        <div className="lp-nav-links" style={{ display:'flex', gap:28 }}>
          {['Features','Pricing','FAQ'].map(l => (
            <span key={l} className="lp-nav-link" onClick={() => scrollTo(l.toLowerCase())}>{l}</span>
          ))}
          <span className="lp-nav-link" onClick={onShowAffiliates}>Affiliates</span>
        </div>
        <div className="lp-nav-ctas" style={{ display:'flex', alignItems:'center', gap:14 }}>
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          <button onClick={onGetStarted} style={{ background:'transparent', border:'1px solid var(--b3)', color:'var(--text)', borderRadius:8, padding:'7px 18px', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'Poppins,sans-serif' }}>Sign In</button>
          <button onClick={onGetStarted} className="lp-gold-btn" style={{ fontSize:13, padding:'8px 20px', borderRadius:8 }}>Start Free →</button>
        </div>
        <button className="lp-hamburger" onClick={() => setMenuOpen(true)} aria-label="Open menu">
          <span /><span /><span />
        </button>
      </nav>

      {/* ═══════════════════════════════════════════════════════════
          HERO
      ═══════════════════════════════════════════════════════════ */}
      <section className="lp-section" style={{ paddingTop:128, paddingBottom:80 }}>
        <div className="lp-max">
          <div className="lp-hero-grid">
            <div>
              <div style={{ display:'inline-flex', alignItems:'center', gap:8, padding:'5px 14px', borderRadius:24, marginBottom:24, background:goldBg, border:`1px solid ${gold}33`, fontSize:12, fontWeight:700, color:gold, letterSpacing:.5, fontFamily:'Poppins,sans-serif' }}>
                🏡 13 Tools. One Platform. Built for Agents.
              </div>
              <h1 className="serif" style={{ fontSize:'clamp(40px,6vw,76px)', fontWeight:900, lineHeight:1.04, letterSpacing:'-.03em', marginBottom:22 }}>
                Outwork Everyone.<br />
                <span style={{ color:gold }}>Track Everything.</span>
              </h1>
              <p style={{ fontSize:17, color:'var(--muted)', lineHeight:1.75, marginBottom:36, fontFamily:'Poppins,sans-serif', maxWidth:480 }}>
                Daily habits, pipeline, listings, buyers, team accountability, coaching, and AI — all in one platform built specifically for real estate agents who refuse to wing it.
              </p>
              <div style={{ display:'flex', gap:14, flexWrap:'wrap', marginBottom:28 }}>
                <button className="lp-gold-btn" onClick={onGetStarted}>Start for Free →</button>
                <button className="lp-outline-btn" onClick={onGetStarted}>Sign In</button>
              </div>
              <div style={{ display:'flex', gap:20, fontSize:12, color:'var(--dim)', fontFamily:'Poppins,sans-serif', flexWrap:'wrap' }}>
                {['✓ Free to start','✓ Cancel anytime','✓ 2 min setup'].map(t => <span key={t}>{t}</span>)}
              </div>
            </div>
            <DashboardMockup theme={theme} />
          </div>
        </div>
      </section>

      {/* ── Feature count bar ───────────────────────────────────── */}
      <section style={{ padding:'32px 24px', background: theme === 'dark' ? 'rgba(255,255,255,.02)' : 'rgba(0,0,0,.02)', borderTop:'1px solid var(--b1)', borderBottom:'1px solid var(--b1)' }}>
        <div className="lp-max" style={{ display:'flex', justifyContent:'center', gap:48, flexWrap:'wrap' }}>
          {[
            { num:'13', label:'Built-in tools', icon:'🛠️' },
            { num:'5', label:'Rank tiers', icon:'🏆' },
            { num:'AI', label:'Claude coaching', icon:'🤖' },
            { num:'∞', label:'Custom habits', icon:'📞' },
          ].map(s => (
            <div key={s.label} style={{ textAlign:'center', minWidth:80 }}>
              <div style={{ fontSize:28, marginBottom:6 }}>{s.icon}</div>
              <div className="serif" style={{ fontSize:26, fontWeight:800, color:gold, lineHeight:1 }}>{s.num}</div>
              <div style={{ fontSize:11, color:'var(--muted)', fontFamily:'Poppins,sans-serif', marginTop:4 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════
          FEATURE 1: DASHBOARD
      ═══════════════════════════════════════════════════════════ */}
      <FeatureSection theme={theme} num="01" label="Dashboard" labelColor="#d97706"
        title="Your command center," boldWord="daily."
        desc="See everything at a glance — today's completion percentage, monthly progress, XP rank, streak, and all your production stats in one view."
        bullets={[
          ['⚡','Real-time XP and rank progression'],
          ['🔥','Streak tracking with daily consistency rewards'],
          ['📊','Monthly goal progress for calls, showings, and closings'],
          ['🎯','Auto-redistributing daily targets based on remaining workdays'],
        ]}
        aiNote="Reads your dashboard data to give personalized coaching based on your actual production numbers.">
        <MockupFrame theme={theme} title="Dashboard">
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, marginBottom:14 }}>
            {[
              { icon:'⚡', label:'Today', val:'85%', c:'#10b981' },
              { icon:'📞', label:'Calls', val:'32', c:'#d97706' },
              { icon:'🎉', label:'Closed', val:'3', c:'#10b981' },
            ].map(s => (
              <div key={s.label} style={{ background:'var(--surface)', border:'1px solid var(--b2)', borderRadius:10, padding:'10px 12px', textAlign:'center' }}>
                <div style={{ fontSize:14, marginBottom:4 }}>{s.icon}</div>
                <div style={{ fontSize:16, fontWeight:800, color:s.c, fontFamily:"'JetBrains Mono',monospace" }}>{s.val}</div>
                <div style={{ fontSize:9, color:'var(--muted)' }}>{s.label}</div>
              </div>
            ))}
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', borderRadius:12, background:'var(--surface)', border:'1px solid var(--b2)' }}>
            <div style={{ width:42, height:42, borderRadius:'50%', border:'3px solid #d97706', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:800, color:'#d97706', fontFamily:"'JetBrains Mono',monospace" }}>85%</div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#d97706' }}>🥇 Gold · 2,340 XP</div>
              <div style={{ fontSize:9, color:'var(--muted)' }}>🔥 14-day streak</div>
            </div>
            <div style={{ display:'flex', gap:4 }}>
              {RANKS.slice(0,3).map(r => (
                <span key={r.name} style={{ fontSize:12 }}>{r.icon}</span>
              ))}
            </div>
          </div>
        </MockupFrame>
      </FeatureSection>

      {/* ═══════════════════════════════════════════════════════════
          FEATURE 2: DAILY HABIT VIEW (interactive)
      ═══════════════════════════════════════════════════════════ */}
      <FeatureSection theme={theme} reverse tinted num="02" label="Daily Habit Tracker" labelColor="#0ea5e9"
        title="Your entire day," boldWord="organized."
        desc="Track the core real estate habits every single day. Check off what you did, skip what doesn't apply, and watch your XP climb."
        bullets={[
          ['✅','Use our defaults or create your own habits'],
          ['⏭️','Skip any habit — streak stays safe'],
          ['🎮','Custom tasks with your own XP values'],
          ['📈','Streak tracking across every habit'],
        ]}
        aiNote="Notices skip patterns and suggests schedule adjustments based on your actual behavior.">
        <div style={{ background:'var(--surface)', border:'1px solid var(--b2)', borderRadius:20, padding:24 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:18 }}>
            <div>
              <div style={{ fontSize:11, color:'var(--muted)', fontFamily:'Poppins,sans-serif', marginBottom:2 }}>Try it — click to check off</div>
              <div style={{ fontSize:13, fontWeight:700, fontFamily:'Poppins,sans-serif' }}>{checkedHabits.size} of {DEMO_HABITS.length} complete</div>
            </div>
            <div style={{ textAlign:'right' }}>
              <div style={{ fontSize:24, fontWeight:800, color:gold, fontFamily:'Poppins,sans-serif' }}>{demoXp} XP</div>
              <div style={{ fontSize:10, color:'var(--muted)', fontFamily:'Poppins,sans-serif' }}>earned today</div>
            </div>
          </div>
          {DEMO_HABITS.map((h, idx) => {
            const done = checkedHabits.has(idx)
            return (
              <div key={h.id} className={`lp-habit-row${done ? ' done' : ''}`} onClick={() => toggleHabit(idx)}>
                <div style={{ width:22, height:22, borderRadius:6, border:`2px solid ${done ? h.color : 'var(--b3)'}`, background: done ? h.color : 'transparent', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  {done && <span style={{ color:'#fff', fontSize:11, fontWeight:700 }}>✓</span>}
                </div>
                <span style={{ fontSize:17, flexShrink:0 }}>{h.icon}</span>
                <span style={{ flex:1, fontSize:13, fontFamily:'Poppins,sans-serif', fontWeight: done ? 600 : 400, color: done ? 'var(--text)' : 'var(--muted)' }}>{h.label}</span>
                <span style={{ fontSize:11, color:h.color, fontWeight:700, fontFamily:'Poppins,sans-serif' }}>+{h.xp} XP</span>
              </div>
            )
          })}
          <div style={{ marginTop:16, background:'var(--b1)', borderRadius:6, height:6, overflow:'hidden' }}>
            <div style={{ height:'100%', width:`${Math.round(checkedHabits.size / DEMO_HABITS.length * 100)}%`, background:gold, borderRadius:6, transition:'width .3s' }} />
          </div>
        </div>
      </FeatureSection>

      {/* ═══════════════════════════════════════════════════════════
          FEATURE 3: CALENDAR INTEGRATION
      ═══════════════════════════════════════════════════════════ */}
      <FeatureSection theme={theme} num="03" label="Calendar Integration" labelColor="#3b82f6"
        title="Week view with" boldWord="Google Calendar."
        desc="See your entire week at a glance with habit completion, custom tasks, and Google Calendar events synced in one unified planner."
        bullets={[
          ['📅','Google Calendar sync with one click'],
          ['📋','Weekly planner with day-by-day habit tracking'],
          ['🗓️','Heatmap view for long-term consistency patterns'],
          ['🖨️','Print any view as a PDF for offline use'],
        ]}>
        <MockupFrame theme={theme} title="Week View">
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
            <div style={{ fontSize:12, fontWeight:700, color:'var(--text)' }}>This Week</div>
            <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:10, padding:'4px 10px', borderRadius:6, background:'rgba(66,133,244,.1)', border:'1px solid rgba(66,133,244,.25)', color:'#4285f4', fontWeight:600 }}>
              📅 Google Calendar
            </div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:6 }}>
            {['Mon','Tue','Wed','Thu','Fri'].map((day,i) => (
              <div key={day} style={{ background:'var(--surface)', border:'1px solid var(--b2)', borderRadius:8, padding:'8px 6px', fontSize:10 }}>
                <div style={{ fontWeight:700, color: i===1 ? '#3b82f6' : 'var(--muted)', marginBottom:6, textAlign:'center' }}>{day}</div>
                {['📞','🤝','🏠'].slice(0, i < 3 ? 3 : 2).map((icon,j) => (
                  <div key={j} style={{ display:'flex', alignItems:'center', gap:4, marginBottom:3 }}>
                    <div style={{ width:10, height:10, borderRadius:2, border:'1.5px solid', borderColor: (i+j)%2===0 ? '#10b981' : 'var(--b3)', background: (i+j)%2===0 ? '#10b981' : 'transparent', display:'flex', alignItems:'center', justifyContent:'center' }}>
                      {(i+j)%2===0 && <span style={{ color:'#fff', fontSize:6 }}>✓</span>}
                    </div>
                    <span style={{ fontSize:9, color:'var(--muted)' }}>{icon}</span>
                  </div>
                ))}
                {i === 1 && (
                  <div style={{ marginTop:4, fontSize:8, padding:'3px 4px', borderRadius:4, background:'rgba(66,133,244,.1)', color:'#4285f4', fontWeight:600, textAlign:'center' }}>
                    10am Showing
                  </div>
                )}
              </div>
            ))}
          </div>
        </MockupFrame>
      </FeatureSection>

      {/* ═══════════════════════════════════════════════════════════
          FEATURE 4: LISTINGS MANAGER
      ═══════════════════════════════════════════════════════════ */}
      <FeatureSection theme={theme} reverse tinted num="04" label="Listings Manager" labelColor="#8b5cf6"
        title="Every listing," boldWord="tracked."
        desc="Add your active listings with address, price, and commission. Track status from active to pending to closed — and auto-push deals into your pipeline."
        bullets={[
          ['🏡','Track address, price, commission, and lead source'],
          ['📊','Status pills: Active, Pending, Closed'],
          ['🔄','Auto-creates pipeline deals when listings go pending or close'],
          ['🎯','Monthly listing goals with progress tracking'],
        ]}
        aiNote="Analyzes your listings for pricing strategy, days on market, and marketing recommendations.">
        <MockupFrame theme={theme} title="Listings">
          <div style={{ fontSize:9, fontWeight:700, color:'var(--muted)', letterSpacing:1, marginBottom:10 }}>ACTIVE LISTINGS</div>
          {[
            { addr:'142 Maple St', price:'$485,000', status:'Active', color:'#0ea5e9', comm:'2.5%' },
            { addr:'309 Pine Ave', price:'$620,000', status:'Pending', color:'#f97316', comm:'3%' },
            { addr:'7 Oak Lane', price:'$395,000', status:'Closed', color:'#10b981', comm:'2.5%' },
          ].map(l => (
            <div key={l.addr} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', marginBottom:6, borderRadius:10, border:'1px solid var(--b2)', background:'var(--surface)' }}>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:12, fontWeight:600, color:'var(--text)' }}>{l.addr}</div>
                <div style={{ fontSize:10, color:'var(--muted)' }}>{l.price} · {l.comm}</div>
              </div>
              <span style={{ fontSize:9, padding:'3px 10px', borderRadius:12, fontWeight:700, background:`${l.color}14`, color:l.color, border:`1px solid ${l.color}30` }}>{l.status}</span>
            </div>
          ))}
        </MockupFrame>
      </FeatureSection>

      {/* ═══════════════════════════════════════════════════════════
          FEATURE 5: BUYERS MANAGER
      ═══════════════════════════════════════════════════════════ */}
      <FeatureSection theme={theme} num="05" label="Buyers Manager" labelColor="#0ea5e9"
        title="Buyer reps," boldWord="organized."
        desc="Track every buyer representation agreement with client details, status, and notes. Set monthly goals for buyer reps signed."
        bullets={[
          ['🤝','Track client name, status, and agreement details'],
          ['📋','Notes and buyer preferences per client'],
          ['🎯','Monthly buyer rep goals with dashboard tracking'],
          ['📤','Generate weekly buyer updates as PDF'],
        ]}>
        <MockupFrame theme={theme} title="Buyer Reps">
          <div style={{ fontSize:9, fontWeight:700, color:'var(--muted)', letterSpacing:1, marginBottom:10 }}>ACTIVE BUYER REPS</div>
          {[
            { name:'James & Lisa P.', area:'Downtown, 3BR+', budget:'$400-500K', status:'Active' },
            { name:'Maria S.', area:'Suburbs, 4BR', budget:'$550-650K', status:'Searching' },
          ].map(b => (
            <div key={b.name} style={{ padding:'12px 14px', marginBottom:8, borderRadius:12, border:'1px solid var(--b2)', background:'var(--surface)' }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
                <div style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{b.name}</div>
                <span style={{ fontSize:9, padding:'3px 10px', borderRadius:12, fontWeight:700, background:'rgba(14,165,233,.12)', color:'#0ea5e9', border:'1px solid rgba(14,165,233,.25)' }}>{b.status}</span>
              </div>
              <div style={{ fontSize:10, color:'var(--muted)' }}>🏡 {b.area} · 💰 {b.budget}</div>
            </div>
          ))}
        </MockupFrame>
      </FeatureSection>

      {/* ═══════════════════════════════════════════════════════════
          FEATURE 6: PIPELINE TRACKER
      ═══════════════════════════════════════════════════════════ */}
      <section className="lp-section" style={{ background: theme === 'dark' ? 'rgba(255,255,255,.02)' : 'rgba(0,0,0,.02)', borderTop:'1px solid var(--b1)', borderBottom:'1px solid var(--b1)' }}>
        <div className="lp-max">
          <div style={{ textAlign:'center', marginBottom:48 }}>
            <FeatLabel color="#10b981" num="06">Pipeline Tracker</FeatLabel>
            <h2 className="serif" style={{ fontSize:'clamp(28px,4vw,46px)', fontWeight:800, lineHeight:1.1, letterSpacing:'-.025em', marginBottom:12, textAlign:'left' }}>
              Every deal, <span style={{ color:gold }}>at a glance.</span>
            </h2>
            <p style={{ fontSize:15, color:'var(--muted)', lineHeight:1.75, fontFamily:'Poppins,sans-serif', textAlign:'left', maxWidth:560 }}>
              Track offers, pending deals, and closings. Each deal is a single record that moves between stages — no duplicates, no mess. Commission totals update automatically.
            </p>
          </div>
          <div className="lp-pipe-grid">
            {[
              { stage:'Offers Made', color:'#0ea5e9', deals:[{ addr:'142 Maple St', comm:'$8,400' }, { addr:'88 River Rd', comm:'$6,200' }] },
              { stage:'Offers Received', color:'#8b5cf6', deals:[{ addr:'309 Pine Ave', comm:'$12,000' }] },
              { stage:'Pending', color:'#f97316', deals:[{ addr:'7 Oak Lane', comm:'$9,800' }, { addr:'512 Birch Dr', comm:'$14,500' }] },
              { stage:'Closed', color:'#10b981', deals:[{ addr:'214 Elm St', comm:'$11,100' }] },
            ].map(col => (
              <div key={col.stage} className="lp-pipe-col">
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                  <div style={{ width:8, height:8, borderRadius:'50%', background:col.color }} />
                  <div style={{ fontSize:11, fontWeight:700, color:'var(--text)', fontFamily:'Poppins,sans-serif' }}>{col.stage}</div>
                </div>
                <div style={{ fontSize:10, color:'var(--muted)', fontFamily:'Poppins,sans-serif' }}>{col.deals.length} deal{col.deals.length !== 1 ? 's' : ''}</div>
                {col.deals.map(d => (
                  <div key={d.addr} className="lp-pipe-deal">
                    <div style={{ fontWeight:600, color:'var(--text)', marginBottom:2 }}>{d.addr}</div>
                    <div style={{ color:col.color, fontWeight:700, fontSize:11 }}>{d.comm}</div>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:24, flexWrap:'wrap', gap:12 }}>
            <div style={{ display:'inline-flex', alignItems:'center', gap:12, background:'var(--surface)', border:'1px solid var(--b2)', borderRadius:14, padding:'14px 28px' }}>
              <span style={{ fontSize:11, color:'var(--muted)', fontFamily:'Poppins,sans-serif', fontWeight:600 }}>Total Commission Tracked</span>
              <span className="serif" style={{ fontSize:28, fontWeight:800, color:gold }}>$62,000</span>
            </div>
            <div style={{ display:'inline-flex', alignItems:'center', gap:10, padding:'10px 20px', borderRadius:12, background:'rgba(139,92,246,.06)', border:'1px solid rgba(139,92,246,.15)' }}>
              <span style={{ fontSize:14 }}>🤖</span>
              <span style={{ fontSize:12, color:'var(--muted)', fontFamily:'Poppins,sans-serif' }}>
                <strong style={{ color:'#8b5cf6' }}>AI reads your pipeline</strong> — pricing strategy and deal prioritization
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════
          FEATURE 7: BUILT FOR TEAMS
      ═══════════════════════════════════════════════════════════ */}
      <FeatureSection theme={theme} num="07" label="Built for Teams" labelColor="#d97706"
        title="Full team" boldWord="visibility."
        desc="See your entire team ranked by XP. Daily standups, member stats, active listings, and full visibility into who's grinding — and who's not."
        bullets={[
          ['👥','Roster with XP leaderboard and rank badges'],
          ['📝','Daily standups feed from every agent'],
          ['📊','Click any member to see their full stats and habits'],
          ['🏡','Shared active listings board across the team'],
        ]}
        aiNote="Generates team performance summaries and highlights coaching opportunities for leaders.">
        <MockupFrame theme={theme} title="Team Roster">
          <div style={{ fontSize:9, fontWeight:700, color:'var(--muted)', letterSpacing:1, marginBottom:10 }}>LEADERBOARD</div>
          {[
            { name:'Alex R.', xp:'3,240', rank:'🥇', color:'#d97706', pct:82 },
            { name:'Sarah K.', xp:'2,890', rank:'🥇', color:'#d97706', pct:73 },
            { name:'Mike T.', xp:'1,650', rank:'🥈', color:'#94a3b8', pct:42 },
          ].map((m,i) => (
            <div key={m.name} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', marginBottom:6, borderRadius:10, border:'1px solid var(--b2)', background:'var(--surface)' }}>
              <div style={{ fontSize:12, fontWeight:800, color:'var(--dim)', fontFamily:"'JetBrains Mono',monospace", width:18, textAlign:'center' }}>{i+1}</div>
              <div style={{ width:30, height:30, borderRadius:'50%', background:`linear-gradient(135deg,${m.color},${m.color}88)`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, color:'#fff' }}>
                {m.name.charAt(0)}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:11, fontWeight:600, color:'var(--text)' }}>{m.name}</div>
                <div style={{ height:4, borderRadius:2, background:'var(--b1)', marginTop:4 }}>
                  <div style={{ width:`${m.pct}%`, height:'100%', borderRadius:2, background:m.color }} />
                </div>
              </div>
              <div style={{ textAlign:'right' }}>
                <div style={{ fontSize:10, fontWeight:700, color:m.color, fontFamily:"'JetBrains Mono',monospace" }}>{m.xp} XP</div>
                <div style={{ fontSize:12 }}>{m.rank}</div>
              </div>
            </div>
          ))}
        </MockupFrame>
      </FeatureSection>

      {/* ═══════════════════════════════════════════════════════════
          FEATURE 8: TEAM CHALLENGES
      ═══════════════════════════════════════════════════════════ */}
      <FeatureSection theme={theme} reverse tinted num="08" label="Team Challenges" labelColor="#f97316"
        title="Compete to" boldWord="win."
        desc="Leaders create time-limited challenges with XP bonuses. Push your team to outperform with leaderboard-driven competitions across any metric."
        bullets={[
          ['🏅','Create challenges for calls, showings, closings, or XP'],
          ['🎁','Bonus XP rewards for challenge winners'],
          ['📊','Live leaderboard tracking during challenges'],
          ['⏱️','Time-limited for urgency and accountability'],
        ]}
        aiNote="Suggests challenge targets based on team performance trends and historical data.">
        <MockupFrame theme={theme} title="Challenges">
          <div style={{ border:'2px solid rgba(249,115,22,.3)', borderRadius:14, padding:16, background:'rgba(249,115,22,.04)' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
              <div>
                <div style={{ fontSize:13, fontWeight:700, color:'var(--text)' }}>🏅 March Prospecting Blitz</div>
                <div style={{ fontSize:10, color:'var(--muted)', marginTop:2 }}>Most Prospecting Calls · +500 XP Bonus</div>
              </div>
              <span style={{ fontSize:9, padding:'3px 10px', borderRadius:12, fontWeight:700, background:'rgba(249,115,22,.12)', color:'#f97316', border:'1px solid rgba(249,115,22,.25)' }}>ACTIVE</span>
            </div>
            {[
              { name:'Alex R.', val:'47 calls', pos:'1st' },
              { name:'Sarah K.', val:'38 calls', pos:'2nd' },
              { name:'Mike T.', val:'24 calls', pos:'3rd' },
            ].map((p,i) => (
              <div key={p.name} style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 0', borderTop: i > 0 ? '1px solid var(--b2)' : 'none' }}>
                <div style={{ fontSize:11, fontWeight:800, color: i === 0 ? '#f97316' : 'var(--dim)', width:24, fontFamily:"'JetBrains Mono',monospace" }}>{p.pos}</div>
                <div style={{ fontSize:11, fontWeight:600, color:'var(--text)', flex:1 }}>{p.name}</div>
                <div style={{ fontSize:10, color:'var(--muted)', fontFamily:"'JetBrains Mono',monospace" }}>{p.val}</div>
              </div>
            ))}
          </div>
        </MockupFrame>
      </FeatureSection>

      {/* ═══════════════════════════════════════════════════════════
          FEATURE 9: TEAM LISTINGS BOARD
      ═══════════════════════════════════════════════════════════ */}
      <FeatureSection theme={theme} num="09" label="Team Listings Board" labelColor="#8b5cf6"
        title="Every listing," boldWord="team-wide."
        desc="See every active listing across your entire team in one shared board. Filter by agent, track days on market, and coordinate showing coverage."
        bullets={[
          ['🏡','All team listings in one consolidated view'],
          ['👤','Filter by agent to see individual portfolios'],
          ['📅','Days on market tracking for every listing'],
          ['💰','Commission breakdown by agent and listing'],
        ]}>
        <MockupFrame theme={theme} title="Team Listings">
          {[
            { addr:'142 Maple St', agent:'Alex R.', price:'$485K', dom:'22d', color:'#8b5cf6' },
            { addr:'309 Pine Ave', agent:'Sarah K.', price:'$620K', dom:'8d', color:'#0ea5e9' },
            { addr:'88 River Rd', agent:'Mike T.', price:'$395K', dom:'4d', color:'#10b981' },
          ].map(l => (
            <div key={l.addr} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', marginBottom:6, borderRadius:10, border:'1px solid var(--b2)', background:'var(--surface)' }}>
              <div style={{ width:26, height:26, borderRadius:'50%', background:`${l.color}20`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:700, color:l.color }}>
                {l.agent.charAt(0)}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:11, fontWeight:600, color:'var(--text)' }}>{l.addr}</div>
                <div style={{ fontSize:9, color:'var(--muted)' }}>{l.agent} · {l.price}</div>
              </div>
              <span style={{ fontSize:9, color:'var(--muted)', fontFamily:"'JetBrains Mono',monospace" }}>{l.dom}</span>
            </div>
          ))}
        </MockupFrame>
      </FeatureSection>

      {/* ═══════════════════════════════════════════════════════════
          FEATURE 10: BUYER NEEDS
      ═══════════════════════════════════════════════════════════ */}
      <FeatureSection theme={theme} reverse tinted num="10" label="Buyer Needs Board" labelColor="#06b6d4"
        title="Match buyers," boldWord="together."
        desc="Team members post what their buyers are looking for. Teammates reply with matching properties — keeping the whole team working together to close buyer deals faster."
        bullets={[
          ['📝','Post buyer needs with area, price range, and requirements'],
          ['💬','Threaded replies when teammates find matching properties'],
          ['✅','Mark as matched when a buyer finds their home'],
          ['🔍','Filter by team member to see all active buyer needs'],
        ]}>
        <MockupFrame theme={theme} title="Buyer Needs">
          <div style={{ padding:'14px', borderRadius:12, border:'1px solid var(--b2)', background:'var(--surface)', marginBottom:10 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
              <div style={{ width:24, height:24, borderRadius:'50%', background:'#06b6d420', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:700, color:'#06b6d4' }}>S</div>
              <div style={{ fontSize:11, fontWeight:600, color:'var(--text)' }}>Sarah K.</div>
              <div style={{ fontSize:9, color:'var(--muted)', marginLeft:'auto' }}>2h ago</div>
            </div>
            <div style={{ fontSize:11, color:'var(--text)', lineHeight:1.6, marginBottom:10 }}>
              Looking for 3BR+ in Downtown area, $400-500K range. Must have garage. Buyer is pre-approved and ready to move fast.
            </div>
            <div style={{ borderLeft:'2px solid #06b6d440', paddingLeft:12, marginLeft:8 }}>
              <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4 }}>
                <div style={{ width:18, height:18, borderRadius:'50%', background:'#d9770620', display:'flex', alignItems:'center', justifyContent:'center', fontSize:8, fontWeight:700, color:'#d97706' }}>A</div>
                <div style={{ fontSize:10, fontWeight:600, color:'var(--text)' }}>Alex R.</div>
                <div style={{ fontSize:8, color:'var(--muted)' }}>1h ago</div>
              </div>
              <div style={{ fontSize:10, color:'var(--muted)', lineHeight:1.5 }}>
                142 Maple St just got a price reduction to $470K. 3BR, 2BA with attached garage. Could be a match!
              </div>
            </div>
          </div>
        </MockupFrame>
      </FeatureSection>

      {/* ═══════════════════════════════════════════════════════════
          FEATURE 11: ACCOUNTABILITY GROUPS
      ═══════════════════════════════════════════════════════════ */}
      <FeatureSection theme={theme} num="11" label="Accountability Groups" labelColor="#f43f5e"
        title="Small groups," boldWord="big results."
        desc="Create sub-groups within your team with designated leaders. Group leaders can coach, run challenges, and track progress with ring-based completion tracking."
        bullets={[
          ['🫂','Create groups with assigned leaders and members'],
          ['📊','Group-level habit completion rings'],
          ['🏅','Group-specific challenges and competitions'],
          ['📝','Group leaders can write coaching notes for their members'],
        ]}>
        <MockupFrame theme={theme} title="Groups">
          <div style={{ fontSize:11, fontWeight:700, color:'var(--text)', marginBottom:12 }}>🫂 Downtown Team</div>
          <div style={{ display:'flex', gap:16, justifyContent:'center', marginBottom:16 }}>
            {[
              { name:'Alex', pct:85, color:'#10b981' },
              { name:'Sarah', pct:72, color:'#d97706' },
              { name:'Mike', pct:45, color:'#f43f5e' },
            ].map(m => (
              <div key={m.name} style={{ textAlign:'center' }}>
                <div style={{ width:48, height:48, borderRadius:'50%', border:`3px solid ${m.color}`, display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 6px' }}>
                  <div style={{ width:36, height:36, borderRadius:'50%', background:`${m.color}18`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:800, color:m.color, fontFamily:"'JetBrains Mono',monospace" }}>
                    {m.pct}%
                  </div>
                </div>
                <div style={{ fontSize:10, color:'var(--text)', fontWeight:600 }}>{m.name}</div>
              </div>
            ))}
          </div>
          <div style={{ textAlign:'center', fontSize:10, color:'var(--muted)', padding:'8px 0', borderTop:'1px solid var(--b2)' }}>
            Group Average: <strong style={{ color:'#d97706' }}>67%</strong> daily completion
          </div>
        </MockupFrame>
      </FeatureSection>

      {/* ═══════════════════════════════════════════════════════════
          FEATURE 12: COACHING NOTES
      ═══════════════════════════════════════════════════════════ */}
      <FeatureSection theme={theme} reverse tinted num="12" label="Coaching Notes" labelColor="#f59e0b"
        title="Private coaching," boldWord="threaded."
        desc="Leaders write private coaching notes per agent with type tags. Agents reply in-thread. A coaching history that builds over time and never gets lost."
        bullets={[
          ['📋','Type-tagged notes: Strategy, Mindset, Accountability, Skill'],
          ['💬','In-thread replies between coach and agent'],
          ['📌','Pin critical feedback so it stays visible'],
          ['🔒','Private between leader and agent — team can\'t see'],
        ]}
        aiNote="Reads your coaching history to personalize advice and track improvement patterns over time.">
        <MockupFrame theme={theme} title="Coaching">
          <div style={{ padding:'14px', borderRadius:12, border:'1px solid var(--b2)', borderLeft:'3px solid #f59e0b', background:'var(--surface)' }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
              <span style={{ fontSize:9, padding:'2px 8px', borderRadius:10, fontWeight:700, background:'rgba(245,158,11,.1)', color:'#f59e0b', border:'1px solid rgba(245,158,11,.25)' }}>STRATEGY</span>
              <div style={{ fontSize:9, color:'var(--muted)', marginLeft:'auto' }}>Mar 5, 2026</div>
            </div>
            <div style={{ fontSize:11, color:'var(--text)', lineHeight:1.6, marginBottom:10 }}>
              Great job getting 3 listings this month. Next step: focus on converting more showings to offers. Try asking for feedback after every showing.
            </div>
            <div style={{ borderLeft:'2px solid #f59e0b40', paddingLeft:12, marginLeft:8 }}>
              <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4 }}>
                <div style={{ fontSize:10, fontWeight:600, color:'var(--text)' }}>Agent reply:</div>
                <div style={{ fontSize:8, color:'var(--muted)' }}>Mar 6</div>
              </div>
              <div style={{ fontSize:10, color:'var(--muted)', lineHeight:1.5 }}>
                Thanks! Started doing follow-up calls after every showing. Already got better feedback on the Oak Lane listing.
              </div>
            </div>
          </div>
        </MockupFrame>
      </FeatureSection>

      {/* ═══════════════════════════════════════════════════════════
          FEATURE 13: AI ASSISTANT
      ═══════════════════════════════════════════════════════════ */}
      <FeatureSection theme={theme} num="13" label="AI Coaching Assistant" labelColor="#a855f7"
        title="Your personal" boldWord="strategist."
        desc="Ask your AI assistant anything about your business. It reads your live listings, pipeline data, habits, and goals — then delivers personalized coaching powered by Anthropic's Claude."
        bullets={[
          ['📊','Analyzes your active listings and pipeline data'],
          ['💬','Personalized coaching based on your production numbers'],
          ['🎯','Goal tracking and accountability insights'],
          ['🏠','Listing strategy, pricing, and comp analysis'],
          ['📈','Prospecting tips and time-block suggestions'],
        ]}>
        <div className="lp-ai-chat">
          <div className="lp-ai-header">
            <div style={{ width:32, height:32, borderRadius:10, background:'rgba(168,85,247,.12)', border:'1px solid rgba(168,85,247,.25)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16 }}>
              🤖
            </div>
            <div>
              <div style={{ fontSize:13, fontWeight:700, color:'var(--text)', fontFamily:'Poppins,sans-serif' }}>AI Assistant</div>
              <div style={{ fontSize:10, color:'var(--muted)', fontFamily:'Poppins,sans-serif' }}>Powered by Claude</div>
            </div>
            <div style={{ marginLeft:'auto', fontSize:10, fontWeight:700, padding:'3px 10px', borderRadius:20, background:'rgba(168,85,247,.1)', color:'#a855f7', border:'1px solid rgba(168,85,247,.25)', fontFamily:'Poppins,sans-serif' }}>
              LIVE
            </div>
          </div>
          <div className="lp-ai-messages">
            {AI_DEMO.map((msg, i) => (
              <div key={i} className={`lp-ai-msg ${msg.role}`}>
                {msg.text.split('\n').map((line, li) => {
                  const parts = line.split(/(\*\*[^*]+\*\*)/).map((seg, si) =>
                    seg.startsWith('**') && seg.endsWith('**')
                      ? <strong key={si}>{seg.slice(2, -2)}</strong>
                      : seg
                  )
                  const isBullet = line.match(/^(\d+\.\s|-\s)/)
                  return (
                    <div key={li} style={{
                      paddingLeft: isBullet ? 8 : 0,
                      marginTop: li > 0 && line === '' ? 6 : li > 0 ? 2 : 0,
                    }}>
                      {parts}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
          <div className="lp-ai-input">
            <div className="lp-ai-input-field">Ask about your listings, pipeline, goals...</div>
            <div style={{ width:32, height:32, borderRadius:8, background:gold, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, cursor:'default' }}>
              <span style={{ color:'#fff', fontSize:14, fontWeight:700 }}>&#8593;</span>
            </div>
          </div>
        </div>
        <div style={{ marginTop:20, display:'flex', gap:16, flexWrap:'wrap', alignItems:'center' }}>
          {[
            { plan:'Solo', credits:'50', color:'#94a3b8' },
            { plan:'Team', credits:'250', color:'#d97706' },
            { plan:'Brokerage', credits:'500', color:'#8b5cf6' },
          ].map(p => (
            <div key={p.plan} style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, fontFamily:'Poppins,sans-serif' }}>
              <div style={{ width:8, height:8, borderRadius:'50%', background:p.color }} />
              <span style={{ fontWeight:700, color:p.color }}>{p.plan}:</span>
              <span style={{ color:'var(--muted)' }}>{p.credits} credits/mo</span>
            </div>
          ))}
        </div>
      </FeatureSection>

      {/* ═══════════════════════════════════════════════════════════
          FEATURE 14: AI PRESENTATION BUILDER
      ═══════════════════════════════════════════════════════════ */}
      <FeatureSection theme={theme} reverse tinted num="14" label="AI Presentations" labelColor="#0ea5e9"
        title="Webinars that" boldWord="convert."
        desc="Generate stunning, branded webinar presentations to attract and convert leads. Pick your colors, style preset, and background — AI builds a polished multi-slide deck ready to present at virtual events and capture new clients."
        bullets={[
          ['🎨','Custom brand colors with hex input and color wheel'],
          ['🖼️','Team background images set by your leader'],
          ['📐','4 style presets — Modern, Classic, Minimal, Bold'],
          ['🎯','Lead-gen topics, market insights, and agent CTA auto-built'],
          ['🖥️','Fullscreen present mode with keyboard navigation'],
        ]}
        aiNote="Claude crafts compelling webinar content tailored to your market area to help you generate and convert leads.">
        <MockupFrame theme={theme} title="Presentation Builder">
          <div style={{ position:'relative', borderRadius:10, overflow:'hidden', background: theme === 'dark' ? '#0f172a' : '#f8fafc', border:'1px solid var(--b2)' }}>
            {/* Mini slide preview */}
            <div style={{ padding:'18px 16px 12px', background: theme === 'dark' ? 'linear-gradient(135deg,#0f172a 0%,#1e293b 100%)' : 'linear-gradient(135deg,#f0f9ff 0%,#e0f2fe 100%)', position:'relative' }}>
              <div style={{ position:'absolute', top:0, left:0, right:0, height:3, background:'linear-gradient(90deg,#0ea5e9,#38bdf8,#7dd3fc)', borderRadius:'0 0 2px 2px' }} />
              <div style={{ fontSize:7, fontWeight:700, letterSpacing:1.2, textTransform:'uppercase', color:'#0ea5e9', marginBottom:4 }}>WEBINAR PRESENTATION</div>
              <div style={{ fontSize:14, fontWeight:800, lineHeight:1.2, marginBottom:6, background:'linear-gradient(135deg,#0ea5e9,#38bdf8)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>First-Time Buyer Workshop</div>
              <div style={{ fontSize:9, color:'var(--muted)', marginBottom:10 }}>Generate leads with expert market insights</div>
              <div style={{ display:'flex', gap:8 }}>
                {[
                  { label:'Slides', val:'12' },
                  { label:'Topics', val:'5' },
                  { label:'CTA', val:'Book a Call' },
                ].map(s => (
                  <div key={s.label} style={{ flex:1, padding:'6px 8px', borderRadius:8, background: theme === 'dark' ? 'rgba(14,165,233,.08)' : 'rgba(14,165,233,.06)', border:'1px solid rgba(14,165,233,.15)' }}>
                    <div style={{ fontSize:7, color:'var(--muted)', textTransform:'uppercase', letterSpacing:.8, marginBottom:2 }}>{s.label}</div>
                    <div style={{ fontSize:10, fontWeight:700, color:'var(--text)' }}>{s.val}</div>
                  </div>
                ))}
              </div>
            </div>
            {/* Controls bar */}
            <div style={{ padding:'10px 16px', borderTop:'1px solid var(--b2)', display:'flex', alignItems:'center', gap:8 }}>
              <div style={{ display:'flex', gap:4 }}>
                {['#2563eb','#d97706','#059669','#7c3aed'].map(c => (
                  <div key={c} style={{ width:14, height:14, borderRadius:'50%', background:c, border: c === '#2563eb' ? '2px solid var(--text)' : '2px solid transparent', cursor:'default' }} />
                ))}
                <div style={{ width:14, height:14, borderRadius:'50%', background:'conic-gradient(#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)', border:'2px solid transparent' }} />
              </div>
              <div style={{ marginLeft:'auto', display:'flex', gap:6 }}>
                {['Modern','Classic','Minimal','Bold'].map((p,i) => (
                  <span key={p} style={{ fontSize:8, padding:'2px 8px', borderRadius:10, fontWeight:600, fontFamily:'Poppins,sans-serif', background: i === 0 ? 'rgba(14,165,233,.12)' : 'transparent', color: i === 0 ? '#0ea5e9' : 'var(--muted)', border: i === 0 ? '1px solid rgba(14,165,233,.3)' : '1px solid var(--b2)' }}>{p}</span>
                ))}
              </div>
            </div>
            {/* Slide dots */}
            <div style={{ padding:'0 16px 10px', display:'flex', justifyContent:'center', gap:4 }}>
              {[0,1,2,3,4].map(i => (
                <div key={i} style={{ width: i === 0 ? 16 : 6, height:6, borderRadius:3, background: i === 0 ? '#0ea5e9' : 'var(--b2)', transition:'width .2s' }} />
              ))}
            </div>
          </div>
        </MockupFrame>
      </FeatureSection>

      {/* ═══════════════════════════════════════════════════════════
          TESTIMONIALS
      ═══════════════════════════════════════════════════════════ */}
      <section id="features" className="lp-section">
        <div className="lp-max">
          <div style={{ textAlign:'center', marginBottom:56 }}>
            <div style={{ fontSize:11, fontWeight:700, letterSpacing:1.5, textTransform:'uppercase', color:gold, marginBottom:12, fontFamily:'Poppins,sans-serif' }}>Testimonials</div>
            <h2 className="serif" style={{ fontSize:'clamp(28px,4vw,48px)', fontWeight:800, lineHeight:1.1, letterSpacing:'-.025em' }}>
              Agents who <span style={{ color:gold }}>grind.</span>
            </h2>
          </div>
          <div className="lp-test-grid">
            {TESTIMONIALS.map(t => (
              <div key={t.name} className="lp-testimonial">
                <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16 }}>
                  <div style={{ width:40, height:40, borderRadius:'50%', background:goldBg, border:`1px solid ${gold}33`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, fontWeight:700, color:gold }}>{t.avatar}</div>
                  <div>
                    <div style={{ fontSize:14, fontWeight:700, fontFamily:'Poppins,sans-serif' }}>{t.name}</div>
                    <div style={{ fontSize:11, color:'var(--muted)', fontFamily:'Poppins,sans-serif' }}>{t.title}</div>
                  </div>
                </div>
                <p style={{ fontSize:13, color:'var(--muted)', lineHeight:1.75, marginBottom:14, fontFamily:'Poppins,sans-serif' }}>"{t.quote}"</p>
                <div style={{ fontSize:12, fontWeight:700, color:gold, fontFamily:'Poppins,sans-serif' }}>{t.stat}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════
          PRICING
      ═══════════════════════════════════════════════════════════ */}
      <section id="pricing" className="lp-section" style={{ background: theme === 'dark' ? 'rgba(255,255,255,.02)' : 'rgba(0,0,0,.02)', borderTop:'1px solid var(--b1)', borderBottom:'1px solid var(--b1)' }}>
        <div className="lp-max">
          <div style={{ textAlign:'center', marginBottom:48 }}>
            <div style={{ fontSize:11, fontWeight:700, letterSpacing:1.5, textTransform:'uppercase', color:gold, marginBottom:12, fontFamily:'Poppins,sans-serif' }}>Pricing</div>
            <h2 className="serif" style={{ fontSize:'clamp(28px,4vw,48px)', fontWeight:800, lineHeight:1.1, letterSpacing:'-.025em', marginBottom:18 }}>
              Simple, transparent <span style={{ color:gold }}>pricing.</span>
            </h2>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:12, fontFamily:'Poppins,sans-serif' }}>
              <span style={{ fontSize:13, color: annual ? 'var(--muted)' : 'var(--text)', fontWeight: annual ? 400 : 700 }}>Monthly</span>
              <button onClick={() => setAnnual(!annual)} style={{ width:44, height:24, borderRadius:12, border:'none', cursor:'pointer', position:'relative', background: annual ? gold : 'var(--b3)' }}>
                <div style={{ width:18, height:18, borderRadius:'50%', background:'#fff', position:'absolute', top:3, left: annual ? 23 : 3, transition:'left .2s' }} />
              </button>
              <span style={{ fontSize:13, color: annual ? 'var(--text)' : 'var(--muted)', fontWeight: annual ? 700 : 400 }}>Annual <span style={{ color:'#10b981', fontSize:11 }}>Save 17%</span></span>
            </div>
          </div>
          <div className="lp-pricing-grid">
            {PLANS.map(plan => {
              const isPop = plan.badge === 'Most Popular'
              const price = annual ? plan.priceAnn : plan.price
              return (
                <div key={plan.name} style={{ background:'var(--surface)', border: isPop ? `2px solid ${plan.color}` : '1px solid var(--b2)', borderRadius:20, padding:28, position:'relative' }}>
                  {plan.badge && (
                    <div style={{ position:'absolute', top:-12, left:'50%', transform:'translateX(-50%)', background:plan.color, color:'#fff', fontSize:10, fontWeight:700, padding:'4px 14px', borderRadius:20, fontFamily:'Poppins,sans-serif', whiteSpace:'nowrap' }}>{plan.badge}</div>
                  )}
                  <div style={{ fontSize:11, fontWeight:700, letterSpacing:1, textTransform:'uppercase', color:plan.color, marginBottom:8, fontFamily:'Poppins,sans-serif' }}>{plan.name}</div>
                  <div style={{ fontSize:13, color:'var(--muted)', lineHeight:1.5, marginBottom:20, fontFamily:'Poppins,sans-serif' }}>{plan.desc}</div>
                  <div style={{ marginBottom:20 }}>
                    <span className="serif" style={{ fontSize:48, fontWeight:800, color:'var(--text)' }}>${price}</span>
                    <span style={{ fontSize:13, color:'var(--muted)', fontFamily:'Poppins,sans-serif' }}>/mo{annual ? ' · billed annually' : ''}</span>
                  </div>
                  <button onClick={() => onSubscribe ? onSubscribe(plan.id, annual) : onGetStarted()} style={{ width:'100%', padding:'12px 0', borderRadius:10, fontSize:14, fontWeight:700, cursor:'pointer', marginBottom:20, fontFamily:'Poppins,sans-serif', background: isPop ? plan.color : 'transparent', color: isPop ? '#fff' : plan.color, border: isPop ? 'none' : `2px solid ${plan.color}`, boxShadow: isPop ? `0 6px 22px ${plan.color}44` : 'none' }}>
                    {plan.cta}
                  </button>
                  <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
                    {plan.features.map(f => (
                      <div key={f} style={{ display:'flex', alignItems:'center', gap:8, fontSize:12, color:'var(--text)', fontFamily:'Poppins,sans-serif' }}>
                        <div style={{ width:15, height:15, borderRadius:'50%', flexShrink:0, background:`${plan.color}18`, border:`1px solid ${plan.color}30`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:7, color:plan.color, fontWeight:700 }}>✓</div>
                        {f}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
          <div style={{ marginTop:36, textAlign:'center', padding:'24px 20px', background:'var(--surface)', border:'1px solid var(--b2)', borderRadius:14 }}>
            <div style={{ fontSize:15, fontWeight:700, color:'var(--text)', marginBottom:6, fontFamily:"'Poppins',sans-serif" }}>
              Want a white-label version for your brokerage or team?
            </div>
            <div style={{ fontSize:13, color:'var(--muted)', fontFamily:"'Poppins',sans-serif" }}>
              Contact support at{' '}
              <a href="tel:5307367085" style={{ color:gold, fontWeight:700, textDecoration:'none' }}>(530) 736-7085</a>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════
          FAQ
      ═══════════════════════════════════════════════════════════ */}
      <section id="faq" className="lp-section">
        <div className="lp-max" style={{ maxWidth:700 }}>
          <div style={{ textAlign:'center', marginBottom:48 }}>
            <div style={{ fontSize:11, fontWeight:700, letterSpacing:1.5, textTransform:'uppercase', color:gold, marginBottom:12, fontFamily:'Poppins,sans-serif' }}>FAQ</div>
            <h2 className="serif" style={{ fontSize:'clamp(28px,4vw,48px)', fontWeight:800, lineHeight:1.1, letterSpacing:'-.025em' }}>
              Common <span style={{ color:gold }}>questions.</span>
            </h2>
          </div>
          {FAQS.map((f, i) => (
            <div key={i} className="lp-faq-item">
              <button className="lp-faq-q" onClick={() => setOpenFaq(openFaq === i ? null : i)}>
                {f.q}
                <span style={{ fontSize:18, color:'var(--muted)', flexShrink:0 }}>{openFaq === i ? '−' : '+'}</span>
              </button>
              <div className={`lp-faq-a${openFaq === i ? ' open' : ''}`}>{f.a}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════
          FINAL CTA
      ═══════════════════════════════════════════════════════════ */}
      <section style={{ padding:'104px 24px', textAlign:'center' }}>
        <div style={{ maxWidth:600, margin:'0 auto' }}>
          <div style={{ fontSize:52, marginBottom:18 }}>🏡</div>
          <h2 className="serif" style={{ fontSize:'clamp(30px,5vw,56px)', fontWeight:800, letterSpacing:'-.025em', marginBottom:18, lineHeight:1.08 }}>
            Stop winging it.<br />
            <span style={{ color:gold }}>Start grinding.</span>
          </h2>
          <p style={{ fontSize:16, color:'var(--muted)', lineHeight:1.75, marginBottom:38, fontFamily:'Poppins,sans-serif' }}>
            Join agents who track every habit, manage every deal, get AI-powered coaching, and actually hit their production goals.
          </p>
          <button className="lp-gold-btn" style={{ fontSize:17, padding:'17px 44px' }} onClick={onGetStarted}>
            Start Free Trial →
          </button>
          <div style={{ marginTop:18, fontSize:12, color:'var(--dim)', fontFamily:'Poppins,sans-serif' }}>
            Solo from $29/mo · Team plans from $199/mo · AI coaching included · Cancel anytime
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────── */}
      <footer style={{ padding:'40px 24px', borderTop:'1px solid var(--b1)', background:'var(--surface)' }}>
        <div className="lp-max" style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:16 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:18 }}>🏡</span>
            <span className="serif" style={{ fontSize:16, fontWeight:800 }}>RealtyGrind</span>
          </div>
          <div style={{ fontSize:12, color:'var(--muted)', fontFamily:'Poppins,sans-serif' }}>
            © {new Date().getFullYear()} RealtyGrind. Built for agents who refuse to wing it.
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:20, flexWrap:'wrap' }}>
            <button onClick={onShowTerms} style={{ fontSize:13, color:'var(--muted)', fontFamily:'Poppins,sans-serif', fontWeight:500, background:'transparent', border:'none', cursor:'pointer' }}>
              Terms &amp; Privacy
            </button>
            <a href="/pitch-deck.html" target="_blank" rel="noopener noreferrer"
              style={{ fontSize:13, color:gold, fontFamily:'Poppins,sans-serif', fontWeight:600, textDecoration:'none' }}>
              📊 Pitch Deck
            </a>
            <button onClick={onShowAffiliates} style={{ fontSize:13, color:gold, fontFamily:'Poppins,sans-serif', fontWeight:600, background:'transparent', border:'none', cursor:'pointer' }}>
              🤝 Affiliates
            </button>
            <button onClick={onGetStarted} style={{ fontSize:13, color:gold, fontFamily:'Poppins,sans-serif', fontWeight:600, background:'transparent', border:'none', cursor:'pointer' }}>
              Get Started →
            </button>
          </div>
        </div>
      </footer>

    </div>
  )
}
