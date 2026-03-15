import React, { useState, useEffect, useRef, useMemo, useCallback, createContext, useContext, Component, memo, Suspense, lazy } from 'react'
import { AuthProvider, useAuth } from './lib/AuthContext'
import { supabase } from './lib/supabase'
// ── Route-level code splitting ──────────────────────────────────────────────
// Each page is loaded on-demand via React.lazy, splitting the single 846 KB
// chunk into ~10 smaller chunks. Only the pages the user visits are fetched.
const AuthPage        = lazy(() => import('./pages/AuthPage'))
const LandingPage     = lazy(() => import('./pages/LandingPage'))
const TeamsPage       = lazy(() => import('./pages/TeamsPage'))
const ProfilePage     = lazy(() => import('./pages/ProfilePage'))
const DirectoryPage   = lazy(() => import('./pages/DirectoryPage'))
const APODPage        = lazy(() => import('./pages/APODPage'))
const BillingPage     = lazy(() => import('./pages/BillingPage'))
const AIAssistantPage = lazy(() => import('./pages/AIAssistantPage'))
const CoachingPage    = lazy(() => import('./pages/CoachingPage'))
const AdminPage       = lazy(() => import('./pages/AdminPage'))
const TermsPage       = lazy(() => import('./pages/TermsPage'))
const AffiliatesPage     = lazy(() => import('./pages/AffiliatesPage'))
const PresentationsPage  = lazy(() => import('./pages/PresentationsPage'))
const CMAPage            = lazy(() => import('./pages/CMAPage'))
import AIChatWidget from './components/AIChatWidget'
import { CSS, Ring, StatCard, Wordmark, Loader, ThemeToggle, getRank, fmtMoney, resolveCommission, RANKS, CAT, formatPrice, stripPrice, daysOnMarket, LEAD_SOURCES, LEAD_SOURCE_COLORS } from './design'
import { HABITS } from './habits'
import { getPlanBadge } from './lib/plans'
import { getTodayStr } from './lib/dateUtils'

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

// ─── DEV Render Loop Detector ──────────────────────────────────────────────────
// Enabled only in dev when VITE_DEBUG_RENDER=true.  If a component renders
// more than 50 times in 2 seconds a console.warn is emitted with the component
// name and render count.  Import and call useRenderGuard('ComponentName') at the
// top of any component you want to monitor.
const RENDER_DEBUG = import.meta.env.DEV && import.meta.env.VITE_DEBUG_RENDER === 'true'
function useRenderGuard(name) {
  const countRef = useRef(0)
  const windowRef = useRef(Date.now())
  if (!RENDER_DEBUG) return
  countRef.current++
  const now = Date.now()
  if (now - windowRef.current > 2000) {
    countRef.current = 1
    windowRef.current = now
  } else if (countRef.current > 50) {
    console.warn(`[RENDER STORM] ${name} rendered ${countRef.current} times in 2s`)
    countRef.current = 0
    windowRef.current = now
  }
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const PIPELINE_XP = { offer_made:75, offer_received:75, went_pending:150, closed:300 }
const DAYS        = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const FULL_DAYS   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
const WEEKS       = 5   // max week-chunks a month can span (days 1-7 = wk0 … days 29-35 = wk4)
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
  overflow:'hidden', minWidth:0,
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

// Format a date string (YYYY-MM-DD) to short display: "Mar 1"
function fmtShortDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T00:00:00')
  if (isNaN(d.getTime())) return dateStr
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`
}

// Maps goals keys to habit IDs for daily target computation
const GOAL_HABIT_MAP = {
  prospecting:  'prospecting',
  appointments: 'appointments',
  showing:      'showing',
}

// Count remaining weekdays (Mon-Fri) from fromDate to end of month, inclusive
function workingDaysRemaining(fromDate) {
  const year = fromDate.getFullYear(), month = fromDate.getMonth()
  const lastDay = new Date(year, month + 1, 0).getDate()
  let count = 0
  for (let d = fromDate.getDate(); d <= lastDay; d++) {
    const dow = new Date(year, month, d).getDay()
    if (dow >= 1 && dow <= 5) count++
  }
  return Math.max(count, 1)
}

function getToday()  { const d=new Date(); return { week:Math.min(Math.floor((d.getDate()-1)/7),WEEKS-1), day:d.getDay() } }

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

// Format "HH:MM" → "9:30 AM"
function fmtTime(t) {
  if (!t) return ''
  const [h,m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${h12}:${String(m).padStart(2,'0')} ${ampm}`
}

function AddTaskModal({ onSubmit, onClose }) {
  const [label, setLabel] = useState('')
  const [icon,  setIcon]  = useState('✅')
  const [xp,    setXp]    = useState('15')
  const [time,  setTime]  = useState('')
  const submit = () => { if (label.trim()) onSubmit(label.trim(), icon.trim()||'✅', Number(xp)||15, time||null) }
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
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:22 }}>
          <div>
            <div className="label" style={{ marginBottom:5 }}>Time <span style={{ color:'var(--dim)', fontWeight:400 }}>(optional)</span></div>
            <input className="field-input" type="time" value={time}
              onChange={e => setTime(e.target.value)}
              style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:13 }}/>
          </div>
          <div>
            <div className="label" style={{ marginBottom:5 }}>XP Reward</div>
            <input className="field-input" value={xp} type="number" min="0" max="500"
              onChange={e => setXp(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submit()}
              placeholder="15"
              style={{ color:'var(--gold2)', fontFamily:"'JetBrains Mono',monospace", width:'100%' }}/>
          </div>
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

// ─── AI Task Gen Modal ────────────────────────────────────────────────────────

function AITaskGenModal({ scope, onClose, onGenerate, onInsert, onClear }) {
  const [phase, setPhase]       = useState('input') // input | loading | preview | error
  const [guidance, setGuidance] = useState('')
  const [tasks, setTasks]       = useState([])
  const [summary, setSummary]   = useState('')
  const [selected, setSelected] = useState({}) // { idx: true }
  const [error, setError]       = useState('')
  const [clearFirst, setClearFirst] = useState(false)
  const [startHour, setStartHour] = useState('08:00')
  const [endHour, setEndHour]     = useState('18:00')
  const [includeWeekends, setIncludeWeekends] = useState(true)

  async function handleGenerate() {
    setPhase('loading')
    setError('')
    try {
      if (clearFirst && onClear) {
        const now = new Date()
        let dates = []
        if (scope === 'week') {
          for (let i = 0; i < 7; i++) {
            const d = new Date(now)
            d.setDate(now.getDate() + i)
            const dow = d.getDay()
            if (!includeWeekends && (dow === 0 || dow === 6)) continue
            dates.push(d.toISOString().slice(0, 10))
          }
        } else {
          dates = [now.toISOString().slice(0, 10)]
        }
        await onClear(dates)
      }
      const result = await onGenerate(scope, guidance, { startHour, endHour, includeWeekends })
      if (result.error) { setError(result.error); setPhase('error'); return }
      setTasks(result.tasks || [])
      setSummary(result.summary || '')
      const sel = {}
      ;(result.tasks || []).forEach((_, i) => sel[i] = true)
      setSelected(sel)
      setPhase('preview')
    } catch (e) {
      console.error('AI generate error:', e)
      setError(e.message || 'Something went wrong')
      setPhase('error')
    }
  }

  function toggleTask(idx) {
    setSelected(prev => ({ ...prev, [idx]: !prev[idx] }))
  }

  function handleInsert() {
    const chosen = tasks.filter((_, i) => selected[i])
    if (chosen.length === 0) return
    onInsert(chosen)
    onClose()
  }

  const selectedCount = Object.values(selected).filter(Boolean).length

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.55)', zIndex:1000,
      display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="card" style={{ padding:28, width:'100%', maxWidth:520, maxHeight:'85vh', display:'flex', flexDirection:'column' }}>
        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:18 }}>
          <span style={{ fontSize:22 }}>✨</span>
          <div className="serif" style={{ fontSize:18, color:'var(--text)' }}>
            AI Task Planner — {scope === 'week' ? 'Plan My Week' : 'Plan My Day'}
          </div>
          <button onClick={onClose} style={{ marginLeft:'auto', background:'none', border:'none',
            cursor:'pointer', color:'var(--dim)', fontSize:18, padding:'4px 8px' }}>✕</button>
        </div>

        {/* Phase: Input */}
        {phase === 'input' && (
          <>
            <div style={{ fontSize:12, color:'var(--muted)', marginBottom:14, lineHeight:1.6 }}>
              AI will analyze your pipeline, goals, calendar, and local market to generate a personalized task list.
            </div>
            <div className="label" style={{ marginBottom:5 }}>Focus areas <span style={{ fontWeight:400, color:'var(--dim)' }}>(optional)</span></div>
            <textarea className="field-input" value={guidance} onChange={e => setGuidance(e.target.value)}
              placeholder="e.g. Focus on buyer follow-ups, or prep for Thursday open house"
              rows={2} style={{ resize:'vertical', marginBottom:14, fontSize:13 }}/>
            <div style={{ display:'flex', gap:12, marginBottom:14 }}>
              <div style={{ flex:1 }}>
                <div className="label" style={{ marginBottom:4 }}>Start of day</div>
                <select className="field-input" value={startHour} onChange={e => setStartHour(e.target.value)}
                  style={{ fontSize:13, padding:'8px 10px' }}>
                  {Array.from({ length: 15 }, (_, i) => i + 5).map(h => {
                    const val = `${String(h).padStart(2,'0')}:00`
                    const label = h === 0 ? '12:00 AM' : h < 12 ? `${h}:00 AM` : h === 12 ? '12:00 PM' : `${h-12}:00 PM`
                    return <option key={val} value={val}>{label}</option>
                  })}
                </select>
              </div>
              <div style={{ flex:1 }}>
                <div className="label" style={{ marginBottom:4 }}>End of day</div>
                <select className="field-input" value={endHour} onChange={e => setEndHour(e.target.value)}
                  style={{ fontSize:13, padding:'8px 10px' }}>
                  {Array.from({ length: 15 }, (_, i) => i + 10).map(h => {
                    const val = `${String(h).padStart(2,'0')}:00`
                    const label = h < 12 ? `${h}:00 AM` : h === 12 ? '12:00 PM' : `${h-12}:00 PM`
                    return <option key={val} value={val}>{label}</option>
                  })}
                </select>
              </div>
            </div>
            {scope === 'week' && (
              <div style={{ display:'flex', gap:8, marginBottom:14 }}>
                <button onClick={() => setIncludeWeekends(false)}
                  style={{ flex:1, padding:'8px 0', borderRadius:8, fontSize:12, fontWeight:600, cursor:'pointer',
                    border: !includeWeekends ? '2px solid var(--gold2)' : '1px solid var(--b2)',
                    background: !includeWeekends ? 'rgba(217,119,6,.08)' : 'transparent',
                    color: !includeWeekends ? 'var(--gold2)' : 'var(--muted)' }}>
                  Weekdays only
                </button>
                <button onClick={() => setIncludeWeekends(true)}
                  style={{ flex:1, padding:'8px 0', borderRadius:8, fontSize:12, fontWeight:600, cursor:'pointer',
                    border: includeWeekends ? '2px solid var(--gold2)' : '1px solid var(--b2)',
                    background: includeWeekends ? 'rgba(217,119,6,.08)' : 'transparent',
                    color: includeWeekends ? 'var(--gold2)' : 'var(--muted)' }}>
                  Include weekends
                </button>
              </div>
            )}
            <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', marginBottom:16,
              padding:'10px 12px', borderRadius:8, background: clearFirst ? 'rgba(239,68,68,.06)' : 'var(--bg2)',
              border: clearFirst ? '1px solid rgba(239,68,68,.25)' : '1px solid var(--b1)', transition:'all .15s' }}>
              <button onClick={() => setClearFirst(!clearFirst)}
                style={{ width:18, height:18, borderRadius:4, flexShrink:0,
                  border: clearFirst ? '2px solid #ef4444' : '2px solid var(--b2)',
                  background: clearFirst ? 'rgba(239,68,68,.15)' : 'transparent',
                  cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                {clearFirst && <span style={{ fontSize:10, color:'#ef4444', fontWeight:900 }}>✓</span>}
              </button>
              <div>
                <div style={{ fontSize:12, fontWeight:600, color: clearFirst ? '#ef4444' : 'var(--text)' }}>
                  🗑️ Clear existing tasks & rebuild
                </div>
                <div style={{ fontSize:11, color:'var(--dim)' }}>
                  Remove current {scope === 'week' ? 'week' : 'day'} tasks (keeps calendar events) and start fresh
                </div>
              </div>
            </label>
            <button className="btn-gold" onClick={handleGenerate} style={{ width:'100%', justifyContent:'center', fontSize:14, padding:'12px 0', gap:8 }}>
              ✨ {clearFirst ? 'Clear & Generate' : 'Generate Tasks'}
            </button>
          </>
        )}

        {/* Phase: Loading */}
        {phase === 'loading' && (
          <div style={{ textAlign:'center', padding:'40px 0' }}>
            <div style={{ fontSize:32, marginBottom:12, animation:'spin 1.5s linear infinite' }}>✨</div>
            <div style={{ fontSize:14, color:'var(--muted)', fontWeight:500 }}>
              Analyzing your pipeline & market…
            </div>
            <div style={{ fontSize:11, color:'var(--dim)', marginTop:6 }}>This may take 10-15 seconds</div>
          </div>
        )}

        {/* Phase: Error */}
        {phase === 'error' && (
          <div style={{ textAlign:'center', padding:'30px 0' }}>
            <div style={{ fontSize:28, marginBottom:10 }}>⚠️</div>
            <div style={{ fontSize:13, color:'var(--muted)', marginBottom:16 }}>{error}</div>
            <div style={{ display:'flex', gap:8, justifyContent:'center' }}>
              <button className="btn-outline" onClick={onClose}>Cancel</button>
              <button className="btn-gold" onClick={handleGenerate}>Try Again</button>
            </div>
          </div>
        )}

        {/* Phase: Preview */}
        {phase === 'preview' && (
          <>
            {summary && (
              <div style={{ fontSize:12, color:'var(--muted)', marginBottom:14, padding:'10px 12px',
                background:'var(--bg2)', borderRadius:8, border:'1px solid var(--b1)', lineHeight:1.6 }}>
                {summary}
              </div>
            )}

            <div style={{ flex:1, overflowY:'auto', marginBottom:16 }}>
              {tasks.map((t, idx) => (
                <div key={idx} style={{ display:'flex', alignItems:'flex-start', gap:8,
                  padding:'10px 8px', borderBottom:'1px solid var(--b1)',
                  opacity: selected[idx] ? 1 : 0.4, transition:'opacity .15s' }}>
                  <button onClick={() => toggleTask(idx)}
                    style={{ width:18, height:18, borderRadius:4, flexShrink:0, marginTop:2,
                      border: selected[idx] ? '2px solid var(--gold2)' : '2px solid var(--b2)',
                      background: selected[idx] ? 'rgba(217,119,6,.12)' : 'transparent',
                      cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                    {selected[idx] && <span style={{ fontSize:10, color:'var(--gold2)', fontWeight:900 }}>✓</span>}
                  </button>
                  <span style={{ fontSize:16, flexShrink:0 }}>{t.icon}</span>
                  {t.time && (
                    <span style={{ fontSize:10, fontWeight:700, color:'var(--gold2)', flexShrink:0,
                      fontFamily:"'JetBrains Mono',monospace", whiteSpace:'nowrap', marginTop:2 }}>
                      {fmtTime(t.time)}
                    </span>
                  )}
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:13, fontWeight:500, color:'var(--text)', lineHeight:1.4 }}>{t.label}</div>
                    {t.rationale && (
                      <div style={{ fontSize:10, color:'var(--dim)', marginTop:2, lineHeight:1.4 }}>{t.rationale}</div>
                    )}
                    <div style={{ display:'flex', gap:8, marginTop:3 }}>
                      {t.date && scope === 'week' && (
                        <span style={{ fontSize:9, color:'var(--muted)', fontFamily:"'JetBrains Mono',monospace" }}>{t.date}</span>
                      )}
                      <span style={{ fontSize:9, color:'var(--gold2)', fontWeight:700,
                        fontFamily:"'JetBrains Mono',monospace" }}>+{t.xp} XP</span>
                    </div>
                  </div>
                </div>
              ))}
              {tasks.length === 0 && (
                <div style={{ textAlign:'center', padding:'24px 0', color:'var(--dim)', fontSize:13 }}>
                  No tasks generated. Try adding more details to your focus areas.
                </div>
              )}
            </div>

            <div style={{ display:'flex', gap:8, justifyContent:'flex-end', flexShrink:0 }}>
              <button className="btn-outline" onClick={() => { setPhase('input'); setTasks([]) }}
                style={{ fontSize:12 }}>↻ Regenerate</button>
              <button className="btn-outline" onClick={onClose} style={{ fontSize:12 }}>Cancel</button>
              <button className="btn-gold" onClick={handleInsert} disabled={selectedCount === 0}
                style={{ minWidth:130, fontSize:13 }}>
                + Add {selectedCount} Task{selectedCount !== 1 ? 's' : ''}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Offer Modal ──────────────────────────────────────────────────────────────

function OfferModal({ repName, onSubmit, onClose, prefillAddress }) {
  const [addr,  setAddr]  = useState(prefillAddress || '')
  const [price, setPrice] = useState('')
  const [comm,  setComm]  = useState('')
  const [isPercent, setIsPercent] = useState(true) // default to percentage
  const commVal = isPercent ? (comm ? comm.replace(/%$/,'') + '%' : '') : comm
  const commResolved = resolveCommission(commVal, price)
  const submit = () => { if (addr.trim()) onSubmit(addr.trim(), price.trim(), commVal.trim()) }
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
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:8 }}>
          <div>
            <div className="label" style={{ marginBottom:5 }}>Offer Price</div>
            <input className="field-input" value={price} onChange={e => setPrice(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submit()}
              placeholder="$450,000"
              style={{ color:'var(--gold2)', fontFamily:"'JetBrains Mono',monospace" }}/>
          </div>
          <div>
            <div className="label" style={{ marginBottom:5 }}>Commission</div>
            <div style={{ display:'flex', gap:4 }}>
              <input className="field-input" value={comm} onChange={e => setComm(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && submit()}
                placeholder={isPercent ? '3' : '$13,500'}
                style={{ flex:1, minWidth:0, color: isPercent ? 'var(--muted)' : 'var(--green)', fontWeight:600, fontFamily:"'JetBrains Mono',monospace" }}/>
              <button onClick={() => setIsPercent(!isPercent)} style={{
                background:'var(--bg2)', border:'1px solid var(--b2)', borderRadius:6, cursor:'pointer', padding:'6px 10px',
                fontSize:10, color:'var(--dim)', fontFamily:"'JetBrains Mono',monospace", fontWeight:600, whiteSpace:'nowrap',
              }}>{isPercent ? '$ Flat' : '% Rate'}</button>
            </div>
          </div>
        </div>
        {isPercent && commResolved > 0 && (
          <div style={{ fontSize:12, color:'var(--green)', fontFamily:"'JetBrains Mono',monospace", fontWeight:600, marginBottom:14, textAlign:'right' }}>
            = {fmtMoney(commResolved)}
          </div>
        )}
        {!(isPercent && commResolved > 0) && <div style={{ height:14 }}/>}
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

// ─── Print Buyer Summary Modal ────────────────────────────────────────────────
function PrintBuyerModal({ rep, onClose }) {
  const bd = rep.buyerDetails || {}
  const showings = bd.showings || []
  const fmtDate = d => d ? new Date(d+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—'
  const fmtTime = t => { if (!t) return ''; const [h,m] = t.split(':').map(Number); const ap = h>=12?'PM':'AM'; return `${h%12||12}:${String(m).padStart(2,'0')} ${ap}` }
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.6)', zIndex:1100,
      overflowY:'auto', padding:'30px 20px' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ maxWidth:780, margin:'0 auto' }}>
        <div className="print-modal-header">
          <div style={{ color:'#fff', fontSize:15, fontWeight:600 }}>🖨️ Buyer Summary</div>
          <div style={{ display:'flex', gap:8 }}>
            <button className="btn-gold" style={{ fontSize:13 }} onClick={() => window.print()}>Print</button>
            <button className="btn-outline" style={{ fontSize:13, color:'#fff', borderColor:'rgba(255,255,255,.3)' }} onClick={onClose}>✕ Close</button>
          </div>
        </div>
        <div className="print-sheet">
          {/* Header */}
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start',
            borderBottom:'3px solid #111', paddingBottom:10, marginBottom:16 }}>
            <div>
              <div style={{ fontSize:22, fontWeight:700, letterSpacing:'.02em' }}>REALTYGRIND</div>
              <div style={{ fontSize:11, color:'#555', letterSpacing:'.08em', textTransform:'uppercase' }}>Buyer Client Summary</div>
            </div>
            <div style={{ textAlign:'right' }}>
              <div style={{ fontSize:11, color:'#888', textTransform:'uppercase', letterSpacing:'.05em' }}>Prepared</div>
              <div style={{ fontSize:14, fontWeight:600 }}>{new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})}</div>
            </div>
          </div>

          {/* Client name */}
          <div style={{ fontSize:20, fontWeight:700, marginBottom:4 }}>👤 {rep.clientName || 'Unnamed Client'}</div>
          <div style={{ fontSize:11, color:'#888', marginBottom:18 }}>
            Status: <strong style={{ color: rep.status==='closed' ? '#10b981' : '#0ea5e9' }}>{rep.status==='closed' ? 'Closed' : 'Active'}</strong>
          </div>

          {/* Two-column: Financial + Agreement */}
          <div className="print-sheet-grid">
            <div>
              <div className="print-section-title">Financial</div>
              <div className="print-tracker-row"><span>Pre-Approval</span><span className="print-tracker-val">{bd.preApproval || '—'}</span></div>
              <div className="print-tracker-row"><span>Payment Range</span><span className="print-tracker-val">{bd.paymentRange || '—'}</span></div>
              <div className="print-tracker-row"><span>Down Payment</span><span className="print-tracker-val">{bd.downPayment || '—'}</span></div>
            </div>
            <div>
              <div className="print-section-title">Agreement</div>
              <div className="print-tracker-row"><span>Date Signed</span><span className="print-tracker-val">{fmtDate(bd.dateSigned)}</span></div>
              <div className="print-tracker-row"><span>Date Expires</span><span className="print-tracker-val">{fmtDate(bd.dateExpires)}</span></div>
              <div className="print-tracker-row"><span>Last Contact</span><span className="print-tracker-val">{fmtDate(bd.lastCallDate)}</span></div>
              <div className="print-tracker-row"><span>Timeline</span><span className="print-tracker-val">{bd.timeline || '—'}</span></div>
            </div>
          </div>

          {/* Search Criteria */}
          <div style={{ marginTop:18 }}>
            <div className="print-section-title">Search Criteria</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, fontSize:12.5 }}>
              <div><strong>Location:</strong> {bd.locationPrefs || '—'}</div>
              <div><strong>Timeline:</strong> {bd.timeline || '—'}</div>
              <div><strong>Must-Haves:</strong> {bd.mustHaves || '—'}</div>
              <div><strong>Nice-to-Haves:</strong> {bd.niceToHaves || '—'}</div>
            </div>
          </div>

          {/* Houses Shown */}
          <div style={{ marginTop:18 }}>
            <div className="print-section-title">Houses Shown ({showings.length})</div>
            {showings.length === 0 ? (
              <div style={{ fontSize:12, color:'#888', fontStyle:'italic' }}>No showings logged</div>
            ) : (
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                <thead>
                  <tr style={{ borderBottom:'2px solid #111', textAlign:'left' }}>
                    <th style={{ padding:'4px 8px 4px 0', fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em', fontFamily:"'Poppins',sans-serif" }}>Address</th>
                    <th style={{ padding:'4px 8px', fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em', fontFamily:"'Poppins',sans-serif" }}>Date</th>
                    <th style={{ padding:'4px 8px', fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em', fontFamily:"'Poppins',sans-serif" }}>Time</th>
                    <th style={{ padding:'4px 8px', fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em', fontFamily:"'Poppins',sans-serif" }}>Notes</th>
                    <th style={{ padding:'4px 0 4px 8px', fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em', fontFamily:"'Poppins',sans-serif", textAlign:'right' }}>Offer</th>
                  </tr>
                </thead>
                <tbody>
                  {showings.map(s => (
                    <tr key={s.id} style={{ borderBottom:'1px solid #ddd' }}>
                      <td style={{ padding:'6px 8px 6px 0', fontWeight:600 }}>{s.address}</td>
                      <td style={{ padding:'6px 8px', whiteSpace:'nowrap' }}>{fmtDate(s.dateShown)}</td>
                      <td style={{ padding:'6px 8px', whiteSpace:'nowrap' }}>{fmtTime(s.timeShown)}</td>
                      <td style={{ padding:'6px 8px', color:'#555', maxWidth:200, overflow:'hidden', textOverflow:'ellipsis' }}>{s.notes || '—'}</td>
                      <td style={{ padding:'6px 0 6px 8px', textAlign:'right', fontWeight:600, color: s.offerId ? '#10b981' : '#888' }}>{s.offerId ? '✓ Yes' : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Notes */}
          <div style={{ marginTop:22 }}>
            <div className="print-section-title">Notes</div>
            {[...Array(5)].map((_,i) => <div key={i} className="print-ruled"/>)}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Default Transaction Checklist ────────────────────────────────────────────
const DEFAULT_CHECKLIST = [
  { id:'em',    label:'Earnest money deposited',         done:false },
  { id:'ins',   label:'Home inspection scheduled',       done:false },
  { id:'insc',  label:'Home inspection completed',       done:false },
  { id:'appo',  label:'Appraisal ordered',               done:false },
  { id:'appc',  label:'Appraisal completed',             done:false },
  { id:'title', label:'Title search / commitment',       done:false },
  { id:'loan',  label:'Loan approval / clear to close',  done:false },
  { id:'walk',  label:'Final walkthrough',               done:false },
  { id:'close', label:'Closing day',                     done:false },
]

// TC-specific checklist — comprehensive contract-to-close items for Transaction Coordinators
const TC_DEFAULT_CHECKLIST = [
  { id:'tc-ratified',  label:'Ratified contract received & reviewed',       done:false },
  { id:'tc-open-esc',  label:'Open escrow / title order',                   done:false },
  { id:'tc-em-track',  label:'Earnest money receipt confirmed',             done:false },
  { id:'tc-disc',      label:'Disclosure package sent to buyer',            done:false },
  { id:'tc-disc-sign', label:'Disclosures signed by all parties',           done:false },
  { id:'tc-hoi',       label:'Homeowner\'s insurance ordered',              done:false },
  { id:'tc-insp-ord',  label:'Home inspection ordered & scheduled',         done:false },
  { id:'tc-insp-rpt',  label:'Inspection report reviewed',                  done:false },
  { id:'tc-insp-rep',  label:'Repair request / amendment sent',             done:false },
  { id:'tc-insp-res',  label:'Inspection resolution signed',                done:false },
  { id:'tc-app-ord',   label:'Appraisal ordered',                           done:false },
  { id:'tc-app-rcv',   label:'Appraisal received & reviewed',               done:false },
  { id:'tc-app-con',   label:'Appraisal contingency removed',               done:false },
  { id:'tc-loan-app',  label:'Loan application verified',                   done:false },
  { id:'tc-cond',      label:'Lender conditions cleared',                   done:false },
  { id:'tc-ctc',       label:'Clear to close received',                     done:false },
  { id:'tc-title-rpt', label:'Title report reviewed — no issues',           done:false },
  { id:'tc-survey',    label:'Survey ordered (if required)',                 done:false },
  { id:'tc-hoa',       label:'HOA docs / estoppel ordered (if applicable)', done:false },
  { id:'tc-warranty',  label:'Home warranty ordered (if applicable)',        done:false },
  { id:'tc-cd-rev',    label:'Closing disclosure reviewed & approved',      done:false },
  { id:'tc-util',      label:'Utility transfers coordinated',               done:false },
  { id:'tc-walk',      label:'Final walkthrough scheduled',                 done:false },
  { id:'tc-keys',      label:'Key exchange / lockbox coordinated',          done:false },
  { id:'tc-close-pkg', label:'Closing package sent to title company',       done:false },
  { id:'tc-comm',      label:'Commission disbursement confirmed',           done:false },
  { id:'tc-closed',    label:'Transaction closed — file complete',          done:false },
]

// TC Transaction Stages — ordered progression through a real estate deal
const TC_STAGES = [
  { key:'ratified',       label:'Ratified',       color:'#8b5cf6', icon:'📝' },
  { key:'processing',     label:'Processing',     color:'#0ea5e9', icon:'⚙️' },
  { key:'inspection',     label:'Inspection',     color:'#f59e0b', icon:'🔍' },
  { key:'appraisal',      label:'Appraisal',      color:'#f97316', icon:'🏠' },
  { key:'financing',      label:'Financing',      color:'#6366f1', icon:'🏦' },
  { key:'clear_to_close', label:'Clear to Close',  color:'#10b981', icon:'✅' },
  { key:'closing',        label:'Closing',         color:'#14b8a6', icon:'🔑' },
  { key:'closed',         label:'Closed',          color:'#22c55e', icon:'🎉' },
]

const TC_DEADLINES = [
  { key:'close_date',           label:'Close / Settlement Date',       icon:'📅' },
  { key:'inspection_deadline',  label:'Inspection Contingency',        icon:'🔍' },
  { key:'appraisal_deadline',   label:'Appraisal Contingency',         icon:'🏠' },
  { key:'financing_deadline',   label:'Financing Contingency',         icon:'🏦' },
]

const DEFAULT_TC_MILESTONES = {
  stage: 'ratified',
  close_date: '',
  inspection_deadline: '',
  appraisal_deadline: '',
  financing_deadline: '',
  conditions_added: false,
  conditions_cleared: false,
  extension_filed: false,
  extension_new_date: '',
  extension_notes: '',
  closed_at: null,
  fallen_through: false,
  fallen_through_reason: '',
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

function PipelineSection({ title, icon, accentColor, xpLabel, rows, setRows, onStatusChange, showSource, statusOpts, onAdd, onRemove, userId,
  expandedChecklist, setExpandedChecklist, onToggleChecklistItem, onAddChecklistItem, onRemoveChecklistItem, onUpdateChecklistDueDate, archiveOnRemove, onArchiveToClosed }) {
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
    setRows(prev => prev.filter(r => r.id !== row.id))
    if (row.id && !String(row.id).startsWith('tmp-')) {
      if (archiveOnRemove) {
        // Soft-delete: archive the record so it still counts in monthly stats
        const r = await safeDb(supabase.from('transactions').update({status:'archived'}).eq('id', row.id).eq('user_id', userId))
        if (!r.ok) {
          // Fallback: try hard delete if archive fails (e.g. RLS policy)
          const r2 = await safeDb(supabase.from('transactions').delete().eq('id', row.id).eq('user_id', userId))
          if (!r2.ok) { setRows(prev => [...prev, row]); return }
        }
        // Move to archived deals state so it appears in the Archived tab
        if (onArchiveToClosed) onArchiveToClosed(row)
      } else {
        const r = await safeDb(supabase.from('transactions').delete().eq('id', row.id).eq('user_id', userId))
        if (!r.ok) { setRows(prev => [...prev, row]); return }
      }
    }
    if (!archiveOnRemove && onRemove) onRemove(row)
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
              {xpLabel != null && <span style={{ fontSize:9, padding:'2px 7px', borderRadius:4, fontWeight:700, fontFamily:"'JetBrains Mono',monospace",
                background:`${accentColor}14`, color:accentColor, border:`1px solid ${accentColor}28` }}>
                +{xpLabel} XP/deal
              </span>}
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
        const dom = daysOnMarket(r.listDate, r.createdAt)
        const isEditingRow = editingPipe === r.id
        return (
          <div key={r.id} className="deal-card" style={{ padding:'14px 18px' }}>
            {/* Address — display or edit */}
            {isEditingRow ? (
              <input className="deal-title" value={r.address||''}
                autoFocus
                onChange={e=>update(r.id,'address',e.target.value)}
                onBlur={e=>persist(r.id,'address',e.target.value)}
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
              {r.checklist?.length > 0 && (() => {
                const done = r.checklist.filter(i=>i.done).length
                const total = r.checklist.length
                const clr = done === total ? '#059669' : done > 0 ? '#d97706' : 'var(--dim)'
                return <><span className="sep"/><span style={{ color:clr, fontWeight:600, cursor:'pointer' }}
                  onClick={()=>setExpandedChecklist&&setExpandedChecklist(prev=>prev===r.id?null:r.id)}>📋 {done}/{total}</span></>
              })()}
              {showSource && r.closedFrom && (
                <>
                  <span className="sep"/>
                  <span>via {r.closedFrom}</span>
                </>
              )}
              {showSource && r.dealSide && (
                <>
                  <span className="sep"/>
                  <span style={{ textTransform:'capitalize', color: r.dealSide === 'seller' ? 'var(--purple)' : 'var(--blue)', fontWeight:600 }}>{r.dealSide}</span>
                </>
              )}
              {showSource && r.originalLeadSource && (
                <>
                  <span className="sep"/>
                  <span>{r.originalLeadSource}</span>
                </>
              )}
            </div>

            {/* Actions */}
            <div className="deal-actions">
              {showSource ? (
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <span style={{ fontSize:11, color:'var(--dim)', fontStyle:'italic' }}>Closed</span>
                  {onArchiveToClosed && (
                    <button className="act-btn act-btn-green" title="Archive to Closed tab"
                      onClick={()=>onArchiveToClosed(r.id)}
                      style={{ fontSize:10, padding:'2px 8px' }}>
                      ✅ Archive
                    </button>
                  )}
                </div>
              ) : (
                <>
                  {r.checklist?.length > 0 && setExpandedChecklist && (
                    <button className={`act-btn ${expandedChecklist===r.id ? 'act-btn-amber' : 'act-btn-green'}`}
                      onClick={()=>setExpandedChecklist(prev=>prev===r.id?null:r.id)}>
                      {expandedChecklist===r.id ? '▲ Checklist' : '📋 Checklist'}
                    </button>
                  )}
                  {actionOpts.map(o => {
                    const btnClass = o.variant === 'red' ? 'act-btn-red'
                      : o.v === 'pending' ? 'act-btn-amber'
                      : o.v === 'countered' ? 'act-btn-purple'
                      : 'act-btn-green'
                    return (
                    <button key={o.v}
                      className={`act-btn ${btnClass}`}
                      onClick={()=>onStatusChange(r, o.v)}>
                      {o.l}
                    </button>
                    )
                  })}
                </>
              )}
              <div style={{ marginLeft:'auto', display:'flex', gap:4, alignItems:'center' }}>
                {!showSource && (
                  <button className="edit-toggle" title={isEditingRow ? 'Done editing' : 'Edit'} onClick={()=>setEditingPipe(isEditingRow ? null : r.id)}
                    style={ isEditingRow ? { background:'var(--bg2)', color:'var(--text)', borderColor:'var(--b2)' } : {}}>
                    {isEditingRow ? '✓' : '✏️'}
                  </button>
                )}
                <button className="edit-toggle" title="Remove" onClick={()=>remove(r)}
                  style={{ color:'var(--dim)' }}>✕</button>
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
                  <div style={{ display:'flex', gap:4 }}>
                    <input className="field-input" value={isP ? String(r.commission||'').replace(/%$/,'') : (r.commission||'')} placeholder={isP ? '3' : '5000'}
                      onChange={e=>update(r.id,'commission', isP ? e.target.value+'%' : e.target.value)}
                      onBlur={e=>persist(r.id,'commission', isP ? e.target.value+'%' : e.target.value)}
                      style={{ padding:'6px 10px', fontSize:12, flex:1, minWidth:0, boxSizing:'border-box',
                        fontFamily:"'JetBrains Mono',monospace", color: isP ? 'var(--muted)' : 'var(--green)', fontWeight:600 }}/>
                    <button onClick={()=>toggleCommType(r.id)} style={{
                      background:'var(--bg2)', border:'1px solid var(--b2)', borderRadius:6, cursor:'pointer', padding:'4px 8px',
                      fontSize:9, color:'var(--dim)', fontFamily:"'JetBrains Mono',monospace", fontWeight:600, whiteSpace:'nowrap',
                    }}>{isP ? '$ Flat' : '% Rate'}</button>
                  </div>
                </div>
              </div>
            )}

            {/* ── Expandable Checklist Panel ── */}
            {expandedChecklist === r.id && r.checklist?.length > 0 && (() => {
              const cl = r.checklist
              const done = cl.filter(i=>i.done).length
              const total = cl.length
              const pct = total > 0 ? Math.round((done/total)*100) : 0
              return (
                <div style={{ padding:'14px 16px 16px', background:'var(--bg2)', borderRadius:8,
                  marginTop:10, animation:'slideDown .2s ease', border:'1px solid var(--b1)' }}>
                  {/* Progress bar */}
                  <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
                    <div style={{ flex:1, height:6, borderRadius:3, background:'var(--b1)', overflow:'hidden' }}>
                      <div style={{ width:`${pct}%`, height:'100%', borderRadius:3, transition:'width .3s ease',
                        background: done===total ? '#059669' : '#d97706' }}/>
                    </div>
                    <span style={{ fontSize:11, fontWeight:700, fontFamily:"'JetBrains Mono',monospace",
                      color: done===total ? '#059669' : 'var(--muted)' }}>{done}/{total}</span>
                  </div>
                  {/* Checklist items */}
                  {cl.map(item => (
                    <div key={item.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'5px 0',
                      borderBottom:'1px solid var(--b1)' }}>
                      <button onClick={()=>onToggleChecklistItem&&onToggleChecklistItem(r.id,item.id)}
                        style={{ background:'none', border:'none', cursor:'pointer', fontSize:15, padding:0, lineHeight:1, flexShrink:0 }}>
                        {item.done ? '✅' : '☐'}
                      </button>
                      <span style={{ flex:1, fontSize:12, color: item.done ? 'var(--dim)' : 'var(--text)',
                        textDecoration: item.done ? 'line-through' : 'none', fontFamily:'inherit' }}>
                        {item.label}
                      </span>
                      {item.done && item.completedAt && (
                        <span style={{ fontSize:9, color:'var(--dim)', fontFamily:"'JetBrains Mono',monospace", flexShrink:0 }}>
                          {new Date(item.completedAt).toLocaleDateString('en-US',{month:'short',day:'numeric'})}
                        </span>
                      )}
                      <input type="date" value={item.dueDate||''} title="Due date"
                        onChange={e=>onUpdateChecklistDueDate&&onUpdateChecklistDueDate(r.id,item.id,e.target.value)}
                        style={{ background:'none', border:'1px solid var(--b1)', borderRadius:4, padding:'2px 4px',
                          fontSize:9, color: item.dueDate ? 'var(--text)' : 'var(--dim)', fontFamily:"'JetBrains Mono',monospace",
                          cursor:'pointer', width:95, flexShrink:0 }}/>
                      <button onClick={()=>onRemoveChecklistItem&&onRemoveChecklistItem(r.id,item.id)}
                        style={{ background:'none', border:'none', cursor:'pointer', color:'var(--dim)', fontSize:11,
                          padding:'2px', opacity:.5 }} title="Remove">✕</button>
                    </div>
                  ))}
                  {/* Add task */}
                  <div style={{ marginTop:8 }}>
                    <input className="field-input" placeholder="+ Add task…"
                      onKeyDown={e => { if (e.key==='Enter' && e.target.value.trim()) { onAddChecklistItem&&onAddChecklistItem(r.id,e.target.value); e.target.value='' } }}
                      style={{ padding:'6px 10px', fontSize:11, width:'100%', boxSizing:'border-box' }}/>
                  </div>
                </div>
              )
            })()}
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
  useRenderGuard('Dashboard')
  const { user, profile } = useAuth()

  // ── Stable profile primitives ────────────────────────────────────────────
  // Extract primitive values from profile ONCE so downstream useMemos don't
  // re-fire when profile object reference changes (e.g. after refreshProfile).
  const profileTeamId      = profile?.team_id ?? null
  const profileFullName    = profile?.full_name ?? null
  const profileAppRole     = profile?.app_role ?? null
  const profileTeamCreator = profile?.teams?.created_by ?? null
  const profilePlan        = profile?.plan ?? null
  const profileBillingStatus = profile?.billing_status ?? null
  const profilePhone       = profile?.phone ?? ''

  // Memoize plan badge to avoid re-creating object on every render
  const planBadge = useMemo(
    () => getPlanBadge(profile, user?.id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [profileAppRole, profileTeamId, profileTeamCreator, profilePlan, profileBillingStatus, user?.id]
  )

  // ── Date constants — computed once at mount, stable across re-renders ──────
  // Uses lazy useState so new Date() runs only once, preventing needless object
  // churn on every render.  If the tab stays open across a midnight boundary the
  // user will see stale "today" — an acceptable trade-off vs. re-render storms.
  const [{ MONTH_YEAR, todayWeek, todayDay, lastDayOfMonth: _lastDay }] = useState(() => {
    const d = new Date()
    return {
      MONTH_YEAR: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`,
      todayWeek: Math.min(Math.floor((d.getDate()-1)/7),3),
      todayDay: d.getDay(),
      lastDayOfMonth: new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(),
    }
  })
  const lastDayOfMonth = _lastDay
  const today = useMemo(() => ({ week: todayWeek, day: todayDay }), [todayWeek, todayDay])

  // Day navigation for the Today tab — offset from real today
  const [viewDayOffset, setViewDayOffset] = useState(0)
  const viewDate = useMemo(() => {
    const now = new Date()
    const d = new Date()
    d.setDate(d.getDate() + viewDayOffset)
    // Clamp to current month
    if (d.getMonth() !== now.getMonth() || d.getFullYear() !== now.getFullYear()) {
      return now // fallback to today if offset goes outside month
    }
    return d
  }, [viewDayOffset])
  const viewWeek    = Math.min(Math.floor((viewDate.getDate() - 1) / 7), WEEKS - 1)
  const viewDayIdx  = viewDate.getDay()
  const viewDateStr = `${viewDate.getFullYear()}-${String(viewDate.getMonth() + 1).padStart(2, '0')}-${String(viewDate.getDate()).padStart(2, '0')}`
  const isViewingToday = viewDayOffset === 0
  // Navigation bounds: stay within current month
  const canGoBack    = viewDate.getDate() > 1
  const canGoForward = viewDate.getDate() < lastDayOfMonth

  // ── Page navigation with debounce ─────────────────────────────────────────
  // A single ternary renders dashboard XOR sub-pages (never both), making
  // visual duplication structurally impossible.  The rAF debounce is an extra
  // safety layer against rapid double-clicks.
  const [page, _setPage] = useState('dashboard')
  const navigatingRef = useRef(false)
  const setPage = useCallback((p) => {
    if (navigatingRef.current) return
    navigatingRef.current = true
    _setPage(p)
    requestAnimationFrame(() => { navigatingRef.current = false })
  }, [])
  const [primaryTab, setPrimaryTab] = useState('calendar')
  const [tab,  setTab]  = useState('today')
  const [dbLoading, setDbLoading] = useState(true)
  const [dbError,   setDbError]   = useState(null)
  const [aiWidgetOpen, setAiWidgetOpen] = useState(false)
  const [presentMode, setPresentMode] = useState(false)
  // Stable callbacks for AI widget — avoids new function refs on every render
  const toggleAiWidget = useCallback(() => setAiWidgetOpen(o => !o), [])
  const closeAiWidget  = useCallback(() => setAiWidgetOpen(false), [])

  // Force password setup for invited users
  const [needsPassword, setNeedsPassword] = useState(false)
  const [newPw, setNewPw] = useState('')
  const [pwConfirm, setPwConfirm] = useState('')
  const [pwError, setPwError] = useState('')
  const [pwSaving, setPwSaving] = useState(false)
  const passwordSetDone = useRef(false)
  const dataLoadedRef = useRef(false) // prevents loadAll from running more than once
  const mountedRef = useRef(true)     // tracks whether Dashboard is mounted for async safety

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
  const [newListDate, setNewListDate] = useState('')
  const [newExpiresDate, setNewExpiresDate] = useState('')
  const [editingListing, setEditingListing] = useState(null) // listing id in edit mode

  // Potential Listings
  const [potentialListings, setPotentialListings] = useState([])
  const [newPotAddr, setNewPotAddr] = useState('')
  const [newPotPrice, setNewPotPrice] = useState('')
  const [newPotComm, setNewPotComm] = useState('')
  const [newPotLeadSource, setNewPotLeadSource] = useState('')
  const [newPotListDate, setNewPotListDate] = useState('')
  const [newPotExpiresDate, setNewPotExpiresDate] = useState('')
  const [addPotExpanded, setAddPotExpanded] = useState(false)
  const [editingPotential, setEditingPotential] = useState(null)
  const [editingRep, setEditingRep] = useState(null) // buyer rep id in edit mode
  const [addListingExpanded, setAddListingExpanded] = useState(false)
  const [offerReceivedModal, setOfferReceivedModal] = useState(null) // null | { listing, offerPrice, offerNotes }

  // Buyer Rep Agreements
  const [buyerReps,     setBuyerReps]    = useState([])
  const [newRepClient,  setNewRepClient] = useState('')
  const [offerModal,    setOfferModal]   = useState(null) // null | { repId, repName }
  const [printBuyerRep, setPrintBuyerRep] = useState(null) // null | rep object for print modal
  const [expandedRep,   setExpandedRep]  = useState(null) // buyer rep id or null
  const [expandedChecklist, setExpandedChecklist] = useState(null) // pending deal id or null

  // Toast for error feedback
  const [toast, setToast] = useState(null) // { msg } or null
  const toastTimer = useRef(null)
  function showToast(msg, type = 'error') {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast({ msg, type })
    toastTimer.current = setTimeout(() => setToast(null), 4000)
  }
  // Clean up toast timer on unmount to prevent setState-after-unmount
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current) }, [])

  // ── Morning Briefing Agent ─────────────────────────────────────────────────
  const [briefingData, setBriefingData] = useState(null)
  const [briefingLoading, setBriefingLoading] = useState(false)
  const [briefingVisible, setBriefingVisible] = useState(false)
  const [briefingDismissed, setBriefingDismissed] = useState(false)
  const briefingFetched = useRef(false) // prevent double-fetch in StrictMode

  async function fetchBriefing(force = false) {
    if (briefingLoading) return
    setBriefingLoading(true)
    try {
      const tz = profile?.habit_prefs?.bio?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone
      const { data, error } = await supabase.functions.invoke('morning-briefing', {
        body: { force, timezone: tz },
      })
      if (error || data?.error) {
        if (data?.error === 'credits_exhausted') showToast('No AI credits remaining this month')
        else if (data?.error === 'subscription_required') { /* silently skip for non-subscribers */ }
        else if (data?.error !== 'disabled_by_team') showToast('Could not generate briefing')
        return
      }
      if (data?.briefing) {
        setBriefingData(data.briefing)
        setBriefingVisible(true)
      }
    } catch (e) { console.error('briefing error:', e) }
    finally { setBriefingLoading(false) }
  }

  // Pipeline
  const [offersMade,       setOffersMade]       = useState([])
  const [offersReceived,   setOffersReceived]   = useState([])
  const [pendingDeals,     setPendingDeals]     = useState([])
  const [closedDeals,      setClosedDeals]      = useState([])
  const [archivedDeals,    setArchivedDeals]    = useState([]) // closed deals archived from pipeline
  const [wentPendingCount, setWentPendingCount] = useState(0) // historical — includes archived
  const [offersMadeCount, setOffersMadeCount] = useState(0) // historical — includes archived
  const [offersReceivedCount, setOffersReceivedCount] = useState(0) // historical — includes archived
  const [closedCount,    setClosedCount]    = useState(0) // historical — includes archived (for goal tracking)

  // ── TC Dashboard state ──────────────────────────────────────────────────────
  const isTC = profile?.team_member_role === 'tc'
  // Synchronously override tab for TCs — no useEffect flash
  const TC_TABS = new Set(['tc-dashboard', 'calendar'])
  const activeTab = isTC && !TC_TABS.has(primaryTab) ? 'tc-dashboard' : primaryTab
  const [tcDeals, setTcDeals] = useState([]) // pending deals assigned to this TC
  const [tcExpandedChecklist, setTcExpandedChecklist] = useState(null) // deal id or null
  const [tcAgentFilter, setTcAgentFilter] = useState('all') // 'all' or agent user_id
  const [tcLoading, setTcLoading] = useState(false)

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
  const [aiTaskGenScope, setAiTaskGenScope] = useState(null) // null | 'today' | 'week'
  const [plannerPrint,        setPlannerPrint]        = useState(null)  // { wi, di, dateStr } | null
  const [plannerTaskForm,     setPlannerTaskForm]     = useState(null)  // { wi, di } | null
  const [plannerForm,         setPlannerForm]         = useState({ label:'', icon:'🏠', xp:15 })
  const [plannerDeletedTasks, setPlannerDeletedTasks] = useState([])    // day-specific tasks deleted this session
  // Google Calendar — server-side token management (no localStorage)
  const [gcalConnected, setGcalConnected] = useState(false)
  const [gcalSyncing, setGcalSyncing] = useState(false)

  const [standup,       setStandup]       = useState({ q1:'', q2:'', q3:'' })
  const [standupDone,   setStandupDone]   = useState(false)
  const [standupSaving, setStandupSaving] = useState(false)
  const [standupModalOpen, setStandupModalOpen] = useState(false)
  const standupAutoShown = useRef(false)
  const [pipelineView, setPipelineView] = useState('list')   // 'list' | 'board'
  const [listingsPipelineView, setListingsPipelineView] = useState('list')
  const [buyersPipelineView, setBuyersPipelineView] = useState('list')
  const [showGci, setShowGci] = useState(false)
  const [clientUpdateListing, setClientUpdateListing] = useState(null)
  const [clientUpdateNotes, setClientUpdateNotes] = useState('')
  const [clientUpdateEmailTo, setClientUpdateEmailTo] = useState('')
  const [clientUpdateName, setClientUpdateName] = useState('')
  const [reviewRequestDeal, setReviewRequestDeal] = useState(null) // { address } shown after close
  const [pendingReviewAddress, setPendingReviewAddress] = useState(null) // queued until celebration dismissed
  const [reviewRequestName, setReviewRequestName] = useState('')
  const [reviewRequestEmail, setReviewRequestEmail] = useState('')
  const [todayDate] = useState(() => getTodayStr(profile?.habit_prefs?.bio?.timezone)) // YYYY-MM-DD, timezone-aware, stable across re-renders

  // Track mount status for async safety — prevents stale setState calls after unmount
  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  // ── Duplication sentinel ─────────────────────────────────────────────────────
  // Detects if Chrome (HMR, bfcache, or React reconciliation edge-case) ever
  // leaves two Dashboard trees in the DOM simultaneously.  Logs diagnostics and
  // removes the stale duplicate so the user never sees doubled content.
  useEffect(() => {
    const el = document.getElementById('rg-dashboard')
    if (el && el !== document.querySelector('#rg-dashboard')) {
      // Should never happen — id is unique — but guard anyway
      console.error('[Dashboard] duplicate #rg-dashboard detected on mount')
    }
    const check = setInterval(() => {
      const pages = document.querySelectorAll('.page')
      if (pages.length > 1) {
        console.error(`[Dashboard] DUPLICATION: ${pages.length} .page elements — removing stale copies`)
        // Keep the last one (the freshest React tree) and remove older ones
        for (let i = 0; i < pages.length - 1; i++) pages[i].remove()
      }
    }, 3000)
    return () => clearInterval(check)
  }, [])

  // Depend on user.id only — prevents re-running when a new user object is created
  // (e.g. on token refresh) while the same user is still logged in.
  useEffect(()=>{
    if (!user?.id || dataLoadedRef.current) return
    dataLoadedRef.current = true
    loadAll()
  },[user?.id])

  // Safety net: if dbLoading stays true for >12s (e.g. loadAll hung or threw
  // outside the try/catch), force it to false so the UI never gets permanently stuck.
  useEffect(() => {
    if (!dbLoading) return
    const timer = setTimeout(() => {
      setDbLoading(false)
      if (!dataLoadedRef.current) setDbError('Loading timed out — please refresh the page.')
    }, 12000)
    return () => clearTimeout(timer)
  }, [dbLoading])

  async function loadAll() {
    if (!user || !mountedRef.current) return
    setDbLoading(true)
    setDbError(null)
    let habRes, listRes, txRes, profRes, ctRes
    try {
      ;[habRes, listRes, txRes, profRes, ctRes] = await Promise.all([
        supabase.from('habit_completions').select('*').eq('user_id',user.id).eq('month_year',MONTH_YEAR),
        supabase.from('listings').select('*').eq('user_id',user.id).limit(500),
        supabase.from('transactions').select('*').eq('user_id',user.id).eq('month_year',MONTH_YEAR).limit(500),
        supabase.from('profiles').select('*').eq('id',user.id).single(),
        supabase.from('custom_tasks').select('*').eq('user_id',user.id).limit(200),
      ])
    // Bail out if component unmounted while waiting for data
    if (!mountedRef.current) return

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
      const toTask = t => ({ id:t.id, label:t.label, icon:t.icon, xp:t.xp, isDefault:t.is_default, specificDate:t.specific_date, googleEventId:t.google_event_id||null, eventTime:t.event_time||null, eventEndTime:t.event_end_time||null })
      const allNonDeleted = ctRes.data.filter(t => !t.is_deleted).map(toTask)
      // Split: tasks skipped for today go to skippedTodayTasks, rest stay in customTasks
      const persistedSkips = (profRes.data?.habit_prefs?.skipped||{})[todayDate] || []
      setCustomTasks(allNonDeleted.filter(t => !t.isDefault || !persistedSkips.includes(String(t.id))))
      setSkippedTodayTasks(allNonDeleted.filter(t => t.isDefault && persistedSkips.includes(String(t.id))))
      setDeletedDefaultTasks(ctRes.data.filter(t => t.is_deleted).map(toTask))
    }

    if (listRes.data) {
      const allL = listRes.data
      const mapListing = l => ({
        id:l.id, address:l.address, status:l.status||'active',
        price:l.price||'', commission:l.commission||'', monthYear:l.month_year||'',
        createdAt:l.created_at||null, leadSource:l.lead_source||'', notes:l.notes||[],
        listDate:l.list_date||'', expiresDate:l.expires_date||''
      })
      const allListings = allL.filter(l => (l.unit_count ?? 1) !== 0)
      setListings(allListings.filter(l => l.status !== 'potential' && l.status !== 'closed' && l.status !== 'pending').map(mapListing))
      setPotentialListings(allListings.filter(l => l.status === 'potential').map(mapListing))
      setBuyerReps(allL.filter(l => l.unit_count === 0).map(r => ({
        id:r.id, clientName:r.address||'', status:r.status||'active', monthYear:r.month_year||'',
        buyerDetails:r.buyer_details||{}, createdAt:r.created_at||null
      })))
    }

    if (txRes.data) {
      const m = t => ({ id:t.id, address:t.address, price:t.price||'', commission:t.commission||'', status:t.status||'active', closedFrom:t.closed_from||'', createdAt:t.created_at||null, leadSource:t.lead_source||'', notes:t.notes||[], dealSide:t.deal_side||'', originalLeadSource:t.original_lead_source||'', checklist:t.checklist||[] })
      const active = t => t.status !== 'archived' // filter out archived items from display
      setOffersMade(    txRes.data.filter(t=>t.type==='offer_made' && active(t)).map(m))
      setOffersReceived(txRes.data.filter(t=>t.type==='offer_received' && active(t)).map(m))
      // Backfill default checklist for existing pending deals that have none
      const pendingRows = txRes.data.filter(t=>t.type==='pending' && active(t)).map(t => {
        const row = m(t)
        if (row.checklist.length === 0) {
          row.checklist = DEFAULT_CHECKLIST.map(i=>({...i}))
          // Persist backfill to DB (fire-and-forget)
          if (row.id && !String(row.id).startsWith('tmp-')) {
            safeDb(supabase.from('transactions').update({checklist:row.checklist}).eq('id',row.id))
          }
        }
        return row
      })
      setPendingDeals(pendingRows)
      // Backfill tc_id for pending deals that don't have a TC assigned yet
      if (profileTeamId) {
        const unassigned = txRes.data.filter(t => t.type === 'pending' && active(t) && !t.tc_id)
        if (unassigned.length > 0) {
          const { data: tcs } = await supabase.from('team_members').select('user_id').eq('team_id', profileTeamId).eq('role', 'tc').limit(1)
          if (tcs?.length > 0) {
            const tcId = tcs[0].user_id
            const tcCl = TC_DEFAULT_CHECKLIST.map(i=>({...i}))
            for (const t of unassigned) {
              safeDb(supabase.from('transactions').update({ tc_id: tcId, tc_checklist: tcCl }).eq('id', t.id))
            }
          }
        }
      }
      setClosedDeals(   txRes.data.filter(t=>t.type==='closed' && active(t)).map(m))
      setArchivedDeals( txRes.data.filter(t=>t.type==='closed' && t.status==='archived').map(m))
      setClosedCount(txRes.data.filter(t=>t.type==='closed').length)
      // Historical counts — a deal that moved forward still counts toward its earlier stage
      // closedFrom='Offers' means the deal was once an offer; checklist presence means it was pending
      setOffersMadeCount(txRes.data.filter(t=>t.type==='offer_made'||(t.closed_from==='Offers'&&(t.deal_side==='buyer'||(!t.deal_side&&t.closed_from!=='Listing')))).length)
      setOffersReceivedCount(txRes.data.filter(t=>t.type==='offer_received'||(t.closed_from==='Offers'&&(t.deal_side==='seller'||!t.deal_side))).length)
      setWentPendingCount(txRes.data.filter(t=>t.type==='pending'||(t.type==='closed'&&Array.isArray(t.checklist)&&t.checklist.length>0)).length)
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
    // ── Load TC Dashboard data (if user is a TC) ────────────────────────────
    // Check TC role directly from DB since AuthContext profile may not have
    // team_member_role set yet when loadAll runs (timing issue).
    let isLoadAllTC = profile?.team_member_role === 'tc'
    if (!isLoadAllTC && profRes.data?.team_id) {
      const { data: tmRow } = await supabase.from('team_members').select('role').eq('user_id', user.id).eq('team_id', profRes.data.team_id).single()
      if (tmRow?.role === 'tc') isLoadAllTC = true
    }
    if (isLoadAllTC) {
      try {
        // Auto-assign any unassigned pending deals from team to this TC
        const { data: rpcResult, error: rpcErr } = await supabase.rpc('assign_pending_deals_to_tc')
        console.log('TC auto-assign RPC result:', rpcResult, 'error:', rpcErr?.message || 'none')
        // Then fetch TC's assigned deals
        const { data: tcRows, error: tcErr } = await supabase
          .from('transactions')
          .select('*')
          .eq('tc_id', user.id)
          .in('type', ['pending'])
          .order('created_at', { ascending: false })
          .limit(200)
        console.log('TC deals query:', tcRows?.length || 0, 'rows, error:', tcErr?.message || 'none')
        if (mountedRef.current && tcRows) {
          // Fetch agent names for these deals
          const agentIds = [...new Set(tcRows.map(t => t.user_id).filter(Boolean))]
          let nameMap = {}
          if (agentIds.length > 0) {
            const { data: agents } = await supabase.from('profiles').select('id,full_name').in('id', agentIds)
            nameMap = Object.fromEntries((agents||[]).map(a => [a.id, a.full_name || 'Agent']))
          }
          setTcDeals(tcRows.map(t => ({
            id: t.id,
            address: t.address || '',
            price: t.price || '',
            commission: t.commission || '',
            dealSide: t.deal_side || '',
            agentName: nameMap[t.user_id] || 'Agent',
            agentId: t.user_id,
            createdAt: t.created_at,
            checklist: t.checklist || [],
            tcChecklist: t.tc_checklist || [],
            milestones: { ...DEFAULT_TC_MILESTONES, ...(t.tc_milestones || {}) },
          })))
        }
      } catch (tcErr) {
        console.error('TC deals load error:', tcErr)
      }
    }

    } catch (err) {
      console.error('Dashboard loadAll error:', err)
      setDbError('Could not load your data. Check your connection and try again.')
    } finally {
      setDbLoading(false)
    }
  }

  // ── TC Checklist handlers ─────────────────────────────────────────────────
  async function tcToggleChecklistItem(dealId, itemId) {
    setTcDeals(prev => prev.map(d => {
      if (d.id !== dealId) return d
      const updated = (d.tcChecklist || []).map(i =>
        i.id === itemId ? { ...i, done: !i.done, completedAt: !i.done ? new Date().toISOString() : null } : i
      )
      return { ...d, tcChecklist: updated }
    }))
    const deal = tcDeals.find(d => d.id === dealId)
    if (deal) {
      const updated = (deal.tcChecklist || []).map(i =>
        i.id === itemId ? { ...i, done: !i.done, completedAt: !i.done ? new Date().toISOString() : null } : i
      )
      safeDb(supabase.from('transactions').update({ tc_checklist: updated }).eq('id', dealId))
    }
  }

  async function tcAddChecklistItem(dealId, label) {
    const newItem = { id: `tc-custom-${Date.now()}`, label: label.trim(), done: false }
    setTcDeals(prev => prev.map(d => {
      if (d.id !== dealId) return d
      return { ...d, tcChecklist: [...(d.tcChecklist || []), newItem] }
    }))
    const deal = tcDeals.find(d => d.id === dealId)
    if (deal) {
      const updated = [...(deal.tcChecklist || []), newItem]
      safeDb(supabase.from('transactions').update({ tc_checklist: updated }).eq('id', dealId))
    }
  }

  async function tcRemoveChecklistItem(dealId, itemId) {
    setTcDeals(prev => prev.map(d => {
      if (d.id !== dealId) return d
      return { ...d, tcChecklist: (d.tcChecklist || []).filter(i => i.id !== itemId) }
    }))
    const deal = tcDeals.find(d => d.id === dealId)
    if (deal) {
      const updated = (deal.tcChecklist || []).filter(i => i.id !== itemId)
      safeDb(supabase.from('transactions').update({ tc_checklist: updated }).eq('id', dealId))
    }
  }

  async function tcUpdateDueDate(dealId, itemId, dueDate) {
    setTcDeals(prev => prev.map(d => {
      if (d.id !== dealId) return d
      const updated = (d.tcChecklist || []).map(i => i.id === itemId ? { ...i, dueDate } : i)
      return { ...d, tcChecklist: updated }
    }))
    const deal = tcDeals.find(d => d.id === dealId)
    if (deal) {
      const updated = (deal.tcChecklist || []).map(i => i.id === itemId ? { ...i, dueDate } : i)
      safeDb(supabase.from('transactions').update({ tc_checklist: updated }).eq('id', dealId))
    }
  }

  // ── TC Milestone handlers ──────────────────────────────────────────────────
  async function tcUpdateMilestone(dealId, updates) {
    setTcDeals(prev => prev.map(d => {
      if (d.id !== dealId) return d
      const newMilestones = { ...d.milestones, ...updates }
      return { ...d, milestones: newMilestones }
    }))
    const deal = tcDeals.find(d => d.id === dealId)
    if (deal) {
      const newMilestones = { ...deal.milestones, ...updates }
      safeDb(supabase.from('transactions').update({ tc_milestones: newMilestones }).eq('id', dealId))
    }
  }

  async function tcSetStage(dealId, stage) {
    const updates = { stage }
    if (stage === 'closed') updates.closed_at = new Date().toISOString()
    tcUpdateMilestone(dealId, updates)
  }

  async function tcFileExtension(dealId, newDate, notes) {
    tcUpdateMilestone(dealId, {
      extension_filed: true,
      extension_new_date: newDate,
      extension_notes: notes,
    })
  }

  async function tcMarkFallenThrough(dealId, reason) {
    tcUpdateMilestone(dealId, {
      fallen_through: true,
      fallen_through_reason: reason,
      stage: 'fallen_through',
    })
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

  // ── Morning Briefing: pre-load cached data (never auto-show) ───────────────
  // Only pre-loads today's cached briefing so clicking the button is instant.
  // The modal is never shown automatically — user must click the Briefing button.
  useEffect(() => {
    if (dbLoading || !profile || briefingFetched.current) return
    if (profile.team_member_role === 'tc') return
    if (profile.team_id && profile.teams?.team_prefs?.ai_tools?.briefing_enabled === false) return
    const bp = profile.habit_prefs?.morning_briefing
    if (bp?.enabled === false) return
    briefingFetched.current = true
    const todayISO = new Date().toISOString().slice(0, 10)
    if (bp?.last_date === todayISO && bp?.last_data) {
      // Pre-load cached data so the button shows it instantly (no auto-show)
      setBriefingData(bp.last_data)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbLoading])

  // ── Daily Standup popup — auto-show once per day for team members who haven't submitted ──
  useEffect(() => {
    if (dbLoading || !profile || standupAutoShown.current) return
    if (!isOnTeam || isTeamOwner) return // only team members (not owner)
    if (standupDone) return // already submitted today
    standupAutoShown.current = true
    setStandupModalOpen(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbLoading, standupDone])

  // ESC key closes any open modal — use refs to avoid re-attaching listener on every modal change
  const modalsRef = useRef({})
  modalsRef.current = { offerModal, offerReceivedModal, addTaskModal, aiTaskGenScope, showPrint, plannerPrint, showWeeklyUpdate, showBuyersUpdate, aiWidgetOpen, briefingVisible, standupModalOpen }
  useEffect(() => {
    const onKey = e => {
      if (e.key !== 'Escape') return
      const m = modalsRef.current
      if (m.standupModalOpen)  setStandupModalOpen(false)
      else if (m.briefingVisible)   { setBriefingVisible(false); setBriefingDismissed(true) }
      else if (m.aiWidgetOpen)      setAiWidgetOpen(false)
      else if (m.aiTaskGenScope) setAiTaskGenScope(null)
      else if (m.offerReceivedModal) setOfferReceivedModal(null)
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

  // Redirect ai-assistant page navigation to floating widget.
  // Uses _setPage directly to bypass the rAF debounce in setPage — the
  // debounce's navigatingRef may still be true when this effect fires,
  // which would silently swallow the redirect and leave the page stuck.
  useEffect(() => {
    if (page === 'ai-assistant') {
      _setPage('dashboard')
      setAiWidgetOpen(true)
    }
  }, [page])

  // Check if invited user needs to set a password (only once per session).
  // Guard: skip if already triggered or if password was already set.
  const passwordSetVal = profile?.habit_prefs?.password_set
  useEffect(() => {
    if (passwordSetDone.current) return
    // Skip if user already has an email/password identity (they set it already)
    const hasEmailIdentity = user?.identities?.some(i => i.provider === 'email')
    if (!dbLoading && user?.user_metadata?.team_id && !passwordSetVal && !hasEmailIdentity) {
      passwordSetDone.current = true
      setNeedsPassword(true)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbLoading, user?.user_metadata?.team_id, passwordSetVal])

  async function handleSetPassword() {
    setPwError('')
    if (newPw.length < 6) { setPwError('Password must be at least 6 characters.'); return }
    if (newPw !== pwConfirm) { setPwError('Passwords do not match.'); return }
    setPwSaving(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPw })
      if (error) throw error
      passwordSetDone.current = true
      // Read current prefs from DB to avoid overwriting with stale local state
      const { data: freshProfile } = await supabase.from('profiles').select('habit_prefs').eq('id', user.id).single()
      const currentPrefs = freshProfile?.habit_prefs || habitPrefs || {}
      const newPrefs = { ...currentPrefs, password_set: true }
      setHabitPrefs(newPrefs)
      const { error: updateError } = await supabase.from('profiles').update({ habit_prefs: newPrefs }).eq('id', user.id)
      if (updateError) throw updateError
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
    if (type === 'offer_made') setOffersMadeCount(prev => Math.max(0, prev - 1))
    if (type === 'offer_received') setOffersReceivedCount(prev => Math.max(0, prev - 1))
  }

  // Persist a new Offer Made to DB, award XP, return saved row with real ID
  async function handleOfferMadeAdd(tmpRow) {
    const data = await dbInsert('offer_made', tmpRow)
    if (!data) return null
    setOffersMadeCount(prev => prev + 1)
    await awardPipelineXp('offer_made', '#0ea5e9')
    return { id:data.id, address:data.address||tmpRow.address, price:data.price||'', commission:data.commission||'', status:'active', closedFrom:'' }
  }

  // Persist a new Offer Received to DB, award XP, return saved row with real ID
  async function handleOfferReceivedAdd(tmpRow) {
    const data = await dbInsert('offer_received', tmpRow)
    if (!data) return null
    setOffersReceivedCount(prev => prev + 1)
    await awardPipelineXp('offer_received', '#8b5cf6')
    return { id:data.id, address:data.address||tmpRow.address, price:data.price||'', commission:data.commission||'', status:'active', closedFrom:'' }
  }

  // ── Profile habit prefs (for per-user skip) ────────────────────────────────
  async function saveProfileHabitPrefs(newPrefs) {
    setHabitPrefs(newPrefs)
    await safeDb(supabase.from('profiles').update({ habit_prefs: newPrefs }).eq('id', user.id))
  }

  // ── Task time assignment ──────────────────────────────────────────────────
  function setTaskTime(taskId, time) {
    const newTimes = { ...(habitPrefs.taskTimes || {}) }
    if (time) newTimes[taskId] = time
    else delete newTimes[taskId]
    saveProfileHabitPrefs({ ...habitPrefs, taskTimes: newTimes })
  }

  // ── Task reordering ────────────────────────────────────────────────────────
  function getOrderedTasksForDate(dateStr, recHabits, daySpecific) {
    const all = [...recHabits, ...daySpecific.map(t => ({ ...t, isDaySpecific: true }))]
    const dayOrder = habitPrefs.dayOrder?.[dateStr]
    // Auto-sort: tasks with a time come first (chronologically), then tasks without time
    // Manual dayOrder overrides only within the no-time group
    const withTime = all.filter(t => t.eventTime).sort((a, b) => a.eventTime.localeCompare(b.eventTime))
    const noTime   = all.filter(t => !t.eventTime)
    if (dayOrder?.length) {
      const idx = {}; dayOrder.forEach((id, i) => idx[id] = i)
      noTime.sort((a, b) => (idx[a.id] ?? 999) - (idx[b.id] ?? 999))
    }
    return [...withTime, ...noTime]
  }

  function moveTask(dateStr, orderedList, taskId, direction) {
    const ids = orderedList.map(t => t.id)
    const i = ids.indexOf(taskId)
    if (i < 0) return
    const j = i + direction
    if (j < 0 || j >= ids.length) return
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    // Also update the global recurring order for non-day-specific items
    const recurringIds = ids.filter(id => {
      const t = orderedList.find(x => x.id === id)
      return t && !t.isDaySpecific
    })
    const newPrefs = {
      ...habitPrefs,
      order: recurringIds,
      dayOrder: { ...(habitPrefs.dayOrder || {}), [dateStr]: ids }
    }
    saveProfileHabitPrefs(newPrefs)
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

  async function addTaskToday(label, icon, xp, eventTime) {
    try {
      const insert = {
        user_id:user.id, label, icon, xp:Number(xp)||15,
        is_default:false, specific_date:viewDateStr
      }
      if (eventTime) insert.event_time = eventTime
      const {data, error} = await supabase.from('custom_tasks').insert(insert).select().single()
      if (error) throw error
      if (data) setCustomTasks(prev => [...prev, {
        id:data.id, label:data.label, icon:data.icon, xp:data.xp,
        isDefault:false, specificDate:data.specific_date, eventTime:data.event_time||null
      }])
    } catch(e) { console.error('addTaskToday error:', e) }
    setAddTaskModal(false)
  }

  async function addTaskForDay(weekIdx, dayIdx, label, icon, xp, eventTime) {
    const specificDate = dateStrForDay(weekIdx, dayIdx)
    if (!specificDate || !label.trim()) return
    try {
      const insert = {
        user_id:user.id, label, icon, xp:Number(xp)||15,
        is_default:false, specific_date:specificDate,
      }
      if (eventTime) insert.event_time = eventTime
      const { data, error } = await supabase.from('custom_tasks').insert(insert).select().single()
      if (error) throw error
      if (data) setCustomTasks(prev => [...prev, {
        id:data.id, label:data.label, icon:data.icon, xp:data.xp,
        isDefault:false, specificDate:data.specific_date, eventTime:data.event_time||null,
      }])
    } catch(e) { console.error('addTaskForDay error:', e) }
    setPlannerTaskForm(null)
    setPlannerForm({ label:'', icon:'🏠', xp:15, time:'' })
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
      // Gcal events: soft-delete so they don't reappear on next sync
      // Regular tasks: hard-delete
      const isGcal = prev?.googleEventId
      const { error } = isGcal
        ? await supabase.from('custom_tasks').update({ is_deleted: true }).eq('id', id).eq('user_id', user.id)
        : await supabase.from('custom_tasks').delete().eq('id', id).eq('user_id', user.id)
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

  // ── Google Calendar (fully server-side — no client tokens) ────────────────

  // Check connection status on mount and auto-sync if connected
  useEffect(() => {
    if (!user?.id) return
    // Ensure session is fresh before calling edge function (prevents stale JWT 401s)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.access_token) return
      supabase.functions.invoke('google-auth', { body: { action: 'status' } })
        .then(({ data }) => {
          if (data?.connected) { setGcalConnected(true) } // don't auto-sync — user clicks Sync
        })
        .catch(e => console.error('gcal status check error:', e))
    })
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  function connectGoogleCalendar() {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
    if (!clientId) { showToast('Set VITE_GOOGLE_CLIENT_ID in .env'); return }
    if (!window.google?.accounts?.oauth2) { showToast('Google API still loading — try again'); return }
    const client = window.google.accounts.oauth2.initCodeClient({
      client_id: clientId,
      scope: 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly',
      ux_mode: 'popup',
      callback: async (resp) => {
        if (resp.error) { showToast('Google Calendar auth failed'); return }
        try {
          const { data, error } = await supabase.functions.invoke('google-auth', {
            body: { action: 'exchange', code: resp.code }
          })
          if (error) { showToast('Failed to connect Google Calendar'); return }
          if (data?.error === 'no_refresh_token') {
            showToast('Please disconnect Google Calendar first, then reconnect'); return
          }
          if (data?.error) { showToast(data.error); return }
          setGcalConnected(true)
          await syncGoogleCalendar()
        } catch (e) { console.error('Google auth exchange error:', e); showToast('Failed to connect Google Calendar') }
      }
    })
    client.requestCode()
  }

  async function disconnectGoogleCalendar() {
    setGcalConnected(false)
    try { await supabase.functions.invoke('google-auth', { body: { action: 'disconnect' } }) }
    catch (e) { console.error('Google disconnect error:', e) }
    showToast('Google Calendar disconnected')
  }

  async function clearGcalEvents() {
    const visibleGcal = customTasks.filter(t => t.googleEventId)
    setCustomTasks(p => p.filter(t => !t.googleEventId))
    try {
      // Hard-delete ALL gcal rows (including soft-deleted) so a fresh sync can re-add them
      const { error } = await supabase.from('custom_tasks').delete().eq('user_id', user.id).not('google_event_id', 'is', null)
      if (error) throw error
      showToast('Cleared all synced events — re-sync to refresh', 'success')
    } catch (e) {
      console.error('clearGcalEvents error:', e)
      if (visibleGcal.length) setCustomTasks(prev => [...prev, ...visibleGcal])
      showToast('Failed to clear events')
    }
  }

  async function syncGoogleCalendar() {
    if (gcalSyncing) return
    setGcalSyncing(true)
    try {
      const tz = habitPrefs.bio?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Los_Angeles'
      const { data, error } = await supabase.functions.invoke('google-auth', { body: { action: 'sync', timezone: tz } })
      if (error || data?.error) {
        if (data?.error === 'not_connected' || data?.error === 'token_revoked') {
          setGcalConnected(false)
          showToast('Google Calendar disconnected — please reconnect')
        } else { showToast('Failed to sync calendar') }
        return
      }
      const events = data.events || []
      console.log('[GCal] Fetched', events.length, 'events from Google Calendar')
      const batch = events.map(e => ({
        label: e.summary,
        specific_date: e.date,
        google_event_id: e.google_event_id,
        event_time: e.time || null,
        event_end_time: e.end_time || null,
      }))
      const { data: inserted, error: rpcErr } = await supabase.rpc('sync_gcal_events', { events: batch })
      if (rpcErr) { console.error('[GCal] RPC error:', rpcErr.message); showToast('Sync failed: ' + rpcErr.message); return }
      const rows = inserted || []
      if (rows.length > 0) {
        setCustomTasks(prev => [...prev, ...rows.map(r => ({ id:r.id, label:r.label, icon:r.icon, xp:r.xp, isDefault:false, specificDate:r.specific_date, googleEventId:r.google_event_id, eventTime:r.event_time||null, eventEndTime:r.event_end_time||null }))])
      }
      console.log('[GCal] Sync complete:', rows.length, 'added')
      showToast(rows.length > 0 ? `Synced ${rows.length} event${rows.length !== 1 ? 's' : ''} from Google Calendar` : 'Calendar is up to date', 'success')
    } catch (e) { console.error('syncGoogleCalendar error:', e); showToast('Failed to sync calendar') }
    finally { setGcalSyncing(false) }
  }

  async function addToGoogleCalendar(task, dateStr) {
    if (!gcalConnected) { connectGoogleCalendar(); return }
    try {
      const { data, error } = await supabase.functions.invoke('google-auth', {
        body: { action: 'add_event', summary: task.label, date: dateStr, description: `RealtyGrind task — ${task.xp} XP` }
      })
      if (error || data?.error) {
        if (data?.error === 'not_connected') { setGcalConnected(false); showToast('Please reconnect Google Calendar'); return }
        showToast('Failed to add to Google Calendar'); return
      }
      showToast(`Added "${task.label}" to Google Calendar`, 'success')
    } catch (e) { console.error('addToGoogleCalendar error:', e); showToast('Failed to add to calendar') }
  }

  // ── AI Task Generation ──────────────────────────────────────────────────────
  async function generateAiTasks(scope, guidance, timeBounds) {
    // Get a fresh token (refresh proactively if expiring within 60s)
    let token = null
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.access_token) {
      const expiresAt = session.expires_at ?? 0
      if (expiresAt - Math.floor(Date.now() / 1000) < 60) {
        const { data } = await supabase.auth.refreshSession()
        token = data.session?.access_token || null
      } else {
        token = session.access_token
      }
    }
    if (!token) return { error: 'Not authenticated. Please sign in again.' }

    // Assemble dates — only today and future, never past
    const now = new Date()
    const todayStr = now.toISOString().slice(0, 10)
    const currentTime24 = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`
    const dates = []
    if (scope === 'today') {
      dates.push(todayStr)
    } else {
      // Next 7 days starting from today, optionally skipping weekends
      const skipWeekends = timeBounds && timeBounds.includeWeekends === false
      for (let i = 0; i < 7; i++) {
        const day = new Date(now)
        day.setDate(now.getDate() + i)
        const dow = day.getDay() // 0=Sun, 6=Sat
        if (skipWeekends && (dow === 0 || dow === 6)) continue
        dates.push(day.toISOString().slice(0, 10))
      }
    }

    // Assemble context from existing state
    const bio = habitPrefs.bio || {}
    const goals = profile?.goals || {}
    const existingForDates = customTasks
      .filter(t => t.specificDate && dates.includes(t.specificDate))
      .map(t => ({ date: t.specificDate, label: t.label, time: t.eventTime || null, endTime: t.eventEndTime || null, isCalendarEvent: !!t.googleEventId }))

    // Aggregate habit activity this month
    const activityThisMonth = {}
    Object.entries(counters).forEach(([key, val]) => {
      const hid = key.split('-')[0]
      if (!activityThisMonth[hid]) activityThisMonth[hid] = 0
      activityThisMonth[hid] += (val || 0)
    })

    const pendingWithChecklist = pendingDeals.map(d => {
      const cl = Array.isArray(d.checklist) ? d.checklist : []
      const overdue = cl.filter(i => !i.done && i.dueDate && new Date(i.dueDate) < new Date()).map(i => i.label)
      return { address: d.address, price: d.price, checklist_overdue: overdue }
    })

    const activeListingsCtx = listings
      .filter(l => l.status !== 'closed' && (l.unit_count || 0) >= 1)
      .slice(0, 20)
      .map(l => {
        const dom = l.list_date ? Math.floor((Date.now() - new Date(l.list_date).getTime()) / 86400000) : null
        return { address: l.address, price: l.price, status: l.status, dom, expires_date: l.expires_date }
      })

    const buyerRepsCtx = buyerReps.slice(0, 15).map(b => {
      const d = b.buyer_details || {}
      return {
        clientName: b.address || 'Buyer',
        dateExpires: d.dateExpires || null,
        lastCallDate: d.lastCallDate || null,
        locationPrefs: d.locationPrefs || null,
        timeline: d.timeline || null,
      }
    })

    const standup = habitPrefs.standup_today?.date === viewDateStr ? habitPrefs.standup_today : null

    const context = {
      currentTime: currentTime24,
      today: todayStr,
      profile: { name: profile?.full_name, specialty: bio.specialty, about: bio.about, timezone: bio.timezone },
      goals,
      activeHabits: effectiveHabits.map(h => h.label),
      existingTasks: existingForDates,
      pipeline: {
        offers_made: offersMade.length,
        offers_received: offersReceived.length,
        pending: pendingDeals.length,
        closed: closedDeals.length,
        closed_volume: closedDeals.reduce((s, d) => s + (parseFloat(String(d.price).replace(/[^0-9.]/g, '')) || 0), 0),
      },
      pendingDeals: pendingWithChecklist,
      listings: activeListingsCtx,
      buyerReps: buyerRepsCtx,
      activityThisMonth,
      standup: standup ? { q1: standup.q1, q2: standup.q2, q3: standup.q3 } : null,
      teamGuidance: profile?.teams?.team_prefs?.ai_schedule_guidance || null,
      workdayStart: timeBounds?.startHour || '08:00',
      workdayEnd: timeBounds?.endHour || '18:00',
      includeWeekends: timeBounds?.includeWeekends !== false,
      isTC,
      tcDeals: isTC ? tcDeals.map(d => ({
        address: d.address, price: d.price, agentName: d.agentName,
        type: d.type, closingDate: d.closingDate,
        checklist: Array.isArray(d.checklist) ? d.checklist.filter(i => !i.done).map(i => ({ label: i.label, dueDate: i.dueDate })) : [],
      })) : [],
    }

    try {
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-generate-tasks`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            scope, dates, context, guidance: guidance || undefined,
            timeBounds: timeBounds ? { startHour: timeBounds.startHour, endHour: timeBounds.endHour } : undefined,
          }),
        }
      )
      const data = await resp.json()
      if (!resp.ok) return { error: data.message || data.error || 'Failed to generate tasks' }
      return data
    } catch (e) {
      console.error('generateAiTasks fetch error:', e)
      return { error: 'Network error. Please check your connection.' }
    }
  }

  // Clear all non-gcal tasks for given dates (so AI can rebuild fresh)
  async function clearTasksForDates(dates) {
    const toRemove = customTasks.filter(t =>
      t.specificDate && dates.includes(t.specificDate) && !t.googleEventId
    )
    if (!toRemove.length) return 0
    setCustomTasks(prev => prev.filter(t => !toRemove.find(r => r.id === t.id)))
    try {
      const ids = toRemove.map(t => t.id)
      const { error } = await supabase.from('custom_tasks').delete().in('id', ids).eq('user_id', user.id)
      if (error) throw error
    } catch (e) {
      console.error('clearTasksForDates error:', e)
      setCustomTasks(prev => [...prev, ...toRemove]) // rollback
    }
    return toRemove.length
  }

  async function insertAiGeneratedTasks(tasks) {
    if (!tasks?.length) return
    const inserts = tasks.map(t => ({
      user_id: user.id,
      label: t.label,
      icon: t.icon || '✅',
      xp: t.xp || 15,
      is_default: false,
      specific_date: t.date,
      event_time: t.time || null,
    }))
    try {
      const { data, error } = await supabase.from('custom_tasks').insert(inserts).select()
      if (error) throw error
      if (data?.length) {
        setCustomTasks(prev => [...prev, ...data.map(r => ({
          id: r.id, label: r.label, icon: r.icon, xp: r.xp,
          isDefault: false, specificDate: r.specific_date, eventTime: r.event_time || null,
        }))])
      }
      showToast(`Added ${data?.length || 0} AI-generated task${data?.length !== 1 ? 's' : ''}`, 'success')
    } catch (e) {
      console.error('insertAiGeneratedTasks error:', e)
      showToast('Failed to add tasks')
    }
  }

  // ── Pipeline helpers ───────────────────────────────────────────────────────
  async function dbInsert(type, item, closedFrom='', dealSide=null, originalLeadSource=null, buyerRepId=null) {
    const insertObj = {
      user_id:user.id, type, address:item.address||'', price:item.price||'',
      commission:item.commission||'', status:type==='closed'?'closed':'active',
      closed_from:closedFrom||item.closedFrom||null, month_year:MONTH_YEAR
    }
    if (dealSide) insertObj.deal_side = dealSide
    if (originalLeadSource) insertObj.original_lead_source = originalLeadSource
    if (buyerRepId) insertObj.buyer_rep_id = buyerRepId
    let {data, error} = await supabase.from('transactions').insert(insertObj).select().single()
    // If the insert failed (e.g. new columns not migrated), retry without them
    if (error && (dealSide || originalLeadSource || buyerRepId)) {
      console.warn('dbInsert retrying without deal_side/original_lead_source/buyer_rep_id:', error.message)
      delete insertObj.deal_side
      delete insertObj.original_lead_source
      delete insertObj.buyer_rep_id
      ;({data, error} = await supabase.from('transactions').insert(insertObj).select().single())
    }
    if (error) { console.error('dbInsert error:', error.message); return null }
    return data
  }
  async function dbDelete(id) {
    if (id && !String(id).startsWith('tmp-')) {
      const {error} = await supabase.from('transactions').delete().eq('id',id).eq('user_id',user.id)
      if (error) console.error('dbDelete error:', error.message)
    }
  }
  // Archive instead of delete — preserves historical counts for stat cards
  async function dbArchive(id) {
    if (id && !String(id).startsWith('tmp-')) {
      const {error} = await supabase.from('transactions').update({status:'archived'}).eq('id',id).eq('user_id',user.id)
      if (error) console.error('dbArchive error:', error.message)
    }
  }

  // ── Pipeline transition helpers ──────────────────────────────────────────
  // Single-record model: each deal is ONE row in the transactions table whose
  // `type` field is updated as it moves through stages.  No duplicate records,
  // no archiving, no ghost data.

  function markListingClosed(address) {
    const addr = (address||'').toLowerCase()
    if (!addr) return
    const listing = listings.find(l=>l.status!=='closed'&&(l.address||'').toLowerCase()===addr)
    if (listing) {
      // Update status in DB, then remove from listings state so it no longer shows in Listings tab
      safeDb(supabase.from('listings').update({ status:'closed' }).eq('id',listing.id).eq('user_id',user.id))
      setListings(prev => prev.filter(l => l.id !== listing.id))
    }
  }

  // ── TC auto-assignment helper ───────────────────────────────────────────────
  // When a deal goes pending, auto-assign the team's first TC and populate
  // the TC-specific checklist on the transaction.
  async function assignTCToDeal(dealId) {
    console.log('assignTCToDeal called:', { dealId, profileTeamId })
    if (!profileTeamId || !dealId || String(dealId).startsWith('tmp-')) {
      console.log('assignTCToDeal: skipped (no teamId or tmp deal)')
      return
    }
    try {
      const { data: tcs, error: tcQueryErr } = await supabase
        .from('team_members')
        .select('user_id')
        .eq('team_id', profileTeamId)
        .eq('role', 'tc')
        .limit(1)
      console.log('assignTCToDeal: found TCs:', tcs, 'error:', tcQueryErr?.message || 'none')
      if (tcs?.length > 0) {
        const tcId = tcs[0].user_id
        const tcCl = TC_DEFAULT_CHECKLIST.map(i=>({...i}))
        const { error } = await supabase.from('transactions').update({ tc_id: tcId, tc_checklist: tcCl }).eq('id', dealId)
        if (error) console.error('TC auto-assign update failed:', error.message)
        else console.log('assignTCToDeal: assigned tc_id', tcId, 'to deal', dealId)
      } else {
        console.log('assignTCToDeal: no TC found for team', profileTeamId)
      }
    } catch (err) {
      console.error('TC auto-assign error:', err)
    }
  }

  async function handleOfferStatus(row, newStatus, srcSetter) {
    const inferredSide = srcSetter === setOffersReceived ? 'seller' : 'buyer'
    if (newStatus === 'pending') {
      const cl = DEFAULT_CHECKLIST.map(i=>({...i}))
      const updateObj = { type:'pending', closed_from:'Offers', checklist:cl }
      if (row.id && !String(row.id).startsWith('tmp-')) {
        const {error} = await supabase.from('transactions').update(updateObj).eq('id',row.id).eq('user_id',user.id)
        if (error) { console.error('transition error:', error.message); showToast('Failed to update deal'); return }
        // Auto-assign TC
        assignTCToDeal(row.id)
      }
      srcSetter(prev => prev.filter(r => r.id !== row.id))
      setPendingDeals(prev=>[...prev,{...row,closedFrom:'Offers',dealSide:row.dealSide||inferredSide,checklist:cl}])
      setWentPendingCount(prev => prev + 1)
      await awardPipelineXp('went_pending', '#f59e0b')
    } else if (newStatus === 'closed') {
      const updateObj = { type:'closed', status:'closed', closed_from:row.closedFrom||'Offers' }
      if (row.id && !String(row.id).startsWith('tmp-')) {
        const {error} = await supabase.from('transactions').update(updateObj).eq('id',row.id).eq('user_id',user.id)
        if (error) { console.error('transition error:', error.message); showToast('Failed to update deal'); return }
      }
      srcSetter(prev => prev.filter(r => r.id !== row.id))
      setClosedDeals(prev=>[...prev,{...row,status:'closed',closedFrom:row.closedFrom||'Offers',dealSide:row.dealSide||inferredSide}])
      setClosedCount(prev => prev + 1)
      markListingClosed(row.address)
      const comm = resolveCommission(row.commission, row.price)
      setCelebration({ address:row.address||'Deal Closed', commission:comm > 0 ? fmtMoney(comm) : (row.commission||''), newComm:comm })
      setPendingReviewAddress(row.address || 'your property')
      await awardPipelineXp('closed', '#10b981')
    } else if (newStatus === 'declined') {
      srcSetter(prev => prev.filter(r => r.id !== row.id))
      await dbDelete(row.id)
    } else if (newStatus === 'countered') {
      const newPrice = window.prompt('Enter counter-offer price:', row.price || '')
      if (newPrice === null) return
      srcSetter(prev => prev.map(r => r.id === row.id ? {...r, price: newPrice} : r))
      if (row.id && !String(row.id).startsWith('tmp-')) {
        await safeDb(supabase.from('transactions').update({ price: newPrice }).eq('id', row.id).eq('user_id', user.id))
      }
    }
  }

  async function handlePendingStatus(row, newStatus) {
    if (newStatus === 'closed') {
      const updateObj = { type:'closed', status:'closed' }
      if (row.id && !String(row.id).startsWith('tmp-')) {
        const {error} = await supabase.from('transactions').update(updateObj).eq('id',row.id).eq('user_id',user.id)
        if (error) { console.error('transition error:', error.message); showToast('Failed to update deal'); return }
      }
      setPendingDeals(prev => prev.filter(r => r.id !== row.id))
      setClosedDeals(prev=>[...prev,{...row,status:'closed'}])
      setClosedCount(prev => prev + 1)
      markListingClosed(row.address)
      const comm = resolveCommission(row.commission, row.price)
      setCelebration({ address:row.address||'Deal Closed', commission:comm > 0 ? fmtMoney(comm) : (row.commission||''), newComm:comm })
      setPendingReviewAddress(row.address || 'your property')
      await awardPipelineXp('closed', '#10b981')
    }
  }

  // ── Archive closed deal from pipeline (moves it to Archived tab) ─────────
  // Accepts either a deal object (from PipelineSection remove) or a dealId string
  async function archiveDealFromPipeline(dealOrId) {
    const deal = typeof dealOrId === 'object' ? dealOrId : closedDeals.find(d => d.id === dealOrId)
    if (!deal) return
    const dealId = deal.id
    setClosedDeals(prev => prev.filter(d => d.id !== dealId))
    setArchivedDeals(prev => [...prev, {...deal, status:'archived'}])
    await safeDb(supabase.from('transactions').update({status:'archived'}).eq('id', dealId).eq('user_id', user.id))
  }

  // ── Checklist handlers ────────────────────────────────────────────────────
  function updateChecklist(dealId, updater) {
    // Use setState callback to guarantee we read the latest state (avoids stale closure bugs)
    setPendingDeals(prev => {
      const next = prev.map(r => {
        if (r.id !== dealId) return r
        const updated = typeof updater === 'function' ? updater(r.checklist||[]) : updater
        return { ...r, checklist: updated }
      })
      // Persist to DB from inside the callback where state is guaranteed current
      const deal = next.find(r => r.id === dealId)
      if (deal && dealId && !String(dealId).startsWith('tmp-')) {
        supabase.from('transactions').update({ checklist: deal.checklist })
          .eq('id', dealId).eq('user_id', user.id)
          .then(({ error }) => { if (error) console.error('Checklist save error:', error.message) })
      }
      return next
    })
  }
  function toggleChecklistItem(dealId, itemId) {
    updateChecklist(dealId, cl => cl.map(i => i.id === itemId
      ? { ...i, done: !i.done, completedAt: !i.done ? new Date().toISOString() : null }
      : i))
  }
  function addChecklistItem(dealId, label) {
    if (!label?.trim()) return
    updateChecklist(dealId, cl => [...cl, { id: Date.now().toString(36), label: label.trim(), done: false }])
  }
  function removeChecklistItem(dealId, itemId) {
    updateChecklist(dealId, cl => cl.filter(i => i.id !== itemId))
  }
  function updateChecklistDueDate(dealId, itemId, date) {
    updateChecklist(dealId, cl => cl.map(i => i.id === itemId ? { ...i, dueDate: date || null } : i))
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
      if (newListDate) insertObj.list_date = newListDate
      if (newExpiresDate) insertObj.expires_date = newExpiresDate
      let {data, error} = await supabase.from('listings').insert(insertObj).select().single()
      // If optional columns don't exist yet (migration not applied), retry without them
      if (error && (error.message?.includes('lead_source') || error.message?.includes('list_date') || error.message?.includes('expires_date') || error.message?.includes('column'))) {
        delete insertObj.lead_source; delete insertObj.list_date; delete insertObj.expires_date
        const retry = await supabase.from('listings').insert(insertObj).select().single()
        data = retry.data; error = retry.error
      }
      if (error) throw error
      if (data) {
        setListings(prev=>[...prev,{id:data.id,address:data.address,status:'active',price:data.price||'',commission:data.commission||'',monthYear:data.month_year||MONTH_YEAR,createdAt:data.created_at||null,leadSource:data.lead_source||'',notes:[],listDate:data.list_date||'',expiresDate:data.expires_date||''}])
        setNewAddr(''); setNewPrice(''); setNewComm(''); setNewLeadSource(''); setNewListDate(''); setNewExpiresDate('')
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
  const listingFieldMap = { leadSource:'lead_source', monthYear:'month_year', listDate:'list_date', expiresDate:'expires_date' }
  const NEW_LISTING_COLS = new Set(['list_date','expires_date']) // columns from migration — may not exist yet
  async function updateListing(id, field, val) {
    setListings(prev=>prev.map(l=>l.id===id?{...l,[field]:val}:l))
    const dbField = listingFieldMap[field] || field
    const r = await safeDb(supabase.from('listings').update({[dbField]:val}).eq('id',id).eq('user_id',user.id))
    if (!r.ok) {
      // If the column doesn't exist yet (migration not applied), silently skip
      if (NEW_LISTING_COLS.has(dbField)) { console.warn(`Column ${dbField} not found — run migration to enable.`); return }
      showToast('Failed to save listing change')
    }
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

  // ── Potential Listings CRUD ────────────────────────────────────────────────
  async function addPotentialListing() {
    if (!newPotAddr.trim()) return
    const rawComm = newPotComm.trim()
    const commVal = rawComm && !rawComm.endsWith('%') ? rawComm + '%' : rawComm
    try {
      const insertObj = { user_id:user.id, address:newPotAddr.trim(), unit_count:1,
        price:newPotPrice.trim(), commission:commVal, status:'potential', month_year:MONTH_YEAR }
      if (newPotLeadSource) insertObj.lead_source = newPotLeadSource
      if (newPotListDate) insertObj.list_date = newPotListDate
      if (newPotExpiresDate) insertObj.expires_date = newPotExpiresDate
      let {data, error} = await supabase.from('listings').insert(insertObj).select().single()
      if (error && (error.message?.includes('lead_source') || error.message?.includes('list_date') || error.message?.includes('expires_date') || error.message?.includes('column'))) {
        delete insertObj.lead_source; delete insertObj.list_date; delete insertObj.expires_date
        const retry = await supabase.from('listings').insert(insertObj).select().single()
        data = retry.data; error = retry.error
      }
      if (error) throw error
      if (data) {
        setPotentialListings(prev=>[...prev,{id:data.id,address:data.address,status:'potential',price:data.price||'',commission:data.commission||'',monthYear:data.month_year||MONTH_YEAR,createdAt:data.created_at||null,leadSource:data.lead_source||'',notes:[],listDate:data.list_date||'',expiresDate:data.expires_date||''}])
        setNewPotAddr(''); setNewPotPrice(''); setNewPotComm(''); setNewPotLeadSource(''); setNewPotListDate(''); setNewPotExpiresDate('')
        setAddPotExpanded(false)
      }
    } catch (err) {
      console.error('addPotentialListing error:', err)
      showToast('Failed to add potential listing: ' + (err.message || 'unknown error'))
    }
  }

  async function removePotentialListing(listing) {
    if (!window.confirm(`Remove potential listing "${listing.address}"?`)) return
    const snapshot = potentialListings
    setPotentialListings(prev=>prev.filter(l=>l.id!==listing.id))
    const r = await safeDb(supabase.from('listings').delete().eq('id',listing.id).eq('user_id',user.id))
    if (!r.ok) { setPotentialListings(snapshot); showToast('Failed to remove potential listing') }
  }

  function updatePotentialLocal(id, field, val) {
    setPotentialListings(prev=>prev.map(l=>l.id===id?{...l,[field]:val}:l))
  }
  async function updatePotentialListing(id, field, val) {
    setPotentialListings(prev=>prev.map(l=>l.id===id?{...l,[field]:val}:l))
    const dbField = listingFieldMap[field] || field
    const r = await safeDb(supabase.from('listings').update({[dbField]:val}).eq('id',id).eq('user_id',user.id))
    if (!r.ok) {
      if (NEW_LISTING_COLS.has(dbField)) { console.warn(`Column ${dbField} not found — run migration to enable.`); return }
      showToast('Failed to save potential listing change')
    }
  }
  function togglePotentialCommType(id) {
    setPotentialListings(prev => prev.map(l => {
      if (l.id !== id) return l
      const raw = String(l.commission || '').trim()
      const isPercent = raw.endsWith('%')
      const newComm = isPercent ? raw.replace(/%$/, '') : (raw ? raw + '%' : '%')
      return { ...l, commission: newComm }
    }))
    const row = potentialListings.find(l => l.id === id)
    if (row) {
      const raw = String(row.commission || '').trim()
      const isPercent = raw.endsWith('%')
      const newComm = isPercent ? raw.replace(/%$/, '') : (raw ? raw + '%' : '%')
      safeDb(supabase.from('listings').update({ commission: newComm }).eq('id', id).eq('user_id', user.id))
    }
  }

  async function promotePotential(listing) {
    const r = await safeDb(supabase.from('listings').update({status:'active'}).eq('id',listing.id).eq('user_id',user.id))
    if (!r.ok) { showToast('Failed to promote listing'); return }
    setPotentialListings(prev=>prev.filter(l=>l.id!==listing.id))
    setListings(prev=>[...prev,{...listing, status:'active'}])
    showToast(`"${listing.address}" promoted to active listing`, 'success')
  }

  // Open the Offer Received modal for a listing (offer came in on your listing)
  function handleListingOfferReceived(listing) {
    setOfferReceivedModal({ listing, offerPrice: listing.price || '', offerNotes: '' })
  }

  // Submit the Offer Received modal data
  async function submitListingOfferReceived() {
    if (!offerReceivedModal) return
    const { listing, offerPrice, offerNotes } = offerReceivedModal
    const data = await dbInsert('offer_received', {address:listing.address, price:offerPrice||listing.price||'', commission:listing.commission||''}, 'Listing', 'seller', listing.leadSource||null)
    if (data) {
      setOffersReceived(prev=>[...prev,{id:data.id,address:listing.address,price:offerPrice||listing.price||'',commission:listing.commission||'',status:'active',closedFrom:'Listing',dealSide:'seller',originalLeadSource:listing.leadSource||''}])
      setOffersReceivedCount(prev => prev + 1)
    }
    setOfferReceivedModal(null)
    await awardPipelineXp('offer_received', '#8b5cf6')
  }

  async function handleListingStatus(listing, newStatus) {
    const lPrice = listing.price||''
    const lComm  = listing.commission||''
    const lSource = listing.leadSource||null
    const addr = (listing.address||'').toLowerCase()
    if (newStatus === 'pending') {
      await updateListing(listing.id, 'status', 'pending')
      setListings(prev => prev.filter(l => l.id !== listing.id))
      // If an offer_received already exists for this address, promote it
      const existingOffer = offersReceived.find(d=>(d.address||'').toLowerCase()===addr)
      if (existingOffer) {
        const cl = DEFAULT_CHECKLIST.map(i=>({...i}))
        await supabase.from('transactions').update({type:'pending',closed_from:'Listing',checklist:cl}).eq('id',existingOffer.id).eq('user_id',user.id)
        setOffersReceived(prev=>prev.filter(r=>r.id!==existingOffer.id))
        setPendingDeals(prev=>[...prev,{...existingOffer,closedFrom:'Listing',checklist:cl}])
        assignTCToDeal(existingOffer.id)
      } else {
        const data = await dbInsert('pending', {address:listing.address, price:lPrice, commission:lComm}, 'Listing', 'seller', lSource)
        if (data) {
          const cl = DEFAULT_CHECKLIST.map(i=>({...i}))
          setPendingDeals(prev=>[...prev,{id:data.id,address:listing.address,price:lPrice,commission:lComm,status:'active',closedFrom:'Listing',dealSide:'seller',originalLeadSource:lSource||'',checklist:cl}])
          safeDb(supabase.from('transactions').update({checklist:cl}).eq('id',data.id))
          assignTCToDeal(data.id)
        }
      }
      setWentPendingCount(prev => prev + 1)
      await awardPipelineXp('went_pending', '#f59e0b')
    } else if (newStatus === 'closed') {
      await updateListing(listing.id, 'status', 'closed')
      setListings(prev => prev.filter(l => l.id !== listing.id))
      // If a pending deal exists for this address, promote it to closed
      const existingPending = pendingDeals.find(d=>(d.address||'').toLowerCase()===addr)
      if (existingPending) {
        await supabase.from('transactions').update({type:'closed',status:'closed'}).eq('id',existingPending.id).eq('user_id',user.id)
        setPendingDeals(prev=>prev.filter(r=>r.id!==existingPending.id))
        setClosedDeals(prev=>[...prev,{...existingPending,status:'closed'}])
      } else {
        // Check offers too
        const existingOffer = offersReceived.find(d=>(d.address||'').toLowerCase()===addr)
        if (existingOffer) {
          await supabase.from('transactions').update({type:'closed',status:'closed',closed_from:'Listing'}).eq('id',existingOffer.id).eq('user_id',user.id)
          setOffersReceived(prev=>prev.filter(r=>r.id!==existingOffer.id))
          setClosedDeals(prev=>[...prev,{...existingOffer,status:'closed',closedFrom:'Listing'}])
        } else {
          const data = await dbInsert('closed', {address:listing.address, price:lPrice, commission:lComm}, 'Listing', 'seller', lSource)
          if (data) {
            setClosedDeals(prev=>[...prev,{id:data.id,address:listing.address,price:lPrice,commission:lComm,status:'closed',closedFrom:'Listing',dealSide:'seller',originalLeadSource:lSource||''}])
          }
        }
      }
      setClosedCount(prev => prev + 1)
      const comm = resolveCommission(lComm, lPrice)
      setCelebration({ address:listing.address||'Deal Closed', commission:comm > 0 ? fmtMoney(comm) : (lComm||''), newComm:comm })
      setPendingReviewAddress(listing.address || 'your property')
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

  // ── Post buyer need to team board ──
  async function postBuyerNeedToBoard(rep) {
    if (!user?.id) return
    const bd = rep.buyerDetails || {}
    const parts = []
    if (bd.locationPrefs) parts.push(bd.locationPrefs)
    if (bd.preApproval) parts.push('up to ' + (formatPrice(bd.preApproval) || bd.preApproval))
    if (bd.mustHaves) parts.push(bd.mustHaves)
    if (bd.timeline) parts.push(bd.timeline)
    const text = parts.join(' · ') || 'Buyer looking for a home'
    try {
      const { data: freshProfile } = await supabase.from('profiles').select('goals').eq('id', user.id).single()
      const currentGoals = freshProfile?.goals || profile?.goals || {}
      const existing = currentGoals.buyer_needs || []
      const newNeed = { id: Date.now().toString(36) + Math.random().toString(36).slice(2,5), authorId: user.id, text, replies: [], resolved: false, createdAt: new Date().toISOString() }
      const updatedGoals = { ...currentGoals, buyer_needs: [...existing, newNeed] }
      await supabase.from('profiles').update({ goals: updatedGoals }).eq('id', user.id)
      // Mark as posted in buyerDetails and persist
      const updatedBd = { ...bd, postedToBoard: true }
      setBuyerReps(prev => prev.map(r => r.id === rep.id ? { ...r, buyerDetails: updatedBd } : r))
      await safeDb(supabase.from('listings').update({ buyer_details: updatedBd }).eq('id', rep.id).eq('user_id', user.id))
      setSuccess('Posted to buyer needs board!')
      setTimeout(() => setSuccess(''), 2500)
    } catch (err) { console.error('postBuyerNeedToBoard:', err); setError('Failed to post buyer need') }
  }

  // ── Showings helpers (local state only — persisted via saveBuyerRepDetails) ──
  function addShowing(repId, address, dateShown, timeShown, notes) {
    if (!address?.trim()) return
    setBuyerReps(prev => prev.map(r => {
      if (r.id !== repId) return r
      const showings = [...(r.buyerDetails?.showings || []), {
        id: Date.now().toString(36), address: address.trim(), dateShown: dateShown || new Date().toLocaleDateString('en-CA'), timeShown: timeShown || '', notes: notes || '', offerId: null
      }]
      return { ...r, buyerDetails: { ...(r.buyerDetails || {}), showings }, _dirty: true }
    }))
  }
  function updateShowing(repId, showingId, field, value) {
    setBuyerReps(prev => prev.map(r => {
      if (r.id !== repId) return r
      const showings = (r.buyerDetails?.showings || []).map(s => s.id === showingId ? { ...s, [field]: value } : s)
      return { ...r, buyerDetails: { ...(r.buyerDetails || {}), showings }, _dirty: true }
    }))
  }
  function removeShowing(repId, showingId) {
    setBuyerReps(prev => prev.map(r => {
      if (r.id !== repId) return r
      const showings = (r.buyerDetails?.showings || []).filter(s => s.id !== showingId)
      return { ...r, buyerDetails: { ...(r.buyerDetails || {}), showings }, _dirty: true }
    }))
  }

  async function submitBuyerRepOffer(addr, price, comm, showingId) {
    if (!offerModal || !addr) return
    const repId = offerModal.repId
    const data = await dbInsert('offer_made', {address:addr, price, commission:comm}, '', 'buyer', null, repId)
    if (data) {
      setOffersMade(prev => [...prev, {
        id:data.id, address:data.address, price:data.price||'',
        commission:data.commission||'', status:'active', closedFrom:'', dealSide:'buyer', originalLeadSource:''
      }])
      setOffersMadeCount(prev => prev + 1)
      await awardPipelineXp('offer_made', '#0ea5e9')
      // Link showing → offer if triggered from a showing row
      if (showingId && repId) {
        setBuyerReps(prev => prev.map(r => {
          if (r.id !== repId) return r
          const showings = (r.buyerDetails?.showings || []).map(s => s.id === showingId ? { ...s, offerId: data.id } : s)
          const updated = { ...(r.buyerDetails || {}), showings }
          // Persist the link immediately
          safeDb(supabase.from('listings').update({ buyer_details: updated }).eq('id', repId).eq('user_id', user.id))
          return { ...r, buyerDetails: updated }
        }))
      }
    }
    setOfferModal(null)
  }

  // ── Derived ────────────────────────────────────────────────────────────────
  const rank     = getRank(xp)
  const nextRank = RANKS.find(r => r.min > xp)
  const rankPct  = nextRank ? Math.round((xp-rank.min)/(nextRank.min-rank.min)*100) : 100

  // ── Team vs personal prefs ────────────────────────────────────────────────
  // Use stable primitives (extracted at top of Dashboard) so these booleans
  // don't change on every profile object reference update.
  const isOnTeam    = !!profileTeamId
  const isTeamOwner = isOnTeam && profileTeamCreator === user?.id
  // Stabilize activePrefs: for team members, profile?.teams?.team_prefs is a
  // new object reference every time the profile is re-fetched. Using JSON
  // serialization as a memo key prevents a cascade of useMemo recalculations
  // (builtInEffective → effectiveHabits → dashStats) on every profile refresh.
  const rawTeamPrefs = profile?.teams?.team_prefs
  const teamPrefsKey = isOnTeam ? JSON.stringify(rawTeamPrefs ?? null) : null
  const activePrefs = useMemo(
    () => isOnTeam ? (rawTeamPrefs || DEFAULT_PREFS) : habitPrefs,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isOnTeam, teamPrefsKey, habitPrefs]
  )
  const activePrefsRef = useRef(activePrefs); activePrefsRef.current = activePrefs
  const xpEnabled = activePrefs?.xp_enabled !== false

  // ── Effective tasks: built-in presets (user-toggled) + custom defaults ──
  // enabled_defaults is always personal (from habitPrefs), not team-level
  const enabledDefaults = habitPrefs?.enabled_defaults || []
  const builtInEffective = useMemo(() =>
    HABITS.filter(h => enabledDefaults.includes(h.id)).map(h => ({ ...h, isBuiltIn: true }))
  , [enabledDefaults])
  const customDefaults = useMemo(() =>
    customTasks.filter(t => t.isDefault).map(t => ({ ...t, isBuiltIn:false }))
  , [customTasks])
  const taskTimes = habitPrefs.taskTimes || {}
  const effectiveHabits = useMemo(() => {
    const all = [...builtInEffective, ...customDefaults].map(h => ({
      ...h, eventTime: taskTimes[h.id] || h.eventTime || null
    }))
    const orderArr = activePrefs.order || []
    if (orderArr.length) {
      const idx = {}; orderArr.forEach((id,i) => idx[id]=i)
      all.sort((a,b) => (idx[a.id]??999) - (idx[b.id]??999))
    }
    return all
  }, [builtInEffective, customDefaults, activePrefs.order, taskTimes])

  // ── Daily skip (for viewed day) ──────────────────────────────────────────
  const viewSkippedRaw      = (habitPrefs.skipped||{})[viewDateStr]
  const viewSkipped         = useMemo(() => viewSkippedRaw || [], [viewSkippedRaw])
  const effectiveView       = useMemo(() => effectiveHabits.filter(h => !viewSkipped.includes(String(h.id))), [effectiveHabits, viewSkipped])
  const viewBuiltInActive   = useMemo(() => builtInEffective.filter(h => !viewSkipped.includes(h.id)), [builtInEffective, viewSkipped])
  const skippedBuiltInView  = useMemo(() => builtInEffective.filter(h => viewSkipped.includes(String(h.id))), [builtInEffective, viewSkipped])

  const dashStats = useMemo(() => {
    const totalHabitChecks = builtInEffective.reduce((a,h)=>a+habits[h.id].flat().filter(Boolean).length,0)
    const daysThisMonth    = lastDayOfMonth
    const totalPossible    = Math.max(builtInEffective.length,1)*daysThisMonth
    const monthPct         = Math.round(totalHabitChecks/totalPossible*100)
    const viewChecks       = viewBuiltInActive.filter(h=>habits[h.id][viewWeek]?.[viewDayIdx]).length
    const viewPct          = Math.round(viewChecks/Math.max(viewBuiltInActive.length,1)*100)
    const totalProspecting = Object.entries(counters).filter(([k])=>k.startsWith('prospecting')).reduce((a,[,v])=>a+v,0)
    const totalAppts       = Object.entries(counters).filter(([k])=>k.startsWith('appointments')).reduce((a,[,v])=>a+v,0)
    const totalShowings    = Object.entries(counters).filter(([k])=>k.startsWith('showing')).reduce((a,[,v])=>a+v,0)
    const totalListings    = listings.filter(l => l.status !== 'closed').length
    const totalBuyerReps   = buyerReps.filter(r => r.status !== 'closed').length
    const allClosed        = [...closedDeals, ...archivedDeals]
    const closedVol        = allClosed.reduce((a,r)=>{ const n=parseFloat(String(r.price||'').replace(/[^0-9.]/g,'')); return a+(isNaN(n)?0:n) },0)
    const closedComm       = allClosed.reduce((a,r) => a + resolveCommission(r.commission, r.price), 0)
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
  }, [habits, counters, builtInEffective, viewBuiltInActive, viewWeek, viewDayIdx, listings, buyerReps, closedDeals, archivedDeals, sessionPipeline, lastDayOfMonth])
  const { totalHabitChecks, monthPct, viewChecks: todayChecks, viewPct: todayPct, totalProspecting, totalAppts, totalShowings, totalListings, totalBuyerReps, closedVol, closedComm, viewHabitXp: todayHabitXp, sessionPipelineXp, viewXp: todayXp } = dashStats

  // ── Daily targets from monthly goals (auto-redistributing) ─────────────
  // Uses start-of-day totals so the daily target stays stable as you log today.
  // If you skip a habit for today, today is excluded from remaining days so the
  // quota redistributes immediately across future working days.
  const dailyTargets = useMemo(() => {
    const targets = {}
    const remaining = workingDaysRemaining(new Date())
    const skippedToday = (habitPrefs.skipped || {})[todayDate] || []
    const totals = { prospecting: totalProspecting, appointments: totalAppts, showing: totalShowings }
    Object.entries(GOAL_HABIT_MAP).forEach(([goalKey, habitId]) => {
      const monthlyGoal = parseInt(goals?.[goalKey])
      if (!monthlyGoal || monthlyGoal <= 0) return
      const totalNow = totals[goalKey] || 0
      const todayCount = counters[`${habitId}-${todayWeek}-${todayDay}`] || 0
      const soFarBeforeToday = totalNow - todayCount
      // Monthly goal already met (including today's work)?
      if (totalNow >= monthlyGoal) {
        targets[habitId] = { daily: 0, done: true, monthlyGoal, soFar: totalNow }
      } else {
        // If this habit is skipped for today, exclude today from remaining days
        const isSkippedToday = skippedToday.includes(String(habitId))
        const effectiveRemaining = isSkippedToday ? Math.max(remaining - 1, 1) : remaining
        // Daily target based on what was left at START of today (stable as you log)
        const leftAtStartOfDay = Math.max(0, monthlyGoal - soFarBeforeToday)
        targets[habitId] = { daily: Math.ceil(leftAtStartOfDay / effectiveRemaining), done: false, monthlyGoal, soFar: totalNow }
      }
    })
    return targets
  }, [goals, totalProspecting, totalAppts, totalShowings, counters, todayWeek, todayDay, habitPrefs.skipped, todayDate])

  // ── GCI Dashboard stats ──────────────────────────────────────────────────
  const gciStats = useMemo(() => {
    const all = [...closedDeals, ...archivedDeals]
    if (!all.length) return { bySource: [], avgDeal: 0, annualPace: 0 }
    const sourceMap = {}
    all.forEach(d => {
      const src = d.closedFrom || 'Direct'
      const comm = resolveCommission(d.commission, d.price)
      sourceMap[src] = (sourceMap[src] || 0) + comm
    })
    const bySource = Object.entries(sourceMap).map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount)
    const avgDeal = closedComm / all.length
    const annualPace = closedComm * 12
    return { bySource, avgDeal, annualPace }
  }, [closedDeals, archivedDeals, closedComm])

  // ── Personal Records ─────────────────────────────────────────────────────
  const personalRecords = useMemo(() => {
    const dim = lastDayOfMonth
    let bestDayXp = 0, bestWeekXp = 0, perfectDays = 0, activeDays = 0
    for (let wi = 0; wi < WEEKS; wi++) {
      let weekXp = 0
      for (let di = 0; di < 7; di++) {
        if (!dateStrForDay(wi, di)) continue  // skip non-existent days (e.g. day 30 in Feb)
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
    return { bestDayXp, bestWeekXp, perfectDays, activeDays, daysInMonth: dim }
  }, [habits, counters, builtInEffective])

  // ── Week Heatmap data ────────────────────────────────────────────────────
  const weekHeatmap = useMemo(() => {
    return Array.from({ length: WEEKS }, (_, wi) =>
      Array.from({ length: 7 }, (_, di) => {
        const ds = dateStrForDay(wi, di)
        if (!ds) return -1  // day doesn't exist in this month
        const skipped = (habitPrefs.skipped || {})[ds] || []
        const active = builtInEffective.filter(h => !skipped.includes(String(h.id)))
        const done = active.filter(h => habits[h.id]?.[wi]?.[di]).length
        return active.length > 0 ? Math.round(done / active.length * 100) : -1
      })
    )
  }, [habits, builtInEffective, habitPrefs.skipped])

  // Stable per-mount: dateStr, quote, timeGreeting — no new Date() per render
  const [{ dateStr, quote: dailyQuote, timeGreeting }] = useState(() => {
    const d = new Date()
    return {
      dateStr: d.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'}),
      quote: QUOTES[d.getDay()],
      timeGreeting: d.getHours() < 12 ? 'Good morning' : d.getHours() < 17 ? 'Good afternoon' : 'Good evening',
    }
  })

  return (
    <div id="rg-dashboard" className="page">
      {/* XP float */}
      {xpEnabled && xpPop && (
        <div style={{ position:'fixed', top:74, right:30, zIndex:9999, pointerEvents:'none',
          fontFamily:"'Fraunces',serif", fontSize:22, fontWeight:700, color:xpPop.color,
          animation:'floatXp 1.4s ease forwards', textShadow:`0 0 20px ${xpPop.color}55` }}>
          {xpPop.val}
        </div>
      )}

      {/* ── Deal Celebration ───────────────────────────────── */}
      {celebration && (() => {
        const ytd = [...closedDeals,...archivedDeals].reduce((a,r) => a + resolveCommission(r.commission, r.price), 0)
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
            onClick={()=>{
              setCelebration(null)
              if (pendingReviewAddress) {
                setTimeout(()=>{
                  setReviewRequestName(''); setReviewRequestEmail('')
                  setReviewRequestDeal({ address: pendingReviewAddress })
                  setPendingReviewAddress(null)
                }, 350)
              }
            }}>
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
              {xpEnabled && <div style={{ marginTop:16, fontSize:18, fontWeight:700, color:'#f59e0b',
                fontFamily:"'Fraunces',serif", letterSpacing:.5 }}>
                ✨ +300 XP
              </div>}
              <button onClick={()=>{
                setCelebration(null)
                if (pendingReviewAddress) {
                  setTimeout(()=>{
                    setReviewRequestName(''); setReviewRequestEmail('')
                    setReviewRequestDeal({ address: pendingReviewAddress })
                    setPendingReviewAddress(null)
                  }, 350)
                }
              }} style={{ marginTop:24, padding:'11px 32px',
                background:'#10b981', border:'none', color:'#fff', borderRadius:10,
                fontWeight:700, fontSize:14, cursor:'pointer', letterSpacing:.3 }}>
                🚀 Keep Going!
              </button>
            </div>
          </div>
        )
      })()}

      {/* ── Beta Banner ──────────────────────────────────────── */}
      <div style={{ background:'#d97706', color:'#fff', textAlign:'center', padding:'8px 16px',
        fontSize:13, fontWeight:600, fontFamily:"'Poppins',sans-serif", letterSpacing:'.01em',
        display:'flex', alignItems:'center', justifyContent:'center', gap:8, flexWrap:'wrap' }}>
        <span>⚠️ Beta — We're stabilizing the platform. Thanks for your patience!</span>
        <a href="tel:5307367085" style={{ color:'#fff', textDecoration:'underline', fontWeight:700 }}>
          Questions? Call Derik: (530) 736-7085
        </a>
      </div>

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

          {/* Nav items — hidden until profile loads to prevent TC flash */}
          {profile && <>
          <span className="mob-hide" style={{ width:1, height:18, background:'rgba(255,255,255,.08)', display:'block' }}/>
          <button className={`nav-btn mob-hide${page==='dashboard'?' active':''}`} onClick={()=>setPage('dashboard')}>{isTC ? '📋 TC Dashboard' : '🏠 Dashboard'}</button>
          <button className={`nav-btn mob-hide${page==='teams'?' active':''}`} onClick={()=>setPage('teams')}>👥 Teams</button>
          {!isTC && <button className={`nav-btn mob-hide${page==='coaching'?' active':''}`} onClick={()=>setPage('coaching')}>📝 Coaching</button>}

          {!isTC && <button className={`nav-btn mob-hide${(page==='directory'||page==='apod'||page==='ai-assistant'||page==='presentations'||page==='cma')?' active':''}`} onClick={()=>setPage('directory')}>🔗 Tools</button>}
          {!isTC && <button className={`nav-btn mob-hide${page==='affiliates'?' active':''}`} onClick={()=>setPage('affiliates')}>💰 Affiliates</button>}

          {profileAppRole === 'admin' && (
            <button className={`nav-btn mob-hide${page==='admin'?' active':''}`} onClick={()=>setPage('admin')} style={{ fontSize:11, letterSpacing:'.03em' }}>⚙️ Admin</button>
          )}

          {/* Rank + Streak chips — hidden on mobile, hidden when XP disabled, hidden for TCs */}
          {xpEnabled && !isTC && <>
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
          </>}

          <button className={`nav-btn mob-hide${page==='billing'?' active':''}`} onClick={()=>setPage('billing')}
            style={{ fontSize:11, fontWeight:700, color:planBadge.color, letterSpacing:.4 }}>
            {planBadge.label}
          </button>
          </>}
          <button className={`nav-btn${page==='profile'?' active':''}`} onClick={()=>setPage('profile')}
            style={{ display:'flex', alignItems:'center', gap:6 }}>
            {profile?.goals?.avatar_url ? (
              <img src={profile.goals.avatar_url} alt="" style={{ width:24, height:24, borderRadius:'50%', objectFit:'cover' }}/>
            ) : (
              <div style={{ width:24, height:24, borderRadius:'50%',
                background:`linear-gradient(135deg, ${rank.color}, ${rank.color}88)`,
                display:'flex', alignItems:'center', justifyContent:'center',
                fontSize:11, fontWeight:700, color:'#fff', flexShrink:0 }}>
                {(profileFullName||'A').charAt(0).toUpperCase()}
              </div>
            )}
            <span className="mob-hide">{profileFullName?.split(' ')[0]||'Profile'}</span>
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
            { p:'dashboard', icon: isTC ? '📋' : '🏠', label: isTC ? 'TC Dashboard' : 'Home' },
            { p:'teams',     icon:'👥', label:'Teams' },
            ...(!isTC ? [
              { p:'coaching',  icon:'📝', label:'Coaching' },
              { p:'directory', icon:'🔗', label:'Tools' },
              { p:'affiliates', icon:'💰', label:'Affiliates' },
              { p:'billing',   icon:'💳', label:'Billing' },
            ] : []),
            { p:'profile',   icon:'👤', label:'Profile' },
            ...(profileAppRole === 'admin' ? [{ p:'admin', icon:'⚙️', label:'Admin' }] : []),
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

      {/* ── Page Content — exclusive ternary: dashboard XOR sub-page ─────
           A ternary renders exactly ONE branch at a time.  This structurally
           eliminates visual duplication — the other branch doesn't exist in
           the DOM, so there is nothing to accidentally show twice. */}
      {page === 'dashboard' ? (
      <ErrorBoundary key="dashboard" onReset={()=>window.location.reload()}>
      {(dbLoading || !profile) ? <Loader/> : (
      <div className="page-inner">

        {/* ── Network Error Banner (loadAll catch) ── */}
        {dbError && (
          <div className="card" style={{ padding:'16px 22px', marginBottom:18, borderLeft:'3px solid #dc2626',
            background:'rgba(220,38,38,.06)', display:'flex', alignItems:'center', gap:14, flexWrap:'wrap' }}>
            <span style={{ fontSize:20 }}>&#9888;&#65039;</span>
            <div style={{ flex:1, minWidth:200 }}>
              <div style={{ fontWeight:700, color:'#dc2626', fontSize:14 }}>Connection Error</div>
              <div style={{ fontSize:12, color:'var(--muted)', marginTop:2 }}>{dbError}</div>
            </div>
            <button className="btn-gold" onClick={loadAll} style={{ fontSize:13, padding:'8px 18px' }}>Retry</button>
          </div>
        )}

        {/* ── TC-only: simplified header + jump straight to TC Dashboard ── */}
        {isTC ? (<>
          <div className="card" style={{
            padding:'24px 28px', marginBottom:22,
            background:'linear-gradient(135deg, rgba(14,165,233,.06) 0%, var(--surface) 55%)',
            borderLeft:'3px solid #0ea5e9',
            display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:16,
          }}>
            <div>
              <div style={{ fontSize:10, color:'var(--muted)', fontFamily:"'JetBrains Mono',monospace",
                letterSpacing:.7, textTransform:'uppercase', marginBottom:6 }}>
                {timeGreeting}, {profileFullName?.split(' ')[0]||'Coordinator'} · {dateStr.split(',').slice(1).join(',').trim()}
              </div>
              <div className="serif" style={{ fontSize:42, color:'var(--text)', lineHeight:1, letterSpacing:'-.02em', fontWeight:600, marginBottom:12 }}>
                {dateStr.split(',')[0]}<span style={{ color:'#0ea5e9' }}>.</span>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <span style={{ fontSize:11, padding:'4px 12px', borderRadius:20,
                  background:'rgba(14,165,233,.1)', border:'1px solid rgba(14,165,233,.25)',
                  color:'#0ea5e9', fontWeight:700, fontFamily:"'JetBrains Mono',monospace" }}>
                  📋 Transaction Coordinator
                </span>
              </div>
            </div>
            <div style={{ textAlign:'right', flexShrink:0 }}>
              <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:28, fontWeight:700, color:'#0ea5e9' }}>
                {tcDeals.length}
              </div>
              <div style={{ fontSize:11, color:'var(--muted)' }}>pending deal{tcDeals.length !== 1 ? 's' : ''}</div>
            </div>
          </div>
        </>) : (<>
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
              {timeGreeting}, {profileFullName?.split(' ')[0]||'Agent'} · {dateStr.split(',').slice(1).join(',').trim()}
            </div>
            <div className="serif" style={{ fontSize:42, color:'var(--text)', lineHeight:1, letterSpacing:'-.02em', fontWeight:600, marginBottom:12 }}>
              {dateStr.split(',')[0]}<span style={{ color:rank.color }}>.</span>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
              {xpEnabled && <div style={{ display:'flex', alignItems:'center', gap:7, padding:'4px 10px 4px 5px',
                background:`${rank.color}12`, border:`1px solid ${rank.color}28`, borderRadius:20 }}>
                <div style={{ width:20, height:20, borderRadius:'50%',
                  background:`linear-gradient(135deg, ${rank.color}, ${rank.color}88)`,
                  display:'flex', alignItems:'center', justifyContent:'center', fontSize:11 }}>{rank.icon}</div>
                <span style={{ fontSize:11, fontWeight:700, color:rank.color,
                  fontFamily:"'JetBrains Mono',monospace" }}>{rank.name} · {xp.toLocaleString()} XP</span>
              </div>}
              {xpEnabled && streak > 0 && (
                <div style={{ display:'flex', alignItems:'center', gap:5, padding:'4px 10px',
                  background:'rgba(251,146,60,.1)', border:'1px solid rgba(251,146,60,.25)', borderRadius:20 }}>
                  <span style={{ fontSize:12 }}>🔥</span>
                  <span style={{ fontSize:11, fontWeight:700, color:'#fb923c',
                    fontFamily:"'JetBrains Mono',monospace" }}>{streak}-day streak</span>
                </div>
              )}
              {!(profile?.team_id && profile?.teams?.team_prefs?.ai_tools?.briefing_enabled === false) &&
               !((!profile?.team_id) && habitPrefs?.morning_briefing?.enabled === false) && (
              <button onClick={() => briefingData ? setBriefingVisible(true) : fetchBriefing(true)}
                disabled={briefingLoading}
                style={{ display:'flex', alignItems:'center', gap:5, padding:'4px 12px',
                  background:'rgba(59,130,246,.1)', border:'1px solid rgba(59,130,246,.25)', borderRadius:20,
                  cursor: briefingLoading ? 'wait' : 'pointer', transition:'all .15s',
                  opacity: briefingLoading ? 0.6 : 1 }}>
                <span style={{ fontSize:12 }}>{briefingLoading ? '⏳' : '📋'}</span>
                <span style={{ fontSize:11, fontWeight:700, color:'#3b82f6',
                  fontFamily:"'JetBrains Mono',monospace" }}>{briefingLoading ? 'Loading…' : 'Briefing'}</span>
              </button>
              )}
              {(() => {
                const slk = profile?.teams?.team_prefs?.slack_url
                return slk ? (
                  <a href={slk} target="_blank" rel="noopener noreferrer"
                    style={{ display:'flex', alignItems:'center', gap:5, padding:'4px 12px',
                      background:'rgba(97,31,105,.1)', border:'1px solid rgba(97,31,105,.25)', borderRadius:20,
                      textDecoration:'none', cursor:'pointer', transition:'all .15s' }}>
                    <span style={{ fontSize:12 }}>💬</span>
                    <span style={{ fontSize:11, fontWeight:700, color:'#611f69',
                      fontFamily:"'JetBrains Mono',monospace" }}>Slack</span>
                  </a>
                ) : null
              })()}
              {(() => {
                const tp = profile?.teams?.team_prefs || {}
                const links = [
                  { key:'email', icon:'📧', color:'#ea4335', defaultLabel:'Email' },
                  { key:'crm',   icon:'🏢', color:'#0176d3', defaultLabel:'CRM' },
                  { key:'docs',  icon:'📄', color:'#4285f4', defaultLabel:'Docs' },
                  { key:'mls',   icon:'🔑', color:'#2e7d32', defaultLabel:'MLS' },
                ]
                return links.map(lk => {
                  const url = tp[lk.key+'_url']
                  if (!url) return null
                  const label = tp[lk.key+'_label'] || lk.defaultLabel
                  return (
                    <a key={lk.key} href={url} target="_blank" rel="noopener noreferrer"
                      style={{ display:'flex', alignItems:'center', gap:5, padding:'4px 12px',
                        background:`${lk.color}18`, border:`1px solid ${lk.color}40`, borderRadius:20,
                        textDecoration:'none', cursor:'pointer', transition:'all .15s' }}>
                      <span style={{ fontSize:12 }}>{lk.icon}</span>
                      <span style={{ fontSize:11, fontWeight:700, color:lk.color,
                        fontFamily:"'JetBrains Mono',monospace" }}>{label}</span>
                    </a>
                  )
                })
              })()}
            </div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:18, flexShrink:0 }}>
            <div className="serif mob-hide" style={{ fontStyle:'italic', fontSize:13, color:'var(--dim)',
              maxWidth:220, textAlign:'right', lineHeight:1.75 }}>
              "{dailyQuote}"
            </div>
            <Ring pct={todayPct} size={80} sw={6}
              color={todayPct>=80?'#10b981':todayPct>=50?'#d97706':'#dc2626'}/>
          </div>
        </div>
        </>)}

        {/* ── Stats row (hidden for TCs) ──────────────────────── */}
        {!isTC && (<>
        <div className="stat-grid" style={{ marginBottom:18 }}>
          <StatCard icon="⚡" label="Today" value={`${todayPct}%`}
            color={todayPct>=80?'var(--green)':todayPct>=50?'var(--gold)':'var(--red)'}
            sub={`${todayChecks}/${viewBuiltInActive.length} habits`}
            accent={todayPct>=80?'#10b981':todayPct>=50?'#d97706':'#dc2626'}/>
          <StatCard icon="📅" label="Month"        value={`${monthPct}%`}   color="var(--gold)"  sub={`${totalHabitChecks} checks`}/>
          <StatCard icon="📞" label="Calls"         value={totalProspecting} color="var(--gold)"
            sub={goals?.prospecting ? `${totalProspecting}/${goals.prospecting} goal${dailyTargets.prospecting?.daily ? ` · ${dailyTargets.prospecting.daily}/day` : ''}` : 'this month'}
            accent={goals?.prospecting && totalProspecting>=goals.prospecting ? '#10b981' : undefined}/>
          <StatCard icon="📅" label="Appointments" value={totalAppts}        color="var(--green)"
            sub={goals?.appointments ? `${totalAppts}/${goals.appointments} goal${dailyTargets.appointments?.daily ? ` · ${dailyTargets.appointments.daily}/day` : ''}` : 'this month'}
            accent={goals?.appointments && totalAppts>=goals.appointments ? '#10b981' : undefined}/>
          <StatCard icon="🔑" label="Showings"      value={totalShowings}    color="var(--blue)"
            sub={goals?.showing ? `${totalShowings}/${goals.showing} goal${dailyTargets.showing?.daily ? ` · ${dailyTargets.showing.daily}/day` : ''}` : undefined}
            accent={goals?.showing && totalShowings>=goals.showing ? '#3b82f6' : undefined}/>
          <StatCard icon="🏡" label="Listed"        value={totalListings}         color="var(--purple)"
            sub={goals?.listings ? `${totalListings}/${goals.listings} goal` : undefined}
            accent={goals?.listings && totalListings>=goals.listings ? '#8b5cf6' : undefined}/>
          <StatCard icon="🤝" label="Buyer Reps"   value={totalBuyerReps}        color="var(--blue)"
            sub={goals?.buyers ? `${totalBuyerReps}/${goals.buyers} goal` : undefined}
            accent={goals?.buyers && totalBuyerReps>=goals.buyers ? '#3b82f6' : undefined}/>
          <StatCard icon="📤" label="Offers Made"   value={offersMadeCount}       color="var(--blue)"/>
          <StatCard icon="📥" label="Offers Rec'd"  value={offersReceivedCount}   color="var(--purple)"/>
          <StatCard icon="⏳" label="Went Pending"  value={wentPendingCount}      color="var(--gold2)"/>
          <StatCard icon="🎉" label="Closed"         value={closedCount}    color="var(--green)"
            sub={goals?.closed ? `${closedCount}/${goals.closed} goal${closedVol>0?' · '+fmtMoney(closedVol):''}` : closedVol>0?fmtMoney(closedVol):null}
            accent={goals?.closed && closedCount>=goals.closed ? '#10b981' : undefined}/>
          {showCommSummary && closedComm>0 && <StatCard icon="💰" label="Commission" value={fmtMoney(closedComm)||'$0'} color="var(--green)" accent="#10b981"/>}
        </div>

        {/* ── Primary Tabs ────────────────────────────────── */}
        <div className="primary-tabs">
          {[{id:'calendar',l:'📅 Calendar'},{id:'potential',l:'💡 Potential',count:potentialListings.length},{id:'listings',l:'🏡 Listings',count:listings.length},{id:'buyers',l:'🤝 Buyers',count:buyerReps.length},{id:'closed',l:'📦 Archived',count:archivedDeals.length}].map(t=>(
            <button key={t.id} className={`primary-tab${activeTab===t.id?' on':''}`} onClick={()=>setPrimaryTab(t.id)}>
              {t.l}{t.count!=null && <span className="ptab-count">{t.count}</span>}
            </button>
          ))}
        </div>
        </>)}

        {/* ── TC Primary Tabs (TC Dashboard + Calendar) ── */}
        {isTC && (
        <div className="primary-tabs">
          {[{id:'tc-dashboard',l:'📋 TC Dashboard',count:tcDeals.length},{id:'calendar',l:'📅 Calendar'}].map(t=>(
            <button key={t.id} className={`primary-tab${activeTab===t.id?' on':''}`} onClick={()=>setPrimaryTab(t.id)}>
              {t.l}{t.count!=null && <span className="ptab-count">{t.count}</span>}
            </button>
          ))}
        </div>
        )}

        {/* ══ CALENDAR TAB ═════════════════════════════════════ */}
        {activeTab==='calendar' && (<>

        {/* ── Sub-Tabs ─────────────────────────────────────── */}
        <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
          <div className="tabs" style={{ flex:1 }}>
            {[{id:'today',l:'Today'},{id:'weekly',l:'Week View'},{id:'heatmap',l:'Heatmap'}].map(t=>(
              <button key={t.id} className={`tab-item${tab===t.id?' on':''}`} onClick={()=>setTab(t.id)}>{t.l}</button>
            ))}
          </div>
          {gcalConnected ? (
            <div style={{ display:'flex', gap:5 }}>
              <button onClick={() => syncGoogleCalendar()} disabled={gcalSyncing}
                title="Sync Google Calendar"
                style={{ background:'rgba(66,133,244,.1)', color:'#4285f4', border:'1px solid rgba(66,133,244,.3)',
                  borderRadius:7, cursor:gcalSyncing?'wait':'pointer', fontSize:11, fontWeight:600,
                  padding:'5px 10px', display:'flex', alignItems:'center', gap:5, fontFamily:'Poppins,sans-serif' }}>
                📅 {gcalSyncing ? 'Syncing…' : 'Sync'}
              </button>
              <button onClick={clearGcalEvents} title="Clear all synced events"
                style={{ background:'none', border:'1px solid var(--b2)', borderRadius:7, cursor:'pointer',
                  fontSize:11, color:'var(--dim)', padding:'5px 8px' }}>🗑️</button>
              <button onClick={disconnectGoogleCalendar} title="Disconnect Google Calendar"
                style={{ background:'none', border:'1px solid var(--b2)', borderRadius:7, cursor:'pointer',
                  fontSize:11, color:'var(--dim)', padding:'5px 8px' }}>✕</button>
            </div>
          ) : (
            <button onClick={connectGoogleCalendar}
              style={{ background:'rgba(66,133,244,.08)', color:'#4285f4', border:'1px solid rgba(66,133,244,.25)',
                borderRadius:7, cursor:'pointer', fontSize:11, fontWeight:600,
                padding:'5px 12px', display:'flex', alignItems:'center', gap:5, fontFamily:'Poppins,sans-serif' }}>
              📅 Connect Google Calendar
            </button>
          )}
        </div>

        {/* ══ TODAY ══════════════════════════════════════════ */}
        {tab==='today' && (
          <>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
            <div style={{ fontSize:12, color:'var(--muted)' }}>
              {xpEnabled && todayXp > 0 && <span style={{ fontFamily:"'JetBrains Mono',monospace", color:'var(--gold)', fontWeight:700 }}>+{todayXp.toLocaleString()} XP</span>} {xpEnabled && todayXp > 0 ? (isViewingToday ? 'earned today' : `earned ${FULL_DAYS[viewDayIdx]}`) : ''}
            </div>
            <button className="btn-outline" onClick={() => setShowPrint(true)}
              style={{ fontSize:12, display:'flex', alignItems:'center', gap:5, padding:'7px 14px' }}>
              🖨️ Print {isViewingToday ? 'Daily' : FULL_DAYS[viewDayIdx]} Sheet
            </button>
          </div>

          <div className="today-grid">

            {/* Tasks checklist */}
            {(()=>{
              const daySpecific = customTasks.filter(t => !t.isDefault && t.specificDate === viewDateStr)
              const unifiedList = getOrderedTasksForDate(viewDateStr, effectiveView, daySpecific)
              const totalTasks = unifiedList.length
              const doneTasks = unifiedList.filter(h => {
                if (h.isBuiltIn) return habits[h.id]?.[viewWeek]?.[viewDayIdx]
                const ckey = `${h.id}-${viewWeek}-${viewDayIdx}`
                return !!customDone[ckey]
              }).length
              const taskPct = totalTasks > 0 ? Math.round(doneTasks / totalTasks * 100) : 0
              return (
            <div className="card" style={{ padding:24, borderTop:`2.5px solid ${isViewingToday ? (taskPct>=80?'#10b981':taskPct>=50?'#d97706':'#dc2626') : '#3b82f6'}` }}>
              {/* Day Navigator */}
              <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:12, marginBottom:16,
                padding:'8px 12px', background:'var(--bg)', borderRadius:8 }}>
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
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
                <div>
                  <div className="serif" style={{ fontSize:20, color:'var(--text)', marginBottom:3, letterSpacing:'-.015em' }}>
                    {isViewingToday ? 'Daily Tasks' : `${FULL_DAYS[viewDayIdx]} Tasks`}
                  </div>
                  <div style={{ fontSize:12, color:'var(--muted)' }}>
                    {FULL_DAYS[viewDayIdx]} · {totalTasks - doneTasks > 0 ? `${totalTasks - doneTasks} remaining` : (totalTasks > 0 ? 'All done! 🎉' : 'No tasks — use ✨ AI Plan or sync Google Calendar')}
                  </div>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                  <div style={{ textAlign:'right' }}>
                    <div className="serif" style={{ fontSize:24, color: taskPct>=80?'#10b981':taskPct>=50?'#d97706':'#dc2626', lineHeight:1, fontWeight:700, letterSpacing:'-.02em' }}>
                      {doneTasks}<span style={{ fontSize:14, color:'var(--dim)', fontWeight:400 }}>/{totalTasks}</span>
                    </div>
                    <div style={{ fontSize:10, color:'var(--muted)', marginTop:2 }}>completed</div>
                  </div>
                  <Ring pct={taskPct} size={58} color={taskPct>=80?'#10b981':taskPct>=50?'#d97706':'#dc2626'} sw={5}/>
                </div>
              </div>

              {/* ── Unified ordered task list (all types) ──── */}
              {(()=>{
                return (
                  <>
              <div style={{ display:'flex', flexDirection:'column', gap:2, minWidth:0, overflow:'hidden' }}>
                {unifiedList.map((h, idx) => {
                  if (h.isBuiltIn) {
                    const done = habits[h.id][viewWeek]?.[viewDayIdx]
                    const cs   = CAT[h.cat]
                    const ckey = `${h.id}-${viewWeek}-${viewDayIdx}`
                    const cnt  = counters[ckey]||0
                    return (
                      <div key={h.id} className={`habit-row${done?' done':''}`}>
                        <div className="reorder-arrows">
                          <button className="reorder-btn" disabled={idx===0} onClick={()=>moveTask(viewDateStr,unifiedList,h.id,-1)}>▲</button>
                          <button className="reorder-btn" disabled={idx===unifiedList.length-1} onClick={()=>moveTask(viewDateStr,unifiedList,h.id,1)}>▼</button>
                        </div>
                        <button className="chk" onClick={()=>toggleHabit(h.id,viewWeek,viewDayIdx)}
                          style={done?{background:cs.light,borderColor:cs.color}:{}}>
                          {done && (
                            <svg width="11" height="8" viewBox="0 0 11 8" fill="none">
                              <path d="M1 4L4 7L10 1" stroke={cs.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          )}
                        </button>
                        <span style={{ fontSize:15, flexShrink:0 }}>{h.icon}</span>
                        <input type="time" value={h.eventTime||''} title={h.eventTime ? `Scheduled ${fmtTime(h.eventTime)} — click to change` : 'Set a time'}
                          onChange={e => setTaskTime(h.id, e.target.value||null)}
                          style={{ width: h.eventTime ? 72 : 28, padding:'2px 3px', fontSize:10, fontWeight:700,
                            fontFamily:"'JetBrains Mono',monospace", borderRadius:4, flexShrink:0,
                            border:`1px solid ${h.eventTime ? 'var(--gold2)' : 'var(--b2)'}`,
                            background: h.eventTime ? 'rgba(217,119,6,.08)' : 'transparent',
                            color: h.eventTime ? 'var(--gold2)' : 'var(--dim)',
                            outline:'none', cursor:'pointer', opacity: done ? .5 : 1 }}/>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                            <span style={{ fontSize:13, fontWeight:500, color:done?'var(--muted)':'var(--text)',
                              textDecoration:done?'line-through':'none', transition:'all .15s',
                              overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1, minWidth:0 }}>{h.label}</span>
                            {dailyTargets[h.id] && !dailyTargets[h.id].done && (
                              <span style={{ fontSize:10, fontWeight:700, color:'var(--gold2)', flexShrink:0,
                                fontFamily:"'JetBrains Mono',monospace" }}>{cnt||0}/{dailyTargets[h.id].daily}</span>
                            )}
                            {dailyTargets[h.id]?.done && (
                              <span style={{ fontSize:9, fontWeight:700, color:'var(--green)', flexShrink:0 }}>✓ goal</span>
                            )}
                          </div>
                          {xpEnabled && <div style={{ fontSize:10, color:'var(--dim)' }}>
                            +{h.xp} XP{h.xpEach?` · +${h.xpEach} per ${h.unit||'extra'}`:''}
                          </div>}
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
                        {gcalConnected && !done && (
                          <button onClick={()=>addToGoogleCalendar(h, viewDateStr)} title="Add to Google Calendar"
                            style={{ background:'none', border:'none', cursor:'pointer', color:'#4285f4',
                              fontSize:13, padding:'2px 4px', lineHeight:1, flexShrink:0, opacity:.7 }}>📅</button>
                        )}
                        {!done && (
                          <button onClick={()=>skipHabitToday(h.id)} title="Skip for today"
                            style={{ background:'none', border:'none', cursor:'pointer', color:'var(--dim)',
                              fontSize:14, padding:'2px 4px', lineHeight:1, flexShrink:0, opacity:.6 }}>✕</button>
                        )}
                      </div>
                    )
                  } else if (h.isDaySpecific) {
                    // Day-specific task (today only / gcal event)
                    const ckey = `${h.id}-${viewWeek}-${viewDayIdx}`
                    const done = !!customDone[ckey]
                    return (
                      <div key={h.id} className={`habit-row${done?' done':''}`}>
                        <div className="reorder-arrows">
                          <button className="reorder-btn" disabled={idx===0} onClick={()=>moveTask(viewDateStr,unifiedList,h.id,-1)}>▲</button>
                          <button className="reorder-btn" disabled={idx===unifiedList.length-1} onClick={()=>moveTask(viewDateStr,unifiedList,h.id,1)}>▼</button>
                        </div>
                        <button className="chk" onClick={()=>toggleCustomTask(h.id,viewWeek,viewDayIdx)}
                          style={done?{background:'rgba(6,182,212,.12)',borderColor:'#06b6d4'}:{}}>
                          {done && (
                            <svg width="11" height="8" viewBox="0 0 11 8" fill="none">
                              <path d="M1 4L4 7L10 1" stroke="#06b6d4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          )}
                        </button>
                        <span style={{ fontSize:15, flexShrink:0 }}>{h.icon}</span>
                        {h.eventTime && (
                          <span style={{ fontSize:10, fontWeight:700, color:'var(--gold2)', flexShrink:0,
                            fontFamily:"'JetBrains Mono',monospace", whiteSpace:'nowrap' }}>{fmtTime(h.eventTime)}</span>
                        )}
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:13, fontWeight:500, color:done?'var(--muted)':'var(--text)',
                            textDecoration:done?'line-through':'none', transition:'all .15s',
                            overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{h.label}</div>
                          {xpEnabled && <div style={{ fontSize:10, color:'var(--dim)' }}>+{h.xp} XP</div>}
                        </div>
                        <span style={{ fontSize:9, padding:'2px 7px', borderRadius:4, fontWeight:500, flexShrink:0,
                          background: h.googleEventId ? 'rgba(66,133,244,.1)' : 'rgba(245,158,11,.1)',
                          color: h.googleEventId ? '#4285f4' : 'var(--gold2)',
                          border: `1px solid ${h.googleEventId ? 'rgba(66,133,244,.25)' : 'rgba(245,158,11,.25)'}` }}>
                          {h.googleEventId ? 'gcal' : 'today'}
                        </span>
                        {gcalConnected && !h.googleEventId && !done && (
                          <button onClick={()=>addToGoogleCalendar(h, viewDateStr)} title="Add to Google Calendar"
                            style={{ background:'none', border:'none', cursor:'pointer', color:'#4285f4',
                              fontSize:13, padding:'2px 4px', lineHeight:1, flexShrink:0, opacity:.7 }}>📅</button>
                        )}
                        <button className="btn-del" onClick={()=>deleteCustomTask(h.id)}>✕</button>
                      </div>
                    )
                  } else {
                    // Custom default task
                    const ckey = `${h.id}-${viewWeek}-${viewDayIdx}`
                    const done = !!customDone[ckey]
                    return (
                      <div key={h.id} className={`habit-row${done?' done':''}`}>
                        <div className="reorder-arrows">
                          <button className="reorder-btn" disabled={idx===0} onClick={()=>moveTask(viewDateStr,unifiedList,h.id,-1)}>▲</button>
                          <button className="reorder-btn" disabled={idx===unifiedList.length-1} onClick={()=>moveTask(viewDateStr,unifiedList,h.id,1)}>▼</button>
                        </div>
                        <button className="chk" onClick={()=>toggleCustomTask(h.id,viewWeek,viewDayIdx)}
                          style={done?{background:'rgba(6,182,212,.12)',borderColor:'#06b6d4'}:{}}>
                          {done && (
                            <svg width="11" height="8" viewBox="0 0 11 8" fill="none">
                              <path d="M1 4L4 7L10 1" stroke="#06b6d4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          )}
                        </button>
                        <span style={{ fontSize:15, flexShrink:0 }}>{h.icon}</span>
                        <input type="time" value={h.eventTime||''} title={h.eventTime ? `Scheduled ${fmtTime(h.eventTime)} — click to change` : 'Set a time'}
                          onChange={e => setTaskTime(h.id, e.target.value||null)}
                          style={{ width: h.eventTime ? 72 : 28, padding:'2px 3px', fontSize:10, fontWeight:700,
                            fontFamily:"'JetBrains Mono',monospace", borderRadius:4, flexShrink:0,
                            border:`1px solid ${h.eventTime ? 'var(--gold2)' : 'var(--b2)'}`,
                            background: h.eventTime ? 'rgba(217,119,6,.08)' : 'transparent',
                            color: h.eventTime ? 'var(--gold2)' : 'var(--dim)',
                            outline:'none', cursor:'pointer', opacity: done ? .5 : 1 }}/>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:13, fontWeight:500, color:done?'var(--muted)':'var(--text)',
                            textDecoration:done?'line-through':'none', transition:'all .15s',
                            overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{h.label}</div>
                          {xpEnabled && <div style={{ fontSize:10, color:'var(--dim)' }}>+{h.xp} XP</div>}
                        </div>
                        <span style={{ fontSize:9, padding:'2px 7px', borderRadius:4, fontWeight:500, flexShrink:0,
                          background:'rgba(6,182,212,.12)', color:'#06b6d4', border:'1px solid rgba(6,182,212,.22)' }}>
                          custom
                        </span>
                        {gcalConnected && !done && (
                          <button onClick={()=>addToGoogleCalendar(h, viewDateStr)} title="Add to Google Calendar"
                            style={{ background:'none', border:'none', cursor:'pointer', color:'#4285f4',
                              fontSize:13, padding:'2px 4px', lineHeight:1, flexShrink:0, opacity:.7 }}>📅</button>
                        )}
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

                    <div style={{ display:'flex', gap:8, marginTop:12 }}>
                      <button className="btn-outline" onClick={()=>setAddTaskModal(true)}
                        style={{ fontSize:12, flex:1, justifyContent:'center' }}>
                        + Add task for {isViewingToday ? 'today' : FULL_DAYS[viewDayIdx]}
                      </button>
                      <button onClick={() => { if(confirm('Clear all non-calendar tasks for this day?')) clearTasksForDates([viewDateStr]) }}
                        style={{ fontSize:12, padding:'8px 10px', borderRadius:8, fontWeight:600,
                          background:'none', color:'var(--dim)', border:'1px solid var(--b2)',
                          cursor:'pointer', transition:'all .15s' }}>
                        🗑️
                      </button>
                      {!(profile?.team_id && profile?.teams?.team_prefs?.ai_tools?.ai_daily_enabled === false) && (
                      <button onClick={()=>setAiTaskGenScope('today')}
                        style={{ fontSize:12, padding:'8px 14px', borderRadius:8, fontWeight:600,
                          background:'linear-gradient(135deg,#8b5cf6,#6d28d9)', color:'#fff',
                          border:'none', cursor:'pointer', display:'flex', alignItems:'center', gap:5,
                          boxShadow:'0 2px 8px rgba(109,40,217,.25)', transition:'all .15s' }}>
                        ✨ AI Plan
                      </button>
                      )}
                    </div>

                    {/* Skipped tasks — restore inline */}
                    {skippedTodayTasks.length > 0 && (
                      <div style={{ marginTop:16, paddingTop:14, borderTop:'1px dashed var(--b2)' }}>
                        <div style={{ fontSize:10, color:'var(--dim)', fontWeight:700, letterSpacing:1,
                          marginBottom:8, textTransform:'uppercase' }}>{isViewingToday ? 'Skipped Today' : `Skipped ${FULL_DAYS[viewDayIdx]}`}</div>
                        {skippedTodayTasks.map(t => (
                          <div key={t.id} style={{ display:'flex', alignItems:'center', gap:8,
                            padding:'8px 4px', borderBottom:'1px solid var(--b1)', opacity:.55 }}>
                            <span style={{ fontSize:15, flexShrink:0 }}>{t.icon}</span>
                            <span style={{ flex:1, fontSize:13, color:'var(--muted)',
                              textDecoration:'line-through', minWidth:0 }}>{t.label}</span>
                            {xpEnabled && <span style={{ fontSize:11, color:'var(--dim)',
                              fontFamily:"'JetBrains Mono',monospace", flexShrink:0 }}>+{t.xp} XP</span>}
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
              )
            })()}

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
                {xpEnabled && streak > 0 && (
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

              {xpEnabled && <div className="card" style={{ padding:18,
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
              </div>}

              {/* ── Personal Records Card ────────────────────── */}
              {(personalRecords.activeDays > 0 || closedDeals.length > 0 || archivedDeals.length > 0) && (
                <div className="card" style={{ padding:16, background:'linear-gradient(160deg, rgba(139,92,246,.08) 0%, var(--surface) 100%)', border:'1px solid rgba(139,92,246,.15)', borderTop:'2.5px solid #8b5cf6' }}>
                  <div className="label" style={{ marginBottom:10, color:'#8b5cf6', textAlign:'center', letterSpacing:.8 }}>🏅 Personal Records</div>
                  <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                    {xpEnabled && personalRecords.bestDayXp > 0 && (
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'5px 8px', borderRadius:7, background:'rgba(139,92,246,.06)' }}>
                        <span style={{ fontSize:11, color:'var(--text2)' }}>Best Day</span>
                        <span className="mono" style={{ fontSize:13, fontWeight:700, color:'#8b5cf6' }}>+{personalRecords.bestDayXp.toLocaleString()} XP</span>
                      </div>
                    )}
                    {xpEnabled && personalRecords.bestWeekXp > 0 && (
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'5px 8px', borderRadius:7, background:'rgba(139,92,246,.06)' }}>
                        <span style={{ fontSize:11, color:'var(--text2)' }}>Best Week</span>
                        <span className="mono" style={{ fontSize:13, fontWeight:700, color:'#8b5cf6' }}>+{personalRecords.bestWeekXp.toLocaleString()} XP</span>
                      </div>
                    )}
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'5px 8px', borderRadius:7, background:'rgba(139,92,246,.06)' }}>
                      <span style={{ fontSize:11, color:'var(--text2)' }}>Perfect Days</span>
                      <span className="mono" style={{ fontSize:13, fontWeight:700, color:personalRecords.perfectDays>0?'#10b981':'var(--muted)' }}>{personalRecords.perfectDays}/{personalRecords.daysInMonth}</span>
                    </div>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'5px 8px', borderRadius:7, background:'rgba(139,92,246,.06)' }}>
                      <span style={{ fontSize:11, color:'var(--text2)' }}>Active Days</span>
                      <span className="mono" style={{ fontSize:13, fontWeight:700, color:'#8b5cf6' }}>{personalRecords.activeDays}/{personalRecords.daysInMonth}</span>
                    </div>
                    {(closedDeals.length > 0 || archivedDeals.length > 0) && (
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

        {/* ══ HEATMAP ════════════════════════════════════════ */}
        {tab==='heatmap' && (
          <div>
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
          </div>
        )}

        {/* ══ WEEKLY ══════════════════════════════════════════ */}
        {tab==='weekly' && (
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
              <div style={{ flex:1, fontSize:13, color:'var(--muted)' }}>
                Week {today.week+1} — ✓ toggle · × remove from day · ↩ restore · + add · 🖨️ print
              </div>
              <button onClick={() => {
                if (!confirm('Clear all non-calendar tasks for this week?')) return
                const wi = today.week
                const dates = [0,1,2,3,4,5,6].map(di => dateStrForDay(wi, di)).filter(Boolean)
                clearTasksForDates(dates)
                showToast('Week cleared', 'success')
              }}
                style={{ fontSize:11, padding:'6px 10px', borderRadius:8, fontWeight:600,
                  background:'none', color:'var(--dim)', border:'1px solid var(--b2)',
                  cursor:'pointer', whiteSpace:'nowrap' }}>
                🗑️ Clear
              </button>
              {!(profile?.team_id && profile?.teams?.team_prefs?.ai_tools?.ai_weekly_enabled === false) && (
              <button onClick={()=>setAiTaskGenScope('week')}
                style={{ fontSize:11, padding:'6px 12px', borderRadius:8, fontWeight:600,
                  background:'linear-gradient(135deg,#8b5cf6,#6d28d9)', color:'#fff',
                  border:'none', cursor:'pointer', display:'flex', alignItems:'center', gap:4,
                  boxShadow:'0 2px 8px rgba(109,40,217,.25)', whiteSpace:'nowrap' }}>
                ✨ AI Plan Week
              </button>
              )}
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
                    padding:16, minWidth:0, overflow:'hidden',
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

                    {/* Unified ordered task list */}
                    {(()=>{
                      const recHabits = [...activeBuiltIn.map(h=>({...h,isBuiltIn:true})), ...activeDefaults.map(t=>({...t,isBuiltIn:false}))]
                      const weekUnified = getOrderedTasksForDate(dateStr, recHabits, activeDayTasks)
                      return (
                    <div style={{ display:'flex', flexDirection:'column', gap:3, minWidth:0, overflow:'hidden' }}>
                      {weekUnified.map((h, idx)=>{
                        if (h.isBuiltIn) {
                          const checked = habits[h.id][wi][di]
                          const cs = CAT[h.cat]
                          return (
                            <div key={h.id} style={{ display:'flex', alignItems:'center', gap:2, minWidth:0, overflow:'hidden' }}>
                              <div className="week-reorder">
                                <button className="reorder-btn" disabled={idx===0} onClick={()=>moveTask(dateStr,weekUnified,h.id,-1)}>▲</button>
                                <button className="reorder-btn" disabled={idx===weekUnified.length-1} onClick={()=>moveTask(dateStr,weekUnified,h.id,1)}>▼</button>
                              </div>
                              <button onClick={()=>toggleHabit(h.id,wi,di)} style={{...weekRowStyle(checked,cs),flex:1,minWidth:0}}>
                                {weekCheckBox(checked, cs.color)}
                                <span style={{ fontSize:10, flex:1, minWidth:0, color:checked?'var(--muted)':'var(--text2)',
                                  textDecoration:checked?'line-through':'none',
                                  overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{h.icon} {h.label}</span>
                                {xpEnabled && <span className="mono" style={{ fontSize:9, color:cs.color, flexShrink:0 }}>+{h.xp}</span>}
                              </button>
                              {weekRemoveBtn(()=>dateStr && skipHabitForDate(h.id, dateStr))}
                            </div>
                          )
                        } else if (h.isDaySpecific) {
                          const checked = !!(customDone[`${h.id}-${wi}-${di}`])
                          const gcal = !!h.googleEventId
                          const cs = gcal
                            ? { light:'rgba(66,133,244,.1)', color:'#4285f4', border:'rgba(66,133,244,.3)' }
                            : { light:'rgba(139,92,246,.1)', color:'#8b5cf6', border:'rgba(139,92,246,.3)' }
                          return (
                            <div key={h.id} style={{ display:'flex', alignItems:'center', gap:2, minWidth:0, overflow:'hidden' }}>
                              <div className="week-reorder">
                                <button className="reorder-btn" disabled={idx===0} onClick={()=>moveTask(dateStr,weekUnified,h.id,-1)}>▲</button>
                                <button className="reorder-btn" disabled={idx===weekUnified.length-1} onClick={()=>moveTask(dateStr,weekUnified,h.id,1)}>▼</button>
                              </div>
                              <button onClick={()=>toggleCustomTask(h.id,wi,di)} style={{...weekRowStyle(checked,cs),flex:1,minWidth:0}}>
                                {weekCheckBox(checked, cs.color)}
                                <span style={{ fontSize:10, flex:1, minWidth:0, color:checked?'var(--muted)':'var(--text2)',
                                  textDecoration:checked?'line-through':'none',
                                  overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{h.icon} {h.label}</span>
                              </button>
                              {weekRemoveBtn(()=>deleteDayTask(h))}
                            </div>
                          )
                        } else {
                          const checked = !!(customDone[`${h.id}-${wi}-${di}`])
                          const cs = { light:'rgba(6,182,212,.1)', color:'#06b6d4', border:'rgba(6,182,212,.3)' }
                          return (
                            <div key={h.id} style={{ display:'flex', alignItems:'center', gap:2, minWidth:0, overflow:'hidden' }}>
                              <div className="week-reorder">
                                <button className="reorder-btn" disabled={idx===0} onClick={()=>moveTask(dateStr,weekUnified,h.id,-1)}>▲</button>
                                <button className="reorder-btn" disabled={idx===weekUnified.length-1} onClick={()=>moveTask(dateStr,weekUnified,h.id,1)}>▼</button>
                              </div>
                              <button onClick={()=>toggleCustomTask(h.id,wi,di)} style={{...weekRowStyle(checked,cs),flex:1,minWidth:0}}>
                                {weekCheckBox(checked,'#06b6d4')}
                                <span style={{ fontSize:10, flex:1, minWidth:0, color:checked?'var(--muted)':'var(--text2)',
                                  textDecoration:checked?'line-through':'none',
                                  overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{h.icon} {h.label}</span>
                              </button>
                              {weekRemoveBtn(()=>dateStr && skipHabitForDate(h.id, dateStr))}
                            </div>
                          )
                        }
                      })}
                    </div>
                      )
                    })()}

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
                          onKeyDown={e=>{ if(e.key==='Enter'&&plannerForm.label.trim()) addTaskForDay(wi,di,plannerForm.label,plannerForm.icon,plannerForm.xp,plannerForm.time||null) }}
                          placeholder="Task name…"
                          style={{ width:'100%', padding:'6px 8px', fontSize:12, borderRadius:6,
                            border:'1px solid var(--b2)', background:'var(--surface)', color:'var(--text)',
                            outline:'none', boxSizing:'border-box', marginBottom:6 }}
                          autoFocus/>
                        <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                          <input value={plannerForm.icon}
                            onChange={e=>setPlannerForm(p=>({...p,icon:e.target.value}))}
                            style={{ width:38, padding:'5px 6px', fontSize:14, borderRadius:6,
                              border:'1px solid var(--b2)', background:'var(--surface)', color:'var(--text)',
                              textAlign:'center', outline:'none' }}/>
                          <input type="time" value={plannerForm.time||''}
                            onChange={e=>setPlannerForm(p=>({...p,time:e.target.value}))}
                            placeholder="Time"
                            style={{ width:80, padding:'5px 6px', fontSize:11, borderRadius:6,
                              border:'1px solid var(--b2)', background:'var(--surface)', color:'var(--text)',
                              outline:'none', fontFamily:"'JetBrains Mono',monospace" }}/>
                          <input type="number" value={plannerForm.xp}
                            onChange={e=>setPlannerForm(p=>({...p,xp:Number(e.target.value)||0}))}
                            style={{ width:48, padding:'5px 8px', fontSize:12, borderRadius:6,
                              border:'1px solid var(--b2)', background:'var(--surface)', color:'var(--text)', outline:'none' }}
                            placeholder="XP"/>
                          <button className="btn-gold" disabled={!plannerForm.label.trim()}
                            onClick={()=>addTaskForDay(wi,di,plannerForm.label,plannerForm.icon,plannerForm.xp,plannerForm.time||null)}
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

        </>)}

        {/* ══ POTENTIAL LISTINGS TAB ═════════════════════════════ */}
        {!isTC && activeTab==='potential' && (<>
        <div style={{ marginTop:36 }}>
          <div className="section-divider"/>
          <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:14, gap:12, flexWrap:'wrap' }}>
            <div>
              <div style={{ display:'flex', alignItems:'center', gap:9, marginBottom:4 }}>
                <div style={{ width:36, height:36, borderRadius:10, background:'rgba(245,158,11,.1)', border:'1px solid rgba(245,158,11,.25)',
                  display:'flex', alignItems:'center', justifyContent:'center', fontSize:17, flexShrink:0 }}>💡</div>
                <span className="serif" style={{ fontSize:20, color:'var(--text)', fontWeight:600 }}>Potential Listings</span>
                <span style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:700, fontSize:20, color:'#d97706', lineHeight:1 }}>{potentialListings.length}</span>
              </div>
              <div className="section-sub" style={{ marginBottom:0 }}>
                Properties you're prospecting · <strong>Promote to Listing</strong> when signed
              </div>
            </div>
          </div>

          {/* Potential listing cards */}
          <div className="deal-card-grid">
            {potentialListings.length === 0 && (
              <div className="deal-card" style={{ textAlign:'center', padding:'28px 20px', color:'var(--dim)', fontSize:13 }}>
                No potential listings yet — add one below
              </div>
            )}

            {potentialListings.map(l => {
              const isP = String(l.commission||'').trim().endsWith('%')
              const comm = resolveCommission(l.commission, l.price)
              const priceNum = parseFloat(String(l.price||'').replace(/[^0-9.]/g,''))
              const isEditing = editingPotential === l.id
              const metaParts = []
              if (l.commission) metaParts.push(isP && comm > 0 ? `${l.commission} = ${fmtMoney(comm)}` : (isP ? l.commission : formatPrice(l.commission)))
              if (l.listDate) metaParts.push(`Listed ${fmtShortDate(l.listDate)}`)
              if (l.expiresDate) metaParts.push(`Exp ${fmtShortDate(l.expiresDate)}`)
              if (l.leadSource) metaParts.push(l.leadSource)
              if (l.monthYear && l.monthYear !== MONTH_YEAR) metaParts.push(fmtMonth(l.monthYear))
              return (
              <div key={l.id} className="deal-card">
                {/* Status — top right */}
                <div className="deal-status">
                  <span className="status-pill-lg" style={{
                    background:'rgba(245,158,11,.1)', color:'#d97706',
                    border:'1px solid rgba(245,158,11,.25)',
                  }}>POTENTIAL</span>
                </div>

                {/* Address */}
                {isEditing ? (
                  <div className="deal-title">
                    <input value={l.address||''}
                      onChange={e=>updatePotentialLocal(l.id,'address',e.target.value)}
                      onBlur={e=>updatePotentialListing(l.id,'address',e.target.value)} placeholder="Property address…"/>
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

                {/* Edit fields */}
                {isEditing && (
                  <div style={{ marginTop:14, paddingTop:14, borderTop:'1px solid var(--b1)', animation:'slideDown .2s ease' }}>
                    <div className="listing-edit-row">
                      <div>
                        <span className="label">Price</span>
                        <input className="field-input" value={l.price||''}
                          onChange={e=>updatePotentialLocal(l.id,'price',e.target.value)}
                          onBlur={e=>updatePotentialListing(l.id,'price',e.target.value)}
                          placeholder="450000"
                          style={{ padding:'8px 12px', marginTop:4, width:'100%', boxSizing:'border-box', color:'var(--gold2)', fontWeight:600, fontFamily:"'JetBrains Mono',monospace" }}/>
                      </div>
                      <div>
                        <span className="label">Commission</span>
                        <div style={{ display:'flex', gap:4, marginTop:4 }}>
                          <input className="field-input"
                            value={isP ? String(l.commission||'').replace(/%$/,'') : (l.commission||'')}
                            onChange={e => updatePotentialLocal(l.id, 'commission', isP ? e.target.value + '%' : e.target.value)}
                            onBlur={e => updatePotentialListing(l.id, 'commission', isP ? e.target.value + '%' : e.target.value)}
                            placeholder={isP ? '3' : '5000'}
                            style={{ padding:'8px 12px', flex:1, minWidth:0, color: isP ? 'var(--muted)' : 'var(--green)', fontWeight:600, fontFamily:"'JetBrains Mono',monospace" }}/>
                          <button onClick={()=>togglePotentialCommType(l.id)} style={{
                            background:'var(--bg2)', border:'1px solid var(--b2)', borderRadius:6, cursor:'pointer', padding:'6px 10px',
                            fontSize:10, color:'var(--dim)', fontFamily:"'JetBrains Mono',monospace", fontWeight:600, whiteSpace:'nowrap',
                          }}>{isP ? '$ Flat' : '% Rate'}</button>
                        </div>
                      </div>
                      <div>
                        <span className="label">Lead Source</span>
                        <select className="field-input" value={l.leadSource||''}
                          onChange={e=>updatePotentialListing(l.id,'leadSource',e.target.value)}
                          style={{ padding:'8px 12px', marginTop:4, width:'100%', boxSizing:'border-box' }}>
                          <option value="">None</option>
                          {LEAD_SOURCES.map(s=><option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="listing-edit-row" style={{ marginTop:10, borderTop:'none', paddingTop:0 }}>
                      <div>
                        <span className="label">List Date</span>
                        <input className="field-input" type="date" value={l.listDate||''}
                          onChange={e=>updatePotentialListing(l.id,'listDate',e.target.value)}
                          style={{ padding:'8px 12px', marginTop:4, width:'100%', boxSizing:'border-box' }}/>
                      </div>
                      <div>
                        <span className="label">Expiration Date</span>
                        <input className="field-input" type="date" value={l.expiresDate||''}
                          onChange={e=>updatePotentialListing(l.id,'expiresDate',e.target.value)}
                          style={{ padding:'8px 12px', marginTop:4, width:'100%', boxSizing:'border-box' }}/>
                      </div>
                      <div/>
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="deal-actions">
                  <button className="btn-gold" style={{ padding:'6px 14px', fontSize:12 }} onClick={()=>promotePotential(l)}>🏡 Promote to Listing</button>
                  <div style={{ flex:1 }}/>
                  <button className="edit-toggle" title={isEditing ? 'Done editing' : 'Edit listing'} onClick={()=>setEditingPotential(isEditing ? null : l.id)}>
                    {isEditing ? '✓' : '✏️'}
                  </button>
                  <button className="edit-toggle" title="Remove" onClick={()=>removePotentialListing(l)} style={{ color:'var(--dim)' }}>✕</button>
                </div>
              </div>
              )
            })}
          </div>

          {/* Add potential listing bar */}
          <div style={{ marginTop:14 }}>
            <div className="add-bar" onClick={() => document.getElementById('add-potential-input')?.focus()}>
              <span style={{ fontSize:16, color:'var(--dim)', flexShrink:0 }}>+</span>
              <input id="add-potential-input" value={newPotAddr} onChange={e=>setNewPotAddr(e.target.value)}
                onFocus={()=>setAddPotExpanded(true)}
                onKeyDown={e=>e.key==='Enter'&&addPotentialListing()}
                placeholder="Add a potential listing address…"/>
              {newPotAddr.trim() && (
                <button onClick={e=>{e.stopPropagation();addPotentialListing()}} className="btn-gold" style={{ flexShrink:0, padding:'6px 14px', whiteSpace:'nowrap' }}>
                  + Add
                </button>
              )}
            </div>
            {addPotExpanded && newPotAddr.trim() && (
              <>
                <div className="add-bar-fields" style={{ borderRadius:0 }}>
                  <input className="field-input" value={newPotPrice} onChange={e=>setNewPotPrice(e.target.value)}
                    onKeyDown={e=>e.key==='Enter'&&addPotentialListing()} placeholder="Est. price"
                    style={{ padding:'8px 12px', color:'var(--gold2)', fontFamily:"'JetBrains Mono',monospace", fontWeight:600 }}/>
                  <input className="field-input" value={newPotComm} onChange={e=>setNewPotComm(e.target.value)}
                    onKeyDown={e=>e.key==='Enter'&&addPotentialListing()} placeholder="Commission (3%)"
                    style={{ padding:'8px 12px', color:'var(--green)', fontFamily:"'JetBrains Mono',monospace", fontWeight:600 }}/>
                  <select className="field-input" value={newPotLeadSource} onChange={e=>setNewPotLeadSource(e.target.value)}
                    style={{ padding:'8px 12px' }}>
                    <option value="">Lead source…</option>
                    {LEAD_SOURCES.map(s=><option key={s} value={s}>{s}</option>)}
                  </select>
                  <button onClick={()=>{setAddPotExpanded(false);setNewPotAddr('');setNewPotPrice('');setNewPotComm('');setNewPotLeadSource('');setNewPotListDate('');setNewPotExpiresDate('')}}
                    style={{ background:'none', border:'none', color:'var(--dim)', cursor:'pointer', fontSize:12, fontWeight:600, whiteSpace:'nowrap' }}>Cancel</button>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, padding:'10px 20px',
                  background:'var(--surface)', border:'1.5px solid var(--b3)', borderTop:'none',
                  borderRadius:'0 0 var(--r) var(--r)' }}>
                  <div>
                    <span className="label" style={{ fontSize:10 }}>List Date</span>
                    <input className="field-input" type="date" value={newPotListDate} onChange={e=>setNewPotListDate(e.target.value)}
                      style={{ padding:'6px 10px', marginTop:3, width:'100%', boxSizing:'border-box', fontSize:12 }}/>
                  </div>
                  <div>
                    <span className="label" style={{ fontSize:10 }}>Expiration</span>
                    <input className="field-input" type="date" value={newPotExpiresDate} onChange={e=>setNewPotExpiresDate(e.target.value)}
                      style={{ padding:'6px 10px', marginTop:3, width:'100%', boxSizing:'border-box', fontSize:12 }}/>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
        </>)}

        {/* ══ LISTINGS TAB ═════════════════════════════════════ */}
        {!isTC && activeTab==='listings' && (<>

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
              const dom = daysOnMarket(l.listDate, l.createdAt)
              const priceNum = parseFloat(String(l.price||'').replace(/[^0-9.]/g,''))
              const isEditing = editingListing === l.id
              const metaParts = []
              if (l.commission) metaParts.push(isP && comm > 0 ? `${l.commission} = ${fmtMoney(comm)}` : (isP ? l.commission : formatPrice(l.commission)))
              if (l.listDate) metaParts.push(`Listed ${fmtShortDate(l.listDate)}`)
              if (l.expiresDate) metaParts.push(`Exp ${fmtShortDate(l.expiresDate)}`)
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
                  <div style={{ marginTop:14, paddingTop:14, borderTop:'1px solid var(--b1)', animation:'slideDown .2s ease' }}>
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
                    <div className="listing-edit-row" style={{ marginTop:10, borderTop:'none', paddingTop:0 }}>
                      <div>
                        <span className="label">List Date</span>
                        <input className="field-input" type="date" value={l.listDate||''}
                          onChange={e=>updateListing(l.id,'listDate',e.target.value)}
                          style={{ padding:'8px 12px', marginTop:4, width:'100%', boxSizing:'border-box' }}/>
                      </div>
                      <div>
                        <span className="label">Expiration Date</span>
                        <input className="field-input" type="date" value={l.expiresDate||''}
                          onChange={e=>updateListing(l.id,'expiresDate',e.target.value)}
                          style={{ padding:'8px 12px', marginTop:4, width:'100%', boxSizing:'border-box' }}/>
                      </div>
                      <div/>
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="deal-actions">
                  {l.status !== 'closed' ? (
                    <button className="act-btn act-btn-blue" onClick={()=>handleListingOfferReceived(l)}>Offer Rec'd</button>
                  ) : (
                    <span style={{ fontSize:11, color:'var(--dim)', fontStyle:'italic' }}>Deal completed</span>
                  )}
                  <div style={{ flex:1 }}/>
                  <button className="edit-toggle" title="Email listing update" onClick={()=>{setClientUpdateNotes('');setClientUpdateEmailTo('');setClientUpdateName('');setClientUpdateListing(l)}}>✉️</button>
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
              <>
                <div className="add-bar-fields" style={{ borderRadius:0 }}>
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
                  <button onClick={()=>{setAddListingExpanded(false);setNewAddr('');setNewPrice('');setNewComm('');setNewLeadSource('');setNewListDate('');setNewExpiresDate('')}}
                    style={{ background:'none', border:'none', color:'var(--dim)', cursor:'pointer', fontSize:12, fontWeight:600, whiteSpace:'nowrap' }}>Cancel</button>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, padding:'10px 20px',
                  background:'var(--surface)', border:'1.5px solid var(--b3)', borderTop:'none',
                  borderRadius:'0 0 var(--r) var(--r)' }}>
                  <div>
                    <span className="label" style={{ fontSize:10 }}>List Date</span>
                    <input className="field-input" type="date" value={newListDate} onChange={e=>setNewListDate(e.target.value)}
                      style={{ padding:'6px 10px', marginTop:3, width:'100%', boxSizing:'border-box', fontSize:12 }}/>
                  </div>
                  <div>
                    <span className="label" style={{ fontSize:10 }}>Expiration</span>
                    <input className="field-input" type="date" value={newExpiresDate} onChange={e=>setNewExpiresDate(e.target.value)}
                      style={{ padding:'6px 10px', marginTop:3, width:'100%', boxSizing:'border-box', fontSize:12 }}/>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* ══ LISTINGS PIPELINE ══════════════════════════════ */}
        <div style={{ marginTop:36 }}>
          <div className="section-divider"/>
          <div style={{ display:'flex', alignItems:'center', gap:9, marginBottom:16, flexWrap:'wrap' }}>
            <span style={{ fontSize:20 }}>📊</span>
            <span className="serif" style={{ fontSize:20, color:'var(--text)', fontWeight:600 }}>Listings Pipeline</span>
            <span style={{ fontSize:11, color:'var(--muted)', paddingLeft:4 }} className="mob-hide">
              Seller-side transactions
            </span>
            <div style={{ marginLeft:'auto', display:'flex', gap:0, border:'1px solid var(--b2)', borderRadius:8, overflow:'hidden' }}>
              {[{v:'list',l:'☰ List'},{v:'board',l:'▦ Board'}].map(v=>(
                <button key={v.v} onClick={()=>setListingsPipelineView(v.v)} style={{
                  padding:'5px 12px', fontSize:11, fontWeight:listingsPipelineView===v.v?700:500, border:'none', cursor:'pointer',
                  background:listingsPipelineView===v.v?'var(--gold2)':'var(--surface)', color:listingsPipelineView===v.v?'#fff':'var(--muted)',
                  transition:'all .15s', fontFamily:'Poppins,sans-serif',
                }}>{v.l}</button>
              ))}
            </div>
          </div>

          {listingsPipelineView === 'list' ? (
            <>
              <PipelineSection title="Offers Received" icon="📥" accentColor="#8b5cf6" xpLabel={xpEnabled ? PIPELINE_XP.offer_received : null}
                rows={offersReceived} setRows={setOffersReceived} userId={user.id}
                onStatusChange={(r,s)=>handleOfferStatus(r,s,setOffersReceived)}
                onAdd={handleOfferReceivedAdd}
                onRemove={()=>deductPipelineXp('offer_received')}
                statusOpts={[{v:'pending',l:'✓ Accepted'},{v:'countered',l:'↩ Counter'},{v:'declined',l:'✕ Decline',variant:'red'},{v:'closed',l:'Mark Closed'}]}/>
              <PipelineSection title="Went Pending" icon="⏳" accentColor="#f59e0b" xpLabel={xpEnabled ? PIPELINE_XP.went_pending : null}
                rows={pendingDeals.filter(d=>d.dealSide==='seller'||d.closedFrom==='Listing')} setRows={setPendingDeals} userId={user.id}
                onStatusChange={(r,s)=>handlePendingStatus(r,s)}
                onRemove={()=>deductPipelineXp('went_pending')}
                statusOpts={[{v:'active',l:'Active'},{v:'closed',l:'Mark Closed'}]}
                expandedChecklist={expandedChecklist} setExpandedChecklist={setExpandedChecklist}
                onToggleChecklistItem={toggleChecklistItem} onAddChecklistItem={addChecklistItem}
                onRemoveChecklistItem={removeChecklistItem} onUpdateChecklistDueDate={updateChecklistDueDate}/>
              <PipelineSection title="Closed Deals" icon="🎉" accentColor="#10b981" xpLabel={xpEnabled ? PIPELINE_XP.closed : null}
                rows={closedDeals.filter(d=>d.dealSide==='seller'||d.closedFrom==='Listing')} setRows={setClosedDeals} userId={user.id}
                archiveOnRemove={true} onArchiveToClosed={archiveDealFromPipeline}
                showSource={true}/>
            </>
          ) : (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, minHeight:200 }}>
              {[
                { title:'Offers Rec\'d', icon:'📥', color:'#8b5cf6', rows:offersReceived },
                { title:'Pending', icon:'⏳', color:'#f59e0b', rows:pendingDeals.filter(d=>d.dealSide==='seller'||d.closedFrom==='Listing') },
                { title:'Closed', icon:'🎉', color:'#10b981', rows:closedDeals.filter(d=>d.dealSide==='seller'||d.closedFrom==='Listing') },
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
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ══ LISTINGS GCI ══════════════════════════════════════ */}
        {[...closedDeals,...archivedDeals].filter(d=>d.dealSide==='seller'||d.closedFrom==='Listing').length > 0 && (() => {
          const sellerClosed = [...closedDeals,...archivedDeals].filter(d=>d.dealSide==='seller'||d.closedFrom==='Listing')
          const sellerComm = sellerClosed.reduce((s,d)=>s+resolveCommission(d.commission,d.price),0)
          const sellerVol = sellerClosed.reduce((s,d)=>s+parseFloat(String(d.price||'').replace(/[^0-9.]/g,'')||0),0)
          return (
            <div style={{ marginTop:24 }}>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(140px,1fr))', gap:10 }}>
                <div className="card" style={{ padding:14, textAlign:'center', borderTop:'2.5px solid #10b981' }}>
                  <div style={{ fontSize:10, color:'var(--muted)', letterSpacing:.8, marginBottom:4 }}>SELLER GCI</div>
                  <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:18, fontWeight:700, color:'#10b981' }}>{fmtMoney(sellerComm)}</div>
                </div>
                <div className="card" style={{ padding:14, textAlign:'center', borderTop:'2.5px solid var(--purple)' }}>
                  <div style={{ fontSize:10, color:'var(--muted)', letterSpacing:.8, marginBottom:4 }}>DEALS CLOSED</div>
                  <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:18, fontWeight:700, color:'var(--purple)' }}>{sellerClosed.length}</div>
                </div>
                {sellerVol > 0 && (
                  <div className="card" style={{ padding:14, textAlign:'center', borderTop:'2.5px solid var(--blue)' }}>
                    <div style={{ fontSize:10, color:'var(--muted)', letterSpacing:.8, marginBottom:4 }}>VOLUME</div>
                    <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:18, fontWeight:700, color:'var(--blue)' }}>{fmtMoney(sellerVol)}</div>
                  </div>
                )}
              </div>
            </div>
          )
        })()}

        </>)}

        {/* ══ BUYERS TAB ═══════════════════════════════════════ */}
        {!isTC && activeTab==='buyers' && (<>

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

                {/* Client name — display or edit, with pencil inline */}
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
                  <button className="edit-toggle" title={isEditingName ? 'Done editing' : 'Edit name'}
                    onClick={() => setEditingRep(isEditingName ? null : rep.id)}
                    style={{ flexShrink:0, ...(isEditingName ? { background:'var(--bg2)', color:'var(--text)', borderColor:'var(--b2)' } : {}) }}>
                    {isEditingName ? '✓' : '✏️'}
                  </button>
                </div>

                {/* At-a-glance summary */}
                {(() => {
                  const bits = []
                  if (bd.locationPrefs) bits.push('📍 ' + bd.locationPrefs)
                  if (bd.preApproval) bits.push('💰 ' + (formatPrice(bd.preApproval) || bd.preApproval))
                  if (bd.mustHaves) bits.push(bd.mustHaves)
                  const showCount = (bd.showings||[]).length
                  if (showCount > 0) bits.push('🏠 ' + showCount + ' showing' + (showCount!==1?'s':''))
                  return bits.length > 0 ? (
                    <div style={{ fontSize:12, color:'var(--muted)', lineHeight:1.5, marginTop:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {bits.join(' · ')}
                    </div>
                  ) : null
                })()}

                {/* Metadata line — pre-approval, dates, timeline, location, month */}
                <div className="deal-meta-line">
                  {bd.preApproval && (
                    <>
                      <span>Pre-approved: <span style={{ color:'var(--blue)', fontWeight:600 }}>{formatPrice(bd.preApproval) || bd.preApproval}</span></span>
                    </>
                  )}
                  {bd.preApproval && (bd.dateSigned || bd.dateExpires || bd.timeline) && <span className="sep"/>}
                  {bd.dateSigned && (
                    <span style={{ color:'var(--green)', fontWeight:600 }}>Signed {fmtShortDate(bd.dateSigned)}</span>
                  )}
                  {bd.dateSigned && bd.dateExpires && <span className="sep"/>}
                  {bd.dateExpires && (
                    <span style={{ color: new Date(bd.dateExpires+'T00:00:00') < new Date() ? 'var(--red)' : 'var(--gold2)', fontWeight:600 }}>
                      Exp {fmtShortDate(bd.dateExpires)}
                    </span>
                  )}
                  {(bd.dateSigned || bd.dateExpires) && bd.timeline && <span className="sep"/>}
                  {!bd.dateSigned && !bd.dateExpires && bd.preApproval && bd.timeline && <span className="sep"/>}
                  {bd.timeline && <span>{bd.timeline}</span>}
                  {(bd.preApproval || bd.dateSigned || bd.dateExpires || bd.timeline) && rep.monthYear && rep.monthYear !== MONTH_YEAR && <span className="sep"/>}
                  {rep.monthYear && rep.monthYear !== MONTH_YEAR && (
                    <span>{fmtMonth(rep.monthYear)}</span>
                  )}
                </div>

                {/* Actions row */}
                <div className="deal-actions">
                  {rep.status === 'closed' && (
                    <span style={{ fontSize:11, color:'var(--dim)', fontStyle:'italic' }}>Agreement closed</span>
                  )}
                  <div style={{ marginLeft:'auto', display:'flex', gap:4, alignItems:'center' }}>
                    {bd.postedToBoard ? (
                      <span style={{ fontSize:10, padding:'2px 8px', borderRadius:5, background:'rgba(16,185,129,.1)', color:'var(--green)',
                        border:'1px solid rgba(16,185,129,.25)', fontWeight:600, whiteSpace:'nowrap' }}>
                        ✓ On Board
                      </span>
                    ) : (
                      <button onClick={e => { e.stopPropagation(); postBuyerNeedToBoard(rep) }} className="edit-toggle" title="Post to buyer needs board"
                        style={{ fontSize:10, fontWeight:600 }}>
                        📋
                      </button>
                    )}
                    <button onClick={() => setExpandedRep(isExpanded ? null : rep.id)}
                      className="edit-toggle" title={isExpanded ? 'Hide details' : 'Show details'}
                      style={ isExpanded ? { background:'var(--blue)', color:'#fff', borderColor:'var(--blue)' } : {}}>
                      {isExpanded ? '▲' : '▼'}
                    </button>
                    <button className="edit-toggle" title="Print buyer summary" onClick={() => setPrintBuyerRep(rep)}>🖨️</button>
                    <button className="edit-toggle" title="Remove" onClick={() => removeBuyerRep(rep)}
                      style={{ color:'var(--dim)' }}>✕</button>
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

                    {/* Houses Shown */}
                    {(()=>{
                      const showings = bd.showings || []
                      return (
                        <div style={{ marginBottom:14 }}>
                          <div className="label" style={{ marginBottom:6, fontSize:10, letterSpacing:'.08em', textTransform:'uppercase', color:'var(--text2)', fontWeight:700 }}>
                            Houses Shown {showings.length > 0 && <span style={{ color:'var(--dim)', fontWeight:400 }}>({showings.length})</span>}
                          </div>
                          {showings.length === 0 && (
                            <div style={{ fontSize:12, color:'var(--dim)', fontStyle:'italic', marginBottom:8 }}>No showings logged yet</div>
                          )}
                          {showings.map(s => (
                            <div key={s.id} style={{ padding:'10px 12px', background:'var(--bg)', borderRadius:8, border:'1px solid var(--b1)', marginBottom:6 }}>
                              <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                                <span style={{ fontSize:14, flexShrink:0 }}>🏠</span>
                                <input className="field-input" value={s.address} placeholder="Property address…"
                                  onChange={e => updateShowing(rep.id, s.id, 'address', e.target.value)}
                                  style={{ flex:1, minWidth:140, padding:'4px 8px', fontSize:12, fontWeight:600 }}/>
                                <input className="field-input" type="date" value={s.dateShown||''}
                                  onChange={e => updateShowing(rep.id, s.id, 'dateShown', e.target.value)}
                                  style={{ width:130, padding:'4px 8px', fontSize:11 }}/>
                                <input className="field-input" type="time" value={s.timeShown||''}
                                  onChange={e => updateShowing(rep.id, s.id, 'timeShown', e.target.value)}
                                  style={{ width:100, padding:'4px 8px', fontSize:11 }}/>
                                {s.offerId ? (
                                  <span style={{ fontSize:10, color:'var(--green)', fontWeight:700, whiteSpace:'nowrap', padding:'4px 10px',
                                    background:'rgba(16,185,129,.1)', borderRadius:6, border:'1px solid rgba(16,185,129,.25)' }}>✓ Offer Made</span>
                                ) : rep.status !== 'closed' && (
                                  <button onClick={() => setOfferModal({ repId:rep.id, repName:rep.clientName||'Buyer', prefillAddress:s.address, showingId:s.id })}
                                    style={{ fontSize:10, fontWeight:700, color:'var(--blue)', background:'rgba(14,165,233,.08)',
                                      border:'1px solid rgba(14,165,233,.25)', borderRadius:6, padding:'4px 10px', cursor:'pointer', whiteSpace:'nowrap' }}>
                                    📤 Make Offer
                                  </button>
                                )}
                                <button onClick={() => {
                                    const date = s.dateShown || new Date().toLocaleDateString('en-CA')
                                    const time = s.timeShown || '10:00'
                                    const startDt = date.replace(/-/g,'') + 'T' + time.replace(':','') + '00'
                                    const [h,m] = time.split(':').map(Number)
                                    const endH = String(h+1).padStart(2,'0')
                                    const endDt = date.replace(/-/g,'') + 'T' + endH + String(m).padStart(2,'0') + '00'
                                    const title = encodeURIComponent(`Showing: ${s.address || 'Property'}`)
                                    const loc = encodeURIComponent(s.address || '')
                                    const details = encodeURIComponent(`Buyer: ${rep.clientName || 'Client'}${s.notes ? '\n' + s.notes : ''}`)
                                    window.open(`https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${startDt}/${endDt}&location=${loc}&details=${details}`, '_blank')
                                  }} title="Add to Google Calendar"
                                  style={{ background:'none', border:'none', cursor:'pointer', fontSize:13, padding:'2px 4px', flexShrink:0 }}>📅</button>
                                <button onClick={() => removeShowing(rep.id, s.id)} title="Remove showing"
                                  style={{ background:'none', border:'none', cursor:'pointer', color:'var(--dim)', fontSize:12, padding:'2px 4px', flexShrink:0 }}>✕</button>
                              </div>
                              <div style={{ marginTop:6, paddingLeft:22 }}>
                                <input className="field-input" value={s.notes||''} placeholder="Notes…"
                                  onChange={e => updateShowing(rep.id, s.id, 'notes', e.target.value)}
                                  style={{ width:'100%', padding:'4px 8px', fontSize:11, color:'var(--text2)', boxSizing:'border-box' }}/>
                              </div>
                            </div>
                          ))}
                          {/* Add showing inline form */}
                          {rep.status !== 'closed' && (
                            <div style={{ display:'flex', gap:6, alignItems:'center', marginTop:6, flexWrap:'wrap' }}>
                              <span style={{ color:'var(--dim)', fontSize:14, flexShrink:0 }}>+</span>
                              <input id={`add-showing-addr-${rep.id}`} className="field-input" placeholder="Address of house shown…"
                                onKeyDown={e => {
                                  if (e.key === 'Enter' && e.target.value.trim()) {
                                    const dateInput = document.getElementById(`add-showing-date-${rep.id}`)
                                    const timeInput = document.getElementById(`add-showing-time-${rep.id}`)
                                    addShowing(rep.id, e.target.value, dateInput?.value || '', timeInput?.value || '', '')
                                    e.target.value = ''
                                    if (dateInput) dateInput.value = new Date().toLocaleDateString('en-CA')
                                    if (timeInput) timeInput.value = ''
                                  }
                                }}
                                style={{ flex:1, minWidth:120, padding:'5px 8px', fontSize:12 }}/>
                              <input id={`add-showing-date-${rep.id}`} className="field-input" type="date"
                                defaultValue={new Date().toLocaleDateString('en-CA')}
                                style={{ width:130, padding:'5px 8px', fontSize:11 }}/>
                              <input id={`add-showing-time-${rep.id}`} className="field-input" type="time"
                                style={{ width:100, padding:'5px 8px', fontSize:11 }}/>
                              <button onClick={() => {
                                  const addrInput = document.getElementById(`add-showing-addr-${rep.id}`)
                                  const dateInput = document.getElementById(`add-showing-date-${rep.id}`)
                                  const timeInput = document.getElementById(`add-showing-time-${rep.id}`)
                                  if (addrInput?.value.trim()) {
                                    addShowing(rep.id, addrInput.value, dateInput?.value || '', timeInput?.value || '', '')
                                    addrInput.value = ''
                                    if (dateInput) dateInput.value = new Date().toLocaleDateString('en-CA')
                                    if (timeInput) timeInput.value = ''
                                  }
                                }}
                                style={{ fontSize:11, fontWeight:700, color:'var(--blue)', background:'rgba(14,165,233,.08)',
                                  border:'1px solid rgba(14,165,233,.25)', borderRadius:6, padding:'5px 12px', cursor:'pointer', whiteSpace:'nowrap' }}>
                                Add
                              </button>
                            </div>
                          )}
                        </div>
                      )
                    })()}

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

        {/* ══ BUYERS PIPELINE ═════════════════════════════════ */}
        <div style={{ marginTop:36 }}>
          <div className="section-divider"/>
          <div style={{ display:'flex', alignItems:'center', gap:9, marginBottom:16, flexWrap:'wrap' }}>
            <span style={{ fontSize:20 }}>📊</span>
            <span className="serif" style={{ fontSize:20, color:'var(--text)', fontWeight:600 }}>Buyers Pipeline</span>
            <span style={{ fontSize:11, color:'var(--muted)', paddingLeft:4 }} className="mob-hide">
              Buyer-side transactions
            </span>
            <div style={{ marginLeft:'auto', display:'flex', gap:0, border:'1px solid var(--b2)', borderRadius:8, overflow:'hidden' }}>
              {[{v:'list',l:'☰ List'},{v:'board',l:'▦ Board'}].map(v=>(
                <button key={v.v} onClick={()=>setBuyersPipelineView(v.v)} style={{
                  padding:'5px 12px', fontSize:11, fontWeight:buyersPipelineView===v.v?700:500, border:'none', cursor:'pointer',
                  background:buyersPipelineView===v.v?'var(--gold2)':'var(--surface)', color:buyersPipelineView===v.v?'#fff':'var(--muted)',
                  transition:'all .15s', fontFamily:'Poppins,sans-serif',
                }}>{v.l}</button>
              ))}
            </div>
          </div>

          {buyersPipelineView === 'list' ? (
            <>
              <PipelineSection title="Offers Made" icon="📤" accentColor="#0ea5e9" xpLabel={xpEnabled ? PIPELINE_XP.offer_made : null}
                rows={offersMade} setRows={setOffersMade} userId={user.id}
                onStatusChange={(r,s)=>handleOfferStatus(r,s,setOffersMade)}
                onAdd={handleOfferMadeAdd}
                onRemove={()=>deductPipelineXp('offer_made')}
                statusOpts={[{v:'active',l:'Active'},{v:'pending',l:'Move to Pending'},{v:'closed',l:'Mark Closed'}]}/>
              <PipelineSection title="Went Pending" icon="⏳" accentColor="#f59e0b" xpLabel={xpEnabled ? PIPELINE_XP.went_pending : null}
                rows={pendingDeals.filter(d=>d.dealSide==='buyer'||(!d.dealSide&&d.closedFrom!=='Listing'))} setRows={setPendingDeals} userId={user.id}
                onStatusChange={(r,s)=>handlePendingStatus(r,s)}
                onRemove={()=>deductPipelineXp('went_pending')}
                statusOpts={[{v:'active',l:'Active'},{v:'closed',l:'Mark Closed'}]}
                expandedChecklist={expandedChecklist} setExpandedChecklist={setExpandedChecklist}
                onToggleChecklistItem={toggleChecklistItem} onAddChecklistItem={addChecklistItem}
                onRemoveChecklistItem={removeChecklistItem} onUpdateChecklistDueDate={updateChecklistDueDate}/>
              <PipelineSection title="Closed Deals" icon="🎉" accentColor="#10b981" xpLabel={xpEnabled ? PIPELINE_XP.closed : null}
                rows={closedDeals.filter(d=>d.dealSide==='buyer'||(!d.dealSide&&d.closedFrom!=='Listing'))} setRows={setClosedDeals} userId={user.id}
                archiveOnRemove={true} onArchiveToClosed={archiveDealFromPipeline}
                showSource={true}/>
            </>
          ) : (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, minHeight:200 }}>
              {[
                { title:'Offers Made', icon:'📤', color:'#0ea5e9', rows:offersMade },
                { title:'Pending', icon:'⏳', color:'#f59e0b', rows:pendingDeals.filter(d=>d.dealSide==='buyer'||(!d.dealSide&&d.closedFrom!=='Listing')) },
                { title:'Closed', icon:'🎉', color:'#10b981', rows:closedDeals.filter(d=>d.dealSide==='buyer'||(!d.dealSide&&d.closedFrom!=='Listing')) },
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
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ══ BUYERS GCI ════════════════════════════════════════ */}
        {[...closedDeals,...archivedDeals].filter(d=>d.dealSide==='buyer'||(!d.dealSide&&d.closedFrom!=='Listing')).length > 0 && (() => {
          const buyerClosed = [...closedDeals,...archivedDeals].filter(d=>d.dealSide==='buyer'||(!d.dealSide&&d.closedFrom!=='Listing'))
          const buyerComm = buyerClosed.reduce((s,d)=>s+resolveCommission(d.commission,d.price),0)
          const buyerVol = buyerClosed.reduce((s,d)=>s+parseFloat(String(d.price||'').replace(/[^0-9.]/g,'')||0),0)
          return (
            <div style={{ marginTop:24 }}>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(140px,1fr))', gap:10 }}>
                <div className="card" style={{ padding:14, textAlign:'center', borderTop:'2.5px solid #10b981' }}>
                  <div style={{ fontSize:10, color:'var(--muted)', letterSpacing:.8, marginBottom:4 }}>BUYER GCI</div>
                  <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:18, fontWeight:700, color:'#10b981' }}>{fmtMoney(buyerComm)}</div>
                </div>
                <div className="card" style={{ padding:14, textAlign:'center', borderTop:'2.5px solid var(--blue)' }}>
                  <div style={{ fontSize:10, color:'var(--muted)', letterSpacing:.8, marginBottom:4 }}>DEALS CLOSED</div>
                  <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:18, fontWeight:700, color:'var(--blue)' }}>{buyerClosed.length}</div>
                </div>
                {buyerVol > 0 && (
                  <div className="card" style={{ padding:14, textAlign:'center', borderTop:'2.5px solid var(--purple)' }}>
                    <div style={{ fontSize:10, color:'var(--muted)', letterSpacing:.8, marginBottom:4 }}>VOLUME</div>
                    <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:18, fontWeight:700, color:'var(--purple)' }}>{fmtMoney(buyerVol)}</div>
                  </div>
                )}
              </div>
            </div>
          )
        })()}

        </>)}

        {/* ══ ARCHIVED TAB ═══════════════════════════════════════ */}
        {!isTC && primaryTab==='closed' && (<>
        <div style={{ marginTop:36 }}>
          <div className="section-divider"/>
          <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:14, gap:12, flexWrap:'wrap' }}>
            <div>
              <div style={{ display:'flex', alignItems:'center', gap:9, marginBottom:4 }}>
                <div style={{ width:36, height:36, borderRadius:10, background:'rgba(16,185,129,.1)', border:'1px solid rgba(16,185,129,.25)',
                  display:'flex', alignItems:'center', justifyContent:'center', fontSize:17, flexShrink:0 }}>📦</div>
                <span className="serif" style={{ fontSize:20, color:'var(--text)', fontWeight:600 }}>Archived Deals</span>
                <span style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:700, fontSize:20, color:'#10b981', lineHeight:1 }}>
                  {archivedDeals.length}
                </span>
              </div>
              <div className="section-sub" style={{ marginBottom:0 }}>
                Closed deals archived from pipeline · {MONTH_YEAR}
              </div>
            </div>
          </div>

          <div className="deal-card-grid">
            {archivedDeals.length === 0 && (
              <div className="deal-card" style={{ textAlign:'center', padding:'28px 20px', color:'var(--dim)', fontSize:13 }}>
                No archived deals yet — archive closed deals from the pipeline
              </div>
            )}

            {archivedDeals.map(d => {
              const isSeller = d.dealSide === 'seller' || d.closedFrom === 'Listing'
              const sideLabel = isSeller ? 'SELLER' : 'BUYER'
              const sideIcon = isSeller ? '🏡' : '🤝'
              const sideColor = isSeller ? '#8b5cf6' : '#0ea5e9'
              const sideBg = isSeller ? 'rgba(139,92,246,.08)' : 'rgba(14,165,233,.08)'
              const sideBorder = isSeller ? 'rgba(139,92,246,.2)' : 'rgba(14,165,233,.2)'
              const comm = resolveCommission(d.commission, d.price)
              const priceNum = parseFloat(String(d.price||'').replace(/[^0-9.]/g,''))
              return (
                <div key={d.id} className="deal-card">
                  {/* Side badge — top right */}
                  <div className="deal-status">
                    <span className="status-pill-lg" style={{
                      background: sideBg, color: sideColor,
                      border: `1px solid ${sideBorder}`,
                    }}>
                      {sideIcon} {sideLabel}
                    </span>
                  </div>

                  {/* Address */}
                  <div className="deal-title" style={{ paddingRight:100 }}>{d.address || 'Untitled deal'}</div>

                  {/* Price */}
                  <div className="deal-price">{priceNum > 0 ? formatPrice(d.price) : '—'}</div>

                  {/* Meta */}
                  <div className="deal-meta-line">
                    {comm > 0 && <span style={{ color:'var(--green)', fontWeight:700 }}>Commission: {fmtMoney(comm)}</span>}
                    {d.closedFrom && <><span className="sep"/><span>From: {d.closedFrom}</span></>}
                    {d.originalLeadSource && <><span className="sep"/><span>{d.originalLeadSource}</span></>}
                  </div>

                  {/* Archived label */}
                  <div className="deal-actions">
                    <span style={{ fontSize:11, color:'var(--green)', fontWeight:600 }}>✓ Closed</span>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Summary cards */}
          {(() => {
            if (archivedDeals.length === 0) return null
            const sellerCount = archivedDeals.filter(d=>d.dealSide==='seller'||d.closedFrom==='Listing').length
            const buyerCount = archivedDeals.length - sellerCount
            const totalComm = archivedDeals.reduce((s,d)=>s+resolveCommission(d.commission,d.price),0)
            const totalVol = archivedDeals.reduce((s,d)=>s+parseFloat(String(d.price||'').replace(/[^0-9.]/g,'')||0),0)
            return (
              <div style={{ marginTop:24 }}>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(120px,1fr))', gap:10 }}>
                  <div className="card" style={{ padding:14, textAlign:'center', borderTop:'2.5px solid #10b981' }}>
                    <div style={{ fontSize:10, color:'var(--muted)', letterSpacing:.8, marginBottom:4 }}>TOTAL GCI</div>
                    <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:18, fontWeight:700, color:'#10b981' }}>{fmtMoney(totalComm)}</div>
                  </div>
                  {totalVol > 0 && (
                    <div className="card" style={{ padding:14, textAlign:'center', borderTop:'2.5px solid var(--gold2)' }}>
                      <div style={{ fontSize:10, color:'var(--muted)', letterSpacing:.8, marginBottom:4 }}>VOLUME</div>
                      <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:18, fontWeight:700, color:'var(--gold2)' }}>{fmtMoney(totalVol)}</div>
                    </div>
                  )}
                  <div className="card" style={{ padding:14, textAlign:'center', borderTop:'2.5px solid #8b5cf6' }}>
                    <div style={{ fontSize:10, color:'var(--muted)', letterSpacing:.8, marginBottom:4 }}>SELLER</div>
                    <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:18, fontWeight:700, color:'#8b5cf6' }}>{sellerCount}</div>
                  </div>
                  <div className="card" style={{ padding:14, textAlign:'center', borderTop:'2.5px solid #0ea5e9' }}>
                    <div style={{ fontSize:10, color:'var(--muted)', letterSpacing:.8, marginBottom:4 }}>BUYER</div>
                    <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:18, fontWeight:700, color:'#0ea5e9' }}>{buyerCount}</div>
                  </div>
                </div>
              </div>
            )
          })()}
        </div>
        </>)}

        {/* ══ TC DASHBOARD TAB ═══════════════════════════════════ */}
        {isTC && activeTab==='tc-dashboard' && (<>
        <div style={{ marginTop:36 }}>
          <div className="section-divider"/>
          <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:14, gap:12, flexWrap:'wrap' }}>
            <div>
              <div style={{ display:'flex', alignItems:'center', gap:9, marginBottom:4 }}>
                <div style={{ width:36, height:36, borderRadius:10, background:'rgba(14,165,233,.1)', border:'1px solid rgba(14,165,233,.25)',
                  display:'flex', alignItems:'center', justifyContent:'center', fontSize:17, flexShrink:0 }}>📋</div>
                <span className="serif" style={{ fontSize:20, color:'var(--text)', fontWeight:600 }}>TC Dashboard</span>
                <span style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:700, fontSize:20, color:'#0ea5e9', lineHeight:1 }}>
                  {tcDeals.length}
                </span>
              </div>
              <div className="section-sub" style={{ marginBottom:0 }}>
                Pending deals assigned to you · manage contract-to-close checklists
              </div>
            </div>
          </div>

          {/* Summary stats */}
          {tcDeals.length > 0 && (() => {
            const totalItems = tcDeals.reduce((s,d) => s + (d.tcChecklist?.length || 0), 0)
            const doneItems = tcDeals.reduce((s,d) => s + (d.tcChecklist?.filter(i=>i.done)?.length || 0), 0)
            const overdueItems = tcDeals.reduce((s,d) => s + (d.tcChecklist?.filter(i => !i.done && i.dueDate && new Date(i.dueDate+'T23:59:59') < new Date())?.length || 0), 0)
            const pct = totalItems > 0 ? Math.round((doneItems/totalItems)*100) : 0
            const closingSoon = tcDeals.filter(d => {
              const cd = d.milestones?.close_date
              if (!cd || d.milestones?.stage === 'closed' || d.milestones?.fallen_through) return false
              const days = Math.ceil((new Date(cd+'T23:59:59') - new Date()) / 86400000)
              return days >= 0 && days <= 7
            }).length
            const extensionCount = tcDeals.filter(d => d.milestones?.extension_filed).length
            return (
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(120px,1fr))', gap:10, marginBottom:20 }}>
                <div className="card" style={{ padding:14, textAlign:'center', borderTop:'2.5px solid #0ea5e9' }}>
                  <div style={{ fontSize:10, color:'var(--muted)', letterSpacing:.8, marginBottom:4 }}>ACTIVE DEALS</div>
                  <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:22, fontWeight:700, color:'#0ea5e9' }}>{tcDeals.filter(d=>!d.milestones?.fallen_through).length}</div>
                </div>
                <div className="card" style={{ padding:14, textAlign:'center', borderTop:'2.5px solid #10b981' }}>
                  <div style={{ fontSize:10, color:'var(--muted)', letterSpacing:.8, marginBottom:4 }}>TASKS DONE</div>
                  <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:22, fontWeight:700, color:'#10b981' }}>{doneItems}/{totalItems}</div>
                </div>
                <div className="card" style={{ padding:14, textAlign:'center', borderTop:`2.5px solid ${pct===100?'#10b981':'var(--gold2)'}` }}>
                  <div style={{ fontSize:10, color:'var(--muted)', letterSpacing:.8, marginBottom:4 }}>COMPLETION</div>
                  <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:22, fontWeight:700, color: pct===100?'#10b981':'var(--gold2)' }}>{pct}%</div>
                </div>
                {closingSoon > 0 && (
                  <div className="card" style={{ padding:14, textAlign:'center', borderTop:'2.5px solid #f59e0b' }}>
                    <div style={{ fontSize:10, color:'var(--muted)', letterSpacing:.8, marginBottom:4 }}>CLOSING SOON</div>
                    <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:22, fontWeight:700, color:'#f59e0b' }}>{closingSoon}</div>
                  </div>
                )}
                {overdueItems > 0 && (
                  <div className="card" style={{ padding:14, textAlign:'center', borderTop:'2.5px solid #ef4444' }}>
                    <div style={{ fontSize:10, color:'var(--muted)', letterSpacing:.8, marginBottom:4 }}>OVERDUE</div>
                    <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:22, fontWeight:700, color:'#ef4444' }}>{overdueItems}</div>
                  </div>
                )}
                {extensionCount > 0 && (
                  <div className="card" style={{ padding:14, textAlign:'center', borderTop:'2.5px solid #f97316' }}>
                    <div style={{ fontSize:10, color:'var(--muted)', letterSpacing:.8, marginBottom:4 }}>EXTENSIONS</div>
                    <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:22, fontWeight:700, color:'#f97316' }}>{extensionCount}</div>
                  </div>
                )}
              </div>
            )
          })()}

          {/* Agent filter */}
          {tcDeals.length > 0 && (() => {
            const agents = [...new Map(tcDeals.map(d => [d.agentId, d.agentName])).entries()]
            if (agents.length <= 1) return null
            return (
              <div style={{ marginBottom:16, display:'flex', alignItems:'center', gap:10 }}>
                <span style={{ fontSize:12, color:'var(--muted)', fontWeight:600, letterSpacing:.5 }}>FILTER BY AGENT</span>
                <select value={tcAgentFilter} onChange={e => setTcAgentFilter(e.target.value)}
                  style={{ padding:'6px 12px', borderRadius:8, border:'1px solid var(--b2)', background:'var(--surface)', color:'var(--text)', fontSize:13, cursor:'pointer' }}>
                  <option value="all">All Agents ({tcDeals.length})</option>
                  {agents.map(([id, name]) => (
                    <option key={id} value={id}>{name} ({tcDeals.filter(d=>d.agentId===id).length})</option>
                  ))}
                </select>
              </div>
            )
          })()}

          {/* Deal cards */}
          {(() => {
            const filtered = tcAgentFilter === 'all' ? tcDeals : tcDeals.filter(d => d.agentId === tcAgentFilter)
            return (<>
          {filtered.length === 0 && (
            <div className="card" style={{ textAlign:'center', padding:'32px 20px', color:'var(--dim)', fontSize:13 }}>
              {tcDeals.length === 0
                ? 'No pending deals assigned to you yet. When team members mark deals as pending, they\'ll appear here with your TC checklist.'
                : 'No deals for this agent.'}
            </div>
          )}

          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
            {filtered.map(deal => {
              const cl = deal.tcChecklist || []
              const done = cl.filter(i=>i.done).length
              const total = cl.length
              const pct = total > 0 ? Math.round((done/total)*100) : 0
              const isExpanded = tcExpandedChecklist === deal.id
              const priceNum = parseFloat(String(deal.price||'').replace(/[^0-9.]/g,''))
              const overdue = cl.filter(i => !i.done && i.dueDate && new Date(i.dueDate+'T23:59:59') < new Date()).length
              const ms = deal.milestones || DEFAULT_TC_MILESTONES
              const currentStage = TC_STAGES.find(s => s.key === ms.stage) || TC_STAGES[0]
              const stageIdx = TC_STAGES.findIndex(s => s.key === ms.stage)
              const isFallen = ms.fallen_through

              // Compute days until close
              const daysUntilClose = ms.close_date ? Math.ceil((new Date(ms.close_date+'T23:59:59') - new Date()) / 86400000) : null

              return (
                <div key={deal.id} className="card" style={{ padding:0, overflow:'hidden',
                  border: isFallen ? '1px solid rgba(107,114,128,.4)' : overdue > 0 ? '1px solid rgba(239,68,68,.3)' : ms.stage === 'closed' ? '1px solid rgba(34,197,94,.3)' : '1px solid var(--b2)',
                  opacity: isFallen ? 0.6 : 1 }}>
                  {/* Deal header */}
                  <div style={{ padding:'16px 20px', cursor:'pointer', display:'flex', alignItems:'center', gap:14 }}
                    onClick={() => setTcExpandedChecklist(prev => prev === deal.id ? null : deal.id)}>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4, flexWrap:'wrap' }}>
                        <span className="serif" style={{ fontSize:16, color:'var(--text)', fontWeight:600 }}>{deal.address || 'No address'}</span>
                        <span style={{ fontSize:9, padding:'2px 7px', borderRadius:4, fontWeight:700,
                          background: deal.dealSide==='seller' ? 'rgba(139,92,246,.1)' : 'rgba(14,165,233,.1)',
                          color: deal.dealSide==='seller' ? '#8b5cf6' : '#0ea5e9',
                          border: `1px solid ${deal.dealSide==='seller' ? 'rgba(139,92,246,.25)' : 'rgba(14,165,233,.25)'}`,
                        }}>
                          {deal.dealSide === 'seller' ? 'SELLER' : 'BUYER'}
                        </span>
                        {/* Stage badge */}
                        <span style={{ fontSize:9, padding:'2px 7px', borderRadius:4, fontWeight:700,
                          background: isFallen ? 'rgba(107,114,128,.1)' : `${currentStage.color}18`,
                          color: isFallen ? '#6b7280' : currentStage.color,
                          border: `1px solid ${isFallen ? 'rgba(107,114,128,.25)' : currentStage.color+'40'}` }}>
                          {isFallen ? '❌ FALLEN THROUGH' : `${currentStage.icon} ${currentStage.label.toUpperCase()}`}
                        </span>
                        {ms.extension_filed && (
                          <span style={{ fontSize:9, padding:'2px 7px', borderRadius:4, fontWeight:700,
                            background:'rgba(249,115,22,.1)', color:'#f97316', border:'1px solid rgba(249,115,22,.25)' }}>
                            📎 EXTENSION
                          </span>
                        )}
                        {overdue > 0 && !isFallen && (
                          <span style={{ fontSize:9, padding:'2px 7px', borderRadius:4, fontWeight:700,
                            background:'rgba(239,68,68,.1)', color:'#ef4444', border:'1px solid rgba(239,68,68,.25)' }}>
                            {overdue} OVERDUE
                          </span>
                        )}
                      </div>
                      <div style={{ display:'flex', alignItems:'center', gap:10, fontSize:12, color:'var(--muted)', flexWrap:'wrap' }}>
                        <span>Agent: <strong style={{ color:'var(--text)' }}>{deal.agentName}</strong></span>
                        {priceNum > 0 && <><span className="sep"/><span style={{ color:'var(--gold2)', fontWeight:600 }}>{formatPrice(deal.price)}</span></>}
                        <span className="sep"/><span>📋 {done}/{total}</span>
                        {daysUntilClose !== null && !isFallen && ms.stage !== 'closed' && (
                          <><span className="sep"/><span style={{ color: daysUntilClose < 0 ? '#ef4444' : daysUntilClose <= 7 ? '#f59e0b' : '#10b981', fontWeight:600 }}>
                            {daysUntilClose < 0 ? `${Math.abs(daysUntilClose)}d past close` : daysUntilClose === 0 ? 'Closing TODAY' : `${daysUntilClose}d to close`}
                          </span></>
                        )}
                      </div>
                    </div>
                    {/* Progress ring */}
                    <div style={{ position:'relative', width:44, height:44, flexShrink:0 }}>
                      <svg width="44" height="44" viewBox="0 0 44 44" style={{ transform:'rotate(-90deg)' }}>
                        <circle cx="22" cy="22" r="18" fill="none" stroke="var(--b2)" strokeWidth="3"/>
                        <circle cx="22" cy="22" r="18" fill="none"
                          stroke={pct === 100 ? '#10b981' : pct > 50 ? '#0ea5e9' : '#f59e0b'}
                          strokeWidth="3" strokeLinecap="round"
                          strokeDasharray={`${2*Math.PI*18}`}
                          strokeDashoffset={`${2*Math.PI*18*(1-pct/100)}`}
                          style={{ transition:'stroke-dashoffset .3s' }}/>
                      </svg>
                      <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center',
                        fontSize:10, fontWeight:700, fontFamily:"'JetBrains Mono',monospace",
                        color: pct===100 ? '#10b981' : 'var(--text)' }}>
                        {pct}%
                      </div>
                    </div>
                    <div style={{ fontSize:16, color:'var(--muted)', transition:'transform .2s',
                      transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</div>
                  </div>

                  {/* Stage progression bar */}
                  <div style={{ display:'flex', height:3, background:'var(--b1)' }}>
                    {TC_STAGES.map((s, i) => (
                      <div key={s.key} style={{ flex:1, height:'100%', transition:'background .3s',
                        background: i <= stageIdx ? (isFallen ? '#6b7280' : currentStage.color) : 'transparent' }}/>
                    ))}
                  </div>

                  {/* Expanded panel */}
                  {isExpanded && (
                    <div style={{ background:'var(--bg2)', borderTop:'1px solid var(--b1)' }}>

                      {/* ── Stage Selector ── */}
                      <div style={{ padding:'14px 20px 10px' }}>
                        <div style={{ fontSize:10, color:'var(--muted)', letterSpacing:.8, fontWeight:600, marginBottom:8 }}>STAGE</div>
                        <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                          {TC_STAGES.map((s, i) => {
                            const isActive = s.key === ms.stage
                            const isPast = i < stageIdx
                            return (
                              <button key={s.key} onClick={(e) => { e.stopPropagation(); tcSetStage(deal.id, s.key) }}
                                style={{ fontSize:10, padding:'4px 8px', borderRadius:6, cursor:'pointer', transition:'all .15s',
                                  border: isActive ? `1.5px solid ${s.color}` : '1px solid var(--b1)',
                                  background: isActive ? `${s.color}18` : isPast ? 'rgba(34,197,94,.06)' : 'transparent',
                                  color: isActive ? s.color : isPast ? '#10b981' : 'var(--muted)',
                                  fontWeight: isActive ? 700 : 400 }}>
                                {s.icon} {s.label}
                              </button>
                            )
                          })}
                        </div>
                      </div>

                      {/* ── Key Deadlines ── */}
                      <div style={{ padding:'10px 20px' }}>
                        <div style={{ fontSize:10, color:'var(--muted)', letterSpacing:.8, fontWeight:600, marginBottom:8 }}>KEY DEADLINES</div>
                        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:8 }}>
                          {TC_DEADLINES.map(dl => {
                            const val = ms[dl.key] || ''
                            const isPast = val && new Date(val+'T23:59:59') < new Date()
                            const daysLeft = val ? Math.ceil((new Date(val+'T23:59:59') - new Date()) / 86400000) : null
                            return (
                              <div key={dl.key} style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 10px',
                                borderRadius:8, border:'1px solid var(--b1)', background:'var(--surface)' }}>
                                <span style={{ fontSize:13, flexShrink:0 }}>{dl.icon}</span>
                                <div style={{ flex:1, minWidth:0 }}>
                                  <div style={{ fontSize:9, color:'var(--muted)', letterSpacing:.4, marginBottom:2 }}>{dl.label}</div>
                                  <input type="date" value={val}
                                    onChange={e => tcUpdateMilestone(deal.id, { [dl.key]: e.target.value })}
                                    style={{ background:'none', border:'none', padding:0, fontSize:11,
                                      color: val ? (isPast ? '#ef4444' : 'var(--text)') : 'var(--dim)',
                                      fontFamily:"'JetBrains Mono',monospace", cursor:'pointer', width:'100%' }}/>
                                </div>
                                {val && daysLeft !== null && (
                                  <span style={{ fontSize:9, fontWeight:700, flexShrink:0, padding:'2px 5px', borderRadius:4,
                                    fontFamily:"'JetBrains Mono',monospace",
                                    background: isPast ? 'rgba(239,68,68,.1)' : daysLeft <= 7 ? 'rgba(249,115,22,.1)' : 'rgba(34,197,94,.08)',
                                    color: isPast ? '#ef4444' : daysLeft <= 7 ? '#f97316' : '#10b981' }}>
                                    {isPast ? `${Math.abs(daysLeft)}d ago` : daysLeft === 0 ? 'TODAY' : `${daysLeft}d`}
                                  </span>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>

                      {/* ── Conditions & Extensions ── */}
                      <div style={{ padding:'10px 20px', display:'flex', gap:8, flexWrap:'wrap' }}>
                        <button onClick={(e) => { e.stopPropagation(); tcUpdateMilestone(deal.id, { conditions_added: !ms.conditions_added }) }}
                          style={{ fontSize:10, padding:'5px 10px', borderRadius:6, cursor:'pointer', transition:'all .15s',
                            border: ms.conditions_added ? '1.5px solid #f59e0b' : '1px solid var(--b1)',
                            background: ms.conditions_added ? 'rgba(245,158,11,.1)' : 'transparent',
                            color: ms.conditions_added ? '#f59e0b' : 'var(--muted)', fontWeight: ms.conditions_added ? 700 : 400 }}>
                          {ms.conditions_added ? '⚠️ Conditions Added' : '+ Conditions'}
                        </button>
                        {ms.conditions_added && (
                          <button onClick={(e) => { e.stopPropagation(); tcUpdateMilestone(deal.id, { conditions_cleared: !ms.conditions_cleared }) }}
                            style={{ fontSize:10, padding:'5px 10px', borderRadius:6, cursor:'pointer', transition:'all .15s',
                              border: ms.conditions_cleared ? '1.5px solid #10b981' : '1px solid var(--b1)',
                              background: ms.conditions_cleared ? 'rgba(16,185,129,.1)' : 'transparent',
                              color: ms.conditions_cleared ? '#10b981' : 'var(--muted)', fontWeight: ms.conditions_cleared ? 700 : 400 }}>
                            {ms.conditions_cleared ? '✅ Conditions Cleared' : 'Mark Cleared'}
                          </button>
                        )}
                        <button onClick={(e) => {
                          e.stopPropagation()
                          if (ms.extension_filed) {
                            tcUpdateMilestone(deal.id, { extension_filed: false, extension_new_date: '', extension_notes: '' })
                          } else {
                            const newDate = prompt('Extension new close date (YYYY-MM-DD):')
                            if (newDate) {
                              const notes = prompt('Extension notes (optional):') || ''
                              tcFileExtension(deal.id, newDate, notes)
                            }
                          }
                        }}
                          style={{ fontSize:10, padding:'5px 10px', borderRadius:6, cursor:'pointer', transition:'all .15s',
                            border: ms.extension_filed ? '1.5px solid #f97316' : '1px solid var(--b1)',
                            background: ms.extension_filed ? 'rgba(249,115,22,.1)' : 'transparent',
                            color: ms.extension_filed ? '#f97316' : 'var(--muted)', fontWeight: ms.extension_filed ? 700 : 400 }}>
                          {ms.extension_filed ? `📎 Extension → ${ms.extension_new_date || '?'}` : '+ File Extension'}
                        </button>
                        {ms.extension_filed && ms.extension_notes && (
                          <span style={{ fontSize:10, color:'var(--muted)', padding:'5px 0', fontStyle:'italic' }}>
                            "{ms.extension_notes}"
                          </span>
                        )}
                        {!isFallen && ms.stage !== 'closed' && (
                          <button onClick={(e) => {
                            e.stopPropagation()
                            const reason = prompt('Reason deal fell through:')
                            if (reason) tcMarkFallenThrough(deal.id, reason)
                          }}
                            style={{ fontSize:10, padding:'5px 10px', borderRadius:6, cursor:'pointer',
                              border:'1px solid var(--b1)', background:'transparent', color:'var(--dim)', marginLeft:'auto' }}>
                            Mark Fallen Through
                          </button>
                        )}
                        {isFallen && (
                          <button onClick={(e) => { e.stopPropagation(); tcUpdateMilestone(deal.id, { fallen_through: false, fallen_through_reason: '', stage: 'ratified' }) }}
                            style={{ fontSize:10, padding:'5px 10px', borderRadius:6, cursor:'pointer',
                              border:'1px solid var(--b1)', background:'transparent', color:'#0ea5e9', marginLeft:'auto' }}>
                            Reactivate Deal
                          </button>
                        )}
                      </div>
                      {isFallen && ms.fallen_through_reason && (
                        <div style={{ padding:'0 20px 10px', fontSize:11, color:'#6b7280', fontStyle:'italic' }}>
                          Reason: "{ms.fallen_through_reason}"
                        </div>
                      )}

                      {/* ── Checklist ── */}
                      <div style={{ padding:'10px 20px 18px', borderTop:'1px solid var(--b1)' }}>
                        <div style={{ fontSize:10, color:'var(--muted)', letterSpacing:.8, fontWeight:600, marginBottom:8 }}>
                          CHECKLIST ({done}/{total})
                        </div>
                        {cl.length === 0 && (
                          <div style={{ fontSize:12, color:'var(--dim)', fontStyle:'italic', marginBottom:8 }}>
                            No checklist items yet — items are auto-populated when deals are assigned.
                          </div>
                        )}
                        {cl.map(item => {
                          const isOverdue = !item.done && item.dueDate && new Date(item.dueDate+'T23:59:59') < new Date()
                          return (
                            <div key={item.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 0',
                              borderBottom:'1px solid var(--b1)' }}>
                              <button onClick={()=>tcToggleChecklistItem(deal.id,item.id)}
                                style={{ background:'none', border:'none', cursor:'pointer', fontSize:15, padding:0, lineHeight:1, flexShrink:0 }}>
                                {item.done ? '✅' : '☐'}
                              </button>
                              <span style={{ flex:1, fontSize:12,
                                color: item.done ? 'var(--dim)' : isOverdue ? '#ef4444' : 'var(--text)',
                                textDecoration: item.done ? 'line-through' : 'none',
                                fontWeight: isOverdue ? 600 : 400 }}>
                                {item.label}
                                {isOverdue && <span style={{ fontSize:9, marginLeft:6, color:'#ef4444' }}>OVERDUE</span>}
                              </span>
                              {item.done && item.completedAt && (
                                <span style={{ fontSize:9, color:'var(--dim)', fontFamily:"'JetBrains Mono',monospace", flexShrink:0 }}>
                                  {new Date(item.completedAt).toLocaleDateString('en-US',{month:'short',day:'numeric'})}
                                </span>
                              )}
                              <input type="date" value={item.dueDate||''} title="Due date"
                                onChange={e=>tcUpdateDueDate(deal.id,item.id,e.target.value)}
                                style={{ background:'none', border:'1px solid var(--b1)', borderRadius:4, padding:'2px 4px',
                                  fontSize:9, color: item.dueDate ? (isOverdue ? '#ef4444' : 'var(--text)') : 'var(--dim)',
                                  fontFamily:"'JetBrains Mono',monospace", cursor:'pointer', width:95, flexShrink:0 }}/>
                              <button onClick={()=>tcRemoveChecklistItem(deal.id,item.id)}
                                style={{ background:'none', border:'none', cursor:'pointer', color:'var(--dim)', fontSize:11,
                                  padding:'2px', opacity:.5 }} title="Remove">✕</button>
                            </div>
                          )
                        })}
                        {/* Add task */}
                        <div style={{ marginTop:8 }}>
                          <input className="field-input" placeholder="+ Add task…"
                            onKeyDown={e => { if (e.key==='Enter' && e.target.value.trim()) { tcAddChecklistItem(deal.id,e.target.value); e.target.value='' } }}
                            style={{ padding:'6px 10px', fontSize:11, width:'100%', boxSizing:'border-box' }}/>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          </>)
          })()}
        </div>
        </>)}

        <div style={{ height:48 }}/>
        <div style={{ textAlign:'center', fontSize:10, color:'var(--dim)', fontFamily:"'JetBrains Mono',monospace",
          letterSpacing:2, paddingBottom:24 }}>
          REALTYGRIND · {MONTH_YEAR} · CLOSE MORE EVERY DAY
        </div>

      </div>
      )}
      </ErrorBoundary>
      ) : (
      <Suspense fallback={<Loader/>}>
      {page==='teams'     && <ErrorBoundary key="teams" onReset={()=>setPage('dashboard')}><TeamsPage     onNavigate={setPage} theme={theme} onToggleTheme={onToggleTheme}/></ErrorBoundary>}
      {page==='coaching'  && <ErrorBoundary key="coaching" onReset={()=>setPage('dashboard')}><CoachingPage  onNavigate={setPage} theme={theme} onToggleTheme={onToggleTheme}/></ErrorBoundary>}
      {page==='billing'   && <ErrorBoundary key="billing" onReset={()=>setPage('dashboard')}><BillingPage   onNavigate={setPage} theme={theme} onToggleTheme={onToggleTheme}/></ErrorBoundary>}
      {page==='profile'   && <ErrorBoundary key="profile" onReset={()=>setPage('dashboard')}><ProfilePage   onNavigate={setPage} theme={theme} onToggleTheme={onToggleTheme}
                                             onTaskDeleted={syncTaskDeleted} onTaskRestored={syncTaskRestored}/></ErrorBoundary>}
      {page==='directory' && <ErrorBoundary key="directory" onReset={()=>setPage('dashboard')}><DirectoryPage onNavigate={setPage} theme={theme} onToggleTheme={onToggleTheme}/></ErrorBoundary>}
      {page==='apod'      && <ErrorBoundary key="apod" onReset={()=>setPage('dashboard')}><APODPage      onNavigate={setPage} theme={theme} onToggleTheme={onToggleTheme}/></ErrorBoundary>}
      {page==='admin'     && <ErrorBoundary key="admin" onReset={()=>setPage('dashboard')}><AdminPage     onNavigate={setPage} theme={theme} onToggleTheme={onToggleTheme}/></ErrorBoundary>}
      {page==='terms'     && <ErrorBoundary key="terms" onReset={()=>setPage('dashboard')}><TermsPage     onNavigate={setPage} theme={theme} onToggleTheme={onToggleTheme}/></ErrorBoundary>}
      {page==='affiliates' && <ErrorBoundary key="affiliates" onReset={()=>setPage('dashboard')}><AffiliatesPage onNavigate={()=>setPage('billing')} theme={theme}/></ErrorBoundary>}
      {page==='presentations' && <ErrorBoundary key="presentations" onReset={()=>setPage('dashboard')}><PresentationsPage onNavigate={setPage} theme={theme} onToggleTheme={onToggleTheme} onPresentMode={setPresentMode}/></ErrorBoundary>}
      {page==='cma' && <ErrorBoundary key="cma" onReset={()=>setPage('dashboard')}><CMAPage onNavigate={setPage} theme={theme}/></ErrorBoundary>}
      </Suspense>
      )}
      {/* AI Assistant now handled by floating widget — see useEffect redirect below */}

      {/* ── Offer Received Modal (from Listing) ─────────── */}
      {offerReceivedModal && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setOfferReceivedModal(null) }}>
          <div className="modal-card">
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <span style={{ fontSize:18 }}>📨</span>
                <span style={{ fontFamily:"'Fraunces',serif", fontSize:18, fontWeight:700, color:'var(--text)' }}>Offer Received</span>
              </div>
              <button onClick={() => setOfferReceivedModal(null)} style={{ background:'none', border:'none', color:'var(--dim)', cursor:'pointer', fontSize:18, padding:4 }}>✕</button>
            </div>
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:14, fontWeight:600, color:'var(--text)', marginBottom:4 }}>{offerReceivedModal.listing.address || 'Untitled listing'}</div>
              {offerReceivedModal.listing.price && (
                <div style={{ fontSize:12, color:'var(--muted)' }}>List Price: <span style={{ color:'var(--gold2)', fontWeight:600 }}>{formatPrice(offerReceivedModal.listing.price)}</span></div>
              )}
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <div>
                <div className="label" style={{ marginBottom:4 }}>Offer Price</div>
                <input className="field-input" type="text" value={offerReceivedModal.offerPrice}
                  onChange={e => setOfferReceivedModal(prev => ({...prev, offerPrice: e.target.value}))}
                  onKeyDown={e => e.key === 'Enter' && submitListingOfferReceived()}
                  placeholder="$425,000" autoFocus
                  style={{ padding:'10px 14px', fontFamily:"'JetBrains Mono',monospace", fontWeight:600, color:'var(--gold2)' }}/>
              </div>
              <div>
                <div className="label" style={{ marginBottom:4 }}>Notes (optional)</div>
                <textarea className="field-input" value={offerReceivedModal.offerNotes}
                  onChange={e => setOfferReceivedModal(prev => ({...prev, offerNotes: e.target.value}))}
                  placeholder="Buyer agent, contingencies, etc…"
                  style={{ padding:'10px 14px', fontSize:13, minHeight:60, resize:'vertical', fontFamily:'inherit' }}/>
              </div>
            </div>
            <div style={{ display:'flex', justifyContent:'flex-end', gap:10, marginTop:20 }}>
              <button onClick={() => setOfferReceivedModal(null)} className="btn-ghost">Cancel</button>
              <button onClick={submitListingOfferReceived} className="btn-gold" style={{ padding:'10px 20px' }}>Submit Offer</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Offer Modal (from Buyer Rep) ─────────────────── */}
      {offerModal && (
        <OfferModal
          repName={offerModal.repName}
          prefillAddress={offerModal.prefillAddress || ''}
          onSubmit={(addr, price, comm) => submitBuyerRepOffer(addr, price, comm, offerModal.showingId || null)}
          onClose={() => setOfferModal(null)}
        />
      )}
      {/* ── Print Buyer Summary Modal ─────────────────── */}
      {printBuyerRep && (
        <PrintBuyerModal rep={printBuyerRep} onClose={() => setPrintBuyerRep(null)} />
      )}

      {/* ── Add Task Modal ───────────────────────────────── */}
      {addTaskModal && (
        <AddTaskModal
          onSubmit={addTaskToday}
          onClose={() => setAddTaskModal(false)}
        />
      )}

      {/* ── AI Task Gen Modal ──────────────────────────── */}
      {aiTaskGenScope && (
        <AITaskGenModal
          scope={aiTaskGenScope}
          onClose={() => setAiTaskGenScope(null)}
          onGenerate={generateAiTasks}
          onInsert={insertAiGeneratedTasks}
          onClear={clearTasksForDates}
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
          closedDeals={[...closedDeals,...archivedDeals]}
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
            closedDeals={[...closedDeals,...archivedDeals]}
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
          closedDeals={[...closedDeals,...archivedDeals]}
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

      {/* ── Listing Email Update Modal ────────────────────── */}
      {clientUpdateListing && (() => {
        const cl = clientUpdateListing
        const comm = resolveCommission(cl.commission, cl.price)
        const dom = daysOnMarket(cl.listDate, cl.createdAt)
        const priceNum = parseFloat(String(cl.price||'').replace(/[^0-9.]/g,''))
        const agentName = profileFullName || 'Your Agent'
        const agentPhone = profilePhone
        const agentEmail = user?.email || ''
        const statusLabel = cl.status==='closed'?'Closed':cl.status==='pending'?'Pending':'Active'
        const statusColor = cl.status==='closed'?'#10b981':cl.status==='pending'?'#f59e0b':'#8b5cf6'
        const toEmail = clientUpdateEmailTo.trim()
        const clientFirst = clientUpdateName.trim().split(/\s/)[0] || 'there'
        const subject = `${clientFirst}, here is your listing update for ${cl.address || 'your property'}`
        let emailBody = `Hi ${clientFirst},\n\nHere is your listing update for ${cl.address || 'your property'}:\n\n`
        emailBody += `Status: ${statusLabel}\n`
        if (priceNum > 0) emailBody += `List Price: ${formatPrice(cl.price)}\n`
        if (dom !== null) emailBody += `Days on Market: ${dom}\n`
        if (cl.listDate) emailBody += `Listed: ${fmtShortDate(cl.listDate)}\n`
        if (cl.expiresDate) emailBody += `Expires: ${fmtShortDate(cl.expiresDate)}\n`
        if (cl.leadSource) emailBody += `Lead Source: ${cl.leadSource}\n`
        if (clientUpdateNotes.trim()) emailBody += `\nNotes:\n${clientUpdateNotes.trim()}\n`
        emailBody += `\nPlease let me know if you have any questions.\n\nBest regards,\n${agentName}`
        if (agentPhone) emailBody += `\n${agentPhone}`
        if (agentEmail) emailBody += `\n${agentEmail}`
        const mailto = `mailto:${encodeURIComponent(toEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(emailBody)}`
        return (
          <div style={{ position:'fixed', inset:0, zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,.55)' }}
            onClick={()=>setClientUpdateListing(null)}>
            <div onClick={e=>e.stopPropagation()} className="client-update-sheet" style={{ background:'#fff', borderRadius:16, width:580, maxWidth:'94vw', maxHeight:'92vh', overflow:'auto', boxShadow:'0 25px 60px rgba(0,0,0,.3)', color:'#111', fontFamily:"Georgia, 'Times New Roman', serif" }}>
              {/* Header */}
              <div style={{ padding:'28px 32px 20px', borderBottom:'2px solid #111' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                  <div>
                    <div style={{ fontSize:10, letterSpacing:1.5, color:'#9ca3af', fontWeight:700, fontFamily:"'Poppins',sans-serif", marginBottom:6 }}>✉️ LISTING EMAIL UPDATE</div>
                    <div style={{ fontSize:22, fontWeight:700, color:'#111', fontFamily:"'Fraunces',serif", lineHeight:1.2 }}>{cl.address || 'Untitled'}</div>
                  </div>
                  <div style={{ textAlign:'right' }}>
                    <div style={{ fontSize:10, letterSpacing:1.2, color:'#9ca3af', fontWeight:600, fontFamily:"'Poppins',sans-serif", marginBottom:4 }}>STATUS</div>
                    <div style={{ display:'inline-block', background:`${statusColor}18`, color:statusColor, border:`1.5px solid ${statusColor}40`, borderRadius:6, padding:'4px 12px', fontSize:12, fontWeight:700, fontFamily:"'Poppins',sans-serif", letterSpacing:'.5px' }}>
                      {statusLabel.toUpperCase()}
                    </div>
                  </div>
                </div>
              </div>

              {/* Client Name & Email Fields */}
              <div style={{ padding:'16px 32px', borderBottom:'1px solid #e5e7eb', background:'#fafbfc' }}>
                <div style={{ fontSize:10, color:'#9ca3af', letterSpacing:.8, fontWeight:600, fontFamily:"'Poppins',sans-serif", marginBottom:6 }}>SEND TO</div>
                <input type="text" value={clientUpdateName} onChange={e=>setClientUpdateName(e.target.value)}
                  placeholder="Client name" autoFocus
                  style={{ width:'100%', padding:'10px 12px', fontSize:14, border:'1.5px solid #d1d5db', borderRadius:8,
                    fontFamily:"'Poppins',sans-serif", color:'#111', background:'#fff', outline:'none', marginBottom:8 }}/>
                <input type="email" value={clientUpdateEmailTo} onChange={e=>setClientUpdateEmailTo(e.target.value)}
                  placeholder="client@email.com"
                  style={{ width:'100%', padding:'10px 12px', fontSize:14, border:'1.5px solid #d1d5db', borderRadius:8,
                    fontFamily:"'Poppins',sans-serif", color:'#111', background:'#fff', outline:'none' }}/>
                {toEmail && (
                  <div style={{ fontSize:11, color:'#6b7280', fontFamily:"'Poppins',sans-serif", marginTop:6 }}>
                    Subject: <strong style={{ color:'#111' }}>{subject}</strong>
                  </div>
                )}
              </div>

              {/* Key Metrics Grid */}
              <div style={{ padding:'22px 32px', display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:16, borderBottom:'1px solid #e5e7eb' }}>
                <div>
                  <div style={{ fontSize:10, color:'#9ca3af', letterSpacing:.8, fontWeight:600, fontFamily:"'Poppins',sans-serif", marginBottom:4 }}>LIST PRICE</div>
                  <div style={{ fontSize:24, fontWeight:700, color:'#111', fontFamily:"'JetBrains Mono',monospace", letterSpacing:'-.02em' }}>{priceNum > 0 ? formatPrice(cl.price) : '—'}</div>
                </div>
                <div>
                  <div style={{ fontSize:10, color:'#9ca3af', letterSpacing:.8, fontWeight:600, fontFamily:"'Poppins',sans-serif", marginBottom:4 }}>COMMISSION</div>
                  <div style={{ fontSize:18, fontWeight:700, color:'#059669', fontFamily:"'JetBrains Mono',monospace" }}>
                    {cl.commission ? (
                      <>{cl.commission}{comm > 0 && <span style={{ fontSize:13, color:'#6b7280', fontWeight:500 }}> = {fmtMoney(comm)}</span>}</>
                    ) : '—'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize:10, color:'#9ca3af', letterSpacing:.8, fontWeight:600, fontFamily:"'Poppins',sans-serif", marginBottom:4 }}>DAYS ON MARKET</div>
                  <div style={{ fontSize:24, fontWeight:700, color: dom > 90 ? '#ef4444' : dom > 30 ? '#d97706' : '#059669', fontFamily:"'JetBrains Mono',monospace" }}>
                    {dom !== null ? dom : '—'}
                  </div>
                </div>
              </div>

              {/* Details Grid */}
              <div style={{ padding:'18px 32px', display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, borderBottom:'1px solid #e5e7eb' }}>
                {cl.leadSource && (
                  <div>
                    <div style={{ fontSize:10, color:'#9ca3af', letterSpacing:.8, fontWeight:600, fontFamily:"'Poppins',sans-serif", marginBottom:3 }}>LEAD SOURCE</div>
                    <div style={{ fontSize:14, fontWeight:600, color:'#111', fontFamily:"'Poppins',sans-serif" }}>{cl.leadSource}</div>
                  </div>
                )}
                {cl.listDate && (
                  <div>
                    <div style={{ fontSize:10, color:'#9ca3af', letterSpacing:.8, fontWeight:600, fontFamily:"'Poppins',sans-serif", marginBottom:3 }}>LIST DATE</div>
                    <div style={{ fontSize:14, fontWeight:600, color:'#111', fontFamily:"'Poppins',sans-serif" }}>{fmtShortDate(cl.listDate)}</div>
                  </div>
                )}
                {cl.expiresDate && (
                  <div>
                    <div style={{ fontSize:10, color:'#9ca3af', letterSpacing:.8, fontWeight:600, fontFamily:"'Poppins',sans-serif", marginBottom:3 }}>LISTING EXPIRES</div>
                    <div style={{ fontSize:14, fontWeight:600, color: new Date(cl.expiresDate+'T00:00:00') < new Date() ? '#ef4444' : '#111', fontFamily:"'Poppins',sans-serif" }}>{fmtShortDate(cl.expiresDate)}</div>
                  </div>
                )}
                {cl.monthYear && (
                  <div>
                    <div style={{ fontSize:10, color:'#9ca3af', letterSpacing:.8, fontWeight:600, fontFamily:"'Poppins',sans-serif", marginBottom:3 }}>MONTH</div>
                    <div style={{ fontSize:14, fontWeight:600, color:'#111', fontFamily:"'Poppins',sans-serif" }}>{fmtMonth(cl.monthYear)}</div>
                  </div>
                )}
              </div>

              {/* Notes Area */}
              <div style={{ padding:'18px 32px 8px' }}>
                <div style={{ fontSize:10, color:'#9ca3af', letterSpacing:.8, fontWeight:600, fontFamily:"'Poppins',sans-serif", marginBottom:8 }}>NOTES (included in email)</div>
                <textarea value={clientUpdateNotes} onChange={e=>setClientUpdateNotes(e.target.value)}
                  placeholder="Add any notes for the client…"
                  style={{ width:'100%', minHeight:70, resize:'vertical', padding:'10px 12px', fontSize:13, lineHeight:1.7,
                    border:'1px solid #e5e7eb', borderRadius:8, fontFamily:"Georgia, 'Times New Roman', serif",
                    color:'#111', background:'#fafafa', outline:'none' }}/>
              </div>

              {/* Footer */}
              <div style={{ padding:'16px 32px 24px', display:'flex', justifyContent:'space-between', alignItems:'center', borderTop:'1px solid #e5e7eb', marginTop:8 }}>
                <div style={{ fontSize:11, color:'#6b7280', fontFamily:"'Poppins',sans-serif", lineHeight:1.6 }}>
                  <strong style={{ color:'#111' }}>{agentName}</strong>
                  {agentEmail && <><br/>{agentEmail}</>}
                  {agentPhone && <> · {agentPhone}</>}
                  <br/>{new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})}
                </div>
                <div style={{ display:'flex', gap:8 }}>
                  <a href={toEmail ? mailto : '#'} onClick={e=>{
                    if (!toEmail) { e.preventDefault(); return }
                    setTimeout(()=>setClientUpdateListing(null), 300)
                  }} style={{
                    background: toEmail ? '#111' : '#d1d5db', color:'#fff', border:'none', borderRadius:8, padding:'8px 18px',
                    fontSize:12, fontWeight:700, cursor: toEmail ? 'pointer' : 'default', fontFamily:"'Poppins',sans-serif",
                    textDecoration:'none', display:'inline-flex', alignItems:'center', gap:6,
                  }}>✉️ Send Update</a>
                  <button onClick={()=>setClientUpdateListing(null)} style={{
                    background:'#f3f4f6', color:'#6b7280', border:'none', borderRadius:8, padding:'8px 18px',
                    fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:"'Poppins',sans-serif"
                  }}>Close</button>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── Review Request Modal (after deal close) ──── */}
      {reviewRequestDeal && (() => {
        const agentName = profileFullName || 'Your Agent'
        const reviewLink = habitPrefs?.bio?.review_link || ''
        const toEmail = reviewRequestEmail.trim()
        const clientName = reviewRequestName.trim() || 'there'
        const subject = `Thank you for choosing ${agentName}!`
        let body = `Hi ${clientName},\n\nCongratulations on your ${reviewRequestDeal.address} closing! It was a pleasure working with you.\n\n`
        if (reviewLink) {
          body += `If you had a great experience, I would truly appreciate a quick review:\n${reviewLink}\n\n`
        } else {
          body += `If you had a great experience, I would truly appreciate a review — it helps more than you know!\n\n`
        }
        body += `Thank you so much, and please don't hesitate to reach out if you ever need anything.\n\nWarm regards,\n${agentName}`
        const mailto = `mailto:${encodeURIComponent(toEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
        return (
          <div style={{ position:'fixed', inset:0, zIndex:10000, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,.55)' }}
            onClick={()=>setReviewRequestDeal(null)}>
            <div onClick={e=>e.stopPropagation()} style={{ background:'var(--surface)', borderRadius:14, width:440, maxWidth:'92vw', padding:24, boxShadow:'0 25px 60px rgba(0,0,0,.3)' }}>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
                <span style={{ fontSize:24 }}>⭐</span>
                <div>
                  <div className="serif" style={{ fontSize:16, fontWeight:700, color:'var(--text)' }}>Request a Review</div>
                  <div style={{ fontSize:11, color:'var(--muted)' }}>Send a review request for {reviewRequestDeal.address}</div>
                </div>
                <div style={{ flex:1 }}/>
                <button onClick={()=>setReviewRequestDeal(null)} style={{ background:'none', border:'none', fontSize:18, cursor:'pointer', color:'var(--muted)' }}>✕</button>
              </div>

              {!reviewLink && (
                <div style={{ padding:'8px 12px', borderRadius:8, background:'rgba(245,158,11,.08)', border:'1px solid rgba(245,158,11,.2)', marginBottom:14, fontSize:11, color:'#d97706' }}>
                  No review link set. Add one in <strong>Profile → Review Link</strong> to include it in the email.
                </div>
              )}

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:12 }}>
                <div>
                  <label style={{ fontSize:11, fontWeight:700, color:'var(--muted)', display:'block', marginBottom:4 }}>Client Name</label>
                  <input className="field-input" value={reviewRequestName}
                    onChange={e=>setReviewRequestName(e.target.value)}
                    placeholder="John Smith" autoFocus
                    style={{ fontSize:13, width:'100%' }}/>
                </div>
                <div>
                  <label style={{ fontSize:11, fontWeight:700, color:'var(--muted)', display:'block', marginBottom:4 }}>Client Email</label>
                  <input className="field-input" type="email" value={reviewRequestEmail}
                    onChange={e=>setReviewRequestEmail(e.target.value)}
                    placeholder="client@email.com"
                    style={{ fontSize:13, width:'100%' }}/>
                </div>
              </div>

              <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
                <button onClick={()=>setReviewRequestDeal(null)} style={{
                  background:'var(--bg2)', color:'var(--muted)', border:'1px solid var(--b2)', borderRadius:8, padding:'8px 16px',
                  fontSize:12, fontWeight:600, cursor:'pointer',
                }}>Skip</button>
                <a href={toEmail ? mailto : '#'} onClick={e=>{
                  if (!toEmail) { e.preventDefault(); return }
                  setTimeout(()=>setReviewRequestDeal(null), 300)
                }} style={{
                  background: toEmail ? '#10b981' : '#d1d5db', color:'#fff', border:'none', borderRadius:8, padding:'8px 18px',
                  fontSize:12, fontWeight:700, cursor: toEmail ? 'pointer' : 'default',
                  textDecoration:'none', display:'inline-flex', alignItems:'center', gap:6,
                }}>⭐ Send Review Request</a>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── Daily Standup Popup Modal (team members, once per day) ───── */}
      {standupModalOpen && isOnTeam && !isTeamOwner && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setStandupModalOpen(false) }}
          style={{ zIndex:1100, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div className="modal-card" style={{ maxWidth:500, width:'95vw', animation:'fadeUp .2s ease' }}>
            {standupDone ? (
              <div>
                <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16 }}>
                  <span style={{ fontSize:28 }}>✅</span>
                  <div>
                    <div className="serif" style={{ fontSize:18, fontWeight:700, color:'var(--text)' }}>Standup submitted</div>
                    <div style={{ fontSize:12, color:'var(--muted)', marginTop:2 }}>Your team leader can see your update</div>
                  </div>
                </div>
                <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
                  <button className="btn-outline" style={{ fontSize:12 }}
                    onClick={() => setStandupDone(false)}>Edit</button>
                  <button className="btn-gold" style={{ padding:'10px 24px', fontSize:13 }}
                    onClick={() => setStandupModalOpen(false)}>Got it</button>
                </div>
              </div>
            ) : (
              <div>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:16 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <span style={{ fontSize:20 }}>⚡</span>
                    <div>
                      <div className="serif" style={{ fontSize:18, fontWeight:700, color:'var(--text)' }}>Daily Standup</div>
                      <div style={{ fontSize:11, color:'var(--muted)' }}>~60 seconds • visible to your team leader</div>
                    </div>
                  </div>
                  <button onClick={() => setStandupModalOpen(false)}
                    style={{ background:'none', border:'none', color:'var(--dim)', cursor:'pointer', fontSize:18, padding:4 }}>✕</button>
                </div>
                {[
                  { key:'q1', label:'What did you accomplish yesterday?', placeholder:'Logged 15 calls, booked 2 appointments…' },
                  { key:'q2', label:"What's your #1 priority today?", placeholder:'Follow up with the Hendersons, prospect 1 hr…' },
                  { key:'q3', label:'Anything blocking you? (optional)', placeholder:'Nothing — or describe what\'s in the way…' },
                ].map(({key,label,placeholder}) => (
                  <div key={key} style={{ marginBottom:12 }}>
                    <div className="label" style={{ marginBottom:4 }}>{label}</div>
                    <textarea className="field-input" value={standup[key]}
                      onChange={e => setStandup(s => ({...s, [key]: e.target.value}))}
                      placeholder={placeholder} rows={2}
                      style={{ width:'100%', resize:'none', fontSize:13 }}/>
                  </div>
                ))}
                <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:4 }}>
                  <button className="btn-outline" style={{ fontSize:12 }}
                    onClick={() => setStandupModalOpen(false)}>Skip for now</button>
                  <button className="btn-primary" onClick={() => { submitStandup(); }}
                    disabled={standupSaving || !standup.q1.trim() || !standup.q2.trim()}
                    style={{ fontSize:13, padding:'10px 24px' }}>
                    {standupSaving ? 'Submitting…' : 'Submit Standup'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Morning Briefing Modal ───────────────────────── */}
      {briefingVisible && briefingData && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) { setBriefingVisible(false); setBriefingDismissed(true) } }}
          style={{ zIndex:1100, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div className="modal-card" style={{ maxWidth:540, width:'95vw', maxHeight:'85vh', overflow:'auto', animation:'fadeUp .2s ease' }}>
            {/* Header */}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:18 }}>
              <div>
                <div style={{ fontSize:10, color:'var(--muted)', fontFamily:"'JetBrains Mono',monospace",
                  letterSpacing:.7, textTransform:'uppercase', marginBottom:4 }}>Morning Briefing</div>
                <div className="serif" style={{ fontSize:20, fontWeight:700, color:'var(--text)', lineHeight:1.3 }}>
                  {briefingData.greeting}
                </div>
              </div>
              <button onClick={() => { setBriefingVisible(false); setBriefingDismissed(true) }}
                style={{ background:'none', border:'none', color:'var(--dim)', cursor:'pointer', fontSize:18, padding:4, flexShrink:0 }}>✕</button>
            </div>

            {/* Priority Actions */}
            {briefingData.priority_actions?.length > 0 && (
              <div style={{ marginBottom:18 }}>
                <div className="label" style={{ marginBottom:8 }}>Priority Actions</div>
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  {briefingData.priority_actions.map((action, i) => (
                    <div key={i} style={{ display:'flex', alignItems:'flex-start', gap:10, padding:'10px 12px',
                      background:'var(--bg)', borderRadius:10,
                      borderLeft: `3px solid ${action.urgency === 'high' ? '#dc2626' : action.urgency === 'medium' ? '#d97706' : '#9ca3af'}` }}>
                      <span style={{ fontSize:16, flexShrink:0, marginTop:1 }}>{action.icon}</span>
                      <div style={{ flex:1 }}>
                        <span style={{ fontSize:13, color:'var(--text)', lineHeight:1.45 }}>{action.text}</span>
                        <span style={{ fontSize:9, fontWeight:700, textTransform:'uppercase', marginLeft:8,
                          padding:'2px 6px', borderRadius:4, fontFamily:"'JetBrains Mono',monospace",
                          background: action.urgency === 'high' ? '#dc262618' : action.urgency === 'medium' ? '#d9770618' : '#9ca3af18',
                          color: action.urgency === 'high' ? '#dc2626' : action.urgency === 'medium' ? '#d97706' : '#9ca3af',
                        }}>{action.urgency}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Pipeline Snapshot */}
            {briefingData.pipeline_snapshot?.summary && (
              <div style={{ marginBottom:18 }}>
                <div className="label" style={{ marginBottom:8 }}>Pipeline</div>
                <div style={{ fontSize:13, color:'var(--text)', marginBottom:10, lineHeight:1.5 }}>
                  {briefingData.pipeline_snapshot.summary}
                </div>
                {briefingData.pipeline_snapshot.details?.length > 0 && (
                  <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                    {briefingData.pipeline_snapshot.details.map((d, i) => (
                      <div key={i} style={{ padding:'8px 14px', background:'var(--bg)', borderRadius:10, textAlign:'center', flex:'1 1 80px', minWidth:80 }}>
                        <div style={{ fontSize:20, fontWeight:700, color:'var(--text)', fontFamily:"'JetBrains Mono',monospace" }}>
                          {d.value}{d.goal != null && <span style={{ fontSize:12, color:'var(--muted)', fontWeight:400 }}>/{d.goal}</span>}
                        </div>
                        <div style={{ fontSize:10, color:'var(--muted)', fontWeight:600, textTransform:'uppercase', letterSpacing:.3 }}>{d.label}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Streak Status */}
            {briefingData.streak_status?.message && (
              <div style={{ marginBottom:18, display:'flex', alignItems:'center', gap:10, padding:'10px 14px',
                background:'rgba(251,146,60,.06)', border:'1px solid rgba(251,146,60,.15)', borderRadius:10 }}>
                <span style={{ fontSize:22 }}>🔥</span>
                <div>
                  <div style={{ fontSize:18, fontWeight:700, color:'#fb923c', fontFamily:"'JetBrains Mono',monospace" }}>
                    {briefingData.streak_status.current}-day streak
                  </div>
                  <div style={{ fontSize:12, color:'var(--muted)', marginTop:2 }}>{briefingData.streak_status.message}</div>
                </div>
              </div>
            )}

            {/* Calendar Preview */}
            {briefingData.calendar_preview?.length > 0 && (
              <div style={{ marginBottom:18 }}>
                <div className="label" style={{ marginBottom:8 }}>Today's Schedule</div>
                <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                  {briefingData.calendar_preview.map((ev, i) => (
                    <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'6px 10px' }}>
                      <span style={{ fontSize:11, fontWeight:700, color:'var(--gold2)', fontFamily:"'JetBrains Mono',monospace",
                        minWidth:72 }}>{ev.time}</span>
                      <span style={{ fontSize:13, color:'var(--text)' }}>{ev.event}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Team Health (owners/admins only) */}
            {briefingData.team_health && (
              <div style={{ marginBottom:18 }}>
                <div className="label" style={{ marginBottom:8 }}>Team Health</div>
                <div style={{ fontSize:13, color:'var(--text)', marginBottom:8, lineHeight:1.5 }}>
                  {briefingData.team_health.summary}
                </div>
                {briefingData.team_health.alerts?.map((alert, i) => (
                  <div key={i} style={{ padding:'8px 12px', background:'rgba(220,38,38,.04)', border:'1px solid rgba(220,38,38,.12)',
                    borderRadius:8, marginBottom:6 }}>
                    <div style={{ fontSize:12, fontWeight:700, color:'var(--text)' }}>{alert.agent}</div>
                    <div style={{ fontSize:12, color:'var(--muted)', marginTop:2 }}>{alert.issue}</div>
                    <div style={{ fontSize:12, color:'var(--gold2)', marginTop:2, fontStyle:'italic' }}>{alert.suggestion}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Motivation */}
            {briefingData.motivation && (
              <div style={{ padding:'12px 16px', background:'linear-gradient(135deg, rgba(180,83,9,.06) 0%, rgba(217,119,6,.04) 100%)',
                borderRadius:10, marginBottom:18 }}>
                <div style={{ fontSize:13, color:'var(--text)', fontStyle:'italic', lineHeight:1.55 }}>
                  {briefingData.motivation}
                </div>
              </div>
            )}

            {/* Footer */}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <button onClick={() => { fetchBriefing(true); }}
                disabled={briefingLoading}
                style={{ background:'none', border:'none', color:'var(--muted)', cursor:'pointer', fontSize:12,
                  fontFamily:"'JetBrains Mono',monospace", textDecoration:'underline', opacity: briefingLoading ? 0.5 : 1 }}>
                {briefingLoading ? 'Generating…' : 'Regenerate (1 credit)'}
              </button>
              <button onClick={() => { setBriefingVisible(false); setBriefingDismissed(true) }}
                className="btn-gold" style={{ padding:'10px 24px', fontSize:13 }}>
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast notification */}
      {toast && (
        <div style={{ position:'fixed', bottom:24, left:'50%', transform:'translateX(-50%)', zIndex:9999,
          background: toast.type === 'success' ? '#16a34a' : '#dc2626', color:'#fff', padding:'10px 22px', borderRadius:10,
          fontFamily:'Poppins,sans-serif', fontWeight:600, fontSize:13,
          boxShadow: toast.type === 'success' ? '0 8px 32px rgba(22,163,74,.35)' : '0 8px 32px rgba(220,38,38,.35)', display:'flex', alignItems:'center', gap:10,
          animation:'slideDown .25s ease', maxWidth:'90vw' }}>
          <span style={{ flexShrink:0 }}>{toast.type === 'success' ? '\u2713' : '\u26A0'}</span>
          <span>{toast.msg}</span>
          <button onClick={() => setToast(null)} style={{ background:'none', border:'none', color:'#fff',
            cursor:'pointer', fontWeight:700, fontSize:15, padding:'0 4px', lineHeight:1, flexShrink:0 }}>&#215;</button>
        </div>
      )}


      {/* ── Floating AI Chat Widget (hidden in present mode) ── */}
      {!presentMode && (
        <ErrorBoundary key="ai-widget" onReset={() => setAiWidgetOpen(false)}>
          <AIChatWidget
            isOpen={aiWidgetOpen}
            onToggle={toggleAiWidget}
            onClose={closeAiWidget}
            onNavigate={setPage}
            theme={theme}
          />
        </ErrorBoundary>
      )}

      {/* ── App Footer ── */}
      <footer style={{ textAlign:'center', padding:'24px 16px 32px', fontSize:12, color:'var(--muted)',
        fontFamily:"'Poppins',sans-serif" }}>
        <button onClick={()=>setPage('terms')} style={{ background:'none', border:'none', cursor:'pointer',
          color:'var(--muted)', fontSize:12, fontFamily:'inherit', textDecoration:'underline' }}>
          Terms &amp; Privacy
        </button>
        <span style={{ margin:'0 8px' }}>·</span>
        © {new Date().getFullYear()} RealtyGrind
      </footer>
    </div>
  )
}

// ─── Root ─────────────────────────────────────────────────────────────────────

function AppInner() {
  useRenderGuard('AppInner')
  const { user, loading } = useAuth()
  const [theme,       setTheme]       = useState(()=>localStorage.getItem('rg_theme')||'light')
  const [showAuth,       setShowAuth]       = useState(false)
  const [showTerms,      setShowTerms]      = useState(false)
  const [showAffiliates, setShowAffiliates] = useState(() => window.location.pathname === '/affiliate')
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
      <ErrorBoundary key={showAffiliates ? 'affiliates' : showTerms ? 'terms' : showAuth ? 'auth' : 'landing'} onReset={()=>{ setShowAuth(false); setShowTerms(false); setShowAffiliates(false) }}>
        <Suspense fallback={<Loader/>}>
        {showAffiliates
          ? <AffiliatesPage theme={theme} onNavigate={()=>{ setShowAffiliates(false); history.replaceState(null,'','/') }}/>
          : showTerms
            ? <TermsPage theme={theme} onNavigate={()=>setShowTerms(false)}/>
            : showAuth
              ? <AuthPage theme={theme} onToggleTheme={toggleTheme} onBack={()=>setShowAuth(false)} onShowTerms={()=>setShowTerms(true)}/>
              : <LandingPage theme={theme} onToggleTheme={toggleTheme}
                  onGetStarted={()=>setShowAuth(true)}
                  onSubscribe={handleSubscribe}
                  onShowTerms={()=>setShowTerms(true)}
                  onShowAffiliates={()=>{ setShowAffiliates(true); history.pushState(null,'','/affiliate') }}/>
        }
        </Suspense>
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
