import { useState, useEffect } from 'react'
import { AuthProvider, useAuth } from './lib/AuthContext'
import { supabase } from './lib/supabase'
import AuthPage from './pages/AuthPage'
import Leaderboard from './pages/Leaderboard'
import TeamsPage from './pages/TeamsPage'
import ProfilePage from './pages/ProfilePage'

// ─── Constants ────────────────────────────────────────────────────────────────

const HABITS = [
  { id:'prospecting',  label:'Prospecting Calls',   icon:'📞', xp:25, cat:'leads',     counter:true, xpEach:10 },
  { id:'followup',     label:'Follow-Up Emails',    icon:'✉️', xp:15, cat:'leads',     counter:true, xpEach:8  },
  { id:'appointments', label:'Appointments Booked', icon:'📅', xp:30, cat:'leads',     counter:true, xpEach:25 },
  { id:'showing',      label:'Property Showings',   icon:'🔑', xp:30, cat:'leads',     counter:true, xpEach:20 },
  { id:'newlisting',   label:'Listings Taken',      icon:'🏠', xp:25, cat:'listings',  counter:true, xpEach:30 },
  { id:'social',       label:'Social Posts',        icon:'📱', xp:10, cat:'marketing', counter:true, xpEach:8  },
  { id:'crm',          label:'CRM Updates',         icon:'💾', xp:15, cat:'admin',     counter:true, xpEach:5  },
  { id:'market',       label:'Market Analysis',     icon:'📊', xp:35, cat:'market' },
  { id:'networking',   label:'Networking',          icon:'🤝', xp:20, cat:'leads',     counter:true, xpEach:15 },
  { id:'training',     label:'Training',            icon:'📚', xp:20, cat:'growth' },
  { id:'review',       label:'Review Requests',     icon:'⭐', xp:20, cat:'marketing', counter:true, xpEach:15 },
]

const PIPELINE_XP = { offer_made:75, offer_received:75, went_pending:150, closed:300 }

const DAYS       = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const FULL_DAYS  = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
const WEEKS      = 4
const MONTH_YEAR = new Date().toISOString().slice(0,7)

const RANKS = [
  { name:'Rookie',       min:0,    max:500,      color:'#94a3b8', icon:'🏅' },
  { name:'Associate',    min:500,  max:1500,     color:'#34d399', icon:'🥈' },
  { name:'Senior Agent', min:1500, max:3000,     color:'#fbbf24', icon:'🥇' },
  { name:'Top Producer', min:3000, max:6000,     color:'#fb923c', icon:'🏆' },
  { name:'Elite Broker', min:6000, max:Infinity, color:'#c084fc', icon:'💎' },
]

const CAT_STYLE = {
  leads:     { color:'#34d399', bg:'rgba(52,211,153,0.12)',   border:'rgba(52,211,153,0.25)'   },
  listings:  { color:'#60a5fa', bg:'rgba(96,165,250,0.12)',   border:'rgba(96,165,250,0.25)'   },
  marketing: { color:'#f472b6', bg:'rgba(244,114,182,0.12)',  border:'rgba(244,114,182,0.25)'  },
  admin:     { color:'#fb923c', bg:'rgba(251,146,60,0.12)',   border:'rgba(251,146,60,0.25)'   },
  market:    { color:'#38bdf8', bg:'rgba(56,189,248,0.12)',   border:'rgba(56,189,248,0.25)'   },
  growth:    { color:'#c084fc', bg:'rgba(192,132,252,0.12)',  border:'rgba(192,132,252,0.25)'  },
}

function getRank(xp) { return [...RANKS].reverse().find(r=>xp>=r.min)||RANKS[0] }
function getToday()  { const d=new Date(); return { week:Math.min(Math.floor((d.getDate()-1)/7),3), day:d.getDay() } }
function fmtMoney(v) {
  const n=parseFloat(String(v||'').replace(/[^0-9.]/g,''))
  if(!n) return null
  return n>=1e6?'$'+(n/1e6).toFixed(2)+'M':n>=1e3?'$'+(n/1e3).toFixed(0)+'K':'$'+Math.round(n).toLocaleString()
}

// ─── CSS ──────────────────────────────────────────────────────────────────────

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=DM+Sans:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500;700&display=swap');

:root {
  --bg:       #09090b;
  --s1:       #111115;
  --s2:       #18181d;
  --s3:       #1e1e25;
  --b1:       rgba(255,255,255,0.06);
  --b2:       rgba(255,255,255,0.10);
  --b3:       rgba(255,255,255,0.16);
  --text:     #f4f4f5;
  --sub:      #a1a1aa;
  --dim:      #52525b;
  --gold:     #d4a853;
  --gold2:    rgba(212,168,83,0.14);
  --gold3:    rgba(212,168,83,0.06);
  --green:    #34d399;
  --red:      #f87171;
  --r:        13px;
}

*{box-sizing:border-box;margin:0;padding:0;}
body{background:var(--bg);color:var(--text);font-family:'DM Sans',sans-serif;min-height:100vh;}
::-webkit-scrollbar{width:4px;height:4px;}
::-webkit-scrollbar-thumb{background:#2a2a32;border-radius:2px;}
::-webkit-scrollbar-track{background:transparent;}

@keyframes fadeUp  {from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
@keyframes floatXp {0%{opacity:1;transform:translateY(0) scale(1)}100%{opacity:0;transform:translateY(-52px) scale(1.15)}}
@keyframes pop     {0%{transform:scale(1)}45%{transform:scale(1.4)}100%{transform:scale(1)}}
@keyframes glow    {0%,100%{box-shadow:0 0 8px rgba(212,168,83,0.3)}50%{box-shadow:0 0 18px rgba(212,168,83,0.6)}}

.card  {background:var(--s1);border:1px solid var(--b1);border-radius:var(--r);}
.card2 {background:var(--s2);border:1px solid var(--b1);border-radius:10px;}

.nav-btn{background:transparent;border:1px solid var(--b2);color:var(--sub);border-radius:8px;
  padding:7px 14px;cursor:pointer;font-family:'DM Sans',sans-serif;font-size:12px;font-weight:500;
  transition:all .15s;white-space:nowrap;}
.nav-btn:hover{background:var(--s2);border-color:var(--b3);color:var(--text);}
.nav-btn.active{background:var(--gold2);border-color:var(--gold);color:var(--gold);}

.tab{background:transparent;border:none;border-bottom:2px solid transparent;padding:10px 18px;
  cursor:pointer;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:500;color:var(--sub);transition:all .15s;}
.tab:hover{color:var(--text);}
.tab.active{color:var(--gold);border-bottom-color:var(--gold);}

.habit-row{display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:9px;
  border:1px solid transparent;transition:all .15s;cursor:default;}
.habit-row:hover{background:var(--s2);border-color:var(--b1);}
.habit-row.done{background:var(--s3);border-color:var(--b2);}

.chk{width:26px;height:26px;border-radius:7px;border:1.5px solid var(--b3);background:transparent;
  cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .15s;}
.chk:hover{border-color:var(--b3);background:var(--s3);}
.chk.done{border-color:transparent;animation:pop .25s ease;}

.cnt-btn{width:22px;height:22px;border-radius:6px;border:1px solid;background:transparent;
  cursor:pointer;font-size:13px;font-weight:700;display:flex;align-items:center;justify-content:center;
  transition:all .15s;font-family:'DM Sans',sans-serif;flex-shrink:0;}
.cnt-btn:hover{opacity:.75;transform:scale(1.1);}

.pipe-input{background:transparent;border:none;color:var(--text);font-family:'JetBrains Mono',monospace;
  font-size:12px;width:100%;min-width:0;}
.pipe-input:focus{outline:none;}
.pipe-select{background:var(--s2);border:1px solid var(--b2);color:var(--sub);border-radius:7px;
  padding:5px 8px;font-family:'DM Sans',sans-serif;font-size:11px;cursor:pointer;width:100%;}
.pipe-select:focus{outline:none;border-color:var(--gold);}
.pipe-row{display:grid;gap:8px;align-items:center;padding:8px 12px;border-radius:9px;
  border:1px solid var(--b1);background:var(--s2);transition:border-color .15s;}
.pipe-row:hover{border-color:var(--b2);}

.del-btn{background:rgba(248,113,113,.08);border:1px solid rgba(248,113,113,.2);color:#f87171;
  border-radius:7px;padding:5px 9px;cursor:pointer;font-size:12px;flex-shrink:0;transition:all .15s;}
.del-btn:hover{background:rgba(248,113,113,.18);}

.input{background:var(--s2);border:1px solid var(--b2);color:var(--text);border-radius:8px;
  padding:9px 13px;font-family:'JetBrains Mono',monospace;font-size:12px;width:100%;transition:border-color .15s;}
.input:focus{outline:none;border-color:var(--gold);box-shadow:0 0 0 3px rgba(212,168,83,.1);}

.btn-primary{background:var(--gold);border:none;color:#09090b;border-radius:8px;padding:9px 20px;
  cursor:pointer;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:600;transition:all .15s;}
.btn-primary:hover{background:#e6bc6a;}
.btn-primary:disabled{opacity:.4;cursor:not-allowed;}
.btn-ghost{background:transparent;border:1px solid var(--b2);color:var(--sub);border-radius:8px;
  padding:8px 16px;cursor:pointer;font-family:'DM Sans',sans-serif;font-size:12px;font-weight:500;transition:all .15s;}
.btn-ghost:hover{background:var(--s2);color:var(--text);border-color:var(--b3);}

.stat{border-radius:11px;padding:14px 16px;cursor:default;transition:transform .15s;}
.stat:hover{transform:translateY(-2px);}
`

// ─── UI Atoms ─────────────────────────────────────────────────────────────────

function Ring({ pct, size=72, color='#d4a853', track='rgba(255,255,255,0.06)', sw=5, label, sub }) {
  const r=(size-sw*2)/2, c=2*Math.PI*r, d=c*(Math.min(pct,100)/100)
  return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:4}}>
      <svg width={size} height={size} style={{transform:'rotate(-90deg)',flexShrink:0}}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={track} strokeWidth={sw}/>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={sw}
          strokeDasharray={`${d} ${c}`} strokeLinecap="round"
          style={{transition:'stroke-dasharray .7s cubic-bezier(.4,2,.55,1)',filter:`drop-shadow(0 0 5px ${color}55)`}}/>
        <text x={size/2} y={size/2+1} textAnchor="middle" dominantBaseline="middle"
          fill={color} fontSize={size>64?13:10} fontWeight="700" fontFamily="'DM Sans',sans-serif"
          style={{transform:'rotate(90deg)',transformOrigin:`${size/2}px ${size/2}px`}}>
          {Math.round(pct)}%
        </text>
      </svg>
      {label && <div style={{fontSize:10,color:'var(--sub)',textAlign:'center'}}>{label}</div>}
      {sub   && <div style={{fontSize:10,color,fontFamily:"'JetBrains Mono',monospace"}}>{sub}</div>}
    </div>
  )
}

function StatCard({ icon, label, value, color='#d4a853', sub, border }) {
  return (
    <div className="stat" style={{background:'var(--s2)',border:`1px solid ${border||'var(--b1)'}`}}>
      <div style={{fontSize:10,color:'var(--sub)',marginBottom:6,display:'flex',alignItems:'center',gap:5}}>
        <span>{icon}</span><span style={{letterSpacing:.5}}>{label}</span>
      </div>
      <div style={{fontFamily:"'Instrument Serif',serif",fontSize:24,color,lineHeight:1,fontWeight:400}}>{value}</div>
      {sub && <div style={{fontSize:10,color:'var(--sub)',marginTop:4,fontFamily:"'JetBrains Mono',monospace"}}>{sub}</div>}
    </div>
  )
}

// ─── Pipeline Tracker ─────────────────────────────────────────────────────────

function PipelineSection({ title, icon, accentColor, rows, setRows, onStatusChange, showSource=false, onAddNew }) {
  const [addr, setAddr]   = useState('')
  const [price, setPrice] = useState('')
  const [comm, setComm]   = useState('')

  function add() {
    if (!addr.trim()) return
    const newRow = { id:Date.now(), address:addr.trim(), price:price.trim(), commission:comm.trim(), status:'active' }
    setRows(prev=>[...prev, newRow])
    if (onAddNew) onAddNew(newRow)
    setAddr(''); setPrice(''); setComm('')
  }

  function remove(id)             { setRows(prev=>prev.filter(r=>r.id!==id)) }
  function update(id, f, v)       { setRows(prev=>prev.map(r=>r.id===id?{...r,[f]:v}:r)) }

  const totalVol  = rows.reduce((a,r)=>{ const n=parseFloat(String(r.price||'').replace(/[^0-9.]/g,'')); return a+(isNaN(n)?0:n) },0)
  const totalComm = rows.reduce((a,r)=>{ const n=parseFloat(String(r.commission||'').replace(/[^0-9.]/g,'')); return a+(isNaN(n)?0:n) },0)

  const xpKey = title.toLowerCase().includes('closed') ? 'closed'
              : title.toLowerCase().includes('pending') ? 'went_pending'
              : 'offer_made'

  const statusOpts = showSource ? [] : [
    { v:'active',  l:'Active' },
    { v:'pending', l:'Move to Pending' },
    { v:'closed',  l:'Mark Closed' },
  ]

  const cols = showSource
    ? '1fr 110px 110px 36px'
    : '1fr 110px 110px 160px 36px'

  return (
    <div className="card" style={{padding:20}}>
      {/* Header */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:14,flexWrap:'wrap',gap:8}}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <span style={{fontSize:18}}>{icon}</span>
          <div>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <span style={{fontFamily:"'DM Sans',sans-serif",fontWeight:600,fontSize:14,color:'var(--text)'}}>{title}</span>
              <span style={{fontFamily:"'Instrument Serif',serif",fontSize:20,color:accentColor}}>{rows.length}</span>
              <span style={{fontSize:9,padding:'2px 6px',borderRadius:4,background:`${accentColor}18`,
                color:accentColor,border:`1px solid ${accentColor}33`,fontFamily:"'JetBrains Mono',monospace",fontWeight:700}}>
                +{PIPELINE_XP[xpKey]} XP/deal
              </span>
            </div>
            {totalVol>0 && <div style={{fontSize:10,color:'var(--sub)',marginTop:2}}>
              Vol: <span style={{color:accentColor,fontFamily:"'JetBrains Mono',monospace"}}>{fmtMoney(totalVol)}</span>
              {totalComm>0 && <> · Comm: <span style={{color:'#34d399',fontFamily:"'JetBrains Mono',monospace"}}>{fmtMoney(totalComm)}</span></>}
            </div>}
          </div>
        </div>
      </div>

      {/* Column headers */}
      <div style={{display:'grid',gridTemplateColumns:cols,gap:8,padding:'4px 12px',marginBottom:6}}>
        <span style={{fontSize:9,color:'var(--dim)',letterSpacing:.8}}>ADDRESS</span>
        <span style={{fontSize:9,color:'var(--dim)',letterSpacing:.8}}>PRICE</span>
        <span style={{fontSize:9,color:'var(--dim)',letterSpacing:.8}}>COMMISSION</span>
        {showSource
          ? <span style={{fontSize:9,color:'var(--dim)',letterSpacing:.8}}>SOURCE</span>
          : <span style={{fontSize:9,color:'var(--dim)',letterSpacing:.8}}>STATUS</span>}
        <span/>
      </div>

      {rows.length===0 && (
        <div style={{textAlign:'center',padding:'16px 0',color:'var(--dim)',fontSize:12}}>No entries yet</div>
      )}

      <div style={{display:'flex',flexDirection:'column',gap:5,marginBottom:10}}>
        {rows.map(r=>(
          <div key={r.id} className="pipe-row" style={{gridTemplateColumns:cols}}>
            <input className="pipe-input" value={r.address||''} onChange={e=>update(r.id,'address',e.target.value)} placeholder="Property address…"/>
            <input className="pipe-input" value={r.price||''} onChange={e=>update(r.id,'price',e.target.value)}
              placeholder="$0" style={{color:accentColor,fontWeight:600}}/>
            <input className="pipe-input" value={r.commission||''} onChange={e=>update(r.id,'commission',e.target.value)}
              placeholder="$0 optional" style={{color:'#34d399',fontWeight:600}}/>
            {showSource
              ? <span style={{fontSize:10,color:'var(--sub)',fontFamily:"'JetBrains Mono',monospace",padding:'0 2px'}}>{r.closedFrom||'—'}</span>
              : <select className="pipe-select" value={r.status||'active'} onChange={e=>onStatusChange(r,e.target.value)}
                  style={{color:r.status==='pending'?'#fbbf24':r.status==='closed'?'#34d399':'var(--sub)'}}>
                  {statusOpts.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}
                </select>
            }
            <button className="del-btn" onClick={()=>remove(r.id)}>✕</button>
          </div>
        ))}
      </div>

      {/* Add row */}
      {!showSource && (
        <div style={{display:'grid',gridTemplateColumns:cols,gap:8,borderTop:'1px solid var(--b1)',paddingTop:10,alignItems:'center'}}>
          <input className="input" value={addr} onChange={e=>setAddr(e.target.value)}
            onKeyDown={e=>e.key==='Enter'&&add()} placeholder="New address…" style={{padding:'7px 11px'}}/>
          <input className="input" value={price} onChange={e=>setPrice(e.target.value)}
            onKeyDown={e=>e.key==='Enter'&&add()} placeholder="Price" style={{padding:'7px 11px',color:accentColor}}/>
          <input className="input" value={comm} onChange={e=>setComm(e.target.value)}
            onKeyDown={e=>e.key==='Enter'&&add()} placeholder="Commission" style={{padding:'7px 11px',color:'#34d399'}}/>
          <div/>
          <button onClick={add} style={{background:accentColor,border:'none',color:'#09090b',borderRadius:8,
            padding:'8px',cursor:'pointer',fontSize:16,fontWeight:700,lineHeight:1}}>+</button>
        </div>
      )}
    </div>
  )
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

function Dashboard() {
  const { user, profile, refreshProfile } = useAuth()
  const today = getToday()

  // Navigation
  const [page, setPage] = useState('dashboard')
  // Default to 'today' view
  const [tab,  setTab]  = useState('today')
  const [dbLoading, setDbLoading] = useState(true)

  // Habit state
  const [habits, setHabits] = useState(()=>{
    const g={}; HABITS.forEach(h=>{g[h.id]=Array(WEEKS).fill(null).map(()=>Array(7).fill(false))}); return g
  })
  const [counters, setCounters] = useState({}) // "hid-week-day" -> number
  const [xp,  setXp]    = useState(0)
  const [streak, setStreak] = useState(0)
  const [xpPop, setXpPop]   = useState(null)
  const [animCell, setAnimCell] = useState(null)

  // Listings
  const [listings, setListings]   = useState([])
  const [newAddr,  setNewAddr]    = useState('')
  const [newUnits, setNewUnits]   = useState('1')

  // Pipeline
  const [offersMade,     setOffersMade]     = useState([])
  const [offersReceived, setOffersReceived] = useState([])
  const [pendingDeals,   setPendingDeals]   = useState([])
  const [closedDeals,    setClosedDeals]    = useState([])

  // Commission summary opt-in
  const [showCommSummary, setShowCommSummary] = useState(false)

  // ── Load ────────────────────────────────────────────────────────────────────
  useEffect(()=>{ loadAll() },[user])

  async function loadAll() {
    if (!user) return
    setDbLoading(true)

    const [habRes, listRes, txRes, profRes] = await Promise.all([
      supabase.from('habit_completions').select('*').eq('user_id',user.id).eq('month_year',MONTH_YEAR),
      supabase.from('listings').select('*').eq('user_id',user.id).eq('month_year',MONTH_YEAR),
      supabase.from('transactions').select('*').eq('user_id',user.id).eq('month_year',MONTH_YEAR),
      supabase.from('profiles').select('*').eq('id',user.id).single(),
    ])

    if (habRes.data?.length) {
      const g={}; HABITS.forEach(h=>{g[h.id]=Array(WEEKS).fill(null).map(()=>Array(7).fill(false))})
      const cnts={}
      habRes.data.forEach(c=>{
        if(g[c.habit_id]) g[c.habit_id][c.week_index][c.day_index]=true
        if(c.counter_value>0) cnts[`${c.habit_id}-${c.week_index}-${c.day_index}`]=c.counter_value
      })
      setHabits(g); setCounters(cnts)
    }

    if (listRes.data) setListings(listRes.data.map(l=>({id:l.id,address:l.address,units:String(l.unit_count||1),status:l.status})))

    if (txRes.data) {
      const m = t => ({ id:t.id, address:t.address, price:t.price||'', commission:t.commission||'', status:t.status||'active', closedFrom:t.closed_from||'' })
      setOffersMade(    txRes.data.filter(t=>t.type==='offer_made').map(m))
      setOffersReceived(txRes.data.filter(t=>t.type==='offer_received').map(m))
      setPendingDeals(  txRes.data.filter(t=>t.type==='pending').map(m))
      setClosedDeals(   txRes.data.filter(t=>t.type==='closed').map(m))
    }

    if (profRes.data) {
      setXp(profRes.data.xp||0)
      setStreak(profRes.data.streak||0)
      setShowCommSummary(profRes.data.show_commission||false)
    }
    setDbLoading(false)
  }

  // ── XP helper ───────────────────────────────────────────────────────────────
  async function addXp(amount, color='#d4a853') {
    const nxp = xp + amount
    setXp(nxp)
    setXpPop({ val:`+${amount} XP`, color })
    setTimeout(()=>setXpPop(null), 1400)
    await supabase.from('profiles').update({xp:nxp}).eq('id',user.id)
    return nxp
  }

  // ── Habit toggle ─────────────────────────────────────────────────────────
  async function toggleHabit(hid, week, day) {
    const newVal = !habits[hid][week][day]
    setHabits(prev=>{ const n={...prev}; n[hid]=n[hid].map((w,wi)=>wi===week?w.map((d,di)=>di===day?newVal:d):w); return n })
    const h = HABITS.find(x=>x.id===hid)
    const cat = CAT_STYLE[h.cat]
    if (newVal) {
      await addXp(h.xp, cat.color)
      const ckey = `${hid}-${week}-${day}`
      await supabase.from('habit_completions').upsert({
        user_id:user.id, habit_id:hid, week_index:week, day_index:day,
        month_year:MONTH_YEAR, xp_earned:h.xp,
        counter_value: h.counter ? (counters[ckey]||1) : 0
      },{onConflict:'user_id,habit_id,week_index,day_index,month_year'})
    } else {
      const lost = h.xp + (counters[`${hid}-${week}-${day}`]||0)*(h.xpEach||0)
      const nxp = Math.max(0, xp-lost)
      setXp(nxp)
      await supabase.from('profiles').update({xp:nxp}).eq('id',user.id)
      await supabase.from('habit_completions').delete()
        .eq('user_id',user.id).eq('habit_id',hid).eq('week_index',week).eq('day_index',day).eq('month_year',MONTH_YEAR)
      if (h.counter) setCounters(prev=>{ const n={...prev}; delete n[`${hid}-${week}-${day}`]; return n })
    }
    setAnimCell(`${hid}-${week}-${day}`)
    setTimeout(()=>setAnimCell(null),300)
  }

  async function incrementCounter(hid, week, day) {
    const ckey  = `${hid}-${week}-${day}`
    const newCnt = (counters[ckey]||0) + 1
    setCounters(prev=>({...prev,[ckey]:newCnt}))
    const h   = HABITS.find(x=>x.id===hid)
    const cat = CAT_STYLE[h.cat]
    if (!habits[hid][week][day]) { await toggleHabit(hid,week,day); return }
    if (h.xpEach) await addXp(h.xpEach, cat.color)
    await supabase.from('habit_completions').upsert({
      user_id:user.id, habit_id:hid, week_index:week, day_index:day,
      month_year:MONTH_YEAR, xp_earned:(h.xp||0)+newCnt*(h.xpEach||0), counter_value:newCnt
    },{onConflict:'user_id,habit_id,week_index,day_index,month_year'})
  }

  // ── Pipeline helpers ─────────────────────────────────────────────────────
  async function dbInsertTx(type, item, closedFrom='') {
    const {data} = await supabase.from('transactions').insert({
      user_id:user.id, type, address:item.address, price:item.price||'',
      commission:item.commission||'', status:type==='closed'?'closed':'active',
      closed_from:closedFrom||item.closedFrom||null, month_year:MONTH_YEAR
    }).select().single()
    return data
  }
  async function dbDeleteTx(id) {
    if (id && typeof id !== 'number') await supabase.from('transactions').delete().eq('id',id)
  }

  // Status change on Offers Made / Offers Received
  async function handleOfferStatus(row, newStatus, srcSetter) {
    if (newStatus === 'pending') {
      srcSetter(prev=>prev.filter(r=>r.id!==row.id))
      const data = await dbInsertTx('pending', row, row.closedFrom||'Offers')
      if (data) setPendingDeals(prev=>[...prev,{...row,id:data.id,status:'active',closedFrom:'Offers'}])
      await dbDeleteTx(row.id)
      await addXp(PIPELINE_XP.went_pending, '#fbbf24')
    } else if (newStatus === 'closed') {
      srcSetter(prev=>prev.filter(r=>r.id!==row.id))
      const data = await dbInsertTx('closed', row, 'Offers')
      if (data) setClosedDeals(prev=>[...prev,{...row,id:data.id,status:'closed',closedFrom:'Offers'}])
      await dbDeleteTx(row.id)
      await addXp(PIPELINE_XP.closed, '#34d399')
    }
  }

  // Status change on Pending
  async function handlePendingStatus(row, newStatus) {
    if (newStatus === 'closed') {
      // Remove from pending visually BUT keep the pending count (don't delete DB row — instead update type to closed)
      setPendingDeals(prev=>prev.filter(r=>r.id!==row.id))
      // Insert a closed record; original pending record stays in DB for count preservation
      const data = await dbInsertTx('closed', row, row.closedFrom||'Pending')
      if (data) setClosedDeals(prev=>[...prev,{...row,id:data.id,status:'closed',closedFrom:row.closedFrom||'Pending'}])
      await addXp(PIPELINE_XP.closed, '#34d399')
    }
  }

  // ── Listings ─────────────────────────────────────────────────────────────
  async function addListing() {
    if (!newAddr.trim()) return
    const {data} = await supabase.from('listings').insert({
      user_id:user.id, address:newAddr.trim(), unit_count:parseInt(newUnits)||1, status:'active', month_year:MONTH_YEAR
    }).select().single()
    if (data) setListings(prev=>[...prev,{id:data.id,address:data.address,units:String(data.unit_count),status:'active'}])
    setNewAddr(''); setNewUnits('1')
  }
  async function updateListing(id, field, val) {
    setListings(prev=>prev.map(l=>l.id===id?{...l,[field]:val}:l))
    if (field==='units')   await supabase.from('listings').update({unit_count:parseInt(val)||1}).eq('id',id)
    if (field==='address') await supabase.from('listings').update({address:val}).eq('id',id)
    if (field==='status')  await supabase.from('listings').update({status:val}).eq('id',id)
  }
  function removeListing(id) {
    setListings(prev=>prev.filter(l=>l.id!==id))
    supabase.from('listings').delete().eq('id',id)
  }

  // When listing → pending: auto-create a pending deal
  async function handleListingStatus(listing, newStatus) {
    await updateListing(listing.id, 'status', newStatus)
    if (newStatus === 'pending') {
      // Auto-add to Went Pending pipeline
      const data = await dbInsertTx('pending', { address:listing.address, price:'', commission:'' }, 'Listing')
      if (data) setPendingDeals(prev=>[...prev,{id:data.id,address:listing.address,price:'',commission:'',status:'active',closedFrom:'Listing'}])
      await addXp(PIPELINE_XP.went_pending, '#fbbf24')
    } else if (newStatus === 'closed') {
      // If there's already a pending deal for this listing, move that to closed (preserving pending count)
      const existingPending = pendingDeals.find(p=>p.address===listing.address&&p.closedFrom==='Listing')
      if (existingPending) {
        setPendingDeals(prev=>prev.filter(r=>r.id!==existingPending.id))
        const data = await dbInsertTx('closed', existingPending, 'Listing')
        if (data) setClosedDeals(prev=>[...prev,{...existingPending,id:data.id,status:'closed',closedFrom:'Listing'}])
        // Keep the pending DB row for count — just add a closed record
      } else {
        // Direct to closed with no prior pending
        const data = await dbInsertTx('closed', { address:listing.address, price:'', commission:'' }, 'Listing')
        if (data) setClosedDeals(prev=>[...prev,{id:data.id,address:listing.address,price:'',commission:'',status:'closed',closedFrom:'Listing'}])
      }
      removeListing(listing.id)
      await addXp(PIPELINE_XP.closed, '#34d399')
    }
  }

  // ── Commission toggle ─────────────────────────────────────────────────────
  async function toggleCommSummary(val) {
    setShowCommSummary(val)
    await supabase.from('profiles').update({show_commission:val}).eq('id',user.id)
  }

  // ── Derived stats ─────────────────────────────────────────────────────────
  const rank     = getRank(xp)
  const nextRank = RANKS[RANKS.indexOf(rank)+1]
  const rankPct  = nextRank ? Math.round((xp-rank.min)/(nextRank.min-rank.min)*100) : 100

  const totalHabitChecks = HABITS.reduce((a,h)=>a+habits[h.id].flat().filter(Boolean).length,0)
  const totalPossible    = HABITS.length*WEEKS*7
  const monthPct         = Math.round(totalHabitChecks/totalPossible*100)
  const todayChecks      = HABITS.filter(h=>habits[h.id][today.week][today.day]).length
  const todayPct         = Math.round(todayChecks/HABITS.length*100)
  const totalAppts       = Object.entries(counters).filter(([k])=>k.startsWith('appointments')).reduce((a,[,v])=>a+v,0)
  const totalShowings    = Object.entries(counters).filter(([k])=>k.startsWith('showing')).reduce((a,[,v])=>a+v,0)
  const totalListings    = listings.reduce((a,l)=>a+(parseInt(l.units)||0),0)

  const closedVol  = closedDeals.reduce((a,r)=>{ const n=parseFloat(String(r.price||'').replace(/[^0-9.]/g,'')); return a+(isNaN(n)?0:n) },0)
  const closedComm = closedDeals.reduce((a,r)=>{ const n=parseFloat(String(r.commission||'').replace(/[^0-9.]/g,'')); return a+(isNaN(n)?0:n) },0)

  const weekColors = ['#34d399','#60a5fa','#f472b6','#fbbf24']

  if (page==='leaderboard') return <Leaderboard onBack={()=>setPage('dashboard')}/>
  if (page==='teams')       return <TeamsPage   onBack={()=>setPage('dashboard')}/>
  if (page==='profile')     return <ProfilePage onBack={()=>setPage('dashboard')}/>

  const todayName = FULL_DAYS[today.day]
  const dateStr   = new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})

  // motivational quote rotates daily
  const quotes = [
    "The market rewards consistency.",
    "Every call is a door. Open more doors.",
    "Top producers aren't born — they're built one habit at a time.",
    "Your pipeline today is your commission next quarter.",
    "Make the uncomfortable call. Every time.",
    "Discipline is the bridge between goals and achievement.",
    "Listings don't find agents. Agents find listings.",
  ]
  const quote = quotes[new Date().getDay()]

  return (
    <>
      <style>{CSS}</style>

      {xpPop && <div style={{position:'fixed',top:68,right:28,zIndex:9999,pointerEvents:'none',
        fontFamily:"'Instrument Serif',serif",fontSize:24,color:xpPop.color,
        animation:'floatXp 1.4s ease forwards',textShadow:`0 0 24px ${xpPop.color}66`}}>
        {xpPop.val}
      </div>}

      <div style={{minHeight:'100vh',background:'var(--bg)'}}>

        {/* ── Top Nav ── */}
        <nav style={{background:'rgba(9,9,11,0.95)',backdropFilter:'blur(12px)',borderBottom:'1px solid var(--b1)',
          padding:'0 24px',display:'flex',justifyContent:'space-between',alignItems:'center',height:56,
          position:'sticky',top:0,zIndex:100}}>

          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <span style={{fontFamily:"'Instrument Serif',serif",fontSize:20,color:'var(--gold)'}}>RealtyGrind</span>
            <span style={{fontSize:10,color:'var(--dim)',borderLeft:'1px solid var(--b2)',paddingLeft:10,fontFamily:"'JetBrains Mono',monospace"}}>
              {MONTH_YEAR}
            </span>
          </div>

          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <button className="nav-btn" onClick={()=>setPage('leaderboard')}>🏆 Board</button>
            <button className="nav-btn" onClick={()=>setPage('teams')}>
              👥 {profile?.teams?.name||'Teams'}
            </button>

            {/* Rank pill */}
            <div style={{background:'var(--s2)',border:`1px solid ${rank.color}33`,borderRadius:9,
              padding:'6px 14px',display:'flex',alignItems:'center',gap:10}}>
              <div>
                <div style={{fontSize:9,color:'var(--dim)',letterSpacing:.8}}>RANK</div>
                <div style={{fontFamily:"'DM Sans',sans-serif",fontWeight:600,fontSize:12,color:rank.color}}>
                  {rank.icon} {rank.name}
                </div>
              </div>
              <div style={{width:52,height:5,background:'var(--b1)',borderRadius:3,overflow:'hidden'}}>
                <div style={{height:'100%',background:rank.color,borderRadius:3,width:`${rankPct}%`,
                  transition:'width .6s ease',boxShadow:`0 0 6px ${rank.color}88`}}/>
              </div>
              <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:11,color:rank.color,fontWeight:700}}>
                {xp.toLocaleString()}
              </div>
            </div>

            <div style={{background:'var(--s2)',border:'1px solid var(--b1)',borderRadius:9,padding:'6px 12px',
              textAlign:'center',minWidth:56}}>
              <div style={{fontSize:9,color:'var(--dim)'}}>STREAK</div>
              <div style={{fontFamily:"'Instrument Serif',serif",fontSize:18,color:'#fb923c'}}>🔥 {streak}</div>
            </div>

            <button className="nav-btn" onClick={()=>setPage('profile')}
              style={{background:'var(--gold2)',borderColor:'var(--gold)',color:'var(--gold)'}}>
              👤 {profile?.full_name?.split(' ')[0]||'Profile'}
            </button>
            <button className="btn-ghost" onClick={()=>supabase.auth.signOut()} style={{fontSize:11}}>Sign out</button>
          </div>
        </nav>

        {dbLoading ? (
          <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'70vh',
            color:'var(--sub)',fontSize:14,gap:10}}>
            <div style={{width:16,height:16,border:'2px solid var(--gold)',borderTopColor:'transparent',
              borderRadius:'50%',animation:'spin 1s linear infinite'}}/>
            Loading your dashboard…
          </div>
        ) : (
        <div style={{maxWidth:1200,margin:'0 auto',padding:'24px 20px'}}>

          {/* ── Today Banner ── */}
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-end',marginBottom:20,flexWrap:'wrap',gap:10}}>
            <div>
              <div style={{fontFamily:"'Instrument Serif',serif",fontSize:32,color:'var(--text)',lineHeight:1,marginBottom:4}}>
                {todayName}
                <span style={{color:'var(--gold)'}}> —</span>
              </div>
              <div style={{fontSize:12,color:'var(--sub)',fontFamily:"'JetBrains Mono',monospace"}}>{dateStr}</div>
            </div>
            <div style={{fontFamily:"'Instrument Serif',serif",fontStyle:'italic',fontSize:15,color:'var(--dim)',maxWidth:380,textAlign:'right',lineHeight:1.5}}>
              "{quote}"
            </div>
          </div>

          {/* ── Summary Stats ── */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(128px,1fr))',gap:10,marginBottom:20}}>
            <StatCard icon="⚡" label="TODAY" value={`${todayPct}%`} color={todayPct>=80?'#34d399':todayPct>=50?'#fbbf24':'#f87171'}
              sub={`${todayChecks}/${HABITS.length} habits`} border={todayPct>=80?'rgba(52,211,153,.2)':'var(--b1)'}/>
            <StatCard icon="📅" label="THIS MONTH" value={`${monthPct}%`} color='#d4a853'
              sub={`${totalHabitChecks}/${totalPossible}`}/>
            <StatCard icon="📅" label="APPOINTMENTS" value={totalAppts} color='#34d399'
              sub="this month"/>
            <StatCard icon="🔑" label="SHOWINGS" value={totalShowings} color='#60a5fa'
              sub="this month"/>
            <StatCard icon="🏡" label="LISTED" value={totalListings} color='#38bdf8'
              sub="units this month"/>
            <StatCard icon="📤" label="OFFERS MADE" value={offersMade.length} color='#60a5fa'/>
            <StatCard icon="📥" label="OFFERS REC'D" value={offersReceived.length} color='#c084fc'/>
            <StatCard icon="⏳" label="WENT PENDING" value={pendingDeals.length} color='#fbbf24'/>
            <StatCard icon="🎉" label="CLOSED" value={closedDeals.length} color='#34d399'
              sub={closedVol>0?fmtMoney(closedVol):null}/>
            {showCommSummary && closedComm>0 && (
              <StatCard icon="💰" label="COMMISSION" value={fmtMoney(closedComm)||'$0'} color='#34d399'
                border='rgba(52,211,153,.2)'/>
            )}
          </div>

          {/* ── Pipeline XP bar ── */}
          <div className="card2" style={{padding:'10px 18px',marginBottom:20,display:'flex',gap:20,alignItems:'center',flexWrap:'wrap'}}>
            <span style={{fontSize:10,color:'var(--dim)',letterSpacing:.8}}>PIPELINE XP</span>
            {[
              {l:'Offer Submitted/Received', xp:PIPELINE_XP.offer_made,    c:'#60a5fa'},
              {l:'Went Pending',             xp:PIPELINE_XP.went_pending,  c:'#fbbf24'},
              {l:'Closed',                   xp:PIPELINE_XP.closed,        c:'#34d399'},
            ].map((p,i)=>(
              <div key={i} style={{display:'flex',alignItems:'center',gap:6}}>
                <span style={{fontSize:9,padding:'2px 7px',borderRadius:4,background:`${p.c}18`,
                  color:p.c,border:`1px solid ${p.c}33`,fontFamily:"'JetBrains Mono',monospace",fontWeight:700}}>
                  +{p.xp} XP
                </span>
                <span style={{fontSize:11,color:'var(--sub)'}}>{p.l}</span>
              </div>
            ))}
            <label style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:6,fontSize:11,color:'var(--sub)',cursor:'pointer'}}>
              <input type="checkbox" checked={showCommSummary} onChange={e=>toggleCommSummary(e.target.checked)} style={{accentColor:'var(--gold)'}}/>
              Show commission in summary
            </label>
          </div>

          {/* ── View Tabs ── */}
          <div style={{display:'flex',borderBottom:'1px solid var(--b1)',marginBottom:24,gap:4}}>
            {[
              {id:'today',   label:`Today — ${todayName}`},
              {id:'monthly', label:'Monthly Grid'},
              {id:'weekly',  label:'Weekly View'},
            ].map(t=>(
              <button key={t.id} className={`tab${tab===t.id?' active':''}`} onClick={()=>setTab(t.id)}>
                {t.label}
              </button>
            ))}
          </div>

          {/* ══════════════════════════════════════════════════════════════════
              TODAY VIEW (default)
          ══════════════════════════════════════════════════════════════════ */}
          {tab==='today' && (
            <div style={{animation:'fadeUp .3s ease'}}>
              <div style={{display:'grid',gridTemplateColumns:'1fr 220px',gap:20,alignItems:'start'}}>

                {/* Habits list */}
                <div className="card" style={{padding:24}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
                    <div style={{fontFamily:"'Instrument Serif',serif",fontSize:18,color:'var(--text)'}}>
                      Daily Habits
                    </div>
                    <div style={{display:'flex',alignItems:'center',gap:10}}>
                      <Ring pct={todayPct} size={52} color={todayPct>=80?'#34d399':todayPct>=50?'#fbbf24':'#f87171'}/>
                      <div>
                        <div style={{fontFamily:"'Instrument Serif',serif",fontSize:22,color:'var(--text)',lineHeight:1}}>{todayChecks}/{HABITS.length}</div>
                        <div style={{fontSize:10,color:'var(--sub)'}}>completed</div>
                      </div>
                    </div>
                  </div>

                  <div style={{display:'flex',flexDirection:'column',gap:4}}>
                    {HABITS.map(h=>{
                      const done = habits[h.id][today.week][today.day]
                      const cs   = CAT_STYLE[h.cat]
                      const ckey = `${h.id}-${today.week}-${today.day}`
                      const cnt  = counters[ckey]||0

                      return (
                        <div key={h.id} className={`habit-row${done?' done':''}`}>
                          {/* Checkbox */}
                          <button className={`chk${done?' done':''}`}
                            onClick={()=>toggleHabit(h.id,today.week,today.day)}
                            style={done?{background:cs.bg,borderColor:cs.color,boxShadow:`0 0 8px ${cs.color}44`}:{}}>
                            {done && <svg width="12" height="9" viewBox="0 0 12 9" fill="none">
                              <path d="M1 4.5L4.5 8L11 1" stroke={cs.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>}
                          </button>

                          {/* Icon + label */}
                          <span style={{fontSize:16,flexShrink:0}}>{h.icon}</span>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontSize:13,color:done?'var(--sub)':'var(--text)',
                              textDecoration:done?'line-through':'none',fontWeight:done?400:500,
                              transition:'all .15s'}}>
                              {h.label}
                            </div>
                            <div style={{fontSize:10,color:'var(--dim)'}}>
                              +{h.xp} XP{h.xpEach?` · +${h.xpEach} per extra`:''}
                            </div>
                          </div>

                          {/* Category tag */}
                          <span style={{fontSize:9,padding:'2px 7px',borderRadius:4,background:cs.bg,
                            color:cs.color,border:`1px solid ${cs.border}`,fontWeight:500,flexShrink:0}}>
                            {h.cat}
                          </span>

                          {/* Counter */}
                          {h.counter && done && (
                            <div style={{display:'flex',alignItems:'center',gap:6,flexShrink:0}}>
                              <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:14,
                                color:cs.color,fontWeight:700,minWidth:20,textAlign:'center'}}>{cnt||1}</span>
                              <button className="cnt-btn"
                                onClick={()=>incrementCounter(h.id,today.week,today.day)}
                                style={{borderColor:cs.color,color:cs.color,background:cs.bg}}>
                                +
                              </button>
                            </div>
                          )}
                          {h.counter && !done && (
                            <button className="cnt-btn"
                              onClick={()=>incrementCounter(h.id,today.week,today.day)}
                              style={{borderColor:'var(--b3)',color:'var(--dim)',background:'transparent'}}>
                              +
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Today sidebar */}
                <div style={{display:'flex',flexDirection:'column',gap:12}}>
                  {/* Day progress */}
                  <div className="card" style={{padding:20,textAlign:'center'}}>
                    <Ring pct={todayPct} size={100}
                      color={todayPct>=80?'#34d399':todayPct>=50?'#fbbf24':'#f87171'}
                      track='rgba(255,255,255,0.05)' sw={8}/>
                    <div style={{marginTop:12,fontFamily:"'Instrument Serif',serif",fontSize:15,color:'var(--text)'}}>
                      {todayPct===100?'Perfect day! 🎉':todayPct>=80?'Almost there!':todayPct>=50?'Good progress':'Keep going'}
                    </div>
                    <div style={{fontSize:11,color:'var(--sub)',marginTop:4}}>
                      {HABITS.length-todayChecks} habits remaining
                    </div>
                  </div>

                  {/* Today counters */}
                  {HABITS.filter(h=>h.counter && habits[h.id][today.week][today.day]).length > 0 && (
                    <div className="card" style={{padding:16}}>
                      <div style={{fontSize:10,color:'var(--dim)',letterSpacing:.8,marginBottom:10}}>TODAY'S COUNTS</div>
                      {HABITS.filter(h=>h.counter).map(h=>{
                        const ckey = `${h.id}-${today.week}-${today.day}`
                        const cnt  = counters[ckey]||0
                        if (!cnt && !habits[h.id][today.week][today.day]) return null
                        const cs = CAT_STYLE[h.cat]
                        return (
                          <div key={h.id} style={{display:'flex',justifyContent:'space-between',
                            alignItems:'center',marginBottom:8,padding:'6px 8px',borderRadius:7,
                            background:habits[h.id][today.week][today.day]?cs.bg:'transparent'}}>
                            <span style={{fontSize:12,color:'var(--sub)'}}>{h.icon} {h.label}</span>
                            <span style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:700,
                              fontSize:16,color:cs.color}}>{cnt||0}</span>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* XP earned today */}
                  <div className="card" style={{padding:16,textAlign:'center',background:'var(--gold3)',border:'1px solid rgba(212,168,83,.2)'}}>
                    <div style={{fontSize:10,color:'var(--gold)',letterSpacing:.8,marginBottom:4}}>XP EARNED TODAY</div>
                    <div style={{fontFamily:"'Instrument Serif',serif",fontSize:32,color:'var(--gold)'}}>
                      {HABITS.reduce((acc,h)=>{
                        if(!habits[h.id][today.week][today.day]) return acc
                        const ckey=`${h.id}-${today.week}-${today.day}`
                        const cnt=counters[ckey]||0
                        return acc + h.xp + (cnt>0?Math.max(0,cnt-1)*(h.xpEach||0):0)
                      },0).toLocaleString()}
                    </div>
                    <div style={{fontSize:10,color:'var(--dim)'}}>total XP: {xp.toLocaleString()}</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              MONTHLY GRID
          ══════════════════════════════════════════════════════════════════ */}
          {tab==='monthly' && (
            <div style={{animation:'fadeUp .3s ease'}}>

              {/* Week rings */}
              <div className="card" style={{padding:20,marginBottom:16}}>
                <div style={{fontSize:10,color:'var(--dim)',letterSpacing:.8,marginBottom:16}}>WEEKLY COMPLETION</div>
                <div style={{display:'flex',gap:24,flexWrap:'wrap',justifyContent:'space-around',alignItems:'center'}}>
                  {Array(WEEKS).fill(null).map((_,wi)=>{
                    const wTotal=HABITS.reduce((a,h)=>a+habits[h.id][wi].filter(Boolean).length,0)
                    return <Ring key={wi} pct={Math.round(wTotal/(HABITS.length*7)*100)} size={88}
                      color={weekColors[wi]} label={`Week ${wi+1}`} sub={`${wTotal}/${HABITS.length*7}`}/>
                  })}
                  <div style={{width:1,height:72,background:'var(--b1)'}}/>
                  <Ring pct={monthPct} size={104} color='var(--gold)' label="Monthly" sub={`${totalHabitChecks}/${totalPossible}`}/>
                </div>
              </div>

              {/* Grid table */}
              <div className="card" style={{overflowX:'auto'}}>
                <table style={{width:'100%',borderCollapse:'collapse',minWidth:780}}>
                  <thead>
                    <tr style={{borderBottom:'1px solid var(--b1)'}}>
                      <th style={{padding:'12px 16px',textAlign:'left',fontSize:10,color:'var(--dim)',
                        letterSpacing:.8,fontWeight:500,minWidth:220}}>HABIT</th>
                      {Array(WEEKS).fill(null).map((_,wi)=>(
                        <th key={wi} colSpan={7} style={{padding:'10px 4px',textAlign:'center',
                          fontSize:10,color:weekColors[wi],letterSpacing:.8,fontWeight:600,
                          borderLeft:'1px solid var(--b1)'}}>WK {wi+1}</th>
                      ))}
                      <th style={{padding:'10px 12px',textAlign:'center',fontSize:10,color:'var(--dim)',
                        letterSpacing:.8,fontWeight:500,borderLeft:'1px solid var(--b1)',whiteSpace:'nowrap'}}>XP</th>
                      <th style={{padding:'10px 12px',textAlign:'center',fontSize:10,color:'var(--dim)',
                        letterSpacing:.8,fontWeight:500}}>%</th>
                    </tr>
                    <tr style={{borderBottom:'1px solid var(--b1)',background:'var(--s2)'}}>
                      <td style={{padding:'4px 16px',fontSize:9,color:'var(--dim)',fontFamily:"'JetBrains Mono',monospace"}}>{MONTH_YEAR}</td>
                      {Array(WEEKS).fill(null).map((_,wi)=>DAYS.map((d,di)=>(
                        <td key={`${wi}-${di}`} style={{padding:'4px 2px',textAlign:'center',
                          fontSize:9,fontWeight:600,borderLeft:di===0?'1px solid var(--b1)':'none',
                          color:wi===today.week&&di===today.day?'var(--gold)':'var(--dim)'}}>
                          {d[0]}
                        </td>
                      )))}
                      <td/><td/>
                    </tr>
                  </thead>
                  <tbody>
                    {HABITS.map((h,hi)=>{
                      const done=habits[h.id].flat().filter(Boolean).length
                      const pct=Math.round(done/(WEEKS*7)*100)
                      const cs=CAT_STYLE[h.cat]
                      const habitTotal=h.counter?Object.entries(counters).filter(([k])=>k.startsWith(h.id)).reduce((a,[,v])=>a+v,0):0
                      const xpEarned=done*h.xp+(habitTotal>0?habitTotal*(h.xpEach||0):0)
                      return (
                        <tr key={h.id} style={{borderBottom:'1px solid var(--b1)',
                          background:hi%2===0?'transparent':'rgba(255,255,255,0.01)'}}>
                          <td style={{padding:'8px 16px'}}>
                            <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                              <span style={{fontSize:14}}>{h.icon}</span>
                              <span style={{fontSize:12,color:'var(--text)',fontWeight:500}}>{h.label}</span>
                              <span style={{fontSize:9,padding:'1px 6px',borderRadius:4,background:cs.bg,
                                color:cs.color,border:`1px solid ${cs.border}`}}>{h.cat}</span>
                              {habitTotal>0&&<span style={{fontSize:9,padding:'1px 6px',borderRadius:4,
                                background:`${cs.color}18`,color:cs.color,fontFamily:"'JetBrains Mono',monospace",fontWeight:700}}>×{habitTotal}</span>}
                            </div>
                          </td>
                          {Array(WEEKS).fill(null).map((_,wi)=>Array(7).fill(null).map((__,di)=>{
                            const checked=habits[h.id][wi][di]
                            const isToday=wi===today.week&&di===today.day
                            const ckey=`${h.id}-${wi}-${di}`
                            return (
                              <td key={`${wi}-${di}`} style={{textAlign:'center',padding:'6px 2px',
                                borderLeft:di===0?'1px solid var(--b1)':'none'}}>
                                {h.counter ? (
                                  <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:2}}>
                                    <button onClick={()=>toggleHabit(h.id,wi,di)}
                                      style={{width:20,height:20,borderRadius:5,border:`1.5px solid ${checked?cs.color:isToday?'rgba(212,168,83,.4)':'var(--b2)'}`,
                                        background:checked?cs.bg:'transparent',cursor:'pointer',
                                        display:'flex',alignItems:'center',justifyContent:'center',
                                        animation:animCell===ckey?'pop .25s ease':'none',
                                        boxShadow:checked?`0 0 6px ${cs.color}44`:'none'}}>
                                      {checked&&<span style={{fontSize:9,color:cs.color,fontWeight:700}}>✓</span>}
                                      {isToday&&!checked&&<span style={{width:5,height:5,borderRadius:'50%',background:'var(--gold)',display:'block'}}/>}
                                    </button>
                                    {checked&&(
                                      <div style={{display:'flex',alignItems:'center',gap:1}}>
                                        <span style={{fontSize:8,color:cs.color,fontWeight:700,fontFamily:"'JetBrains Mono',monospace"}}>{counters[ckey]||1}</span>
                                        <button onClick={()=>incrementCounter(h.id,wi,di)}
                                          style={{width:12,height:12,borderRadius:3,border:`1px solid ${cs.color}`,
                                            background:'transparent',cursor:'pointer',fontSize:9,lineHeight:1,
                                            color:cs.color,fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center'}}>
                                          +
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <button onClick={()=>toggleHabit(h.id,wi,di)}
                                    style={{width:20,height:20,borderRadius:5,
                                      border:`1.5px solid ${checked?cs.color:isToday?'rgba(212,168,83,.4)':'var(--b2)'}`,
                                      background:checked?cs.bg:'transparent',cursor:'pointer',
                                      display:'flex',alignItems:'center',justifyContent:'center',
                                      animation:animCell===ckey?'pop .25s ease':'none',
                                      boxShadow:checked?`0 0 6px ${cs.color}44`:'none',transition:'all .15s'}}>
                                    {checked&&<span style={{fontSize:9,color:cs.color,fontWeight:700}}>✓</span>}
                                    {isToday&&!checked&&<span style={{width:5,height:5,borderRadius:'50%',background:'var(--gold)',display:'block'}}/>}
                                  </button>
                                )}
                              </td>
                            )
                          }))}
                          <td style={{padding:'0 12px',textAlign:'center',fontSize:11,color:cs.color,
                            fontFamily:"'JetBrains Mono',monospace",fontWeight:700,
                            borderLeft:'1px solid var(--b1)',whiteSpace:'nowrap'}}>
                            +{xpEarned.toLocaleString()}
                          </td>
                          <td style={{padding:'0 14px'}}>
                            <div style={{display:'flex',alignItems:'center',gap:6}}>
                              <div style={{flex:1,height:5,background:'var(--b1)',borderRadius:3,overflow:'hidden',minWidth:40}}>
                                <div style={{height:'100%',background:cs.color,borderRadius:3,width:`${pct}%`,transition:'width .4s'}}/>
                              </div>
                              <span style={{fontSize:10,color:'var(--dim)',width:28,fontFamily:"'JetBrains Mono',monospace"}}>{pct}%</span>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              WEEKLY VIEW
          ══════════════════════════════════════════════════════════════════ */}
          {tab==='weekly' && (
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))',gap:12,animation:'fadeUp .3s ease'}}>
              {DAYS.map((dayName,di)=>{
                const done   = HABITS.filter(h=>habits[h.id][today.week][di])
                const pct    = Math.round(done.length/HABITS.length*100)
                const isToday= di===today.day
                const dc     = ['#60a5fa','#34d399','#f472b6','#fbbf24','#fb923c','#c084fc','#38bdf8'][di]
                return (
                  <div key={di} className="card" style={{padding:16,border:isToday?`1px solid ${dc}44`:'1px solid var(--b1)',
                    boxShadow:isToday?`0 0 0 2px ${dc}22`:'none'}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
                      <div>
                        <div style={{fontFamily:"'DM Sans',sans-serif",fontWeight:600,fontSize:13,
                          color:isToday?dc:'var(--text)'}}>{dayName}</div>
                        {isToday&&<div style={{fontSize:9,color:dc,fontWeight:600,letterSpacing:.8}}>TODAY</div>}
                      </div>
                      <Ring pct={pct} size={46} color={dc} sw={4}/>
                    </div>
                    <div style={{display:'flex',flexDirection:'column',gap:4}}>
                      {HABITS.map(h=>{
                        const checked=habits[h.id][today.week][di]
                        const cs=CAT_STYLE[h.cat]
                        const ckey=`${h.id}-${today.week}-${di}`
                        return (
                          <div key={h.id}>
                            <button onClick={()=>toggleHabit(h.id,today.week,di)}
                              style={{display:'flex',alignItems:'center',gap:6,width:'100%',background:checked?cs.bg:'transparent',
                                border:`1px solid ${checked?cs.border:'transparent'}`,borderRadius:7,padding:'5px 7px',cursor:'pointer',textAlign:'left'}}>
                              <div style={{width:12,height:12,borderRadius:3,border:`1.5px solid ${checked?cs.color:'var(--b3)'}`,
                                background:checked?cs.bg:'transparent',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                                {checked&&<span style={{fontSize:7,color:cs.color,fontWeight:700}}>✓</span>}
                              </div>
                              <span style={{fontSize:10,flex:1,color:checked?'var(--sub)':'var(--text)',
                                textDecoration:checked?'line-through':'none'}}>{h.icon} {h.label}</span>
                              <span style={{fontSize:9,color:cs.color,fontFamily:"'JetBrains Mono',monospace",fontWeight:600}}>
                                +{h.xp}
                              </span>
                            </button>
                            {h.counter&&checked&&(
                              <div style={{display:'flex',alignItems:'center',gap:6,paddingLeft:24,marginTop:3}}>
                                <span style={{fontSize:10,color:'var(--sub)'}}>Count:</span>
                                <span style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:700,fontSize:13,color:cs.color}}>{counters[ckey]||1}</span>
                                <button onClick={()=>incrementCounter(h.id,today.week,di)}
                                  style={{width:18,height:18,borderRadius:5,border:`1px solid ${cs.color}`,background:cs.bg,
                                    cursor:'pointer',fontSize:12,fontWeight:700,color:cs.color,display:'flex',alignItems:'center',justifyContent:'center'}}>+</button>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                    <div style={{marginTop:10,display:'flex',justifyContent:'space-between',
                      fontSize:10,color:'var(--dim)',borderTop:'1px solid var(--b1)',paddingTop:8}}>
                      <span style={{color:dc}}>✓ {done.length}</span>
                      <span style={{color:'var(--sub)'}}>○ {HABITS.length-done.length}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* ── Listings Tracker ── */}
          <div style={{marginTop:28}}>
            <div style={{fontFamily:"'Instrument Serif',serif",fontSize:18,color:'var(--text)',marginBottom:4}}>
              Listings Tracker
            </div>
            <div style={{fontSize:11,color:'var(--sub)',marginBottom:14}}>
              Mark as <strong>Pending</strong> to auto-create a pipeline entry · Mark as <strong>Closed</strong> to complete the deal
            </div>

            <div className="card" style={{padding:20}}>
              {/* Col headers */}
              <div style={{display:'grid',gridTemplateColumns:'1fr 90px 170px 36px',gap:8,padding:'4px 12px',marginBottom:8}}>
                <span style={{fontSize:9,color:'var(--dim)',letterSpacing:.8}}>ADDRESS</span>
                <span style={{fontSize:9,color:'var(--dim)',letterSpacing:.8}}>UNITS</span>
                <span style={{fontSize:9,color:'var(--dim)',letterSpacing:.8}}>STATUS</span>
                <span/>
              </div>

              {listings.length===0 && <div style={{textAlign:'center',padding:'20px',color:'var(--dim)',fontSize:12}}>No listings yet</div>}

              <div style={{display:'flex',flexDirection:'column',gap:5,marginBottom:12}}>
                {listings.map(l=>(
                  <div key={l.id} className="pipe-row" style={{gridTemplateColumns:'1fr 90px 170px 36px'}}>
                    <input className="pipe-input" value={l.address||''} onChange={e=>updateListing(l.id,'address',e.target.value)} placeholder="Property address…"/>
                    <div style={{display:'flex',alignItems:'center',gap:6}}>
                      <input type="number" min="1" value={l.units||1} onChange={e=>updateListing(l.id,'units',e.target.value)}
                        style={{width:40,background:'transparent',border:'none',color:'#60a5fa',
                          fontSize:14,fontFamily:"'JetBrains Mono',monospace",fontWeight:700,textAlign:'center'}}/>
                      <span style={{fontSize:10,color:'var(--dim)'}}>units</span>
                    </div>
                    <select className="pipe-select" value={l.status||'active'}
                      onChange={e=>handleListingStatus(l,e.target.value)}
                      style={{color:l.status==='closed'?'#34d399':l.status==='pending'?'#fbbf24':'var(--sub)'}}>
                      <option value="active">Active</option>
                      <option value="pending">Pending → auto-adds to pipeline</option>
                      <option value="closed">Closed → completes deal</option>
                    </select>
                    <button className="del-btn" onClick={()=>removeListing(l.id)}>✕</button>
                  </div>
                ))}
              </div>

              {/* Add listing */}
              <div style={{display:'grid',gridTemplateColumns:'1fr 90px 170px 36px',gap:8,borderTop:'1px solid var(--b1)',paddingTop:12}}>
                <input className="input" value={newAddr} onChange={e=>setNewAddr(e.target.value)}
                  onKeyDown={e=>e.key==='Enter'&&addListing()} placeholder="New listing address…" style={{padding:'8px 12px'}}/>
                <div style={{display:'flex',alignItems:'center',gap:6,background:'var(--s2)',
                  border:'1px solid var(--b2)',borderRadius:8,padding:'6px 10px'}}>
                  <input type="number" min="1" value={newUnits} onChange={e=>setNewUnits(e.target.value)}
                    style={{width:32,background:'transparent',border:'none',color:'#60a5fa',
                      fontSize:14,fontFamily:"'JetBrains Mono',monospace",fontWeight:700,textAlign:'center'}}/>
                  <span style={{fontSize:10,color:'var(--dim)'}}>units</span>
                </div>
                <div/>
                <button onClick={addListing} style={{background:'#60a5fa',border:'none',color:'#09090b',
                  borderRadius:8,padding:'8px',cursor:'pointer',fontSize:16,fontWeight:700,lineHeight:1}}>+</button>
              </div>
            </div>
          </div>

          {/* ── Pipeline ── */}
          <div style={{marginTop:28}}>
            <div style={{fontFamily:"'Instrument Serif',serif",fontSize:18,color:'var(--text)',marginBottom:4}}>
              Transaction Pipeline
            </div>
            <div style={{fontSize:11,color:'var(--sub)',marginBottom:14}}>
              Counts are preserved when deals move stages · Commission is per-deal and optional
            </div>

            <PipelineSection
              title="Offers Made" icon="📤" accentColor="#60a5fa"
              rows={offersMade} setRows={setOffersMade}
              onStatusChange={(row,st)=>handleOfferStatus(row,st,setOffersMade)}
            />
            <PipelineSection
              title="Offers Received" icon="📥" accentColor="#c084fc"
              rows={offersReceived} setRows={setOffersReceived}
              onStatusChange={(row,st)=>handleOfferStatus(row,st,setOffersReceived)}
            />
            <PipelineSection
              title="Went Pending" icon="⏳" accentColor="#fbbf24"
              rows={pendingDeals} setRows={setPendingDeals}
              onStatusChange={(row,st)=>handlePendingStatus(row,st)}
            />
            <PipelineSection
              title="Closed" icon="🎉" accentColor="#34d399"
              rows={closedDeals} setRows={setClosedDeals}
              showSource={true}
            />
          </div>

          <div style={{height:48}}/>
          <div style={{textAlign:'center',fontSize:10,color:'var(--dim)',fontFamily:"'JetBrains Mono',monospace",letterSpacing:2,paddingBottom:24}}>
            REALTYGRIND · {MONTH_YEAR} · CLOSE MORE EVERY DAY
          </div>

        </div>
        )}
      </div>
    </>
  )
}

// ─── Root ─────────────────────────────────────────────────────────────────────

function AppInner() {
  const { user, loading } = useAuth()
  if (loading) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',
      background:'#09090b',fontFamily:"'Instrument Serif',serif",fontSize:20,color:'#d4a853',gap:12}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Instrument+Serif&display=swap');
        @keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{width:20,height:20,border:'2px solid #d4a853',borderTopColor:'transparent',
        borderRadius:'50%',animation:'spin 1s linear infinite'}}/>
      RealtyGrind
    </div>
  )
  return user ? <Dashboard/> : <AuthPage/>
}

export default function App() {
  return <AuthProvider><AppInner/></AuthProvider>
}
