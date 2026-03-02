// supabase/functions/ai-assistant/index.ts
// AI-powered real estate coaching assistant using Claude Sonnet.
// Streams responses directly to the client. Tracks per-user credit usage.
//
// Required Supabase secrets:
//   ANTHROPIC_API_KEY           — sk-ant-...
//   SUPABASE_SERVICE_ROLE_KEY   — already set automatically

import { createClient } from 'npm:@supabase/supabase-js@2'

const ALLOWED_ORIGIN = Deno.env.get('APP_ORIGIN') || 'https://realtygrind.com'
const CORS = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Credit limits per plan tier (1 credit = 1 message sent)
const CREDIT_LIMITS: Record<string, number> = {
  solo: 50,
  team: 250,
  brokerage: 500,
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

function currentMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

Deno.serve(async (req) => {
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

    // Determine effective plan tier
    const isTeamMember = !!(profile.team_id && profile.teams?.created_by !== user.id)
    let effectivePlan: string
    if (isTeamMember) {
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
    if (!hasBilling && !isTeamMember) {
      return json({ error: 'subscription_required', message: 'Subscribe to a plan to use AI Assistant.' }, 403)
    }

    // ── 4. Team gate ────────────────────────────────────────────────────────
    if (profile.team_id && profile.teams?.team_prefs?.ai_tools?.assistant_enabled === false) {
      return json({ error: 'disabled_by_team', message: 'AI Assistant has been disabled by your team owner.' }, 403)
    }

    // ── 5. Credit gate ──────────────────────────────────────────────────────
    const limit = CREDIT_LIMITS[effectivePlan] ?? 0
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

    // Check credit limit
    if (creditsUsed >= limit) {
      return json({
        error: 'credits_exhausted',
        plan: effectivePlan,
        limit,
        used: creditsUsed,
      }, 429)
    }

    // ── 6. Parse request body ───────────────────────────────────────────────
    const { messages } = await req.json()
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return json({ error: 'messages array is required' }, 400)
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
      activityByAddress[addr].push(`${label}${priceStr}${fromStr} [${t.month_year || ''}]`)
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
    const isAdmin = isTeamOwner || (teamPrefs.admins || []).includes(user.id)

    if (isAdmin && profile.team_id) {
      const { data: teamMembers } = await admin
        .from('profiles')
        .select('id, full_name, xp, streak, goals, habit_prefs')
        .eq('team_id', profile.team_id)
        .neq('id', user.id)
        .order('xp', { ascending: false })
        .limit(50)

      // Fetch this month's habit completions + transactions for each member
      const memberIds = (teamMembers || []).map((m: any) => m.id)
      const [memberHabitsRes, memberTxRes] = await Promise.all([
        memberIds.length > 0
          ? admin.from('habit_completions').select('user_id, habit_id, counter_value').eq('month_year', MONTH_YEAR).in('user_id', memberIds).limit(2000)
          : { data: [] },
        memberIds.length > 0
          ? admin.from('transactions').select('user_id, type, price').eq('month_year', MONTH_YEAR).in('user_id', memberIds).limit(500)
          : { data: [] },
      ])

      // Aggregate per member
      const memberHabits: Record<string, number> = {}
      for (const h of (memberHabitsRes.data || [])) {
        memberHabits[h.user_id] = (memberHabits[h.user_id] || 0) + 1
      }
      const memberDeals: Record<string, { closed: number, volume: number }> = {}
      for (const t of (memberTxRes.data || [])) {
        if (t.type === 'closed') {
          if (!memberDeals[t.user_id]) memberDeals[t.user_id] = { closed: 0, volume: 0 }
          memberDeals[t.user_id].closed++
          memberDeals[t.user_id].volume += parsePrice(t.price)
        }
      }

      // Collect today's standups
      const standupLines: string[] = []
      const memberLines: string[] = []

      for (const m of (teamMembers || [])) {
        const mStandup = m.habit_prefs?.standup_today
        const mGoals = m.goals || {}
        const mBio = m.habit_prefs?.bio || {}
        const deals = memberDeals[m.id] || { closed: 0, volume: 0 }
        const habitCount = memberHabits[m.id] || 0

        memberLines.push(`- ${m.full_name || 'Agent'} | XP: ${m.xp || 0} | Streak: ${m.streak || 0}d | Habits: ${habitCount} this month | Closed: ${deals.closed}${deals.volume > 0 ? ` ($${deals.volume.toLocaleString()})` : ''}${mBio.specialty ? ` | Specialty: ${mBio.specialty}` : ''}${mGoals.monthly_closings ? ` | Goal: ${mGoals.monthly_closings} closings` : ''}`)

        if (mStandup?.date === todayStr) {
          standupLines.push(`- ${m.full_name || 'Agent'}: Yesterday: ${mStandup.q1 || 'N/A'} | Today: ${mStandup.q2 || 'N/A'}${mStandup.q3 ? ` | Blockers: ${mStandup.q3}` : ''}`)
        }
      }

      // Active challenges
      const challenges = (teamPrefs.challenges || []).filter((c: any) => c.status === 'active')

      teamMemberContext = [
        `\nTEAM ROSTER (${(teamMembers || []).length} agents):`,
        ...memberLines,
        memberLines.length === 0 ? '- No team members yet' : null,
        standupLines.length > 0 ? `\nTODAY'S STANDUPS:` : null,
        ...standupLines,
        challenges.length > 0 ? `\nACTIVE CHALLENGES:` : null,
        ...challenges.map((c: any) => `- ${c.title} (metric: ${c.metric}, bonus: +${c.bonusXp} XP)`),
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
      profile.team_id ? `\nTEAM: ${profile.teams?.name || 'Team'} (${isTeamOwner ? 'Owner' : isAdmin ? 'Admin' : 'Member'})` : null,
      // Daily standup
      standupToday ? `\nTODAY'S STANDUP:\n- Yesterday: ${standupToday.q1 || 'N/A'}\n- Today's priority: ${standupToday.q2 || 'N/A'}${standupToday.q3 ? `\n- Blockers: ${standupToday.q3}` : ''}` : null,
      // Coaching notes about this agent
      recentNotes.length > 0 ? `\nCOACHING NOTES (from team leader):` : null,
      ...recentNotes.map((n: any) => `- [${n.type || 'general'}${n.pinned ? ', PINNED' : ''}] ${n.text}${n.replies?.length ? ` (${n.replies.length} replies)` : ''}`),
      // Team member data (for owners/admins)
      teamMemberContext || null,
      `\nACTIVE LISTINGS (${activeListings.length}):`,
      ...activeListings.slice(0, 20).map(l =>
        `- ${l.address || 'Unknown'} | Price: ${fmtPrice(l.price)} | Status: ${l.status || 'active'} | Commission: ${fmtComm(l.commission)} | Listed: ${l.month_year || 'unknown'}${getActivity(l.address)}`
      ),
      activeListings.length === 0 ? '- None' : null,
      `\nCLOSED LISTINGS (${closedListings.length}):`,
      ...closedListings.slice(0, 10).map(l =>
        `- ${l.address || 'Unknown'} | Price: ${fmtPrice(l.price)} | Commission: ${fmtComm(l.commission)} | Listed: ${l.month_year || 'unknown'}${getActivity(l.address)}`
      ),
      closedListings.length === 0 ? '- None' : null,
      `\nBUYER REP AGREEMENTS (${buyerReps.length}):`,
      ...buyerReps.slice(0, 15).map(b => {
        const d = b.buyer_details || {}
        const parts = [`- ${b.address || 'Buyer'}`]
        if (d.preApproval)   parts.push(`Pre-approval: ${d.preApproval}`)
        if (d.paymentRange)  parts.push(`Payment: ${d.paymentRange}`)
        if (d.downPayment)   parts.push(`Down: ${d.downPayment}`)
        if (d.timeline)      parts.push(`Timeline: ${d.timeline}`)
        if (d.dateSigned)    parts.push(`Signed: ${d.dateSigned}`)
        if (d.dateExpires)   parts.push(`Expires: ${d.dateExpires}`)
        if (d.lastCallDate)  parts.push(`Last Call: ${d.lastCallDate}`)
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
      `\nACTIVITY THIS MONTH:`,
      ...Object.entries(habitCounts).map(([id, count]) => `- ${id}: ${count} completions`),
      Object.keys(habitCounts).length === 0 ? '- No tracked activity yet' : null,
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
12. TEAM PERFORMANCE (owners/admins only): When team roster data is available, provide team-level insights — identify top performers, agents falling behind on habits or closings, accountability gaps, and opportunities for team challenges. Suggest coaching interventions for specific agents based on their stats, standups, and coaching notes.

GUIDELINES:
- Be specific and actionable. Reference the agent's actual listings, pipeline, standups, coaching notes, and data when giving advice.
- Keep responses concise but thorough. Use bullet points and clear structure.
- If asked about market data you don't have, be transparent and suggest where to find it (MLS, RPR, Zillow, etc).
- Encourage consistency and accountability — that's the RealtyGrind way.
- When discussing pricing or comps, clarify that your analysis is based on available data and general market knowledge, not live MLS access.
- When coaching notes exist, weave them naturally into your advice — don't just list them.
- For team owners asking about their team, proactively highlight agents who need attention based on standups, habit streaks, and pipeline activity.`

    // ── 9. Call Claude API with streaming ────────────────────────────────────
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicKey) return json({ error: 'ANTHROPIC_API_KEY not configured' }, 500)

    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
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
    })

    if (!claudeResponse.ok) {
      const errBody = await claudeResponse.text()
      console.error('Claude API error:', claudeResponse.status, errBody)
      let detail = ''
      try { detail = JSON.parse(errBody)?.error?.message || errBody.slice(0, 200) } catch { detail = errBody.slice(0, 200) }
      return json({ error: `Claude API error (${claudeResponse.status}): ${detail}` }, 502)
    }

    // ── 10. Increment credit AFTER successful Claude response ───────────────
    // Use atomic SQL increment to prevent race conditions
    await admin.rpc('increment_ai_credits', { user_id_param: user.id, reset_month: month }).catch(() => {
      // Fallback to read-then-write if RPC doesn't exist yet
      admin.from('profiles').update({
        ai_credits_used: (profile.ai_credits_used || 0) + 1,
        ai_credits_reset: month,
      }).eq('id', user.id)
    })

    // ── 11. Forward the stream directly ─────────────────────────────────────
    return new Response(claudeResponse.body, {
      headers: {
        ...CORS,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })
  } catch (err) {
    console.error('ai-assistant error:', err)
    return json({ error: 'An unexpected error occurred. Please try again.' }, 500)
  }
})
