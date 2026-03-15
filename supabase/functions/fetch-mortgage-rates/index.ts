// supabase/functions/fetch-mortgage-rates/index.ts
// Fetches national average mortgage rates from the FRED API (Federal Reserve Economic Data)
// and caches them in the mortgage_rates table. Safe to call frequently — skips fetch if
// rates were already updated today.
//
// Required Supabase secrets:
//   FRED_API_KEY          — Free key from https://fred.stlouisfed.org/docs/api/api_key.html
//   SUPABASE_SERVICE_ROLE_KEY (auto)
//
// FRED Series used:
//   MORTGAGE30US  — 30-Year Fixed Rate Mortgage Average (Freddie Mac PMMS)
//   MORTGAGE15US  — 15-Year Fixed Rate Mortgage Average
//
// FHA, VA, DSCR, and Jumbo are derived from typical market spreads.

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

// ── FRED API helpers ──────────────────────────────────────────────────────────

const FRED_BASE = 'https://api.stlouisfed.org/fred/series/observations'

async function fetchFredSeries(seriesId: string, apiKey: string): Promise<number | null> {
  const url = `${FRED_BASE}?series_id=${seriesId}&api_key=${apiKey}&file_type=json&sort_order=desc&limit=1`
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const json = await res.json()
    const val = json?.observations?.[0]?.value
    if (!val || val === '.') return null
    return parseFloat(val)
  } catch {
    return null
  }
}

// ── Typical market spreads from 30yr conventional ─────────────────────────────
// These are national average spreads — close enough for a dashboard widget.
function deriveRates(conv30: number, conv15: number | null) {
  return {
    conventional_30: conv30,
    conventional_15: conv15 ?? +(conv30 - 0.75).toFixed(3),
    fha_30:          +(conv30 - 0.25).toFixed(3),       // FHA typically ~0.25% below conventional
    va_30:           +(conv30 - 0.375).toFixed(3),      // VA typically ~0.375% below conventional
    dscr:            +(conv30 + 1.5).toFixed(3),        // DSCR (investor) typically +1.0–2.0%
    jumbo_30:        +(conv30 + 0.25).toFixed(3),       // Jumbo typically ~0.25% above conventional
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  const cors = getCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })

  try {
    const fredKey = Deno.env.get('FRED_API_KEY')
    if (!fredKey) {
      return new Response(JSON.stringify({ error: 'FRED_API_KEY not configured' }), {
        status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const db = createClient(supabaseUrl, serviceKey)

    // Check if already updated today (skip unnecessary API calls)
    const { data: existing } = await db.from('mortgage_rates').select('updated_at').eq('id', 1).single()
    if (existing?.updated_at) {
      const lastUpdate = new Date(existing.updated_at)
      const now = new Date()
      const hoursSince = (now.getTime() - lastUpdate.getTime()) / (1000 * 60 * 60)
      // Allow force refresh via body param, otherwise skip if updated in last 6 hours
      let force = false
      try {
        const body = await req.json().catch(() => ({}))
        force = body?.force === true
      } catch {}
      if (!force && hoursSince < 6) {
        const { data: cached } = await db.from('mortgage_rates').select('*').eq('id', 1).single()
        return new Response(JSON.stringify({ rates: cached, cached: true }), {
          headers: { ...cors, 'Content-Type': 'application/json' },
        })
      }
    }

    // Fetch from FRED
    const [conv30, conv15] = await Promise.all([
      fetchFredSeries('MORTGAGE30US', fredKey),
      fetchFredSeries('MORTGAGE15US', fredKey),
    ])

    if (!conv30) {
      // FRED might be down or no data — return cached if available
      const { data: cached } = await db.from('mortgage_rates').select('*').eq('id', 1).single()
      if (cached?.conventional_30) {
        return new Response(JSON.stringify({ rates: cached, cached: true, note: 'FRED unavailable, using cache' }), {
          headers: { ...cors, 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ error: 'Could not fetch rates from FRED' }), {
        status: 502, headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    const rates = deriveRates(conv30, conv15)

    // Upsert into cache table
    const { error: upsertErr } = await db.from('mortgage_rates').upsert({
      id: 1,
      ...rates,
      source: 'FRED PMMS',
      updated_at: new Date().toISOString(),
      raw_json: { conv30_raw: conv30, conv15_raw: conv15, fetched_at: new Date().toISOString() },
    })

    if (upsertErr) {
      console.error('Upsert error:', upsertErr)
    }

    return new Response(JSON.stringify({ rates: { id: 1, ...rates, updated_at: new Date().toISOString(), source: 'FRED PMMS' }, cached: false }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('fetch-mortgage-rates error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
})
