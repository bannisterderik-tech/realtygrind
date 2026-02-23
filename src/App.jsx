import { useState, useEffect } from 'react'
import { AuthProvider, useAuth } from './lib/AuthContext'
import { supabase } from './lib/supabase'
import AuthPage from './pages/AuthPage'
import Leaderboard from './pages/Leaderboard'
import TeamsPage from './pages/TeamsPage'
import ProfilePage from './pages/ProfilePage'

// ─── Constants ───────────────────────────────────────────────────────────────

// xpPerIncrement = XP awarded each time + is pressed (counter habits)
// xp = base XP for checking the habit at all
const HABITS = [
  { id: 'prospecting',  label: 'Prospecting Calls',    icon: '📞', xp: 25, category: 'leads',     hasCounter: true, xpPerIncrement: 10 },
  { id: 'followup',     label: 'Follow-Up Emails',     icon: '✉️', xp: 15, category: 'leads',     hasCounter: true, xpPerIncrement: 8  },
  { id: 'appointments', label: 'Booked Appointments',  icon: '📅', xp: 30, category: 'leads',     hasCounter: true, xpPerIncrement: 25 },
  { id: 'showing',      label: 'Property Showings',    icon: '🔑', xp: 30, category: 'leads',     hasCounter: true, xpPerIncrement: 20 },
  { id: 'listings',     label: 'New Listings Taken',   icon: '🏠', xp: 25, category: 'market',    hasCounter: true, xpPerIncrement: 30 },
  { id: 'social',       label: 'Social Media Posts',   icon: '📱', xp: 10, category: 'marketing', hasCounter: true, xpPerIncrement: 8  },
  { id: 'crm',          label: 'CRM Updates',          icon: '💾', xp: 15, category: 'admin',     hasCounter: true, xpPerIncrement: 5  },
  { id: 'market',       label: 'Market Analysis',      icon: '📊', xp: 35, category: 'market' },
  { id: 'networking',   label: 'Network/Referrals',    icon: '🤝', xp: 20, category: 'leads',     hasCounter: true, xpPerIncrement: 15 },
  { id: 'training',     label: 'Training/Learning',    icon: '📚', xp: 20, category: 'growth' },
  { id: 'review',       label: 'Client Reviews Asked', icon: '⭐', xp: 20, category: 'marketing', hasCounter: true, xpPerIncrement: 15 },
]

// XP awarded for pipeline events (on top of habit XP)
const PIPELINE_XP = {
  offer_made:     75,
  offer_received: 75,
  went_pending:   150,
  closed:         300,
}

const DAYS      = ['Su','Mo','Tu','We','Th','Fr','Sa']
const FULL_DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
const WEEKS     = 4

const RANKS = [
  { name: 'Rookie Agent',  min: 0,    max: 500,      color: '#94a3b8', bg: '#f1f5f9', icon: '🏅' },
  { name: 'Associate',     min: 500,  max: 1500,     color: '#16a34a', bg: '#dcfce7', icon: '🥈' },
  { name: 'Senior Agent',  min: 1500, max: 3000,     color: '#ca8a04', bg: '#fef9c3', icon: '🥇' },
  { name: 'Top Producer',  min: 3000, max: 6000,     color: '#ea580c', bg: '#ffedd5', icon: '🏆' },
  { name: 'Elite Broker',  min: 6000, max: Infinity, color: '#7c3aed', bg: '#ede9fe', icon: '💎' },
]

const CATEGORY_COLORS = {
  leads:     { text: '#15803d', bg: '#dcfce7', border: '#86efac' },
  market:    { text: '#0369a1', bg: '#e0f2fe', border: '#7dd3fc' },
  marketing: { text: '#be185d', bg: '#fce7f3', border: '#f9a8d4' },
  admin:     { text: '#c2410c', bg: '#ffedd5', border: '#fdba74' },
  growth:    { text: '#6d28d9', bg: '#ede9fe', border: '#c4b5fd' },
}

const MONTH_YEAR = new Date().toISOString().slice(0, 7)

function getRank(xp) {
  return RANKS.find(r => xp >= r.min && xp < r.max) || RANKS[RANKS.length - 1]
}
function getToday() {
  const d = new Date()
  return { week: Math.min(Math.floor((d.getDate()-1)/7),3), day: d.getDay() }
}
function fmtVal(v) {
  const n = parseFloat(String(v||'').replace(/[^0-9.]/g,''))
  if (isNaN(n)||n===0) return null
  return n>=1000000 ? '$'+(n/1000000).toFixed(2)+'M' : n>=1000 ? '$'+(n/1000).toFixed(0)+'K' : '$'+n.toFixed(0)
}
function fmtFull(v) {
  const n = parseFloat(String(v||'').replace(/[^0-9.]/g,''))
  if (isNaN(n)||n===0) return '$0'
  return '$'+n.toLocaleString('en-US', { minimumFractionDigits:0, maximumFractionDigits:0 })
}

// ─── UI Helpers ───────────────────────────────────────────────────────────────

function CircleProgress({ percent, size=80, color='#16a34a', trackColor='#e2e8f0', label, sublabel, textColor='#1e293b' }) {
  const r=( size-10)/2, circ=2*Math.PI*r, dash=circ*(Math.min(percent,100)/100)
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
      <svg width={size} height={size} style={{ transform:'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={trackColor} strokeWidth={7} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={7}
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          style={{ transition:'stroke-dasharray 0.6s cubic-bezier(.4,2,.6,1)' }} />
        <text x={size/2} y={size/2+1} textAnchor="middle" dominantBaseline="middle"
          fill={textColor} fontSize={size>70?15:11} fontWeight="700" fontFamily="'Syne',sans-serif"
          style={{ transform:'rotate(90deg)', transformOrigin:`${size/2}px ${size/2}px` }}>
          {Math.round(percent)}%
        </text>
      </svg>
      {label    && <span style={{ fontSize:11, color:'#64748b', fontFamily:"'DM Mono',monospace", textAlign:'center' }}>{label}</span>}
      {sublabel && <span style={{ fontSize:10, color, fontFamily:"'DM Mono',monospace" }}>{sublabel}</span>}
    </div>
  )
}

function XpBadge({ xp, color }) {
  return <span style={{ fontSize:9, background: color+'22', color, border:`1px solid ${color}44`, borderRadius:5, padding:'1px 6px', fontWeight:700, fontFamily:"'Syne',sans-serif" }}>+{xp} XP</span>
}

// ─── Counter Cell (for habits with hasCounter) ────────────────────────────────

function CounterCell({ hid, wi, di, checked, isToday, catCol, animCell, onToggle, onIncrement, count }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:2 }}>
      <button onClick={()=>onToggle(hid,wi,di)} style={{ width:21, height:21, borderRadius:5, border:`1.5px solid ${checked?catCol.text:isToday?'#94a3b8':'#e2e8f0'}`, background:checked?catCol.bg:isToday?'#f0fdf4':'white', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:checked?`0 0 0 2px ${catCol.border}`:'none', animation:animCell===`${hid}-${wi}-${di}`?'pop 0.3s ease':'none' }}>
        {checked && <span style={{ color:catCol.text, fontSize:11, fontWeight:700 }}>✓</span>}
        {isToday&&!checked && <span style={{ width:6, height:6, borderRadius:'50%', background:'#86efac', display:'block' }} />}
      </button>
      {checked && (
        <div style={{ display:'flex', alignItems:'center', gap:1 }}>
          <span style={{ fontSize:9, color:catCol.text, fontWeight:800, fontFamily:"'Syne',sans-serif" }}>{count||1}</span>
          <button onClick={()=>onIncrement(hid,wi,di)} style={{ width:13, height:13, borderRadius:3, border:`1px solid ${catCol.border}`, background:catCol.bg, cursor:'pointer', fontSize:10, lineHeight:1, color:catCol.text, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center' }}>+</button>
        </div>
      )}
    </div>
  )
}

// ─── Transaction Tracker ──────────────────────────────────────────────────────

function TransactionTracker({ title, icon, color, bg, border, placeholder, priceLabel='Price', rows, setRows, onMarkClosed, onMoveToPending, showStatusDropdown=true, showCommission=false, commissionPct, onCommissionChange, showCommissionInSummary, onToggleShowCommission }) {

  const [newAddr, setNewAddr]   = useState('')
  const [newPrice, setNewPrice] = useState('')

  function add() {
    if (!newAddr.trim()) return
    setRows(prev => [...prev, { id:Date.now(), address:newAddr.trim(), price:newPrice.trim(), status:'active', commission:'' }])
    setNewAddr(''); setNewPrice('')
  }
  function remove(id)             { setRows(prev=>prev.filter(r=>r.id!==id)) }
  function update(id, field, val) { setRows(prev=>prev.map(r=>r.id===id?{...r,[field]:val}:r)) }

  function handleStatusChange(row, newStatus) {
    if (newStatus==='closed' && onMarkClosed)       { onMarkClosed({...row, closedFrom:title}); remove(row.id) }
    else if (newStatus==='pending' && onMoveToPending) { onMoveToPending({...row}); remove(row.id) }
    else update(row.id, 'status', newStatus)
  }

  const totalValue = rows.reduce((acc,r)=>{ const n=parseFloat(String(r.price).replace(/[^0-9.]/g,'')); return acc+(isNaN(n)?0:n) }, 0)
  const totalCommission = showCommission && commissionPct > 0
    ? rows.reduce((acc,r)=>{ const n=parseFloat(String(r.price).replace(/[^0-9.]/g,'')); return acc+(isNaN(n)?0:n*(commissionPct/100)) }, 0)
    : 0

  const statusOptions = [
    { value:'active',  label:'🟢 Active' },
    { value:'pending', label:'⏳ Move to Pending' },
    { value:'closed',  label:'🎉 Mark as Closed' },
  ]
  const cols = showStatusDropdown
    ? (showCommission ? '24px 1fr 130px 110px 120px 36px' : '24px 1fr 150px 140px 36px')
    : (showCommission ? '24px 1fr 130px 120px 36px' : '24px 1fr 150px 100px 36px')

  return (
    <div style={{ background:'white', border:`1px solid ${border}`, borderRadius:16, padding:22, marginTop:16, boxShadow:'0 1px 6px rgba(0,0,0,0.05)' }}>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:16, flexWrap:'wrap', gap:10 }}>
        <div>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:15, color:'#1e293b' }}>{icon} {title}</div>
            {showCommission && <XpBadge xp={PIPELINE_XP.closed} color="#15803d" />}
            {title.includes('Offers Made') && <XpBadge xp={PIPELINE_XP.offer_made} color="#0369a1" />}
            {title.includes('Offers Received') && <XpBadge xp={PIPELINE_XP.offer_received} color="#7c3aed" />}
            {title.includes('Went Pending') && <XpBadge xp={PIPELINE_XP.went_pending} color="#ca8a04" />}
          </div>
          <div style={{ fontSize:10, color:'#94a3b8', marginTop:3 }}>{rows.length} {rows.length===1?'entry':'entries'} this month</div>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
          {totalValue>0 && (
            <div style={{ background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:12, padding:'6px 14px', textAlign:'center' }}>
              <div style={{ fontSize:9, color:'#94a3b8', letterSpacing:1 }}>TOTAL VALUE</div>
              <div style={{ fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:16, color:'#334155' }}>{fmtVal(totalValue)}</div>
            </div>
          )}
          {showCommission && totalCommission>0 && (
            <div style={{ background:'#f0fdf4', border:'1px solid #86efac', borderRadius:12, padding:'6px 14px', textAlign:'center' }}>
              <div style={{ fontSize:9, color:'#94a3b8', letterSpacing:1 }}>EST. COMMISSION</div>
              <div style={{ fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:16, color:'#16a34a' }}>{fmtVal(totalCommission)}</div>
            </div>
          )}
          <div style={{ background:bg, border:`1px solid ${border}`, borderRadius:12, padding:'6px 14px', textAlign:'center' }}>
            <div style={{ fontSize:9, color:'#94a3b8', letterSpacing:1 }}>COUNT</div>
            <div style={{ fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:24, color }}>{rows.length}</div>
          </div>
        </div>
      </div>

      {/* Commission settings (closed only) */}
      {showCommission && (
        <div style={{ background:'#f0fdf4', border:'1px solid #86efac', borderRadius:10, padding:'10px 16px', marginBottom:14, display:'flex', alignItems:'center', gap:16, flexWrap:'wrap' }}>
          <span style={{ fontSize:11, color:'#15803d', fontWeight:700 }}>💰 Commission %</span>
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <input type="number" min="0" max="100" step="0.1" value={commissionPct||''} onChange={e=>onCommissionChange(parseFloat(e.target.value)||0)}
              placeholder="e.g. 2.5"
              style={{ width:70, border:'1.5px solid #86efac', borderRadius:8, padding:'5px 8px', fontSize:13, fontFamily:"'Syne',sans-serif", fontWeight:800, color:'#15803d', textAlign:'center', background:'white' }} />
            <span style={{ fontSize:12, color:'#15803d', fontWeight:700 }}>%</span>
          </div>
          <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:11, color:'#64748b', cursor:'pointer' }}>
            <input type="checkbox" checked={showCommissionInSummary||false} onChange={e=>onToggleShowCommission(e.target.checked)}
              style={{ width:14, height:14, cursor:'pointer' }} />
            Show in dashboard summary
          </label>
          {commissionPct>0 && totalValue>0 && (
            <span style={{ fontSize:11, color:'#15803d', fontWeight:700, marginLeft:'auto' }}>
              {commissionPct}% of {fmtVal(totalValue)} = {fmtFull(totalValue*(commissionPct/100))}
            </span>
          )}
        </div>
      )}

      {/* Column headers */}
      <div style={{ display:'grid', gridTemplateColumns:cols, gap:8, padding:'4px 0', borderBottom:'1px solid #f1f5f9', marginBottom:8 }}>
        <span style={{ fontSize:9, color:'#cbd5e1', textAlign:'center' }}>#</span>
        <span style={{ fontSize:9, color:'#94a3b8', letterSpacing:1 }}>PROPERTY ADDRESS</span>
        <span style={{ fontSize:9, color:'#94a3b8', letterSpacing:1 }}>{priceLabel.toUpperCase()}</span>
        {showStatusDropdown && <span style={{ fontSize:9, color:'#94a3b8', letterSpacing:1 }}>STATUS</span>}
        {!showStatusDropdown && <span style={{ fontSize:9, color:'#94a3b8', letterSpacing:1 }}>SOURCE</span>}
        {showCommission && <span style={{ fontSize:9, color:'#94a3b8', letterSpacing:1 }}>COMMISSION</span>}
        <span />
      </div>

      {rows.length===0 && <div style={{ textAlign:'center', padding:'18px 0', color:'#cbd5e1', fontSize:11 }}>No entries yet — add one below</div>}

      <div style={{ display:'flex', flexDirection:'column', gap:7, marginBottom:12 }}>
        {rows.map((r,i) => (
          <div key={r.id} style={{ display:'grid', gridTemplateColumns:cols, gap:8, alignItems:'center', background:r.status==='pending'?'#fffbeb':'transparent', borderRadius:8, padding:r.status==='pending'?'4px 6px':'0' }}>
            <span style={{ fontSize:10, color:'#cbd5e1', textAlign:'center' }}>{i+1}</span>
            <input value={r.address} onChange={e=>update(r.id,'address',e.target.value)} placeholder={placeholder}
              style={{ border:'1px solid #e2e8f0', borderRadius:8, padding:'7px 11px', fontSize:12, color:'#334155', background:'#f8fafc', fontFamily:"'DM Mono',monospace", width:'100%' }} />
            <input value={r.price} onChange={e=>update(r.id,'price',e.target.value)} placeholder="e.g. $450,000"
              style={{ border:`1px solid ${border}`, borderRadius:8, padding:'7px 11px', fontSize:12, color, background:bg, fontFamily:"'DM Mono',monospace", width:'100%', fontWeight:600 }} />
            {showStatusDropdown ? (
              <select value={r.status||'active'} onChange={e=>handleStatusChange(r,e.target.value)}
                style={{ border:`1.5px solid ${r.status==='pending'?'#fde047':'#e2e8f0'}`, borderRadius:8, padding:'7px 8px', fontSize:11, cursor:'pointer', background:r.status==='pending'?'#fef9c3':'#f8fafc', color:r.status==='pending'?'#ca8a04':'#64748b', fontFamily:"'DM Mono',monospace", fontWeight:600, width:'100%' }}>
                {statusOptions.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ) : (
              <div style={{ background:'#dcfce7', border:'1px solid #86efac', borderRadius:6, padding:'4px 8px', fontSize:9, color:'#15803d', fontWeight:700, textAlign:'center', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                {r.closedFrom||'Manual'}
              </div>
            )}
            {showCommission && (
              <div style={{ display:'flex', alignItems:'center', gap:3 }}>
                <span style={{ fontSize:10, color:'#94a3b8' }}>$</span>
                <input value={r.commission||''} onChange={e=>update(r.id,'commission',e.target.value)}
                  placeholder="optional"
                  style={{ border:'1px solid #86efac', borderRadius:8, padding:'5px 8px', fontSize:11, color:'#15803d', background:'#f0fdf4', fontFamily:"'DM Mono',monospace", width:'100%', fontWeight:600 }} />
              </div>
            )}
            <button onClick={()=>remove(r.id)} style={{ background:'#fef2f2', border:'1px solid #fecaca', color:'#dc2626', borderRadius:8, padding:'7px', cursor:'pointer', fontSize:12, lineHeight:1 }}>✕</button>
          </div>
        ))}
      </div>

      {/* Add row */}
      <div style={{ display:'grid', gridTemplateColumns:cols, gap:8, alignItems:'center', borderTop:'1px dashed #e2e8f0', paddingTop:10 }}>
        <span style={{ fontSize:13, color:'#94a3b8', textAlign:'center' }}>+</span>
        <input value={newAddr} onChange={e=>setNewAddr(e.target.value)} onKeyDown={e=>e.key==='Enter'&&add()} placeholder="New property address..."
          style={{ border:'1.5px dashed #cbd5e1', borderRadius:8, padding:'7px 11px', fontSize:12, color:'#334155', background:'#fafcff', fontFamily:"'DM Mono',monospace", width:'100%' }} />
        <input value={newPrice} onChange={e=>setNewPrice(e.target.value)} onKeyDown={e=>e.key==='Enter'&&add()} placeholder="e.g. $450,000"
          style={{ border:`1.5px dashed ${border}`, borderRadius:8, padding:'7px 11px', fontSize:12, color:'#64748b', background:'#fafcff', fontFamily:"'DM Mono',monospace", width:'100%' }} />
        {showStatusDropdown && <div />}
        {!showStatusDropdown && <div />}
        {showCommission && <div />}
        <button onClick={add} style={{ background:color, color:'white', border:'none', borderRadius:8, padding:'8px', cursor:'pointer', fontSize:16, lineHeight:1, fontWeight:700 }}>+</button>
      </div>
    </div>
  )
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

function Dashboard() {
  const { user, profile, refreshProfile } = useAuth()
  const today = getToday()
  const [page, setPage]   = useState('dashboard')
  const [tab, setTab]     = useState('monthly')
  const [dbLoading, setDbLoading] = useState(true)
  const [motivationIdx] = useState(Math.floor(Math.random()*8))

  const motivations = [
    "Every call you don't make, someone else does. 📞",
    "Top producers didn't get lucky — they got consistent. 🔑",
    "Your pipeline today is your paycheck next month. 💰",
    "Make the call. Send the email. Show the house. Repeat. 🏡",
    "Discipline is choosing what you want most over what you want now.",
    "Your competition is working right now. Are you? 💪",
    "The best time to follow up was yesterday. The second best is now. ⚡",
    "Every showing is a chance. Every call is a chance. Take them. 🎯",
  ]

  // Habits grid
  const [habits, setHabits] = useState(() => {
    const g={}; HABITS.forEach(h=>{g[h.id]=Array(WEEKS).fill(null).map(()=>Array(7).fill(false))}); return g
  })
  // Counters for habits with hasCounter: { "habitId-week-day": number }
  const [counters, setCounters] = useState({})
  const [xp, setXp]             = useState(0)
  const [streak, setStreak]     = useState(0)
  const [animCell, setAnimCell] = useState(null)
  const [xpPop, setXpPop]       = useState(null)

  // Listings
  const [listings, setListings]     = useState([])
  const [newAddress, setNewAddress] = useState('')
  const [newCount, setNewCount]     = useState('1')

  // Transactions — counts are PRESERVED when items move between sections
  const [offersMade, setOffersMade]         = useState([])
  const [offersReceived, setOffersReceived] = useState([])
  const [pendingDeals, setPendingDeals]     = useState([])
  const [closedDeals, setClosedDeals]       = useState([])

  // Commission settings
  const [commissionPct, setCommissionPct]               = useState(0)
  const [showCommissionInSummary, setShowCommissionInSummary] = useState(false)

  // Historical counts (never decrease when items move)
  const [historicalCounts, setHistoricalCounts] = useState({
    offersMade: 0, offersReceived: 0, pending: 0, closed: 0
  })

  useEffect(() => { loadAll() }, [user])

  async function loadAll() {
    if (!user) return
    setDbLoading(true)

    const { data: completions } = await supabase.from('habit_completions').select('*')
      .eq('user_id', user.id).eq('month_year', MONTH_YEAR)

    if (completions?.length) {
      const g={}; HABITS.forEach(h=>{g[h.id]=Array(WEEKS).fill(null).map(()=>Array(7).fill(false))})
      const cnts={}
      completions.forEach(c=>{
        if (g[c.habit_id]) g[c.habit_id][c.week_index][c.day_index]=true
        if (c.counter_value>0) cnts[`${c.habit_id}-${c.week_index}-${c.day_index}`]=c.counter_value
      })
      setHabits(g); setCounters(cnts)
    }

    const { data: listData } = await supabase.from('listings').select('*').eq('user_id',user.id).eq('month_year',MONTH_YEAR)
    if (listData) setListings(listData.map(l=>({id:l.id,address:l.address,count:String(l.unit_count),status:l.status})))

    const { data: txData } = await supabase.from('transactions').select('*').eq('user_id',user.id).eq('month_year',MONTH_YEAR)
    if (txData) {
      setOffersMade(txData.filter(t=>t.type==='offer_made').map(t=>({id:t.id,address:t.address,price:t.price||'',status:t.status||'active',closedFrom:t.closed_from,commission:t.commission||''})))
      setOffersReceived(txData.filter(t=>t.type==='offer_received').map(t=>({id:t.id,address:t.address,price:t.price||'',status:t.status||'active',closedFrom:t.closed_from,commission:t.commission||''})))
      setPendingDeals(txData.filter(t=>t.type==='pending').map(t=>({id:t.id,address:t.address,price:t.price||'',status:t.status||'active',closedFrom:t.closed_from,commission:t.commission||''})))
      setClosedDeals(txData.filter(t=>t.type==='closed').map(t=>({id:t.id,address:t.address,price:t.price||'',status:'closed',closedFrom:t.closed_from,commission:t.commission||''})))
      // Historical counts = total ever entered regardless of current status
      setHistoricalCounts({
        offersMade:     txData.filter(t=>['offer_made','pending','closed'].includes(t.type)||t.closed_from==='Offers Made').length + txData.filter(t=>t.type==='offer_made').length,
        offersReceived: txData.filter(t=>t.type==='offer_received').length,
        pending:        txData.filter(t=>t.type==='pending').length,
        closed:         txData.filter(t=>t.type==='closed').length,
      })
    }

    // Load commission settings from profile metadata
    const { data: prof } = await supabase.from('profiles').select('*').eq('id',user.id).single()
    if (prof) {
      setXp(prof.xp||0); setStreak(prof.streak||0)
      if (prof.commission_pct) setCommissionPct(prof.commission_pct)
      if (prof.show_commission) setShowCommissionInSummary(prof.show_commission)
    }
    setDbLoading(false)
  }

  // ── Habit toggle ──────────────────────────────────────────────────────────
  async function toggleHabit(hid, week, day) {
    const newVal = !habits[hid][week][day]
    setHabits(prev=>{ const n={...prev}; n[hid]=n[hid].map((w,wi)=>wi===week?w.map((d,di)=>di===day?newVal:d):w); return n })
    const habit = HABITS.find(h=>h.id===hid)
    const newXp = Math.max(0, xp+(newVal?habit.xp:-habit.xp))
    setXp(newXp)
    if (newVal) {
      setXpPop({val:`+${habit.xp} XP`, color:CATEGORY_COLORS[habit.category].text})
      setTimeout(()=>setXpPop(null),1200)
      const ckey = `${hid}-${week}-${day}`
      await supabase.from('habit_completions').upsert({
        user_id:user.id, habit_id:hid, week_index:week, day_index:day,
        month_year:MONTH_YEAR, xp_earned:habit.xp,
        counter_value: habit.hasCounter ? (counters[ckey]||1) : 0
      },{onConflict:'user_id,habit_id,week_index,day_index,month_year'})
    } else {
      await supabase.from('habit_completions').delete()
        .eq('user_id',user.id).eq('habit_id',hid).eq('week_index',week).eq('day_index',day).eq('month_year',MONTH_YEAR)
      if (habit.hasCounter) setCounters(prev=>{const n={...prev};delete n[`${hid}-${week}-${day}`];return n})
    }
    await supabase.from('profiles').update({xp:newXp}).eq('id',user.id)
    setAnimCell(`${hid}-${week}-${day}`)
    setTimeout(()=>setAnimCell(null),300)
  }

  async function incrementCounter(hid, week, day) {
    const ckey   = `${hid}-${week}-${day}`
    const newCnt = (counters[ckey]||0)+1
    setCounters(prev=>({...prev,[ckey]:newCnt}))

    const habit = HABITS.find(h=>h.id===hid)
    const perXp = habit?.xpPerIncrement || 0

    // If not yet checked, toggle first (awards base XP)
    if (!habits[hid][week][day]) {
      await toggleHabit(hid, week, day)
      return
    }

    // Award per-increment XP
    if (perXp > 0) {
      const newXp = xp + perXp
      setXp(newXp)
      setXpPop({ val: `+${perXp} XP`, color: CATEGORY_COLORS[habit.category].text })
      setTimeout(()=>setXpPop(null), 1000)
      await supabase.from('profiles').update({ xp: newXp }).eq('id', user.id)
    }

    await supabase.from('habit_completions').upsert({
      user_id:user.id, habit_id:hid, week_index:week, day_index:day,
      month_year:MONTH_YEAR, xp_earned:(habit?.xp||0)+(newCnt-1)*perXp, counter_value:newCnt
    },{onConflict:'user_id,habit_id,week_index,day_index,month_year'})
  }

  // ── Pipeline XP helper ────────────────────────────────────────────────────
  async function awardPipelineXp(type) {
    const bonus = PIPELINE_XP[type] || 0
    if (!bonus) return
    const newXp = xp + bonus
    setXp(newXp)
    setXpPop({val:`+${bonus} XP`, color:'#15803d'})
    setTimeout(()=>setXpPop(null),1500)
    await supabase.from('profiles').update({xp:newXp}).eq('id',user.id)
  }

  // ── Listings ──────────────────────────────────────────────────────────────
  async function addListing() {
    if (!newAddress.trim()) return
    const {data} = await supabase.from('listings').insert({
      user_id:user.id, address:newAddress.trim(), unit_count:parseInt(newCount)||1, status:'active', month_year:MONTH_YEAR
    }).select().single()
    if (data) setListings(prev=>[...prev,{id:data.id,address:data.address,count:String(data.unit_count),status:data.status}])
    setNewAddress(''); setNewCount('1')
  }
  function removeListing(id) { setListings(prev=>prev.filter(l=>l.id!==id)); supabase.from('listings').delete().eq('id',id) }
  async function updateListing(id,field,val) {
    setListings(prev=>prev.map(l=>l.id===id?{...l,[field]:val}:l))
    if (field==='count')   await supabase.from('listings').update({unit_count:parseInt(val)||1}).eq('id',id)
    if (field==='address') await supabase.from('listings').update({address:val}).eq('id',id)
    if (field==='status')  await supabase.from('listings').update({status:val}).eq('id',id)
  }
  async function handleListingMarkClosed(listing) {
    await supabase.from('listings').update({status:'closed'}).eq('id',listing.id)
    const {data} = await supabase.from('transactions').insert({
      user_id:user.id, type:'closed', address:listing.address, price:'', status:'closed', closed_from:'Listing', month_year:MONTH_YEAR
    }).select().single()
    if (data) { setClosedDeals(prev=>[...prev,{id:data.id,address:data.address,price:'',status:'closed',closedFrom:'Listing',commission:''}]); setHistoricalCounts(p=>({...p,closed:p.closed+1})) }
    removeListing(listing.id)
    await awardPipelineXp('closed')
  }

  // ── Transactions ──────────────────────────────────────────────────────────
  async function addTransaction(type, item) {
    const {data} = await supabase.from('transactions').insert({
      user_id:user.id, type, address:item.address, price:item.price||'',
      status: type==='closed'?'closed':'active', closed_from:item.closedFrom||null, month_year:MONTH_YEAR
    }).select().single()
    return data
  }

  async function handleMarkClosed(item) {
    // Remove from source if it has a DB id
    if (item.id && typeof item.id !== 'number') await supabase.from('transactions').delete().eq('id',item.id)
    const data = await addTransaction('closed', {...item})
    if (data) { setClosedDeals(prev=>[...prev,{id:data.id,address:data.address,price:data.price||'',status:'closed',closedFrom:item.closedFrom,commission:''}]); setHistoricalCounts(p=>({...p,closed:p.closed+1})) }
    await awardPipelineXp('closed')
  }

  async function handleMoveToPending(item) {
    // Remove from source section but KEEP the historical count for that section
    if (item.id && typeof item.id !== 'number') await supabase.from('transactions').delete().eq('id',item.id)
    const data = await addTransaction('pending', {...item, closedFrom: item.closedFrom || 'Offers'})
    if (data) { setPendingDeals(prev=>[...prev,{id:data.id,address:data.address,price:data.price||'',status:'active',closedFrom:item.closedFrom||'Offers',commission:''}]); setHistoricalCounts(p=>({...p,pending:p.pending+1})) }
    await awardPipelineXp('went_pending')
  }

  // When a new offer is added manually via the TransactionTracker component,
  // we also need to persist to DB and award XP
  async function handleOfferMadeAdded() {
    setHistoricalCounts(p=>({...p,offersMade:p.offersMade+1}))
    await awardPipelineXp('offer_made')
    // Persist the newest row (last one added)
    // The TransactionTracker adds locally; we sync on next load
    // For now just award XP — full sync happens on reload
  }
  async function handleOfferReceivedAdded() {
    setHistoricalCounts(p=>({...p,offersReceived:p.offersReceived+1}))
    await awardPipelineXp('offer_received')
  }

  // Commission settings
  async function saveCommissionPct(pct) {
    setCommissionPct(pct)
    await supabase.from('profiles').update({commission_pct:pct}).eq('id',user.id)
  }
  async function toggleShowCommission(val) {
    setShowCommissionInSummary(val)
    await supabase.from('profiles').update({show_commission:val}).eq('id',user.id)
  }

  // ── Derived stats ─────────────────────────────────────────────────────────
  const totalChecks   = HABITS.reduce((acc,h)=>acc+habits[h.id].flat().filter(Boolean).length,0)
  const totalPossible = HABITS.length*WEEKS*7
  const monthPercent  = Math.round((totalChecks/totalPossible)*100)
  const todayChecks   = HABITS.filter(h=>habits[h.id][today.week][today.day]).length
  const todayPercent  = Math.round((todayChecks/HABITS.length)*100)
  const totalListings = listings.reduce((a,l)=>a+(parseInt(l.count)||0),0)
  const totalAppts    = Object.entries(counters).filter(([k])=>k.startsWith('appointments')).reduce((a,[,v])=>a+v,0)
  const totalShowings = Object.entries(counters).filter(([k])=>k.startsWith('showing')).reduce((a,[,v])=>a+v,0)
  const totalClosed   = closedDeals.length
  const totalClosedValue = closedDeals.reduce((acc,r)=>{ const n=parseFloat(String(r.price||'').replace(/[^0-9.]/g,'')); return acc+(isNaN(n)?0:n) },0)
  // Use per-row commission override, fallback to pct
  const totalCommission = closedDeals.reduce((acc,r)=>{
    if (r.commission) { const n=parseFloat(String(r.commission).replace(/[^0-9.]/g,'')); return acc+(isNaN(n)?0:n) }
    if (commissionPct>0) { const n=parseFloat(String(r.price||'').replace(/[^0-9.]/g,'')); return acc+(isNaN(n)?0:n*(commissionPct/100)) }
    return acc
  },0)
  const rank        = getRank(xp)
  const nextRank    = RANKS[RANKS.indexOf(rank)+1]
  const rankProg    = nextRank ? Math.round(((xp-rank.min)/(nextRank.min-rank.min))*100) : 100
  const weekColors  = ['#16a34a','#0369a1','#be185d','#ca8a04']
  const dailyCounts = Array(WEEKS).fill(null).map((_,wi)=>Array(7).fill(null).map((__,di)=>HABITS.filter(h=>habits[h.id][wi][di]).length))

  const summaryStats = [
    { label:'Monthly Habits',      val:`${monthPercent}%`,         color:'#16a34a', bg:'#f0fdf4', border:'#86efac',      icon:'📅' },
    { label:"Today's Score",       val:`${todayPercent}%`,         color:'#0369a1', bg:'#f0f9ff', border:'#7dd3fc',      icon:'⚡' },
    { label:'Total XP',            val:xp.toLocaleString(),        color:rank.color,bg:rank.bg,   border:rank.color+'55', icon:'🏆' },
    { label:'Streak',              val:`🔥 ${streak}d`,            color:'#ea580c', bg:'#fff7ed', border:'#fdba74',      icon:'🔥' },
    { label:'Appointments',        val:totalAppts,                 color:'#15803d', bg:'#dcfce7', border:'#86efac',      icon:'📅' },
    { label:'Total Showings',      val:totalShowings,              color:'#0369a1', bg:'#e0f2fe', border:'#7dd3fc',      icon:'🔑' },
    { label:'Properties Listed',   val:totalListings,              color:'#0f766e', bg:'#f0fdfa', border:'#5eead4',      icon:'🏡' },
    { label:'Offers Made',         val:offersMade.length,          color:'#0369a1', bg:'#e0f2fe', border:'#7dd3fc',      icon:'📤' },
    { label:'Offers Received',     val:offersReceived.length,      color:'#7c3aed', bg:'#ede9fe', border:'#c4b5fd',      icon:'📥' },
    { label:'Went Pending',        val:pendingDeals.length,        color:'#ca8a04', bg:'#fef9c3', border:'#fde047',      icon:'⏳' },
    { label:'Closed',              val:totalClosed,                color:'#15803d', bg:'#dcfce7', border:'#86efac',      icon:'🎉' },
    ...(totalClosedValue>0 ? [{ label:'Closed Volume', val:fmtVal(totalClosedValue), color:'#15803d', bg:'#f0fdf4', border:'#86efac', icon:'💵' }] : []),
    ...(showCommissionInSummary&&totalCommission>0 ? [{ label:'Est. Commission', val:fmtVal(totalCommission), color:'#16a34a', bg:'#dcfce7', border:'#86efac', icon:'💰' }] : []),
  ]

  if (page==='leaderboard') return <Leaderboard onBack={()=>setPage('dashboard')} />
  if (page==='teams')       return <TeamsPage   onBack={()=>setPage('dashboard')} />
  if (page==='profile')     return <ProfilePage onBack={()=>setPage('dashboard')} />

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Mono:wght@300;400;500&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        body{background:#f0f4f8;color:#1e293b;font-family:'DM Mono',monospace;}
        ::-webkit-scrollbar{width:5px;height:5px;}
        ::-webkit-scrollbar-track{background:#f1f5f9;}
        ::-webkit-scrollbar-thumb{background:#cbd5e1;border-radius:3px;}
        @keyframes pop{0%{transform:scale(1)}40%{transform:scale(1.4)}100%{transform:scale(1)}}
        @keyframes floatUp{0%{opacity:1;transform:translateY(0)}100%{opacity:0;transform:translateY(-40px)}}
        @keyframes slideDown{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}
        input:focus{outline:2px solid #86efac;outline-offset:1px;}
        select:focus{outline:2px solid #86efac;}
        .stat-card:hover{transform:translateY(-2px);box-shadow:0 4px 16px rgba(0,0,0,0.10)!important;}
      `}</style>

      <div style={{minHeight:'100vh',background:'linear-gradient(135deg,#f0f9ff 0%,#f0fdf4 50%,#fefce8 100%)'}}>

        {xpPop && <div style={{position:'fixed',top:80,right:28,fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:20,color:xpPop.color,animation:'floatUp 1.5s ease forwards',zIndex:9999,pointerEvents:'none',textShadow:'0 2px 8px rgba(0,0,0,0.15)'}}>{xpPop.val}</div>}

        {/* Header */}
        <div style={{background:'white',borderBottom:'1px solid #e2e8f0',padding:'14px 24px',display:'flex',justifyContent:'space-between',alignItems:'center',boxShadow:'0 1px 8px rgba(0,0,0,0.06)',flexWrap:'wrap',gap:10}}>
          <div>
            <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:22,letterSpacing:-0.5,color:'#1e293b'}}>🏡 <span style={{color:'#16a34a'}}>REALTY</span>GRIND</div>
            <div style={{fontSize:10,color:'#94a3b8',marginTop:2,letterSpacing:1}}>Welcome back, {profile?.full_name?.split(' ')[0]||'Agent'} · {MONTH_YEAR}</div>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
            <button onClick={()=>setPage('leaderboard')} style={{background:'#f1f5f9',border:'1px solid #e2e8f0',borderRadius:10,padding:'8px 14px',cursor:'pointer',fontSize:12,fontFamily:"'Syne',sans-serif",fontWeight:700,color:'#1e293b'}}>🏆 Leaderboard</button>
            <button onClick={()=>setPage('teams')} style={{background:'#f1f5f9',border:'1px solid #e2e8f0',borderRadius:10,padding:'8px 14px',cursor:'pointer',fontSize:12,fontFamily:"'Syne',sans-serif",fontWeight:700,color:'#1e293b'}}>
              👥 {profile?.teams?profile.teams.name:'Teams'}
            </button>
            <button onClick={()=>setPage('profile')} style={{background:'#f8fafc',border:'1.5px solid #e2e8f0',borderRadius:10,padding:'8px 14px',cursor:'pointer',fontSize:12,fontFamily:"'Syne',sans-serif",fontWeight:700,color:'#334155',display:'flex',alignItems:'center',gap:6}}>
              👤 {profile?.full_name?.split(' ')[0]||'Profile'}
            </button>
            <div style={{background:rank.bg,border:`1.5px solid ${rank.color}55`,borderRadius:12,padding:'8px 14px',minWidth:155}}>
              <div style={{fontSize:9,color:'#94a3b8',letterSpacing:1}}>RANK</div>
              <div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:13,color:rank.color,marginBottom:4}}>{rank.icon} {rank.name}</div>
              <div style={{height:5,background:'#e2e8f0',borderRadius:3}}>
                <div style={{height:'100%',background:rank.color,borderRadius:3,width:`${rankProg}%`,transition:'width 0.5s ease'}} />
              </div>
              <div style={{fontSize:9,color:'#94a3b8',marginTop:3}}>{xp.toLocaleString()} XP{nextRank?` / ${nextRank.min.toLocaleString()}`:' — MAX!'}</div>
            </div>
            <button onClick={()=>supabase.auth.signOut()} style={{background:'#fef2f2',border:'1px solid #fecaca',borderRadius:10,padding:'8px 12px',cursor:'pointer',fontSize:11,fontFamily:"'Syne',sans-serif",fontWeight:700,color:'#dc2626'}}>Sign Out</button>
          </div>
        </div>

        {/* Motivation banner */}
        <div style={{background:'linear-gradient(90deg,#15803d,#0369a1)',padding:'10px 24px',textAlign:'center'}}>
          <span style={{color:'white',fontSize:12,fontFamily:"'Syne',sans-serif",fontWeight:700,letterSpacing:0.5}}>{motivations[motivationIdx]}</span>
        </div>

        {dbLoading ? (
          <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'60vh',fontSize:14,color:'#94a3b8'}}>Loading your data...</div>
        ) : (
        <div style={{maxWidth:1180,margin:'0 auto',padding:'20px 16px'}}>

          {/* ── Summary Stats Grid ── */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(130px,1fr))',gap:10,marginBottom:20}}>
            {summaryStats.map((s,i)=>(
              <div key={i} className="stat-card" style={{background:s.bg,border:`1px solid ${s.border}`,borderRadius:14,padding:'12px 14px',boxShadow:'0 1px 4px rgba(0,0,0,0.05)',transition:'all 0.2s',cursor:'default'}}>
                <div style={{fontSize:10,color:'#64748b',marginBottom:3}}>{s.icon} {s.label}</div>
                <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:20,color:s.color}}>{s.val}</div>
              </div>
            ))}
          </div>

          {/* ── Pipeline XP Info Bar ── */}
          <div style={{background:'white',border:'1px solid #e2e8f0',borderRadius:12,padding:'10px 20px',marginBottom:16,display:'flex',gap:16,flexWrap:'wrap',alignItems:'center',boxShadow:'0 1px 3px rgba(0,0,0,0.04)'}}>
            <span style={{fontSize:10,color:'#94a3b8',letterSpacing:1,fontWeight:600}}>PIPELINE XP:</span>
            {[
              {label:'Offer Made/Received',  xp:PIPELINE_XP.offer_made,     color:'#0369a1'},
              {label:'Went Pending',          xp:PIPELINE_XP.went_pending,   color:'#ca8a04'},
              {label:'Closed Deal',           xp:PIPELINE_XP.closed,         color:'#15803d'},
            ].map((p,i)=>(
              <div key={i} style={{display:'flex',alignItems:'center',gap:5}}>
                <span style={{fontSize:9,background:p.color+'22',color:p.color,border:`1px solid ${p.color}44`,borderRadius:5,padding:'2px 7px',fontWeight:700,fontFamily:"'Syne',sans-serif"}}>+{p.xp} XP</span>
                <span style={{fontSize:10,color:'#64748b'}}>{p.label}</span>
              </div>
            ))}
          </div>

          {/* ── Weekly Circles ── */}
          <div style={{background:'white',border:'1px solid #e2e8f0',borderRadius:16,padding:'20px 24px',marginBottom:16,boxShadow:'0 1px 6px rgba(0,0,0,0.05)'}}>
            <div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:10,color:'#94a3b8',marginBottom:16,letterSpacing:2,textTransform:'uppercase'}}>Weekly Breakdown</div>
            <div style={{display:'flex',gap:20,flexWrap:'wrap',justifyContent:'space-around',alignItems:'center'}}>
              {Array(WEEKS).fill(null).map((_,wi)=>{
                const wTotal=HABITS.reduce((acc,h)=>acc+habits[h.id][wi].filter(Boolean).length,0)
                return <CircleProgress key={wi} percent={Math.round((wTotal/(HABITS.length*7))*100)} size={90} color={weekColors[wi]} trackColor="#f1f5f9" textColor="#1e293b" label={`Week ${wi+1}`} sublabel={`${wTotal}/${HABITS.length*7}`} />
              })}
              <div style={{width:1,height:80,background:'#e2e8f0'}} />
              <CircleProgress percent={monthPercent} size={104} color={rank.color} trackColor="#f1f5f9" textColor="#1e293b" label="Monthly Total" sublabel={`${totalChecks}/${totalPossible}`} />
            </div>
          </div>

          {/* Category Legend */}
          <div style={{background:'white',border:'1px solid #e2e8f0',borderRadius:12,padding:'10px 20px',marginBottom:16,display:'flex',gap:16,flexWrap:'wrap',alignItems:'center'}}>
            <span style={{fontSize:10,color:'#94a3b8',letterSpacing:1,fontWeight:600}}>CATEGORIES:</span>
            {Object.entries(CATEGORY_COLORS).map(([cat,col])=>(
              <div key={cat} style={{display:'flex',alignItems:'center',gap:5}}>
                <div style={{width:12,height:12,borderRadius:3,background:col.bg,border:`2px solid ${col.border}`}} />
                <span style={{fontSize:10,color:col.text,fontWeight:600,textTransform:'capitalize'}}>{cat}</span>
              </div>
            ))}
          </div>

          {/* View Tabs */}
          <div style={{display:'flex',gap:8,marginBottom:16}}>
            {['monthly','weekly'].map(t=>(
              <button key={t} onClick={()=>setTab(t)} style={{background:tab===t?'#1e293b':'white',border:`1.5px solid ${tab===t?'#1e293b':'#e2e8f0'}`,color:tab===t?'white':'#64748b',borderRadius:9,padding:'8px 20px',fontSize:11,cursor:'pointer',fontFamily:"'Syne',sans-serif",fontWeight:700,textTransform:'uppercase',letterSpacing:1}}>
                {t==='monthly'?'📅 Monthly Grid':'📊 Weekly View'}
              </button>
            ))}
          </div>

          {/* ── Monthly Grid ── */}
          {tab==='monthly' && (
            <div style={{background:'white',border:'1px solid #e2e8f0',borderRadius:16,overflow:'hidden',boxShadow:'0 2px 10px rgba(0,0,0,0.06)'}}>
              <div style={{overflowX:'auto'}}>
                <table style={{width:'100%',borderCollapse:'collapse',minWidth:760}}>
                  <thead>
                    <tr style={{borderBottom:'1px solid #e2e8f0',background:'#f8fafc'}}>
                      <th style={{padding:'12px 16px',textAlign:'left',fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:10,color:'#64748b',letterSpacing:2,minWidth:230}}>HABIT</th>
                      {Array(WEEKS).fill(null).map((_,wi)=>(
                        <th key={wi} colSpan={7} style={{padding:'12px 4px',textAlign:'center',fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:10,color:weekColors[wi],letterSpacing:1,borderLeft:'2px solid #e2e8f0'}}>WEEK {wi+1}</th>
                      ))}
                      <th style={{padding:'12px 8px',textAlign:'center',fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:10,color:'#64748b',borderLeft:'2px solid #e2e8f0',whiteSpace:'nowrap'}}>XP</th>
                      <th style={{padding:'12px 8px',textAlign:'center',fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:10,color:'#64748b'}}>%</th>
                    </tr>
                    <tr style={{borderBottom:'2px solid #e2e8f0',background:'#f8fafc'}}>
                      <td style={{padding:'4px 16px',fontSize:9,color:'#cbd5e1'}}>{MONTH_YEAR}</td>
                      {Array(WEEKS).fill(null).map((_,wi)=>DAYS.map((d,di)=>(
                        <td key={`${wi}-${di}`} style={{padding:'4px 2px',textAlign:'center',fontSize:9,color:wi===today.week&&di===today.day?'#16a34a':'#94a3b8',fontWeight:wi===today.week&&di===today.day?700:400,borderLeft:di===0?'2px solid #e2e8f0':'none'}}>{d}</td>
                      )))}
                      <td /><td />
                    </tr>
                  </thead>
                  <tbody>
                    {HABITS.map((h,hi)=>{
                      const done=habits[h.id].flat().filter(Boolean).length
                      const pct=Math.round((done/(WEEKS*7))*100)
                      const catCol=CATEGORY_COLORS[h.category]
                      const habitTotal = h.hasCounter ? Object.entries(counters).filter(([k])=>k.startsWith(h.id)).reduce((a,[,v])=>a+v,0) : 0
                      const habitXpEarned = h.hasCounter
                        ? done*h.xp + Math.max(0,habitTotal-done)*(h.xpPerIncrement||0)
                        : done*h.xp
                      return (
                        <tr key={h.id} style={{borderBottom:'1px solid #f1f5f9',background:hi%2===0?'white':'#fafcff'}}>
                          <td style={{padding:'9px 16px'}}>
                            <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                              <span style={{fontSize:15}}>{h.icon}</span>
                              <span style={{fontSize:12,color:'#334155'}}>{h.label}</span>
                              <span style={{fontSize:9,color:catCol.text,background:catCol.bg,border:`1px solid ${catCol.border}`,borderRadius:4,padding:'1px 6px'}}>{h.category}</span>
                              {h.hasCounter && habitTotal>0 && <span style={{fontSize:9,color:'#0369a1',background:'#e0f2fe',borderRadius:5,padding:'1px 6px',border:'1px solid #7dd3fc',fontWeight:700}}>×{habitTotal} total</span>}
                            </div>
                          </td>
                          {Array(WEEKS).fill(null).map((_,wi)=>Array(7).fill(null).map((__,di)=>{
                            const checked=habits[h.id][wi][di]
                            const isToday=wi===today.week&&di===today.day
                            const ckey=`${h.id}-${wi}-${di}`
                            return (
                              <td key={`${wi}-${di}`} style={{textAlign:'center',borderLeft:di===0?'2px solid #e2e8f0':'none',padding:'4px 2px'}}>
                                {h.hasCounter ? (
                                  <CounterCell hid={h.id} wi={wi} di={di} checked={checked} isToday={isToday} catCol={catCol} animCell={animCell} onToggle={toggleHabit} onIncrement={incrementCounter} count={counters[ckey]||0} />
                                ) : (
                                  <button onClick={()=>toggleHabit(h.id,wi,di)} style={{width:21,height:21,borderRadius:5,border:`1.5px solid ${checked?catCol.text:isToday?'#94a3b8':'#e2e8f0'}`,background:checked?catCol.bg:isToday?'#f0fdf4':'white',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',boxShadow:checked?`0 0 0 2px ${catCol.border}`:'none',animation:animCell===ckey?'pop 0.3s ease':'none',transition:'all 0.15s ease'}}>
                                    {checked&&<span style={{color:catCol.text,fontSize:11,lineHeight:1,fontWeight:700}}>✓</span>}
                                    {isToday&&!checked&&<span style={{width:6,height:6,borderRadius:'50%',background:'#86efac',display:'block'}} />}
                                  </button>
                                )}
                              </td>
                            )
                          }))}
                          <td style={{textAlign:'center',fontSize:11,color:catCol.text,fontFamily:"'Syne',sans-serif",fontWeight:700,borderLeft:'2px solid #e2e8f0',padding:'0 10px',whiteSpace:'nowrap'}}>+{habitXpEarned.toLocaleString()}</td>
                          <td style={{padding:'0 14px'}}>
                            <div style={{display:'flex',alignItems:'center',gap:6}}>
                              <div style={{flex:1,height:6,background:'#f1f5f9',borderRadius:3,minWidth:50,overflow:'hidden'}}>
                                <div style={{height:'100%',background:catCol.text,borderRadius:3,width:`${pct}%`,transition:'width 0.4s ease'}} />
                              </div>
                              <span style={{fontSize:10,color:'#94a3b8',width:32}}>{pct}%</span>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{borderTop:'2px solid #e2e8f0',background:'#f8fafc'}}>
                      <td style={{padding:'10px 16px',fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:10,color:'#64748b',letterSpacing:1}}>DAILY TOTALS</td>
                      {Array(WEEKS).fill(null).map((_,wi)=>Array(7).fill(null).map((__,di)=>{
                        const cnt=dailyCounts[wi][di],pct=cnt/HABITS.length
                        const col=pct>=0.8?'#16a34a':pct>=0.5?'#ca8a04':pct>0?'#ea580c':'#e2e8f0'
                        return (<td key={`${wi}-${di}`} style={{textAlign:'center',borderLeft:di===0?'2px solid #e2e8f0':'none',padding:'8px 2px'}}>{cnt>0&&<span style={{fontSize:10,fontFamily:"'Syne',sans-serif",fontWeight:700,color:col}}>{cnt}</span>}</td>)
                      }))}
                      <td colSpan={2} style={{textAlign:'center',borderLeft:'2px solid #e2e8f0',padding:'0 14px'}}>
                        <span style={{fontSize:12,color:'#16a34a',fontFamily:"'Syne',sans-serif",fontWeight:800}}>{xp.toLocaleString()} XP</span>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* ── Weekly View ── */}
          {tab==='weekly' && (
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))',gap:12}}>
              {DAYS.map((_,di)=>{
                const dayTasks=HABITS.filter(h=>habits[h.id][today.week][di])
                const pct=Math.round((dayTasks.length/HABITS.length)*100)
                const isToday=di===today.day
                const dc=['#0369a1','#16a34a','#be185d','#ca8a04','#ea580c','#7c3aed','#0f766e'][di]
                return (
                  <div key={di} style={{background:'white',border:`1.5px solid ${isToday?dc+'55':'#e2e8f0'}`,borderRadius:16,padding:14,boxShadow:isToday?`0 0 0 3px ${dc}18,0 4px 16px rgba(0,0,0,0.08)`:'0 1px 4px rgba(0,0,0,0.05)'}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
                      <div>
                        <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:14,color:isToday?dc:'#1e293b'}}>{FULL_DAYS[di]}</div>
                        {isToday&&<div style={{fontSize:9,color:dc,letterSpacing:2,fontWeight:700}}>● TODAY</div>}
                      </div>
                      <CircleProgress percent={pct} size={52} color={dc} trackColor="#f1f5f9" textColor="#1e293b" />
                    </div>
                    <div style={{display:'flex',flexDirection:'column',gap:5}}>
                      {HABITS.map(h=>{
                        const checked=habits[h.id][today.week][di]
                        const catCol=CATEGORY_COLORS[h.category]
                        const ckey=`${h.id}-${today.week}-${di}`
                        return (
                          <div key={h.id}>
                            <button onClick={()=>toggleHabit(h.id,today.week,di)} style={{display:'flex',alignItems:'center',gap:7,background:checked?catCol.bg:'#fafafa',border:`1px solid ${checked?catCol.border:'#f1f5f9'}`,borderRadius:7,padding:'5px 8px',cursor:'pointer',textAlign:'left',transition:'all 0.15s',width:'100%'}}>
                              <div style={{width:13,height:13,borderRadius:3,border:`1.5px solid ${checked?catCol.text:'#cbd5e1'}`,background:checked?catCol.bg:'white',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                                {checked&&<span style={{color:catCol.text,fontSize:8,fontWeight:700}}>✓</span>}
                              </div>
                              <span style={{fontSize:9.5,color:checked?'#334155':'#94a3b8',textDecoration:checked?'line-through':'none',flex:1}}>{h.icon} {h.label}</span>
                              <span style={{fontSize:9,color:catCol.text,fontWeight:700}}>+{h.xp}{h.xpPerIncrement?` / +${h.xpPerIncrement}ea`:''}</span>
                            </button>
                            {h.hasCounter&&checked&&(
                              <div style={{display:'flex',alignItems:'center',gap:8,marginTop:4,paddingLeft:20}}>
                                <span style={{fontSize:10,color:'#64748b'}}>Count:</span>
                                <span style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:14,color:catCol.text}}>{counters[ckey]||1}</span>
                                <button onClick={()=>incrementCounter(h.id,today.week,di)} style={{background:catCol.text,color:'white',border:'none',borderRadius:6,width:22,height:22,cursor:'pointer',fontSize:14,fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center'}}>+</button>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                    <div style={{marginTop:8,display:'flex',justifyContent:'space-between',fontSize:10,color:'#94a3b8',borderTop:'1px solid #f1f5f9',paddingTop:8}}>
                      <span>Done: <span style={{color:dc,fontWeight:700}}>{dayTasks.length}</span></span>
                      <span>Left: <span style={{color:'#ea580c',fontWeight:700}}>{HABITS.length-dayTasks.length}</span></span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* ── Listings ── */}
          <div style={{background:'white',border:'1px solid #e2e8f0',borderRadius:16,padding:22,marginTop:20,boxShadow:'0 1px 6px rgba(0,0,0,0.05)'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:18}}>
              <div>
                <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:16,color:'#1e293b'}}>🏡 Listings Tracker</div>
                <div style={{fontSize:10,color:'#94a3b8',marginTop:3}}>Log every property you've listed this month</div>
              </div>
              <div style={{background:'#f0fdfa',border:'1px solid #5eead4',borderRadius:12,padding:'8px 18px',textAlign:'center'}}>
                <div style={{fontSize:9,color:'#94a3b8',letterSpacing:1}}>TOTAL LISTED</div>
                <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:28,color:'#0f766e'}}>{totalListings}</div>
              </div>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'28px 1fr 130px 140px 40px',gap:8,padding:'6px 0',borderBottom:'1px solid #f1f5f9',marginBottom:8}}>
              <span style={{fontSize:9,color:'#cbd5e1',textAlign:'center'}}>#</span>
              <span style={{fontSize:9,color:'#94a3b8',letterSpacing:1}}>ADDRESS</span>
              <span style={{fontSize:9,color:'#94a3b8',letterSpacing:1}}>UNITS</span>
              <span style={{fontSize:9,color:'#94a3b8',letterSpacing:1}}>STATUS</span>
              <span />
            </div>
            {listings.length===0&&<div style={{textAlign:'center',padding:'18px 0',color:'#cbd5e1',fontSize:11}}>No listings yet — add one below</div>}
            <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:14}}>
              {listings.map((l,i)=>(
                <div key={l.id} style={{display:'grid',gridTemplateColumns:'28px 1fr 130px 140px 40px',gap:8,alignItems:'center'}}>
                  <span style={{fontSize:11,color:'#cbd5e1',textAlign:'center'}}>{i+1}</span>
                  <input value={l.address} onChange={e=>updateListing(l.id,'address',e.target.value)} placeholder="123 Maple Drive..."
                    style={{border:'1px solid #e2e8f0',borderRadius:8,padding:'7px 11px',fontSize:12,color:'#334155',background:'#f8fafc',fontFamily:"'DM Mono',monospace",width:'100%'}} />
                  <div style={{display:'flex',alignItems:'center',gap:6,background:'#f0fdfa',border:'1px solid #5eead4',borderRadius:8,padding:'6px 10px'}}>
                    <span style={{fontSize:10,color:'#0f766e'}}>Units:</span>
                    <input type="number" min="1" value={l.count} onChange={e=>updateListing(l.id,'count',e.target.value)}
                      style={{width:38,border:'none',background:'transparent',fontSize:14,fontWeight:800,color:'#0f766e',fontFamily:"'Syne',sans-serif",textAlign:'center'}} />
                  </div>
                  <select value={l.status||'active'} onChange={e=>{ if(e.target.value==='closed') handleListingMarkClosed(l); else updateListing(l.id,'status',e.target.value) }}
                    style={{border:`1.5px solid ${l.status==='pending'?'#fde047':'#5eead4'}`,borderRadius:8,padding:'7px 8px',fontSize:11,cursor:'pointer',background:l.status==='pending'?'#fef9c3':'#f0fdfa',color:l.status==='pending'?'#ca8a04':'#0f766e',fontFamily:"'DM Mono',monospace",fontWeight:600,width:'100%'}}>
                    <option value="active">🟢 Active</option>
                    <option value="pending">⏳ Pending</option>
                    <option value="closed">🎉 Mark as Closed</option>
                  </select>
                  <button onClick={()=>removeListing(l.id)} style={{background:'#fef2f2',border:'1px solid #fecaca',color:'#dc2626',borderRadius:8,padding:'7px',cursor:'pointer',fontSize:13,lineHeight:1}}>✕</button>
                </div>
              ))}
            </div>
            <div style={{display:'grid',gridTemplateColumns:'28px 1fr 130px 140px 40px',gap:8,alignItems:'center',borderTop:'1px dashed #e2e8f0',paddingTop:12}}>
              <span style={{fontSize:12,color:'#94a3b8',textAlign:'center'}}>+</span>
              <input value={newAddress} onChange={e=>setNewAddress(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addListing()} placeholder="New property address..."
                style={{border:'1.5px dashed #cbd5e1',borderRadius:8,padding:'8px 12px',fontSize:12,color:'#334155',background:'#fafcff',fontFamily:"'DM Mono',monospace",width:'100%'}} />
              <div style={{display:'flex',alignItems:'center',gap:6,background:'#fafcff',border:'1.5px dashed #cbd5e1',borderRadius:8,padding:'6px 10px'}}>
                <span style={{fontSize:10,color:'#94a3b8'}}>Units:</span>
                <input type="number" min="1" value={newCount} onChange={e=>setNewCount(e.target.value)} placeholder="1"
                  style={{width:38,border:'none',background:'transparent',fontSize:14,fontWeight:800,color:'#0f766e',fontFamily:"'Syne',sans-serif",textAlign:'center'}} />
              </div>
              <div />
              <button onClick={addListing} style={{background:'#0f766e',color:'white',border:'none',borderRadius:8,padding:'8px',cursor:'pointer',fontSize:16,lineHeight:1}}>+</button>
            </div>
          </div>

          {/* ── Pipeline ── */}
          <div style={{marginTop:20}}>
            <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:4}}>
              <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:17,color:'#1e293b'}}>📋 Transaction Pipeline</div>
              <div style={{display:'flex',gap:8}}>
                {[
                  {label:`${offersMade.length} Made`,     color:'#0369a1',bg:'#e0f2fe'},
                  {label:`${offersReceived.length} Recd`, color:'#7c3aed',bg:'#ede9fe'},
                  {label:`${pendingDeals.length} Pending`,color:'#ca8a04',bg:'#fef9c3'},
                  {label:`${closedDeals.length} Closed`,  color:'#15803d',bg:'#dcfce7'},
                ].map((b,i)=>(
                  <span key={i} style={{fontSize:10,color:b.color,background:b.bg,borderRadius:7,padding:'2px 9px',fontFamily:"'Syne',sans-serif",fontWeight:700}}>{b.label}</span>
                ))}
              </div>
            </div>
            <div style={{fontSize:10,color:'#94a3b8',marginBottom:4}}>Moving an offer to Pending or Closed always <strong>preserves its count</strong> and awards pipeline XP. 🏆</div>

            <TransactionTracker title="Offers Made"     icon="📤" color="#0369a1" bg="#e0f2fe" border="#7dd3fc" placeholder="e.g. 456 Oak Ave"   priceLabel="Offer Amount"   rows={offersMade}    setRows={setOffersMade}    onMarkClosed={handleMarkClosed} onMoveToPending={handleMoveToPending} />
            <TransactionTracker title="Offers Received" icon="📥" color="#7c3aed" bg="#ede9fe" border="#c4b5fd" placeholder="e.g. 789 Pine Blvd" priceLabel="Offer Amount"   rows={offersReceived} setRows={setOffersReceived} onMarkClosed={handleMarkClosed} onMoveToPending={handleMoveToPending} />
            <TransactionTracker title="Went Pending"    icon="⏳" color="#ca8a04" bg="#fef9c3" border="#fde047" placeholder="e.g. 101 Elm St"    priceLabel="Contract Price" rows={pendingDeals}  setRows={setPendingDeals}  onMarkClosed={handleMarkClosed} />
            <TransactionTracker
              title="Closed" icon="🎉" color="#15803d" bg="#dcfce7" border="#86efac"
              placeholder="e.g. 202 Cedar Ln" priceLabel="Closed Price"
              rows={closedDeals} setRows={setClosedDeals} showStatusDropdown={false}
              showCommission={true}
              commissionPct={commissionPct}
              onCommissionChange={saveCommissionPct}
              showCommissionInSummary={showCommissionInSummary}
              onToggleShowCommission={toggleShowCommission}
            />
          </div>

          <div style={{textAlign:'center',padding:'20px 0 10px',fontSize:9,color:'#cbd5e1',letterSpacing:2}}>REALTYGRIND v4.0 — CLOSE MORE. EVERY DAY.</div>
        </div>
        )}
      </div>
    </>
  )
}

function AppInner() {
  const {user,loading}=useAuth()
  if (loading) return <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',background:'linear-gradient(135deg,#f0f9ff,#f0fdf4)',fontFamily:"'Syne',sans-serif",fontSize:18,color:'#94a3b8'}}>🏡 Loading RealtyGrind...</div>
  return user ? <Dashboard /> : <AuthPage />
}

export default function App() {
  return <AuthProvider><AppInner /></AuthProvider>
}
