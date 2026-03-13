// supabase/functions/ai-generate-tasks/index.ts
// AI-powered task list generator for RealtyGrind.
// Non-streaming: returns structured JSON task array.
// Costs 1 AI credit per generation (shared pool with ai-assistant).
//
// Required Supabase secrets:
//   ANTHROPIC_API_KEY
//   SUPABASE_SERVICE_ROLE_KEY (auto)

import { createClient } from 'npm:@supabase/supabase-js@2'

// ── CORS ─────────────────────────────────────────────────────────────────────
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
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  }
}

// Credit limits per plan tier (shared with ai-assistant)
const CREDIT_LIMITS: Record<string, number> = {
  solo: 50,
  team: 250,
  brokerage: 500,
}

function currentMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
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

    // ── 1. Auth ──────────────────────────────────────────────────────────────
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

    // ── 2. Fetch profile + team info ─────────────────────────────────────────
    const { data: profile } = await admin
      .from('profiles')
      .select('*, teams(name, invite_code, created_by, team_prefs, max_members)')
      .eq('id', user.id)
      .single()

    if (!profile) return json({ error: 'Profile not found' }, 404)

    const isAdmin = profile.app_role === 'admin'

    // Effective plan tier
    const isTeamMember = !!(profile.team_id && profile.teams?.created_by !== user.id)
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

    // ── 3. Plan gate ─────────────────────────────────────────────────────────
    const billing = profile.billing_status
    const hasBilling = billing === 'active'
    if (!isAdmin && !hasBilling && !isTeamMember) {
      return json({ error: 'subscription_required', message: 'Subscribe to a plan to use AI Task Planner.' }, 403)
    }

    // ── 4. Team gate ─────────────────────────────────────────────────────────
    if (profile.team_id && profile.teams?.team_prefs?.ai_tools?.assistant_enabled === false) {
      return json({ error: 'disabled_by_team', message: 'AI tools have been disabled by your team owner.' }, 403)
    }

    // ── 5. Credit gate ───────────────────────────────────────────────────────
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
      creditsUsed = (teamMembers || []).reduce((sum: number, m: any) => {
        return sum + (m.ai_credits_reset === month ? (m.ai_credits_used || 0) : 0)
      }, 0)
    }

    if (limit !== -1 && creditsUsed >= limit) {
      return json({ error: 'credits_exhausted', plan: effectivePlan, limit, used: creditsUsed }, 429)
    }

    // ── 6. Parse request body ────────────────────────────────────────────────
    const ct = req.headers.get('content-type') || ''
    if (!ct.includes('application/json')) {
      return json({ error: 'Content-Type must be application/json' }, 400)
    }

    let reqBody: Record<string, unknown>
    try { reqBody = await req.json() } catch { return json({ error: 'Invalid JSON body' }, 400) }

    const { scope, dates, context, guidance } = reqBody as {
      scope: string
      dates: string[]
      context: Record<string, unknown>
      guidance?: string
    }

    if (!scope || !dates?.length || !context) {
      return json({ error: 'scope, dates, and context are required' }, 400)
    }

    // ── 7. Reserve credit ────────────────────────────────────────────────────
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

    // ── 8. Build system prompt ───────────────────────────────────────────────
    const ctx = context as any
    const todayStr = new Date().toISOString().slice(0, 10)

    const contextLines = [
      `AGENT: ${ctx.profile?.name || 'Agent'}`,
      ctx.profile?.specialty ? `SPECIALTY: ${ctx.profile.specialty}` : null,
      ctx.profile?.about ? `ABOUT: ${ctx.profile.about}` : null,
      ctx.profile?.timezone ? `TIMEZONE: ${ctx.profile.timezone}` : null,

      `\nGOALS:`,
      ctx.goals?.prospecting ? `- Daily prospecting target: ${ctx.goals.prospecting} calls` : null,
      ctx.goals?.appointments ? `- Daily appointments target: ${ctx.goals.appointments}` : null,
      ctx.goals?.showing ? `- Daily showings target: ${ctx.goals.showing}` : null,
      ctx.goals?.closed || ctx.goals?.monthly_closings ? `- Monthly closings target: ${ctx.goals.closed || ctx.goals.monthly_closings}` : null,
      ctx.goals?.annual_volume ? `- Annual volume goal: $${ctx.goals.annual_volume}` : null,

      `\nEXISTING DAILY HABITS (already on their checklist — DO NOT duplicate):`,
      ...(ctx.activeHabits || []).map((h: string) => `- ${h}`),

      (ctx.existingTasks?.length > 0) ? `\nEXISTING TASKS/EVENTS FOR TARGET DATES (these are ALREADY scheduled — work around them):` : null,
      ...(ctx.existingTasks || []).map((t: any) => {
        const timeRange = t.time ? (t.endTime ? `${t.time}-${t.endTime}` : t.time) : ''
        return `- [${t.date}]${timeRange ? ` ${timeRange}` : ''} ${t.isCalendarEvent ? '📅 CALENDAR (FIXED — do NOT overlap): ' : ''}${t.label}`
      }),

      `\nPIPELINE THIS MONTH: ${ctx.pipeline?.offers_made || 0} offers made, ${ctx.pipeline?.offers_received || 0} received, ${ctx.pipeline?.pending || 0} pending, ${ctx.pipeline?.closed || 0} closed`,
      ctx.pipeline?.closed_volume ? `Closed volume: $${Number(ctx.pipeline.closed_volume).toLocaleString()}` : null,

      (ctx.pendingDeals?.length > 0) ? `\nPENDING DEALS:` : null,
      ...(ctx.pendingDeals || []).slice(0, 10).map((d: any) => {
        let line = `- ${d.address} | $${d.price}`
        if (d.checklist_overdue?.length) line += ` | ⚠ OVERDUE: ${d.checklist_overdue.join(', ')}`
        return line
      }),

      (ctx.listings?.length > 0) ? `\nACTIVE LISTINGS:` : null,
      ...(ctx.listings || []).slice(0, 20).map((l: any) => {
        const parts = [`- ${l.address}`, `$${l.price}`, `${l.status}`]
        if (l.dom != null) parts.push(`${l.dom}d DOM`)
        if (l.expires_date) parts.push(`Expires: ${l.expires_date}`)
        return parts.join(' | ')
      }),

      (ctx.buyerReps?.length > 0) ? `\nBUYER REP AGREEMENTS:` : null,
      ...(ctx.buyerReps || []).slice(0, 15).map((b: any) => {
        const parts = [`- ${b.clientName}`]
        if (b.dateExpires) parts.push(`Expires: ${b.dateExpires}`)
        if (b.lastCallDate) parts.push(`Last Call: ${b.lastCallDate}`)
        if (b.locationPrefs) parts.push(`Location: ${b.locationPrefs}`)
        if (b.timeline) parts.push(`Timeline: ${b.timeline}`)
        return parts.join(' | ')
      }),

      ctx.activityThisMonth ? `\nACTIVITY THIS MONTH:` : null,
      ...(ctx.activityThisMonth ? Object.entries(ctx.activityThisMonth).map(([k, v]) => `- ${k}: ${v} completions`) : []),

      ctx.standup ? `\nTODAY'S STANDUP:\n- Yesterday: ${ctx.standup.q1 || 'N/A'}\n- Today's priority: ${ctx.standup.q2 || 'N/A'}${ctx.standup.q3 ? `\n- Blockers: ${ctx.standup.q3}` : ''}` : null,

      ctx.teamGuidance ? `\nTEAM LEADER INSTRUCTIONS (from your team owner — follow these directives):\n${ctx.teamGuidance}` : null,
    ].filter(Boolean).join('\n')

    const scopeLabel = scope === 'week' ? 'the week' : 'today'
    const dateList = dates.join(', ')

    const currentTime = ctx.currentTime || null // "HH:MM" 24h
    const todayDate = ctx.today || dates[0]
    const workdayStart = ctx.workdayStart || '08:00'
    const workdayEnd = ctx.workdayEnd || '18:00'
    const includeWeekends = ctx.includeWeekends !== false

    const systemPrompt = `You are the RealtyGrind AI Task Planner. Generate a personalized, actionable task list for a real estate agent based on their current data.

${contextLines}

CURRENT TIME: ${todayDate} ${currentTime || 'unknown'}
WORK HOURS: ${workdayStart} to ${workdayEnd} — ALL tasks must be scheduled within this window.
${!includeWeekends ? 'WEEKDAYS ONLY: Do NOT generate tasks for Saturday or Sunday.' : 'Include weekends if dates fall on Sat/Sun.'}
TARGET: Generate tasks for ${scopeLabel} (dates: ${dateList}).
${guidance ? `\nAGENT'S FOCUS REQUEST: "${guidance}"` : ''}

RULES:
1. Output ONLY valid JSON. No markdown, no code fences, no explanation outside the JSON.
2. Format: { "tasks": [...], "summary": "1-2 sentence overview" }
3. Each task: { "label": string, "icon": string (single emoji), "time": "HH:MM" (24h) or null, "xp": number (10-30), "date": "YYYY-MM-DD", "rationale": string (1 sentence why) }
4. Generate 3-8 tasks per day depending on available time.
5. CRITICAL: Calendar events (marked 📅 CALENDAR) are FIXED commitments. NEVER replace, move, or duplicate them. Schedule new tasks AROUND calendar events, leaving 15-30 min buffers before and after.
6. CRITICAL: ALL task times MUST be between ${workdayStart} and ${workdayEnd}. Never schedule outside these hours.
6b. CRITICAL: For today (${todayDate}), ONLY schedule tasks AFTER ${currentTime || 'now'}. Never generate tasks in the past.
7. DO NOT duplicate existing habits or calendar events. Only generate NEW supplementary tasks that fill gaps in the agent's day.
8. Make tasks SPECIFIC: use actual listing addresses, buyer names, and deal details from the context.
   GOOD: "Call Sarah Chen about 123 Oak St showing feedback"
   BAD: "Make follow-up calls"
9. Priority logic:
   - Behind on prospecting/appointment goals → add targeted outreach tasks
   - Buyer agreements expiring within 14 days → add renewal follow-up tasks
   - Listings with 60+ DOM → add price adjustment or fresh marketing tasks
   - Pending deals with overdue checklist items → add checklist follow-up tasks
   - Standup blockers → add tasks that address them
   - Stale last-call dates on buyers → add check-in tasks
10. For weekly scope: heavier prospecting Mon/Tue, admin mid-week, showings/follow-up Thu/Fri.
11. XP: admin tasks = 10, outreach/follow-up = 15, high-impact (listings, closings, showings) = 20-30.
12. Use relevant emojis: 📞 calls, ✉️ emails, 🏠 listings, 🔑 showings, 📊 analysis, 📱 social, etc.

RESPOND WITH ONLY THE JSON OBJECT. No other text.`

    // ── 9. Call Claude API (non-streaming) ───────────────────────────────────
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicKey) {
      if (creditReserved) { try { await admin.rpc('decrement_ai_credit', { user_id_param: user.id }) } catch { /* best-effort */ } }
      return json({ error: 'ANTHROPIC_API_KEY not configured' }, 500)
    }

    const fetchController = new AbortController()
    const fetchTimeout = setTimeout(() => fetchController.abort(), 55000)

    let claudeResponse: Response
    try {
      claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'web-search-2025-03-05',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 4096,
          system: systemPrompt,
          messages: [{ role: 'user', content: `Generate my task list for ${scopeLabel}. Dates: ${dateList}.${guidance ? ` Focus: ${guidance}` : ''}` }],
          tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }],
        }),
        signal: fetchController.signal,
      })
    } catch (fetchErr) {
      clearTimeout(fetchTimeout)
      if (creditReserved) { try { await admin.rpc('decrement_ai_credit', { user_id_param: user.id }) } catch {} }
      console.error('Claude API fetch error:', fetchErr)
      return json({ error: 'AI service is temporarily unavailable. Please try again.' }, 502)
    }
    clearTimeout(fetchTimeout)

    if (!claudeResponse.ok) {
      const errBody = await claudeResponse.text()
      console.error('Claude API error:', claudeResponse.status, errBody)
      if (creditReserved) { try { await admin.rpc('decrement_ai_credit', { user_id_param: user.id }) } catch {} }
      return json({ error: 'AI service is temporarily unavailable. Please try again.' }, 502)
    }

    // ── 10. Parse Claude response ────────────────────────────────────────────
    const claudeData = await claudeResponse.json()

    // Extract text from Claude's response (may have tool_use blocks from web search)
    let responseText = ''
    for (const block of (claudeData.content || [])) {
      if (block.type === 'text') responseText += block.text
    }

    // Parse JSON from response (strip markdown fences if present)
    let parsed: { tasks: any[], summary?: string }
    try {
      const cleaned = responseText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
      parsed = JSON.parse(cleaned)
    } catch (parseErr) {
      console.error('Failed to parse Claude JSON:', responseText.slice(0, 500))
      // Don't roll back credit — Claude responded, just bad format
      return json({ error: 'AI returned an unexpected format. Please try again.', raw: responseText.slice(0, 200) }, 500)
    }

    // Validate and sanitize tasks
    const tasks = (parsed.tasks || []).filter((t: any) =>
      t.label && typeof t.label === 'string' && t.date
    ).map((t: any) => ({
      label: String(t.label).slice(0, 200),
      icon: String(t.icon || '✅').slice(0, 2),
      time: t.time && /^\d{2}:\d{2}$/.test(t.time) ? t.time : null,
      xp: Math.min(50, Math.max(5, Number(t.xp) || 15)),
      date: String(t.date),
      rationale: String(t.rationale || '').slice(0, 300),
    }))

    return json({
      tasks,
      summary: String(parsed.summary || '').slice(0, 500),
      credits_used: creditsUsed + 1,
      credits_limit: limit,
    })

  } catch (err) {
    console.error('ai-generate-tasks error:', err)
    return json({ error: 'Internal server error' }, 500)
  }
})
