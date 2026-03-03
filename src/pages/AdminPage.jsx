import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import { CSS, StatCard, Loader, fmtMoney } from '../design'

const PLAN_COLORS = { solo: '#94a3b8', team: '#d97706', brokerage: '#8b5cf6', free: '#706b62' }
const PLAN_PRICES = { solo: 29, team: 199, brokerage: 499 }
const PLAN_LABELS = { solo: 'Solo', team: 'Team', brokerage: 'Brokerage', free: 'Free' }
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

  const isAdmin = profile?.app_role === 'admin'

  useEffect(() => {
    if (isAdmin) fetchData()
  }, [isAdmin])

  async function fetchData() {
    setLoading(true)
    setError('')
    try {
      if (!supabase) throw new Error('Service unavailable')
      // refreshSession() forces a fresh token — getSession() can return a stale/expired JWT
      const { data: { session }, error: sessErr } = await supabase.auth.refreshSession()
      if (sessErr || !session) throw new Error('Not authenticated — please log out and back in.')
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-dashboard`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      )
      const result = await resp.json()
      if (!resp.ok) throw new Error(result.error || `Server error (${resp.status})`)
      setData(result)
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
      const matchPlan = planFilter === 'all' || (u.plan || 'free') === planFilter
      const matchBilling = billingFilter === 'all' || (u.billing_status || 'free') === billingFilter
      return matchSearch && matchPlan && matchBilling
    })
  }, [data?.users, search, planFilter, billingFilter])

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
                      sub={`${stats.total_users ? Math.round((stats.paying_users || 0) / stats.total_users * 100) : 0}% conversion`} />
                    <StatCard icon="💰" label="Est. MRR" value={fmtMoney(stats.mrr_estimate || 0)} color="#d97706" />
                    <StatCard icon="🔮" label="Trialing" value={stats.trial_count || 0} color="#3b82f6"
                      sub="potential converts" />
                    <StatCard icon="🤖" label="AI Credits (mo)" value={(stats.ai_credits_this_month || 0).toLocaleString()} color="#8b5cf6" />
                    <StatCard icon="🏢" label="Teams" value={stats.total_teams || 0} color="#6366f1" />
                  </div>

                  {/* Plan breakdown */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16, marginBottom: 16 }}>
                    <div className="card" style={{ padding: 20 }}>
                      <div className="label" style={{ marginBottom: 14 }}>Users by Plan</div>
                      {['brokerage', 'team', 'solo', 'free'].map(p => {
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
                  {/* Filters */}
                  <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
                    <input
                      className="field-input"
                      style={{ flex: 1, minWidth: 180, padding: '8px 12px', fontSize: 13 }}
                      placeholder="Search name or email..."
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                    />
                    <select className="field-input" style={{ minWidth: 110, padding: '8px 10px', fontSize: 13 }}
                      value={planFilter} onChange={e => setPlanFilter(e.target.value)}>
                      <option value="all">All Plans</option>
                      <option value="solo">Solo</option>
                      <option value="team">Team</option>
                      <option value="brokerage">Brokerage</option>
                      <option value="free">Free</option>
                    </select>
                    <select className="field-input" style={{ minWidth: 120, padding: '8px 10px', fontSize: 13 }}
                      value={billingFilter} onChange={e => setBillingFilter(e.target.value)}>
                      <option value="all">All Billing</option>
                      <option value="active">Active</option>
                      <option value="trialing">Trialing</option>
                      <option value="past_due">Past Due</option>
                      <option value="cancelled">Cancelled</option>
                      <option value="free">Free</option>
                    </select>
                  </div>

                  <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
                    Showing {filteredUsers.length} of {data.users.length} users
                  </div>

                  {/* User list */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {filteredUsers.length === 0 && (
                      <div className="empty-state" style={{ padding: 40 }}>
                        <div className="empty-icon">🔍</div>
                        <div>No users match your filters</div>
                      </div>
                    )}
                    {filteredUsers.map(u => (
                      <div key={u.id} className="card" style={{
                        padding: '14px 18px',
                        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                        borderLeft: `3px solid ${PLAN_COLORS[u.plan] || PLAN_COLORS.free}`,
                      }}>
                        {/* Avatar */}
                        <div style={{
                          width: 36, height: 36, borderRadius: 99,
                          background: `linear-gradient(135deg, ${PLAN_COLORS[u.plan] || '#706b62'}, ${PLAN_COLORS[u.plan] || '#706b62'}88)`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: '#fff', fontWeight: 700, fontSize: 14, flexShrink: 0,
                        }}>
                          {(u.full_name || u.email || '?')[0].toUpperCase()}
                        </div>

                        {/* Name + email */}
                        <div style={{ flex: 1, minWidth: 140 }}>
                          <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {u.full_name || '(no name)'}
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
                          background: (PLAN_COLORS[u.plan] || PLAN_COLORS.free) + '18',
                          color: PLAN_COLORS[u.plan] || PLAN_COLORS.free,
                          border: `1px solid ${(PLAN_COLORS[u.plan] || PLAN_COLORS.free)}33`,
                        }}>
                          {u.plan || 'free'}
                        </span>

                        {/* Billing pill */}
                        <span style={{
                          fontSize: 10, fontWeight: 600, textTransform: 'capitalize',
                          padding: '3px 8px', borderRadius: 5,
                          ...billingPill(u.billing_status),
                        }}>
                          {(u.billing_status || 'free').replace('_', ' ')}
                        </span>

                        {/* Team */}
                        {u.team_name && (
                          <span style={{ fontSize: 10, color: 'var(--muted)', background: 'var(--bg2)', padding: '3px 8px', borderRadius: 5 }}>
                            {u.team_name}
                          </span>
                        )}

                        {/* Stats */}
                        <div className="mono" style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'right', minWidth: 65 }}>
                          <div>{(u.xp || 0).toLocaleString()} XP</div>
                          <div>🔥 {u.streak || 0}d</div>
                        </div>

                        {/* AI credits */}
                        <div style={{ textAlign: 'right', minWidth: 45 }}>
                          <div className="label" style={{ fontSize: 9, marginBottom: 2 }}>AI</div>
                          <div className="mono" style={{ fontSize: 12, color: '#8b5cf6', fontWeight: 600 }}>
                            {u.ai_credits_used || 0}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
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
            </>
          )}
        </div>
      </div>
    </>
  )
}
