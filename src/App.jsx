import { useState, useEffect, createContext, useContext } from 'react'
import { AuthProvider, useAuth } from './lib/AuthContext'
import { supabase } from './lib/supabase'
import AuthPage from './pages/AuthPage'
import Leaderboard from './pages/Leaderboard'
import TeamsPage from './pages/TeamsPage'
import ProfilePage from './pages/ProfilePage'
import DirectoryPage from './pages/DirectoryPage'
import APODPage from './pages/APODPage'
import { CSS, Ring, StatCard, Wordmark, Loader, ThemeToggle, PageNav, getRank, fmtMoney, RANKS, CAT } from './design'

// ─── Theme context ─────────────────────────────────────────────────────────────

export const ThemeCtx = createContext({ theme:'light', toggle:()=>{} })
export const useTheme = () => useContext(ThemeCtx)

// ─── Constants ─────────────────────────────────────────────────────────────────

const HABITS = [
  { id:'prospecting',  label:'Prospecting Calls',   icon:'📞', xp:25,  cat:'leads',     counter:true, xpEach:10 },
  { id:'followup',     label:'Follow-Up Emails',    icon:'✉️', xp:15,  cat:'leads',     counter:true, xpEach:8  },
  { id:'appointments', label:'Appointments Booked', icon:'📅', xp:30,  cat:'leads',     counter:true, xpEach:25 },
  { id:'showing',      label:'Property Showings',   icon:'🔑', xp:30,  cat:'leads',     counter:true, xpEach:20 },
  { id:'newlisting',   label:'Listings Taken',      icon:'🏠', xp:25,  cat:'listings',  counter:true, xpEach:30 },
  { id:'social',       label:'Social Posts',        icon:'📱', xp:10,  cat:'marketing', counter:true, xpEach:8  },
  { id:'crm',          label:'CRM Updates',         icon:'💾', xp:15,  cat:'admin',     counter:true, xpEach:5  },
  { id:'market',       label:'Market Analysis',     icon:'📊', xp:35,  cat:'market' },
  { id:'networking',   label:'Networking',          icon:'🤝', xp:20,  cat:'leads',     counter:true, xpEach:15 },
  { id:'training',     label:'Training',            icon:'📚', xp:20,  cat:'growth' },
  { id:'review',       label:'Review Requests',     icon:'⭐', xp:20,  cat:'marketing', counter:true, xpEach:15 },
]

const PIPELINE_XP = { offer_made:75, offer_received:75, went_pending:150, closed:300 }
const DAYS        = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const FULL_DAYS   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
const WEEKS       = 4
const MONTH_YEAR  = new Date().toISOString().slice(0,7)
const MONTHS      = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
function fmtMonth(my) {
  if (!my) return ''
  const [y,m] = my.split('-')
  return `${MONTHS[parseInt(m)-1]} '${y.slice(2)}`
}

function getToday()  { const d=new Date(); return { week:Math.min(Math.floor((d.getDate()-1)/7),3), day:d.getDay() } }

// ─── Pipeline section ─────────────────────────────────────────────────────────

function PipelineSection({ title, icon, accentColor, xpLabel, rows, setRows, onStatusChange, showSource, statusOpts, onAdd, onRemove }) {
  const [addr,  setAddr]  = useState('')
  const [price, setPrice] = useState('')
  const [comm,  setComm]  = useState('')

  async function add() {
    if (!addr.trim()) return
    const tmp = { id:`tmp-${Date.now()}`, address:addr.trim(), price:price.trim(), commission:comm.trim(), status:'active' }
    setRows(prev => [...prev, tmp])
    setAddr(''); setPrice(''); setComm('')
    if (onAdd) {
      // onAdd persists to DB and returns the saved row with a real ID
      const saved = await onAdd(tmp)
      if (saved?.id) setRows(prev => prev.map(r => r.id === tmp.id ? saved : r))
    }
  }

  async function remove(row) {
    setRows(prev => prev.filter(r => r.id !== row.id))
    if (row.id && !String(row.id).startsWith('tmp-')) {
      await supabase.from('transactions').delete().eq('id', row.id)
    }
    if (onRemove) onRemove(row)
  }

  function update(id, f, v) { setRows(prev => prev.map(r => r.id===id ? {...r,[f]:v} : r)) }

  const totalVol  = rows.reduce((a,r)=>{ const n=parseFloat(String(r.price||'').replace(/[^0-9.]/g,'')); return a+(isNaN(n)?0:n) },0)
  const totalComm = rows.reduce((a,r)=>{ const n=parseFloat(String(r.commission||'').replace(/[^0-9.]/g,'')); return a+(isNaN(n)?0:n) },0)

  // Action buttons replace the dropdown — filter out 'active' (current state) to show only forward actions
  const actionOpts = (statusOpts||[]).filter(o => o.v !== 'active')

  const cols = showSource
    ? '1fr 110px 110px 90px 30px'
    : `1fr 110px 110px ${actionOpts.length > 1 ? '168px' : '90px'} 30px`

  return (
    <div className="card" style={{ padding:22, marginBottom:12 }}>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:16, flexWrap:'wrap', gap:10 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:38, height:38, borderRadius:10, background:`${accentColor}14`, border:`1px solid ${accentColor}28`,
            display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>
            {icon}
          </div>
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
              <span className="serif" style={{ fontSize:17, color:'var(--text)', fontWeight:600 }}>{title}</span>
              <span style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:700, fontSize:19, color:accentColor, lineHeight:1 }}>{rows.length}</span>
              <span style={{ fontSize:9, padding:'2px 7px', borderRadius:4, fontWeight:700, fontFamily:"'JetBrains Mono',monospace",
                background:`${accentColor}14`, color:accentColor, border:`1px solid ${accentColor}28` }}>
                +{xpLabel} XP/deal
              </span>
            </div>
            {(totalVol > 0 || totalComm > 0) && (
              <div style={{ fontSize:11, color:'var(--muted)', marginTop:3, fontFamily:"'JetBrains Mono',monospace" }}>
                {totalVol>0 && <>Vol: <span style={{ color:accentColor, fontWeight:600 }}>{fmtMoney(totalVol)}</span></>}
                {totalVol>0 && totalComm>0 && ' · '}
                {totalComm>0 && <>Comm: <span style={{ color:'var(--green)', fontWeight:600 }}>{fmtMoney(totalComm)}</span></>}
              </div>
            )}
          </div>
        </div>
        {totalVol > 0 && (
          <div style={{ display:'flex', gap:8 }}>
            <div className="card-inset" style={{ padding:'8px 14px', textAlign:'right' }}>
              <div className="label" style={{ marginBottom:3 }}>VOLUME</div>
              <div className="serif" style={{ fontSize:19, color:accentColor, fontWeight:700 }}>{fmtMoney(totalVol)}</div>
            </div>
            {totalComm > 0 && (
              <div style={{ background:'rgba(5,150,105,.07)', border:'1px solid rgba(5,150,105,.18)', borderRadius:9, padding:'8px 14px', textAlign:'right' }}>
                <div className="label" style={{ marginBottom:3 }}>COMMISSION</div>
                <div className="serif" style={{ fontSize:19, color:'var(--green)', fontWeight:700 }}>{fmtMoney(totalComm)}</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Column labels */}
      <div style={{ display:'grid', gridTemplateColumns:cols, gap:8, padding:'3px 13px', marginBottom:5 }}>
        <span className="label">ADDRESS</span>
        <span className="label">PRICE</span>
        <span className="label">COMMISSION</span>
        <span className="label">{showSource ? 'SOURCE' : 'ACTIONS'}</span>
        <span/>
      </div>

      {rows.length === 0 && (
        <div style={{ textAlign:'center', padding:'20px 0', color:'var(--dim)', fontSize:12 }}>
          No entries yet{!showSource && ' — add one below'}
        </div>
      )}

      <div style={{ display:'flex', flexDirection:'column', gap:5, marginBottom: showSource ? 0 : 10 }}>
        {rows.map(r => (
          <div key={r.id} className="pipe-row" style={{ gridTemplateColumns:cols }}>
            <input className="pipe-input" value={r.address||''} onChange={e=>update(r.id,'address',e.target.value)} placeholder="Property address…"/>
            <input className="pipe-input" value={r.price||''} onChange={e=>update(r.id,'price',e.target.value)}
              placeholder="$0" style={{ color:accentColor, fontWeight:600, fontFamily:"'JetBrains Mono',monospace" }}/>
            <input className="pipe-input" value={r.commission||''} onChange={e=>update(r.id,'commission',e.target.value)}
              placeholder="optional" style={{ color:'var(--green)', fontWeight:600, fontFamily:"'JetBrains Mono',monospace" }}/>
            {showSource
              ? <span style={{ fontSize:11, color:'var(--muted)', fontFamily:"'JetBrains Mono',monospace", padding:'0 2px' }}>{r.closedFrom||'Manual'}</span>
              : <div style={{ display:'flex', gap:4, alignItems:'center', flexWrap:'nowrap' }}>
                  {actionOpts.map(o => (
                    <button key={o.v}
                      className={`act-btn ${o.v==='pending' ? 'act-btn-amber' : 'act-btn-green'}`}
                      onClick={()=>onStatusChange(r, o.v)}>
                      {o.v==='pending' ? '→ Pending' : '✓ Closed'}
                    </button>
                  ))}
                </div>
            }
            <button className="btn-del" onClick={()=>remove(r)}>✕</button>
          </div>
        ))}
      </div>

      {/* Add row */}
      {!showSource && (
        <div style={{ display:'grid', gridTemplateColumns:cols, gap:8, borderTop:'1px solid var(--b1)', paddingTop:12, alignItems:'center' }}>
          <input className="field-input" value={addr} onChange={e=>setAddr(e.target.value)}
            onKeyDown={e=>e.key==='Enter'&&add()} placeholder="New address…"
            style={{ padding:'8px 12px' }}/>
          <input className="field-input" value={price} onChange={e=>setPrice(e.target.value)}
            onKeyDown={e=>e.key==='Enter'&&add()} placeholder="Price"
            style={{ padding:'8px 12px', color:accentColor, fontFamily:"'JetBrains Mono',monospace" }}/>
          <input className="field-input" value={comm} onChange={e=>setComm(e.target.value)}
            onKeyDown={e=>e.key==='Enter'&&add()} placeholder="Commission"
            style={{ padding:'8px 12px', color:'var(--green)', fontFamily:"'JetBrains Mono',monospace" }}/>
          <div/>
          <button onClick={add} style={{
            background: accentColor, border:'none', color:'#fff', borderRadius:8,
            width:30, height:30, fontSize:19, fontWeight:700, cursor:'pointer', lineHeight:1,
            display:'flex', alignItems:'center', justifyContent:'center', transition:'all .15s',
            flexShrink:0,
          }}>+</button>
        </div>
      )}
    </div>
  )
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

function Dashboard({ theme, onToggleTheme }) {
  const { user, profile } = useAuth()
  const today = getToday()

  const [page, setPage] = useState('dashboard')
  const [tab,  setTab]  = useState('today')
  const [dbLoading, setDbLoading] = useState(true)

  // Habit state
  const [habits,   setHabits]   = useState(()=>{
    const g={}; HABITS.forEach(h=>{g[h.id]=Array(WEEKS).fill(null).map(()=>Array(7).fill(false))}); return g
  })
  const [counters, setCounters] = useState({})
  const [xp,             setXp]             = useState(0)
  const [streak,         setStreak]         = useState(0)
  const [xpPop,          setXpPop]          = useState(null)
  const [animCell,       setAnimCell]       = useState(null)
  const [sessionPipeline,setSessionPipeline]= useState({ offer_made:0, offer_received:0, went_pending:0, closed:0 })

  // Listings
  const [listings,  setListings]  = useState([])
  const [newAddr,   setNewAddr]   = useState('')
  const [newPrice,  setNewPrice]  = useState('')
  const [newComm,   setNewComm]   = useState('')

  // Pipeline
  const [offersMade,       setOffersMade]       = useState([])
  const [offersReceived,   setOffersReceived]   = useState([])
  const [pendingDeals,     setPendingDeals]     = useState([])
  const [closedDeals,      setClosedDeals]      = useState([])
  const [wentPendingCount, setWentPendingCount] = useState(0) // historical — never decrements

  const [showCommSummary, setShowCommSummary] = useState(false)

  useEffect(()=>{ loadAll() },[user])

  async function loadAll() {
    if (!user) return
    setDbLoading(true)
    const [habRes, listRes, txRes, profRes] = await Promise.all([
      supabase.from('habit_completions').select('*').eq('user_id',user.id).eq('month_year',MONTH_YEAR),
      supabase.from('listings').select('*').eq('user_id',user.id), // no month filter — listings persist until closed
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

    if (listRes.data) setListings(listRes.data.map(l=>({
      id:l.id, address:l.address, status:l.status||'active',
      price:l.price||'', commission:l.commission||'', monthYear:l.month_year||''
    })))

    if (txRes.data) {
      const m = t => ({ id:t.id, address:t.address, price:t.price||'', commission:t.commission||'', status:t.status||'active', closedFrom:t.closed_from||'' })
      setOffersMade(    txRes.data.filter(t=>t.type==='offer_made').map(m))
      setOffersReceived(txRes.data.filter(t=>t.type==='offer_received').map(m))
      setPendingDeals(  txRes.data.filter(t=>t.type==='pending').map(m))
      setClosedDeals(   txRes.data.filter(t=>t.type==='closed').map(m))
      // Historical count — all records ever marked pending, regardless of current state
      setWentPendingCount(txRes.data.filter(t=>t.type==='pending').length)
    }

    if (profRes.data) {
      setXp(profRes.data.xp||0)
      setStreak(profRes.data.streak||0)
      setShowCommSummary(profRes.data.show_commission||false)
    }
    setDbLoading(false)
  }

  // ── XP ─────────────────────────────────────────────────────────────────────
  async function addXp(amount, color='var(--gold)') {
    const nxp = xp + amount
    setXp(nxp)
    setXpPop({ val:`+${amount} XP`, color })
    setTimeout(()=>setXpPop(null), 1400)
    await supabase.from('profiles').update({xp:nxp}).eq('id',user.id)
    return nxp
  }

  async function awardPipelineXp(type, color) {
    setSessionPipeline(prev => ({...prev, [type]: prev[type]+1}))
    await addXp(PIPELINE_XP[type], color)
  }

  async function deductPipelineXp(type) {
    const amount = PIPELINE_XP[type]
    const nxp    = Math.max(0, xp - amount)
    setXp(nxp)
    setXpPop({ val:`-${amount} XP`, color:'#dc2626' })
    setTimeout(()=>setXpPop(null), 1400)
    await supabase.from('profiles').update({xp:nxp}).eq('id',user.id)
    setSessionPipeline(prev => ({...prev, [type]: Math.max(0, prev[type]-1)}))
    if (type === 'went_pending') setWentPendingCount(prev => Math.max(0, prev - 1))
  }

  // Persist a new Offer Made to DB, award XP, return saved row with real ID
  async function handleOfferMadeAdd(tmpRow) {
    const data = await dbInsert('offer_made', tmpRow)
    await awardPipelineXp('offer_made', '#0ea5e9')
    if (!data) return null
    return { id:data.id, address:data.address||tmpRow.address, price:data.price||'', commission:data.commission||'', status:'active', closedFrom:'' }
  }

  // Persist a new Offer Received to DB, award XP, return saved row with real ID
  async function handleOfferReceivedAdd(tmpRow) {
    const data = await dbInsert('offer_received', tmpRow)
    await awardPipelineXp('offer_received', '#8b5cf6')
    if (!data) return null
    return { id:data.id, address:data.address||tmpRow.address, price:data.price||'', commission:data.commission||'', status:'active', closedFrom:'' }
  }

  // ── Habits ─────────────────────────────────────────────────────────────────
  async function toggleHabit(hid, week, day) {
    const newVal = !habits[hid][week][day]
    setHabits(prev=>{ const n={...prev}; n[hid]=n[hid].map((w,wi)=>wi===week?w.map((d,di)=>di===day?newVal:d):w); return n })
    const h   = HABITS.find(x=>x.id===hid)
    const cat = CAT[h.cat]
    if (newVal) {
      await addXp(h.xp, cat.color)
      const ckey = `${hid}-${week}-${day}`
      await supabase.from('habit_completions').upsert({
        user_id:user.id, habit_id:hid, week_index:week, day_index:day,
        month_year:MONTH_YEAR, xp_earned:h.xp, counter_value:h.counter?(counters[ckey]||0):0
      },{onConflict:'user_id,habit_id,week_index,day_index,month_year'})
    } else {
      const ckey = `${hid}-${week}-${day}`
      const lost = h.xp + (counters[ckey]||0)*(h.xpEach||0)
      const nxp  = Math.max(0, xp - lost)
      setXp(nxp)
      await supabase.from('profiles').update({xp:nxp}).eq('id',user.id)
      await supabase.from('habit_completions').delete()
        .eq('user_id',user.id).eq('habit_id',hid).eq('week_index',week).eq('day_index',day).eq('month_year',MONTH_YEAR)
      if (h.counter) setCounters(prev=>{ const n={...prev}; delete n[ckey]; return n })
    }
    setAnimCell(`${hid}-${week}-${day}`)
    setTimeout(()=>setAnimCell(null),300)
  }

  async function incrementCounter(hid, week, day) {
    const h    = HABITS.find(x=>x.id===hid)
    const cat  = CAT[h.cat]
    const ckey = `${hid}-${week}-${day}`
    if (!habits[hid][week][day]) { await toggleHabit(hid,week,day); return }
    const newCnt = (counters[ckey]||1) + 1
    setCounters(prev=>({...prev,[ckey]:newCnt}))
    if (h.xpEach) await addXp(h.xpEach, cat.color)
    await supabase.from('habit_completions').upsert({
      user_id:user.id, habit_id:hid, week_index:week, day_index:day,
      month_year:MONTH_YEAR, xp_earned:(h.xp||0)+newCnt*(h.xpEach||0), counter_value:newCnt
    },{onConflict:'user_id,habit_id,week_index,day_index,month_year'})
  }

  // ── Pipeline helpers ───────────────────────────────────────────────────────
  async function dbInsert(type, item, closedFrom='') {
    const {data} = await supabase.from('transactions').insert({
      user_id:user.id, type, address:item.address||'', price:item.price||'',
      commission:item.commission||'', status:type==='closed'?'closed':'active',
      closed_from:closedFrom||item.closedFrom||null, month_year:MONTH_YEAR
    }).select().single()
    return data
  }
  async function dbDelete(id) {
    if (id && !String(id).startsWith('tmp-')) await supabase.from('transactions').delete().eq('id',id)
  }

  async function handleOfferStatus(row, newStatus, srcSetter) {
    if (newStatus === 'pending') {
      // NON-DESTRUCTIVE: keep entry in its current section, also create a Went Pending record
      const data = await dbInsert('pending', row, 'Offers')
      if (data) setPendingDeals(prev=>[...prev,{...row,id:data.id,status:'active',closedFrom:'Offers'}])
      setWentPendingCount(prev => prev + 1)
      await awardPipelineXp('went_pending', '#f59e0b')
    } else if (newStatus === 'closed') {
      // NON-DESTRUCTIVE: keep entry in its current section, also create a Closed record
      const data = await dbInsert('closed', row, 'Offers')
      if (data) setClosedDeals(prev=>[...prev,{...row,id:data.id,status:'closed',closedFrom:'Offers'}])
      await awardPipelineXp('closed', '#10b981')
    }
  }

  async function handlePendingStatus(row, newStatus) {
    if (newStatus === 'closed') {
      // NON-DESTRUCTIVE: keep entry in Went Pending, also create a Closed record
      const data = await dbInsert('closed', row, row.closedFrom||'Pending')
      if (data) setClosedDeals(prev=>[...prev,{...row,id:data.id,status:'closed',closedFrom:row.closedFrom||'Pending'}])
      await awardPipelineXp('closed', '#10b981')
    }
  }

  // ── Listings ───────────────────────────────────────────────────────────────
  async function addListing() {
    if (!newAddr.trim()) return
    const {data} = await supabase.from('listings').insert({
      user_id:user.id, address:newAddr.trim(), unit_count:1,
      price:newPrice.trim(), commission:newComm.trim(),
      status:'active', month_year:MONTH_YEAR
    }).select().single()
    if (data) setListings(prev=>[...prev,{id:data.id,address:data.address,status:'active',price:data.price||'',commission:data.commission||'',monthYear:data.month_year||MONTH_YEAR}])
    setNewAddr(''); setNewPrice(''); setNewComm('')
  }

  async function removeListing(listing) {
    setListings(prev=>prev.filter(l=>l.id!==listing.id))
    await supabase.from('listings').delete().eq('id',listing.id)
  }

  async function updateListing(id, field, val) {
    setListings(prev=>prev.map(l=>l.id===id?{...l,[field]:val}:l))
    if (field==='address')    await supabase.from('listings').update({address:val}).eq('id',id)
    if (field==='status')     await supabase.from('listings').update({status:val}).eq('id',id)
    if (field==='price')      await supabase.from('listings').update({price:val}).eq('id',id)
    if (field==='commission') await supabase.from('listings').update({commission:val}).eq('id',id)
  }

  // Create an Offer Received pipeline entry from a listing (offer came in on your listing)
  async function handleListingOfferReceived(listing) {
    const data = await dbInsert('offer_received', {address:listing.address, price:listing.price||'', commission:listing.commission||''})
    if (data) setOffersReceived(prev=>[...prev,{id:data.id,address:listing.address,price:listing.price||'',commission:listing.commission||'',status:'active',closedFrom:''}])
    await awardPipelineXp('offer_received', '#8b5cf6')
  }

  async function handleListingStatus(listing, newStatus) {
    const lPrice = listing.price||''
    const lComm  = listing.commission||''
    if (newStatus === 'pending') {
      // NON-DESTRUCTIVE: listing stays, status pill changes, Went Pending entry created
      await updateListing(listing.id, 'status', 'pending')
      const data = await dbInsert('pending', {address:listing.address, price:lPrice, commission:lComm}, 'Listing')
      if (data) setPendingDeals(prev=>[...prev,{id:data.id,address:listing.address,price:lPrice,commission:lComm,status:'active',closedFrom:'Listing'}])
      setWentPendingCount(prev => prev + 1)
      await awardPipelineXp('went_pending', '#f59e0b')
    } else if (newStatus === 'closed') {
      // NON-DESTRUCTIVE: listing stays with 'closed' status, Closed entry created
      await updateListing(listing.id, 'status', 'closed')
      const data = await dbInsert('closed', {address:listing.address, price:lPrice, commission:lComm}, 'Listing')
      if (data) setClosedDeals(prev=>[...prev,{id:data.id,address:listing.address,price:lPrice,commission:lComm,status:'closed',closedFrom:'Listing'}])
      await awardPipelineXp('closed', '#10b981')
    }
  }

  // ── Derived ────────────────────────────────────────────────────────────────
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
  const totalListings    = listings.filter(l => l.status !== 'closed').length
  const closedVol        = closedDeals.reduce((a,r)=>{ const n=parseFloat(String(r.price||'').replace(/[^0-9.]/g,'')); return a+(isNaN(n)?0:n) },0)
  const closedComm       = closedDeals.reduce((a,r)=>{ const n=parseFloat(String(r.commission||'').replace(/[^0-9.]/g,'')); return a+(isNaN(n)?0:n) },0)
  const todayHabitXp     = HABITS.reduce((acc,h)=>{
    if(!habits[h.id][today.week][today.day]) return acc
    const ckey=`${h.id}-${today.week}-${today.day}`
    const cnt=counters[ckey]||0
    return acc + h.xp + (cnt>0?Math.max(0,cnt-1)*(h.xpEach||0):0)
  },0)
  const sessionPipelineXp =
    sessionPipeline.offer_made    * PIPELINE_XP.offer_made    +
    sessionPipeline.offer_received * PIPELINE_XP.offer_received +
    sessionPipeline.went_pending  * PIPELINE_XP.went_pending  +
    sessionPipeline.closed        * PIPELINE_XP.closed
  const todayXp = todayHabitXp + sessionPipelineXp

  const dateStr   = new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'})
  const weekColors = ['#0ea5e9','#10b981','#f43f5e','#f59e0b']
  const quotes    = [
    "The market rewards consistency.", "Every call is a door. Open more.", "Top producers are built one habit at a time.",
    "Your pipeline today is your commission next quarter.", "Make the uncomfortable call. Every time.",
    "Discipline bridges goals and achievement.", "Listings don't find agents. Agents find listings.",
  ]
  const quote = quotes[new Date().getDay()]

  if (page==='leaderboard') return <Leaderboard   onBack={()=>setPage('dashboard')} theme={theme} onToggleTheme={onToggleTheme}/>
  if (page==='teams')       return <TeamsPage     onBack={()=>setPage('dashboard')} theme={theme} onToggleTheme={onToggleTheme}/>
  if (page==='profile')     return <ProfilePage   onBack={()=>setPage('dashboard')} theme={theme} onToggleTheme={onToggleTheme}/>
  if (page==='directory')   return <DirectoryPage onBack={()=>setPage('dashboard')} onNavigate={setPage} theme={theme} onToggleTheme={onToggleTheme}/>
  if (page==='apod')        return <APODPage      onBack={()=>setPage('directory')} theme={theme} onToggleTheme={onToggleTheme}/>

  return (
    <div className="page">
      {/* XP float */}
      {xpPop && (
        <div style={{ position:'fixed', top:74, right:30, zIndex:9999, pointerEvents:'none',
          fontFamily:"'Fraunces',serif", fontSize:22, fontWeight:700, color:xpPop.color,
          animation:'floatXp 1.4s ease forwards', textShadow:`0 0 20px ${xpPop.color}55` }}>
          {xpPop.val}
        </div>
      )}

      {/* ── Nav ─────────────────────────────────────────────── */}
      <nav className="topnav">
        <div style={{ display:'flex', alignItems:'center', gap:14 }}>
          <Wordmark light/>
          <span style={{ width:1, height:20, background:'rgba(255,255,255,.1)', display:'block', flexShrink:0 }}/>
          <span style={{ fontSize:10, color:'var(--nav-sub)', fontFamily:"'JetBrains Mono',monospace",
            letterSpacing:.5 }}>{MONTH_YEAR}</span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:7 }}>
          <ThemeToggle theme={theme} onToggle={onToggleTheme}/>

          <span style={{ width:1, height:18, background:'rgba(255,255,255,.08)', display:'block' }}/>

          <button className="nav-btn" onClick={()=>setPage('leaderboard')}>🏆 Board</button>
          <button className="nav-btn" onClick={()=>setPage('teams')}>👥 Teams</button>
          <button className="nav-btn" onClick={()=>setPage('directory')}>🔗 Tools</button>

          <span style={{ width:1, height:18, background:'rgba(255,255,255,.08)', display:'block' }}/>

          {/* Rank chip */}
          <div style={{ background:'rgba(255,255,255,.06)', border:`1px solid ${rank.color}38`,
            borderRadius:9, padding:'5px 11px', display:'flex', alignItems:'center', gap:9 }}>
            <span style={{ fontSize:12, fontWeight:600, color:rank.color }}>{rank.icon} {rank.name}</span>
            <div style={{ width:44, height:3, background:'rgba(255,255,255,.1)', borderRadius:2, overflow:'hidden' }}>
              <div style={{ height:'100%', background:rank.color, borderRadius:2, width:`${rankPct}%`,
                transition:'width .6s', boxShadow:`0 0 5px ${rank.color}99` }}/>
            </div>
            <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11, color:rank.color, fontWeight:700 }}>
              {xp.toLocaleString()}
            </span>
          </div>

          <div style={{ background:'rgba(255,255,255,.06)', border:'1px solid rgba(255,165,0,.18)',
            borderRadius:9, padding:'5px 11px', textAlign:'center' }}>
            <div style={{ fontSize:9, color:'var(--nav-sub)', letterSpacing:.8, lineHeight:1 }}>STREAK</div>
            <div className="serif" style={{ fontSize:15, color:'#fb923c', lineHeight:1.2 }}>🔥 {streak}</div>
          </div>

          <button className="nav-btn active" onClick={()=>setPage('profile')}>
            {profile?.full_name?.split(' ')[0]||'Profile'}
          </button>
          <button className="btn-ghost" style={{ background:'transparent', border:'1px solid rgba(255,255,255,.09)', color:'var(--nav-sub)', fontSize:12 }}
            onClick={()=>supabase.auth.signOut()}>Sign out</button>
        </div>
      </nav>

      {dbLoading ? <Loader/> : (
      <div className="page-inner">

        {/* ── Header ─────────────────────────────────────────── */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', marginBottom:22, flexWrap:'wrap', gap:12 }}>
          <div>
            <div className="serif" style={{ fontSize:34, color:'var(--text)', lineHeight:1.1, marginBottom:5 }}>
              {dateStr.split(',')[0]}<span style={{ color:'var(--gold)' }}>,</span>
            </div>
            <div style={{ fontSize:12, color:'var(--muted)', fontFamily:"'JetBrains Mono',monospace", letterSpacing:.3 }}>
              {dateStr.split(',').slice(1).join(',').trim()}
            </div>
          </div>
          <div className="serif" style={{ fontStyle:'italic', fontSize:14, color:'var(--dim)', maxWidth:340, textAlign:'right', lineHeight:1.65 }}>
            "{quote}"
          </div>
        </div>

        {/* ── Stats row ──────────────────────────────────────── */}
        <div className="stat-grid" style={{ marginBottom:18 }}>
          <StatCard icon="⚡" label="Today" value={`${todayPct}%`}
            color={todayPct>=80?'var(--green)':todayPct>=50?'var(--gold)':'var(--red)'}
            sub={`${todayChecks}/${HABITS.length} habits`}
            accent={todayPct>=80?'#10b981':todayPct>=50?'#d97706':'#dc2626'}/>
          <StatCard icon="📅" label="Month"        value={`${monthPct}%`}   color="var(--gold)"  sub={`${totalHabitChecks} checks`}/>
          <StatCard icon="📅" label="Appointments" value={totalAppts}        color="var(--green)" sub="this month"/>
          <StatCard icon="🔑" label="Showings"      value={totalShowings}    color="var(--blue)"/>
          <StatCard icon="🏡" label="Listed"        value={totalListings}         color="var(--purple)"/>
          <StatCard icon="📤" label="Offers Made"   value={offersMade.length}     color="var(--blue)"/>
          <StatCard icon="📥" label="Offers Rec'd"  value={offersReceived.length} color="var(--purple)"/>
          <StatCard icon="⏳" label="Went Pending"  value={wentPendingCount}      color="var(--gold2)"/>
          <StatCard icon="🎉" label="Closed"         value={closedDeals.length}    color="var(--green)" sub={closedVol>0?fmtMoney(closedVol):null}/>
          {showCommSummary && closedComm>0 && <StatCard icon="💰" label="Commission" value={fmtMoney(closedComm)||'$0'} color="var(--green)" accent="#10b981"/>}
        </div>

        {/* Pipeline XP info */}
        <div className="card-flat" style={{ padding:'10px 16px', marginBottom:20, display:'flex', alignItems:'center', gap:16, flexWrap:'wrap' }}>
          <span className="label">Pipeline XP</span>
          {[{l:'Offer Made',xp:75,c:'#0ea5e9'},{l:'Went Pending',xp:150,c:'#f59e0b'},{l:'Closed',xp:300,c:'#10b981'}].map((p,i)=>(
            <div key={i} style={{ display:'flex', alignItems:'center', gap:5 }}>
              <span style={{ fontSize:9, padding:'2px 7px', borderRadius:4, fontWeight:700,
                fontFamily:"'JetBrains Mono',monospace", background:`${p.c}14`, color:p.c, border:`1px solid ${p.c}28` }}>
                +{p.xp} XP
              </span>
              <span style={{ fontSize:11, color:'var(--muted)' }}>{p.l}</span>
            </div>
          ))}
          <label style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:6, fontSize:12, color:'var(--muted)', cursor:'pointer' }}>
            <input type="checkbox" checked={showCommSummary} onChange={async e=>{
              setShowCommSummary(e.target.checked)
              await supabase.from('profiles').update({show_commission:e.target.checked}).eq('id',user.id)
            }} style={{ accentColor:'var(--gold)' }}/>
            Show commission
          </label>
        </div>

        {/* ── Tabs ──────────────────────────────────────────── */}
        <div className="tabs">
          {[{id:'today',l:'Today'},{id:'monthly',l:'Monthly Grid'},{id:'weekly',l:'Week View'}].map(t=>(
            <button key={t.id} className={`tab-item${tab===t.id?' on':''}`} onClick={()=>setTab(t.id)}>{t.l}</button>
          ))}
        </div>

        {/* ══ TODAY ══════════════════════════════════════════ */}
        {tab==='today' && (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 220px', gap:20, alignItems:'start', animation:'fadeUp .3s ease' }}>

            {/* Habits checklist */}
            <div className="card" style={{ padding:24 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18 }}>
                <div>
                  <div className="serif" style={{ fontSize:21, color:'var(--text)', marginBottom:2 }}>Daily Habits</div>
                  <div style={{ fontSize:12, color:'var(--muted)' }}>{FULL_DAYS[today.day]} check-ins</div>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <Ring pct={todayPct} size={54} color={todayPct>=80?'#10b981':todayPct>=50?'#d97706':'#dc2626'}/>
                  <div>
                    <div className="serif" style={{ fontSize:22, color:'var(--text)', lineHeight:1 }}>{todayChecks}/{HABITS.length}</div>
                    <div style={{ fontSize:10, color:'var(--muted)' }}>completed</div>
                  </div>
                </div>
              </div>

              <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
                {HABITS.map(h => {
                  const done  = habits[h.id][today.week][today.day]
                  const cs    = CAT[h.cat]
                  const ckey  = `${h.id}-${today.week}-${today.day}`
                  const cnt   = counters[ckey]||0
                  return (
                    <div key={h.id} className={`habit-row${done?' done':''}`}>
                      <button className="chk" onClick={()=>toggleHabit(h.id,today.week,today.day)}
                        style={done?{background:cs.light,borderColor:cs.color}:{}}>
                        {done && (
                          <svg width="11" height="8" viewBox="0 0 11 8" fill="none">
                            <path d="M1 4L4 7L10 1" stroke={cs.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </button>
                      <span style={{ fontSize:15, flexShrink:0 }}>{h.icon}</span>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:13, fontWeight:500, color:done?'var(--muted)':'var(--text)',
                          textDecoration:done?'line-through':'none', transition:'all .15s' }}>{h.label}</div>
                        <div style={{ fontSize:10, color:'var(--dim)' }}>
                          +{h.xp} XP{h.xpEach?` · +${h.xpEach} per extra`:''}
                        </div>
                      </div>
                      <span style={{ fontSize:9, padding:'2px 7px', borderRadius:4, fontWeight:500, flexShrink:0,
                        background:cs.light, color:cs.color, border:`1px solid ${cs.border}` }}>
                        {h.cat}
                      </span>
                      {h.counter && done && (
                        <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
                          <span className="mono" style={{ fontSize:15, color:cs.color, fontWeight:700, minWidth:22, textAlign:'center' }}>
                            {cnt||1}
                          </span>
                          <button className="cnt-btn" onClick={()=>incrementCounter(h.id,today.week,today.day)}
                            style={{ borderColor:cs.color, color:cs.color }}>+</button>
                        </div>
                      )}
                      {h.counter && !done && (
                        <button className="cnt-btn" onClick={()=>incrementCounter(h.id,today.week,today.day)}
                          style={{ borderColor:'var(--b3)', color:'var(--dim)' }}>+</button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Sidebar */}
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <div className="card" style={{ padding:20, textAlign:'center' }}>
                <Ring pct={todayPct} size={100}
                  color={todayPct>=80?'#10b981':todayPct>=50?'#d97706':'#dc2626'} sw={8}/>
                <div className="serif" style={{ marginTop:12, fontSize:15, color:'var(--text)' }}>
                  {todayPct===100?'Perfect day! 🎉':todayPct>=80?'Almost there!':todayPct>=50?'Good progress':'Keep going'}
                </div>
                <div style={{ fontSize:11, color:'var(--muted)', marginTop:4 }}>
                  {HABITS.length-todayChecks} habit{HABITS.length-todayChecks!==1?'s':''} left
                </div>
              </div>

              {HABITS.filter(h=>h.counter&&habits[h.id][today.week][today.day]).length>0 && (
                <div className="card" style={{ padding:16 }}>
                  <div className="label" style={{ marginBottom:10 }}>Today's Counts</div>
                  {HABITS.filter(h=>h.counter).map(h=>{
                    const ckey = `${h.id}-${today.week}-${today.day}`
                    const cnt  = counters[ckey]||0
                    if (!habits[h.id][today.week][today.day]) return null
                    const cs = CAT[h.cat]
                    return (
                      <div key={h.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
                        marginBottom:5, padding:'6px 8px', borderRadius:7, background:cs.light }}>
                        <span style={{ fontSize:12, color:'var(--text2)' }}>{h.icon} {h.label}</span>
                        <span className="mono" style={{ fontWeight:700, fontSize:14, color:cs.color }}>{cnt||1}</span>
                      </div>
                    )
                  })}
                </div>
              )}

              <div className="card" style={{ padding:16, background:'var(--gold3)', border:'1px solid var(--gold4)' }}>
                <div className="label" style={{ marginBottom:6, color:'var(--gold)', textAlign:'center' }}>XP Earned Today</div>
                <div className="serif" style={{ fontSize:36, color:'var(--gold)', fontWeight:700, textAlign:'center', lineHeight:1 }}>
                  {todayXp.toLocaleString()}
                </div>
                <div style={{ fontSize:10, color:'var(--muted)', marginTop:3, textAlign:'center' }}>
                  all-time: {xp.toLocaleString()} XP
                </div>

                {/* Breakdown by source */}
                {todayXp > 0 && (
                  <div style={{ marginTop:12, borderTop:'1px solid var(--gold4)', paddingTop:10, display:'flex', flexDirection:'column', gap:5 }}>
                    {todayHabitXp > 0 && (
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:11 }}>
                        <span style={{ color:'var(--muted)' }}>⚡ Habits</span>
                        <span className="mono" style={{ color:'var(--gold)', fontWeight:700 }}>+{todayHabitXp.toLocaleString()}</span>
                      </div>
                    )}
                    {sessionPipeline.offer_made > 0 && (
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:11 }}>
                        <span style={{ color:'var(--muted)' }}>📤 Offers Made ×{sessionPipeline.offer_made}</span>
                        <span className="mono" style={{ color:'#0ea5e9', fontWeight:700 }}>+{(sessionPipeline.offer_made*PIPELINE_XP.offer_made).toLocaleString()}</span>
                      </div>
                    )}
                    {sessionPipeline.offer_received > 0 && (
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:11 }}>
                        <span style={{ color:'var(--muted)' }}>📥 Offers Rec'd ×{sessionPipeline.offer_received}</span>
                        <span className="mono" style={{ color:'#8b5cf6', fontWeight:700 }}>+{(sessionPipeline.offer_received*PIPELINE_XP.offer_received).toLocaleString()}</span>
                      </div>
                    )}
                    {sessionPipeline.went_pending > 0 && (
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:11 }}>
                        <span style={{ color:'var(--muted)' }}>⏳ Went Pending ×{sessionPipeline.went_pending}</span>
                        <span className="mono" style={{ color:'#f59e0b', fontWeight:700 }}>+{(sessionPipeline.went_pending*PIPELINE_XP.went_pending).toLocaleString()}</span>
                      </div>
                    )}
                    {sessionPipeline.closed > 0 && (
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:11 }}>
                        <span style={{ color:'var(--muted)' }}>🎉 Closed ×{sessionPipeline.closed}</span>
                        <span className="mono" style={{ color:'#10b981', fontWeight:700 }}>+{(sessionPipeline.closed*PIPELINE_XP.closed).toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ══ MONTHLY GRID ════════════════════════════════════ */}
        {tab==='monthly' && (
          <div style={{ animation:'fadeUp .3s ease' }}>
            <div className="card" style={{ padding:20, marginBottom:16 }}>
              <div className="label" style={{ marginBottom:16 }}>Weekly Completion</div>
              <div style={{ display:'flex', gap:28, flexWrap:'wrap', justifyContent:'space-around', alignItems:'center' }}>
                {Array(WEEKS).fill(null).map((_,wi)=>{
                  const wTotal=HABITS.reduce((a,h)=>a+habits[h.id][wi].filter(Boolean).length,0)
                  return <Ring key={wi} pct={Math.round(wTotal/(HABITS.length*7)*100)} size={88}
                    color={weekColors[wi]} label={`Week ${wi+1}`} sub={`${wTotal}/${HABITS.length*7}`}/>
                })}
                <div style={{ width:1, height:70, background:'var(--b1)' }}/>
                <Ring pct={monthPct} size={108} color="var(--gold)" label="Monthly" sub={`${totalHabitChecks}/${totalPossible}`}/>
              </div>
            </div>

            <div className="card" style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', minWidth:780 }}>
                <thead>
                  <tr style={{ borderBottom:'1px solid var(--b1)' }}>
                    <th style={{ padding:'12px 16px', textAlign:'left', minWidth:200 }}>
                      <span className="label">Habit</span>
                    </th>
                    {Array(WEEKS).fill(null).map((_,wi)=>(
                      <th key={wi} colSpan={7} style={{ padding:'10px 4px', textAlign:'center',
                        borderLeft:'1px solid var(--b1)' }}>
                        <span style={{ fontSize:10, fontWeight:700, color:weekColors[wi], letterSpacing:.8 }}>WK {wi+1}</span>
                      </th>
                    ))}
                    <th style={{ padding:'10px 14px', borderLeft:'1px solid var(--b1)' }}><span className="label">XP</span></th>
                    <th style={{ padding:'10px 14px' }}><span className="label">%</span></th>
                  </tr>
                </thead>
                <tbody>
                  {HABITS.map((h,hi)=>{
                    const done = habits[h.id].flat().filter(Boolean).length
                    const pct  = Math.round(done/(WEEKS*7)*100)
                    const cs   = CAT[h.cat]
                    const habitTotal = h.counter ? Object.entries(counters).filter(([k])=>k.startsWith(h.id)).reduce((a,[,v])=>a+v,0) : 0
                    const xpEarned   = done*h.xp + (habitTotal>0?habitTotal*(h.xpEach||0):0)
                    return (
                      <tr key={h.id} style={{ borderBottom:'1px solid var(--b1)', background:hi%2===0?'transparent':'var(--bg)' }}>
                        <td style={{ padding:'7px 16px' }}>
                          <div style={{ display:'flex', alignItems:'center', gap:7, flexWrap:'wrap' }}>
                            <span style={{ fontSize:14 }}>{h.icon}</span>
                            <span style={{ fontSize:12, fontWeight:500, color:'var(--text)' }}>{h.label}</span>
                            <span style={{ fontSize:9, padding:'1px 5px', borderRadius:3, background:cs.light, color:cs.color, border:`1px solid ${cs.border}` }}>{h.cat}</span>
                            {habitTotal>0 && <span style={{ fontSize:9, padding:'1px 5px', borderRadius:3, background:cs.light, color:cs.color, fontFamily:"'JetBrains Mono',monospace", fontWeight:700 }}>×{habitTotal}</span>}
                          </div>
                        </td>
                        {Array(WEEKS).fill(null).map((_,wi)=>Array(7).fill(null).map((__,di)=>{
                          const checked = habits[h.id][wi][di]
                          const isToday = wi===today.week && di===today.day
                          const ckey    = `${h.id}-${wi}-${di}`
                          return (
                            <td key={`${wi}-${di}`} style={{ textAlign:'center', padding:'5px 2px', borderLeft:di===0?'1px solid var(--b1)':'none' }}>
                              <button onClick={()=>toggleHabit(h.id,wi,di)} style={{
                                width:20, height:20, borderRadius:5,
                                border:`1.5px solid ${checked?cs.color:isToday?'var(--gold)':'var(--b2)'}`,
                                background:checked?cs.light:'transparent', cursor:'pointer',
                                display:'flex', alignItems:'center', justifyContent:'center',
                                animation:animCell===ckey?'pop .25s ease':'none', transition:'all .15s',
                              }}>
                                {checked && <span style={{ fontSize:8, color:cs.color, fontWeight:700 }}>✓</span>}
                                {isToday && !checked && <span style={{ width:4, height:4, borderRadius:'50%', background:'var(--gold)', display:'block' }}/>}
                              </button>
                              {h.counter && checked && (
                                <div style={{ display:'flex', alignItems:'center', gap:1, marginTop:2, justifyContent:'center' }}>
                                  <span style={{ fontSize:8, color:cs.color, fontFamily:"'JetBrains Mono',monospace", fontWeight:700 }}>{counters[ckey]||1}</span>
                                  <button onClick={()=>incrementCounter(h.id,wi,di)} style={{
                                    width:11, height:11, borderRadius:3, border:`1px solid ${cs.color}`, background:'transparent',
                                    cursor:'pointer', fontSize:9, lineHeight:1, color:cs.color, fontWeight:700,
                                    display:'flex', alignItems:'center', justifyContent:'center',
                                  }}>+</button>
                                </div>
                              )}
                            </td>
                          )
                        }))}
                        <td style={{ padding:'0 14px', textAlign:'right', borderLeft:'1px solid var(--b1)', whiteSpace:'nowrap' }}>
                          <span className="mono" style={{ fontSize:11, color:cs.color, fontWeight:700 }}>+{xpEarned.toLocaleString()}</span>
                        </td>
                        <td style={{ padding:'0 14px', minWidth:80 }}>
                          <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                            <div style={{ flex:1, height:4, background:'var(--b1)', borderRadius:2, overflow:'hidden' }}>
                              <div style={{ height:'100%', background:cs.color, borderRadius:2, width:`${pct}%`, transition:'width .4s' }}/>
                            </div>
                            <span style={{ fontSize:10, color:'var(--dim)', width:28, fontFamily:"'JetBrains Mono',monospace" }}>{pct}%</span>
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

        {/* ══ WEEKLY ══════════════════════════════════════════ */}
        {tab==='weekly' && (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(178px,1fr))', gap:12, animation:'fadeUp .3s ease' }}>
            {DAYS.map((dayName,di)=>{
              const done    = HABITS.filter(h=>habits[h.id][today.week][di])
              const pct     = Math.round(done.length/HABITS.length*100)
              const isToday = di===today.day
              const dc      = weekColors[di%4]
              return (
                <div key={di} className="card" style={{ padding:16, border:isToday?`2px solid ${dc}44`:'1px solid var(--b2)', background:isToday?`color-mix(in srgb, var(--surface) 94%, ${dc})`:'' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                    <div>
                      <div style={{ fontWeight:600, fontSize:13, color:isToday?dc:'var(--text)' }}>{dayName}</div>
                      {isToday && <div style={{ fontSize:9, color:dc, fontWeight:700, letterSpacing:.8 }}>TODAY</div>}
                    </div>
                    <Ring pct={pct} size={44} color={dc} sw={4}/>
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
                    {HABITS.map(h=>{
                      const checked = habits[h.id][today.week][di]
                      const cs      = CAT[h.cat]
                      return (
                        <button key={h.id} onClick={()=>toggleHabit(h.id,today.week,di)} style={{
                          display:'flex', alignItems:'center', gap:6, width:'100%', textAlign:'left',
                          background:checked?cs.light:'transparent', border:`1px solid ${checked?cs.border:'transparent'}`,
                          borderRadius:7, padding:'5px 7px', cursor:'pointer', transition:'all .15s',
                        }}>
                          <div style={{ width:11, height:11, borderRadius:3, border:`1.5px solid ${checked?cs.color:'var(--b3)'}`,
                            background:checked?cs.color:'transparent', flexShrink:0 }}/>
                          <span style={{ fontSize:10, flex:1, color:checked?'var(--muted)':'var(--text2)',
                            textDecoration:checked?'line-through':'none' }}>{h.icon} {h.label}</span>
                          <span className="mono" style={{ fontSize:9, color:cs.color }}>+{h.xp}</span>
                        </button>
                      )
                    })}
                  </div>
                  <div style={{ marginTop:10, display:'flex', justifyContent:'space-between',
                    fontSize:10, color:'var(--dim)', borderTop:'1px solid var(--b1)', paddingTop:8 }}>
                    <span style={{ color:dc, fontWeight:600 }}>✓ {done.length}</span>
                    <span>○ {HABITS.length-done.length}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ══ LISTINGS ════════════════════════════════════════ */}
        <div style={{ marginTop:36 }}>
          <div className="section-divider"/>
          <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:14, gap:12, flexWrap:'wrap' }}>
            <div>
              <div style={{ display:'flex', alignItems:'center', gap:9, marginBottom:4 }}>
                <span style={{ fontSize:20 }}>🏡</span>
                <span className="serif" style={{ fontSize:20, color:'var(--text)', fontWeight:600 }}>Listings Tracker</span>
                <span style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:700, fontSize:18, color:'var(--purple)', lineHeight:1 }}>{listings.length}</span>
              </div>
              <div className="section-sub" style={{ marginBottom:0 }}>
                Listings persist across months until closed · <strong>Pending</strong> creates a pipeline entry · <strong>Closed</strong> completes the deal
              </div>
            </div>
          </div>

          <div className="card" style={{ padding:20 }}>
            {/* Column headers */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 105px 115px auto', gap:8, padding:'3px 13px', marginBottom:6 }}>
              <span className="label">Address</span>
              <span className="label">List Price</span>
              <span className="label">Commission</span>
              <span className="label">Status &amp; Actions</span>
            </div>

            {listings.length===0 && (
              <div style={{ textAlign:'center', padding:'22px 0', color:'var(--dim)', fontSize:12 }}>
                No listings this month — add one below
              </div>
            )}

            <div style={{ display:'flex', flexDirection:'column', gap:5, marginBottom:12 }}>
              {listings.map(l => (
                <div key={l.id} className="pipe-row" style={{ gridTemplateColumns:'1fr 105px 115px auto' }}>
                  {/* Address + optional cross-month badge */}
                  <div style={{ display:'flex', alignItems:'center', gap:6, minWidth:0 }}>
                    <input className="pipe-input" value={l.address||''}
                      onChange={e=>updateListing(l.id,'address',e.target.value)} placeholder="Address…"
                      style={{ flex:1, minWidth:0 }}/>
                    {l.monthYear && l.monthYear !== MONTH_YEAR && (
                      <span title={`Listed in ${fmtMonth(l.monthYear)}`} style={{
                        flexShrink:0, fontSize:9, padding:'2px 6px', borderRadius:4,
                        background:'var(--bg2)', color:'var(--dim)',
                        fontFamily:"'JetBrains Mono',monospace", fontWeight:600, letterSpacing:.3,
                        border:'1px solid var(--b2)', whiteSpace:'nowrap',
                      }}>
                        {fmtMonth(l.monthYear)}
                      </span>
                    )}
                  </div>

                  {/* List Price */}
                  <input className="pipe-input" value={l.price||''}
                    onChange={e=>updateListing(l.id,'price',e.target.value)}
                    onBlur={e=>updateListing(l.id,'price',e.target.value)}
                    placeholder="$0"
                    style={{ color:'var(--gold2)', fontWeight:600, fontFamily:"'JetBrains Mono',monospace" }}/>

                  {/* Commission */}
                  <input className="pipe-input" value={l.commission||''}
                    onChange={e=>updateListing(l.id,'commission',e.target.value)}
                    onBlur={e=>updateListing(l.id,'commission',e.target.value)}
                    placeholder="comm."
                    style={{ color:'var(--green)', fontWeight:600, fontFamily:"'JetBrains Mono',monospace" }}/>

                  {/* Status + action buttons + delete — all on one line */}
                  <div style={{ display:'flex', alignItems:'center', gap:5, flexShrink:0, flexWrap:'nowrap' }}>
                    <span className={`status-pill sp-${l.status||'active'}`}>
                      {l.status==='pending' ? '⏳ Pending' : l.status==='closed' ? '✓ Closed' : '● Active'}
                    </span>
                    {/* Action buttons only shown for non-closed listings */}
                    {l.status !== 'closed' && (
                      <>
                        {/* Offer received on this listing */}
                        <button className="act-btn act-btn-blue" onClick={()=>handleListingOfferReceived(l)}
                          title="Log an offer received on this listing">
                          Offer Rec'd
                        </button>
                        {/* Move to pending — only if not already pending */}
                        {(l.status==='active' || !l.status) && (
                          <button className="act-btn act-btn-amber" onClick={()=>handleListingStatus(l,'pending')}>
                            → Pending
                          </button>
                        )}
                        {/* Close the deal */}
                        <button className="act-btn act-btn-green" onClick={()=>handleListingStatus(l,'closed')}>
                          ✓ Closed
                        </button>
                      </>
                    )}
                    <button className="btn-del" onClick={()=>removeListing(l)}>✕</button>
                  </div>
                </div>
              ))}
            </div>

            {/* Add new listing */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 105px 115px auto', gap:8,
              borderTop:'1px solid var(--b1)', paddingTop:12, alignItems:'center' }}>
              <input className="field-input" value={newAddr} onChange={e=>setNewAddr(e.target.value)}
                onKeyDown={e=>e.key==='Enter'&&addListing()} placeholder="New listing address…"
                style={{ padding:'8px 12px' }}/>
              <input className="field-input" value={newPrice} onChange={e=>setNewPrice(e.target.value)}
                onKeyDown={e=>e.key==='Enter'&&addListing()} placeholder="$0"
                style={{ padding:'8px 10px', color:'var(--gold2)', fontFamily:"'JetBrains Mono',monospace", fontWeight:600 }}/>
              <input className="field-input" value={newComm} onChange={e=>setNewComm(e.target.value)}
                onKeyDown={e=>e.key==='Enter'&&addListing()} placeholder="Commission"
                style={{ padding:'8px 10px', color:'var(--green)', fontFamily:"'JetBrains Mono',monospace", fontWeight:600 }}/>
              <button onClick={addListing} style={{
                background:'var(--purple)', border:'none', color:'#fff', borderRadius:9,
                padding:'9px 16px', fontSize:13, fontWeight:600, cursor:'pointer', lineHeight:1,
                display:'flex', alignItems:'center', gap:5, whiteSpace:'nowrap', transition:'all .15s',
                flexShrink:0,
              }}>+ Add</button>
            </div>
          </div>
        </div>

        {/* ══ PIPELINE ════════════════════════════════════════ */}
        <div style={{ marginTop:36 }}>
          <div className="section-divider"/>
          <div style={{ display:'flex', alignItems:'center', gap:9, marginBottom:16 }}>
            <span style={{ fontSize:20 }}>📊</span>
            <span className="serif" style={{ fontSize:20, color:'var(--text)', fontWeight:600 }}>Transaction Pipeline</span>
            <span style={{ fontSize:11, color:'var(--muted)', paddingLeft:4 }}>
              Historical counts preserved · Commission is per-deal
            </span>
          </div>

          <PipelineSection title="Offers Made" icon="📤" accentColor="#0ea5e9" xpLabel={PIPELINE_XP.offer_made}
            rows={offersMade} setRows={setOffersMade}
            onStatusChange={(r,s)=>handleOfferStatus(r,s,setOffersMade)}
            onAdd={handleOfferMadeAdd}
            onRemove={()=>deductPipelineXp('offer_made')}
            statusOpts={[{v:'active',l:'Active'},{v:'pending',l:'Move to Pending'},{v:'closed',l:'Mark Closed'}]}/>

          <PipelineSection title="Offers Received" icon="📥" accentColor="#8b5cf6" xpLabel={PIPELINE_XP.offer_received}
            rows={offersReceived} setRows={setOffersReceived}
            onStatusChange={(r,s)=>handleOfferStatus(r,s,setOffersReceived)}
            onAdd={handleOfferReceivedAdd}
            onRemove={()=>deductPipelineXp('offer_received')}
            statusOpts={[{v:'active',l:'Active'},{v:'pending',l:'Move to Pending'},{v:'closed',l:'Mark Closed'}]}/>

          <PipelineSection title="Went Pending" icon="⏳" accentColor="#f59e0b" xpLabel={PIPELINE_XP.went_pending}
            rows={pendingDeals} setRows={setPendingDeals}
            onStatusChange={(r,s)=>handlePendingStatus(r,s)}
            onRemove={()=>deductPipelineXp('went_pending')}
            statusOpts={[{v:'active',l:'Active'},{v:'closed',l:'Mark Closed'}]}/>

          <PipelineSection title="Closed Deals" icon="🎉" accentColor="#10b981" xpLabel={PIPELINE_XP.closed}
            rows={closedDeals} setRows={setClosedDeals}
            onRemove={()=>deductPipelineXp('closed')}
            showSource={true}/>
        </div>

        <div style={{ height:48 }}/>
        <div style={{ textAlign:'center', fontSize:10, color:'var(--dim)', fontFamily:"'JetBrains Mono',monospace",
          letterSpacing:2, paddingBottom:24 }}>
          REALTYGRIND · {MONTH_YEAR} · CLOSE MORE EVERY DAY
        </div>

      </div>
      )}
    </div>
  )
}

// ─── Root ─────────────────────────────────────────────────────────────────────

function AppInner() {
  const { user, loading } = useAuth()
  const [theme, setTheme] = useState(()=>localStorage.getItem('rg_theme')||'light')

  function toggleTheme() {
    const next = theme==='light' ? 'dark' : 'light'
    setTheme(next)
    localStorage.setItem('rg_theme', next)
    document.documentElement.setAttribute('data-theme', next)
  }

  useEffect(()=>{
    document.documentElement.setAttribute('data-theme', theme)
  },[theme])

  if (loading) return (
    <div data-theme={theme} style={{ display:'flex', alignItems:'center', justifyContent:'center',
      height:'100vh', background:'var(--bg)', gap:12 }}>
      <style>{CSS}</style>
      <div style={{ width:18, height:18, border:'2px solid var(--gold)', borderTopColor:'transparent',
        borderRadius:'50%', animation:'spin 1s linear infinite' }}/>
      <span className="serif" style={{ fontSize:18, color:'var(--text)' }}>RealtyGrind</span>
    </div>
  )

  if (!user) return (
    <div data-theme={theme}>
      <style>{CSS}</style>
      <AuthPage theme={theme} onToggleTheme={toggleTheme}/>
    </div>
  )

  return (
    <div data-theme={theme}>
      <style>{CSS}</style>
      <ThemeCtx.Provider value={{ theme, toggle:toggleTheme }}>
        <Dashboard theme={theme} onToggleTheme={toggleTheme}/>
      </ThemeCtx.Provider>
    </div>
  )
}

export default function App() {
  return <AuthProvider><AppInner/></AuthProvider>
}
