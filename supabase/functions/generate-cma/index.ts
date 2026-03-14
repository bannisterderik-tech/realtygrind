// supabase/functions/generate-cma/index.ts
// Generates an AI-powered Comparative Market Analysis report.
// Two-phase architecture: Phase 1 returns immediately, Phase 2 runs in background.
// Claude is used ONLY for analysis (scoring, adjustments, pricing, summary).
// HTML is built from a hardcoded template — no AI needed for layout.
//
// Required Supabase secrets:
//   ANTHROPIC_API_KEY           — sk-ant-...
//   REALTYMOLE_API_KEY          — RentCast API key (rentcast.io)
//   SUPABASE_SERVICE_ROLE_KEY   — already set automatically

import { createClient } from 'npm:@supabase/supabase-js@2'

const PROD_ORIGINS = [
  'https://realtygrind.co',
  'https://www.realtygrind.co',
  'https://realtygrind.vercel.app',
]
const DEV_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:4173',
  'http://localhost:5190',
]
const ALLOWED_ORIGINS = Deno.env.get('ENVIRONMENT') === 'production'
  ? PROD_ORIGINS
  : [...PROD_ORIGINS, ...DEV_ORIGINS]

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('Origin') || ''
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}

const TEAM_CMA_LIMIT = 50

function currentMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function esc(s: string) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') }

function $(n: number | undefined | null): string {
  if (n == null || isNaN(n)) return 'N/A'
  return '$' + Math.round(n).toLocaleString('en-US')
}

function fmtDate(d: string | undefined): string {
  if (!d) return 'N/A'
  try {
    const dt = new Date(d)
    return dt.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
  } catch { return d }
}

function scoreClass(score: number): string {
  if (score >= 80) return 'score-high'
  if (score >= 60) return 'score-mid'
  return 'score-low'
}

function adjCell(val: number | undefined): string {
  if (val == null || val === 0) return '<td>$0</td>'
  const cls = val > 0 ? 'adj-positive' : 'adj-negative'
  const sign = val > 0 ? '+' : ''
  return `<td class="${cls}">${sign}${$(val)}</td>`
}

// ══════════════════════════════════════════════════════════════════════════════
// HTML Template Builder — pixel-perfect match to approved mockup
// ══════════════════════════════════════════════════════════════════════════════
function buildReportHtml(opts: {
  address: string
  subjectData: Record<string, unknown>
  compsAnalyzed: Array<Record<string, unknown>>
  pricingStrategy: Record<string, unknown>
  marketContext: Record<string, unknown>
  executiveSummary: string
  primaryColor: string
  isDark: boolean
  teamName: string
  agentName: string
  agentEmail: string
  agentPhone: string
  agentLicense: string
  agentAvatar: string
  teamLogos: string[]
  propertyType: string
  daysBack: number
  searchRadius: number
}): string {
  const {
    address, subjectData, compsAnalyzed, pricingStrategy, marketContext,
    executiveSummary, primaryColor, isDark, teamName, agentName,
    agentEmail, agentPhone, agentLicense, agentAvatar, teamLogos, propertyType, daysBack, searchRadius
  } = opts

  const today = new Date()
  const reportDate = today.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const reportYear = today.getFullYear()

  const addrParts = address.split(',').map(s => s.trim())
  const streetAddr = addrParts[0] || address
  const cityStateZip = addrParts.slice(1).join(', ') || ''

  const initials = (agentName || 'RG').split(' ').map(w => w?.[0] || '').join('').toUpperCase().slice(0, 2)

  const beds = subjectData.bedrooms ?? 'N/A'
  const baths = subjectData.bathrooms ?? 'N/A'
  const sqft = (subjectData.squareFootage as number)?.toLocaleString('en-US') || 'N/A'
  const lot = (subjectData.lotSize as number)?.toLocaleString('en-US') || 'N/A'
  const yearBuilt = subjectData.yearBuilt ?? 'N/A'
  const pType = subjectData.propertyType || propertyType

  // Assessed value + last sale from subject data
  const assessedVal = subjectData.assessedValue || subjectData.taxAssessment
  const lastSalePrice = subjectData.lastSalePrice as number | undefined
  const lastSaleDate = subjectData.lastSaleDate as string | undefined

  const pLow = pricingStrategy.low as number
  const pHigh = pricingStrategy.high as number
  const pRec = pricingStrategy.recommended_price as number
  const pPsf = pricingStrategy.price_per_sqft as number
  const pReasoning = esc(pricingStrategy.reasoning as string || '')
  const pStrategy = pricingStrategy.strategy as string || 'competitive'

  const mAvg = marketContext.avg_sale_price as number
  const mMedian = marketContext.median_sale_price as number
  const mPsf = marketContext.avg_price_per_sqft as number
  const mDom = marketContext.avg_dom as number
  const mTrend = marketContext.price_trend as string || 'stable'
  const mType = marketContext.market_type as string || 'balanced'
  const mCount = marketContext.comp_count as number || compsAnalyzed.length

  const topComps = compsAnalyzed.slice(0, 8)
  const adjComps = compsAnalyzed.slice(0, 6)

  // ── Comps table rows ──
  const compsRows = topComps.map((c, _i) => {
    const cAddr = (c.address as string || '').split(',')
    const cStreet = esc(cAddr[0] || '')
    const cCity = esc(cAddr.slice(1).join(',').trim())
    const cPrice = c.salePrice as number
    const cSqft = c.squareFootage as number
    const cPsf = cSqft ? Math.round(cPrice / cSqft) : 0
    const cScore = c.relevanceScore as number || 0
    return `        <tr>
          <td><div class="comp-address">${cStreet}</div><div class="comp-meta">${cCity}</div></td>
          <td><div class="comp-price">${$(cPrice)}</div><div class="comp-ppsf">$${cPsf}/sf</div></td>
          <td>${c.bedrooms || 'N/A'} / ${c.bathrooms || 'N/A'}</td>
          <td>${(cSqft || 0).toLocaleString('en-US')}</td>
          <td>${fmtDate(c.saleDate as string)}</td>
          <td>${c.distance ? (c.distance as number).toFixed(1) + ' mi' : 'N/A'}</td>
          <td><span class="score-badge ${scoreClass(cScore)}">${Math.round(cScore)}</span></td>
        </tr>`
  }).join('\n')

  // ── Adjustment table ──
  const adjHeaders = adjComps.map(c => {
    const short = (c.address as string || '').split(',')[0].split(' ').slice(0, 2).join(' ')
    return `<th>${esc(short)}</th>`
  }).join('')

  function adjRow(label: string, field: string) {
    const cells = adjComps.map(c => {
      const adj = c.adjustments as Record<string, number> | undefined
      return adjCell(adj?.[field])
    }).join('')
    return `<tr><td>${label}</td>${cells}</tr>`
  }

  const adjSoldRow = `<tr><td>Sold Price</td>${adjComps.map(c => `<td>${$(c.salePrice as number)}</td>`).join('')}</tr>`
  const adjTotalRow = `<tr class="total-row"><td>Adjusted Price</td>${adjComps.map(c => `<td><strong>${$(c.adjustedPrice as number)}</strong></td>`).join('')}</tr>`

  // ── Key points from executive summary ──
  const summaryLines = (executiveSummary || '').split(/\.\s+/).filter(s => s.length > 20).slice(0, 3)
  const keyPointIcons = ['💡', '📌', '⚡']
  const keyPointsHtml = summaryLines.map((line, i) => `
        <div class="key-point">
          <div class="key-point-icon">${keyPointIcons[i] || '📊'}</div>
          <p>${esc(line.trim().replace(/\.$/, '') + '.')}</p>
        </div>`).join('')

  // ── Agent avatar ──
  const avatarHtml = agentAvatar
    ? `<img src="${esc(agentAvatar)}" alt="${esc(agentName)}" class="agent-photo">`
    : `<div class="agent-avatar">${initials}</div>`

  // ── Team logos ──
  const logosHtml = teamLogos.length > 0
    ? `<div class="cover-logos">${teamLogos.map(l => `<img src="${esc(l)}" alt="${esc(teamName)}" class="cover-logo-img">`).join('')}</div>`
    : ''

  // ── Contact info line ──
  const contactParts: string[] = []
  if (agentPhone) contactParts.push(esc(agentPhone))
  if (agentEmail) contactParts.push(esc(agentEmail))
  if (agentLicense) contactParts.push(`Lic# ${esc(agentLicense)}`)
  const contactLine = contactParts.length > 0
    ? `<div class="agent-contact">${contactParts.join(' &middot; ')}</div>`
    : ''

  // ── Assessed value card ──
  const assessedCard = assessedVal
    ? `<div class="subject-card">
        <div class="subject-label">Assessed Value</div>
        <div class="subject-value">${$(typeof assessedVal === 'number' ? assessedVal : (assessedVal as Record<string, unknown>)?.value as number)}</div>
        <div class="subject-detail-row">County tax records</div>
      </div>`
    : ''

  // ── Last sale card ──
  const lastSaleCard = lastSalePrice
    ? `<div class="subject-card">
        <div class="subject-label">Last Sale</div>
        <div class="subject-value">${$(lastSalePrice)}</div>
        <div class="subject-detail-row">${lastSaleDate ? fmtDate(lastSaleDate) : 'N/A'}${pRec && lastSalePrice ? ` &middot; +${$(pRec - lastSalePrice)} estimated appreciation` : ''}</div>
      </div>`
    : ''

  // ── Trend color ──
  const trendColor = mTrend === 'appreciating' ? '#34d399' : mTrend === 'declining' ? '#f87171' : '#fbbf24'

  // ── Price per sqft note ──
  const psfNote = pPsf ? ` at $${Math.round(pPsf)}/sf` : ''

  // ── Build full HTML ──
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>CMA Report — ${esc(address)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Playfair+Display:wght@600;700&display=swap" rel="stylesheet">
<style>
  :root {
    --primary: ${primaryColor};
    --primary-light: ${primaryColor}cc;
    --primary-dark: ${primaryColor};
    --primary-bg: ${primaryColor}0f;
    --primary-border: ${primaryColor}26;
    --accent: #f59e0b;
    --green: #059669;
    --green-bg: rgba(5,150,105,.08);
    --red: #dc2626;
    --red-bg: rgba(220,38,38,.06);
    --text: ${isDark ? '#e4e4e7' : '#1e293b'};
    --text-secondary: ${isDark ? '#a1a1aa' : '#64748b'};
    --text-muted: ${isDark ? '#71717a' : '#94a3b8'};
    --bg: ${isDark ? '#0a0a14' : '#ffffff'};
    --bg-subtle: ${isDark ? '#12121a' : '#f8fafc'};
    --bg-card: ${isDark ? '#18181b' : '#ffffff'};
    --border: ${isDark ? '#27272a' : '#e2e8f0'};
    --border-light: ${isDark ? '#1e1e24' : '#f1f5f9'};
    --shadow-sm: 0 1px 2px rgba(0,0,0,.05);
    --shadow: 0 4px 24px rgba(0,0,0,.06);
    --shadow-lg: 0 12px 40px rgba(0,0,0,.08);
    --radius: 16px;
    --radius-sm: 10px;
  }

  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    font-family: 'Inter', -apple-system, system-ui, 'Segoe UI', Roboto, sans-serif;
    color: var(--text);
    background: var(--bg-subtle);
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
  }

  .page {
    max-width: 1100px;
    margin: 0 auto;
    background: var(--bg);
  }

  /* ── Print — CRITICAL: makes cover page print correctly ── */
  @media print {
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
    body { background: white !important; margin: 0 !important; padding: 0 !important; }
    .page { max-width: none; box-shadow: none; }
    .cover {
      min-height: 0 !important;
      height: auto !important;
      padding: 60px 56px 40px !important;
      page-break-after: always;
      page-break-inside: avoid;
      display: block !important;
    }
    .cover::before, .cover::after { display: none !important; }
    .cover-agent {
      position: relative !important;
      bottom: auto !important;
      left: auto !important;
      right: auto !important;
      margin-top: 40px !important;
    }
    .section { padding: 40px 56px !important; }
    .page-break { page-break-before: always; }
    .no-print { display: none !important; }
    .report-footer { padding: 24px 56px !important; }
  }

  /* ── Cover ── */
  .cover {
    position: relative;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 80px 72px;
    background: linear-gradient(135deg, #0f172a 0%, #1e3a5f 40%, ${primaryColor} 100%);
    color: white;
    overflow: hidden;
  }
  .cover::before {
    content: '';
    position: absolute;
    top: -200px; right: -200px;
    width: 600px; height: 600px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(59,130,246,.25) 0%, transparent 70%);
  }
  .cover::after {
    content: '';
    position: absolute;
    bottom: -150px; left: -100px;
    width: 400px; height: 400px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(245,158,11,.12) 0%, transparent 70%);
  }
  .cover-badge {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 18px;
    border-radius: 100px;
    background: rgba(255,255,255,.1);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(255,255,255,.15);
    font-size: 13px;
    font-weight: 500;
    letter-spacing: .5px;
    text-transform: uppercase;
    color: rgba(255,255,255,.85);
    margin-bottom: 32px;
    position: relative;
    z-index: 1;
    width: fit-content;
  }
  .cover-badge .dot {
    width: 8px; height: 8px;
    border-radius: 50%;
    background: var(--accent);
    animation: pulse 2s ease-in-out infinite;
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: .5; transform: scale(1.3); }
  }
  .cover h1 {
    font-family: 'Playfair Display', Georgia, serif;
    font-size: 52px;
    font-weight: 700;
    line-height: 1.15;
    margin-bottom: 16px;
    position: relative;
    z-index: 1;
  }
  .cover .address-sub {
    font-size: 22px;
    font-weight: 300;
    color: rgba(255,255,255,.7);
    margin-bottom: 48px;
    position: relative;
    z-index: 1;
  }
  .cover-meta {
    display: flex;
    gap: 40px;
    position: relative;
    z-index: 1;
  }
  .cover-meta-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .cover-meta-label {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 1px;
    text-transform: uppercase;
    color: rgba(255,255,255,.45);
  }
  .cover-meta-value {
    font-size: 18px;
    font-weight: 600;
    color: white;
  }
  .cover-agent {
    position: absolute;
    bottom: 48px;
    left: 72px;
    right: 72px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: 24px;
    border-top: 1px solid rgba(255,255,255,.12);
    z-index: 1;
  }
  .agent-info {
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .agent-avatar {
    width: 48px; height: 48px;
    border-radius: 50%;
    background: linear-gradient(135deg, var(--primary), var(--accent));
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 17px;
    color: white;
    flex-shrink: 0;
  }
  .agent-photo {
    width: 48px; height: 48px;
    border-radius: 50%;
    object-fit: cover;
    border: 2px solid rgba(255,255,255,.2);
    flex-shrink: 0;
  }
  .agent-name { font-weight: 600; font-size: 15px; }
  .agent-title { font-size: 13px; color: rgba(255,255,255,.5); }
  .agent-contact { font-size: 11px; color: rgba(255,255,255,.4); margin-top: 2px; }
  .cover-branding {
    font-size: 13px;
    color: rgba(255,255,255,.4);
    font-weight: 500;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 8px;
  }
  .cover-logos {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }
  .cover-logo-img {
    max-height: 36px;
    max-width: 120px;
    object-fit: contain;
  }

  /* ── Section layout ── */
  .section {
    padding: 56px 72px;
  }
  .section + .section {
    border-top: 1px solid var(--border-light);
  }
  .section-header {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-bottom: 32px;
  }
  .section-icon {
    width: 42px; height: 42px;
    border-radius: 12px;
    background: var(--primary-bg);
    border: 1px solid var(--primary-border);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    flex-shrink: 0;
  }
  .section-title {
    font-size: 22px;
    font-weight: 700;
    color: var(--text);
  }
  .section-subtitle {
    font-size: 13px;
    color: var(--text-muted);
    font-weight: 400;
  }

  /* ── Subject property ── */
  .subject-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
  }
  .subject-card {
    padding: 24px;
    border-radius: var(--radius-sm);
    background: var(--bg-subtle);
    border: 1px solid var(--border);
  }
  .subject-card.highlight {
    background: var(--primary-bg);
    border-color: var(--primary-border);
  }
  .subject-label {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: .8px;
    text-transform: uppercase;
    color: var(--text-muted);
    margin-bottom: 6px;
  }
  .subject-value {
    font-size: 28px;
    font-weight: 800;
    color: var(--text);
  }
  .subject-value.price { color: var(--primary); }
  .subject-detail-row {
    font-size: 14px;
    color: var(--text-secondary);
    margin-top: 4px;
  }
  .property-features {
    display: flex;
    gap: 32px;
    margin-top: 6px;
  }
  .property-feature {
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .property-feature-value {
    font-size: 26px;
    font-weight: 800;
    color: var(--text);
  }
  .property-feature-label {
    font-size: 12px;
    color: var(--text-muted);
    font-weight: 500;
  }

  /* ── Comps table ── */
  .comps-table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    border-radius: var(--radius-sm);
    overflow: hidden;
    border: 1px solid var(--border);
    font-size: 13.5px;
  }
  .comps-table thead { background: var(--bg-subtle); }
  .comps-table th {
    padding: 14px 16px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: .6px;
    text-transform: uppercase;
    color: var(--text-muted);
    text-align: left;
    border-bottom: 1px solid var(--border);
  }
  .comps-table th:last-child,
  .comps-table td:last-child { text-align: right; }
  .comps-table td {
    padding: 16px;
    border-bottom: 1px solid var(--border-light);
    vertical-align: middle;
  }
  .comps-table tr:last-child td { border-bottom: none; }
  .comps-table tbody tr:hover { background: var(--bg-subtle); }
  .comp-address {
    font-weight: 600;
    color: var(--text);
    margin-bottom: 2px;
  }
  .comp-meta {
    font-size: 12px;
    color: var(--text-muted);
  }
  .comp-price {
    font-weight: 700;
    color: var(--text);
    font-size: 15px;
  }
  .comp-ppsf {
    font-size: 12px;
    color: var(--text-muted);
    margin-top: 2px;
  }
  .score-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 40px; height: 40px;
    border-radius: 50%;
    font-weight: 800;
    font-size: 13px;
  }
  .score-high { background: var(--green-bg); color: var(--green); }
  .score-mid { background: rgba(245,158,11,.1); color: #d97706; }
  .score-low { background: var(--red-bg); color: var(--red); }

  /* ── Adjustment table ── */
  .adj-table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    border-radius: var(--radius-sm);
    overflow: hidden;
    border: 1px solid var(--border);
    font-size: 13px;
  }
  .adj-table thead { background: var(--bg-subtle); }
  .adj-table th {
    padding: 12px 16px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: .6px;
    text-transform: uppercase;
    color: var(--text-muted);
    text-align: center;
    border-bottom: 1px solid var(--border);
  }
  .adj-table th:first-child { text-align: left; }
  .adj-table td {
    padding: 12px 16px;
    text-align: center;
    border-bottom: 1px solid var(--border-light);
  }
  .adj-table td:first-child { text-align: left; font-weight: 600; }
  .adj-table tr:last-child td { border-bottom: none; }
  .adj-table .total-row { background: var(--primary-bg); font-weight: 700; }
  .adj-positive { color: var(--green); font-weight: 600; }
  .adj-negative { color: var(--red); font-weight: 600; }

  /* ── Stats cards ── */
  .stats-row {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
  }
  .stat-card {
    padding: 24px;
    border-radius: var(--radius-sm);
    background: var(--bg-subtle);
    border: 1px solid var(--border);
    text-align: center;
  }
  .stat-value {
    font-size: 32px;
    font-weight: 800;
    color: var(--primary);
    margin-bottom: 4px;
  }
  .stat-label {
    font-size: 12px;
    font-weight: 600;
    letter-spacing: .5px;
    text-transform: uppercase;
    color: var(--text-muted);
  }
  .stat-note {
    font-size: 12px;
    color: var(--text-secondary);
    margin-top: 6px;
  }

  /* ── Pricing strategy ── */
  .price-ladder {
    display: flex;
    align-items: stretch;
    gap: 0;
    border-radius: var(--radius);
    overflow: hidden;
    border: 1px solid var(--border);
  }
  .price-tier {
    flex: 1;
    padding: 32px 24px;
    text-align: center;
    border-right: 1px solid var(--border);
    background: var(--bg);
  }
  .price-tier:last-child { border-right: none; }
  .price-tier.recommended {
    background: linear-gradient(180deg, ${primaryColor}0f 0%, ${primaryColor}05 100%);
    border: 2px solid var(--primary);
    border-radius: var(--radius);
    position: relative;
    z-index: 1;
    margin: -1px;
    box-shadow: var(--shadow);
  }
  .price-tier-label {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 1px;
    text-transform: uppercase;
    color: var(--text-muted);
    margin-bottom: 8px;
  }
  .price-tier.recommended .price-tier-label { color: var(--primary); }
  .rec-badge {
    display: inline-block;
    padding: 4px 12px;
    border-radius: 100px;
    background: var(--primary);
    color: white;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: .8px;
    text-transform: uppercase;
    margin-bottom: 12px;
  }
  .price-tier-value {
    font-size: 34px;
    font-weight: 800;
    color: var(--text);
    margin-bottom: 8px;
  }
  .price-tier.recommended .price-tier-value {
    color: var(--primary);
    font-size: 38px;
  }
  .price-tier-note {
    font-size: 13px;
    color: var(--text-secondary);
    line-height: 1.5;
  }
  .strategy-narrative {
    margin-top: 28px;
    padding: 28px;
    border-radius: var(--radius-sm);
    background: var(--bg-subtle);
    border: 1px solid var(--border);
    font-size: 15px;
    line-height: 1.7;
    color: var(--text-secondary);
  }
  .strategy-narrative strong { color: var(--text); }

  /* ── Executive summary ── */
  .summary-box {
    padding: 36px;
    border-radius: var(--radius);
    background: linear-gradient(135deg, #0f172a, #1e3a5f);
    color: white;
  }
  .summary-box h3 {
    font-family: 'Playfair Display', Georgia, serif;
    font-size: 24px;
    font-weight: 700;
    margin-bottom: 16px;
  }
  .summary-box p {
    font-size: 15px;
    line-height: 1.8;
    color: rgba(255,255,255,.8);
  }
  .key-point {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    margin-top: 16px;
    padding: 16px;
    border-radius: var(--radius-sm);
    background: rgba(255,255,255,.06);
    border: 1px solid rgba(255,255,255,.08);
  }
  .key-point-icon {
    width: 28px; height: 28px;
    border-radius: 8px;
    background: rgba(59,130,246,.2);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    font-size: 14px;
  }
  .key-point p {
    font-size: 14px;
    color: rgba(255,255,255,.75);
    line-height: 1.6;
  }

  /* ── Footer ── */
  .report-footer {
    padding: 32px 72px;
    background: var(--bg-subtle);
    border-top: 1px solid var(--border);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .footer-left {
    font-size: 12px;
    color: var(--text-muted);
    line-height: 1.6;
  }
  .footer-right {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 12px;
    color: var(--text-muted);
    font-weight: 500;
  }
  .rg-logo {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: 8px;
    background: var(--primary-bg);
    border: 1px solid var(--primary-border);
    color: var(--primary);
    font-weight: 700;
    font-size: 12px;
    letter-spacing: .3px;
  }

  /* ── Responsive ── */
  @media (max-width: 768px) {
    .cover { padding: 48px 32px; }
    .cover h1 { font-size: 32px; }
    .cover .address-sub { font-size: 16px; }
    .cover-meta { flex-wrap: wrap; gap: 20px; }
    .cover-agent { left: 32px; right: 32px; bottom: 32px; flex-direction: column; gap: 12px; }
    .section { padding: 40px 32px; }
    .subject-grid { grid-template-columns: 1fr; }
    .stats-row { grid-template-columns: 1fr 1fr; }
    .price-ladder { flex-direction: column; }
    .price-tier.recommended { margin: 0; }
    .comps-table { font-size: 12px; }
    .comps-table th, .comps-table td { padding: 10px 8px; }
    .report-footer { padding: 24px 32px; flex-direction: column; gap: 12px; }
  }
</style>
</head>
<body>
<div class="page">

  <!-- ═══════════════════════════════════════════════════════
       COVER PAGE
       ═══════════════════════════════════════════════════════ -->
  <div class="cover">
    <div class="cover-badge">
      <span class="dot"></span>
      Comparative Market Analysis
    </div>

    <h1>${esc(streetAddr)}</h1>
    <div class="address-sub">${esc(cityStateZip)}</div>

    <div class="cover-meta">
      <div class="cover-meta-item">
        <div class="cover-meta-label">Property Type</div>
        <div class="cover-meta-value">${esc(String(pType))}</div>
      </div>
      <div class="cover-meta-item">
        <div class="cover-meta-label">Report Date</div>
        <div class="cover-meta-value">${reportDate}</div>
      </div>
      <div class="cover-meta-item">
        <div class="cover-meta-label">Comps Analyzed</div>
        <div class="cover-meta-value">${mCount}</div>
      </div>
      <div class="cover-meta-item">
        <div class="cover-meta-label">Market Trend</div>
        <div class="cover-meta-value" style="color: ${trendColor};">${mTrend.charAt(0).toUpperCase() + mTrend.slice(1)}</div>
      </div>
    </div>

    <div class="cover-agent">
      <div class="agent-info">
        ${avatarHtml}
        <div>
          <div class="agent-name">${esc(agentName)}</div>
          <div class="agent-title">${esc(teamName)}</div>
          ${contactLine}
        </div>
      </div>
      <div class="cover-branding">
        ${logosHtml}
        <span style="opacity:.5">Powered by RealtyGrind AI</span>
      </div>
    </div>
  </div>

  <!-- ═══════════════════════════════════════════════════════
       SUBJECT PROPERTY
       ═══════════════════════════════════════════════════════ -->
  <div class="section">
    <div class="section-header">
      <div class="section-icon">🏠</div>
      <div>
        <div class="section-title">Subject Property</div>
        <div class="section-subtitle">${esc(address)}</div>
      </div>
    </div>

    <div class="subject-grid">
      <div class="subject-card highlight">
        <div class="subject-label">Estimated Value Range</div>
        <div class="subject-value price">${$(pLow)} – ${$(pHigh)}</div>
        <div class="subject-detail-row">AI-adjusted based on ${mCount} comparable sales${psfNote}</div>
      </div>
      <div class="subject-card">
        <div class="subject-label">Property Details</div>
        <div class="property-features">
          <div class="property-feature">
            <div class="property-feature-value">${beds}</div>
            <div class="property-feature-label">Beds</div>
          </div>
          <div class="property-feature">
            <div class="property-feature-value">${baths}</div>
            <div class="property-feature-label">Baths</div>
          </div>
          <div class="property-feature">
            <div class="property-feature-value">${sqft}</div>
            <div class="property-feature-label">Sq Ft</div>
          </div>
          <div class="property-feature">
            <div class="property-feature-value">${lot}</div>
            <div class="property-feature-label">Lot SF</div>
          </div>
          <div class="property-feature">
            <div class="property-feature-value">${yearBuilt}</div>
            <div class="property-feature-label">Built</div>
          </div>
        </div>
      </div>
      ${assessedCard}
      ${lastSaleCard}
    </div>
  </div>

  <!-- ═══════════════════════════════════════════════════════
       COMPARABLE SALES
       ═══════════════════════════════════════════════════════ -->
  <div class="section page-break">
    <div class="section-header">
      <div class="section-icon">📊</div>
      <div>
        <div class="section-title">Comparable Sales</div>
        <div class="section-subtitle">Top ${topComps.length} comps selected by AI &middot; Sold within ${daysBack} days &middot; ${searchRadius} mile radius</div>
      </div>
    </div>

    <table class="comps-table">
      <thead>
        <tr>
          <th>Address</th>
          <th>Sold Price</th>
          <th>Beds / Baths</th>
          <th>Sq Ft</th>
          <th>Sold Date</th>
          <th>Distance</th>
          <th>Score</th>
        </tr>
      </thead>
      <tbody>
${compsRows}
      </tbody>
    </table>
  </div>

  <!-- ═══════════════════════════════════════════════════════
       ADJUSTMENT ANALYSIS
       ═══════════════════════════════════════════════════════ -->
  <div class="section">
    <div class="section-header">
      <div class="section-icon">⚖️</div>
      <div>
        <div class="section-title">Adjustment Analysis</div>
        <div class="section-subtitle">AI-calculated adjustments relative to subject property</div>
      </div>
    </div>

    <table class="adj-table">
      <thead>
        <tr><th>Feature</th>${adjHeaders}</tr>
      </thead>
      <tbody>
        ${adjSoldRow}
        ${adjRow('Sq Ft Adj', 'sqft')}
        ${adjRow('Bed/Bath Adj', 'bedrooms')}
        ${adjRow('Lot Size Adj', 'lotSize')}
        ${adjRow('Age/Condition', 'age')}
        ${adjTotalRow}
      </tbody>
    </table>
  </div>

  <!-- ═══════════════════════════════════════════════════════
       MARKET CONTEXT
       ═══════════════════════════════════════════════════════ -->
  <div class="section page-break">
    <div class="section-header">
      <div class="section-icon">📈</div>
      <div>
        <div class="section-title">Market Context</div>
        <div class="section-subtitle">${esc(cityStateZip)} &middot; Last ${daysBack} days &middot; ${mType.charAt(0).toUpperCase() + mType.slice(1)} market</div>
      </div>
    </div>

    <div class="stats-row">
      <div class="stat-card">
        <div class="stat-value">${$(mAvg)}</div>
        <div class="stat-label">Avg Sale Price</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${$(mMedian)}</div>
        <div class="stat-label">Median Price</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${$(mPsf)}</div>
        <div class="stat-label">Avg $/Sq Ft</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${mDom || 'N/A'}</div>
        <div class="stat-label">Avg Days on Market</div>
      </div>
    </div>
  </div>

  <!-- ═══════════════════════════════════════════════════════
       PRICING STRATEGY
       ═══════════════════════════════════════════════════════ -->
  <div class="section">
    <div class="section-header">
      <div class="section-icon">🎯</div>
      <div>
        <div class="section-title">Pricing Strategy</div>
        <div class="section-subtitle">AI-recommended pricing based on adjusted comp analysis</div>
      </div>
    </div>

    <div class="price-ladder">
      <div class="price-tier">
        <div class="price-tier-label">Aggressive</div>
        <div class="price-tier-value">${$(pLow)}</div>
        <div class="price-tier-note">Priced to generate multiple offers and sell quickly.</div>
      </div>
      <div class="price-tier recommended">
        <div class="rec-badge">AI Recommended</div>
        <div class="price-tier-label">${pStrategy === 'competitive' ? 'Competitive' : pStrategy === 'aggressive' ? 'Aggressive' : 'Conservative'}</div>
        <div class="price-tier-value">${$(pRec)}</div>
        <div class="price-tier-note">Best balance of market positioning and value maximization.</div>
      </div>
      <div class="price-tier">
        <div class="price-tier-label">Aspirational</div>
        <div class="price-tier-value">${$(pHigh)}</div>
        <div class="price-tier-note">Tests the upper end. May require patience and price flexibility.</div>
      </div>
    </div>
    <div class="strategy-narrative"><strong>Pricing Rationale:</strong> ${pReasoning}</div>
  </div>

  <!-- ═══════════════════════════════════════════════════════
       EXECUTIVE SUMMARY
       ═══════════════════════════════════════════════════════ -->
  <div class="section">
    <div class="summary-box">
      <h3>Executive Summary</h3>
      <p>${esc(executiveSummary)}</p>
      ${keyPointsHtml}
    </div>
  </div>

  <!-- ═══════════════════════════════════════════════════════
       FOOTER
       ═══════════════════════════════════════════════════════ -->
  <div class="report-footer">
    <div class="footer-left">
      ${teamLogos.length > 0 ? `<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">${teamLogos.map(l => `<img src="${esc(l)}" alt="" style="max-height:28px;max-width:100px;object-fit:contain;">`).join('')}</div>` : ''}
      This report was generated using AI analysis and should be used as a guide, not a formal appraisal.<br>
      Data sourced from public records and comparable sales. &copy; ${reportYear} ${esc(teamName || 'RealtyGrind')}.
    </div>
    <div class="footer-right">
      <div style="text-align:right;">
        ${agentName ? `<div style="font-weight:600;color:var(--text);font-size:13px;">${esc(agentName)}</div>` : ''}
        ${agentPhone ? `<div>${esc(agentPhone)}</div>` : ''}
        ${agentEmail ? `<div>${esc(agentEmail)}</div>` : ''}
        ${agentLicense ? `<div style="font-size:11px;color:var(--text-muted);">Lic# ${esc(agentLicense)}</div>` : ''}
      </div>
      <span class="rg-logo">RG</span>
    </div>
  </div>

</div>
</body>
</html>`
}

// ══════════════════════════════════════════════════════════════════════════════
// Phase 2: Background generation handler
// ══════════════════════════════════════════════════════════════════════════════
async function handleBackgroundGeneration(
  params: Record<string, unknown>,
  supabaseUrl: string,
  serviceRoleKey: string,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const reportId = params.reportId as string
  const userId = params.userId as string
  const teamId = params.teamId as string | null
  const address = params.address as string
  const style = params.style as string
  const cmaTheme = (params.cmaTheme as string) || 'light'
  const colorScheme = params.colorScheme as string
  const searchRadius = (params.searchRadius as number) || 2
  const daysBack = (params.daysBack as number) || 180
  const maxComps = (params.maxComps as number) || 15
  const propertyType = (params.propertyType as string) || 'Single Family'
  const profileData = (params.profileData || {}) as Record<string, string>

  async function markFailed(errorMsg?: string) {
    await admin.from('cma_reports').update({
      status: 'failed',
      updated_at: new Date().toISOString(),
    }).eq('id', reportId)
    if (errorMsg) console.error(`CMA ${reportId} failed:`, errorMsg)
  }

  try {
    // ── Step 1: Fetch subject property from RentCast ───────────────────────
    const rentcastKey = Deno.env.get('REALTYMOLE_API_KEY')
    if (!rentcastKey) {
      await markFailed('REALTYMOLE_API_KEY (RentCast) not configured')
      return json({ error: 'Property data service not configured' }, 500)
    }

    const encodedAddr = encodeURIComponent(address)
    const rcHeaders = { 'X-Api-Key': rentcastKey, 'Accept': 'application/json' }

    console.log(`CMA ${reportId}: Fetching subject property...`)
    let subjectData: Record<string, unknown> = {}
    try {
      const subjectRes = await fetch(
        `https://api.rentcast.io/v1/properties?address=${encodedAddr}`,
        { headers: rcHeaders }
      )
      if (subjectRes.ok) {
        const subjectArr = await subjectRes.json()
        subjectData = Array.isArray(subjectArr) && subjectArr.length > 0 ? subjectArr[0] : subjectArr
      } else {
        console.warn('RentCast property lookup returned', subjectRes.status)
      }
    } catch (err) {
      console.warn('RentCast property fetch failed (continuing):', err)
    }

    // Fetch comparable sales
    let compsRaw: unknown[] = []
    const subjectLat = subjectData.latitude as number | undefined
    const subjectLng = subjectData.longitude as number | undefined
    try {
      const compsUrl = subjectLat && subjectLng
        ? `https://api.rentcast.io/v1/properties?latitude=${subjectLat}&longitude=${subjectLng}&radius=${searchRadius}&saleDateRange=${daysBack}&propertyType=${encodeURIComponent(propertyType)}&limit=${maxComps}`
        : `https://api.rentcast.io/v1/properties?address=${encodedAddr}&radius=${searchRadius}&saleDateRange=${daysBack}&propertyType=${encodeURIComponent(propertyType)}&limit=${maxComps}`
      const compsRes = await fetch(compsUrl, { headers: rcHeaders })
      if (compsRes.ok) {
        const compsBody = await compsRes.json()
        const allComps = Array.isArray(compsBody) ? compsBody : []
        const subjectAddr = (subjectData.formattedAddress as string || address).toLowerCase()
        compsRaw = allComps.filter((c: Record<string, unknown>) =>
          (c.formattedAddress as string || '').toLowerCase() !== subjectAddr
        )
      } else {
        console.warn('RentCast comps lookup returned', compsRes.status)
      }
    } catch (err) {
      console.warn('RentCast comps fetch failed:', err)
    }

    if (compsRaw.length === 0) {
      await markFailed('No comparable sales found for this address')
      return json({ error: 'No comparable sales found' }, 400)
    }

    console.log(`CMA ${reportId}: Found ${compsRaw.length} comps. Starting Claude analysis...`)

    // ── Step 2: Claude analysis (ONLY call — no HTML generation) ──────────
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicKey) {
      await markFailed('ANTHROPIC_API_KEY not configured')
      return json({ error: 'AI service not configured' }, 500)
    }

    const analysisPrompt = `You are a real estate CMA analyst. Analyze the subject property and comparable sales, then return ONLY valid JSON (no markdown, no code fences).

SUBJECT PROPERTY:
Address: ${address}
${JSON.stringify(subjectData, null, 2)}

COMPARABLE SALES (${compsRaw.length} comps):
${JSON.stringify(compsRaw, null, 2)}

Return this exact JSON structure:
{
  "comps_analyzed": [
    { "address": "string", "salePrice": number, "saleDate": "string", "bedrooms": number, "bathrooms": number, "squareFootage": number, "lotSize": number, "yearBuilt": number, "distance": number, "relevanceScore": 0-100, "adjustedPrice": number, "adjustments": { "sqft": number, "bedrooms": number, "bathrooms": number, "lotSize": number, "age": number, "condition": number, "total": number }, "notes": "string" }
  ],
  "pricing_strategy": { "recommended_price": number, "low": number, "high": number, "price_per_sqft": number, "strategy": "aggressive/competitive/conservative", "reasoning": "2-3 sentences" },
  "market_context": { "avg_sale_price": number, "median_sale_price": number, "avg_price_per_sqft": number, "avg_dom": number, "price_trend": "appreciating/stable/declining", "market_type": "seller's/balanced/buyer's", "comp_count": number },
  "executive_summary": "3-5 sentence professional summary"
}

Sort comps by relevanceScore descending. Use top 6-8 most relevant for pricing. Adjustments in dollars.`

    let analysisData: Record<string, unknown> = {}
    try {
      const res1 = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 4096,
          messages: [{ role: 'user', content: analysisPrompt }],
        }),
      })
      if (!res1.ok) {
        const errText = await res1.text()
        await markFailed(`Claude analysis error: ${res1.status} ${errText}`)
        return json({ error: 'AI analysis failed' }, 502)
      }
      const data1 = await res1.json()
      let text1 = ''
      for (const block of (data1.content || [])) {
        if (block.type === 'text') text1 += block.text
      }
      text1 = text1.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '').trim()
      analysisData = JSON.parse(text1)
      console.log(`CMA ${reportId}: Analysis complete, ${(analysisData.comps_analyzed as unknown[])?.length || 0} comps scored`)
    } catch (err) {
      await markFailed(`Analysis parse error: ${String(err)}`)
      return json({ error: 'AI analysis failed' }, 502)
    }

    const compsAnalyzed = (analysisData.comps_analyzed as Array<Record<string, unknown>>) || []
    const pricingStrategy = (analysisData.pricing_strategy as Record<string, unknown>) || {}
    const marketContext = (analysisData.market_context as Record<string, unknown>) || {}
    const executiveSummary = (analysisData.executive_summary as string) || ''

    // ── Step 3: Build HTML from template (no AI needed) ──────────────────
    console.log(`CMA ${reportId}: Building HTML from template...`)
    const isDark = cmaTheme === 'dark'
    const primaryColor = colorScheme || '#2563eb'

    // Pick theme-appropriate logos (fall back to light if no dark)
    const lightLogos = (profileData?.teamLogos as string[]) || []
    const darkLogos = (profileData?.teamLogosDark as string[]) || []
    const teamLogos = isDark ? (darkLogos.length > 0 ? darkLogos : lightLogos) : lightLogos

    const reportHtml = buildReportHtml({
      address,
      subjectData,
      compsAnalyzed,
      pricingStrategy,
      marketContext,
      executiveSummary,
      primaryColor,
      isDark,
      teamName: (profileData?.teamName as string) || '',
      agentName: (profileData?.agentName as string) || '',
      agentEmail: (profileData?.agentEmail as string) || '',
      agentPhone: (profileData?.agentPhone as string) || '',
      agentLicense: (profileData?.agentLicense as string) || '',
      agentAvatar: (profileData?.agentAvatar as string) || '',
      teamLogos,
      propertyType,
      daysBack,
      searchRadius,
    })

    console.log(`CMA ${reportId}: Template built, ${reportHtml.length} chars`)

    // ── Step 4: Save to database ────────────────────────────────────────────
    const { error: updateErr } = await admin.from('cma_reports').update({
      subject_data: subjectData,
      comps_raw: compsRaw,
      comps_analyzed: compsAnalyzed,
      pricing_strategy: pricingStrategy,
      market_context: marketContext,
      html: reportHtml,
      status: 'ready',
      updated_at: new Date().toISOString(),
    }).eq('id', reportId)

    if (updateErr) {
      console.error('Failed to save CMA report:', updateErr.message)
      return json({ error: 'Failed to save report' }, 500)
    }

    console.log(`CMA ${reportId}: DONE — report saved`)
    return json({ id: reportId, status: 'ready' })

  } catch (err) {
    console.error('CMA background generation error:', err)
    await markFailed(String(err))
    return json({ error: 'Report generation failed' }, 500)
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// Main handler — Phase 1 (fast) + Phase 2 dispatch
// ══════════════════════════════════════════════════════════════════════════════
Deno.serve(async (req) => {
  const CORS = getCorsHeaders(req)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  try {
    const ct = req.headers.get('content-type') || ''
    if (!ct.includes('application/json')) {
      return new Response(
        JSON.stringify({ error: 'Content-Type must be application/json' }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    let body: Record<string, unknown>
    try { body = await req.json() } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON body' }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    // ── Phase 2: Background mode (self-call) ──
    if (body._bgMode) {
      return handleBackgroundGeneration(body, supabaseUrl, serviceRoleKey, CORS)
    }

    // ── Phase 1: Auth + validate + create row + dispatch ──
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing Authorization header' }),
        { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    // Fetch profile + team
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data: profile } = await admin
      .from('profiles')
      .select('*, teams(id, name, created_by, team_prefs, cma_addon_status, cma_generations_used, cma_generations_reset, presentations_addon_status)')
      .eq('id', user.id)
      .single()

    if (!profile) {
      return new Response(
        JSON.stringify({ error: 'Profile not found' }),
        { status: 404, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    // Check add-on access
    const isAdmin = profile.app_role === 'admin'
    if (!isAdmin) {
      const team = profile.teams
      if (!team) {
        return new Response(
          JSON.stringify({ error: 'CMA Builder requires an active add-on subscription.' }),
          { status: 403, headers: { ...CORS, 'Content-Type': 'application/json' } }
        )
      }
      const cmaStatus = team.cma_addon_status
      if (cmaStatus !== 'active' && cmaStatus !== 'trialing') {
        return new Response(
          JSON.stringify({ error: 'CMA Builder add-on is not active. Subscribe from Billing.' }),
          { status: 403, headers: { ...CORS, 'Content-Type': 'application/json' } }
        )
      }
      const cmaEnabled = team.team_prefs?.ai_tools?.cma_enabled !== false
      if (!cmaEnabled) {
        return new Response(
          JSON.stringify({ error: 'CMA Builder is disabled by your team admin.' }),
          { status: 403, headers: { ...CORS, 'Content-Type': 'application/json' } }
        )
      }
    }

    // Check monthly generation limit
    const teamId = profile.team_id
    if (teamId && !isAdmin) {
      const team = profile.teams
      const resetMonth = team?.cma_generations_reset
      const currentMo = currentMonth()
      let used = team?.cma_generations_used || 0
      if (resetMonth !== currentMo) {
        await admin.from('teams').update({
          cma_generations_used: 0,
          cma_generations_reset: currentMo,
        }).eq('id', teamId)
        used = 0
      }
      if (used >= TEAM_CMA_LIMIT) {
        return new Response(
          JSON.stringify({ error: `Monthly CMA generation limit (${TEAM_CMA_LIMIT}) reached. Resets next month.` }),
          { status: 429, headers: { ...CORS, 'Content-Type': 'application/json' } }
        )
      }
      await admin.from('teams').update({
        cma_generations_used: used + 1,
        cma_generations_reset: currentMo,
      }).eq('id', teamId)
    }

    // Validate input
    const address = (body.address as string || '').trim()
    if (!address) {
      return new Response(
        JSON.stringify({ error: 'Address is required' }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    const style = (['modern', 'classic', 'minimal', 'bold'].includes(body.style as string))
      ? body.style as string : 'modern'
    const cmaTheme = body.theme === 'dark' ? 'dark' : 'light'
    const colorScheme = /^#[0-9a-fA-F]{6}$/.test(body.colorScheme as string || '')
      ? body.colorScheme as string : '#2563eb'
    const searchRadius = Math.min(Math.max(Number(body.searchRadius) || 2, 0.5), 10)
    const daysBack = [90, 180, 365].includes(Number(body.daysBack)) ? Number(body.daysBack) : 180
    const maxComps = [10, 15, 20].includes(Number(body.maxComps)) ? Number(body.maxComps) : 15
    const propertyType = (body.propertyType as string) || 'Single Family'

    // Create report row
    const { data: report, error: insertErr } = await admin.from('cma_reports').insert({
      user_id: user.id,
      team_id: teamId,
      subject_address: address,
      status: 'generating',
      style,
      theme: cmaTheme,
      color_scheme: colorScheme,
      search_radius: searchRadius,
      days_back: daysBack,
      max_comps: maxComps,
      property_type: propertyType,
    }).select('id').single()

    if (insertErr || !report) {
      console.error('Failed to create CMA report row:', insertErr?.message)
      return new Response(
        JSON.stringify({ error: 'Failed to create report' }),
        { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    // Gather profile data for branding
    const team = profile.teams
    const aiTools = team?.team_prefs?.ai_tools || {}

    // Multi-logo support (backward compat with old single fields)
    const lightLogos: string[] = aiTools.presentation_logos || (aiTools.presentation_logo ? [aiTools.presentation_logo] : [])
    const darkLogos: string[] = aiTools.presentation_logos_dark || (aiTools.presentation_logo_dark ? [aiTools.presentation_logo_dark] : [])

    const profileDataObj: Record<string, unknown> = {}
    profileDataObj.teamName = team?.name || ''
    profileDataObj.teamLogos = lightLogos
    profileDataObj.teamLogosDark = darkLogos
    profileDataObj.agentName = profile.full_name || ''
    profileDataObj.agentEmail = profile.email || user.email || ''
    profileDataObj.agentPhone = profile.habit_prefs?.bio?.phone || profile.phone || ''
    profileDataObj.agentLicense = profile.habit_prefs?.bio?.license || profile.license_number || ''
    profileDataObj.agentAvatar = profile.goals?.avatar_url || ''

    // Self-call for background processing
    const bgBody = {
      _bgMode: true,
      reportId: report.id,
      userId: user.id,
      teamId,
      address,
      style,
      cmaTheme,
      colorScheme,
      searchRadius,
      daysBack,
      maxComps,
      propertyType,
      profileData: profileDataObj,
    }

    const fnUrl = `${supabaseUrl}/functions/v1/generate-cma`
    fetch(fnUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify(bgBody),
    }).catch(err => console.error('Background self-call failed:', err))

    // Return immediately
    return new Response(
      JSON.stringify({ id: report.id, status: 'generating' }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    console.error('generate-cma error:', err)
    return new Response(
      JSON.stringify({ error: 'CMA generation is temporarily unavailable.' }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }
})
