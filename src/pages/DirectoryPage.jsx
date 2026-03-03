import { useState } from 'react'
import { CSS, Wordmark, ThemeToggle } from '../design'
import { useAuth } from '../lib/AuthContext'

const AI_TOOLS = [
  {
    id: 'ai-assistant',
    name: 'AI Assistant',
    icon: '🤖',
    category: 'AI',
    catColor: '#8b5cf6',
    catBg: 'rgba(139,92,246,.1)',
    catBorder: 'rgba(139,92,246,.25)',
    desc: 'AI-powered real estate coaching — listing strategy, pipeline review, comp research, and goal tracking.',
    page: 'ai-assistant',
  },
]

const CALCULATORS = [
  {
    id: 'apod',
    name: 'APOD Calculator',
    icon: '🏢',
    category: 'Calculators',
    catColor: '#d97706',
    catBg: 'rgba(217,119,6,.1)',
    catBorder: 'rgba(217,119,6,.25)',
    desc: 'Annual Property Operating Data — NOI, cap rate, mortgage DSCR, and Excel export.',
    page: 'apod',
  },
]

// ── Master list of all available external tools ─────────────────────────────
// Team leaders and solo agents can toggle which of these show in their directory.
export const ALL_APPS = [
  {
    id: 'fub',
    name: 'Follow Up Boss',
    icon: '🏠',
    category: 'CRM',
    catColor: '#0ea5e9',
    catBg: 'rgba(14,165,233,.1)',
    catBorder: 'rgba(14,165,233,.25)',
    desc: 'Team CRM for managing leads, contacts, tasks, and follow-up sequences.',
    url: 'https://theoperativegroup.followupboss.com/',
    display: 'theoperativegroup.followupboss.com',
  },
  {
    id: 'redx',
    name: 'REDX',
    icon: '📞',
    category: 'Lead Gen',
    catColor: '#f43f5e',
    catBg: 'rgba(244,63,94,.1)',
    catBorder: 'rgba(244,63,94,.25)',
    desc: 'Expired listings, FSBOs, pre-foreclosures, and power dialer for prospecting.',
    url: 'https://www.redx.com',
    display: 'redx.com',
  },
  {
    id: 'skyslope',
    name: 'SkySlope',
    icon: '📋',
    category: 'Transactions',
    catColor: '#10b981',
    catBg: 'rgba(16,185,129,.1)',
    catBorder: 'rgba(16,185,129,.25)',
    desc: 'Transaction management, compliance documents, and digital signatures.',
    url: 'https://skyslope.com',
    display: 'skyslope.com',
  },
  {
    id: 'rmls',
    name: 'RMLS',
    icon: '🔍',
    category: 'MLS',
    catColor: '#8b5cf6',
    catBg: 'rgba(139,92,246,.1)',
    catBorder: 'rgba(139,92,246,.25)',
    desc: 'Regional Multiple Listing Service — search, manage, and enter listings.',
    url: 'https://www.rmlsweb.com',
    display: 'rmlsweb.com',
  },
  {
    id: 'gdrive',
    name: 'Google Drive',
    icon: '📁',
    category: 'Productivity',
    catColor: '#f59e0b',
    catBg: 'rgba(245,158,11,.1)',
    catBorder: 'rgba(245,158,11,.25)',
    desc: 'Team file storage, shared documents, spreadsheets, and resources.',
    url: 'https://drive.google.com',
    display: 'drive.google.com',
  },
  {
    id: 'gmail',
    name: 'Gmail',
    icon: '✉️',
    category: 'Productivity',
    catColor: '#f59e0b',
    catBg: 'rgba(245,158,11,.1)',
    catBorder: 'rgba(245,158,11,.25)',
    desc: 'Team email, client communication, and inbox management.',
    url: 'https://mail.google.com',
    display: 'gmail.com',
  },
  {
    id: 'zillow',
    name: 'Zillow',
    icon: '🏡',
    category: 'Research',
    catColor: '#38bdf8',
    catBg: 'rgba(56,189,248,.1)',
    catBorder: 'rgba(56,189,248,.25)',
    desc: 'Property search, Zestimates, market trends, and consumer-facing listings.',
    url: 'https://www.zillow.com',
    display: 'zillow.com',
  },
  {
    id: 'rpr',
    name: 'RPR',
    icon: '📊',
    category: 'Research',
    catColor: '#38bdf8',
    catBg: 'rgba(56,189,248,.1)',
    catBorder: 'rgba(56,189,248,.25)',
    desc: 'Realtors Property Resource — in-depth property data, valuations, and reports.',
    url: 'https://www.narrpr.com',
    display: 'narrpr.com',
  },
  {
    id: 'ylopo',
    name: 'Ylopo Stars',
    icon: '⭐',
    category: 'Lead Gen',
    catColor: '#f43f5e',
    catBg: 'rgba(244,63,94,.1)',
    catBorder: 'rgba(244,63,94,.25)',
    desc: 'Ylopo Stars portal — digital advertising, lead gen, and marketing performance dashboard.',
    url: 'https://stars.ylopo.com/auth',
    display: 'stars.ylopo.com',
  },
  {
    id: 'canva',
    name: 'Canva',
    icon: '🎨',
    category: 'Productivity',
    catColor: '#f59e0b',
    catBg: 'rgba(245,158,11,.1)',
    catBorder: 'rgba(245,158,11,.25)',
    desc: 'Design marketing flyers, social media posts, and listing presentations.',
    url: 'https://www.canva.com',
    display: 'canva.com',
  },
  {
    id: 'dotloop',
    name: 'dotloop',
    icon: '🔄',
    category: 'Transactions',
    catColor: '#10b981',
    catBg: 'rgba(16,185,129,.1)',
    catBorder: 'rgba(16,185,129,.25)',
    desc: 'Transaction management, e-signatures, and compliance workflows.',
    url: 'https://www.dotloop.com',
    display: 'dotloop.com',
  },
  {
    id: 'kvcore',
    name: 'kvCORE',
    icon: '💡',
    category: 'CRM',
    catColor: '#0ea5e9',
    catBg: 'rgba(14,165,233,.1)',
    catBorder: 'rgba(14,165,233,.25)',
    desc: 'Real estate platform with CRM, IDX website, and lead generation tools.',
    url: 'https://kvcore.com',
    display: 'kvcore.com',
  },
  {
    id: 'realtor',
    name: 'Realtor.com',
    icon: '🏘️',
    category: 'Research',
    catColor: '#38bdf8',
    catBg: 'rgba(56,189,248,.1)',
    catBorder: 'rgba(56,189,248,.25)',
    desc: 'Property listings, market data, and consumer home search portal.',
    url: 'https://www.realtor.com',
    display: 'realtor.com',
  },
  {
    id: 'bombbomb',
    name: 'BombBomb',
    icon: '🎬',
    category: 'Lead Gen',
    catColor: '#f43f5e',
    catBg: 'rgba(244,63,94,.1)',
    catBorder: 'rgba(244,63,94,.25)',
    desc: 'Video email marketing — record and send personal video messages to leads and clients.',
    url: 'https://bombbomb.com',
    display: 'bombbomb.com',
  },
  {
    id: 'matterport',
    name: 'Matterport',
    icon: '📷',
    category: 'Productivity',
    catColor: '#f59e0b',
    catBg: 'rgba(245,158,11,.1)',
    catBorder: 'rgba(245,158,11,.25)',
    desc: '3D virtual tours and digital twins for property listings.',
    url: 'https://matterport.com',
    display: 'matterport.com',
  },
]

const BASE_CATS = ['All', 'CRM', 'Lead Gen', 'MLS', 'Transactions', 'Research', 'Productivity', 'Marketing', 'Custom']

export default function DirectoryPage({ onNavigate, theme, onToggleTheme }) {
  const { profile } = useAuth()
  const [filter, setFilter]   = useState('All')
  const [search, setSearch]   = useState('')

  // Determine which tools are enabled for this user
  // Team members use team_prefs.enabled_tools, solo agents use habit_prefs.enabled_tools
  // If no preference is set, all original 9 tools are shown (backwards compatible)
  const isOnTeam = !!profile?.team_id
  const teamPrefs = profile?.teams?.team_prefs
  const enabledToolIds = isOnTeam
    ? (teamPrefs?.enabled_tools || null)
    : (profile?.habit_prefs?.enabled_tools || null)

  // Merge built-in tools with custom tools (from team_prefs) and apply URL overrides
  const toolOverrides = isOnTeam ? (teamPrefs?.tool_overrides || {}) : {}
  const customTools = isOnTeam ? (teamPrefs?.custom_tools || []) : []
  const CAT_COLORS = { CRM:'#0ea5e9', 'Lead Gen':'#f43f5e', Transactions:'#10b981', MLS:'#8b5cf6',
    Productivity:'#f59e0b', Research:'#6366f1', Marketing:'#ec4899', Custom:'#6b7280' }
  const allAvailableTools = [
    ...ALL_APPS.map(app => {
      const ov = toolOverrides[app.id]
      if (!ov?.url) return app
      return { ...app, url: ov.url, display: ov.url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '') }
    }),
    ...customTools.map(t => {
      const cc = CAT_COLORS[t.category] || CAT_COLORS.Custom
      return { ...t, catColor: cc, catBg: `${cc}18`, catBorder: `${cc}40`,
        desc: t.desc || `Custom tool — ${t.category || 'Custom'}` }
    }),
  ]

  // Filter to only show enabled tools
  // null = no preference set yet → show the original default set
  const DEFAULT_TOOL_IDS = ['fub','redx','skyslope','rmls','gdrive','gmail','zillow','rpr','ylopo']
  const activeTools = enabledToolIds
    ? allAvailableTools.filter(a => enabledToolIds.includes(a.id))
    : allAvailableTools.filter(a => DEFAULT_TOOL_IDS.includes(a.id))

  const visible = activeTools.filter(a => {
    const matchCat    = filter === 'All' || a.category === filter
    const matchSearch = !search || a.name.toLowerCase().includes(search.toLowerCase()) ||
                        a.category.toLowerCase().includes(search.toLowerCase()) ||
                        a.desc.toLowerCase().includes(search.toLowerCase())
    return matchCat && matchSearch
  })

  return (
    <>
      <style>{CSS}</style>
      <div className="page">

        <div className="page-inner" style={{ maxWidth:960 }}>

          {/* ── Header ───────────────────────────────────── */}
          <div style={{ marginBottom:28 }}>
            <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:6 }}>
              <span style={{ fontSize:28 }}>🔗</span>
              <div className="serif" style={{ fontSize:32, color:'var(--text)', lineHeight:1.1 }}>
                Team Toolkit
              </div>
            </div>
            <div style={{ fontSize:13, color:'var(--muted)', paddingLeft:2 }}>
              Quick access to every platform your team uses daily
            </div>
          </div>

          {/* ── Controls ─────────────────────────────────── */}
          <div style={{ display:'flex', gap:10, marginBottom:24, flexWrap:'wrap', alignItems:'center' }}>
            {/* Search */}
            <input
              className="field-input"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search apps…"
              style={{ padding:'9px 14px', width:220, fontSize:13 }}
            />

            {/* Category pills */}
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              {BASE_CATS.map(c => (
                <button key={c} onClick={() => setFilter(c)} style={{
                  padding:'7px 14px', borderRadius:20, border:'1px solid', fontSize:12, fontWeight:600,
                  cursor:'pointer', transition:'all .15s',
                  background: filter === c ? 'var(--text)' : 'transparent',
                  color:       filter === c ? 'var(--bg)'   : 'var(--muted)',
                  borderColor: filter === c ? 'var(--text)' : 'var(--b3)',
                }}>
                  {c}
                </button>
              ))}
            </div>
          </div>

          {/* ── App Grid ─────────────────────────────────── */}
          {visible.length === 0 ? (
            <div style={{ textAlign:'center', padding:'60px 0', color:'var(--dim)', fontSize:13 }}>
              No apps match "{search}"
            </div>
          ) : (
            <div style={{
              display:'grid',
              gridTemplateColumns:'repeat(auto-fill, minmax(240px, 1fr))',
              gap:14,
            }}>
              {visible.map(app => (
                <a
                  key={app.id}
                  href={app.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ textDecoration:'none' }}
                >
                  <div className="card" style={{
                    padding:22,
                    height:'100%',
                    display:'flex',
                    flexDirection:'column',
                    gap:0,
                    border:`1px solid ${app.catBorder}`,
                    cursor:'pointer',
                    transition:'all .15s',
                    position:'relative',
                    overflow:'hidden',
                  }}
                    onMouseEnter={e => {
                      e.currentTarget.style.borderColor = app.catColor
                      e.currentTarget.style.transform   = 'translateY(-2px)'
                      e.currentTarget.style.boxShadow   = `0 8px 28px ${app.catColor}18`
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.borderColor = app.catBorder
                      e.currentTarget.style.transform   = 'translateY(0)'
                      e.currentTarget.style.boxShadow   = 'var(--shadow)'
                    }}
                  >
                    {/* Subtle glow accent */}
                    <div style={{
                      position:'absolute', top:-30, right:-30, width:100, height:100,
                      borderRadius:'50%', background:app.catBg, pointerEvents:'none',
                    }}/>

                    {/* Icon + category */}
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14 }}>
                      <div style={{
                        width:52, height:52, borderRadius:14,
                        background:app.catBg, border:`1px solid ${app.catBorder}`,
                        display:'flex', alignItems:'center', justifyContent:'center', fontSize:26,
                        flexShrink:0,
                      }}>
                        {app.icon}
                      </div>
                      <span style={{
                        fontSize:9, padding:'3px 8px', borderRadius:20, fontWeight:700,
                        fontFamily:"'JetBrains Mono',monospace", letterSpacing:.4,
                        background:app.catBg, color:app.catColor, border:`1px solid ${app.catBorder}`,
                      }}>
                        {app.category.toUpperCase()}
                      </span>
                    </div>

                    {/* Name */}
                    <div className="serif" style={{ fontSize:20, color:'var(--text)', fontWeight:700, marginBottom:6, lineHeight:1.2 }}>
                      {app.name}
                    </div>

                    {/* Description */}
                    <div style={{ fontSize:12, color:'var(--muted)', lineHeight:1.65, marginBottom:16, flex:1 }}>
                      {app.desc}
                    </div>

                    {/* URL + Open button */}
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:'auto', gap:10 }}>
                      <div style={{
                        fontSize:10, color:'var(--dim)', fontFamily:"'JetBrains Mono',monospace",
                        overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
                      }}>
                        {app.display}
                      </div>
                      <div style={{
                        flexShrink:0, fontSize:11, fontWeight:700, padding:'5px 12px', borderRadius:7,
                        background:app.catBg, color:app.catColor, border:`1px solid ${app.catBorder}`,
                        fontFamily:"'JetBrains Mono',monospace", letterSpacing:.3,
                        display:'flex', alignItems:'center', gap:4,
                      }}>
                        Open →
                      </div>
                    </div>
                  </div>
                </a>
              ))}
            </div>
          )}

          {/* ── AI Tools section ─────────────────────────── */}
          <div style={{ marginTop: 40 }}>
            <div style={{ height: 1, background: 'var(--b1)', marginBottom: 28 }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <span style={{ fontSize: 22 }}>🤖</span>
              <div className="serif" style={{ fontSize: 24, color: 'var(--text)' }}>AI Tools</div>
              <span style={{
                fontSize: 9, padding: '2px 7px', borderRadius: 4, fontWeight: 700,
                background: 'rgba(139,92,246,.12)', color: '#8b5cf6', border: '1px solid rgba(139,92,246,.25)',
                fontFamily: "'JetBrains Mono',monospace", letterSpacing: .5,
              }}>BETA</span>
            </div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20 }}>
              AI-powered coaching and analysis for your real estate business
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
              {AI_TOOLS.map(tool => (
                <div key={tool.id} onClick={() => onNavigate && onNavigate(tool.page)}
                  role="button" tabIndex={0}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onNavigate && onNavigate(tool.page) } }}
                  className="card"
                  style={{
                    padding: 22, cursor: 'pointer', border: `1px solid ${tool.catBorder}`,
                    display: 'flex', flexDirection: 'column', gap: 0,
                    transition: 'all .15s', position: 'relative', overflow: 'hidden',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = tool.catColor
                    e.currentTarget.style.transform   = 'translateY(-2px)'
                    e.currentTarget.style.boxShadow   = `0 8px 28px ${tool.catColor}18`
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = tool.catBorder
                    e.currentTarget.style.transform   = 'translateY(0)'
                    e.currentTarget.style.boxShadow   = 'var(--shadow)'
                  }}
                >
                  <div style={{ position: 'absolute', top: -30, right: -30, width: 100, height: 100, borderRadius: '50%', background: tool.catBg, pointerEvents: 'none' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                    <div style={{ width: 52, height: 52, borderRadius: 14, background: tool.catBg, border: `1px solid ${tool.catBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, flexShrink: 0 }}>
                      {tool.icon}
                    </div>
                    <span style={{ fontSize: 9, padding: '3px 8px', borderRadius: 20, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace", letterSpacing: .4, background: tool.catBg, color: tool.catColor, border: `1px solid ${tool.catBorder}` }}>
                      {tool.category.toUpperCase()}
                    </span>
                  </div>
                  <div className="serif" style={{ fontSize: 20, color: 'var(--text)', fontWeight: 700, marginBottom: 6, lineHeight: 1.2 }}>{tool.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.65, marginBottom: 16, flex: 1 }}>{tool.desc}</div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <div style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, padding: '5px 12px', borderRadius: 7, background: tool.catBg, color: tool.catColor, border: `1px solid ${tool.catBorder}`, fontFamily: "'JetBrains Mono',monospace", letterSpacing: .3, display: 'flex', alignItems: 'center', gap: 4 }}>
                      Open →
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Calculators section ──────────────────────── */}
          <div style={{ marginTop: 40 }}>
            <div style={{ height: 1, background: 'var(--b1)', marginBottom: 28 }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <span style={{ fontSize: 22 }}>🧮</span>
              <div className="serif" style={{ fontSize: 24, color: 'var(--text)' }}>Calculators</div>
            </div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20 }}>
              Built-in tools for real estate analysis
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
              {CALCULATORS.map(calc => (
                <div key={calc.id} onClick={() => onNavigate && onNavigate(calc.page)}
                  role="button" tabIndex={0}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onNavigate && onNavigate(calc.page) } }}
                  className="card"
                  style={{
                    padding: 22, cursor: 'pointer', border: `1px solid ${calc.catBorder}`,
                    display: 'flex', flexDirection: 'column', gap: 0,
                    transition: 'all .15s', position: 'relative', overflow: 'hidden',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = calc.catColor
                    e.currentTarget.style.transform   = 'translateY(-2px)'
                    e.currentTarget.style.boxShadow   = `0 8px 28px ${calc.catColor}18`
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = calc.catBorder
                    e.currentTarget.style.transform   = 'translateY(0)'
                    e.currentTarget.style.boxShadow   = 'var(--shadow)'
                  }}
                >
                  <div style={{ position: 'absolute', top: -30, right: -30, width: 100, height: 100, borderRadius: '50%', background: calc.catBg, pointerEvents: 'none' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                    <div style={{ width: 52, height: 52, borderRadius: 14, background: calc.catBg, border: `1px solid ${calc.catBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, flexShrink: 0 }}>
                      {calc.icon}
                    </div>
                    <span style={{ fontSize: 9, padding: '3px 8px', borderRadius: 20, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace", letterSpacing: .4, background: calc.catBg, color: calc.catColor, border: `1px solid ${calc.catBorder}` }}>
                      {calc.category.toUpperCase()}
                    </span>
                  </div>
                  <div className="serif" style={{ fontSize: 20, color: 'var(--text)', fontWeight: 700, marginBottom: 6, lineHeight: 1.2 }}>{calc.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.65, marginBottom: 16, flex: 1 }}>{calc.desc}</div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <div style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, padding: '5px 12px', borderRadius: 7, background: calc.catBg, color: calc.catColor, border: `1px solid ${calc.catBorder}`, fontFamily: "'JetBrains Mono',monospace", letterSpacing: .3, display: 'flex', alignItems: 'center', gap: 4 }}>
                      Open →
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Footer ───────────────────────────────────── */}
          <div style={{ marginTop:40, paddingTop:20, borderTop:'1px solid var(--b1)',
            display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:12 }}>
            <div style={{ fontSize:11, color:'var(--dim)', fontFamily:"'JetBrains Mono',monospace", letterSpacing:1 }}>
              {activeTools.length} TOOLS · {AI_TOOLS.length} AI · {CALCULATORS.length} CALCULATORS
            </div>
            <div style={{ fontSize:11, color:'var(--dim)' }}>
              All apps open in a new tab
            </div>
          </div>

        </div>
      </div>
    </>
  )
}
