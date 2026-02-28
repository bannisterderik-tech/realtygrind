import { useState } from 'react'
import { CSS, Wordmark, ThemeToggle } from '../design'

// ─── Landing-page CSS (all responsive rules live here) ────────────────────
const LCSS = `
@keyframes heroFade  { from{opacity:0;transform:translateY(22px)} to{opacity:1;transform:translateY(0)} }
@keyframes ringFill  { from{stroke-dasharray:0 999} }
@keyframes float     { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
@keyframes ticker    { 0%{transform:translateX(0)} 100%{transform:translateX(-50%)} }

.lp-hero-text  { animation: heroFade .7s ease both }
.lp-hero-sub   { animation: heroFade .7s .12s ease both }
.lp-hero-ctas  { animation: heroFade .7s .22s ease both }
.lp-mockup     { animation: heroFade .8s .32s ease both }

.lp-feat-card  { transition: transform .22s, box-shadow .22s, border-color .18s; }
.lp-feat-card:hover  { transform:translateY(-4px); box-shadow:var(--shadow2); border-color:var(--b3); }
.lp-price-card { transition: transform .22s; }
.lp-price-card:hover { transform:translateY(-4px); }

/* Sticky nav with blur */
.lp-nav {
  position: sticky; top: 0; z-index: 300;
  backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px);
}

/* Ticker */
.lp-ticker { display:flex; width:max-content; animation:ticker 28s linear infinite; }
.lp-ticker:hover { animation-play-state:paused; }

/* ── Two-column hero grid ───────────────────────────── */
.lp-hero-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 64px;
  align-items: center;
}
/* ── Two-column team preview grid ──────────────────── */
.lp-team-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 56px;
  align-items: center;
}
/* ── Pricing grid ───────────────────────────────────── */
.lp-pricing-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}
/* ── Features grid ──────────────────────────────────── */
.lp-feat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
}
/* ── Steps grid ─────────────────────────────────────── */
.lp-steps-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 24px;
}

/* ── Tablet ≤ 900px ─────────────────────────────────── */
@media (max-width: 900px) {
  .lp-hero-grid  { grid-template-columns: 1fr; gap: 48px; }
  .lp-team-grid  { grid-template-columns: 1fr; gap: 40px; }
  .lp-hero-grid .lp-mockup { order: -1; display:flex; justify-content:center; }
  .lp-team-grid .lp-roster { order: -1; }
}

/* ── Mobile ≤ 640px ─────────────────────────────────── */
@media (max-width: 640px) {
  .lp-nav-signin  { display: none !important; }
  .lp-hero-section { padding: 48px 16px 60px !important; min-height: auto !important; }
  .lp-feat-grid   { grid-template-columns: 1fr; }
  .lp-steps-grid  { grid-template-columns: 1fr; }
  .lp-pricing-grid { grid-template-columns: 1fr; }
  .lp-hero-ctas   { flex-direction: column; align-items: stretch !important; }
  .lp-hero-ctas button { text-align: center; }
  .lp-team-roster-item { flex-wrap: wrap; }
  .lp-trust-line  { flex-wrap: wrap; gap: 8px !important; }
  .lp-trust-line span.sep { display: none; }
  .lp-section-pad { padding: 60px 16px !important; }
  .lp-footer-inner { flex-direction: column; align-items: flex-start; gap: 20px !important; }
}

/* ── Small phones ≤ 400px ───────────────────────────── */
@media (max-width: 400px) {
  .lp-mockup { display: none; }
}
`

// ─── Data ─────────────────────────────────────────────────────────────────
const FEATURES = [
  { icon:'🎯', title:'Daily Habit Tracker',   color:'#0ea5e9',
    desc:'11 built-in habits mapped to real estate production — prospecting, appointments, showings, and more. Check them off every day.' },
  { icon:'🏆', title:'XP & Rank System',      color:'#d97706',
    desc:'Bronze → Silver → Gold → Platinum → Diamond. Gamified accountability that makes discipline feel like a game agents want to play.' },
  { icon:'👥', title:'Team Management',       color:'#8b5cf6',
    desc:'Full roster view, accountability groups, daily standups, and coaching notes. Everything a leader needs to run a tight operation.' },
  { icon:'📊', title:'Pipeline Tracker',      color:'#10b981',
    desc:'Track listings, offers, pending deals, and closings in real time. GCI and volume calculated automatically.' },
  { icon:'🏠', title:'Active Listings Board', color:'#f97316',
    desc:"See every active listing across your whole team in one view. Status, address, price, and commission — always current." },
  { icon:'📋', title:'Coaching Notes',        color:'#f43f5e',
    desc:'Leave private typed notes for each agent — praise, goals, concerns. Agents reply directly. A coaching thread inside the app.' },
]

const STEPS = [
  { n:'01', title:'Create your team',        desc:'Set up in under 2 minutes. Share your invite code and agents join instantly — no IT required.' },
  { n:'02', title:'Track daily production',  desc:"Every agent checks off habits each day. Leaders see the whole team's activity on the roster in real time." },
  { n:'03', title:'Coach with real data',    desc:"Pull up any agent's detail panel to see pipeline, closings, activity rings, and drop a coaching note." },
]

const PLANS = [
  { name:'Solo',      price:0,   priceAnn:0,   badge:null,           color:'#94a3b8',
    desc:'For individual agents getting dialed in.',
    features:['Habit tracker & XP system','Pipeline & closing tracker','Personal rank & streak','Annual production report'],
    cta:'Start Free' },
  { name:'Team',      price:39,  priceAnn:33,  badge:'Most Popular',  color:'#d97706',
    desc:'For team leaders who demand accountability.',
    features:['Everything in Solo','Up to 15 agents','Roster & leaderboard','Accountability groups','Daily standup feed','Coaching notes per agent','Team challenges & XP bonuses','Active listings board'],
    cta:'Start Free Trial' },
  { name:'Brokerage', price:149, priceAnn:124, badge:'Best Value',    color:'#8b5cf6',
    desc:'For brokers running a full operation.',
    features:['Everything in Team','Unlimited agents','Multiple groups','Priority support','Early access to new features'],
    cta:'Contact Us' },
]

const TICKER_ITEMS = [
  '🎯 Daily Habit Tracker','🏆 XP Leaderboards','👥 Team Roster',
  '📊 Pipeline Tracker','🏠 Active Listings Board','📋 Coaching Notes',
  '⚡ Daily Standups','🔥 Streak Tracking','💎 Diamond Rank',
  '📈 Annual GCI Report','🏆 Team Challenges','📱 Mobile Ready',
]

const ROSTER_PREVIEW = [
  { name:'Sarah K.',  rank:'💎 Diamond', xp:'6,420', today:94, month:88, color:'#a855f7' },
  { name:'Marcus T.', rank:'🥇 Gold',   xp:'2,180', today:72, month:65, color:'#d97706' },
  { name:'Jenna P.',  rank:'🥈 Silver', xp:'1,340', today:56, month:52, color:'#94a3b8' },
  { name:'Derek B.',  rank:'🥇 Gold',   xp:'1,980', today:88, month:79, color:'#d97706' },
]

// ─── Mini SVG ring ────────────────────────────────────────────────────────
function SmallRing({ pct, color, size = 44 }) {
  const r = (size - 6) / 2, circ = 2 * Math.PI * r
  return (
    <svg width={size} height={size} style={{ transform:'rotate(-90deg)', flexShrink:0 }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--b2)" strokeWidth={3}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={3}
        strokeDasharray={`${circ*pct/100} ${circ}`} strokeLinecap="round"/>
      <text x={size/2} y={size/2} textAnchor="middle" dominantBaseline="middle"
        fill={color} fontSize={9} fontWeight="700" fontFamily="Poppins,sans-serif"
        style={{ transform:`rotate(90deg)`, transformOrigin:`${size/2}px ${size/2}px` }}>
        {pct}%
      </text>
    </svg>
  )
}

// ─── Animated dashboard mockup ────────────────────────────────────────────
function Mockup() {
  const habits = [
    { label:'Prospecting',  pct:80,  color:'#0ea5e9', done:true  },
    { label:'Appointments', pct:60,  color:'#10b981', done:true  },
    { label:'Showings',     pct:40,  color:'#8b5cf6', done:false },
    { label:'New Listing',  pct:100, color:'#d97706', done:true  },
    { label:'Market Review',pct:20,  color:'#f97316', done:false },
  ]
  const pipeline = [
    { label:'Listings', val:3, color:'#10b981' },
    { label:'Offers',   val:2, color:'#0ea5e9' },
    { label:'Pending',  val:1, color:'#6366f1' },
    { label:'Closed',   val:1, color:'#d97706' },
  ]
  const r = 28, sw = 5, circ = 2 * Math.PI * r
  return (
    <div style={{ background:'var(--surface)', borderRadius:18, border:'1px solid var(--b2)',
      boxShadow:'0 24px 64px rgba(0,0,0,.18), 0 4px 16px rgba(0,0,0,.1)',
      overflow:'hidden', maxWidth:400, width:'100%' }}>

      {/* Fake chrome bar */}
      <div style={{ background:'var(--nav-bg)', padding:'10px 16px',
        display:'flex', alignItems:'center', gap:8 }}>
        {['#f87171','#fbbf24','#34d399'].map(c=>(
          <div key={c} style={{ width:10, height:10, borderRadius:'50%', background:c, flexShrink:0 }}/>
        ))}
        <div style={{ flex:1, textAlign:'center', fontSize:11,
          color:'rgba(255,255,255,.4)', fontFamily:'Poppins,sans-serif' }}>RealtyGrind · Today</div>
      </div>

      <div style={{ padding:'16px 18px', display:'flex', flexDirection:'column', gap:14 }}>
        {/* Header + ring */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <div style={{ fontSize:12, color:'var(--muted)', fontFamily:'Poppins,sans-serif' }}>Good morning, Alex 🔥</div>
            <div style={{ fontSize:17, fontWeight:700, color:'var(--text)', fontFamily:'Montserrat,sans-serif' }}>Tuesday Grind</div>
          </div>
          <svg width={62} height={62} style={{ transform:'rotate(-90deg)', flexShrink:0 }}>
            <circle cx={31} cy={31} r={r} fill="none" stroke="var(--b2)" strokeWidth={sw}/>
            <circle cx={31} cy={31} r={r} fill="none" stroke="#d97706" strokeWidth={sw}
              strokeDasharray={`${circ*0.72} ${circ}`} strokeLinecap="round"
              style={{ animation:'ringFill 1.4s .5s cubic-bezier(.4,2,.55,1) both' }}/>
            <text x={31} y={31} textAnchor="middle" dominantBaseline="middle"
              fill="#d97706" fontSize={10} fontWeight="700" fontFamily="Poppins,sans-serif"
              style={{ transform:'rotate(90deg)', transformOrigin:'31px 31px' }}>72%</text>
          </svg>
        </div>

        {/* Pipeline mini stats */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:7 }}>
          {pipeline.map(p=>(
            <div key={p.label} style={{ background:'var(--bg2)', borderRadius:8, padding:'8px 4px',
              textAlign:'center', border:'1px solid var(--b1)' }}>
              <div style={{ fontSize:17, fontWeight:700, color:p.color,
                fontFamily:'Montserrat,sans-serif', lineHeight:1 }}>{p.val}</div>
              <div style={{ fontSize:7, color:'var(--dim)', marginTop:3,
                fontFamily:'Poppins,sans-serif', letterSpacing:.4 }}>{p.label.toUpperCase()}</div>
            </div>
          ))}
        </div>

        {/* Habits */}
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          <div style={{ fontSize:9, fontWeight:700, color:'var(--muted)', letterSpacing:.8,
            textTransform:'uppercase', fontFamily:'Poppins,sans-serif', marginBottom:2 }}>Today's Habits</div>
          {habits.map(h=>(
            <div key={h.label} style={{ display:'flex', alignItems:'center', gap:8 }}>
              <div style={{ width:15, height:15, borderRadius:4, flexShrink:0,
                display:'flex', alignItems:'center', justifyContent:'center', fontSize:8,
                background: h.done ? h.color : 'transparent',
                border: h.done ? 'none' : '1.5px solid var(--b3)',
                color:'#fff', fontWeight:700 }}>{h.done?'✓':''}</div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:2 }}>
                  <span style={{ fontSize:10, color:h.done?'var(--text)':'var(--muted)',
                    fontFamily:'Poppins,sans-serif' }}>{h.label}</span>
                  <span style={{ fontSize:9, color:h.color, fontFamily:'JetBrains Mono,monospace',
                    fontWeight:700 }}>{h.pct}%</span>
                </div>
                <div style={{ height:3, background:'var(--b1)', borderRadius:2, overflow:'hidden' }}>
                  <div style={{ height:'100%', width:`${h.pct}%`, background:h.color, borderRadius:2 }}/>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Rank badge */}
        <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px', borderRadius:8,
          background:'rgba(217,119,6,.08)', border:'1px solid rgba(217,119,6,.2)' }}>
          <span style={{ fontSize:16 }}>🥇</span>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'var(--gold)', fontFamily:'Poppins,sans-serif' }}>Gold Rank · 2,340 XP</div>
            <div style={{ fontSize:9, color:'var(--muted)', fontFamily:'Poppins,sans-serif' }}>660 XP to Platinum 🌟</div>
          </div>
          <div style={{ fontSize:9, padding:'2px 7px', borderRadius:4, flexShrink:0,
            background:'rgba(217,119,6,.15)', color:'var(--gold)', fontWeight:700,
            fontFamily:'Poppins,sans-serif', whiteSpace:'nowrap' }}>#2 Team</div>
        </div>
      </div>
    </div>
  )
}

// ─── Reusable section label ───────────────────────────────────────────────
function SectionLabel({ children, color }) {
  return (
    <div style={{ fontSize:11, fontWeight:700, letterSpacing:1.2, textTransform:'uppercase',
      color, marginBottom:12, fontFamily:'Poppins,sans-serif' }}>
      {children}
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────
export default function LandingPage({ theme, onToggleTheme, onGetStarted }) {
  const [annual, setAnnual] = useState(false)
  const gold = theme === 'dark' ? '#d97706' : '#b45309'
  const goldBg = theme === 'dark' ? 'rgba(217,119,6,.09)' : 'rgba(180,83,9,.07)'

  const btnGold = {
    background: gold, color:'#fff', border:'none', borderRadius:10, fontFamily:'Poppins,sans-serif',
    fontWeight:700, cursor:'pointer', transition:'all .2s', boxShadow:`0 4px 18px ${gold}44`,
  }
  const btnOutline = {
    background:'transparent', border:'1.5px solid var(--b3)', color:'var(--text)',
    borderRadius:10, fontFamily:'Poppins,sans-serif', fontWeight:600, cursor:'pointer', transition:'all .18s',
  }

  return (
    <>
      <style>{CSS}{LCSS}</style>
      <div className="page" style={{ overflowX:'hidden' }}>

        {/* ── Sticky Nav ─────────────────────────────────────────── */}
        <nav className="lp-nav" style={{
          background: theme==='dark' ? 'rgba(12,11,9,.82)' : 'rgba(245,243,238,.88)',
          borderBottom:'1px solid var(--b1)',
          padding:'0 20px', height:58,
          display:'flex', alignItems:'center', justifyContent:'space-between', gap:10,
        }}>
          <Wordmark/>
          <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
            <ThemeToggle theme={theme} onToggle={onToggleTheme}/>
            {/* Hidden on mobile via .lp-nav-signin */}
            <button className="lp-nav-signin" onClick={onGetStarted}
              style={{ ...btnOutline, fontSize:13, padding:'7px 16px' }}
              onMouseEnter={e=>{e.currentTarget.style.borderColor='var(--text)';e.currentTarget.style.background='var(--b1)'}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--b3)';e.currentTarget.style.background='transparent'}}>
              Sign In
            </button>
            <button onClick={onGetStarted}
              style={{ ...btnGold, fontSize:13, padding:'8px 18px' }}
              onMouseEnter={e=>{e.currentTarget.style.opacity='.88';e.currentTarget.style.transform='translateY(-1px)'}}
              onMouseLeave={e=>{e.currentTarget.style.opacity='1';e.currentTarget.style.transform=''}}>
              Start Free →
            </button>
          </div>
        </nav>

        {/* ── Hero ───────────────────────────────────────────────── */}
        <section className="lp-hero-section" style={{
          minHeight:'90vh', padding:'64px 24px 80px',
          background: theme==='dark'
            ? 'radial-gradient(ellipse at 30% 0%,rgba(217,119,6,.12) 0%,transparent 55%),radial-gradient(ellipse at 80% 60%,rgba(139,92,246,.07) 0%,transparent 50%),var(--bg)'
            : 'radial-gradient(ellipse at 30% 0%,rgba(180,83,9,.07) 0%,transparent 55%),radial-gradient(ellipse at 80% 60%,rgba(139,92,246,.04) 0%,transparent 50%),var(--bg)',
          display:'flex', alignItems:'center', position:'relative', overflow:'hidden',
        }}>
          {/* Grid pattern */}
          <div style={{ position:'absolute', inset:0, opacity:.035, pointerEvents:'none',
            backgroundImage:'linear-gradient(var(--text) 1px,transparent 1px),linear-gradient(90deg,var(--text) 1px,transparent 1px)',
            backgroundSize:'48px 48px' }}/>

          <div style={{ maxWidth:1120, margin:'0 auto', width:'100%' }}>
            <div className="lp-hero-grid">

              {/* Left — copy */}
              <div>
                <div className="lp-hero-text" style={{ display:'inline-flex', alignItems:'center', gap:7,
                  padding:'5px 14px', borderRadius:24, marginBottom:20,
                  background:goldBg, border:`1px solid ${gold}33`,
                  fontSize:12, fontWeight:700, color:gold, letterSpacing:.5, fontFamily:'Poppins,sans-serif' }}>
                  <span>🏡</span> Built for Real Estate Agents
                </div>

                <h1 className="lp-hero-text serif" style={{
                  fontSize:'clamp(34px,5vw,56px)', fontWeight:800, lineHeight:1.08,
                  color:'var(--text)', marginBottom:18, letterSpacing:'-.03em' }}>
                  Outwork Everyone.<br/>
                  <span style={{ color:gold }}>Track Everything.</span>
                </h1>

                <p className="lp-hero-sub" style={{
                  fontSize:'clamp(14px,2vw,17px)', color:'var(--muted)', lineHeight:1.75,
                  marginBottom:32, maxWidth:480, fontFamily:'Poppins,sans-serif' }}>
                  The habit tracker, pipeline, team management, and coaching platform
                  built specifically for agents who refuse to wing it.
                </p>

                <div className="lp-hero-ctas" style={{ display:'flex', gap:12, flexWrap:'wrap', alignItems:'center' }}>
                  <button onClick={onGetStarted}
                    style={{ ...btnGold, fontSize:15, padding:'13px 30px' }}
                    onMouseEnter={e=>{e.currentTarget.style.transform='translateY(-2px)';e.currentTarget.style.boxShadow=`0 10px 36px ${gold}66`}}
                    onMouseLeave={e=>{e.currentTarget.style.transform='';e.currentTarget.style.boxShadow=`0 4px 18px ${gold}44`}}>
                    Start for Free →
                  </button>
                  <button onClick={onGetStarted}
                    style={{ ...btnOutline, fontSize:15, padding:'12px 26px' }}
                    onMouseEnter={e=>{e.currentTarget.style.borderColor='var(--text)';e.currentTarget.style.background='var(--b1)'}}
                    onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--b3)';e.currentTarget.style.background='transparent'}}>
                    Sign In
                  </button>
                </div>

                <div className="lp-trust-line" style={{ marginTop:24, display:'flex', alignItems:'center',
                  gap:14, fontSize:12, color:'var(--dim)', fontFamily:'Poppins,sans-serif', flexWrap:'wrap' }}>
                  <span>✓ Free to start</span>
                  <span className="sep" style={{ color:'var(--b3)' }}>|</span>
                  <span>✓ No credit card</span>
                  <span className="sep" style={{ color:'var(--b3)' }}>|</span>
                  <span>✓ 2 min setup</span>
                </div>
              </div>

              {/* Right — mockup (hidden on tiny screens via CSS) */}
              <div className="lp-mockup" style={{ display:'flex', justifyContent:'center',
                position:'relative', animation:'float 5s ease-in-out infinite' }}>
                <div style={{ position:'absolute', width:280, height:280, borderRadius:'50%',
                  background:`radial-gradient(circle,${gold}22 0%,transparent 70%)`,
                  top:'50%', left:'50%', transform:'translate(-50%,-50%)', pointerEvents:'none' }}/>
                <Mockup/>
              </div>
            </div>
          </div>
        </section>

        {/* ── Ticker ─────────────────────────────────────────────── */}
        <div style={{ borderTop:'1px solid var(--b1)', borderBottom:'1px solid var(--b1)',
          background:'var(--bg2)', padding:'11px 0', overflow:'hidden' }}>
          <div className="lp-ticker">
            {[...TICKER_ITEMS, ...TICKER_ITEMS].map((item, i) => (
              <span key={i} style={{ padding:'0 28px', fontSize:12, color:'var(--muted)',
                fontWeight:600, whiteSpace:'nowrap', fontFamily:'Poppins,sans-serif', letterSpacing:.4 }}>
                {item}
              </span>
            ))}
          </div>
        </div>

        {/* ── Features ───────────────────────────────────────────── */}
        <section className="lp-section-pad" style={{ padding:'80px 24px', background:'var(--bg)' }}>
          <div style={{ maxWidth:1120, margin:'0 auto' }}>
            <div style={{ textAlign:'center', marginBottom:48 }}>
              <SectionLabel color={gold}>Everything in one platform</SectionLabel>
              <h2 className="serif" style={{ fontSize:'clamp(26px,4vw,40px)', color:'var(--text)',
                fontWeight:800, letterSpacing:'-.02em', marginBottom:12 }}>
                Built for how top agents actually work
              </h2>
              <p style={{ fontSize:15, color:'var(--muted)', maxWidth:520, margin:'0 auto',
                lineHeight:1.7, fontFamily:'Poppins,sans-serif' }}>
                Not another generic CRM. Every feature was designed around the real estate
                production cycle — from cold call to closed deal.
              </p>
            </div>
            <div className="lp-feat-grid">
              {FEATURES.map(f => (
                <div key={f.title} className="card lp-feat-card"
                  style={{ padding:24, cursor:'default', borderTop:`3px solid ${f.color}`, background:`${f.color}06` }}>
                  <div style={{ fontSize:26, marginBottom:12 }}>{f.icon}</div>
                  <div className="serif" style={{ fontSize:16, fontWeight:700, color:'var(--text)', marginBottom:8 }}>{f.title}</div>
                  <p style={{ fontSize:13, color:'var(--muted)', lineHeight:1.7, margin:0, fontFamily:'Poppins,sans-serif' }}>{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── How It Works ───────────────────────────────────────── */}
        <section className="lp-section-pad" style={{ padding:'80px 24px', background:'var(--bg2)' }}>
          <div style={{ maxWidth:960, margin:'0 auto' }}>
            <div style={{ textAlign:'center', marginBottom:48 }}>
              <SectionLabel color={gold}>Dead simple to get started</SectionLabel>
              <h2 className="serif" style={{ fontSize:'clamp(24px,4vw,38px)', color:'var(--text)',
                fontWeight:800, letterSpacing:'-.02em' }}>
                Up and running in minutes
              </h2>
            </div>
            <div className="lp-steps-grid">
              {STEPS.map(s => (
                <div key={s.n} className="card" style={{ padding:26 }}>
                  <div className="serif" style={{ fontSize:40, fontWeight:800, color:gold,
                    opacity:.25, lineHeight:1, marginBottom:10 }}>{s.n}</div>
                  <div className="serif" style={{ fontSize:17, fontWeight:700, color:'var(--text)', marginBottom:9 }}>{s.title}</div>
                  <p style={{ fontSize:13, color:'var(--muted)', lineHeight:1.7, margin:0, fontFamily:'Poppins,sans-serif' }}>{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Team Roster Preview ─────────────────────────────────── */}
        <section className="lp-section-pad" style={{ padding:'80px 24px', background:'var(--bg)' }}>
          <div style={{ maxWidth:960, margin:'0 auto' }}>
            <div className="lp-team-grid">

              {/* Left — copy */}
              <div>
                <SectionLabel color='#8b5cf6'>For team leaders</SectionLabel>
                <h2 className="serif" style={{ fontSize:'clamp(24px,4vw,36px)', color:'var(--text)',
                  fontWeight:800, letterSpacing:'-.02em', marginBottom:14 }}>
                  See your whole team's production at a glance
                </h2>
                <p style={{ fontSize:14, color:'var(--muted)', lineHeight:1.75, marginBottom:22,
                  fontFamily:'Poppins,sans-serif' }}>
                  Click any agent to open their full detail panel — activity rings, transactions,
                  active listings, and a private coaching thread. No spreadsheet required.
                </p>
                {[
                  'Roster sorted by XP & rank',
                  'Activity rings for every agent',
                  'Full pipeline breakdown per member',
                  'Private coaching notes & replies',
                  'Group accountability pods',
                  'Daily standup feed',
                ].map(item => (
                  <div key={item} style={{ display:'flex', alignItems:'center', gap:9,
                    marginBottom:8, fontSize:13, color:'var(--text)', fontFamily:'Poppins,sans-serif' }}>
                    <div style={{ width:17, height:17, borderRadius:'50%', flexShrink:0,
                      background:'rgba(139,92,246,.15)', border:'1px solid rgba(139,92,246,.3)',
                      display:'flex', alignItems:'center', justifyContent:'center',
                      fontSize:8, color:'#8b5cf6', fontWeight:700 }}>✓</div>
                    {item}
                  </div>
                ))}
              </div>

              {/* Right — roster cards */}
              <div className="lp-roster" style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {ROSTER_PREVIEW.map((m, i) => (
                  <div key={m.name} className="card lp-team-roster-item"
                    style={{ padding:'11px 14px', display:'flex', alignItems:'center', gap:11,
                      border: i===0 ? `1px solid ${m.color}44` : '1px solid var(--b2)',
                      background: i===0 ? `${m.color}08` : 'var(--surface)',
                      animation:`heroFade .4s ${i*0.08}s ease both` }}>
                    <div style={{ width:36, height:36, borderRadius:'50%', flexShrink:0,
                      background:`linear-gradient(135deg,${m.color},${m.color}88)`,
                      display:'flex', alignItems:'center', justifyContent:'center',
                      fontSize:14, fontWeight:700, color:'#fff' }}>
                      {m.name[0]}
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:13, fontWeight:600, color:'var(--text)', fontFamily:'Poppins,sans-serif',
                        whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{m.name}</div>
                      <div style={{ fontSize:10, color:'var(--muted)', fontFamily:'Poppins,sans-serif' }}>
                        {m.rank} · {m.xp} XP
                      </div>
                    </div>
                    <div style={{ display:'flex', gap:7, flexShrink:0 }}>
                      <SmallRing pct={m.today} color={m.color} size={40}/>
                      <SmallRing pct={m.month} color='#0ea5e9'    size={40}/>
                    </div>
                  </div>
                ))}
                <div style={{ textAlign:'center', fontSize:11, color:'var(--dim)',
                  fontFamily:'Poppins,sans-serif', marginTop:4 }}>
                  Click any agent to open their full detail panel →
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Pricing ────────────────────────────────────────────── */}
        <section className="lp-section-pad" id="pricing" style={{ padding:'80px 24px', background:'var(--bg2)' }}>
          <div style={{ maxWidth:1040, margin:'0 auto' }}>
            <div style={{ textAlign:'center', marginBottom:44 }}>
              <SectionLabel color={gold}>Simple pricing</SectionLabel>
              <h2 className="serif" style={{ fontSize:'clamp(24px,4vw,38px)', color:'var(--text)',
                fontWeight:800, letterSpacing:'-.02em', marginBottom:12 }}>
                Start free. Scale when you're ready.
              </h2>
              {/* Billing toggle */}
              <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:11,
                marginTop:22, fontFamily:'Poppins,sans-serif', flexWrap:'wrap' }}>
                <span style={{ fontSize:13, fontWeight: annual?400:600,
                  color: annual?'var(--muted)':'var(--text)' }}>Monthly</span>
                <button onClick={()=>setAnnual(a=>!a)} style={{
                  width:44, height:24, borderRadius:14, padding:0, cursor:'pointer', position:'relative',
                  border:'none', transition:'background .2s', flexShrink:0,
                  background: annual ? gold : 'var(--b3)',
                }}>
                  <div style={{ width:17, height:17, borderRadius:'50%', background:'#fff',
                    position:'absolute', top:3.5, left: annual?23:4,
                    transition:'left .2s cubic-bezier(.4,2,.55,1)',
                    boxShadow:'0 1px 4px rgba(0,0,0,.25)' }}/>
                </button>
                <span style={{ fontSize:13, fontWeight: annual?600:400,
                  color: annual?'var(--text)':'var(--muted)', display:'flex', alignItems:'center', gap:7 }}>
                  Annual
                  <span style={{ fontSize:10, padding:'2px 7px', borderRadius:20, fontWeight:700,
                    background:'rgba(16,185,129,.12)', color:'var(--green)', border:'1px solid rgba(16,185,129,.22)' }}>
                    Save 15%
                  </span>
                </span>
              </div>
            </div>

            <div className="lp-pricing-grid">
              {PLANS.map(plan => {
                const price = annual ? plan.priceAnn : plan.price
                const isPop = plan.badge === 'Most Popular'
                return (
                  <div key={plan.name} className="card lp-price-card" style={{ padding:26, position:'relative',
                    border: isPop ? `2px solid ${plan.color}` : '1px solid var(--b2)',
                    background: isPop ? `${plan.color}07` : 'var(--surface)' }}>
                    {plan.badge && (
                      <div style={{ position:'absolute', top:-13, left:'50%', transform:'translateX(-50%)',
                        background:plan.color, color:'#fff', fontSize:10, fontWeight:700,
                        padding:'3px 14px', borderRadius:20, whiteSpace:'nowrap',
                        fontFamily:'Poppins,sans-serif', letterSpacing:.5 }}>
                        {plan.badge}
                      </div>
                    )}
                    <div className="serif" style={{ fontSize:21, fontWeight:800, color:'var(--text)', marginBottom:4 }}>{plan.name}</div>
                    <p style={{ fontSize:12, color:'var(--muted)', marginBottom:18,
                      fontFamily:'Poppins,sans-serif', lineHeight:1.5 }}>{plan.desc}</p>
                    <div style={{ marginBottom:22 }}>
                      <span className="serif" style={{ fontSize:42, fontWeight:800, color:plan.color, lineHeight:1 }}>
                        {price===0 ? 'Free' : `$${price}`}
                      </span>
                      {price>0 && <span style={{ fontSize:13, color:'var(--muted)', fontFamily:'Poppins,sans-serif' }}>
                        /mo{annual?' · billed annually':''}
                      </span>}
                    </div>
                    <button onClick={onGetStarted} style={{
                      width:'100%', padding:'12px 0', borderRadius:10, fontSize:14, fontWeight:700,
                      cursor:'pointer', marginBottom:20, transition:'all .18s', fontFamily:'Poppins,sans-serif',
                      background: isPop ? plan.color : 'transparent',
                      color: isPop ? '#fff' : plan.color,
                      border: isPop ? 'none' : `2px solid ${plan.color}`,
                      boxShadow: isPop ? `0 6px 22px ${plan.color}44` : 'none',
                    }}>{plan.cta}</button>
                    <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
                      {plan.features.map(f => (
                        <div key={f} style={{ display:'flex', alignItems:'center', gap:8,
                          fontSize:12, color:'var(--text)', fontFamily:'Poppins,sans-serif' }}>
                          <div style={{ width:15, height:15, borderRadius:'50%', flexShrink:0,
                            background:`${plan.color}18`, border:`1px solid ${plan.color}30`,
                            display:'flex', alignItems:'center', justifyContent:'center',
                            fontSize:7, color:plan.color, fontWeight:700 }}>✓</div>
                          {f}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        {/* ── Final CTA ──────────────────────────────────────────── */}
        <section className="lp-section-pad" style={{ padding:'88px 24px', textAlign:'center',
          background: theme==='dark'
            ? 'radial-gradient(ellipse at 50% 0%,rgba(217,119,6,.14) 0%,transparent 60%),var(--bg)'
            : 'radial-gradient(ellipse at 50% 0%,rgba(180,83,9,.08) 0%,transparent 60%),var(--bg)' }}>
          <div style={{ maxWidth:580, margin:'0 auto' }}>
            <div style={{ fontSize:40, marginBottom:16 }}>🏡</div>
            <h2 className="serif" style={{ fontSize:'clamp(26px,5vw,46px)', color:'var(--text)',
              fontWeight:800, letterSpacing:'-.025em', marginBottom:14, lineHeight:1.1 }}>
              Stop winging it.<br/>
              <span style={{ color:gold }}>Start grinding.</span>
            </h2>
            <p style={{ fontSize:15, color:'var(--muted)', lineHeight:1.7, marginBottom:32,
              fontFamily:'Poppins,sans-serif' }}>
              Join agents who track every habit, every deal, and every coaching note
              in one place — and actually hit their production goals.
            </p>
            <button onClick={onGetStarted}
              style={{ ...btnGold, fontSize:16, padding:'15px 38px' }}
              onMouseEnter={e=>{e.currentTarget.style.transform='translateY(-2px)';e.currentTarget.style.boxShadow=`0 14px 42px ${gold}66`}}
              onMouseLeave={e=>{e.currentTarget.style.transform='';e.currentTarget.style.boxShadow=`0 4px 18px ${gold}44`}}>
              Start Free — No Credit Card →
            </button>
            <div style={{ marginTop:16, fontSize:12, color:'var(--dim)', fontFamily:'Poppins,sans-serif' }}>
              Free solo plan forever · Team plans from $39/mo
            </div>
          </div>
        </section>

        {/* ── Footer ─────────────────────────────────────────────── */}
        <footer style={{ borderTop:'1px solid var(--b1)', padding:'32px 20px', background:'var(--bg2)' }}>
          <div className="lp-footer-inner" style={{ maxWidth:1120, margin:'0 auto',
            display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:14 }}>
            <Wordmark/>
            <div style={{ display:'flex', gap:24, flexWrap:'wrap' }}>
              {[
                { label:'Features' },
                { label:'Pricing', action:()=>document.getElementById('pricing')?.scrollIntoView({behavior:'smooth'}) },
                { label:'Sign In',     action:onGetStarted },
                { label:'Get Started', action:onGetStarted },
              ].map(l => (
                <button key={l.label} onClick={l.action||undefined}
                  style={{ background:'none', border:'none', cursor:'pointer', padding:0,
                    fontSize:13, color:'var(--muted)', fontFamily:'Poppins,sans-serif', transition:'color .15s' }}
                  onMouseEnter={e=>e.currentTarget.style.color='var(--text)'}
                  onMouseLeave={e=>e.currentTarget.style.color='var(--muted)'}>
                  {l.label}
                </button>
              ))}
            </div>
            <div style={{ fontSize:11, color:'var(--dim)', fontFamily:'Poppins,sans-serif' }}>
              © {new Date().getFullYear()} RealtyGrind
            </div>
          </div>
        </footer>

      </div>
    </>
  )
}
