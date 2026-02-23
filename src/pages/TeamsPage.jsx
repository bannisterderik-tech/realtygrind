import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { CSS, Loader, Wordmark, PageNav, ThemeToggle, Ring, getRank, CAT } from '../design'

const HABITS_FOR_DISPLAY = [
  { id:'prospecting', label:'Prospecting', cat:'leads' },
  { id:'appointments', label:'Appointments', cat:'leads' },
  { id:'showing', label:'Showings', cat:'leads' },
  { id:'newlisting', label:'Listings', cat:'listings' },
  { id:'market', label:'Market', cat:'market' },
]

export default function TeamsPage({ onBack, theme, onToggleTheme }) {
  const { user, profile, refreshProfile } = useAuth()
  const [mode,       setMode]       = useState('menu')
  const [teamName,   setTeamName]   = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [members,    setMembers]    = useState([])
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState('')
  const [success,    setSuccess]    = useState('')
  const [teamData,   setTeamData]   = useState(null)
  const [memberStats,setMemberStats]= useState({})

  const MONTH_YEAR = new Date().toISOString().slice(0,7)

  useEffect(()=>{
    if (profile?.team_id) { setMode('myteam'); fetchMembers(profile.team_id) }
  },[profile])

  async function fetchMembers(tid) {
    setLoading(true)
    const {data:mems} = await supabase.from('profiles').select('id,full_name,xp,streak').eq('team_id',tid).order('xp',{ascending:false})
    setMembers(mems||[])
    const {data:team} = await supabase.from('teams').select('*').eq('id',tid).single()
    setTeamData(team)
    // Load habit stats for all members
    if (mems?.length) {
      const ids = mems.map(m=>m.id)
      const {data:habs} = await supabase.from('habit_completions').select('user_id,habit_id,counter_value')
        .in('user_id',ids).eq('month_year',MONTH_YEAR)
      const {data:txs} = await supabase.from('transactions').select('user_id,type,price,commission')
        .in('user_id',ids).eq('month_year',MONTH_YEAR)
      const stats = {}
      ids.forEach(id=>{
        const mh = (habs||[]).filter(h=>h.user_id===id)
        const mt = (txs||[]).filter(t=>t.user_id===id)
        const habits = {}
        HABITS_FOR_DISPLAY.forEach(h=>{ habits[h.id] = mh.filter(x=>x.habit_id===h.id).reduce((a,x)=>a+(x.counter_value||1),0) })
        const closedVol  = mt.filter(t=>t.type==='closed').reduce((a,t)=>{ const n=parseFloat(String(t.price||'').replace(/[^0-9.]/g,'')); return a+(isNaN(n)?0:n) },0)
        const closedComm = mt.filter(t=>t.type==='closed').reduce((a,t)=>{ const n=parseFloat(String(t.commission||'').replace(/[^0-9.]/g,'')); return a+(isNaN(n)?0:n) },0)
        stats[id] = { habits, closed:mt.filter(t=>t.type==='closed').length, closedVol, closedComm, totalHabits:mh.length }
      })
      setMemberStats(stats)
    }
    setLoading(false)
  }

  async function createTeam() {
    if (!teamName.trim()) return
    setLoading(true); setError('')
    try {
      const code = Math.random().toString(36).slice(2,7).toUpperCase()
      const {data:team,error:e} = await supabase.from('teams')
        .insert({name:teamName.trim(), created_by:user.id, invite_code:code, max_members:999}).select().single()
      if (e) throw new Error(e.message)
      await supabase.from('team_members').insert({team_id:team.id, user_id:user.id, role:'owner'})
      await supabase.from('profiles').update({team_id:team.id}).eq('id',user.id)
      await refreshProfile()
      setSuccess(`Team "${team.name}" created!`)
      setMode('myteam'); fetchMembers(team.id)
    } catch(e) { setError(e.message) }
    setLoading(false)
  }

  async function joinTeam() {
    setLoading(true); setError('')
    try {
      const {data:team,error:e} = await supabase.from('teams').select('*')
        .eq('invite_code',inviteCode.trim().toUpperCase()).single()
      if (e||!team) throw new Error('Team not found. Check your invite code.')
      await supabase.from('team_members').insert({team_id:team.id, user_id:user.id, role:'member'})
      await supabase.from('profiles').update({team_id:team.id}).eq('id',user.id)
      await refreshProfile()
      setSuccess(`You joined "${team.name}"!`)
      setMode('myteam'); fetchMembers(team.id)
    } catch(e) { setError(e.message) }
    setLoading(false)
  }

  async function leaveTeam() {
    if (!confirm('Leave this team?')) return
    await supabase.from('team_members').delete().eq('user_id',user.id)
    await supabase.from('profiles').update({team_id:null}).eq('id',user.id)
    await refreshProfile()
    setMode('menu'); setMembers([]); setTeamData(null)
  }

  return (
    <>
      <style>{CSS}</style>
      <div className="page">
        <PageNav
          left={<>
            <button className="nav-btn" onClick={onBack}>← Back</button>
            <Wordmark light/>
          </>}
          right={<>
            <ThemeToggle theme={theme} onToggle={onToggleTheme}/>
            <span style={{ fontSize:12, color:'var(--nav-sub)', fontStyle:'italic' }}>Teams</span>
          </>}
        />

        <div className="page-inner" style={{ maxWidth:860 }}>

          {success && (
            <div style={{ background:'rgba(5,150,105,.08)', border:'1px solid rgba(5,150,105,.2)', borderRadius:9,
              padding:'12px 18px', marginBottom:16, fontSize:13, color:'var(--green)', display:'flex', justifyContent:'space-between' }}>
              {success}
              <button onClick={()=>setSuccess('')} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--green)', fontSize:16 }}>✕</button>
            </div>
          )}
          {error && (
            <div style={{ background:'rgba(220,38,38,.06)', border:'1px solid rgba(220,38,38,.2)', borderRadius:9,
              padding:'12px 18px', marginBottom:16, fontSize:13, color:'var(--red)', display:'flex', justifyContent:'space-between' }}>
              {error}
              <button onClick={()=>setError('')} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--red)', fontSize:16 }}>✕</button>
            </div>
          )}

          {/* No team menu */}
          {mode==='menu' && (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, maxWidth:560, animation:'fadeUp .25s ease' }}>
              <div className="card" style={{ padding:28, textAlign:'center', cursor:'pointer', transition:'all .15s' }}
                onClick={()=>setMode('create')}>
                <div style={{ fontSize:40, marginBottom:14 }}>🏗️</div>
                <div className="serif" style={{ fontSize:20, color:'var(--text)', marginBottom:8 }}>Create a Team</div>
                <div style={{ fontSize:13, color:'var(--muted)', lineHeight:1.6 }}>Start a team and invite colleagues with a code.</div>
                <button className="btn-primary" style={{ marginTop:16, width:'100%' }}>Create Team</button>
              </div>
              <div className="card" style={{ padding:28, textAlign:'center', cursor:'pointer' }}
                onClick={()=>setMode('join')}>
                <div style={{ fontSize:40, marginBottom:14 }}>🤝</div>
                <div className="serif" style={{ fontSize:20, color:'var(--text)', marginBottom:8 }}>Join a Team</div>
                <div style={{ fontSize:13, color:'var(--muted)', lineHeight:1.6 }}>Enter an invite code to join an existing team.</div>
                <button className="btn-outline" style={{ marginTop:16, width:'100%' }}>Join Team</button>
              </div>
            </div>
          )}

          {/* Create form */}
          {mode==='create' && (
            <div style={{ maxWidth:420, animation:'fadeUp .25s ease' }}>
              <div className="serif" style={{ fontSize:26, color:'var(--text)', marginBottom:4 }}>Create a Team</div>
              <div style={{ fontSize:13, color:'var(--muted)', marginBottom:24 }}>Give your team a name — teammates join with your invite code.</div>
              <div className="card" style={{ padding:24, display:'flex', flexDirection:'column', gap:16 }}>
                <div>
                  <div className="label" style={{ marginBottom:6 }}>Team Name</div>
                  <input className="field-input" value={teamName} onChange={e=>setTeamName(e.target.value)}
                    onKeyDown={e=>e.key==='Enter'&&createTeam()} placeholder="e.g. The A-Team…"/>
                </div>
                <div style={{ display:'flex', gap:10 }}>
                  <button className="btn-outline" onClick={()=>setMode('menu')} style={{ flex:1 }}>Cancel</button>
                  <button className="btn-primary" onClick={createTeam} disabled={loading||!teamName.trim()} style={{ flex:2 }}>
                    {loading?'Creating…':'Create Team'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Join form */}
          {mode==='join' && (
            <div style={{ maxWidth:380, animation:'fadeUp .25s ease' }}>
              <div className="serif" style={{ fontSize:26, color:'var(--text)', marginBottom:4 }}>Join a Team</div>
              <div style={{ fontSize:13, color:'var(--muted)', marginBottom:24 }}>Enter the 5-character invite code from your team lead.</div>
              <div className="card" style={{ padding:24, display:'flex', flexDirection:'column', gap:16 }}>
                <div>
                  <div className="label" style={{ marginBottom:6 }}>Invite Code</div>
                  <input className="field-input" value={inviteCode} onChange={e=>setInviteCode(e.target.value.toUpperCase())}
                    onKeyDown={e=>e.key==='Enter'&&joinTeam()} placeholder="XXXXX" maxLength={5}
                    style={{ letterSpacing:4, fontFamily:"'JetBrains Mono',monospace", fontWeight:700, fontSize:20, textAlign:'center' }}/>
                </div>
                <div style={{ display:'flex', gap:10 }}>
                  <button className="btn-outline" onClick={()=>setMode('menu')} style={{ flex:1 }}>Cancel</button>
                  <button className="btn-primary" onClick={joinTeam} disabled={loading||inviteCode.length<5} style={{ flex:2 }}>
                    {loading?'Joining…':'Join Team'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* My team */}
          {mode==='myteam' && (
            <div style={{ animation:'fadeUp .25s ease' }}>
              {loading && !members.length ? <Loader/> : (
                <>
                  {/* Team header */}
                  {teamData && (
                    <div className="card" style={{ padding:22, marginBottom:16, display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:14 }}>
                      <div>
                        <div className="serif" style={{ fontSize:26, color:'var(--text)', marginBottom:3 }}>{teamData.name}</div>
                        <div style={{ fontSize:13, color:'var(--muted)' }}>{members.length} member{members.length!==1?'s':''} · all-time</div>
                      </div>
                      <div style={{ display:'flex', gap:12, alignItems:'center' }}>
                        <div className="card-inset" style={{ padding:'10px 20px', textAlign:'center' }}>
                          <div className="label" style={{ marginBottom:4 }}>Invite Code</div>
                          <div className="mono" style={{ fontSize:22, fontWeight:700, color:'var(--gold)', letterSpacing:5 }}>
                            {teamData.invite_code}
                          </div>
                        </div>
                        <button onClick={leaveTeam} style={{
                          background:'rgba(220,38,38,.06)', border:'1px solid rgba(220,38,38,.2)',
                          color:'var(--red)', borderRadius:8, padding:'9px 16px', cursor:'pointer', fontSize:12, fontWeight:600
                        }}>Leave Team</button>
                      </div>
                    </div>
                  )}

                  {/* Members */}
                  <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                    {members.map((m,i)=>{
                      const rank  = getRank(m.xp||0)
                      const isMe  = m.id===user.id
                      const stats = memberStats[m.id]||{}
                      const isOwner = teamData?.created_by===m.id
                      return (
                        <div key={m.id} className={`card${isMe?' ':' '}`} style={{
                          padding:18, border:`1px solid ${isMe?'rgba(217,119,6,.35)':'var(--b2)'}`,
                          background:isMe?'var(--gold3)':'var(--surface)',
                        }}>
                          <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:stats?10:0 }}>
                            <div className="mono" style={{ width:26, fontSize:12, color:'var(--dim)', textAlign:'center', fontWeight:700 }}>
                              {i+1}
                            </div>
                            <div style={{ width:36, height:36, borderRadius:'50%', background:`${rank.color}18`,
                              border:`1.5px solid ${rank.color}33`, display:'flex', alignItems:'center', justifyContent:'center',
                              fontSize:18, flexShrink:0 }}>
                              {rank.icon}
                            </div>
                            <div style={{ flex:1 }}>
                              <div style={{ display:'flex', alignItems:'center', gap:7, flexWrap:'wrap' }}>
                                <span style={{ fontSize:14, fontWeight:600, color:'var(--text)' }}>{m.full_name||'Agent'}</span>
                                {isMe && <span style={{ fontSize:9, padding:'2px 6px', borderRadius:4, background:'var(--gold4)', color:'var(--gold)', fontWeight:700 }}>YOU</span>}
                                {isOwner && <span style={{ fontSize:9, padding:'2px 6px', borderRadius:4, background:'rgba(139,92,246,.12)', color:'#8b5cf6', fontWeight:700 }}>OWNER</span>}
                              </div>
                              <div style={{ fontSize:11, color:'var(--muted)' }}>{rank.name}</div>
                            </div>
                            <div style={{ textAlign:'right', flexShrink:0 }}>
                              <div className="serif" style={{ fontSize:22, color:rank.color, fontWeight:700, lineHeight:1 }}>
                                {(m.xp||0).toLocaleString()}
                              </div>
                              <div style={{ fontSize:11, color:'#f97316' }}>🔥 {m.streak||0} streak</div>
                            </div>
                          </div>

                          {stats && stats.totalHabits > 0 && (
                            <div style={{ display:'flex', gap:8, flexWrap:'wrap', paddingLeft:50, marginTop:8 }}>
                              {HABITS_FOR_DISPLAY.map(h=>{
                                const v = stats.habits?.[h.id]||0
                                const cs = CAT[h.cat]
                                if (!v) return null
                                return (
                                  <span key={h.id} style={{ fontSize:10, padding:'2px 8px', borderRadius:5,
                                    background:cs.light, color:cs.color, border:`1px solid ${cs.border}`,
                                    fontFamily:"'JetBrains Mono',monospace", fontWeight:600 }}>
                                    {h.label}: {v}
                                  </span>
                                )
                              })}
                              {stats.closed>0 && (
                                <span style={{ fontSize:10, padding:'2px 8px', borderRadius:5,
                                  background:'rgba(5,150,105,.1)', color:'var(--green)', border:'1px solid rgba(5,150,105,.2)',
                                  fontFamily:"'JetBrains Mono',monospace", fontWeight:600 }}>
                                  Closed: {stats.closed}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
