import { createClient } from '@supabase/supabase-js'

const supabaseUrl     = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  // Render a visible error instead of crashing the module graph silently
  const msg = 'Missing VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY — add them to your .env file.'
  console.error('[RealtyGrind]', msg)
  const el = document.getElementById('root')
  if (el) el.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100vh;background:#1a1917;color:#d97706;font-family:monospace;text-align:center;padding:40px"><div><h2 style="margin-bottom:12px">⚠ RealtyGrind</h2><p>${msg}</p></div></div>`
}

export const supabase = (supabaseUrl && supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null
