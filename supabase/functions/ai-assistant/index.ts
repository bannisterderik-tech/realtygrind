// supabase/functions/ai-assistant/index.ts
// AI-powered real estate coaching assistant using Claude Sonnet.
// Streams responses directly to the client. Tracks per-user credit usage.
//
// Required Supabase secrets:
//   ANTHROPIC_API_KEY           — sk-ant-...
//   SUPABASE_SERVICE_ROLE_KEY   — already set automatically

import { createClient } from 'npm:@supabase/supabase-js@2'

const PROD_ORIGINS = [
  'https://realtygrind.vercel.app',
  'https://realtygrind.com',
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
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  }
}

// Credit limits per plan tier (1 credit = 1 message sent)
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
      .select('*, teams(name, invite_code, created_by, team_prefs, max_members)')
      .eq('id', user.id)
      .single()

    if (!profile) return json({ error: 'Profile not found' }, 404)

    // Platform admins bypass all plan/billing/credit gates
    const isAdmin = profile.app_role === 'admin'

    // Determine effective plan tier
    const isTeamMember = !!(profile.team_id && profile.teams?.created_by !== user.id)
    let effectivePlan: string
    if (isAdmin) {
      effectivePlan = 'brokerage' // admins get top-tier access
    } else if (isTeamMember) {
      // Look up the team owner's actual plan instead of inferring from max_members
      const { data: ownerProfile } = await admin
        .from('profiles')
        .select('plan')
        .eq('id', profile.teams?.created_by)
        .single()
      effectivePlan = ownerProfile?.plan || 'team'
    } else {
      effectivePlan = profile.plan || 'free'
    }

    // ── 3. Plan gate ────────────────────────────────────────────────────────
    const billing = profile.billing_status
    const hasBilling = billing === 'active' || billing === 'trialing'
    if (!isAdmin && !hasBilling && !isTeamMember) {
      return json({ error: 'subscription_required', message: 'Subscribe to a plan to use AI Assistant.' }, 403)
    }

    // ── 4. Team gate ────────────────────────────────────────────────────────
    if (profile.team_id && profile.teams?.team_prefs?.ai_tools?.assistant_enabled === false) {
      return json({ error: 'disabled_by_team', message: 'AI Assistant has been disabled by your team owner.' }, 403)
    }

    // ── 5. Credit gate ──────────────────────────────────────────────────────
    const limit = isAdmin ? -1 : (CREDIT_LIMITS[effectivePlan] ?? 0)
    const month = currentMonth()

    // Reset credits if month rolled over
    if (profile.ai_credits_reset !== month) {
      await admin.from('profiles').update({ ai_credits_used: 0, ai_credits_reset: month }).eq('id', user.id)
      profile.ai_credits_used = 0
      profile.ai_credits_reset = month
    }

    let creditsUsed = profile.ai_credits_used || 0

    // For team & brokerage plans, sum credits across all team members (pooled)
    if ((effectivePlan === 'team' || effectivePlan === 'brokerage') && profile.team_id) {
      const { data: teamMembers } = await admin
        .from('profiles')
        .select('ai_credits_used, ai_credits_reset')
        .eq('team_id', profile.team_id)

      creditsUsed = (teamMembers || []).reduce((sum, m) => {
        return sum + (m.ai_credits_reset === month ? (m.ai_credits_used || 0) : 0)
      }, 0)
    }

    // GET requests return credit info only
    if (req.method === 'GET') {
      return json({ credits_used: creditsUsed, credits_limit: limit, plan: effectivePlan })
    }

    // Check credit limit (limit === -1 means unlimited for admins)
    if (limit !== -1 && creditsUsed >= limit) {
      return json({
        error: 'credits_exhausted',
        plan: effectivePlan,
        limit,
        used: creditsUsed,
      }, 429)
    }

    // Only POST proceeds past credit check
    if (req.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405)
    }

    // ── 6. Parse and validate request body ──────────────────────────────────
    const ct = req.headers.get('content-type') || ''
    if (!ct.includes('application/json')) {
      return json({ error: 'Content-Type must be application/json' }, 400)
    }

    let reqBody: Record<string, unknown>
    try { reqBody = await req.json() } catch { return json({ error: 'Invalid JSON body' }, 400) }
    const { messages } = reqBody as { messages: unknown }
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return json({ error: 'messages array is required' }, 400)
    }

    // Cap array size — only the last 20 are sent to Claude anyway (see slice below).
    // Without this, an attacker could send 10k messages × 10k chars = 100 MB payload,
    // exhausting the edge function's memory budget before validation even starts.
    if (messages.length > 40) {
      return json({ error: 'Too many messages. Please start a new conversation.' }, 400)
    }

    // Validate message roles — only allow user/assistant to prevent injection
    const validRoles = new Set(['user', 'assistant'])
    for (const m of messages) {
      if (typeof m.role !== 'string' || !validRoles.has(m.role)) {
        return json({ error: 'Invalid message role. Only user and assistant are allowed.' }, 400)
      }
      if (typeof m.content !== 'string' || m.content.length > 10000) {
        return json({ error: 'Each message content must be a string under 10000 chars.' }, 400)
      }
    }

    // ── 6b. Reserve credit optimistically (closes TOCTOU race window) ─────
    // Increment AFTER validation but BEFORE the Claude call so concurrent
    // requests can't both pass the credit check. If Claude fails, we roll
    // back via decrement_ai_credit. Malformed requests exit above without
    // consuming a credit.
    let creditReserved = false
    if (limit !== -1) {
      try {
        await admin.rpc('increment_ai_credits', { user_id_param: user.id, reset_month: month })
        creditReserved = true
      } catch {
        // Fallback to read-then-write if RPC doesn't exist yet
        await admin.from('profiles').update({
          ai_credits_used: (profile.ai_credits_used || 0) + 1,
          ai_credits_reset: month,
        }).eq('id', user.id)
        creditReserved = true
      }
    }

    // ── 7. Gather RealtyGrind context ───────────────────────────────────────
    const MONTH_YEAR = (() => {
      const d = new Date()
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    })()

    // Parse price text → number (handles "$500,000", "500000", "500,000", etc.)
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
      // All transactions (not just current month) — to link pipeline activity to listings
      admin.from('transactions').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(200),
      admin.from('habit_completions').select('*').eq('user_id', user.id).eq('month_year', MONTH_YEAR).limit(500),
    ])

    const listings        = listingsRes.data || []
    const transactions    = transactionsRes.data || []
    const allTransactions = allTransactionsRes.data || []
    const habits          = habitsRes.data || []

    // Split listings vs buyer rep agreements
    const activeListings = listings.filter(l => (l.unit_count || 0) >= 1 && l.status !== 'closed')
    const closedListings = listings.filter(l => (l.unit_count || 0) >= 1 && l.status === 'closed')
    const buyerReps      = listings.filter(l => (l.unit_count || 0) === 0)

    // Build a map of address → pipeline activity (links transactions to their source listing)
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
      const fromStr = t.closed_from ? ` (from ${t.closed_from})` : ''
      const sideStr = t.deal_side ? ` [${t.deal_side} side]` : ''
      const sourceStr = t.original_lead_source ? ` [source: ${t.original_lead_source}]` : ''
      activityByAddress[addr].push(`${label}${priceStr}${fromStr}${sideStr}${sourceStr} [${t.month_year || ''}]`)
    }

    // Helper to get pipeline activity for a listing
    function getActivity(address: string): string {
      const key = (address || '').trim().toLowerCase()
      const items = activityByAddress[key]
      if (!items || items.length === 0) return ''
      return ` | Pipeline: ${items.join(', ')}`
    }

    // Pipeline summary (current month)
    const pipeline = {
      offers_made:     transactions.filter(t => t.type === 'offer_made').length,
      offers_received: transactions.filter(t => t.type === 'offer_received').length,
      pending:         transactions.filter(t => t.type === 'went_pending').length,
      closed:          transactions.filter(t => t.type === 'closed').length,
      closed_volume:   transactions.filter(t => t.type === 'closed').reduce((s, t) => s + parsePrice(t.price), 0),
    }

    // Habit activity
    const habitCounts: Record<string, number> = {}
    for (const h of habits) {
      habitCounts[h.habit_id] = (habitCounts[h.habit_id] || 0) + (h.counter_value || 1)
    }

    // ── 7b. Fetch team data (standups, coaching notes, members) ──────────
    const teamPrefs = profile.teams?.team_prefs || {}
    const todayStr = new Date().toISOString().slice(0, 10) // YYYY-MM-DD

    // This user's standup
    const myStandup = profile.habit_prefs?.standup_today
    const standupToday = myStandup?.date === todayStr ? myStandup : null

    // Coaching notes about this user
    const allCoachingNotes = teamPrefs.coaching_notes || []
    const myCoachingNotes = allCoachingNotes.filter((n: any) => n.agentId === user.id)
    const recentNotes = myCoachingNotes.slice(-10) // last 10 notes

    // For team owners/admins: fetch team member summaries
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

      // Fetch this month's habit completions + transactions for each member
      const memberIds = (teamMembers || []).map((m: any) => m.id)
      const [memberHabitsRes, memberTxRes, memberListingsRes] = await Promise.all([
        memberIds.length > 0
          ? admin.from('habit_completions').select('user_id, habit_id, counter_value').eq('month_year', MONTH_YEAR).in('user_id', memberIds).limit(2000)
          : { data: [] },
        memberIds.length > 0
          ? admin.from('transactions').select('user_id, type, price').eq('month_year', MONTH_YEAR).in('user_id', memberIds).limit(500)
          : { data: [] },
        memberIds.length > 0
          ? admin.from('listings').select('user_id, address, price, status, commission, list_date, expires_date, lead_source, created_at').in('user_id', memberIds).neq('status', 'closed').limit(200)
          : { data: [] },
      ])

      // Aggregate per member
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
      const memberListings: Record<string, any[]> = {}
      for (const l of (memberListingsRes.data || [])) {
        if (!memberListings[l.user_id]) memberListings[l.user_id] = []
        memberListings[l.user_id].push(l)
      }

      // Collect today's standups
      const standupLines: string[] = []
      const memberLines: string[] = []

      for (const m of (teamMembers || [])) {
        const mStandup = m.habit_prefs?.standup_today
        const mGoals = m.goals || {}
        const mBio = m.habit_prefs?.bio || {}
        const deals = memberDeals[m.id] || { closed: 0, volume: 0, pending: 0, offers: 0 }
        const habitCount = memberHabits[m.id] || 0
        const mListings = memberListings[m.id] || []

        let memberLine = `- ${m.full_name || 'Agent'} | XP: ${m.xp || 0} | Streak: ${m.streak || 0}d | Habits: ${habitCount} this month | Closed: ${deals.closed}${deals.volume > 0 ? ` ($${deals.volume.toLocaleString()})` : ''} | Pending: ${deals.pending} | Offers: ${deals.offers}${mBio.specialty ? ` | Specialty: ${mBio.specialty}` : ''}${mGoals.monthly_closings ? ` | Goal: ${mGoals.monthly_closings} closings` : ''}`
        if (mListings.length > 0) {
          memberLine += ` | Active Listings: ${mListings.length} (${mListings.slice(0, 3).map(l => {
            const mDom = daysOnMarket(l.list_date, l.created_at)
            return `${l.address || 'Unknown'} @ ${fmtPrice(l.price)}${mDom !== null ? `, ${mDom}d DOM` : ''}${l.lead_source ? `, ${l.lead_source}` : ''}`
          }).join('; ')}${mListings.length > 3 ? ` +${mListings.length - 3} more` : ''})`
        }
        memberLines.push(memberLine)

        if (mStandup?.date === todayStr) {
          standupLines.push(`- ${m.full_name || 'Agent'}: Yesterday: ${mStandup.q1 || 'N/A'} | Today: ${mStandup.q2 || 'N/A'}${mStandup.q3 ? ` | Blockers: ${mStandup.q3}` : ''}`)
        }
      }

      // Active challenges
      const challenges = (teamPrefs.challenges || []).filter((c: any) => c.status === 'active')

      // Coaching notes about other agents (owners/admins only — privacy)
      const coachingNoteLines: string[] = []
      if (isTeamAdmin) {
        for (const m of (teamMembers || [])) {
          const agentNotes = allCoachingNotes.filter((n: any) => n.agentId === m.id).slice(-5)
          if (agentNotes.length > 0) {
            coachingNoteLines.push(`  ${m.full_name || 'Agent'}:`)
            for (const n of agentNotes) {
              coachingNoteLines.push(`    - [${n.type || 'general'}${n.pinned ? ', PINNED' : ''}] ${n.text}`)
            }
          }
        }
      }

      teamMemberContext = [
        `\nTEAM ROSTER (${(teamMembers || []).length} agents):`,
        ...memberLines,
        memberLines.length === 0 ? '- No team members yet' : null,
        standupLines.length > 0 ? `\nTODAY'S STANDUPS:` : null,
        ...standupLines,
        challenges.length > 0 ? `\nACTIVE CHALLENGES:` : null,
        ...challenges.map((c: any) => `- ${c.title} (metric: ${c.metric}, bonus: +${c.bonusXp} XP)`),
        coachingNoteLines.length > 0 ? `\nCOACHING NOTES FOR AGENTS:` : null,
        ...coachingNoteLines,
      ].filter(Boolean).join('\n')
    }

    // Build context string
    const goals = profile.goals || {}
    const bio = profile.habit_prefs?.bio || {}
    const contextBlock = [
      `AGENT PROFILE: ${profile.full_name || 'Agent'}, XP: ${profile.xp || 0}, Streak: ${profile.streak || 0} days`,
      bio.specialty ? `SPECIALTY: ${bio.specialty}` : null,
      bio.about ? `ABOUT: ${bio.about}` : null,
      bio.license ? `LICENSE: ${bio.license}` : null,
      bio.phone ? `PHONE: ${bio.phone}` : null,
      goals.monthly_closings ? `MONTHLY GOAL: ${goals.monthly_closings} closings` : null,
      goals.annual_volume ? `ANNUAL VOLUME GOAL: $${parsePrice(goals.annual_volume).toLocaleString()}` : null,
      // Team context
      profile.team_id ? `\nTEAM: ${profile.teams?.name || 'Team'} (${isTeamOwner ? 'Owner' : isTeamAdmin ? 'Admin' : 'Member'})` : null,
      // Daily standup
      standupToday ? `\nTODAY'S STANDUP:\n- Yesterday: ${standupToday.q1 || 'N/A'}\n- Today's priority: ${standupToday.q2 || 'N/A'}${standupToday.q3 ? `\n- Blockers: ${standupToday.q3}` : ''}` : null,
      // Coaching notes about this agent
      recentNotes.length > 0 ? `\nCOACHING NOTES (from team leader):` : null,
      ...recentNotes.map((n: any) => `- [${n.type || 'general'}${n.pinned ? ', PINNED' : ''}] ${n.text}${n.replies?.length ? ` (${n.replies.length} replies)` : ''}`),
      // Team member data (for owners/admins)
      teamMemberContext || null,
      `\nACTIVE LISTINGS (${activeListings.length}):`,
      ...activeListings.slice(0, 20).map(l => {
        const dom = daysOnMarket(l.list_date, l.created_at)
        const parts = [`- ${l.address || 'Unknown'}`, `Price: ${fmtPrice(l.price)}`, `Status: ${l.status || 'active'}`, `Commission: ${fmtComm(l.commission)}`]
        if (l.list_date) parts.push(`List Date: ${fmtDate(l.list_date)}`)
        if (l.expires_date) parts.push(`Expires: ${fmtDate(l.expires_date)}`)
        if (dom !== null) parts.push(`Days on Market: ${dom}`)
        if (l.lead_source) parts.push(`Lead Source: ${l.lead_source}`)
        if (!l.list_date) parts.push(`Added: ${l.month_year || 'unknown'}`)
        parts.push(getActivity(l.address))
        return parts.filter(Boolean).join(' | ')
      }),
      activeListings.length === 0 ? '- None' : null,
      `\nCLOSED LISTINGS (${closedListings.length}):`,
      ...closedListings.slice(0, 10).map(l => {
        const parts = [`- ${l.address || 'Unknown'}`, `Price: ${fmtPrice(l.price)}`, `Commission: ${fmtComm(l.commission)}`]
        if (l.list_date) parts.push(`List Date: ${fmtDate(l.list_date)}`)
        if (l.lead_source) parts.push(`Lead Source: ${l.lead_source}`)
        if (!l.list_date) parts.push(`Listed: ${l.month_year || 'unknown'}`)
        parts.push(getActivity(l.address))
        return parts.filter(Boolean).join(' | ')
      }),
      closedListings.length === 0 ? '- None' : null,
      `\nBUYER REP AGREEMENTS (${buyerReps.length}):`,
      ...buyerReps.slice(0, 15).map(b => {
        const d = b.buyer_details || {}
        const parts = [`- ${b.address || 'Buyer'}`]
        if (d.preApproval)   parts.push(`Pre-approval: ${d.preApproval}`)
        if (d.paymentRange)  parts.push(`Payment: ${d.paymentRange}`)
        if (d.downPayment)   parts.push(`Down: ${d.downPayment}`)
        if (d.timeline)      parts.push(`Timeline: ${d.timeline}`)
        if (d.dateSigned)    parts.push(`Signed: ${fmtDate(d.dateSigned)}`)
        if (d.dateExpires)   parts.push(`Expires: ${fmtDate(d.dateExpires)}`)
        if (d.lastCallDate)  parts.push(`Last Call: ${fmtDate(d.lastCallDate)}`)
        if (d.locationPrefs) parts.push(`Location: ${d.locationPrefs}`)
        if (d.mustHaves)     parts.push(`Must-haves: ${d.mustHaves}`)
        if (d.niceToHaves)   parts.push(`Nice-to-haves: ${d.niceToHaves}`)
        parts.push(`Status: ${b.status || 'active'}`)
        parts.push(`Added: ${b.month_year || 'unknown'}`)
        const activity = getActivity(b.address)
        if (activity) parts.push(activity.replace(' | Pipeline: ', 'Pipeline: '))
        return parts.join(' | ')
      }),
      buyerReps.length === 0 ? '- None' : null,
      `\nPIPELINE THIS MONTH: ${pipeline.offers_made} offers made, ${pipeline.offers_received} received, ${pipeline.pending} pending, ${pipeline.closed} closed (${pipeline.closed_volume > 0 ? `$${pipeline.closed_volume.toLocaleString()}` : '$0'} volume)`,
      // Pending deals with checklist progress
      (() => {
        const pending = transactions.filter(t => t.type === 'pending' || t.type === 'went_pending')
        if (pending.length === 0) return null
        const lines = pending.map(t => {
          const cl = Array.isArray(t.checklist) ? t.checklist : []
          const done = cl.filter((i: any) => i.done).length
          const total = cl.length
          const remaining = cl.filter((i: any) => !i.done).map((i: any) => i.label)
          const nextTask = remaining.length > 0 ? remaining[0] : 'All tasks complete'
          const overdue = cl.filter((i: any) => !i.done && i.dueDate && new Date(i.dueDate) < new Date()).map((i: any) => i.label)
          let line = `- ${t.address || 'Unknown'} | ${fmtPrice(t.price)} | Checklist: ${done}/${total}`
          if (total > 0) line += ` | Next: ${nextTask}`
          if (overdue.length > 0) line += ` | ⚠ OVERDUE: ${overdue.join(', ')}`
          return line
        })
        return `\nPENDING DEALS (with checklist):\n${lines.join('\n')}`
      })(),
      `\nACTIVITY THIS MONTH:`,
      ...Object.entries(habitCounts).map(([id, count]) => `- ${id}: ${count} completions`),
      Object.keys(habitCounts).length === 0 ? '- No tracked activity yet' : null,
      // Key dates alert — flag urgent items
      (() => {
        const alerts: string[] = []
        const now = Date.now()
        for (const l of activeListings) {
          const dom = daysOnMarket(l.list_date, l.created_at)
          if (l.expires_date) {
            const daysUntilExpiry = Math.floor((new Date(l.expires_date).getTime() - now) / 86400000)
            if (daysUntilExpiry <= 14 && daysUntilExpiry >= 0) alerts.push(`⚠ "${l.address}" listing expires in ${daysUntilExpiry} days (${fmtDate(l.expires_date)})`)
            if (daysUntilExpiry < 0) alerts.push(`🚨 "${l.address}" listing EXPIRED ${Math.abs(daysUntilExpiry)} days ago`)
          }
          if (dom !== null && dom > 60) alerts.push(`⚠ "${l.address}" has been on market ${dom} days — consider price adjustment`)
        }
        for (const b of buyerReps) {
          const d = b.buyer_details || {}
          if (d.dateExpires) {
            const daysUntilExpiry = Math.floor((new Date(d.dateExpires).getTime() - now) / 86400000)
            if (daysUntilExpiry <= 14 && daysUntilExpiry >= 0) alerts.push(`⚠ Buyer rep "${b.address}" expires in ${daysUntilExpiry} days (${fmtDate(d.dateExpires)})`)
            if (daysUntilExpiry < 0) alerts.push(`🚨 Buyer rep "${b.address}" EXPIRED ${Math.abs(daysUntilExpiry)} days ago`)
          }
        }
        return alerts.length > 0 ? `\nKEY DATE ALERTS:\n${alerts.join('\n')}` : null
      })(),
    ].filter(Boolean).join('\n')

    // ── 8. System prompt ────────────────────────────────────────────────────
    const systemPrompt = `You are the RealtyGrind AI Assistant — a real estate coaching and strategy advisor built into the RealtyGrind platform.

You have access to this agent's live data from RealtyGrind:

${contextBlock}

YOUR CAPABILITIES:
1. LISTING STRATEGY: Analyze active listings and suggest pricing adjustments, marketing tactics, staging recommendations, and strategies to reduce days on market.
2. PIPELINE COACHING: Review the agent's pipeline (offers, pending, closed) and suggest next actions, follow-up cadences, and negotiation approaches.
3. BUYER MATCHING: Help agents strategize for their buyer clients — suggest search criteria refinements, offer strategies, and how to compete in multiple-offer situations.
4. COMP RESEARCH: Use your knowledge of real estate markets to discuss comparable sales, pricing trends, and market conditions. While you don't have live MLS data, provide analysis based on the listing data available and general market knowledge for the area.
5. GOAL TRACKING: Compare the agent's activity and closings against their stated goals. Identify gaps and suggest specific actions to get back on track.
6. PROSPECTING ADVICE: Based on the agent's activity patterns, suggest prospecting strategies, time-blocking recommendations, and lead source optimization.
7. BUDGET CLARIFICATION: Analyze buyer financial data (pre-approval amount, comfortable payment range, down payment available) and suggest talking points for budget clarification calls. Flag mismatches between pre-approval amounts and search criteria or price ranges. Recommend when to push for updated pre-approval letters, and identify buyers who may need to adjust expectations.
8. SEARCH CRITERIA REFINEMENT: Review buyer search parameters (location preferences, must-haves, nice-to-haves, timeline) and suggest refinements based on their budget, timeline urgency, and current market conditions. Identify gaps between must-haves and what's realistically available in their price range. Suggest alternative areas or compromises that could expand their options.
9. MARKETING PLAN: Create comprehensive, personalized marketing plans based on the agent's current listings, buyer rep agreements, agent bio/specialty, and market position. Include social media content ideas (with specific post suggestions), open house strategies, email campaign templates, targeted outreach tactics, sphere-of-influence marketing, and digital advertising recommendations tailored to the agent's listings and specialties.
10. STANDUP COACHING: If the agent submitted a daily standup, reference their stated priorities and blockers. Help them problem-solve blockers, validate their priorities against their pipeline, and suggest adjustments to their daily plan. For team owners, review the team's standups and flag agents who may need attention — missed standups, repeated blockers, or misaligned priorities.
11. COACHING NOTE FOLLOW-UP: If coaching notes exist from the team leader, reference them in your advice. Help the agent act on praise (reinforce good habits), work toward goals (track progress), and address concerns (suggest concrete fixes). Keep the coach's guidance central to your recommendations.
12. TEAM PERFORMANCE (owners/admins only): When team roster data is available, provide team-level insights — identify top performers, agents falling behind on habits or closings, accountability gaps, and opportunities for team challenges. Reference coaching notes and suggest coaching interventions for specific agents based on their stats, standups, listings, pipeline activity, and coaching notes.

GUIDELINES:
- Be specific and actionable. Reference the agent's actual listings, pipeline, standups, coaching notes, and data when giving advice.
- Keep responses concise but thorough. Use bullet points and clear structure.
- If asked about market data you don't have, be transparent and suggest where to find it (MLS, RPR, Zillow, etc).
- Encourage consistency and accountability — that's the RealtyGrind way.
- When discussing pricing or comps, clarify that your analysis is based on available data and general market knowledge, not live MLS access.
- When coaching notes exist, weave them naturally into your advice — don't just list them.
- For team owners asking about their team, proactively highlight agents who need attention based on standups, habit streaks, and pipeline activity.
- DUAL PERSPECTIVE: Always coach the user as an individual agent first (their own listings, pipeline, habits, goals). For team owners/admins, also provide team-level insights using the roster data — who's performing, who needs attention, and how the team is tracking overall.
- When an owner asks "how is [name] doing?" or "summarize my team", use the roster data to give concrete answers with XP, streaks, closings, listings, and pipeline stats — not vague generalities.`

    // ── 9. Call Claude API with streaming ────────────────────────────────────
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicKey) {
      if (creditReserved) { try { await admin.rpc('decrement_ai_credit', { user_id_param: user.id }) } catch { /* best-effort */ } }
      return json({ error: 'ANTHROPIC_API_KEY not configured' }, 500)
    }

    // AbortController gives explicit timeout (55 s, under Supabase's default
    // function limit) so we can roll back the reserved credit on network hang.
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
          messages: messages.slice(-20),
          stream: true,
        }),
        signal: fetchController.signal,
      })
    } catch (fetchErr) {
      clearTimeout(fetchTimeout)
      // Network error, DNS failure, or AbortController timeout — roll back credit
      if (creditReserved) {
        try { await admin.rpc('decrement_ai_credit', { user_id_param: user.id }) } catch { /* best-effort */ }
      }
      console.error('Claude API fetch error:', fetchErr)
      return json({ error: 'AI service is temporarily unavailable. Please try again in a moment.' }, 502)
    }
    clearTimeout(fetchTimeout)

    if (!claudeResponse.ok) {
      const errBody = await claudeResponse.text()
      console.error('Claude API error:', claudeResponse.status, errBody)
      // Roll back the reserved credit since Claude failed
      if (creditReserved) {
        try { await admin.rpc('decrement_ai_credit', { user_id_param: user.id }) } catch { /* best-effort */ }
      }
      return json({ error: 'AI service is temporarily unavailable. Please try again in a moment.' }, 502)
    }

    // Credit was already reserved in step 5b — no post-Claude increment needed.

    // ── 10. Forward the stream directly ──────────────────────────────────────
    return new Response(claudeResponse.body, {
      headers: {
        ...CORS,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })
  } catch (err) {
    console.error('ai-assistant error:', err?.message || err, err?.stack || '')
    // Note: creditReserved, admin, and user are block-scoped inside try — rollback
    // is handled inline at each failure point (Claude 502, validation errors, etc.)
    return json({ error: 'An unexpected error occurred. Please try again.' }, 500)
  }
})
