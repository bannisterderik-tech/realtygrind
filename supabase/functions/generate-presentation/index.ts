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

    // ── 9. Build system prompt (slides-only approach) ──────────────────────
    const teamLogo = profile.teams?.team_prefs?.logo_url || null
    const teamName = profile.teams?.name || ''

    const logoNote = teamLogo
      ? 'The team logo will be embedded automatically — do NOT include any <img> tags for it.'
      : teamName ? `Include "${teamName}" as subtle text in the title slide subtitle area.` : ''

    const systemPrompt = `You are a presentation builder for real estate professionals. Output ONLY a series of <section> HTML elements — one per slide. Do NOT output <!DOCTYPE>, <html>, <head>, <body>, <style>, or <script> tags. The shell template is provided separately.

RULES:
- First <section> must be the title slide with an <h1> for the title
- Last <section> must be a closing/thank you slide
- Each main point or bullet group = its own <section>
- Use <h2> for slide headings, <h3> for subheadings
- Use <ul>/<li> for bullet lists, <p> for paragraphs
- Use <strong> and <em> for emphasis
- Add class="title-slide" to the first section
- Add class="closing-slide" to the last section
- Keep content concise — bullet points, not paragraphs
${logoNote}

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

    // ── 11. Build full HTML from template ─────────────────────────────────
    const COLORS: Record<string, { primary: string; accent: string }> = {
      blue:    { primary: '#2563eb', accent: '#3b82f6' },
      gold:    { primary: '#b45309', accent: '#d97706' },
      green:   { primary: '#059669', accent: '#10b981' },
      purple:  { primary: '#7c3aed', accent: '#8b5cf6' },
      red:     { primary: '#dc2626', accent: '#ef4444' },
      neutral: { primary: '#374151', accent: '#6b7280' },
    }
    const c = COLORS[colorScheme] || COLORS.blue
    const isDark = presTheme === 'dark'
    const isBrand = presTheme === 'brand'
    const bg = isDark ? '#1a1a2e' : isBrand ? '#fffbf0' : '#ffffff'
    const fg = isDark ? '#e2e8f0' : '#1e293b'
    const mutedFg = isDark ? '#94a3b8' : '#64748b'
    const slideBg = isDark ? '#16213e' : isBrand ? '#fff9eb' : '#f8fafc'
    const headingFont = font === 'serif' ? 'Georgia,"Times New Roman",serif'
      : font === 'monospace' ? '"Courier New",monospace'
      : '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif'
    const bodyFont = '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif'

    const logoImg = teamLogo
      ? `<img src="${teamLogo}" class="team-logo" alt="Team Logo">`
      : ''
    const logoWatermark = teamLogo
      ? `<img src="${teamLogo}" class="watermark" alt="">`
      : teamName ? `<span class="watermark-text">${teamName}</span>` : ''

    const styleVariant = style === 'bold'
      ? 'section h2{font-size:2.4em}section h1{font-size:3em}'
      : style === 'minimal'
      ? 'section{padding:60px 80px}section h2{font-weight:400;letter-spacing:-.01em}'
      : style === 'classic'
      ? 'section{border:2px solid ${c.primary}22;border-radius:0}section h2{border-bottom:2px solid ${c.primary};padding-bottom:12px}'
      : ''

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:${bg};color:${fg};font-family:${bodyFont};overflow:hidden;height:100vh;width:100vw}
h1,h2,h3{font-family:${headingFont};color:${c.primary}}
.slides{position:relative;height:100vh;width:100vw}
section{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;
  padding:48px 64px;opacity:0;pointer-events:none;transition:opacity .4s ease;
  background:${slideBg};overflow-y:auto}
section.active{opacity:1;pointer-events:auto}
section.title-slide{text-align:center;align-items:center}
section.closing-slide{text-align:center;align-items:center}
section h1{font-size:2.6em;margin-bottom:16px;line-height:1.2}
section h2{font-size:1.8em;margin-bottom:20px;line-height:1.3}
section h3{font-size:1.2em;margin-bottom:12px;color:${c.accent}}
section p{font-size:1.05em;line-height:1.7;margin-bottom:14px;color:${fg}}
section ul{list-style:none;padding:0;margin-bottom:16px}
section li{font-size:1.05em;line-height:1.7;padding:6px 0 6px 24px;position:relative;color:${fg}}
section li::before{content:"";position:absolute;left:0;top:14px;width:8px;height:8px;
  border-radius:50%;background:${c.accent}}
section strong{color:${c.primary}}
.team-logo{max-width:160px;max-height:90px;margin-bottom:20px}
.watermark{position:fixed;bottom:16px;left:20px;max-height:26px;opacity:.35;z-index:10}
.watermark-text{position:fixed;bottom:16px;left:20px;font-size:11px;opacity:.3;color:${mutedFg};z-index:10}
.counter{position:fixed;bottom:16px;right:20px;font-size:13px;color:${mutedFg};
  font-family:${bodyFont};z-index:10;opacity:.7}
.nav-hint{position:fixed;bottom:16px;left:50%;transform:translateX(-50%);
  font-size:11px;color:${mutedFg};opacity:.4;z-index:10}
${styleVariant}
@media(max-width:640px){section{padding:28px 24px}section h1{font-size:1.8em}section h2{font-size:1.3em}}
</style>
</head>
<body>
${logoWatermark}
<div class="counter"></div>
<div class="nav-hint">← → arrow keys to navigate</div>
<div class="slides">
${slidesHtml}
</div>
<script>
(function(){
  const ss=document.querySelectorAll('.slides section');
  const counter=document.querySelector('.counter');
  let cur=0;
  function show(i){
    if(i<0||i>=ss.length)return;
    ss[cur].classList.remove('active');
    cur=i;
    ss[cur].classList.add('active');
    counter.textContent=(cur+1)+' / '+ss.length;
  }
  if(ss.length)show(0);
  document.addEventListener('keydown',function(e){
    if(e.key==='ArrowRight'||e.key===' ')show(cur+1);
    else if(e.key==='ArrowLeft')show(cur-1);
  });
  document.addEventListener('click',function(e){
    if(e.clientX>window.innerWidth/2)show(cur+1);else show(cur-1);
  });
})();
</script>
</body>
</html>`

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
