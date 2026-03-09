// supabase/functions/affiliate-signup/index.ts
// Public endpoint — creates a Partnero affiliate partner and returns their referral link.
//
// Required Supabase secrets:
//   PARTNERO_API_KEY — your Partnero API bearer token

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

    const { email, name, website } = body as { email: string; name?: string; website?: string }

    // Validate email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!email || typeof email !== 'string' || !emailRegex.test(email) || email.length > 254) {
      return new Response(
        JSON.stringify({ error: 'Please enter a valid email address.' }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    const apiKey = Deno.env.get('PARTNERO_API_KEY')
    if (!apiKey) {
      console.error('Missing PARTNERO_API_KEY environment variable')
      return new Response(
        JSON.stringify({ error: 'Affiliate signup is temporarily unavailable.' }),
        { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    // Build Partnero payload
    const partnerPayload: Record<string, unknown> = { email: email.trim().toLowerCase() }
    if (name && typeof name === 'string' && name.trim()) {
      const parts = name.trim().split(/\s+/)
      partnerPayload.name = parts[0]
      if (parts.length > 1) partnerPayload.surname = parts.slice(1).join(' ')
    }
    if (website && typeof website === 'string' && website.trim()) {
      partnerPayload.tags = [website.trim()]
    }

    const partneroResp = await fetch('https://api.partnero.com/v1/partners', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(partnerPayload),
    })

    const partneroData = await partneroResp.json()

    if (partneroResp.status === 201) {
      return new Response(
        JSON.stringify({ referral_link: partneroData.data?.referral_link || partneroData.referral_link }),
        { headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    if (partneroResp.status === 422) {
      return new Response(
        JSON.stringify({ error: 'This email is already registered as an affiliate. Check your email for your referral link, or contact support@realtygrind.co.' }),
        { status: 409, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    console.error('Partnero API error:', partneroResp.status, partneroData)
    return new Response(
      JSON.stringify({ error: 'Could not create affiliate account. Please try again.' }),
      { status: 502, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  } catch (err: unknown) {
    console.error('affiliate-signup error:', err)
    return new Response(
      JSON.stringify({ error: 'Affiliate signup is temporarily unavailable. Please try again.' }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }
})
