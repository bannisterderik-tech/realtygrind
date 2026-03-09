// supabase/functions/google-auth/index.ts
// Server-side Google Calendar proxy — all token management happens here.
// The client never touches Google access tokens; it only knows "connected" or not.
//
// Actions:
//   exchange    — swap auth code for tokens, store refresh token
//   status      — check if user has a refresh token (connected?)
//   sync        — fetch calendar events using stored refresh token
//   add_event   — create a calendar event
//   disconnect  — revoke + clear refresh token
//
// Required Supabase secrets:
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET

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

    // ── Internal helper: get a fresh access token from stored refresh token ─
    async function getFreshAccessToken(): Promise<string | null> {
      const { data: profile } = await admin.from('profiles')
        .select('google_refresh_token')
        .eq('id', user!.id)
        .single()

      const refreshToken = profile?.google_refresh_token
      if (!refreshToken) return null

      const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          refresh_token: refreshToken,
          client_id: googleClientId!,
          client_secret: googleClientSecret!,
          grant_type: 'refresh_token',
        }),
      })

      const tokenData = await tokenRes.json()
      if (!tokenRes.ok || tokenData.error) {
        if (tokenData.error === 'invalid_grant') {
          // Token revoked — clear it
          await admin.from('profiles')
            .update({ google_refresh_token: null })
            .eq('id', user!.id)
        }
        console.error('Token refresh failed:', tokenData)
        return null
      }

      return tokenData.access_token
    }

    // ── Parse request body ────────────────────────────────────────────────
    const body = await req.json().catch(() => ({}))
    const action = body.action as string

    // ── ACTION: exchange — first-time connect ─────────────────────────────
    if (action === 'exchange') {
      const code = body.code as string
      if (!code) return json({ error: 'Missing authorization code' }, 400)

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

      const { refresh_token } = tokenData

      if (refresh_token) {
        await admin.from('profiles')
          .update({ google_refresh_token: refresh_token })
          .eq('id', user.id)
      } else {
        // Google didn't return a refresh token (user previously consented).
        // Check if we already have one stored — if not, the connection won't persist.
        const { data: existing } = await admin.from('profiles')
          .select('google_refresh_token')
          .eq('id', user.id)
          .single()
        if (!existing?.google_refresh_token) {
          console.warn('No refresh token returned and none stored — connection will not persist')
          return json({ error: 'no_refresh_token', message: 'Please disconnect and reconnect to grant offline access' }, 400)
        }
      }

      return json({ connected: true })
    }

    // ── ACTION: status — is the user connected? ─────────────────────────
    if (action === 'status') {
      const { data: profile } = await admin.from('profiles')
        .select('google_refresh_token')
        .eq('id', user.id)
        .single()

      return json({ connected: !!profile?.google_refresh_token })
    }

    // ── ACTION: sync — fetch calendar events via server-side token ───────
    if (action === 'sync') {
      const accessToken = await getFreshAccessToken()
      if (!accessToken) return json({ error: 'not_connected' })

      const now = new Date()
      const timeMin = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
      const timeMax = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString()

      const res = await fetch(
        `${GCAL_BASE}/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime&maxResults=250`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )

      if (!res.ok) {
        const errText = await res.text().catch(() => '')
        console.error('Google Calendar API error:', res.status, errText)
        if (res.status === 401) {
          // Access token invalid despite refresh — token likely revoked
          await admin.from('profiles')
            .update({ google_refresh_token: null })
            .eq('id', user.id)
          return json({ error: 'token_revoked' })
        }
        return json({ error: 'Failed to fetch calendar events' }, 502)
      }

      const data = await res.json()
      const events = (data.items || []).map((event: any) => {
        const dateStr = event.start?.date || (event.start?.dateTime ? event.start.dateTime.slice(0, 10) : null)
        const timeStr = event.start?.dateTime
          ? new Date(event.start.dateTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
          : null
        return {
          summary: event.summary || '',
          date: dateStr,
          time: timeStr,
          google_event_id: event.id,
        }
      }).filter((e: any) => e.summary && e.date)

      return json({ events })
    }

    // ── ACTION: add_event — create a calendar event ─────────────────────
    if (action === 'add_event') {
      const { summary, date, description } = body
      if (!summary || !date) return json({ error: 'Missing summary or date' }, 400)

      const accessToken = await getFreshAccessToken()
      if (!accessToken) return json({ error: 'not_connected' })

      const res = await fetch(`${GCAL_BASE}/calendars/primary/events`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary,
          start: { date },
          end: { date },
          description: description || '',
        }),
      })

      if (!res.ok) {
        const errText = await res.text().catch(() => '')
        console.error('Google Calendar add event error:', res.status, errText)
        return json({ error: 'Failed to add event' }, 502)
      }

      const event = await res.json()
      return json({ success: true, eventId: event.id })
    }

    // ── ACTION: disconnect — revoke + clear ───────────────────────────────
    if (action === 'disconnect') {
      const { data: profile } = await admin.from('profiles')
        .select('google_refresh_token')
        .eq('id', user.id)
        .single()

      const refreshToken = profile?.google_refresh_token
      if (refreshToken) {
        try {
          await fetch(`${GOOGLE_REVOKE_URL}?token=${encodeURIComponent(refreshToken)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          })
        } catch (e) {
          console.warn('Google revoke failed (non-fatal):', e)
        }

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
