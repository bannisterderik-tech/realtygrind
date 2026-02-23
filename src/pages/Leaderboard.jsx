import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { CSS, Loader, Wordmark, PageNav, ThemeToggle, getRank, fmtMoney } from '../design'

export default function Leaderboard({ onBack, theme, onToggleTheme }) {
  const { profile } = useAuth()
  const [tab,     setTab]     = useState('global')
  const [global,  setGlobal]  = useState([])
  const [team,    setTeam]    = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(()=>{ load() },[])

  async function load() {
    setLoading(true)
    const {data:g} = await supabase.from('profiles').select('id,full_name,xp,streak,teams(name)')
      .order('xp',{ascending:false}).limit(50)
    setGlobal(g||[])
    if (profile?.team_id) {
      const {data:t} = await supabase.from('profiles').select('id,full_name,xp,streak')
        .eq('team_id',profile.team_id).order('xp',{ascending:false})
      setTeam(t||[])
    }
    setLoading(false)
  }

  const rows   = tab==='global' ? global : team
  const medals = ['#d4a017','#9ca3af','#cd7c32']

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
            <span style={{ fontSize:12, color:'var(--nav-sub)', fontStyle:'italic' }}>Leaderboard</span>
          </>}
        />

        <div className="page-inner" style={{ maxWidth:720 }}>
          {/* Tabs */}
          <div className="tabs">
            {[{id:'global',l:'🌎 Global'},{id:'team',l:'👥 My Team'}].map(t=>(
              <button key={t.id} className={`tab-item${tab===t.id?' on':''}`} onClick={()=>setTab(t.id)}>{t.l}</button>
            ))}
          </div>

          {tab==='team' && !profile?.team_id && (
            <div className="card" style={{ padding:48, textAlign:'center' }}>
              <div style={{ fontSize:44, marginBottom:14 }}>👥</div>
              <div className="serif" style={{ fontSize:22, color:'var(--text)', marginBottom:8 }}>Not on a team yet</div>
              <div style={{ fontSize:13, color:'var(--muted)' }}>Go back and join or create a team first.</div>
            </div>
          )}

          {loading ? <Loader/> : (
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {rows.map((a,i)=>{
                const rank  = getRank(a.xp||0)
                const isMe  = a.id===profile?.id
                const pos   = i+1
                return (
                  <div key={a.id} className={`lb-row${isMe?' me':''}`}
                    style={pos<=3?{borderColor:`${medals[i]}44`}:{}}>
                    <div style={{
                      width:36, height:36, borderRadius:8, flexShrink:0,
                      background:pos<=3?`${medals[i]}18`:'var(--bg2)',
                      border:`1px solid ${pos<=3?medals[i]+'44':'var(--b2)'}`,
                      display:'flex', alignItems:'center', justifyContent:'center',
                      fontFamily:"'JetBrains Mono',monospace", fontWeight:700, fontSize:13,
                      color:pos<=3?medals[i]:'var(--muted)',
                    }}>{pos}</div>

                    <div style={{
                      width:34, height:34, borderRadius:'50%', flexShrink:0,
                      background:`${rank.color}15`, border:`1px solid ${rank.color}30`,
                      display:'flex', alignItems:'center', justifyContent:'center', fontSize:16,
                    }}>{rank.icon}</div>

                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:7, flexWrap:'wrap' }}>
                        <span style={{ fontSize:14, fontWeight:600, color:'var(--text)' }}>{a.full_name||'Agent'}</span>
                        {isMe && <span style={{ fontSize:9, padding:'2px 7px', borderRadius:4, fontWeight:700,
                          background:'var(--gold4)', color:'var(--gold2)', border:'1px solid var(--gold4)' }}>YOU</span>}
                      </div>
                      <div style={{ fontSize:11, color:'var(--muted)', marginTop:1 }}>
                        {rank.name}{a.teams?.name&&` · ${a.teams.name}`}
                      </div>
                    </div>

                    <div style={{ textAlign:'right', flexShrink:0 }}>
                      <div className="label" style={{ marginBottom:2 }}>Streak</div>
                      <div className="mono" style={{ fontWeight:700, fontSize:15, color:'#f97316' }}>🔥 {a.streak||0}</div>
                    </div>

                    <div style={{ textAlign:'right', minWidth:90, flexShrink:0 }}>
                      <div className="label" style={{ marginBottom:2 }}>XP</div>
                      <div className="serif" style={{ fontSize:24, color:rank.color, lineHeight:1, fontWeight:700 }}>
                        {(a.xp||0).toLocaleString()}
                      </div>
                    </div>
                  </div>
                )
              })}
              {rows.length===0 && (
                <div style={{ textAlign:'center', padding:48, color:'var(--muted)', fontSize:13 }}>No data yet.</div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
