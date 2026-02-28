import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { CSS, ThemeToggle } from '../design'

export default function AuthPage({ theme, onToggleTheme, onBack }) {
  const [mode,    setMode]    = useState('login')
  const [name,    setName]    = useState('')
  const [email,   setEmail]   = useState('')
  const [pw,      setPw]      = useState('')
  const [err,     setErr]     = useState('')
  const [ok,      setOk]      = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setErr(''); setOk(''); setLoading(true)
    try {
      if (mode==='signup') {
        const {error} = await supabase.auth.signUp({email, password:pw, options:{data:{full_name:name}}})
        if (error) setErr(error.message)
        else setOk('Account created! Check your email to confirm.')
      } else {
        const {error} = await supabase.auth.signInWithPassword({email, password:pw})
        if (error) setErr(error.message)
      }
    } catch (err) {
      setErr('Something went wrong. Please try again.')
      console.error('Auth error:', err)
    } finally {
      setLoading(false)
    }
  }

  function switchMode(m) { setMode(m); setErr(''); setOk('') }

  return (
    <>
      <style>{CSS}</style>
      <div style={{
        minHeight:'100vh',
        background: theme==='dark'
          ? 'radial-gradient(ellipse at 20% 0%, rgba(217,119,6,.08) 0%, transparent 60%), var(--bg)'
          : 'radial-gradient(ellipse at 20% 0%, rgba(180,83,9,.06) 0%, transparent 60%), var(--bg)',
        display:'flex', alignItems:'center', justifyContent:'center', padding:20, position:'relative',
      }}>
        {/* Subtle grid */}
        <div style={{
          position:'absolute', inset:0, opacity: theme==='dark'?.04:.03, pointerEvents:'none',
          backgroundImage:'repeating-linear-gradient(0deg,transparent,transparent 39px,var(--b2) 39px,var(--b2) 40px),repeating-linear-gradient(90deg,transparent,transparent 39px,var(--b2) 39px,var(--b2) 40px)',
        }}/>

        {/* Back to landing */}
        {onBack && (
          <button onClick={onBack} style={{ position:'absolute', top:20, left:20,
            background:'transparent', border:'none', cursor:'pointer',
            fontSize:13, color:'var(--muted)', fontFamily:'Poppins,sans-serif',
            display:'flex', alignItems:'center', gap:5, padding:'4px 0',
            transition:'color .15s' }}
            onMouseEnter={e=>e.currentTarget.style.color='var(--text)'}
            onMouseLeave={e=>e.currentTarget.style.color='var(--muted)'}>
            ← Back
          </button>
        )}

        {/* Theme toggle */}
        <div style={{ position:'absolute', top:20, right:20, display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontSize:11, color:'var(--muted)', fontWeight:500 }}>
            {theme==='dark' ? 'Dark' : 'Light'} mode
          </span>
          <button onClick={onToggleTheme} style={{
            position:'relative', width:46, height:26, borderRadius:14, cursor:'pointer', padding:0, border:'1.5px solid var(--b3)',
            background: theme==='dark' ? 'var(--bg3)' : 'var(--text)',
            transition:'all .2s',
          }}>
            <div style={{
              position:'absolute', top:3, width:18, height:18, borderRadius:'50%',
              background:'#fff', transition:'transform .2s cubic-bezier(.4,2,.55,1)',
              left: 3, transform: theme==='dark' ? 'translateX(20px)' : 'translateX(0)',
              display:'flex', alignItems:'center', justifyContent:'center', fontSize:10,
              boxShadow:'0 1px 4px rgba(0,0,0,.25)',
            }}>
              {theme==='dark' ? '🌙' : '☀️'}
            </div>
          </button>
        </div>

        <div style={{ width:'100%', maxWidth:400, position:'relative', zIndex:1, animation:'fadeUp .35s ease' }}>
          {/* Logo */}
          <div style={{ textAlign:'center', marginBottom:40 }}>
            <div style={{ fontFamily:"'Fraunces',serif", fontSize:30, fontWeight:700, color:'var(--text)',
              display:'flex', alignItems:'center', justifyContent:'center', gap:10, marginBottom:8 }}>
              <span>🏡</span> RealtyGrind
            </div>
            <div style={{ fontSize:13, color:'var(--muted)' }}>The habit tracker built for agents who close.</div>
          </div>

          <div className="card" style={{ padding:'32px 28px' }}>
            {/* Mode toggle */}
            <div style={{ display:'flex', background:'var(--bg2)', borderRadius:9, padding:3, marginBottom:28 }}>
              {['login','signup'].map(m=>(
                <button key={m} onClick={()=>switchMode(m)} style={{
                  flex:1, padding:'9px 0', border:'none', borderRadius:7, cursor:'pointer',
                  fontSize:13, fontWeight:600, transition:'all .15s',
                  background: mode===m?'var(--surface)':'transparent',
                  color: mode===m?'var(--text)':'var(--muted)',
                  boxShadow: mode===m?'var(--shadow)':'none',
                }}>
                  {m==='login'?'Sign In':'Create Account'}
                </button>
              ))}
            </div>

            <form onSubmit={submit} style={{ display:'flex', flexDirection:'column', gap:16 }}>
              {mode==='signup' && (
                <div>
                  <div className="label" style={{ marginBottom:6 }}>Full Name</div>
                  <input className="field-input" type="text" placeholder="Jane Smith" value={name} onChange={e=>setName(e.target.value)} required/>
                </div>
              )}
              <div>
                <div className="label" style={{ marginBottom:6 }}>Email Address</div>
                <input className="field-input" type="email" placeholder="you@brokerage.com" value={email} onChange={e=>setEmail(e.target.value)} required/>
              </div>
              <div>
                <div className="label" style={{ marginBottom:6 }}>Password</div>
                <input className="field-input" type="password" placeholder="••••••••" value={pw} onChange={e=>setPw(e.target.value)} required minLength={6}/>
              </div>

              {err && (
                <div style={{ background:'rgba(220,38,38,.06)', border:'1px solid rgba(220,38,38,.2)', borderRadius:8, padding:'10px 14px', fontSize:13, color:'var(--red)' }}>
                  {err}
                </div>
              )}
              {ok && (
                <div style={{ background:'rgba(5,150,105,.06)', border:'1px solid rgba(5,150,105,.2)', borderRadius:8, padding:'10px 14px', fontSize:13, color:'var(--green)' }}>
                  {ok}
                </div>
              )}

              <button type="submit" className="btn-primary" disabled={loading} style={{ marginTop:4, padding:'12px', width:'100%', fontSize:14 }}>
                {loading?'Please wait…':mode==='login'?'Sign In':'Create Account'}
              </button>
            </form>

            <div style={{ textAlign:'center', marginTop:22, fontSize:13, color:'var(--muted)' }}>
              {mode==='login'?"Don't have an account? ":"Already have an account? "}
              <span onClick={()=>switchMode(mode==='login'?'signup':'login')}
                style={{ color:'var(--gold)', cursor:'pointer', fontWeight:600 }}>
                {mode==='login'?'Sign up free':'Sign in'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
