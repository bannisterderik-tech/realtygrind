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
const VALID_THEMES = ['light', 'dark']
const VALID_FONTS  = ['sans-serif', 'serif', 'monospace']
const VALID_COLORS = ['blue', 'gold', 'green', 'purple', 'red', 'neutral']

function esc(s: string) { return s.replace(/</g, '&lt;').replace(/"/g, '&quot;') }

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

    const ctaParts: string[] = []
    if (agentEmail) ctaParts.push(esc(agentEmail))
    if (agentPhone) ctaParts.push(esc(agentPhone))
    if (agentLicense) ctaParts.push(`License #${esc(agentLicense)}`)

    if (agentName || ctaParts.length > 0) {
      const ctaHtml = `<div class="agent-cta">` +
        (agentName ? `<div class="agent-name">${esc(agentName)}</div>` : '') +
        (ctaParts.length ? `<div class="agent-details">${ctaParts.join(' &middot; ')}</div>` : '') +
        `</div>`
      const lastClose = slidesHtml.lastIndexOf('</section>')
      if (lastClose > -1) {
        slidesHtml = slidesHtml.slice(0, lastClose) + ctaHtml + slidesHtml.slice(lastClose)
      }
    }

    // ── 12. Build full HTML from template ───────────────────────────────────
    const COLORS: Record<string, { primary: string; accent: string; glow: string }> = {
      blue:    { primary: '#1e40af', accent: '#60a5fa', glow: '96,165,250' },
      gold:    { primary: '#92400e', accent: '#f59e0b', glow: '245,158,11' },
      green:   { primary: '#065f46', accent: '#34d399', glow: '52,211,153' },
      purple:  { primary: '#5b21b6', accent: '#a78bfa', glow: '167,139,250' },
      red:     { primary: '#991b1b', accent: '#f87171', glow: '248,113,113' },
      neutral: { primary: '#111827', accent: '#9ca3af', glow: '156,163,175' },
    }
    const c = COLORS[colorScheme] || COLORS.blue
    const isDark = presTheme === 'dark'
    const bg = isDark ? '#0f172a' : '#ffffff'
    const fg = isDark ? '#e2e8f0' : '#1e293b'
    const mutedFg = isDark ? '#94a3b8' : '#64748b'
    const cardBg = isDark ? 'rgba(255,255,255,.03)' : `rgba(${c.glow},.04)`
    const cardBorder = isDark ? 'rgba(255,255,255,.06)' : `rgba(${c.glow},.12)`
    const titleSlideBg = isDark
      ? `radial-gradient(ellipse at 70% 20%,rgba(${c.glow},.08) 0%,${bg} 70%)`
      : `radial-gradient(ellipse at 70% 20%,rgba(${c.glow},.06) 0%,${bg} 70%)`
    const headingFont = font === 'serif' ? 'Georgia,"Palatino Linotype","Book Antiqua",serif'
      : font === 'monospace' ? '"SF Mono","Fira Code","Courier New",monospace'
      : '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif'
    const bodyFont = '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif'

    const logoWatermark = teamLogo
      ? `<img src="${teamLogo}" class="watermark" alt="">`
      : teamName ? `<span class="watermark-text">${esc(teamName)}</span>` : ''

    // ── Style-specific CSS overrides ──
    let styleCSS = ''
    if (style === 'modern') {
      styleCSS = [
        `section.title-slide{background:${titleSlideBg}}`,
        `section::before{width:5px}`,
        `section h1{background:linear-gradient(135deg,${c.primary},${c.accent});-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}`,
      ].join('\n')
    } else if (style === 'classic') {
      styleCSS = [
        `section h1{color:${c.primary}}`,
        `section::before{background:${c.primary};width:3px}`,
        `section h2::after{width:100%;background:${c.primary}15;height:1px}`,
        `section li::before{width:7px;height:7px;border-radius:50%;top:21px;background:${c.primary}}`,
      ].join('\n')
    } else if (style === 'minimal') {
      styleCSS = [
        `section{padding:80px 140px}`,
        `section h1{color:${c.primary};font-weight:600;letter-spacing:-.02em}`,
        `section::before{display:none}`,
        `section h2{font-weight:500}`,
        `section h2::after{display:none}`,
        `section li::before{width:24px;height:1px;background:${mutedFg};opacity:.25}`,
        `section li{padding-left:44px}`,
      ].join('\n')
    } else if (style === 'bold') {
      styleCSS = [
        `section.title-slide{background:${titleSlideBg}}`,
        `section h1{font-size:4.2em;line-height:1.05;background:linear-gradient(135deg,${c.primary},${c.accent});-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}`,
        `section h2{font-size:2.6em}`,
        `section::before{width:8px}`,
        `section h2::after{height:4px;width:60px}`,
        `section li::before{height:4px;width:24px}`,
      ].join('\n')
    }

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{background:${bg};color:${fg};font-family:${bodyFont};overflow:hidden;height:100vh;width:100vw;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}
h1,h2,h3{font-family:${headingFont}}
.slides{position:relative;height:100vh;width:100vw}
section{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;padding:72px 100px 80px;opacity:0;pointer-events:none;transform:translateY(20px);transition:opacity .6s cubic-bezier(.4,0,.2,1),transform .6s cubic-bezier(.4,0,.2,1);overflow-y:auto}
section.active{opacity:1;pointer-events:auto;transform:translateY(0)}
section.title-slide{text-align:center;align-items:center;padding:80px 100px}
section.closing-slide{text-align:center;align-items:center}
section::before{content:'';position:absolute;top:0;left:0;width:5px;height:100%;background:linear-gradient(180deg,${c.primary},${c.accent})}
section.title-slide::before,section.closing-slide::before{display:none}
section h1{font-size:3.4em;font-weight:800;color:${c.primary};margin-bottom:20px;line-height:1.08;letter-spacing:-.04em}
section h2{font-size:2em;font-weight:700;color:${c.primary};margin-bottom:36px;line-height:1.2;letter-spacing:-.025em;position:relative;display:inline-block}
section h2::after{content:'';display:block;width:48px;height:3px;background:${c.accent};border-radius:2px;margin-top:12px}
section.title-slide h2,section.closing-slide h2{font-weight:400;color:${mutedFg};font-size:1.2em;letter-spacing:.01em;margin-bottom:12px}
section.title-slide h2::after,section.closing-slide h2::after{display:none}
section h3{font-size:.75em;font-weight:700;color:${c.accent};margin-bottom:18px;letter-spacing:.12em;text-transform:uppercase}
section p{font-size:1.15em;line-height:1.8;margin-bottom:18px;color:${fg};max-width:800px}
section ul{list-style:none;padding:0;margin-bottom:24px}
section li{font-size:1.12em;line-height:1.75;padding:12px 0 12px 40px;position:relative;color:${fg}}
section li::before{content:'';position:absolute;left:0;top:22px;width:20px;height:2px;background:${c.accent};border-radius:1px}
section strong{color:${c.primary};font-weight:600}
section em{font-style:italic}
.team-logo{max-width:300px;max-height:160px;margin-bottom:36px;object-fit:contain}
.watermark{position:fixed;bottom:24px;left:32px;max-height:28px;opacity:.15;z-index:10}
.watermark-text{position:fixed;bottom:24px;left:32px;font-size:10px;opacity:.15;color:${mutedFg};z-index:10;font-weight:600;letter-spacing:1px;text-transform:uppercase}
.counter{position:fixed;bottom:24px;right:32px;font-size:12px;font-weight:500;color:${mutedFg};z-index:10;opacity:.4;letter-spacing:1px;font-variant-numeric:tabular-nums}
.nav-arrows{position:fixed;bottom:18px;left:50%;transform:translateX(-50%);display:flex;gap:8px;z-index:10;opacity:0;transition:opacity .3s}
body:hover .nav-arrows{opacity:.4}
.nav-arrows:hover{opacity:.8!important}
.nav-btn{width:38px;height:38px;border-radius:50%;border:1.5px solid ${isDark ? 'rgba(255,255,255,.1)' : 'rgba(0,0,0,.08)'};background:${isDark ? 'rgba(255,255,255,.03)' : 'rgba(255,255,255,.8)'};backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);color:${mutedFg};cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:18px;transition:all .25s cubic-bezier(.4,0,.2,1);-webkit-appearance:none;font-family:system-ui}
.nav-btn:hover{background:${c.primary};color:#fff;border-color:${c.primary};transform:scale(1.1);box-shadow:0 4px 16px rgba(${c.glow},.35)}
.agent-cta{margin-top:44px;padding:36px 52px;background:${cardBg};border-radius:20px;border:1px solid ${cardBorder};display:inline-block;min-width:360px;text-align:center;backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px)}
.agent-cta .agent-name{font-size:1.4em;font-weight:700;color:${c.primary};margin-bottom:14px;font-family:${headingFont};letter-spacing:-.02em}
.agent-cta .agent-details{font-size:.92em;color:${mutedFg};line-height:2;letter-spacing:.02em}
.progress{position:fixed;bottom:0;left:0;height:2px;background:linear-gradient(90deg,${c.primary},${c.accent});z-index:10;transition:width .5s cubic-bezier(.4,0,.2,1);opacity:.5}
${styleCSS}
@media(max-width:768px){
section{padding:44px 32px 64px}
section h1{font-size:2.2em}
section h2{font-size:1.5em}
section.title-slide{padding:48px 32px}
.team-logo{max-width:200px;max-height:110px}
.agent-cta{min-width:auto;padding:24px 28px}
section li{padding-left:36px}
}
</style>
</head>
<body>
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
