import { useState } from 'react'
import { CSS, Wordmark, ThemeToggle } from '../design'

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

const APPS = [
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
]

const CATS = ['All', 'CRM', 'Lead Gen', 'MLS', 'Transactions', 'Research', 'Productivity']

export default function DirectoryPage({ onNavigate, theme, onToggleTheme }) {
  const [filter, setFilter]   = useState('All')
  const [search, setSearch]   = useState('')

  const visible = APPS.filter(a => {
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
              Quick access to every platform The Operative Group uses daily
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
              {CATS.map(c => (
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
              gridTemplateColumns:'repeat(auto-fill, minmax(280px, 1fr))',
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
              {APPS.length} TOOLS · {CALCULATORS.length} CALCULATORS · THE OPERATIVE GROUP
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
