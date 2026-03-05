import { useState, useEffect, useRef, useMemo } from 'react'
import { Wordmark, ThemeToggle } from '../design'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function n(v) {
  const x = Number(String(v ?? '').replace(/[$,]/g, ''))
  return Number.isFinite(x) ? x : 0
}
function clamp(v, min, max) { return Math.min(max, Math.max(min, v)) }
function roundTo(x, step) {
  const s = Math.max(1, n(step))
  return Math.round(n(x) / s) * s
}
function money(x) {
  return n(x).toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })
}
function money0(x) {
  return n(x).toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}
function fmtPct(x, d = 2) {
  return n(x).toLocaleString(undefined, { style: 'percent', minimumFractionDigits: d, maximumFractionDigits: d })
}
function fmtPct1(x) {
  return n(x).toLocaleString(undefined, { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 })
}
function parseLines(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => n(s))
    .filter(v => v >= 0)
}
function mortgagePIAmort(loanAmt, annualRatePct, termYears) {
  const P = n(loanAmt)
  const r = n(annualRatePct) / 100 / 12
  const N = Math.max(1, Math.round(n(termYears) * 12))
  if (P <= 0) return 0
  if (r === 0) return P / N
  return P * (r * Math.pow(1 + r, N)) / (Math.pow(1 + r, N) - 1)
}
function mortgageInterestOnly(loanAmt, annualRatePct) {
  const P = n(loanAmt)
  const r = n(annualRatePct) / 100 / 12
  if (P <= 0) return 0
  return P * r
}

// ─── Cap rate options (4%–12%, step 0.25%) ───────────────────────────────────

const CAP_OPTIONS = []
for (let v = 4.0; v <= 12.01; v = Math.round((v + 0.25) * 100) / 100) {
  CAP_OPTIONS.push(parseFloat(v.toFixed(2)))
}

// ─── Excel sheet builders (module-level, receive XLSX library as arg) ─────────

function xlStyles() {
  const ink = 'FF0B1220', muted = 'FF334155', headBg = 'FF0F172A', headFg = 'FFFFFFFF', sectionBg = 'FFF0FAE7'
  const border = { style: 'thin', color: { rgb: 'FFE4E9F2' } }
  const base = { font: { name: 'Calibri', sz: 11, color: { rgb: ink } }, alignment: { vertical: 'center', wrapText: true } }
  return {
    title:   { ...base, font: { name: 'Calibri', sz: 16, bold: true, color: { rgb: ink } }, alignment: { horizontal: 'left', vertical: 'center' } },
    subtitle:{ ...base, font: { name: 'Calibri', sz: 11, color: { rgb: muted } } },
    header:  { ...base, font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: headFg } }, fill: { patternType: 'solid', fgColor: { rgb: headBg } }, alignment: { horizontal: 'center', vertical: 'center' }, border: { top: border, bottom: border, left: border, right: border } },
    section: { ...base, font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: ink } }, fill: { patternType: 'solid', fgColor: { rgb: sectionBg } }, border: { top: border, bottom: border, left: border, right: border } },
    cell:    { ...base, border: { top: border, bottom: border, left: border, right: border } },
    money:   { ...base, numFmt: '"$"#,##0.00;[Red]\\-"$"#,##0.00', border: { top: border, bottom: border, left: border, right: border } },
    money0:  { ...base, numFmt: '"$"#,##0;[Red]\\-"$"#,##0', border: { top: border, bottom: border, left: border, right: border } },
    percent: { ...base, numFmt: '0.00%', border: { top: border, bottom: border, left: border, right: border } },
    percent1:{ ...base, numFmt: '0.0%', border: { top: border, bottom: border, left: border, right: border } },
    number0: { ...base, numFmt: '#,##0', border: { top: border, bottom: border, left: border, right: border } },
  }
}

function applyRangeStyle(XLSX, ws, rangeA1, style) {
  const r = XLSX.utils.decode_range(rangeA1)
  for (let R = r.s.r; R <= r.e.r; R++) {
    for (let C = r.s.c; C <= r.e.c; C++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C })
      if (!ws[addr]) continue
      ws[addr].s = { ...(ws[addr].s || {}), ...style }
    }
  }
}

function buildSummarySheet(XLSX, d, scenarioLabel) {
  const S = xlStyles()
  const ws = XLSX.utils.aoa_to_sheet([
    ['APOD Report', '', '', ''],
    [`Address: ${d.address}`, '', '', ''],
    [`Scenario: ${scenarioLabel}`, '', '', ''],
    [`Updated: ${new Date().toLocaleString()}`, '', '', ''],
    [''],
    ['Key Metrics', '', '', ''],
    ['NOI (Annual)', d.noiY, '', ''],
    ['Cash Flow After Debt Service (Monthly)', d.cfM, '', ''],
    ['Cash Flow After Debt Service (Annual)', d.cfY, '', ''],
    ['Applied Cap Rate', d.capPct / 100, '', ''],
    ['Price @ Applied Cap (NOI ÷ Cap)', d.recPrice, '', ''],
    ['Purchase Price (Mortgage Inputs)', d.mortgage.price || null, '', ''],
    ['Implied Cap (NOI ÷ Price)', Number.isFinite(d.capRate) ? d.capRate : null, '', ''],
    ['DSCR (NOI ÷ Annual Debt Service)', Number.isFinite(d.dscr) ? d.dscr : null, '', ''],
  ])
  ws['!merges'] = [
    XLSX.utils.decode_range('A1:D1'), XLSX.utils.decode_range('A2:D2'),
    XLSX.utils.decode_range('A3:D3'), XLSX.utils.decode_range('A4:D4'),
    XLSX.utils.decode_range('A6:D6'),
  ]
  ws['!cols'] = [{ wch: 42 }, { wch: 22 }, { wch: 16 }, { wch: 16 }]
  applyRangeStyle(XLSX, ws, 'A1:D1', S.title)
  applyRangeStyle(XLSX, ws, 'A2:D4', S.subtitle)
  applyRangeStyle(XLSX, ws, 'A6:D6', S.section)
  applyRangeStyle(XLSX, ws, 'A7:D14', S.cell)
  if (ws['B7'])  ws['B7'].s  = S.money0
  if (ws['B8'])  ws['B8'].s  = S.money
  if (ws['B9'])  ws['B9'].s  = S.money0
  if (ws['B10']) ws['B10'].s = S.percent
  if (ws['B11']) ws['B11'].s = S.money0
  if (ws['B12']) ws['B12'].s = S.money0
  if (ws['B13']) ws['B13'].s = S.percent1
  if (ws['B14']) ws['B14'].s = S.number0
  return ws
}

function buildRentRollSheet(XLSX, d) {
  const S = xlStyles()
  const rows = [['Rent Roll', '', ''], ['Unit', 'Monthly', 'Annual']]
  if (!d.rents.length) {
    rows.push(['—', null, null])
  } else {
    d.rents.forEach((rm, i) => rows.push([`Unit ${i + 1}`, rm, rm * 12]))
    rows.push(['Total', d.rents.reduce((a, b) => a + b, 0), d.rents.reduce((a, b) => a + b, 0) * 12])
  }
  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws['!merges'] = [XLSX.utils.decode_range('A1:C1')]
  ws['!cols'] = [{ wch: 18 }, { wch: 16 }, { wch: 16 }]
  applyRangeStyle(XLSX, ws, 'A1:C1', S.title)
  applyRangeStyle(XLSX, ws, 'A2:C2', S.header)
  const range = XLSX.utils.decode_range(ws['!ref'])
  for (let R = 2; R <= range.e.r; R++) {
    const u = XLSX.utils.encode_cell({ r: R, c: 0 })
    const m = XLSX.utils.encode_cell({ r: R, c: 1 })
    const a = XLSX.utils.encode_cell({ r: R, c: 2 })
    if (ws[u]) ws[u].s = S.cell
    if (ws[m] && typeof ws[m].v === 'number') ws[m].s = S.money
    if (ws[a] && typeof ws[a].v === 'number') ws[a].s = S.money0
  }
  return ws
}

function buildApodSheet(XLSX, d) {
  const S = xlStyles()
  const b = d.breakdown
  const rows = [
    ['APOD', '', '', ''],
    ['Line Item', 'Monthly', 'Annual', '% of GOI'],
    ['Gross Scheduled Income (GSI)', b.gsiM, b.gsiM * 12, d.goiY ? (b.gsiM * 12 / d.goiY) : null],
    [`(-) Vacancy & Credit Loss @ ${(d.vacPct * 100).toFixed(1)}%`, -b.vacM, -(b.vacM * 12), d.goiY ? (b.vacM * 12 / d.goiY) : null],
    ['Effective Gross Income (EGI)', b.egiM, b.egiM * 12, d.goiY ? (b.egiM * 12 / d.goiY) : null],
    ['(+) Other Income', b.otherIncM, b.otherIncM * 12, d.goiY ? (b.otherIncM * 12 / d.goiY) : null],
    ['Gross Operating Income (GOI)', d.goiM, d.goiY, 1],
    ['', '', '', ''],
    ['Total Operating Expenses', d.opexM, d.opexY, d.goiY ? (d.opexY / d.goiY) : null],
    ['', '', '', ''],
    ['Net Operating Income (NOI)', d.noiM, d.noiY, d.goiY ? (d.noiY / d.goiY) : null],
    [`Purchase Price @ ${d.capPct.toFixed(2)}% Cap (NOI ÷ Cap)`, null, d.recPrice || null, null],
  ]
  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws['!merges'] = [XLSX.utils.decode_range('A1:D1')]
  ws['!cols'] = [{ wch: 56 }, { wch: 16 }, { wch: 16 }, { wch: 12 }]
  applyRangeStyle(XLSX, ws, 'A1:D1', S.title)
  applyRangeStyle(XLSX, ws, 'A2:D2', S.header)
  const range = XLSX.utils.decode_range(ws['!ref'])
  for (let R = 2; R <= range.e.r; R++) {
    const aC = XLSX.utils.encode_cell({ r: R, c: 0 })
    const bC = XLSX.utils.encode_cell({ r: R, c: 1 })
    const cC = XLSX.utils.encode_cell({ r: R, c: 2 })
    const pC = XLSX.utils.encode_cell({ r: R, c: 3 })
    const label = String(ws[aC]?.v || '')
    if (ws[aC]) ws[aC].s = S.cell
    if (ws[bC] && typeof ws[bC].v === 'number') ws[bC].s = S.money
    if (ws[cC] && typeof ws[cC].v === 'number') ws[cC].s = S.money0
    if (ws[pC] && typeof ws[pC].v === 'number') ws[pC].s = S.percent
    const isKey = label.includes('GOI') || label.includes('EGI') || label.includes('Total Operating') || label.includes('Net Operating Income') || label.includes('Purchase Price @')
    if (isKey) {
      applyRangeStyle(XLSX, ws, XLSX.utils.encode_range({ s: { r: R, c: 0 }, e: { r: R, c: 3 } }), S.section)
      if (ws[bC] && typeof ws[bC].v === 'number') ws[bC].s = S.money
      if (ws[cC] && typeof ws[cC].v === 'number') ws[cC].s = S.money0
      if (ws[pC] && typeof ws[pC].v === 'number') ws[pC].s = S.percent
    }
  }
  return ws
}

function buildMortgageSheet(XLSX, d) {
  const S = xlStyles()
  const m = d.mortgage
  const b = d.breakdown
  const rows = [
    ['Mortgage Snapshot', '', ''],
    ['Field', 'Value', 'Notes'],
    ['Purchase Price', m.price || null, 'From Mortgage Inputs'],
    ['Down Payment %', m.downPct, ''],
    ['Down Payment $', m.down$, ''],
    ['Loan Amount', m.loan$, ''],
    ['Rate', m.rate / 100, ''],
    ['Term (years)', m.term, m.isIO ? 'Interest Only mode' : 'Amortized P&I'],
    [m.isIO ? 'Interest-Only Payment (Monthly)' : 'P&I Payment (Monthly)', m.pay, ''],
    ['Taxes (Monthly)', b.taxesM, 'Global inputs'],
    ['Insurance (Monthly)', b.insM, 'Global inputs'],
    ['HOA (Monthly)', b.hoaM, 'Global inputs'],
    ['PITI (Monthly)', m.piti, 'Payment + taxes + insurance + HOA'],
    ['NOI (Annual)', d.noiY, ''],
    ['DSCR', Number.isFinite(d.dscr) ? d.dscr : null, 'NOI ÷ Annual Debt Service'],
    ['Cap Rate (Implied)', Number.isFinite(d.capRate) ? d.capRate : null, 'NOI ÷ Price'],
    ['Cash Flow After Debt Service (Monthly)', d.cfM, ''],
  ]
  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws['!merges'] = [XLSX.utils.decode_range('A1:C1')]
  ws['!cols'] = [{ wch: 34 }, { wch: 18 }, { wch: 38 }]
  applyRangeStyle(XLSX, ws, 'A1:C1', S.title)
  applyRangeStyle(XLSX, ws, 'A2:C2', S.header)
  const fmt = (r, style) => { const addr = `B${r}`; if (ws[addr]) ws[addr].s = style }
  fmt(3, S.money0); fmt(4, S.percent1); fmt(5, S.money0); fmt(6, S.money0)
  fmt(7, S.percent); fmt(8, S.number0); fmt(9, S.money); fmt(10, S.money)
  fmt(11, S.money); fmt(12, S.money); fmt(13, S.money); fmt(14, S.money0)
  fmt(15, S.number0); fmt(16, S.percent1); fmt(17, S.money)
  for (let r = 3; r <= 17; r++) {
    const a = `A${r}`, c = `C${r}`
    if (ws[a]) ws[a].s = S.cell
    if (ws[c]) ws[c].s = S.cell
  }
  return ws
}

function buildT12Sheet(XLSX, d) {
  const S = xlStyles()
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const colCount = 1 + months.length + 1
  const lastColLetter = XLSX.utils.encode_col(colCount - 1)
  const aoa = []
  aoa.push(['T-12 Operating Statement (Template)', ...Array(colCount - 1).fill('')])
  aoa.push([`Address: ${d.address || '—'}`, ...Array(colCount - 1).fill('')])
  aoa.push([`Generated: ${new Date().toLocaleString()}`, ...Array(colCount - 1).fill('')])
  aoa.push(['', ...Array(colCount - 1).fill('')])
  aoa.push(['Line Item', ...months, 'Total'])
  aoa.push(['INCOME', ...Array(colCount - 1).fill('')])
  const incomeItems = ['Scheduled Rent', 'Other Income', 'Laundry / Parking', 'Late Fees', 'Total Income']
  incomeItems.forEach(label => aoa.push([label, ...Array(months.length).fill(null), null]))
  aoa.push(['', ...Array(colCount - 1).fill('')])
  aoa.push(['OPERATING EXPENSES', ...Array(colCount - 1).fill('')])
  const expenseItems = [
    'Property Taxes', 'Insurance', 'Owner Utilities', 'HOA', 'Property Management', 'Repairs & Maintenance',
    'Landscaping / Pest', 'Turnover / Make-Ready', 'Advertising / Leasing', 'Licenses / Permits',
    'Professional Fees', 'Supplies', 'Capital Reserves', 'Other', 'Total Operating Expenses',
  ]
  expenseItems.forEach(label => aoa.push([label, ...Array(months.length).fill(null), null]))
  aoa.push(['', ...Array(colCount - 1).fill('')])
  aoa.push(['NET OPERATING INCOME (NOI)', ...Array(months.length).fill(null), null])

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!merges'] = [
    XLSX.utils.decode_range(`A1:${lastColLetter}1`),
    XLSX.utils.decode_range(`A2:${lastColLetter}2`),
    XLSX.utils.decode_range(`A3:${lastColLetter}3`),
  ]
  ws['!cols'] = [{ wch: 34 }, ...months.map(() => ({ wch: 12 })), { wch: 14 }]
  applyRangeStyle(XLSX, ws, `A1:${lastColLetter}1`, S.title)
  applyRangeStyle(XLSX, ws, `A2:${lastColLetter}3`, S.subtitle)
  applyRangeStyle(XLSX, ws, 'A5:' + lastColLetter + '5', S.header)

  const rowOf = text => {
    const idx = aoa.findIndex(r => String(r?.[0] || '') === text)
    return idx >= 0 ? idx + 1 : null
  }
  const styleRow = (rowNumber, style) => applyRangeStyle(XLSX, ws, `A${rowNumber}:${lastColLetter}${rowNumber}`, style)
  const rIncomeHdr = rowOf('INCOME'), rExpHdr = rowOf('OPERATING EXPENSES'), rNoi = rowOf('NET OPERATING INCOME (NOI)')
  if (rIncomeHdr) styleRow(rIncomeHdr, S.section)
  if (rExpHdr)    styleRow(rExpHdr, S.section)
  if (rNoi)       styleRow(rNoi, S.section)

  const setRowMoney = r => {
    for (let c = 1; c <= 12; c++) {
      const addr = XLSX.utils.encode_cell({ r: r - 1, c })
      if (!ws[addr]) ws[addr] = { t: 'n', v: null }
      ws[addr].s = S.money
    }
    const tAddr = XLSX.utils.encode_cell({ r: r - 1, c: 13 })
    if (!ws[tAddr]) ws[tAddr] = { t: 'n', v: null }
    ws[tAddr].s = S.money0
  }

  const rScheduled = rowOf('Scheduled Rent'), rOtherInc = rowOf('Other Income')
  const rLaundry = rowOf('Laundry / Parking'), rLateFees = rowOf('Late Fees'), rTotInc = rowOf('Total Income')
  const rFirstExp = rowOf('Property Taxes'), rLastExp = rowOf('Other'), rTotExp = rowOf('Total Operating Expenses')

  ;[rScheduled, rOtherInc, rLaundry, rLateFees].forEach(r => {
    if (!r) return
    setRowMoney(r)
    ws[`N${r}`].f = `SUM(B${r}:M${r})`
  })
  if (rTotInc && rScheduled && rOtherInc && rLaundry && rLateFees) {
    setRowMoney(rTotInc)
    for (let i = 0; i < months.length; i++) {
      const col = XLSX.utils.encode_col(1 + i)
      ws[`${col}${rTotInc}`].f = `SUM(${col}${rScheduled},${col}${rOtherInc},${col}${rLaundry},${col}${rLateFees})`
    }
    ws[`N${rTotInc}`].f = `SUM(B${rTotInc}:M${rTotInc})`
  }
  expenseItems.forEach(label => {
    const r = rowOf(label)
    if (!r || label === 'Total Operating Expenses') return
    setRowMoney(r)
    ws[`N${r}`].f = `SUM(B${r}:M${r})`
  })
  if (rTotExp && rFirstExp && rLastExp) {
    setRowMoney(rTotExp)
    for (let i = 0; i < months.length; i++) {
      const col = XLSX.utils.encode_col(1 + i)
      ws[`${col}${rTotExp}`].f = `SUM(${col}${rFirstExp}:${col}${rLastExp})`
    }
    ws[`N${rTotExp}`].f = `SUM(B${rTotExp}:M${rTotExp})`
  }
  if (rNoi && rTotInc && rTotExp) {
    setRowMoney(rNoi)
    for (let i = 0; i < months.length; i++) {
      const col = XLSX.utils.encode_col(1 + i)
      ws[`${col}${rNoi}`].f = `${col}${rTotInc}-${col}${rTotExp}`
    }
    ws[`N${rNoi}`].f = `SUM(B${rNoi}:M${rNoi})`
  }
  return ws
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KPICard({ title, value, sub, highlight }) {
  return (
    <div style={{
      borderRadius: 11, padding: '16px 18px',
      background: highlight ? 'var(--gold3)' : 'var(--surface2)',
      border: highlight ? '1px solid rgba(217,119,6,.22)' : '1px solid var(--b1)',
      transition: 'all .15s',
    }}>
      <div className="label" style={{ marginBottom: 8, color: highlight ? 'var(--gold)' : 'var(--dim)' }}>{title}</div>
      <div className="serif" style={{ fontSize: 22, fontWeight: 700, color: highlight ? 'var(--gold)' : 'var(--text)', lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 5, fontFamily: "'JetBrains Mono',monospace" }}>{sub}</div>}
    </div>
  )
}

function ApodRow({ label, m, y, pct, bold, highlight }) {
  const isNoi = highlight === 'gold'
  const isGoi = highlight === 'blue'
  const bg = isNoi ? 'var(--gold3)' : isGoi ? 'rgba(56,189,248,.06)' : 'transparent'
  const color = isNoi ? 'var(--gold)' : isGoi ? 'var(--blue)' : 'var(--text)'
  return (
    <tr style={{ background: bg, borderTop: '1px solid var(--b1)' }}>
      <td style={{ padding: '9px 14px', fontWeight: bold ? 700 : 400, color, fontSize: 13 }}>{label}</td>
      <td style={{ padding: '9px 14px', textAlign: 'right', fontFamily: "'JetBrains Mono',monospace", fontWeight: bold ? 700 : 400, color, fontSize: 12 }}>{money(m)}</td>
      <td style={{ padding: '9px 14px', textAlign: 'right', fontFamily: "'JetBrains Mono',monospace", fontWeight: bold ? 700 : 400, color, fontSize: 12 }}>{money0(y)}</td>
      <td style={{ padding: '9px 14px', textAlign: 'right', fontFamily: "'JetBrains Mono',monospace", color: 'var(--muted)', fontSize: 11 }}>{fmtPct(pct, 2)}</td>
    </tr>
  )
}

// ─── APOD Calculator Page ─────────────────────────────────────────────────────

export default function APODPage({ onNavigate, theme, onToggleTheme }) {

  // ── Inputs ──
  const [address, setAddress]     = useState('')
  const [scenario, setScenario]   = useState('actual')

  // Actual scenario
  const [rentsA,    setRentsA]    = useState('')
  const [otherIncA, setOtherIncA] = useState('')
  const [vacPctA,   setVacPctA]   = useState('')
  const [utilsA,    setUtilsA]    = useState('')
  const [otherA,    setOtherA]    = useState('')
  const [mgmtPctA,  setMgmtPctA]  = useState('')
  const [rmPctA,    setRmPctA]    = useState('')

  // Pro Forma scenario
  const [rentsP,    setRentsP]    = useState('')
  const [otherIncP, setOtherIncP] = useState('')
  const [vacPctP,   setVacPctP]   = useState('')
  const [utilsP,    setUtilsP]    = useState('')
  const [otherP,    setOtherP]    = useState('')
  const [mgmtPctP,  setMgmtPctP]  = useState('')
  const [rmPctP,    setRmPctP]    = useState('')

  // Global expenses
  const [taxesG, setTaxesG] = useState('')
  const [insG,   setInsG]   = useState('')
  const [hoaG,   setHoaG]   = useState('')

  // Mortgage
  const [mPrice, setMPrice] = useState('')
  const [mDown,  setMDown]  = useState('')
  const [mRate,  setMRate]  = useState('')
  const [mTerm,  setMTerm]  = useState('')
  const [mIsIO,  setMIsIO]  = useState(false)

  // Cap rate — capPct = applied; selCap = dropdown selection
  const [capPct, setCapPct] = useState(7.0)
  const [selCap, setSelCap] = useState(7.0)

  // Email
  const [emailTo, setEmailTo] = useState('')

  // UX
  const [dirty,      setDirty]      = useState(false)
  const [toastMsg,   setToastMsg]   = useState('')
  const [xlsxReady,  setXlsxReady]  = useState(typeof window !== 'undefined' && !!window.XLSX)
  const toastTimer = useRef(null)

  // Load xlsx-js-style from CDN once
  useEffect(() => {
    if (window.XLSX) { setXlsxReady(true); return }
    let cancelled = false
    const s = document.createElement('script')
    s.src = 'https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.bundle.js'
    s.integrity = 'sha384-OUW9euuUyxyHcAhTqbhI+Iyb8LMssXt/cpz0yXhs9UWG2/R/uaWdakx/4cfww7Vb'
    s.crossOrigin = 'anonymous'
    s.onload = () => { if (!cancelled) setXlsxReady(true) }
    s.onerror = () => console.warn('xlsx-js-style CDN failed to load')
    document.head.appendChild(s)
    return () => { cancelled = true; if (s.parentNode) s.parentNode.removeChild(s) }
  }, [])

  // Clean up toast timer on unmount to prevent setState-after-unmount
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current) }, [])

  function showToast(msg) {
    setToastMsg(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToastMsg(''), 2400)
  }

  // ── Compute (pure derivation from state, memoized) ────────────────────────
  const d = useMemo(() => {
    const isActual = scenario === 'actual'
    const rents     = parseLines(isActual ? rentsA : rentsP)
    const otherIncM = n(isActual ? otherIncA : otherIncP)
    const vacPct    = clamp(n(isActual ? vacPctA : vacPctP) / 100, 0, 0.5)
    const utilsM    = n(isActual ? utilsA : utilsP)
    const otherExpM = n(isActual ? otherA  : otherP)
    const mgmtPct   = clamp(n(isActual ? mgmtPctA : mgmtPctP) / 100, 0, 0.5)
    const rmPct     = clamp(n(isActual ? rmPctA   : rmPctP)   / 100, 0, 0.5)
    const taxesM = n(taxesG), insM = n(insG), hoaM = n(hoaG)

    const gsiM  = rents.reduce((a, b) => a + b, 0)
    const vacM  = gsiM * vacPct
    const egiM  = gsiM - vacM
    const goiM  = egiM + otherIncM
    const mgmtM = egiM * mgmtPct
    const rmM   = goiM * rmPct
    const opexM = taxesM + insM + hoaM + utilsM + otherExpM + mgmtM + rmM
    const noiM  = goiM - opexM
    const goiY  = goiM * 12, opexY = opexM * 12, noiY = noiM * 12

    const capDec   = clamp(capPct, 0.1, 99) / 100
    const recPrice = noiY > 0 && capDec > 0 ? noiY / capDec : 0

    const price   = n(mPrice)
    const downPct = clamp(n(mDown || 25) / 100, 0, 1)
    const rate    = clamp(n(mRate || 6.5), 0, 30)
    const term    = clamp(n(mTerm || 30), 1, 50)
    const isIO    = mIsIO
    const down$   = price * downPct
    const loan$   = Math.max(0, price - down$)
    const pay     = price > 0 ? (isIO ? mortgageInterestOnly(loan$, rate) : mortgagePIAmort(loan$, rate, term)) : 0
    const escrows = taxesM + insM + hoaM
    const piti    = pay + escrows
    const dscr    = pay * 12 > 0 ? noiY / (pay * 12) : NaN
    const cfM     = noiM - pay, cfY = cfM * 12
    const capRate = price > 0 ? noiY / price : NaN

    return {
      address: address.trim() || '—',
      scenario, vacPct, rents,
      goiM, goiY, opexM, opexY, noiM, noiY,
      capPct, recPrice,
      breakdown: { gsiM, vacM, egiM, otherIncM, goiM, taxesM, insM, hoaM, utilsM, otherM: otherExpM, mgmtPct, rmPct, mgmtM, rmM, opexM },
      mortgage: { price, downPct, down$, loan$, rate, term, pay, escrows, piti, isIO },
      dscr, cfM, cfY, capRate,
    }
  }, [scenario, rentsA, rentsP, otherIncA, otherIncP, vacPctA, vacPctP, utilsA, utilsP,
      otherA, otherP, mgmtPctA, mgmtPctP, rmPctA, rmPctP, taxesG, insG, hoaG,
      capPct, mPrice, mDown, mRate, mTerm, mIsIO, address])

  // ── Recalculate handlers ──────────────────────────────────────────────────
  function recalcCap() {
    // Sync: apply dropdown cap → compute new recommended price → fill mortgage price
    const newCap = selCap
    const newCapDec = newCap / 100
    const newRecPrice = d.noiY > 0 && newCapDec > 0 ? roundTo(d.noiY / newCapDec, 1000) : 0
    setCapPct(newCap)
    if (newRecPrice > 0) setMPrice(String(newRecPrice))
    setDirty(false)
    showToast('Recalculated.')
  }

  function recalcMortgage() {
    // Sync: take mortgage price → compute implied cap → snap dropdown to nearest option
    const price = n(mPrice)
    if (price > 0 && d.noiY > 0) {
      const implied  = clamp((d.noiY / price) * 100, 0.1, 99)
      const nearest  = CAP_OPTIONS.reduce((prev, cur) =>
        Math.abs(cur - implied) < Math.abs(prev - implied) ? cur : prev, CAP_OPTIONS[0])
      setCapPct(implied)
      setSelCap(nearest)
    }
    setDirty(false)
    showToast('Recalculated (using mortgage inputs).')
  }

  const ch = setter => e => { setter(e.target.value); setDirty(true) }

  // ── Demo / Clear ──────────────────────────────────────────────────────────
  function loadDemo() {
    setAddress('Demo Duplex — Actual vs Pro Forma (Value-Add)')
    setRentsA('1725\n1725'); setOtherIncA('0'); setVacPctA('6'); setUtilsA('120'); setOtherA('90'); setMgmtPctA('6'); setRmPctA('6')
    setRentsP('1950\n1950'); setOtherIncP('75'); setVacPctP('4'); setUtilsP('50'); setOtherP('60'); setMgmtPctP('8'); setRmPctP('5')
    setTaxesG('290'); setInsG('95'); setHoaG('0')
    setSelCap(7.0); setCapPct(7.0)
    setMDown('25'); setMRate('6.50'); setMTerm('30'); setMIsIO(false); setMPrice('')
    setScenario('actual')
    setDirty(true)
    showToast('Demo loaded — toggle Actual / Pro Forma to compare scenarios.')
  }

  function clearAll() {
    setAddress('')
    setRentsA(''); setOtherIncA(''); setVacPctA(''); setUtilsA(''); setOtherA(''); setMgmtPctA(''); setRmPctA('')
    setRentsP(''); setOtherIncP(''); setVacPctP(''); setUtilsP(''); setOtherP(''); setMgmtPctP(''); setRmPctP('')
    setTaxesG(''); setInsG(''); setHoaG('')
    setMPrice(''); setMDown(''); setMRate(''); setMTerm(''); setMIsIO(false)
    setSelCap(7.0); setCapPct(7.0)
    setEmailTo('')
    setScenario('actual')
    setDirty(false)
    showToast('Cleared.')
  }

  // ── Email ──────────────────────────────────────────────────────────────────
  function emailReport() {
    if (!emailTo.trim()) { showToast('Enter an email address first.'); return }
    const b = d.breakdown, m = d.mortgage
    const scenarioLabel = scenario === 'actual' ? 'Actual' : 'Pro Forma'
    const lines = [
      'APOD REPORT', '==================================',
      `Address: ${d.address}`, `Scenario: ${scenarioLabel}`,
      `Vacancy: ${(d.vacPct * 100).toFixed(1)}%`, `Updated: ${new Date().toLocaleString()}`,
      '', 'KEY METRICS', '----------------------------------',
      `NOI (Annual): ${money0(d.noiY)}`,
      `Cash Flow After Debt Service: ${money(d.cfM)} /mo (${money0(d.cfY)} /yr)`,
      `Cap Rate (Implied): ${Number.isFinite(d.capRate) ? (d.capRate * 100).toFixed(1) + '%' : '—'}`,
      `Applied Cap: ${d.capPct.toFixed(2)}%`,
      `Price @ Applied Cap: ${d.recPrice > 0 ? money0(d.recPrice) : '—'}`,
      '', 'RENT ROLL', '----------------------------------',
      ...(!d.rents.length ? ['—'] : [
        ...d.rents.map((rm, i) => `Unit ${i + 1}: ${money(rm)} /mo (${money0(rm * 12)} /yr)`),
        `Total: ${money(b.gsiM)} /mo (${money0(b.gsiM * 12)} /yr)`,
      ]),
      '', 'APOD (Monthly / Annual)', '----------------------------------',
      `GSI: ${money(b.gsiM)} / ${money0(b.gsiM * 12)}`,
      `Vacancy: -${money(b.vacM)} / -${money0(b.vacM * 12)}`,
      `EGI: ${money(b.egiM)} / ${money0(b.egiM * 12)}`,
      `Other Income: ${money(b.otherIncM)} / ${money0(b.otherIncM * 12)}`,
      `GOI: ${money(d.goiM)} / ${money0(d.goiY)}`,
      '', 'OPEX BREAKDOWN', '----------------------------------',
      `Taxes (Global): ${money(b.taxesM)}`, `Insurance (Global): ${money(b.insM)}`, `HOA (Global): ${money(b.hoaM)}`,
      `Owner Utilities: ${money(b.utilsM)}`, `Other Opex: ${money(b.otherM)}`,
      `Property Mgmt (${(b.mgmtPct * 100).toFixed(1)}% of EGI): ${money(b.mgmtM)}`,
      `Repairs & Maint (${(b.rmPct * 100).toFixed(1)}% of GOI): ${money(b.rmM)}`,
      `Total Opex: ${money(d.opexM)} / ${money0(d.opexY)}`,
      '', `NOI: ${money(d.noiM)} / ${money0(d.noiY)}`,
      '', 'MORTGAGE SNAPSHOT', '----------------------------------',
      ...(m.price > 0 ? [
        `Purchase Price: ${money0(m.price)}`, `Down: ${(m.downPct * 100).toFixed(1)}% (${money0(m.down$)})`,
        `Loan: ${money0(m.loan$)}`, `Rate: ${m.rate.toFixed(2)}%`,
        `Mode: ${m.isIO ? 'Interest Only' : `Amortized / ${m.term}y`}`,
        `Payment: ${money(m.pay)} /mo`, `PITI (est.): ${money(m.piti)} /mo`,
        `DSCR: ${Number.isFinite(d.dscr) ? d.dscr.toFixed(2) : '—'}`,
        `Cash Flow After Debt Service: ${money(d.cfM)} /mo`,
      ] : ['Enter a purchase price in Mortgage Inputs to compute DSCR/PITI.']),
    ]
    const subject = `APOD Report — ${scenarioLabel}`
    const mailto = `mailto:${encodeURIComponent(emailTo.trim())}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join('\n'))}`
    window.location.href = mailto
  }

  // ── Excel Export ──────────────────────────────────────────────────────────
  function exportExcel() {
    const XLSX = window.XLSX
    if (!XLSX?.utils) { showToast('Excel library not loaded. Please wait and try again.'); return }
    const scenarioLabel = scenario === 'actual' ? 'Actual' : 'Pro Forma'
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, buildSummarySheet(XLSX, d, scenarioLabel), 'Summary')
    XLSX.utils.book_append_sheet(wb, buildRentRollSheet(XLSX, d), 'Rent Roll')
    XLSX.utils.book_append_sheet(wb, buildApodSheet(XLSX, d), 'APOD')
    XLSX.utils.book_append_sheet(wb, buildMortgageSheet(XLSX, d), 'Mortgage')
    XLSX.utils.book_append_sheet(wb, buildT12Sheet(XLSX, d), 'T-12 Template')
    const base = (d.address && d.address !== '—' ? d.address : 'APOD_Report')
      .replace(/[\/\\?%*:|"<>]/g, '-').slice(0, 80)
    const stamp = new Date().toISOString().slice(0, 10)
    try {
      XLSX.writeFile(wb, `${base} — ${scenarioLabel} — ${stamp}.xlsx`, { compression: true })
      showToast('Excel exported.')
    } catch (e) {
      console.error(e)
      showToast('Excel export failed — check console.')
    }
  }

  // ── DSCR badge ────────────────────────────────────────────────────────────
  const dscrInfo = !Number.isFinite(d.dscr)
    ? { text: 'DSCR —', color: 'var(--muted)' }
    : d.dscr >= 1.25 ? { text: `DSCR ${d.dscr.toFixed(2)} — Strong`, color: 'var(--green)' }
    : d.dscr >= 1.0  ? { text: `DSCR ${d.dscr.toFixed(2)} — Tight`,  color: 'var(--gold2)' }
    :                  { text: `DSCR ${d.dscr.toFixed(2)} — Weak`,    color: 'var(--red)' }

  // ── Styles ────────────────────────────────────────────────────────────────
  const insetPanel = (active, activeColor = 'var(--gold)') => ({
    border: active ? `2px solid ${activeColor}` : '1px solid var(--b2)',
    borderRadius: 11,
    padding: 18,
    background: active ? (activeColor === 'var(--gold)' ? 'var(--gold3)' : 'rgba(56,189,248,.06)') : 'var(--surface2)',
    transition: 'all .15s',
  })

  return (
    <>
      <div className="page-inner" style={{ maxWidth: 1000 }}>

          {/* ── Page header ───────────────────────────────────────── */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28, flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
                <span style={{ fontSize: 28 }}>🏢</span>
                <div className="serif" style={{ fontSize: 32, color: 'var(--text)', lineHeight: 1.1 }}>APOD Calculator</div>
              </div>
              <div style={{ fontSize: 13, color: 'var(--muted)', paddingLeft: 2 }}>
                Annual Property Operating Data — NOI, Cap Rate, Mortgage &amp; DSCR
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button className="btn-outline" onClick={clearAll}>Clear</button>
              <button className="btn-gold" onClick={loadDemo}>Load Demo</button>
            </div>
          </div>

          {/* ── Inputs card ───────────────────────────────────────── */}
          <div className="card" style={{ padding: 24, marginBottom: 12 }}>

            {/* Address */}
            <div style={{ marginBottom: 20 }}>
              <div className="label" style={{ marginBottom: 6 }}>
                Address <span style={{ fontWeight: 400, color: 'var(--dim)', textTransform: 'none', letterSpacing: 0, fontSize: 11 }}>optional</span>
              </div>
              <input className="field-input" value={address} onChange={ch(setAddress)}
                placeholder="123 Willamette St., Eugene, Oregon, 97405" />
            </div>

            <div className="div" />

            {/* Scenario panels side-by-side */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14, marginBottom: 20 }}>

              {/* ─ Actual ─ */}
              <div style={insetPanel(scenario === 'actual', 'var(--gold)')}>
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', marginBottom: 2 }}>Actual — Income &amp; Expenses</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>used when "Actual" is selected</div>
                </div>

                <div style={{ marginBottom: 12 }}>
                  <div className="label" style={{ marginBottom: 5 }}>Rent Roll — Actual <span style={{ fontWeight: 400 }}>$/mo · one per line</span></div>
                  <textarea className="field-input" rows={3} value={rentsA} onChange={ch(setRentsA)}
                    placeholder={"1200\n1200"} style={{ resize: 'vertical', fontFamily: "'JetBrains Mono',monospace", fontSize: 13 }} />
                  <div style={{ fontSize: 10, color: 'var(--dim)', marginTop: 3 }}>Units are counted automatically.</div>
                </div>

                {[
                  [{ label: 'Other Income', unit: '$/mo', val: otherIncA, set: setOtherIncA, ph: '0' },
                   { label: 'Vacancy & Credit Loss', unit: '%', val: vacPctA, set: setVacPctA, ph: '4', max: 30, step: 0.1 }],
                  [{ label: 'Owner Utilities', unit: '$/mo', val: utilsA, set: setUtilsA, ph: '0' },
                   { label: 'Other Opex', unit: '$/mo', val: otherA, set: setOtherA, ph: '0' }],
                  [{ label: 'Prop. Mgmt', unit: '% of EGI', val: mgmtPctA, set: setMgmtPctA, ph: '0', max: 25, step: 0.1 },
                   { label: 'R&M', unit: '% of GOI', val: rmPctA, set: setRmPctA, ph: '5', max: 25, step: 0.1 }],
                ].map((row, ri) => (
                  <div key={ri} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: ri < 2 ? 10 : 0 }}>
                    {row.map(({ label, unit, val, set, ph, max, step = 10 }) => (
                      <div key={label}>
                        <div className="label" style={{ marginBottom: 4 }}>{label} <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, fontSize: 10 }}>{unit}</span></div>
                        <input className="field-input" type="number" min="0" step={step} max={max} value={val}
                          onChange={ch(set)} placeholder={ph} style={{ padding: '7px 10px', fontSize: 13 }} />
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              {/* ─ Pro Forma ─ */}
              <div style={insetPanel(scenario === 'pro', 'var(--blue)')}>
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', marginBottom: 2 }}>Pro Forma — Income &amp; Expenses</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>used when "Pro Forma" is selected</div>
                </div>

                <div style={{ marginBottom: 12 }}>
                  <div className="label" style={{ marginBottom: 5 }}>Rent Roll — Pro Forma <span style={{ fontWeight: 400 }}>$/mo · one per line</span></div>
                  <textarea className="field-input" rows={3} value={rentsP} onChange={ch(setRentsP)}
                    placeholder={"1650\n1650"} style={{ resize: 'vertical', fontFamily: "'JetBrains Mono',monospace", fontSize: 13 }} />
                  <div style={{ fontSize: 10, color: 'var(--dim)', marginTop: 3 }}>Use your stabilized target rents here.</div>
                </div>

                {[
                  [{ label: 'Other Income', unit: '$/mo', val: otherIncP, set: setOtherIncP, ph: '0' },
                   { label: 'Vacancy & Credit Loss', unit: '%', val: vacPctP, set: setVacPctP, ph: '4', max: 30, step: 0.1 }],
                  [{ label: 'Owner Utilities', unit: '$/mo', val: utilsP, set: setUtilsP, ph: '0' },
                   { label: 'Other Opex', unit: '$/mo', val: otherP, set: setOtherP, ph: '0' }],
                  [{ label: 'Prop. Mgmt', unit: '% of EGI', val: mgmtPctP, set: setMgmtPctP, ph: '0', max: 25, step: 0.1 },
                   { label: 'R&M', unit: '% of GOI', val: rmPctP, set: setRmPctP, ph: '5', max: 25, step: 0.1 }],
                ].map((row, ri) => (
                  <div key={ri} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: ri < 2 ? 10 : 0 }}>
                    {row.map(({ label, unit, val, set, ph, max, step = 10 }) => (
                      <div key={label}>
                        <div className="label" style={{ marginBottom: 4 }}>{label} <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, fontSize: 10 }}>{unit}</span></div>
                        <input className="field-input" type="number" min="0" step={step} max={max} value={val}
                          onChange={ch(set)} placeholder={ph} style={{ padding: '7px 10px', fontSize: 13 }} />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>

            <div className="div" />

            {/* Global expenses */}
            <div>
              <div className="label" style={{ marginBottom: 10 }}>
                Global Expenses <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, fontSize: 11, color: 'var(--dim)' }}>apply to both scenarios</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                {[
                  { label: 'Taxes', unit: '$/mo', val: taxesG, set: setTaxesG },
                  { label: 'Insurance', unit: '$/mo', val: insG, set: setInsG },
                  { label: 'HOA', unit: '$/mo', val: hoaG, set: setHoaG },
                ].map(({ label, unit, val, set }) => (
                  <div key={label}>
                    <div className="label" style={{ marginBottom: 5 }}>{label} <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, fontSize: 11 }}>{unit}</span></div>
                    <input className="field-input" type="number" min="0" step="10" value={val}
                      onChange={ch(set)} placeholder="0" style={{ padding: '8px 12px' }} />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Scenario + Recalculate bar ─────────────────────────── */}
          <div className="card" style={{
            padding: '14px 22px', marginBottom: 12,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12,
            background: dirty ? 'var(--gold4)' : 'var(--surface)',
            border: dirty ? '1px solid rgba(217,119,6,.35)' : '1px solid var(--b2)',
            transition: 'all .2s',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button className={dirty ? 'btn-gold' : 'btn-outline'} onClick={recalcCap} disabled={!dirty} style={{ minWidth: 140 }}>
                Recalculate
              </button>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13, color: dirty ? 'var(--gold2)' : 'var(--muted)' }}>
                  {dirty ? 'Changes pending' : 'No pending changes'}
                </div>
                <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 1 }}>
                  {dirty ? 'Press Recalculate to sync price from cap rate' : 'Edit inputs above — then Recalculate'}
                </div>
              </div>
            </div>

            {/* Scenario toggle pill */}
            <div style={{ display: 'flex', border: '1px solid var(--b2)', borderRadius: 9, overflow: 'hidden' }}>
              {[['actual', 'Actual'], ['pro', 'Pro Forma']].map(([s, label], i) => (
                <button key={s} onClick={() => { setScenario(s); setDirty(true) }} style={{
                  padding: '8px 20px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                  transition: 'all .15s',
                  background: scenario === s ? 'var(--text)' : 'transparent',
                  color: scenario === s ? 'var(--bg)' : 'var(--muted)',
                  borderRight: i === 0 ? '1px solid var(--b2)' : 'none',
                }}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* ── Report card ───────────────────────────────────────── */}
          <div className="card" style={{ padding: 24, marginBottom: 12 }}>

            {/* Report header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22, flexWrap: 'wrap', gap: 10 }}>
              <div>
                <div className="serif" style={{ fontSize: 22, color: 'var(--text)', fontWeight: 700, marginBottom: 10 }}>APOD Report</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                  {[
                    ['Address', d.address],
                    ['Scenario', scenario === 'actual' ? 'Actual' : 'Pro Forma'],
                    ['Vacancy', `${(d.vacPct * 100).toFixed(1)}%`],
                  ].map(([label, val]) => (
                    <span key={label} style={{
                      fontSize: 11, padding: '4px 10px', borderRadius: 20, border: '1px solid var(--b2)',
                      background: 'var(--surface2)', color: 'var(--text2)',
                    }}>
                      <b style={{ color: 'var(--muted)', fontWeight: 600 }}>{label}</b>&nbsp;{val}
                    </span>
                  ))}
                </div>
              </div>
              <div style={{ fontSize: 10, color: 'var(--dim)', fontFamily: "'JetBrains Mono',monospace" }}>
                {new Date().toLocaleString()}
              </div>
            </div>

            {/* KPIs */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10, marginBottom: 28 }}>
              <KPICard title="NOI (Annual)" value={money0(d.noiY)} sub={`Scenario: ${scenario === 'actual' ? 'Actual' : 'Pro Forma'}`} highlight />
              <KPICard title="Cash Flow After Debt Service"
                value={`${money(d.cfM)}/mo`}
                sub={`${money0(d.cfY)}/yr`} />
              <KPICard title="Cap Rate (Implied)"
                value={Number.isFinite(d.capRate) ? fmtPct1(d.capRate) : '—'}
                sub={d.mortgage.price > 0 ? 'NOI ÷ Price' : 'Enter purchase price'} />
            </div>

            {/* ── Rent Roll ─ */}
            <div style={{ marginBottom: 28 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div className="serif" style={{ fontSize: 17, fontWeight: 600, color: 'var(--text)' }}>Rent Roll</div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>By unit</div>
              </div>
              <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid var(--b1)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: 'var(--bg2)' }}>
                      {['Unit', 'Monthly', 'Annual'].map((h, i) => (
                        <th key={h} style={{ padding: '9px 14px', textAlign: i === 0 ? 'left' : 'right', fontSize: 10, fontWeight: 700, letterSpacing: .8, textTransform: 'uppercase', color: 'var(--dim)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {d.rents.length === 0 ? (
                      <tr>
                        <td colSpan={3} style={{ padding: '18px 14px', textAlign: 'center', color: 'var(--dim)', fontSize: 12 }}>
                          No rents entered yet — add them in the Actual or Pro Forma panel above
                        </td>
                      </tr>
                    ) : (
                      <>
                        {d.rents.map((rm, i) => (
                          <tr key={i} style={{ borderTop: '1px solid var(--b1)' }}>
                            <td style={{ padding: '9px 14px', color: 'var(--text2)', fontWeight: 500 }}>Unit {i + 1}</td>
                            <td style={{ padding: '9px 14px', textAlign: 'right', fontFamily: "'JetBrains Mono',monospace" }}>{money(rm)}</td>
                            <td style={{ padding: '9px 14px', textAlign: 'right', fontFamily: "'JetBrains Mono',monospace" }}>{money0(rm * 12)}</td>
                          </tr>
                        ))}
                        {d.rents.length > 0 && (
                          <tr style={{ borderTop: '2px solid var(--b2)', background: 'var(--bg2)' }}>
                            <td style={{ padding: '9px 14px', fontWeight: 700, color: 'var(--text)' }}>Total ({d.rents.length} unit{d.rents.length !== 1 ? 's' : ''})</td>
                            <td style={{ padding: '9px 14px', textAlign: 'right', fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, color: 'var(--gold)' }}>{money(d.breakdown.gsiM)}</td>
                            <td style={{ padding: '9px 14px', textAlign: 'right', fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, color: 'var(--gold)' }}>{money0(d.breakdown.gsiM * 12)}</td>
                          </tr>
                        )}
                      </>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ── APOD Table ─ */}
            <div style={{ marginBottom: 28 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div className="serif" style={{ fontSize: 17, fontWeight: 600, color: 'var(--text)' }}>APOD</div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>Income &amp; expenses</div>
              </div>
              <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid var(--b1)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: 'var(--bg2)' }}>
                      {['Line Item', 'Monthly', 'Annual', '% of GOI'].map((h, i) => (
                        <th key={h} style={{ padding: '9px 14px', textAlign: i === 0 ? 'left' : 'right', fontSize: 10, fontWeight: 700, letterSpacing: .8, textTransform: 'uppercase', color: 'var(--dim)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <ApodRow label="Gross Scheduled Income (GSI)" m={d.breakdown.gsiM} y={d.breakdown.gsiM * 12} pct={d.goiY ? d.breakdown.gsiM * 12 / d.goiY : 0} bold />
                    <ApodRow label={`(-) Vacancy & Credit Loss @ ${(d.vacPct * 100).toFixed(1)}%`} m={-d.breakdown.vacM} y={-(d.breakdown.vacM * 12)} pct={d.goiY ? d.breakdown.vacM * 12 / d.goiY : 0} />
                    <ApodRow label="Effective Gross Income (EGI)" m={d.breakdown.egiM} y={d.breakdown.egiM * 12} pct={d.goiY ? d.breakdown.egiM * 12 / d.goiY : 0} bold />
                    <ApodRow label="(+) Other Income" m={d.breakdown.otherIncM} y={d.breakdown.otherIncM * 12} pct={d.goiY ? d.breakdown.otherIncM * 12 / d.goiY : 0} />
                    <ApodRow label="Gross Operating Income (GOI)" m={d.goiM} y={d.goiY} pct={1} bold highlight="blue" />
                    <tr><td colSpan={4} style={{ height: 4, background: 'var(--bg2)' }} /></tr>
                    <ApodRow label="Total Operating Expenses" m={d.opexM} y={d.opexY} pct={d.goiY ? d.opexY / d.goiY : 0} bold />
                    <tr>
                      <td colSpan={4}>
                        <div style={{ height: 2, background: 'linear-gradient(90deg,var(--gold),transparent)', margin: '0' }} />
                      </td>
                    </tr>
                    <ApodRow label="Net Operating Income (NOI)" m={d.noiM} y={d.noiY} pct={d.goiY ? d.noiY / d.goiY : 0} bold highlight="gold" />
                    <tr style={{ background: 'var(--gold3)' }}>
                      <td style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--gold)', fontSize: 13 }}>
                        Purchase Price @ {d.capPct.toFixed(2)}% Cap (NOI ÷ Cap)
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', color: 'var(--dim)', fontFamily: "'JetBrains Mono',monospace", fontSize: 12 }}>—</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, color: 'var(--gold)', fontSize: 12 }}>
                        {d.recPrice > 0 ? money0(d.recPrice) : '—'}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', color: 'var(--dim)', fontFamily: "'JetBrains Mono',monospace", fontSize: 11 }}>—</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Cap Rate Card */}
              <div className="card-inset" style={{ padding: 18, marginTop: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', marginBottom: 6 }}>Purchase Price Recommendation</div>
                    <div className="serif" style={{ fontSize: 30, color: 'var(--gold)', fontWeight: 700, lineHeight: 1, marginBottom: 8 }}>
                      {d.recPrice > 0 ? money0(d.recPrice) : '—'}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.6, maxWidth: 360 }}>
                      NOI ÷ Applied Cap Rate. Enter a purchase price in Mortgage Inputs below to see the implied cap rate.
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
                    <div style={{ textAlign: 'center' }}>
                      <div className="label" style={{ marginBottom: 4 }}>Applied Cap</div>
                      <div className="serif" style={{ fontSize: 26, color: 'var(--blue)', fontWeight: 700 }}>{capPct.toFixed(2)}%</div>
                      <div style={{ fontSize: 10, color: 'var(--dim)', marginTop: 2 }}>Higher cap → lower price</div>
                    </div>
                    <div style={{ minWidth: 150 }}>
                      <div className="label" style={{ marginBottom: 5 }}>Select Cap Rate</div>
                      <select className="field-input" value={selCap}
                        onChange={e => { setSelCap(Number(e.target.value)); setDirty(true) }}
                        style={{ padding: '8px 12px' }}>
                        {CAP_OPTIONS.map(v => (
                          <option key={v} value={v}>{v.toFixed(2)}%</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Mortgage Inputs ─ */}
            <div style={{ marginBottom: 28 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div className="serif" style={{ fontSize: 17, fontWeight: 600, color: 'var(--text)' }}>Mortgage Inputs</div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>Any change triggers Recalculate</div>
              </div>
              <div className="card-inset" style={{ padding: 18 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
                  {[
                    { label: 'Purchase Price', unit: '$', val: mPrice, set: setMPrice, ph: '0', step: 1000 },
                    { label: 'Down', unit: '%', val: mDown, set: setMDown, ph: '25', step: 0.1, max: 100 },
                    { label: 'Rate', unit: '%', val: mRate, set: setMRate, ph: '6.50', step: 0.01 },
                    { label: 'Term', unit: 'years', val: mTerm, set: setMTerm, ph: '30', step: 1, max: 50 },
                  ].map(({ label, unit, val, set, ph, step, max }) => (
                    <div key={label}>
                      <div className="label" style={{ marginBottom: 5 }}>{label} <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, fontSize: 11 }}>{unit}</span></div>
                      <input className="field-input" type="number" min="0" step={step} max={max} value={val}
                        onChange={ch(set)} placeholder={ph} style={{ padding: '8px 12px' }} />
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>
                    <input type="checkbox" checked={mIsIO} onChange={e => { setMIsIO(e.target.checked); setDirty(true) }}
                      style={{ width: 15, height: 15, cursor: 'pointer' }} />
                    Interest Only
                  </label>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>Toggle to calculate IO payment instead of amortized P&amp;I</span>
                </div>

                <div style={{ fontSize: 11, color: 'var(--dim)', marginBottom: 14 }}>
                  Taxes / Insurance / HOA for PITI are pulled from Global expense inputs above.
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingTop: 14, borderTop: '1px solid var(--b1)', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, color: 'var(--dim)' }}>Changed mortgage price? Recalculate will sync the applied cap rate to the implied cap.</span>
                  <button className={dirty ? 'btn-gold' : 'btn-outline'} onClick={recalcMortgage} disabled={!dirty} style={{ minWidth: 140 }}>
                    Recalculate
                  </button>
                </div>
              </div>
            </div>

            {/* ── Mortgage Snapshot ─ */}
            <div style={{ marginBottom: 28 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div className="serif" style={{ fontSize: 17, fontWeight: 600, color: 'var(--text)' }}>Mortgage Snapshot</div>
                <span style={{
                  fontSize: 11, padding: '4px 12px', borderRadius: 20, fontWeight: 700,
                  fontFamily: "'JetBrains Mono',monospace", letterSpacing: .3,
                  color: dscrInfo.color, border: `1.5px solid color-mix(in srgb, ${dscrInfo.color} 33%, transparent)`, background: `color-mix(in srgb, ${dscrInfo.color} 7%, transparent)`,
                }}>
                  {dscrInfo.text}
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
                <KPICard title="Loan Amount" value={d.mortgage.price > 0 ? money0(d.mortgage.loan$) : '—'} sub="Price − down payment" />
                <KPICard
                  title={d.mortgage.isIO ? 'Interest-Only Payment' : 'P&I Payment'}
                  value={d.mortgage.price > 0 ? `${money(d.mortgage.pay)}/mo` : '—'}
                  sub={`${d.mortgage.rate.toFixed(2)}% · ${d.mortgage.isIO ? 'Interest Only' : `${d.mortgage.term}y Amort.`}`}
                />
                <KPICard title="PITI (est.)" value={d.mortgage.price > 0 ? `${money(d.mortgage.piti)}/mo` : '—'} sub="Payment + taxes + ins + HOA" />
              </div>
            </div>

            {/* ── Email & Export ─ */}
            <div>
              <div className="serif" style={{ fontSize: 17, fontWeight: 600, color: 'var(--text)', marginBottom: 14 }}>Email &amp; Export</div>
              <div className="card-inset" style={{ padding: 18 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginBottom: 16, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div className="label" style={{ marginBottom: 5 }}>Email (To) <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, fontSize: 11 }}>required</span></div>
                    <input className="field-input" type="email" placeholder="your@email.com"
                      value={emailTo} onChange={e => setEmailTo(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && emailReport()}
                      style={{ padding: '8px 12px' }} />
                  </div>
                  <button className="btn-gold" onClick={emailReport}>Email Report</button>
                </div>

                <div style={{ height: 1, background: 'var(--b1)', marginBottom: 16 }} />

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="btn-primary" onClick={exportExcel}>
                    {xlsxReady ? '⬇ Export Excel' : 'Loading Excel…'}
                  </button>
                  <button className="btn-outline" onClick={() => window.print()}>🖨 Print / PDF</button>
                </div>

                <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 10 }}>
                  Tip: Press Recalculate before exporting to ensure all values are synced.
                </div>
              </div>
            </div>

          </div>
        </div>

      {/* ── Toast ─────────────────────────────────────────────────── */}
      {toastMsg && (
        <div style={{
          position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--text)', color: 'var(--bg)', padding: '10px 22px', borderRadius: 9,
          fontSize: 13, fontWeight: 500, zIndex: 9999,
          boxShadow: 'var(--shadow2)', whiteSpace: 'nowrap',
        }}>
          {toastMsg}
        </div>
      )}
    </>
  )
}
