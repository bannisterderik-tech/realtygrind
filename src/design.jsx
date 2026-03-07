// ─── Shared constants ─────────────────────────────────────────────────────────

export const RANKS = [
  { name:'Bronze',   min:0,    max:500,      color:'#cd7c32', icon:'🥉' },
  { name:'Silver',   min:500,  max:1500,     color:'#94a3b8', icon:'🥈' },
  { name:'Gold',     min:1500, max:3000,     color:'#d97706', icon:'🥇' },
  { name:'Platinum', min:3000, max:6000,     color:'#38bdf8', icon:'🌟' },
  { name:'Diamond',  min:6000, max:Infinity, color:'#a855f7', icon:'💎' },
]
export function getRank(xp) { return [...RANKS].reverse().find(r=>xp>=r.min)||RANKS[0] }

export function fmtMoney(v) {
  const s = String(v||'')
  const neg = s.trim().startsWith('-')
  const n = parseFloat(s.replace(/[^0-9.]/g,''))
  if (!n && n !== 0) return null
  if (n === 0) return '$0'
  const prefix = neg ? '-' : ''
  return n>=1e6 ? prefix+'$'+(n/1e6).toFixed(2)+'M' : n>=1e3 ? prefix+'$'+(n/1e3).toFixed(0)+'K' : prefix+'$'+Math.round(n).toLocaleString()
}

// Resolve commission to a dollar amount — handles both "$2500" and "3%" (calculated from price)
export function resolveCommission(commStr, priceStr) {
  const raw = String(commStr || '').trim()
  if (!raw) return 0
  if (raw.endsWith('%')) {
    const pct = parseFloat(raw.replace(/%$/, ''))
    if (isNaN(pct)) return 0
    const price = parseFloat(String(priceStr || '').replace(/[^0-9.]/g, ''))
    if (isNaN(price)) return 0
    return (pct / 100) * price
  }
  const n = parseFloat(raw.replace(/[^0-9.]/g, ''))
  return isNaN(n) ? 0 : n
}

// Format price for display: 450000 → "$450,000"
export function formatPrice(v) {
  const n = parseFloat(String(v||'').replace(/[^0-9.]/g,''))
  if (!n && n!==0) return ''
  if (n === 0) return '$0'
  return '$'+n.toLocaleString('en-US',{maximumFractionDigits:0})
}
// Strip formatting for editing: "$450,000" → "450000"
export function stripPrice(v) { return String(v||'').replace(/[^0-9.]/g,'') }

// Days on market — prefer listDate, fall back to createdAt
export function daysOnMarket(listDate, createdAt) {
  const ref = listDate || createdAt
  if (!ref) return null
  const d = Math.floor((Date.now()-new Date(ref).getTime())/(86400000))
  return d >= 0 ? d : null
}

// Lead source options
export const LEAD_SOURCES = [
  'Sphere','FSBO','Expired','Online Lead','Open House',
  'Referral','Sign Call','Door Knock','Cold Call','Other'
]

// Lead source colors
export const LEAD_SOURCE_COLORS = {
  Sphere:'#8b5cf6', FSBO:'#f59e0b', Expired:'#ef4444', 'Online Lead':'#0ea5e9',
  'Open House':'#10b981', Referral:'#ec4899', 'Sign Call':'#14b8a6',
  'Door Knock':'#f97316', 'Cold Call':'#6366f1', Other:'#6b7280',
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
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html { font-size: 16px; background: var(--bg); }
body {
  font-family: 'Poppins', sans-serif;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  min-height: 100vh;
}
#root { min-height: 100vh; background: var(--bg); }
::-webkit-scrollbar { width: 5px; height: 5px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { border-radius: 5px; }
[data-theme="light"] ::-webkit-scrollbar-thumb { background: rgba(0,0,0,.14); }
[data-theme="dark"]  ::-webkit-scrollbar-thumb { background: rgba(255,255,255,.14); }
input, select, textarea, button { font-family: 'Poppins', sans-serif; }
input:focus, select:focus, textarea:focus, button:focus { outline: none; }

/* ── Light theme ── */
:root, [data-theme="light"] {
  --bg:       #f5f3ee;
  --bg2:      #eceae2;
  --bg3:      #e2dfd5;
  --surface:  #ffffff;
  --surface2: #faf8f5;
  --b1:       rgba(28,22,12,.06);
  --b2:       rgba(28,22,12,.11);
  --b3:       rgba(28,22,12,.20);
  --text:     #18160f;
  --text2:    #403d36;
  --muted:    #706b62;
  --dim:      #a09a90;
  --gold:     #b45309;
  --gold2:    #d97706;
  --gold3:    rgba(180,83,9,.07);
  --gold4:    rgba(180,83,9,.14);
  --gold5:    rgba(180,83,9,.04);
  --red:      #dc2626;
  --green:    #059669;
  --blue:     #0ea5e9;
  --purple:   #8b5cf6;
  --shadow:   0 1px 2px rgba(0,0,0,.05), 0 3px 12px rgba(0,0,0,.06);
  --shadow2:  0 4px 16px rgba(0,0,0,.10), 0 12px 40px rgba(0,0,0,.08);
  --shadow3:  0 2px 6px rgba(0,0,0,.06), 0 8px 24px rgba(0,0,0,.05);
  --nav-bg:   #1a1812;
  --nav-text: rgba(255,255,255,.85);
  --nav-sub:  rgba(255,255,255,.36);
  --nav-btn-bg:  rgba(255,255,255,.08);
  --nav-btn-bgh: rgba(255,255,255,.14);
  --r: 13px;
  --r2: 10px;
  --r3: 8px;
}

/* ── Dark theme ── */
[data-theme="dark"] {
  --bg:       #0c0b09;
  --bg2:      #131210;
  --bg3:      #1a1814;
  --surface:  #171512;
  --surface2: #1d1b17;
  --b1:       rgba(255,255,255,.05);
  --b2:       rgba(255,255,255,.09);
  --b3:       rgba(255,255,255,.16);
  --text:     #f2ede3;
  --text2:    #cec8be;
  --muted:    #888078;
  --dim:      #58534d;
  --gold:     #d97706;
  --gold2:    #f59e0b;
  --gold3:    rgba(217,119,6,.09);
  --gold4:    rgba(217,119,6,.18);
  --gold5:    rgba(217,119,6,.05);
  --red:      #f87171;
  --green:    #34d399;
  --blue:     #38bdf8;
  --purple:   #a78bfa;
  --shadow:   0 1px 3px rgba(0,0,0,.5), 0 4px 16px rgba(0,0,0,.4);
  --shadow2:  0 4px 20px rgba(0,0,0,.6), 0 12px 44px rgba(0,0,0,.5);
  --shadow3:  0 2px 8px rgba(0,0,0,.45), 0 8px 24px rgba(0,0,0,.35);
  --nav-bg:   #0c0b09;
  --nav-text: rgba(255,255,255,.85);
  --nav-sub:  rgba(255,255,255,.33);
  --nav-btn-bg:  rgba(255,255,255,.07);
  --nav-btn-bgh: rgba(255,255,255,.12);
  --r: 13px;
  --r2: 10px;
  --r3: 8px;
}

/* ── Animations ── */
@keyframes fadeUp   { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
@keyframes fadeIn   { from{opacity:0} to{opacity:1} }
@keyframes floatXp  { 0%{opacity:1;transform:translateY(0) scale(1)} 100%{opacity:0;transform:translateY(-52px) scale(1.15)} }
@keyframes pop      { 0%{transform:scale(1)} 45%{transform:scale(1.28)} 100%{transform:scale(1)} }
@keyframes spin     { to{transform:rotate(360deg)} }
@keyframes pulse    { 0%,100%{opacity:1} 50%{opacity:.55} }
@keyframes scaleIn  { from{opacity:0;transform:scale(.96)} to{opacity:1;transform:scale(1)} }
@keyframes slideDown    { from{opacity:0;transform:translateY(-8px)} to{opacity:1;transform:translateY(0)} }
@keyframes glow         { 0%,100%{box-shadow:0 0 8px currentColor} 50%{box-shadow:0 0 18px currentColor} }
@keyframes panelFadeIn  { from{opacity:0} to{opacity:1} }
@keyframes slideInRight { from{opacity:0;transform:translateX(40px)} to{opacity:1;transform:translateX(0)} }

body,.page { background: var(--bg); color: var(--text); }

/* ── Cards ── */
.card {
  background: var(--surface);
  border: 1px solid var(--b2);
  border-radius: var(--r);
  box-shadow: var(--shadow);
  transition: border-color .18s, box-shadow .22s, background .25s;
}
.card:hover { border-color: var(--b3); }
.card-flat { background: var(--surface2); border: 1px solid var(--b1); border-radius: var(--r2); }
.card-inset { background: var(--bg2); border: 1px solid var(--b1); border-radius: 9px; }
.card-interactive {
  cursor: pointer;
  transition: border-color .15s;
}
.card-interactive:hover { border-color: var(--b3); }

/* ── Typography ── */
.serif { font-family: 'Montserrat', sans-serif; letter-spacing: -.01em; }
.mono  { font-family: 'JetBrains Mono', monospace; }
.label { font-size: 11px; font-weight: 600; letter-spacing: .7px; text-transform: uppercase; color: var(--muted); }

/* ── Inputs ── */
.field-input {
  width: 100%; background: var(--bg2); border: 1.5px solid var(--b2); border-radius: 10px;
  padding: 11px 15px; font-size: 14px; color: var(--text);
  transition: border-color .18s, box-shadow .2s, background .25s;
}
.field-input:focus { border-color: var(--gold); box-shadow: 0 0 0 3px rgba(180,83,9,.13); background: var(--surface); }
.field-input::placeholder { color: var(--dim); }
.field-input.error { border-color: var(--red); }
.field-input.error:focus { box-shadow: 0 0 0 3px rgba(220,38,38,.12); }

/* ── Buttons ── */
.btn-primary {
  background: var(--text); color: var(--bg); border: none; border-radius: 9px;
  padding: 10px 22px; font-size: 13px; font-weight: 600; cursor: pointer;
  transition: opacity .18s; white-space: nowrap;
}
.btn-primary:hover { opacity:.87; }
.btn-primary:active { opacity:1; }
.btn-primary:disabled { opacity:.28; cursor:not-allowed; }

.btn-gold {
  background: var(--gold); color: #fff; border: none; border-radius: 9px;
  padding: 10px 22px; font-size: 13px; font-weight: 600; cursor: pointer; transition: background .18s;
}
.btn-gold:hover { background: var(--gold2); }
.btn-gold:active {}
.btn-gold:disabled { opacity:.28; cursor:not-allowed; }

.btn-outline {
  background: transparent; border: 1.5px solid var(--b3); color: var(--text2);
  border-radius: 9px; padding: 9px 18px; font-size: 13px; font-weight: 500;
  cursor: pointer; transition: border-color .18s, color .18s, background .18s; white-space: nowrap;
}
.btn-outline:hover { border-color: var(--text); color: var(--text); background: var(--b1); }

.btn-ghost {
  background: transparent; border: 1px solid var(--b2); color: var(--muted);
  border-radius: 8px; padding: 7px 14px; font-size: 12px; font-weight: 500;
  cursor: pointer; transition: background .18s, color .18s, border-color .18s; white-space: nowrap;
}
.btn-ghost:hover { background: var(--bg2); color: var(--text); border-color: var(--b3); }

.btn-del {
  background: transparent;
  border: 1.5px solid rgba(220,38,38,.2);
  color: var(--red); border-radius: 8px;
  width: 30px; height: 30px; min-width: 30px;
  font-size: 13px; font-weight: 700;
  cursor: pointer; transition: background .18s, border-color .18s; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
}
.btn-del:hover { background: rgba(220,38,38,.1); border-color: rgba(220,38,38,.45); }

/* ── Status pills ── */
.status-pill {
  display: inline-flex; align-items: center; gap: 4px; padding: 3px 9px;
  border-radius: 20px; font-size: 10px; font-weight: 700; letter-spacing: .4px;
  text-transform: uppercase; white-space: nowrap; flex-shrink: 0;
  font-family: 'Poppins', sans-serif;
}
.sp-active  { background: rgba(14,165,233,.1);  color: #0ea5e9;      border: 1px solid rgba(14,165,233,.25);  }
.sp-pending { background: rgba(245,158,11,.11); color: var(--gold2); border: 1px solid rgba(245,158,11,.3);   }
.sp-closed  { background: rgba(5,150,105,.1);   color: var(--green); border: 1px solid rgba(5,150,105,.25);  }

/* ── Inline action buttons ── */
.act-btn {
  display: inline-flex; align-items: center; gap: 4px; padding: 6px 14px;
  border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer;
  border: 1.5px solid; transition: background .18s, border-color .18s; white-space: nowrap; flex-shrink: 0;
  font-family: 'Poppins', sans-serif; line-height: 1.2;
}
.act-btn-amber { background: rgba(245,158,11,.08); color: var(--gold2); border-color: rgba(245,158,11,.28); }
.act-btn-amber:hover { background: rgba(245,158,11,.18); border-color: rgba(245,158,11,.5); }
.act-btn-green { background: rgba(5,150,105,.08); color: var(--green); border-color: rgba(5,150,105,.28); }
.act-btn-green:hover { background: rgba(5,150,105,.18); border-color: rgba(5,150,105,.5); }
.act-btn-blue  { background: rgba(14,165,233,.08); color: var(--blue); border-color: rgba(14,165,233,.28); }
.act-btn-blue:hover  { background: rgba(14,165,233,.18); border-color: rgba(14,165,233,.5); }
.act-btn-red   { background: rgba(239,68,68,.08); color: var(--red); border-color: rgba(239,68,68,.28); }
.act-btn-red:hover   { background: rgba(239,68,68,.15); border-color: rgba(239,68,68,.5); }
.act-btn-purple { background: rgba(139,92,246,.08); color: var(--purple); border-color: rgba(139,92,246,.28); }
.act-btn-purple:hover { background: rgba(139,92,246,.18); border-color: rgba(139,92,246,.5); }

/* ── Modal overlay ── */
.modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,.5); z-index:1000;
  display:flex; align-items:center; justify-content:center; padding:20px;
  animation:fadeIn .15s ease; }
.modal-card { background:var(--surface); border:1px solid var(--b2); border-radius:14px;
  padding:28px; max-width:440px; width:100%; box-shadow:0 20px 60px rgba(0,0,0,.3); }

/* ── Nav ── */
.topnav {
  background: var(--nav-bg); height: 64px; display: flex; align-items: center;
  padding: 0 24px; justify-content: space-between; position: sticky; top: 0; z-index: 200;
  border-bottom: 1px solid rgba(255,255,255,.06);
  box-shadow: 0 1px 0 rgba(255,255,255,.04), 0 4px 28px rgba(0,0,0,.28);
  transition: background .25s;
}
.nav-btn {
  background: var(--nav-btn-bg); border: 1px solid rgba(255,255,255,.09);
  color: var(--nav-text); border-radius: 9px; padding: 7px 13px; font-size: 12px;
  font-weight: 500; cursor: pointer; transition: background .18s, color .18s, border-color .18s; white-space: nowrap;
}
.nav-btn:hover { background: var(--nav-btn-bgh); color: #fff; border-color: rgba(255,255,255,.22); }
.nav-btn.active {
  background: var(--gold4); border-color: rgba(217,119,6,.5); color: var(--gold2);
  box-shadow: 0 0 0 1px rgba(217,119,6,.2), 0 2px 10px rgba(217,119,6,.12);
}

/* ── Page ── */
.page { min-height: 100vh; }
.page-inner { max-width: 1200px; margin: 0 auto; padding: 32px 24px; }

/* ── Tabs ── */
.tabs { display: flex; border-bottom: 1.5px solid var(--b1); margin-bottom: 28px; gap: 0; }
.tab-item {
  padding: 10px 20px; background: transparent; border: none; border-bottom: 2.5px solid transparent;
  margin-bottom: -1.5px; color: var(--muted); font-size: 13px; font-weight: 500;
  cursor: pointer; transition: color .18s, background .18s, border-color .18s; white-space: nowrap;
  border-radius: 8px 8px 0 0;
  font-family: 'Poppins', sans-serif;
}
.tab-item:hover { color: var(--text2); background: var(--b1); }
.tab-item.on { color: var(--text); border-bottom-color: var(--gold2); font-weight: 700; }

/* ── Primary Tabs (nested top-level) ── */
.primary-tabs { display: flex; gap: 6px; margin-bottom: 20px; }
.primary-tab {
  padding: 9px 20px; background: var(--surface); border: 1.5px solid var(--b2);
  border-radius: 10px; color: var(--muted); font-size: 13px; font-weight: 600;
  cursor: pointer; transition: all .18s; white-space: nowrap;
  font-family: 'Poppins', sans-serif; display: flex; align-items: center; gap: 6px;
}
.primary-tab:hover { border-color: var(--gold2); color: var(--text2); background: rgba(212,175,55,.04); }
.primary-tab.on {
  background: rgba(212,175,55,.1); border-color: var(--gold2); color: var(--text); font-weight: 700;
  box-shadow: 0 0 0 1px rgba(212,175,55,.15);
}
.primary-tab .ptab-count {
  font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 700;
  min-width: 20px; text-align: center; border-radius: 6px; padding: 1px 6px;
  background: var(--b1); color: var(--muted); line-height: 1.4;
}
.primary-tab.on .ptab-count { background: rgba(212,175,55,.18); color: var(--gold2); }

/* ── Stat cards ── */
.stat-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(128px, 1fr)); gap: 10px; }
.stat-card {
  background: var(--surface); border: 1px solid var(--b2); border-radius: var(--r2);
  padding: 15px 16px; transition: border-color .15s; cursor: default;
}

/* ── Pipeline ── */
.pipe-row {
  display: grid; gap: 8px; align-items: center; padding: 10px 13px;
  border-radius: var(--r2); border: 1px solid var(--b1); background: var(--surface2);
  transition: border-color .18s, background .25s, box-shadow .2s;
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
  transition: background .25s, border-color .15s;
}
.pipe-select:focus { border-color: var(--gold); }

/* ── Habits ── */
.habit-row {
  display: flex; align-items: center; gap: 12px; padding: 10px 13px;
  border-radius: 10px; border: 1px solid transparent; transition: background .18s, border-color .18s;
}
.habit-row:hover { background: var(--bg2); border-color: var(--b1); }
.habit-row.done { background: var(--bg2); border-color: var(--b1); opacity: .88; }

/* ── Reorder arrows ── */
.reorder-arrows { display: flex; flex-direction: column; gap: 0; flex-shrink: 0; opacity: 0; transition: opacity .15s; }
.habit-row:hover .reorder-arrows { opacity: 1; }
.reorder-btn {
  background: none; border: none; cursor: pointer; color: var(--dim); font-size: 10px;
  padding: 0 3px; line-height: 1; transition: color .12s;
}
.reorder-btn:hover { color: var(--gold2); }
.reorder-btn:disabled { opacity: 0; cursor: default; }
/* Week view reorder — always visible due to tight layout */
.week-reorder { display: flex; flex-direction: column; gap: 0; flex-shrink: 0; }
.week-reorder .reorder-btn { font-size: 8px; padding: 0 2px; opacity: .5; }
.week-reorder .reorder-btn:hover { opacity: 1; color: var(--gold2); }

.chk {
  width: 22px; height: 22px; border-radius: 6px; border: 1.5px solid var(--b3);
  background: transparent; cursor: pointer;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: border-color .18s, background .18s;
}
.chk:hover { border-color: var(--gold2); background: var(--gold5); }

.cnt-btn {
  width: 22px; height: 22px; border-radius: 6px; border: 1.5px solid; background: transparent;
  cursor: pointer; font-size: 14px; font-weight: 700;
  display: flex; align-items: center; justify-content: center; transition: opacity .18s; flex-shrink: 0;
}
.cnt-btn:hover { opacity: .7; }

/* ── Member + LB rows ── */
.member-row {
  background: var(--surface); border: 1px solid var(--b2); border-radius: var(--r2);
  padding: 12px 16px; display: flex; align-items: center; gap: 12px; transition: border-color .18s;
}
.member-row:hover { border-color: var(--b3); }
.member-row.me { border-color: rgba(217,119,6,.35); background: var(--gold3); }

.lb-row {
  background: var(--surface); border: 1px solid var(--b2); border-radius: var(--r2);
  padding: 14px 18px; display: flex; align-items: center; gap: 14px; transition: border-color .18s;
}
.lb-row:hover { border-color: var(--b3); }
.lb-row.me { border-color: rgba(217,119,6,.35); background: var(--gold3); }

.section-title { font-family: 'Fraunces', serif; font-size: 22px; font-weight: 600; color: var(--text); }
.section-sub { font-size: 12px; color: var(--muted); margin-bottom: 16px; line-height: 1.65; }
.div { height: 1px; background: var(--b1); margin: 24px 0; }

/* ── Theme toggle ── */
.theme-toggle {
  position: relative; width: 46px; height: 26px; border-radius: 14px;
  background: rgba(255,255,255,.11); border: 1.5px solid rgba(255,255,255,.18);
  cursor: pointer; padding: 0; transition: background .2s, border-color .2s; flex-shrink: 0;
}
.theme-toggle:hover { background: rgba(255,255,255,.17); border-color: rgba(255,255,255,.28); }
.theme-toggle.is-light { background: rgba(255,255,255,.22); border-color: rgba(255,255,255,.32); }
.knob {
  position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; border-radius: 50%;
  background: rgba(255,255,255,.92); transition: transform .2s cubic-bezier(.4,2,.55,1);
  display: flex; align-items: center; justify-content: center; font-size: 10px; line-height: 1;
  box-shadow: 0 1px 4px rgba(0,0,0,.25);
}
.theme-toggle.is-dark .knob { transform: translateX(20px); }

/* ── Section header ── */
.section-header {
  display: flex; align-items: flex-start; justify-content: space-between;
  margin-bottom: 14px; gap: 12px; flex-wrap: wrap;
}
.section-heading {
  font-family: 'Fraunces', serif; font-size: 20px; font-weight: 600; color: var(--text);
  display: flex; align-items: center; gap: 9px; line-height: 1.2;
  letter-spacing: -.015em;
}

/* ── Dividers ── */
.section-divider {
  height: 1px; background: linear-gradient(90deg, transparent, var(--b2) 25%, var(--b2) 75%, transparent);
  margin: 32px 0 24px;
}

/* ── Badges ── */
.badge {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 20px; height: 20px; padding: 0 6px;
  background: var(--gold); color: #fff;
  border-radius: 10px; font-size: 10px; font-weight: 700;
  font-family: 'Poppins', sans-serif; line-height: 1; flex-shrink: 0;
}
.badge-red   { background: var(--red); }
.badge-green { background: var(--green); }
.badge-blue  { background: var(--blue); }
.badge-muted { background: var(--muted); }

/* ── Progress bar ── */
.progress-track {
  height: 5px; background: var(--bg3); border-radius: 3px; overflow: hidden; flex: 1;
}
.progress-fill {
  height: 100%; border-radius: 3px;
  transition: width .65s cubic-bezier(.4,2,.55,1);
}

/* ── Chip / Tag ── */
.chip {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 3px 10px; border-radius: 20px;
  font-size: 11px; font-weight: 600; white-space: nowrap;
  background: var(--bg2); color: var(--text2); border: 1px solid var(--b2);
}

/* ── Empty state ── */
.empty-state {
  display: flex; flex-direction: column; align-items: center;
  padding: 44px 20px; text-align: center; gap: 8px;
  color: var(--muted); font-size: 13px; line-height: 1.6;
}
.empty-icon { font-size: 34px; margin-bottom: 4px; opacity: .5; }

/* ── Info / success / error boxes ── */
.info-box {
  background: rgba(14,165,233,.06); border: 1px solid rgba(14,165,233,.2);
  border-radius: 10px; padding: 12px 16px; font-size: 13px; color: var(--blue);
}
.success-box {
  background: rgba(5,150,105,.06); border: 1px solid rgba(5,150,105,.2);
  border-radius: 10px; padding: 12px 16px; font-size: 13px; color: var(--green);
  display: flex; justify-content: space-between; align-items: flex-start;
}
.error-box {
  background: rgba(220,38,38,.06); border: 1px solid rgba(220,38,38,.2);
  border-radius: 10px; padding: 12px 16px; font-size: 13px; color: var(--red);
  display: flex; justify-content: space-between; align-items: flex-start;
}

/* ── Avatar ── */
.avatar {
  width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center;
  justify-content: center; font-size: 14px; font-weight: 700; flex-shrink: 0;
  border: 2px solid rgba(255,255,255,.15); color: #fff;
}

/* ══════════════════════════════════════════════════════════
   RESPONSIVE
   ══════════════════════════════════════════════════════════ */

/* Today tab — 2-col desktop, 1-col mobile */
.today-grid {
  display: grid;
  grid-template-columns: 1fr 228px;
  gap: 20px;
  align-items: start;
}

/* Horizontal-scroll wrapper for wide grids on mobile */
.resp-table { overflow-x: auto; -webkit-overflow-scrolling: touch; }
.resp-table-inner { min-width: 500px; }

/* ── Tablet ≤ 900px ─────────────────────────────────────── */
@media (max-width: 900px) {
  .page-inner { padding: 24px 16px; }
  .topnav     { padding: 0 14px; }
}

/* ── Desktop: hide mobile-only elements ─────────────────── */
@media (min-width: 701px) {
  .mob-show { display: none !important; }
}

/* ── Mobile ≤ 700px ─────────────────────────────────────── */
@media (max-width: 700px) {
  .page-inner  { padding: 16px 12px; }
  .topnav      { padding: 0 10px; height: 54px; }
  .mob-hide    { display: none !important; }
  .reorder-arrows { opacity: 1 !important; }
  .today-grid  { grid-template-columns: 1fr; }
  .stat-grid   { grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 7px; }
  .primary-tabs { flex-wrap: wrap; gap: 4px; }
  .primary-tab  { font-size: 12px; padding: 7px 14px; }
  .tabs        { flex-wrap: wrap; gap: 4px; }
  .tab-item    { font-size: 12px; padding: 8px 12px; }
  .section-sub { font-size: 11px; }
  .section-divider { margin: 22px 0 16px; }
  .resp-table-inner { min-width: 540px; }
  /* Larger tap targets */
  .chk     { width: 26px !important; height: 26px !important; }
  .btn-del { width: 34px !important; height: 34px !important; }
  /* Prevent iOS auto-zoom on input focus (requires ≥ 16px) */
  .field-input, input, textarea, select { font-size: 16px !important; }
}

/* ── Small phones ≤ 480px ───────────────────────────────── */
@media (max-width: 480px) {
  .page-inner { padding: 12px 10px; }
  .stat-grid  { grid-template-columns: repeat(3, 1fr); gap: 6px; }
  .primary-tab { font-size: 11px; padding: 6px 10px; }
  .tab-item   { font-size: 11px; padding: 7px 10px; }
  .stat-card  { padding: 11px 12px; }
}

/* ── TV Mode responsive ────────────────────────────────── */
.tv-main-grid { display: grid; grid-template-columns: 1fr 380px; gap: 20px; align-items: start; }
.tv-header-pad { padding: 20px 36px 14px; }
.tv-body-pad { padding: 20px 36px 24px; }
.tv-footer-pad { padding: 10px 36px 12px; }
.tv-leaderboard-stats { display: flex; gap: 16px; align-items: center; flex-shrink: 0; }
@media (max-width: 800px) {
  .tv-main-grid { grid-template-columns: 1fr; }
  .tv-header-pad { padding: 16px 16px 12px; }
  .tv-body-pad { padding: 16px 16px 20px; }
  .tv-footer-pad { padding: 8px 16px 10px; }
}
@media (max-width: 480px) {
  .tv-leaderboard-stats { flex-wrap: wrap; gap: 10px; }
}

/* ── Print Daily Sheet ──────────────────────────────── */
.print-modal-header {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 12px;
}
.print-sheet {
  background: #fff; color: #111;
  font-family: Georgia, 'Times New Roman', serif;
  padding: 28px 32px;
  border-radius: 8px;
}
.print-sheet-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 4px;
}
.print-section-title {
  font-size: 10px; font-weight: 700; text-transform: uppercase;
  letter-spacing: .09em; border-bottom: 2px solid #111;
  padding-bottom: 4px; margin-bottom: 9px; font-family: 'Poppins', sans-serif;
}
.print-habit-row {
  display: flex; align-items: center; gap: 6px; font-size: 12.5px; margin-bottom: 5px;
}
.print-checkbox {
  width: 13px; height: 13px; border: 1.5px solid #555;
  border-radius: 2px; flex-shrink: 0; background: #fff; display: inline-block;
}
.print-checkbox.checked { background: #111; border-color: #111; }
.print-tracker-row {
  display: flex; justify-content: space-between; align-items: center;
  font-size: 12.5px; margin-bottom: 7px;
  border-bottom: 1px solid #ddd; padding-bottom: 4px;
  font-family: 'Poppins', sans-serif;
}
.print-tracker-val { font-weight: 700; min-width: 28px; text-align: right; }
.print-ruled { border: none; border-bottom: 1px solid #ccc; height: 26px; margin-bottom: 1px; }
.print-todo-row { display: flex; align-items: center; gap: 10px; margin-bottom: 7px; }
.print-todo-line { flex: 1; border-bottom: 1px solid #ccc; height: 20px; }

@media print {
  /* Force letter-size regardless of device viewport */
  @page { size: 8.5in 11in; margin: 0; }
  html, body { width: 8.5in !important; height: 11in !important; overflow: hidden !important; }
  body * { visibility: hidden; }
  .print-sheet, .print-sheet * { visibility: visible; }
  .client-update-sheet, .client-update-sheet * { visibility: visible; }
  .print-modal-header { display: none !important; }
  .no-print { display: none !important; }
  .print-sheet {
    position: fixed; inset: 0; width: 8.5in !important; height: 11in !important;
    padding: 14mm 16mm; background: white; border-radius: 0;
    font-size: 12px !important;
  }
  .client-update-sheet {
    position: fixed; inset: 0; width: 8.5in !important; height: 11in !important;
    padding: 14mm 18mm; background: white; border-radius: 0;
    font-size: 13px !important; overflow: hidden;
  }
}

/* ── Deal cards (professional SaaS style) ────────────────────────── */
.deal-card { padding:22px 24px; border-radius:var(--r); border:1px solid var(--b2);
  background:var(--surface); transition:border-color .2s, box-shadow .2s; position:relative; }
.deal-card:hover { border-color:var(--b3); box-shadow:var(--shadow3); }
.deal-card-grid { display:grid; gap:14px; }
.deal-title { font-size:15px; font-weight:700; color:var(--text); letter-spacing:-.01em; line-height:1.3; }
.deal-title input { font-size:15px; font-weight:700; color:var(--text); background:none; border:none;
  width:100%; min-width:0; outline:none; letter-spacing:-.01em; font-family:inherit; }
.deal-title input::placeholder { color:var(--dim); font-weight:400; }
.deal-title input:focus { border-bottom:1.5px solid var(--gold2); }
.deal-price { font-family:'JetBrains Mono',monospace; font-size:20px; font-weight:700;
  color:var(--gold2); margin-top:6px; line-height:1; }
.deal-meta-line { display:flex; align-items:center; gap:10px; font-size:12px; color:var(--muted);
  font-family:'JetBrains Mono',monospace; margin-top:8px; flex-wrap:wrap; }
.deal-meta-line .sep { width:3px; height:3px; border-radius:50%; background:var(--dim); flex-shrink:0; }
.deal-actions { display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-top:16px;
  padding-top:14px; border-top:1px solid var(--b1); }
.deal-status { position:absolute; top:18px; right:20px; }

/* Status pills */
.status-pill-lg { display:inline-flex; align-items:center; gap:4px; font-size:10px;
  padding:4px 10px; border-radius:6px; font-weight:700; letter-spacing:.4px; text-transform:uppercase; }

/* Edit row (progressive disclosure) */
.listing-edit-row { display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px;
  margin-top:14px; padding-top:14px; border-top:1px solid var(--b1); animation:slideDown .2s ease; }
@media(max-width:600px){ .listing-edit-row { grid-template-columns:1fr; } }

/* Edit/More buttons */
.edit-toggle { background:none; border:1px solid transparent; color:var(--dim); border-radius:6px;
  width:30px; height:30px; display:flex; align-items:center; justify-content:center; cursor:pointer;
  font-size:14px; transition:all .15s; flex-shrink:0; }
.edit-toggle:hover { background:var(--bg2); color:var(--text); border-color:var(--b2); }

/* Add bar */
.add-bar { display:flex; align-items:center; gap:10px; padding:14px 20px;
  background:var(--bg); border:1.5px dashed var(--b2); border-radius:var(--r);
  transition:border-color .18s, background .18s, box-shadow .18s; }
.add-bar:focus-within { border-color:var(--b3); border-style:solid; background:var(--surface);
  box-shadow:0 0 0 3px rgba(180,89,9,.08); }
.add-bar input { background:transparent; border:none; color:var(--text); font-size:14px;
  flex:1; min-width:0; outline:none; font-family:inherit; }
.add-bar input::placeholder { color:var(--dim); }
.add-bar-fields { display:grid; grid-template-columns:1fr 1fr 1fr auto; gap:10px; padding:14px 20px;
  background:var(--surface); border:1.5px solid var(--b3); border-top:none;
  border-radius:0 0 var(--r) var(--r); animation:slideDown .2s ease; }
@media(max-width:600px){ .add-bar-fields { grid-template-columns:1fr 1fr; } }

/* Legacy compat */
.price-display { font-family:'JetBrains Mono',monospace; font-weight:700; letter-spacing:-.02em; line-height:1; }
.comm-resolved { font-family:'JetBrains Mono',monospace; font-weight:700; }
.dom-badge { display:inline-flex; align-items:center; gap:3px; font-size:10px;
  padding:2px 8px; border-radius:5px; font-weight:600; font-family:'JetBrains Mono',monospace; }
.lead-tag { display:inline-flex; align-items:center; gap:3px; font-size:10px;
  padding:2px 8px; border-radius:5px; font-weight:600; white-space:nowrap; }
/* ── Extension Shield (CSS-only, no DOM mutation) ────────────────────────── */
[data-lastpass-icon-root], [data-lastpass-root], com-1password-notification,
[class*="grammarly"], grammarly-extension, grammarly-desktop-integration,
[data-dashlane-rid], [data-dashlane-label] { display:none !important; pointer-events:none !important; }
/* ── Duplication guardrail ────────────────────────────────────────────────── */
/* If React/HMR/bfcache ever leaves duplicate trees in the DOM, only the     */
/* last instance (freshest React tree) is visible. The JS sentinel in        */
/* Dashboard will also remove stale copies, but CSS is the instant safety    */
/* net so the user never sees a flash of duplicated content.                 */
.page ~ .page { display:none !important; }
[data-theme] ~ [data-theme] { display:none !important; }
`

// ─── React components ──────────────────────────────────────────────────────────

export function Ring({ pct, size=72, color='#b45309', sw=5, label, sub }) {
  const r = (size - sw * 2) / 2
  const c = 2 * Math.PI * r
  const d = c * (Math.min(pct, 100) / 100)
  const fs = size > 80 ? 13 : size > 60 ? 11 : 9
  const showGlow = pct >= 75
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:6 }}>
      <svg width={size} height={size} style={{ transform:'rotate(-90deg)', flexShrink:0 }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--b2)" strokeWidth={sw}/>
        {pct > 0 && (
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={sw}
            strokeDasharray={`${d} ${c}`} strokeLinecap="round"
            style={{
              transition:'stroke-dasharray .65s cubic-bezier(.4,2,.55,1)',
              filter: showGlow ? `drop-shadow(0 0 5px ${color}88)` : 'none',
            }}/>
        )}
        <text x={size/2} y={size/2} textAnchor="middle" dominantBaseline="middle"
          fill={color} fontSize={fs} fontWeight="700" fontFamily="'Poppins',sans-serif"
          style={{ transform:`rotate(90deg)`, transformOrigin:`${size/2}px ${size/2}px` }}>
          {Math.round(pct)}%
        </text>
      </svg>
      {label && <span style={{ fontSize:11, color:'var(--muted)', fontWeight:500, letterSpacing:'.2px' }}>{label}</span>}
      {sub   && <span style={{ fontSize:10, color, fontFamily:"'JetBrains Mono',monospace", fontWeight:600 }}>{sub}</span>}
    </div>
  )
}

export function StatCard({ icon, label, value, color='#b45309', sub, accent }) {
  const tintColor = accent || color
  return (
    <div className="stat-card" style={{ background:`${tintColor}07`, borderColor:`${tintColor}22` }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
        <span className="label">{label}</span>
        {icon && <span style={{ fontSize:14, lineHeight:1, opacity:.7 }}>{icon}</span>}
      </div>
      <div className="serif" style={{ fontSize:26, color, lineHeight:1.05, fontWeight:700, letterSpacing:'-.02em' }}>{value}</div>
      {sub && <div style={{ fontSize:10.5, color:'var(--muted)', marginTop:6, fontFamily:"'JetBrains Mono',monospace", lineHeight:1.4 }}>{sub}</div>}
    </div>
  )
}

export function Wordmark({ light }) {
  return (
    <span className="serif" style={{
      fontSize:18, fontWeight:700, letterSpacing:'.01em',
      color: light ? 'rgba(255,255,255,.92)' : 'var(--text)',
      display:'inline-flex', alignItems:'center', gap:7,
    }}>
      <span style={{ fontSize:16 }}>🏡</span>
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
    <div style={{ display:'flex', alignItems:'center', gap:7 }}>
      <span style={{ fontSize:10, color:'var(--nav-sub)', fontWeight:500, letterSpacing:.5 }}>
        {theme === 'dark' ? '🌙' : '☀️'}
      </span>
      <button
        className={`theme-toggle is-${theme}`}
        onClick={onToggle}
        title={`Switch to ${theme==='dark'?'light':'dark'} mode`}
      >
        <div className="knob"/>
      </button>
    </div>
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
