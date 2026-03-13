// supabase/functions/morning-briefing/index.ts
// AI-powered Morning Briefing Agent for RealtyGrind.
// Non-streaming: returns structured JSON briefing.
// Costs 1 AI credit per generation; cached re-views within the same day are free.
//
// Required Supabase secrets:
//   ANTHROPIC_API_KEY
//   SUPABASE_SERVICE_ROLE_KEY (auto)
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET (for calendar fetch)

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

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GCAL_BASE = 'https://www.googleapis.com/calendar/v3'

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
      return json({ error: 'subscription_required', message: 'Subscribe to a plan to use Morning Briefing.' }, 403)
    }

    // ── 4. Team gate ─────────────────────────────────────────────────────────
    if (profile.team_id && profile.teams?.team_prefs?.ai_tools?.assistant_enabled === false) {
      return json({ error: 'disabled_by_team', message: 'AI tools have been disabled by your team owner.' }, 403)
    }
    // Check if team owner disabled morning briefing specifically
    if (profile.team_id && profile.teams?.team_prefs?.ai_tools?.briefing_enabled === false) {
      return json({ error: 'disabled_by_team', message: 'Morning briefing has been disabled by your team owner.' }, 403)
    }

    // ── 5. Parse request body ────────────────────────────────────────────────
    const ct = req.headers.get('content-type') || ''
    if (!ct.includes('application/json')) {
      return json({ error: 'Content-Type must be application/json' }, 400)
    }

    let reqBody: Record<string, unknown>
    try { reqBody = await req.json() } catch { return json({ error: 'Invalid JSON body' }, 400) }

    const force = reqBody.force === true
    const timezone = String(reqBody.timezone || 'America/Los_Angeles')

    // ── 6. Cache check — return cached briefing if already generated today ──
    const todayStr = new Date().toISOString().slice(0, 10)
    const habitPrefs = profile.habit_prefs || {}
    const briefingCache = habitPrefs.morning_briefing || {}

    if (!force && briefingCache.last_date === todayStr && briefingCache.last_data) {
      return json({
        briefing: briefingCache.last_data,
        cached: true,
        credits_used: profile.ai_credits_used || 0,
        credits_limit: isAdmin ? -1 : (CREDIT_LIMITS[effectivePlan] ?? 0),
      })
    }

    // ── 7. Credit gate ───────────────────────────────────────────────────────
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
      // Return cached briefing as fallback even if stale
      if (briefingCache.last_data) {
        return json({ briefing: briefingCache.last_data, cached: true, credits_used: creditsUsed, credits_limit: limit })
      }
      return json({ error: 'credits_exhausted', plan: effectivePlan, limit, used: creditsUsed }, 429)
    }

    // ── 8. Reserve credit ────────────────────────────────────────────────────
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

    // ── 9. Gather RealtyGrind context ────────────────────────────────────────
    const MONTH_YEAR = currentMonth()

    function parsePrice(val: unknown): number {
      if (!val) return 0
      return parseFloat(String(val).replace(/[^0-9.]/g, '')) || 0
    }
    function fmtPrice(val: unknown): string {
      const n = parsePrice(val)
      return n > 0 ? `$${n.toLocaleString()}` : 'Not listed'
    }
    function fmtComm(val: unknown): string {
      if (!val || String(val).trim() === '') return 'Not listed'
      return String(val).includes('%') ? String(val) : `${val}%`
    }
    function fmtDate(val: unknown): string {
      if (!val) return ''
      try {
        const d = new Date(String(val))
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      } catch { return String(val) }
    }
    function daysOnMarket(listDate: unknown, createdAt: unknown): number | null {
      const ref = listDate || createdAt
      if (!ref) return null
      const d = Math.floor((Date.now() - new Date(String(ref)).getTime()) / 86400000)
      return d >= 0 ? d : null
    }

    const [listingsRes, transactionsRes, allTransactionsRes, habitsRes] = await Promise.all([
      admin.from('listings').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(50),
      admin.from('transactions').select('*').eq('user_id', user.id).eq('month_year', MONTH_YEAR).limit(100),
      admin.from('transactions').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(200),
      admin.from('habit_completions').select('*').eq('user_id', user.id).eq('month_year', MONTH_YEAR).limit(500),
    ])

    const listings        = listingsRes.data || []
    const transactions    = transactionsRes.data || []
    const allTransactions = allTransactionsRes.data || []
    const habits          = habitsRes.data || []

    const activeListings = listings.filter((l: any) => (l.unit_count || 0) >= 1 && l.status !== 'closed')
    const closedListings = listings.filter((l: any) => (l.unit_count || 0) >= 1 && l.status === 'closed')
    const buyerReps      = listings.filter((l: any) => (l.unit_count || 0) === 0)

    // Build address → pipeline activity map
    const activityByAddress: Record<string, string[]> = {}
    for (const t of allTransactions) {
      const addr = (t.address || '').trim().toLowerCase()
      if (!addr) continue
      if (!activityByAddress[addr]) activityByAddress[addr] = []
      const label = t.type === 'offer_made' ? 'Offer Made' :
                    t.type === 'offer_received' ? 'Offer Received' :
                    t.type === 'went_pending' ? 'Went Pending' :
                    t.type === 'closed' ? 'Closed' : t.type
      const priceStr = parsePrice(t.price) > 0 ? ` at ${fmtPrice(t.price)}` : ''
      const sideStr = t.deal_side ? ` [${t.deal_side} side]` : ''
      activityByAddress[addr].push(`${label}${priceStr}${sideStr} [${t.month_year || ''}]`)
    }

    function getActivity(address: string): string {
      const key = (address || '').trim().toLowerCase()
      const items = activityByAddress[key]
      if (!items || items.length === 0) return ''
      return ` | Pipeline: ${items.join(', ')}`
    }

    const pipeline = {
      offers_made:     transactions.filter((t: any) => t.type === 'offer_made').length,
      offers_received: transactions.filter((t: any) => t.type === 'offer_received').length,
      pending:         transactions.filter((t: any) => t.type === 'went_pending').length,
      closed:          transactions.filter((t: any) => t.type === 'closed').length,
      closed_volume:   transactions.filter((t: any) => t.type === 'closed').reduce((s: number, t: any) => s + parsePrice(t.price), 0),
    }

    const habitCounts: Record<string, number> = {}
    for (const h of habits) {
      habitCounts[h.habit_id] = (habitCounts[h.habit_id] || 0) + (h.counter_value || 1)
    }

    // ── 9b. Team data ────────────────────────────────────────────────────────
    const teamPrefs = profile.teams?.team_prefs || {}
    const myStandup = habitPrefs.standup_today
    const standupToday = myStandup?.date === todayStr ? myStandup : null

    const allCoachingNotes = teamPrefs.coaching_notes || []
    const myCoachingNotes = allCoachingNotes.filter((n: any) => n.agentId === user.id)
    const recentNotes = myCoachingNotes.slice(-5)

    let teamMemberContext = ''
    const isTeamOwner = profile.team_id && profile.teams?.created_by === user.id
    const isTeamAdmin = isTeamOwner || (teamPrefs.admins || []).includes(user.id)

    if (isTeamAdmin && profile.team_id) {
      const { data: teamMembers } = await admin
        .from('profiles')
        .select('id, full_name, xp, streak, goals, habit_prefs')
        .eq('team_id', profile.team_id)
        .neq('id', user.id)
        .order('xp', { ascending: false })
        .limit(50)

      const memberIds = (teamMembers || []).map((m: any) => m.id)
      const [memberHabitsRes, memberTxRes] = await Promise.all([
        memberIds.length > 0
          ? admin.from('habit_completions').select('user_id, habit_id, counter_value').eq('month_year', MONTH_YEAR).in('user_id', memberIds).limit(2000)
          : { data: [] },
        memberIds.length > 0
          ? admin.from('transactions').select('user_id, type, price').eq('month_year', MONTH_YEAR).in('user_id', memberIds).limit(500)
          : { data: [] },
      ])

      const memberHabits: Record<string, number> = {}
      for (const h of (memberHabitsRes.data || [])) {
        memberHabits[h.user_id] = (memberHabits[h.user_id] || 0) + 1
      }
      const memberDeals: Record<string, { closed: number, volume: number, pending: number, offers: number }> = {}
      for (const t of (memberTxRes.data || [])) {
        if (!memberDeals[t.user_id]) memberDeals[t.user_id] = { closed: 0, volume: 0, pending: 0, offers: 0 }
        if (t.type === 'closed') {
          memberDeals[t.user_id].closed++
          memberDeals[t.user_id].volume += parsePrice(t.price)
        } else if (t.type === 'went_pending') {
          memberDeals[t.user_id].pending++
        } else if (t.type === 'offer_made' || t.type === 'offer_received') {
          memberDeals[t.user_id].offers++
        }
      }

      const standupLines: string[] = []
      const memberLines: string[] = []

      for (const m of (teamMembers || [])) {
        const mStandup = m.habit_prefs?.standup_today
        const mGoals = m.goals || {}
        const deals = memberDeals[m.id] || { closed: 0, volume: 0, pending: 0, offers: 0 }
        const habitCount = memberHabits[m.id] || 0

        memberLines.push(`- ${m.full_name || 'Agent'} | XP: ${m.xp || 0} | Streak: ${m.streak || 0}d | Habits: ${habitCount} this month | Closed: ${deals.closed}${deals.volume > 0 ? ` ($${deals.volume.toLocaleString()})` : ''} | Pending: ${deals.pending} | Offers: ${deals.offers}${mGoals.monthly_closings ? ` | Goal: ${mGoals.monthly_closings} closings` : ''}`)

        if (mStandup?.date === todayStr) {
          standupLines.push(`- ${m.full_name || 'Agent'}: Yesterday: ${mStandup.q1 || 'N/A'} | Today: ${mStandup.q2 || 'N/A'}${mStandup.q3 ? ` | Blockers: ${mStandup.q3}` : ''}`)
        }
      }

      const coachingNoteLines: string[] = []
      for (const m of (teamMembers || [])) {
        const agentNotes = allCoachingNotes.filter((n: any) => n.agentId === m.id).slice(-3)
        if (agentNotes.length > 0) {
          coachingNoteLines.push(`  ${m.full_name || 'Agent'}:`)
          for (const n of agentNotes) {
            coachingNoteLines.push(`    - [${n.type || 'general'}${n.pinned ? ', PINNED' : ''}] ${n.text}`)
          }
        }
      }

      teamMemberContext = [
        `\nTEAM ROSTER (${(teamMembers || []).length} agents):`,
        ...memberLines,
        memberLines.length === 0 ? '- No team members yet' : null,
        standupLines.length > 0 ? `\nTODAY'S STANDUPS:` : null,
        ...standupLines,
        coachingNoteLines.length > 0 ? `\nCOACHING NOTES FOR AGENTS:` : null,
        ...coachingNoteLines,
      ].filter(Boolean).join('\n')
    }

    // ── 9c. Google Calendar — fetch today's events server-side ───────────────
    let calendarEvents: { time: string; end_time: string | null; summary: string }[] = []
    const googleClientId     = Deno.env.get('GOOGLE_CLIENT_ID')
    const googleClientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')

    if (profile.google_refresh_token && googleClientId && googleClientSecret) {
      try {
        const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            refresh_token: profile.google_refresh_token,
            client_id: googleClientId,
            client_secret: googleClientSecret,
            grant_type: 'refresh_token',
          }),
        })
        const tokenData = await tokenRes.json()

        if (tokenRes.ok && tokenData.access_token) {
          const dayStart = `${todayStr}T00:00:00Z`
          const dayEnd   = `${todayStr}T23:59:59Z`
          const calRes = await fetch(
            `${GCAL_BASE}/calendars/primary/events?timeMin=${encodeURIComponent(dayStart)}&timeMax=${encodeURIComponent(dayEnd)}&singleEvents=true&orderBy=startTime&maxResults=50&timeZone=${encodeURIComponent(timezone)}`,
            { headers: { Authorization: `Bearer ${tokenData.access_token}` } }
          )
          if (calRes.ok) {
            const calData = await calRes.json()
            calendarEvents = (calData.items || [])
              .filter((e: any) => !!e.start?.dateTime)
              .map((e: any) => {
                const startMatch = e.start.dateTime.match(/T(\d{2}:\d{2})/)
                const endMatch = e.end?.dateTime?.match(/T(\d{2}:\d{2})/)
                return {
                  time: startMatch ? startMatch[1] : '00:00',
                  end_time: endMatch ? endMatch[1] : null,
                  summary: e.summary || 'Event',
                }
              })
          }
        }
      } catch (calErr) {
        console.error('Calendar fetch failed (non-fatal):', calErr)
      }
    }

    // ── 10. Build context block ──────────────────────────────────────────────
    const goals = profile.goals || {}
    const bio = habitPrefs.bio || {}
    const dayOfWeek = new Date().toLocaleDateString('en-US', { weekday: 'long' })

    const contextBlock = [
      `AGENT PROFILE: ${profile.full_name || 'Agent'}, XP: ${profile.xp || 0}, Streak: ${profile.streak || 0} days`,
      bio.specialty ? `SPECIALTY: ${bio.specialty}` : null,
      goals.monthly_closings ? `MONTHLY CLOSING GOAL: ${goals.monthly_closings}` : null,
      goals.annual_volume ? `ANNUAL VOLUME GOAL: $${parsePrice(goals.annual_volume).toLocaleString()}` : null,
      goals.gci_target ? `GCI TARGET: $${parsePrice(goals.gci_target).toLocaleString()}` : null,
      goals.prospecting ? `PROSPECTING GOAL: ${goals.prospecting} calls/month` : null,
      goals.appointments ? `APPOINTMENT GOAL: ${goals.appointments}/month` : null,
      profile.team_id ? `\nTEAM: ${profile.teams?.name || 'Team'} (${isTeamOwner ? 'Owner' : isTeamAdmin ? 'Admin' : 'Member'})` : null,
      standupToday ? `\nTODAY'S STANDUP:\n- Yesterday: ${standupToday.q1 || 'N/A'}\n- Today: ${standupToday.q2 || 'N/A'}${standupToday.q3 ? `\n- Blockers: ${standupToday.q3}` : ''}` : null,
      recentNotes.length > 0 ? `\nCOACHING NOTES (from team leader):` : null,
      ...recentNotes.map((n: any) => `- [${n.type || 'general'}${n.pinned ? ', PINNED' : ''}] ${n.text}`),
      teamMemberContext || null,
      `\nACTIVE LISTINGS (${activeListings.length}):`,
      ...activeListings.slice(0, 20).map((l: any) => {
        const dom = daysOnMarket(l.list_date, l.created_at)
        const parts = [`- ${l.address || 'Unknown'}`, `Price: ${fmtPrice(l.price)}`, `Status: ${l.status || 'active'}`]
        if (l.expires_date) parts.push(`Expires: ${fmtDate(l.expires_date)}`)
        if (dom !== null) parts.push(`${dom}d DOM`)
        if (l.lead_source) parts.push(`Source: ${l.lead_source}`)
        parts.push(getActivity(l.address))
        return parts.filter(Boolean).join(' | ')
      }),
      activeListings.length === 0 ? '- None' : null,
      `\nCLOSED THIS MONTH: ${closedListings.filter((l: any) => l.month_year === MONTH_YEAR).length}`,
      `\nBUYER REP AGREEMENTS (${buyerReps.length}):`,
      ...buyerReps.slice(0, 15).map((b: any) => {
        const d = b.buyer_details || {}
        const parts = [`- ${b.address || 'Buyer'}`]
        if (d.preApproval) parts.push(`Pre-approval: ${d.preApproval}`)
        if (d.paymentRange) parts.push(`Payment: ${d.paymentRange}`)
        if (d.timeline) parts.push(`Timeline: ${d.timeline}`)
        if (d.dateExpires) parts.push(`Expires: ${fmtDate(d.dateExpires)}`)
        if (d.lastCallDate) parts.push(`Last Call: ${fmtDate(d.lastCallDate)}`)
        if (d.locationPrefs) parts.push(`Location: ${d.locationPrefs}`)
        return parts.join(' | ')
      }),
      buyerReps.length === 0 ? '- None' : null,
      `\nPIPELINE THIS MONTH: ${pipeline.offers_made} offers made, ${pipeline.offers_received} received, ${pipeline.pending} pending, ${pipeline.closed} closed (${pipeline.closed_volume > 0 ? `$${pipeline.closed_volume.toLocaleString()}` : '$0'} volume)`,
      // Pending deals with checklists
      (() => {
        const pending = transactions.filter((t: any) => t.type === 'pending' || t.type === 'went_pending')
        if (pending.length === 0) return null
        const lines = pending.map((t: any) => {
          const cl = Array.isArray(t.checklist) ? t.checklist : []
          const done = cl.filter((i: any) => i.done).length
          const total = cl.length
          const overdue = cl.filter((i: any) => !i.done && i.dueDate && new Date(i.dueDate) < new Date()).map((i: any) => i.label)
          let line = `- ${t.address || 'Unknown'} | ${fmtPrice(t.price)} | Checklist: ${done}/${total}`
          if (overdue.length > 0) line += ` | OVERDUE: ${overdue.join(', ')}`
          return line
        })
        return `\nPENDING DEALS:\n${lines.join('\n')}`
      })(),
      `\nACTIVITY THIS MONTH:`,
      ...Object.entries(habitCounts).map(([id, count]) => `- ${id}: ${count} completions`),
      Object.keys(habitCounts).length === 0 ? '- No tracked activity yet' : null,
      // Key date alerts
      (() => {
        const alerts: string[] = []
        const now = Date.now()
        for (const l of activeListings) {
          const dom = daysOnMarket(l.list_date, l.created_at)
          if (l.expires_date) {
            const daysUntilExpiry = Math.floor((new Date(l.expires_date).getTime() - now) / 86400000)
            if (daysUntilExpiry <= 14 && daysUntilExpiry >= 0) alerts.push(`"${l.address}" listing expires in ${daysUntilExpiry} days`)
            if (daysUntilExpiry < 0) alerts.push(`"${l.address}" listing EXPIRED ${Math.abs(daysUntilExpiry)} days ago`)
          }
          if (dom !== null && dom > 60) alerts.push(`"${l.address}" has been on market ${dom} days`)
        }
        for (const b of buyerReps) {
          const d = b.buyer_details || {}
          if (d.dateExpires) {
            const daysUntilExpiry = Math.floor((new Date(d.dateExpires).getTime() - now) / 86400000)
            if (daysUntilExpiry <= 14 && daysUntilExpiry >= 0) alerts.push(`Buyer rep "${b.address}" expires in ${daysUntilExpiry} days`)
            if (daysUntilExpiry < 0) alerts.push(`Buyer rep "${b.address}" EXPIRED ${Math.abs(daysUntilExpiry)} days ago`)
          }
          if (d.lastCallDate) {
            const daysSinceCall = Math.floor((now - new Date(d.lastCallDate).getTime()) / 86400000)
            if (daysSinceCall > 10) alerts.push(`Buyer "${b.address}" hasn't been contacted in ${daysSinceCall} days`)
          }
        }
        return alerts.length > 0 ? `\nKEY DATE ALERTS:\n${alerts.join('\n')}` : null
      })(),
      // Calendar events for today
      calendarEvents.length > 0 ? `\nTODAY'S CALENDAR:` : null,
      ...calendarEvents.map(e => {
        const h = parseInt(e.time.slice(0, 2))
        const m = e.time.slice(3, 5)
        const ampm = h >= 12 ? 'PM' : 'AM'
        const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
        return `- ${h12}:${m} ${ampm}: ${e.summary}`
      }),
    ].filter(Boolean).join('\n')

    // ── 11. System prompt ────────────────────────────────────────────────────
    const systemPrompt = `You are the RealtyGrind Morning Briefing Agent — a virtual assistant that has analyzed an agent's entire real estate business overnight and is delivering a concise, actionable morning briefing.

Today's date: ${todayStr} (${dayOfWeek})

${contextBlock}

Generate a personalized morning briefing as a JSON object. The briefing should feel like having a knowledgeable assistant who already knows everything about the agent's business.

RULES:
1. Output ONLY valid JSON. No markdown, no code fences, no explanation outside the JSON.
2. Format:
{
  "greeting": "Good morning, [first name]! Here's your game plan for ${dayOfWeek}.",
  "priority_actions": [
    { "icon": "emoji", "text": "specific actionable text referencing real data", "urgency": "high|medium|low" }
  ],
  "pipeline_snapshot": {
    "summary": "1-sentence summary comparing progress to goals",
    "details": [
      { "label": "Offers Made", "value": number },
      { "label": "Pending", "value": number },
      { "label": "Closed", "value": number, "goal": number_or_null }
    ]
  },
  "streak_status": {
    "current": number,
    "message": "1-sentence about streak and what to do today to maintain it"
  },
  "calendar_preview": [
    { "time": "10:00 AM", "event": "event summary" }
  ],
  "team_health": null,
  "motivation": "1-2 sentences of encouragement tied to actual progress data"
}
3. Priority actions — generate 3-6 items, ordered by urgency:
   - HIGH: Expiring listings/buyer reps within 7 days, overdue checklist items, expired agreements, offers expiring soon
   - MEDIUM: Stale buyer reps (no contact in 10+ days), listings with 60+ DOM, pending deal next steps, behind on monthly goals
   - LOW: Follow-ups, prospecting suggestions, marketing ideas
   - Be SPECIFIC: use actual addresses, names, prices, dates from the context. Never generic.
4. Pipeline snapshot: Include goal comparison if monthly_closings goal exists. Always include Offers Made, Pending, and Closed.
5. Calendar preview: Only include if calendar events are available. Format times in 12-hour format. If no events, set to empty array [].
6. Team health: Only populate for team owners/admins. Set to null for regular agents. When populated:
   {
     "summary": "1-sentence team overview",
     "alerts": [{ "agent": "name", "issue": "description", "suggestion": "what to do" }]
   }
   Highlight agents with broken streaks, missed standups, low activity, or significantly behind on goals.
7. Streak status: Reference actual streak count. If streak is 0, encourage starting one. If active, celebrate and suggest habits.
8. Motivation: Tie to real data — percentage toward goals, recent wins, momentum. NEVER generic motivational quotes.

RESPOND WITH ONLY THE JSON OBJECT.`

    // ── 12. Call Claude API (non-streaming) ──────────────────────────────────
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicKey) {
      if (creditReserved) { try { await admin.rpc('decrement_ai_credit', { user_id_param: user.id }) } catch {} }
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
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 2048,
          system: systemPrompt,
          messages: [{ role: 'user', content: `Generate my morning briefing for today, ${dayOfWeek} ${todayStr}.` }],
        }),
        signal: fetchController.signal,
      })
    } catch (fetchErr) {
      clearTimeout(fetchTimeout)
      if (creditReserved) { try { await admin.rpc('decrement_ai_credit', { user_id_param: user.id }) } catch {} }
      console.error('Claude API fetch error:', fetchErr)
      // Return cached briefing as fallback
      if (briefingCache.last_data) {
        return json({ briefing: briefingCache.last_data, cached: true, credits_used: creditsUsed, credits_limit: limit, fallback: true })
      }
      return json({ error: 'AI service is temporarily unavailable. Please try again.' }, 502)
    }
    clearTimeout(fetchTimeout)

    if (!claudeResponse.ok) {
      const errBody = await claudeResponse.text()
      console.error('Claude API error:', claudeResponse.status, errBody)
      if (creditReserved) { try { await admin.rpc('decrement_ai_credit', { user_id_param: user.id }) } catch {} }
      if (briefingCache.last_data) {
        return json({ briefing: briefingCache.last_data, cached: true, credits_used: creditsUsed, credits_limit: limit, fallback: true })
      }
      return json({ error: 'AI service is temporarily unavailable. Please try again.' }, 502)
    }

    // ── 13. Parse Claude response ────────────────────────────────────────────
    const claudeData = await claudeResponse.json()

    let responseText = ''
    for (const block of (claudeData.content || [])) {
      if (block.type === 'text') responseText += block.text
    }

    let briefing: any
    try {
      const cleaned = responseText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
      briefing = JSON.parse(cleaned)
    } catch (parseErr) {
      console.error('Failed to parse briefing JSON:', responseText.slice(0, 500))
      if (briefingCache.last_data) {
        return json({ briefing: briefingCache.last_data, cached: true, credits_used: creditsUsed + 1, credits_limit: limit, fallback: true })
      }
      return json({ error: 'AI returned an unexpected format. Please try again.' }, 500)
    }

    // Validate and sanitize
    briefing = {
      greeting: String(briefing.greeting || `Good morning! Here's your briefing for ${dayOfWeek}.`).slice(0, 200),
      priority_actions: (briefing.priority_actions || []).slice(0, 8).map((a: any) => ({
        icon: String(a.icon || '📌').slice(0, 4),
        text: String(a.text || '').slice(0, 300),
        urgency: ['high', 'medium', 'low'].includes(a.urgency) ? a.urgency : 'medium',
      })),
      pipeline_snapshot: {
        summary: String(briefing.pipeline_snapshot?.summary || '').slice(0, 300),
        details: (briefing.pipeline_snapshot?.details || []).slice(0, 6).map((d: any) => ({
          label: String(d.label || '').slice(0, 50),
          value: Number(d.value) || 0,
          goal: d.goal != null ? Number(d.goal) : null,
        })),
      },
      streak_status: {
        current: Number(briefing.streak_status?.current) || profile.streak || 0,
        message: String(briefing.streak_status?.message || '').slice(0, 200),
      },
      calendar_preview: (briefing.calendar_preview || []).slice(0, 10).map((c: any) => ({
        time: String(c.time || '').slice(0, 20),
        event: String(c.event || '').slice(0, 200),
      })),
      team_health: briefing.team_health ? {
        summary: String(briefing.team_health.summary || '').slice(0, 300),
        alerts: (briefing.team_health.alerts || []).slice(0, 10).map((a: any) => ({
          agent: String(a.agent || '').slice(0, 50),
          issue: String(a.issue || '').slice(0, 200),
          suggestion: String(a.suggestion || '').slice(0, 200),
        })),
      } : null,
      motivation: String(briefing.motivation || '').slice(0, 300),
    }

    // ── 14. Persist briefing to profile ──────────────────────────────────────
    const updatedHabitPrefs = {
      ...habitPrefs,
      morning_briefing: {
        ...(habitPrefs.morning_briefing || {}),
        enabled: habitPrefs.morning_briefing?.enabled !== false,
        last_date: todayStr,
        last_data: briefing,
      },
    }

    await admin.from('profiles').update({ habit_prefs: updatedHabitPrefs }).eq('id', user.id)

    return json({
      briefing,
      cached: false,
      credits_used: creditsUsed + 1,
      credits_limit: limit,
    })

  } catch (err) {
    console.error('morning-briefing error:', err)
    return json({ error: 'Internal server error' }, 500)
  }
})
