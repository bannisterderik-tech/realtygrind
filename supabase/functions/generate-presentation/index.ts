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

function currentMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const VALID_STYLES = ['modern', 'classic', 'minimal', 'bold']
const VALID_THEMES = ['light', 'dark', 'brand']
const VALID_FONTS  = ['sans-serif', 'serif', 'monospace']
const VALID_COLORS = ['blue', 'gold', 'green', 'purple', 'red', 'neutral']

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
      .select('*, teams(id, name, invite_code, created_by, team_prefs, max_members, presentations_addon_status)')
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
      presentationId,
    } = reqBody as {
      title?: string
      style?: string
      theme?: string
      font?: string
      colorScheme?: string
      content?: string
      presentationId?: string
    }

    const title = (typeof rawTitle === 'string' ? rawTitle.trim() : '') || 'Untitled Presentation'
    const style = VALID_STYLES.includes(rawStyle as string) ? rawStyle as string : 'modern'
    const presTheme = VALID_THEMES.includes(rawTheme as string) ? rawTheme as string : 'light'
    const font = VALID_FONTS.includes(rawFont as string) ? rawFont as string : 'sans-serif'
    const colorScheme = VALID_COLORS.includes(rawColor as string) ? rawColor as string : 'blue'
    const content = typeof rawContent === 'string' ? rawContent.trim() : ''

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

    // ── 9. Build system prompt ──────────────────────────────────────────────
    // Get team logo if available
    const teamLogo = profile.teams?.team_prefs?.logo_url || null
    const teamName = profile.teams?.name || ''

    const logoInstruction = teamLogo
      ? `\n\nIMPORTANT — TEAM LOGO: The team's logo is provided as a base64 data URL. You MUST embed it as an <img> tag on the title slide (centered, max-width 180px, max-height 100px, margin-bottom 20px, above the title). Also include a smaller version (max-height 30px) in the bottom-left corner of every slide as a subtle brand watermark. The logo data URL is:\n${teamLogo}`
      : teamName ? `\n\nNote: The team name is "${teamName}" — include it as a text watermark in the footer of each slide.` : ''

    const systemPrompt = `You are a presentation builder for real estate professionals. Generate a complete, self-contained HTML file that is a slideshow presentation.

REQUIREMENTS:
1. Output a SINGLE HTML file with ALL CSS and JS inline — no external dependencies, CDNs, or imports
2. Slides are <section> elements inside a <div class="slides"> container
3. Implement keyboard navigation: Left/Right arrow keys to move between slides
4. Include a slide counter (current / total) in the bottom-right corner
5. The presentation MUST be responsive and work on all screen sizes
6. Include smooth slide transitions (fade or slide)
7. Support fullscreen display (the HTML will be rendered inside an iframe)

STYLE PARAMETERS:
- Style: ${style}
  ${style === 'modern' ? '→ Clean gradients, rounded corners, generous whitespace, subtle shadows' : ''}
  ${style === 'classic' ? '→ Traditional borders, structured layout, formal typography, clean lines' : ''}
  ${style === 'minimal' ? '→ Maximum whitespace, very clean, minimal decoration, content-focused' : ''}
  ${style === 'bold' ? '→ Large text, high contrast, strong visual hierarchy, impactful headers' : ''}
- Theme: ${presTheme}
  ${presTheme === 'light' ? '→ White/light gray backgrounds, dark text' : ''}
  ${presTheme === 'dark' ? '→ Dark backgrounds (#1a1a2e or similar), light text' : ''}
  ${presTheme === 'brand' ? '→ Gold/amber accent colors (#d97706, #b45309), warm tones' : ''}
- Font: ${font}
  ${font === 'sans-serif' ? '→ Use system fonts: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' : ''}
  ${font === 'serif' ? '→ Use Georgia, "Times New Roman", serif for headings; sans-serif for body' : ''}
  ${font === 'monospace' ? '→ Use "Courier New", monospace for headings; sans-serif for body text' : ''}
- Color scheme: ${colorScheme}
  ${colorScheme === 'blue' ? '→ Primary: #2563eb, accent: #3b82f6' : ''}
  ${colorScheme === 'gold' ? '→ Primary: #b45309, accent: #d97706' : ''}
  ${colorScheme === 'green' ? '→ Primary: #059669, accent: #10b981' : ''}
  ${colorScheme === 'purple' ? '→ Primary: #7c3aed, accent: #8b5cf6' : ''}
  ${colorScheme === 'red' ? '→ Primary: #dc2626, accent: #ef4444' : ''}
  ${colorScheme === 'neutral' ? '→ Primary: #374151, accent: #6b7280' : ''}
${logoInstruction}

CONTENT:
The presentation title is: "${title}"
Each main point, paragraph, or bullet group should be its own slide.
Include a title slide at the beginning and a closing/thank you slide at the end.

The user's content/outline is provided below. Transform it into polished presentation slides with proper formatting, headers, and visual hierarchy.

Output ONLY the complete HTML document starting with <!DOCTYPE html> and ending with </html>.
Do not include any markdown fencing, explanation, or commentary — just the raw HTML.`

    // ── 10. Call Claude API (non-streaming) ─────────────────────────────────
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicKey) {
      if (creditReserved) { try { await admin.rpc('decrement_ai_credit', { user_id_param: user.id }) } catch { /* best-effort */ } }
      return json({ error: 'ANTHROPIC_API_KEY not configured' }, 500)
    }

    const fetchController = new AbortController()
    const fetchTimeout = setTimeout(() => fetchController.abort(), 120000)

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
          max_tokens: 8192,
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
    let html = ''
    if (claudeData.content && Array.isArray(claudeData.content)) {
      for (const block of claudeData.content) {
        if (block.type === 'text') html += block.text
      }
    }

    if (!html.trim()) {
      if (creditReserved) {
        try { await admin.rpc('decrement_ai_credit', { user_id_param: user.id }) } catch { /* best-effort */ }
      }
      return json({ error: 'Failed to generate presentation. Please try again.' }, 500)
    }

    // Strip markdown fencing if Claude wrapped it anyway
    html = html.trim()
    if (html.startsWith('```html')) html = html.slice(7)
    else if (html.startsWith('```')) html = html.slice(3)
    if (html.endsWith('```')) html = html.slice(0, -3)
    html = html.trim()

    // Count slides (rough heuristic: count <section> tags)
    const slideCount = (html.match(/<section/gi) || []).length

    // ── 11. Save to database ────────────────────────────────────────────────
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
