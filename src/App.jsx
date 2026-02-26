import { useState, useEffect, createContext, useContext } from 'react'
import { AuthProvider, useAuth } from './lib/AuthContext'
import { supabase } from './lib/supabase'
import AuthPage from './pages/AuthPage'
import TeamsPage from './pages/TeamsPage'
import ProfilePage from './pages/ProfilePage'
import DirectoryPage from './pages/DirectoryPage'
import APODPage from './pages/APODPage'
import { CSS, Ring, StatCard, Wordmark, Loader, ThemeToggle, PageNav, getRank, fmtMoney, RANKS, CAT } from './design'
import { HABITS } from './habits'

// ─── Theme context ─────────────────────────────────────────────────────────────

export const ThemeCtx = createContext({ theme:'light', toggle:()=>{} })
export const useTheme = () => useContext(ThemeCtx)

// ─── Constants ─────────────────────────────────────────────────────────────────

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
      <div className="card" style={{ padding:24, width:'100%', maxWidth:400, animation:'fadeUp .2s ease' }}>
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
      <div className="card" style={{ padding:28, width:'100%', maxWidth:440, animation:'fadeUp .2s ease' }}>
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

function PrintDailyModal({ habits, counters, today, todayDate, customTasks, customDone, offersMade, offersReceived, pendingDeals, closedDeals, buyerReps, onClose }) {
  const dateStr = new Date().toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric' })
  const prospectCount  = counters[`prospecting-${today.week}-${today.day}`]  || 0
  const apptCount      = counters[`appointments-${today.week}-${today.day}`] || 0
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
              {HABITS.map(h => {
                const done = habits[h.id]?.[today.week]?.[today.day]
                const cnt  = h.counter ? (counters[`${h.id}-${today.week}-${today.day}`] || 0) : 0
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
                const ct = (customTasks||[]).filter(t => t.isDefault || t.specificDate === todayDate)
                if (!ct.length) return null
                return (
                  <>
                    <div style={{ borderTop:'1px solid #ccc', margin:'8px 0 6px', paddingTop:6,
                      fontSize:9, fontWeight:700, textTransform:'uppercase', letterSpacing:'.08em', color:'#666' }}>
                      Custom Tasks
                    </div>
                    {ct.map(t => {
                      const done = !!(customDone||{})[`${t.id}-${today.week}-${today.day}`]
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
                        {l.price}
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
                    {l.price && <span style={{ fontSize:11, fontFamily:'monospace', color:'#555' }}>{l.price}</span>}
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
              buyerReps.map(rep => (
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
                  <textarea
                    value={repNotes[rep.id] || ''}
                    onChange={e => setNote(rep.id, e.target.value)}
                    placeholder="Notes — showings attended, offers discussed, financing updates, timeline…"
                    style={{ width:'100%', minHeight:66, background:'var(--bg2)', border:'1px solid var(--b2)',
                      borderRadius:7, color:'var(--text)', fontSize:12, padding:'8px 10px',
                      resize:'vertical', boxSizing:'border-box', fontFamily:'inherit', lineHeight:1.5 }}
                  />
                </div>
              ))
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
              {buyerReps.map((rep, i) => (
                <div key={rep.id} style={{ marginBottom:10, paddingBottom:10,
                  borderBottom: i < buyerReps.length-1 ? '1px solid #e5e5e5' : 'none' }}>
                  <div style={{ display:'flex', alignItems:'baseline', gap:10,
                    marginBottom: repNotes[rep.id] ? 5 : 0 }}>
                    <span style={{ fontSize:11, fontWeight:700, padding:'1px 6px', borderRadius:3,
                      background: rep.status==='closed'?'#dcfce7':'#e0f2fe',
                      color:      rep.status==='closed'?'#15803d':'#0369a1',
                      letterSpacing:'.05em', textTransform:'uppercase' }}>
                      {rep.status==='closed'?'Closed':'Active'}
                    </span>
                    <span style={{ fontSize:13, fontWeight:700, color:'#111' }}>
                      {rep.clientName || '—'}
                    </span>
                  </div>
                  {repNotes[rep.id] && (
                    <div style={{ fontSize:12, color:'#333', lineHeight:1.7, whiteSpace:'pre-wrap',
                      borderLeft:'3px solid #aaa', paddingLeft:10, marginTop:4 }}>
                      {repNotes[rep.id]}
                    </div>
                  )}
                </div>
              ))}
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

  async function persist(id, field, value) {
    if (!id || String(id).startsWith('tmp-')) return
    await supabase.from('transactions').update({ [field]: value }).eq('id', id)
  }

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

      <div className="resp-table"><div className="resp-table-inner">
      {/* Column labels */}
      <div style={{ display:'grid', gridTemplateColumns:cols, gap:8, padding:'3px 13px', marginBottom:5, border:'1px solid transparent' }}>
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
            <input className="pipe-input" value={r.address||''} onChange={e=>update(r.id,'address',e.target.value)}
              onBlur={e=>persist(r.id,'address',e.target.value)} placeholder="Property address…"/>
            <input className="pipe-input" value={r.price||''} onChange={e=>update(r.id,'price',e.target.value)}
              onBlur={e=>persist(r.id,'price',e.target.value)}
              placeholder="$0" style={{ color:accentColor, fontWeight:600, fontFamily:"'JetBrains Mono',monospace" }}/>
            <input className="pipe-input" value={r.commission||''} onChange={e=>update(r.id,'commission',e.target.value)}
              onBlur={e=>persist(r.id,'commission',e.target.value)}
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
      </div></div>{/* /resp-table-inner /resp-table */}
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
  const [celebration,    setCelebration]    = useState(null) // { address, commission, ytdComm }

  // Listings
  const [listings,  setListings]  = useState([])
  const [newAddr,   setNewAddr]   = useState('')
  const [newPrice,  setNewPrice]  = useState('')
  const [newComm,   setNewComm]   = useState('')

  // Buyer Rep Agreements
  const [buyerReps,     setBuyerReps]    = useState([])
  const [newRepClient,  setNewRepClient] = useState('')
  const [offerModal,    setOfferModal]   = useState(null) // null | { repId, repName }

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
  const [addTaskModal,  setAddTaskModal]  = useState(false)
  const todayDate = new Date().toISOString().slice(0,10)

  useEffect(()=>{ loadAll() },[user])

  async function loadAll() {
    if (!user) return
    setDbLoading(true)
    const [habRes, listRes, txRes, profRes, ctRes] = await Promise.all([
      supabase.from('habit_completions').select('*').eq('user_id',user.id).eq('month_year',MONTH_YEAR),
      supabase.from('listings').select('*').eq('user_id',user.id), // no month filter — listings persist until closed
      supabase.from('transactions').select('*').eq('user_id',user.id).eq('month_year',MONTH_YEAR),
      supabase.from('profiles').select('*').eq('id',user.id).single(),
      supabase.from('custom_tasks').select('*').eq('user_id',user.id),
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
      setCustomTasks(ctRes.data.filter(t => !t.is_deleted).map(toTask))
      setDeletedDefaultTasks(ctRes.data.filter(t => t.is_deleted).map(toTask))
    }

    if (listRes.data) {
      const allL = listRes.data
      setListings(allL.filter(l => (l.unit_count ?? 1) !== 0).map(l => ({
        id:l.id, address:l.address, status:l.status||'active',
        price:l.price||'', commission:l.commission||'', monthYear:l.month_year||''
      })))
      setBuyerReps(allL.filter(l => l.unit_count === 0).map(r => ({
        id:r.id, clientName:r.address||'', status:r.status||'active', monthYear:r.month_year||''
      })))
    }

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
      if (profRes.data.habit_prefs) setHabitPrefs(profRes.data.habit_prefs)
      if (profRes.data.goals)       setGoals(profRes.data.goals)
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

  // ── Profile habit prefs (for per-user skip) ────────────────────────────────
  async function saveProfileHabitPrefs(newPrefs) {
    setHabitPrefs(newPrefs)
    await supabase.from('profiles').update({ habit_prefs: newPrefs }).eq('id', user.id)
  }

  function skipHabitToday(hid) {
    const prev = (habitPrefs.skipped||{})[todayDate] || []
    if (prev.includes(String(hid))) return
    const newPrefs = {
      ...habitPrefs,
      skipped: { ...(habitPrefs.skipped||{}), [todayDate]: [...prev, String(hid)] }
    }
    saveProfileHabitPrefs(newPrefs)
  }

  // ── Habits ─────────────────────────────────────────────────────────────────
  async function toggleHabit(hid, week, day) {
    const newVal = !habits[hid][week][day]
    setHabits(prev=>{ const n={...prev}; n[hid]=n[hid].map((w,wi)=>wi===week?w.map((d,di)=>di===day?newVal:d):w); return n })
    // Use effectiveHabits so edited XP/label/icon values take effect
    const hBase = HABITS.find(x=>x.id===hid)
    const hEd   = (activePrefs.edits||{})[hid] || {}
    const h     = { ...hBase, xp: hEd.xp || hBase.xp }
    const cat   = CAT[h.cat]
    if (newVal) {
      await addXp(h.xp, cat.color)
      const ckey = `${hid}-${week}-${day}`
      if (h.counter) setCounters(prev=>({...prev,[ckey]:1}))
      await supabase.from('habit_completions').upsert({
        user_id:user.id, habit_id:hid, week_index:week, day_index:day,
        month_year:MONTH_YEAR, xp_earned:h.xp, counter_value:h.counter?1:0
      },{onConflict:'user_id,habit_id,week_index,day_index,month_year'})
    } else {
      const ckey = `${hid}-${week}-${day}`
      const lost = h.xp + Math.max(0,(counters[ckey]||1)-1)*(h.xpEach||0)
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

  async function setCounterValue(hid, week, day, rawVal) {
    const v     = Math.max(1, parseInt(rawVal) || 1)
    const hBase = HABITS.find(x=>x.id===hid)
    const hEd   = (activePrefs.edits||{})[hid] || {}
    const h     = { ...hBase, xp: hEd.xp || hBase.xp }
    const ckey  = `${hid}-${week}-${day}`
    const oldCnt = counters[ckey] || 1
    setCounters(prev=>({...prev,[ckey]:v}))
    // XP delta: difference in extra-unit XP between old and new count
    const xpDiff = (v - oldCnt) * (h.xpEach || 0)
    if (xpDiff !== 0) {
      const nxp = Math.max(0, xp + xpDiff)
      setXp(nxp)
      await supabase.from('profiles').update({xp:nxp}).eq('id',user.id)
    }
    await supabase.from('habit_completions').upsert({
      user_id:user.id, habit_id:hid, week_index:week, day_index:day,
      month_year:MONTH_YEAR, xp_earned:(h.xp||0)+Math.max(0,v-1)*(h.xpEach||0), counter_value:v
    },{onConflict:'user_id,habit_id,week_index,day_index,month_year'})
  }

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
      await supabase.from('habit_completions').upsert({
        user_id:user.id, habit_id:taskId, week_index:week, day_index:day,
        month_year:MONTH_YEAR, xp_earned:task.xp, counter_value:0
      },{onConflict:'user_id,habit_id,week_index,day_index,month_year'})
    } else {
      const nxp = Math.max(0, xp - task.xp)
      setXp(nxp)
      setXpPop({ val:`-${task.xp} XP`, color:'#dc2626' })
      setTimeout(()=>setXpPop(null), 1400)
      await supabase.from('profiles').update({xp:nxp}).eq('id',user.id)
      await supabase.from('habit_completions').delete()
        .eq('user_id',user.id).eq('habit_id',taskId)
        .eq('week_index',week).eq('day_index',day).eq('month_year',MONTH_YEAR)
    }
  }

  async function addTaskToday(label, icon, xp) {
    const {data} = await supabase.from('custom_tasks').insert({
      user_id:user.id, label, icon, xp:Number(xp)||15,
      is_default:false, specific_date:todayDate
    }).select().single()
    if (data) setCustomTasks(prev => [...prev, {
      id:data.id, label:data.label, icon:data.icon, xp:data.xp,
      isDefault:false, specificDate:data.specific_date
    }])
    setAddTaskModal(false)
  }

  async function deleteCustomTask(id) {
    await supabase.from('custom_tasks').update({ is_deleted: true }).eq('id',id).eq('user_id',user.id)
    const task = customTasks.find(t => t.id === id)
    setCustomTasks(prev => prev.filter(t => t.id !== id))
    if (task) setDeletedDefaultTasks(prev => [...prev, { ...task }])
  }

  async function restoreCustomTask(task) {
    await supabase.from('custom_tasks').update({ is_deleted: false }).eq('id',task.id).eq('user_id',user.id)
    setDeletedDefaultTasks(prev => prev.filter(t => t.id !== task.id))
    setCustomTasks(prev => [...prev, { ...task }])
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
      if (data) {
        setClosedDeals(prev=>[...prev,{...row,id:data.id,status:'closed',closedFrom:'Offers'}])
        const comm = parseFloat(String(row.commission||'').replace(/[^0-9.]/g,''))||0
        setCelebration({ address:row.address||'Deal Closed', commission:row.commission||'', newComm:comm })
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
        const comm = parseFloat(String(row.commission||'').replace(/[^0-9.]/g,''))||0
        setCelebration({ address:row.address||'Deal Closed', commission:row.commission||'', newComm:comm })
      }
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
      if (data) {
        setClosedDeals(prev=>[...prev,{id:data.id,address:listing.address,price:lPrice,commission:lComm,status:'closed',closedFrom:'Listing'}])
        const comm = parseFloat(String(lComm||'').replace(/[^0-9.]/g,''))||0
        setCelebration({ address:listing.address||'Deal Closed', commission:lComm||'', newComm:comm })
      }
      await awardPipelineXp('closed', '#10b981')
    }
  }

  // ── Buyer Rep Agreements ───────────────────────────────────────────────────
  async function addBuyerRep() {
    if (!newRepClient.trim()) return
    const {data} = await supabase.from('listings').insert({
      user_id:user.id, address:newRepClient.trim(), unit_count:0,
      price:'', commission:'', status:'active', month_year:MONTH_YEAR
    }).select().single()
    if (data) setBuyerReps(prev => [...prev, { id:data.id, clientName:data.address, status:'active', monthYear:data.month_year||MONTH_YEAR }])
    setNewRepClient('')
  }

  async function removeBuyerRep(rep) {
    setBuyerReps(prev => prev.filter(r => r.id !== rep.id))
    await supabase.from('listings').delete().eq('id', rep.id)
  }

  async function updateBuyerRepClient(id, val) {
    setBuyerReps(prev => prev.map(r => r.id === id ? {...r, clientName:val} : r))
    await supabase.from('listings').update({address:val}).eq('id', id)
  }

  async function closeBuyerRep(rep) {
    setBuyerReps(prev => prev.map(r => r.id === rep.id ? {...r, status:'closed'} : r))
    await supabase.from('listings').update({status:'closed'}).eq('id', rep.id)
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
  const nextRank = RANKS[RANKS.indexOf(rank)+1]
  const rankPct  = nextRank ? Math.round((xp-rank.min)/(nextRank.min-rank.min)*100) : 100

  // ── Team vs personal prefs ────────────────────────────────────────────────
  const isOnTeam    = !!profile?.team_id
  const isTeamOwner = isOnTeam && profile?.teams?.created_by === user?.id
  const activePrefs = isOnTeam
    ? (profile?.teams?.team_prefs || { hidden:[], order:[], edits:{} })
    : habitPrefs

  // ── Effective habits: built-ins (with edits, hidden removed) + custom defaults, ordered ──
  const builtInEffective = HABITS
    .filter(h => !(activePrefs.hidden||[]).includes(h.id))
    .map(h => {
      const ed = (activePrefs.edits||{})[h.id] || {}
      return { ...h, label:ed.label||h.label, icon:ed.icon||h.icon, xp:ed.xp||h.xp, isBuiltIn:true }
    })
  const customDefaults = isOnTeam && !isTeamOwner
    ? []  // team members can't have permanent custom defaults in Today
    : customTasks.filter(t => t.isDefault).map(t => ({ ...t, isBuiltIn:false }))
  const allEffective   = [...builtInEffective, ...customDefaults]
  const orderArr       = activePrefs.order || []
  if (orderArr.length) {
    const idx = {}; orderArr.forEach((id,i) => idx[id]=i)
    allEffective.sort((a,b) => (idx[a.id]??999) - (idx[b.id]??999))
  }
  const effectiveHabits = allEffective

  // ── Daily skip ───────────────────────────────────────────────────────────
  const todaySkipped       = (habitPrefs.skipped||{})[todayDate] || []
  const effectiveToday     = effectiveHabits.filter(h => !todaySkipped.includes(String(h.id)))
  const todayBuiltInActive = builtInEffective.filter(h => !todaySkipped.includes(h.id))

  const totalHabitChecks = builtInEffective.reduce((a,h)=>a+habits[h.id].flat().filter(Boolean).length,0)
  const totalPossible    = Math.max(builtInEffective.length,1)*WEEKS*7
  const monthPct         = Math.round(totalHabitChecks/totalPossible*100)
  const todayChecks      = todayBuiltInActive.filter(h=>habits[h.id][today.week][today.day]).length
  const todayPct         = Math.round(todayChecks/Math.max(todayBuiltInActive.length,1)*100)
  const totalAppts       = Object.entries(counters).filter(([k])=>k.startsWith('appointments')).reduce((a,[,v])=>a+v,0)
  const totalShowings    = Object.entries(counters).filter(([k])=>k.startsWith('showing')).reduce((a,[,v])=>a+v,0)
  const totalListings    = listings.filter(l => l.status !== 'closed').length
  const totalBuyerReps   = buyerReps.filter(r => r.status !== 'closed').length
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
        const ytd = closedDeals.reduce((a,r)=>{ const n=parseFloat(String(r.commission||'').replace(/[^0-9.]/g,'')); return a+(isNaN(n)?0:n) },0)
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

          <button className={`nav-btn mob-hide${(page==='directory'||page==='apod')?' active':''}`} onClick={()=>setPage('directory')}>🔗 Tools</button>

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
          animation:'fadeUp .18s ease', boxShadow:'0 8px 24px rgba(0,0,0,.4)'
        }}>
          {[
            { p:'dashboard', icon:'🏠', label:'Home' },
            { p:'teams',     icon:'👥', label:'Teams' },
            { p:'directory', icon:'🔗', label:'Tools' },
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

      {page==='teams'     && <TeamsPage     onNavigate={setPage} theme={theme} onToggleTheme={onToggleTheme}/>}
      {page==='profile'   && <ProfilePage   onNavigate={setPage} theme={theme} onToggleTheme={onToggleTheme}
                                             onTaskDeleted={syncTaskDeleted} onTaskRestored={syncTaskRestored}/>}
      {page==='directory' && <DirectoryPage onNavigate={setPage} theme={theme} onToggleTheme={onToggleTheme}/>}
      {page==='apod'      && <APODPage      onNavigate={setPage} theme={theme} onToggleTheme={onToggleTheme}/>}

      {page==='dashboard' && (dbLoading ? <Loader/> : (
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
            sub={`${todayChecks}/${builtInEffective.length} habits`}
            accent={todayPct>=80?'#10b981':todayPct>=50?'#d97706':'#dc2626'}/>
          <StatCard icon="📅" label="Month"        value={`${monthPct}%`}   color="var(--gold)"  sub={`${totalHabitChecks} checks`}/>
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
          {[{id:'today',l:'Today'},{id:'monthly',l:'Monthly Grid'},{id:'weekly',l:'Week View'},{id:'trends',l:'📈 Trends'}].map(t=>(
            <button key={t.id} className={`tab-item${tab===t.id?' on':''}`} onClick={()=>setTab(t.id)}>{t.l}</button>
          ))}
        </div>

        {/* ══ TODAY ══════════════════════════════════════════ */}
        {tab==='today' && (
          <>
          <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:10 }}>
            <button className="btn-outline" onClick={() => setShowPrint(true)}
              style={{ fontSize:13, display:'flex', alignItems:'center', gap:6 }}>
              🖨️ Print Daily Tasks
            </button>
          </div>
          <div className="today-grid">

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
                    <div className="serif" style={{ fontSize:22, color:'var(--text)', lineHeight:1 }}>{todayChecks}/{todayBuiltInActive.length}</div>
                    <div style={{ fontSize:10, color:'var(--muted)' }}>completed</div>
                  </div>
                </div>
              </div>

              {/* ── Unified task list: built-ins + custom defaults (ordered) ── */}
              <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
                {effectiveToday.map(h => {
                  if (h.isBuiltIn) {
                    const done = habits[h.id][today.week][today.day]
                    const cs   = CAT[h.cat]
                    const ckey = `${h.id}-${today.week}-${today.day}`
                    const cnt  = counters[ckey]||0
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
                              onBlur={e => setCounterValue(h.id, today.week, today.day, e.target.value)}
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
                    const ckey = `${h.id}-${today.week}-${today.day}`
                    const done = !!customDone[ckey]
                    return (
                      <div key={h.id} className={`habit-row${done?' done':''}`}>
                        <button className="chk" onClick={()=>toggleCustomTask(h.id,today.week,today.day)}
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
                          <button onClick={()=>skipHabitToday(h.id)} title="Skip for today"
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
                const dayTasks = customTasks.filter(t => !t.isDefault && t.specificDate === todayDate)
                return (
                  <>
                    {dayTasks.length > 0 && (
                      <div style={{ borderTop:'1px solid var(--b1)', marginTop:14, paddingTop:12,
                        display:'flex', flexDirection:'column', gap:2 }}>
                        <div className="label" style={{ marginBottom:6, fontSize:11 }}>Today Only</div>
                        {dayTasks.map(t => {
                          const ckey = `${t.id}-${today.week}-${today.day}`
                          const done = !!customDone[ckey]
                          return (
                            <div key={t.id} className={`habit-row${done?' done':''}`}>
                              <button className="chk" onClick={()=>toggleCustomTask(t.id,today.week,today.day)}
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
                      + Add task for today
                    </button>

                    {/* Deleted default tasks — restore inline */}
                    {deletedDefaultTasks.length > 0 && (
                      <div style={{ marginTop:16, paddingTop:14, borderTop:'1px dashed var(--b2)' }}>
                        <div style={{ fontSize:10, color:'var(--dim)', fontWeight:700, letterSpacing:1,
                          marginBottom:8, textTransform:'uppercase' }}>Deleted Tasks</div>
                        {deletedDefaultTasks.map(t => (
                          <div key={t.id} style={{ display:'flex', alignItems:'center', gap:8,
                            padding:'8px 4px', borderBottom:'1px solid var(--b1)', opacity:.55 }}>
                            <span style={{ fontSize:15, flexShrink:0 }}>{t.icon}</span>
                            <span style={{ flex:1, fontSize:13, color:'var(--muted)',
                              textDecoration:'line-through', minWidth:0 }}>{t.label}</span>
                            <span style={{ fontSize:11, color:'var(--dim)',
                              fontFamily:"'JetBrains Mono',monospace", flexShrink:0 }}>+{t.xp} XP</span>
                            <button className="btn-outline" style={{ fontSize:11, padding:'4px 10px', flexShrink:0 }}
                              onClick={()=>restoreCustomTask(t)}>Restore</button>
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
                {goals?.xp > 0 && (() => {
                  const pct = Math.min(Math.round(xp / goals.xp * 100), 100)
                  return (
                    <div style={{ marginTop:10, padding:'8px 0' }}>
                      <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, color:'var(--muted)', marginBottom:5 }}>
                        <span>Monthly XP Goal</span>
                        <span style={{ color:pct>=100?'#10b981':'var(--gold)', fontWeight:700 }}>{xp.toLocaleString()} / {goals.xp.toLocaleString()}</span>
                      </div>
                      <div style={{ height:6, background:'rgba(255,255,255,.1)', borderRadius:99, overflow:'hidden' }}>
                        <div style={{ height:'100%', width:`${pct}%`, background:pct>=100?'#10b981':'var(--gold)', borderRadius:99, transition:'width .5s' }}/>
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
            </div>
          </div>
          </>
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

        {/* ══ TRENDS ══════════════════════════════════════════ */}
        {tab==='trends' && (() => {
          // ── Week-by-week completion ──
          const weekBars = Array.from({length:WEEKS},(_,wi)=>{
            const checks = builtInEffective.reduce((a,h)=>a+habits[h.id][wi].filter(Boolean).length,0)
            const total  = Math.max(builtInEffective.length*7,1)
            return { pct:Math.round(checks/total*100), checks, wi }
          })
          // ── Category breakdown ──
          const cats = {}
          HABITS.forEach(h=>{
            if(!cats[h.cat]) cats[h.cat]={ label:h.cat, color:CAT[h.cat]?.color||'#888', done:0, total:0 }
            cats[h.cat].done  += habits[h.id].flat().filter(Boolean).length
            cats[h.cat].total += WEEKS*7
          })
          const catArr = Object.values(cats).sort((a,b)=>b.done-a.done)
          const maxCat = Math.max(...catArr.map(c=>c.done),1)
          // ── Pipeline funnel ──
          const funnel = [
            { label:'Appts Booked', val:totalAppts, color:'#0ea5e9' },
            { label:'Showings',     val:totalShowings, color:'#10b981' },
            { label:'Offers Made',  val:offersMade.length, color:'#f59e0b' },
            { label:'Closed',       val:closedDeals.length, color:'#8b5cf6' },
          ]
          const maxFunnel = Math.max(...funnel.map(f=>f.val),1)
          // ── XP breakdown ──
          const totalMonthHabitXp = builtInEffective.reduce((acc,h)=>{
            return acc + habits[h.id].flat().reduce((a,done,i)=>{
              if(!done) return a
              const wi=Math.floor(i/7), di=i%7
              const ckey=`${h.id}-${wi}-${di}`
              const cnt=counters[ckey]||0
              return a + h.xp + (cnt>0?Math.max(0,cnt-1)*(h.xpEach||0):0)
            },0)
          },0)
          const totalPipeXp  = sessionPipelineXp
          const otherXp      = Math.max(0, xp - totalMonthHabitXp - totalPipeXp)
          const totalXpShown = totalMonthHabitXp + totalPipeXp + otherXp || 1
          return (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))', gap:18, animation:'fadeUp .3s ease', paddingBottom:8 }}>

              {/* Week-by-week */}
              <div className="card" style={{ padding:22 }}>
                <div style={{ fontWeight:700, fontSize:13, color:'var(--text)', marginBottom:16 }}>📅 Week-by-Week Completion</div>
                <div style={{ display:'flex', gap:14, alignItems:'flex-end', height:120 }}>
                  {weekBars.map(({pct,checks,wi})=>(
                    <div key={wi} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:6 }}>
                      <div style={{ fontSize:11, fontWeight:700, color:pct>=70?'#10b981':pct>=40?'#f59e0b':'#dc2626' }}>{pct}%</div>
                      <div style={{ width:'100%', background:'var(--b1)', borderRadius:6, overflow:'hidden', height:80 }}>
                        <div style={{ width:'100%', height:`${Math.max(pct,2)}%`, background:pct>=70?'#10b981':pct>=40?'#f59e0b':'#dc2626',
                          borderRadius:6, marginTop:`${100-Math.max(pct,2)}%`, transition:'height .5s' }}/>
                      </div>
                      <div style={{ fontSize:10, color:'var(--muted)' }}>Wk {wi+1}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Category breakdown */}
              <div className="card" style={{ padding:22 }}>
                <div style={{ fontWeight:700, fontSize:13, color:'var(--text)', marginBottom:16 }}>🏷 Habit Category Breakdown</div>
                <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                  {catArr.map(c=>(
                    <div key={c.label}>
                      <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, marginBottom:4 }}>
                        <span style={{ color:c.color, fontWeight:600, textTransform:'capitalize' }}>{c.label}</span>
                        <span style={{ color:'var(--muted)' }}>{c.done} / {c.total}</span>
                      </div>
                      <div style={{ height:8, background:'var(--b1)', borderRadius:99, overflow:'hidden' }}>
                        <div style={{ height:'100%', width:`${Math.round(c.done/maxCat*100)}%`,
                          background:c.color, borderRadius:99, transition:'width .6s' }}/>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Pipeline funnel */}
              <div className="card" style={{ padding:22 }}>
                <div style={{ fontWeight:700, fontSize:13, color:'var(--text)', marginBottom:16 }}>🔽 Pipeline This Month</div>
                <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                  {funnel.map(f=>(
                    <div key={f.label}>
                      <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, marginBottom:4 }}>
                        <span style={{ color:f.color, fontWeight:600 }}>{f.label}</span>
                        <span style={{ fontWeight:700, color:'var(--text)' }}>{f.val}</span>
                      </div>
                      <div style={{ height:10, background:'var(--b1)', borderRadius:99, overflow:'hidden' }}>
                        <div style={{ height:'100%', width:`${Math.max(Math.round(f.val/maxFunnel*100),f.val>0?4:0)}%`,
                          background:f.color, borderRadius:99, transition:'width .6s' }}/>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* XP breakdown */}
              <div className="card" style={{ padding:22 }}>
                <div style={{ fontWeight:700, fontSize:13, color:'var(--text)', marginBottom:16 }}>⚡ XP Sources</div>
                <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:18 }}>
                  <div style={{ fontSize:32, fontWeight:800, color:'var(--gold)', fontFamily:"'Fraunces',serif" }}>
                    {xp.toLocaleString()}
                  </div>
                  <div style={{ fontSize:11, color:'var(--muted)' }}>lifetime XP total</div>
                </div>
                {[
                  { label:'Habits',   val:totalMonthHabitXp, color:'#0ea5e9' },
                  { label:'Pipeline', val:totalPipeXp,        color:'#10b981' },
                  ...(otherXp > 0 ? [{ label:'🏆 Bonuses', val:otherXp, color:'#f59e0b' }] : []),
                ].map(s=>(
                  <div key={s.label} style={{ marginBottom:10 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, marginBottom:4 }}>
                      <span style={{ color:s.color, fontWeight:600 }}>{s.label}</span>
                      <span style={{ color:'var(--text)' }}>+{s.val} XP</span>
                    </div>
                    <div style={{ height:8, background:'var(--b1)', borderRadius:99, overflow:'hidden' }}>
                      <div style={{ height:'100%', width:`${Math.max(Math.round(s.val/totalXpShown*100),s.val>0?3:0)}%`,
                        background:s.color, borderRadius:99, transition:'width .6s' }}/>
                    </div>
                  </div>
                ))}
                <div style={{ marginTop:16, padding:'10px 14px', background:'rgba(255,255,255,.03)',
                  border:'1px solid var(--b1)', borderRadius:10, fontSize:12 }}>
                  <div style={{ color:'var(--muted)', marginBottom:2 }}>Current Rank</div>
                  <div style={{ fontWeight:700, color:rank.color, fontFamily:"'Fraunces',serif", fontSize:18 }}>
                    {rank.icon} {rank.name}
                  </div>
                </div>
              </div>

            </div>
          )
        })()}

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
            {/* Weekly update print button */}
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

          <div className="card" style={{ padding:20 }}>
            <div className="resp-table"><div className="resp-table-inner" style={{ minWidth:680 }}>
            {/* Column headers */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 105px 115px 280px 30px', gap:8, padding:'3px 13px', marginBottom:6, border:'1px solid transparent' }}>
              <span className="label">Address</span>
              <span className="label">List Price</span>
              <span className="label">Commission</span>
              <span className="label">Status &amp; Actions</span>
              <span/>
            </div>

            {listings.length===0 && (
              <div style={{ textAlign:'center', padding:'22px 0', color:'var(--dim)', fontSize:12 }}>
                No listings this month — add one below
              </div>
            )}

            <div style={{ display:'flex', flexDirection:'column', gap:5, marginBottom:12 }}>
              {listings.map(l => (
                <div key={l.id} className="pipe-row" style={{ gridTemplateColumns:'1fr 105px 115px 280px 30px' }}>
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

                  {/* Status + action buttons (no delete here) */}
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
                  </div>

                  {/* Delete — own grid cell */}
                  <button className="btn-del" onClick={()=>removeListing(l)}>✕</button>
                </div>
              ))}
            </div>

            {/* Add new listing */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 105px 115px 280px 30px', gap:8,
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
                gridColumn:'span 2',
                background:'var(--purple)', border:'none', color:'#fff', borderRadius:9,
                padding:'9px 14px', fontSize:13, fontWeight:700, cursor:'pointer', lineHeight:1,
                display:'flex', alignItems:'center', justifyContent:'center', gap:5,
                transition:'background .15s', whiteSpace:'nowrap',
              }}>+ Add Listing</button>
            </div>
            </div></div>{/* /resp-table-inner /resp-table */}
          </div>
        </div>

        {/* ══ BUYER REP AGREEMENTS ════════════════════════════ */}
        <div style={{ marginTop:36 }}>
          <div className="section-divider"/>
          <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:14, gap:12, flexWrap:'wrap' }}>
            <div>
              <div style={{ display:'flex', alignItems:'center', gap:9, marginBottom:4 }}>
                <span style={{ fontSize:20 }}>🤝</span>
                <span className="serif" style={{ fontSize:20, color:'var(--text)', fontWeight:600 }}>Buyer Rep Agreements</span>
                <span style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:700, fontSize:18, color:'var(--blue)', lineHeight:1 }}>{buyerReps.length}</span>
              </div>
              <div className="section-sub" style={{ marginBottom:0 }}>
                Buyer reps persist across months · <strong>Offer Made</strong> logs to pipeline &amp; awards XP · <strong>Close Rep</strong> marks the agreement done
              </div>
            </div>
            {/* Buyers weekly update button */}
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

          <div className="card" style={{ padding:20 }}>
            <div className="resp-table"><div className="resp-table-inner" style={{ minWidth:450 }}>
            {/* Column headers */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 240px 30px', gap:8, padding:'3px 13px', marginBottom:6, border:'1px solid transparent' }}>
              <span className="label">Client Name</span>
              <span className="label">Status &amp; Actions</span>
              <span/>
            </div>

            {buyerReps.length === 0 && (
              <div style={{ textAlign:'center', padding:'22px 0', color:'var(--dim)', fontSize:12 }}>
                No buyer rep agreements — add one below
              </div>
            )}

            <div style={{ display:'flex', flexDirection:'column', gap:5, marginBottom:12 }}>
              {buyerReps.map(rep => (
                <div key={rep.id} className="pipe-row" style={{ gridTemplateColumns:'1fr 240px 30px' }}>
                  {/* Client name + optional month badge */}
                  <div style={{ display:'flex', alignItems:'center', gap:6, minWidth:0 }}>
                    <input className="pipe-input" value={rep.clientName||''}
                      onChange={e => updateBuyerRepClient(rep.id, e.target.value)}
                      placeholder="Client name…" style={{ flex:1, minWidth:0 }}/>
                    {rep.monthYear && rep.monthYear !== MONTH_YEAR && (
                      <span title={`Added in ${fmtMonth(rep.monthYear)}`} style={{
                        flexShrink:0, fontSize:9, padding:'2px 6px', borderRadius:4,
                        background:'var(--bg2)', color:'var(--dim)',
                        fontFamily:"'JetBrains Mono',monospace", fontWeight:600, letterSpacing:.3,
                        border:'1px solid var(--b2)', whiteSpace:'nowrap',
                      }}>
                        {fmtMonth(rep.monthYear)}
                      </span>
                    )}
                  </div>

                  {/* Status + actions (no delete here) */}
                  <div style={{ display:'flex', alignItems:'center', gap:5, flexShrink:0, flexWrap:'nowrap' }}>
                    <span className={`status-pill sp-${rep.status||'active'}`}>
                      {rep.status === 'closed' ? '✓ Closed' : '● Active'}
                    </span>
                    {rep.status !== 'closed' && (
                      <>
                        <button className="act-btn act-btn-blue"
                          onClick={() => setOfferModal({ repId:rep.id, repName:rep.clientName||'Buyer' })}>
                          📤 Offer Made
                        </button>
                        <button className="act-btn act-btn-amber" onClick={() => closeBuyerRep(rep)}>
                          ✓ Close Rep
                        </button>
                      </>
                    )}
                  </div>

                  {/* Delete — own grid cell */}
                  <button className="btn-del" onClick={() => removeBuyerRep(rep)}>✕</button>
                </div>
              ))}
            </div>

            {/* Add new buyer rep */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 240px 30px', gap:8,
              borderTop:'1px solid var(--b1)', paddingTop:12, alignItems:'center' }}>
              <input className="field-input" value={newRepClient}
                onChange={e => setNewRepClient(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addBuyerRep()}
                placeholder="New buyer client name…" style={{ padding:'8px 12px' }}/>
              <button onClick={addBuyerRep} style={{
                gridColumn:'span 2',
                background:'var(--blue)', border:'none', color:'#fff', borderRadius:9,
                padding:'9px 14px', fontSize:13, fontWeight:700, cursor:'pointer', lineHeight:1,
                display:'flex', alignItems:'center', justifyContent:'center', gap:5,
                transition:'background .15s', whiteSpace:'nowrap',
              }}>+ Add Buyer Rep</button>
            </div>
            </div></div>{/* /resp-table-inner /resp-table */}
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
      ))}

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
          todayDate={todayDate}
          customTasks={customTasks}
          customDone={customDone}
          offersMade={offersMade}
          offersReceived={offersReceived}
          pendingDeals={pendingDeals}
          closedDeals={closedDeals}
          buyerReps={buyerReps}
          onClose={() => setShowPrint(false)}
        />
      )}

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
