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

function postProcessSlides(html: string, teamLogo: string | null): string {
  // Auto-assign data-layout to sections missing it
  html = html.replace(/<section([^>]*)>/gi, (match, attrs: string) => {
    if (/data-layout/i.test(attrs)) return match
    // Title/closing slides get default layout
    if (/title-slide|closing-slide/i.test(attrs)) {
      return `<section${attrs} data-layout="default">`
    }
    // Peek at the content after this tag to infer layout
    const idx = html.indexOf(match) + match.length
    const snippet = html.slice(idx, idx + 600)
    if (/<blockquote/i.test(snippet)) {
      return `<section${attrs} data-layout="quote">`
    }
    const numMatches = snippet.match(/\d[\d,.]*%|\$[\d,.]+|\d{2,}/g)
    if (numMatches && numMatches.length >= 3) {
      return `<section${attrs} data-layout="stats">`
    }
    if (/feature-grid|feature-item/i.test(snippet)) {
      return `<section${attrs} data-layout="features">`
    }
    if (/col-left|col-right/i.test(snippet)) {
      return `<section${attrs} data-layout="two-column">`
    }
    if (/highlight-box/i.test(snippet)) {
      return `<section${attrs} data-layout="highlight">`
    }
    return `<section${attrs} data-layout="default">`
  })

  // Inject logo into title slide
  if (teamLogo) {
    html = html.replace(
      /(<section[^>]*title-slide[^>]*>)/i,
      `$1\n<img src="${teamLogo}" class="slide-logo" alt="Logo">`
    )
  }

  // Strip stray style/script tags from AI output
  html = html.replace(/<style[\s\S]*?<\/style>/gi, '')
  html = html.replace(/<script[\s\S]*?<\/script>/gi, '')

  return html
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

    const systemPrompt = `You are a presentation builder. Output ONLY <section> elements — one per slide. No <!DOCTYPE>, <html>, <head>, <body>, <style>, <script> tags.

RULES:
- First <section class="title-slide"> has <h1> for the title
- Last <section class="closing-slide"> is a closing/thank-you slide
- Each <section> gets a data-layout attribute. Mix layouts for variety — never use the same layout twice in a row:
  "default" = heading + bullet list
  "two-column" = wrap content in <div class="col-left"> and <div class="col-right">
  "stats" = 3-4 <div class="stat-item"> each with <span class="stat-number"> and <span class="stat-label">
  "quote" = <blockquote> with <div class="attribution">
  "features" = <div class="feature-grid"> with <div class="feature-item"> children
  "highlight" = <div class="highlight-box"> for key callouts
- Use <h2> for headings, <h3> for subheadings, <ul>/<li> for lists
- Use <strong>/<em> for emphasis. Keep content concise — bullets, not paragraphs
${logoNote}

Title: "${title}"

Output ONLY <section> elements. No markdown, no explanation.`

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
          system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
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

    // Post-process: auto-detect layouts, inject logo, strip stray tags
    slidesHtml = postProcessSlides(slidesHtml, profile.teams?.team_prefs?.logo_url || null)

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

    const logoWatermark = teamLogo
      ? `<img src="${teamLogo}" class="watermark" alt="">`
      : teamName ? `<span class="watermark-text">${teamName}</span>` : ''

    const styleVariants: Record<string, string> = {
      modern: `
        section{border-radius:16px;margin:8px;box-shadow:0 1px 3px rgba(0,0,0,.06)}
        section h2{background:linear-gradient(135deg,${c.primary},${c.accent});
          -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
        section[data-layout="stats"] .stat-number{
          background:linear-gradient(135deg,${c.primary},${c.accent});
          -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
      `,
      classic: `
        section{border:2px solid ${c.primary}22;border-radius:0}
        section h2{border-bottom:2px solid ${c.primary};padding-bottom:12px;font-variant:small-caps}
        section li::before{border-radius:0;width:6px;height:6px}
        section[data-layout="quote"] blockquote{border-left:4px solid ${c.primary};font-family:${headingFont}}
      `,
      minimal: `
        section{padding:60px 80px;background:transparent}
        section h2{font-weight:400;letter-spacing:-.01em;font-size:1.6em}
        section li::before{width:4px;height:4px;top:16px}
        section[data-layout="features"] .feature-item{background:transparent;border:none;
          border-bottom:1px solid ${isDark ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.06)'};border-radius:0}
      `,
      bold: `
        section h1{font-size:3.2em;text-transform:uppercase;letter-spacing:-.02em}
        section h2{font-size:2.4em;text-transform:uppercase;letter-spacing:-.01em}
        section[data-layout="stats"] .stat-number{font-size:3.2em}
        section li::before{width:12px;height:12px;background:${c.primary}}
      `,
    }
    const styleVariant = styleVariants[style] || ''

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
  padding:48px 64px;opacity:0;pointer-events:none;
  transform:translateY(12px);
  transition:opacity .5s cubic-bezier(.4,0,.2,1),transform .5s cubic-bezier(.4,0,.2,1);
  background:${slideBg};overflow-y:auto}
section.active{opacity:1;pointer-events:auto;transform:translateY(0)}
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
/* Staggered entrance animations */
section.active h2,section.active h3,section.active p,
section.active li,section.active blockquote,
section.active .stat-item,section.active .feature-item,
section.active .highlight-box{animation:slideIn .4s cubic-bezier(.4,0,.2,1) both}
section.active h2{animation-delay:.1s}
section.active li:nth-child(1){animation-delay:.15s}
section.active li:nth-child(2){animation-delay:.25s}
section.active li:nth-child(3){animation-delay:.35s}
section.active li:nth-child(4){animation-delay:.45s}
section.active li:nth-child(5){animation-delay:.55s}
section.active p{animation-delay:.2s}
@keyframes slideIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
/* Two-column layout */
section[data-layout="two-column"]{flex-direction:column}
section[data-layout="two-column"] .col-left,
section[data-layout="two-column"] .col-right{flex:1}
@media(min-width:641px){
  section[data-layout="two-column"]{flex-direction:row;flex-wrap:wrap;align-items:flex-start;gap:32px}
  section[data-layout="two-column"] h2{width:100%}
  section[data-layout="two-column"] .col-left,
  section[data-layout="two-column"] .col-right{flex:1;min-width:0}
}
/* Stats layout */
section[data-layout="stats"]{align-items:center}
section[data-layout="stats"] .stat-item{
  display:inline-flex;flex-direction:column;align-items:center;padding:20px 28px;margin:8px}
section[data-layout="stats"] .stat-number{
  font-size:2.4em;font-weight:800;color:${c.primary};line-height:1.1}
section[data-layout="stats"] .stat-label{
  font-size:.85em;color:${mutedFg};margin-top:6px;text-transform:uppercase;letter-spacing:.5px;font-weight:600}
/* Quote layout */
section[data-layout="quote"]{align-items:center;justify-content:center;text-align:center}
section[data-layout="quote"] blockquote{
  font-size:1.4em;font-style:italic;line-height:1.6;max-width:700px;
  position:relative;padding:0 24px;color:${fg};border-left:4px solid ${c.accent}}
section[data-layout="quote"] .attribution{
  margin-top:16px;font-size:.85em;font-style:normal;color:${mutedFg};font-weight:600}
/* Features grid layout */
section[data-layout="features"] .feature-grid{
  display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:20px;width:100%}
section[data-layout="features"] .feature-item{
  padding:20px;border-radius:12px;
  background:${isDark ? 'rgba(255,255,255,.04)' : 'rgba(0,0,0,.02)'};
  border:1px solid ${isDark ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.06)'}}
/* Highlight layout */
section[data-layout="highlight"] .highlight-box{
  background:${isDark ? 'rgba(255,255,255,.06)' : c.primary + '08'};
  border:2px solid ${c.accent}40;border-radius:16px;
  padding:32px 40px;max-width:600px;text-align:center}
.team-logo{max-width:160px;max-height:90px;margin-bottom:20px}
.slide-logo{max-width:140px;max-height:80px;margin-bottom:16px}
.watermark{position:fixed;bottom:16px;left:20px;max-height:26px;opacity:.35;z-index:10}
.watermark-text{position:fixed;bottom:16px;left:20px;font-size:11px;opacity:.3;color:${mutedFg};z-index:10}
.counter{position:fixed;bottom:16px;right:20px;font-size:13px;color:${mutedFg};
  font-family:${bodyFont};z-index:10;opacity:.7}
.nav-hint{position:fixed;bottom:16px;left:50%;transform:translateX(-50%);
  font-size:11px;color:${mutedFg};opacity:.4;z-index:10;transition:opacity .3s}
.progress-bar{position:fixed;bottom:0;left:0;right:0;height:3px;
  background:${isDark ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.06)'};z-index:10}
.progress-fill{height:100%;background:${c.accent};transition:width .4s cubic-bezier(.4,0,.2,1);width:0}
${styleVariant}
@media(max-width:640px){section{padding:28px 24px}section h1{font-size:1.8em}section h2{font-size:1.3em}
  section[data-layout="stats"] .stat-number{font-size:1.8em}
  section[data-layout="stats"] .stat-item{padding:12px 16px}
  section[data-layout="features"] .feature-grid{grid-template-columns:1fr}
  section[data-layout="quote"] blockquote{font-size:1.1em}}
</style>
</head>
<body>
${logoWatermark}
<div class="counter"></div>
<div class="progress-bar"><div class="progress-fill"></div></div>
<div class="nav-hint">\u2190 \u2192 arrow keys to navigate</div>
<div class="slides">
${slidesHtml}
</div>
<script>
(function(){
  var ss=document.querySelectorAll('.slides section');
  var counter=document.querySelector('.counter');
  var pf=document.querySelector('.progress-fill');
  var hint=document.querySelector('.nav-hint');
  var cur=0;
  function show(i){
    if(i<0||i>=ss.length)return;
    ss[cur].classList.remove('active');
    cur=i;
    ss[cur].classList.add('active');
    counter.textContent=(cur+1)+' / '+ss.length;
    if(pf)pf.style.width=((cur+1)/ss.length*100)+'%';
    if(hint&&cur>0)hint.style.opacity='0';
  }
  if(ss.length)show(0);
  document.addEventListener('keydown',function(e){
    if(e.key==='ArrowRight'||e.key===' '||e.key==='PageDown')show(cur+1);
    else if(e.key==='ArrowLeft'||e.key==='PageUp')show(cur-1);
    else if(e.key==='Home')show(0);
    else if(e.key==='End')show(ss.length-1);
  });
  document.addEventListener('click',function(e){
    if(e.target.tagName==='A'||e.target.tagName==='BUTTON')return;
    if(e.clientX>window.innerWidth/2)show(cur+1);else show(cur-1);
  });
  var tx=0,ty=0;
  document.addEventListener('touchstart',function(e){
    tx=e.changedTouches[0].screenX;ty=e.changedTouches[0].screenY;
  },{passive:true});
  document.addEventListener('touchend',function(e){
    var dx=e.changedTouches[0].screenX-tx,dy=e.changedTouches[0].screenY-ty;
    if(Math.abs(dx)>Math.abs(dy)&&Math.abs(dx)>50){if(dx<0)show(cur+1);else show(cur-1);}
  },{passive:true});
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
