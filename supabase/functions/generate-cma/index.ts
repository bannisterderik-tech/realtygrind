// supabase/functions/generate-cma/index.ts
// Generates an AI-powered Comparative Market Analysis report.
// Two-phase architecture: Phase 1 returns immediately, Phase 2 runs in background.
//
// Required Supabase secrets:
//   ANTHROPIC_API_KEY           — sk-ant-...
//   REALTYMOLE_API_KEY          — RentCast API key (rentcast.io)
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

// Monthly CMA generation limit per team
const TEAM_CMA_LIMIT = 50

function currentMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function esc(s: string) { return s.replace(/</g, '&lt;').replace(/"/g, '&quot;') }

// ══════════════════════════════════════════════════════════════════════════════
// Phase 2: Background generation handler
// ══════════════════════════════════════════════════════════════════════════════
async function handleBackgroundGeneration(
  params: Record<string, unknown>,
  supabaseUrl: string,
  serviceRoleKey: string,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const reportId = params.reportId as string
  const userId = params.userId as string
  const teamId = params.teamId as string | null
  const address = params.address as string
  const style = params.style as string
  const cmaTheme = (params.cmaTheme as string) || 'light'
  const colorScheme = params.colorScheme as string
  const searchRadius = (params.searchRadius as number) || 2
  const daysBack = (params.daysBack as number) || 180
  const maxComps = (params.maxComps as number) || 15
  const propertyType = (params.propertyType as string) || 'Single Family'
  const profileData = (params.profileData || {}) as Record<string, string>

  async function markFailed(errorMsg?: string) {
    await admin.from('cma_reports').update({
      status: 'failed',
      updated_at: new Date().toISOString(),
    }).eq('id', reportId)
    if (errorMsg) console.error(`CMA ${reportId} failed:`, errorMsg)
  }

  try {
    // ── Step 1: Fetch subject property from RentCast ───────────────────────
    const rentcastKey = Deno.env.get('REALTYMOLE_API_KEY')
    if (!rentcastKey) {
      await markFailed('REALTYMOLE_API_KEY (RentCast) not configured')
      return json({ error: 'Property data service not configured' }, 500)
    }

    const encodedAddr = encodeURIComponent(address)
    const rcHeaders = { 'X-Api-Key': rentcastKey, 'Accept': 'application/json' }

    // Fetch subject property details
    let subjectData: Record<string, unknown> = {}
    try {
      const subjectRes = await fetch(
        `https://api.rentcast.io/v1/properties?address=${encodedAddr}`,
        { headers: rcHeaders }
      )
      if (subjectRes.ok) {
        const subjectArr = await subjectRes.json()
        subjectData = Array.isArray(subjectArr) && subjectArr.length > 0 ? subjectArr[0] : subjectArr
      } else {
        console.warn('RentCast property lookup returned', subjectRes.status)
      }
    } catch (err) {
      console.warn('RentCast property fetch failed (continuing):', err)
    }

    // Fetch comparable sales — use lat/lng from subject + saleDateRange filter
    let compsRaw: unknown[] = []
    const subjectLat = subjectData.latitude as number | undefined
    const subjectLng = subjectData.longitude as number | undefined
    try {
      // Prefer lat/lng for radius search (more accurate), fall back to address
      const compsUrl = subjectLat && subjectLng
        ? `https://api.rentcast.io/v1/properties?latitude=${subjectLat}&longitude=${subjectLng}&radius=${searchRadius}&saleDateRange=${daysBack}&propertyType=${encodeURIComponent(propertyType)}&limit=${maxComps}`
        : `https://api.rentcast.io/v1/properties?address=${encodedAddr}&radius=${searchRadius}&saleDateRange=${daysBack}&propertyType=${encodeURIComponent(propertyType)}&limit=${maxComps}`
      const compsRes = await fetch(compsUrl, { headers: rcHeaders })
      if (compsRes.ok) {
        const compsBody = await compsRes.json()
        const allComps = Array.isArray(compsBody) ? compsBody : []
        // Filter out the subject property itself
        const subjectAddr = (subjectData.formattedAddress as string || address).toLowerCase()
        compsRaw = allComps.filter((c: Record<string, unknown>) =>
          (c.formattedAddress as string || '').toLowerCase() !== subjectAddr
        )
      } else {
        console.warn('RentCast comps lookup returned', compsRes.status)
      }
    } catch (err) {
      console.warn('RentCast comps fetch failed:', err)
    }

    if (compsRaw.length === 0) {
      await markFailed('No comparable sales found for this address')
      return json({ error: 'No comparable sales found' }, 400)
    }

    // ── Step 2: Single Claude call — analysis + HTML in one shot ──────────
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicKey) {
      await markFailed('ANTHROPIC_API_KEY not configured')
      return json({ error: 'AI service not configured' }, 500)
    }

    const isDark = cmaTheme === 'dark'
    const primaryColor = colorScheme || '#2563eb'

    const teamLogo = isDark
      ? (profileData?.teamLogoDark || profileData?.teamLogo || '')
      : (profileData?.teamLogo || '')
    const teamName = profileData?.teamName || ''
    const agentName = profileData?.agentName || ''
    const agentEmail = profileData?.agentEmail || ''
    const agentPhone = profileData?.agentPhone || ''
    const agentLicense = profileData?.agentLicense || ''

    const combinedPrompt = `You are a real estate CMA analyst AND premium HTML report builder. You will perform TWO tasks in a single response.

SUBJECT PROPERTY:
Address: ${address}
${JSON.stringify(subjectData, null, 2)}

COMPARABLE SALES (${compsRaw.length} comps):
${JSON.stringify(compsRaw, null, 2)}

═══ TASK 1: ANALYSIS (output as JSON block) ═══
Analyze comps and output a JSON block wrapped in <analysis> tags:
<analysis>
{
  "comps_analyzed": [
    { "address": "string", "salePrice": number, "saleDate": "string", "bedrooms": number, "bathrooms": number, "squareFootage": number, "lotSize": number, "yearBuilt": number, "distance": number, "relevanceScore": number (0-100), "adjustedPrice": number, "adjustments": { "sqft": number, "bedrooms": number, "bathrooms": number, "lotSize": number, "age": number, "condition": number, "total": number }, "notes": "string" }
  ],
  "pricing_strategy": { "recommended_price": number, "low": number, "high": number, "price_per_sqft": number, "strategy": "aggressive/competitive/conservative", "reasoning": "2-3 sentences" },
  "market_context": { "avg_sale_price": number, "median_sale_price": number, "avg_price_per_sqft": number, "avg_dom": number, "absorption_rate": "string", "price_trend": "appreciating/stable/declining", "market_type": "seller's/balanced/buyer's", "comp_count": number },
  "executive_summary": "3-5 sentence professional summary"
}
</analysis>

Sort comps by relevanceScore descending. Use top 6-8 most relevant for pricing. Adjustments in dollars.

═══ TASK 2: HTML REPORT (output after analysis) ═══
Using your analysis above, generate a complete standalone HTML document wrapped in <report> tags:
<report>
<!DOCTYPE html>...
</report>

BRANDING:
- Primary color: ${primaryColor}
- Theme: ${cmaTheme} (${isDark ? 'dark background' : 'light background'})
- Style: ${style}
- Team name: ${teamName || 'N/A'}
- Agent name: ${agentName || 'N/A'}
- Agent email: ${agentEmail || 'N/A'}
- Agent phone: ${agentPhone || 'N/A'}
- Agent license: ${agentLicense || 'N/A'}
${teamLogo ? `- Team logo URL: ${teamLogo}` : ''}

HTML SECTIONS:
1. COVER PAGE - Gradient background using primary color, large address, "Comparative Market Analysis" subtitle, date, agent/team branding, logo if available
2. SUBJECT PROPERTY - Card grid: beds, baths, sqft, lot size, year built, property type
3. COMPARABLE SALES TABLE - Top 6-8 comps: Address, Sale Price, Sale Date, Bed/Bath, SqFt, $/SqFt, Distance, Score (color-coded badge). Alternate row colors.
4. ADJUSTMENT ANALYSIS - Dollar adjustments for top 5-6 comps. Green=positive, red=negative.
5. MARKET CONTEXT - 4-card grid: Avg Sale Price, Median Price, Avg $/SqFt, Days on Market
6. PRICING STRATEGY - Price ladder: Low/Recommended/High. Highlight recommended. Include reasoning.
7. EXECUTIVE SUMMARY - Colored box with summary text and bullet takeaways.
8. FOOTER - Disclaimer, "Powered by RealtyGrind", date.

DESIGN: Standalone HTML+CSS, no external deps, system fonts, print media queries, cover page min-height:100vh, score badges (80+ green, 60-79 amber, <60 red), $ formatting with commas, ${isDark ? 'dark backgrounds (#0a0a14, #12121a), light text (#e4e4e7)' : 'light backgrounds, dark text'}, accent color: ${primaryColor}. NO JavaScript, NO script tags, NO external images/fonts (except team logo if provided).`

    // ── Claude Call 1: Analysis JSON ──────────────────────────────────────
    const analysisPrompt = `You are a real estate CMA analyst. Analyze the subject property and comparable sales, then return ONLY valid JSON (no markdown, no code fences).

SUBJECT PROPERTY:
Address: ${address}
${JSON.stringify(subjectData, null, 2)}

COMPARABLE SALES (${compsRaw.length} comps):
${JSON.stringify(compsRaw, null, 2)}

Return this exact JSON structure:
{
  "comps_analyzed": [
    { "address": "string", "salePrice": number, "saleDate": "string", "bedrooms": number, "bathrooms": number, "squareFootage": number, "lotSize": number, "yearBuilt": number, "distance": number, "relevanceScore": 0-100, "adjustedPrice": number, "adjustments": { "sqft": number, "bedrooms": number, "bathrooms": number, "lotSize": number, "age": number, "condition": number, "total": number }, "notes": "string" }
  ],
  "pricing_strategy": { "recommended_price": number, "low": number, "high": number, "price_per_sqft": number, "strategy": "aggressive/competitive/conservative", "reasoning": "2-3 sentences" },
  "market_context": { "avg_sale_price": number, "median_sale_price": number, "avg_price_per_sqft": number, "avg_dom": number, "price_trend": "appreciating/stable/declining", "market_type": "seller's/balanced/buyer's", "comp_count": number },
  "executive_summary": "3-5 sentence professional summary"
}

Sort comps by relevanceScore descending. Use top 6-8 most relevant for pricing. Adjustments in dollars.`

    console.log(`CMA ${reportId}: Starting Claude analysis...`)

    let analysisData: Record<string, unknown> = {}
    try {
      const res1 = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 4096,
          messages: [{ role: 'user', content: analysisPrompt }],
        }),
      })
      if (!res1.ok) {
        const errText = await res1.text()
        await markFailed(`Claude analysis error: ${res1.status} ${errText}`)
        return json({ error: 'AI analysis failed' }, 502)
      }
      const data1 = await res1.json()
      let text1 = ''
      for (const block of (data1.content || [])) {
        if (block.type === 'text') text1 += block.text
      }
      // Strip markdown code fences if present
      text1 = text1.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '').trim()
      analysisData = JSON.parse(text1)
      console.log(`CMA ${reportId}: Analysis complete, ${(analysisData.comps_analyzed as unknown[])?.length || 0} comps scored`)
    } catch (err) {
      await markFailed(`Analysis parse error: ${String(err)}`)
      return json({ error: 'AI analysis failed' }, 502)
    }

    const compsAnalyzed = (analysisData.comps_analyzed as unknown[]) || []
    const pricingStrategy = (analysisData.pricing_strategy as Record<string, unknown>) || {}
    const marketContext = (analysisData.market_context as Record<string, unknown>) || {}
    const executiveSummary = (analysisData.executive_summary as string) || ''

    // ── Claude Call 2: HTML Report ─────────────────────────────────────────
    const htmlPrompt = `You are a premium HTML report builder. Generate a complete standalone HTML document for a Comparative Market Analysis report. Return ONLY the HTML — no markdown, no code fences, no explanation. Start with <!DOCTYPE html>.

SUBJECT PROPERTY:
Address: ${address}
Beds: ${subjectData.bedrooms || 'N/A'} | Baths: ${subjectData.bathrooms || 'N/A'} | SqFt: ${subjectData.squareFootage || 'N/A'} | Lot: ${subjectData.lotSize || 'N/A'} | Year: ${subjectData.yearBuilt || 'N/A'} | Type: ${subjectData.propertyType || propertyType}

ANALYSIS DATA:
${JSON.stringify(analysisData, null, 2)}

BRANDING:
- Primary color: ${primaryColor}
- Theme: ${cmaTheme} (${isDark ? 'dark background' : 'light background'})
- Style: ${style}
- Team name: ${teamName || 'N/A'}
- Agent name: ${agentName || 'N/A'}
- Agent email: ${agentEmail || 'N/A'}
- Agent phone: ${agentPhone || 'N/A'}
- Agent license: ${agentLicense || 'N/A'}
${teamLogo ? `- Team logo URL: ${teamLogo}` : ''}

HTML SECTIONS:
1. COVER PAGE - Gradient background using primary color, large address, "Comparative Market Analysis" subtitle, date, agent/team branding, logo if available
2. SUBJECT PROPERTY - Card grid: beds, baths, sqft, lot size, year built, property type
3. COMPARABLE SALES TABLE - Top 6-8 comps: Address, Sale Price, Sale Date, Bed/Bath, SqFt, $/SqFt, Distance, Score (color-coded badge). Alternate row colors.
4. ADJUSTMENT ANALYSIS - Dollar adjustments for top 5-6 comps. Green=positive, red=negative.
5. MARKET CONTEXT - 4-card grid: Avg Sale Price, Median Price, Avg $/SqFt, Days on Market
6. PRICING STRATEGY - Price ladder: Low/Recommended/High. Highlight recommended. Include reasoning.
7. EXECUTIVE SUMMARY - Colored box with summary text and bullet takeaways.
8. FOOTER - Disclaimer, "Powered by RealtyGrind", date.

DESIGN: Standalone HTML+CSS, no external deps, system fonts, print media queries, cover page min-height:100vh, score badges (80+ green, 60-79 amber, <60 red), $ formatting with commas, ${isDark ? 'dark backgrounds (#0a0a14, #12121a), light text (#e4e4e7)' : 'light backgrounds, dark text'}, accent color: ${primaryColor}. NO JavaScript, NO script tags, NO external images/fonts (except team logo if provided).`

    console.log(`CMA ${reportId}: Starting Claude HTML generation...`)

    let reportHtml = ''
    try {
      const res2 = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 12000,
          messages: [{ role: 'user', content: htmlPrompt }],
        }),
      })
      if (!res2.ok) {
        const errText = await res2.text()
        await markFailed(`Claude HTML error: ${res2.status} ${errText}`)
        return json({ error: 'AI report generation failed' }, 502)
      }
      const data2 = await res2.json()
      for (const block of (data2.content || [])) {
        if (block.type === 'text') reportHtml += block.text
      }
      // Strip markdown code fences if present
      reportHtml = reportHtml.replace(/^```html?\s*/i, '').replace(/\s*```$/i, '').trim()
      // Find HTML start if there's preamble text
      const htmlStart = reportHtml.indexOf('<!DOCTYPE') !== -1 ? reportHtml.indexOf('<!DOCTYPE') : reportHtml.indexOf('<html')
      if (htmlStart > 0) reportHtml = reportHtml.slice(htmlStart)

      console.log(`CMA ${reportId}: HTML generated, ${reportHtml.length} chars, stop_reason: ${data2.stop_reason}`)
      if (data2.stop_reason === 'max_tokens') {
        console.warn(`CMA ${reportId}: HTML was truncated! Closing tags...`)
        reportHtml += '</body></html>'
      }
    } catch (err) {
      await markFailed(`HTML generation error: ${String(err)}`)
      return json({ error: 'Report generation failed' }, 502)
    }

    if (!reportHtml || reportHtml.length < 100) {
      await markFailed('Empty HTML from AI')
      return json({ error: 'Report generation returned empty result' }, 500)
    }

    // Post-process: strip any <script> tags the AI may have included
    reportHtml = reportHtml.replace(/<script[\s\S]*?<\/script>/gi, '')

    // ── Step 3: Save to database ────────────────────────────────────────────
    const { error: updateErr } = await admin.from('cma_reports').update({
      subject_data: subjectData,
      comps_raw: compsRaw,
      comps_analyzed: compsAnalyzed,
      pricing_strategy: pricingStrategy,
      market_context: marketContext,
      html: reportHtml,
      status: 'ready',
      updated_at: new Date().toISOString(),
    }).eq('id', reportId)

    if (updateErr) {
      console.error('Failed to save CMA report:', updateErr.message)
      return json({ error: 'Failed to save report' }, 500)
    }

    return json({ id: reportId, status: 'ready' })

  } catch (err) {
    console.error('CMA background generation error:', err)
    await markFailed(String(err))
    return json({ error: 'Report generation failed' }, 500)
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// Main handler — Phase 1 (fast) + Phase 2 dispatch
// ══════════════════════════════════════════════════════════════════════════════
Deno.serve(async (req) => {
  const CORS = getCorsHeaders(req)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  try {
    const ct = req.headers.get('content-type') || ''
    if (!ct.includes('application/json')) {
      return new Response(
        JSON.stringify({ error: 'Content-Type must be application/json' }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    let body: Record<string, unknown>
    try { body = await req.json() } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON body' }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    // ── Phase 2: Background mode (self-call) ──
    if (body._bgMode) {
      return handleBackgroundGeneration(body, supabaseUrl, serviceRoleKey, CORS)
    }

    // ── Phase 1: Auth + validate + create row + dispatch ──
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing Authorization header' }),
        { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    // Fetch profile + team
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data: profile } = await admin
      .from('profiles')
      .select('*, teams(id, name, created_by, team_prefs, cma_addon_status, cma_generations_used, cma_generations_reset, presentations_addon_status)')
      .eq('id', user.id)
      .single()

    if (!profile) {
      return new Response(
        JSON.stringify({ error: 'Profile not found' }),
        { status: 404, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    // Check add-on access
    const isAdmin = profile.app_role === 'admin'
    if (!isAdmin) {
      const team = profile.teams
      if (!team) {
        return new Response(
          JSON.stringify({ error: 'CMA Builder requires an active add-on subscription.' }),
          { status: 403, headers: { ...CORS, 'Content-Type': 'application/json' } }
        )
      }
      const cmaStatus = team.cma_addon_status
      if (cmaStatus !== 'active' && cmaStatus !== 'trialing') {
        return new Response(
          JSON.stringify({ error: 'CMA Builder add-on is not active. Subscribe from Billing.' }),
          { status: 403, headers: { ...CORS, 'Content-Type': 'application/json' } }
        )
      }
      // Check team toggle
      const cmaEnabled = team.team_prefs?.ai_tools?.cma_enabled !== false
      if (!cmaEnabled) {
        return new Response(
          JSON.stringify({ error: 'CMA Builder is disabled by your team admin.' }),
          { status: 403, headers: { ...CORS, 'Content-Type': 'application/json' } }
        )
      }
    }

    // Check monthly generation limit
    const teamId = profile.team_id
    if (teamId && !isAdmin) {
      const team = profile.teams
      const resetMonth = team?.cma_generations_reset
      const currentMo = currentMonth()
      let used = team?.cma_generations_used || 0
      if (resetMonth !== currentMo) {
        // Reset counter for new month
        await admin.from('teams').update({
          cma_generations_used: 0,
          cma_generations_reset: currentMo,
        }).eq('id', teamId)
        used = 0
      }
      if (used >= TEAM_CMA_LIMIT) {
        return new Response(
          JSON.stringify({ error: `Monthly CMA generation limit (${TEAM_CMA_LIMIT}) reached. Resets next month.` }),
          { status: 429, headers: { ...CORS, 'Content-Type': 'application/json' } }
        )
      }
      // Increment counter
      await admin.from('teams').update({
        cma_generations_used: used + 1,
        cma_generations_reset: currentMo,
      }).eq('id', teamId)
    }

    // Validate input
    const address = (body.address as string || '').trim()
    if (!address) {
      return new Response(
        JSON.stringify({ error: 'Address is required' }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    const style = (['modern', 'classic', 'minimal', 'bold'].includes(body.style as string))
      ? body.style as string : 'modern'
    const cmaTheme = body.theme === 'dark' ? 'dark' : 'light'
    const colorScheme = /^#[0-9a-fA-F]{6}$/.test(body.colorScheme as string || '')
      ? body.colorScheme as string : '#2563eb'
    const searchRadius = Math.min(Math.max(Number(body.searchRadius) || 2, 0.5), 10)
    const daysBack = [90, 180, 365].includes(Number(body.daysBack)) ? Number(body.daysBack) : 180
    const maxComps = [10, 15, 20].includes(Number(body.maxComps)) ? Number(body.maxComps) : 15
    const propertyType = (body.propertyType as string) || 'Single Family'

    // Create report row
    const { data: report, error: insertErr } = await admin.from('cma_reports').insert({
      user_id: user.id,
      team_id: teamId,
      subject_address: address,
      status: 'generating',
      style,
      theme: cmaTheme,
      color_scheme: colorScheme,
      search_radius: searchRadius,
      days_back: daysBack,
      max_comps: maxComps,
      property_type: propertyType,
    }).select('id').single()

    if (insertErr || !report) {
      console.error('Failed to create CMA report row:', insertErr?.message)
      return new Response(
        JSON.stringify({ error: 'Failed to create report' }),
        { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    // Gather profile data for branding
    const team = profile.teams
    const profileData: Record<string, string> = {}
    profileData.teamName = team?.name || ''
    profileData.teamLogo = team?.team_prefs?.ai_tools?.presentation_logo || ''
    profileData.teamLogoDark = team?.team_prefs?.ai_tools?.presentation_logo_dark || ''
    profileData.agentName = profile.full_name || ''
    profileData.agentEmail = profile.email || user.email || ''
    profileData.agentPhone = profile.phone || ''
    profileData.agentLicense = profile.license_number || ''

    // Self-call for background processing
    const bgBody = {
      _bgMode: true,
      reportId: report.id,
      userId: user.id,
      teamId,
      address,
      style,
      cmaTheme,
      colorScheme,
      searchRadius,
      daysBack,
      maxComps,
      propertyType,
      profileData,
    }

    const fnUrl = `${supabaseUrl}/functions/v1/generate-cma`
    fetch(fnUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify(bgBody),
    }).catch(err => console.error('Background self-call failed:', err))

    // Return immediately
    return new Response(
      JSON.stringify({ id: report.id, status: 'generating' }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    console.error('generate-cma error:', err)
    return new Response(
      JSON.stringify({ error: 'CMA generation is temporarily unavailable.' }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }
})
