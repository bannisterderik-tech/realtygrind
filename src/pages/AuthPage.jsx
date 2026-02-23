import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function AuthPage() {
  const [mode, setMode] = useState('login') // 'login' | 'signup'
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState('')
  const [success, setSuccess] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)

    if (mode === 'signup') {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } }
      })
      if (error) setError(error.message)
      else setSuccess('Account created! Check your email to confirm, then log in.')
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError(error.message)
    }
    setLoading(false)
  }

  const s = styles
  return (
    <div style={s.page}>
      <div style={s.card}>
        <div style={s.logo}>🏡 <span style={{ color: '#16a34a' }}>REALTY</span>GRIND</div>
        <div style={s.subtitle}>The #1 Habit Tracker for Real Estate Agents</div>

        <div style={s.tabs}>
          <button onClick={() => setMode('login')} style={{ ...s.tab, ...(mode === 'login' ? s.tabActive : {}) }}>Log In</button>
          <button onClick={() => setMode('signup')} style={{ ...s.tab, ...(mode === 'signup' ? s.tabActive : {}) }}>Sign Up</button>
        </div>

        <form onSubmit={handleSubmit} style={s.form}>
          {mode === 'signup' && (
            <div style={s.field}>
              <label style={s.label}>Full Name</label>
              <input style={s.input} type="text" placeholder="Derik Bannister" value={fullName}
                onChange={e => setFullName(e.target.value)} required />
            </div>
          )}
          <div style={s.field}>
            <label style={s.label}>Email</label>
            <input style={s.input} type="email" placeholder="you@brokerage.com" value={email}
              onChange={e => setEmail(e.target.value)} required />
          </div>
          <div style={s.field}>
            <label style={s.label}>Password</label>
            <input style={s.input} type="password" placeholder="••••••••" value={password}
              onChange={e => setPassword(e.target.value)} required minLength={6} />
          </div>

          {error && <div style={s.error}>{error}</div>}
          {success && <div style={s.successMsg}>{success}</div>}

          <button type="submit" style={s.btn} disabled={loading}>
            {loading ? 'Please wait...' : mode === 'login' ? 'Log In' : 'Create Account'}
          </button>
        </form>

        <div style={s.footer}>
          {mode === 'login' ? "Don't have an account? " : "Already have an account? "}
          <span style={s.link} onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); setSuccess('') }}>
            {mode === 'login' ? 'Sign up free' : 'Log in'}
          </span>
        </div>
      </div>
    </div>
  )
}

const styles = {
  page: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #f0f9ff 0%, #f0fdf4 50%, #fefce8 100%)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: "'DM Mono', monospace", padding: 16,
  },
  card: {
    background: 'white', borderRadius: 20, padding: '40px 36px',
    width: '100%', maxWidth: 420, boxShadow: '0 8px 40px rgba(0,0,0,0.10)',
    border: '1px solid #e2e8f0',
  },
  logo: {
    fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 26,
    color: '#1e293b', textAlign: 'center', marginBottom: 6,
  },
  subtitle: { fontSize: 11, color: '#94a3b8', textAlign: 'center', marginBottom: 28, letterSpacing: 0.5 },
  tabs: { display: 'flex', background: '#f1f5f9', borderRadius: 10, padding: 4, marginBottom: 24 },
  tab: {
    flex: 1, padding: '8px 0', border: 'none', background: 'transparent',
    borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600,
    fontFamily: "'Syne', sans-serif", color: '#64748b', transition: 'all 0.2s',
  },
  tabActive: { background: 'white', color: '#1e293b', boxShadow: '0 1px 4px rgba(0,0,0,0.1)' },
  form: { display: 'flex', flexDirection: 'column', gap: 16 },
  field: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { fontSize: 11, color: '#64748b', fontWeight: 600, letterSpacing: 0.5 },
  input: {
    border: '1.5px solid #e2e8f0', borderRadius: 10, padding: '10px 14px',
    fontSize: 13, color: '#1e293b', fontFamily: "'DM Mono', monospace",
    outline: 'none', transition: 'border-color 0.2s',
  },
  error: {
    background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8,
    padding: '10px 14px', fontSize: 12, color: '#dc2626',
  },
  successMsg: {
    background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8,
    padding: '10px 14px', fontSize: 12, color: '#16a34a',
  },
  btn: {
    background: '#16a34a', color: 'white', border: 'none', borderRadius: 10,
    padding: '12px 0', fontSize: 13, fontWeight: 700, cursor: 'pointer',
    fontFamily: "'Syne', sans-serif", marginTop: 4, transition: 'background 0.2s',
  },
  footer: { fontSize: 11, color: '#94a3b8', textAlign: 'center', marginTop: 20 },
  link: { color: '#16a34a', cursor: 'pointer', fontWeight: 700 },
}
