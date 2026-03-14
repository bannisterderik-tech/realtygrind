import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import { Loader } from '../design'
import { isActiveBilling, isTeamMember, isPlatformAdmin, hasActiveAddon } from '../lib/plans'

async function getFreshToken(forceRefresh = false) {
  if (forceRefresh) {
    const { data } = await supabase.auth.refreshSession()
    return data.session?.access_token || null
  }
  const { data: { session } } = await supabase.auth.getSession()
  if (session?.access_token) {
    const expiresAt = session.expires_at ?? 0
    if (expiresAt - Math.floor(Date.now() / 1000) < 120) {
      const { data } = await supabase.auth.refreshSession()
      return data.session?.access_token || null
    }
    return session.access_token
  }
  const { data } = await supabase.auth.refreshSession()
  return data.session?.access_token || null
}

const STYLES = [
  { value: 'modern',  label: 'Modern' },
  { value: 'classic', label: 'Classic' },
  { value: 'minimal', label: 'Minimal' },
  { value: 'bold',    label: 'Bold' },
]
const COLOR_PRESETS = [
  { value: '#2563eb', label: 'Blue' },
  { value: '#d97706', label: 'Gold' },
  { value: '#059669', label: 'Green' },
  { value: '#7c3aed', label: 'Purple' },
  { value: '#dc2626', label: 'Red' },
  { value: '#374151', label: 'Neutral' },
]

export default function CMAPage({ onNavigate, theme }) {
  const { user, profile } = useAuth()
  const [view, setView]       = useState('list') // 'list' | 'create' | 'view'
  const [reports, setReports]  = useState([])
  const [loading, setLoading]  = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError]      = useState('')
  const [activeReport, setActiveReport] = useState(null)
  const [deleteConfirm, setDeleteConfirm] = useState(null)

  // Form state
  const [address, setAddress]       = useState('')
  const [style, setStyle]           = useState('modern')
  const [cmaTheme, setCmaTheme]     = useState('light')
  const [colorScheme, setColorScheme] = useState('#2563eb')
  const [searchRadius, setSearchRadius] = useState(2)
  const [daysBack, setDaysBack]     = useState(180)
  const [maxComps, setMaxComps]     = useState(15)
  const [propertyType, setPropertyType] = useState('Single Family')

  const generatingRef = useRef(false)
  const pollRef = useRef(null)
  const iframeRef = useRef(null)

  // Gate checks
  const hasBilling = isPlatformAdmin(profile) || isActiveBilling(profile?.billing_status) || isTeamMember(profile, user?.id)
  const addonActive = hasActiveAddon(profile, 'cma')
  const isDisabledByTeam = profile?.teams?.team_prefs?.ai_tools?.cma_enabled === false

  // Fetch reports
  useEffect(() => {
    if (!user?.id) return
    supabase.from('cma_reports')
      .select('id, subject_address, status, style, theme, color_scheme, pricing_strategy, created_at, updated_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }) => {
        setReports(data || [])
        setLoading(false)
      })
  }, [user?.id])

  // Clean up polling on unmount
  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [])

  function resetForm() {
    setAddress('')
    setStyle('modern')
    setCmaTheme('light')
    setColorScheme('#2563eb')
    setSearchRadius(2)
    setDaysBack(180)
    setMaxComps(15)
    setPropertyType('Single Family')
    setError('')
  }

  async function loadReport(reportId) {
    const { data } = await supabase
      .from('cma_reports')
      .select('id, subject_address, html, pricing_strategy, status')
      .eq('id', reportId)
      .eq('user_id', user.id)
      .single()
    if (data?.html) {
      setActiveReport(data)
      setView('view')
    }
  }

  async function deleteReport(reportId) {
    const { error: err } = await supabase.from('cma_reports').delete().eq('id', reportId).eq('user_id', user.id)
    if (!err) {
      setReports(r => r.filter(x => x.id !== reportId))
      setDeleteConfirm(null)
      if (activeReport?.id === reportId) {
        setActiveReport(null)
        setView('list')
      }
    }
  }

  const generateCMA = useCallback(async () => {
    if (generatingRef.current || !address.trim()) return
    generatingRef.current = true
    setGenerating(true)
    setError('')

    try {
      async function callGenerate(forceRefresh = false) {
        const token = await getFreshToken(forceRefresh)
        if (!token) throw new Error('Session expired — please log in again.')
        return fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-cma`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({
              address, style, theme: cmaTheme, colorScheme,
              searchRadius, daysBack, maxComps, propertyType,
            }),
          }
        )
      }

      let resp = await callGenerate()
      if (resp.status === 401) resp = await callGenerate(true)

      const data = await resp.json()
      if (!resp.ok) {
        if (resp.status === 401) {
          setError('Session expired — please log in again.')
          return
        }
        throw new Error(data.error || `HTTP ${resp.status}`)
      }

      // Background generation: poll for completion
      if (data.status === 'generating') {
        const reportId = data.id
        setView('list')

        // Refresh list to show generating card
        const { data: updated } = await supabase.from('cma_reports')
          .select('id, subject_address, status, style, theme, color_scheme, pricing_strategy, created_at, updated_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(50)
        setReports(updated || [])

        // Poll every 4 seconds
        if (pollRef.current) clearInterval(pollRef.current)
        pollRef.current = setInterval(async () => {
          try {
            const { data: row } = await supabase
              .from('cma_reports')
              .select('id, subject_address, status, pricing_strategy')
              .eq('id', reportId)
              .single()

            if (row?.status === 'ready') {
              clearInterval(pollRef.current)
              pollRef.current = null
              // Refresh list
              const { data: final } = await supabase.from('cma_reports')
                .select('id, subject_address, status, style, theme, color_scheme, pricing_strategy, created_at, updated_at')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false })
                .limit(50)
              setReports(final || [])
              setGenerating(false)
              generatingRef.current = false
            } else if (row?.status === 'failed') {
              clearInterval(pollRef.current)
              pollRef.current = null
              setError('CMA generation failed. Please try again.')
              setGenerating(false)
              generatingRef.current = false
            }
          } catch { /* ignore polling errors */ }
        }, 4000)

        // Timeout after 3 minutes
        setTimeout(() => {
          if (pollRef.current) {
            clearInterval(pollRef.current)
            pollRef.current = null
            setGenerating(false)
            generatingRef.current = false
            setError('Generation timed out. Check back in a moment.')
          }
        }, 180000)
        return
      }
    } catch (err) {
      setError(err.message || 'Failed to generate CMA.')
    } finally {
      if (!pollRef.current) {
        setGenerating(false)
        generatingRef.current = false
      }
    }
  }, [address, style, cmaTheme, colorScheme, searchRadius, daysBack, maxComps, propertyType, user?.id])

  // ── Paywall ──
  if (!hasBilling) {
    return (
      <div className="page-inner" style={{ maxWidth: 700, textAlign: 'center', padding: '80px 20px' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>📊</div>
        <div className="serif" style={{ fontSize: 26, color: 'var(--text)', marginBottom: 8 }}>CMA Builder</div>
        <div style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.7, marginBottom: 24 }}>
          AI-powered Comparative Market Analysis reports for listing agents.
          Subscribe to a plan to get started.
        </div>
        <button className="btn-gold" onClick={() => onNavigate('billing')} style={{ fontSize: 14, padding: '12px 28px' }}>
          View Plans
        </button>
      </div>
    )
  }

  if (!addonActive) {
    return (
      <div className="page-inner" style={{ maxWidth: 700, textAlign: 'center', padding: '80px 20px' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>📊</div>
        <div className="serif" style={{ fontSize: 26, color: 'var(--text)', marginBottom: 8 }}>CMA Builder</div>
        <div style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.7, marginBottom: 24 }}>
          Generate AI-powered Comparative Market Analysis reports with comp analysis,
          pricing strategy, and client-ready PDF output.
        </div>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button className="btn-gold" onClick={() => onNavigate('billing')} style={{ fontSize: 14, padding: '12px 28px' }}>
            Subscribe to CMA Add-On
          </button>
          <button className="btn-ghost" onClick={() => onNavigate('directory')} style={{ fontSize: 13, padding: '10px 20px' }}>
            ← Back to Tools
          </button>
        </div>
      </div>
    )
  }

  if (isDisabledByTeam) {
    return (
      <div className="page-inner" style={{ maxWidth: 700, textAlign: 'center', padding: '80px 20px' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
        <div className="serif" style={{ fontSize: 22, color: 'var(--text)', marginBottom: 8 }}>CMA Builder is disabled</div>
        <div style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.7 }}>
          Your team admin has turned off CMA Builder. Contact them to enable it.
        </div>
      </div>
    )
  }

  // ── Viewer ──
  if (view === 'view' && activeReport) {
    return (
      <div className="page-inner" style={{ maxWidth: 1100, padding: 0 }}>
        {/* Toolbar */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 20px', borderBottom: '1px solid var(--b1)', flexWrap: 'wrap', gap: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button className="btn-ghost" onClick={() => { setActiveReport(null); setView('list') }}
              style={{ fontSize: 14, padding: '6px 12px' }}>← Back</button>
            <span className="serif" style={{ fontSize: 16, color: 'var(--text)' }}>
              {activeReport.subject_address}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-outline" onClick={() => {
              const w = window.open('', '_blank')
              if (w) { w.document.write(activeReport.html); w.document.close() }
            }} style={{ fontSize: 12, padding: '6px 14px' }}>
              Open in Tab
            </button>
            <button className="btn-gold" onClick={() => {
              const w = window.open('', '_blank')
              if (w) {
                w.document.write(activeReport.html)
                w.document.close()
                setTimeout(() => w.print(), 500)
              }
            }} style={{ fontSize: 12, padding: '6px 14px' }}>
              Print / PDF
            </button>
          </div>
        </div>
        {/* Report iframe */}
        <div style={{ width: '100%', height: 'calc(100vh - 120px)', background: '#fff' }}>
          <iframe
            ref={iframeRef}
            srcDoc={activeReport.html}
            style={{ width: '100%', height: '100%', border: 'none' }}
            title="CMA Report"
          />
        </div>
      </div>
    )
  }

  // ── Create form ──
  if (view === 'create') {
    return (
      <div className="page-inner" style={{ maxWidth: 720 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
          <button className="btn-ghost" onClick={() => setView('list')}
            style={{ fontSize: 14, padding: '6px 12px' }}>← Back</button>
          <div className="serif" style={{ fontSize: 24, color: 'var(--text)' }}>New CMA Report</div>
        </div>

        {error && (
          <div className="card" style={{
            padding: '12px 18px', marginBottom: 16, borderLeft: '3px solid #dc2626',
            background: 'rgba(220,38,38,.06)', color: '#dc2626', fontSize: 13, fontWeight: 600,
          }}>{error}</div>
        )}

        {/* Subject Property */}
        <div className="card" style={{ padding: 24, marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>🏠</span> Subject Property
          </div>
          <div style={{ marginBottom: 12 }}>
            <label className="label" style={{ marginBottom: 4 }}>Property Address</label>
            <input
              className="field-input"
              value={address}
              onChange={e => setAddress(e.target.value)}
              placeholder="123 Main St, Springfield, IL 62701"
              style={{ width: '100%', padding: '11px 14px', fontSize: 14 }}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label className="label" style={{ marginBottom: 4 }}>Property Type</label>
              <select className="field-input" value={propertyType} onChange={e => setPropertyType(e.target.value)}
                style={{ width: '100%', padding: '10px 14px', fontSize: 13 }}>
                <option>Single Family</option>
                <option>Condo</option>
                <option>Townhouse</option>
                <option>Multi-Family</option>
              </select>
            </div>
          </div>
        </div>

        {/* Search Parameters */}
        <div className="card" style={{ padding: 24, marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>🔍</span> Comp Search Parameters
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div>
              <label className="label" style={{ marginBottom: 4 }}>Radius</label>
              <select className="field-input" value={searchRadius} onChange={e => setSearchRadius(Number(e.target.value))}
                style={{ width: '100%', padding: '10px 14px', fontSize: 13 }}>
                <option value={1}>1 mile</option>
                <option value={2}>2 miles</option>
                <option value={3}>3 miles</option>
                <option value={5}>5 miles</option>
              </select>
            </div>
            <div>
              <label className="label" style={{ marginBottom: 4 }}>Days Back</label>
              <select className="field-input" value={daysBack} onChange={e => setDaysBack(Number(e.target.value))}
                style={{ width: '100%', padding: '10px 14px', fontSize: 13 }}>
                <option value={90}>90 days</option>
                <option value={180}>180 days</option>
                <option value={365}>365 days</option>
              </select>
            </div>
            <div>
              <label className="label" style={{ marginBottom: 4 }}>Max Comps</label>
              <select className="field-input" value={maxComps} onChange={e => setMaxComps(Number(e.target.value))}
                style={{ width: '100%', padding: '10px 14px', fontSize: 13 }}>
                <option value={10}>10 comps</option>
                <option value={15}>15 comps</option>
                <option value={20}>20 comps</option>
              </select>
            </div>
          </div>
        </div>

        {/* Report Style */}
        <div className="card" style={{ padding: 24, marginBottom: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>🎨</span> Report Style
          </div>
          {/* Style picker */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            {STYLES.map(s => (
              <button key={s.value} onClick={() => setStyle(s.value)} style={{
                padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                background: style === s.value ? 'var(--gold)' : 'var(--surface)',
                color: style === s.value ? '#fff' : 'var(--muted)',
                border: `1px solid ${style === s.value ? 'var(--gold)' : 'var(--b2)'}`,
                transition: 'all .15s',
              }}>
                {s.label}
              </button>
            ))}
          </div>
          {/* Theme toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>Theme:</span>
            <button onClick={() => setCmaTheme(t => t === 'light' ? 'dark' : 'light')} style={{
              width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', position: 'relative',
              background: cmaTheme === 'dark' ? 'var(--gold)' : 'var(--b2)', transition: 'background .2s',
            }}>
              <div style={{
                width: 18, height: 18, borderRadius: 9, background: '#fff',
                position: 'absolute', top: 3, left: cmaTheme === 'dark' ? 23 : 3,
                transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,.2)',
              }} />
            </button>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>{cmaTheme === 'dark' ? 'Dark' : 'Light'}</span>
          </div>
          {/* Color presets */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {COLOR_PRESETS.map(c => (
              <button key={c.value} onClick={() => setColorScheme(c.value)} title={c.label} style={{
                width: 32, height: 32, borderRadius: 8, border: `2px solid ${colorScheme === c.value ? '#fff' : 'transparent'}`,
                background: c.value, cursor: 'pointer', outline: colorScheme === c.value ? `2px solid ${c.value}` : 'none',
                transition: 'all .15s',
              }} />
            ))}
          </div>
        </div>

        <button className="btn-gold" onClick={generateCMA}
          disabled={generating || !address.trim()}
          style={{ width: '100%', fontSize: 15, padding: '14px 0', fontWeight: 700 }}>
          {generating ? 'Generating CMA Report...' : 'Generate CMA Report'}
        </button>
      </div>
    )
  }

  // ── List view (default) ──
  return (
    <div className="page-inner" style={{ maxWidth: 900 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <span style={{ fontSize: 24 }}>📊</span>
            <div className="serif" style={{ fontSize: 26, color: 'var(--text)' }}>CMA Builder</div>
            <span style={{
              fontSize: 9, padding: '2px 8px', borderRadius: 4, fontWeight: 700,
              background: 'rgba(5,150,105,.1)', color: '#059669', border: '1px solid rgba(5,150,105,.25)',
              fontFamily: "'JetBrains Mono',monospace",
            }}>ADD-ON ACTIVE</span>
          </div>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>
            AI-powered Comparative Market Analysis reports
          </div>
        </div>
        <button className="btn-gold" onClick={() => { resetForm(); setView('create') }}
          style={{ fontSize: 13, padding: '10px 22px' }}>
          + New CMA
        </button>
      </div>

      {error && (
        <div className="card" style={{
          padding: '12px 18px', marginBottom: 16, borderLeft: '3px solid #dc2626',
          background: 'rgba(220,38,38,.06)', color: '#dc2626', fontSize: 13, fontWeight: 600,
        }}>{error}</div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0' }}><Loader /></div>
      ) : reports.length === 0 ? (
        <div className="card" style={{ padding: 48, textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📊</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
            No CMA reports yet
          </div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20, lineHeight: 1.6 }}>
            Enter a property address to generate an AI-powered comp analysis with pricing strategy.
          </div>
          <button className="btn-gold" onClick={() => { resetForm(); setView('create') }}
            style={{ fontSize: 13, padding: '10px 24px' }}>
            Create Your First CMA
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
          {reports.map(r => {
            const isGen = r.status === 'generating'
            const isFailed = r.status === 'failed'
            const price = r.pricing_strategy?.recommended_price
            const dateStr = new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            return (
              <div key={r.id} className="card" style={{
                padding: 20, display: 'flex', flexDirection: 'column', gap: 10,
                opacity: isFailed ? 0.5 : 1,
              }}>
                {/* Address + status */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{
                      fontSize: 9, padding: '2px 7px', borderRadius: 4, fontWeight: 700,
                      fontFamily: "'JetBrains Mono',monospace",
                      background: isGen ? 'rgba(217,119,6,.1)' : isFailed ? 'rgba(220,38,38,.1)' : 'rgba(5,150,105,.1)',
                      color: isGen ? '#d97706' : isFailed ? '#dc2626' : '#059669',
                      border: `1px solid ${isGen ? 'rgba(217,119,6,.25)' : isFailed ? 'rgba(220,38,38,.25)' : 'rgba(5,150,105,.25)'}`,
                    }}>
                      {isGen ? 'GENERATING' : isFailed ? 'FAILED' : 'READY'}
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--dim)' }}>{dateStr}</span>
                  </div>
                  <div className="serif" style={{ fontSize: 15, color: 'var(--text)', fontWeight: 600, lineHeight: 1.3 }}>
                    {r.subject_address}
                  </div>
                  {price && (
                    <div style={{ fontSize: 12, color: 'var(--gold2)', fontWeight: 600, marginTop: 4 }}>
                      ${Number(price).toLocaleString()}
                    </div>
                  )}
                </div>

                {/* Progress bar for generating */}
                {isGen && (
                  <div style={{ height: 3, background: 'var(--b1)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', width: '60%', borderRadius: 2,
                      background: 'linear-gradient(90deg, #d97706, #f59e0b)',
                      animation: 'cma-progress 2s ease-in-out infinite',
                    }} />
                    <style>{`@keyframes cma-progress { 0%,100%{width:30%;margin-left:0} 50%{width:60%;margin-left:40%} }`}</style>
                  </div>
                )}

                {/* Actions */}
                {!isGen && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
                    {!isFailed && (
                      <button className="btn-outline" onClick={() => loadReport(r.id)}
                        style={{ fontSize: 11, padding: '6px 14px', flex: 1 }}>
                        View
                      </button>
                    )}
                    <button className="btn-ghost" onClick={() => setDeleteConfirm(r.id)}
                      style={{ fontSize: 11, padding: '6px 12px', color: 'var(--dim)' }}>
                      Delete
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteConfirm && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setDeleteConfirm(null) }}>
          <div className="modal-card" style={{ maxWidth: 380, padding: 28 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>Delete CMA Report?</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20, lineHeight: 1.6 }}>
              This action cannot be undone.
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn-ghost" onClick={() => setDeleteConfirm(null)} style={{ fontSize: 13, padding: '8px 16px' }}>Cancel</button>
              <button onClick={() => deleteReport(deleteConfirm)} style={{
                fontSize: 13, padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer',
                background: '#dc2626', color: '#fff', fontWeight: 700,
              }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
