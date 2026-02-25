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
::-webkit-scrollbar { width: 4px; height: 4px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { border-radius: 4px; }
[data-theme="light"] ::-webkit-scrollbar-thumb { background: rgba(0,0,0,.12); }
[data-theme="dark"]  ::-webkit-scrollbar-thumb { background: rgba(255,255,255,.12); }
input, select, textarea, button { font-family: 'DM Sans', sans-serif; }
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
  --red:      #dc2626;
  --green:    #059669;
  --blue:     #0ea5e9;
  --purple:   #8b5cf6;
  --shadow:   0 1px 2px rgba(0,0,0,.05), 0 3px 12px rgba(0,0,0,.06);
  --shadow2:  0 4px 12px rgba(0,0,0,.08), 0 12px 40px rgba(0,0,0,.07);
  --shadow3:  0 2px 6px rgba(0,0,0,.06), 0 8px 24px rgba(0,0,0,.05);
  --nav-bg:   #1a1812;
  --nav-text: rgba(255,255,255,.85);
  --nav-sub:  rgba(255,255,255,.36);
  --nav-btn-bg:  rgba(255,255,255,.08);
  --nav-btn-bgh: rgba(255,255,255,.14);
  --r: 13px;
  --r2: 10px;
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
  --red:      #f87171;
  --green:    #34d399;
  --blue:     #38bdf8;
  --purple:   #a78bfa;
  --shadow:   0 1px 3px rgba(0,0,0,.5), 0 4px 16px rgba(0,0,0,.4);
  --shadow2:  0 4px 16px rgba(0,0,0,.55), 0 12px 40px rgba(0,0,0,.45);
  --shadow3:  0 2px 8px rgba(0,0,0,.45), 0 8px 24px rgba(0,0,0,.35);
  --nav-bg:   #0c0b09;
  --nav-text: rgba(255,255,255,.85);
  --nav-sub:  rgba(255,255,255,.33);
  --nav-btn-bg:  rgba(255,255,255,.07);
  --nav-btn-bgh: rgba(255,255,255,.12);
  --r: 13px;
  --r2: 10px;
}

/* ── Animations ── */
@keyframes fadeUp  { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
@keyframes fadeIn  { from{opacity:0} to{opacity:1} }
@keyframes floatXp { 0%{opacity:1;transform:translateY(0) scale(1)} 100%{opacity:0;transform:translateY(-52px) scale(1.12)} }
@keyframes pop     { 0%{transform:scale(1)} 45%{transform:scale(1.3)} 100%{transform:scale(1)} }
@keyframes spin    { to{transform:rotate(360deg)} }
@keyframes pulse   { 0%,100%{opacity:1} 50%{opacity:.6} }

body,.page { background: var(--bg); color: var(--text); }

/* ── Cards ── */
.card {
  background: var(--surface);
  border: 1px solid var(--b2);
  border-radius: var(--r);
  box-shadow: var(--shadow);
  transition: background .25s, border-color .15s, box-shadow .15s;
}
.card:hover { border-color: var(--b3); box-shadow: var(--shadow3); }
.card-flat { background: var(--surface2); border: 1px solid var(--b1); border-radius: var(--r2); }
.card-inset { background: var(--bg2); border: 1px solid var(--b1); border-radius: 9px; }

/* ── Typography ── */
.serif { font-family: 'Fraunces', serif; }
.mono  { font-family: 'JetBrains Mono', monospace; }
.label { font-size: 10px; font-weight: 600; letter-spacing: .9px; text-transform: uppercase; color: var(--dim); }

/* ── Inputs ── */
.field-input {
  width: 100%; background: var(--bg2); border: 1.5px solid var(--b2); border-radius: 9px;
  padding: 10px 14px; font-size: 14px; color: var(--text);
  transition: border-color .15s, box-shadow .15s, background .25s;
}
.field-input:focus { border-color: var(--gold); box-shadow: 0 0 0 3px var(--gold3); background: var(--surface); }
.field-input::placeholder { color: var(--dim); }

/* ── Buttons ── */
.btn-primary {
  background: var(--text); color: var(--bg); border: none; border-radius: 9px;
  padding: 10px 22px; font-size: 13px; font-weight: 600; cursor: pointer;
  transition: all .15s; white-space: nowrap;
}
.btn-primary:hover { opacity:.85; transform:translateY(-1px); box-shadow:var(--shadow2); }
.btn-primary:active { transform:translateY(0); }
.btn-primary:disabled { opacity:.3; cursor:not-allowed; transform:none; box-shadow:none; }

.btn-gold {
  background: var(--gold); color: #fff; border: none; border-radius: 9px;
  padding: 10px 22px; font-size: 13px; font-weight: 600; cursor: pointer; transition: all .15s;
}
.btn-gold:hover { background: var(--gold2); transform:translateY(-1px); box-shadow:var(--shadow2); }
.btn-gold:active { transform:translateY(0); }
.btn-gold:disabled { opacity:.3; cursor:not-allowed; transform:none; }

.btn-outline {
  background: transparent; border: 1.5px solid var(--b3); color: var(--text2);
  border-radius: 9px; padding: 9px 18px; font-size: 13px; font-weight: 500;
  cursor: pointer; transition: all .15s; white-space: nowrap;
}
.btn-outline:hover { border-color: var(--text); color: var(--text); background: var(--b1); }

.btn-ghost {
  background: transparent; border: 1px solid var(--b2); color: var(--muted);
  border-radius: 8px; padding: 7px 14px; font-size: 12px; font-weight: 500;
  cursor: pointer; transition: all .15s; white-space: nowrap;
}
.btn-ghost:hover { background: var(--bg2); color: var(--text); border-color: var(--b3); }

.btn-del {
  background: transparent;
  border: 1.5px solid rgba(220,38,38,.2);
  color: var(--red); border-radius: 8px;
  width: 30px; height: 30px; min-width: 30px;
  font-size: 13px; font-weight: 700;
  cursor: pointer; transition: all .15s; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
}
.btn-del:hover { background: rgba(220,38,38,.1); border-color: rgba(220,38,38,.45); transform: scale(1.05); }
.btn-del:active { transform: scale(.97); }

/* ── Status pills ── */
.status-pill {
  display: inline-flex; align-items: center; gap: 4px; padding: 3px 9px;
  border-radius: 20px; font-size: 10px; font-weight: 700; letter-spacing: .4px;
  text-transform: uppercase; white-space: nowrap; flex-shrink: 0;
  font-family: 'DM Sans', sans-serif;
}
.sp-active  { background: rgba(14,165,233,.1);  color: #0ea5e9;         border: 1px solid rgba(14,165,233,.25);  }
.sp-pending { background: rgba(245,158,11,.11); color: var(--gold2);    border: 1px solid rgba(245,158,11,.3);   }
.sp-closed  { background: rgba(5,150,105,.1);   color: var(--green);    border: 1px solid rgba(5,150,105,.25);   }

/* ── Inline action buttons ── */
.act-btn {
  display: inline-flex; align-items: center; gap: 3px; padding: 4px 10px;
  border-radius: 7px; font-size: 11px; font-weight: 600; cursor: pointer;
  border: 1.5px solid; transition: all .15s; white-space: nowrap; flex-shrink: 0;
  font-family: 'DM Sans', sans-serif; line-height: 1.2;
}
.act-btn:active { transform: scale(.97); }
.act-btn-amber { background: rgba(245,158,11,.08); color: var(--gold2); border-color: rgba(245,158,11,.28); }
.act-btn-amber:hover { background: rgba(245,158,11,.18); border-color: rgba(245,158,11,.5); transform: translateY(-1px); }
.act-btn-green { background: rgba(5,150,105,.08); color: var(--green); border-color: rgba(5,150,105,.28); }
.act-btn-green:hover { background: rgba(5,150,105,.18); border-color: rgba(5,150,105,.5); transform: translateY(-1px); }
.act-btn-blue  { background: rgba(14,165,233,.08); color: var(--blue); border-color: rgba(14,165,233,.28); }
.act-btn-blue:hover  { background: rgba(14,165,233,.18); border-color: rgba(14,165,233,.5); transform: translateY(-1px); }

/* ── Nav ── */
.topnav {
  background: var(--nav-bg); height: 62px; display: flex; align-items: center;
  padding: 0 24px; justify-content: space-between; position: sticky; top: 0; z-index: 200;
  border-bottom: 1px solid rgba(255,255,255,.05);
  box-shadow: 0 1px 0 rgba(255,255,255,.03), 0 4px 24px rgba(0,0,0,.25);
  transition: background .25s;
}
.nav-btn {
  background: var(--nav-btn-bg); border: 1px solid rgba(255,255,255,.09);
  color: var(--nav-text); border-radius: 8px; padding: 7px 13px; font-size: 12px;
  font-weight: 500; cursor: pointer; transition: all .15s; white-space: nowrap;
}
.nav-btn:hover { background: var(--nav-btn-bgh); color: #fff; border-color: rgba(255,255,255,.2); }
.nav-btn.active { background: var(--gold4); border-color: rgba(217,119,6,.45); color: var(--gold2); }

/* ── Page ── */
.page { min-height: 100vh; animation: fadeIn .18s ease; }
.page-inner { max-width: 1200px; margin: 0 auto; padding: 32px 24px; }

/* ── Tabs ── */
.tabs { display: flex; border-bottom: 1.5px solid var(--b1); margin-bottom: 28px; gap: 0; }
.tab-item {
  padding: 11px 20px; background: transparent; border: none; border-bottom: 2.5px solid transparent;
  margin-bottom: -1.5px; color: var(--muted); font-size: 13px; font-weight: 500;
  cursor: pointer; transition: all .15s; font-family: 'DM Sans', sans-serif; white-space: nowrap;
}
.tab-item:hover { color: var(--text2); }
.tab-item.on { color: var(--text); border-bottom-color: var(--gold); font-weight: 600; }

/* ── Stat cards ── */
.stat-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(125px, 1fr)); gap: 9px; }
.stat-card {
  background: var(--surface); border: 1px solid var(--b2); border-radius: var(--r2);
  padding: 14px 15px; transition: transform .15s, box-shadow .15s, background .25s, border-color .15s; cursor: default;
}
.stat-card:hover { transform: translateY(-2px); box-shadow: var(--shadow2); border-color: var(--b3); }

/* ── Pipeline ── */
.pipe-row {
  display: grid; gap: 8px; align-items: center; padding: 10px 13px;
  border-radius: var(--r2); border: 1px solid var(--b1); background: var(--surface2);
  transition: border-color .15s, background .25s, box-shadow .15s;
}
.pipe-row:hover { border-color: var(--b2); box-shadow: var(--shadow); }
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
  border-radius: 10px; border: 1px solid transparent; transition: all .15s;
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
  background: var(--surface); border: 1px solid var(--b2); border-radius: var(--r2);
  padding: 12px 16px; display: flex; align-items: center; gap: 12px; transition: all .15s;
}
.member-row:hover { border-color: var(--b3); box-shadow: var(--shadow); }
.member-row.me { border-color: rgba(217,119,6,.35); background: var(--gold3); }

.lb-row {
  background: var(--surface); border: 1px solid var(--b2); border-radius: var(--r2);
  padding: 14px 18px; display: flex; align-items: center; gap: 14px; transition: all .15s;
}
.lb-row:hover { border-color: var(--b3); box-shadow: var(--shadow); }
.lb-row.me { border-color: rgba(217,119,6,.35); background: var(--gold3); }

.section-title { font-family: 'Fraunces', serif; font-size: 22px; font-weight: 600; color: var(--text); }
.section-sub { font-size: 12px; color: var(--muted); margin-bottom: 16px; line-height: 1.6; }
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
  display: flex; align-items: center; gap: 8px; line-height: 1.2;
}

/* ── Dividers ── */
.section-divider {
  height: 1px; background: linear-gradient(90deg, var(--b2), transparent);
  margin: 32px 0 24px;
}

/* ══════════════════════════════════════════════════════════
   RESPONSIVE
   ══════════════════════════════════════════════════════════ */

/* Today tab — 2-col desktop, 1-col mobile */
.today-grid {
  display: grid;
  grid-template-columns: 1fr 220px;
  gap: 20px;
  align-items: start;
  animation: fadeUp .3s ease;
}

/* Horizontal-scroll wrapper for wide grids on mobile */
.resp-table { overflow-x: auto; -webkit-overflow-scrolling: touch; }
.resp-table-inner { min-width: 500px; }

/* ── Tablet ≤ 900px ─────────────────────────────────────── */
@media (max-width: 900px) {
  .page-inner { padding: 24px 16px; }
  .topnav     { padding: 0 14px; }
}

/* ── Mobile ≤ 700px ─────────────────────────────────────── */
@media (max-width: 700px) {
  .page-inner  { padding: 16px 12px; }
  .topnav      { padding: 0 10px; height: 52px; }
  .mob-hide    { display: none !important; }
  .today-grid  { grid-template-columns: 1fr; }
  .stat-grid   { grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 7px; }
  .tabs        { flex-wrap: wrap; gap: 4px; }
  .tab-item    { font-size: 12px; padding: 8px 12px; }
  .section-sub { font-size: 11px; }
  .section-divider { margin: 22px 0 16px; }
  .resp-table-inner { min-width: 450px; }
  /* Larger tap targets */
  .chk     { width: 26px !important; height: 26px !important; }
  .btn-del { width: 34px !important; height: 34px !important; }
}

/* ── Small phones ≤ 480px ───────────────────────────────── */
@media (max-width: 480px) {
  .page-inner { padding: 12px 10px; }
  .stat-grid  { grid-template-columns: repeat(3, 1fr); gap: 6px; }
  .tab-item   { font-size: 11px; padding: 7px 10px; }
  .stat-card  { padding: 10px 10px; }
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
  padding-bottom: 4px; margin-bottom: 9px; font-family: 'DM Sans', sans-serif;
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
  font-family: 'DM Sans', sans-serif;
}
.print-tracker-val { font-weight: 700; min-width: 28px; text-align: right; }
.print-ruled { border: none; border-bottom: 1px solid #ccc; height: 26px; margin-bottom: 1px; }
.print-todo-row { display: flex; align-items: center; gap: 10px; margin-bottom: 7px; }
.print-todo-line { flex: 1; border-bottom: 1px solid #ccc; height: 20px; }

@media print {
  body * { visibility: hidden; }
  .print-sheet, .print-sheet * { visibility: visible; }
  .print-modal-header { display: none !important; }
  .print-sheet {
    position: fixed; inset: 0; padding: 14mm 16mm;
    background: white; border-radius: 0;
  }
  @page { margin: 0; }
}
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
    <div className="stat-card" style={accent ? { borderColor:`${accent}33` } : {}}>
      <div className="label" style={{ marginBottom:8, display:'flex', alignItems:'center', gap:5 }}>
        <span style={{ fontSize:12 }}>{icon}</span>{label}
      </div>
      <div className="serif" style={{ fontSize:24, color, lineHeight:1, fontWeight:700 }}>{value}</div>
      {sub && <div style={{ fontSize:10, color:'var(--muted)', marginTop:5, fontFamily:"'JetBrains Mono',monospace" }}>{sub}</div>}
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
