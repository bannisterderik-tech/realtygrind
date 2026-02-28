import { useState, useEffect, useRef } from 'react'
import { CSS, ThemeToggle } from '../design'

// ── Constants ──────────────────────────────────────────────────────────────
const RANKS_DEF = [
  { name:'Bronze',   min:0,    color:'#cd7f32', icon:'🥉' },
  { name:'Silver',   min:500,  color:'#9ca3af', icon:'🥈' },
  { name:'Gold',     min:1500, color:'#d97706', icon:'🥇' },
  { name:'Platinum', min:3500, color:'#0ea5e9', icon:'💠' },
  { name:'Diamond',  min:7000, color:'#8b5cf6', icon:'💎' },
]

const DEMO_HABITS = [
  { id:1, label:'Prospecting',  icon:'📞', xp:25, color:'#0ea5e9' },
  { id:2, label:'Appointments', icon:'🤝', xp:30, color:'#10b981' },
  { id:3, label:'Showings',     icon:'🏠', xp:20, color:'#8b5cf6' },
  { id:4, label:'New Listing',  icon:'📋', xp:40, color:'#f97316' },
  { id:5, label:'Market Study', icon:'📊', xp:15, color:'#f43f5e' },
  { id:6, label:'Follow-ups',   icon:'✉️', xp:20, color:'#06b6d4' },
]

const PIPE_STAGES  = ['Offers Made', 'Offers Received', 'Pending', 'Closed']
const PIPE_COLORS  = ['#0ea5e9', '#8b5cf6', '#f97316', '#10b981']
const SAMPLE_ADDRS = ['7 Oak Lane', '512 Birch Dr', '88 River Rd', '214 Elm St', '301 Cedar Blvd', '99 Willow Way']
const SAMPLE_COMMS = ['$6,200', '$9,800', '$14,500', '$7,300', '$11,100', '$8,750']

const PLANS = [
  { name:'Solo',      price:9,   priceAnn:7,   badge:null,           color:'#94a3b8',
    desc:'For individual agents getting dialed in.',
    features:['Habit tracker & XP system','Pipeline & closing tracker','Personal rank & streak','Annual production report'],
    cta:'Get Started' },
  { name:'Team',      price:99,  priceAnn:82,  badge:'Most Popular',  color:'#d97706',
    desc:'For team leaders who demand accountability.',
    features:['Everything in Solo','Up to 15 agents','Roster & leaderboard','Accountability groups','Daily standup feed','Coaching notes per agent','Team challenges & XP bonuses','Active listings board'],
    cta:'Start Free Trial' },
  { name:'Brokerage', price:299, priceAnn:249, badge:'Best Value',    color:'#8b5cf6',
    desc:'For brokers running a full operation.',
    features:['Everything in Team','Unlimited agents','Multiple groups','Priority support','Early access to new features'],
    cta:'Start Free Trial' },
]

const FAQS = [
  { q:'Is there a free trial?',
    a:'Every paid plan starts with a 14-day free trial. No credit card required to get started.' },
  { q:'Can I switch plans later?',
    a:'Absolutely. Upgrade, downgrade, or cancel anytime from your account settings with no penalties.' },
  { q:'How does the team plan work?',
    a:'One team leader creates the team and invites agents via email. Everyone gets their own personal dashboard, and the leader sees the full roster, accountability groups, coaching notes, and daily standups.' },
  { q:'Is my pipeline data private from my team leader?',
    a:"Leaders can see habit completion rates, production totals, and the listings board — but each agent's private pipeline notes are visible only to them." },
  { q:'Can I add my own daily tasks?',
    a:'Yes. You can create custom daily tasks with your own labels, icons, and XP values. You can also rename built-in habits, adjust XP weights, and hide any habits that don\'t apply to your business.' },
  { q:'What is XP and how does it work?',
    a:'XP (experience points) are earned by completing daily habits, closing deals, and winning team challenges. As XP accumulates you climb through ranks: Bronze → Silver → Gold → Platinum → Diamond.' },
  { q:'Does it work on mobile?',
    a:'Yes — RealtyGrind is fully responsive and works great on any phone or tablet. No app download needed.' },
  { q:'What happens to my data if I cancel?',
    a:'Your data is retained for 90 days after cancellation. You can export everything before leaving.' },
]

const TESTIMONIALS = [
  { name:'Sarah K.', title:"Buyer's Agent · Austin, TX", avatar:'👩',
    quote:'I tried spreadsheets, a journal, three different apps. RealtyGrind is the first thing that made me actually consistent. My prospecting went from 3 calls a day to 18.',
    stat:'6× prospecting increase' },
  { name:'Marcus T.', title:'Team Leader · Atlanta, GA', avatar:'👨🏾',
    quote:"I run a 12-agent team. Before this I had zero visibility into who was working. Now I can see who's grinding and who's coasting — and actually coach accordingly.",
    stat:'12 agents, full visibility' },
  { name:'Jenna R.', title:'Listing Agent · Denver, CO', avatar:'👩🏼',
    quote:"The XP system sounds silly until you're chasing Diamond rank at 11pm on a Tuesday. Gamification works. My GCI is up 40% since I started.",
    stat:'40% GCI increase' },
]

const FEATURES = [
  { icon:'📞', title:'Habit Tracker',        color:'#0ea5e9', desc:'Track the 11 core real estate habits daily. Prospecting, appointments, showings, listings, and more — each with XP rewards that compound.' },
  { icon:'💰', title:'Pipeline Tracker',      color:'#10b981', desc:'Log offers, pending deals, and closings. Watch your monthly commission accumulate in real time as deals move through the funnel.' },
  { icon:'🏆', title:'XP & Rank System',      color:'#d97706', desc:'Bronze → Silver → Gold → Platinum → Diamond. Every habit and every deal earns XP. Gamified accountability that makes discipline addictive.' },
  { icon:'👥', title:'Team Management',       color:'#8b5cf6', desc:'Full roster view, accountability groups, daily standup feed, and per-agent coaching notes. Everything a leader needs.' },
  { icon:'🏠', title:'Active Listings Board', color:'#f97316', desc:"See every active listing across your entire team in one live view. Status, address, list price, and commission — always current." },
  { icon:'📋', title:'Coaching Notes',        color:'#f43f5e', desc:'Leave private coaching notes per agent, pin critical feedback, choose note types, and track agent replies in-thread.' },
  { icon:'⚡', title:'Daily Standups',        color:'#06b6d4', desc:"Agents submit a 3-question daily standup: what they accomplished, their win of the day, and tomorrow's focus. Leaders see the live feed." },
  { icon:'📈', title:'Annual GCI Report',     color:'#84cc16', desc:'Month-by-month breakdown of your full production year: habits, listings, offers, closings, volume, and GCI — all in one clean report.' },
]

const TIMELINE = [
  { time:'7:00 AM',  icon:'🌅', action:'Open RealtyGrind. Log morning market study.',           xp:'+15 XP', tag:'Habit',    color:'#0ea5e9' },
  { time:'8:30 AM',  icon:'📞', action:'3 prospecting calls logged. Streak extends to 14 days.', xp:'+75 XP', tag:'Habit',    color:'#10b981' },
  { time:'10:00 AM', icon:'🤝', action:'Buyer appointment completed and logged.',                xp:'+30 XP', tag:'Habit',    color:'#8b5cf6' },
  { time:'1:00 PM',  icon:'📝', action:'Offer submitted on 4235 Oak St. Added to pipeline.',    xp:'+75 XP', tag:'Pipeline', color:'#f97316' },
  { time:'3:30 PM',  icon:'🏠', action:'New listing signed at 812 River Rd. Team board updates.', xp:'+40 XP', tag:'Listing', color:'#d97706' },
  { time:'5:00 PM',  icon:'⚡', action:'Daily standup submitted. Team leader leaves coaching note.', xp:'',  tag:'Team',    color:'#06b6d4' },
  { time:'6:15 PM',  icon:'🎉', action:'4235 Oak St goes pending. Commission counter ticks up.', xp:'+150 XP', tag:'Pipeline', color:'#f43f5e' },
  { time:'9:00 PM',  icon:'💎', action:'Day complete. 385 XP earned today. #2 on team leaderboard.', xp:'', tag:'XP',      color:'#8b5cf6' },
]

const TICKER_ITEMS = [
  '🎯 Daily Habit Tracker','🏆 XP Leaderboards','👥 Team Roster','📊 Pipeline Tracker',
  '🏠 Active Listings Board','📋 Coaching Notes','⚡ Daily Standups','🔥 Streak Tracking',
  '💎 Diamond Rank','📈 Annual GCI Report','🏆 Team Challenges','📱 Mobile Friendly',
  '🧑‍💼 Coaching Notes','🎯 Goal Tracking','📅 Week Planner','🔔 Accountability Groups',
]

const COMPARE_ROWS = [
  { feature:'Daily habit tracking',     rg:true, sheet:false,  crm:false },
  { feature:'XP & rank gamification',  rg:true, sheet:false,  crm:false },
  { feature:'Pipeline tracker',         rg:true, sheet:'⚠️',  crm:true  },
  { feature:'Team leaderboard',         rg:true, sheet:false,  crm:false },
  { feature:'Coaching notes per agent', rg:true, sheet:false,  crm:'⚠️'  },
  { feature:'Daily standup feed',       rg:true, sheet:false,  crm:false },
  { feature:'Accountability groups',    rg:true, sheet:false,  crm:false },
  { feature:'Active listings board',    rg:true, sheet:'⚠️',  crm:false },
  { feature:'Annual GCI report',        rg:true, sheet:'⚠️',  crm:'⚠️'  },
  { feature:'Real estate specific',     rg:true, sheet:false,  crm:false },
  { feature:'XP-based challenges',      rg:true, sheet:false,  crm:false },
  { feature:'Streak tracking',          rg:true, sheet:false,  crm:false },
]

const LB_AGENTS = [
  { name:'Alex M.',   xp:3240, ring:88, rank:'🥇' },
  { name:'Jordan L.', xp:2980, ring:72, rank:'🥇' },
  { name:'Taylor S.', xp:2650, ring:65, rank:'🥈' },
  { name:'Morgan R.', xp:2310, ring:58, rank:'🥈' },
  { name:'Casey P.',  xp:1890, ring:44, rank:'🥈' },
]

// ── CSS ───────────────────────────────────────────────────────────────────
const LCSS = `
@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&family=Playfair+Display:wght@700;800;900&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
.serif{font-family:'Playfair Display',serif;}

/* Nav */
.lp-nav{position:fixed;top:0;left:0;right:0;z-index:100;backdrop-filter:blur(14px) saturate(180%);-webkit-backdrop-filter:blur(14px) saturate(180%);border-bottom:1px solid var(--b1);padding:0 32px;height:64px;display:flex;align-items:center;justify-content:space-between;}

/* Layout */
.lp-max{max-width:1100px;margin:0 auto;}
.lp-section-pad{padding:96px 24px;}
.lp-label{font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;font-family:Poppins,sans-serif;}
.lp-split{display:grid;grid-template-columns:1fr 1fr;gap:64px;align-items:center;}

/* Animations */
@keyframes heroFade{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
@keyframes ticker{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
@keyframes ringFill{from{stroke-dasharray:0 999}}
@keyframes fadeSlideIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
@keyframes slideInRight{from{opacity:0;transform:translateX(40px)}to{opacity:1;transform:translateX(0)}}
@keyframes xpFloat{0%{opacity:1;transform:translateY(0)}100%{opacity:0;transform:translateY(-36px)}}
@keyframes rankLevelUp{0%{transform:scale(1)}40%{transform:scale(1.35) rotate(8deg)}100%{transform:scale(1)}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.6}}

.lp-hero-text{animation:heroFade .7s ease both;}
.lp-hero-sub{animation:heroFade .7s .12s ease both;}
.lp-hero-ctas{animation:heroFade .7s .22s ease both;}
.lp-mockup{animation:slideInRight .7s .28s ease both;}

/* Ticker */
.lp-ticker-wrap{overflow:hidden;padding:14px 0;border-top:1px solid var(--b1);border-bottom:1px solid var(--b1);}
.lp-ticker-track{display:flex;gap:44px;animation:ticker 36s linear infinite;white-space:nowrap;}

/* Stats */
.lp-stats-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:24px;}
.lp-stat-num{font-size:clamp(36px,5vw,60px);font-weight:800;line-height:1;}

/* Habit demo */
.lp-habit-row{display:flex;align-items:center;gap:12px;padding:11px 14px;border-radius:12px;cursor:pointer;transition:all .15s;border:1.5px solid transparent;margin-bottom:6px;user-select:none;}
.lp-habit-row:hover{background:var(--surface);border-color:var(--b2);}
.lp-habit-row.done{background:var(--surface);border-color:var(--b2);}
.lp-xp-pop{position:absolute;font-size:13px;font-weight:700;font-family:Poppins,sans-serif;pointer-events:none;animation:xpFloat .95s ease-out forwards;right:28px;}

/* Pipeline demo */
.lp-pipe-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;}
.lp-pipe-col{background:var(--surface);border:1px solid var(--b2);border-radius:14px;padding:14px;min-height:150px;}
.lp-pipe-deal{background:var(--bg);border:1px solid var(--b2);border-radius:8px;padding:8px 10px;margin-top:8px;font-size:12px;font-family:Poppins,sans-serif;animation:fadeSlideIn .25s ease;}
.lp-pipe-add{width:100%;margin-top:10px;padding:8px;border-radius:8px;border:1.5px dashed var(--b3);background:transparent;cursor:pointer;font-size:12px;color:var(--muted);font-family:Poppins,sans-serif;transition:all .15s;}
.lp-pipe-add:hover{border-color:var(--gold);color:var(--gold);}

/* Rank demo */
.lp-rank-bar-wrap{background:var(--b1);border-radius:8px;height:12px;overflow:hidden;}
.lp-rank-bar-fill{height:100%;border-radius:8px;transition:width .55s cubic-bezier(.4,0,.2,1);}

/* Leaderboard */
.lp-lb-row{display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:12px;background:var(--surface);border:1px solid var(--b2);margin-bottom:8px;transition:transform .2s;}
.lp-lb-row:hover{transform:translateX(4px);}

/* Feature grid */
.lp-feat-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:18px;}
.lp-feat-card{background:var(--surface);border:1px solid var(--b2);border-radius:16px;padding:22px;transition:all .2s;}
.lp-feat-card:hover{transform:translateY(-4px);box-shadow:var(--shadow2);border-color:var(--b3);}

/* Timeline */
.lp-tl-item{display:flex;gap:20px;}
.lp-tl-left{display:flex;flex-direction:column;align-items:center;width:44px;flex-shrink:0;}
.lp-tl-dot{width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;border:2px solid var(--b2);background:var(--surface);}
.lp-tl-line{width:2px;background:var(--b2);flex:1;min-height:28px;margin:4px 0;}
.lp-tl-content{padding-bottom:28px;flex:1;}

/* Testimonials */
.lp-test-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;}
.lp-testimonial{background:var(--surface);border:1px solid var(--b2);border-radius:20px;padding:28px 24px;transition:transform .2s;}
.lp-testimonial:hover{transform:translateY(-4px);}

/* Compare */
.lp-compare-table{border:1px solid var(--b2);border-radius:16px;overflow:hidden;}
.lp-compare-head{display:grid;grid-template-columns:2.5fr 1fr 1fr 1fr;background:var(--surface);}
.lp-compare-row{display:grid;grid-template-columns:2.5fr 1fr 1fr 1fr;}
.lp-compare-row:nth-child(even){background:var(--surface);}
.lp-compare-cell{padding:12px 16px;font-size:13px;border-bottom:1px solid var(--b1);display:flex;align-items:center;font-family:Poppins,sans-serif;}

/* FAQ */
.lp-faq-item{border-bottom:1px solid var(--b2);}
.lp-faq-q{width:100%;text-align:left;padding:20px 0;background:transparent;border:none;cursor:pointer;display:flex;justify-content:space-between;align-items:center;font-size:15px;font-weight:600;color:var(--text);font-family:Poppins,sans-serif;gap:12px;}
.lp-faq-a{font-size:13px;color:var(--muted);line-height:1.8;padding-bottom:20px;font-family:Poppins,sans-serif;}

/* Pricing */
.lp-pricing-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;}
.lp-price-card{transition:transform .22s;}
.lp-price-card:hover{transform:translateY(-4px);}

/* Hero grid */
.lp-hero-grid{display:grid;grid-template-columns:1fr 1fr;gap:60px;align-items:center;}

/* Responsive ──────────────────────────────── */
@media(max-width:1050px){
  .lp-feat-grid{grid-template-columns:repeat(2,1fr);}
}
@media(max-width:900px){
  .lp-hero-grid{grid-template-columns:1fr;}
  .lp-split{grid-template-columns:1fr;gap:40px;}
  .lp-stats-grid{grid-template-columns:repeat(2,1fr);}
  .lp-pipe-grid{grid-template-columns:repeat(2,1fr);}
  .lp-test-grid{grid-template-columns:1fr;}
  .lp-compare-head{grid-template-columns:2fr 1fr 1fr;}
  .lp-compare-row{grid-template-columns:2fr 1fr 1fr;}
  .lp-compare-hide{display:none;}
  .lp-pricing-grid{grid-template-columns:1fr;}
  .lp-nav-links{display:none;}
}
@media(max-width:640px){
  .lp-section-pad{padding:64px 16px;}
  .lp-feat-grid{grid-template-columns:1fr;}
  .lp-stats-grid{grid-template-columns:1fr 1fr;}
  .lp-pipe-grid{grid-template-columns:1fr 1fr;}
  .lp-nav-ctas{display:none;}
}
@media(max-width:400px){
  .lp-mockup{display:none;}
}
`

// ── AnimatedNumber ─────────────────────────────────────────────────────────
function AnimatedNumber({ target, suffix = '', prefix = '' }) {
  const [val, setVal] = useState(0)
  const started = useRef(false)
  const ref = useRef(null)
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !started.current) {
        started.current = true
        let cur = 0
        const step = target / (1800 / 16)
        const timer = setInterval(() => {
          cur += step
          if (cur >= target) { setVal(target); clearInterval(timer) }
          else setVal(Math.floor(cur))
        }, 16)
      }
    }, { threshold: 0.4 })
    if (ref.current) obs.observe(ref.current)
    return () => obs.disconnect()
  }, [target])
  return <span ref={ref}>{prefix}{val.toLocaleString()}{suffix}</span>
}

// ── SmallRing ──────────────────────────────────────────────────────────────
function SmallRing({ pct, color, size = 38 }) {
  const r = (size - 6) / 2
  const circ = 2 * Math.PI * r
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--b2)" strokeWidth={3} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={3}
        strokeDasharray={`${circ * pct / 100} ${circ}`} strokeLinecap="round"
        style={{ transition: 'stroke-dasharray .4s' }} />
    </svg>
  )
}

// ── DashboardMockup ────────────────────────────────────────────────────────
function DashboardMockup({ theme }) {
  const habits = [
    { label: 'Prospecting',   pct: 80,  color: '#0ea5e9', done: true  },
    { label: 'Appointments',  pct: 60,  color: '#10b981', done: true  },
    { label: 'Showings',      pct: 40,  color: '#8b5cf6', done: false },
    { label: 'New Listing',   pct: 100, color: '#f97316', done: true  },
    { label: 'Market Review', pct: 20,  color: '#f43f5e', done: false },
  ]
  const r = 28, sw = 5, circ = 2 * Math.PI * r
  return (
    <div style={{
      background: theme === 'dark' ? '#1a1a1a' : '#fff',
      border: '1px solid var(--b2)', borderRadius: 20,
      boxShadow: '0 28px 80px rgba(0,0,0,.18)', overflow: 'hidden',
      fontFamily: 'Poppins,sans-serif',
    }}>
      <div style={{ background: theme === 'dark' ? '#111' : '#f5f5f4', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--b2)' }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff5f57' }} />
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#febc2e' }} />
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#28c840' }} />
        <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--muted)', flex: 1, textAlign: 'center' }}>RealtyGrind · Today</span>
      </div>
      <div style={{ padding: '18px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>Good morning, Alex 🔥</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>Tuesday Grind</div>
          </div>
          <div style={{ position: 'relative', width: 62, height: 62 }}>
            <svg width={62} height={62} style={{ transform: 'rotate(-90deg)' }}>
              <circle cx={31} cy={31} r={r} fill="none" stroke="var(--b1)" strokeWidth={sw} />
              <circle cx={31} cy={31} r={r} fill="none" stroke="#d97706" strokeWidth={sw}
                strokeDasharray={`${circ * 0.72} ${circ}`} strokeLinecap="round"
                style={{ animation: 'ringFill 1.4s .5s cubic-bezier(.4,2,.55,1) both' }} />
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--gold)' }}>72%</span>
            </div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6, marginBottom: 14 }}>
          {[['3','LISTINGS','#0ea5e9'],['2','OFFERS','#8b5cf6'],['1','PENDING','#f97316'],['1','CLOSED','#10b981']].map(([n,l,c]) => (
            <div key={l} style={{ background: 'var(--surface)', border: '1px solid var(--b2)', borderRadius: 8, padding: '6px 4px', textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: c }}>{n}</div>
              <div style={{ fontSize: 8, color: 'var(--muted)', letterSpacing: .5 }}>{l}</div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--muted)', letterSpacing: 1, marginBottom: 8 }}>TODAY'S HABITS</div>
        {habits.map(h => (
          <div key={h.label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
            <div style={{ width: 16, height: 16, borderRadius: 4, border: `2px solid ${h.done ? h.color : 'var(--b3)'}`, background: h.done ? h.color : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {h.done && <span style={{ color: '#fff', fontSize: 9 }}>✓</span>}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text)', flex: 1 }}>{h.label}</div>
            <div style={{ fontSize: 10, color: h.color, fontWeight: 600 }}>{h.pct}%</div>
            <div style={{ width: 48, height: 3, background: 'var(--b1)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ width: `${h.pct}%`, height: '100%', background: h.color, borderRadius: 2 }} />
            </div>
          </div>
        ))}
        <div style={{ marginTop: 12, background: 'var(--surface)', borderRadius: 10, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 10, border: '1px solid var(--b2)' }}>
          <span style={{ fontSize: 16 }}>🥇</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gold)' }}>Gold Rank · 2,340 XP</div>
            <div style={{ fontSize: 9, color: 'var(--muted)' }}>660 XP to Platinum 💠</div>
          </div>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--dim)', background: 'rgba(217,119,6,.12)', padding: '3px 8px', borderRadius: 20 }}>#2 Team</div>
        </div>
      </div>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────
export default function LandingPage({ theme, onToggleTheme, onGetStarted }) {
  const gold   = theme === 'dark' ? '#d97706' : '#b45309'
  const goldBg = theme === 'dark' ? 'rgba(217,119,6,.12)' : 'rgba(180,83,9,.08)'

  const [annual, setAnnual] = useState(false)

  // Habit demo
  const [checkedHabits, setCheckedHabits] = useState(new Set([0, 1, 3]))
  const [xpPops,        setXpPops]        = useState([])
  const [demoXp,        setDemoXp]        = useState(DEMO_HABITS.filter((_,i)=>[0,1,3].includes(i)).reduce((a,h)=>a+h.xp, 0))

  // Pipeline demo
  const [pipeDeals, setPipeDeals] = useState({
    0: [{ id:1, addr:'142 Maple St', comm:'$8,400' }],
    1: [{ id:2, addr:'309 Pine Ave', comm:'$12,000' }],
    2: [], 3: [],
  })
  const [nextDealId, setNextDealId] = useState(3)
  const [commTotal,  setCommTotal]  = useState(0)

  // Rank demo
  const [rankXp,      setRankXp]      = useState(1200)
  const [rankAnim,    setRankAnim]    = useState(false)

  // FAQ
  const [openFaq, setOpenFaq] = useState(null)

  const btnGold = {
    background: gold, color: '#fff', border: 'none', borderRadius: 10,
    fontFamily: 'Poppins,sans-serif', fontWeight: 700, cursor: 'pointer',
    transition: 'all .2s', boxShadow: `0 4px 18px ${gold}44`,
  }

  // ── Habit demo logic ───────────────────────────────────────────────────
  function toggleHabitDemo(idx) {
    const h = DEMO_HABITS[idx]
    const checking = !checkedHabits.has(idx)
    const next = new Set(checkedHabits)
    if (checking) {
      next.add(idx)
      setDemoXp(p => p + h.xp)
      const id = Date.now() + Math.random()
      setXpPops(p => [...p, { id, label: `+${h.xp} XP`, color: h.color }])
      setTimeout(() => setXpPops(p => p.filter(x => x.id !== id)), 950)
    } else {
      next.delete(idx)
      setDemoXp(p => Math.max(0, p - h.xp))
    }
    setCheckedHabits(next)
  }

  // ── Pipeline demo logic ────────────────────────────────────────────────
  function addDeal(colIdx) {
    const id = nextDealId
    setNextDealId(id + 1)
    const addr = SAMPLE_ADDRS[id % SAMPLE_ADDRS.length]
    const comm = SAMPLE_COMMS[id % SAMPLE_COMMS.length]
    setPipeDeals(prev => ({ ...prev, [colIdx]: [...prev[colIdx], { id, addr, comm }] }))
    if (colIdx === 3) {
      setCommTotal(p => p + parseFloat(comm.replace(/[^0-9.]/g, '')))
    }
  }

  // ── Rank demo logic ────────────────────────────────────────────────────
  function getCurrentRank(xp) { return [...RANKS_DEF].reverse().find(r => xp >= r.min) || RANKS_DEF[0] }
  function getNextRank(xp)    { return RANKS_DEF.find(r => r.min > xp) }
  function getRankPct(xp)     {
    const cur = getCurrentRank(xp), nxt = getNextRank(xp)
    if (!nxt) return 100
    return Math.round((xp - cur.min) / (nxt.min - cur.min) * 100)
  }

  function addRankXp() {
    const before = getCurrentRank(rankXp)
    const newXp  = Math.min(rankXp + 250, 7500)
    const after  = getCurrentRank(newXp)
    if (after.name !== before.name) {
      setRankAnim(true)
      setTimeout(() => setRankAnim(false), 700)
    }
    setRankXp(newXp)
  }

  const curRank = getCurrentRank(rankXp)
  const nxtRank = getNextRank(rankXp)
  const rankPct = getRankPct(rankXp)

  return (
    <>
      <style>{CSS}</style>
      <style>{LCSS}</style>
      <div data-theme={theme} style={{ background: 'var(--bg)', color: 'var(--text)', minHeight: '100vh' }}>

        {/* ── Nav ──────────────────────────────────────────────────── */}
        <nav className="lp-nav" style={{ background: theme === 'dark' ? 'rgba(10,10,10,.88)' : 'rgba(255,255,255,.88)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 22 }}>🏡</span>
            <span className="serif" style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)' }}>RealtyGrind</span>
          </div>
          <div className="lp-nav-links" style={{ display: 'flex', gap: 28 }}>
            {['Features','Pricing','FAQ'].map(l => (
              <span key={l} style={{ fontSize: 13, fontWeight: 500, color: 'var(--muted)', cursor: 'pointer', fontFamily: 'Poppins,sans-serif', transition: 'color .15s' }}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--text)'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--muted)'}>{l}</span>
            ))}
          </div>
          <div className="lp-nav-ctas" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <ThemeToggle theme={theme} onToggle={onToggleTheme} />
            <button onClick={onGetStarted} style={{ background: 'transparent', border: '1px solid var(--b3)', color: 'var(--text)', borderRadius: 8, padding: '7px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Poppins,sans-serif' }}>
              Sign In
            </button>
            <button onClick={onGetStarted} style={{ ...btnGold, fontSize: 13, padding: '8px 20px', borderRadius: 8 }}>
              Start Free →
            </button>
          </div>
        </nav>

        {/* ── Hero ─────────────────────────────────────────────────── */}
        <section className="lp-section-pad" style={{ paddingTop: 128, paddingBottom: 80 }}>
          <div className="lp-max">
            <div className="lp-hero-grid">
              <div>
                <div className="lp-hero-text" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '5px 14px', borderRadius: 24, marginBottom: 24, background: goldBg, border: `1px solid ${gold}33`, fontSize: 12, fontWeight: 700, color: gold, letterSpacing: .5, fontFamily: 'Poppins,sans-serif' }}>
                  🏡 Built for Real Estate Agents
                </div>
                <h1 className="serif lp-hero-text" style={{ fontSize: 'clamp(40px,6vw,76px)', fontWeight: 900, lineHeight: 1.04, letterSpacing: '-.03em', marginBottom: 22, color: 'var(--text)' }}>
                  Outwork Everyone.<br />
                  <span style={{ color: gold }}>Track Everything.</span>
                </h1>
                <p className="lp-hero-sub" style={{ fontSize: 17, color: 'var(--muted)', lineHeight: 1.75, marginBottom: 36, fontFamily: 'Poppins,sans-serif', maxWidth: 480 }}>
                  The habit tracker, pipeline manager, team accountability platform, and coaching tool built specifically for agents who refuse to wing it.
                </p>
                <div className="lp-hero-ctas" style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 28 }}>
                  <button onClick={onGetStarted} style={{ ...btnGold, fontSize: 16, padding: '14px 32px' }}
                    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 10px 36px ${gold}66` }}
                    onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = `0 4px 18px ${gold}44` }}>
                    Start for Free →
                  </button>
                  <button onClick={onGetStarted} style={{ background: 'transparent', border: '1.5px solid var(--b3)', color: 'var(--text)', borderRadius: 10, padding: '14px 28px', fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'Poppins,sans-serif', transition: 'border-color .2s' }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--text)'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--b3)'}>
                    Sign In
                  </button>
                </div>
                <div style={{ display: 'flex', gap: 20, fontSize: 12, color: 'var(--dim)', fontFamily: 'Poppins,sans-serif', flexWrap: 'wrap' }}>
                  {['✓ Free to start', '✓ No credit card', '✓ 2 min setup'].map(t => <span key={t}>{t}</span>)}
                </div>
              </div>
              <div className="lp-mockup">
                <DashboardMockup theme={theme} />
              </div>
            </div>
          </div>
        </section>

        {/* ── Ticker ───────────────────────────────────────────────── */}
        <div className="lp-ticker-wrap">
          <div className="lp-ticker-track">
            {[...TICKER_ITEMS, ...TICKER_ITEMS].map((t, i) => (
              <span key={i} style={{ fontSize: 13, color: 'var(--muted)', fontFamily: 'Poppins,sans-serif', fontWeight: 500, flexShrink: 0 }}>{t}</span>
            ))}
          </div>
        </div>

        {/* ── Stats ────────────────────────────────────────────────── */}
        <section style={{ padding: '72px 24px', background: theme === 'dark' ? 'rgba(255,255,255,.02)' : 'rgba(0,0,0,.02)', borderTop: '1px solid var(--b1)', borderBottom: '1px solid var(--b1)' }}>
          <div className="lp-max">
            <div className="lp-stats-grid">
              {[
                { target: 2800,  suffix: '+',  prefix: '',  label: 'Habits tracked daily',    icon: '🎯' },
                { target: 940,   suffix: '+',  prefix: '',  label: 'Agents on the platform',  icon: '👥' },
                { target: 52,    suffix: 'M+', prefix: '$', label: 'In commission tracked',   icon: '💰' },
                { target: 18400, suffix: '+',  prefix: '',  label: 'Deals logged',            icon: '📊' },
              ].map(s => (
                <div key={s.label} style={{ textAlign: 'center', padding: '8px' }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>{s.icon}</div>
                  <div className="serif lp-stat-num" style={{ color: gold }}>
                    <AnimatedNumber target={s.target} suffix={s.suffix} prefix={s.prefix} />
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'Poppins,sans-serif', marginTop: 8 }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Interactive Habit Tracker ─────────────────────────────── */}
        <section className="lp-section-pad">
          <div className="lp-max">
            <div className="lp-split">
              {/* Copy */}
              <div>
                <div className="lp-label" style={{ color: '#0ea5e9', marginBottom: 12 }}>Daily Habit Tracker</div>
                <h2 className="serif" style={{ fontSize: 'clamp(28px,4vw,50px)', fontWeight: 800, lineHeight: 1.1, letterSpacing: '-.025em', marginBottom: 18 }}>
                  Your entire day,<br />organized.
                </h2>
                <p style={{ fontSize: 15, color: 'var(--muted)', lineHeight: 1.75, marginBottom: 28, fontFamily: 'Poppins,sans-serif' }}>
                  Track the 11 core real estate habits every single day. Each check earns XP, extends your streak, and moves you up the leaderboard. No more guessing if you did the work — it's right there.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {['11 built-in real estate habits', 'Custom tasks with your own XP values', 'Daily, weekly & monthly views', 'Streak tracking across every habit', 'Skip a habit without losing your streak'].map(f => (
                    <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, fontFamily: 'Poppins,sans-serif', color: 'var(--text)' }}>
                      <span style={{ color: '#0ea5e9', fontWeight: 700, fontSize: 16 }}>✓</span>{f}
                    </div>
                  ))}
                </div>
              </div>
              {/* Interactive demo */}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--b2)', borderRadius: 20, padding: 24, position: 'relative' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'Poppins,sans-serif', marginBottom: 2 }}>Today's Habits</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', fontFamily: 'Poppins,sans-serif' }}>{checkedHabits.size} of {DEMO_HABITS.length} complete</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 24, fontWeight: 800, color: gold, fontFamily: 'Poppins,sans-serif' }}>{demoXp} XP</div>
                    <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'Poppins,sans-serif' }}>earned today</div>
                  </div>
                </div>
                {DEMO_HABITS.map((h, idx) => {
                  const done = checkedHabits.has(idx)
                  return (
                    <div key={h.id} className={`lp-habit-row${done ? ' done' : ''}`} onClick={() => toggleHabitDemo(idx)}>
                      <div style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${done ? h.color : 'var(--b3)'}`, background: done ? h.color : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all .15s' }}>
                        {done && <span style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>✓</span>}
                      </div>
                      <span style={{ fontSize: 17, flexShrink: 0 }}>{h.icon}</span>
                      <span style={{ flex: 1, fontSize: 13, fontFamily: 'Poppins,sans-serif', fontWeight: done ? 600 : 400, color: done ? 'var(--text)' : 'var(--muted)', textDecoration: done ? 'none' : 'none' }}>{h.label}</span>
                      <span style={{ fontSize: 11, color: h.color, fontWeight: 700, fontFamily: 'Poppins,sans-serif' }}>+{h.xp} XP</span>
                    </div>
                  )
                })}
                {xpPops.map(p => (
                  <div key={p.id} className="lp-xp-pop" style={{ color: p.color, bottom: 90 }}>{p.label}</div>
                ))}
                <div style={{ marginTop: 16, background: 'var(--b1)', borderRadius: 6, height: 6, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.round(checkedHabits.size / DEMO_HABITS.length * 100)}%`, background: gold, borderRadius: 6, transition: 'width .3s' }} />
                </div>
                <div style={{ textAlign: 'center', marginTop: 10, fontSize: 11, color: 'var(--muted)', fontFamily: 'Poppins,sans-serif' }}>
                  ↑ Click any habit to try it
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Interactive Pipeline Demo ─────────────────────────────── */}
        <section className="lp-section-pad" style={{ background: theme === 'dark' ? 'rgba(255,255,255,.02)' : 'rgba(0,0,0,.02)', borderTop: '1px solid var(--b1)', borderBottom: '1px solid var(--b1)' }}>
          <div className="lp-max">
            <div style={{ textAlign: 'center', marginBottom: 48 }}>
              <div className="lp-label" style={{ color: '#10b981', marginBottom: 12 }}>Pipeline Tracker</div>
              <h2 className="serif" style={{ fontSize: 'clamp(28px,4vw,50px)', fontWeight: 800, lineHeight: 1.1, letterSpacing: '-.025em', marginBottom: 16 }}>
                Never lose track of a deal.
              </h2>
              <p style={{ fontSize: 15, color: 'var(--muted)', fontFamily: 'Poppins,sans-serif', maxWidth: 520, margin: '0 auto' }}>
                Every offer, every pending, every closing — logged and tracked in real time. Hit the <strong style={{ color: 'var(--text)' }}>+ Add Deal</strong> buttons below to see how it works.
              </p>
            </div>
            {commTotal > 0 && (
              <div style={{ textAlign: 'center', marginBottom: 28 }}>
                <span className="serif" style={{ fontSize: 40, fontWeight: 800, color: '#10b981' }}>${commTotal.toLocaleString()}</span>
                <span style={{ fontSize: 14, color: 'var(--muted)', fontFamily: 'Poppins,sans-serif', marginLeft: 10 }}>commission earned this month 🎉</span>
              </div>
            )}
            <div className="lp-pipe-grid">
              {PIPE_STAGES.map((stage, ci) => (
                <div key={stage} className="lp-pipe-col">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: PIPE_COLORS[ci], fontFamily: 'Poppins,sans-serif', letterSpacing: .5, textTransform: 'uppercase' }}>{stage}</span>
                    <span style={{ fontSize: 20, fontWeight: 800, color: PIPE_COLORS[ci] }}>{pipeDeals[ci].length}</span>
                  </div>
                  <div style={{ width: '100%', height: 3, background: `${PIPE_COLORS[ci]}22`, borderRadius: 2, marginBottom: 10, overflow: 'hidden' }}>
                    <div style={{ width: `${Math.min(pipeDeals[ci].length * 25, 100)}%`, height: '100%', background: PIPE_COLORS[ci], borderRadius: 2, transition: 'width .35s' }} />
                  </div>
                  {pipeDeals[ci].map(d => (
                    <div key={d.id} className="lp-pipe-deal">
                      <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>{d.addr}</div>
                      <div style={{ color: PIPE_COLORS[ci], fontWeight: 700 }}>{d.comm}</div>
                    </div>
                  ))}
                  <button className="lp-pipe-add" onClick={() => addDeal(ci)}>+ Add Deal</button>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── XP & Rank System ──────────────────────────────────────── */}
        <section className="lp-section-pad">
          <div className="lp-max">
            <div className="lp-split">
              {/* Copy */}
              <div>
                <div className="lp-label" style={{ color: '#d97706', marginBottom: 12 }}>XP & Rank System</div>
                <h2 className="serif" style={{ fontSize: 'clamp(28px,4vw,50px)', fontWeight: 800, lineHeight: 1.1, letterSpacing: '-.025em', marginBottom: 18 }}>
                  Turn discipline<br />into status.
                </h2>
                <p style={{ fontSize: 15, color: 'var(--muted)', lineHeight: 1.75, marginBottom: 28, fontFamily: 'Poppins,sans-serif' }}>
                  Every habit you check and every deal you close earns XP. Watch your rank climb from Bronze to Diamond. Hit the button on the right to see it happen live.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {RANKS_DEF.map(r => (
                    <div key={r.name} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', borderRadius: 12, background: 'var(--surface)', border: `1.5px solid ${rankXp >= r.min ? r.color + '55' : 'var(--b2)'}`, transition: 'border-color .3s' }}>
                      <span style={{ fontSize: 22 }}>{r.icon}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: r.color, fontFamily: 'Poppins,sans-serif' }}>{r.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'Poppins,sans-serif' }}>{r.min.toLocaleString()}+ XP</div>
                      </div>
                      {rankXp >= r.min && <span style={{ fontSize: 11, color: r.color, fontWeight: 700, fontFamily: 'Poppins,sans-serif' }}>Unlocked ✓</span>}
                    </div>
                  ))}
                </div>
              </div>
              {/* Interactive rank demo */}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--b2)', borderRadius: 20, padding: 28 }}>
                <div style={{ textAlign: 'center', marginBottom: 24 }}>
                  <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'Poppins,sans-serif', marginBottom: 10, letterSpacing: 1, textTransform: 'uppercase' }}>Your Rank</div>
                  <div style={{ fontSize: 64, marginBottom: 10, display: 'inline-block', animation: rankAnim ? 'rankLevelUp .7s ease' : undefined }} key={curRank.name + rankAnim}>
                    {curRank.icon}
                  </div>
                  <div className="serif" style={{ fontSize: 30, fontWeight: 800, color: curRank.color, marginBottom: 4 }}>{curRank.name}</div>
                  <div style={{ fontSize: 13, color: 'var(--muted)', fontFamily: 'Poppins,sans-serif' }}>{rankXp.toLocaleString()} XP total</div>
                </div>
                <div style={{ marginBottom: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)', fontFamily: 'Poppins,sans-serif', marginBottom: 8 }}>
                    <span>{curRank.name}</span>
                    <span>{nxtRank ? nxtRank.name : 'Max Rank!'}</span>
                  </div>
                  <div className="lp-rank-bar-wrap">
                    <div className="lp-rank-bar-fill" style={{ width: `${rankPct}%`, background: `linear-gradient(90deg,${curRank.color},${nxtRank?.color || curRank.color})` }} />
                  </div>
                  {nxtRank && (
                    <div style={{ textAlign: 'center', marginTop: 8, fontSize: 12, color: 'var(--muted)', fontFamily: 'Poppins,sans-serif' }}>
                      {(nxtRank.min - rankXp).toLocaleString()} XP to {nxtRank.name}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
                  {RANKS_DEF.map(r => (
                    <div key={r.name} style={{ textAlign: 'center', opacity: rankXp >= r.min ? 1 : 0.3, transition: 'opacity .35s' }}>
                      <div style={{ fontSize: 24 }}>{r.icon}</div>
                      <div style={{ fontSize: 9, color: r.color, fontWeight: 700, fontFamily: 'Poppins,sans-serif', marginTop: 4 }}>{r.name}</div>
                    </div>
                  ))}
                </div>
                <button onClick={addRankXp} disabled={rankXp >= 7500} style={{ ...btnGold, width: '100%', padding: '13px', fontSize: 15, opacity: rankXp >= 7500 ? .7 : 1 }}>
                  {rankXp >= 7500 ? '💎 Max Rank Achieved!' : 'Earn +250 XP →'}
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* ── Team Leaderboard ──────────────────────────────────────── */}
        <section className="lp-section-pad" style={{ background: theme === 'dark' ? 'rgba(255,255,255,.02)' : 'rgba(0,0,0,.02)', borderTop: '1px solid var(--b1)', borderBottom: '1px solid var(--b1)' }}>
          <div className="lp-max">
            <div className="lp-split">
              {/* Leaderboard widget */}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--b2)', borderRadius: 20, padding: 24 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', fontFamily: 'Poppins,sans-serif', marginBottom: 16 }}>
                  🏆 Team Leaderboard <span style={{ color: 'var(--muted)', fontWeight: 400 }}>— This Month</span>
                </div>
                {LB_AGENTS.map((a, i) => (
                  <div key={a.name} className="lp-lb-row" style={{ border: `1px solid ${i === 0 ? gold + '55' : 'var(--b2)'}`, background: i === 0 ? `${gold}08` : 'var(--surface)' }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: i === 0 ? gold : 'var(--muted)', width: 22, fontFamily: 'Poppins,sans-serif' }}>#{i + 1}</div>
                    <div style={{ fontSize: 20 }}>{a.rank}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', fontFamily: 'Poppins,sans-serif' }}>{a.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'Poppins,sans-serif' }}>{a.xp.toLocaleString()} XP this month</div>
                    </div>
                    <SmallRing pct={a.ring} color={i === 0 ? gold : '#8b5cf6'} />
                    <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'Poppins,sans-serif', minWidth: 28, textAlign: 'right' }}>{a.ring}%</div>
                  </div>
                ))}
                <div style={{ marginTop: 14, padding: '12px 14px', borderRadius: 12, background: `${gold}0a`, border: `1px solid ${gold}22`, fontSize: 12, color: 'var(--muted)', fontFamily: 'Poppins,sans-serif', lineHeight: 1.65 }}>
                  <strong style={{ color: gold }}>Team leader view</strong> — click any agent to open their full habit breakdown, pipeline, active listings, and coaching history.
                </div>
              </div>
              {/* Copy */}
              <div>
                <div className="lp-label" style={{ color: '#8b5cf6', marginBottom: 12 }}>Team Management</div>
                <h2 className="serif" style={{ fontSize: 'clamp(28px,4vw,50px)', fontWeight: 800, lineHeight: 1.1, letterSpacing: '-.025em', marginBottom: 18 }}>
                  Lead your team,<br />not chase them.
                </h2>
                <p style={{ fontSize: 15, color: 'var(--muted)', lineHeight: 1.75, marginBottom: 28, fontFamily: 'Poppins,sans-serif' }}>
                  See your entire roster at a glance — who's hitting their habits, who's behind, and who just closed a deal. Real accountability without the micromanagement.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {[
                    ['👥', 'Full roster with habit rings & XP streaks'],
                    ['📋', 'Accountability groups with sub-leaderboards'],
                    ['⚡', 'Daily standup feed from every agent'],
                    ['📝', 'Private per-agent coaching notes & replies'],
                    ['🏆', 'Team challenges with bonus XP rewards'],
                    ['🏠', 'Active listings board across the whole team'],
                  ].map(([icon, text]) => (
                    <div key={text} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, fontFamily: 'Poppins,sans-serif', color: 'var(--text)' }}>
                      <span>{icon}</span>{text}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Day In The Life Timeline ──────────────────────────────── */}
        <section className="lp-section-pad">
          <div className="lp-max">
            <div style={{ textAlign: 'center', marginBottom: 56 }}>
              <div className="lp-label" style={{ color: '#06b6d4', marginBottom: 12 }}>A Day In The Life</div>
              <h2 className="serif" style={{ fontSize: 'clamp(28px,4vw,50px)', fontWeight: 800, lineHeight: 1.1, letterSpacing: '-.025em', marginBottom: 16 }}>
                What grinding actually looks like.
              </h2>
              <p style={{ fontSize: 15, color: 'var(--muted)', fontFamily: 'Poppins,sans-serif', maxWidth: 500, margin: '0 auto' }}>
                From morning habits to a pending deal by 6pm — every action tracked, every XP earned, nothing slipping through the cracks.
              </p>
            </div>
            <div style={{ maxWidth: 680, margin: '0 auto' }}>
              {TIMELINE.map((item, i) => (
                <div key={i} className="lp-tl-item">
                  <div className="lp-tl-left">
                    <div className="lp-tl-dot" style={{ borderColor: item.color, background: `${item.color}12` }}>
                      <span style={{ fontSize: 20 }}>{item.icon}</span>
                    </div>
                    {i < TIMELINE.length - 1 && <div className="lp-tl-line" />}
                  </div>
                  <div className="lp-tl-content">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', fontFamily: 'Poppins,sans-serif' }}>{item.time}</span>
                      <span style={{ fontSize: 10, padding: '2px 9px', borderRadius: 20, fontWeight: 700, fontFamily: 'Poppins,sans-serif', background: `${item.color}18`, color: item.color }}>{item.tag}</span>
                      {item.xp && <span style={{ fontSize: 12, fontWeight: 700, color: gold, fontFamily: 'Poppins,sans-serif' }}>{item.xp}</span>}
                    </div>
                    <p style={{ fontSize: 14, color: 'var(--text)', fontFamily: 'Poppins,sans-serif', lineHeight: 1.65 }}>{item.action}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── All Features Grid ─────────────────────────────────────── */}
        <section className="lp-section-pad" style={{ background: theme === 'dark' ? 'rgba(255,255,255,.02)' : 'rgba(0,0,0,.02)', borderTop: '1px solid var(--b1)', borderBottom: '1px solid var(--b1)' }}>
          <div className="lp-max">
            <div style={{ textAlign: 'center', marginBottom: 48 }}>
              <div className="lp-label" style={{ color: gold, marginBottom: 12 }}>Everything Included</div>
              <h2 className="serif" style={{ fontSize: 'clamp(28px,4vw,50px)', fontWeight: 800, lineHeight: 1.1, letterSpacing: '-.025em' }}>
                One platform. Every tool.
              </h2>
            </div>
            <div className="lp-feat-grid">
              {FEATURES.map(f => (
                <div key={f.title} className="lp-feat-card">
                  <div style={{ fontSize: 30, marginBottom: 12 }}>{f.icon}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 8, fontFamily: 'Poppins,sans-serif' }}>{f.title}</div>
                  <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.75, fontFamily: 'Poppins,sans-serif' }}>{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Testimonials ─────────────────────────────────────────── */}
        <section className="lp-section-pad">
          <div className="lp-max">
            <div style={{ textAlign: 'center', marginBottom: 48 }}>
              <div className="lp-label" style={{ color: '#10b981', marginBottom: 12 }}>Agents Love It</div>
              <h2 className="serif" style={{ fontSize: 'clamp(28px,4vw,50px)', fontWeight: 800, lineHeight: 1.1, letterSpacing: '-.025em' }}>
                Real results. Real agents.
              </h2>
            </div>
            <div className="lp-test-grid">
              {TESTIMONIALS.map(t => (
                <div key={t.name} className="lp-testimonial">
                  <div style={{ fontSize: 36, marginBottom: 16 }}>{t.avatar}</div>
                  <blockquote style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.8, fontFamily: 'Poppins,sans-serif', marginBottom: 20, fontStyle: 'italic' }}>
                    "{t.quote}"
                  </blockquote>
                  <div style={{ display: 'inline-block', padding: '6px 12px', borderRadius: 10, background: `${gold}0e`, border: `1px solid ${gold}22`, fontSize: 11, fontWeight: 700, color: gold, fontFamily: 'Poppins,sans-serif', marginBottom: 16 }}>
                    📈 {t.stat}
                  </div>
                  <div style={{ marginTop: 4 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', fontFamily: 'Poppins,sans-serif' }}>{t.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'Poppins,sans-serif', marginTop: 2 }}>{t.title}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Comparison Table ──────────────────────────────────────── */}
        <section className="lp-section-pad" style={{ background: theme === 'dark' ? 'rgba(255,255,255,.02)' : 'rgba(0,0,0,.02)', borderTop: '1px solid var(--b1)', borderBottom: '1px solid var(--b1)' }}>
          <div className="lp-max">
            <div style={{ textAlign: 'center', marginBottom: 48 }}>
              <div className="lp-label" style={{ color: '#8b5cf6', marginBottom: 12 }}>Why RealtyGrind</div>
              <h2 className="serif" style={{ fontSize: 'clamp(28px,4vw,50px)', fontWeight: 800, lineHeight: 1.1, letterSpacing: '-.025em' }}>
                Built for agents.<br />Not generic software.
              </h2>
            </div>
            <div className="lp-compare-table">
              <div className="lp-compare-head">
                <div className="lp-compare-cell" style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>Feature</div>
                <div className="lp-compare-cell" style={{ justifyContent: 'center', fontWeight: 700, color: gold, fontSize: 13 }}>RealtyGrind</div>
                <div className="lp-compare-cell" style={{ justifyContent: 'center', fontWeight: 600, color: 'var(--muted)', fontSize: 12 }}>Spreadsheet</div>
                <div className="lp-compare-cell lp-compare-hide" style={{ justifyContent: 'center', fontWeight: 600, color: 'var(--muted)', fontSize: 12 }}>Generic CRM</div>
              </div>
              {COMPARE_ROWS.map(row => (
                <div key={row.feature} className="lp-compare-row">
                  <div className="lp-compare-cell" style={{ color: 'var(--text)', fontWeight: 500 }}>{row.feature}</div>
                  <div className="lp-compare-cell" style={{ justifyContent: 'center' }}><span style={{ fontSize: 16, color: '#10b981' }}>✓</span></div>
                  <div className="lp-compare-cell" style={{ justifyContent: 'center' }}>
                    {row.sheet === true ? <span style={{ fontSize: 16, color: '#10b981' }}>✓</span>
                      : row.sheet === '⚠️' ? <span style={{ fontSize: 16 }}>⚠️</span>
                        : <span style={{ fontSize: 16, color: '#ef4444' }}>✗</span>}
                  </div>
                  <div className="lp-compare-cell lp-compare-hide" style={{ justifyContent: 'center' }}>
                    {row.crm === true ? <span style={{ fontSize: 16, color: '#10b981' }}>✓</span>
                      : row.crm === '⚠️' ? <span style={{ fontSize: 16 }}>⚠️</span>
                        : <span style={{ fontSize: 16, color: '#ef4444' }}>✗</span>}
                  </div>
                </div>
              ))}
            </div>
            <p style={{ textAlign: 'center', marginTop: 14, fontSize: 12, color: 'var(--dim)', fontFamily: 'Poppins,sans-serif' }}>⚠️ = requires manual setup or workaround</p>
          </div>
        </section>

        {/* ── FAQ ──────────────────────────────────────────────────── */}
        <section className="lp-section-pad">
          <div className="lp-max" style={{ maxWidth: 720 }}>
            <div style={{ textAlign: 'center', marginBottom: 48 }}>
              <div className="lp-label" style={{ color: '#f97316', marginBottom: 12 }}>FAQ</div>
              <h2 className="serif" style={{ fontSize: 'clamp(28px,4vw,50px)', fontWeight: 800, lineHeight: 1.1, letterSpacing: '-.025em' }}>
                Common questions.
              </h2>
            </div>
            <div style={{ border: '1px solid var(--b2)', borderRadius: 16, overflow: 'hidden' }}>
              {FAQS.map((faq, i) => (
                <div key={i} className="lp-faq-item" style={{ padding: '0 24px', background: openFaq === i ? 'var(--surface)' : 'transparent', transition: 'background .2s' }}>
                  <button className="lp-faq-q" onClick={() => setOpenFaq(openFaq === i ? null : i)}>
                    <span>{faq.q}</span>
                    <span style={{ flexShrink: 0, fontSize: 20, color: 'var(--muted)', transition: 'transform .2s', transform: openFaq === i ? 'rotate(45deg)' : 'rotate(0deg)', display: 'inline-block' }}>+</span>
                  </button>
                  {openFaq === i && <div className="lp-faq-a">{faq.a}</div>}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Pricing ──────────────────────────────────────────────── */}
        <section className="lp-section-pad" style={{ background: theme === 'dark' ? 'rgba(255,255,255,.02)' : 'rgba(0,0,0,.02)', borderTop: '1px solid var(--b1)', borderBottom: '1px solid var(--b1)' }}>
          <div className="lp-max">
            <div style={{ textAlign: 'center', marginBottom: 48 }}>
              <div className="lp-label" style={{ color: gold, marginBottom: 12 }}>Simple Pricing</div>
              <h2 className="serif" style={{ fontSize: 'clamp(28px,4vw,50px)', fontWeight: 800, lineHeight: 1.1, letterSpacing: '-.025em', marginBottom: 28 }}>
                Start free. Scale when you're ready.
              </h2>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 14, background: 'var(--surface)', padding: '8px 16px', borderRadius: 40, border: '1px solid var(--b2)' }}>
                <span style={{ fontSize: 13, fontWeight: annual ? 400 : 600, color: annual ? 'var(--muted)' : 'var(--text)', fontFamily: 'Poppins,sans-serif' }}>Monthly</span>
                <button onClick={() => setAnnual(a => !a)} style={{ width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', position: 'relative', background: annual ? gold : 'var(--b2)', transition: 'background .2s' }}>
                  <div style={{ position: 'absolute', width: 18, height: 18, borderRadius: '50%', background: '#fff', top: 3, transition: 'left .2s cubic-bezier(.4,2,.55,1)', left: annual ? 23 : 4, boxShadow: '0 1px 4px rgba(0,0,0,.25)' }} />
                </button>
                <span style={{ fontSize: 13, fontWeight: annual ? 600 : 400, color: annual ? 'var(--text)' : 'var(--muted)', display: 'flex', alignItems: 'center', gap: 7, fontFamily: 'Poppins,sans-serif' }}>
                  Annual
                  <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 20, fontWeight: 700, background: 'rgba(16,185,129,.12)', color: 'var(--green)', border: '1px solid rgba(16,185,129,.22)' }}>Save up to 20%</span>
                </span>
              </div>
            </div>
            <div className="lp-pricing-grid">
              {PLANS.map(plan => {
                const price = annual ? plan.priceAnn : plan.price
                const isPop = plan.badge === 'Most Popular'
                return (
                  <div key={plan.name} className="card lp-price-card" style={{ padding: 26, position: 'relative', border: isPop ? `2px solid ${plan.color}` : '1px solid var(--b2)', background: isPop ? `${plan.color}07` : 'var(--surface)' }}>
                    {plan.badge && (
                      <div style={{ position: 'absolute', top: -13, left: '50%', transform: 'translateX(-50%)', background: plan.color, color: '#fff', fontSize: 10, fontWeight: 700, padding: '3px 14px', borderRadius: 20, whiteSpace: 'nowrap', fontFamily: 'Poppins,sans-serif', letterSpacing: .5 }}>
                        {plan.badge}
                      </div>
                    )}
                    <div className="serif" style={{ fontSize: 21, fontWeight: 800, color: 'var(--text)', marginBottom: 4 }}>{plan.name}</div>
                    <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 18, fontFamily: 'Poppins,sans-serif', lineHeight: 1.5 }}>{plan.desc}</p>
                    <div style={{ marginBottom: 22 }}>
                      <span className="serif" style={{ fontSize: 42, fontWeight: 800, color: plan.color, lineHeight: 1 }}>${price}</span>
                      <span style={{ fontSize: 13, color: 'var(--muted)', fontFamily: 'Poppins,sans-serif' }}>/mo{annual ? ' · billed annually' : ''}</span>
                    </div>
                    <button onClick={onGetStarted} style={{ width: '100%', padding: '12px 0', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer', marginBottom: 20, transition: 'all .18s', fontFamily: 'Poppins,sans-serif', background: isPop ? plan.color : 'transparent', color: isPop ? '#fff' : plan.color, border: isPop ? 'none' : `2px solid ${plan.color}`, boxShadow: isPop ? `0 6px 22px ${plan.color}44` : 'none' }}>
                      {plan.cta}
                    </button>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                      {plan.features.map(f => (
                        <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text)', fontFamily: 'Poppins,sans-serif' }}>
                          <div style={{ width: 15, height: 15, borderRadius: '50%', flexShrink: 0, background: `${plan.color}18`, border: `1px solid ${plan.color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 7, color: plan.color, fontWeight: 700 }}>✓</div>
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

        {/* ── Final CTA ────────────────────────────────────────────── */}
        <section style={{ padding: '104px 24px', textAlign: 'center', background: theme === 'dark' ? `radial-gradient(ellipse at 50% 0%,rgba(217,119,6,.16) 0%,transparent 60%),var(--bg)` : `radial-gradient(ellipse at 50% 0%,rgba(180,83,9,.09) 0%,transparent 60%),var(--bg)` }}>
          <div style={{ maxWidth: 600, margin: '0 auto' }}>
            <div style={{ fontSize: 52, marginBottom: 18 }}>🏡</div>
            <h2 className="serif" style={{ fontSize: 'clamp(30px,5vw,56px)', color: 'var(--text)', fontWeight: 800, letterSpacing: '-.025em', marginBottom: 18, lineHeight: 1.08 }}>
              Stop winging it.<br />
              <span style={{ color: gold }}>Start grinding.</span>
            </h2>
            <p style={{ fontSize: 16, color: 'var(--muted)', lineHeight: 1.75, marginBottom: 38, fontFamily: 'Poppins,sans-serif' }}>
              Join agents who track every habit, every deal, and every coaching note in one place — and actually hit their production goals.
            </p>
            <button onClick={onGetStarted} style={{ ...btnGold, fontSize: 17, padding: '17px 44px' }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 14px 44px ${gold}66` }}
              onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = `0 4px 18px ${gold}44` }}>
              Start Free Trial →
            </button>
            <div style={{ marginTop: 18, fontSize: 12, color: 'var(--dim)', fontFamily: 'Poppins,sans-serif' }}>
              Solo from $9/mo · Team plans from $99/mo · Cancel anytime
            </div>
          </div>
        </section>

        {/* ── Footer ───────────────────────────────────────────────── */}
        <footer style={{ padding: '40px 24px', borderTop: '1px solid var(--b1)', background: 'var(--surface)' }}>
          <div className="lp-max" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 18 }}>🏡</span>
              <span className="serif" style={{ fontSize: 16, fontWeight: 800 }}>RealtyGrind</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'Poppins,sans-serif' }}>
              © {new Date().getFullYear()} RealtyGrind. Built for agents who refuse to wing it.
            </div>
            <button onClick={onGetStarted} style={{ fontSize: 13, color: gold, fontFamily: 'Poppins,sans-serif', fontWeight: 600, background: 'transparent', border: 'none', cursor: 'pointer' }}>
              Get Started →
            </button>
          </div>
        </footer>

      </div>
    </>
  )
}
