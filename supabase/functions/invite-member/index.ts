import { createClient } from 'npm:@supabase/supabase-js@2'

const ALLOWED_ORIGIN = Deno.env.get('APP_ORIGIN') || 'https://realtygrind.com'
const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseUrl    = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // ── 1. Verify user via Supabase auth (not manual JWT decode) ─────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Use Supabase client to verify the JWT properly (with signature check)
    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data: { user }, error: authErr } = await userClient.auth.getUser()
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const userId = user.id

    let body: Record<string, unknown>
    try { body = await req.json() } catch { return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }) }
    const { email, teamId } = body as { email: string; teamId: string }
    if (!email || !teamId) {
      return new Response(JSON.stringify({ error: 'email and teamId are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── 2. Verify caller owns this team (admin client for full DB access) ────
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: team, error: teamErr } = await adminClient
      .from('teams')
      .select('id, created_by')
      .eq('id', teamId)
      .single()

    if (teamErr || !team) {
      return new Response(JSON.stringify({ error: 'Team not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (team.created_by !== userId) {
      return new Response(JSON.stringify({ error: 'Only the team owner can send invites' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── 3. Check team member count vs plan limit ──────────────────────────────
    const PLAN_MAX_MEMBERS: Record<string, number> = { solo: 0, team: 15, brokerage: 50 }
    const { data: ownerProfile } = await adminClient
      .from('profiles')
      .select('plan, billing_status')
      .eq('id', userId)
      .single()
    const planMax = PLAN_MAX_MEMBERS[ownerProfile?.plan || ''] ?? 0
    const billingActive = ownerProfile?.billing_status === 'active' || ownerProfile?.billing_status === 'trialing'
    if (!billingActive || planMax === 0) {
      return new Response(JSON.stringify({ error: 'Your current plan does not support team invites.' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    // For brokerage, respect team-level max_members override (support can grant extra seats)
    const { data: teamRow } = await adminClient
      .from('teams')
      .select('max_members')
      .eq('id', teamId)
      .single()
    const effectiveMax = (teamRow?.max_members && teamRow.max_members > planMax) ? teamRow.max_members : planMax
    const { count } = await adminClient
      .from('team_members')
      .select('id', { count: 'exact', head: true })
      .eq('team_id', teamId)
    if ((count ?? 0) >= effectiveMax) {
      return new Response(JSON.stringify({ error: `Team is at the ${effectiveMax}-member limit. Contact support to add more seats ($7/seat/mo).` }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── 4. Send the invite ────────────────────────────────────────────────────
    const { data: inviteData, error: inviteErr } = await adminClient.auth.admin.inviteUserByEmail(
      email.trim().toLowerCase(),
      { data: { team_id: teamId } }
    )

    if (inviteErr) {
      return new Response(JSON.stringify({ error: inviteErr.message }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(
      JSON.stringify({ success: true, userId: inviteData?.user?.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('invite-member error:', err)
    return new Response(JSON.stringify({ error: 'Failed to send invite. Please try again.' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
