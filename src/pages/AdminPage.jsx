import { useState, useEffect, useMemo, useRef } from 'react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import { CSS, StatCard, Loader, fmtMoney } from '../design'

const PLAN_COLORS = { admin: '#8b5cf6', solo: '#94a3b8', team: '#d97706', brokerage: '#8b5cf6', team_member: '#6366f1', free: '#706b62' }
const PLAN_PRICES = { solo: 29, team: 199, brokerage: 499 }
const PLAN_LABELS = { admin: 'Admin', solo: 'Solo', team: 'Team', brokerage: 'Brokerage', team_member: 'Team Member', free: 'Free' }

// ── GTM Kanban constants ───────────────────────────────────────────────────────
const GTM_COLUMNS = [
  { id: 'backlog', label: 'Backlog', icon: '📋' },
  { id: 'in_progress', label: 'In Progress', icon: '🔨' },
  { id: 'done', label: 'Done', icon: '✅' },
  { id: 'blocked', label: 'Blocked', icon: '🚧' },
]
const GTM_PHASE_COLORS = { 1: '#10b981', 2: '#d97706', 3: '#8b5cf6' }
const GTM_PHASE_LABELS = { 1: 'Phase 1 · Seed', 2: 'Phase 2 · Grow', 3: 'Phase 3 · Scale' }
const MRR_TARGET = 100000

const DEFAULT_GTM_TASKS = [
  { id: 'gtm-1',  title: 'Create Instagram content calendar (agent productivity tips)', phase: 1, column: 'backlog', notes: '' },
  { id: 'gtm-2',  title: 'Launch TikTok & YouTube Shorts channel', phase: 1, column: 'backlog', notes: '' },
  { id: 'gtm-3',  title: 'Real estate Facebook group outreach campaign', phase: 1, column: 'backlog', notes: '' },
  { id: 'gtm-4',  title: 'Reddit community engagement (r/realtors, r/RealEstate)', phase: 1, column: 'backlog', notes: '' },
  { id: 'gtm-5',  title: 'Set up 14-day free trial flow (Solo plan)', phase: 1, column: 'backlog', notes: '' },
  { id: 'gtm-6',  title: 'SEO: target "real estate habit tracker", "agent accountability app"', phase: 1, column: 'backlog', notes: '' },
  { id: 'gtm-7',  title: 'Build email drip sequence for trial onboarding', phase: 1, column: 'backlog', notes: '' },
  { id: 'gtm-8',  title: 'Reach 500 solo subscribers', phase: 1, column: 'backlog', notes: '' },
  { id: 'gtm-9',  title: 'Design referral bonus program for solo → team conversion', phase: 2, column: 'backlog', notes: '' },
  { id: 'gtm-10', title: 'Direct outreach to KW, eXp, RE/MAX, Compass team leaders', phase: 2, column: 'backlog', notes: '' },
  { id: 'gtm-11', title: 'Attend 3+ local real estate board events', phase: 2, column: 'backlog', notes: '' },
  { id: 'gtm-12', title: 'Publish case study: "How Team X increased activity 40%"', phase: 2, column: 'backlog', notes: '' },
  { id: 'gtm-13', title: 'Build team demo/onboarding deck', phase: 2, column: 'backlog', notes: '' },
  { id: 'gtm-14', title: 'Reach 45 team subscriptions (~600 seats)', phase: 2, column: 'backlog', notes: '' },
  { id: 'gtm-15', title: 'Enterprise sales outreach to brokerage ops managers', phase: 3, column: 'backlog', notes: '' },
  { id: 'gtm-16', title: 'Launch white-label pilot program', phase: 3, column: 'backlog', notes: '' },
  { id: 'gtm-17', title: 'Partner with Tom Ferry / Buffini coaching companies', phase: 3, column: 'backlog', notes: '' },
  { id: 'gtm-18', title: 'Sponsor 2+ real estate podcasts', phase: 3, column: 'backlog', notes: '' },
  { id: 'gtm-19', title: 'Build brokerage-specific landing page', phase: 3, column: 'backlog', notes: '' },
  { id: 'gtm-20', title: 'Reach 28 brokerage accounts (1,400+ seats)', phase: 3, column: 'backlog', notes: '' },
]

// Determine effective plan: admins → 'admin', team members → 'team_member'
function effectivePlan(u) {
  if (u.app_role === 'admin') return 'admin'
  const plan = u.plan || 'free'
  if (plan === 'free' && u.team_id) return 'team_member'
  return plan
}
const BILLING_COLORS = { active: '#10b981', trialing: '#3b82f6', past_due: '#f59e0b', cancelled: '#ef4444', free: '#706b62' }

function billingPill(status) {
  const s = status || 'free'
  const color = BILLING_COLORS[s] || '#706b62'
  return { background: color + '18', color, border: `1px solid ${color}33` }
}

function relativeTime(date) {
  if (!date) return ''
  const s = Math.floor((Date.now() - date.getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  return `${Math.floor(s / 3600)}h ago`
}

function UserRow({ u, badge, indent, showTeam = true }) {
  const ep = effectivePlan(u)
  const epColor = PLAN_COLORS[ep] || PLAN_COLORS.free
  return (
    <div style={{
      padding: indent ? '10px 18px 10px 52px' : '12px 18px',
      display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      borderBottom: '1px solid var(--b1)',
      ...(indent ? {} : { borderLeft: `3px solid ${epColor}` }),
    }}>
      {/* Avatar */}
      <div style={{
        width: indent ? 28 : 34, height: indent ? 28 : 34, borderRadius: 99,
        background: `linear-gradient(135deg, ${epColor}, ${epColor}88)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff', fontWeight: 700, fontSize: indent ? 11 : 13, flexShrink: 0,
      }}>
        {(u.full_name || u.email || '?')[0].toUpperCase()}
      </div>
      {/* Name + email */}
      <div style={{ flex: 1, minWidth: 120 }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {u.full_name || '(no name)'}
          {badge && (
            <span style={{
              marginLeft: 6, fontSize: 9, padding: '1px 6px', borderRadius: 4, fontWeight: 700, verticalAlign: 'middle',
              background: badge === 'Owner' ? '#d9770622' : '#6366f122',
              color: badge === 'Owner' ? '#d97706' : '#6366f1',
            }}>{badge.toUpperCase()}</span>
          )}
          {u.app_role === 'admin' && (
            <span style={{ marginLeft: 6, fontSize: 9, background: '#8b5cf622', color: '#8b5cf6', padding: '1px 6px', borderRadius: 4, fontWeight: 700, verticalAlign: 'middle' }}>ADMIN</span>
          )}
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: "'JetBrains Mono', monospace", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {u.email || u.id.slice(0, 12)}
        </div>
      </div>
      {/* Plan badge */}
      <span style={{
        fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em',
        padding: '3px 8px', borderRadius: 5,
        background: epColor + '18', color: epColor, border: `1px solid ${epColor}33`,
      }}>
        {PLAN_LABELS[ep] || ep}
      </span>
      {/* Billing pill */}
      <span style={{
        fontSize: 10, fontWeight: 600, textTransform: 'capitalize',
        padding: '3px 8px', borderRadius: 5,
        ...billingPill(u.billing_status),
      }}>
        {(u.billing_status || 'free').replace('_', ' ')}
      </span>
      {/* Team name (only in flat views) */}
      {showTeam && u.team_name && (
        <span style={{ fontSize: 10, color: 'var(--muted)', background: 'var(--bg2)', padding: '3px 8px', borderRadius: 5 }}>
          {u.team_name}
        </span>
      )}
      {/* Stats */}
      <div className="mono" style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'right', minWidth: 60 }}>
        <div>{(u.xp || 0).toLocaleString()} XP</div>
        <div>🔥 {u.streak || 0}d</div>
      </div>
      {/* AI credits */}
      <div style={{ textAlign: 'right', minWidth: 40 }}>
        <div className="label" style={{ fontSize: 9, marginBottom: 2 }}>AI</div>
        <div className="mono" style={{ fontSize: 12, color: '#8b5cf6', fontWeight: 600 }}>
          {u.ai_credits_used || 0}
        </div>
      </div>
    </div>
  )
}

export default function AdminPage({ onNavigate }) {
  const { profile } = useAuth()
  const [tab, setTab] = useState('overview')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [planFilter, setPlanFilter] = useState('all')
  const [billingFilter, setBillingFilter] = useState('all')
  const [lastRefresh, setLastRefresh] = useState(null)
  const [userView, setUserView] = useState('teams') // 'solo' | 'teams' | 'free'
  const [expandedTeams, setExpandedTeams] = useState(new Set())

  // ── GTM Kanban state ────────────────────────────────────────────────────
  const [gtmBoard, setGtmBoard] = useState(null)
  const [gtmPhaseFilter, setGtmPhaseFilter] = useState('all')
  const [gtmEditingId, setGtmEditingId] = useState(null)
  const [gtmDragId, setGtmDragId] = useState(null)
  const [gtmNewTitle, setGtmNewTitle] = useState('')
  const gtmSaveTimer = useRef(null)
  const gtmLoadedRef = useRef(false)
  const gtmBoardRef = useRef(null)

  const isAdmin = profile?.app_role === 'admin'

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (isAdmin) fetchData()
  }, [isAdmin])

  async function fetchData() {
    setLoading(true)
    setError('')
    try {
      if (!supabase) throw new Error('Service unavailable')

      // Query profiles directly — profiles_select_admin RLS policy grants access
      const { data: profiles, error: profilesErr } = await supabase
        .from('profiles')
        .select('id, full_name, email, plan, billing_status, xp, streak, team_id, ai_credits_used, ai_credits_reset, stripe_customer_id, stripe_subscription_id, app_role')
        .order('xp', { ascending: false })

      if (profilesErr) throw new Error(profilesErr.message || 'Failed to fetch profiles')

      // Fetch team names (teams are readable by all via RLS)
      const { data: teams } = await supabase
        .from('teams')
        .select('id, name, created_by')

      const teamMap = {}
      for (const t of (teams || [])) teamMap[t.id] = t.name || 'Unnamed Team'

      const allProfiles = profiles || []
      // Separate admins from regular users — admins don't count in stats
      const adminProfiles = allProfiles.filter(p => p.app_role === 'admin')
      const regularProfiles = allProfiles.filter(p => p.app_role !== 'admin')
      const now = new Date()
      const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

      // Compute aggregate stats (only regular users)
      const byPlan = { solo: 0, team: 0, brokerage: 0, team_member: 0, free: 0 }
      const byBilling = { active: 0, trialing: 0, past_due: 0, cancelled: 0, free: 0 }
      let mrrEstimate = 0, aiCreditsTotal = 0, aiCreditsThisMonth = 0

      for (const p of regularProfiles) {
        const planKey = effectivePlan(p)
        byPlan[planKey] = (byPlan[planKey] || 0) + 1
        const billingKey = p.billing_status || 'free'
        byBilling[billingKey] = (byBilling[billingKey] || 0) + 1
        if (p.billing_status === 'active' || p.billing_status === 'trialing')
          mrrEstimate += PLAN_PRICES[p.plan] || 0
        aiCreditsTotal += p.ai_credits_used || 0
        if (p.ai_credits_reset === month) aiCreditsThisMonth += p.ai_credits_used || 0
      }

      const teamIds = new Set(regularProfiles.map(p => p.team_id).filter(Boolean))

      const stats = {
        total_users: regularProfiles.length,
        admin_count: adminProfiles.length,
        by_plan: byPlan,
        by_billing: byBilling,
        paying_users: (byBilling.active || 0) + (byBilling.trialing || 0),
        mrr_estimate: mrrEstimate,
        trial_count: byBilling.trialing || 0,
        ai_credits_used_total: aiCreditsTotal,
        ai_credits_this_month: aiCreditsThisMonth,
        total_teams: teamIds.size,
      }

      // Build team owner lookup
      const teamOwnerMap = {}
      for (const t of (teams || [])) teamOwnerMap[t.id] = t.created_by

      // All users still appear in the user list, but admins are marked
      const users = allProfiles.map(p => ({
        ...p,
        team_name: p.team_id ? (teamMap[p.team_id] || null) : null,
        is_team_owner: p.team_id ? (teamOwnerMap[p.team_id] === p.id) : false,
      }))

      setData({ stats, users, teams: teams || [] })
      setLastRefresh(new Date())
    } catch (err) {
      console.error('Admin dashboard error:', err)
      setError(err.message || 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  const filteredUsers = useMemo(() => {
    if (!data?.users) return []
    return data.users.filter(u => {
      const term = search.toLowerCase()
      const matchSearch = !term
        || (u.full_name || '').toLowerCase().includes(term)
        || (u.email || '').toLowerCase().includes(term)
      const matchPlan = planFilter === 'all' || effectivePlan(u) === planFilter
      const matchBilling = billingFilter === 'all' || (u.billing_status || 'free') === billingFilter
      return matchSearch && matchPlan && matchBilling
    })
  }, [data?.users, search, planFilter, billingFilter])

  // Group users by team for the Teams view
  const teamGroups = useMemo(() => {
    if (!data?.users) return []
    const groups = {}
    const term = search.toLowerCase()
    for (const u of data.users) {
      if (u.app_role === 'admin') continue
      if (!u.team_id) continue
      // search filter
      if (term && !(u.full_name || '').toLowerCase().includes(term) && !(u.email || '').toLowerCase().includes(term)
        && !(u.team_name || '').toLowerCase().includes(term)) continue
      if (!groups[u.team_id]) {
        groups[u.team_id] = { team_id: u.team_id, team_name: u.team_name || 'Unnamed Team', owner: null, members: [] }
      }
      if (u.is_team_owner) groups[u.team_id].owner = u
      else groups[u.team_id].members.push(u)
    }
    // Sort: teams with owners first, then by team name
    return Object.values(groups).sort((a, b) => {
      const planA = a.owner?.plan || ''
      const planB = b.owner?.plan || ''
      if (planA !== planB) return planA === 'brokerage' ? -1 : planB === 'brokerage' ? 1 : planA === 'team' ? -1 : 1
      return (a.team_name || '').localeCompare(b.team_name || '')
    })
  }, [data?.users, search])

  // Solo users: have a paid plan, no team
  const soloUsers = useMemo(() => {
    if (!data?.users) return []
    const term = search.toLowerCase()
    return data.users.filter(u => {
      if (u.app_role === 'admin') return false
      if (u.team_id) return false
      const ep = effectivePlan(u)
      if (ep !== 'solo') return false
      if (term && !(u.full_name || '').toLowerCase().includes(term) && !(u.email || '').toLowerCase().includes(term)) return false
      return true
    })
  }, [data?.users, search])

  // Free users: no plan, no team
  const freeUsers = useMemo(() => {
    if (!data?.users) return []
    const term = search.toLowerCase()
    return data.users.filter(u => {
      if (u.app_role === 'admin') return false
      if (u.team_id) return false
      const ep = effectivePlan(u)
      if (ep !== 'free') return false
      if (term && !(u.full_name || '').toLowerCase().includes(term) && !(u.email || '').toLowerCase().includes(term)) return false
      return true
    })
  }, [data?.users, search])

  function toggleTeam(teamId) {
    setExpandedTeams(prev => {
      const next = new Set(prev)
      if (next.has(teamId)) next.delete(teamId)
      else next.add(teamId)
      return next
    })
  }

  // ── GTM board persistence (ref-based, zero useEffect for saves) ─────────
  function scheduleGtmSave() {
    if (gtmSaveTimer.current) clearTimeout(gtmSaveTimer.current)
    gtmSaveTimer.current = setTimeout(async () => {
      const board = gtmBoardRef.current
      if (!board || !supabase || !profile?.id) return
      try {
        const { data: row } = await supabase
          .from('profiles').select('habit_prefs').eq('id', profile.id).single()
        const prefs = row?.habit_prefs || {}
        await supabase.from('profiles')
          .update({ habit_prefs: { ...prefs, gtm_board: board } })
          .eq('id', profile.id)
      } catch (e) { console.error('GTM save error:', e) }
    }, 600)
  }

  // Load GTM board exactly once when tab opens
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (tab !== 'gtm' || gtmLoadedRef.current) return
    gtmLoadedRef.current = true
    if (!supabase || !profile?.id) return
    ;(async () => {
      try {
        const { data: row } = await supabase
          .from('profiles').select('habit_prefs').eq('id', profile.id).single()
        const saved = row?.habit_prefs?.gtm_board
        const board = (saved?.tasks?.length) ? saved : { tasks: DEFAULT_GTM_TASKS.map(t => ({ ...t })) }
        gtmBoardRef.current = board
        setGtmBoard(board)
        if (!saved?.tasks?.length) scheduleGtmSave()
      } catch (e) { console.error('GTM load error:', e) }
    })()
  }, [tab])

  function gtmMoveTask(taskId, newColumn) {
    const prev = gtmBoardRef.current
    if (!prev) return
    const tasks = prev.tasks.map(t => t.id === taskId ? { ...t, column: newColumn } : t)
    const next = { ...prev, tasks }
    gtmBoardRef.current = next
    setGtmBoard(next)
    scheduleGtmSave()
  }

  function gtmAddTask(title) {
    if (!title.trim()) return
    const prev = gtmBoardRef.current
    if (!prev) return
    const nextId = `gtm-custom-${Date.now()}`
    const task = { id: nextId, title: title.trim(), phase: 1, column: 'backlog', notes: '' }
    const next = { ...prev, tasks: [...prev.tasks, task] }
    gtmBoardRef.current = next
    setGtmBoard(next)
    setGtmNewTitle('')
    scheduleGtmSave()
  }

  function gtmUpdateTask(taskId, updates) {
    const prev = gtmBoardRef.current
    if (!prev) return
    const tasks = prev.tasks.map(t => t.id === taskId ? { ...t, ...updates } : t)
    const next = { ...prev, tasks }
    gtmBoardRef.current = next
    setGtmBoard(next)
    scheduleGtmSave()
  }

  function gtmDeleteTask(taskId) {
    const prev = gtmBoardRef.current
    if (!prev) return
    const next = { ...prev, tasks: prev.tasks.filter(t => t.id !== taskId) }
    gtmBoardRef.current = next
    setGtmBoard(next)
    scheduleGtmSave()
  }

  // ── Access guard ────────────────────────────────────────────────────────
  if (!isAdmin) {
    return (
      <>
        <style>{CSS}</style>
        <div className="page">
          <div className="page-inner" style={{ maxWidth: 600 }}>
            <div className="card" style={{ padding: '48px 32px', textAlign: 'center', marginTop: 60 }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🔒</div>
              <div className="serif" style={{ fontSize: 22, color: 'var(--text)', marginBottom: 8 }}>
                Access Restricted
              </div>
              <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.7, marginBottom: 24 }}>
                This area is restricted to platform administrators.
              </div>
              <button className="btn-outline" onClick={() => onNavigate('dashboard')}>
                ← Back to Dashboard
              </button>
            </div>
          </div>
        </div>
      </>
    )
  }

  const stats = data?.stats || {}

  return (
    <>
      <style>{CSS}</style>
      <div className="page">
        <div className="page-inner" style={{ maxWidth: 1100 }}>

          {/* ── Header ──────────────────────────────────────────────── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
            <button className="btn-ghost" onClick={() => onNavigate('dashboard')}
              style={{ fontSize: 18, padding: '4px 10px' }}>←</button>
            <div style={{ flex: 1 }}>
              <div className="serif" style={{ fontSize: 26, color: 'var(--text)' }}>
                Platform Admin
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                {data ? `${data.users.length} users · refreshed ${relativeTime(lastRefresh)}` : 'Loading platform data...'}
              </div>
            </div>
            <button className="btn-outline" onClick={fetchData} disabled={loading}
              style={{ fontSize: 12, padding: '6px 14px' }}>
              {loading ? '...' : '↻ Refresh'}
            </button>
          </div>

          {/* ── Error ───────────────────────────────────────────────── */}
          {error && (
            <div className="error-box" style={{ marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>{error}</span>
              <button className="btn-ghost" onClick={fetchData} style={{ fontSize: 11 }}>Retry</button>
            </div>
          )}

          {loading && !data ? <Loader /> : data && (
            <>
              {/* ── Tabs ──────────────────────────────────────────────── */}
              <div className="tabs" style={{ marginBottom: 24 }}>
                {[
                  { id: 'overview', l: 'Overview' },
                  { id: 'users', l: `Users (${data.users.length})` },
                  { id: 'subscriptions', l: 'Subscriptions' },
                  { id: 'gtm', l: '🎯 GTM Roadmap' },
                ].map(t => (
                  <button key={t.id} className={`tab-item${tab === t.id ? ' on' : ''}`}
                    onClick={() => setTab(t.id)}>{t.l}</button>
                ))}
              </div>

              {/* ═══════════ OVERVIEW TAB ═══════════ */}
              {tab === 'overview' && (
                <div>
                  <div className="stat-grid" style={{ marginBottom: 24 }}>
                    <StatCard icon="👥" label="Total Users" value={stats.total_users || 0} color="#3b82f6" />
                    <StatCard icon="💳" label="Paying" value={stats.paying_users || 0} color="#10b981"
                      sub={`${(() => { const base = (stats.total_users || 0) - (stats.by_plan?.team_member || 0); return base > 0 ? Math.round((stats.paying_users || 0) / base * 100) : 0 })()}% conversion`} />
                    <StatCard icon="💰" label="Est. MRR" value={fmtMoney(stats.mrr_estimate || 0)} color="#d97706" />
                    <StatCard icon="🔮" label="Free Trial" value={stats.trial_count || 0} color="#3b82f6"
                      sub={`of ${stats.total_users || 0} total users`} />
                    <StatCard icon="🤖" label="AI Credits (mo)" value={(stats.ai_credits_this_month || 0).toLocaleString()} color="#8b5cf6" />
                    <StatCard icon="🏢" label="Teams" value={stats.total_teams || 0} color="#6366f1" />
                  </div>

                  {/* Plan breakdown */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16, marginBottom: 16 }}>
                    <div className="card" style={{ padding: 20 }}>
                      <div className="label" style={{ marginBottom: 14 }}>Users by Plan</div>
                      {['brokerage', 'team', 'solo', 'team_member', 'free'].map(p => {
                        const count = stats.by_plan?.[p] || 0
                        const pct = stats.total_users ? Math.round(count / stats.total_users * 100) : 0
                        return (
                          <div key={p} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                            <div style={{
                              width: 10, height: 10, borderRadius: 3,
                              background: PLAN_COLORS[p], flexShrink: 0,
                            }} />
                            <span style={{ fontSize: 13, color: 'var(--text)', flex: 1 }}>{PLAN_LABELS[p]}</span>
                            <span className="mono" style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600 }}>{count}</span>
                            <div style={{ width: 80, height: 6, background: 'var(--b1)', borderRadius: 99 }}>
                              <div style={{ height: '100%', width: `${pct}%`, background: PLAN_COLORS[p], borderRadius: 99, transition: 'width .4s' }} />
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    <div className="card" style={{ padding: 20 }}>
                      <div className="label" style={{ marginBottom: 14 }}>Billing Status</div>
                      {['active', 'trialing', 'past_due', 'cancelled', 'free'].map(s => {
                        const count = stats.by_billing?.[s] || 0
                        const pct = stats.total_users ? Math.round(count / stats.total_users * 100) : 0
                        return (
                          <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                            <div style={{
                              width: 10, height: 10, borderRadius: 3,
                              background: BILLING_COLORS[s], flexShrink: 0,
                            }} />
                            <span style={{ fontSize: 13, color: 'var(--text)', flex: 1, textTransform: 'capitalize' }}>
                              {s === 'past_due' ? 'Past Due' : s}
                            </span>
                            <span className="mono" style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600 }}>{count}</span>
                            <div style={{ width: 80, height: 6, background: 'var(--b1)', borderRadius: 99 }}>
                              <div style={{ height: '100%', width: `${pct}%`, background: BILLING_COLORS[s], borderRadius: 99, transition: 'width .4s' }} />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* ═══════════ USERS TAB ═══════════ */}
              {tab === 'users' && (
                <div>
                  {/* Search */}
                  <div style={{ marginBottom: 16 }}>
                    <input
                      className="field-input"
                      style={{ width: '100%', padding: '8px 12px', fontSize: 13 }}
                      placeholder="Search name, email, or team..."
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                    />
                  </div>

                  {/* Sub-tabs: Teams | Solo | Free */}
                  <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
                    {[
                      { id: 'teams', label: `Teams (${teamGroups.length})`, icon: '🏢' },
                      { id: 'solo', label: `Solo (${soloUsers.length})`, icon: '👤' },
                      { id: 'free', label: `Free (${freeUsers.length})`, icon: '🆓' },
                    ].map(v => (
                      <button key={v.id}
                        onClick={() => setUserView(v.id)}
                        style={{
                          padding: '7px 14px', fontSize: 12, fontWeight: 600, borderRadius: 8,
                          border: userView === v.id ? '1.5px solid var(--gold)' : '1px solid var(--b1)',
                          background: userView === v.id ? 'var(--gold-bg, rgba(217,119,6,.08))' : 'var(--surface)',
                          color: userView === v.id ? 'var(--gold)' : 'var(--muted)',
                          cursor: 'pointer', transition: 'all .2s',
                        }}>
                        {v.icon} {v.label}
                      </button>
                    ))}
                  </div>

                  {/* ── Teams View ── */}
                  {userView === 'teams' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {teamGroups.length === 0 && (
                        <div className="empty-state" style={{ padding: 40 }}>
                          <div className="empty-icon">🏢</div>
                          <div>No teams found</div>
                        </div>
                      )}
                      {teamGroups.map(g => {
                        const isOpen = expandedTeams.has(g.team_id)
                        const ownerPlan = g.owner?.plan || 'free'
                        const ownerColor = PLAN_COLORS[ownerPlan] || PLAN_COLORS.free
                        const totalMembers = (g.owner ? 1 : 0) + g.members.length
                        return (
                          <div key={g.team_id} className="card" style={{ overflow: 'hidden' }}>
                            {/* Team header — clickable to expand */}
                            <div
                              onClick={() => toggleTeam(g.team_id)}
                              style={{
                                padding: '14px 18px', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: 12,
                                borderLeft: `3px solid ${ownerColor}`,
                                background: isOpen ? 'var(--bg2)' : 'transparent',
                                transition: 'background .2s',
                              }}>
                              <span style={{ fontSize: 14, color: 'var(--muted)', width: 18, textAlign: 'center', flexShrink: 0 }}>
                                {isOpen ? '▾' : '▸'}
                              </span>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>
                                  {g.team_name}
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                                  {g.owner ? (g.owner.full_name || g.owner.email || 'Unknown owner') : 'No owner found'} · {totalMembers} member{totalMembers !== 1 ? 's' : ''}
                                </div>
                              </div>
                              {/* Owner plan badge */}
                              <span style={{
                                fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em',
                                padding: '3px 8px', borderRadius: 5,
                                background: ownerColor + '18', color: ownerColor,
                                border: `1px solid ${ownerColor}33`,
                              }}>
                                {PLAN_LABELS[ownerPlan] || ownerPlan}
                              </span>
                              {/* Billing pill */}
                              {g.owner && (
                                <span style={{
                                  fontSize: 10, fontWeight: 600, textTransform: 'capitalize',
                                  padding: '3px 8px', borderRadius: 5,
                                  ...billingPill(g.owner.billing_status),
                                }}>
                                  {(g.owner.billing_status || 'free').replace('_', ' ')}
                                </span>
                              )}
                            </div>

                            {/* Expanded: owner + members */}
                            {isOpen && (
                              <div style={{ borderTop: '1px solid var(--b1)' }}>
                                {/* Owner row */}
                                {g.owner && (
                                  <UserRow u={g.owner} badge="Owner" indent={false} />
                                )}
                                {/* Members */}
                                {g.members.length > 0 ? g.members.map(m => (
                                  <UserRow key={m.id} u={m} badge="Member" indent={true} />
                                )) : (
                                  <div style={{ padding: '12px 18px 12px 52px', fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>
                                    No team members yet
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* ── Solo View ── */}
                  {userView === 'solo' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {soloUsers.length === 0 && (
                        <div className="empty-state" style={{ padding: 40 }}>
                          <div className="empty-icon">👤</div>
                          <div>No solo subscribers</div>
                        </div>
                      )}
                      {soloUsers.map(u => (
                        <UserRow key={u.id} u={u} showTeam={false} />
                      ))}
                    </div>
                  )}

                  {/* ── Free View ── */}
                  {userView === 'free' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {freeUsers.length === 0 && (
                        <div className="empty-state" style={{ padding: 40 }}>
                          <div className="empty-icon">🆓</div>
                          <div>No unaffiliated free users</div>
                        </div>
                      )}
                      {freeUsers.map(u => (
                        <UserRow key={u.id} u={u} showTeam={false} />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ═══════════ SUBSCRIPTIONS TAB ═══════════ */}
              {tab === 'subscriptions' && (
                <div>
                  {/* MRR Banner */}
                  <div className="card" style={{
                    padding: '28px 32px', marginBottom: 24, textAlign: 'center',
                    background: 'linear-gradient(135deg, rgba(217,119,6,.08) 0%, var(--surface) 60%)',
                    borderTop: '3px solid #d97706',
                  }}>
                    <div className="label" style={{ marginBottom: 8 }}>Estimated Monthly Recurring Revenue</div>
                    <div className="serif" style={{ fontSize: 42, color: '#d97706', fontWeight: 700, lineHeight: 1.1 }}>
                      {fmtMoney(stats.mrr_estimate || 0)}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
                      {stats.paying_users || 0} paying users · {stats.trial_count || 0} trialing
                    </div>
                  </div>

                  {/* Revenue by plan */}
                  <div className="card" style={{ padding: 20, marginBottom: 16 }}>
                    <div className="label" style={{ marginBottom: 14 }}>Revenue by Plan</div>
                    {['brokerage', 'team', 'solo'].map(p => {
                      const activeCount = (data?.users || []).filter(u =>
                        u.plan === p && (u.billing_status === 'active' || u.billing_status === 'trialing')
                      ).length
                      const revenue = activeCount * (PLAN_PRICES[p] || 0)
                      const pct = stats.mrr_estimate ? Math.round(revenue / stats.mrr_estimate * 100) : 0
                      return (
                        <div key={p} style={{ marginBottom: 14 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{ width: 10, height: 10, borderRadius: 3, background: PLAN_COLORS[p] }} />
                              <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>{PLAN_LABELS[p]}</span>
                              <span className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>
                                {activeCount} × ${PLAN_PRICES[p]}
                              </span>
                            </div>
                            <span className="mono" style={{ fontSize: 14, color: 'var(--text)', fontWeight: 700 }}>
                              {fmtMoney(revenue)}
                            </span>
                          </div>
                          <div style={{ height: 8, background: 'var(--b1)', borderRadius: 99 }}>
                            <div style={{
                              height: '100%', width: `${pct}%`,
                              background: PLAN_COLORS[p], borderRadius: 99,
                              transition: 'width .5s',
                            }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* At-risk: past due accounts */}
                  {(() => {
                    const pastDue = (data?.users || []).filter(u => u.billing_status === 'past_due')
                    if (pastDue.length === 0) return null
                    return (
                      <div className="card" style={{ padding: 20, borderLeft: '3px solid #f59e0b' }}>
                        <div className="label" style={{ marginBottom: 12, color: '#f59e0b' }}>
                          ⚠ Past Due Accounts ({pastDue.length})
                        </div>
                        {pastDue.map(u => (
                          <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                            <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500, flex: 1 }}>
                              {u.full_name || u.email || u.id.slice(0, 12)}
                            </span>
                            <span style={{
                              fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                              padding: '2px 8px', borderRadius: 5,
                              background: (PLAN_COLORS[u.plan] || PLAN_COLORS.free) + '18',
                              color: PLAN_COLORS[u.plan] || PLAN_COLORS.free,
                            }}>
                              {u.plan || 'free'}
                            </span>
                            <span className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>
                              {fmtMoney(PLAN_PRICES[u.plan] || 0)}/mo
                            </span>
                          </div>
                        ))}
                      </div>
                    )
                  })()}

                  {/* Cancelled accounts */}
                  {(() => {
                    const cancelled = (data?.users || []).filter(u => u.billing_status === 'cancelled')
                    if (cancelled.length === 0) return null
                    return (
                      <div className="card" style={{ padding: 20, marginTop: 16, borderLeft: '3px solid var(--muted)' }}>
                        <div className="label" style={{ marginBottom: 12 }}>
                          Cancelled ({cancelled.length})
                        </div>
                        {cancelled.map(u => (
                          <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                            <span style={{ fontSize: 13, color: 'var(--muted)', flex: 1 }}>
                              {u.full_name || u.email || u.id.slice(0, 12)}
                            </span>
                            <span className="mono" style={{ fontSize: 11, color: 'var(--dim)' }}>
                              was {u.plan || 'free'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )
                  })()}
                </div>
              )}

              {/* ═══════════ GTM ROADMAP TAB ═══════════ */}
              {tab === 'gtm' && (
                <div>
                  {/* MRR Progress */}
                  <div className="card" style={{
                    padding: '24px 28px', marginBottom: 20,
                    background: 'linear-gradient(135deg, rgba(16,185,129,.06) 0%, var(--surface) 60%)',
                    borderTop: '3px solid #10b981',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
                      <div className="label">🎯 Road to $100K MRR</div>
                      <div className="mono" style={{ fontSize: 13, color: 'var(--text)' }}>
                        {fmtMoney(stats.mrr_estimate || 0)}{' '}
                        <span style={{ color: 'var(--muted)' }}>/ {fmtMoney(MRR_TARGET)}</span>
                      </div>
                    </div>
                    <div style={{ height: 12, background: 'var(--b1)', borderRadius: 99, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', borderRadius: 99,
                        width: `${Math.min(100, ((stats.mrr_estimate || 0) / MRR_TARGET) * 100)}%`,
                        background: 'linear-gradient(90deg, #10b981, #d97706)',
                        transition: 'width .6s ease',
                      }} />
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6, textAlign: 'right' }}>
                      {(((stats.mrr_estimate || 0) / MRR_TARGET) * 100).toFixed(1)}% of target
                    </div>
                  </div>

                  {/* Phase Filters + Add Task */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                    {[
                      { id: 'all', label: 'All Tasks', color: null },
                      { id: 1, label: 'Phase 1 · Seed', color: '#10b981' },
                      { id: 2, label: 'Phase 2 · Grow', color: '#d97706' },
                      { id: 3, label: 'Phase 3 · Scale', color: '#8b5cf6' },
                    ].map(f => (
                      <button key={f.id}
                        onClick={() => setGtmPhaseFilter(f.id)}
                        style={{
                          padding: '6px 14px', fontSize: 11, fontWeight: 600, borderRadius: 8,
                          border: gtmPhaseFilter === f.id
                            ? `1.5px solid ${f.color || 'var(--gold)'}`
                            : '1px solid var(--b1)',
                          background: gtmPhaseFilter === f.id
                            ? (f.color ? f.color + '14' : 'var(--gold-bg, rgba(217,119,6,.08))')
                            : 'var(--surface)',
                          color: gtmPhaseFilter === f.id
                            ? (f.color || 'var(--gold)')
                            : 'var(--muted)',
                          cursor: 'pointer', transition: 'all .2s',
                        }}>
                        {f.label}
                      </button>
                    ))}
                    <div style={{ flex: 1 }} />
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input
                        className="field-input"
                        style={{ padding: '6px 10px', fontSize: 12, width: 220 }}
                        placeholder="New task title..."
                        value={gtmNewTitle}
                        onChange={e => setGtmNewTitle(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && gtmAddTask(gtmNewTitle)}
                      />
                      <button className="btn-outline"
                        style={{ fontSize: 11, padding: '6px 12px', whiteSpace: 'nowrap' }}
                        onClick={() => gtmAddTask(gtmNewTitle)}>
                        + Add
                      </button>
                    </div>
                  </div>

                  {/* Kanban Board */}
                  {!gtmBoard ? <Loader /> : (
                    <div style={{
                      display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
                      gap: 12, alignItems: 'start',
                    }}>
                      {GTM_COLUMNS.map((col, colIdx) => {
                        const colTasks = gtmBoard.tasks.filter(t =>
                          t.column === col.id && (gtmPhaseFilter === 'all' || t.phase === gtmPhaseFilter)
                        )
                        return (
                          <div key={col.id}
                            onDragOver={e => { e.preventDefault(); e.currentTarget.style.background = 'var(--bg2)' }}
                            onDragLeave={e => { e.currentTarget.style.background = '' }}
                            onDrop={e => {
                              e.preventDefault()
                              e.currentTarget.style.background = ''
                              const taskId = e.dataTransfer.getData('text/plain')
                              if (taskId) gtmMoveTask(taskId, col.id)
                            }}
                            style={{
                              background: 'var(--surface)', border: '1px solid var(--b1)',
                              borderRadius: 12, minHeight: 300, transition: 'background .15s',
                            }}>
                            {/* Column header */}
                            <div style={{
                              padding: '12px 14px', borderBottom: '1px solid var(--b1)',
                              display: 'flex', alignItems: 'center', gap: 8,
                            }}>
                              <span>{col.icon}</span>
                              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', flex: 1 }}>
                                {col.label}
                              </span>
                              <span className="mono" style={{
                                fontSize: 11, color: 'var(--muted)',
                                background: 'var(--bg2)', padding: '2px 7px', borderRadius: 6,
                              }}>
                                {colTasks.length}
                              </span>
                            </div>

                            {/* Cards */}
                            <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                              {colTasks.map(task => {
                                const isEditing = gtmEditingId === task.id
                                const phaseColor = GTM_PHASE_COLORS[task.phase] || '#94a3b8'
                                return (
                                  <div key={task.id}
                                    draggable={!isEditing}
                                    onDragStart={e => {
                                      e.dataTransfer.setData('text/plain', task.id)
                                      setGtmDragId(task.id)
                                    }}
                                    onDragEnd={() => setGtmDragId(null)}
                                    onClick={() => !isEditing && setGtmEditingId(task.id)}
                                    style={{
                                      padding: '10px 12px', borderRadius: 8,
                                      background: gtmDragId === task.id ? 'var(--bg2)' : 'var(--bg)',
                                      border: `1px solid ${isEditing ? phaseColor + '66' : 'var(--b1)'}`,
                                      cursor: isEditing ? 'default' : 'grab',
                                      opacity: gtmDragId === task.id ? 0.5 : 1,
                                      transition: 'all .15s',
                                    }}>
                                    {/* Phase badge */}
                                    <div style={{ marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                                      <span style={{
                                        fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                                        background: phaseColor + '18', color: phaseColor,
                                      }}>
                                        {GTM_PHASE_LABELS[task.phase] || `Phase ${task.phase}`}
                                      </span>
                                    </div>

                                    {/* Editing mode */}
                                    {isEditing ? (
                                      <div onClick={e => e.stopPropagation()}>
                                        <input className="field-input"
                                          style={{ width: '100%', fontSize: 12, padding: '4px 8px', marginBottom: 6 }}
                                          value={task.title}
                                          onChange={e => gtmUpdateTask(task.id, { title: e.target.value })}
                                        />
                                        <textarea className="field-input"
                                          style={{
                                            width: '100%', fontSize: 11, padding: '4px 8px',
                                            minHeight: 48, resize: 'vertical', marginBottom: 6,
                                          }}
                                          placeholder="Notes..."
                                          value={task.notes || ''}
                                          onChange={e => gtmUpdateTask(task.id, { notes: e.target.value })}
                                        />
                                        {/* Phase selector */}
                                        <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                                          {[1, 2, 3].map(p => (
                                            <button key={p}
                                              onClick={() => gtmUpdateTask(task.id, { phase: p })}
                                              style={{
                                                fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                                                border: task.phase === p
                                                  ? `1.5px solid ${GTM_PHASE_COLORS[p]}`
                                                  : '1px solid var(--b1)',
                                                background: task.phase === p
                                                  ? GTM_PHASE_COLORS[p] + '18' : 'transparent',
                                                color: task.phase === p
                                                  ? GTM_PHASE_COLORS[p] : 'var(--muted)',
                                                cursor: 'pointer',
                                              }}>
                                              P{p}
                                            </button>
                                          ))}
                                        </div>
                                        <div style={{ display: 'flex', gap: 6, justifyContent: 'space-between' }}>
                                          <button className="btn-ghost"
                                            style={{ fontSize: 10, color: '#ef4444' }}
                                            onClick={() => { gtmDeleteTask(task.id); setGtmEditingId(null) }}>
                                            Delete
                                          </button>
                                          <button className="btn-outline"
                                            style={{ fontSize: 10, padding: '3px 10px' }}
                                            onClick={() => setGtmEditingId(null)}>
                                            Done
                                          </button>
                                        </div>
                                      </div>
                                    ) : (
                                      <>
                                        {/* Title */}
                                        <div style={{
                                          fontSize: 12, fontWeight: 600, color: 'var(--text)',
                                          lineHeight: 1.4, marginBottom: task.notes ? 4 : 0,
                                        }}>
                                          {task.title}
                                        </div>
                                        {task.notes && (
                                          <div style={{
                                            fontSize: 10, color: 'var(--muted)', lineHeight: 1.4,
                                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                          }}>
                                            {task.notes}
                                          </div>
                                        )}
                                        {/* Move arrows */}
                                        <div style={{
                                          display: 'flex', gap: 4, marginTop: 6, justifyContent: 'flex-end',
                                        }} onClick={e => e.stopPropagation()}>
                                          {colIdx > 0 && (
                                            <button className="btn-ghost"
                                              style={{ fontSize: 10, padding: '2px 6px' }}
                                              onClick={() => gtmMoveTask(task.id, GTM_COLUMNS[colIdx - 1].id)}
                                              title={`Move to ${GTM_COLUMNS[colIdx - 1].label}`}>
                                              ←
                                            </button>
                                          )}
                                          {colIdx < GTM_COLUMNS.length - 1 && (
                                            <button className="btn-ghost"
                                              style={{ fontSize: 10, padding: '2px 6px' }}
                                              onClick={() => gtmMoveTask(task.id, GTM_COLUMNS[colIdx + 1].id)}
                                              title={`Move to ${GTM_COLUMNS[colIdx + 1].label}`}>
                                              →
                                            </button>
                                          )}
                                        </div>
                                      </>
                                    )}
                                  </div>
                                )
                              })}
                              {colTasks.length === 0 && (
                                <div style={{
                                  padding: '24px 12px', textAlign: 'center',
                                  fontSize: 11, color: 'var(--dim)', fontStyle: 'italic',
                                }}>
                                  Drop tasks here
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Task summary footer */}
                  {gtmBoard && (
                    <div style={{ marginTop: 16, display: 'flex', gap: 16, justifyContent: 'center' }}>
                      {GTM_COLUMNS.map(col => {
                        const count = gtmBoard.tasks.filter(t => t.column === col.id).length
                        return (
                          <div key={col.id} className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>
                            {col.icon} {count} {col.label.toLowerCase()}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  )
}
