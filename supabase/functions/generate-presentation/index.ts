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
      ? rawOverlayOpacity : 8 // default 8%

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
    let styleCSS = ''
    let styleBodyClass = style
    if (style === 'modern') {
      styleCSS = [
        // Gradient mesh title slide — layered ambient orbs
        `section.title-slide{background:${isDark ? `linear-gradient(160deg,${bg} 0%,#0d0d18 40%,#0a0a12 100%)` : `linear-gradient(160deg,${bg} 0%,${bg2} 40%,#f0f4ff 100%)`}}`,
        `section.title-slide::after{content:'';position:absolute;top:-25%;right:-10%;width:55%;height:65%;background:radial-gradient(ellipse at 60% 40%,rgba(${c.glow},.10) 0%,transparent 60%);filter:blur(80px);pointer-events:none;z-index:0}`,
        `section.title-slide::before{display:block;content:'';position:absolute;bottom:-15%;left:5%;width:45%;height:55%;background:radial-gradient(ellipse at 40% 60%,rgba(${c.glow},.05) 0%,transparent 60%);filter:blur(100px);pointer-events:none;z-index:0}`,
        `section.title-slide>*{position:relative;z-index:1}`,
        // Gradient text h1 — vivid 3-stop
        `section h1{background:linear-gradient(135deg,${c.primary} 0%,${c.accent} 50%,${c.secondary} 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}`,
        // 5px gradient accent bar (left edge)
        `section::before{content:'';position:absolute;top:0;left:0;width:5px;height:100%;background:linear-gradient(180deg,${c.primary},${c.accent},transparent);opacity:.6;border-radius:0 3px 3px 0}`,
        // 48px h2 underline
        `section h2::after{width:48px;height:3px;background:linear-gradient(90deg,${c.primary},${c.accent})}`,
        // Very subtle dot grid bg on content slides
        `section:not(.title-slide):not(.closing-slide){background-image:radial-gradient(${isDark ? 'rgba(255,255,255,.018)' : 'rgba(0,0,0,.02)'} 1px,transparent 1px);background-size:28px 28px}`,
        // Subtle glow on hover for li
        `section li{transition:transform .2s ease}`,
      ].join('\n')
    } else if (style === 'classic') {
      styleCSS = [
        // Solid color h1 — no gradient, timeless
        `section h1{color:${c.primary};-webkit-text-fill-color:${c.primary};font-weight:700;letter-spacing:-.02em}`,
        // 3px solid accent bar (left edge)
        `section::before{background:${c.primary};width:3px;opacity:.25;border-radius:0 2px 2px 0}`,
        // Full-width 1px underline on h2
        `section h2::after{width:100%;height:1px;background:${c.primary};opacity:.15;border-radius:0;margin-top:18px}`,
        // Round dot bullets
        `section li::before{width:7px;height:7px;border-radius:50%;top:23px;background:${c.primary};opacity:.45}`,
        `section li{padding-left:30px}`,
        // Elegant top-right corner accent
        `section:not(.title-slide):not(.closing-slide)::after{content:'';position:absolute;top:44px;right:56px;width:48px;height:48px;border-top:1.5px solid ${c.primary}18;border-right:1.5px solid ${c.primary}18;pointer-events:none}`,
        // Title slide — clean, dignified
        `section.title-slide{background:${isDark ? `linear-gradient(180deg,${bg2} 0%,${bg} 100%)` : `linear-gradient(180deg,#fff 0%,${bg} 100%)`}}`,
        `section.title-slide h1{font-size:3.2em}`,
        // Subtle serif feel for headings if using serif font
        `section h2{font-weight:600}`,
      ].join('\n')
    } else if (style === 'minimal') {
      styleCSS = [
        // Extra breathing room
        `section{padding:80px 140px}`,
        `section.title-slide{padding:80px 140px}`,
        // Light, airy h1 — no gradient, just weight
        `section h1{color:${fg};-webkit-text-fill-color:${fg};font-weight:300;letter-spacing:-.03em;font-size:3.8em;line-height:1.08}`,
        // No accent bar
        `section::before{display:none}`,
        // Subtle h2 — no underline
        `section h2{font-weight:400;color:${fg};letter-spacing:-.015em;font-size:1.6em}`,
        `section h2::after{display:none}`,
        // Ultra-thin faded dash bullets
        `section li::before{width:16px;height:1px;background:${mutedFg};opacity:.18;top:23px}`,
        `section li{padding-left:36px;color:${mutedFg};font-weight:400;line-height:1.9}`,
        `section p{color:${mutedFg};font-weight:400;line-height:2;max-width:640px}`,
        // Muted strong text
        `section strong{color:${fg};font-weight:500}`,
        // Ultra-thin bottom divider
        `section:not(.title-slide):not(.closing-slide)::after{content:'';position:absolute;bottom:56px;left:140px;right:140px;height:1px;background:${subtleBorder};pointer-events:none}`,
        // Title slide — pure, no gradient orbs
        `section.title-slide{background:${bg2}}`,
        `section.title-slide h2{font-weight:300;opacity:.5;font-size:1.05em;letter-spacing:.04em}`,
        // Minimal agent CTA
        `.agent-cta{background:transparent;border:1px solid ${subtleBorder};backdrop-filter:none;border-radius:12px}`,
        `.agent-cta::before{display:none}`,
        // Hide progress dot glow
        `.progress::after{display:none}`,
        `.progress{opacity:.2;height:1px}`,
      ].join('\n')
    } else if (style === 'bold') {
      styleCSS = [
        // Giant gradient text — huge, dramatic
        `section h1{font-size:4.2em;line-height:1.02;font-weight:900;background:linear-gradient(135deg,${c.primary} 0%,${c.accent} 60%,${c.secondary} 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;letter-spacing:-.05em}`,
        `section h2{font-size:2.6em;font-weight:800;letter-spacing:-.03em}`,
        // 8px thick accent bar (left edge)
        `section::before{width:8px;background:linear-gradient(180deg,${c.primary},${c.accent});border-radius:0 4px 4px 0;opacity:.7}`,
        // Thick 60px h2 underline
        `section h2::after{height:4px;width:60px;border-radius:4px;background:linear-gradient(90deg,${c.primary},${c.accent})}`,
        // Bold bullet bars
        `section li::before{height:3px;width:24px;border-radius:2px;background:linear-gradient(90deg,${c.primary},${c.accent})}`,
        `section li{font-size:1.1em;font-weight:500}`,
        // Full bleed gradient title slide — immersive
        `section.title-slide{background:linear-gradient(150deg,${c.primary} 0%,${isDark ? '#080810' : c.accent + '08'} 100%);position:relative}`,
        `section.title-slide::after{content:'';position:absolute;bottom:0;left:0;right:0;height:40%;background:linear-gradient(to top,rgba(0,0,0,.3),transparent);pointer-events:none;z-index:0}`,
        `section.title-slide>*{position:relative;z-index:1}`,
        `section.title-slide h1{-webkit-text-fill-color:#fff;background:none;text-shadow:0 4px 32px rgba(0,0,0,.25);font-size:4.4em}`,
        `section.title-slide h2{color:rgba(255,255,255,.7);font-size:1.2em;font-weight:400}`,
        `section.title-slide .team-logo{filter:brightness(10) drop-shadow(0 2px 12px rgba(0,0,0,.4))}`,
        // Bigger agent CTA
        `.agent-cta{padding:36px 56px;border-radius:24px}`,
        `.agent-cta .agent-name{font-size:1.5em}`,
        // Thicker progress bar
        `.progress{height:4px;opacity:.6}`,
        `.progress::after{width:14px;height:14px;top:-5px}`,
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
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Playfair+Display:wght@400;600;700;800;900&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{background:${bg};color:${fg};font-family:${bodyFont};overflow:hidden;height:100vh;width:100vw;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;font-feature-settings:'cv02','cv03','cv04','cv11'}
h1,h2,h3{font-family:${headingFont}}

/* ── Slide system ── */
.slides{position:relative;height:100vh;width:100vw}
section{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;padding:80px 120px 80px;opacity:0;pointer-events:none;transform:translateY(20px);transition:opacity .5s cubic-bezier(.16,1,.3,1),transform .5s cubic-bezier(.16,1,.3,1);overflow-y:auto;background:${bg2}}
section.active{opacity:1;pointer-events:auto;transform:translateY(0)}
section.title-slide{text-align:center;align-items:center;padding:80px 120px}
section.closing-slide{text-align:center;align-items:center}

/* ── Accent bar (left edge) ── */
section::before{content:'';position:absolute;top:0;left:0;width:4px;height:100%;background:linear-gradient(180deg,${c.primary},${c.accent});opacity:.5}
section.title-slide::before,section.closing-slide::before{display:none}

/* ── Typography ── */
section h1{font-size:3.6em;font-weight:800;color:${c.primary};margin-bottom:16px;line-height:1.05;letter-spacing:-.04em}
section h2{font-size:1.75em;font-weight:700;color:${fg};margin-bottom:40px;line-height:1.25;letter-spacing:-.025em;position:relative;display:inline-block}
section h2::after{content:'';display:block;width:48px;height:3px;background:linear-gradient(90deg,${c.primary},${c.accent});border-radius:2px;margin-top:16px}
section.title-slide h2,section.closing-slide h2{font-weight:400;color:${mutedFg};font-size:1.15em;letter-spacing:.02em;margin-bottom:8px}
section.title-slide h2::after,section.closing-slide h2::after{display:none}
section h3{font-size:.7em;font-weight:600;color:${c.accent};margin-bottom:20px;letter-spacing:.14em;text-transform:uppercase}
section p{font-size:1.1em;line-height:1.85;margin-bottom:20px;color:${isDark ? '#a1a1aa' : '#3f3f46'};max-width:760px}
section ul{list-style:none;padding:0;margin-bottom:24px}
section li{font-size:1.05em;line-height:1.8;padding:14px 0 14px 44px;position:relative;color:${isDark ? '#a1a1aa' : '#3f3f46'}}
section li::before{content:'';position:absolute;left:0;top:24px;width:20px;height:2px;background:linear-gradient(90deg,${c.primary},${c.accent});border-radius:1px}
section strong{color:${c.primary};font-weight:600}
section em{font-style:italic;color:${isDark ? '#d4d4d8' : '#27272a'}}

/* ── Staggered content entrance ── */
section.active h1,section.active h2,section.active h3,section.active p,section.active li,section.active .agent-cta{animation:fadeUp .5s cubic-bezier(.16,1,.3,1) both}
section.active h1{animation-delay:.05s}
section.active h2{animation-delay:.1s}
section.active h3{animation-delay:.12s}
section.active p{animation-delay:.15s}
section.active li:nth-child(1){animation-delay:.12s}
section.active li:nth-child(2){animation-delay:.17s}
section.active li:nth-child(3){animation-delay:.22s}
section.active li:nth-child(4){animation-delay:.27s}
section.active li:nth-child(5){animation-delay:.32s}
section.active li:nth-child(6){animation-delay:.37s}
section.active li:nth-child(7){animation-delay:.42s}
section.active li:nth-child(8){animation-delay:.47s}
section.active .agent-cta{animation-delay:.25s}
@keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}

/* ── Logo ── */
.team-logo{max-width:360px;max-height:100px;margin-bottom:44px;object-fit:contain;opacity:.92;filter:drop-shadow(0 2px 8px rgba(0,0,0,.08))}

/* ── Watermark ── */
.watermark{position:fixed;bottom:24px;left:36px;max-height:24px;opacity:.08;z-index:10;filter:grayscale(1)}
.watermark-text{position:fixed;bottom:26px;left:36px;font-size:9px;opacity:.12;color:${mutedFg};z-index:10;font-weight:600;letter-spacing:2px;text-transform:uppercase}

/* ── Slide counter ── */
.counter{position:fixed;bottom:26px;right:36px;font-size:11px;font-weight:500;color:${mutedFg};z-index:10;opacity:.3;letter-spacing:2px;font-variant-numeric:tabular-nums;font-family:${bodyFont}}

/* ── Nav buttons ── */
.nav-arrows{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);display:flex;gap:6px;z-index:10;opacity:0;transition:opacity .4s}
body:hover .nav-arrows{opacity:.3}
.nav-arrows:hover{opacity:1!important}
.nav-btn{width:36px;height:36px;border-radius:10px;border:1px solid ${subtleBorder};background:${isDark ? 'rgba(255,255,255,.04)' : 'rgba(255,255,255,.9)'};backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);color:${mutedFg};cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:16px;transition:all .2s cubic-bezier(.16,1,.3,1);-webkit-appearance:none;font-family:system-ui}
.nav-btn:hover{background:${c.primary};color:#fff;border-color:transparent;box-shadow:0 0 0 1px ${c.primary},0 4px 24px rgba(${c.glow},.3)}

/* ── Agent CTA ── */
.agent-cta{margin-top:48px;padding:32px 48px;background:${isDark ? 'rgba(255,255,255,.04)' : 'rgba(255,255,255,.7)'};backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border-radius:20px;border:1px solid ${subtleBorder};display:inline-block;min-width:340px;text-align:center;position:relative;overflow:hidden}
.agent-cta::before{content:'';position:absolute;inset:-1px;border-radius:17px;padding:1px;background:linear-gradient(135deg,${c.primary}30,${c.accent}20,transparent);-webkit-mask:linear-gradient(#fff 0 0) content-box,linear-gradient(#fff 0 0);-webkit-mask-composite:xor;mask-composite:exclude;pointer-events:none}
.agent-avatar{width:72px;height:72px;border-radius:50%;object-fit:cover;margin-bottom:16px;border:2px solid ${subtleBorder};box-shadow:0 2px 12px rgba(${c.glow},.15)}
.agent-cta .agent-name{font-size:1.3em;font-weight:700;color:${fg};margin-bottom:10px;font-family:${headingFont};letter-spacing:-.02em}
.agent-cta .agent-details{font-size:.85em;color:${mutedFg};line-height:2;letter-spacing:.03em}

/* ── Progress bar ── */
.progress{position:fixed;bottom:0;left:0;height:2px;background:linear-gradient(90deg,${c.primary},${c.accent});z-index:10;transition:width .5s cubic-bezier(.16,1,.3,1);opacity:.4}
.progress::after{content:'';position:absolute;right:0;top:-4px;width:10px;height:10px;border-radius:50%;background:${c.accent};box-shadow:0 0 12px rgba(${c.glow},.5);opacity:.6}

/* ── Style preset overrides ── */
${styleCSS}
${bgImageCSS ? `/* ── Background image ── */\n${bgImageCSS}` : ''}

/* ── Responsive ── */
@media(max-width:768px){
section{padding:48px 36px 72px}
section h1{font-size:2.4em}
section h2{font-size:1.4em}
section.title-slide{padding:52px 36px}
.team-logo{max-width:180px;max-height:100px}
.agent-cta{min-width:auto;padding:24px 28px}
section li{padding-left:36px}
section p{font-size:1em}
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
