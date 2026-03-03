import { useState, useEffect, useRef, useMemo, useCallback, createContext, useContext, Component, memo } from 'react'
import { AuthProvider, useAuth } from './lib/AuthContext'
import { supabase } from './lib/supabase'
import AuthPage from './pages/AuthPage'
import LandingPage from './pages/LandingPage'
import TeamsPage from './pages/TeamsPage'
import ProfilePage from './pages/ProfilePage'
import DirectoryPage from './pages/DirectoryPage'
import APODPage from './pages/APODPage'
import BillingPage from './pages/BillingPage'
import AIAssistantPage from './pages/AIAssistantPage'
import AIChatWidget from './components/AIChatWidget'
import { CSS, Ring, StatCard, Wordmark, Loader, ThemeToggle, getRank, fmtMoney, resolveCommission, RANKS, CAT, formatPrice, stripPrice, daysOnMarket, LEAD_SOURCES, LEAD_SOURCE_COLORS } from './design'
import { HABITS } from './habits'
import { getPlanBadge } from './lib/plans'

// ─── Safe DB wrapper ────────────────────────────────────────────────────────────
// Wraps any Supabase promise so fire-and-forget calls never silently fail.
// Returns { ok: true } on success, { ok: false, msg: string } on failure.
async function safeDb(promise) {
  try {
    const { error } = await promise
    if (error) { console.error('DB error:', error.message); return { ok: false, msg: error.message } }
    return { ok: true }
  } catch (err) {
    console.error('DB exception:', err)
    return { ok: false, msg: err?.message || 'Network error' }
  }
}

// ─── Error Boundary ─────────────────────────────────────────────────────────────
// Catches any JS error in a child tree so the entire app doesn't white-screen.
// Shows a recovery card with a button to navigate back to the dashboard.

class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }
  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info?.componentStack)
  }
  render() {
    if (this.state.hasError) {
      const reset = () => {
        this.setState({ hasError: false, error: null })
        if (this.props.onReset) this.props.onReset()
      }
      return (
        <div style={{ minHeight:'60vh', display:'flex', alignItems:'center', justifyContent:'center', padding:32 }}>
          <div style={{ textAlign:'center', maxWidth:420 }}>
            <div style={{ fontSize:48, marginBottom:16 }}>⚠️</div>
            <div style={{ fontSize:20, fontWeight:700, color:'var(--text)', marginBottom:8, fontFamily:'Poppins,sans-serif' }}>
              Something went wrong
            </div>
            <div style={{ fontSize:13, color:'var(--muted)', lineHeight:1.7, marginBottom:24, fontFamily:'Poppins,sans-serif' }}>
              This page ran into an unexpected error. Your data is safe — nothing was lost.
            </div>
            <div style={{ display:'flex', gap:10, justifyContent:'center', flexWrap:'wrap' }}>
              <button onClick={reset} style={{
                padding:'10px 24px', borderRadius:8, fontSize:13, fontWeight:700, cursor:'pointer',
                background:'var(--gold)', color:'#fff', border:'none', fontFamily:'Poppins,sans-serif',
              }}>
                Go to Dashboard
              </button>
              <button onClick={() => window.location.reload()} style={{
                padding:'10px 24px', borderRadius:8, fontSize:13, fontWeight:600, cursor:'pointer',
                background:'transparent', color:'var(--muted)', border:'1px solid var(--b3)', fontFamily:'Poppins,sans-serif',
              }}>
                Reload Page
              </button>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// ─── Theme context ─────────────────────────────────────────────────────────────

export const ThemeCtx = createContext({ theme:'light', toggle:()=>{} })
export const useTheme = () => useContext(ThemeCtx)

// ─── Constants ─────────────────────────────────────────────────────────────────

const PIPELINE_XP = { offer_made:75, offer_received:75, went_pending:150, closed:300 }
const DAYS        = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const FULL_DAYS   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
const WEEKS       = 4
// NOTE: MONTH_YEAR is intentionally computed inside the App component (see below)
// so it never goes stale if the user keeps the tab open across a month boundary.
const MONTHS      = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const WEEK_COLORS = ['#0ea5e9','#10b981','#f43f5e','#f59e0b']
const QUOTES      = [
  "The market rewards consistency.", "Every call is a door. Open more.", "Top producers are built one habit at a time.",
  "Your pipeline today is your commission next quarter.", "Make the uncomfortable call. Every time.",
  "Discipline bridges goals and achievement.", "Listings don't find agents. Agents find listings.",
]

const DEFAULT_PREFS = { hidden:[], order:[], edits:{} }

// ── Week-view row helpers (shared across daily cards) ─────────────────────────
const weekRowStyle = (checked, cs) => ({
  display:'flex', alignItems:'center', gap:6, flex:1, textAlign:'left',
  background:checked?cs.light:'transparent', border:`1px solid ${checked?cs.border:'transparent'}`,
  borderRadius:7, padding:'5px 7px', cursor:'pointer', transition:'all .15s',
})
const weekCheckBox = (checked, color) => (
  <div style={{ width:11, height:11, borderRadius:3, flexShrink:0,
    border:`1.5px solid ${checked?color:'var(--b3)'}`,
    background:checked?color:'transparent' }}/>
)
const weekRemoveBtn = (onClick) => (
  <button onClick={onClick} title="Remove from this day" style={{
    background:'none', border:'none', cursor:'pointer', fontSize:14,
    color:'var(--muted)', padding:'2px 5px', lineHeight:1, borderRadius:4, flexShrink:0,
  }}>×</button>
)

function fmtMonth(my) {
  if (!my) return ''
  const [y,m] = my.split('-')
  return `${MONTHS[parseInt(m)-1]} '${y.slice(2)}`
}

function getToday()  { const d=new Date(); return { week:Math.min(Math.floor((d.getDate()-1)/7),3), day:d.getDay() } }

// Returns "YYYY-MM-DD" for a given (week_index, day_index) in the current month
function dateStrForDay(weekIdx, dayIdx) {
  const now=new Date(), year=now.getFullYear(), month=now.getMonth()
  const lastDay=new Date(year,month+1,0).getDate(), start=weekIdx*7+1
  for (let d=start; d<=Math.min(start+6,lastDay); d++) {
    if (new Date(year,month,d).getDay()===dayIdx)
      return `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
  }
  return null
}

// ─── Add Task Modal ───────────────────────────────────────────────────────────

function AddTaskModal({ onSubmit, onClose }) {
  const [label, setLabel] = useState('')
  const [icon,  setIcon]  = useState('✅')
  const [xp,    setXp]    = useState('15')
  const submit = () => { if (label.trim()) onSubmit(label.trim(), icon.trim()||'✅', Number(xp)||15) }
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.55)', zIndex:1000,
      display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="card" style={{ padding:24, width:'100%', maxWidth:400 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:18 }}>
          <span style={{ fontSize:20 }}>📋</span>
          <div className="serif" style={{ fontSize:18, color:'var(--text)' }}>Add Task for Today</div>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'64px 1fr', gap:10, marginBottom:12 }}>
          <div>
            <div className="label" style={{ marginBottom:5 }}>Icon</div>
            <input className="field-input" value={icon} maxLength={2}
              onChange={e => setIcon(e.target.value)} placeholder="✅"
              style={{ textAlign:'center', fontSize:20, padding:'8px 0' }}/>
          </div>
          <div>
            <div className="label" style={{ marginBottom:5 }}>Task Label</div>
            <input className="field-input" value={label} autoFocus
              onChange={e => setLabel(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submit()}
              placeholder="e.g. Morning call review"/>
          </div>
        </div>
        <div style={{ marginBottom:22 }}>
          <div className="label" style={{ marginBottom:5 }}>XP Reward</div>
          <input className="field-input" value={xp} type="number" min="0" max="500"
            onChange={e => setXp(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()}
            placeholder="15"
            style={{ color:'var(--gold2)', fontFamily:"'JetBrains Mono',monospace", width:100 }}/>
        </div>
        <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
          <button className="btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn-gold" onClick={submit} disabled={!label.trim()} style={{ minWidth:120 }}>
            + Add Task
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Offer Modal ──────────────────────────────────────────────────────────────

function OfferModal({ repName, onSubmit, onClose }) {
  const [addr,  setAddr]  = useState('')
  const [price, setPrice] = useState('')
  const [comm,  setComm]  = useState('')
  const submit = () => { if (addr.trim()) onSubmit(addr.trim(), price.trim(), comm.trim()) }
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.55)', zIndex:1000,
      display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="card" style={{ padding:28, width:'100%', maxWidth:440 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:6 }}>
          <span style={{ fontSize:20 }}>📤</span>
          <div className="serif" style={{ fontSize:20, color:'var(--text)' }}>Log Offer Made</div>
        </div>
        {repName && (
          <div style={{ fontSize:12, color:'var(--muted)', marginBottom:18, padding:'8px 12px', borderRadius:8,
            background:'var(--bg2)', border:'1px solid var(--b1)' }}>
            🤝 Buyer: <strong>{repName}</strong>
          </div>
        )}
        <div className="label" style={{ marginBottom:5 }}>Property Address</div>
        <input className="field-input" value={addr} onChange={e => setAddr(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit()} autoFocus
          placeholder="123 Main St, City, OR 97401" style={{ marginBottom:12 }}/>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:22 }}>
          <div>
            <div className="label" style={{ marginBottom:5 }}>Offer Price</div>
            <input className="field-input" value={price} onChange={e => setPrice(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submit()}
              placeholder="$450,000"
              style={{ color:'var(--gold2)', fontFamily:"'JetBrains Mono',monospace" }}/>
          </div>
          <div>
            <div className="label" style={{ marginBottom:5 }}>Commission Est.</div>
            <input className="field-input" value={comm} onChange={e => setComm(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submit()}
              placeholder="$13,500"
              style={{ color:'var(--green)', fontFamily:"'JetBrains Mono',monospace" }}/>
          </div>
        </div>
        <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
          <button className="btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn-gold" onClick={submit} disabled={!addr.trim()} style={{ minWidth:130 }}>
            + Add to Offers Made
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Print Daily Modal ────────────────────────────────────────────────────────

function PrintDailyModal({ habits, counters, today, todayDate, effectiveToday, customTasks, customDone, offersMade, offersReceived, pendingDeals, closedDeals, buyerReps, onClose, target }) {
  // target = { wi, di, dateStr } for a specific day, or null for today
  const wi        = target ? target.wi      : today.week
  const di        = target ? target.di      : today.day
  const printDate = target ? target.dateStr : todayDate
  const dateStr   = target
    ? new Date(target.dateStr+'T12:00:00').toLocaleDateString('en-US',{ weekday:'long', month:'long', day:'numeric', year:'numeric' })
    : new Date().toLocaleDateString('en-US',{ weekday:'long', month:'long', day:'numeric', year:'numeric' })
  const prospectCount  = counters[`prospecting-${wi}-${di}`]  || 0
  const apptCount      = counters[`appointments-${wi}-${di}`] || 0
  const braSignedCount = buyerReps.filter(r => r.status === 'closed').length
  const tracker = [
    { label:'Prospecting Calls',            val: prospectCount },
    { label:'Appointments Booked',          val: apptCount },
    { label:'Buyer Rep Agreements Signed',  val: braSignedCount },
    { label:'Offers Made',                  val: offersMade.length },
    { label:'Offers Received',              val: offersReceived.length },
    { label:'Offers Pending',               val: pendingDeals.length },
    { label:'Closed Deals',                 val: closedDeals.length },
  ]
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.6)', zIndex:1100,
      overflowY:'auto', padding:'30px 20px' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ maxWidth:780, margin:'0 auto' }}>
        {/* Controls — hidden on print */}
        <div className="print-modal-header">
          <div style={{ color:'#fff', fontSize:15, fontWeight:600 }}>🖨️ Print Preview</div>
          <div style={{ display:'flex', gap:8 }}>
            <button className="btn-gold" style={{ fontSize:13 }} onClick={() => window.print()}>Print</button>
            <button className="btn-outline" style={{ fontSize:13, color:'#fff', borderColor:'rgba(255,255,255,.3)' }} onClick={onClose}>✕ Close</button>
          </div>
        </div>
        {/* Printable sheet */}
        <div className="print-sheet">
          {/* Sheet header */}
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start',
            borderBottom:'3px solid #111', paddingBottom:10, marginBottom:16 }}>
            <div>
              <div style={{ fontSize:22, fontWeight:700, letterSpacing:'.02em' }}>REALTYGRIND</div>
              <div style={{ fontSize:11, color:'#555', letterSpacing:'.08em', textTransform:'uppercase' }}>Daily Agent Planner</div>
            </div>
            <div style={{ textAlign:'right' }}>
              <div style={{ fontSize:11, color:'#888', textTransform:'uppercase', letterSpacing:'.05em' }}>Date</div>
              <div style={{ fontSize:14, fontWeight:600 }}>{dateStr}</div>
            </div>
          </div>
          {/* 2-col grid */}
          <div className="print-sheet-grid">
            {/* Left: Habits Checklist */}
            <div>
              <div className="print-section-title">Daily Habits Checklist</div>
              {(effectiveToday||[]).filter(h => h.isBuiltIn).map(h => {
                const done = habits[h.id]?.[wi]?.[di]
                const cnt  = h.counter ? (counters[`${h.id}-${wi}-${di}`] || 0) : 0
                return (
                  <div key={h.id} className="print-habit-row">
                    <span className={`print-checkbox${done ? ' checked' : ''}`}/>
                    <span style={{ fontSize:13 }}>{h.icon}</span>
                    <span style={{ flex:1, textDecoration:done?'line-through':'none', color:done?'#888':'#111' }}>
                      {h.label}{cnt > 0 ? ` (×${cnt})` : ''}
                    </span>
                  </div>
                )
              })}
              {(()=>{
                // Custom defaults (from Settings) + today-specific tasks added on the day
                const customDefaults  = (effectiveToday||[]).filter(h => !h.isBuiltIn)
                const todaySpecific   = (customTasks||[]).filter(t => !t.isDefault && t.specificDate === printDate)
                const ct = [...customDefaults, ...todaySpecific]
                if (!ct.length) return null
                return (
                  <>
                    <div style={{ borderTop:'1px solid #ccc', margin:'8px 0 6px', paddingTop:6,
                      fontSize:9, fontWeight:700, textTransform:'uppercase', letterSpacing:'.08em', color:'#666' }}>
                      Custom Tasks
                    </div>
                    {ct.map(t => {
                      const done = !!(customDone||{})[`${t.id}-${wi}-${di}`]
                      return (
                        <div key={t.id} className="print-habit-row">
                          <span className={`print-checkbox${done ? ' checked' : ''}`}/>
                          <span style={{ fontSize:13 }}>{t.icon}</span>
                          <span style={{ flex:1, textDecoration:done?'line-through':'none', color:done?'#888':'#111' }}>
                            {t.label}
                          </span>
                        </div>
                      )
                    })}
                  </>
                )
              })()}
            </div>
            {/* Right: Activity Tracker */}
            <div>
              <div className="print-section-title">Activity Tracker</div>
              {tracker.map(row => (
                <div key={row.label} className="print-tracker-row">
                  <span>{row.label}</span>
                  <span className="print-tracker-val">{row.val > 0 ? row.val : '—'}</span>
                </div>
              ))}
            </div>
          </div>
          {/* Notes */}
          <div style={{ marginTop:22 }}>
            <div className="print-section-title">Notes</div>
            {[...Array(7)].map((_,i) => <div key={i} className="print-ruled"/>)}
          </div>
          {/* To-Dos for Tomorrow */}
          <div style={{ marginTop:20 }}>
            <div className="print-section-title">To-Dos for Tomorrow</div>
            {[...Array(5)].map((_,i) => (
              <div key={i} className="print-todo-row">
                <span className="print-checkbox"/>
                <div className="print-todo-line"/>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── shared helper: previous week range ───────────────────────────────────────
// Always "7 days ago → yesterday" relative to today, so running it on the 25th
// shows Feb 18 – Feb 24 regardless of what day of the week it falls on.
function usePrevWeekRange() {
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1)
  const weekAgo   = new Date(); weekAgo.setDate(weekAgo.getDate() - 7)
  const fmtD = d => d.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })
  return `${fmtD(weekAgo)} – ${fmtD(yesterday)}`
}

// ─── shared print-sheet header ─────────────────────────────────────────────────
function PrintSheetHeader({ subtitle, weekRange }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start',
      borderBottom:'3px solid #111', paddingBottom:10, marginBottom:18 }}>
      <div>
        <div style={{ fontSize:22, fontWeight:900, letterSpacing:'.04em', color:'#000',
          fontFamily:"'Georgia','Times New Roman',serif", textTransform:'uppercase' }}>
          RealtyGrind
        </div>
        <div style={{ fontSize:10, color:'#333', letterSpacing:'.12em', textTransform:'uppercase',
          fontWeight:700, marginTop:2 }}>
          {subtitle}
        </div>
      </div>
      <div style={{ textAlign:'right' }}>
        <div style={{ fontSize:10, color:'#666', textTransform:'uppercase', letterSpacing:'.06em' }}>Period</div>
        <div style={{ fontSize:13, fontWeight:700, color:'#000' }}>{weekRange}</div>
      </div>
    </div>
  )
}

// ─── shared mini-table ─────────────────────────────────────────────────────────
function PrintTable({ cols, rows }) {
  if (!rows.length) return (
    <div style={{ fontSize:12, color:'#888', marginBottom:16, fontStyle:'italic' }}>None on record.</div>
  )
  return (
    <table style={{ width:'100%', borderCollapse:'collapse', marginBottom:20, fontSize:12 }}>
      <thead>
        <tr style={{ borderBottom:'2px solid #111' }}>
          {cols.map(c => (
            <th key={c.key} style={{ textAlign:'left', padding:'4px 8px', fontWeight:700,
              width: c.width||undefined }}>{c.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} style={{ borderBottom:'1px solid #e5e5e5', background:i%2===0?'#fff':'#f9f9f9' }}>
            {cols.map(c => (
              <td key={c.key} style={{ padding:'5px 8px', fontFamily: c.mono?'monospace':undefined }}>
                {r[c.key] || '—'}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ─── Listings Weekly Update Modal ─────────────────────────────────────────────

function ListingsWeeklyModal({ listings, offersReceived, pendingDeals, closedDeals, onClose }) {
  const [step,         setStep]         = useState(1)
  const [listingNotes, setListingNotes] = useState({})   // { [id]: string }
  const [generalNotes, setGeneralNotes] = useState('')
  const weekRange = usePrevWeekRange()

  const setNote = (id, val) => setListingNotes(prev => ({ ...prev, [id]: val }))

  /* ── Step 1: per-listing notes ── */
  if (step === 1) {
    return (
      <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.72)', zIndex:1100,
        display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
        onClick={e => e.target === e.currentTarget && onClose()}>
        <div style={{ background:'var(--surface)', border:'1px solid var(--b3)', borderRadius:16,
          padding:28, maxWidth:560, width:'100%', maxHeight:'90vh', display:'flex', flexDirection:'column',
          boxShadow:'0 24px 80px rgba(0,0,0,.35)' }}>

          {/* Header */}
          <div style={{ marginBottom:20 }}>
            <div style={{ fontSize:19, fontWeight:800, color:'var(--text)', letterSpacing:'.01em' }}>
              🏡 Listings Weekly Update
            </div>
            <div style={{ fontSize:12, color:'var(--dim)', marginTop:3, fontWeight:500 }}>
              Week of {weekRange}
            </div>
          </div>

          {/* Per-listing note fields */}
          <div style={{ overflowY:'auto', flex:1, display:'flex', flexDirection:'column', gap:14, marginBottom:16 }}>
            {listings.length === 0 ? (
              <div style={{ fontSize:13, color:'var(--dim)', padding:'12px 0', fontStyle:'italic' }}>
                No listings on record — add listings first.
              </div>
            ) : (
              listings.map(l => (
                <div key={l.id}>
                  <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:5 }}>
                    <span style={{ fontSize:10, padding:'2px 7px', borderRadius:4, fontWeight:700,
                      fontFamily:"'JetBrains Mono',monospace", letterSpacing:'.04em',
                      background: l.status==='closed' ? 'rgba(34,197,94,.13)' :
                                  l.status==='pending' ? 'rgba(251,191,36,.13)' : 'rgba(139,92,246,.13)',
                      color:      l.status==='closed' ? '#16a34a' :
                                  l.status==='pending' ? '#b45309' : 'var(--purple)',
                      border:     `1px solid ${l.status==='closed' ? 'rgba(34,197,94,.3)' :
                                               l.status==='pending' ? 'rgba(251,191,36,.3)' : 'rgba(139,92,246,.3)'}`,
                    }}>
                      {l.status==='closed' ? 'CLOSED' : l.status==='pending' ? 'PENDING' : 'ACTIVE'}
                    </span>
                    <span style={{ fontSize:13, fontWeight:700, color:'var(--text)' }}>
                      {l.address || 'Untitled Listing'}
                    </span>
                    {l.price && (
                      <span style={{ fontSize:11, color:'var(--gold2)', fontFamily:"'JetBrains Mono',monospace", fontWeight:600 }}>
                        {formatPrice(l.price)||l.price}
                      </span>
                    )}
                  </div>
                  <textarea
                    value={listingNotes[l.id] || ''}
                    onChange={e => setNote(l.id, e.target.value)}
                    placeholder="Notes — showings, offers, feedback, price changes, client updates…"
                    style={{ width:'100%', minHeight:66, background:'var(--bg2)', border:'1px solid var(--b2)',
                      borderRadius:7, color:'var(--text)', fontSize:12, padding:'8px 10px',
                      resize:'vertical', boxSizing:'border-box', fontFamily:'inherit', lineHeight:1.5 }}
                  />
                </div>
              ))
            )}

            {/* General notes */}
            <div>
              <div style={{ fontSize:12, fontWeight:700, color:'var(--text)', marginBottom:5 }}>
                General Weekly Notes
              </div>
              <textarea
                value={generalNotes}
                onChange={e => setGeneralNotes(e.target.value)}
                placeholder="Overall market notes, highlights, goals for next week…"
                style={{ width:'100%', minHeight:72, background:'var(--bg2)', border:'1px solid var(--b2)',
                  borderRadius:7, color:'var(--text)', fontSize:12, padding:'8px 10px',
                  resize:'vertical', boxSizing:'border-box', fontFamily:'inherit', lineHeight:1.5 }}
              />
            </div>
          </div>

          <div style={{ display:'flex', gap:10, justifyContent:'flex-end', paddingTop:4, borderTop:'1px solid var(--b1)' }}>
            <button className="btn-outline" style={{ fontSize:13 }} onClick={onClose}>Cancel</button>
            <button className="btn-gold" style={{ fontSize:13 }} onClick={() => setStep(2)}>
              Generate Preview →
            </button>
          </div>
        </div>
      </div>
    )
  }

  /* ── Step 2: print preview ── */
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.6)', zIndex:1100,
      overflowY:'auto', padding:'30px 20px' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ maxWidth:780, margin:'0 auto' }}>
        <div className="print-modal-header">
          <div style={{ color:'#fff', fontSize:15, fontWeight:600 }}>🏡 Listings Weekly Update — Preview</div>
          <div style={{ display:'flex', gap:8 }}>
            <button className="btn-outline" style={{ fontSize:13, color:'#fff', borderColor:'rgba(255,255,255,.3)' }}
              onClick={() => setStep(1)}>← Edit</button>
            <button className="btn-gold" style={{ fontSize:13 }} onClick={() => window.print()}>Print / PDF</button>
            <button className="btn-outline" style={{ fontSize:13, color:'#fff', borderColor:'rgba(255,255,255,.3)' }}
              onClick={onClose}>✕ Close</button>
          </div>
        </div>

        <div className="print-sheet">
          <PrintSheetHeader subtitle="Weekly Listings Update" weekRange={weekRange} />

          {/* Listings with per-listing notes */}
          <div className="print-section-title">Listings ({listings.length})</div>
          {listings.length === 0 ? (
            <div style={{ fontSize:12, color:'#888', marginBottom:16, fontStyle:'italic' }}>No listings on record.</div>
          ) : (
            <div style={{ marginBottom:20 }}>
              {listings.map((l, i) => (
                <div key={l.id} style={{ marginBottom:10, paddingBottom:10,
                  borderBottom: i < listings.length-1 ? '1px solid #e5e5e5' : 'none' }}>
                  {/* Listing header row */}
                  <div style={{ display:'flex', alignItems:'baseline', gap:10, marginBottom: listingNotes[l.id] ? 5 : 0 }}>
                    <span style={{ fontSize:11, fontWeight:700, padding:'1px 6px', borderRadius:3,
                      background: l.status==='closed'?'#dcfce7': l.status==='pending'?'#fef9c3':'#ede9fe',
                      color:      l.status==='closed'?'#15803d': l.status==='pending'?'#92400e':'#6d28d9',
                      letterSpacing:'.05em', textTransform:'uppercase' }}>
                      {l.status==='closed'?'Closed': l.status==='pending'?'Pending':'Active'}
                    </span>
                    <span style={{ fontSize:13, fontWeight:700, color:'#111' }}>{l.address || '—'}</span>
                    {l.price && <span style={{ fontSize:11, fontFamily:'monospace', color:'#555' }}>{formatPrice(l.price)||l.price}</span>}
                    {l.commission && <span style={{ fontSize:11, fontFamily:'monospace', color:'#555' }}>· {l.commission}</span>}
                  </div>
                  {/* Per-listing notes */}
                  {listingNotes[l.id] && (
                    <div style={{ fontSize:12, color:'#333', lineHeight:1.7, whiteSpace:'pre-wrap',
                      borderLeft:'3px solid #aaa', paddingLeft:10, marginTop:4 }}>
                      {listingNotes[l.id]}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Offers Received */}
          <div className="print-section-title">Offers Received ({offersReceived.length})</div>
          <PrintTable
            cols={[
              { key:'address', label:'Property / Address' },
              { key:'price',   label:'Amount', mono:true, width:120 },
              { key:'status',  label:'Status', width:100 },
            ]}
            rows={offersReceived.map(o => ({
              address: o.address || o.clientName || '—',
              price:   o.price || '—',
              status:  o.status==='pending'?'⏳ Pending': o.status==='closed'?'✓ Closed':'● Active',
            }))}
          />

          {/* Went Pending */}
          <div className="print-section-title">Went Pending ({pendingDeals.length})</div>
          <PrintTable
            cols={[
              { key:'address',    label:'Address' },
              { key:'price',      label:'Price', mono:true, width:120 },
              { key:'commission', label:'Commission', mono:true, width:130 },
            ]}
            rows={pendingDeals.map(p => ({
              address:    p.address || '—',
              price:      p.price || '—',
              commission: p.commission || '—',
            }))}
          />

          {/* Closed Deals */}
          <div className="print-section-title">Closed Deals ({closedDeals.length})</div>
          <PrintTable
            cols={[
              { key:'address',    label:'Address' },
              { key:'price',      label:'Price', mono:true, width:120 },
              { key:'commission', label:'Commission', mono:true, width:130 },
            ]}
            rows={closedDeals.map(c => ({
              address:    c.address || '—',
              price:      c.price || '—',
              commission: c.commission || '—',
            }))}
          />

          {/* General notes */}
          {generalNotes.trim() && (
            <div style={{ marginBottom:20 }}>
              <div className="print-section-title">General Notes</div>
              <div style={{ fontSize:12, color:'#222', lineHeight:1.75, whiteSpace:'pre-wrap',
                borderLeft:'3px solid #111', paddingLeft:12 }}>
                {generalNotes}
              </div>
            </div>
          )}

          {/* Action items */}
          <div style={{ marginTop:14 }}>
            <div className="print-section-title">Action Items for Next Week</div>
            {[...Array(5)].map((_,i) => (
              <div key={i} className="print-todo-row">
                <span className="print-checkbox"/>
                <div className="print-todo-line"/>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Buyers Weekly Update Modal ────────────────────────────────────────────────

function BuyersWeeklyModal({ buyerReps, offersMade, onClose }) {
  const [step,     setStep]     = useState(1)
  const [repNotes, setRepNotes] = useState({})   // { [id]: string }
  const [generalNotes, setGeneralNotes] = useState('')
  const weekRange = usePrevWeekRange()

  const setNote = (id, val) => setRepNotes(prev => ({ ...prev, [id]: val }))

  /* ── Step 1: per-rep notes ── */
  if (step === 1) {
    return (
      <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.72)', zIndex:1100,
        display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
        onClick={e => e.target === e.currentTarget && onClose()}>
        <div style={{ background:'var(--surface)', border:'1px solid var(--b3)', borderRadius:16,
          padding:28, maxWidth:560, width:'100%', maxHeight:'90vh', display:'flex', flexDirection:'column',
          boxShadow:'0 24px 80px rgba(0,0,0,.35)' }}>

          <div style={{ marginBottom:20 }}>
            <div style={{ fontSize:19, fontWeight:800, color:'var(--text)', letterSpacing:'.01em' }}>
              🤝 Buyers Weekly Update
            </div>
            <div style={{ fontSize:12, color:'var(--dim)', marginTop:3, fontWeight:500 }}>
              Week of {weekRange}
            </div>
          </div>

          <div style={{ overflowY:'auto', flex:1, display:'flex', flexDirection:'column', gap:14, marginBottom:16 }}>
            {buyerReps.length === 0 ? (
              <div style={{ fontSize:13, color:'var(--dim)', padding:'12px 0', fontStyle:'italic' }}>
                No buyer rep agreements on record.
              </div>
            ) : (
              buyerReps.map(rep => {
                const bd = rep.buyerDetails || {}
                const hasDetails = bd.preApproval || bd.timeline || bd.lastCallDate || bd.locationPrefs
                return (
                <div key={rep.id}>
                  <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:5 }}>
                    <span style={{ fontSize:10, padding:'2px 7px', borderRadius:4, fontWeight:700,
                      fontFamily:"'JetBrains Mono',monospace", letterSpacing:'.04em',
                      background: rep.status==='closed' ? 'rgba(34,197,94,.13)' : 'rgba(14,165,233,.12)',
                      color:      rep.status==='closed' ? '#16a34a' : '#0284c7',
                      border:     `1px solid ${rep.status==='closed' ? 'rgba(34,197,94,.3)' : 'rgba(14,165,233,.3)'}`,
                    }}>
                      {rep.status==='closed' ? 'CLOSED' : 'ACTIVE'}
                    </span>
                    <span style={{ fontSize:13, fontWeight:700, color:'var(--text)' }}>
                      {rep.clientName || 'Unnamed Buyer'}
                    </span>
                  </div>
                  {hasDetails && (
                    <div style={{ display:'flex', flexWrap:'wrap', gap:'4px 12px', marginBottom:6, fontSize:11, color:'var(--dim)' }}>
                      {bd.preApproval && <span>Pre-approval: <strong style={{ color:'var(--text)' }}>{bd.preApproval}</strong></span>}
                      {bd.timeline && <span>Timeline: <strong style={{ color:'var(--text)' }}>{bd.timeline}</strong></span>}
                      {bd.lastCallDate && <span>Last call: <strong style={{ color:'var(--text)' }}>{bd.lastCallDate}</strong></span>}
                      {bd.locationPrefs && <span>Area: <strong style={{ color:'var(--text)' }}>{bd.locationPrefs}</strong></span>}
                    </div>
                  )}
                  <textarea
                    value={repNotes[rep.id] || ''}
                    onChange={e => setNote(rep.id, e.target.value)}
                    placeholder="Notes — showings attended, offers discussed, financing updates, timeline…"
                    style={{ width:'100%', minHeight:66, background:'var(--bg2)', border:'1px solid var(--b2)',
                      borderRadius:7, color:'var(--text)', fontSize:12, padding:'8px 10px',
                      resize:'vertical', boxSizing:'border-box', fontFamily:'inherit', lineHeight:1.5 }}
                  />
                </div>
                )
              })
            )}

            <div>
              <div style={{ fontSize:12, fontWeight:700, color:'var(--text)', marginBottom:5 }}>
                General Weekly Notes
              </div>
              <textarea
                value={generalNotes}
                onChange={e => setGeneralNotes(e.target.value)}
                placeholder="Market conditions, buyer sentiment, goals for next week…"
                style={{ width:'100%', minHeight:72, background:'var(--bg2)', border:'1px solid var(--b2)',
                  borderRadius:7, color:'var(--text)', fontSize:12, padding:'8px 10px',
                  resize:'vertical', boxSizing:'border-box', fontFamily:'inherit', lineHeight:1.5 }}
              />
            </div>
          </div>

          <div style={{ display:'flex', gap:10, justifyContent:'flex-end', paddingTop:4, borderTop:'1px solid var(--b1)' }}>
            <button className="btn-outline" style={{ fontSize:13 }} onClick={onClose}>Cancel</button>
            <button className="btn-gold" style={{ fontSize:13 }} onClick={() => setStep(2)}>
              Generate Preview →
            </button>
          </div>
        </div>
      </div>
    )
  }

  /* ── Step 2: print preview ── */
  const activeBRAs = buyerReps.filter(r => r.status !== 'closed')
  const closedBRAs = buyerReps.filter(r => r.status === 'closed')

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.6)', zIndex:1100,
      overflowY:'auto', padding:'30px 20px' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ maxWidth:780, margin:'0 auto' }}>
        <div className="print-modal-header">
          <div style={{ color:'#fff', fontSize:15, fontWeight:600 }}>🤝 Buyers Weekly Update — Preview</div>
          <div style={{ display:'flex', gap:8 }}>
            <button className="btn-outline" style={{ fontSize:13, color:'#fff', borderColor:'rgba(255,255,255,.3)' }}
              onClick={() => setStep(1)}>← Edit</button>
            <button className="btn-gold" style={{ fontSize:13 }} onClick={() => window.print()}>Print / PDF</button>
            <button className="btn-outline" style={{ fontSize:13, color:'#fff', borderColor:'rgba(255,255,255,.3)' }}
              onClick={onClose}>✕ Close</button>
          </div>
        </div>

        <div className="print-sheet">
          <PrintSheetHeader subtitle="Weekly Buyers Update" weekRange={weekRange} />

          {/* Buyer Reps with per-rep notes */}
          <div className="print-section-title">
            Buyer Rep Agreements ({activeBRAs.length} active · {closedBRAs.length} closed)
          </div>
          {buyerReps.length === 0 ? (
            <div style={{ fontSize:12, color:'#888', marginBottom:16, fontStyle:'italic' }}>No buyer rep agreements on record.</div>
          ) : (
            <div style={{ marginBottom:20 }}>
              {buyerReps.map((rep, i) => {
                const bd = rep.buyerDetails || {}
                const hasFinancial = bd.preApproval || bd.paymentRange || bd.downPayment
                const hasCriteria = bd.locationPrefs || bd.mustHaves || bd.niceToHaves || bd.timeline
                return (
                <div key={rep.id} style={{ marginBottom:10, paddingBottom:10,
                  borderBottom: i < buyerReps.length-1 ? '1px solid #e5e5e5' : 'none' }}>
                  <div style={{ display:'flex', alignItems:'baseline', gap:10, marginBottom:4 }}>
                    <span style={{ fontSize:11, fontWeight:700, padding:'1px 6px', borderRadius:3,
                      background: rep.status==='closed'?'#dcfce7':'#e0f2fe',
                      color:      rep.status==='closed'?'#15803d':'#0369a1',
                      letterSpacing:'.05em', textTransform:'uppercase' }}>
                      {rep.status==='closed'?'Closed':'Active'}
                    </span>
                    <span style={{ fontSize:13, fontWeight:700, color:'#111' }}>
                      {rep.clientName || '—'}
                    </span>
                    {bd.timeline && (
                      <span style={{ fontSize:10, color:'#666', fontWeight:600 }}>({bd.timeline})</span>
                    )}
                  </div>
                  {(hasFinancial || hasCriteria || bd.dateSigned || bd.lastCallDate) && (
                    <div style={{ fontSize:11, color:'#555', lineHeight:1.8, marginBottom:repNotes[rep.id]?4:0, display:'flex', flexWrap:'wrap', gap:'0 16px' }}>
                      {bd.preApproval && <span>Pre-approval: <strong>{bd.preApproval}</strong></span>}
                      {bd.paymentRange && <span>Payment: <strong>{bd.paymentRange}</strong></span>}
                      {bd.downPayment && <span>Down: <strong>{bd.downPayment}</strong></span>}
                      {bd.dateSigned && <span>Signed: <strong>{bd.dateSigned}</strong></span>}
                      {bd.dateExpires && <span>Expires: <strong>{bd.dateExpires}</strong></span>}
                      {bd.lastCallDate && <span>Last call: <strong>{bd.lastCallDate}</strong></span>}
                      {bd.locationPrefs && <span>Area: <strong>{bd.locationPrefs}</strong></span>}
                      {bd.mustHaves && <span>Must-haves: <strong>{bd.mustHaves}</strong></span>}
                      {bd.niceToHaves && <span>Nice-to-haves: <strong>{bd.niceToHaves}</strong></span>}
                    </div>
                  )}
                  {repNotes[rep.id] && (
                    <div style={{ fontSize:12, color:'#333', lineHeight:1.7, whiteSpace:'pre-wrap',
                      borderLeft:'3px solid #aaa', paddingLeft:10, marginTop:4 }}>
                      {repNotes[rep.id]}
                    </div>
                  )}
                </div>
                )
              })}
            </div>
          )}

          {/* Offers Made */}
          <div className="print-section-title">Offers Made ({offersMade.length})</div>
          <PrintTable
            cols={[
              { key:'address', label:'Property / Address' },
              { key:'price',   label:'Amount', mono:true, width:120 },
              { key:'status',  label:'Status', width:100 },
            ]}
            rows={offersMade.map(o => ({
              address: o.address || o.clientName || '—',
              price:   o.price || '—',
              status:  o.status==='pending'?'⏳ Pending': o.status==='closed'?'✓ Closed':'● Active',
            }))}
          />

          {/* General notes */}
          {generalNotes.trim() && (
            <div style={{ marginBottom:20 }}>
              <div className="print-section-title">General Notes</div>
              <div style={{ fontSize:12, color:'#222', lineHeight:1.75, whiteSpace:'pre-wrap',
                borderLeft:'3px solid #111', paddingLeft:12 }}>
                {generalNotes}
              </div>
            </div>
          )}

          {/* Action items */}
          <div style={{ marginTop:14 }}>
            <div className="print-section-title">Action Items for Next Week</div>
            {[...Array(5)].map((_,i) => (
              <div key={i} className="print-todo-row">
                <span className="print-checkbox"/>
                <div className="print-todo-line"/>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Pipeline section ─────────────────────────────────────────────────────────

function PipelineSection({ title, icon, accentColor, xpLabel, rows, setRows, onStatusChange, showSource, statusOpts, onAdd, onRemove, userId }) {
  const [addr,  setAddr]  = useState('')
  const [price, setPrice] = useState('')
  const [comm,  setComm]  = useState('')

  async function add() {
    if (!addr.trim()) return
    const rawC = comm.trim()
    const commVal = rawC && !rawC.endsWith('%') ? rawC + '%' : rawC
    const tmp = { id:`tmp-${Date.now()}`, address:addr.trim(), price:price.trim(), commission:commVal, status:'active' }
    setRows(prev => [...prev, tmp])
    setAddr(''); setPrice(''); setComm('')
    if (onAdd) {
      const saved = await onAdd(tmp)
      if (saved?.id) setRows(prev => prev.map(r => r.id === tmp.id ? saved : r))
    }
  }

  async function remove(row) {
    if (!window.confirm(`Remove "${row.address || 'this entry'}"?`)) return
    const snapshot = rows
    setRows(prev => prev.filter(r => r.id !== row.id))
    if (row.id && !String(row.id).startsWith('tmp-')) {
      const r = await safeDb(supabase.from('transactions').delete().eq('id', row.id).eq('user_id', userId))
      if (!r.ok) { setRows(snapshot); return }
    }
    if (onRemove) onRemove(row)
  }

  function update(id, f, v) { setRows(prev => prev.map(r => r.id===id ? {...r,[f]:v} : r)) }

  async function persist(id, field, value) {
    if (!id || String(id).startsWith('tmp-')) return
    const r = await safeDb(supabase.from('transactions').update({ [field]: value }).eq('id', id).eq('user_id', userId))
    if (!r.ok) console.warn('Pipeline persist failed:', r.msg)
  }

  async function toggleCommType(id) {
    let newComm = ''
    setRows(prev => prev.map(r => {
      if (r.id !== id) return r
      const raw = String(r.commission || '').trim()
      const isPercent = raw.endsWith('%')
      newComm = isPercent ? raw.replace(/%$/, '') : (raw ? raw + '%' : '%')
      return { ...r, commission: newComm }
    }))
    if (!String(id).startsWith('tmp-')) {
      const r = await safeDb(supabase.from('transactions').update({ commission: newComm }).eq('id', id).eq('user_id', userId))
      if (!r.ok) console.warn('Pipeline toggleCommType failed:', r.msg)
    }
  }

  const totalVol  = useMemo(() => rows.reduce((a,r)=>{ const n=parseFloat(String(r.price||'').replace(/[^0-9.]/g,'')); return a+(isNaN(n)?0:n) },0), [rows])
  const totalComm = useMemo(() => rows.reduce((a,r) => a + resolveCommission(r.commission, r.price), 0), [rows])

  const actionOpts = (statusOpts||[]).filter(o => o.v !== 'active')

  const [editingPipe, setEditingPipe] = useState(null)
  const [addExpanded, setAddExpanded] = useState(false)

  return (
    <div className="card" style={{ padding:22, marginBottom:12, borderLeft:`3px solid ${accentColor}55`,
      background:`linear-gradient(135deg, ${accentColor}05 0%, var(--surface) 40%)` }}>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14, flexWrap:'wrap', gap:10 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:38, height:38, borderRadius:10, background:`${accentColor}16`, border:`1px solid ${accentColor}30`,
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

      {/* Deal cards */}
      <div className="deal-card-grid">
      {rows.length === 0 && (
        <div className="deal-card" style={{ textAlign:'center', padding:'20px', color:'var(--dim)', fontSize:12 }}>
          No entries yet{!showSource && ' — add one below'}
        </div>
      )}

      {rows.map(r => {
        const isP = String(r.commission||'').trim().endsWith('%')
        const commAmt = resolveCommission(r.commission, r.price)
        const priceNum = parseFloat(String(r.price||'').replace(/[^0-9.]/g,''))
        const dom = daysOnMarket(r.createdAt)
        const isEditingRow = editingPipe === r.id
        return (
          <div key={r.id} className="deal-card" style={{ padding:'14px 18px' }}>
            {/* Address — display or edit */}
            {isEditingRow ? (
              <input className="deal-title" value={r.address||''}
                autoFocus
                onChange={e=>update(r.id,'address',e.target.value)}
                onBlur={e=>{ persist(r.id,'address',e.target.value); setEditingPipe(null) }}
                onKeyDown={e => e.key === 'Enter' && e.target.blur()}
                placeholder="Property address…"
                style={{ background:'none', border:'none', outline:'none', width:'100%', minWidth:0, padding:0,
                  fontFamily:"'Fraunces',serif", borderBottom:'1.5px solid ' + accentColor }}/>
            ) : (
              <span className="deal-title">{r.address || 'No address'}</span>
            )}

            {/* Price line */}
            {priceNum > 0 && (
              <div className="deal-price" style={{ color:accentColor, fontSize:17, marginTop:4 }}>
                {formatPrice(r.price)}
              </div>
            )}

            {/* Meta line: commission · DOM · source */}
            <div className="deal-meta-line">
              {r.commission && (
                <span>
                  {isP ? r.commission : formatPrice(r.commission)}
                  {isP && commAmt > 0 && <span style={{ color:'var(--green)', fontWeight:600 }}> = {fmtMoney(commAmt)}</span>}
                </span>
              )}
              {r.commission && dom !== null && <span className="sep"/>}
              {dom !== null && (
                <span style={{
                  color: dom > 90 ? '#ef4444' : dom > 30 ? '#d97706' : '#059669',
                  fontWeight:600,
                }}>{dom}d</span>
              )}
              {showSource && r.closedFrom && (
                <>
                  <span className="sep"/>
                  <span>via {r.closedFrom}</span>
                </>
              )}
            </div>

            {/* Actions */}
            <div className="deal-actions">
              {showSource ? (
                <span style={{ fontSize:11, color:'var(--dim)', fontStyle:'italic' }}>Closed</span>
              ) : (
                <>
                  {actionOpts.map(o => (
                    <button key={o.v}
                      className={`act-btn ${o.v==='pending' ? 'act-btn-amber' : 'act-btn-green'}`}
                      onClick={()=>onStatusChange(r, o.v)}>
                      {o.v==='pending' ? '→ Pend' : '✓ Close'}
                    </button>
                  ))}
                </>
              )}
              <div style={{ marginLeft:'auto', display:'flex', gap:4, alignItems:'center' }}>
                {!showSource && (
                  <button className="edit-toggle" title="Edit" onClick={()=>setEditingPipe(isEditingRow ? null : r.id)}
                    style={ isEditingRow ? { background:'var(--bg2)', color:'var(--text)', borderColor:'var(--b2)' } : {}}>
                    ✏️
                  </button>
                )}
                <button className="edit-toggle" title="Remove" onClick={()=>remove(r)}
                  style={{ color:'var(--red)', fontSize:12 }}>✕</button>
              </div>
            </div>

            {/* Inline edit fields — shown when editing */}
            {isEditingRow && (
              <div className="listing-edit-row">
                <div>
                  <div className="label" style={{ marginBottom:3 }}>Price</div>
                  <input className="field-input" value={r.price||''} placeholder="$450,000"
                    onChange={e=>update(r.id,'price',e.target.value)}
                    onBlur={e=>persist(r.id,'price',e.target.value)}
                    style={{ padding:'6px 10px', fontSize:12, width:'100%', boxSizing:'border-box',
                      fontFamily:"'JetBrains Mono',monospace", color:accentColor }}/>
                </div>
                <div>
                  <div className="label" style={{ marginBottom:3 }}>Commission</div>
                  <input className="field-input" value={r.commission||''} placeholder="3%"
                    onChange={e=>update(r.id,'commission',e.target.value)}
                    onBlur={e=>persist(r.id,'commission',e.target.value)}
                    style={{ padding:'6px 10px', fontSize:12, width:'100%', boxSizing:'border-box',
                      fontFamily:"'JetBrains Mono',monospace", color:'var(--green)' }}/>
                </div>
              </div>
            )}
          </div>
        )
      })}
      </div>

      {/* Add bar */}
      {!showSource && (
        <>
          <div className="add-bar" style={{ marginTop:14 }}>
            <span style={{ color:'var(--dim)', fontSize:16, flexShrink:0 }}>+</span>
            <input value={addr} onChange={e=>{ setAddr(e.target.value); if(e.target.value.trim() && !addExpanded) setAddExpanded(true) }}
              onKeyDown={e=>e.key==='Enter'&&add()} onFocus={()=>setAddExpanded(true)}
              placeholder={`Add to ${title.toLowerCase()}…`}
              style={ addExpanded ? { borderRadius:'var(--r) var(--r) 0 0' } : {} }/>
            {addr.trim() && (
              <button onClick={add} style={{
                background:accentColor, border:'none', color:'#fff', borderRadius:8,
                padding:'6px 14px', fontSize:12, fontWeight:700, cursor:'pointer', lineHeight:1,
                display:'flex', alignItems:'center', gap:4, transition:'all .15s', flexShrink:0,
              }}>+ Add</button>
            )}
          </div>
          {addExpanded && addr.trim() && (
            <div className="add-bar-fields" style={{ gridTemplateColumns:'1fr 1fr' }}>
              <input className="field-input" value={price} onChange={e=>setPrice(e.target.value)}
                onKeyDown={e=>e.key==='Enter'&&add()} placeholder="Price"
                style={{ padding:'6px 10px', fontSize:12, color:accentColor, fontFamily:"'JetBrains Mono',monospace" }}/>
              <input className="field-input" value={comm} onChange={e=>setComm(e.target.value)}
                onKeyDown={e=>e.key==='Enter'&&add()} placeholder="Commission (3%)"
                style={{ padding:'6px 10px', fontSize:12, color:'var(--green)', fontFamily:"'JetBrains Mono',monospace" }}/>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── HabitCell (memoized) ──────────────────────────────────────────────────────

const HabitCell = memo(function HabitCell({ habitId, weekIndex, dayIndex, checked, counter, isCounter, today, onToggle, onIncrement, catStyle, animCell }) {
  const isToday = weekIndex===today.week && dayIndex===today.day
  const ckey    = `${habitId}-${weekIndex}-${dayIndex}`
  return (
    <td style={{ textAlign:'center', padding:'5px 2px', borderLeft:dayIndex===0?'1px solid var(--b1)':'none' }}>
      <button onClick={()=>onToggle(habitId,weekIndex,dayIndex)} style={{
        width:20, height:20, borderRadius:5,
        border:`1.5px solid ${checked?catStyle.color:isToday?'var(--gold)':'var(--b2)'}`,
        background:checked?catStyle.light:'transparent', cursor:'pointer',
        display:'flex', alignItems:'center', justifyContent:'center',
        animation:animCell===ckey?'pop .25s ease':'none', transition:'all .15s',
      }}>
        {checked && <span style={{ fontSize:8, color:catStyle.color, fontWeight:700 }}>✓</span>}
        {isToday && !checked && <span style={{ width:4, height:4, borderRadius:'50%', background:'var(--gold)', display:'block' }}/>}
      </button>
      {isCounter && checked && (
        <div style={{ display:'flex', alignItems:'center', gap:1, marginTop:2, justifyContent:'center' }}>
          <span style={{ fontSize:8, color:catStyle.color, fontFamily:"'JetBrains Mono',monospace", fontWeight:700 }}>{counter||1}</span>
          <button onClick={()=>onIncrement(habitId,weekIndex,dayIndex)} style={{
            width:11, height:11, borderRadius:3, border:`1px solid ${catStyle.color}`, background:'transparent',
            cursor:'pointer', fontSize:9, lineHeight:1, color:catStyle.color, fontWeight:700,
            display:'flex', alignItems:'center', justifyContent:'center',
          }}>+</button>
        </div>
      )}
    </td>
  )
})

// ─── Dashboard ────────────────────────────────────────────────────────────────

function Dashboard({ theme, onToggleTheme }) {
  const { user, profile } = useAuth()
  // Computed per-render so it never goes stale if tab stays open across a month boundary
  const now = new Date()
  const MONTH_YEAR = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`
  const todayWeek = Math.min(Math.floor((now.getDate()-1)/7),3)
  const todayDay  = now.getDay()
  const today = useMemo(() => ({ week: todayWeek, day: todayDay }), [todayWeek, todayDay])

  // Day navigation for the Today tab — offset from real today
  const [viewDayOffset, setViewDayOffset] = useState(0)
  const viewDate = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() + viewDayOffset)
    // Clamp to current month
    if (d.getMonth() !== now.getMonth() || d.getFullYear() !== now.getFullYear()) {
      return now // fallback to today if offset goes outside month
    }
    return d
  }, [viewDayOffset])
  const viewWeek    = Math.min(Math.floor((viewDate.getDate() - 1) / 7), 3)
  const viewDayIdx  = viewDate.getDay()
  const viewDateStr = `${viewDate.getFullYear()}-${String(viewDate.getMonth() + 1).padStart(2, '0')}-${String(viewDate.getDate()).padStart(2, '0')}`
  const isViewingToday = viewDayOffset === 0
  // Navigation bounds: stay within current month
  const canGoBack    = viewDate.getDate() > 1
  const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const canGoForward = viewDate.getDate() < lastDayOfMonth

  const [page, setPage] = useState('dashboard')
  const [tab,  setTab]  = useState('today')
  const [dbLoading, setDbLoading] = useState(true)
  const [aiWidgetOpen, setAiWidgetOpen] = useState(false)

  // Force password setup for invited users
  const [needsPassword, setNeedsPassword] = useState(false)
  const [newPw, setNewPw] = useState('')
  const [pwConfirm, setPwConfirm] = useState('')
  const [pwError, setPwError] = useState('')
  const [pwSaving, setPwSaving] = useState(false)

  // Habit state
  const [habits,   setHabits]   = useState(()=>{
    const g={}; HABITS.forEach(h=>{g[h.id]=Array(WEEKS).fill(null).map(()=>Array(7).fill(false))}); return g
  })
  const [counters, setCounters] = useState({})
  const habitsRef   = useRef(habits);   habitsRef.current   = habits
  const countersRef = useRef(counters); countersRef.current = counters
  const [xp,             setXp]             = useState(0)
  const xpRef = useRef(0)  // always-current mirror of xp; prevents stale-closure in addXp/deductPipelineXp/toggleHabit
  const [streak,         setStreak]         = useState(0)
  const [xpPop,          setXpPop]          = useState(null)
  const [animCell,       setAnimCell]       = useState(null)
  const [sessionPipeline,setSessionPipeline]= useState({ offer_made:0, offer_received:0, went_pending:0, closed:0 })
  const [celebration,    setCelebration]    = useState(null) // { address, commission, ytdComm }

  // Listings
  const [listings,  setListings]  = useState([])
  const [newAddr,   setNewAddr]   = useState('')
  const [newPrice,  setNewPrice]  = useState('')
  const [newComm,   setNewComm]   = useState('')
  const [newLeadSource, setNewLeadSource] = useState('')
  const [editingListing, setEditingListing] = useState(null) // listing id in edit mode
  const [editingRep, setEditingRep] = useState(null) // buyer rep id in edit mode
  const [addListingExpanded, setAddListingExpanded] = useState(false)

  // Buyer Rep Agreements
  const [buyerReps,     setBuyerReps]    = useState([])
  const [newRepClient,  setNewRepClient] = useState('')
  const [offerModal,    setOfferModal]   = useState(null) // null | { repId, repName }
  const [expandedRep,   setExpandedRep]  = useState(null) // buyer rep id or null

  // Toast for error feedback
  const [toast, setToast] = useState(null) // { msg } or null
  const toastTimer = useRef(null)
  function showToast(msg) {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast({ msg })
    toastTimer.current = setTimeout(() => setToast(null), 4000)
  }
  // Clean up toast timer on unmount to prevent setState-after-unmount
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current) }, [])

  // Pipeline
  const [offersMade,       setOffersMade]       = useState([])
  const [offersReceived,   setOffersReceived]   = useState([])
  const [pendingDeals,     setPendingDeals]     = useState([])
  const [closedDeals,      setClosedDeals]      = useState([])
  const [wentPendingCount, setWentPendingCount] = useState(0) // historical — never decrements

  const [showCommSummary, setShowCommSummary] = useState(false)
  const [showPrint,        setShowPrint]        = useState(false)
  const [showWeeklyUpdate, setShowWeeklyUpdate] = useState(false)
  const [showBuyersUpdate, setShowBuyersUpdate] = useState(false)
  const [habitPrefs,       setHabitPrefs]       = useState({ hidden:[], order:[], edits:{} })
  const [goals,            setGoals]            = useState({}) // { xp, prospecting, appointments, showing, closed }
  const [menuOpen,         setMenuOpen]         = useState(false)

  // Custom tasks
  const [customTasks,         setCustomTasks]         = useState([])
  const [deletedDefaultTasks, setDeletedDefaultTasks] = useState([])
  const [customDone,          setCustomDone]          = useState({}) // { 'uuid-week-day': true }
  const [skippedTodayTasks,   setSkippedTodayTasks]   = useState([]) // custom default tasks skipped for today
  const [addTaskModal,    setAddTaskModal]    = useState(false)
  const [plannerPrint,        setPlannerPrint]        = useState(null)  // { wi, di, dateStr } | null
  const [plannerTaskForm,     setPlannerTaskForm]     = useState(null)  // { wi, di } | null
  const [plannerForm,         setPlannerForm]         = useState({ label:'', icon:'🏠', xp:15 })
  const [plannerDeletedTasks, setPlannerDeletedTasks] = useState([])    // day-specific tasks deleted this session
  const [standup,       setStandup]       = useState({ q1:'', q2:'', q3:'' })
  const [standupDone,   setStandupDone]   = useState(false)
  const [standupSaving, setStandupSaving] = useState(false)
  const [pipelineView, setPipelineView] = useState('list')   // 'list' | 'board'
  const [showGci, setShowGci] = useState(false)
  const [clientUpdateListing, setClientUpdateListing] = useState(null)
  const todayDate = new Date().toLocaleDateString('en-CA') // YYYY-MM-DD in local timezone

  // Depend on user.id only — prevents re-running when a new user object is created
  // (e.g. on token refresh) while the same user is still logged in.
  useEffect(()=>{ if (user?.id) loadAll() },[user?.id])

  async function loadAll() {
    if (!user) return
    setDbLoading(true)
    let habRes, listRes, txRes, profRes, ctRes
    try {
      ;[habRes, listRes, txRes, profRes, ctRes] = await Promise.all([
        supabase.from('habit_completions').select('*').eq('user_id',user.id).eq('month_year',MONTH_YEAR),
        supabase.from('listings').select('*').eq('user_id',user.id).limit(500),
        supabase.from('transactions').select('*').eq('user_id',user.id).eq('month_year',MONTH_YEAR).limit(500),
        supabase.from('profiles').select('*').eq('id',user.id).single(),
        supabase.from('custom_tasks').select('*').eq('user_id',user.id).limit(200),
      ])

    if (habRes.data?.length) {
      const g={}; HABITS.forEach(h=>{g[h.id]=Array(WEEKS).fill(null).map(()=>Array(7).fill(false))})
      const cnts={}
      const cd={}
      habRes.data.forEach(c=>{
        if(g[c.habit_id]) {
          g[c.habit_id][c.week_index][c.day_index]=true
          if(c.counter_value>0) cnts[`${c.habit_id}-${c.week_index}-${c.day_index}`]=c.counter_value
        } else {
          // Unknown habit_id → custom task completion
          cd[`${c.habit_id}-${c.week_index}-${c.day_index}`]=true
        }
      })
      setHabits(g); setCounters(cnts); setCustomDone(cd)
    }

    if (ctRes.data) {
      const toTask = t => ({ id:t.id, label:t.label, icon:t.icon, xp:t.xp, isDefault:t.is_default, specificDate:t.specific_date })
      const allNonDeleted = ctRes.data.filter(t => !t.is_deleted).map(toTask)
      // Split: tasks skipped for today go to skippedTodayTasks, rest stay in customTasks
      const persistedSkips = (profRes.data?.habit_prefs?.skipped||{})[todayDate] || []
      setCustomTasks(allNonDeleted.filter(t => !t.isDefault || !persistedSkips.includes(String(t.id))))
      setSkippedTodayTasks(allNonDeleted.filter(t => t.isDefault && persistedSkips.includes(String(t.id))))
      setDeletedDefaultTasks(ctRes.data.filter(t => t.is_deleted).map(toTask))
    }

    if (listRes.data) {
      const allL = listRes.data
      setListings(allL.filter(l => (l.unit_count ?? 1) !== 0).map(l => ({
        id:l.id, address:l.address, status:l.status||'active',
        price:l.price||'', commission:l.commission||'', monthYear:l.month_year||'',
        createdAt:l.created_at||null, leadSource:l.lead_source||'', notes:l.notes||[]
      })))
      setBuyerReps(allL.filter(l => l.unit_count === 0).map(r => ({
        id:r.id, clientName:r.address||'', status:r.status||'active', monthYear:r.month_year||'',
        buyerDetails:r.buyer_details||{}, createdAt:r.created_at||null
      })))
    }

    if (txRes.data) {
      const m = t => ({ id:t.id, address:t.address, price:t.price||'', commission:t.commission||'', status:t.status||'active', closedFrom:t.closed_from||'', createdAt:t.created_at||null, leadSource:t.lead_source||'', notes:t.notes||[] })
      setOffersMade(    txRes.data.filter(t=>t.type==='offer_made').map(m))
      setOffersReceived(txRes.data.filter(t=>t.type==='offer_received').map(m))
      setPendingDeals(  txRes.data.filter(t=>t.type==='pending').map(m))
      setClosedDeals(   txRes.data.filter(t=>t.type==='closed').map(m))
      // Historical count — all records ever marked pending, regardless of current state
      setWentPendingCount(txRes.data.filter(t=>t.type==='pending').length)
    }

    if (profRes.data) {
      const loadedXp = profRes.data.xp||0
      xpRef.current = loadedXp  // sync ref immediately so addXp never races against the first DB load
      setXp(loadedXp)
      setStreak(profRes.data.streak||0)
      setShowCommSummary(profRes.data.show_commission||false)
      if (profRes.data.habit_prefs) setHabitPrefs(profRes.data.habit_prefs)
      if (profRes.data.goals)       setGoals(profRes.data.goals)
      const sd = profRes.data?.habit_prefs?.standup_today
      if (sd?.date === todayDate) {
        setStandup({ q1: sd.q1||'', q2: sd.q2||'', q3: sd.q3||'' })
        setStandupDone(true)
      }
    }
    } catch (err) {
      console.error('Dashboard loadAll error:', err)
    } finally {
      setDbLoading(false)
    }
  }

  async function submitStandup() {
    if (!standup.q1.trim() || !standup.q2.trim()) return
    setStandupSaving(true)
    const newPrefs = { ...habitPrefs, standup_today: { date: todayDate, ...standup } }
    setHabitPrefs(newPrefs)
    await supabase.from('profiles').update({ habit_prefs: newPrefs }).eq('id', user.id)
    setStandupDone(true)
    setStandupSaving(false)
  }

  // Keep xpRef in sync so addXp / deductPipelineXp / toggleHabit always read the latest value
  // even when called multiple times before a re-render (prevents stale-closure XP corruption)
  useEffect(() => { xpRef.current = xp }, [xp])

  // Auto-clear XP pop notification with proper cleanup
  useEffect(() => {
    if (!xpPop) return
    const timer = setTimeout(() => setXpPop(null), 1400)
    return () => clearTimeout(timer)
  }, [xpPop])

  // Auto-clear habit animation cell with proper cleanup
  useEffect(() => {
    if (!animCell) return
    const timer = setTimeout(() => setAnimCell(null), 300)
    return () => clearTimeout(timer)
  }, [animCell])

  // ESC key closes any open modal — use refs to avoid re-attaching listener on every modal change
  const modalsRef = useRef({})
  modalsRef.current = { offerModal, addTaskModal, showPrint, plannerPrint, showWeeklyUpdate, showBuyersUpdate, aiWidgetOpen }
  useEffect(() => {
    const onKey = e => {
      if (e.key !== 'Escape') return
      const m = modalsRef.current
      if (m.aiWidgetOpen)      setAiWidgetOpen(false)
      else if (m.offerModal)        setOfferModal(null)
      else if (m.addTaskModal) setAddTaskModal(false)
      else if (m.showPrint)    setShowPrint(false)
      else if (m.plannerPrint) setPlannerPrint(null)
      else if (m.showWeeklyUpdate) setShowWeeklyUpdate(false)
      else if (m.showBuyersUpdate) setShowBuyersUpdate(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Scroll to top on page navigation
  useEffect(() => { window.scrollTo(0, 0) }, [page])

  // Redirect ai-assistant page navigation to floating widget
  // Safe: 'dashboard' !== 'ai-assistant' so the second render is a no-op
  useEffect(() => {
    if (page === 'ai-assistant') {
      setPage('dashboard')
      setAiWidgetOpen(true)
    }
  }, [page])

  // Check if invited user needs to set a password
  useEffect(() => {
    if (!dbLoading && user?.user_metadata?.team_id && !profile?.habit_prefs?.password_set) {
      setNeedsPassword(true)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbLoading, user?.user_metadata?.team_id, profile?.habit_prefs?.password_set])

  async function handleSetPassword() {
    setPwError('')
    if (newPw.length < 6) { setPwError('Password must be at least 6 characters.'); return }
    if (newPw !== pwConfirm) { setPwError('Passwords do not match.'); return }
    setPwSaving(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPw })
      if (error) throw error
      const newPrefs = { ...habitPrefs, password_set: true }
      setHabitPrefs(newPrefs)
      await supabase.from('profiles').update({ habit_prefs: newPrefs }).eq('id', user.id)
      setNeedsPassword(false)
    } catch (e) {
      setPwError(e.message || 'Failed to set password.')
    }
    setPwSaving(false)
  }

  // ── XP ─────────────────────────────────────────────────────────────────────
  async function addXp(amount, color='var(--gold)') {
    const nxp = xpRef.current + amount
    xpRef.current = nxp  // eagerly update so back-to-back calls get the right base value
    setXp(nxp)
    setXpPop({ val:`+${amount} XP`, color })
    const r = await safeDb(supabase.from('profiles').update({xp:nxp}).eq('id',user.id))
    if (!r.ok) showToast('Failed to save XP — please refresh')
    return nxp
  }

  async function awardPipelineXp(type, color) {
    setSessionPipeline(prev => ({...prev, [type]: prev[type]+1}))
    await addXp(PIPELINE_XP[type], color)
  }

  async function deductPipelineXp(type) {
    const amount = PIPELINE_XP[type]
    const nxp    = Math.max(0, xpRef.current - amount)
    xpRef.current = nxp  // eagerly update ref
    setXp(nxp)
    setXpPop({ val:`-${amount} XP`, color:'#dc2626' })
    const r = await safeDb(supabase.from('profiles').update({xp:nxp}).eq('id',user.id))
    if (!r.ok) showToast('Failed to save XP — please refresh')
    setSessionPipeline(prev => ({...prev, [type]: Math.max(0, prev[type]-1)}))
    if (type === 'went_pending') setWentPendingCount(prev => Math.max(0, prev - 1))
  }

  // Persist a new Offer Made to DB, award XP, return saved row with real ID
  async function handleOfferMadeAdd(tmpRow) {
    const data = await dbInsert('offer_made', tmpRow)
    if (!data) return null
    await awardPipelineXp('offer_made', '#0ea5e9')
    return { id:data.id, address:data.address||tmpRow.address, price:data.price||'', commission:data.commission||'', status:'active', closedFrom:'' }
  }

  // Persist a new Offer Received to DB, award XP, return saved row with real ID
  async function handleOfferReceivedAdd(tmpRow) {
    const data = await dbInsert('offer_received', tmpRow)
    if (!data) return null
    await awardPipelineXp('offer_received', '#8b5cf6')
    return { id:data.id, address:data.address||tmpRow.address, price:data.price||'', commission:data.commission||'', status:'active', closedFrom:'' }
  }

  // ── Profile habit prefs (for per-user skip) ────────────────────────────────
  async function saveProfileHabitPrefs(newPrefs) {
    setHabitPrefs(newPrefs)
    await safeDb(supabase.from('profiles').update({ habit_prefs: newPrefs }).eq('id', user.id))
  }

  function skipHabitToday(hid) {
    const prev = (habitPrefs.skipped||{})[viewDateStr] || []
    if (prev.includes(String(hid))) return
    const newPrefs = {
      ...habitPrefs,
      skipped: { ...(habitPrefs.skipped||{}), [viewDateStr]: [...prev, String(hid)] }
    }
    saveProfileHabitPrefs(newPrefs)
  }

  function unSkipHabitToday(hid) {
    const newPrefs = {
      ...habitPrefs,
      skipped: {
        ...(habitPrefs.skipped||{}),
        [viewDateStr]: ((habitPrefs.skipped||{})[viewDateStr]||[]).filter(id => id !== String(hid))
      }
    }
    saveProfileHabitPrefs(newPrefs)
  }

  // Generic skip/unskip for any date (used by week planner — also affects Today view on that date)
  function skipHabitForDate(hid, dateStr) {
    const prev = (habitPrefs.skipped||{})[dateStr] || []
    if (prev.includes(String(hid))) return
    saveProfileHabitPrefs({
      ...habitPrefs,
      skipped: { ...(habitPrefs.skipped||{}), [dateStr]: [...prev, String(hid)] }
    })
  }
  function unSkipHabitForDate(hid, dateStr) {
    saveProfileHabitPrefs({
      ...habitPrefs,
      skipped: {
        ...(habitPrefs.skipped||{}),
        [dateStr]: ((habitPrefs.skipped||{})[dateStr]||[]).filter(id => id !== String(hid))
      }
    })
  }

  // Custom default task skip/restore — moves task object between states for instant UI feedback
  function skipCustomTaskToday(task) {
    setCustomTasks(prev => prev.filter(t => t.id !== task.id))
    setSkippedTodayTasks(prev => [...prev, task])
    skipHabitToday(task.id)
  }
  function unSkipCustomTaskToday(task) {
    setSkippedTodayTasks(prev => prev.filter(t => t.id !== task.id))
    setCustomTasks(prev => [...prev, { ...task }])
    unSkipHabitToday(task.id)
  }

  // ── Habits ─────────────────────────────────────────────────────────────────
  const toggleHabit = useCallback(async (hid, week, day) => {
    const newVal = !habitsRef.current[hid][week][day]
    setHabits(prev=>{ const n={...prev}; n[hid]=n[hid].map((w,wi)=>wi===week?w.map((d,di)=>di===day?newVal:d):w); return n })
    // Use effectiveHabits so edited XP/label/icon values take effect
    const hBase = HABITS.find(x=>x.id===hid)
    if (!hBase) return  // defensive: unknown habit id
    const hEd   = (activePrefsRef.current.edits||{})[hid] || {}
    const h     = { ...hBase, xp: hEd.xp || hBase.xp }
    const cat   = CAT[h.cat]
    if (!cat) return  // defensive: unknown category
    if (newVal) {
      await addXp(h.xp, cat.color)
      const ckey = `${hid}-${week}-${day}`
      if (h.counter) setCounters(prev=>({...prev,[ckey]:1}))
      await safeDb(supabase.from('habit_completions').upsert({
        user_id:user.id, habit_id:hid, week_index:week, day_index:day,
        month_year:MONTH_YEAR, xp_earned:h.xp, counter_value:h.counter?1:0
      },{onConflict:'user_id,habit_id,week_index,day_index,month_year'}))
    } else {
      const ckey = `${hid}-${week}-${day}`
      const lost = h.xp + Math.max(0,(countersRef.current[ckey]||1)-1)*(h.xpEach||0)
      const nxp  = Math.max(0, xpRef.current - lost)
      xpRef.current = nxp  // eagerly update ref before DB write
      setXp(nxp)
      await safeDb(supabase.from('profiles').update({xp:nxp}).eq('id',user.id))
      await safeDb(supabase.from('habit_completions').delete()
        .eq('user_id',user.id).eq('habit_id',hid).eq('week_index',week).eq('day_index',day).eq('month_year',MONTH_YEAR))
      if (h.counter) setCounters(prev=>{ const n={...prev}; delete n[ckey]; return n })
    }
    setAnimCell(`${hid}-${week}-${day}`)
  }, [user?.id, MONTH_YEAR])

  const setCounterValue = useCallback(async (hid, week, day, rawVal) => {
    const v     = Math.max(1, parseInt(rawVal) || 1)
    const hBase = HABITS.find(x=>x.id===hid)
    if (!hBase) return  // defensive: unknown habit id
    const hEd   = (activePrefsRef.current.edits||{})[hid] || {}
    const h     = { ...hBase, xp: hEd.xp || hBase.xp }
    const ckey  = `${hid}-${week}-${day}`
    const oldCnt = countersRef.current[ckey] || 1
    setCounters(prev=>({...prev,[ckey]:v}))
    // XP delta: difference in extra-unit XP between old and new count
    const xpDiff = (v - oldCnt) * (h.xpEach || 0)
    if (xpDiff !== 0) {
      const nxp = Math.max(0, xpRef.current + xpDiff)
      xpRef.current = nxp
      setXp(nxp)
      await safeDb(supabase.from('profiles').update({xp:nxp}).eq('id',user.id))
    }
    await safeDb(supabase.from('habit_completions').upsert({
      user_id:user.id, habit_id:hid, week_index:week, day_index:day,
      month_year:MONTH_YEAR, xp_earned:(h.xp||0)+Math.max(0,v-1)*(h.xpEach||0), counter_value:v
    },{onConflict:'user_id,habit_id,week_index,day_index,month_year'}))
  }, [user?.id, MONTH_YEAR])

  const incrementCounter = useCallback((hid, week, day) => {
    const ckey = `${hid}-${week}-${day}`
    const cur  = countersRef.current[ckey] || 1
    setCounterValue(hid, week, day, cur + 1)
  }, [setCounterValue])

  // ── Custom tasks ────────────────────────────────────────────────────────────
  async function toggleCustomTask(taskId, week, day) {
    const key    = `${taskId}-${week}-${day}`
    const newVal = !customDone[key]
    setCustomDone(prev => newVal
      ? {...prev, [key]:true}
      : Object.fromEntries(Object.entries(prev).filter(([k])=>k!==key))
    )
    const task = customTasks.find(t => t.id === taskId)
    if (!task) return
    if (newVal) {
      await addXp(task.xp, '#06b6d4')
      await safeDb(supabase.from('habit_completions').upsert({
        user_id:user.id, habit_id:taskId, week_index:week, day_index:day,
        month_year:MONTH_YEAR, xp_earned:task.xp, counter_value:0
      },{onConflict:'user_id,habit_id,week_index,day_index,month_year'}))
    } else {
      const nxp = Math.max(0, xpRef.current - task.xp)
      xpRef.current = nxp
      setXp(nxp)
      setXpPop({ val:`-${task.xp} XP`, color:'#dc2626' })
      await safeDb(supabase.from('profiles').update({xp:nxp}).eq('id',user.id))
      await safeDb(supabase.from('habit_completions').delete()
        .eq('user_id',user.id).eq('habit_id',taskId)
        .eq('week_index',week).eq('day_index',day).eq('month_year',MONTH_YEAR))
    }
  }

  async function addTaskToday(label, icon, xp) {
    try {
      const {data, error} = await supabase.from('custom_tasks').insert({
        user_id:user.id, label, icon, xp:Number(xp)||15,
        is_default:false, specific_date:viewDateStr
      }).select().single()
      if (error) throw error
      if (data) setCustomTasks(prev => [...prev, {
        id:data.id, label:data.label, icon:data.icon, xp:data.xp,
        isDefault:false, specificDate:data.specific_date
      }])
    } catch(e) { console.error('addTaskToday error:', e) }
    setAddTaskModal(false)
  }

  async function addTaskForDay(weekIdx, dayIdx, label, icon, xp) {
    const specificDate = dateStrForDay(weekIdx, dayIdx)
    if (!specificDate || !label.trim()) return
    try {
      const { data, error } = await supabase.from('custom_tasks').insert({
        user_id:user.id, label, icon, xp:Number(xp)||15,
        is_default:false, specific_date:specificDate,
      }).select().single()
      if (error) throw error
      if (data) setCustomTasks(prev => [...prev, {
        id:data.id, label:data.label, icon:data.icon, xp:data.xp,
        isDefault:false, specificDate:data.specific_date,
      }])
    } catch(e) { console.error('addTaskForDay error:', e) }
    setPlannerTaskForm(null)
    setPlannerForm({ label:'', icon:'🏠', xp:15 })
  }

  // Planner-only: move a day-specific task to a recoverable deleted list, hard-delete from DB
  async function deleteDayTask(task) {
    try {
      setPlannerDeletedTasks(prev => [...prev, task])
      setCustomTasks(prev => prev.filter(t => t.id !== task.id))
      const { error } = await supabase.from('custom_tasks').delete().eq('id', task.id).eq('user_id', user.id)
      if (error) throw error
    } catch(e) {
      console.error('deleteDayTask error:', e)
      // Restore on failure
      setPlannerDeletedTasks(prev => prev.filter(t => t.id !== task.id))
      setCustomTasks(prev => [...prev, task])
    }
  }
  // Re-insert and bring back into view
  async function restoreDayTask(task) {
    try {
      const { data, error } = await supabase.from('custom_tasks').insert({
        user_id: user.id, label: task.label, icon: task.icon, xp: task.xp,
        is_default: false, specific_date: task.specificDate,
      }).select().single()
      if (error) throw error
      if (data) {
        setCustomTasks(prev => [...prev, { id:data.id, label:data.label, icon:data.icon, xp:data.xp, isDefault:false, specificDate:data.specific_date }])
        setPlannerDeletedTasks(prev => prev.filter(t => t.id !== task.id))
      }
    } catch(e) { console.error('restoreDayTask error:', e) }
  }

  async function deleteCustomTask(id) {
    const prev = customTasks.find(t => t.id === id)
    setCustomTasks(p => p.filter(t => t.id !== id))
    try {
      const { error } = await supabase.from('custom_tasks').delete().eq('id',id).eq('user_id',user.id)
      if (error) throw error
    } catch(e) {
      console.error('deleteCustomTask error:', e)
      if (prev) setCustomTasks(p => [...p, prev])
    }
  }

  async function restoreCustomTask(task) {
    try {
      const { error } = await supabase.from('custom_tasks').update({ is_deleted: false }).eq('id',task.id).eq('user_id',user.id)
      if (error) throw error
      setDeletedDefaultTasks(prev => prev.filter(t => t.id !== task.id))
      setCustomTasks(prev => [...prev, { ...task }])
    } catch(e) { console.error('restoreCustomTask error:', e) }
  }

  // Called by ProfilePage when a default task is soft-deleted or restored
  // so App.jsx state stays in sync without a full reload
  function syncTaskDeleted(task) {
    setCustomTasks(prev => prev.filter(t => t.id !== task.id))
    setDeletedDefaultTasks(prev => [...prev, { ...task }])
  }
  function syncTaskRestored(task) {
    setDeletedDefaultTasks(prev => prev.filter(t => t.id !== task.id))
    setCustomTasks(prev => [...prev, { ...task }])
  }

  // ── Pipeline helpers ───────────────────────────────────────────────────────
  async function dbInsert(type, item, closedFrom='') {
    const {data, error} = await supabase.from('transactions').insert({
      user_id:user.id, type, address:item.address||'', price:item.price||'',
      commission:item.commission||'', status:type==='closed'?'closed':'active',
      closed_from:closedFrom||item.closedFrom||null, month_year:MONTH_YEAR
    }).select().single()
    if (error) { console.error('dbInsert error:', error.message); return null }
    return data
  }
  async function dbDelete(id) {
    if (id && !String(id).startsWith('tmp-')) {
      const {error} = await supabase.from('transactions').delete().eq('id',id).eq('user_id',user.id)
      if (error) console.error('dbDelete error:', error.message)
    }
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
      if (data) {
        setClosedDeals(prev=>[...prev,{...row,id:data.id,status:'closed',closedFrom:'Offers'}])
        const comm = resolveCommission(row.commission, row.price)
        setCelebration({ address:row.address||'Deal Closed', commission:comm > 0 ? fmtMoney(comm) : (row.commission||''), newComm:comm })
      }
      await awardPipelineXp('closed', '#10b981')
    }
  }

  async function handlePendingStatus(row, newStatus) {
    if (newStatus === 'closed') {
      // NON-DESTRUCTIVE: keep entry in Went Pending, also create a Closed record
      const data = await dbInsert('closed', row, row.closedFrom||'Pending')
      if (data) {
        setClosedDeals(prev=>[...prev,{...row,id:data.id,status:'closed',closedFrom:row.closedFrom||'Pending'}])
        const comm = resolveCommission(row.commission, row.price)
        setCelebration({ address:row.address||'Deal Closed', commission:comm > 0 ? fmtMoney(comm) : (row.commission||''), newComm:comm })
      }
      await awardPipelineXp('closed', '#10b981')
    }
  }

  // ── Listings ───────────────────────────────────────────────────────────────
  async function addListing() {
    if (!newAddr.trim()) return
    const rawComm = newComm.trim()
    const commVal = rawComm && !rawComm.endsWith('%') ? rawComm + '%' : rawComm
    try {
      const insertObj = { user_id:user.id, address:newAddr.trim(), unit_count:1,
        price:newPrice.trim(), commission:commVal, status:'active', month_year:MONTH_YEAR }
      if (newLeadSource) insertObj.lead_source = newLeadSource
      let {data, error} = await supabase.from('listings').insert(insertObj).select().single()
      // If lead_source column doesn't exist yet, retry without it
      if (error && newLeadSource && error.message?.includes('lead_source')) {
        delete insertObj.lead_source
        const retry = await supabase.from('listings').insert(insertObj).select().single()
        data = retry.data; error = retry.error
      }
      if (error) throw error
      if (data) {
        setListings(prev=>[...prev,{id:data.id,address:data.address,status:'active',price:data.price||'',commission:data.commission||'',monthYear:data.month_year||MONTH_YEAR,createdAt:data.created_at||null,leadSource:data.lead_source||'',notes:[]}])
        setNewAddr(''); setNewPrice(''); setNewComm(''); setNewLeadSource('')
        setAddListingExpanded(false)
      }
    } catch (err) {
      console.error('addListing error:', err)
      showToast('Failed to add listing: ' + (err.message || 'unknown error'))
    }
  }

  async function removeListing(listing) {
    if (!window.confirm(`Remove listing "${listing.address}"?`)) return
    const snapshot = listings
    setListings(prev=>prev.filter(l=>l.id!==listing.id))
    const r = await safeDb(supabase.from('listings').delete().eq('id',listing.id).eq('user_id',user.id))
    if (!r.ok) { setListings(snapshot); showToast('Failed to remove listing') }
  }

  function updateListingLocal(id, field, val) {
    setListings(prev=>prev.map(l=>l.id===id?{...l,[field]:val}:l))
  }
  const listingFieldMap = { leadSource:'lead_source', monthYear:'month_year' }
  async function updateListing(id, field, val) {
    setListings(prev=>prev.map(l=>l.id===id?{...l,[field]:val}:l))
    const dbField = listingFieldMap[field] || field
    const r = await safeDb(supabase.from('listings').update({[dbField]:val}).eq('id',id).eq('user_id',user.id))
    if (!r.ok) showToast('Failed to save listing change')
  }
  function toggleListingCommType(id) {
    setListings(prev => prev.map(l => {
      if (l.id !== id) return l
      const raw = String(l.commission || '').trim()
      const isPercent = raw.endsWith('%')
      const newComm = isPercent ? raw.replace(/%$/, '') : (raw ? raw + '%' : '%')
      return { ...l, commission: newComm }
    }))
    // Persist the toggled value
    const row = listings.find(l => l.id === id)
    if (row) {
      const raw = String(row.commission || '').trim()
      const isPercent = raw.endsWith('%')
      const newComm = isPercent ? raw.replace(/%$/, '') : (raw ? raw + '%' : '%')
      safeDb(supabase.from('listings').update({ commission: newComm }).eq('id', id).eq('user_id', user.id))
    }
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
      if (data) {
        setClosedDeals(prev=>[...prev,{id:data.id,address:listing.address,price:lPrice,commission:lComm,status:'closed',closedFrom:'Listing'}])
        const comm = resolveCommission(lComm, lPrice)
        setCelebration({ address:listing.address||'Deal Closed', commission:comm > 0 ? fmtMoney(comm) : (lComm||''), newComm:comm })
      }
      await awardPipelineXp('closed', '#10b981')
    }
  }

  // ── Buyer Rep Agreements ───────────────────────────────────────────────────
  async function addBuyerRep() {
    if (!newRepClient.trim()) return
    try {
      const {data, error} = await supabase.from('listings').insert({
        user_id:user.id, address:newRepClient.trim(), unit_count:0,
        price:'', commission:'', status:'active', month_year:MONTH_YEAR
      }).select().single()
      if (error) throw error
      if (data) {
        setBuyerReps(prev => [...prev, { id:data.id, clientName:data.address, status:'active', monthYear:data.month_year||MONTH_YEAR, buyerDetails:{}, createdAt:data.created_at||null }])
        setNewRepClient('')
      }
    } catch (err) {
      console.error('addBuyerRep error:', err)
      showToast('Failed to add buyer rep — please try again')
    }
  }

  async function removeBuyerRep(rep) {
    if (!window.confirm(`Remove buyer rep "${rep.clientName}"?`)) return
    const snapshot = buyerReps
    setBuyerReps(prev => prev.filter(r => r.id !== rep.id))
    const r = await safeDb(supabase.from('listings').delete().eq('id', rep.id).eq('user_id', user.id))
    if (!r.ok) { setBuyerReps(snapshot); showToast('Failed to remove buyer rep') }
  }

  function updateBuyerRepLocal(id, val) {
    setBuyerReps(prev => prev.map(r => r.id === id ? {...r, clientName:val} : r))
  }
  async function persistBuyerRep(id, val) {
    setBuyerReps(prev => prev.map(r => r.id === id ? {...r, clientName:val} : r))
    const r = await safeDb(supabase.from('listings').update({address:val}).eq('id', id).eq('user_id', user.id))
    if (!r.ok) showToast('Failed to save client name')
  }

  async function closeBuyerRep(rep) {
    const snapshot = buyerReps
    setBuyerReps(prev => prev.map(r => r.id === rep.id ? {...r, status:'closed'} : r))
    const r = await safeDb(supabase.from('listings').update({status:'closed'}).eq('id', rep.id).eq('user_id', user.id))
    if (!r.ok) { setBuyerReps(snapshot); showToast('Failed to close buyer rep') }
  }

  // Update a single buyer_details field locally (no auto-save — user clicks Save)
  function updateBuyerRepDetail(id, field, value) {
    setBuyerReps(prev => prev.map(r => r.id === id
      ? {...r, buyerDetails: {...(r.buyerDetails||{}), [field]: value}, _dirty: true}
      : r
    ))
  }
  // Persist full buyer_details to DB (called by Save button)
  const [savingRepId, setSavingRepId] = useState(null)
  async function saveBuyerRepDetails(id) {
    const rep = buyerReps.find(r => r.id === id)
    if (!rep) return
    setSavingRepId(id)
    const r = await safeDb(supabase.from('listings').update({ buyer_details: rep.buyerDetails || {} }).eq('id', id).eq('user_id', user.id))
    setSavingRepId(null)
    if (!r.ok) { showToast('Failed to save buyer details'); return }
    // Clear dirty flag on success
    setBuyerReps(prev => prev.map(r => r.id === id ? {...r, _dirty: false} : r))
  }

  async function submitBuyerRepOffer(addr, price, comm) {
    if (!offerModal || !addr) return
    const data = await dbInsert('offer_made', {address:addr, price, commission:comm})
    if (data) {
      setOffersMade(prev => [...prev, {
        id:data.id, address:data.address, price:data.price||'',
        commission:data.commission||'', status:'active', closedFrom:''
      }])
      await awardPipelineXp('offer_made', '#0ea5e9')
    }
    setOfferModal(null)
  }

  // ── Derived ────────────────────────────────────────────────────────────────
  const rank     = getRank(xp)
  const nextRank = RANKS.find(r => r.min > xp)
  const rankPct  = nextRank ? Math.round((xp-rank.min)/(nextRank.min-rank.min)*100) : 100

  // ── Team vs personal prefs ────────────────────────────────────────────────
  const isOnTeam    = !!profile?.team_id
  const isTeamOwner = isOnTeam && profile?.teams?.created_by === user?.id
  const activePrefs = isOnTeam
    ? (profile?.teams?.team_prefs || DEFAULT_PREFS)
    : habitPrefs
  const activePrefsRef = useRef(activePrefs); activePrefsRef.current = activePrefs

  // ── Effective habits: built-ins (with edits, hidden removed) + custom defaults, ordered ──
  const builtInEffective = useMemo(() => HABITS
    .filter(h => !(activePrefs.hidden||[]).includes(h.id))
    .map(h => {
      const ed = (activePrefs.edits||{})[h.id] || {}
      return { ...h, label:ed.label||h.label, icon:ed.icon||h.icon, xp:ed.xp||h.xp, isBuiltIn:true }
    })
  , [activePrefs.hidden, activePrefs.edits])
  const customDefaults = useMemo(() => isOnTeam && !isTeamOwner
    ? []
    : customTasks.filter(t => t.isDefault).map(t => ({ ...t, isBuiltIn:false }))
  , [isOnTeam, isTeamOwner, customTasks])
  const effectiveHabits = useMemo(() => {
    const all = [...builtInEffective, ...customDefaults]
    const orderArr = activePrefs.order || []
    if (orderArr.length) {
      const idx = {}; orderArr.forEach((id,i) => idx[id]=i)
      all.sort((a,b) => (idx[a.id]??999) - (idx[b.id]??999))
    }
    return all
  }, [builtInEffective, customDefaults, activePrefs.order])

  // ── Daily skip (for viewed day) ──────────────────────────────────────────
  const viewSkippedRaw      = (habitPrefs.skipped||{})[viewDateStr]
  const viewSkipped         = useMemo(() => viewSkippedRaw || [], [viewSkippedRaw])
  const effectiveView       = useMemo(() => effectiveHabits.filter(h => !viewSkipped.includes(String(h.id))), [effectiveHabits, viewSkipped])
  const viewBuiltInActive   = useMemo(() => builtInEffective.filter(h => !viewSkipped.includes(h.id)), [builtInEffective, viewSkipped])
  const skippedBuiltInView  = useMemo(() => builtInEffective.filter(h => viewSkipped.includes(String(h.id))), [builtInEffective, viewSkipped])

  const dashStats = useMemo(() => {
    const totalHabitChecks = builtInEffective.reduce((a,h)=>a+habits[h.id].flat().filter(Boolean).length,0)
    const totalPossible    = Math.max(builtInEffective.length,1)*WEEKS*7
    const monthPct         = Math.round(totalHabitChecks/totalPossible*100)
    const viewChecks       = viewBuiltInActive.filter(h=>habits[h.id][viewWeek]?.[viewDayIdx]).length
    const viewPct          = Math.round(viewChecks/Math.max(viewBuiltInActive.length,1)*100)
    const totalProspecting = Object.entries(counters).filter(([k])=>k.startsWith('prospecting')).reduce((a,[,v])=>a+v,0)
    const totalAppts       = Object.entries(counters).filter(([k])=>k.startsWith('appointments')).reduce((a,[,v])=>a+v,0)
    const totalShowings    = Object.entries(counters).filter(([k])=>k.startsWith('showing')).reduce((a,[,v])=>a+v,0)
    const totalListings    = listings.filter(l => l.status !== 'closed').length
    const totalBuyerReps   = buyerReps.filter(r => r.status !== 'closed').length
    const closedVol        = closedDeals.reduce((a,r)=>{ const n=parseFloat(String(r.price||'').replace(/[^0-9.]/g,'')); return a+(isNaN(n)?0:n) },0)
    const closedComm       = closedDeals.reduce((a,r) => a + resolveCommission(r.commission, r.price), 0)
    const viewHabitXp      = builtInEffective.reduce((acc,h)=>{
      if(!habits[h.id][viewWeek]?.[viewDayIdx]) return acc
      const ckey=`${h.id}-${viewWeek}-${viewDayIdx}`
      const cnt=counters[ckey]||0
      return acc + h.xp + (cnt>0?Math.max(0,cnt-1)*(h.xpEach||0):0)
    },0)
    const sessionPipelineXp =
      sessionPipeline.offer_made    * PIPELINE_XP.offer_made    +
      sessionPipeline.offer_received * PIPELINE_XP.offer_received +
      sessionPipeline.went_pending  * PIPELINE_XP.went_pending  +
      sessionPipeline.closed        * PIPELINE_XP.closed
    return { totalHabitChecks, totalPossible, monthPct, viewChecks, viewPct, totalProspecting, totalAppts, totalShowings, totalListings, totalBuyerReps, closedVol, closedComm, viewHabitXp, sessionPipelineXp, viewXp: viewHabitXp + sessionPipelineXp }
  }, [habits, counters, builtInEffective, viewBuiltInActive, viewWeek, viewDayIdx, listings, buyerReps, closedDeals, sessionPipeline])
  const { totalHabitChecks, monthPct, viewChecks: todayChecks, viewPct: todayPct, totalProspecting, totalAppts, totalShowings, totalListings, totalBuyerReps, closedVol, closedComm, viewHabitXp: todayHabitXp, sessionPipelineXp, viewXp: todayXp } = dashStats

  // ── GCI Dashboard stats ──────────────────────────────────────────────────
  const gciStats = useMemo(() => {
    if (!closedDeals.length) return { bySource: [], avgDeal: 0, annualPace: 0 }
    const sourceMap = {}
    closedDeals.forEach(d => {
      const src = d.closedFrom || 'Direct'
      const comm = resolveCommission(d.commission, d.price)
      sourceMap[src] = (sourceMap[src] || 0) + comm
    })
    const bySource = Object.entries(sourceMap).map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount)
    const avgDeal = closedComm / closedDeals.length
    const annualPace = closedComm * 12
    return { bySource, avgDeal, annualPace }
  }, [closedDeals, closedComm])

  // ── Personal Records ─────────────────────────────────────────────────────
  const personalRecords = useMemo(() => {
    let bestDayXp = 0, bestWeekXp = 0, perfectDays = 0, activeDays = 0
    for (let wi = 0; wi < WEEKS; wi++) {
      let weekXp = 0
      for (let di = 0; di < 7; di++) {
        let dayXp = 0, dayDone = 0, dayActive = 0
        builtInEffective.forEach(h => {
          dayActive++
          if (habits[h.id]?.[wi]?.[di]) {
            dayDone++
            const ckey = `${h.id}-${wi}-${di}`
            const cnt = counters[ckey] || 0
            dayXp += h.xp + (cnt > 0 ? Math.max(0, cnt - 1) * (h.xpEach || 0) : 0)
          }
        })
        if (dayDone > 0) activeDays++
        if (dayActive > 0 && dayDone === dayActive) perfectDays++
        bestDayXp = Math.max(bestDayXp, dayXp)
        weekXp += dayXp
      }
      bestWeekXp = Math.max(bestWeekXp, weekXp)
    }
    return { bestDayXp, bestWeekXp, perfectDays, activeDays }
  }, [habits, counters, builtInEffective])

  // ── Week Heatmap data ────────────────────────────────────────────────────
  const weekHeatmap = useMemo(() => {
    return Array.from({ length: WEEKS }, (_, wi) =>
      Array.from({ length: 7 }, (_, di) => {
        const ds = dateStrForDay(wi, di)
        const skipped = (habitPrefs.skipped || {})[ds] || []
        const active = builtInEffective.filter(h => !skipped.includes(String(h.id)))
        const done = active.filter(h => habits[h.id]?.[wi]?.[di]).length
        return active.length > 0 ? Math.round(done / active.length * 100) : -1
      })
    )
  }, [habits, builtInEffective, habitPrefs.skipped])

  const dateStr   = new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'})
  const quote = QUOTES[new Date().getDay()]
  const timeGreeting = (() => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening' })()

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

      {/* ── Deal Celebration ───────────────────────────────── */}
      {celebration && (() => {
        const ytd = closedDeals.reduce((a,r) => a + resolveCommission(r.commission, r.price), 0)
        const year = new Date().getFullYear()
        const confettiColors = ['#10b981','#f59e0b','#3b82f6','#f43f5e','#8b5cf6','#fb923c','#06b6d4','#d97706']
        const pieces = Array.from({length:22},(_,i)=>({
          left:`${4+i*4.2}%`, color:confettiColors[i%confettiColors.length],
          delay:`${(i*0.09).toFixed(2)}s`, dur:`${2.2+(i%4)*0.3}s`,
          size:i%3===0?10:i%3===1?7:5, rot:i%2===0?1:-1
        }))
        return (
          <div style={{ position:'fixed',inset:0,zIndex:10000,display:'flex',alignItems:'center',justifyContent:'center',
            background:'rgba(0,0,0,.72)', backdropFilter:'blur(6px)' }}
            onClick={()=>setCelebration(null)}>
            {/* Confetti */}
            <style>{`
              @keyframes fallConfetti {
                0%   { transform: translateY(-20px) rotate(0deg) scaleX(1); opacity:1 }
                50%  { scaleX: 0.6 }
                100% { transform: translateY(105vh) rotate(720deg) scaleX(0.4); opacity:0 }
              }
            `}</style>
            {pieces.map((p,i)=>(
              <div key={i} style={{ position:'fixed', top:0, left:p.left,
                width:p.size, height:p.size*2.4, background:p.color, borderRadius:2,
                animation:`fallConfetti ${p.dur} ${p.delay} ease-in forwards`, pointerEvents:'none',
                transform:`rotate(${p.rot*35}deg)` }}/>
            ))}
            {/* Card */}
            <div style={{ background:'var(--surface)', border:'1px solid rgba(255,255,255,.1)', borderRadius:20,
              padding:'42px 52px', textAlign:'center', maxWidth:400, width:'90%', position:'relative',
              boxShadow:'0 30px 80px rgba(0,0,0,.5)' }}
              onClick={e=>e.stopPropagation()}>
              <div style={{ fontSize:52, marginBottom:8 }}>🎉</div>
              <div className="serif" style={{ fontSize:28, fontWeight:700, color:'var(--text)', marginBottom:4 }}>
                Deal Closed!
              </div>
              {celebration.address && (
                <div style={{ fontSize:13, color:'var(--muted)', marginBottom:20, fontStyle:'italic' }}>
                  {celebration.address}
                </div>
              )}
              {celebration.commission && (
                <div style={{ fontSize:36, fontWeight:800, color:'#10b981', marginBottom:6,
                  fontFamily:"'Fraunces',serif" }}>
                  💰 {celebration.commission}
                </div>
              )}
              <div style={{ fontSize:13, color:'var(--text2)', marginBottom:4 }}>
                Commission earned
              </div>
              {ytd > 0 && (
                <div style={{ marginTop:14, padding:'10px 18px', background:'rgba(16,185,129,.08)',
                  border:'1px solid rgba(16,185,129,.2)', borderRadius:10, fontSize:13, color:'#10b981' }}>
                  📈 {year} Total Commission: <strong>${ytd.toLocaleString()}</strong>
                </div>
              )}
              <div style={{ marginTop:16, fontSize:18, fontWeight:700, color:'#f59e0b',
                fontFamily:"'Fraunces',serif", letterSpacing:.5 }}>
                ✨ +300 XP
              </div>
              <button onClick={()=>setCelebration(null)} style={{ marginTop:24, padding:'11px 32px',
                background:'#10b981', border:'none', color:'#fff', borderRadius:10,
                fontWeight:700, fontSize:14, cursor:'pointer', letterSpacing:.3 }}>
                🚀 Keep Going!
              </button>
            </div>
          </div>
        )
      })()}

      {/* ── Nav ─────────────────────────────────────────────── */}
      <nav className="topnav">
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <button style={{ background:'none', border:'none', cursor:'pointer', padding:0 }} onClick={()=>setPage('dashboard')}><Wordmark light/></button>
          <span className="mob-hide" style={{ width:1, height:20, background:'rgba(255,255,255,.1)', display:'block', flexShrink:0 }}/>
          <span className="mob-hide" style={{ fontSize:10, color:'var(--nav-sub)', fontFamily:"'JetBrains Mono',monospace",
            letterSpacing:.5 }}>{MONTH_YEAR}</span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:7 }}>
          <ThemeToggle theme={theme} onToggle={onToggleTheme}/>

          {/* Board + Teams — hidden on mobile */}
          <span className="mob-hide" style={{ width:1, height:18, background:'rgba(255,255,255,.08)', display:'block' }}/>
          <button className={`nav-btn mob-hide${page==='teams'?' active':''}`} onClick={()=>setPage('teams')}>👥 Teams</button>

          <button className={`nav-btn mob-hide${(page==='directory'||page==='apod'||page==='ai-assistant')?' active':''}`} onClick={()=>setPage('directory')}>🔗 Tools</button>

          {/* Rank + Streak chips — hidden on mobile */}
          <span className="mob-hide" style={{ width:1, height:18, background:'rgba(255,255,255,.08)', display:'block' }}/>
          <div className="mob-hide" style={{ background:'rgba(255,255,255,.06)', border:`1px solid ${rank.color}38`,
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

          <div className="mob-hide" style={{ background:'rgba(255,255,255,.06)', border:'1px solid rgba(255,165,0,.18)',
            borderRadius:9, padding:'5px 11px', textAlign:'center' }}>
            <div style={{ fontSize:9, color:'var(--nav-sub)', letterSpacing:.8, lineHeight:1 }}>STREAK</div>
            <div className="serif" style={{ fontSize:15, color:'#fb923c', lineHeight:1.2 }}>🔥 {streak}</div>
          </div>

          {(() => { const pb = getPlanBadge(profile, user?.id); return (
            <button className={`nav-btn mob-hide${page==='billing'?' active':''}`} onClick={()=>setPage('billing')}
              style={{ fontSize:11, fontWeight:700, color:pb.color, letterSpacing:.4 }}>
              {pb.label}
            </button>
          ) })()}
          <button className={`nav-btn${page==='profile'?' active':''}`} onClick={()=>setPage('profile')}>
            {profile?.full_name?.split(' ')[0]||'Profile'}
          </button>
          <button className="btn-ghost mob-hide" style={{ background:'transparent', border:'1px solid rgba(255,255,255,.09)', color:'var(--nav-sub)', fontSize:12 }}
            onClick={()=>supabase.auth.signOut()}>Sign out</button>
          {/* Hamburger — mobile only */}
          <button className="nav-btn mob-show" onClick={()=>setMenuOpen(o=>!o)}
            style={{ fontSize:16, padding:'7px 11px', lineHeight:1 }}>
            {menuOpen ? '✕' : '☰'}
          </button>
        </div>
      </nav>

      {/* Mobile menu backdrop */}
      {menuOpen && (
        <div style={{ position:'fixed', inset:0, zIndex:198 }}
          onClick={()=>setMenuOpen(false)}/>
      )}

      {/* Mobile dropdown menu */}
      {menuOpen && (
        <div style={{
          position:'fixed', top:52, left:0, right:0, zIndex:199,
          background:'var(--nav-bg)', borderBottom:'1px solid rgba(255,255,255,.08)',
          display:'flex', flexDirection:'column', padding:'8px 10px 14px',
          boxShadow:'0 8px 24px rgba(0,0,0,.4)'
        }}>
          {[
            { p:'dashboard', icon:'🏠', label:'Home' },
            { p:'teams',     icon:'👥', label:'Teams' },
            { p:'directory', icon:'🔗', label:'Tools' },
            { p:'billing',   icon:'💳', label:'Billing' },
            { p:'profile',   icon:'👤', label:'Profile' },
          ].map(({p, icon, label})=>(
            <button key={p} onClick={()=>{ setPage(p); setMenuOpen(false) }} style={{
              display:'flex', alignItems:'center', gap:12,
              background: page===p ? 'var(--gold4)' : 'transparent',
              border: page===p ? '1px solid rgba(217,119,6,.3)' : '1px solid transparent',
              color: page===p ? 'var(--gold2)' : 'var(--nav-text)',
              borderRadius:9, padding:'12px 14px', cursor:'pointer',
              fontSize:14, fontWeight: page===p ? 700 : 400,
              textAlign:'left', width:'100%',
            }}>
              <span style={{ fontSize:16 }}>{icon}</span> {label}
            </button>
          ))}
          <div style={{ height:1, background:'rgba(255,255,255,.07)', margin:'8px 0' }}/>
          <button onClick={()=>{ setMenuOpen(false); supabase.auth.signOut() }} style={{
            display:'flex', alignItems:'center', gap:12,
            background:'transparent', border:'1px solid transparent',
            color:'rgba(255,255,255,.4)', borderRadius:9, padding:'10px 14px',
            cursor:'pointer', fontSize:13, textAlign:'left', width:'100%',
          }}>
            <span>🚪</span> Sign Out
          </button>
        </div>
      )}

      {/* ── Force Password Modal for Invited Users ── */}
      {needsPassword && (
        <div style={{ position:'fixed', inset:0, zIndex:9999, background:'rgba(0,0,0,.55)',
          display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div style={{ background:'var(--surface)', border:'1px solid var(--b2)', borderRadius:16,
            padding:'32px 28px', maxWidth:400, width:'100%', boxShadow:'0 12px 48px rgba(0,0,0,.3)' }}>
            <div style={{ textAlign:'center', marginBottom:20 }}>
              <div style={{ fontSize:28, marginBottom:8 }}>🔐</div>
              <div className="serif" style={{ fontSize:20, fontWeight:700, color:'var(--text)' }}>Set Your Password</div>
              <div style={{ fontSize:13, color:'var(--muted)', marginTop:6, lineHeight:1.5 }}>
                Create a password so you can sign in anytime.
              </div>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <input type="password" value={newPw} onChange={e=>setNewPw(e.target.value)}
                placeholder="Password (min 6 characters)" className="field-input"
                style={{ padding:'12px 14px', fontSize:14 }}/>
              <input type="password" value={pwConfirm} onChange={e=>setPwConfirm(e.target.value)}
                placeholder="Confirm password" className="field-input"
                onKeyDown={e => e.key === 'Enter' && handleSetPassword()}
                style={{ padding:'12px 14px', fontSize:14 }}/>
              {pwError && <div style={{ fontSize:12, color:'var(--red)', padding:'4px 0' }}>{pwError}</div>}
              <button onClick={handleSetPassword} disabled={pwSaving || newPw.length < 6}
                className="btn-primary" style={{ padding:'12px', fontSize:14, fontWeight:700, marginTop:4 }}>
                {pwSaving ? 'Saving…' : 'Set Password'}
              </button>
            </div>
          </div>
        </div>
      )}

      {page==='teams'     && <ErrorBoundary key="teams" onReset={()=>setPage('dashboard')}><TeamsPage     onNavigate={setPage} theme={theme} onToggleTheme={onToggleTheme}/></ErrorBoundary>}
      {page==='billing'   && <ErrorBoundary key="billing" onReset={()=>setPage('dashboard')}><BillingPage   onNavigate={setPage} theme={theme} onToggleTheme={onToggleTheme}/></ErrorBoundary>}
      {page==='profile'   && <ErrorBoundary key="profile" onReset={()=>setPage('dashboard')}><ProfilePage   onNavigate={setPage} theme={theme} onToggleTheme={onToggleTheme}
                                             onTaskDeleted={syncTaskDeleted} onTaskRestored={syncTaskRestored}/></ErrorBoundary>}
      {page==='directory' && <ErrorBoundary key="directory" onReset={()=>setPage('dashboard')}><DirectoryPage onNavigate={setPage} theme={theme} onToggleTheme={onToggleTheme}/></ErrorBoundary>}
      {page==='apod'      && <ErrorBoundary key="apod" onReset={()=>setPage('dashboard')}><APODPage      onNavigate={setPage} theme={theme} onToggleTheme={onToggleTheme}/></ErrorBoundary>}
      {/* AI Assistant now handled by floating widget — see useEffect redirect below */}

      {page==='dashboard' && (
      <ErrorBoundary key="dashboard" onReset={()=>window.location.reload()}>
      {dbLoading ? <Loader/> : (
      <div className="page-inner">

        {/* ── Hero Header ─────────────────────────────────────── */}
        <div className="card" style={{
          padding:'24px 28px', marginBottom:22,
          background:`linear-gradient(135deg, ${rank.color}0b 0%, var(--surface) 55%)`,
          borderLeft:`3px solid ${rank.color}`,
          display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:16,
        }}>
          <div>
            <div style={{ fontSize:10, color:'var(--muted)', fontFamily:"'JetBrains Mono',monospace",
              letterSpacing:.7, textTransform:'uppercase', marginBottom:6 }}>
              {timeGreeting}, {profile?.full_name?.split(' ')[0]||'Agent'} · {dateStr.split(',').slice(1).join(',').trim()}
            </div>
            <div className="serif" style={{ fontSize:42, color:'var(--text)', lineHeight:1, letterSpacing:'-.02em', fontWeight:600, marginBottom:12 }}>
              {dateStr.split(',')[0]}<span style={{ color:rank.color }}>.</span>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
              <div style={{ display:'flex', alignItems:'center', gap:7, padding:'4px 10px 4px 5px',
                background:`${rank.color}12`, border:`1px solid ${rank.color}28`, borderRadius:20 }}>
                <div style={{ width:20, height:20, borderRadius:'50%',
                  background:`linear-gradient(135deg, ${rank.color}, ${rank.color}88)`,
                  display:'flex', alignItems:'center', justifyContent:'center', fontSize:11 }}>{rank.icon}</div>
                <span style={{ fontSize:11, fontWeight:700, color:rank.color,
                  fontFamily:"'JetBrains Mono',monospace" }}>{rank.name} · {xp.toLocaleString()} XP</span>
              </div>
              {streak > 0 && (
                <div style={{ display:'flex', alignItems:'center', gap:5, padding:'4px 10px',
                  background:'rgba(251,146,60,.1)', border:'1px solid rgba(251,146,60,.25)', borderRadius:20 }}>
                  <span style={{ fontSize:12 }}>🔥</span>
                  <span style={{ fontSize:11, fontWeight:700, color:'#fb923c',
                    fontFamily:"'JetBrains Mono',monospace" }}>{streak}-day streak</span>
                </div>
              )}
            </div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:18, flexShrink:0 }}>
            <div className="serif mob-hide" style={{ fontStyle:'italic', fontSize:13, color:'var(--dim)',
              maxWidth:220, textAlign:'right', lineHeight:1.75 }}>
              "{quote}"
            </div>
            <Ring pct={todayPct} size={80} sw={6}
              color={todayPct>=80?'#10b981':todayPct>=50?'#d97706':'#dc2626'}/>
          </div>
        </div>

        {/* ── Stats row ──────────────────────────────────────── */}
        <div className="stat-grid" style={{ marginBottom:18 }}>
          <StatCard icon="⚡" label="Today" value={`${todayPct}%`}
            color={todayPct>=80?'var(--green)':todayPct>=50?'var(--gold)':'var(--red)'}
            sub={`${todayChecks}/${viewBuiltInActive.length} habits`}
            accent={todayPct>=80?'#10b981':todayPct>=50?'#d97706':'#dc2626'}/>
          <StatCard icon="📅" label="Month"        value={`${monthPct}%`}   color="var(--gold)"  sub={`${totalHabitChecks} checks`}/>
          <StatCard icon="📞" label="Calls"         value={totalProspecting} color="var(--gold)"
            sub={goals?.prospecting ? `${totalProspecting}/${goals.prospecting} goal` : 'this month'}
            accent={goals?.prospecting && totalProspecting>=goals.prospecting ? '#10b981' : undefined}/>
          <StatCard icon="📅" label="Appointments" value={totalAppts}        color="var(--green)"
            sub={goals?.appointments ? `${totalAppts}/${goals.appointments} goal` : 'this month'}
            accent={goals?.appointments && totalAppts>=goals.appointments ? '#10b981' : undefined}/>
          <StatCard icon="🔑" label="Showings"      value={totalShowings}    color="var(--blue)"
            sub={goals?.showing ? `${totalShowings}/${goals.showing} goal` : undefined}
            accent={goals?.showing && totalShowings>=goals.showing ? '#3b82f6' : undefined}/>
          <StatCard icon="🏡" label="Listed"        value={totalListings}         color="var(--purple)"/>
          <StatCard icon="🤝" label="Buyer Reps"   value={totalBuyerReps}        color="var(--blue)"/>
          <StatCard icon="📤" label="Offers Made"   value={offersMade.length}     color="var(--blue)"/>
          <StatCard icon="📥" label="Offers Rec'd"  value={offersReceived.length} color="var(--purple)"/>
          <StatCard icon="⏳" label="Went Pending"  value={wentPendingCount}      color="var(--gold2)"/>
          <StatCard icon="🎉" label="Closed"         value={closedDeals.length}    color="var(--green)"
            sub={goals?.closed ? `${closedDeals.length}/${goals.closed} goal${closedVol>0?' · '+fmtMoney(closedVol):''}` : closedVol>0?fmtMoney(closedVol):null}
            accent={goals?.closed && closedDeals.length>=goals.closed ? '#10b981' : undefined}/>
          {showCommSummary && closedComm>0 && <StatCard icon="💰" label="Commission" value={fmtMoney(closedComm)||'$0'} color="var(--green)" accent="#10b981"/>}
        </div>

        {/* ── Tabs ──────────────────────────────────────────── */}
        <div className="tabs">
          {[{id:'today',l:'Today'},{id:'weekly',l:'Week View'}].map(t=>(
            <button key={t.id} className={`tab-item${tab===t.id?' on':''}`} onClick={()=>setTab(t.id)}>{t.l}</button>
          ))}
        </div>

        {/* ══ TODAY ══════════════════════════════════════════ */}
        {tab==='today' && (
          <>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
            <div style={{ fontSize:12, color:'var(--muted)' }}>
              {todayXp > 0 && <span style={{ fontFamily:"'JetBrains Mono',monospace", color:'var(--gold)', fontWeight:700 }}>+{todayXp.toLocaleString()} XP</span>} {todayXp > 0 ? (isViewingToday ? 'earned today' : `earned ${FULL_DAYS[viewDayIdx]}`) : ''}
            </div>
            <button className="btn-outline" onClick={() => setShowPrint(true)}
              style={{ fontSize:12, display:'flex', alignItems:'center', gap:5, padding:'7px 14px' }}>
              🖨️ Print {isViewingToday ? 'Daily' : FULL_DAYS[viewDayIdx]} Sheet
            </button>
          </div>

          {/* ── Day Navigator ── */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:12, marginBottom:16,
            padding:'10px 16px', background:'var(--surface)', border:'1px solid var(--b2)', borderRadius:10 }}>
            {!isViewingToday && (
              <button onClick={() => setViewDayOffset(0)}
                style={{ background:'rgba(59,130,246,.1)', color:'#3b82f6', border:'1px solid rgba(59,130,246,.3)',
                  borderRadius:6, fontSize:11, fontWeight:600, padding:'5px 12px', cursor:'pointer',
                  transition:'all .15s' }}>Today</button>
            )}
            <button onClick={() => setViewDayOffset(o => o - 1)} disabled={!canGoBack}
              style={{ background:'none', border:'1px solid var(--b2)', borderRadius:6, cursor:canGoBack?'pointer':'default',
                color:canGoBack?'var(--text)':'var(--dim)', fontSize:14, padding:'4px 10px', opacity:canGoBack?1:.4,
                transition:'all .15s' }}>◀</button>
            <div style={{ textAlign:'center', minWidth:180 }}>
              <div style={{ fontSize:14, fontWeight:600, color:'var(--text)', letterSpacing:'-.01em' }}>
                {FULL_DAYS[viewDayIdx]}, {viewDate.toLocaleDateString('en-US', { month:'long', day:'numeric' })}
              </div>
              {!isViewingToday && (
                <div style={{ fontSize:10, color:'var(--muted)', marginTop:2 }}>Week {viewWeek + 1}</div>
              )}
            </div>
            <button onClick={() => setViewDayOffset(o => o + 1)} disabled={!canGoForward}
              style={{ background:'none', border:'1px solid var(--b2)', borderRadius:6, cursor:canGoForward?'pointer':'default',
                color:canGoForward?'var(--text)':'var(--dim)', fontSize:14, padding:'4px 10px', opacity:canGoForward?1:.4,
                transition:'all .15s' }}>▶</button>
          </div>

          {/* ── Daily Standup (team members only, not owner) ── */}
          {isOnTeam && !isTeamOwner && (
            <div className="card" style={{ padding:20, marginBottom:20,
              borderLeft: standupDone ? '3px solid var(--green)' : '3px solid var(--gold2)' }}>
              {standupDone ? (
                <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                  <span style={{ fontSize:22 }}>✅</span>
                  <div>
                    <div style={{ fontSize:14, fontWeight:600, color:'var(--text)' }}>Daily standup submitted</div>
                    <div style={{ fontSize:12, color:'var(--muted)' }}>Your team leader can see your update</div>
                  </div>
                  <button className="btn-outline" style={{ marginLeft:'auto', fontSize:11 }}
                    onClick={()=>setStandupDone(false)}>Edit</button>
                </div>
              ) : (
                <div>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14 }}>
                    <span style={{ fontSize:16 }}>⚡</span>
                    <div className="serif" style={{ fontSize:16, color:'var(--text)', fontWeight:600 }}>Daily Standup</div>
                    <span style={{ fontSize:11, color:'var(--muted)', marginLeft:'auto' }}>~60 sec</span>
                  </div>
                  {[
                    { key:'q1', label:'What did you accomplish yesterday?',  placeholder:'Logged 15 calls, booked 2 appointments…' },
                    { key:'q2', label:"What's your #1 priority today?",      placeholder:'Follow up with the Hendersons, prospect 1 hr…' },
                    { key:'q3', label:'Anything blocking you? (optional)',   placeholder:'Nothing — or describe what\'s in the way…' },
                  ].map(({key,label,placeholder}) => (
                    <div key={key} style={{ marginBottom:10 }}>
                      <div className="label" style={{ marginBottom:4 }}>{label}</div>
                      <textarea className="field-input" value={standup[key]}
                        onChange={e=>setStandup(s=>({...s,[key]:e.target.value}))}
                        placeholder={placeholder} rows={2}
                        style={{ width:'100%', resize:'none', fontSize:13 }}/>
                    </div>
                  ))}
                  <button className="btn-primary" onClick={submitStandup}
                    disabled={standupSaving || !standup.q1.trim() || !standup.q2.trim()}
                    style={{ fontSize:13, padding:'9px 24px' }}>
                    {standupSaving ? 'Submitting…' : 'Submit Standup'}
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="today-grid">

            {/* Habits checklist */}
            <div className="card" style={{ padding:24, borderTop:`2.5px solid ${isViewingToday ? (todayPct>=80?'#10b981':todayPct>=50?'#d97706':'#dc2626') : '#3b82f6'}` }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
                <div>
                  <div className="serif" style={{ fontSize:20, color:'var(--text)', marginBottom:3, letterSpacing:'-.015em' }}>
                    {isViewingToday ? 'Daily Habits' : `${FULL_DAYS[viewDayIdx]} Habits`}
                  </div>
                  <div style={{ fontSize:12, color:'var(--muted)' }}>
                    {FULL_DAYS[viewDayIdx]} · {viewBuiltInActive.length - todayChecks > 0 ? `${viewBuiltInActive.length - todayChecks} remaining` : 'All done! 🎉'}
                  </div>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                  <div style={{ textAlign:'right' }}>
                    <div className="serif" style={{ fontSize:24, color: todayPct>=80?'#10b981':todayPct>=50?'#d97706':'#dc2626', lineHeight:1, fontWeight:700, letterSpacing:'-.02em' }}>
                      {todayChecks}<span style={{ fontSize:14, color:'var(--dim)', fontWeight:400 }}>/{viewBuiltInActive.length}</span>
                    </div>
                    <div style={{ fontSize:10, color:'var(--muted)', marginTop:2 }}>completed</div>
                  </div>
                  <Ring pct={todayPct} size={58} color={todayPct>=80?'#10b981':todayPct>=50?'#d97706':'#dc2626'} sw={5}/>
                </div>
              </div>

              {/* ── Unified task list: built-ins + custom defaults (ordered) ── */}
              <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
                {effectiveView.map(h => {
                  if (h.isBuiltIn) {
                    const done = habits[h.id][viewWeek]?.[viewDayIdx]
                    const cs   = CAT[h.cat]
                    const ckey = `${h.id}-${viewWeek}-${viewDayIdx}`
                    const cnt  = counters[ckey]||0
                    return (
                      <div key={h.id} className={`habit-row${done?' done':''}`}>
                        <button className="chk" onClick={()=>toggleHabit(h.id,viewWeek,viewDayIdx)}
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
                            +{h.xp} XP{h.xpEach?` · +${h.xpEach} per ${h.unit||'extra'}`:''}
                          </div>
                        </div>
                        <span style={{ fontSize:9, padding:'2px 7px', borderRadius:4, fontWeight:500, flexShrink:0,
                          background:cs.light, color:cs.color, border:`1px solid ${cs.border}` }}>
                          {h.cat}
                        </span>
                        {h.counter && done && (
                          <div style={{ display:'flex', alignItems:'center', gap:5, flexShrink:0 }}>
                            <input
                              type="number" min="1"
                              value={cnt || 1}
                              onChange={e => {
                                const v = Math.max(1, parseInt(e.target.value)||1)
                                setCounters(prev=>({...prev,[ckey]:v}))
                              }}
                              onBlur={e => setCounterValue(h.id, viewWeek, viewDayIdx, e.target.value)}
                              style={{
                                width:48, textAlign:'center', background:'var(--bg2)',
                                border:`1px solid ${cs.color}55`, borderRadius:6,
                                color:cs.color, fontWeight:700, fontSize:14,
                                padding:'3px 6px', fontFamily:"'JetBrains Mono',monospace",
                                WebkitAppearance:'none', MozAppearance:'textfield', outline:'none',
                              }}
                            />
                            <span style={{ fontSize:10, color:'var(--muted)', flexShrink:0 }}>{h.unit||'×'}</span>
                          </div>
                        )}
                        {h.counter && !done && (
                          <span style={{ fontSize:10, color:'var(--dim)', opacity:.45, flexShrink:0 }}>0 {h.unit||'×'}</span>
                        )}
                        {!done && (
                          <button onClick={()=>skipHabitToday(h.id)} title="Skip for today"
                            style={{ background:'none', border:'none', cursor:'pointer', color:'var(--dim)',
                              fontSize:14, padding:'2px 4px', lineHeight:1, flexShrink:0, opacity:.6 }}>✕</button>
                        )}
                      </div>
                    )
                  } else {
                    // Custom default task (in unified order)
                    const ckey = `${h.id}-${viewWeek}-${viewDayIdx}`
                    const done = !!customDone[ckey]
                    return (
                      <div key={h.id} className={`habit-row${done?' done':''}`}>
                        <button className="chk" onClick={()=>toggleCustomTask(h.id,viewWeek,viewDayIdx)}
                          style={done?{background:'rgba(6,182,212,.12)',borderColor:'#06b6d4'}:{}}>
                          {done && (
                            <svg width="11" height="8" viewBox="0 0 11 8" fill="none">
                              <path d="M1 4L4 7L10 1" stroke="#06b6d4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          )}
                        </button>
                        <span style={{ fontSize:15, flexShrink:0 }}>{h.icon}</span>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:13, fontWeight:500, color:done?'var(--muted)':'var(--text)',
                            textDecoration:done?'line-through':'none', transition:'all .15s' }}>{h.label}</div>
                          <div style={{ fontSize:10, color:'var(--dim)' }}>+{h.xp} XP</div>
                        </div>
                        <span style={{ fontSize:9, padding:'2px 7px', borderRadius:4, fontWeight:500, flexShrink:0,
                          background:'rgba(6,182,212,.12)', color:'#06b6d4', border:'1px solid rgba(6,182,212,.22)' }}>
                          custom
                        </span>
                        {!done && (
                          <button onClick={()=>skipCustomTaskToday(h)} title="Skip for today"
                            style={{ background:'none', border:'none', cursor:'pointer', color:'var(--dim)',
                              fontSize:14, padding:'2px 4px', lineHeight:1, flexShrink:0, opacity:.6 }}>✕</button>
                        )}
                      </div>
                    )
                  }
                })}
              </div>

              {/* ── Day-specific tasks (today only) ─────────── */}
              {(()=>{
                const dayTasks = customTasks.filter(t => !t.isDefault && t.specificDate === viewDateStr)
                return (
                  <>
                    {dayTasks.length > 0 && (
                      <div style={{ borderTop:'1px solid var(--b1)', marginTop:14, paddingTop:12,
                        display:'flex', flexDirection:'column', gap:2 }}>
                        <div className="label" style={{ marginBottom:6, fontSize:11 }}>{isViewingToday ? 'Today Only' : `${FULL_DAYS[viewDayIdx]} Only`}</div>
                        {dayTasks.map(t => {
                          const ckey = `${t.id}-${viewWeek}-${viewDayIdx}`
                          const done = !!customDone[ckey]
                          return (
                            <div key={t.id} className={`habit-row${done?' done':''}`}>
                              <button className="chk" onClick={()=>toggleCustomTask(t.id,viewWeek,viewDayIdx)}
                                style={done?{background:'rgba(6,182,212,.12)',borderColor:'#06b6d4'}:{}}>
                                {done && (
                                  <svg width="11" height="8" viewBox="0 0 11 8" fill="none">
                                    <path d="M1 4L4 7L10 1" stroke="#06b6d4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                  </svg>
                                )}
                              </button>
                              <span style={{ fontSize:15, flexShrink:0 }}>{t.icon}</span>
                              <div style={{ flex:1, minWidth:0 }}>
                                <div style={{ fontSize:13, fontWeight:500, color:done?'var(--muted)':'var(--text)',
                                  textDecoration:done?'line-through':'none', transition:'all .15s' }}>{t.label}</div>
                                <div style={{ fontSize:10, color:'var(--dim)' }}>+{t.xp} XP</div>
                              </div>
                              <span style={{ fontSize:9, padding:'2px 7px', borderRadius:4, fontWeight:500, flexShrink:0,
                                background:'rgba(245,158,11,.1)', color:'var(--gold2)', border:'1px solid rgba(245,158,11,.25)' }}>
                                today
                              </span>
                              <button className="btn-del" onClick={()=>deleteCustomTask(t.id)}>✕</button>
                            </div>
                          )
                        })}
                      </div>
                    )}
                    <button className="btn-outline" onClick={()=>setAddTaskModal(true)}
                      style={{ marginTop:12, fontSize:12, width:'100%', justifyContent:'center' }}>
                      + Add task for {isViewingToday ? 'today' : FULL_DAYS[viewDayIdx]}
                    </button>

                    {/* Skipped habits & tasks — restore inline */}
                    {(skippedBuiltInView.length > 0 || skippedTodayTasks.length > 0) && (
                      <div style={{ marginTop:16, paddingTop:14, borderTop:'1px dashed var(--b2)' }}>
                        <div style={{ fontSize:10, color:'var(--dim)', fontWeight:700, letterSpacing:1,
                          marginBottom:8, textTransform:'uppercase' }}>{isViewingToday ? 'Skipped Today' : `Skipped ${FULL_DAYS[viewDayIdx]}`}</div>
                        {skippedBuiltInView.map(h => (
                          <div key={h.id} style={{ display:'flex', alignItems:'center', gap:8,
                            padding:'8px 4px', borderBottom:'1px solid var(--b1)', opacity:.55 }}>
                            <span style={{ fontSize:15, flexShrink:0 }}>{h.icon}</span>
                            <span style={{ flex:1, fontSize:13, color:'var(--muted)',
                              textDecoration:'line-through', minWidth:0 }}>{h.label}</span>
                            <span style={{ fontSize:11, color:'var(--dim)',
                              fontFamily:"'JetBrains Mono',monospace", flexShrink:0 }}>+{h.xp} XP</span>
                            <button className="btn-outline" style={{ fontSize:11, padding:'4px 10px', flexShrink:0 }}
                              onClick={()=>unSkipHabitToday(h.id)}>Restore</button>
                          </div>
                        ))}
                        {skippedTodayTasks.map(t => (
                          <div key={t.id} style={{ display:'flex', alignItems:'center', gap:8,
                            padding:'8px 4px', borderBottom:'1px solid var(--b1)', opacity:.55 }}>
                            <span style={{ fontSize:15, flexShrink:0 }}>{t.icon}</span>
                            <span style={{ flex:1, fontSize:13, color:'var(--muted)',
                              textDecoration:'line-through', minWidth:0 }}>{t.label}</span>
                            <span style={{ fontSize:11, color:'var(--dim)',
                              fontFamily:"'JetBrains Mono',monospace", flexShrink:0 }}>+{t.xp} XP</span>
                            <button className="btn-outline" style={{ fontSize:11, padding:'4px 10px', flexShrink:0 }}
                              onClick={()=>unSkipCustomTaskToday(t)}>Restore</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )
              })()}
            </div>

            {/* Sidebar */}
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              {(() => {
                const ringColor = todayPct>=80?'#10b981':todayPct>=50?'#d97706':'#dc2626'
                return (
              <div className="card" style={{ padding:22, textAlign:'center',
                background:`linear-gradient(180deg, ${ringColor}0d 0%, var(--surface) 65%)`,
                borderTop:`2.5px solid ${ringColor}` }}>
                <Ring pct={todayPct} size={104} color={ringColor} sw={7}/>
                <div className="serif" style={{ marginTop:14, fontSize:16, color:'var(--text)', letterSpacing:'-.01em', fontWeight:600 }}>
                  {todayPct===100?'Perfect day! 🎉':todayPct>=80?'Almost there!':todayPct>=50?'Good progress':'Keep going'}
                </div>
                <div style={{ fontSize:12, color:'var(--muted)', marginTop:4 }}>
                  {viewBuiltInActive.length-todayChecks === 0 ? 'All habits done' : `${viewBuiltInActive.length-todayChecks} habit${viewBuiltInActive.length-todayChecks!==1?'s':''} remaining`}
                </div>
                {streak > 0 && (
                  <div style={{ marginTop:14, padding:'8px 14px', background:'rgba(251,146,60,.08)', border:'1px solid rgba(251,146,60,.2)', borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
                    <span style={{ fontSize:14 }}>🔥</span>
                    <span className="serif" style={{ fontSize:14, color:'#fb923c', fontWeight:600, letterSpacing:'-.01em' }}>{streak}-day streak</span>
                  </div>
                )}
              </div>
                )
              })()}

              {HABITS.filter(h=>h.counter&&habits[h.id][viewWeek]?.[viewDayIdx]).length>0 && (
                <div className="card" style={{ padding:16 }}>
                  <div className="label" style={{ marginBottom:10 }}>{isViewingToday ? "Today's Counts" : `${FULL_DAYS[viewDayIdx]}'s Counts`}</div>
                  {HABITS.filter(h=>h.counter).map(h=>{
                    const ckey = `${h.id}-${viewWeek}-${viewDayIdx}`
                    const cnt  = counters[ckey]||0
                    if (!habits[h.id][viewWeek]?.[viewDayIdx]) return null
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

              <div className="card" style={{ padding:18,
                background:'linear-gradient(160deg, rgba(217,119,6,.13) 0%, var(--gold5) 100%)',
                border:'1px solid var(--gold4)', borderTop:'2.5px solid var(--gold)' }}>
                <div className="label" style={{ marginBottom:8, color:'var(--gold)', textAlign:'center', letterSpacing:.8 }}>Today's XP</div>
                <div className="serif" style={{ fontSize:40, color:'var(--gold2)', fontWeight:700, textAlign:'center', lineHeight:1.05, letterSpacing:'-.025em',
                  textShadow:`0 0 28px rgba(217,119,6,${todayXp>0?.35:0})` }}>
                  {todayXp > 0 ? `+${todayXp.toLocaleString()}` : <span style={{ opacity:.35, fontSize:32 }}>—</span>}
                </div>
                <div style={{ fontSize:11, color:'var(--muted)', marginTop:5, textAlign:'center', fontFamily:"'JetBrains Mono',monospace" }}>
                  {xp.toLocaleString()} XP all-time
                </div>
                {goals?.xp > 0 && (() => {
                  const pct = Math.min(Math.round(xp / goals.xp * 100), 100)
                  return (
                    <div style={{ marginTop:12, padding:'10px 0 4px' }}>
                      <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, color:'var(--muted)', marginBottom:6 }}>
                        <span>Monthly XP Goal</span>
                        <span style={{ color:pct>=100?'#10b981':'var(--gold2)', fontWeight:700 }}>{xp.toLocaleString()} / {goals.xp.toLocaleString()}</span>
                      </div>
                      <div className="progress-track">
                        <div className="progress-fill" style={{ width:`${pct}%`, background:pct>=100?'#10b981':'var(--gold2)' }}/>
                      </div>
                    </div>
                  )
                })()}

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

              {/* ── Personal Records Card ────────────────────── */}
              {(personalRecords.activeDays > 0 || closedDeals.length > 0) && (
                <div className="card" style={{ padding:16, background:'linear-gradient(160deg, rgba(139,92,246,.08) 0%, var(--surface) 100%)', border:'1px solid rgba(139,92,246,.15)', borderTop:'2.5px solid #8b5cf6' }}>
                  <div className="label" style={{ marginBottom:10, color:'#8b5cf6', textAlign:'center', letterSpacing:.8 }}>🏅 Personal Records</div>
                  <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                    {personalRecords.bestDayXp > 0 && (
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'5px 8px', borderRadius:7, background:'rgba(139,92,246,.06)' }}>
                        <span style={{ fontSize:11, color:'var(--text2)' }}>Best Day</span>
                        <span className="mono" style={{ fontSize:13, fontWeight:700, color:'#8b5cf6' }}>+{personalRecords.bestDayXp.toLocaleString()} XP</span>
                      </div>
                    )}
                    {personalRecords.bestWeekXp > 0 && (
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'5px 8px', borderRadius:7, background:'rgba(139,92,246,.06)' }}>
                        <span style={{ fontSize:11, color:'var(--text2)' }}>Best Week</span>
                        <span className="mono" style={{ fontSize:13, fontWeight:700, color:'#8b5cf6' }}>+{personalRecords.bestWeekXp.toLocaleString()} XP</span>
                      </div>
                    )}
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'5px 8px', borderRadius:7, background:'rgba(139,92,246,.06)' }}>
                      <span style={{ fontSize:11, color:'var(--text2)' }}>Perfect Days</span>
                      <span className="mono" style={{ fontSize:13, fontWeight:700, color:personalRecords.perfectDays>0?'#10b981':'var(--muted)' }}>{personalRecords.perfectDays}/{WEEKS*7}</span>
                    </div>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'5px 8px', borderRadius:7, background:'rgba(139,92,246,.06)' }}>
                      <span style={{ fontSize:11, color:'var(--text2)' }}>Active Days</span>
                      <span className="mono" style={{ fontSize:13, fontWeight:700, color:'#8b5cf6' }}>{personalRecords.activeDays}/{WEEKS*7}</span>
                    </div>
                    {closedDeals.length > 0 && (
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'5px 8px', borderRadius:7, background:'rgba(16,185,129,.06)' }}>
                        <span style={{ fontSize:11, color:'var(--text2)' }}>Month GCI</span>
                        <span className="mono" style={{ fontSize:13, fontWeight:700, color:'#10b981' }}>{fmtMoney(closedComm)||'$0'}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
          </>
        )}

        {/* ══ WEEKLY ══════════════════════════════════════════ */}
        {tab==='weekly' && (
          <div>
            {/* ── Month Heatmap ────────────────────────────── */}
            <div className="card" style={{ padding:16, marginBottom:18 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                <span className="label" style={{ letterSpacing:.8 }}>📊 Month Heatmap</span>
                <span style={{ fontSize:10, color:'var(--dim)', fontFamily:"'JetBrains Mono',monospace" }}>
                  {personalRecords.perfectDays} perfect · {personalRecords.activeDays} active
                </span>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'28px repeat(7,1fr)', gap:3, alignItems:'center' }}>
                <div/>
                {DAYS.map(d=><div key={d} style={{ textAlign:'center', fontSize:9, color:'var(--dim)', fontWeight:600 }}>{d}</div>)}
                {weekHeatmap.map((week, wi) => (
                  <React.Fragment key={wi}>
                    <div style={{ fontSize:9, color:'var(--dim)', fontWeight:600, textAlign:'right', paddingRight:4 }}>W{wi+1}</div>
                    {week.map((pct, di) => {
                      const isT = wi === today.week && di === today.day
                      const bg = pct < 0 ? 'var(--b1)' : pct === 0 ? 'rgba(220,38,38,.12)' : pct < 50 ? 'rgba(251,191,36,.2)' : pct < 100 ? 'rgba(16,185,129,.2)' : 'rgba(16,185,129,.45)'
                      return (
                        <div key={di} title={pct>=0?`${pct}% complete`:'No data'} style={{
                          aspectRatio:'1', borderRadius:4, background:bg,
                          border:isT?'2px solid var(--gold)':'1px solid transparent',
                          display:'flex', alignItems:'center', justifyContent:'center',
                          fontSize:8, color:pct>=100?'#fff':pct>=50?'#10b981':'var(--dim)', fontWeight:700,
                        }}>
                          {pct >= 0 ? (pct===100?'★':pct>0?pct:'') : ''}
                        </div>
                      )
                    })}
                  </React.Fragment>
                ))}
              </div>
              <div style={{ display:'flex', gap:12, justifyContent:'center', marginTop:10 }}>
                {[{c:'rgba(220,38,38,.12)',l:'0%'},{c:'rgba(251,191,36,.2)',l:'1-49%'},{c:'rgba(16,185,129,.2)',l:'50-99%'},{c:'rgba(16,185,129,.45)',l:'100%'}].map(({c,l})=>(
                  <div key={l} style={{ display:'flex', alignItems:'center', gap:4 }}>
                    <div style={{ width:10, height:10, borderRadius:2, background:c }}/>
                    <span style={{ fontSize:9, color:'var(--dim)' }}>{l}</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ marginBottom:16, fontSize:13, color:'var(--muted)' }}>
              Week {today.week+1} — ✓ toggle · × remove from day · ↩ restore · + add · 🖨️ print
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(210px,1fr))', gap:12 }}>
              {DAYS.map((dayName,di)=>{
                const wi         = today.week
                const dateStr    = dateStrForDay(wi, di)
                const skipped    = (habitPrefs.skipped||{})[dateStr] || []
                // Active tasks for this day
                const activeBuiltIn  = builtInEffective.filter(h => !skipped.includes(String(h.id)))
                const activeDefaults = customTasks.filter(t => t.isDefault && !skipped.includes(String(t.id)))
                const activeDayTasks = customTasks.filter(t => !t.isDefault && t.specificDate===dateStr)
                // Hidden/removed tasks for this day
                const hiddenBuiltIn  = builtInEffective.filter(h => skipped.includes(String(h.id)))
                const hiddenDefaults = customTasks.filter(t => t.isDefault && skipped.includes(String(t.id)))
                const hiddenDayTasks = plannerDeletedTasks.filter(t => t.specificDate===dateStr)
                const hasHidden      = hiddenBuiltIn.length + hiddenDefaults.length + hiddenDayTasks.length > 0
                // Completion count
                const doneBuiltIn  = activeBuiltIn.filter(h => habits[h.id][wi][di]).length
                const doneDefaults = activeDefaults.filter(t => !!(customDone[`${t.id}-${wi}-${di}`])).length
                const doneDayTasks = activeDayTasks.filter(t => !!(customDone[`${t.id}-${wi}-${di}`])).length
                const totalDone    = doneBuiltIn + doneDefaults + doneDayTasks
                const totalActive  = activeBuiltIn.length + activeDefaults.length + activeDayTasks.length
                const pct          = Math.round(totalDone / Math.max(totalActive, 1) * 100)
                const isToday      = di===today.day
                const dc           = WEEK_COLORS[di%4]
                const isFormOpen   = plannerTaskForm?.wi===wi && plannerTaskForm?.di===di

                return (
                  <div key={di} className="card" style={{
                    padding:16,
                    border: isToday ? `2px solid ${dc}55` : '1px solid var(--b2)',
                    background: isToday ? `color-mix(in srgb, var(--surface) 92%, ${dc})` : 'var(--surface)',
                  }}>
                    {/* Day header */}
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                      <div>
                        <div style={{ fontWeight:700, fontSize:13, color:isToday?dc:'var(--text)' }}>{dayName}</div>
                        {dateStr && <div style={{ fontSize:10, color:'var(--dim)' }}>
                          {new Date(dateStr+'T12:00').toLocaleDateString('en-US',{month:'short',day:'numeric'})}
                        </div>}
                        {isToday && <div style={{ fontSize:9, color:dc, fontWeight:700, letterSpacing:.8 }}>TODAY</div>}
                      </div>
                      <Ring pct={pct} size={42} color={dc} sw={4}/>
                    </div>

                    {/* Built-in habits */}
                    <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
                      {activeBuiltIn.map(h=>{
                        const checked = habits[h.id][wi][di]
                        const cs = CAT[h.cat]
                        return (
                          <div key={h.id} style={{ display:'flex', alignItems:'center', gap:2 }}>
                            <button onClick={()=>toggleHabit(h.id,wi,di)} style={weekRowStyle(checked,cs)}>
                              {weekCheckBox(checked, cs.color)}
                              <span style={{ fontSize:10, flex:1, color:checked?'var(--muted)':'var(--text2)',
                                textDecoration:checked?'line-through':'none' }}>{h.icon} {h.label}</span>
                              <span className="mono" style={{ fontSize:9, color:cs.color }}>+{h.xp}</span>
                            </button>
                            {weekRemoveBtn(()=>dateStr && skipHabitForDate(h.id, dateStr))}
                          </div>
                        )
                      })}
                    </div>

                    {/* Default custom tasks */}
                    {activeDefaults.length > 0 && (
                      <div style={{ marginTop:6, display:'flex', flexDirection:'column', gap:3 }}>
                        {activeDefaults.map(t=>{
                          const checked = !!(customDone[`${t.id}-${wi}-${di}`])
                          const cs = { light:'rgba(6,182,212,.1)', color:'#06b6d4', border:'rgba(6,182,212,.3)' }
                          return (
                            <div key={t.id} style={{ display:'flex', alignItems:'center', gap:2 }}>
                              <button onClick={()=>toggleCustomTask(t.id,wi,di)} style={weekRowStyle(checked,cs)}>
                                {weekCheckBox(checked,'#06b6d4')}
                                <span style={{ fontSize:10, flex:1, color:checked?'var(--muted)':'var(--text2)',
                                  textDecoration:checked?'line-through':'none' }}>{t.icon} {t.label}</span>
                              </button>
                              {weekRemoveBtn(()=>dateStr && skipHabitForDate(t.id, dateStr))}
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {/* Day-specific custom tasks */}
                    {activeDayTasks.length > 0 && (
                      <div style={{ marginTop:6, paddingTop:6, borderTop:'1px solid var(--b1)', display:'flex', flexDirection:'column', gap:3 }}>
                        {activeDayTasks.map(t=>{
                          const checked = !!(customDone[`${t.id}-${wi}-${di}`])
                          const cs = { light:'rgba(139,92,246,.1)', color:'#8b5cf6', border:'rgba(139,92,246,.3)' }
                          return (
                            <div key={t.id} style={{ display:'flex', alignItems:'center', gap:2 }}>
                              <button onClick={()=>toggleCustomTask(t.id,wi,di)} style={weekRowStyle(checked,cs)}>
                                {weekCheckBox(checked,'#8b5cf6')}
                                <span style={{ fontSize:10, flex:1, color:checked?'var(--muted)':'var(--text2)',
                                  textDecoration:checked?'line-through':'none' }}>{t.icon} {t.label}</span>
                              </button>
                              {weekRemoveBtn(()=>deleteDayTask(t))}
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {/* Restore strip — hidden tasks */}
                    {hasHidden && (
                      <div style={{ marginTop:8, padding:'6px 8px', borderRadius:7,
                        background:'var(--bg)', border:'1px solid var(--b1)' }}>
                        <div style={{ fontSize:9, color:'var(--dim)', fontWeight:700,
                          textTransform:'uppercase', letterSpacing:'.5px', marginBottom:5 }}>Hidden this day</div>
                        <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
                          {[...hiddenBuiltIn, ...hiddenDefaults].map(h=>(
                            <div key={h.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:6 }}>
                              <span style={{ fontSize:10, color:'var(--muted)' }}>{h.icon} {h.label}</span>
                              <button onClick={()=>dateStr && unSkipHabitForDate(h.id, dateStr)} style={{
                                fontSize:10, padding:'1px 7px', borderRadius:4, cursor:'pointer',
                                background:'none', border:'1px solid var(--b2)', color:'var(--text2)' }}>↩ Restore</button>
                            </div>
                          ))}
                          {hiddenDayTasks.map(t=>(
                            <div key={t.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:6 }}>
                              <span style={{ fontSize:10, color:'var(--muted)' }}>{t.icon} {t.label}</span>
                              <button onClick={()=>restoreDayTask(t)} style={{
                                fontSize:10, padding:'1px 7px', borderRadius:4, cursor:'pointer',
                                background:'none', border:'1px solid var(--b2)', color:'var(--text2)' }}>↩ Restore</button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Footer */}
                    <div style={{ marginTop:10, display:'flex', justifyContent:'space-between', alignItems:'center',
                      fontSize:10, color:'var(--dim)', borderTop:'1px solid var(--b1)', paddingTop:8 }}>
                      <span style={{ color:dc, fontWeight:600 }}>✓ {totalDone} / {totalActive}</span>
                      <div style={{ display:'flex', gap:5 }}>
                        <button title="Add task to this day"
                          onClick={()=>{ setPlannerTaskForm(isFormOpen?null:{wi,di}); setPlannerForm({label:'',icon:'🏠',xp:15}) }}
                          style={{ background:isFormOpen?dc:'none', color:isFormOpen?'#fff':'var(--text2)',
                            border:`1px solid ${isFormOpen?dc:'var(--b2)'}`, borderRadius:5,
                            cursor:'pointer', fontSize:12, padding:'2px 7px', fontWeight:600 }}>+</button>
                        {dateStr && (
                          <button title="Print this day's sheet"
                            onClick={()=>setPlannerPrint({wi,di,dateStr})}
                            style={{ background:'none', border:'1px solid var(--b2)', borderRadius:5,
                              cursor:'pointer', fontSize:11, padding:'2px 6px', color:'var(--text2)' }}>🖨️</button>
                        )}
                      </div>
                    </div>

                    {/* Inline add-task form */}
                    {isFormOpen && (
                      <div style={{ marginTop:10, padding:'10px 10px 8px', borderRadius:8,
                        background:'var(--bg)', border:'1px solid var(--b2)' }}>
                        <div style={{ fontSize:10, color:'var(--dim)', fontWeight:700,
                          textTransform:'uppercase', letterSpacing:'.5px', marginBottom:6 }}>Add task for {dayName}</div>
                        <input value={plannerForm.label}
                          onChange={e=>setPlannerForm(p=>({...p,label:e.target.value}))}
                          onKeyDown={e=>{ if(e.key==='Enter'&&plannerForm.label.trim()) addTaskForDay(wi,di,plannerForm.label,plannerForm.icon,plannerForm.xp) }}
                          placeholder="Task name…"
                          style={{ width:'100%', padding:'6px 8px', fontSize:12, borderRadius:6,
                            border:'1px solid var(--b2)', background:'var(--surface)', color:'var(--text)',
                            outline:'none', boxSizing:'border-box', marginBottom:6 }}
                          autoFocus/>
                        <div style={{ display:'flex', gap:6 }}>
                          <input value={plannerForm.icon}
                            onChange={e=>setPlannerForm(p=>({...p,icon:e.target.value}))}
                            style={{ width:38, padding:'5px 6px', fontSize:14, borderRadius:6,
                              border:'1px solid var(--b2)', background:'var(--surface)', color:'var(--text)',
                              textAlign:'center', outline:'none' }}/>
                          <input type="number" value={plannerForm.xp}
                            onChange={e=>setPlannerForm(p=>({...p,xp:Number(e.target.value)||0}))}
                            style={{ width:54, padding:'5px 8px', fontSize:12, borderRadius:6,
                              border:'1px solid var(--b2)', background:'var(--surface)', color:'var(--text)', outline:'none' }}
                            placeholder="XP"/>
                          <button className="btn-gold" disabled={!plannerForm.label.trim()}
                            onClick={()=>addTaskForDay(wi,di,plannerForm.label,plannerForm.icon,plannerForm.xp)}
                            style={{ fontSize:12, flex:1, padding:'5px 10px' }}>Add</button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}


        {/* ══ LISTINGS ════════════════════════════════════════ */}
        <div style={{ marginTop:36 }}>
          <div className="section-divider"/>
          <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:14, gap:12, flexWrap:'wrap' }}>
            <div>
              <div style={{ display:'flex', alignItems:'center', gap:9, marginBottom:4 }}>
                <div style={{ width:36, height:36, borderRadius:10, background:'rgba(139,92,246,.1)', border:'1px solid rgba(139,92,246,.25)',
                  display:'flex', alignItems:'center', justifyContent:'center', fontSize:17, flexShrink:0 }}>🏡</div>
                <span className="serif" style={{ fontSize:20, color:'var(--text)', fontWeight:600 }}>Listings</span>
                <span style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:700, fontSize:20, color:'var(--purple)', lineHeight:1 }}>{listings.length}</span>
              </div>
              <div className="section-sub" style={{ marginBottom:0 }}>
                Listings persist across months · <strong>Pending</strong> creates a pipeline entry · <strong>Closed</strong> completes the deal
              </div>
            </div>
            <button onClick={() => setShowWeeklyUpdate(true)} style={{
              background:'rgba(139,92,246,.12)', color:'var(--purple)',
              border:'1px solid rgba(139,92,246,.35)', borderRadius:9,
              padding:'7px 14px', fontSize:12, fontWeight:700, cursor:'pointer',
              display:'flex', alignItems:'center', gap:6, whiteSpace:'nowrap',
              transition:'background .15s, border-color .15s',
              flexShrink:0, alignSelf:'flex-start',
            }}>
              📋 Weekly Update
            </button>
          </div>

          {/* Listing cards — display-first design */}
          <div className="deal-card-grid">
            {listings.length===0 && (
              <div className="card" style={{ textAlign:'center', padding:'32px 20px', color:'var(--dim)', fontSize:13 }}>
                No listings yet — add one below
              </div>
            )}

            {listings.map(l => {
              const isP = String(l.commission||'').trim().endsWith('%')
              const comm = resolveCommission(l.commission, l.price)
              const dom = daysOnMarket(l.createdAt)
              const priceNum = parseFloat(String(l.price||'').replace(/[^0-9.]/g,''))
              const isEditing = editingListing === l.id
              const metaParts = []
              if (l.commission) metaParts.push(isP && comm > 0 ? `${l.commission} = ${fmtMoney(comm)}` : (isP ? l.commission : formatPrice(l.commission)))
              if (dom !== null) metaParts.push(`${dom}d on market`)
              if (l.leadSource) metaParts.push(l.leadSource)
              if (l.monthYear && l.monthYear !== MONTH_YEAR) metaParts.push(fmtMonth(l.monthYear))
              return (
              <div key={l.id} className="deal-card">
                {/* Status — top right */}
                <div className="deal-status">
                  <span className="status-pill-lg" style={{
                    background: l.status==='closed' ? 'rgba(16,185,129,.1)' : l.status==='pending' ? 'rgba(245,158,11,.1)' : 'rgba(139,92,246,.08)',
                    color: l.status==='closed' ? 'var(--green)' : l.status==='pending' ? '#d97706' : 'var(--purple)',
                    border: `1px solid ${l.status==='closed' ? 'rgba(16,185,129,.25)' : l.status==='pending' ? 'rgba(245,158,11,.25)' : 'rgba(139,92,246,.2)'}`,
                  }}>
                    {l.status==='pending' ? 'PENDING' : l.status==='closed' ? 'CLOSED' : 'ACTIVE'}
                  </span>
                </div>

                {/* Address */}
                {isEditing ? (
                  <div className="deal-title">
                    <input value={l.address||''}
                      onChange={e=>updateListingLocal(l.id,'address',e.target.value)}
                      onBlur={e=>updateListing(l.id,'address',e.target.value)} placeholder="Property address…"/>
                  </div>
                ) : (
                  <div className="deal-title" style={{ paddingRight:100 }}>{l.address || 'Untitled listing'}</div>
                )}

                {/* Price */}
                <div className="deal-price">{priceNum > 0 ? formatPrice(l.price) : '—'}</div>

                {/* Metadata line */}
                {metaParts.length > 0 && (
                  <div className="deal-meta-line">
                    {metaParts.map((part, i) => (
                      <span key={i}>{i > 0 && <span className="sep" style={{ display:'inline-block', marginRight:10 }}/>}{part}</span>
                    ))}
                  </div>
                )}

                {/* Edit fields (progressive disclosure) */}
                {isEditing && (
                  <div className="listing-edit-row">
                    <div>
                      <span className="label">Price</span>
                      <input className="field-input" value={l.price||''}
                        onChange={e=>updateListingLocal(l.id,'price',e.target.value)}
                        onBlur={e=>updateListing(l.id,'price',e.target.value)}
                        placeholder="450000"
                        style={{ padding:'8px 12px', marginTop:4, width:'100%', boxSizing:'border-box', color:'var(--gold2)', fontWeight:600, fontFamily:"'JetBrains Mono',monospace" }}/>
                    </div>
                    <div>
                      <span className="label">Commission</span>
                      <div style={{ display:'flex', gap:4, marginTop:4 }}>
                        <input className="field-input"
                          value={isP ? String(l.commission||'').replace(/%$/,'') : (l.commission||'')}
                          onChange={e => updateListingLocal(l.id, 'commission', isP ? e.target.value + '%' : e.target.value)}
                          onBlur={e => updateListing(l.id, 'commission', isP ? e.target.value + '%' : e.target.value)}
                          placeholder={isP ? '3' : '5000'}
                          style={{ padding:'8px 12px', flex:1, minWidth:0, color: isP ? 'var(--muted)' : 'var(--green)', fontWeight:600, fontFamily:"'JetBrains Mono',monospace" }}/>
                        <button onClick={()=>toggleListingCommType(l.id)} style={{
                          background:'var(--bg2)', border:'1px solid var(--b2)', borderRadius:6, cursor:'pointer', padding:'6px 10px',
                          fontSize:10, color:'var(--dim)', fontFamily:"'JetBrains Mono',monospace", fontWeight:600, whiteSpace:'nowrap',
                        }}>{isP ? '$ Flat' : '% Rate'}</button>
                      </div>
                    </div>
                    <div>
                      <span className="label">Lead Source</span>
                      <select className="field-input" value={l.leadSource||''}
                        onChange={e=>updateListing(l.id,'leadSource',e.target.value)}
                        style={{ padding:'8px 12px', marginTop:4, width:'100%', boxSizing:'border-box' }}>
                        <option value="">None</option>
                        {LEAD_SOURCES.map(s=><option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="deal-actions">
                  {l.status !== 'closed' ? (
                    <>
                      <button className="act-btn act-btn-blue" onClick={()=>handleListingOfferReceived(l)}>Offer Rec'd</button>
                      {(l.status==='active' || !l.status) && (
                        <button className="act-btn act-btn-amber" onClick={()=>handleListingStatus(l,'pending')}>→ Pending</button>
                      )}
                      <button className="act-btn act-btn-green" onClick={()=>handleListingStatus(l,'closed')}>✓ Closed</button>
                    </>
                  ) : (
                    <span style={{ fontSize:11, color:'var(--dim)', fontStyle:'italic' }}>Deal completed</span>
                  )}
                  <div style={{ flex:1 }}/>
                  <button className="edit-toggle" title="Generate client update" onClick={()=>setClientUpdateListing(l)}>📋</button>
                  <button className="edit-toggle" title={isEditing ? 'Done editing' : 'Edit listing'} onClick={()=>setEditingListing(isEditing ? null : l.id)}>
                    {isEditing ? '✓' : '✏️'}
                  </button>
                  <button className="edit-toggle" title="Remove listing" onClick={()=>removeListing(l)} style={{ color:'var(--dim)' }}>✕</button>
                </div>
              </div>
              )
            })}
          </div>

          {/* Add listing bar */}
          <div style={{ marginTop:14 }}>
            <div className="add-bar" onClick={() => document.getElementById('add-listing-input')?.focus()}>
              <span style={{ fontSize:16, color:'var(--dim)', flexShrink:0 }}>+</span>
              <input id="add-listing-input" value={newAddr} onChange={e=>setNewAddr(e.target.value)}
                onFocus={()=>setAddListingExpanded(true)}
                onKeyDown={e=>e.key==='Enter'&&addListing()}
                placeholder="Add a new listing address…"/>
              {newAddr.trim() && (
                <button onClick={e=>{e.stopPropagation();addListing()}} className="btn-gold" style={{ flexShrink:0, padding:'6px 14px', whiteSpace:'nowrap' }}>
                  + Add
                </button>
              )}
            </div>
            {addListingExpanded && newAddr.trim() && (
              <div className="add-bar-fields">
                <input className="field-input" value={newPrice} onChange={e=>setNewPrice(e.target.value)}
                  onKeyDown={e=>e.key==='Enter'&&addListing()} placeholder="List price"
                  style={{ padding:'8px 12px', color:'var(--gold2)', fontFamily:"'JetBrains Mono',monospace", fontWeight:600 }}/>
                <input className="field-input" value={newComm} onChange={e=>setNewComm(e.target.value)}
                  onKeyDown={e=>e.key==='Enter'&&addListing()} placeholder="Commission (3%)"
                  style={{ padding:'8px 12px', color:'var(--green)', fontFamily:"'JetBrains Mono',monospace", fontWeight:600 }}/>
                <select className="field-input" value={newLeadSource} onChange={e=>setNewLeadSource(e.target.value)}
                  style={{ padding:'8px 12px' }}>
                  <option value="">Lead source…</option>
                  {LEAD_SOURCES.map(s=><option key={s} value={s}>{s}</option>)}
                </select>
                <button onClick={()=>{setAddListingExpanded(false);setNewAddr('');setNewPrice('');setNewComm('');setNewLeadSource('')}}
                  style={{ background:'none', border:'none', color:'var(--dim)', cursor:'pointer', fontSize:12, fontWeight:600, whiteSpace:'nowrap' }}>Cancel</button>
              </div>
            )}
          </div>
        </div>

        {/* ══ BUYER REP AGREEMENTS ════════════════════════════ */}
        <div style={{ marginTop:36 }}>
          <div className="section-divider"/>
          <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:14, gap:12, flexWrap:'wrap' }}>
            <div>
              <div style={{ display:'flex', alignItems:'center', gap:9, marginBottom:4 }}>
                <div style={{ width:36, height:36, borderRadius:10, background:'rgba(14,165,233,.1)', border:'1px solid rgba(14,165,233,.25)',
                  display:'flex', alignItems:'center', justifyContent:'center', fontSize:17, flexShrink:0 }}>🤝</div>
                <span className="serif" style={{ fontSize:20, color:'var(--text)', fontWeight:600 }}>Buyer Reps</span>
                <span style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:700, fontSize:20, color:'var(--blue)', lineHeight:1 }}>{buyerReps.length}</span>
              </div>
              <div className="section-sub" style={{ marginBottom:0 }}>
                Buyer reps persist across months · <strong>Offer Made</strong> logs to pipeline &amp; awards XP · <strong>Close Rep</strong> marks done
              </div>
            </div>
            <button onClick={() => setShowBuyersUpdate(true)} style={{
              background:'rgba(14,165,233,.1)', color:'var(--blue)',
              border:'1px solid rgba(14,165,233,.3)', borderRadius:9,
              padding:'7px 14px', fontSize:12, fontWeight:700, cursor:'pointer',
              display:'flex', alignItems:'center', gap:6, whiteSpace:'nowrap',
              transition:'background .15s, border-color .15s',
              flexShrink:0, alignSelf:'flex-start',
            }}>
              📋 Weekly Update
            </button>
          </div>

          {/* Buyer Rep cards */}
          <div className="deal-card-grid">
            {buyerReps.length === 0 && (
              <div className="deal-card" style={{ textAlign:'center', padding:'28px 20px', color:'var(--dim)', fontSize:13 }}>
                No buyer rep agreements yet — add one below
              </div>
            )}

            {buyerReps.map(rep => {
              const bd = rep.buyerDetails || {}
              const isExpanded = expandedRep === rep.id
              const isEditingName = editingRep === rep.id
              const hasMetaInfo = bd.preApproval || bd.timeline || bd.locationPrefs
              return (
              <div key={rep.id} className="deal-card">
                {/* Status pill — top-right */}
                <div className="deal-status">
                  <span className="status-pill-lg" style={{
                    background: rep.status==='closed' ? 'rgba(16,185,129,.12)' : 'rgba(14,165,233,.1)',
                    color: rep.status==='closed' ? 'var(--green)' : 'var(--blue)',
                    border: `1px solid ${rep.status==='closed' ? 'rgba(16,185,129,.3)' : 'rgba(14,165,233,.25)'}`,
                  }}>
                    {rep.status === 'closed' ? '✓ CLOSED' : '● ACTIVE'}
                  </span>
                </div>

                {/* Client name — display or edit */}
                <div style={{ display:'flex', alignItems:'center', gap:8, paddingRight:90 }}>
                  <span style={{ fontSize:16, flexShrink:0 }}>👤</span>
                  {isEditingName ? (
                    <input className="deal-title" value={rep.clientName||''}
                      autoFocus
                      onChange={e => updateBuyerRepLocal(rep.id, e.target.value)}
                      onBlur={e => { persistBuyerRep(rep.id, e.target.value); setEditingRep(null) }}
                      onKeyDown={e => e.key === 'Enter' && e.target.blur()}
                      placeholder="Client name…"
                      style={{ background:'none', border:'none', outline:'none', width:'100%', minWidth:0, padding:0,
                        fontFamily:"'Fraunces',serif", borderBottom:'1.5px solid var(--blue)' }}/>
                  ) : (
                    <span className="deal-title" style={{ cursor:'default' }}>
                      {rep.clientName || 'Unnamed client'}
                    </span>
                  )}
                </div>

                {/* Metadata line — pre-approval, timeline, location, month */}
                <div className="deal-meta-line">
                  {bd.preApproval && (
                    <>
                      <span>Pre-approved: <span style={{ color:'var(--blue)', fontWeight:600 }}>{formatPrice(bd.preApproval) || bd.preApproval}</span></span>
                    </>
                  )}
                  {bd.preApproval && bd.timeline && <span className="sep"/>}
                  {bd.timeline && <span>{bd.timeline}</span>}
                  {(bd.preApproval || bd.timeline) && bd.locationPrefs && <span className="sep"/>}
                  {bd.locationPrefs && (
                    <span style={{ maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>📍 {bd.locationPrefs}</span>
                  )}
                  {hasMetaInfo && rep.monthYear && rep.monthYear !== MONTH_YEAR && <span className="sep"/>}
                  {rep.monthYear && rep.monthYear !== MONTH_YEAR && (
                    <span>{fmtMonth(rep.monthYear)}</span>
                  )}
                </div>

                {/* Actions row */}
                <div className="deal-actions">
                  {rep.status !== 'closed' ? (
                    <>
                      <button className="act-btn act-btn-blue"
                        onClick={() => setOfferModal({ repId:rep.id, repName:rep.clientName||'Buyer' })}>
                        📤 Offer Made
                      </button>
                      <button className="act-btn act-btn-amber" onClick={() => closeBuyerRep(rep)}>
                        ✓ Close Rep
                      </button>
                    </>
                  ) : (
                    <span style={{ fontSize:11, color:'var(--dim)', fontStyle:'italic' }}>Agreement closed</span>
                  )}
                  <div style={{ marginLeft:'auto', display:'flex', gap:4, alignItems:'center' }}>
                    <button onClick={() => setExpandedRep(isExpanded ? null : rep.id)}
                      className="edit-toggle" title={isExpanded ? 'Hide details' : 'Show details'}
                      style={ isExpanded ? { background:'var(--blue)', color:'#fff', borderColor:'var(--blue)' } : {}}>
                      {isExpanded ? '▲' : '▼'}
                    </button>
                    <button className="edit-toggle" title="Edit name"
                      onClick={() => setEditingRep(isEditingName ? null : rep.id)}
                      style={ isEditingName ? { background:'var(--bg2)', color:'var(--text)', borderColor:'var(--b2)' } : {}}>
                      ✏️
                    </button>
                    <button className="edit-toggle" title="Remove" onClick={() => removeBuyerRep(rep)}
                      style={{ color:'var(--red)', fontSize:12 }}>✕</button>
                  </div>
                </div>

                {/* ── Expandable Buyer Details Panel ── */}
                {isExpanded && (
                  <div style={{ padding:'14px 16px 16px', background:'var(--bg2)', borderRadius:8,
                    marginTop:10, animation:'slideDown .2s ease', border:'1px solid var(--b1)' }}>

                    {/* Financial */}
                    <div style={{ marginBottom:14 }}>
                      <div className="label" style={{ marginBottom:6, fontSize:10, letterSpacing:'.08em', textTransform:'uppercase', color:'var(--blue)', fontWeight:700 }}>
                        Financial
                      </div>
                      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))', gap:8 }}>
                        <div>
                          <div className="label" style={{ marginBottom:2 }}>Pre-Approval Amount</div>
                          <input className="field-input" value={bd.preApproval||''} placeholder="$450,000"
                            onChange={e => updateBuyerRepDetail(rep.id, 'preApproval', e.target.value)}
                            style={{ padding:'6px 10px', fontSize:12, width:'100%', boxSizing:'border-box' }}/>
                        </div>
                        <div>
                          <div className="label" style={{ marginBottom:2 }}>Payment Range</div>
                          <input className="field-input" value={bd.paymentRange||''} placeholder="$2,800/mo"
                            onChange={e => updateBuyerRepDetail(rep.id, 'paymentRange', e.target.value)}
                            style={{ padding:'6px 10px', fontSize:12, width:'100%', boxSizing:'border-box' }}/>
                        </div>
                        <div>
                          <div className="label" style={{ marginBottom:2 }}>Down Payment</div>
                          <input className="field-input" value={bd.downPayment||''} placeholder="$90,000"
                            onChange={e => updateBuyerRepDetail(rep.id, 'downPayment', e.target.value)}
                            style={{ padding:'6px 10px', fontSize:12, width:'100%', boxSizing:'border-box' }}/>
                        </div>
                      </div>
                    </div>

                    {/* Agreement Dates */}
                    <div style={{ marginBottom:14 }}>
                      <div className="label" style={{ marginBottom:6, fontSize:10, letterSpacing:'.08em', textTransform:'uppercase', color:'var(--gold2)', fontWeight:700 }}>
                        Agreement
                      </div>
                      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))', gap:8 }}>
                        <div>
                          <div className="label" style={{ marginBottom:2 }}>Date Signed</div>
                          <input className="field-input" type="date" value={bd.dateSigned||''}
                            onChange={e => updateBuyerRepDetail(rep.id, 'dateSigned', e.target.value)}
                            style={{ padding:'6px 10px', fontSize:12, width:'100%', boxSizing:'border-box' }}/>
                        </div>
                        <div>
                          <div className="label" style={{ marginBottom:2 }}>Date Expires</div>
                          <input className="field-input" type="date" value={bd.dateExpires||''}
                            onChange={e => updateBuyerRepDetail(rep.id, 'dateExpires', e.target.value)}
                            style={{ padding:'6px 10px', fontSize:12, width:'100%', boxSizing:'border-box' }}/>
                        </div>
                        <div>
                          <div className="label" style={{ marginBottom:2 }}>Last Call</div>
                          <input className="field-input" type="date" value={bd.lastCallDate||''}
                            onChange={e => updateBuyerRepDetail(rep.id, 'lastCallDate', e.target.value)}
                            style={{ padding:'6px 10px', fontSize:12, width:'100%', boxSizing:'border-box' }}/>
                        </div>
                      </div>
                    </div>

                    {/* Search Criteria */}
                    <div style={{ marginBottom:14 }}>
                      <div className="label" style={{ marginBottom:6, fontSize:10, letterSpacing:'.08em', textTransform:'uppercase', color:'var(--green)', fontWeight:700 }}>
                        Search Criteria
                      </div>
                      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))', gap:8 }}>
                        <div>
                          <div className="label" style={{ marginBottom:2 }}>Location Preferences</div>
                          <textarea className="field-input" value={bd.locationPrefs||''} placeholder="North Austin, Round Rock, Cedar Park…"
                            onChange={e => updateBuyerRepDetail(rep.id, 'locationPrefs', e.target.value)}
                            style={{ padding:'6px 10px', fontSize:12, width:'100%', boxSizing:'border-box', minHeight:38, resize:'vertical', fontFamily:'inherit' }}/>
                        </div>
                        <div>
                          <div className="label" style={{ marginBottom:2 }}>Must-Haves</div>
                          <textarea className="field-input" value={bd.mustHaves||''} placeholder="3+ bed, 2+ bath, garage, good schools…"
                            onChange={e => updateBuyerRepDetail(rep.id, 'mustHaves', e.target.value)}
                            style={{ padding:'6px 10px', fontSize:12, width:'100%', boxSizing:'border-box', minHeight:38, resize:'vertical', fontFamily:'inherit' }}/>
                        </div>
                        <div>
                          <div className="label" style={{ marginBottom:2 }}>Nice-to-Haves</div>
                          <textarea className="field-input" value={bd.niceToHaves||''} placeholder="Pool, open floor plan, cul-de-sac…"
                            onChange={e => updateBuyerRepDetail(rep.id, 'niceToHaves', e.target.value)}
                            style={{ padding:'6px 10px', fontSize:12, width:'100%', boxSizing:'border-box', minHeight:38, resize:'vertical', fontFamily:'inherit' }}/>
                        </div>
                        <div>
                          <div className="label" style={{ marginBottom:2 }}>Timeline</div>
                          <select className="field-input" value={bd.timeline||''}
                            onChange={e => updateBuyerRepDetail(rep.id, 'timeline', e.target.value)}
                            style={{ padding:'6px 10px', fontSize:12, width:'100%', boxSizing:'border-box' }}>
                            <option value="">Select…</option>
                            <option value="Urgent">Urgent</option>
                            <option value="1-3 months">1-3 months</option>
                            <option value="3-6 months">3-6 months</option>
                            <option value="6+ months">6+ months</option>
                            <option value="Flexible">Flexible</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* Save button */}
                    <div style={{ display:'flex', justifyContent:'flex-end', paddingTop:10, borderTop:'1px solid var(--b1)' }}>
                      <button onClick={() => saveBuyerRepDetails(rep.id)}
                        disabled={savingRepId === rep.id}
                        style={{
                          background: rep._dirty ? 'var(--blue)' : 'var(--b2)',
                          color: rep._dirty ? '#fff' : 'var(--dim)',
                          border:'none', borderRadius:7, padding:'8px 20px', fontSize:12,
                          fontWeight:700, cursor: rep._dirty ? 'pointer' : 'default',
                          transition:'background .15s, color .15s',
                          display:'flex', alignItems:'center', gap:6,
                        }}>
                        {savingRepId === rep.id ? 'Saving...' : rep._dirty ? 'Save Details' : 'Saved'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
              )
            })}
          </div>

          {/* Add new buyer rep — clean add-bar */}
          <div className="add-bar" style={{ marginTop:14 }} onClick={() => document.getElementById('add-rep-input')?.focus()}>
            <span style={{ color:'var(--dim)', fontSize:16, flexShrink:0 }}>+</span>
            <input id="add-rep-input" value={newRepClient}
              onChange={e => setNewRepClient(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addBuyerRep()}
              placeholder="Add a new buyer rep…"/>
            {newRepClient.trim() && (
              <button onClick={addBuyerRep} className="act-btn act-btn-blue" style={{ flexShrink:0 }}>
                + Add
              </button>
            )}
          </div>
        </div>

        {/* ══ PIPELINE ════════════════════════════════════════ */}
        <div style={{ marginTop:36 }}>
          <div className="section-divider"/>
          <div style={{ display:'flex', alignItems:'center', gap:9, marginBottom:16, flexWrap:'wrap' }}>
            <span style={{ fontSize:20 }}>📊</span>
            <span className="serif" style={{ fontSize:20, color:'var(--text)', fontWeight:600 }}>Transaction Pipeline</span>
            <span style={{ fontSize:11, color:'var(--muted)', paddingLeft:4 }} className="mob-hide">
              Historical counts preserved · Commission is per-deal
            </span>
            <div style={{ marginLeft:'auto', display:'flex', gap:0, border:'1px solid var(--b2)', borderRadius:8, overflow:'hidden' }}>
              {[{v:'list',l:'☰ List'},{v:'board',l:'▦ Board'}].map(v=>(
                <button key={v.v} onClick={()=>setPipelineView(v.v)} style={{
                  padding:'5px 12px', fontSize:11, fontWeight:pipelineView===v.v?700:500, border:'none', cursor:'pointer',
                  background:pipelineView===v.v?'var(--gold2)':'var(--surface)', color:pipelineView===v.v?'#fff':'var(--muted)',
                  transition:'all .15s', fontFamily:'Poppins,sans-serif',
                }}>{v.l}</button>
              ))}
            </div>
          </div>

          {pipelineView === 'list' ? (
            <>
              <PipelineSection title="Offers Made" icon="📤" accentColor="#0ea5e9" xpLabel={PIPELINE_XP.offer_made}
                rows={offersMade} setRows={setOffersMade} userId={user.id}
                onStatusChange={(r,s)=>handleOfferStatus(r,s,setOffersMade)}
                onAdd={handleOfferMadeAdd}
                onRemove={()=>deductPipelineXp('offer_made')}
                statusOpts={[{v:'active',l:'Active'},{v:'pending',l:'Move to Pending'},{v:'closed',l:'Mark Closed'}]}/>

              <PipelineSection title="Offers Received" icon="📥" accentColor="#8b5cf6" xpLabel={PIPELINE_XP.offer_received}
                rows={offersReceived} setRows={setOffersReceived} userId={user.id}
                onStatusChange={(r,s)=>handleOfferStatus(r,s,setOffersReceived)}
                onAdd={handleOfferReceivedAdd}
                onRemove={()=>deductPipelineXp('offer_received')}
                statusOpts={[{v:'active',l:'Active'},{v:'pending',l:'Move to Pending'},{v:'closed',l:'Mark Closed'}]}/>

              <PipelineSection title="Went Pending" icon="⏳" accentColor="#f59e0b" xpLabel={PIPELINE_XP.went_pending}
                rows={pendingDeals} setRows={setPendingDeals} userId={user.id}
                onStatusChange={(r,s)=>handlePendingStatus(r,s)}
                onRemove={()=>deductPipelineXp('went_pending')}
                statusOpts={[{v:'active',l:'Active'},{v:'closed',l:'Mark Closed'}]}/>

              <PipelineSection title="Closed Deals" icon="🎉" accentColor="#10b981" xpLabel={PIPELINE_XP.closed}
                rows={closedDeals} setRows={setClosedDeals} userId={user.id}
                onRemove={()=>deductPipelineXp('closed')}
                showSource={true}/>
            </>
          ) : (
            /* ── Kanban Board View ──────────────────────────── */
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, minHeight:200 }}>
              {[
                { title:'Offers Made', icon:'📤', color:'#0ea5e9', rows:offersMade },
                { title:'Offers Rec\'d', icon:'📥', color:'#8b5cf6', rows:offersReceived },
                { title:'Pending', icon:'⏳', color:'#f59e0b', rows:pendingDeals },
                { title:'Closed', icon:'🎉', color:'#10b981', rows:closedDeals },
              ].map(col => (
                <div key={col.title} style={{ background:'var(--surface)', border:'1px solid var(--b2)', borderRadius:12, overflow:'hidden' }}>
                  <div style={{ padding:'10px 12px', background:`${col.color}11`, borderBottom:`2px solid ${col.color}33`, display:'flex', alignItems:'center', gap:6 }}>
                    <span style={{ fontSize:14 }}>{col.icon}</span>
                    <span style={{ fontSize:12, fontWeight:700, color:'var(--text)' }}>{col.title}</span>
                    <span className="mono" style={{ marginLeft:'auto', fontSize:11, color:col.color, fontWeight:700 }}>{col.rows.length}</span>
                  </div>
                  <div style={{ padding:8, display:'flex', flexDirection:'column', gap:6, maxHeight:400, overflowY:'auto' }}>
                    {col.rows.length === 0 && (
                      <div style={{ padding:'20px 8px', textAlign:'center', fontSize:11, color:'var(--dim)' }}>No entries</div>
                    )}
                    {col.rows.map(r => {
                      const comm = resolveCommission(r.commission, r.price)
                      const pn = parseFloat(String(r.price||'').replace(/[^0-9.]/g,''))
                      return (
                        <div key={r.id} style={{ padding:'10px 12px', borderRadius:8, background:'var(--bg)', border:'1px solid var(--b1)', transition:'box-shadow .15s' }}>
                          <div style={{ fontFamily:"'Fraunces',serif", fontSize:12, fontWeight:600, color:'var(--text)', marginBottom:4, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                            {r.address || 'Untitled'}
                          </div>
                          <div style={{ display:'flex', gap:8, fontSize:10, color:'var(--muted)', alignItems:'center' }}>
                            {pn > 0 && <span style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:600, color:col.color }}>{formatPrice(r.price)}</span>}
                            {comm > 0 && <span style={{ fontFamily:"'JetBrains Mono',monospace", color:'var(--green)', fontWeight:700 }}>{fmtMoney(comm)}</span>}
                          </div>
                          {r.closedFrom && <div style={{ marginTop:4, fontSize:9, color:'var(--dim)' }}>via {r.closedFrom}</div>}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ══ GCI DASHBOARD ═══════════════════════════════════ */}
        {closedDeals.length > 0 && (
          <div style={{ marginTop:36 }}>
            <div className="section-divider"/>
            <div style={{ display:'flex', alignItems:'center', gap:9, marginBottom:16, cursor:'pointer' }}
              onClick={()=>setShowGci(p=>!p)}>
              <span style={{ fontSize:20 }}>💰</span>
              <span className="serif" style={{ fontSize:20, color:'var(--text)', fontWeight:600 }}>GCI Dashboard</span>
              <span style={{ fontSize:11, color:'var(--muted)', paddingLeft:4 }}>{MONTH_YEAR}</span>
              <span style={{ marginLeft:'auto', fontSize:14, color:'var(--muted)', transition:'transform .2s', transform:showGci?'rotate(180deg)':'rotate(0)' }}>▾</span>
            </div>
            {showGci && (
              <div>
                {/* GCI stat cards */}
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))', gap:10, marginBottom:18 }}>
                  <div className="card" style={{ padding:16, textAlign:'center', borderTop:'2.5px solid #10b981' }}>
                    <div style={{ fontSize:10, color:'var(--muted)', letterSpacing:.8, marginBottom:6 }}>TOTAL GCI</div>
                    <div className="serif" style={{ fontSize:28, color:'#10b981', fontWeight:700, letterSpacing:'-.02em' }}>{fmtMoney(closedComm)||'$0'}</div>
                  </div>
                  <div className="card" style={{ padding:16, textAlign:'center', borderTop:'2.5px solid var(--gold)' }}>
                    <div style={{ fontSize:10, color:'var(--muted)', letterSpacing:.8, marginBottom:6 }}>AVG / DEAL</div>
                    <div className="serif" style={{ fontSize:28, color:'var(--gold2)', fontWeight:700, letterSpacing:'-.02em' }}>{fmtMoney(gciStats.avgDeal)||'$0'}</div>
                  </div>
                  <div className="card" style={{ padding:16, textAlign:'center', borderTop:'2.5px solid var(--blue)' }}>
                    <div style={{ fontSize:10, color:'var(--muted)', letterSpacing:.8, marginBottom:6 }}>DEALS CLOSED</div>
                    <div className="serif" style={{ fontSize:28, color:'var(--blue)', fontWeight:700 }}>{closedDeals.length}</div>
                  </div>
                  <div className="card" style={{ padding:16, textAlign:'center', borderTop:'2.5px solid #8b5cf6' }}>
                    <div style={{ fontSize:10, color:'var(--muted)', letterSpacing:.8, marginBottom:6 }}>ANNUAL PACE</div>
                    <div className="serif" style={{ fontSize:28, color:'#8b5cf6', fontWeight:700, letterSpacing:'-.02em' }}>{fmtMoney(gciStats.annualPace)||'$0'}</div>
                  </div>
                </div>
                {/* GCI by source breakdown */}
                {gciStats.bySource.length > 0 && (
                  <div className="card" style={{ padding:18 }}>
                    <div className="label" style={{ marginBottom:12 }}>Commission by Source</div>
                    {gciStats.bySource.map(s => {
                      const pct = closedComm > 0 ? Math.round(s.amount / closedComm * 100) : 0
                      const colors = { Listing:'#10b981', Offers:'#0ea5e9', Pending:'#f59e0b', Direct:'#8b5cf6' }
                      const c = colors[s.name] || '#6b7280'
                      return (
                        <div key={s.name} style={{ marginBottom:10 }}>
                          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                            <span style={{ fontSize:12, color:'var(--text2)', fontWeight:600 }}>{s.name}</span>
                            <span className="mono" style={{ fontSize:12, color:c, fontWeight:700 }}>{fmtMoney(s.amount)} ({pct}%)</span>
                          </div>
                          <div className="progress-track">
                            <div className="progress-fill" style={{ width:`${pct}%`, background:c }}/>
                          </div>
                        </div>
                      )
                    })}
                    {closedVol > 0 && (
                      <div style={{ marginTop:12, paddingTop:10, borderTop:'1px solid var(--b1)', display:'flex', justifyContent:'space-between', fontSize:11, color:'var(--muted)' }}>
                        <span>Total Volume</span>
                        <span className="mono" style={{ fontWeight:700, color:'var(--text)' }}>{fmtMoney(closedVol)}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div style={{ height:48 }}/>
        <div style={{ textAlign:'center', fontSize:10, color:'var(--dim)', fontFamily:"'JetBrains Mono',monospace",
          letterSpacing:2, paddingBottom:24 }}>
          REALTYGRIND · {MONTH_YEAR} · CLOSE MORE EVERY DAY
        </div>

      </div>
      )}
      </ErrorBoundary>
      )}

      {/* ── Offer Modal ─────────────────────────────────── */}
      {offerModal && (
        <OfferModal
          repName={offerModal.repName}
          onSubmit={submitBuyerRepOffer}
          onClose={() => setOfferModal(null)}
        />
      )}

      {/* ── Add Task Modal ───────────────────────────────── */}
      {addTaskModal && (
        <AddTaskModal
          onSubmit={addTaskToday}
          onClose={() => setAddTaskModal(false)}
        />
      )}

      {/* ── Print Daily Modal ────────────────────────────── */}
      {showPrint && (
        <PrintDailyModal
          habits={habits}
          counters={counters}
          today={today}
          todayDate={viewDateStr}
          effectiveToday={effectiveView}
          customTasks={customTasks}
          customDone={customDone}
          offersMade={offersMade}
          offersReceived={offersReceived}
          pendingDeals={pendingDeals}
          closedDeals={closedDeals}
          buyerReps={buyerReps}
          onClose={() => setShowPrint(false)}
          target={isViewingToday ? undefined : { wi: viewWeek, di: viewDayIdx, dateStr: viewDateStr }}
        />
      )}

      {plannerPrint && (() => {
        const printSkipped = (habitPrefs.skipped||{})[plannerPrint.dateStr] || []
        const printEffective = effectiveHabits.filter(h => !printSkipped.includes(String(h.id)))
        const printCustom    = customTasks.filter(t => !t.isDefault || !printSkipped.includes(String(t.id)))
        return (
          <PrintDailyModal
            habits={habits}
            counters={counters}
            today={today}
            todayDate={todayDate}
            effectiveToday={printEffective}
            customTasks={printCustom}
            customDone={customDone}
            offersMade={offersMade}
            offersReceived={offersReceived}
            pendingDeals={pendingDeals}
            closedDeals={closedDeals}
            buyerReps={buyerReps}
            target={plannerPrint}
            onClose={() => setPlannerPrint(null)}
          />
        )
      })()}

      {/* ── Listings Weekly Update Modal ──────────────────── */}
      {showWeeklyUpdate && (
        <ListingsWeeklyModal
          listings={listings}
          offersReceived={offersReceived}
          pendingDeals={pendingDeals}
          closedDeals={closedDeals}
          onClose={() => setShowWeeklyUpdate(false)}
        />
      )}

      {/* ── Buyers Weekly Update Modal ────────────────────── */}
      {showBuyersUpdate && (
        <BuyersWeeklyModal
          buyerReps={buyerReps}
          offersMade={offersMade}
          onClose={() => setShowBuyersUpdate(false)}
        />
      )}

      {/* ── Client Update Modal ──────────────────────────── */}
      {clientUpdateListing && (() => {
        const cl = clientUpdateListing
        const comm = resolveCommission(cl.commission, cl.price)
        const agentName = profile?.full_name || 'Your Agent'
        return (
          <div style={{ position:'fixed', inset:0, zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,.55)' }}
            onClick={()=>setClientUpdateListing(null)}>
            <div onClick={e=>e.stopPropagation()} style={{ background:'#fff', borderRadius:16, width:520, maxWidth:'92vw', maxHeight:'90vh', overflow:'auto', boxShadow:'0 25px 60px rgba(0,0,0,.3)' }}>
              <div style={{ padding:'28px 32px', borderBottom:'1px solid #e5e7eb' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div>
                    <div style={{ fontSize:10, letterSpacing:1.2, color:'#9ca3af', fontWeight:600, marginBottom:4 }}>CLIENT UPDATE</div>
                    <div style={{ fontSize:20, fontWeight:700, color:'#111', fontFamily:"'Fraunces',serif" }}>{cl.address}</div>
                  </div>
                  <span className={`status-pill sp-${cl.status||'active'}`} style={{ fontSize:11 }}>
                    {cl.status==='pending'?'⏳ Pending':cl.status==='closed'?'✓ Closed':'● Active'}
                  </span>
                </div>
              </div>
              <div style={{ padding:'24px 32px', display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
                <div>
                  <div style={{ fontSize:10, color:'#9ca3af', letterSpacing:.8, marginBottom:4 }}>LIST PRICE</div>
                  <div style={{ fontSize:22, fontWeight:700, color:'#111' }}>{formatPrice(cl.price)||'—'}</div>
                </div>
                <div>
                  <div style={{ fontSize:10, color:'#9ca3af', letterSpacing:.8, marginBottom:4 }}>STATUS</div>
                  <div style={{ fontSize:22, fontWeight:700, color:cl.status==='closed'?'#10b981':cl.status==='pending'?'#f59e0b':'#8b5cf6' }}>
                    {cl.status==='closed'?'Closed':cl.status==='pending'?'Pending':'Active'}
                  </div>
                </div>
              </div>
              <div style={{ padding:'16px 32px 28px', display:'flex', justifyContent:'space-between', alignItems:'center', borderTop:'1px solid #f3f4f6' }}>
                <div style={{ fontSize:11, color:'#6b7280' }}>
                  Prepared by <strong style={{ color:'#111' }}>{agentName}</strong> · {new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})}
                </div>
                <div style={{ display:'flex', gap:8 }}>
                  <button onClick={()=>window.print()} style={{
                    background:'#111', color:'#fff', border:'none', borderRadius:8, padding:'8px 18px',
                    fontSize:12, fontWeight:700, cursor:'pointer'
                  }}>🖨️ Print</button>
                  <button onClick={()=>setClientUpdateListing(null)} style={{
                    background:'#f3f4f6', color:'#6b7280', border:'none', borderRadius:8, padding:'8px 18px',
                    fontSize:12, fontWeight:600, cursor:'pointer'
                  }}>Close</button>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Error toast */}
      {toast && (
        <div style={{ position:'fixed', bottom:24, left:'50%', transform:'translateX(-50%)', zIndex:9999,
          background:'#dc2626', color:'#fff', padding:'10px 22px', borderRadius:10,
          fontFamily:'Poppins,sans-serif', fontWeight:600, fontSize:13,
          boxShadow:'0 8px 32px rgba(220,38,38,.35)', display:'flex', alignItems:'center', gap:10,
          animation:'slideDown .25s ease', maxWidth:'90vw' }}>
          <span style={{ flexShrink:0 }}>&#9888;</span>
          <span>{toast.msg}</span>
          <button onClick={() => setToast(null)} style={{ background:'none', border:'none', color:'#fff',
            cursor:'pointer', fontWeight:700, fontSize:15, padding:'0 4px', lineHeight:1, flexShrink:0 }}>&#215;</button>
        </div>
      )}


      {/* ── Floating AI Chat Widget ── */}
      <AIChatWidget
        isOpen={aiWidgetOpen}
        onToggle={() => setAiWidgetOpen(o => !o)}
        onClose={() => setAiWidgetOpen(false)}
        onNavigate={setPage}
        theme={theme}
      />
    </div>
  )
}

// ─── Root ─────────────────────────────────────────────────────────────────────

function AppInner() {
  const { user, loading } = useAuth()
  const [theme,       setTheme]       = useState(()=>localStorage.getItem('rg_theme')||'light')
  const [showAuth,    setShowAuth]    = useState(false)
  const [checkoutMsg, setCheckoutMsg] = useState(null) // 'success' | 'cancelled'
  const [checkoutLoading, setCheckoutLoading] = useState(false)

  const toggleTheme = useCallback(() => {
    setTheme(prev => {
      const next = prev==='light' ? 'dark' : 'light'
      localStorage.setItem('rg_theme', next)
      document.documentElement.setAttribute('data-theme', next)
      return next
    })
  }, [])
  const themeValue = useMemo(() => ({ theme, toggle: toggleTheme }), [theme, toggleTheme])

  useEffect(()=>{
    document.documentElement.setAttribute('data-theme', theme)
  },[theme])

  // Inject global CSS once into <head> instead of re-rendering <style>{CSS}</style> as JSX
  useEffect(() => {
    const id = 'rg-global-css'
    if (!document.getElementById(id)) {
      const s = document.createElement('style')
      s.id = id
      s.textContent = CSS
      document.head.appendChild(s)
    }
  }, [])

  // Handle Stripe return URLs (?checkout=success|cancelled)
  useEffect(()=>{
    const params = new URLSearchParams(window.location.search)
    const status = params.get('checkout')
    if (status) {
      setCheckoutMsg(status)
      window.history.replaceState({}, '', window.location.pathname)
    }
  },[])
  // Auto-clear checkout message with proper cleanup
  useEffect(()=>{
    if (!checkoutMsg) return
    const timer = setTimeout(()=>setCheckoutMsg(null), 6000)
    return ()=>clearTimeout(timer)
  },[checkoutMsg])

  // After sign-in, run any pending checkout
  useEffect(()=>{
    if (!user?.id) return
    const pending = localStorage.getItem('rg_pending_plan')
    if (pending) {
      localStorage.removeItem('rg_pending_plan')
      try {
        const { planId, isAnnual } = JSON.parse(pending)
        if (planId) startCheckout(planId, isAnnual)
      } catch { /* corrupted localStorage — ignore */ }
    }
  },[user?.id])

  async function startCheckout(planId, isAnnual) {
    setCheckoutLoading(true)
    try {
      const { data, error } = await supabase.functions.invoke('create-checkout', {
        body: { planId, isAnnual, returnUrl: window.location.origin },
      })
      if (error) throw error
      if (data?.url) {
        window.location.href = data.url
      } else {
        alert('Could not start checkout. Please try again.')
      }
    } catch (err) {
      console.error('Checkout error:', err)
      alert('Checkout unavailable right now. Please try again shortly.')
    } finally {
      setCheckoutLoading(false)
    }
  }

  function handleSubscribe(planId, isAnnual) {
    if (!user) {
      localStorage.setItem('rg_pending_plan', JSON.stringify({ planId, isAnnual }))
      setShowAuth(true)
      return
    }
    startCheckout(planId, isAnnual)
  }

  if (loading) return (
    <div data-theme={theme} style={{ display:'flex', alignItems:'center', justifyContent:'center',
      height:'100vh', background:'var(--bg)', gap:12 }}>
      <div style={{ width:18, height:18, border:'2px solid var(--gold)', borderTopColor:'transparent',
        borderRadius:'50%', animation:'spin 1s linear infinite' }}/>
      <span className="serif" style={{ fontSize:18, color:'var(--text)' }}>RealtyGrind</span>
    </div>
  )

  if (!user) return (
    <div data-theme={theme}>
      {checkoutLoading && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.6)', zIndex:9999,
          display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:16 }}>
          <div style={{ width:32, height:32, border:'3px solid #d97706', borderTopColor:'transparent',
            borderRadius:'50%', animation:'spin 1s linear infinite' }}/>
          <span style={{ color:'#fff', fontFamily:'Poppins,sans-serif', fontWeight:600 }}>Redirecting to checkout…</span>
        </div>
      )}
      <ErrorBoundary key={showAuth ? 'auth' : 'landing'} onReset={()=>setShowAuth(false)}>
        {showAuth
          ? <AuthPage theme={theme} onToggleTheme={toggleTheme} onBack={()=>setShowAuth(false)}/>
          : <LandingPage theme={theme} onToggleTheme={toggleTheme}
              onGetStarted={()=>setShowAuth(true)}
              onSubscribe={handleSubscribe}/>
        }
      </ErrorBoundary>
    </div>
  )

  return (
    <div data-theme={theme}>
      {/* Stripe checkout return banner */}
      {checkoutMsg === 'success' && (
        <div style={{ position:'fixed', top:16, left:'50%', transform:'translateX(-50%)', zIndex:9999,
          background:'#10b981', color:'#fff', padding:'12px 24px', borderRadius:12,
          fontFamily:'Poppins,sans-serif', fontWeight:700, fontSize:14,
          boxShadow:'0 8px 32px rgba(16,185,129,.4)', display:'flex', alignItems:'center', gap:10 }}>
          🎉 Subscription activated! Welcome to RealtyGrind.
        </div>
      )}
      {checkoutMsg === 'cancelled' && (
        <div style={{ position:'fixed', top:16, left:'50%', transform:'translateX(-50%)', zIndex:9999,
          background:'var(--surface)', border:'1px solid var(--b2)', color:'var(--text)',
          padding:'12px 24px', borderRadius:12, fontFamily:'Poppins,sans-serif', fontWeight:600,
          fontSize:14, boxShadow:'var(--shadow2)', display:'flex', alignItems:'center', gap:10 }}>
          Checkout cancelled — no charge was made.
        </div>
      )}
      <ThemeCtx.Provider value={themeValue}>
        <Dashboard theme={theme} onToggleTheme={toggleTheme}/>
      </ThemeCtx.Provider>
    </div>
  )
}

export default function App() {
  return <AuthProvider><AppInner/></AuthProvider>
}
