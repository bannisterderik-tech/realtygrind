// ─── Shared constants ─────────────────────────────────────────────────────────

export const RANKS = [
  { name:'Rookie',       min:0,    max:500,      color:'#9ca3af', icon:'🏅' },
  { name:'Associate',    min:500,  max:1500,     color:'#10b981', icon:'🥈' },
  { name:'Senior Agent', min:1500, max:3000,     color:'#f59e0b', icon:'🥇' },
  { name:'Top Producer', min:3000, max:6000,     color:'#ef4444', icon:'🏆' },
  { name:'Elite Broker', min:6000, max:Infinity, color:'#8b5cf6', icon:'💎' },
]
export function getRank(xp) { return [...RANKS].reverse().find(r=>xp>=r.min)||RANKS[0] }

export function fmtMoney(v) {
  const n = parseFloat(String(v||'').replace(/[^0-9.]/g,''))
  if (!n) return null
  return n>=1e6 ? '$'+(n/1e6).toFixed(2)+'M' : n>=1e3 ? '$'+(n/1e3).toFixed(0)+'K' : '$'+Math.round(n).toLocaleString()
}

export const CAT = {
  leads:     { color:'#0ea5e9', light:'rgba(14,165,233,.12)',  border:'rgba(14,165,233,.22)'  },
  listings:  { color:'#10b981', light:'rgba(16,185,129,.12)',  border:'rgba(16,185,129,.22)'  },
  marketing: { color:'#f43f5e', light:'rgba(244,63,94,.12)',   border:'rgba(244,63,94,.22)'   },
  admin:     { color:'#8b5cf6', light:'rgba(139,92,246,.12)',  border:'rgba(139,92,246,.22)'  },
  market:    { color:'#f59e0b', light:'rgba(245,158,11,.12)',  border:'rgba(245,158,11,.22)'  },
  growth:    { color:'#06b6d4', light:'rgba(6,182,212,.12)',   border:'rgba(6,182,212,.22)'   },
}

// ─── CSS ───────────────────────────────────────────────────────────────────────

export const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;0,9..144,700;1,9..144,400&family=DM+Sans:wght@300;400;500;600&family=JetBrains+Mono:wght@400;600;700&display=swap');

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html { font-size: 16px; }
body {
  font-family: 'DM Sans', sans-serif;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  transition: background .25s, color .25s;
}
::-webkit-scrollbar { width: 5px; height: 5px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { border-radius: 3px; }
[data-theme="light"] ::-webkit-scrollbar-thumb { background: rgba(0,0,0,.15); }
[data-theme="dark"]  ::-webkit-scrollbar-thumb { background: rgba(255,255,255,.15); }
input, select, textarea, button { font-family: 'DM Sans', sans-serif; }
input:focus, select:focus, textarea:focus, button:focus { outline: none; }

/* ── Light theme ── */
:root, [data-theme="light"] {
  --bg:       #f7f4ef;
  --bg2:      #ede9e1;
  --bg3:      #e4dfd5;
  --surface:  #ffffff;
  --surface2: #faf8f5;
  --b1:       rgba(30,25,15,.07);
  --b2:       rgba(30,25,15,.13);
  --b3:       rgba(30,25,15,.22);
  --text:     #1c1917;
  --text2:    #44403c;
  --muted:    #78716c;
  --dim:      #a8a29e;
  --gold:     #b45309;
  --gold2:    #d97706;
  --gold3:    rgba(180,83,9,.08);
  --gold4:    rgba(180,83,9,.16);
  --red:      #dc2626;
  --green:    #059669;
  --shadow:   0 1px 3px rgba(0,0,0,.06), 0 4px 16px rgba(0,0,0,.05);
  --shadow2:  0 2px 8px rgba(0,0,0,.09), 0 8px 32px rgba(0,0,0,.07);
  --nav-bg:   #1c1917;
  --nav-text: rgba(255,255,255,.82);
  --nav-sub:  rgba(255,255,255,.38);
  --nav-btn-bg:  rgba(255,255,255,.08);
  --nav-btn-bgh: rgba(255,255,255,.15);
  --r: 11px;
}

/* ── Dark theme ── */
[data-theme="dark"] {
  --bg:       #0e0d0b;
  --bg2:      #151310;
  --bg3:      #1c1916;
  --surface:  #181612;
  --surface2: #1e1b17;
  --b1:       rgba(255,255,255,.055);
  --b2:       rgba(255,255,255,.10);
  --b3:       rgba(255,255,255,.17);
  --text:     #f5f0e8;
  --text2:    #d6d0c8;
  --muted:    #8c8480;
  --dim:      #5c5855;
  --gold:     #d97706;
  --gold2:    #f59e0b;
  --gold3:    rgba(217,119,6,.1);
  --gold4:    rgba(217,119,6,.2);
  --red:      #f87171;
  --green:    #34d399;
  --shadow:   0 1px 3px rgba(0,0,0,.4), 0 4px 16px rgba(0,0,0,.3);
  --shadow2:  0 2px 8px rgba(0,0,0,.45), 0 8px 32px rgba(0,0,0,.35);
  --nav-bg:   #0e0d0b;
  --nav-text: rgba(255,255,255,.82);
  --nav-sub:  rgba(255,255,255,.35);
  --nav-btn-bg:  rgba(255,255,255,.07);
  --nav-btn-bgh: rgba(255,255,255,.13);
  --r: 11px;
}

/* ── Animations ── */
@keyframes fadeUp  { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
@keyframes fadeIn  { from{opacity:0} to{opacity:1} }
@keyframes floatXp { 0%{opacity:1;transform:translateY(0) scale(1)} 100%{opacity:0;transform:translateY(-52px) scale(1.12)} }
@keyframes pop     { 0%{transform:scale(1)} 45%{transform:scale(1.32)} 100%{transform:scale(1)} }
@keyframes spin    { to{transform:rotate(360deg)} }

body,.page { background: var(--bg); color: var(--text); }

/* ── Cards ── */
.card {
  background: var(--surface);
  border: 1px solid var(--b2);
  border-radius: var(--r);
  box-shadow: var(--shadow);
  transition: background .25s, border-color .15s;
}
.card:hover { border-color: var(--b3); }
.card-flat { background: var(--surface2); border: 1px solid var(--b1); border-radius: var(--r); }
.card-inset { background: var(--bg2); border: 1px solid var(--b1); border-radius: 8px; }

/* ── Typography ── */
.serif { font-family: 'Fraunces', serif; }
.mono  { font-family: 'JetBrains Mono', monospace; }
.label { font-size: 10px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; color: var(--dim); }

/* ── Inputs ── */
.field-input {
  width: 100%; background: var(--bg2); border: 1.5px solid var(--b2); border-radius: 8px;
  padding: 10px 14px; font-size: 14px; color: var(--text);
  transition: border-color .15s, box-shadow .15s, background .25s;
}
.field-input:focus { border-color: var(--gold); box-shadow: 0 0 0 3px var(--gold3); }
.field-input::placeholder { color: var(--dim); }

/* ── Buttons ── */
.btn-primary {
  background: var(--text); color: var(--bg); border: none; border-radius: 8px;
  padding: 10px 22px; font-size: 13px; font-weight: 600; cursor: pointer;
  transition: all .15s; white-space: nowrap;
}
.btn-primary:hover { opacity:.85; transform:translateY(-1px); box-shadow:var(--shadow2); }
.btn-primary:disabled { opacity:.35; cursor:not-allowed; transform:none; box-shadow:none; }

.btn-gold {
  background: var(--gold); color: #fff; border: none; border-radius: 8px;
  padding: 10px 22px; font-size: 13px; font-weight: 600; cursor: pointer; transition: all .15s;
}
.btn-gold:hover { background: var(--gold2); transform:translateY(-1px); }
.btn-gold:disabled { opacity:.35; cursor:not-allowed; transform:none; }

.btn-outline {
  background: transparent; border: 1.5px solid var(--b3); color: var(--text2);
  border-radius: 8px; padding: 9px 18px; font-size: 13px; font-weight: 500;
  cursor: pointer; transition: all .15s; white-space: nowrap;
}
.btn-outline:hover { border-color: var(--text); color: var(--text); background: var(--b1); }

.btn-ghost {
  background: transparent; border: 1px solid var(--b2); color: var(--muted);
  border-radius: 7px; padding: 7px 14px; font-size: 12px; font-weight: 500;
  cursor: pointer; transition: all .15s; white-space: nowrap;
}
.btn-ghost:hover { background: var(--bg2); color: var(--text); border-color: var(--b3); }

.btn-del {
  background: transparent; border: 1px solid rgba(220,38,38,.22);
  color: var(--red); border-radius: 6px; padding: 5px 10px; font-size: 12px;
  cursor: pointer; transition: all .15s; flex-shrink: 0; line-height: 1;
  display: flex; align-items: center; justify-content: center;
}
.btn-del:hover { background: rgba(220,38,38,.1); border-color: rgba(220,38,38,.4); }

/* ── Nav ── */
.topnav {
  background: var(--nav-bg); height: 58px; display: flex; align-items: center;
  padding: 0 24px; justify-content: space-between; position: sticky; top: 0; z-index: 200;
  box-shadow: 0 1px 0 rgba(255,255,255,.04), 0 2px 20px rgba(0,0,0,.3);
  transition: background .25s;
}
.nav-btn {
  background: var(--nav-btn-bg); border: 1px solid rgba(255,255,255,.1);
  color: var(--nav-text); border-radius: 8px; padding: 7px 14px; font-size: 12px;
  font-weight: 500; cursor: pointer; transition: all .15s; white-space: nowrap;
}
.nav-btn:hover { background: var(--nav-btn-bgh); color: #fff; border-color: rgba(255,255,255,.22); }
.nav-btn.active { background: var(--gold4); border-color: rgba(217,119,6,.5); color: var(--gold2); }

/* ── Page ── */
.page { min-height: 100vh; animation: fadeIn .2s ease; }
.page-inner { max-width: 1200px; margin: 0 auto; padding: 32px 24px; }

/* ── Tabs ── */
.tabs { display: flex; border-bottom: 1.5px solid var(--b1); margin-bottom: 28px; gap: 2px; }
.tab-item {
  padding: 10px 20px; background: transparent; border: none; border-bottom: 2px solid transparent;
  margin-bottom: -1.5px; color: var(--muted); font-size: 13px; font-weight: 500;
  cursor: pointer; transition: all .15s; font-family: 'DM Sans', sans-serif; white-space: nowrap;
}
.tab-item:hover { color: var(--text); }
.tab-item.on { color: var(--text); border-bottom-color: var(--gold); font-weight: 600; }

/* ── Stat cards ── */
.stat-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 10px; }
.stat-card {
  background: var(--surface); border: 1px solid var(--b2); border-radius: 10px;
  padding: 14px 16px; transition: transform .15s, box-shadow .15s, background .25s; cursor: default;
}
.stat-card:hover { transform: translateY(-2px); box-shadow: var(--shadow2); }

/* ── Pipeline ── */
.pipe-row {
  display: grid; gap: 8px; align-items: center; padding: 9px 12px;
  border-radius: 8px; border: 1px solid var(--b1); background: var(--surface2);
  transition: border-color .15s, background .25s;
}
.pipe-row:hover { border-color: var(--b2); }
.pipe-input {
  background: transparent; border: none; color: var(--text); font-size: 13px;
  width: 100%; min-width: 0;
}
.pipe-input::placeholder { color: var(--dim); }
.pipe-select {
  background: var(--surface); border: 1px solid var(--b2); color: var(--muted);
  border-radius: 7px; padding: 5px 8px; font-size: 12px; cursor: pointer; width: 100%;
  transition: background .25s;
}
.pipe-select:focus { border-color: var(--gold); }

/* ── Habits ── */
.habit-row {
  display: flex; align-items: center; gap: 12px; padding: 11px 14px;
  border-radius: 9px; border: 1px solid transparent; transition: all .15s;
}
.habit-row:hover { background: var(--bg2); border-color: var(--b1); }
.habit-row.done { background: var(--bg2); border-color: var(--b1); }

.chk {
  width: 22px; height: 22px; border-radius: 6px; border: 1.5px solid var(--b3);
  background: transparent; cursor: pointer;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: all .15s;
}
.chk:hover { border-color: var(--text); background: var(--b1); }

.cnt-btn {
  width: 22px; height: 22px; border-radius: 6px; border: 1.5px solid; background: transparent;
  cursor: pointer; font-size: 14px; font-weight: 700;
  display: flex; align-items: center; justify-content: center; transition: all .15s; flex-shrink: 0;
}
.cnt-btn:hover { opacity: .7; transform: scale(1.1); }

/* ── Member + LB rows ── */
.member-row {
  background: var(--surface); border: 1px solid var(--b2); border-radius: 10px;
  padding: 12px 16px; display: flex; align-items: center; gap: 12px; transition: all .15s;
}
.member-row:hover { border-color: var(--b3); box-shadow: var(--shadow); }
.member-row.me { border-color: rgba(217,119,6,.35); background: var(--gold3); }

.lb-row {
  background: var(--surface); border: 1px solid var(--b2); border-radius: 10px;
  padding: 14px 18px; display: flex; align-items: center; gap: 14px; transition: all .15s;
}
.lb-row:hover { border-color: var(--b3); box-shadow: var(--shadow); }
.lb-row.me { border-color: rgba(217,119,6,.35); background: var(--gold3); }

.section-title { font-family: 'Fraunces', serif; font-size: 22px; font-weight: 600; color: var(--text); }
.section-sub { font-size: 12px; color: var(--muted); margin-bottom: 16px; }
.div { height: 1px; background: var(--b1); margin: 24px 0; }

/* ── Theme toggle ── */
.theme-toggle {
  position: relative; width: 44px; height: 25px; border-radius: 13px;
  background: rgba(255,255,255,.12); border: 1.5px solid rgba(255,255,255,.2);
  cursor: pointer; padding: 0; transition: background .2s, border-color .2s; flex-shrink: 0;
}
.theme-toggle.is-light { background: rgba(255,255,255,.25); border-color: rgba(255,255,255,.35); }
.knob {
  position: absolute; top: 3px; left: 3px; width: 17px; height: 17px; border-radius: 50%;
  background: rgba(255,255,255,.9); transition: transform .2s cubic-bezier(.4,2,.55,1);
  display: flex; align-items: center; justify-content: center; font-size: 10px; line-height: 1;
  box-shadow: 0 1px 3px rgba(0,0,0,.2);
}
.theme-toggle.is-dark .knob { transform: translateX(19px); }
`

// ─── React components ──────────────────────────────────────────────────────────

export function Ring({ pct, size=72, color='#b45309', sw=5, label, sub }) {
  const r = (size - sw * 2) / 2
  const c = 2 * Math.PI * r
  const d = c * (Math.min(pct, 100) / 100)
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:5 }}>
      <svg width={size} height={size} style={{ transform:'rotate(-90deg)', flexShrink:0 }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--b2)" strokeWidth={sw}/>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={sw}
          strokeDasharray={`${d} ${c}`} strokeLinecap="round"
          style={{ transition:'stroke-dasharray .6s cubic-bezier(.4,2,.55,1)' }}/>
        <text x={size/2} y={size/2} textAnchor="middle" dominantBaseline="middle"
          fill={color} fontSize={size>60?12:9} fontWeight="600" fontFamily="'DM Sans',sans-serif"
          style={{ transform:`rotate(90deg)`, transformOrigin:`${size/2}px ${size/2}px` }}>
          {Math.round(pct)}%
        </text>
      </svg>
      {label && <span style={{ fontSize:11, color:'var(--muted)' }}>{label}</span>}
      {sub   && <span style={{ fontSize:10, color, fontFamily:"'JetBrains Mono',monospace" }}>{sub}</span>}
    </div>
  )
}

export function StatCard({ icon, label, value, color='#b45309', sub, accent }) {
  return (
    <div className="stat-card" style={accent ? { borderColor:`${accent}44` } : {}}>
      <div className="label" style={{ marginBottom:7, display:'flex', alignItems:'center', gap:5 }}>
        <span>{icon}</span>{label}
      </div>
      <div className="serif" style={{ fontSize:26, color, lineHeight:1, fontWeight:700 }}>{value}</div>
      {sub && <div style={{ fontSize:11, color:'var(--muted)', marginTop:4, fontFamily:"'JetBrains Mono',monospace" }}>{sub}</div>}
    </div>
  )
}

export function Wordmark({ light }) {
  return (
    <span className="serif" style={{
      fontSize:19, fontWeight:700, letterSpacing:'.01em',
      color: light ? '#fff' : 'var(--text)',
      display:'inline-flex', alignItems:'center', gap:7,
    }}>
      <span style={{ fontSize:17 }}>🏡</span>
      RealtyGrind
    </span>
  )
}

export function Loader() {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'40vh', gap:10, color:'var(--muted)', fontSize:13 }}>
      <div style={{ width:16, height:16, border:'2px solid var(--gold)', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 1s linear infinite' }}/>
      Loading…
    </div>
  )
}

export function ThemeToggle({ theme, onToggle }) {
  return (
    <button
      className={`theme-toggle is-${theme}`}
      onClick={onToggle}
      title={`Switch to ${theme==='dark'?'light':'dark'} mode`}
    >
      <div className="knob">{theme==='dark' ? '🌙' : '☀️'}</div>
    </button>
  )
}

export function PageNav({ left, right }) {
  return (
    <nav className="topnav">
      <div style={{ display:'flex', alignItems:'center', gap:10 }}>{left}</div>
      {right && <div style={{ display:'flex', alignItems:'center', gap:8 }}>{right}</div>}
    </nav>
  )
}
