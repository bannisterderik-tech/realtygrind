import { useState, useEffect, useRef, useMemo } from 'react'
import { ThemeToggle } from '../design'

// ── Constants ──────────────────────────────────────────────────────────────
const RANKS_DEF = [
  { name:'Bronze',   min:0,    color:'#cd7f32', icon:'🥉' },
  { name:'Silver',   min:500,  color:'#9ca3af', icon:'🥈' },
  { name:'Gold',     min:1500, color:'#d97706', icon:'🥇' },
  { name:'Platinum', min:3500, color:'#0ea5e9', icon:'💠' },
  { name:'Diamond',  min:7000, color:'#8b5cf6', icon:'💎' },
]

const DEMO_HABITS = [
  { id:1, label:'Prospecting',   icon:'📞', xp:25, color:'#0ea5e9' },
  { id:2, label:'Appointments',  icon:'🤝', xp:30, color:'#10b981' },
  { id:3, label:'Showings',      icon:'🏠', xp:20, color:'#8b5cf6' },
  { id:4, label:'New Listing',   icon:'📋', xp:40, color:'#f97316' },
  { id:5, label:'Market Study',  icon:'📊', xp:15, color:'#f43f5e' },
  { id:6, label:'Follow-ups',    icon:'✉️', xp:20, color:'#06b6d4' },
]

const PIPE_STAGES  = ['Offers Made', 'Offers Received', 'Pending', 'Closed']
const PIPE_COLORS  = ['#0ea5e9', '#8b5cf6', '#f97316', '#10b981']
const SAMPLE_ADDRS = ['7 Oak Lane', '512 Birch Dr', '88 River Rd', '214 Elm St', '301 Cedar Blvd', '99 Willow Way']
const SAMPLE_COMMS = ['$6,200', '$9,800', '$14,500', '$7,300', '$11,100', '$8,750']

const PLANS = [
  { name:'Solo',      price:9,   priceAnn:7,   badge:null,           color:'#94a3b8',
    desc:'For individual agents getting dialed in.',
    features:['Habit tracker & XP system','Skip & restore habits','Print daily checklist PDF','Pipeline & closing tracker','Personal rank & streak','Annual production report'],
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
  { q:'Can I skip a habit without breaking my streak?',
    a:"Yes — hit the ✕ on any habit to X it out for the day. Your streak stays completely intact. Restore it anytime and it goes back to your active list. Perfect for rest days, travel days, or habits that simply don't apply." },
  { q:'Can I print my daily checklist?',
    a:"Yes! Every day you can print or download your daily habit sheet as a PDF. It includes a notes column for each habit, your pipeline snapshot, and a signature line. Great for field work, car time, or agents who like keeping a physical paper trail." },
  { q:'How does the team plan work?',
    a:'One team leader creates the team and invites agents via email. Everyone gets their own dashboard, and the leader sees the full roster, accountability groups, coaching notes, team challenges, and daily standups.' },
  { q:'What are Team Challenges?',
    a:'Team leaders create time-limited challenges (e.g. "30-Day Prospecting Blitz") with custom goals, XP bonuses, and achievement badges. Every agent tracks their progress live. It turns accountability into friendly competition.' },
  { q:'How does coaching work?',
    a:'Leaders leave private coaching notes per agent with a note type (Action Required, Positive, Check-In, or Goal). Agents reply directly in-thread. Leaders can pin critical notes and see read receipts — all inside RealtyGrind.' },
  { q:'Can I add my own daily tasks?',
    a:"Yes. Create custom daily tasks with your own labels, icons, and XP values. You can also rename built-in habits, adjust XP weights, and hide or restore any habit at any time." },
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
  { icon:'📞', title:'Habit Tracker',         color:'#0ea5e9',
    desc:'11 core real estate habits built in. Check them off daily, earn XP, and extend your streak — every single day.' },
  { icon:'✕', title:'Skip & Restore Habits',  color:'#f43f5e',
    desc:"X out any habit for the day without breaking your streak. Restore it instantly whenever you're ready. No penalty, no lost progress." },
  { icon:'🖨️', title:'Print Daily Checklist', color:'#06b6d4',
    desc:'Print or save your daily habit sheet as a PDF. Notes column, pipeline snapshot, and signature line included — perfect for on-the-go tracking.' },
  { icon:'💰', title:'Pipeline Tracker',       color:'#10b981',
    desc:'Log offers, pending deals, and closings. Commission counter ticks up in real time. Never lose track of a deal again.' },
  { icon:'🏆', title:'XP & Rank System',       color:'#d97706',
    desc:'Bronze → Silver → Gold → Platinum → Diamond. Every habit and every deal earns XP. Gamified accountability that makes discipline addictive.' },
  { icon:'🎯', title:'Team Challenges',        color:'#f97316',
    desc:'Leaders create time-limited challenges with XP bonuses and custom badges. Teams compete live. Accountability turns into healthy competition.' },
  { icon:'📋', title:'Coaching Notes',         color:'#8b5cf6',
    desc:'Private per-agent coaching notes with type tags (Action Required, Positive, Check-In). Agents reply in-thread. Leaders pin critical feedback.' },
  { icon:'⚡', title:'Daily Standups',         color:'#84cc16',
    desc:"Agents submit a 3-question daily standup. Leaders see the live feed, reply inline, and spot patterns across the whole team." },
]

const TIMELINE = [
  { time:'7:00 AM',  icon:'🌅', action:'Open RealtyGrind. Log morning market study.',             xp:'+15 XP', tag:'Habit',    color:'#0ea5e9' },
  { time:'8:30 AM',  icon:'📞', action:'3 prospecting calls logged. Streak extends to 14 days.',   xp:'+75 XP', tag:'Habit',    color:'#10b981' },
  { time:'10:00 AM', icon:'🤝', action:'Buyer appointment completed and logged.',                  xp:'+30 XP', tag:'Habit',    color:'#8b5cf6' },
  { time:'11:30 AM', icon:'✕',  action:'Market Study X\'d out for today — client presentation running long. Streak safe.', xp:'',tag:'Skip',  color:'#f43f5e' },
  { time:'1:00 PM',  icon:'📝', action:'Offer submitted on 4235 Oak St. Added to pipeline.',       xp:'+75 XP', tag:'Pipeline', color:'#f97316' },
  { time:'3:30 PM',  icon:'🏠', action:'New listing signed at 812 River Rd. Team board updates.',  xp:'+40 XP', tag:'Listing',  color:'#d97706' },
  { time:'4:45 PM',  icon:'💬', action:'Coach leaves note: "Strong close today — keep momentum." You reply in-thread.', xp:'', tag:'Coach', color:'#8b5cf6' },
  { time:'5:00 PM',  icon:'⚡', action:'Daily standup submitted. Team leader sees the update.',    xp:'',       tag:'Team',    color:'#06b6d4' },
  { time:'6:15 PM',  icon:'🎉', action:'4235 Oak St goes pending. Commission counter ticks up.',   xp:'+150 XP',tag:'Pipeline', color:'#f43f5e' },
  { time:'9:00 PM',  icon:'💎', action:'Day complete. 385 XP earned. #2 on team leaderboard.',     xp:'',       tag:'XP',      color:'#8b5cf6' },
]

const TICKER_ITEMS = [
  '🎯 Daily Habit Tracker','✕ Skip & Restore Habits','🖨️ Print Daily Checklist',
  '🏆 XP Leaderboards','👥 Team Roster','📊 Pipeline Tracker',
  '🏠 Active Listings Board','📋 Coaching Notes','⚡ Daily Standups',
  '🔥 Streak Tracking','💎 Diamond Rank','📈 Annual GCI Report',
  '🎯 Team Challenges','📱 Mobile Friendly','📅 Week Planner',
  '🔔 Accountability Groups',
]

const COMPARE_ROWS = [
  { feature:'Daily habit tracking',              rg:true,  sheet:false,  crm:false },
  { feature:'Skip habit without streak loss',    rg:true,  sheet:false,  crm:false },
  { feature:'Print daily checklist PDF',         rg:true,  sheet:'⚠️',  crm:false },
  { feature:'XP & rank gamification',            rg:true,  sheet:false,  crm:false },
  { feature:'Pipeline tracker',                  rg:true,  sheet:'⚠️',  crm:true  },
  { feature:'Team leaderboard',                  rg:true,  sheet:false,  crm:false },
  { feature:'Team challenges + XP bonuses',      rg:true,  sheet:false,  crm:false },
  { feature:'Coaching notes per agent',          rg:true,  sheet:false,  crm:'⚠️'  },
  { feature:'Daily standup feed',                rg:true,  sheet:false,  crm:false },
  { feature:'Accountability groups',             rg:true,  sheet:false,  crm:false },
  { feature:'Active listings board',             rg:true,  sheet:'⚠️',  crm:false },
  { feature:'Annual GCI report',                 rg:true,  sheet:'⚠️',  crm:'⚠️'  },
  { feature:'Real estate specific',              rg:true,  sheet:false,  crm:false },
]

const LB_AGENTS = [
  { name:'Alex M.',   xp:3240, ring:88, rank:'🥇' },
  { name:'Jordan L.', xp:2980, ring:72, rank:'🥇' },
  { name:'Taylor S.', xp:2650, ring:65, rank:'🥈' },
  { name:'Morgan R.', xp:2310, ring:58, rank:'🥈' },
  { name:'Casey P.',  xp:1890, ring:44, rank:'🥈' },
]

const CHALLENGES_DATA = [
  { id:1, emoji:'📞', name:'30-Day Prospecting Blitz',
    desc:'Log 5+ prospecting contacts every single day for 30 days straight.',
    goal:30, xpReward:500, badge:'Prospecting Pro 🏅', agents:8, color:'#0ea5e9' },
  { id:2, emoji:'🏠', name:'Listing Launch Week',
    desc:'Land 2 new listings as a team within 7 days.',
    goal:7,  xpReward:750, badge:'Listing Machine 🔑', agents:12, color:'#10b981' },
]

const COACHING_THREAD = [
  { from:'coach', name:'Coach Mike', avatar:'👨‍💼',
    type:'Action Required', typeColor:'#ef4444',
    msg:"You've skipped afternoon follow-ups 4 out of 5 days this week. That's where your conversion is leaking — let's get this dialed in before it becomes a pattern.",
    time:'2 hours ago' },
  { from:'agent', name:'You', avatar:'👩',
    type:null,
    msg:"On it! I just blocked 4–5pm on my calendar starting Monday. Will log every follow-up contact in the pipeline.",
    time:'1 hour ago' },
  { from:'coach', name:'Coach Mike', avatar:'👨‍💼',
    type:'Positive', typeColor:'#10b981',
    msg:"Love the self-awareness. I pinned this thread. Let's review your follow-up numbers together Friday morning.",
    time:'45 min ago' },
]

// ── CSS ───────────────────────────────────────────────────────────────────────
const LCSS = `
.serif{font-family:'Playfair Display',serif;}

/* Nav */
.lp-nav{position:fixed;top:0;left:0;right:0;z-index:100;border-bottom:1px solid var(--b1);padding:0 32px;height:64px;display:flex;align-items:center;justify-content:space-between;}
.lp-nav-link{font-size:13px;font-weight:500;color:var(--muted);cursor:pointer;font-family:Poppins,sans-serif;transition:color .15s;}
.lp-nav-link:hover{color:var(--text);}

/* Hero buttons — pure CSS hover instead of JS handlers */
.lp-hero-gold-btn{background:var(--gold);color:#fff;border:none;border-radius:10px;font-family:Poppins,sans-serif;font-weight:700;cursor:pointer;transition:transform .2s,box-shadow .2s;box-shadow:0 4px 18px rgba(180,83,9,.27);font-size:16px;padding:14px 32px;}
.lp-hero-gold-btn:hover{transform:translateY(-2px);box-shadow:0 10px 36px rgba(180,83,9,.4);}
.lp-cta-btn{font-size:17px;padding:17px 44px;}
.lp-hero-outline-btn{background:transparent;border:1.5px solid var(--b3);color:var(--text);border-radius:10px;padding:14px 28px;font-size:15px;font-weight:600;cursor:pointer;font-family:Poppins,sans-serif;transition:border-color .2s;}
.lp-hero-outline-btn:hover{border-color:var(--text);}

/* Hamburger */
.lp-hamburger{display:none;flex-direction:column;gap:5px;cursor:pointer;padding:6px;border:none;background:transparent;z-index:101;}
.lp-hamburger span{display:block;width:22px;height:2px;background:var(--text);border-radius:2px;transition:transform .25s;}
.lp-mobile-menu{position:fixed;inset:0;z-index:200;display:flex;flex-direction:column;padding:28px 24px;overflow-y:auto;}
.lp-mobile-link{font-size:24px;font-weight:800;color:var(--text);font-family:'Playfair Display',serif;padding:20px 0;border-bottom:1px solid var(--b2);cursor:pointer;transition:color .15s;}
.lp-mobile-link:hover{color:var(--gold);}

/* Layout */
.lp-max{max-width:1100px;margin:0 auto;}
.lp-section-pad{padding:96px 24px;}
.lp-label{font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;font-family:Poppins,sans-serif;}
.lp-split{display:grid;grid-template-columns:1fr 1fr;gap:64px;align-items:center;}

/* Animations */
@keyframes heroFade{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
@keyframes ticker{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
@keyframes ringFill{from{stroke-dasharray:0 999}}
@keyframes fadeSlideIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@keyframes slideInRight{from{opacity:0;transform:translateX(32px)}to{opacity:1;transform:none}}
@keyframes xpFloat{0%{opacity:1;transform:translateY(0)}100%{opacity:0;transform:translateY(-36px)}}
@keyframes rankLevelUp{0%{transform:scale(1)}40%{transform:scale(1.3)}100%{transform:scale(1)}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.6}}
@keyframes challengePop{0%{transform:scale(1)}50%{transform:scale(1.03)}100%{transform:scale(1)}}

.lp-hero-text{animation:heroFade .6s ease forwards;}
.lp-hero-sub{animation:heroFade .6s .1s ease forwards;}
.lp-hero-ctas{animation:heroFade .6s .18s ease forwards;}
.lp-mockup{animation:slideInRight .6s .22s ease forwards;}

/* Ticker */
.lp-ticker-wrap{overflow:hidden;padding:14px 0;border-top:1px solid var(--b1);border-bottom:1px solid var(--b1);contain:content;}
.lp-ticker-track{display:flex;gap:44px;animation:ticker 42s linear infinite;white-space:nowrap;will-change:transform;}

/* Stats */
.lp-stats-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:24px;}
.lp-stat-num{font-size:clamp(36px,5vw,60px);font-weight:800;line-height:1;}

/* Habit demo */
.lp-habit-row{display:flex;align-items:center;gap:12px;padding:11px 14px;border-radius:12px;cursor:pointer;transition:background .15s,border-color .15s;border:1.5px solid transparent;margin-bottom:6px;user-select:none;}
.lp-habit-row:hover{background:var(--surface);border-color:var(--b2);}
.lp-habit-row.done{background:var(--surface);border-color:var(--b2);}
.lp-habit-row.skipped{opacity:.45;cursor:default;border-color:transparent;}
.lp-xp-pop{position:absolute;font-size:13px;font-weight:700;font-family:Poppins,sans-serif;pointer-events:none;animation:xpFloat .95s ease-out forwards;right:28px;}
.lp-skip-btn{padding:3px 9px;border-radius:20px;border:1px solid var(--b2);background:transparent;cursor:pointer;font-size:10px;font-weight:700;color:var(--muted);font-family:Poppins,sans-serif;transition:border-color .15s,color .15s;white-space:nowrap;flex-shrink:0;}
.lp-skip-btn:hover{border-color:#ef4444;color:#ef4444;}
.lp-restore-btn{padding:3px 9px;border-radius:20px;border:1px solid #ef444466;background:transparent;cursor:pointer;font-size:10px;font-weight:700;color:#ef4444;font-family:Poppins,sans-serif;transition:background .15s;white-space:nowrap;flex-shrink:0;}
.lp-restore-btn:hover{background:#ef44440f;}

/* Print mockup */
.lp-print-paper{background:#fff;border-radius:12px;box-shadow:0 12px 48px rgba(0,0,0,.18);padding:28px 22px;font-family:'Courier New',monospace;transform:rotate(-0.8deg);max-width:320px;color:#111;}
.lp-print-row{display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid #e5e7eb;}
.lp-print-box{width:15px;height:15px;border:1.5px solid #374151;border-radius:2px;flex-shrink:0;}
.lp-print-dots{flex:1;height:1px;border-bottom:1.5px dotted #d1d5db;margin-left:6px;}

/* Pipeline demo */
.lp-pipe-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;}
.lp-pipe-col{background:var(--surface);border:1px solid var(--b2);border-radius:14px;padding:14px;min-height:150px;}
.lp-pipe-deal{background:var(--bg);border:1px solid var(--b2);border-radius:8px;padding:8px 10px;margin-top:8px;font-size:12px;font-family:Poppins,sans-serif;animation:fadeSlideIn .25s ease;}
.lp-pipe-add{width:100%;margin-top:10px;padding:8px;border-radius:8px;border:1.5px dashed var(--b3);background:transparent;cursor:pointer;font-size:12px;color:var(--muted);font-family:Poppins,sans-serif;transition:border-color .15s,color .15s;}
.lp-pipe-add:hover{border-color:var(--gold);color:var(--gold);}

/* Rank demo */
.lp-rank-bar-wrap{background:var(--b1);border-radius:8px;height:12px;overflow:hidden;}
.lp-rank-bar-fill{height:100%;border-radius:8px;transition:width .55s cubic-bezier(.4,0,.2,1);}

/* Leaderboard */
.lp-lb-row{display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:12px;background:var(--surface);border:1px solid var(--b2);margin-bottom:8px;}

/* Challenge card */
.lp-challenge-card{background:var(--surface);border:2px solid var(--b2);border-radius:20px;padding:28px;position:relative;overflow:hidden;}
.lp-challenge-tabs{display:flex;gap:8px;margin-bottom:24px;}
.lp-challenge-tab{padding:7px 16px;border-radius:20px;border:1.5px solid var(--b2);background:transparent;cursor:pointer;font-size:12px;font-weight:600;font-family:Poppins,sans-serif;color:var(--muted);transition:background .15s,color .15s,border-color .15s;}
.lp-challenge-tab.active{color:#fff;border-color:transparent;}

/* Coaching thread */
.lp-coaching-thread{display:flex;flex-direction:column;gap:12px;}
.lp-coaching-bubble{display:flex;gap:12px;align-items:flex-start;}
.lp-coaching-msg{background:var(--surface);border:1px solid var(--b2);border-radius:14px;padding:14px 16px;flex:1;transition:border-color .2s;}
.lp-coaching-msg:hover{border-color:var(--b3);}
.lp-note-type-badge{display:inline-flex;align-items:center;gap:5px;font-size:9px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;padding:3px 8px;border-radius:20px;font-family:Poppins,sans-serif;margin-bottom:7px;}

/* Feature grid */
.lp-feat-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:18px;}
.lp-feat-card{background:var(--surface);border:1px solid var(--b2);border-radius:16px;padding:22px;transition:border-color .2s;}

/* Timeline */
.lp-tl-item{display:flex;gap:20px;}
.lp-tl-left{display:flex;flex-direction:column;align-items:center;width:44px;flex-shrink:0;}
.lp-tl-dot{width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;border:2px solid var(--b2);background:var(--surface);}
.lp-tl-line{width:2px;background:var(--b2);flex:1;min-height:28px;margin:4px 0;}
.lp-tl-content{padding-bottom:28px;flex:1;}

/* Testimonials */
.lp-test-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;}
.lp-testimonial{background:var(--surface);border:1px solid var(--b2);border-radius:20px;padding:28px 24px;}

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
.lp-price-card{}

/* Hero grid */
.lp-hero-grid{display:grid;grid-template-columns:1fr 1fr;gap:60px;align-items:center;}

/* Responsive ─────────────────────────────────── */
@media(max-width:1050px){
  .lp-feat-grid{grid-template-columns:repeat(2,1fr);}
}
@media(max-width:900px){
  .lp-hero-grid{grid-template-columns:1fr;}
  .lp-split{grid-template-columns:1fr;gap:32px;}
  .lp-stats-grid{grid-template-columns:repeat(2,1fr);}
  .lp-pipe-grid{grid-template-columns:repeat(2,1fr);}
  .lp-test-grid{grid-template-columns:1fr;}
  .lp-compare-head{grid-template-columns:2fr 1fr 1fr;}
  .lp-compare-row{grid-template-columns:2fr 1fr 1fr;}
  .lp-compare-hide{display:none;}
  .lp-pricing-grid{grid-template-columns:1fr;}
  .lp-nav-links{display:none !important;}
  .lp-nav-ctas{display:none !important;}
  .lp-hamburger{display:flex !important;}
  .lp-print-paper{transform:none;max-width:100%;}
  .lp-section-pad{padding:72px 24px;}
  /* Coaching: show label/copy first on mobile */
  .lp-coaching-demo{order:2;}
  .lp-coaching-text{order:1;}
  /* Leaderboard: keep card above text on mobile (already first child, fine) */
  .lp-lb-row{flex-wrap:nowrap;}
  .lp-lb-row>div:nth-child(3){min-width:0;flex:1;}
}
@media(max-width:640px){
  .lp-section-pad{padding:56px 16px;}
  .lp-feat-grid{grid-template-columns:repeat(2,1fr);}
  .lp-stats-grid{grid-template-columns:1fr 1fr;}
  .lp-pipe-grid{grid-template-columns:1fr 1fr;}
  .lp-nav{padding:0 16px;}
  .lp-challenge-tabs{flex-wrap:wrap;}
}
@media(max-width:480px){
  .lp-pipe-grid{grid-template-columns:1fr;}
  .lp-feat-grid{grid-template-columns:1fr;}
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
export default function LandingPage({ theme, onToggleTheme, onGetStarted, onSubscribe }) {
  const gold   = theme === 'dark' ? '#d97706' : '#b45309'
  const goldBg = theme === 'dark' ? 'rgba(217,119,6,.12)' : 'rgba(180,83,9,.08)'

  // Nav
  const [menuOpen, setMenuOpen] = useState(false)

  // Habit demo
  const [checkedHabits, setCheckedHabits] = useState(new Set([0, 1, 3]))
  const [skippedHabits, setSkippedHabits] = useState(new Set([4]))
  const [xpPops,        setXpPops]        = useState([])
  const [demoXp,        setDemoXp]        = useState(DEMO_HABITS.filter((_,i)=>[0,1,3].includes(i)).reduce((a,h)=>a+h.xp, 0))

  // Pipeline demo
  const [pipeDeals, setPipeDeals] = useState({
    0: [{ id:1, addr:'142 Maple St', comm:'$8,400' }],
    1: [{ id:2, addr:'309 Pine Ave', comm:'$12,000' }],
    2: [], 3: [],
  })
  // nextDealId removed — deal IDs now derived from total count inside functional updater
  const [commTotal,  setCommTotal]  = useState(0)

  // Rank demo
  const [rankXp,   setRankXp]   = useState(1200)
  const [rankAnim, setRankAnim] = useState(false)

  // Challenges
  const [activeChal,     setActiveChal]     = useState(0)
  const [chalProgress,   setChalProgress]   = useState([2, 5])
  const [chalAnimating,  setChalAnimating]  = useState(false)

  // FAQ
  const [openFaq, setOpenFaq] = useState(null)

  // Pricing
  const [annual, setAnnual] = useState(false)

  // Lock body scroll when mobile menu open
  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [menuOpen])

  const btnGold = {
    background: gold, color: '#fff', border: 'none', borderRadius: 10,
    fontFamily: 'Poppins,sans-serif', fontWeight: 700, cursor: 'pointer',
    transition: 'all .2s', boxShadow: `0 4px 18px ${gold}44`,
  }

  function scrollTo(id) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setMenuOpen(false)
  }

  // ── Habit demo logic ───────────────────────────────────────────────────
  function toggleHabitDemo(idx) {
    if (skippedHabits.has(idx)) return // can't check a skipped habit
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

  function skipHabit(idx, e) {
    e.stopPropagation()
    const h = DEMO_HABITS[idx]
    if (checkedHabits.has(idx)) {
      setCheckedHabits(s => { const n = new Set(s); n.delete(idx); return n })
      setDemoXp(p => Math.max(0, p - h.xp))
    }
    setSkippedHabits(s => { const n = new Set(s); n.add(idx); return n })
  }

  function restoreHabit(idx, e) {
    e.stopPropagation()
    setSkippedHabits(s => { const n = new Set(s); n.delete(idx); return n })
  }

  // ── Pipeline demo logic ────────────────────────────────────────────────
  function addDeal(colIdx) {
    // Cap check is INSIDE the functional updater so it works correctly even
    // when clicks fire faster than React re-renders (stale-closure safe)
    setPipeDeals(prev => {
      const total = Object.values(prev).reduce((s, a) => s + a.length, 0)
      if (total >= 16) return prev  // hard cap at 16 deals
      const addr = SAMPLE_ADDRS[total % SAMPLE_ADDRS.length]
      const comm = SAMPLE_COMMS[total % SAMPLE_COMMS.length]
      if (colIdx === 3) setCommTotal(p => p + parseFloat(comm.replace(/[^0-9.]/g, '')))
      return { ...prev, [colIdx]: [...prev[colIdx], { id: total + 1, addr, comm }] }
    })
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

  // ── Challenge demo logic ───────────────────────────────────────────────
  function logChallengeDay() {
    if (chalAnimating) return
    const c = CHALLENGES_DATA[activeChal]
    if (chalProgress[activeChal] >= c.goal) return
    setChalAnimating(true)
    setChalProgress(p => { const n=[...p]; n[activeChal]=Math.min(n[activeChal]+1, c.goal); return n })
    setTimeout(() => setChalAnimating(false), 600)
  }

  const curRank = getCurrentRank(rankXp)
  const nxtRank = getNextRank(rankXp)
  const rankPct = getRankPct(rankXp)
  const chal    = CHALLENGES_DATA[activeChal]
  const chalProg = chalProgress[activeChal]
  const chalPct  = Math.round(chalProg / chal.goal * 100)

  const activeHabits  = DEMO_HABITS.filter((_,i) => !skippedHabits.has(i))
  const checkedActive = activeHabits.filter((_,i) => checkedHabits.has(DEMO_HABITS.indexOf(_))).length

  // Inject LCSS once into <head> instead of re-rendering it as JSX every frame
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

  return (
    <>
      <div data-theme={theme} style={{ background: 'var(--bg)', color: 'var(--text)', minHeight: '100vh' }}>

        {/* ── Mobile Menu Overlay ────────────────────────────────────── */}
        {menuOpen && (
          <div className="lp-mobile-menu" data-theme={theme}
            style={{ background: theme === 'dark' ? 'rgba(10,10,10,.97)' : 'rgba(255,255,255,.97)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 40 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 24 }}>🏡</span>
                <span className="serif" style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>RealtyGrind</span>
              </div>
              <button onClick={() => setMenuOpen(false)} style={{ fontSize: 28, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', lineHeight: 1 }}>✕</button>
            </div>
            {['Features', 'Pricing', 'FAQ'].map(l => (
              <div key={l} className="lp-mobile-link" onClick={() => scrollTo(l.toLowerCase())}>{l}</div>
            ))}
            <div style={{ marginTop: 40, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 13, color: 'var(--muted)', fontFamily: 'Poppins,sans-serif' }}>Theme</span>
                <ThemeToggle theme={theme} onToggle={onToggleTheme} />
              </div>
              <button onClick={() => { onGetStarted(); setMenuOpen(false) }} style={{ padding: '14px', borderRadius: 12, border: '1.5px solid var(--b3)', background: 'transparent', color: 'var(--text)', fontSize: 16, fontWeight: 600, cursor: 'pointer', fontFamily: 'Poppins,sans-serif' }}>
                Sign In
              </button>
              <button onClick={() => { onGetStarted(); setMenuOpen(false) }} style={{ ...btnGold, padding: '14px', fontSize: 16, borderRadius: 12 }}>
                Start Free →
              </button>
            </div>
          </div>
        )}

        {/* ── Nav ──────────────────────────────────────────────────── */}
        <nav className="lp-nav" style={{ background: theme === 'dark' ? '#0c0b09' : '#f5f3ee' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 22 }}>🏡</span>
            <span className="serif" style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)' }}>RealtyGrind</span>
          </div>
          <div className="lp-nav-links" style={{ display: 'flex', gap: 28 }}>
            {['Features', 'Pricing', 'FAQ'].map(l => (
              <span key={l} className="lp-nav-link" onClick={() => scrollTo(l.toLowerCase())}>{l}</span>
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
          {/* Hamburger — mobile only */}
          <button className="lp-hamburger" onClick={() => setMenuOpen(true)} aria-label="Open menu">
            <span /><span /><span />
          </button>
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
                  <button className="lp-hero-gold-btn" onClick={onGetStarted}>
                    Start for Free →
                  </button>
                  <button className="lp-hero-outline-btn" onClick={onGetStarted}>
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
              <div>
                <div className="lp-label" style={{ color: '#0ea5e9', marginBottom: 12 }}>Daily Habit Tracker</div>
                <h2 className="serif" style={{ fontSize: 'clamp(28px,4vw,50px)', fontWeight: 800, lineHeight: 1.1, letterSpacing: '-.025em', marginBottom: 18 }}>
                  Your entire day,<br />organized.
                </h2>
                <p style={{ fontSize: 15, color: 'var(--muted)', lineHeight: 1.75, marginBottom: 28, fontFamily: 'Poppins,sans-serif' }}>
                  Track the 11 core real estate habits every single day. Check off what you did, X out what doesn't apply, and restore anything anytime. Your streak stays intact no matter what.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {[
                    ['✓', '11 built-in real estate habits', '#0ea5e9'],
                    ['✕', 'X out any habit — streak stays safe', '#f43f5e'],
                    ['↩', 'Restore skipped habits anytime', '#f97316'],
                    ['✓', 'Custom tasks with your own XP values', '#10b981'],
                    ['✓', 'Daily, weekly & monthly views', '#8b5cf6'],
                    ['✓', 'Streak tracking across every habit', '#d97706'],
                  ].map(([sym, text, col]) => (
                    <div key={text} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, fontFamily: 'Poppins,sans-serif', color: 'var(--text)' }}>
                      <span style={{ color: col, fontWeight: 800, fontSize: 15, width: 18, flexShrink: 0 }}>{sym}</span>{text}
                    </div>
                  ))}
                </div>
              </div>
              {/* Interactive demo */}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--b2)', borderRadius: 20, padding: 24, position: 'relative' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'Poppins,sans-serif', marginBottom: 2 }}>Today's Habits</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', fontFamily: 'Poppins,sans-serif' }}>{checkedActive} of {activeHabits.length} complete · <span style={{ color: '#f43f5e' }}>{skippedHabits.size} skipped</span></div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 24, fontWeight: 800, color: gold, fontFamily: 'Poppins,sans-serif' }}>{demoXp} XP</div>
                    <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'Poppins,sans-serif' }}>earned today</div>
                  </div>
                </div>
                {DEMO_HABITS.map((h, idx) => {
                  const done    = checkedHabits.has(idx)
                  const skipped = skippedHabits.has(idx)
                  return (
                    <div key={h.id} className={`lp-habit-row${done ? ' done' : ''}${skipped ? ' skipped' : ''}`}
                      onClick={() => toggleHabitDemo(idx)}>
                      <div style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${skipped ? '#ef4444' : done ? h.color : 'var(--b3)'}`, background: skipped ? '#ef44440f' : done ? h.color : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all .15s' }}>
                        {skipped && <span style={{ color: '#ef4444', fontSize: 11, fontWeight: 800 }}>✕</span>}
                        {done && !skipped && <span style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>✓</span>}
                      </div>
                      <span style={{ fontSize: 17, flexShrink: 0 }}>{h.icon}</span>
                      <span style={{ flex: 1, fontSize: 13, fontFamily: 'Poppins,sans-serif', fontWeight: done ? 600 : 400, color: skipped ? 'var(--muted)' : done ? 'var(--text)' : 'var(--muted)', textDecoration: skipped ? 'line-through' : 'none' }}>{h.label}</span>
                      {!skipped && (
                        <span style={{ fontSize: 11, color: h.color, fontWeight: 700, fontFamily: 'Poppins,sans-serif' }}>+{h.xp} XP</span>
                      )}
                      {skipped
                        ? <button className="lp-restore-btn" onClick={e => restoreHabit(idx, e)}>↩ Restore</button>
                        : <button className="lp-skip-btn" onClick={e => skipHabit(idx, e)}>✕ Skip</button>
                      }
                    </div>
                  )
                })}
                {xpPops.map(p => (
                  <div key={p.id} className="lp-xp-pop" style={{ color: p.color, bottom: 90 }}>{p.label}</div>
                ))}
                <div style={{ marginTop: 16, background: 'var(--b1)', borderRadius: 6, height: 6, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.round(checkedActive / Math.max(activeHabits.length, 1) * 100)}%`, background: gold, borderRadius: 6, transition: 'width .3s' }} />
                </div>
                <div style={{ textAlign: 'center', marginTop: 10, fontSize: 11, color: 'var(--muted)', fontFamily: 'Poppins,sans-serif' }}>
                  ↑ Click to check · Hit ✕ Skip to X out · ↩ Restore to bring back
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Print Daily Checklist ─────────────────────────────────── */}
        <section className="lp-section-pad" style={{ background: theme === 'dark' ? 'rgba(255,255,255,.02)' : 'rgba(0,0,0,.02)', borderTop: '1px solid var(--b1)', borderBottom: '1px solid var(--b1)' }}>
          <div className="lp-max">
            <div className="lp-split">
              <div>
                <div className="lp-label" style={{ color: '#06b6d4', marginBottom: 12 }}>Print Daily Checklist</div>
                <h2 className="serif" style={{ fontSize: 'clamp(28px,4vw,50px)', fontWeight: 800, lineHeight: 1.1, letterSpacing: '-.025em', marginBottom: 18 }}>
                  Take your grind<br />offline.
                </h2>
                <p style={{ fontSize: 15, color: 'var(--muted)', lineHeight: 1.75, marginBottom: 28, fontFamily: 'Poppins,sans-serif' }}>
                  Print or save your daily habit sheet as a PDF — perfect for field work, car time, open houses, or any agent who wants a physical paper trail. Log on paper, enter it when you're back.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {[
                    ['🖨️', 'Print or download as PDF in one click'],
                    ['📝', 'Notes column for each habit — write as you go'],
                    ['💰', 'Pipeline snapshot included (offers, pending, closed)'],
                    ['✍️', 'Signature line for self-accountability'],
                    ['📅', 'Auto-dated with your name and team'],
                    ['📁', 'Archive your printed sheets for any date'],
                  ].map(([icon, text]) => (
                    <div key={text} style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 14, fontFamily: 'Poppins,sans-serif', color: 'var(--text)' }}>
                      <span style={{ fontSize: 18, width: 24, flexShrink: 0 }}>{icon}</span>{text}
                    </div>
                  ))}
                </div>
              </div>
              {/* Paper mockup */}
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '24px 0' }}>
                <div className="lp-print-paper">
                  <div style={{ borderBottom: '2px solid #374151', paddingBottom: 10, marginBottom: 12 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: .5 }}>📋 DAILY GRIND SHEET</div>
                    <div style={{ display: 'flex', gap: 16, marginTop: 6, fontSize: 10, color: '#6b7280' }}>
                      <span>Date: ___________</span>
                      <span>Agent: ___________</span>
                    </div>
                  </div>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, color: '#6b7280', marginBottom: 6 }}>TODAY'S HABITS</div>
                  {DEMO_HABITS.map(h => (
                    <div key={h.id} className="lp-print-row">
                      <div className="lp-print-box" />
                      <span style={{ fontSize: 11, whiteSpace: 'nowrap' }}>{h.icon} {h.label}</span>
                      <div className="lp-print-dots" />
                    </div>
                  ))}
                  <div style={{ marginTop: 12, padding: '8px 0', borderBottom: '1px solid #e5e7eb', fontSize: 10, color: '#6b7280' }}>
                    Pipeline: ___ Offers · ___ Pending · ___ Closed
                  </div>
                  <div style={{ marginTop: 8, fontSize: 9, color: '#6b7280' }}>
                    <div>Notes:</div>
                    <div style={{ borderBottom: '1px dotted #d1d5db', marginTop: 8, height: 1 }} />
                    <div style={{ borderBottom: '1px dotted #d1d5db', marginTop: 8, height: 1 }} />
                  </div>
                  <div style={{ marginTop: 14, paddingTop: 10, borderTop: '1px solid #e5e7eb', fontSize: 9, color: '#6b7280' }}>
                    Signature: _________________________________
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Interactive Pipeline Demo ─────────────────────────────── */}
        <section className="lp-section-pad">
          <div className="lp-max">
            <div style={{ textAlign: 'center', marginBottom: 48 }}>
              <div className="lp-label" style={{ color: '#10b981', marginBottom: 12 }}>Pipeline Tracker</div>
              <h2 className="serif" style={{ fontSize: 'clamp(28px,4vw,50px)', fontWeight: 800, lineHeight: 1.1, letterSpacing: '-.025em', marginBottom: 16 }}>
                Never lose track of a deal.
              </h2>
              <p style={{ fontSize: 15, color: 'var(--muted)', fontFamily: 'Poppins,sans-serif', maxWidth: 520, margin: '0 auto' }}>
                Every offer, every pending, every closing — logged and tracked in real time. Hit <strong style={{ color: 'var(--text)' }}>+ Add Deal</strong> to see it in action.
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
        <section className="lp-section-pad" style={{ background: theme === 'dark' ? 'rgba(255,255,255,.02)' : 'rgba(0,0,0,.02)', borderTop: '1px solid var(--b1)', borderBottom: '1px solid var(--b1)' }}>
          <div className="lp-max">
            <div className="lp-split" style={{ alignItems: 'flex-start' }}>
              <div>
                <div className="lp-label" style={{ color: '#d97706', marginBottom: 12 }}>XP & Rank System</div>
                <h2 className="serif" style={{ fontSize: 'clamp(28px,4vw,50px)', fontWeight: 800, lineHeight: 1.1, letterSpacing: '-.025em', marginBottom: 18 }}>
                  Turn discipline<br />into status.
                </h2>
                <p style={{ fontSize: 15, color: 'var(--muted)', lineHeight: 1.75, marginBottom: 28, fontFamily: 'Poppins,sans-serif' }}>
                  Every habit you check and every deal you close earns XP. Watch your rank climb from Bronze to Diamond. Hit the button to see it happen live.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {RANKS_DEF.map(r => (
                    <div key={r.name} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', borderRadius: 12, background: 'var(--surface)', border: `1.5px solid ${rankXp >= r.min ? r.color + '55' : 'var(--b2)'}` }}>
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
              <div style={{ background: 'var(--surface)', border: '1px solid var(--b2)', borderRadius: 20, padding: 28, alignSelf: 'center' }}>
                <div style={{ textAlign: 'center', marginBottom: 24 }}>
                  <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'Poppins,sans-serif', marginBottom: 10, letterSpacing: 1, textTransform: 'uppercase' }}>Your Rank</div>
                  <div style={{ fontSize: 64, marginBottom: 10, display: 'inline-block', animation: rankAnim ? 'rankLevelUp .7s ease' : 'none' }}>
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
        <section className="lp-section-pad">
          <div className="lp-max">
            <div className="lp-split">
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
                  <strong style={{ color: gold }}>Team leader view</strong> — click any agent to open their habit breakdown, pipeline, listings, and coaching history.
                </div>
              </div>
              <div>
                <div className="lp-label" style={{ color: '#8b5cf6', marginBottom: 12 }}>Team Management</div>
                <h2 className="serif" style={{ fontSize: 'clamp(28px,4vw,50px)', fontWeight: 800, lineHeight: 1.1, letterSpacing: '-.025em', marginBottom: 18 }}>
                  Lead your team,<br />not chase them.
                </h2>
                <p style={{ fontSize: 15, color: 'var(--muted)', lineHeight: 1.75, marginBottom: 28, fontFamily: 'Poppins,sans-serif' }}>
                  See your entire roster at a glance — who's hitting their habits, who's behind, and who just closed. Real accountability without the micromanagement.
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

        {/* ── Team Challenges ───────────────────────────────────────── */}
        <section className="lp-section-pad" style={{ background: theme === 'dark' ? 'rgba(255,255,255,.02)' : 'rgba(0,0,0,.02)', borderTop: '1px solid var(--b1)', borderBottom: '1px solid var(--b1)' }}>
          <div className="lp-max">
            <div className="lp-split">
              <div>
                <div className="lp-label" style={{ color: '#f97316', marginBottom: 12 }}>Team Challenges</div>
                <h2 className="serif" style={{ fontSize: 'clamp(28px,4vw,50px)', fontWeight: 800, lineHeight: 1.1, letterSpacing: '-.025em', marginBottom: 18 }}>
                  Compete. Earn.<br />Level up together.
                </h2>
                <p style={{ fontSize: 15, color: 'var(--muted)', lineHeight: 1.75, marginBottom: 28, fontFamily: 'Poppins,sans-serif' }}>
                  Team leaders create time-limited challenges with custom goals, XP bonuses, and achievement badges. Every agent sees their progress live. Accountability becomes competition — and competition becomes results.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {[
                    ['🏆', 'Leaders create challenges in seconds'],
                    ['📊', 'All agents track progress live on their dashboard'],
                    ['🎁', 'XP bonuses + exclusive achievement badges'],
                    ['👥', 'Accountability groups compete separately'],
                    ['⏱️', 'Time-limited — 7, 14, or 30 days'],
                    ['🔔', 'Automatic reminders to keep momentum'],
                  ].map(([icon, text]) => (
                    <div key={text} style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 14, fontFamily: 'Poppins,sans-serif', color: 'var(--text)' }}>
                      <span style={{ fontSize: 18, width: 24, flexShrink: 0 }}>{icon}</span>{text}
                    </div>
                  ))}
                </div>
              </div>
              {/* Interactive challenge demo */}
              <div>
                {/* Tabs */}
                <div className="lp-challenge-tabs">
                  {CHALLENGES_DATA.map((c, i) => (
                    <button key={c.id} className={`lp-challenge-tab${activeChal === i ? ' active' : ''}`}
                      onClick={() => setActiveChal(i)}
                      style={{ background: activeChal === i ? c.color : 'transparent', borderColor: activeChal === i ? c.color : 'var(--b2)', color: activeChal === i ? '#fff' : 'var(--muted)' }}>
                      {c.emoji} {c.name.split(' ').slice(0, 2).join(' ')}
                    </button>
                  ))}
                </div>
                <div className="lp-challenge-card" style={{ borderColor: `${chal.color}44`, background: `${chal.color}04` }}
                  key={chal.id}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 20, background: `${chal.color}18`, border: `1px solid ${chal.color}33`, fontSize: 10, fontWeight: 700, color: chal.color, fontFamily: 'Poppins,sans-serif', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 16 }}>
                    🔥 Active Challenge
                  </div>
                  <h3 className="serif" style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', marginBottom: 8, lineHeight: 1.2 }}>
                    {chal.name}
                  </h3>
                  <p style={{ fontSize: 13, color: 'var(--muted)', fontFamily: 'Poppins,sans-serif', marginBottom: 20, lineHeight: 1.65 }}>
                    {chal.desc}
                  </p>
                  {/* Progress */}
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', fontFamily: 'Poppins,sans-serif' }}>Your Progress</span>
                      <span style={{ fontSize: 22, fontWeight: 800, color: chal.color, fontFamily: 'Poppins,sans-serif' }}>{chalProg}/{chal.goal}</span>
                    </div>
                    <div style={{ background: 'var(--b1)', borderRadius: 8, height: 14, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${chalPct}%`, background: `linear-gradient(90deg,${chal.color},${chal.color}cc)`, borderRadius: 8, transition: 'width .5s cubic-bezier(.4,2,.55,1)', animation: chalAnimating ? 'challengePop .6s ease' : undefined }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11, color: 'var(--muted)', fontFamily: 'Poppins,sans-serif' }}>
                      <span>{chalPct}% complete</span>
                      <span>{chal.goal - chalProg} days to go</span>
                    </div>
                  </div>
                  {/* Reward */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20, padding: '12px 16px', borderRadius: 12, background: `${chal.color}0d`, border: `1px solid ${chal.color}22` }}>
                    <span style={{ fontSize: 22 }}>🎁</span>
                    <div style={{ fontFamily: 'Poppins,sans-serif' }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: chal.color }}>+{chal.xpReward.toLocaleString()} XP Bonus</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>+ "{chal.badge}" badge · {chal.agents} agents competing</div>
                    </div>
                  </div>
                  <button onClick={logChallengeDay} disabled={chalAnimating || chalProg >= chal.goal}
                    style={{ ...btnGold, width: '100%', padding: '13px', fontSize: 14, background: chal.color, boxShadow: `0 4px 18px ${chal.color}44`, opacity: chalProg >= chal.goal ? .7 : 1 }}>
                    {chalProg >= chal.goal ? '✓ Challenge Complete!' : `Log Today's Progress →`}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Coaching Notes ────────────────────────────────────────── */}
        <section className="lp-section-pad">
          <div className="lp-max">
            <div className="lp-split" style={{ alignItems: 'start' }}>
              {/* Thread mockup */}
              <div className="lp-coaching-demo">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, padding: '0 0 14px', borderBottom: '1px solid var(--b2)' }}>
                  <div style={{ fontFamily: 'Poppins,sans-serif' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>📋 Coaching Thread</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>Jordan L. · Private</div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {['Action Required', 'Positive', 'Check-In', 'Goal'].map((t, i) => (
                      <div key={t} style={{ fontSize: 9, padding: '3px 8px', borderRadius: 12, fontWeight: 700, fontFamily: 'Poppins,sans-serif', background: [
                        'rgba(239,68,68,.12)', 'rgba(16,185,129,.12)', 'rgba(14,165,233,.12)', 'rgba(217,119,6,.12)'
                      ][i], color: ['#ef4444','#10b981','#0ea5e9','#d97706'][i], whiteSpace: 'nowrap' }}>{t}</div>
                    ))}
                  </div>
                </div>
                <div className="lp-coaching-thread">
                  {COACHING_THREAD.map((msg, i) => (
                    <div key={i} className="lp-coaching-bubble" style={{ flexDirection: msg.from === 'agent' ? 'row-reverse' : 'row' }}>
                      <div style={{ fontSize: 26, flexShrink: 0, marginTop: 4 }}>{msg.avatar}</div>
                      <div className="lp-coaching-msg" style={{ borderRadius: msg.from === 'agent' ? '14px 4px 14px 14px' : '4px 14px 14px 14px', background: msg.from === 'agent' ? `${gold}0a` : 'var(--surface)', borderColor: msg.from === 'agent' ? `${gold}22` : 'var(--b2)' }}>
                        {msg.type && (
                          <div className="lp-note-type-badge" style={{ background: `${msg.typeColor}15`, color: msg.typeColor, border: `1px solid ${msg.typeColor}30` }}>
                            {msg.type === 'Action Required' ? '⚠️' : msg.type === 'Positive' ? '✓' : '💬'} {msg.type}
                          </div>
                        )}
                        <p style={{ fontSize: 13, color: 'var(--text)', fontFamily: 'Poppins,sans-serif', lineHeight: 1.7 }}>{msg.msg}</p>
                        <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'Poppins,sans-serif', marginTop: 8 }}>{msg.name} · {msg.time}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {/* Copy */}
              <div className="lp-coaching-text">
                <div className="lp-label" style={{ color: '#8b5cf6', marginBottom: 12 }}>Coaching Notes</div>
                <h2 className="serif" style={{ fontSize: 'clamp(28px,4vw,50px)', fontWeight: 800, lineHeight: 1.1, letterSpacing: '-.025em', marginBottom: 18 }}>
                  Real coaching.<br />Not just messages.
                </h2>
                <p style={{ fontSize: 15, color: 'var(--muted)', lineHeight: 1.75, marginBottom: 28, fontFamily: 'Poppins,sans-serif' }}>
                  Leave private coaching notes directly on each agent's profile — right next to their habits, pipeline, and production data. Agents reply in-thread. No app switching, no confusion.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {[
                    ['⚠️', 'Action Required, Positive, Check-In & Goal note types'],
                    ['📌', 'Pin critical notes to the top of an agent\'s profile'],
                    ['💬', 'Agents reply directly in-thread'],
                    ['👁️', 'Read receipts — see when your note was seen'],
                    ['🔒', 'Private per-agent — other agents can\'t see each other\'s notes'],
                    ['📊', 'Note history alongside habit and production data'],
                  ].map(([icon, text]) => (
                    <div key={text} style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 14, fontFamily: 'Poppins,sans-serif', color: 'var(--text)' }}>
                      <span style={{ fontSize: 18, width: 24, flexShrink: 0 }}>{icon}</span>{text}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Day In The Life Timeline ──────────────────────────────── */}
        <section id="features" className="lp-section-pad" style={{ background: theme === 'dark' ? 'rgba(255,255,255,.02)' : 'rgba(0,0,0,.02)', borderTop: '1px solid var(--b1)', borderBottom: '1px solid var(--b1)' }}>
          <div className="lp-max">
            <div style={{ textAlign: 'center', marginBottom: 56 }}>
              <div className="lp-label" style={{ color: '#06b6d4', marginBottom: 12 }}>A Day In The Life</div>
              <h2 className="serif" style={{ fontSize: 'clamp(28px,4vw,50px)', fontWeight: 800, lineHeight: 1.1, letterSpacing: '-.025em', marginBottom: 16 }}>
                What grinding actually looks like.
              </h2>
              <p style={{ fontSize: 15, color: 'var(--muted)', fontFamily: 'Poppins,sans-serif', maxWidth: 500, margin: '0 auto' }}>
                From morning habits to a coaching note at 4pm — every action tracked, every XP earned, nothing slipping through the cracks.
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
        <section className="lp-section-pad">
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
                  <div style={{ fontSize: 15, fontWeight: 700, color: f.color, marginBottom: 8, fontFamily: 'Poppins,sans-serif' }}>{f.title}</div>
                  <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.75, fontFamily: 'Poppins,sans-serif' }}>{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Testimonials ─────────────────────────────────────────── */}
        <section className="lp-section-pad" style={{ background: theme === 'dark' ? 'rgba(255,255,255,.02)' : 'rgba(0,0,0,.02)', borderTop: '1px solid var(--b1)', borderBottom: '1px solid var(--b1)' }}>
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
        <section className="lp-section-pad">
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
        <section id="faq" className="lp-section-pad" style={{ background: theme === 'dark' ? 'rgba(255,255,255,.02)' : 'rgba(0,0,0,.02)', borderTop: '1px solid var(--b1)', borderBottom: '1px solid var(--b1)' }}>
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
        <section id="pricing" className="lp-section-pad">
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
                    <button onClick={() => onSubscribe ? onSubscribe(plan.name.toLowerCase(), annual) : onGetStarted()} style={{ width: '100%', padding: '12px 0', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer', marginBottom: 20, transition: 'all .18s', fontFamily: 'Poppins,sans-serif', background: isPop ? plan.color : 'transparent', color: isPop ? '#fff' : plan.color, border: isPop ? 'none' : `2px solid ${plan.color}`, boxShadow: isPop ? `0 6px 22px ${plan.color}44` : 'none' }}>
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
              Join agents who track every habit, skip nothing that matters, print their checklist, coach their team, and actually hit their production goals.
            </p>
            <button className="lp-hero-gold-btn lp-cta-btn" onClick={onGetStarted}>
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
