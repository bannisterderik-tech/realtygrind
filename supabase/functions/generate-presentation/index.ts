// supabase/functions/generate-presentation/index.ts
// Generates an HTML slideshow presentation using Claude. Returns the full HTML
// and saves/updates the presentation in the database.
//
// Architecture: Two-phase background generation
//   Phase 1 (fast): Auth → validate → create row (status='generating') → self-call → return immediately
//   Phase 2 (background): Claude API → build HTML → save (status='ready')
//
// Required Supabase secrets:
//   ANTHROPIC_API_KEY           — sk-ant-...
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

const CREDIT_LIMITS: Record<string, number> = {
  solo: 50,
  team: 250,
  brokerage: 500,
}

// Monthly presentation generation limit per team
const TEAM_PRESENTATION_LIMIT = 45

function currentMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function postProcessSlides(html: string, teamLogo: string | null): string {
  // Auto-assign data-layout to sections missing it (fallback if AI omits)
  html = html.replace(/<section([^>]*)>/gi, (match, attrs: string) => {
    if (/data-layout/i.test(attrs)) return match
    if (/title-slide|closing-slide/i.test(attrs)) return match
    // Peek at content after this tag to infer layout
    const idx = html.indexOf(match) + match.length
    const snippet = html.slice(idx, idx + 600)
    if (/<blockquote/i.test(snippet)) return `<section${attrs} data-layout="quote">`
    if (/stats-row|stat-card/i.test(snippet)) return `<section${attrs} data-layout="stats">`
    if (/features-grid|class="feature"/i.test(snippet)) return `<section${attrs} data-layout="features">`
    if (/col-wrap|class="col"/i.test(snippet)) return `<section${attrs} data-layout="two-col">`
    if (/highlight-box/i.test(snippet)) return `<section${attrs} data-layout="highlight">`
    return match
  })

  // Inject logo into title slide
  if (teamLogo) {
    html = html.replace(
      /(<section[^>]*title-slide[^>]*>)/i,
      `$1\n<img src="${teamLogo}" class="team-logo" alt="Logo">`
    )
  }

  // Strip stray style/script tags from AI output
  html = html.replace(/<style[\s\S]*?<\/style>/gi, '')
  html = html.replace(/<script[\s\S]*?<\/script>/gi, '')

  return html
}

const VALID_STYLES = ['modern', 'classic', 'minimal', 'bold']
const VALID_THEMES = ['light', 'dark']
const VALID_FONTS  = ['sans-serif', 'serif', 'monospace']
const VALID_COLORS = ['blue', 'gold', 'green', 'purple', 'red', 'neutral']
const HEX_RE = /^#[0-9a-fA-F]{6}$/

function esc(s: string) { return s.replace(/</g, '&lt;').replace(/"/g, '&quot;') }

// Derive accent/glow/secondary from a hex primary color
function hexToRgb(hex: string) {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const
}
function rgbToHex(r: number, g: number, b: number) {
  return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')
}
function deriveColorSet(hex: string) {
  const [r, g, b] = hexToRgb(hex)
  // Accent: lighter version (mix toward white)
  const accent = rgbToHex(r + (255 - r) * 0.45, g + (255 - g) * 0.45, b + (255 - b) * 0.45)
  // Secondary: shift hue slightly by rotating toward complementary
  const secondary = rgbToHex(r + (255 - r) * 0.3, g + (255 - g) * 0.2, b + (255 - b) * 0.55)
  return { primary: hex, accent, glow: `${r},${g},${b}`, secondary }
}

// ══════════════════════════════════════════════════════════════════════════════
// Phase 2: Background generation handler
// Called internally by the function itself after Phase 1 returns to the client
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

  const presentationId = params.presentationId as string
  const userId = params.userId as string
  const teamId = params.teamId as string | null
  const isAdmin = params.isAdmin as boolean
  const title = params.title as string
  const style = params.style as string
  const presTheme = (params.presTheme as string) || 'light'
  const font = params.font as string
  const colorScheme = params.colorScheme as string
  const content = params.content as string
  const backgroundImage = (params.backgroundImage as string) || ''
  const overlayOpacity = (params.overlayOpacity as number) ?? 15
  const creditReserved = params.creditReserved as boolean
  const creditLimit = params.creditLimit as number
  const profileData = (params.profileData || {}) as Record<string, string>

  async function markFailed() {
    await admin.from('presentations').update({
      status: 'failed',
      updated_at: new Date().toISOString(),
    }).eq('id', presentationId)
    if (creditReserved && creditLimit !== -1) {
      try { await admin.rpc('decrement_ai_credit', { user_id_param: userId }) } catch { /* best-effort */ }
    }
  }

  try {
    // ── Theme-aware logo selection ────────────────────────────────────────────
    const lightLogo = profileData?.teamLogo || profileData?.fallbackLogo || null
    const darkLogo = profileData?.teamLogoDark || profileData?.teamLogo || profileData?.fallbackLogo || null
    const hasDarkLogo = !!profileData?.teamLogoDark
    const isDarkTheme = presTheme === 'dark'
    // Bold preset title/closing always have colored bg → prefer dark-variant
    const teamLogo = isDarkTheme ? darkLogo : lightLogo
    const titleLogo = (style === 'bold') ? (darkLogo || lightLogo) : teamLogo
    const teamName = profileData?.teamName || ''

    // ── Build system prompt with 6 layout types ──────────────────────────────

    const systemPrompt = `You are a presentation builder for real estate professionals. Output ONLY a series of <section> HTML elements — one per slide. Do NOT output <!DOCTYPE>, <html>, <head>, <body>, <style>, or <script> tags. The shell template is provided separately.

RULES:
- First <section> must be the title slide with class="title-slide" and an <h1> for the title
- Last <section> must be a closing/thank-you slide with class="closing-slide"
- Each main point or bullet group = its own <section>
- Use <h2> for slide headings, <h3> for subheadings/category labels
- Use <strong> and <em> for emphasis
- Keep content concise — bullet points, not paragraphs
- Do NOT include any <img> tags — images are injected separately
- The closing slide should have a brief thank-you or closing message — agent contact info is added automatically

VARIETY IS CRITICAL — use a MIX of these layout types. NEVER use the same layout twice in a row:

1. DEFAULT — standard bullets:
<section><h3>CATEGORY</h3><h2>Slide Heading</h2><ul><li>Point one</li><li>Point two</li><li>Point three</li></ul></section>

2. TWO-COLUMN — comparisons, before/after, pros/cons:
<section data-layout="two-col"><h2>Heading</h2><div class="col-wrap"><div class="col"><h4>Left Title</h4><ul><li>Item one</li><li>Item two</li></ul></div><div class="col"><h4>Right Title</h4><ul><li>Item one</li><li>Item two</li></ul></div></div></section>

3. STATS — metrics, numbers, KPIs (use 3-4 items):
<section data-layout="stats"><h2>Heading</h2><div class="stats-row"><div class="stat-card"><div class="stat-number">$425K</div><div class="stat-label">Median Price</div></div><div class="stat-card"><div class="stat-number">12</div><div class="stat-label">Days on Market</div></div><div class="stat-card"><div class="stat-number">97%</div><div class="stat-label">List-to-Sale</div></div></div></section>

4. QUOTE — testimonials, key insights:
<section data-layout="quote"><blockquote>"The testimonial or key insight goes here."</blockquote><cite>— Attribution Name</cite></section>

5. FEATURES — services, benefits, capabilities (use 3-4 items):
<section data-layout="features"><h2>Heading</h2><div class="features-grid"><div class="feature"><div class="feature-icon">📊</div><h4>Feature Title</h4><p>Short description.</p></div><div class="feature"><div class="feature-icon">🏠</div><h4>Feature Title</h4><p>Short description.</p></div><div class="feature"><div class="feature-icon">💰</div><h4>Feature Title</h4><p>Short description.</p></div></div></section>

6. HIGHLIGHT — key callout, important announcement:
<section data-layout="highlight"><h2>Heading</h2><div class="highlight-box"><p>Important point that deserves visual emphasis.</p></div></section>

For a typical 8-12 slide presentation, aim for: 1 title, 2-3 default, 1 two-col, 1 stats, 1 quote, 1 features, 0-1 highlight, 1 closing. ALWAYS vary layouts — never put two identical layouts back-to-back.

The presentation title is: "${title}"

Output ONLY the <section> elements, nothing else. No markdown fencing, no explanation.`

    // ── Call Claude API ──────────────────────────────────────────────────────
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicKey) {
      await markFailed()
      console.error('ANTHROPIC_API_KEY not configured')
      return json({ error: 'ANTHROPIC_API_KEY not configured' }, 500)
    }

    const fetchController = new AbortController()
    const fetchTimeout = setTimeout(() => fetchController.abort(), 120000) // 120s for background

    let claudeResponse: Response
    try {
      claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 6144,
          system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
          messages: [{ role: 'user', content }],
          stream: false,
        }),
        signal: fetchController.signal,
      })
    } catch (fetchErr) {
      clearTimeout(fetchTimeout)
      await markFailed()
      console.error('Claude API fetch error:', fetchErr)
      return json({ error: 'AI service unavailable' }, 502)
    }
    clearTimeout(fetchTimeout)

    if (!claudeResponse.ok) {
      const errBody = await claudeResponse.text()
      console.error('Claude API error:', claudeResponse.status, errBody)
      await markFailed()
      return json({ error: 'AI service error' }, 502)
    }

    const claudeData = await claudeResponse.json()
    let slidesHtml = ''
    if (claudeData.content && Array.isArray(claudeData.content)) {
      for (const block of claudeData.content) {
        if (block.type === 'text') slidesHtml += block.text
      }
    }

    if (!slidesHtml.trim()) {
      await markFailed()
      return json({ error: 'Empty response from AI' }, 500)
    }

    // Strip markdown fencing if Claude wrapped it anyway
    slidesHtml = slidesHtml.trim()
    if (slidesHtml.startsWith('```html')) slidesHtml = slidesHtml.slice(7)
    else if (slidesHtml.startsWith('```')) slidesHtml = slidesHtml.slice(3)
    if (slidesHtml.endsWith('```')) slidesHtml = slidesHtml.slice(0, -3)
    slidesHtml = slidesHtml.trim()

    // Post-process: auto-detect missing layouts, strip stray tags
    slidesHtml = postProcessSlides(slidesHtml, null) // logo injected below separately

    const slideCount = (slidesHtml.match(/<section/gi) || []).length

    // ── Inject logo into title slide ────────────────────────────────────────
    if (titleLogo) {
      const titleMatch = slidesHtml.match(/<section[^>]*class="[^"]*title-slide[^"]*"[^>]*>/)
      if (titleMatch && titleMatch.index !== undefined) {
        const pos = titleMatch.index + titleMatch[0].length
        slidesHtml = slidesHtml.slice(0, pos) +
          `\n<img src="${titleLogo}" class="team-logo" alt="${esc(teamName || 'Logo')}">` +
          slidesHtml.slice(pos)
      }
    }

    // ── Inject agent CTA into closing slide ─────────────────────────────────
    const agentName = profileData?.agentName || ''
    const agentEmail = profileData?.agentEmail || ''
    const agentPhone = profileData?.agentPhone || ''
    const agentLicense = profileData?.agentLicense || ''
    const agentAvatar = profileData?.agentAvatar || ''

    const ctaParts: string[] = []
    if (agentEmail) ctaParts.push(esc(agentEmail))
    if (agentPhone) ctaParts.push(esc(agentPhone))
    if (agentLicense) ctaParts.push(`License #${esc(agentLicense)}`)

    if (agentName || ctaParts.length > 0) {
      const avatarHtml = agentAvatar
        ? `<img src="${esc(agentAvatar)}" alt="${esc(agentName)}" class="agent-avatar">`
        : ''
      const ctaHtml = `<div class="agent-cta">` +
        avatarHtml +
        (agentName ? `<div class="agent-name">${esc(agentName)}</div>` : '') +
        (ctaParts.length ? `<div class="agent-details">${ctaParts.join(' &middot; ')}</div>` : '') +
        `</div>`
      const lastClose = slidesHtml.lastIndexOf('</section>')
      if (lastClose > -1) {
        slidesHtml = slidesHtml.slice(0, lastClose) + ctaHtml + slidesHtml.slice(lastClose)
      }
    }

    // ── Inject background overlay div into each section ─────────────────────
    if (backgroundImage) {
      slidesHtml = slidesHtml.replace(/<section([^>]*)>/g, '<section$1><div class="bg-overlay"></div>')
    }

    // ── Build full HTML template ────────────────────────────────────────────
    const COLORS: Record<string, { primary: string; accent: string; glow: string; secondary: string }> = {
      blue:    { primary: '#2563eb', accent: '#38bdf8', glow: '37,99,235', secondary: '#818cf8' },
      gold:    { primary: '#d97706', accent: '#fbbf24', glow: '217,119,6', secondary: '#f59e0b' },
      green:   { primary: '#059669', accent: '#34d399', glow: '5,150,105', secondary: '#6ee7b7' },
      purple:  { primary: '#7c3aed', accent: '#c084fc', glow: '124,58,237', secondary: '#a78bfa' },
      red:     { primary: '#dc2626', accent: '#fb923c', glow: '220,38,38', secondary: '#f87171' },
      neutral: { primary: '#374151', accent: '#9ca3af', glow: '55,65,81', secondary: '#6b7280' },
    }
    const c = HEX_RE.test(colorScheme) ? deriveColorSet(colorScheme) : (COLORS[colorScheme] || COLORS.blue)
    const isDark = presTheme === 'dark'
    const bg = isDark ? '#0a0a0f' : '#fafafa'
    const bg2 = isDark ? '#12121a' : '#ffffff'
    const fg = isDark ? '#e4e4e7' : '#18181b'
    const mutedFg = isDark ? '#a1a1aa' : '#71717a'
    const subtleBorder = isDark ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.06)'
    const headingFont = font === 'serif' ? '"Playfair Display",Georgia,"Times New Roman",serif'
      : font === 'monospace' ? '"JetBrains Mono","SF Mono","Fira Code",monospace'
      : '"Inter",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif'
    const bodyFont = '"Inter",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif'
    const darkPrimary = rgbToHex(...hexToRgb(c.primary).map(v => Math.max(0, v * 0.7)) as [number, number, number])

    const logoWatermark = teamLogo
      ? `<img src="${teamLogo}" class="watermark" alt="">`
      : teamName ? `<span class="watermark-text">${esc(teamName)}</span>` : ''

    // ── Style-specific CSS overrides ──
    // Each preset completely transforms the look — not just minor tweaks
    let styleCSS = ''
    let styleBodyClass = style
    if (style === 'modern') {
      // ═══════════════════════════════════════════════════════════════
      // MODERN — Glassmorphism + gradient mesh + floating orbs
      // Think: Apple keynote meets Stripe homepage
      // ═══════════════════════════════════════════════════════════════
      styleCSS = [
        // ── Title slide: gradient mesh with floating orbs ──
        `section.title-slide{background:${isDark
          ? `linear-gradient(135deg,#0c0c1d 0%,#0f1028 30%,#0a0a18 100%)`
          : `linear-gradient(135deg,#f8faff 0%,#eef2ff 50%,#f0f4ff 100%)`};isolation:isolate}`,
        // Large floating orb top-right
        `section.title-slide::after{content:'';position:absolute;top:-20%;right:-10%;width:60vw;height:60vw;background:radial-gradient(circle,rgba(${c.glow},.15) 0%,rgba(${c.glow},.05) 30%,transparent 60%);filter:blur(40px);pointer-events:none;z-index:0}`,
        // Secondary orb bottom-left
        `section.title-slide::before{display:block;content:'';position:absolute;bottom:-20%;left:-10%;width:50vw;height:50vw;background:radial-gradient(circle,${c.accent}12 0%,transparent 55%);filter:blur(50px);pointer-events:none;z-index:0}`,
        // z-index lift for content — MUST exclude .bg-overlay so background images still work
        `section.title-slide>*:not(.bg-overlay){position:relative;z-index:1}`,
        // ── Gradient text h1 with glow ──
        `section h1{background:linear-gradient(135deg,${c.primary} 0%,${c.accent} 45%,${c.secondary} 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;filter:drop-shadow(0 0 20px rgba(${c.glow},.12))}`,
        `section.title-slide h1{font-size:4em;letter-spacing:-.05em}`,
        // ── Glassmorphic accent bar (left edge) ──
        `section::before{content:'';position:absolute;top:0;left:0;width:4px;height:100%;background:linear-gradient(180deg,${c.primary},${c.accent},${c.secondary}40,transparent);opacity:.8;border-radius:0 4px 4px 0}`,
        // ── H2 with gradient underline ──
        `section h2::after{width:48px;height:3px;background:linear-gradient(90deg,${c.primary},${c.accent});border-radius:6px;margin-top:14px}`,
        // ── Content slides: frosted glass look ──
        `section:not(.title-slide):not(.closing-slide){background:${isDark ? '#0a0a14' : '#fafbff'};isolation:isolate}`,
        // Floating accent orb on content slides
        `section:not(.title-slide):not(.closing-slide)::after{content:'';position:absolute;top:-30%;right:-20%;width:40vw;height:40vw;background:radial-gradient(circle,rgba(${c.glow},.04) 0%,transparent 50%);filter:blur(60px);pointer-events:none;z-index:0}`,
        // z-index lift for content slides — MUST exclude .bg-overlay
        `section:not(.title-slide):not(.closing-slide)>*:not(.bg-overlay){position:relative;z-index:1}`,
        // ── Bullet styling: gradient dash + glass hover ──
        `section li::before{width:24px;height:2px;background:linear-gradient(90deg,${c.primary},${c.accent});border-radius:2px;top:24px}`,
        `section li{padding-left:48px;border-radius:12px;padding-top:16px;padding-bottom:16px;margin-bottom:4px;transition:background .2s ease}`,
        // ── Agent CTA: glassmorphic ──
        `.agent-cta{background:${isDark ? 'rgba(255,255,255,.05)' : 'rgba(255,255,255,.6)'};backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);border-radius:24px;border:1px solid ${isDark ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.06)'};box-shadow:0 8px 40px rgba(${c.glow},.08)}`,
        `.agent-cta::before{border-radius:25px;background:linear-gradient(135deg,${c.primary}40,${c.accent}25,transparent 60%)}`,
        `.agent-avatar{box-shadow:0 4px 20px rgba(${c.glow},.2);border:3px solid ${isDark ? 'rgba(255,255,255,.1)' : 'rgba(255,255,255,.8)'}}`,
        // ── Nav buttons: glass ──
        `.nav-btn{border-radius:12px;background:${isDark ? 'rgba(255,255,255,.05)' : 'rgba(255,255,255,.8)'};backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border:1px solid ${isDark ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.06)'}}`,
        `.nav-btn:hover{background:linear-gradient(135deg,${c.primary},${c.accent});box-shadow:0 4px 24px rgba(${c.glow},.35)}`,
        // ── Progress bar: gradient glow ──
        `.progress{height:3px;background:linear-gradient(90deg,${c.primary},${c.accent},${c.secondary});opacity:.6}`,
        `.progress::after{background:${c.accent};box-shadow:0 0 20px rgba(${c.glow},.7),0 0 60px rgba(${c.glow},.3)}`,
        // ── Layout overrides: Modern ──
        // Stats: glass cards with gradient numbers
        `[data-layout="stats"] .stat-card{background:${isDark ? 'rgba(255,255,255,.04)' : 'rgba(255,255,255,.6)'};backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border:1px solid ${isDark ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.04)'};box-shadow:0 4px 24px rgba(${c.glow},.06)}`,
        `[data-layout="stats"] .stat-number{background:linear-gradient(135deg,${c.primary},${c.accent});-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}`,
        // Quote: gradient decorative mark
        `[data-layout="quote"] blockquote::before{color:${c.primary};opacity:.25;font-size:4em}`,
        // Features: glass cards
        `[data-layout="features"] .feature{background:${isDark ? 'rgba(255,255,255,.03)' : 'rgba(255,255,255,.5)'};backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid ${isDark ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.04)'}}`,
        // Two-col: gradient divider
        `[data-layout="two-col"] .col-wrap::after{content:'';position:absolute;top:10%;bottom:10%;left:50%;width:1px;background:linear-gradient(180deg,transparent,rgba(${c.glow},.2),rgba(${c.glow},.2),transparent)}`,
        // Highlight: gradient left border
        `[data-layout="highlight"] .highlight-box{border-left:3px solid ${c.primary};background:${isDark ? `rgba(${c.glow},.04)` : `${c.primary}06`}}`,
      ].join('\n')
    } else if (style === 'classic') {
      // ═══════════════════════════════════════════════════════════════
      // CLASSIC — Editorial elegance, refined borders, sophistication
      // Think: The Economist, Architectural Digest, premium print
      // ═══════════════════════════════════════════════════════════════
      styleCSS = [
        // ── Title slide: elegant centered with ornamental border ──
        `section.title-slide{background:${isDark ? bg2 : '#fff'};border:none}`,
        `section.title-slide::after{content:'';position:absolute;inset:40px;border:1px solid ${isDark ? 'rgba(255,255,255,.08)' : `${c.primary}15`};pointer-events:none;z-index:0}`,
        `section.title-slide::before{display:block;content:'';position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:120px;height:1px;background:${c.primary};opacity:.2;z-index:0}`,
        `section.title-slide>*:not(.bg-overlay){position:relative;z-index:1}`,
        // ── Solid h1 — no gradient, classic typesetting ──
        `section h1{color:${c.primary};-webkit-text-fill-color:${c.primary};font-weight:700;letter-spacing:-.02em;font-size:3.2em}`,
        `section.title-slide h1{font-size:3.6em;margin-bottom:24px}`,
        `section.title-slide h2{font-size:1em;font-weight:500;letter-spacing:.12em;text-transform:uppercase;color:${mutedFg}}`,
        // ── Thin accent rule (left edge) ──
        `section::before{background:${c.primary};width:2px;opacity:.15}`,
        // ── H2: full-width hairline rule ──
        `section h2{font-weight:600;letter-spacing:-.01em;color:${fg}}`,
        `section h2::after{width:100%;height:1px;background:${isDark ? 'rgba(255,255,255,.08)' : `${c.primary}18`};border-radius:0;margin-top:20px}`,
        // ── Round dot bullets — editorial style ──
        `section li::before{width:6px;height:6px;border-radius:50%;top:24px;background:${c.primary};opacity:.35}`,
        `section li{padding-left:28px;line-height:1.9;border-bottom:1px solid ${isDark ? 'rgba(255,255,255,.03)' : 'rgba(0,0,0,.03)'};padding-bottom:18px}`,
        `section li:last-child{border-bottom:none}`,
        // ── Content slides: clean white with corner ornament ──
        `section:not(.title-slide):not(.closing-slide)::after{content:'';position:absolute;top:40px;right:48px;width:56px;height:56px;border-top:1px solid ${isDark ? 'rgba(255,255,255,.06)' : `${c.primary}12`};border-right:1px solid ${isDark ? 'rgba(255,255,255,.06)' : `${c.primary}12`};pointer-events:none}`,
        // Bottom-left mirror corner
        `section:not(.title-slide):not(.closing-slide) h3::before{content:'';position:fixed;bottom:40px;left:48px;width:56px;height:56px;border-bottom:1px solid ${isDark ? 'rgba(255,255,255,.06)' : `${c.primary}12`};border-left:1px solid ${isDark ? 'rgba(255,255,255,.06)' : `${c.primary}12`};pointer-events:none}`,
        // ── Strong = small caps feel ──
        `section strong{color:${c.primary};font-weight:600;letter-spacing:.03em}`,
        // ── Agent CTA: understated ──
        `.agent-cta{background:${isDark ? 'rgba(255,255,255,.02)' : 'rgba(0,0,0,.015)'};border:1px solid ${isDark ? 'rgba(255,255,255,.06)' : `${c.primary}10`};border-radius:12px;backdrop-filter:none}`,
        `.agent-cta::before{background:none}`,
        `.agent-avatar{border:1px solid ${isDark ? 'rgba(255,255,255,.1)' : `${c.primary}20`};box-shadow:none}`,
        // ── Nav + progress: subtle ──
        `.nav-btn{border-radius:8px;border:1px solid ${isDark ? 'rgba(255,255,255,.06)' : `${c.primary}12`};background:${isDark ? 'rgba(255,255,255,.02)' : 'rgba(255,255,255,.95)'}}`,
        `.nav-btn:hover{background:${c.primary};box-shadow:none}`,
        `.progress{height:1px;opacity:.2;background:${c.primary}}`,
        `.progress::after{display:none}`,
        // ── Layout overrides: Classic ──
        // Stats: top border rule, serif numbers
        `[data-layout="stats"] .stat-card{background:transparent;border:none;border-top:1px solid ${isDark ? 'rgba(255,255,255,.08)' : `${c.primary}15`};border-radius:0;padding:32px 20px}`,
        `[data-layout="stats"] .stat-number{font-weight:700;color:${c.primary};-webkit-text-fill-color:${c.primary}}`,
        // Quote: serif character, thin frame
        `[data-layout="quote"] blockquote{font-family:${headingFont};font-weight:400}`,
        `[data-layout="quote"] blockquote::before{font-family:${headingFont};font-size:5em;opacity:.08}`,
        `[data-layout="quote"]::after{content:'';position:absolute;inset:40px;border:1px solid ${isDark ? 'rgba(255,255,255,.05)' : `${c.primary}10`};pointer-events:none}`,
        // Features: hairline bottom borders
        `[data-layout="features"] .feature{background:transparent;border:none;border-bottom:1px solid ${isDark ? 'rgba(255,255,255,.04)' : 'rgba(0,0,0,.04)'};border-radius:0;padding:24px 0}`,
        // Two-col: thin vertical rule
        `[data-layout="two-col"] .col-wrap::after{content:'';position:absolute;top:0;bottom:0;left:50%;width:1px;background:${isDark ? 'rgba(255,255,255,.06)' : `${c.primary}12`}}`,
        // Highlight: left border rule
        `[data-layout="highlight"] .highlight-box{background:transparent;border:none;border-left:2px solid ${c.primary};border-radius:0;padding:32px 40px}`,
        `[data-layout="highlight"] .highlight-box::before{display:none}`,
        `[data-layout="highlight"] .highlight-box::after{display:none}`,
        // Transition override: cross-dissolve (no horizontal slide)
        `section{transform:none!important;transition:opacity .7s ease}`,
        `section.slide-out-left{transform:none!important}`,
        // Classic entrance: fade only, no bounce
        `section.active h1,section.active h2,section.active h3,section.active li{animation-name:fadeIn!important}`,
        `section.active .stat-card{animation-name:fadeIn!important}`,
        `section.active .feature{animation-name:fadeIn!important}`,
      ].join('\n')
    } else if (style === 'minimal') {
      // ═══════════════════════════════════════════════════════════════
      // MINIMAL — Swiss/Japanese design, extreme whitespace, barely there
      // Think: Muji, Dieter Rams, Swiss typography posters
      // ═══════════════════════════════════════════════════════════════
      styleCSS = [
        // ── Extreme padding ──
        `section{padding:100px 160px}`,
        `section.title-slide{padding:100px 160px;align-items:flex-start;text-align:left}`,
        `section.closing-slide{align-items:flex-start;text-align:left}`,
        // ── Title slide: nearly empty, massive type ──
        `section.title-slide{background:${bg2}}`,
        // ── H1: ultra-light weight, massive ──
        `section h1{color:${fg};-webkit-text-fill-color:${fg};font-weight:200;letter-spacing:-.04em;font-size:4.2em;line-height:1.05}`,
        `section.title-slide h1{font-size:5em;font-weight:200}`,
        `section.title-slide h2{font-weight:300;color:${mutedFg};font-size:1em;letter-spacing:.06em;text-transform:uppercase;margin-bottom:0}`,
        `section.title-slide h2::after{display:none}`,
        // ── No accent bar ──
        `section::before{display:none}`,
        // ── H2: weightless ──
        `section h2{font-weight:400;color:${fg};letter-spacing:-.02em;font-size:1.7em;margin-bottom:48px}`,
        `section h2::after{display:none}`,
        // ── Bullets: almost invisible thin line ──
        `section li::before{width:20px;height:1px;background:${mutedFg};opacity:.15;top:24px}`,
        `section li{padding-left:40px;color:${mutedFg};font-weight:400;line-height:2;font-size:1em;padding-top:12px;padding-bottom:12px}`,
        `section p{color:${mutedFg};font-weight:400;line-height:2.1;max-width:600px;font-size:1.05em}`,
        // ── Muted everything ──
        `section strong{color:${fg};font-weight:500;-webkit-text-fill-color:${fg}}`,
        `section h3{color:${mutedFg};font-size:.65em;letter-spacing:.2em}`,
        // ── Single thin rule at bottom of content slides ──
        `section:not(.title-slide):not(.closing-slide)::after{content:'';position:absolute;bottom:60px;left:160px;right:160px;height:1px;background:${isDark ? 'rgba(255,255,255,.04)' : 'rgba(0,0,0,.04)'};pointer-events:none}`,
        // ── Agent CTA: borderless, floating ──
        `.agent-cta{background:transparent;border:none;backdrop-filter:none;border-radius:0;text-align:left;min-width:auto;padding:32px 0}`,
        `.agent-cta::before{display:none}`,
        `.agent-avatar{width:56px;height:56px;border:1px solid ${subtleBorder};box-shadow:none}`,
        `.agent-cta .agent-name{font-weight:500;font-size:1.1em;letter-spacing:0}`,
        `.agent-cta .agent-details{color:${mutedFg}}`,
        // ── Logo: faded ──
        `.team-logo{opacity:.5;max-width:200px;max-height:60px;filter:${isDark && !hasDarkLogo ? 'brightness(2)' : 'none'} grayscale(.3)}`,
        // ── Progress: hairline ──
        `.progress{height:1px;opacity:.12;background:${fg}}`,
        `.progress::after{display:none}`,
        // ── Nav: ghost ──
        `.nav-btn{border:none;background:transparent;opacity:.3;border-radius:6px}`,
        `.nav-btn:hover{background:${isDark ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.04)'};color:${fg};box-shadow:none;opacity:1}`,
        // ── Counter: more subtle ──
        `.counter{opacity:.15;font-weight:300}`,
        `.watermark{opacity:.04}`,
        `.watermark-text{opacity:.06}`,
        // ── Layout overrides: Minimal ──
        // Stats: borderless, left-aligned, ultra-light
        `[data-layout="stats"] .stat-card{background:transparent;border:none;text-align:left;padding:24px 0}`,
        `[data-layout="stats"] .stat-number{font-weight:200;font-size:3.2em;color:${fg};-webkit-text-fill-color:${fg}}`,
        `[data-layout="stats"] .stat-label{color:${mutedFg}}`,
        // Quote: no decoration, left-aligned
        `[data-layout="quote"]{align-items:flex-start;text-align:left;padding:100px 160px}`,
        `[data-layout="quote"] blockquote{font-size:1.6em;font-style:normal;font-weight:300;color:${mutedFg};max-width:600px}`,
        `[data-layout="quote"] blockquote::before{display:none}`,
        `[data-layout="quote"] cite{color:${mutedFg}}`,
        // Features: no bg, no border
        `[data-layout="features"] .feature{background:transparent;border:none;padding:20px 0}`,
        `[data-layout="features"] .feature-icon{font-size:1.5em;opacity:.5}`,
        // Two-col: just whitespace
        `[data-layout="two-col"] .col h4{color:${mutedFg};font-weight:400}`,
        // Highlight: thin top rule only
        `[data-layout="highlight"] .highlight-box{background:transparent;border:none;border-top:1px solid ${isDark ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.06)'};border-radius:0;padding:32px 0}`,
        `[data-layout="highlight"] .highlight-box p{color:${mutedFg};font-weight:300}`,
        `[data-layout="highlight"] .highlight-box::before{display:none}`,
        `[data-layout="highlight"] .highlight-box::after{display:none}`,
        // Transition: ultra-slow cross-dissolve
        `section{transform:none!important;transition:opacity 1s ease}`,
        `section.slide-out-left{transform:none!important}`,
        // Minimal entrance: barely perceptible fade
        `section.active h1,section.active h2,section.active h3,section.active h4,section.active p,section.active li{animation-name:fadeIn!important;animation-duration:.8s!important}`,
        `section.active .stat-card,section.active .feature,section.active .highlight-box,section.active blockquote{animation-name:fadeIn!important;animation-duration:.8s!important}`,
      ].join('\n')
    } else if (style === 'bold') {
      // ═══════════════════════════════════════════════════════════════
      // BOLD — Magazine cover, full-bleed color, oversized everything
      // Think: Nike ads, Spotify Wrapped, TED talks
      // ═══════════════════════════════════════════════════════════════
      styleCSS = [
        // ── Giant gradient text ──
        `section h1{font-size:4.2em;line-height:1;font-weight:900;background:linear-gradient(135deg,${c.primary} 0%,${c.accent} 55%,${c.secondary} 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;letter-spacing:-.05em}`,
        `section h2{font-size:2.4em;font-weight:800;letter-spacing:-.03em;margin-bottom:48px}`,
        // ── Chunky accent bar (left) ──
        `section::before{width:8px;background:linear-gradient(180deg,${c.primary},${c.accent});border-radius:0 6px 6px 0;opacity:.85}`,
        // ── Thick h2 underline ──
        `section h2::after{height:5px;width:64px;border-radius:6px;background:linear-gradient(90deg,${c.primary},${c.accent});margin-top:18px}`,
        // ── Bold bar bullets ──
        `section li::before{height:4px;width:28px;border-radius:3px;background:linear-gradient(90deg,${c.primary},${c.accent});top:24px}`,
        `section li{font-size:1.1em;font-weight:500;padding-left:52px;padding-top:16px;padding-bottom:16px}`,
        // ════════════════════════════════════════════════════════
        // ── Title slide: FULL BLEED color — the signature look ──
        // ════════════════════════════════════════════════════════
        `section.title-slide{background:linear-gradient(150deg,${c.primary} 0%,${darkPrimary} 100%)}`,
        // Dark vignette at bottom
        `section.title-slide::after{content:'';position:absolute;bottom:0;left:0;right:0;height:50%;background:linear-gradient(to top,rgba(0,0,0,.35),transparent);pointer-events:none;z-index:0}`,
        // Subtle light wash top-left
        `section.title-slide::before{display:block;content:'';position:absolute;inset:0;background:radial-gradient(ellipse at 30% 20%,rgba(255,255,255,.08) 0%,transparent 50%);pointer-events:none;z-index:0}`,
        // z-index lift — MUST exclude .bg-overlay
        `section.title-slide>*:not(.bg-overlay){position:relative;z-index:1}`,
        // White text on color bg
        `section.title-slide h1{-webkit-text-fill-color:#fff;background:none;text-shadow:0 4px 40px rgba(0,0,0,.3);font-size:5em;line-height:.95}`,
        `section.title-slide h2{color:rgba(255,255,255,.92);font-size:1.15em;font-weight:400;letter-spacing:.04em;text-shadow:0 2px 12px rgba(0,0,0,.25)}`,
        `section.title-slide h2::after{display:none}`,
        // Logo on colored bg: if no dark-variant logo, force-bleach; otherwise just shadow
        `section.title-slide .team-logo{filter:${hasDarkLogo ? '' : 'brightness(1.8) saturate(0) '}drop-shadow(0 2px 16px rgba(0,0,0,.4));opacity:.95}`,
        // ── Closing slide: also colored ──
        `section.closing-slide{background:linear-gradient(150deg,${c.primary} 0%,${darkPrimary} 100%)}`,
        `section.closing-slide::before{display:block;content:'';position:absolute;inset:0;background:radial-gradient(ellipse at 70% 80%,rgba(255,255,255,.06) 0%,transparent 50%);pointer-events:none;z-index:0}`,
        // z-index lift — MUST exclude .bg-overlay
        `section.closing-slide>*:not(.bg-overlay){position:relative;z-index:1}`,
        `section.closing-slide h2{color:#fff;-webkit-text-fill-color:#fff}`,
        `section.closing-slide h2::after{background:rgba(255,255,255,.3)}`,
        // ── Agent CTA on colored bg ──
        `section.closing-slide .agent-cta{background:rgba(255,255,255,.1);border-color:rgba(255,255,255,.15);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px)}`,
        `section.closing-slide .agent-cta::before{background:linear-gradient(135deg,rgba(255,255,255,.2),transparent)}`,
        `section.closing-slide .agent-name{color:#fff}`,
        `section.closing-slide .agent-details{color:rgba(255,255,255,.85)}`,
        `section.closing-slide .agent-avatar{border-color:rgba(255,255,255,.2);box-shadow:0 4px 20px rgba(0,0,0,.3)}`,
        // ── Content slides: slight accent tint ──
        `section:not(.title-slide):not(.closing-slide){background:${isDark ? '#0c0c14' : `linear-gradient(180deg,${bg2} 0%,${c.primary}04 100%)`}}`,
        // ── Bigger everything ──
        `.agent-cta{padding:40px 56px;border-radius:28px}`,
        `.agent-cta .agent-name{font-size:1.5em;font-weight:800}`,
        `.agent-avatar{width:80px;height:80px;border:3px solid rgba(${c.glow},.2);box-shadow:0 4px 24px rgba(${c.glow},.2)}`,
        // ── Progress: thick and vivid ──
        `.progress{height:4px;opacity:.7;background:linear-gradient(90deg,${c.primary},${c.accent})}`,
        `.progress::after{width:14px;height:14px;top:-5px;box-shadow:0 0 24px rgba(${c.glow},.6),0 0 60px rgba(${c.glow},.2)}`,
        // ── Nav: bold style ──
        `.nav-btn{border-radius:14px;width:40px;height:40px;font-size:18px;background:${isDark ? 'rgba(255,255,255,.06)' : 'rgba(255,255,255,.9)'};border:2px solid ${isDark ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.06)'}}`,
        `.nav-btn:hover{background:${c.primary};border-color:${c.primary};box-shadow:0 4px 28px rgba(${c.glow},.4)}`,
        // ── Layout overrides: Bold ──
        // Stats: gradient numbers, thick border
        `[data-layout="stats"] .stat-card{border:2px solid ${isDark ? 'rgba(255,255,255,.06)' : `${c.primary}15`};border-radius:20px;padding:44px 24px}`,
        `[data-layout="stats"] .stat-number{font-size:3.2em;font-weight:900;background:linear-gradient(135deg,${c.primary},${c.accent});-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}`,
        // Quote: massive quote mark, thick underline
        `[data-layout="quote"] blockquote::before{font-size:6em;color:${c.primary};opacity:.2}`,
        `[data-layout="quote"] cite::after{content:'';display:block;width:48px;height:4px;background:linear-gradient(90deg,${c.primary},${c.accent});border-radius:4px;margin-top:16px}`,
        // Features: thick border
        `[data-layout="features"] .feature{border:2px solid ${isDark ? 'rgba(255,255,255,.06)' : `${c.primary}12`};border-radius:20px;padding:36px}`,
        `[data-layout="features"] .feature-icon{font-size:2.4em}`,
        // Two-col: thick gradient bar
        `[data-layout="two-col"] .col-wrap::after{content:'';position:absolute;top:5%;bottom:5%;left:50%;width:4px;background:linear-gradient(180deg,${c.primary},${c.accent});border-radius:4px;margin-left:-2px}`,
        // Highlight: gradient bg
        `[data-layout="highlight"] .highlight-box{background:linear-gradient(135deg,${c.primary},${darkPrimary});border:none;border-radius:24px;padding:52px}`,
        `[data-layout="highlight"] .highlight-box p{color:#fff;font-size:1.3em;font-weight:600;-webkit-text-fill-color:#fff}`,
        `[data-layout="highlight"] .highlight-box::before{background:rgba(255,255,255,.15)}`,
        `[data-layout="highlight"] .highlight-box::after{color:rgba(255,255,255,.1)}`,
        // Transition: dramatic zoom + fade
        `section{transform:scale(.93)!important;transition:opacity .45s cubic-bezier(.22,1,.36,1),transform .45s cubic-bezier(.22,1,.36,1)!important}`,
        `section.active{transform:scale(1)!important}`,
        `section.slide-out-left{transform:scale(1.05)!important;opacity:0}`,
        // Bold entrance: exaggerated pop
        `section.active h1{animation-name:popIn!important;animation-duration:.6s!important}`,
        `section.active .stat-card{animation-duration:.6s!important}`,
      ].join('\n')
    }

    // Background image CSS (applied via .bg-overlay div injected into each slide)
    // Uses user-controlled overlayOpacity (0-100 scale -> decimal)
    const bgOpacity = (overlayOpacity / 100).toFixed(2)
    const bgOpacityTitle = Math.min(overlayOpacity * 1.4 / 100, 0.5).toFixed(2) // slightly stronger on title
    const bgImageCSS = backgroundImage ? [
      // Background image layer
      `.bg-overlay{position:absolute;inset:0;pointer-events:none;z-index:0;overflow:hidden}`,
      `.bg-overlay::before{content:'';position:absolute;inset:0;background:url("${backgroundImage}") center/cover no-repeat;opacity:${bgOpacity}}`,
      // Color tint overlay to blend with theme
      `.bg-overlay::after{content:'';position:absolute;inset:0;background:${isDark ? `linear-gradient(135deg,rgba(0,0,0,.5),rgba(${c.glow},.12))` : `linear-gradient(135deg,${bg2}cc,rgba(${c.glow},.04))`};mix-blend-mode:${isDark ? 'multiply' : 'normal'}}`,
      // Title slide — slightly stronger
      `section.title-slide .bg-overlay::before{opacity:${bgOpacityTitle}}`,
      // Ensure content stays above overlay
      `section>*:not(.bg-overlay){position:relative;z-index:1}`,
      // Text readability safety net — theme-aware halo ensures contrast over any image
      `section{text-shadow:${isDark ? '0 1px 12px rgba(0,0,0,.9),0 0 3px rgba(0,0,0,.5)' : '0 1px 8px rgba(255,255,255,.95),0 0 3px rgba(255,255,255,.8)'}}`,
    ].join('\n') : ''

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500;600;700;800;900&family=Playfair+Display:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{background:${bg};color:${fg};font-family:${bodyFont};overflow:hidden;height:100vh;width:100vw;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;font-feature-settings:'cv02','cv03','cv04','cv11'}
h1,h2,h3,h4{font-family:${headingFont}}

/* ── Slide system — directional transitions ── */
.slides{position:relative;height:100vh;width:100vw}
section{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;padding:72px 100px 72px 120px;opacity:0;pointer-events:none;transform:translateX(40px) scale(.98);transition:opacity .5s cubic-bezier(.22,1,.36,1),transform .5s cubic-bezier(.22,1,.36,1);overflow-y:auto;background:${bg2};will-change:transform,opacity}
section.slide-out-left{opacity:0;transform:translateX(-40px) scale(.98);pointer-events:none}
section.active{opacity:1;pointer-events:auto;transform:translateX(0) scale(1)}
section.title-slide{text-align:center;align-items:center;padding:80px 120px}
section.closing-slide{text-align:center;align-items:center}

/* ── Accent bar (left edge) ── */
section::before{content:'';position:absolute;top:0;left:0;width:4px;height:100%;background:linear-gradient(180deg,${c.primary},${c.accent});opacity:.5}
section.title-slide::before,section.closing-slide::before{display:none}

/* ── Typography ── */
section h1{font-size:3.6em;font-weight:800;color:${c.primary};margin-bottom:20px;line-height:1.05;letter-spacing:-.04em}
section h2{font-size:1.65em;font-weight:700;color:${fg};margin-bottom:40px;line-height:1.3;letter-spacing:-.02em;position:relative;display:inline-block}
section h2::after{content:'';display:block;width:48px;height:3px;background:linear-gradient(90deg,${c.primary},${c.accent});border-radius:4px;margin-top:16px}
section.title-slide h2,section.closing-slide h2{font-weight:400;color:${mutedFg};font-size:1.1em;letter-spacing:.03em;margin-bottom:8px}
section.title-slide h2::after,section.closing-slide h2::after{display:none}
section h3{font-size:.68em;font-weight:600;color:${isDark ? c.accent : c.primary};margin-bottom:24px;letter-spacing:.16em;text-transform:uppercase}
section h4{font-size:1.1em;font-weight:700;color:${fg};margin-bottom:12px}
section p{font-size:1.08em;line-height:1.9;margin-bottom:20px;color:${isDark ? '#a1a1aa' : '#52525b'};max-width:720px}
section ul{list-style:none;padding:0;margin-bottom:24px}
section li{font-size:1.05em;line-height:1.85;padding:14px 0 14px 44px;position:relative;color:${isDark ? '#a1a1aa' : '#52525b'}}
section li::before{content:'';position:absolute;left:0;top:24px;width:20px;height:2px;background:linear-gradient(90deg,${c.primary},${c.accent});border-radius:2px}
section strong{color:${c.primary};font-weight:600}
section em{font-style:italic;color:${isDark ? '#d4d4d8' : '#27272a'}}

/* ── Layout: Two-Column ── */
[data-layout="two-col"] .col-wrap{display:grid;grid-template-columns:1fr 1fr;gap:48px;width:100%;position:relative}
[data-layout="two-col"] .col h4{font-size:1.1em;font-weight:700;color:${c.primary};margin-bottom:16px;padding-bottom:12px;border-bottom:2px solid ${isDark ? 'rgba(255,255,255,.06)' : `${c.primary}12`}}
[data-layout="two-col"] .col ul{margin:0;padding:0}
[data-layout="two-col"] .col:first-child{padding-right:16px}
[data-layout="two-col"] .col:last-child{padding-left:16px}

/* ── Layout: Stats ── */
[data-layout="stats"] .stats-row{display:flex;gap:28px;width:100%}
[data-layout="stats"] .stat-card{flex:1;text-align:center;padding:40px 24px;border-radius:16px;background:${isDark ? 'rgba(255,255,255,.03)' : 'rgba(0,0,0,.02)'};border:1px solid ${subtleBorder};transition:transform .25s cubic-bezier(.22,1,.36,1),box-shadow .25s}
[data-layout="stats"] .stat-card:hover{transform:translateY(-4px);box-shadow:0 12px 32px rgba(${c.glow},.1)}
[data-layout="stats"] .stat-number{font-size:2.8em;font-weight:800;color:${c.primary};line-height:1.1;margin-bottom:10px;font-family:${headingFont};letter-spacing:-.03em}
[data-layout="stats"] .stat-label{font-size:.78em;color:${mutedFg};text-transform:uppercase;letter-spacing:.12em;font-weight:500}
[data-layout="stats"] .stat-card::after{content:'';display:block;width:32px;height:2px;background:linear-gradient(90deg,${c.primary},${c.accent});border-radius:2px;margin:16px auto 0;opacity:.4}

/* ── Layout: Quote ── */
[data-layout="quote"]{justify-content:center;align-items:center;text-align:center;padding:80px 140px}
[data-layout="quote"] blockquote{font-size:1.8em;font-weight:400;font-family:${headingFont};line-height:1.55;max-width:800px;color:${fg};font-style:italic;position:relative;padding:0 48px}
[data-layout="quote"] blockquote::before{content:'\\201C';position:absolute;top:-.5em;left:-.2em;font-size:5em;color:${c.primary};opacity:.12;font-family:${headingFont};line-height:1}
[data-layout="quote"] blockquote::after{content:'\\201D';position:absolute;bottom:-.6em;right:-.1em;font-size:5em;color:${c.primary};opacity:.08;font-family:${headingFont};line-height:1}
[data-layout="quote"] cite{display:block;margin-top:36px;font-size:.85em;color:${mutedFg};font-style:normal;letter-spacing:.08em;text-transform:uppercase;font-weight:500}
[data-layout="quote"] cite::before{content:'';display:block;width:40px;height:2px;background:linear-gradient(90deg,${c.primary},${c.accent});margin:0 auto 16px;opacity:.5}
[data-layout="quote"]::before{display:none}

/* ── Layout: Features ── */
[data-layout="features"] .features-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:24px;width:100%}
[data-layout="features"] .feature{padding:32px;border-radius:16px;background:${isDark ? 'rgba(255,255,255,.03)' : 'rgba(0,0,0,.015)'};border:1px solid ${subtleBorder};transition:transform .25s cubic-bezier(.22,1,.36,1),box-shadow .25s,border-color .25s}
[data-layout="features"] .feature:hover{transform:translateY(-6px);box-shadow:0 16px 40px rgba(${c.glow},.1);border-color:${c.primary}30}
[data-layout="features"] .feature-icon{font-size:2.2em;margin-bottom:16px;display:inline-block;transition:transform .3s}
[data-layout="features"] .feature:hover .feature-icon{transform:scale(1.15)}
[data-layout="features"] .feature h4{font-size:1.05em;font-weight:700;color:${fg};margin-bottom:10px}
[data-layout="features"] .feature p{font-size:.88em;color:${mutedFg};line-height:1.65;margin-bottom:0}

/* ── Layout: Highlight ── */
[data-layout="highlight"] .highlight-box{padding:48px 52px;border-radius:20px;background:${isDark ? `rgba(${c.glow},.06)` : `${c.primary}06`};border:1px solid ${isDark ? `rgba(${c.glow},.1)` : `${c.primary}12`};max-width:680px;position:relative;overflow:hidden}
[data-layout="highlight"] .highlight-box::before{content:'';position:absolute;top:0;left:0;width:4px;height:100%;background:linear-gradient(180deg,${c.primary},${c.accent});border-radius:4px 0 0 4px}
[data-layout="highlight"] .highlight-box::after{content:'!';position:absolute;top:20px;right:28px;font-size:2.4em;font-weight:900;color:${c.primary};opacity:.06;font-family:${headingFont}}
[data-layout="highlight"] .highlight-box p{font-size:1.18em;line-height:1.85;color:${fg};margin-bottom:0}

/* ── Staggered content entrance ── */
section.active h1,section.active h2,section.active h3,section.active h4,section.active p,section.active li,section.active .agent-cta,section.active .team-logo{animation:fadeUp .55s cubic-bezier(.22,1,.36,1) both}
section.active h1{animation-delay:.06s;animation-name:scaleIn}
section.active .team-logo{animation-delay:.02s;animation-name:fadeIn}
section.active h2{animation-delay:.1s}
section.active h3{animation-delay:.06s;animation-name:fadeIn}
section.active h4{animation-delay:.12s}
section.active p{animation-delay:.14s}
section.active li:nth-child(1){animation-delay:.1s;animation-name:slideRight}
section.active li:nth-child(2){animation-delay:.14s;animation-name:slideRight}
section.active li:nth-child(3){animation-delay:.18s;animation-name:slideRight}
section.active li:nth-child(4){animation-delay:.22s;animation-name:slideRight}
section.active li:nth-child(5){animation-delay:.26s;animation-name:slideRight}
section.active li:nth-child(6){animation-delay:.30s;animation-name:slideRight}
section.active li:nth-child(7){animation-delay:.34s;animation-name:slideRight}
section.active li:nth-child(8){animation-delay:.38s;animation-name:slideRight}
section.active .agent-cta{animation-delay:.22s;animation-name:scaleIn}
/* Layout-specific: Two-col slides from left & right */
section.active .col-wrap{animation:fadeIn .4s cubic-bezier(.22,1,.36,1) .1s both}
section.active .col:first-child{animation:slideRight .55s cubic-bezier(.22,1,.36,1) .14s both}
section.active .col:last-child{animation:slideLeft .55s cubic-bezier(.22,1,.36,1) .2s both}
/* Stats: scale-pop each card */
section.active .stats-row{animation:fadeIn .4s cubic-bezier(.22,1,.36,1) .08s both}
section.active .stat-card:nth-child(1){animation:popIn .5s cubic-bezier(.22,1,.36,1) .14s both}
section.active .stat-card:nth-child(2){animation:popIn .5s cubic-bezier(.22,1,.36,1) .22s both}
section.active .stat-card:nth-child(3){animation:popIn .5s cubic-bezier(.22,1,.36,1) .30s both}
section.active .stat-card:nth-child(4){animation:popIn .5s cubic-bezier(.22,1,.36,1) .38s both}
/* Quote: dramatic fade */
section.active blockquote{animation:scaleIn .7s cubic-bezier(.22,1,.36,1) .08s both}
section.active cite{animation:fadeUp .5s cubic-bezier(.22,1,.36,1) .3s both}
/* Features: staggered pop */
section.active .features-grid{animation:fadeIn .4s cubic-bezier(.22,1,.36,1) .08s both}
section.active .feature:nth-child(1){animation:popIn .5s cubic-bezier(.22,1,.36,1) .14s both}
section.active .feature:nth-child(2){animation:popIn .5s cubic-bezier(.22,1,.36,1) .2s both}
section.active .feature:nth-child(3){animation:popIn .5s cubic-bezier(.22,1,.36,1) .26s both}
section.active .feature:nth-child(4){animation:popIn .5s cubic-bezier(.22,1,.36,1) .32s both}
/* Highlight: slide from left */
section.active .highlight-box{animation:slideRight .6s cubic-bezier(.22,1,.36,1) .1s both}
@keyframes fadeUp{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
@keyframes scaleIn{from{opacity:0;transform:scale(.92)}to{opacity:1;transform:scale(1)}}
@keyframes popIn{from{opacity:0;transform:scale(.85) translateY(12px)}to{opacity:1;transform:scale(1) translateY(0)}}
@keyframes slideRight{from{opacity:0;transform:translateX(-28px)}to{opacity:1;transform:translateX(0)}}
@keyframes slideLeft{from{opacity:0;transform:translateX(28px)}to{opacity:1;transform:translateX(0)}}

/* ── Logo ── */
.team-logo{max-width:340px;max-height:90px;margin-bottom:44px;object-fit:contain;opacity:.9;filter:drop-shadow(0 2px 12px rgba(0,0,0,.06))}

/* ── Watermark ── */
.watermark{position:fixed;bottom:24px;left:36px;max-height:22px;opacity:.06;z-index:10;filter:grayscale(1)}
.watermark-text{position:fixed;bottom:26px;left:36px;font-size:9px;opacity:.1;color:${mutedFg};z-index:10;font-weight:600;letter-spacing:2px;text-transform:uppercase}

/* ── Slide counter ── */
.counter{position:fixed;bottom:28px;right:36px;font-size:10px;font-weight:500;color:${mutedFg};z-index:10;opacity:.25;letter-spacing:3px;font-variant-numeric:tabular-nums;font-family:${bodyFont}}

/* ── Nav buttons ── */
.nav-arrows{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);display:flex;gap:8px;z-index:10;opacity:0;transition:opacity .4s}
body:hover .nav-arrows{opacity:.25}
.nav-arrows:hover{opacity:1!important}
.nav-btn{width:38px;height:38px;border-radius:12px;border:1px solid ${subtleBorder};background:${isDark ? 'rgba(255,255,255,.04)' : 'rgba(255,255,255,.85)'};backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);color:${mutedFg};cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:16px;transition:all .25s cubic-bezier(.22,1,.36,1);-webkit-appearance:none;font-family:system-ui}
.nav-btn:hover{background:${c.primary};color:#fff;border-color:transparent;box-shadow:0 4px 20px rgba(${c.glow},.3);transform:scale(1.05)}

/* ── Agent CTA ── */
.agent-cta{margin-top:48px;padding:36px 52px;background:${isDark ? 'rgba(255,255,255,.04)' : 'rgba(255,255,255,.7)'};backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border-radius:24px;border:1px solid ${subtleBorder};display:inline-block;min-width:340px;text-align:center;position:relative;overflow:hidden}
.agent-cta::before{content:'';position:absolute;inset:-1px;border-radius:25px;padding:1px;background:linear-gradient(135deg,${c.primary}30,${c.accent}20,transparent 60%);-webkit-mask:linear-gradient(#fff 0 0) content-box,linear-gradient(#fff 0 0);-webkit-mask-composite:xor;mask-composite:exclude;pointer-events:none}
.agent-avatar{width:76px;height:76px;border-radius:50%;object-fit:cover;margin-bottom:18px;border:3px solid ${isDark ? 'rgba(255,255,255,.08)' : 'rgba(255,255,255,.9)'};box-shadow:0 4px 20px rgba(${c.glow},.12)}
.agent-cta .agent-name{font-size:1.35em;font-weight:700;color:${fg};margin-bottom:10px;font-family:${headingFont};letter-spacing:-.02em}
.agent-cta .agent-details{font-size:.82em;color:${mutedFg};line-height:2.1;letter-spacing:.04em}

/* ── Progress bar ── */
.progress{position:fixed;bottom:0;left:0;height:2px;background:linear-gradient(90deg,${c.primary},${c.accent});z-index:10;transition:width .55s cubic-bezier(.22,1,.36,1);opacity:.45}
.progress::after{content:'';position:absolute;right:0;top:-4px;width:10px;height:10px;border-radius:50%;background:${c.accent};box-shadow:0 0 16px rgba(${c.glow},.5);opacity:.7}

/* ── Style preset overrides ── */
${styleCSS}
${bgImageCSS ? `/* ── Background image ── */\n${bgImageCSS}` : ''}

/* ── Responsive ── */
@media(max-width:768px){
section{padding:44px 32px 68px}
section h1{font-size:2.2em}
section h2{font-size:1.3em}
section.title-slide{padding:48px 32px}
.team-logo{max-width:180px;max-height:80px}
.agent-cta{min-width:auto;padding:24px 28px}
section li{padding-left:36px}
section p{font-size:1em}
.nav-btn{width:32px;height:32px;font-size:14px}
[data-layout="two-col"] .col-wrap{grid-template-columns:1fr;gap:24px}
[data-layout="stats"] .stats-row{flex-direction:column;gap:16px}
[data-layout="stats"] .stat-card{padding:24px 16px}
[data-layout="stats"] .stat-number{font-size:2em}
[data-layout="features"] .features-grid{grid-template-columns:1fr;gap:16px}
[data-layout="quote"] blockquote{font-size:1.3em}
[data-layout="quote"]{padding:48px 32px}
[data-layout="highlight"] .highlight-box{padding:24px}
}
</style>
</head>
<body class="style-${styleBodyClass}">
${logoWatermark}
<div class="counter"></div>
<div class="progress" style="width:0%"></div>
<div class="nav-arrows">
<button class="nav-btn nav-prev" aria-label="Previous">&#8249;</button>
<button class="nav-btn nav-next" aria-label="Next">&#8250;</button>
</div>
<div class="slides">
${slidesHtml}
</div>
<script>
(function(){
var ss=document.querySelectorAll('.slides section'),counter=document.querySelector('.counter'),bar=document.querySelector('.progress'),cur=0;
function show(i){if(i<0||i>=ss.length)return;var prev=cur,going=i>prev?1:-1;ss[prev].classList.remove('active');ss[prev].classList.remove('slide-out-left');if(going>0)ss[prev].classList.add('slide-out-left');else{ss[prev].style.transform='translateX(40px) scale(.98)';ss[prev].style.opacity='0'}cur=i;ss[cur].classList.remove('slide-out-left');if(going>0){ss[cur].style.transform='';ss[cur].style.removeProperty('transform')}else{ss[cur].classList.add('slide-out-left');void ss[cur].offsetWidth;ss[cur].classList.remove('slide-out-left')}ss[cur].classList.add('active');counter.textContent=(cur+1)+' / '+ss.length;bar.style.width=((cur+1)/ss.length*100)+'%';setTimeout(function(){ss[prev].classList.remove('slide-out-left');ss[prev].style.transform='';ss[prev].style.opacity=''},600);animateStats(ss[cur])}
if(ss.length)show(0);
function nav(key){if(key==='ArrowRight'||key===' '||key==='PageDown')show(cur+1);else if(key==='ArrowLeft'||key==='PageUp')show(cur-1);else if(key==='Home')show(0);else if(key==='End')show(ss.length-1)}
document.addEventListener('keydown',function(e){if(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA')return;nav(e.key)});
window.addEventListener('message',function(e){if(e.data&&e.data.type==='keydown')nav(e.data.key)});
var pb=document.querySelector('.nav-prev'),nb=document.querySelector('.nav-next');
if(pb)pb.addEventListener('click',function(e){e.stopPropagation();show(cur-1)});
if(nb)nb.addEventListener('click',function(e){e.stopPropagation();show(cur+1)});
document.addEventListener('click',function(e){if(e.target.closest('.nav-arrows')||e.target.closest('a'))return;if(e.clientX>window.innerWidth/2)show(cur+1);else show(cur-1)});
var tx=0,ty=0;
document.addEventListener('touchstart',function(e){tx=e.changedTouches[0].screenX;ty=e.changedTouches[0].screenY},{passive:true});
document.addEventListener('touchend',function(e){var dx=e.changedTouches[0].screenX-tx,dy=e.changedTouches[0].screenY-ty;if(Math.abs(dx)>Math.abs(dy)&&Math.abs(dx)>50){if(dx<0)show(cur+1);else show(cur-1)}},{passive:true});
/* ── Stat number count-up animation ── */
function animateStats(slide){var nums=slide.querySelectorAll('.stat-number');if(!nums.length)return;nums.forEach(function(el){var raw=el.textContent||'',prefix='',suffix='',numStr='';var m=raw.match(/^([^0-9]*)([0-9,.]+)(.*)$/);if(!m)return;prefix=m[1];numStr=m[2];suffix=m[3];var hasDot=numStr.indexOf('.')>-1,hasComma=numStr.indexOf(',')>-1;var target=parseFloat(numStr.replace(/,/g,''));if(isNaN(target))return;var decimals=hasDot?(numStr.split('.')[1]||'').length:0;var dur=700,start=performance.now();el.textContent=prefix+'0'+suffix;requestAnimationFrame(function tick(now){var t=Math.min((now-start)/dur,1);t=1-Math.pow(1-t,3);var v=t*target;var vs=decimals?v.toFixed(decimals):Math.round(v).toString();if(hasComma)vs=vs.replace(/\\B(?=(\\d{3})+(?!\\d))/g,',');el.textContent=prefix+vs+suffix;if(t<1)requestAnimationFrame(tick)})})}
})();
</script>
</body>
</html>`

    // ── Save to database ────────────────────────────────────────────────────
    await admin.from('presentations').update({
      html,
      slide_count: slideCount,
      status: 'ready',
      updated_at: new Date().toISOString(),
    }).eq('id', presentationId)

    // ── Increment team generation counter ────────────────────────────────────
    if (teamId && !isAdmin) {
      const month = currentMonth()
      const { data: teamRow } = await admin.from('teams').select('pres_generations_used, pres_generations_reset').eq('id', teamId).single()
      const curUsed = (teamRow?.pres_generations_reset === month) ? (teamRow?.pres_generations_used || 0) : 0
      await admin.from('teams').update({ pres_generations_used: curUsed + 1, pres_generations_reset: month }).eq('id', teamId)
    }

    console.log(`Presentation ${presentationId} generated successfully (${slideCount} slides)`)
    return json({ id: presentationId, status: 'ready' })
  } catch (err) {
    console.error('Background generation error:', (err as Error)?.message || err, (err as Error)?.stack || '')
    try { await markFailed() } catch { /* best-effort */ }
    return json({ error: 'Generation failed' }, 500)
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// Main request handler
// ══════════════════════════════════════════════════════════════════════════════
Deno.serve(async (req) => {
  const CORS = getCorsHeaders(req)

  function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const supabaseUrl    = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // ── Parse body early (needed for background mode detection) ──────────
    const ct = req.headers.get('content-type') || ''
    if (!ct.includes('application/json')) {
      return json({ error: 'Content-Type must be application/json' }, 400)
    }
    let reqBody: Record<string, unknown>
    try { reqBody = await req.json() } catch { return json({ error: 'Invalid JSON body' }, 400) }

    // ══════════════════════════════════════════════════════════════════════
    // Background mode (Phase 2) — self-invoked for async generation
    // ══════════════════════════════════════════════════════════════════════
    if (reqBody._bgMode === true) {
      const authHeader = req.headers.get('Authorization')
      if (authHeader !== `Bearer ${serviceRoleKey}`) {
        return json({ error: 'Unauthorized' }, 401)
      }
      return handleBackgroundGeneration(reqBody, supabaseUrl, serviceRoleKey, CORS)
    }

    // ══════════════════════════════════════════════════════════════════════
    // Normal mode (Phase 1) — auth, validate, create row, trigger bg
    // ══════════════════════════════════════════════════════════════════════

    // ── 1. Auth ─────────────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401)

    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data: { user }, error: authErr } = await userClient.auth.getUser()
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401)

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // ── 2. Fetch profile + team info ────────────────────────────────────────
    const { data: profile } = await admin
      .from('profiles')
      .select('*, teams(id, name, invite_code, created_by, team_prefs, max_members, presentations_addon_status, pres_generations_used, pres_generations_reset)')
      .eq('id', user.id)
      .single()

    if (!profile) return json({ error: 'Profile not found' }, 404)

    const isAdmin = profile.app_role === 'admin'

    // ── 3. Plan gate ────────────────────────────────────────────────────────
    const isTeamMember = !!(profile.team_id && profile.teams?.created_by !== user.id)
    const billing = profile.billing_status
    const hasBilling = billing === 'active' || billing === 'trialing'
    if (!isAdmin && !hasBilling && !isTeamMember) {
      return json({ error: 'subscription_required', message: 'Subscribe to a plan to use Presentation Builder.' }, 403)
    }

    // ── 4. Add-on gate ──────────────────────────────────────────────────────
    if (!isAdmin) {
      const addonStatus = profile.teams?.presentations_addon_status
      if (addonStatus !== 'active' && addonStatus !== 'trialing') {
        return json({ error: 'addon_required', message: 'The Presentation Builder add-on is required.' }, 403)
      }
    }

    // ── 5. Team toggle gate ─────────────────────────────────────────────────
    if (profile.team_id && profile.teams?.team_prefs?.ai_tools?.presentations_enabled === false) {
      return json({ error: 'disabled_by_team', message: 'Presentation Builder has been disabled by your team owner.' }, 403)
    }

    // ── 5b. Monthly presentation generation limit per team (45/mo) ─────────
    if (!isAdmin && profile.team_id && profile.teams) {
      const month = currentMonth()
      let genUsed = profile.teams.pres_generations_used || 0
      const genReset = profile.teams.pres_generations_reset || ''

      if (genReset !== month) {
        await admin.from('teams').update({ pres_generations_used: 0, pres_generations_reset: month }).eq('id', profile.team_id)
        genUsed = 0
      }

      if (genUsed >= TEAM_PRESENTATION_LIMIT) {
        return json({
          error: 'presentations_limit_reached',
          message: `Your team has reached the monthly limit of ${TEAM_PRESENTATION_LIMIT} presentations.`,
          limit: TEAM_PRESENTATION_LIMIT,
          used: genUsed,
        }, 429)
      }
    }

    // ── 6. Credit gate ──────────────────────────────────────────────────────
    let effectivePlan: string
    if (isAdmin) {
      effectivePlan = 'brokerage'
    } else if (isTeamMember) {
      const { data: ownerProfile } = await admin
        .from('profiles')
        .select('plan')
        .eq('id', profile.teams?.created_by)
        .single()
      effectivePlan = ownerProfile?.plan || 'team'
    } else {
      effectivePlan = profile.plan || 'free'
    }

    const limit = isAdmin ? -1 : (CREDIT_LIMITS[effectivePlan] ?? 0)
    const month = currentMonth()

    if (profile.ai_credits_reset !== month) {
      await admin.from('profiles').update({ ai_credits_used: 0, ai_credits_reset: month }).eq('id', user.id)
      profile.ai_credits_used = 0
      profile.ai_credits_reset = month
    }

    let creditsUsed = profile.ai_credits_used || 0

    if ((effectivePlan === 'team' || effectivePlan === 'brokerage') && profile.team_id) {
      const { data: teamMembers } = await admin
        .from('profiles')
        .select('ai_credits_used, ai_credits_reset')
        .eq('team_id', profile.team_id)

      creditsUsed = (teamMembers || []).reduce((sum: number, m: { ai_credits_used: number; ai_credits_reset: string }) => {
        return sum + (m.ai_credits_reset === month ? (m.ai_credits_used || 0) : 0)
      }, 0)
    }

    if (limit !== -1 && creditsUsed >= limit) {
      return json({ error: 'credits_exhausted', plan: effectivePlan, limit, used: creditsUsed }, 429)
    }

    // ── 7. Validate request body ────────────────────────────────────────────
    const {
      title: rawTitle,
      style: rawStyle,
      theme: rawTheme,
      font: rawFont,
      colorScheme: rawColor,
      content: rawContent,
      backgroundImage: rawBgImage,
      overlayOpacity: rawOverlayOpacity,
      presentationId,
    } = reqBody as {
      title?: string
      style?: string
      theme?: string
      font?: string
      colorScheme?: string
      content?: string
      backgroundImage?: string
      overlayOpacity?: number
      presentationId?: string
    }

    const title = (typeof rawTitle === 'string' ? rawTitle.trim() : '') || 'Untitled Presentation'
    const style = VALID_STYLES.includes(rawStyle as string) ? rawStyle as string : 'modern'
    const presTheme = VALID_THEMES.includes(rawTheme as string) ? rawTheme as string : 'light'
    const font = VALID_FONTS.includes(rawFont as string) ? rawFont as string : 'sans-serif'
    const colorScheme = VALID_COLORS.includes(rawColor as string) ? rawColor as string
      : (typeof rawColor === 'string' && HEX_RE.test(rawColor)) ? rawColor : 'blue'
    const content = typeof rawContent === 'string' ? rawContent.trim() : ''
    // Validate background image against team's allowed backgrounds
    const teamBackgrounds: string[] = profile.teams?.team_prefs?.ai_tools?.presentation_backgrounds || []
    const backgroundImage = (typeof rawBgImage === 'string' && rawBgImage && teamBackgrounds.includes(rawBgImage))
      ? rawBgImage : ''
    const overlayOpacity = (typeof rawOverlayOpacity === 'number' && rawOverlayOpacity >= 0 && rawOverlayOpacity <= 100)
      ? rawOverlayOpacity : 15 // default 15% — visible but not overwhelming

    if (!content) return json({ error: 'Content is required.' }, 400)
    if (content.length > 8000) return json({ error: 'Content must be under 8000 characters.' }, 400)
    if (title.length > 200) return json({ error: 'Title must be under 200 characters.' }, 400)

    // ── 8. Reserve credit optimistically ────────────────────────────────────
    let creditReserved = false
    if (limit !== -1) {
      try {
        await admin.rpc('increment_ai_credits', { user_id_param: user.id, reset_month: month })
        creditReserved = true
      } catch {
        await admin.from('profiles').update({
          ai_credits_used: (profile.ai_credits_used || 0) + 1,
          ai_credits_reset: month,
        }).eq('id', user.id)
        creditReserved = true
      }
    }

    // ── 9. Create/update presentation row with status='generating' ──────────
    const presentationLogo = profile.teams?.team_prefs?.ai_tools?.presentation_logo || null
    const presentationLogoDark = profile.teams?.team_prefs?.ai_tools?.presentation_logo_dark || null
    const fallbackLogo = profile.teams?.team_prefs?.logo_url || null
    const teamName = profile.teams?.name || ''

    // ── 11. Save to database ────────────────────────────────────────────────
    const presData = {
      user_id: user.id,
      team_id: profile.team_id || null,
      title,
      style,
      theme: presTheme,
      font,
      color_scheme: colorScheme,
      content,
      html: null as string | null,
      slide_count: 0,
      status: 'generating',
      updated_at: new Date().toISOString(),
    }

    let savedId: string
    if (presentationId) {
      const { error } = await admin
        .from('presentations')
        .update(presData)
        .eq('id', presentationId)
        .eq('user_id', user.id)
      if (error) {
        console.error('presentations update error:', error.message)
        return json({ error: 'Failed to save presentation.' }, 500)
      }
      savedId = presentationId
    } else {
      const { data: inserted, error } = await admin
        .from('presentations')
        .insert(presData)
        .select('id')
        .single()
      if (error || !inserted) {
        console.error('presentations insert error:', error?.message)
        return json({ error: 'Failed to save presentation.' }, 500)
      }
      savedId = inserted.id
    }

    // ── 10. Fire background generation (self-call) ──────────────────────────
    const bgPayload = {
      _bgMode: true,
      presentationId: savedId,
      userId: user.id,
      teamId: profile.team_id || null,
      isAdmin,
      title,
      style,
      presTheme,
      font,
      colorScheme,
      content,
      backgroundImage,
      overlayOpacity,
      creditReserved,
      creditLimit: limit,
      profileData: {
        teamLogo: presentationLogo,
        teamLogoDark: presentationLogoDark,
        fallbackLogo,
        teamName,
        agentName: profile.full_name || '',
        agentEmail: user.email || '',
        agentPhone: profile.habit_prefs?.bio?.phone || '',
        agentLicense: profile.habit_prefs?.bio?.license || '',
        agentAvatar: profile.goals?.avatar_url || '',
      },
    }

    // Fire-and-forget — creates a new edge function invocation
    fetch(`${supabaseUrl}/functions/v1/generate-presentation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify(bgPayload),
    }).catch(err => console.error('Failed to trigger background generation:', err))

    // Brief wait to ensure the fetch request is dispatched before we return
    await new Promise(r => setTimeout(r, 100))

    // ── 11. Return immediately ──────────────────────────────────────────────
    return json({
      id: savedId,
      status: 'generating',
      title,
    })
  } catch (err) {
    console.error('generate-presentation error:', (err as Error)?.message || err, (err as Error)?.stack || '')
    return json({ error: 'An unexpected error occurred. Please try again.' }, 500)
  }
})
