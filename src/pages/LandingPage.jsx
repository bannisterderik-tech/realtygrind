import { useState } from 'react'
import { CSS, Wordmark, ThemeToggle } from '../design'

// ─── Extra landing-page keyframes & overrides ──────────────────────────────
const LCSS = `
@keyframes heroFade  { from{opacity:0;transform:translateY(22px)} to{opacity:1;transform:translateY(0)} }
@keyframes ringFill  { from{stroke-dasharray:0 999} }
@keyframes float     { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
@keyframes shimmer   { 0%{background-position:-400px 0} 100%{background-position:400px 0} }
@keyframes ticker    { 0%{transform:translateX(0)} 100%{transform:translateX(-50%)} }
.lp-hero-text  { animation: heroFade .7s ease both }
.lp-hero-sub   { animation: heroFade .7s .12s ease both }
.lp-hero-ctas  { animation: heroFade .7s .22s ease both }
.lp-mockup     { animation: heroFade .8s .32s ease both }
.lp-feat-card:hover { transform:translateY(-4px); box-shadow:var(--shadow2); border-color:var(--b3); }
.lp-price-card:hover { transform:translateY(-4px); }
.lp-nav { position:sticky; top:0; z-index:300; backdrop-filter:blur(18px); -webkit-backdrop-filter:blur(18px); }
.lp-ticker-wrap { overflow:hidden; }
.lp-ticker { display:flex; width:max-content; animation:ticker 28s linear infinite; }
.lp-ticker:hover { animation-play-state:paused; }
`

// ─── Feature data ──────────────────────────────────────────────────────────
const FEATURES = [
  { icon:'🎯', title:'Daily Habit Tracker',    color:'#0ea5e9',
    desc:'11 built-in habits mapped directly to real estate production — prospecting, appointments, showings, and more. Check them off every day.' },
  { icon:'🏆', title:'XP & Rank System',       color:'#d97706',
    desc:'Bronze → Silver → Gold → Platinum → Diamond. Gamified accountability that makes discipline feel like a game agents actually want to play.' },
  { icon:'👥', title:'Team Management',        color:'#8b5cf6',
    desc:'Full roster view, accountability groups, daily standups, and coaching notes. Everything a team leader needs to run a tight operation.' },
  { icon:'📊', title:'Pipeline Tracker',       color:'#10b981',
    desc:'Track listings, offers made, offers received, pending deals, and closings in real time. GCI and volume calculated automatically.' },
  { icon:'🏠', title:'Active Listings Board',  color:'#f97316',
    desc:'See every active listing across your entire team in one view. Status, address, list price, and commission — always up to date.' },
  { icon:'📋', title:'Coaching Notes',         color:'#f43f5e',
    desc:'Leave private typed notes for each agent — praise, goals, concerns. Agents can reply directly. A coaching thread that lives in the app.' },
]

// ─── How-it-works steps ───────────────────────────────────────────────────
const STEPS = [
  { n:'01', title:'Create your team',         desc:'Set up in under 2 minutes. Share your invite code and your agents join instantly — no IT required.' },
  { n:'02', title:'Track daily production',   desc:'Every agent checks off their habits each day. Leaders see the whole team\'s activity on the roster in real time.' },
  { n:'03', title:'Coach with real data',     desc:'Pull up any agent\'s detail panel to see their pipeline, closings, activity rings, and drop a coaching note.' },
]

// ─── Pricing ──────────────────────────────────────────────────────────────
const PLANS = [
  {
    name:'Solo', price:0, priceAnn:0, badge:null, color:'#94a3b8',
    desc:'For individual agents getting dialed in.',
    features:['Habit tracker & XP system','Pipeline & closing tracker','Personal rank & streak','Annual production report'],
    cta:'Start Free',
  },
  {
    name:'Team', price:39, priceAnn:33, badge:'Most Popular', color:'#d97706',
    desc:'For team leaders who demand accountability.',
    features:['Everything in Solo','Up to 15 agents','Roster & leaderboard','Accountability groups','Daily standup feed','Coaching notes per agent','Team challenges & XP bonuses','Active listings board'],
    cta:'Start Free Trial',
  },
  {
    name:'Brokerage', price:149, priceAnn:124, badge:'Best Value', color:'#8b5cf6',
    desc:'For brokers running a full operation.',
    features:['Everything in Team','Unlimited agents','Multiple groups','Priority support','Early access to new features'],
    cta:'Contact Us',
  },
]

// ─── Ticker items ─────────────────────────────────────────────────────────
const TICKER_ITEMS = [
  '🎯 Daily Habit Tracker', '🏆 XP Leaderboards', '👥 Team Roster',
  '📊 Pipeline Tracker', '🏠 Active Listings Board', '📋 Coaching Notes',
  '⚡ Daily Standups', '🔥 Streak Tracking', '💎 Diamond Rank',
  '📈 Annual GCI Report', '🏆 Team Challenges', '📱 Mobile Ready',
]

// ─── Mini dashboard mockup ────────────────────────────────────────────────
function Mockup() {
  const habits = [
    { label:'Prospecting',   pct:80, color:'#0ea5e9', done:true  },
    { label:'Appointments',  pct:60, color:'#10b981', done:true  },
    { label:'Showings',      pct:40, color:'#8b5cf6', done:false },
    { label:'New Listing',   pct:100, color:'#d97706', done:true },
    { label:'Market Review', pct:20, color:'#f97316', done:false },
  ]
  const pipeline = [
    { label:'Listings',  val:3, color:'#10b981' },
    { label:'Offers',    val:2, color:'#0ea5e9' },
    { label:'Pending',   val:1, color:'#6366f1' },
    { label:'Closed',    val:1, color:'#d97706' },
  ]
  const r = 28, sw = 5, c = 2 * Math.PI * r
  return (
    <div style={{ background:'var(--surface)', borderRadius:18, border:'1px solid var(--b2)',
      boxShadow:'0 24px 64px rgba(0,0,0,.18), 0 4px 16px rgba(0,0,0,.1)',
      overflow:'hidden', maxWidth:420, width:'100%' }}>

      {/* Mock nav bar */}
      <div style={{ background:'var(--nav-bg)', padding:'10px 16px', display:'flex', alignItems:'center', gap:10 }}>
        <div style={{ width:10, height:10, borderRadius:'50%', background:'#f87171', flexShrink:0 }}/>
        <div style={{ width:10, height:10, borderRadius:'50%', background:'#fbbf24', flexShrink:0 }}/>
        <div style={{ width:10, height:10, borderRadius:'50%', background:'#34d399', flexShrink:0 }}/>
        <div style={{ flex:1, textAlign:'center', fontSize:11, color:'rgba(255,255,255,.4)', fontFamily:'Poppins,sans-serif' }}>RealtyGrind · Today</div>
      </div>

      <div style={{ padding:'16px 18px', display:'flex', flexDirection:'column', gap:14 }}>

        {/* Header row */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <div style={{ fontSize:12, color:'var(--muted)', marginBottom:2, fontFamily:'Poppins,sans-serif' }}>Good morning, Alex 🔥</div>
            <div style={{ fontSize:18, fontWeight:700, color:'var(--text)', fontFamily:'Montserrat,sans-serif' }}>Tuesday Grind</div>
          </div>
          {/* XP ring */}
          <svg width={66} height={66} style={{ transform:'rotate(-90deg)', flexShrink:0 }}>
            <circle cx={33} cy={33} r={r} fill="none" stroke="var(--b2)" strokeWidth={sw}/>
            <circle cx={33} cy={33} r={r} fill="none" stroke="#d97706" strokeWidth={sw}
              strokeDasharray={`${c*0.72} ${c}`} strokeLinecap="round"
              style={{ animation:'ringFill 1.4s .5s cubic-bezier(.4,2,.55,1) both' }}/>
            <text x={33} y={33} textAnchor="middle" dominantBaseline="middle"
              fill="#d97706" fontSize={10} fontWeight="700" fontFamily="Poppins,sans-serif"
              style={{ transform:'rotate(90deg)', transformOrigin:'33px 33px' }}>72%</text>
          </svg>
        </div>

        {/* Stats row */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8 }}>
          {pipeline.map(p => (
            <div key={p.label} style={{ background:'var(--bg2)', borderRadius:8, padding:'8px 6px', textAlign:'center',
              border:'1px solid var(--b1)' }}>
              <div style={{ fontSize:18, fontWeight:700, color:p.color, fontFamily:'Montserrat,sans-serif', lineHeight:1 }}>{p.val}</div>
              <div style={{ fontSize:8, color:'var(--dim)', marginTop:3, fontFamily:'Poppins,sans-serif', letterSpacing:.4 }}>{p.label.toUpperCase()}</div>
            </div>
          ))}
        </div>

        {/* Habits */}
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', letterSpacing:.8, textTransform:'uppercase',
            fontFamily:'Poppins,sans-serif', marginBottom:2 }}>Today's Habits</div>
          {habits.map(h => (
            <div key={h.label} style={{ display:'flex', alignItems:'center', gap:8 }}>
              <div style={{ width:16, height:16, borderRadius:4, flexShrink:0, display:'flex', alignItems:'center',
                justifyContent:'center', fontSize:9,
                background: h.done ? h.color : 'transparent',
                border: h.done ? 'none' : '1.5px solid var(--b3)',
                color:'#fff', fontWeight:700 }}>
                {h.done ? '✓' : ''}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
                  <span style={{ fontSize:10, color: h.done ? 'var(--text)' : 'var(--muted)', fontFamily:'Poppins,sans-serif' }}>{h.label}</span>
                  <span style={{ fontSize:9, color:h.color, fontFamily:'JetBrains Mono,monospace', fontWeight:700 }}>{h.pct}%</span>
                </div>
                <div style={{ height:3, background:'var(--b1)', borderRadius:2, overflow:'hidden' }}>
                  <div style={{ height:'100%', width:`${h.pct}%`, background:h.color, borderRadius:2,
                    transition:'width .6s cubic-bezier(.4,2,.55,1)' }}/>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* XP badge */}
        <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px', borderRadius:8,
          background:'rgba(217,119,6,.08)', border:'1px solid rgba(217,119,6,.2)' }}>
          <span style={{ fontSize:16 }}>🥇</span>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'var(--gold)', fontFamily:'Poppins,sans-serif' }}>Gold Rank · 2,340 XP</div>
            <div style={{ fontSize:9, color:'var(--muted)', fontFamily:'Poppins,sans-serif' }}>660 XP to Platinum 🌟</div>
          </div>
          <div style={{ fontSize:9, padding:'2px 7px', borderRadius:4, background:'rgba(217,119,6,.15)',
            color:'var(--gold)', fontWeight:700, fontFamily:'Poppins,sans-serif' }}>#2 Team</div>
        </div>
      </div>
    </div>
  )
}

// ─── Ring SVG ─────────────────────────────────────────────────────────────
function SmallRing({ pct, color, size=44 }) {
  const r=(size-6)/2, c=2*Math.PI*r
  return (
    <svg width={size} height={size} style={{ transform:'rotate(-90deg)', flexShrink:0 }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--b2)" strokeWidth={3}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={3}
        strokeDasharray={`${c*pct/100} ${c}`} strokeLinecap="round"/>
      <text x={size/2} y={size/2} textAnchor="middle" dominantBaseline="middle"
        fill={color} fontSize={9} fontWeight="700" fontFamily="Poppins,sans-serif"
        style={{ transform:`rotate(90deg)`, transformOrigin:`${size/2}px ${size/2}px` }}>
        {pct}%
      </text>
    </svg>
  )
}

// ─── Main component ────────────────────────────────────────────────────────
export default function LandingPage({ theme, onToggleTheme, onGetStarted }) {
  const [annual, setAnnual] = useState(false)

  const gold   = theme === 'dark' ? '#d97706' : '#b45309'
  const goldBg = theme === 'dark' ? 'rgba(217,119,6,.09)' : 'rgba(180,83,9,.07)'

  return (
    <>
      <style>{CSS}{LCSS}</style>
      <div className="page" style={{ overflowX:'hidden' }}>

        {/* ── Sticky Nav ───────────────────────────────────────────────── */}
        <nav className="lp-nav" style={{
          background: theme === 'dark' ? 'rgba(12,11,9,.82)' : 'rgba(245,243,238,.88)',
          borderBottom:'1px solid var(--b1)',
          padding:'0 24px', height:60,
          display:'flex', alignItems:'center', justifyContent:'space-between',
        }}>
          <Wordmark/>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <ThemeToggle theme={theme} onToggle={onToggleTheme}/>
            <button onClick={onGetStarted} style={{
              background:'transparent', border:'1.5px solid var(--b3)', color:'var(--text)',
              borderRadius:9, padding:'7px 16px', fontSize:13, fontWeight:600, cursor:'pointer',
              transition:'all .18s', fontFamily:'Poppins,sans-serif',
            }}
              onMouseEnter={e=>{e.currentTarget.style.borderColor='var(--text)'; e.currentTarget.style.background='var(--b1)'}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--b3)'; e.currentTarget.style.background='transparent'}}>
              Sign In
            </button>
            <button onClick={onGetStarted} style={{
              background:gold, color:'#fff', border:'none',
              borderRadius:9, padding:'8px 18px', fontSize:13, fontWeight:700, cursor:'pointer',
              transition:'all .18s', fontFamily:'Poppins,sans-serif',
              boxShadow:`0 4px 18px ${gold}44`,
            }}
              onMouseEnter={e=>{e.currentTarget.style.opacity='.88'; e.currentTarget.style.transform='translateY(-1px)'}}
              onMouseLeave={e=>{e.currentTarget.style.opacity='1'; e.currentTarget.style.transform='translateY(0)'}}>
              Start Free →
            </button>
          </div>
        </nav>

        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <section style={{
          minHeight:'92vh',
          background: theme === 'dark'
            ? 'radial-gradient(ellipse at 30% 0%, rgba(217,119,6,.12) 0%, transparent 55%), radial-gradient(ellipse at 80% 60%, rgba(139,92,246,.07) 0%, transparent 50%), var(--bg)'
            : 'radial-gradient(ellipse at 30% 0%, rgba(180,83,9,.07) 0%, transparent 55%), radial-gradient(ellipse at 80% 60%, rgba(139,92,246,.04) 0%, transparent 50%), var(--bg)',
          display:'flex', alignItems:'center', padding:'60px 24px 80px',
          position:'relative', overflow:'hidden',
        }}>
          {/* Background grid */}
          <div style={{ position:'absolute', inset:0, opacity:.035,
            backgroundImage:'linear-gradient(var(--text) 1px, transparent 1px), linear-gradient(90deg, var(--text) 1px, transparent 1px)',
            backgroundSize:'48px 48px', pointerEvents:'none' }}/>

          <div style={{ maxWidth:1120, margin:'0 auto', width:'100%',
            display:'grid', gridTemplateColumns:'1fr 1fr', gap:64, alignItems:'center' }}>

            {/* Left copy */}
            <div>
              {/* Pre-headline pill */}
              <div className="lp-hero-text" style={{ display:'inline-flex', alignItems:'center', gap:7,
                padding:'5px 14px', borderRadius:24, marginBottom:22,
                background:goldBg, border:`1px solid ${gold}33`,
                fontSize:12, fontWeight:700, color:gold, letterSpacing:.5,
                fontFamily:'Poppins,sans-serif' }}>
                <span style={{ fontSize:14 }}>🏡</span> Built for Real Estate Agents
              </div>

              <h1 className="lp-hero-text serif" style={{
                fontSize:'clamp(36px,5vw,58px)', fontWeight:800, lineHeight:1.08,
                color:'var(--text)', marginBottom:20, letterSpacing:'-.03em',
              }}>
                Outwork Everyone.<br/>
                <span style={{ color:gold }}>Track Everything.</span>
              </h1>

              <p className="lp-hero-sub" style={{
                fontSize:'clamp(15px,1.8vw,18px)', color:'var(--muted)',
                lineHeight:1.7, marginBottom:36, maxWidth:480,
                fontFamily:'Poppins,sans-serif',
              }}>
                The habit tracker, pipeline, team management, and coaching platform built
                specifically for agents who refuse to wing it.
              </p>

              <div className="lp-hero-ctas" style={{ display:'flex', gap:12, flexWrap:'wrap', alignItems:'center' }}>
                <button onClick={onGetStarted} style={{
                  background:gold, color:'#fff', border:'none',
                  borderRadius:11, padding:'14px 32px', fontSize:15, fontWeight:700,
                  cursor:'pointer', transition:'all .2s', fontFamily:'Poppins,sans-serif',
                  boxShadow:`0 6px 28px ${gold}55`,
                }}
                  onMouseEnter={e=>{e.currentTarget.style.transform='translateY(-2px)'; e.currentTarget.style.boxShadow=`0 10px 36px ${gold}66`}}
                  onMouseLeave={e=>{e.currentTarget.style.transform=''; e.currentTarget.style.boxShadow=`0 6px 28px ${gold}55`}}>
                  Start for Free →
                </button>
                <button onClick={onGetStarted} style={{
                  background:'transparent', border:'1.5px solid var(--b3)', color:'var(--text)',
                  borderRadius:11, padding:'13px 28px', fontSize:15, fontWeight:600,
                  cursor:'pointer', transition:'all .2s', fontFamily:'Poppins,sans-serif',
                }}
                  onMouseEnter={e=>{e.currentTarget.style.borderColor='var(--text)'; e.currentTarget.style.background='var(--b1)'}}
                  onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--b3)'; e.currentTarget.style.background='transparent'}}>
                  Sign In
                </button>
              </div>

              {/* Trust line */}
              <div style={{ marginTop:28, display:'flex', alignItems:'center', gap:16,
                fontSize:12, color:'var(--dim)', fontFamily:'Poppins,sans-serif' }}>
                <span>✓ Free to start</span>
                <span style={{ color:'var(--b3)' }}>|</span>
                <span>✓ No credit card required</span>
                <span style={{ color:'var(--b3)' }}>|</span>
                <span>✓ Set up in 2 min</span>
              </div>
            </div>

            {/* Right mockup */}
            <div className="lp-mockup" style={{ display:'flex', justifyContent:'center',
              position:'relative', animation:'float 5s ease-in-out infinite' }}>
              {/* Glow behind mockup */}
              <div style={{ position:'absolute', width:300, height:300, borderRadius:'50%',
                background:`radial-gradient(circle, ${gold}22 0%, transparent 70%)`,
                top:'50%', left:'50%', transform:'translate(-50%,-50%)', pointerEvents:'none' }}/>
              <Mockup/>
            </div>
          </div>
        </section>

        {/* ── Ticker ───────────────────────────────────────────────────── */}
        <div style={{ borderTop:'1px solid var(--b1)', borderBottom:'1px solid var(--b1)',
          background:'var(--bg2)', padding:'12px 0', overflow:'hidden' }}>
          <div className="lp-ticker">
            {[...TICKER_ITEMS, ...TICKER_ITEMS].map((item, i) => (
              <span key={i} style={{ padding:'0 32px', fontSize:12, color:'var(--muted)',
                fontWeight:600, whiteSpace:'nowrap', fontFamily:'Poppins,sans-serif',
                letterSpacing:.4 }}>
                {item}
              </span>
            ))}
          </div>
        </div>

        {/* ── Features ─────────────────────────────────────────────────── */}
        <section style={{ padding:'96px 24px', background:'var(--bg)' }}>
          <div style={{ maxWidth:1120, margin:'0 auto' }}>
            <div style={{ textAlign:'center', marginBottom:56 }}>
              <div style={{ fontSize:11, fontWeight:700, letterSpacing:1.2, textTransform:'uppercase',
                color:gold, marginBottom:12, fontFamily:'Poppins,sans-serif' }}>
                Everything in one platform
              </div>
              <h2 className="serif" style={{ fontSize:'clamp(28px,4vw,42px)', color:'var(--text)',
                fontWeight:800, letterSpacing:'-.02em', marginBottom:14 }}>
                Built for how top agents actually work
              </h2>
              <p style={{ fontSize:16, color:'var(--muted)', maxWidth:560, margin:'0 auto',
                lineHeight:1.7, fontFamily:'Poppins,sans-serif' }}>
                Not another generic CRM. Every feature was designed around the real estate
                production cycle from cold call to closed deal.
              </p>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(320px,1fr))', gap:16 }}>
              {FEATURES.map(f => (
                <div key={f.title} className="card lp-feat-card" style={{
                  padding:26, cursor:'default', transition:'all .22s',
                  borderTop:`3px solid ${f.color}`,
                  background:`${f.color}06`,
                }}>
                  <div style={{ fontSize:28, marginBottom:14, display:'block' }}>{f.icon}</div>
                  <div className="serif" style={{ fontSize:17, fontWeight:700, color:'var(--text)',
                    marginBottom:8 }}>{f.title}</div>
                  <p style={{ fontSize:13, color:'var(--muted)', lineHeight:1.7, margin:0,
                    fontFamily:'Poppins,sans-serif' }}>{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── How It Works ─────────────────────────────────────────────── */}
        <section style={{ padding:'88px 24px', background:'var(--bg2)' }}>
          <div style={{ maxWidth:960, margin:'0 auto' }}>
            <div style={{ textAlign:'center', marginBottom:56 }}>
              <div style={{ fontSize:11, fontWeight:700, letterSpacing:1.2, textTransform:'uppercase',
                color:gold, marginBottom:12, fontFamily:'Poppins,sans-serif' }}>
                Dead simple to get started
              </div>
              <h2 className="serif" style={{ fontSize:'clamp(26px,4vw,40px)', color:'var(--text)',
                fontWeight:800, letterSpacing:'-.02em' }}>
                Up and running in minutes
              </h2>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))', gap:24 }}>
              {STEPS.map((s, i) => (
                <div key={s.n} style={{ position:'relative' }}>
                  {/* Connector line (not on last) */}
                  {i < STEPS.length - 1 && (
                    <div style={{ position:'absolute', top:26, left:'calc(100% - 0px)', width:'100%',
                      height:2, background:`linear-gradient(90deg,${gold}44,transparent)`,
                      display:'none' /* hidden on mobile, shown via CSS if needed */ }}/>
                  )}
                  <div className="card" style={{ padding:28, height:'100%' }}>
                    <div className="serif" style={{ fontSize:42, fontWeight:800, color:gold,
                      opacity:.28, lineHeight:1, marginBottom:12 }}>{s.n}</div>
                    <div className="serif" style={{ fontSize:18, fontWeight:700, color:'var(--text)',
                      marginBottom:10 }}>{s.title}</div>
                    <p style={{ fontSize:13, color:'var(--muted)', lineHeight:1.7, margin:0,
                      fontFamily:'Poppins,sans-serif' }}>{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Team preview strip ────────────────────────────────────────── */}
        <section style={{ padding:'88px 24px', background:'var(--bg)' }}>
          <div style={{ maxWidth:960, margin:'0 auto', display:'grid',
            gridTemplateColumns:'1fr 1fr', gap:56, alignItems:'center' }}>

            {/* Left copy */}
            <div>
              <div style={{ fontSize:11, fontWeight:700, letterSpacing:1.2, textTransform:'uppercase',
                color:'#8b5cf6', marginBottom:12, fontFamily:'Poppins,sans-serif' }}>
                For team leaders
              </div>
              <h2 className="serif" style={{ fontSize:'clamp(26px,4vw,38px)', color:'var(--text)',
                fontWeight:800, letterSpacing:'-.02em', marginBottom:16 }}>
                See your whole team's production at a glance
              </h2>
              <p style={{ fontSize:14, color:'var(--muted)', lineHeight:1.75, marginBottom:24,
                fontFamily:'Poppins,sans-serif' }}>
                Click any agent card to open their full detail panel — activity rings, this month's
                transactions, active listings, and a private coaching thread. All in one place,
                no spreadsheet required.
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
                  marginBottom:9, fontSize:13, color:'var(--text)', fontFamily:'Poppins,sans-serif' }}>
                  <div style={{ width:18, height:18, borderRadius:'50%', flexShrink:0,
                    background:'rgba(139,92,246,.15)', border:'1px solid rgba(139,92,246,.3)',
                    display:'flex', alignItems:'center', justifyContent:'center',
                    fontSize:9, color:'#8b5cf6', fontWeight:700 }}>✓</div>
                  {item}
                </div>
              ))}
            </div>

            {/* Right — mini team roster preview */}
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {[
                { name:'Sarah K.',   rank:'💎 Diamond', xp:'6,420', today:94, month:88, color:'#a855f7' },
                { name:'Marcus T.', rank:'🥇 Gold',    xp:'2,180', today:72, month:65, color:'#d97706' },
                { name:'Jenna P.',  rank:'🥈 Silver',  xp:'1,340', today:56, month:52, color:'#94a3b8' },
                { name:'Derek B.',  rank:'🥇 Gold',    xp:'1,980', today:88, month:79, color:'#d97706' },
              ].map((m, i) => (
                <div key={m.name} className="card" style={{ padding:'12px 16px',
                  display:'flex', alignItems:'center', gap:12,
                  border: i===0 ? `1px solid ${m.color}44` : '1px solid var(--b2)',
                  background: i===0 ? `${m.color}08` : 'var(--surface)',
                  animation:`heroFade .4s ${i*0.08}s ease both` }}>
                  <div style={{ width:38, height:38, borderRadius:'50%', flexShrink:0,
                    background:`linear-gradient(135deg,${m.color},${m.color}88)`,
                    display:'flex', alignItems:'center', justifyContent:'center',
                    fontSize:15, fontWeight:700, color:'#fff' }}>
                    {m.name[0]}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:13, fontWeight:600, color:'var(--text)', marginBottom:1,
                      fontFamily:'Poppins,sans-serif' }}>{m.name}</div>
                    <div style={{ fontSize:10, color:'var(--muted)', fontFamily:'Poppins,sans-serif' }}>
                      {m.rank} · {m.xp} XP
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:8 }}>
                    <SmallRing pct={m.today}  color={m.color}/>
                    <SmallRing pct={m.month}  color='#0ea5e9'/>
                  </div>
                </div>
              ))}
              <div style={{ textAlign:'center', fontSize:11, color:'var(--dim)',
                fontFamily:'Poppins,sans-serif', marginTop:4 }}>
                Click any agent to open their full detail panel →
              </div>
            </div>
          </div>
        </section>

        {/* ── Pricing ──────────────────────────────────────────────────── */}
        <section style={{ padding:'96px 24px', background:'var(--bg2)' }} id="pricing">
          <div style={{ maxWidth:1060, margin:'0 auto' }}>
            <div style={{ textAlign:'center', marginBottom:48 }}>
              <div style={{ fontSize:11, fontWeight:700, letterSpacing:1.2, textTransform:'uppercase',
                color:gold, marginBottom:12, fontFamily:'Poppins,sans-serif' }}>
                Simple pricing
              </div>
              <h2 className="serif" style={{ fontSize:'clamp(26px,4vw,40px)', color:'var(--text)',
                fontWeight:800, letterSpacing:'-.02em', marginBottom:14 }}>
                Start free. Scale when you're ready.
              </h2>
              {/* Billing toggle */}
              <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:12,
                marginTop:24, fontFamily:'Poppins,sans-serif' }}>
                <span style={{ fontSize:13, color: annual ? 'var(--muted)' : 'var(--text)', fontWeight: annual?400:600 }}>Monthly</span>
                <button onClick={()=>setAnnual(a=>!a)} style={{
                  width:46, height:26, borderRadius:14, padding:0, cursor:'pointer', position:'relative',
                  border:'none', transition:'background .2s',
                  background: annual ? gold : 'var(--b3)',
                }}>
                  <div style={{ width:18, height:18, borderRadius:'50%', background:'#fff',
                    position:'absolute', top:4, left: annual ? 24 : 4,
                    transition:'left .2s cubic-bezier(.4,2,.55,1)',
                    boxShadow:'0 1px 4px rgba(0,0,0,.25)' }}/>
                </button>
                <span style={{ fontSize:13, color: annual ? 'var(--text)' : 'var(--muted)', fontWeight: annual?600:400 }}>
                  Annual <span style={{ fontSize:11, padding:'2px 7px', borderRadius:20,
                    background:'rgba(16,185,129,.12)', color:'var(--green)', border:'1px solid rgba(16,185,129,.22)',
                    fontWeight:700 }}>Save 15%</span>
                </span>
              </div>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(290px,1fr))', gap:16 }}>
              {PLANS.map(plan => {
                const price = annual ? plan.priceAnn : plan.price
                const isPop = plan.badge === 'Most Popular'
                return (
                  <div key={plan.name} className="card lp-price-card" style={{
                    padding:28, position:'relative', transition:'all .22s',
                    border: isPop ? `2px solid ${plan.color}` : '1px solid var(--b2)',
                    background: isPop ? `${plan.color}07` : 'var(--surface)',
                  }}>
                    {plan.badge && (
                      <div style={{ position:'absolute', top:-13, left:'50%', transform:'translateX(-50%)',
                        background: plan.color, color:'#fff', fontSize:10, fontWeight:700,
                        padding:'3px 14px', borderRadius:20, whiteSpace:'nowrap',
                        fontFamily:'Poppins,sans-serif', letterSpacing:.5 }}>
                        {plan.badge}
                      </div>
                    )}

                    <div className="serif" style={{ fontSize:22, fontWeight:800, color:'var(--text)',
                      marginBottom:4 }}>{plan.name}</div>
                    <p style={{ fontSize:12, color:'var(--muted)', marginBottom:20,
                      fontFamily:'Poppins,sans-serif', lineHeight:1.5 }}>{plan.desc}</p>

                    <div style={{ marginBottom:24 }}>
                      <span className="serif" style={{ fontSize:44, fontWeight:800, color:plan.color, lineHeight:1 }}>
                        {price === 0 ? 'Free' : `$${price}`}
                      </span>
                      {price > 0 && <span style={{ fontSize:13, color:'var(--muted)',
                        fontFamily:'Poppins,sans-serif' }}>/mo{annual?' · billed annually':''}</span>}
                    </div>

                    <button onClick={onGetStarted} style={{
                      width:'100%', padding:'12px 0', borderRadius:10, fontSize:14, fontWeight:700,
                      cursor:'pointer', marginBottom:22, transition:'all .18s', fontFamily:'Poppins,sans-serif',
                      background: isPop ? plan.color : 'transparent',
                      color: isPop ? '#fff' : plan.color,
                      border: isPop ? 'none' : `2px solid ${plan.color}`,
                      boxShadow: isPop ? `0 6px 22px ${plan.color}44` : 'none',
                    }}>{plan.cta}</button>

                    <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                      {plan.features.map(f => (
                        <div key={f} style={{ display:'flex', alignItems:'center', gap:8,
                          fontSize:12, color:'var(--text)', fontFamily:'Poppins,sans-serif' }}>
                          <div style={{ width:16, height:16, borderRadius:'50%', flexShrink:0,
                            background:`${plan.color}18`, border:`1px solid ${plan.color}30`,
                            display:'flex', alignItems:'center', justifyContent:'center',
                            fontSize:8, color:plan.color, fontWeight:700 }}>✓</div>
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

        {/* ── Final CTA ─────────────────────────────────────────────────── */}
        <section style={{ padding:'100px 24px',
          background: theme === 'dark'
            ? 'radial-gradient(ellipse at 50% 0%, rgba(217,119,6,.14) 0%, transparent 60%), var(--bg)'
            : 'radial-gradient(ellipse at 50% 0%, rgba(180,83,9,.08) 0%, transparent 60%), var(--bg)',
          textAlign:'center' }}>
          <div style={{ maxWidth:620, margin:'0 auto' }}>
            <div style={{ fontSize:42, marginBottom:18 }}>🏡</div>
            <h2 className="serif" style={{ fontSize:'clamp(28px,5vw,48px)', color:'var(--text)',
              fontWeight:800, letterSpacing:'-.025em', marginBottom:16, lineHeight:1.1 }}>
              Stop winging it.<br/>
              <span style={{ color:gold }}>Start grinding.</span>
            </h2>
            <p style={{ fontSize:16, color:'var(--muted)', lineHeight:1.7, marginBottom:36,
              fontFamily:'Poppins,sans-serif' }}>
              Join agents who track every habit, every deal, and every coaching note
              in one place — and actually hit their production goals because of it.
            </p>
            <button onClick={onGetStarted} style={{
              background:gold, color:'#fff', border:'none',
              borderRadius:12, padding:'16px 42px', fontSize:17, fontWeight:700,
              cursor:'pointer', transition:'all .2s', fontFamily:'Poppins,sans-serif',
              boxShadow:`0 8px 32px ${gold}55`,
            }}
              onMouseEnter={e=>{e.currentTarget.style.transform='translateY(-2px)'; e.currentTarget.style.boxShadow=`0 14px 42px ${gold}66`}}
              onMouseLeave={e=>{e.currentTarget.style.transform=''; e.currentTarget.style.boxShadow=`0 8px 32px ${gold}55`}}>
              Start Free — No Credit Card →
            </button>
            <div style={{ marginTop:18, fontSize:12, color:'var(--dim)', fontFamily:'Poppins,sans-serif' }}>
              Free solo plan forever · Team plans start at $39/mo
            </div>
          </div>
        </section>

        {/* ── Footer ───────────────────────────────────────────────────── */}
        <footer style={{ borderTop:'1px solid var(--b1)', padding:'36px 24px',
          background:'var(--bg2)' }}>
          <div style={{ maxWidth:1120, margin:'0 auto',
            display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:16 }}>
            <Wordmark/>
            <div style={{ display:'flex', gap:28, flexWrap:'wrap' }}>
              {[
                { label:'Features',  action:()=>{} },
                { label:'Pricing',   action:()=>document.getElementById('pricing')?.scrollIntoView({behavior:'smooth'}) },
                { label:'Sign In',   action:onGetStarted },
                { label:'Get Started', action:onGetStarted },
              ].map(l => (
                <button key={l.label} onClick={l.action} style={{
                  background:'none', border:'none', cursor:'pointer',
                  fontSize:13, color:'var(--muted)', fontFamily:'Poppins,sans-serif',
                  padding:0, transition:'color .15s',
                }}
                  onMouseEnter={e=>e.currentTarget.style.color='var(--text)'}
                  onMouseLeave={e=>e.currentTarget.style.color='var(--muted)'}>
                  {l.label}
                </button>
              ))}
            </div>
            <div style={{ fontSize:11, color:'var(--dim)', fontFamily:'Poppins,sans-serif' }}>
              © {new Date().getFullYear()} RealtyGrind. All rights reserved.
            </div>
          </div>
        </footer>

      </div>
    </>
  )
}
