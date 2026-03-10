import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import { Loader } from '../design'
import { isActiveBilling, isTeamMember, isPlatformAdmin } from '../lib/plans'

async function getFreshToken() {
  const { data: { session } } = await supabase.auth.getSession()
  if (session?.access_token) {
    const expiresAt = session.expires_at ?? 0
    if (expiresAt - Math.floor(Date.now() / 1000) < 60) {
      const { data } = await supabase.auth.refreshSession()
      return data.session?.access_token || null
    }
    return session.access_token
  }
  const { data } = await supabase.auth.refreshSession()
  return data.session?.access_token || null
}

const STYLES = [
  { value: 'modern',  label: 'Modern — clean gradients, rounded' },
  { value: 'classic', label: 'Classic — traditional, structured' },
  { value: 'minimal', label: 'Minimal — whitespace, content-focused' },
  { value: 'bold',    label: 'Bold — large text, high contrast' },
]
const THEMES = [
  { value: 'light', label: 'Light' },
  { value: 'dark',  label: 'Dark' },
]
const FONTS = [
  { value: 'sans-serif', label: 'Sans-serif (Clean)' },
  { value: 'serif',      label: 'Serif (Elegant)' },
  { value: 'monospace',  label: 'Monospace (Technical)' },
]
const COLOR_PRESETS = [
  { value: '#2563eb', label: 'Blue' },
  { value: '#d97706', label: 'Gold' },
  { value: '#059669', label: 'Green' },
  { value: '#7c3aed', label: 'Purple' },
  { value: '#dc2626', label: 'Red' },
  { value: '#374151', label: 'Neutral' },
]

const STYLE_COLORS = {
  modern: '#3b82f6', classic: '#6b7280', minimal: '#94a3b8', bold: '#ef4444',
}
const LEGACY_COLOR_MAP = {
  blue: '#2563eb', gold: '#d97706', green: '#059669', purple: '#7c3aed', red: '#dc2626', neutral: '#374151',
}
const COLOR_HEX = {
  blue: '#2563eb', gold: '#d97706', green: '#059669', purple: '#8b5cf6', red: '#dc2626', neutral: '#6b7280',
}

export default function PresentationsPage({ onNavigate, theme, onToggleTheme, onPresentMode }) {
  const { user, profile } = useAuth()
  const [view, setView]           = useState('list')     // 'list' | 'create' | 'present'
  const [presentations, setPresentations] = useState([])
  const [loading, setLoading]     = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError]         = useState('')
  const [activePresentation, setActivePresentation] = useState(null)
  const [deleteConfirm, setDeleteConfirm] = useState(null)

  // Form state
  const [title, setTitle]         = useState('Untitled Presentation')
  const [style, setStyle]         = useState('modern')
  const [presTheme, setPresTheme] = useState('light')
  const [font, setFont]           = useState('sans-serif')
  const [colorScheme, setColorScheme] = useState('#2563eb')
  const [backgroundImage, setBackgroundImage] = useState('')  // URL or empty
  const [content, setContent]     = useState('')
  const [editingId, setEditingId] = useState(null) // presentation id when re-generating

  const generatingRef = useRef(false)
  const iframeRef = useRef(null)

  // Gate checks
  const hasBilling = isPlatformAdmin(profile) || isActiveBilling(profile?.billing_status) || isTeamMember(profile, user?.id)
  const addonActive = isPlatformAdmin(profile) ||
    profile?.teams?.presentations_addon_status === 'active' ||
    profile?.teams?.presentations_addon_status === 'trialing'
  const isDisabledByTeam = profile?.teams?.team_prefs?.ai_tools?.presentations_enabled === false
  const teamBackgrounds = profile?.teams?.team_prefs?.ai_tools?.presentation_backgrounds || []

  // Fetch presentations
  useEffect(() => {
    if (!user?.id) return
    supabase.from('presentations')
      .select('id, title, style, theme, font, color_scheme, slide_count, created_at, updated_at')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(100)
      .then(({ data }) => {
        setPresentations(data || [])
        setLoading(false)
      })
  }, [user?.id])

  function resetForm() {
    setTitle('Untitled Presentation')
    setStyle('modern')
    setPresTheme('light')
    setFont('sans-serif')
    setColorScheme('blue')
    setContent('')
    setEditingId(null)
    setActivePresentation(null)
    setError('')
  }

  function openCreate() {
    resetForm()
    setView('create')
  }

  function openRegenerate(pres) {
    setTitle(pres.title)
    setStyle(pres.style)
    setPresTheme(pres.theme)
    setFont(pres.font)
    setColorScheme(LEGACY_COLOR_MAP[pres.color_scheme] || pres.color_scheme || '#2563eb')
    setContent(pres.content || '')
    setEditingId(pres.id)
    setActivePresentation(null)
    setView('create')
  }

  async function loadAndPresent(presId) {
    const { data } = await supabase
      .from('presentations')
      .select('id, title, html')
      .eq('id', presId)
      .eq('user_id', user.id)
      .single()
    if (data?.html) {
      setActivePresentation(data)
      setView('present')
    }
  }

  const generatePresentation = useCallback(async () => {
    if (generatingRef.current || !content.trim()) return
    generatingRef.current = true
    setGenerating(true)
    setError('')

    try {
      const token = await getFreshToken()
      if (!token) throw new Error('Not authenticated')

      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-presentation`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            title, style, theme: presTheme, font, colorScheme, content,
            backgroundImage: backgroundImage || null,
            presentationId: editingId || null,
          }),
        }
      )

      const data = await resp.json()
      if (!resp.ok) {
        if (data.error === 'credits_exhausted') {
          setError(`You've used all ${data.limit} AI credits this month. Credits reset next month.`)
        } else if (data.error === 'addon_required') {
          setError('The Presentation Builder add-on is required. Ask your team owner to subscribe.')
        } else {
          throw new Error(data.message || data.error || `HTTP ${resp.status}`)
        }
        return
      }

      setActivePresentation(data)

      // Refresh list
      const { data: updated } = await supabase.from('presentations')
        .select('id, title, style, theme, font, color_scheme, slide_count, created_at, updated_at')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(100)
      setPresentations(updated || [])

      if (editingId) setEditingId(data.id)
    } catch (err) {
      console.error('Generation error:', err)
      setError(err.message || 'Failed to generate presentation. Please try again.')
    } finally {
      setGenerating(false)
      generatingRef.current = false
    }
  }, [title, style, presTheme, font, colorScheme, content, editingId, user?.id])

  async function deletePresentation(id) {
    const { error: err } = await supabase.from('presentations').delete().eq('id', id).eq('user_id', user.id)
    if (!err) {
      setPresentations(p => p.filter(x => x.id !== id))
      setDeleteConfirm(null)
    }
  }

  // Notify parent when entering/exiting present mode (hides AI chat widget)
  useEffect(() => {
    onPresentMode?.(view === 'present')
  }, [view, onPresentMode])

  // Keyboard: ESC exits present mode, arrow keys forwarded to iframe
  useEffect(() => {
    if (view !== 'present') return
    function handleKey(e) {
      if (e.key === 'Escape') { setView('list'); return }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault()
        iframeRef.current?.contentWindow?.postMessage({ type: 'keydown', key: e.key }, '*')
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [view])

  // Add-on checkout
  async function handleAddonCheckout() {
    setError('')
    try {
      const token = await getFreshToken()
      if (!token) throw new Error('Not authenticated')
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-addon-checkout`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ addonId: 'presentations', isAnnual: false, returnUrl: window.location.origin }),
        }
      )
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error || 'Checkout failed')
      if (data.url) window.location.href = data.url
    } catch (err) {
      setError(err.message || 'Could not start checkout.')
    }
  }

  if (loading) {
    return <div className="page-inner" style={{ maxWidth: 960 }}><Loader /></div>
  }

  // ── Present mode (fullscreen) ─────────────────────────────────────────
  if (view === 'present' && activePresentation?.html) {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 9999, background: '#000',
      }}>
        <button onClick={() => setView('list')} style={{
          position: 'fixed', top: 16, right: 16, zIndex: 10000,
          background: 'rgba(0,0,0,.7)', border: '1px solid rgba(255,255,255,.2)',
          color: '#fff', borderRadius: 8, padding: '8px 16px', cursor: 'pointer',
          fontSize: 12, fontWeight: 700, backdropFilter: 'blur(8px)',
        }}>
          ESC Exit
        </button>
        <iframe
          ref={iframeRef}
          srcDoc={activePresentation.html}
          style={{ width: '100%', height: '100%', border: 'none' }}
          sandbox="allow-scripts allow-same-origin"
          title="Presentation"
        />
      </div>
    )
  }

  return (
    <div className="page-inner" style={{ maxWidth: 960 }}>

      {/* ── Header ───────────────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <button onClick={() => onNavigate('directory')} style={{
            background: 'none', border: '1px solid var(--b2)', borderRadius: 8,
            color: 'var(--muted)', cursor: 'pointer', padding: '6px 12px', fontSize: 12,
          }}>
            ← Tools
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
            <span style={{ fontSize: 24 }}>🎯</span>
            <div className="serif" style={{ fontSize: 24, color: 'var(--text)' }}>Presentation Builder</div>
            <span style={{
              fontSize: 9, padding: '2px 7px', borderRadius: 4, fontWeight: 700,
              background: 'rgba(217,119,6,.12)', color: '#d97706', border: '1px solid rgba(217,119,6,.25)',
              fontFamily: "'JetBrains Mono',monospace", letterSpacing: .5,
            }}>ADD-ON</span>
          </div>
        </div>
      </div>

      {error && (
        <div className="card" style={{
          padding: '14px 20px', marginBottom: 18, borderLeft: '3px solid #dc2626',
          background: 'rgba(220,38,38,.06)', color: '#dc2626', fontSize: 13, fontWeight: 600,
        }}>
          {error}
        </div>
      )}

      {/* ── Gate: Not subscribed ─────────────────────── */}
      {!hasBilling && (
        <div className="card" style={{ padding: 40, textAlign: 'center', margin: '40px 0' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
          <div className="serif" style={{ fontSize: 22, color: 'var(--text)', marginBottom: 8 }}>
            Subscription required
          </div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 24, lineHeight: 1.6 }}>
            Subscribe to a Team or Brokerage plan to use the Presentation Builder.
          </div>
          <button className="btn-gold" style={{ padding: '12px 28px', fontSize: 14 }}
            onClick={() => onNavigate('billing')}>
            View Plans
          </button>
        </div>
      )}

      {/* ── Gate: Add-on not purchased ───────────────── */}
      {hasBilling && !addonActive && (
        <div className="card" style={{ padding: 40, textAlign: 'center', margin: '40px 0' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🎯</div>
          <div className="serif" style={{ fontSize: 22, color: 'var(--text)', marginBottom: 8 }}>
            Presentation Builder Add-on
          </div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 24, lineHeight: 1.6 }}>
            {isTeamMember(profile, user?.id)
              ? 'The Presentation Builder add-on has not been activated for your team. Contact your team owner to subscribe.'
              : 'AI-generated listing presentations for your team. Choose styles, enter content, and present in fullscreen.'}
          </div>
          {!isTeamMember(profile, user?.id) && (
            <button className="btn-gold" style={{ padding: '12px 28px', fontSize: 14 }}
              onClick={handleAddonCheckout}>
              Subscribe to Add-on
            </button>
          )}
        </div>
      )}

      {/* ── Gate: Disabled by team ───────────────────── */}
      {hasBilling && addonActive && isDisabledByTeam && (
        <div className="card" style={{ padding: 40, textAlign: 'center', margin: '40px 0' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🚫</div>
          <div className="serif" style={{ fontSize: 22, color: 'var(--text)', marginBottom: 8 }}>
            Presentation Builder is disabled
          </div>
          <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
            Your team owner has disabled the Presentation Builder. Contact them to re-enable access.
          </div>
        </div>
      )}

      {/* ── Main content (gated) ─────────────────────── */}
      {hasBilling && addonActive && !isDisabledByTeam && (
        <>
          {/* ── List View ────────────────────────────────── */}
          {view === 'list' && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                  {presentations.length} presentation{presentations.length !== 1 ? 's' : ''}
                </div>
                <button className="btn-gold" onClick={openCreate}
                  style={{ padding: '10px 22px', fontSize: 13 }}>
                  + New Presentation
                </button>
              </div>

              {presentations.length === 0 ? (
                <div className="card" style={{ padding: 48, textAlign: 'center' }}>
                  <div style={{ fontSize: 48, marginBottom: 16 }}>🎯</div>
                  <div className="serif" style={{ fontSize: 20, color: 'var(--text)', marginBottom: 8 }}>
                    No presentations yet
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 24, lineHeight: 1.6 }}>
                    Create your first AI-generated presentation — choose a style, enter your content, and the AI builds the slides.
                  </div>
                  <button className="btn-gold" onClick={openCreate}
                    style={{ padding: '12px 28px', fontSize: 14 }}>
                    Create Presentation
                  </button>
                </div>
              ) : (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                  gap: 14,
                }}>
                  {presentations.map(pres => {
                    const sc = pres.color_scheme?.startsWith('#') ? pres.color_scheme : (COLOR_HEX[pres.color_scheme] || '#6b7280')
                    return (
                      <div key={pres.id} className="card" style={{
                        padding: 22, display: 'flex', flexDirection: 'column',
                        borderTop: `3px solid ${sc}`,
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                          <div className="serif" style={{ fontSize: 16, color: 'var(--text)', fontWeight: 700, lineHeight: 1.3, flex: 1 }}>
                            {pres.title}
                          </div>
                          <button onClick={() => setDeleteConfirm(pres.id)} className="btn-del"
                            title="Delete" style={{ fontSize: 12, flexShrink: 0 }}>
                            🗑
                          </button>
                        </div>

                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                          <span style={{
                            fontSize: 9, padding: '2px 7px', borderRadius: 4, fontWeight: 700,
                            background: `${STYLE_COLORS[pres.style] || '#6b7280'}18`,
                            color: STYLE_COLORS[pres.style] || '#6b7280',
                            border: `1px solid ${STYLE_COLORS[pres.style] || '#6b7280'}30`,
                            fontFamily: "'JetBrains Mono',monospace",
                          }}>
                            {pres.style?.toUpperCase()}
                          </span>
                          <span style={{
                            fontSize: 9, padding: '2px 7px', borderRadius: 4, fontWeight: 700,
                            background: `${sc}18`, color: sc, border: `1px solid ${sc}30`,
                            fontFamily: "'JetBrains Mono',monospace",
                          }}>
                            {pres.color_scheme?.startsWith('#') ? pres.color_scheme.toUpperCase() : pres.color_scheme?.toUpperCase()}
                          </span>
                          <span style={{
                            fontSize: 9, padding: '2px 7px', borderRadius: 4, fontWeight: 600,
                            background: 'var(--b1)', color: 'var(--muted)',
                            fontFamily: "'JetBrains Mono',monospace",
                          }}>
                            {pres.slide_count} slides
                          </span>
                        </div>

                        <div style={{ fontSize: 11, color: 'var(--dim)', marginBottom: 16,
                          fontFamily: "'JetBrains Mono',monospace" }}>
                          {new Date(pres.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </div>

                        <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
                          <button className="btn-primary" onClick={() => loadAndPresent(pres.id)}
                            style={{ flex: 1, fontSize: 12, padding: '8px 0' }}>
                            Present
                          </button>
                          <button className="btn-outline" onClick={() => {
                            // Load full content then open re-generate form
                            supabase.from('presentations')
                              .select('*')
                              .eq('id', pres.id)
                              .single()
                              .then(({ data }) => { if (data) openRegenerate(data) })
                          }}
                            style={{ flex: 1, fontSize: 12, padding: '8px 0' }}>
                            Edit
                          </button>
                        </div>

                        {/* Delete confirmation */}
                        {deleteConfirm === pres.id && (
                          <div style={{
                            marginTop: 12, padding: '10px 14px', borderRadius: 8,
                            background: 'rgba(220,38,38,.06)', border: '1px solid rgba(220,38,38,.2)',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                          }}>
                            <span style={{ fontSize: 12, color: '#dc2626', fontWeight: 600 }}>Delete?</span>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button onClick={() => deletePresentation(pres.id)}
                                style={{
                                  fontSize: 11, padding: '4px 12px', borderRadius: 6, cursor: 'pointer',
                                  background: '#dc2626', color: '#fff', border: 'none', fontWeight: 700,
                                }}>
                                Yes
                              </button>
                              <button onClick={() => setDeleteConfirm(null)}
                                style={{
                                  fontSize: 11, padding: '4px 12px', borderRadius: 6, cursor: 'pointer',
                                  background: 'transparent', color: 'var(--muted)', border: '1px solid var(--b2)', fontWeight: 600,
                                }}>
                                No
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}

          {/* ── Create / Edit View ───────────────────────── */}
          {view === 'create' && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                <button onClick={() => { resetForm(); setView('list') }} style={{
                  background: 'none', border: '1px solid var(--b2)', borderRadius: 8,
                  color: 'var(--muted)', cursor: 'pointer', padding: '6px 12px', fontSize: 12,
                }}>
                  ← Back
                </button>
                <div className="serif" style={{ fontSize: 18, color: 'var(--text)' }}>
                  {editingId ? 'Re-generate Presentation' : 'New Presentation'}
                </div>
              </div>

              <div className="card" style={{ padding: 24, marginBottom: 20 }}>
                {/* Title */}
                <div style={{ marginBottom: 18 }}>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--muted)',
                    letterSpacing: .8, textTransform: 'uppercase', marginBottom: 6 }}>
                    Title
                  </label>
                  <input
                    className="field-input"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="Presentation title"
                    style={{ width: '100%', padding: '10px 14px', fontSize: 14 }}
                  />
                </div>

                {/* Dropdowns row */}
                <div style={{
                  display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                  gap: 14, marginBottom: 18,
                }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--muted)',
                      letterSpacing: .8, textTransform: 'uppercase', marginBottom: 6 }}>
                      Style
                    </label>
                    <select className="field-input" value={style} onChange={e => setStyle(e.target.value)}
                      style={{ width: '100%', padding: '10px 14px', fontSize: 13 }}>
                      {STYLES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--muted)',
                      letterSpacing: .8, textTransform: 'uppercase', marginBottom: 6 }}>
                      Theme
                    </label>
                    <select className="field-input" value={presTheme} onChange={e => setPresTheme(e.target.value)}
                      style={{ width: '100%', padding: '10px 14px', fontSize: 13 }}>
                      {THEMES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--muted)',
                      letterSpacing: .8, textTransform: 'uppercase', marginBottom: 6 }}>
                      Font
                    </label>
                    <select className="field-input" value={font} onChange={e => setFont(e.target.value)}
                      style={{ width: '100%', padding: '10px 14px', fontSize: 13 }}>
                      {FONTS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--muted)',
                      letterSpacing: .8, textTransform: 'uppercase', marginBottom: 6 }}>
                      Brand Color
                    </label>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                      {COLOR_PRESETS.map(c => (
                        <button key={c.value} title={c.label} onClick={() => setColorScheme(c.value)}
                          style={{
                            width: 28, height: 28, borderRadius: '50%', border: colorScheme === c.value ? '2.5px solid var(--fg)' : '2px solid transparent',
                            background: c.value, cursor: 'pointer', padding: 0, outline: 'none',
                            boxShadow: colorScheme === c.value ? `0 0 0 2px var(--bg), 0 0 0 4px ${c.value}` : 'none',
                            transition: 'all .15s',
                          }} />
                      ))}
                      <div style={{ position: 'relative', width: 28, height: 28, flexShrink: 0 }}>
                        <input type="color" value={colorScheme.startsWith('#') ? colorScheme : '#2563eb'}
                          onChange={e => setColorScheme(e.target.value)}
                          style={{
                            position: 'absolute', inset: 0, width: 28, height: 28, padding: 0, border: 'none',
                            borderRadius: '50%', cursor: 'pointer', background: 'none',
                          }}
                          title="Pick custom color" />
                        <div style={{
                          position: 'absolute', inset: 0, borderRadius: '50%', pointerEvents: 'none',
                          background: 'conic-gradient(red,yellow,lime,aqua,blue,magenta,red)',
                          border: !COLOR_PRESETS.some(p => p.value === colorScheme) ? '2.5px solid var(--fg)' : '2px solid transparent',
                          boxShadow: !COLOR_PRESETS.some(p => p.value === colorScheme) ? `0 0 0 2px var(--bg), 0 0 0 4px ${colorScheme}` : 'none',
                        }} />
                      </div>
                      <input type="text" value={colorScheme} onChange={e => {
                          const v = e.target.value
                          if (/^#[0-9a-fA-F]{0,6}$/.test(v)) setColorScheme(v)
                        }}
                        onBlur={() => { if (!/^#[0-9a-fA-F]{6}$/.test(colorScheme)) setColorScheme('#2563eb') }}
                        style={{
                          width: 80, padding: '6px 8px', fontSize: 12, fontFamily: 'monospace',
                          border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg)',
                          color: 'var(--fg)', textTransform: 'uppercase',
                        }}
                        placeholder="#2563EB"
                        maxLength={7} />
                    </div>
                  </div>
                </div>

                {/* Background Image selector */}
                <div style={{ marginBottom: 18 }}>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--muted)',
                    letterSpacing: .8, textTransform: 'uppercase', marginBottom: 6 }}>
                    Slide Background <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
                  </label>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <button onClick={() => setBackgroundImage('')}
                      style={{
                        width: 72, height: 48, borderRadius: 8, cursor: 'pointer', position: 'relative',
                        border: !backgroundImage ? `2.5px solid ${colorScheme.startsWith('#') ? colorScheme : '#2563eb'}` : '1.5px solid var(--border)',
                        background: !backgroundImage ? `${(colorScheme.startsWith('#') ? colorScheme : '#2563eb')}10` : 'var(--bg)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 10, color: !backgroundImage ? (colorScheme.startsWith('#') ? colorScheme : '#2563eb') : 'var(--muted)', fontWeight: 600,
                        boxShadow: !backgroundImage ? `0 0 0 1px ${(colorScheme.startsWith('#') ? colorScheme : '#2563eb')}40` : 'none',
                        transition: 'all .15s',
                      }}>
                      None
                    </button>
                    {teamBackgrounds.map((bg, idx) => {
                      const isSelected = backgroundImage === bg
                      const accent = colorScheme.startsWith('#') ? colorScheme : '#2563eb'
                      return (
                        <button key={idx} onClick={() => setBackgroundImage(bg)}
                          style={{
                            width: 72, height: 48, borderRadius: 8, cursor: 'pointer', padding: 0, overflow: 'hidden',
                            position: 'relative',
                            border: isSelected ? `2.5px solid ${accent}` : '1.5px solid var(--border)',
                            boxShadow: isSelected ? `0 0 0 1px ${accent}40` : 'none',
                            background: 'none', transition: 'all .15s',
                          }}>
                          <img src={bg} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block',
                            opacity: isSelected ? 1 : 0.7, transition: 'opacity .15s' }} />
                          {isSelected && (
                            <div style={{
                              position: 'absolute', top: 3, right: 3, width: 16, height: 16, borderRadius: '50%',
                              background: accent, display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 9, color: '#fff', fontWeight: 700, lineHeight: 1,
                            }}>✓</div>
                          )}
                        </button>
                      )
                    })}
                    {teamBackgrounds.length === 0 && (
                      <span style={{ fontSize: 11, color: 'var(--muted)', fontStyle: 'italic' }}>
                        No backgrounds uploaded yet — team owner can add them in Team Settings → AI Tools
                      </span>
                    )}
                  </div>
                </div>

                {/* Content textarea */}
                <div style={{ marginBottom: 18 }}>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--muted)',
                    letterSpacing: .8, textTransform: 'uppercase', marginBottom: 6 }}>
                    Slide Content
                  </label>
                  <textarea
                    className="field-input"
                    value={content}
                    onChange={e => setContent(e.target.value)}
                    placeholder={"Enter your slide content here.\n\nEach paragraph or section will become its own slide.\nUse headers, bullet points, and clear structure for best results.\n\nExample:\n\nWelcome & Introduction\n- Your name and brokerage\n- What you'll cover today\n\nMarket Overview\n- Current market conditions\n- Key statistics and trends\n\nProperty Highlights\n- Address, price, key features\n- Photos and selling points"}
                    rows={10}
                    style={{
                      width: '100%', padding: '12px 14px', fontSize: 13, lineHeight: 1.6,
                      minHeight: 200, resize: 'vertical',
                    }}
                  />
                  <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 4,
                    fontFamily: "'JetBrains Mono',monospace" }}>
                    {content.length}/8000 characters
                  </div>
                </div>

                {/* Generate button */}
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    className="btn-gold"
                    onClick={generatePresentation}
                    disabled={generating || !content.trim()}
                    style={{
                      padding: '12px 28px', fontSize: 14,
                      opacity: generating || !content.trim() ? 0.6 : 1,
                      cursor: generating || !content.trim() ? 'not-allowed' : 'pointer',
                    }}>
                    {generating ? 'Generating...' : editingId ? 'Re-generate' : 'Generate Presentation'}
                  </button>
                </div>
              </div>

              {/* ── Generated preview ────────────────────── */}
              {activePresentation?.html && (
                <div className="card" style={{ padding: 24 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                    <div>
                      <div className="serif" style={{ fontSize: 16, color: 'var(--text)' }}>Preview</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                        {activePresentation.slideCount} slides generated
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn-primary" onClick={() => setView('present')}
                        style={{ padding: '8px 18px', fontSize: 12 }}>
                        Present Fullscreen
                      </button>
                      <button className="btn-outline" onClick={() => { resetForm(); setView('list') }}
                        style={{ padding: '8px 18px', fontSize: 12 }}>
                        Save & Close
                      </button>
                    </div>
                  </div>
                  <div style={{
                    border: '1px solid var(--b2)', borderRadius: 10, overflow: 'hidden',
                    height: 400, background: '#000',
                  }}>
                    <iframe
                      srcDoc={activePresentation.html}
                      style={{ width: '100%', height: '100%', border: 'none' }}
                      sandbox="allow-scripts allow-same-origin"
                      title="Preview"
                    />
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      <div style={{ height: 48 }} />
    </div>
  )
}
