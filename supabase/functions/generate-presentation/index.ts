// supabase/functions/generate-presentation/index.ts
// Generates an HTML slideshow presentation using Claude. Returns the full HTML
// and saves/updates the presentation in the database.
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
    // Tracks total generations (not stored presentations) — deleting doesn't free quota
    if (!isAdmin && profile.team_id && profile.teams) {
      const month = currentMonth()
      let genUsed = profile.teams.pres_generations_used || 0
      const genReset = profile.teams.pres_generations_reset || ''

      // Reset counter if month rolled over
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

      creditsUsed = (teamMembers || []).reduce((sum, m) => {
        return sum + (m.ai_credits_reset === month ? (m.ai_credits_used || 0) : 0)
      }, 0)
    }

    if (limit !== -1 && creditsUsed >= limit) {
      return json({ error: 'credits_exhausted', plan: effectivePlan, limit, used: creditsUsed }, 429)
    }

    // ── 7. Parse and validate request body ──────────────────────────────────
    const ct = req.headers.get('content-type') || ''
    if (!ct.includes('application/json')) {
      return json({ error: 'Content-Type must be application/json' }, 400)
    }

    let reqBody: Record<string, unknown>
    try { reqBody = await req.json() } catch { return json({ error: 'Invalid JSON body' }, 400) }

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

    // ── 9. Build system prompt (slides-only approach) ──────────────────────
    // Prefer wide presentation logo, fallback to square team logo
    const presentationLogo = profile.teams?.team_prefs?.ai_tools?.presentation_logo || null
    const teamLogo = presentationLogo || profile.teams?.team_prefs?.logo_url || null
    const teamName = profile.teams?.name || ''

    const systemPrompt = `You are a presentation builder for real estate professionals. Output ONLY a series of <section> HTML elements — one per slide. Do NOT output <!DOCTYPE>, <html>, <head>, <body>, <style>, or <script> tags. The shell template is provided separately.

RULES:
- First <section> must be the title slide with class="title-slide" and an <h1> for the title
- Last <section> must be a closing/thank-you slide with class="closing-slide"
- Each main point or bullet group = its own <section>
- Use <h2> for slide headings, <h3> for subheadings
- Use <ul>/<li> for bullet lists, <p> for paragraphs
- Use <strong> and <em> for emphasis
- Keep content concise — bullet points, not paragraphs
- Do NOT include any <img> tags — images are injected separately
- The closing slide should have a brief thank-you or closing message — agent contact info is added automatically

The presentation title is: "${title}"

Output ONLY the <section> elements, nothing else. No markdown fencing, no explanation.`

    // ── 10. Call Claude API ─────────────────────────────────────────────────
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicKey) {
      if (creditReserved) { try { await admin.rpc('decrement_ai_credit', { user_id_param: user.id }) } catch { /* best-effort */ } }
      return json({ error: 'ANTHROPIC_API_KEY not configured' }, 500)
    }

    const fetchController = new AbortController()
    const fetchTimeout = setTimeout(() => fetchController.abort(), 90000)

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
          max_tokens: 4096,
          system: systemPrompt,
          messages: [{ role: 'user', content }],
          stream: false,
        }),
        signal: fetchController.signal,
      })
    } catch (fetchErr) {
      clearTimeout(fetchTimeout)
      if (creditReserved) {
        try { await admin.rpc('decrement_ai_credit', { user_id_param: user.id }) } catch { /* best-effort */ }
      }
      console.error('Claude API fetch error:', fetchErr)
      return json({ error: 'AI service is temporarily unavailable. Please try again.' }, 502)
    }
    clearTimeout(fetchTimeout)

    if (!claudeResponse.ok) {
      const errBody = await claudeResponse.text()
      console.error('Claude API error:', claudeResponse.status, errBody)
      if (creditReserved) {
        try { await admin.rpc('decrement_ai_credit', { user_id_param: user.id }) } catch { /* best-effort */ }
      }
      return json({ error: 'AI service is temporarily unavailable. Please try again.' }, 502)
    }

    const claudeData = await claudeResponse.json()
    let slidesHtml = ''
    if (claudeData.content && Array.isArray(claudeData.content)) {
      for (const block of claudeData.content) {
        if (block.type === 'text') slidesHtml += block.text
      }
    }

    if (!slidesHtml.trim()) {
      if (creditReserved) {
        try { await admin.rpc('decrement_ai_credit', { user_id_param: user.id }) } catch { /* best-effort */ }
      }
      return json({ error: 'Failed to generate presentation. Please try again.' }, 500)
    }

    // Strip markdown fencing if Claude wrapped it anyway
    slidesHtml = slidesHtml.trim()
    if (slidesHtml.startsWith('```html')) slidesHtml = slidesHtml.slice(7)
    else if (slidesHtml.startsWith('```')) slidesHtml = slidesHtml.slice(3)
    if (slidesHtml.endsWith('```')) slidesHtml = slidesHtml.slice(0, -3)
    slidesHtml = slidesHtml.trim()

    // Count slides
    const slideCount = (slidesHtml.match(/<section/gi) || []).length

    // ── 11. Inject logo + agent CTA ────────────────────────────────────────
    // Inject logo into title slide
    if (teamLogo) {
      const titleMatch = slidesHtml.match(/<section[^>]*class="[^"]*title-slide[^"]*"[^>]*>/)
      if (titleMatch && titleMatch.index !== undefined) {
        const pos = titleMatch.index + titleMatch[0].length
        slidesHtml = slidesHtml.slice(0, pos) +
          `\n<img src="${teamLogo}" class="team-logo" alt="${esc(teamName || 'Logo')}">` +
          slidesHtml.slice(pos)
      }
    }

    // Inject agent CTA card into closing slide
    const agentName = profile.full_name || ''
    const agentEmail = user.email || ''
    const agentPhone = profile.habit_prefs?.bio?.phone || ''
    const agentLicense = profile.habit_prefs?.bio?.license || ''
    const agentAvatar = profile.goals?.avatar_url || ''

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

    // Inject background overlay div into each section if background image selected
    if (backgroundImage) {
      slidesHtml = slidesHtml.replace(/<section([^>]*)>/g, '<section$1><div class="bg-overlay"></div>')
    }

    // ── 12. Build full HTML from template ───────────────────────────────────
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
    const mutedFg = isDark ? '#71717a' : '#71717a'
    const subtleBorder = isDark ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.06)'
    const headingFont = font === 'serif' ? '"Playfair Display",Georgia,"Times New Roman",serif'
      : font === 'monospace' ? '"JetBrains Mono","SF Mono","Fira Code",monospace'
      : '"Inter",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif'
    const bodyFont = '"Inter",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif'

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
          : `linear-gradient(135deg,#f8faff 0%,#eef2ff 50%,#f0f4ff 100%)`}}`,
        // Large floating orb top-right
        `section.title-slide::after{content:'';position:absolute;top:-20%;right:-10%;width:60vw;height:60vw;background:radial-gradient(circle,rgba(${c.glow},.15) 0%,rgba(${c.glow},.05) 30%,transparent 60%);filter:blur(60px);pointer-events:none;z-index:0}`,
        // Secondary orb bottom-left
        `section.title-slide::before{display:block;content:'';position:absolute;bottom:-20%;left:-10%;width:50vw;height:50vw;background:radial-gradient(circle,${c.accent}12 0%,transparent 55%);filter:blur(80px);pointer-events:none;z-index:0}`,
        // z-index lift for content — MUST exclude .bg-overlay so background images still work
        `section.title-slide>*:not(.bg-overlay){position:relative;z-index:1}`,
        // ── Gradient text h1 with glow ──
        `section h1{background:linear-gradient(135deg,${c.primary} 0%,${c.accent} 45%,${c.secondary} 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;filter:drop-shadow(0 0 40px rgba(${c.glow},.15))}`,
        `section.title-slide h1{font-size:4em;letter-spacing:-.05em}`,
        // ── Glassmorphic accent bar (left edge) ──
        `section::before{content:'';position:absolute;top:0;left:0;width:4px;height:100%;background:linear-gradient(180deg,${c.primary},${c.accent},${c.secondary}40,transparent);opacity:.8;border-radius:0 4px 4px 0}`,
        // ── H2 with gradient underline ──
        `section h2::after{width:48px;height:3px;background:linear-gradient(90deg,${c.primary},${c.accent});border-radius:6px;margin-top:14px}`,
        // ── Content slides: frosted glass look ──
        `section:not(.title-slide):not(.closing-slide){background:${isDark ? '#0a0a14' : '#fafbff'}}`,
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
        `section.title-slide h2{font-size:1em;font-weight:500;letter-spacing:.12em;text-transform:uppercase;color:${mutedFg};opacity:.7}`,
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
        `section.title-slide h2{font-weight:300;color:${mutedFg};opacity:.4;font-size:1em;letter-spacing:.06em;text-transform:uppercase;margin-bottom:0}`,
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
        `section h3{color:${mutedFg};opacity:.5;font-size:.65em;letter-spacing:.2em}`,
        // ── Single thin rule at bottom of content slides ──
        `section:not(.title-slide):not(.closing-slide)::after{content:'';position:absolute;bottom:60px;left:160px;right:160px;height:1px;background:${isDark ? 'rgba(255,255,255,.04)' : 'rgba(0,0,0,.04)'};pointer-events:none}`,
        // ── Agent CTA: borderless, floating ──
        `.agent-cta{background:transparent;border:none;backdrop-filter:none;border-radius:0;text-align:left;min-width:auto;padding:32px 0}`,
        `.agent-cta::before{display:none}`,
        `.agent-avatar{width:56px;height:56px;border:1px solid ${subtleBorder};box-shadow:none}`,
        `.agent-cta .agent-name{font-weight:500;font-size:1.1em;letter-spacing:0}`,
        `.agent-cta .agent-details{opacity:.4}`,
        // ── Logo: faded ──
        `.team-logo{opacity:.5;max-width:200px;max-height:60px;filter:${isDark ? 'brightness(2)' : 'none'} grayscale(.3)}`,
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
      ].join('\n')
    } else if (style === 'bold') {
      // ═══════════════════════════════════════════════════════════════
      // BOLD — Magazine cover, full-bleed color, oversized everything
      // Think: Nike ads, Spotify Wrapped, TED talks
      // ═══════════════════════════════════════════════════════════════
      const darkPrimary = rgbToHex(...hexToRgb(c.primary).map(v => Math.max(0, v * 0.7)) as [number, number, number])
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
        `section.title-slide h2{color:rgba(255,255,255,.75);font-size:1.15em;font-weight:400;letter-spacing:.04em;text-shadow:0 2px 12px rgba(0,0,0,.15)}`,
        `section.title-slide h2::after{display:none}`,
        // Logo on colored bg: brighten + white drop-shadow so it pops
        `section.title-slide .team-logo{filter:brightness(1.8) saturate(0) drop-shadow(0 2px 16px rgba(0,0,0,.4));opacity:.95}`,
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
        `section.closing-slide .agent-details{color:rgba(255,255,255,.6)}`,
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
      ].join('\n')
    }

    // Background image CSS (applied via .bg-overlay div injected into each slide)
    // Uses user-controlled overlayOpacity (0-100 scale → decimal)
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
h1,h2,h3{font-family:${headingFont}}

/* ── Slide system ── */
.slides{position:relative;height:100vh;width:100vw}
section{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;padding:72px 100px 72px 120px;opacity:0;pointer-events:none;transform:translateY(12px);transition:opacity .55s cubic-bezier(.22,1,.36,1),transform .55s cubic-bezier(.22,1,.36,1);overflow-y:auto;background:${bg2}}
section.active{opacity:1;pointer-events:auto;transform:translateY(0)}
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
section h3{font-size:.68em;font-weight:600;color:${c.accent};margin-bottom:24px;letter-spacing:.16em;text-transform:uppercase}
section p{font-size:1.08em;line-height:1.9;margin-bottom:20px;color:${isDark ? '#a1a1aa' : '#52525b'};max-width:720px}
section ul{list-style:none;padding:0;margin-bottom:24px}
section li{font-size:1.05em;line-height:1.85;padding:14px 0 14px 44px;position:relative;color:${isDark ? '#a1a1aa' : '#52525b'}}
section li::before{content:'';position:absolute;left:0;top:24px;width:20px;height:2px;background:linear-gradient(90deg,${c.primary},${c.accent});border-radius:2px}
section strong{color:${c.primary};font-weight:600}
section em{font-style:italic;color:${isDark ? '#d4d4d8' : '#27272a'}}

/* ── Staggered content entrance ── */
section.active h1,section.active h2,section.active h3,section.active p,section.active li,section.active .agent-cta,section.active .team-logo{animation:slideIn .6s cubic-bezier(.22,1,.36,1) both}
section.active h1{animation-delay:.04s}
section.active .team-logo{animation-delay:.02s}
section.active h2{animation-delay:.08s}
section.active h3{animation-delay:.1s}
section.active p{animation-delay:.12s}
section.active li:nth-child(1){animation-delay:.08s}
section.active li:nth-child(2){animation-delay:.12s}
section.active li:nth-child(3){animation-delay:.16s}
section.active li:nth-child(4){animation-delay:.20s}
section.active li:nth-child(5){animation-delay:.24s}
section.active li:nth-child(6){animation-delay:.28s}
section.active li:nth-child(7){animation-delay:.32s}
section.active li:nth-child(8){animation-delay:.36s}
section.active .agent-cta{animation-delay:.2s}
@keyframes slideIn{from{opacity:0;transform:translateY(20px) scale(.99)}to{opacity:1;transform:translateY(0) scale(1)}}

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
function show(i){if(i<0||i>=ss.length)return;ss[cur].classList.remove('active');cur=i;ss[cur].classList.add('active');counter.textContent=(cur+1)+' / '+ss.length;bar.style.width=((cur+1)/ss.length*100)+'%'}
if(ss.length)show(0);
function nav(key){if(key==='ArrowRight'||key===' ')show(cur+1);else if(key==='ArrowLeft')show(cur-1)}
document.addEventListener('keydown',function(e){nav(e.key)});
window.addEventListener('message',function(e){if(e.data&&e.data.type==='keydown')nav(e.data.key)});
var pb=document.querySelector('.nav-prev'),nb=document.querySelector('.nav-next');
if(pb)pb.addEventListener('click',function(e){e.stopPropagation();show(cur-1)});
if(nb)nb.addEventListener('click',function(e){e.stopPropagation();show(cur+1)});
document.addEventListener('click',function(e){if(e.target.closest('.nav-arrows'))return;if(e.clientX>window.innerWidth/2)show(cur+1);else show(cur-1)});
})();
</script>
</body>
</html>`

    // ── 13. Save to database ────────────────────────────────────────────────
    const presentationData = {
      user_id: user.id,
      team_id: profile.team_id || null,
      title,
      style,
      theme: presTheme,
      font,
      color_scheme: colorScheme,
      content,
      html,
      slide_count: slideCount,
      updated_at: new Date().toISOString(),
    }

    let savedId: string
    if (presentationId) {
      // Update existing presentation
      const { error } = await admin
        .from('presentations')
        .update(presentationData)
        .eq('id', presentationId)
        .eq('user_id', user.id) // security: ensure user owns it
      if (error) {
        console.error('presentations update error:', error.message)
        return json({ error: 'Failed to save presentation.' }, 500)
      }
      savedId = presentationId
    } else {
      // Insert new presentation
      const { data: inserted, error } = await admin
        .from('presentations')
        .insert(presentationData)
        .select('id')
        .single()
      if (error || !inserted) {
        console.error('presentations insert error:', error?.message)
        return json({ error: 'Failed to save presentation.' }, 500)
      }
      savedId = inserted.id
    }

    // ── 14. Increment team generation counter (not affected by deletes) ────
    if (profile.team_id && !isAdmin) {
      const month = currentMonth()
      // Fetch current value fresh to avoid stale data from earlier check
      const { data: teamRow } = await admin.from('teams').select('pres_generations_used, pres_generations_reset').eq('id', profile.team_id).single()
      const curUsed = (teamRow?.pres_generations_reset === month) ? (teamRow?.pres_generations_used || 0) : 0
      await admin.from('teams').update({ pres_generations_used: curUsed + 1, pres_generations_reset: month }).eq('id', profile.team_id)
    }

    return json({
      id: savedId,
      html,
      slideCount,
      title,
    })
  } catch (err) {
    console.error('generate-presentation error:', err?.message || err, err?.stack || '')
    return json({ error: 'An unexpected error occurred. Please try again.' }, 500)
  }
})
