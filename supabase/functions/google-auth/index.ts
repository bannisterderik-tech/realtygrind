// supabase/functions/google-auth/index.ts
// Server-side Google OAuth2 token management for persistent Calendar access.
// Handles authorization code exchange, token refresh, and disconnect/revoke.
//
// Required Supabase secrets:
//   GOOGLE_CLIENT_ID             — OAuth 2.0 Client ID
//   GOOGLE_CLIENT_SECRET         — OAuth 2.0 Client Secret
//   SUPABASE_SERVICE_ROLE_KEY    — already set automatically

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
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  }
}

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke'

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
    const googleClientId     = Deno.env.get('GOOGLE_CLIENT_ID')
    const googleClientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')

    if (!googleClientId || !googleClientSecret) {
      return json({ error: 'Google OAuth not configured on server' }, 500)
    }

    // ── Auth — identify the user via JWT ──────────────────────────────────
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

    // ── Parse request body ────────────────────────────────────────────────
    const body = await req.json().catch(() => ({}))
    const action = body.action as string

    // ── ACTION: exchange — first-time connect ─────────────────────────────
    if (action === 'exchange') {
      const code = body.code as string
      if (!code) return json({ error: 'Missing authorization code' }, 400)

      // Exchange auth code for tokens with Google
      const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: googleClientId,
          client_secret: googleClientSecret,
          redirect_uri: 'postmessage',
          grant_type: 'authorization_code',
        }),
      })

      const tokenData = await tokenRes.json()
      if (!tokenRes.ok || tokenData.error) {
        console.error('Google token exchange failed:', tokenData)
        return json({ error: tokenData.error_description || 'Token exchange failed' }, 400)
      }

      const { access_token, refresh_token, expires_in } = tokenData

      // Store refresh token in profiles (service_role bypasses the trigger)
      if (refresh_token) {
        await admin.from('profiles')
          .update({ google_refresh_token: refresh_token })
          .eq('id', user.id)
      }

      return json({ access_token, expires_in: expires_in || 3600 })
    }

    // ── ACTION: refresh — get fresh access token ──────────────────────────
    if (action === 'refresh') {
      // Read stored refresh token
      const { data: profile } = await admin.from('profiles')
        .select('google_refresh_token')
        .eq('id', user.id)
        .single()

      const refreshToken = profile?.google_refresh_token
      if (!refreshToken) {
        return json({ error: 'not_connected' })
      }

      // Use refresh token to get a new access token
      const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          refresh_token: refreshToken,
          client_id: googleClientId,
          client_secret: googleClientSecret,
          grant_type: 'refresh_token',
        }),
      })

      const tokenData = await tokenRes.json()
      if (!tokenRes.ok || tokenData.error) {
        // Token was revoked or is invalid — clear it
        if (tokenData.error === 'invalid_grant') {
          await admin.from('profiles')
            .update({ google_refresh_token: null })
            .eq('id', user.id)
          return json({ error: 'token_revoked' })
        }
        console.error('Google token refresh failed:', tokenData)
        return json({ error: tokenData.error_description || 'Token refresh failed' }, 400)
      }

      return json({
        access_token: tokenData.access_token,
        expires_in: tokenData.expires_in || 3600,
      })
    }

    // ── ACTION: disconnect — revoke + clear ───────────────────────────────
    if (action === 'disconnect') {
      const { data: profile } = await admin.from('profiles')
        .select('google_refresh_token')
        .eq('id', user.id)
        .single()

      const refreshToken = profile?.google_refresh_token
      if (refreshToken) {
        // Best-effort revoke with Google
        try {
          await fetch(`${GOOGLE_REVOKE_URL}?token=${encodeURIComponent(refreshToken)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          })
        } catch (e) {
          console.warn('Google revoke failed (non-fatal):', e)
        }

        // Clear from database
        await admin.from('profiles')
          .update({ google_refresh_token: null })
          .eq('id', user.id)
      }

      return json({ success: true })
    }

    return json({ error: `Unknown action: ${action}` }, 400)

  } catch (err) {
    console.error('google-auth error:', err)
    return json({ error: 'Internal server error' }, 500)
  }
})
