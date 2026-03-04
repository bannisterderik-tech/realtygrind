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

const FEATURES = [
  { icon:'🏆', title:'XP & Ranks', desc:'Bronze through Diamond. Every habit and deal earns XP. Gamified accountability that keeps you grinding.', showRanks:true, ai:'AI tracks your XP pace and predicts rank-up dates' },
  { icon:'⏭️', title:'Skip & Restore', desc:'Skip any habit without breaking your streak. Restore it when you\'re ready. Flexibility without losing momentum.', ai:'AI notices skip patterns and suggests schedule adjustments' },
  { icon:'🎯', title:'Goals & Metrics', desc:'Set monthly targets for calls, showings, closings, and GCI. Real-time progress tracking with annual production reports and trend analysis.', ai:'AI flags when you\'re behind pace and suggests catch-up plans' },
  { icon:'🖨️', title:'Print & Offline', desc:'One-click PDF of your daily checklist, weekly listing updates, buyer updates, and pipeline snapshots. No signal needed.' },
  { icon:'👥', title:'Roster & Standups', desc:'See your entire team ranked by XP. Daily standups, member stats, active listings board, and full visibility into who\'s grinding.', ai:'AI generates team performance summaries for leaders' },
  { icon:'🏅', title:'Team Challenges', desc:'Leaders create time-limited challenges with XP bonuses. Accountability groups compete live across custom metrics.', ai:'AI suggests challenge targets based on team performance' },
  { icon:'📋', title:'Coaching Notes', desc:'Private per-agent coaching notes with type tags. Agents reply in-thread. Leaders pin critical feedback.', ai:'AI reads coaching history to personalize advice' },
  { icon:'🔗', title:'Tool Directory', desc:'Quick-launch links to Follow Up Boss, REDX, SkySlope, Zillow, and 10+ more. Filter by category, toggle per user.' },
]

// ── Static AI demo conversation (pure data, zero state/effects) ──────────────
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

/* Print mockup */
.lp-print-paper{background:#fff;border-radius:12px;box-shadow:0 12px 48px rgba(0,0,0,.18);padding:28px 22px;font-family:'Courier New',monospace;transform:rotate(-0.8deg);max-width:320px;color:#111;}
.lp-print-row{display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid #e5e7eb;}
.lp-print-box{width:15px;height:15px;border:1.5px solid #374151;border-radius:2px;flex-shrink:0;}
.lp-print-dots{flex:1;height:1px;border-bottom:1.5px dotted #d1d5db;margin-left:6px;}

/* Pipeline */
.lp-pipe-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;}
.lp-pipe-col{background:var(--surface);border:1px solid var(--b2);border-radius:14px;padding:14px;min-height:120px;}
.lp-pipe-deal{background:var(--bg);border:1px solid var(--b2);border-radius:8px;padding:8px 10px;margin-top:8px;font-size:12px;font-family:Poppins,sans-serif;}

/* Rank bar */
.lp-rank-bar-wrap{background:var(--b1);border-radius:8px;height:12px;overflow:hidden;}
.lp-rank-bar-fill{height:100%;border-radius:8px;}

/* Feature grid */
.lp-feat-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:18px;}
.lp-feat-card{background:var(--surface);border:1px solid var(--b2);border-radius:16px;padding:22px;}

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
.lp-faq-a.open{max-height:200px;padding-bottom:20px;}

/* Hero grid */
.lp-hero-grid{display:grid;grid-template-columns:1fr 1fr;gap:60px;align-items:center;}

/* Responsive */
@media(max-width:1050px){
  .lp-feat-grid{grid-template-columns:repeat(2,1fr);}
}
@media(max-width:900px){
  .lp-hero-grid{grid-template-columns:1fr;}
  .lp-split{grid-template-columns:1fr;gap:32px;}
  .lp-test-grid{grid-template-columns:1fr;}
  .lp-pricing-grid{grid-template-columns:1fr;}
  .lp-pipe-grid{grid-template-columns:repeat(2,1fr);}
  .lp-print-paper{transform:none;max-width:100%;}
  .lp-ai-chat{max-width:100%;}
  .lp-nav-links{display:none !important;}
  .lp-nav-ctas{display:none !important;}
  .lp-hamburger{display:flex !important;}
  .lp-section{padding:72px 24px;}
}
@media(max-width:640px){
  .lp-section{padding:56px 16px;}
  .lp-feat-grid{grid-template-columns:1fr 1fr;}
  .lp-nav{padding:0 16px;}
}
@media(max-width:480px){
  .lp-feat-grid{grid-template-columns:1fr;}
  .lp-hero-grid .lp-mockup{display:none;}
  .lp-pipe-grid{grid-template-columns:1fr;}
}
`

// ── Static dashboard mockup (no state, no animations) ─────────────────────
function DashboardMockup({ theme }) {
  const habits = [
    { label:'Prospecting',  color:'#0ea5e9', done:true },
    { label:'Appointments', color:'#10b981', done:true },
    { label:'Showings',     color:'#8b5cf6', done:false },
    { label:'New Listing',  color:'#f97316', done:true },
    { label:'Follow-ups',   color:'#f43f5e', done:false },
  ]
  return (
    <div className="lp-mockup" style={{
      background: theme === 'dark' ? '#1a1a1a' : '#fff',
      border:'1px solid var(--b2)', borderRadius:20,
      boxShadow:'0 28px 80px rgba(0,0,0,.18)', overflow:'hidden',
      fontFamily:'Poppins,sans-serif',
    }}>
      <div style={{ background: theme === 'dark' ? '#111' : '#f5f5f4', padding:'10px 16px', display:'flex', alignItems:'center', gap:8, borderBottom:'1px solid var(--b2)' }}>
        <div style={{ width:10, height:10, borderRadius:'50%', background:'#ff5f57' }} />
        <div style={{ width:10, height:10, borderRadius:'50%', background:'#febc2e' }} />
        <div style={{ width:10, height:10, borderRadius:'50%', background:'#28c840' }} />
        <span style={{ marginLeft:8, fontSize:11, color:'var(--muted)', flex:1, textAlign:'center' }}>RealtyGrind</span>
      </div>
      <div style={{ padding:'18px 20px' }}>
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
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────
export default function LandingPage({ theme, onToggleTheme, onGetStarted, onSubscribe, onShowTerms }) {
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

  // Lock body scroll when mobile menu open
  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [menuOpen])

  // Inject CSS once
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
          1. HERO
      ═══════════════════════════════════════════════════════════ */}
      <section className="lp-section" style={{ paddingTop:128, paddingBottom:80 }}>
        <div className="lp-max">
          <div className="lp-hero-grid">
            <div>
              <div style={{ display:'inline-flex', alignItems:'center', gap:8, padding:'5px 14px', borderRadius:24, marginBottom:24, background:goldBg, border:`1px solid ${gold}33`, fontSize:12, fontWeight:700, color:gold, letterSpacing:.5, fontFamily:'Poppins,sans-serif' }}>
                🏡 Built for Real Estate Agents
              </div>
              <h1 className="serif" style={{ fontSize:'clamp(40px,6vw,76px)', fontWeight:900, lineHeight:1.04, letterSpacing:'-.03em', marginBottom:22 }}>
                Outwork Everyone.<br />
                <span style={{ color:gold }}>Track Everything.</span>
              </h1>
              <p style={{ fontSize:17, color:'var(--muted)', lineHeight:1.75, marginBottom:36, fontFamily:'Poppins,sans-serif', maxWidth:480 }}>
                The habit tracker, pipeline manager, AI coaching assistant, and team accountability platform built specifically for agents who refuse to wing it.
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

      {/* ═══════════════════════════════════════════════════════════
          2. FEATURE HIGHLIGHTS BAR
      ═══════════════════════════════════════════════════════════ */}
      <section style={{ padding:'32px 24px', background: theme === 'dark' ? 'rgba(255,255,255,.02)' : 'rgba(0,0,0,.02)', borderTop:'1px solid var(--b1)', borderBottom:'1px solid var(--b1)' }}>
        <div className="lp-max" style={{ display:'flex', justifyContent:'center', gap:48, flexWrap:'wrap' }}>
          {[
            { num:'∞', label:'Custom habits', icon:'📞' },
            { num:'5', label:'Rank tiers', icon:'🏆' },
            { num:'AI', label:'Coaching built in', icon:'🤖' },
            { num:'PDF', label:'Print & go', icon:'🖨️' },
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
          3. HABIT TRACKER DEMO (interactive — the core product)
      ═══════════════════════════════════════════════════════════ */}
      <section className="lp-section">
        <div className="lp-max">
          <div className="lp-split">
            <div>
              <div style={{ fontSize:11, fontWeight:700, letterSpacing:1.5, textTransform:'uppercase', color:'#0ea5e9', marginBottom:12, fontFamily:'Poppins,sans-serif' }}>Daily Habit Tracker</div>
              <h2 className="serif" style={{ fontSize:'clamp(28px,4vw,50px)', fontWeight:800, lineHeight:1.1, letterSpacing:'-.025em', marginBottom:18 }}>
                Your entire day,<br />organized.
              </h2>
              <p style={{ fontSize:15, color:'var(--muted)', lineHeight:1.75, marginBottom:28, fontFamily:'Poppins,sans-serif' }}>
                Track the core real estate habits every single day. Check off what you did, skip what doesn't apply, and watch your XP climb. Your streak stays intact no matter what.
              </p>
              <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                {[
                  ['✓','Use our defaults or create your own','#0ea5e9'],
                  ['✕','Skip any habit — streak stays safe','#f43f5e'],
                  ['✓','Custom tasks with your own XP values','#10b981'],
                  ['✓','Streak tracking across every habit','#d97706'],
                ].map(([sym, text, col]) => (
                  <div key={text} style={{ display:'flex', alignItems:'center', gap:10, fontSize:14, fontFamily:'Poppins,sans-serif' }}>
                    <span style={{ color:col, fontWeight:800, fontSize:15, width:18, flexShrink:0 }}>{sym}</span>{text}
                  </div>
                ))}
              </div>
              <div style={{ marginTop:20, display:'flex', alignItems:'flex-start', gap:10, padding:'12px 16px', borderRadius:12, background:'rgba(139,92,246,.06)', border:'1px solid rgba(139,92,246,.15)' }}>
                <span style={{ fontSize:14, flexShrink:0, lineHeight:1.6 }}>🤖</span>
                <div style={{ fontSize:12, color:'var(--muted)', lineHeight:1.6, fontFamily:'Poppins,sans-serif' }}>
                  <strong style={{ color:'#8b5cf6' }}>AI knows your habits</strong> — "You've skipped prospecting 3 days straight. Try front-loading it at 8 AM."
                </div>
              </div>
            </div>
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
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════
          4. AI COACHING ASSISTANT (the differentiator)
      ═══════════════════════════════════════════════════════════ */}
      <section className="lp-section" style={{ background: theme === 'dark' ? 'rgba(139,92,246,.04)' : 'rgba(139,92,246,.03)', borderTop:'1px solid var(--b1)', borderBottom:'1px solid var(--b1)' }}>
        <div className="lp-max">
          <div className="lp-split">
            <div>
              <div style={{ display:'inline-flex', alignItems:'center', gap:8, marginBottom:14 }}>
                <div style={{ fontSize:11, fontWeight:700, letterSpacing:1.5, textTransform:'uppercase', color:'#8b5cf6', fontFamily:'Poppins,sans-serif' }}>AI Coaching Assistant</div>
                <span style={{ fontSize:9, padding:'3px 10px', borderRadius:20, fontWeight:700, background:'rgba(139,92,246,.12)', color:'#8b5cf6', border:'1px solid rgba(139,92,246,.25)', fontFamily:"'JetBrains Mono',monospace", letterSpacing:.5 }}>NEW</span>
              </div>
              <h2 className="serif" style={{ fontSize:'clamp(28px,4vw,50px)', fontWeight:800, lineHeight:1.1, letterSpacing:'-.025em', marginBottom:18 }}>
                Your personal<br />listing <span style={{ color:gold }}>strategist.</span>
              </h2>
              <p style={{ fontSize:15, color:'var(--muted)', lineHeight:1.75, marginBottom:28, fontFamily:'Poppins,sans-serif' }}>
                Ask your AI assistant anything about your business. It reads your live listings, pipeline data, and goals — then delivers personalized coaching, pricing strategy, and comp analysis.
              </p>
              <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                {[
                  ['📊','Analyzes your active listings & pipeline','#0ea5e9'],
                  ['💬','Personalized coaching based on your data','#8b5cf6'],
                  ['🎯','Goal tracking & accountability insights','#d97706'],
                  ['🏠','Listing strategy & pricing recommendations','#10b981'],
                  ['📈','Prospecting tips & time-block suggestions','#f43f5e'],
                ].map(([icon, text, col]) => (
                  <div key={text} style={{ display:'flex', alignItems:'center', gap:10, fontSize:14, fontFamily:'Poppins,sans-serif' }}>
                    <span style={{ fontSize:15, width:18, flexShrink:0 }}>{icon}</span>
                    <span style={{ color:'var(--text)' }}>{text}</span>
                  </div>
                ))}
              </div>
              <div style={{ marginTop:24, display:'flex', gap:16, flexWrap:'wrap', alignItems:'center' }}>
                {[
                  { plan:'Solo', credits:'50', color:'#94a3b8' },
                  { plan:'Team', credits:'250', color:'#d97706' },
                  { plan:'Brokerage', credits:'Unlimited', color:'#8b5cf6' },
                ].map(p => (
                  <div key={p.plan} style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, fontFamily:'Poppins,sans-serif' }}>
                    <div style={{ width:8, height:8, borderRadius:'50%', background:p.color }} />
                    <span style={{ fontWeight:700, color:p.color }}>{p.plan}:</span>
                    <span style={{ color:'var(--muted)' }}>{p.credits} credits/mo</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Static AI chat mockup — zero state, zero effects */}
            <div className="lp-ai-chat">
              <div className="lp-ai-header">
                <div style={{ width:32, height:32, borderRadius:10, background:'rgba(139,92,246,.12)', border:'1px solid rgba(139,92,246,.25)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16 }}>
                  🤖
                </div>
                <div>
                  <div style={{ fontSize:13, fontWeight:700, color:'var(--text)', fontFamily:'Poppins,sans-serif' }}>AI Assistant</div>
                  <div style={{ fontSize:10, color:'var(--muted)', fontFamily:'Poppins,sans-serif' }}>Powered by Claude</div>
                </div>
                <div style={{ marginLeft:'auto', fontSize:10, fontWeight:700, padding:'3px 10px', borderRadius:20, background:'rgba(139,92,246,.1)', color:'#8b5cf6', border:'1px solid rgba(139,92,246,.25)', fontFamily:'Poppins,sans-serif' }}>
                  BETA
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
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════
          5. PIPELINE TRACKER
      ═══════════════════════════════════════════════════════════ */}
      <section className="lp-section">
        <div className="lp-max">
          <div style={{ textAlign:'center', marginBottom:56 }}>
            <div style={{ fontSize:11, fontWeight:700, letterSpacing:1.5, textTransform:'uppercase', color:'#10b981', marginBottom:12, fontFamily:'Poppins,sans-serif' }}>Pipeline Tracker</div>
            <h2 className="serif" style={{ fontSize:'clamp(28px,4vw,48px)', fontWeight:800, lineHeight:1.1, letterSpacing:'-.025em', marginBottom:12 }}>
              Every deal, <span style={{ color:gold }}>at a glance.</span>
            </h2>
            <p style={{ fontSize:15, color:'var(--muted)', lineHeight:1.75, fontFamily:'Poppins,sans-serif', maxWidth:560, margin:'0 auto' }}>
              Track offers, pending deals, and closings in a simple board. Commission totals update automatically.
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
          <div style={{ textAlign:'center', marginTop:32 }}>
            <div style={{ display:'inline-flex', alignItems:'center', gap:12, background:'var(--surface)', border:'1px solid var(--b2)', borderRadius:14, padding:'14px 28px' }}>
              <span style={{ fontSize:11, color:'var(--muted)', fontFamily:'Poppins,sans-serif', fontWeight:600 }}>Total Commission Tracked</span>
              <span className="serif" style={{ fontSize:28, fontWeight:800, color:gold }}>$62,000</span>
            </div>
          </div>
          <div style={{ display:'flex', justifyContent:'center', marginTop:16 }}>
            <div style={{ display:'inline-flex', alignItems:'center', gap:10, padding:'10px 20px', borderRadius:12, background:'rgba(139,92,246,.06)', border:'1px solid rgba(139,92,246,.15)' }}>
              <span style={{ fontSize:14 }}>🤖</span>
              <span style={{ fontSize:12, color:'var(--muted)', fontFamily:'Poppins,sans-serif' }}>
                <strong style={{ color:'#8b5cf6' }}>AI reads your pipeline</strong> — pricing strategy, comp analysis, and deal prioritization
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════
          6. ALL FEATURES (compact grid — complete coverage)
      ═══════════════════════════════════════════════════════════ */}
      <section id="features" className="lp-section" style={{ background: theme === 'dark' ? 'rgba(255,255,255,.02)' : 'rgba(0,0,0,.02)', borderTop:'1px solid var(--b1)', borderBottom:'1px solid var(--b1)' }}>
        <div className="lp-max">
          <div style={{ textAlign:'center', marginBottom:56 }}>
            <div style={{ fontSize:11, fontWeight:700, letterSpacing:1.5, textTransform:'uppercase', color:gold, marginBottom:12, fontFamily:'Poppins,sans-serif' }}>Everything You Need</div>
            <h2 className="serif" style={{ fontSize:'clamp(28px,4vw,48px)', fontWeight:800, lineHeight:1.1, letterSpacing:'-.025em' }}>
              Built for the <span style={{ color:gold }}>grind.</span>
            </h2>
          </div>
          <div className="lp-feat-grid">
            {FEATURES.map(f => (
              <div key={f.title} className="lp-feat-card">
                <div style={{ fontSize:28, marginBottom:12 }}>{f.icon}</div>
                <div style={{ fontSize:15, fontWeight:700, color:'var(--text)', marginBottom:6, fontFamily:'Poppins,sans-serif' }}>{f.title}</div>
                <div style={{ fontSize:12, color:'var(--muted)', lineHeight:1.7, fontFamily:'Poppins,sans-serif' }}>{f.desc}</div>
                {f.showRanks && (
                  <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginTop:10 }}>
                    {RANKS.map(r => (
                      <span key={r.name} style={{ fontSize:10, padding:'2px 8px', borderRadius:12, background:`${r.color}18`, color:r.color, fontWeight:700, fontFamily:'Poppins,sans-serif', border:`1px solid ${r.color}30` }}>
                        {r.icon} {r.name}
                      </span>
                    ))}
                  </div>
                )}
                {f.ai && (
                  <div style={{ marginTop:10, display:'flex', alignItems:'center', gap:6, fontSize:10, color:'#8b5cf6', fontFamily:'Poppins,sans-serif', fontStyle:'italic' }}>
                    <span style={{ fontStyle:'normal' }}>🤖</span> {f.ai}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════
          7. TESTIMONIALS
      ═══════════════════════════════════════════════════════════ */}
      <section className="lp-section">
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
          8. PRICING
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

          {/* White-label callout */}
          <div style={{ marginTop:36, textAlign:'center', padding:'24px 20px', background:'var(--surface)',
            border:'1px solid var(--b2)', borderRadius:14 }}>
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
          9. FAQ
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
          10. FINAL CTA
      ═══════════════════════════════════════════════════════════ */}
      <section style={{ padding:'104px 24px', textAlign:'center' }}>
        <div style={{ maxWidth:600, margin:'0 auto' }}>
          <div style={{ fontSize:52, marginBottom:18 }}>🏡</div>
          <h2 className="serif" style={{ fontSize:'clamp(30px,5vw,56px)', fontWeight:800, letterSpacing:'-.025em', marginBottom:18, lineHeight:1.08 }}>
            Stop winging it.<br />
            <span style={{ color:gold }}>Start grinding.</span>
          </h2>
          <p style={{ fontSize:16, color:'var(--muted)', lineHeight:1.75, marginBottom:38, fontFamily:'Poppins,sans-serif' }}>
            Join agents who track every habit, get AI-powered coaching, and actually hit their production goals.
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
            <button onClick={onGetStarted} style={{ fontSize:13, color:gold, fontFamily:'Poppins,sans-serif', fontWeight:600, background:'transparent', border:'none', cursor:'pointer' }}>
              Get Started →
            </button>
          </div>
        </div>
      </footer>

    </div>
  )
}
