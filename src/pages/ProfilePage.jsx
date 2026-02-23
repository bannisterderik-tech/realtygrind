import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { CSS, Loader, Wordmark, PageNav, ThemeToggle, Ring, getRank, fmtMoney, RANKS } from '../design'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const CUR_YEAR = new Date().getFullYear()

export default function ProfilePage({ onBack, theme, onToggleTheme }) {
  const { user, profile, refreshProfile } = useAuth()
  const rank     = getRank(profile?.xp||0)
  const nextRank = RANKS.find(r => r.min > (profile?.xp||0))
  const rankPct  = nextRank ? Math.round(((profile?.xp||0)-rank.min)/(nextRank.min-rank.min)*100) : 100

  const [name,       setName]       = useState(profile?.full_name||'')
  const [saving,     setSaving]     = useState(false)
  const [saveMsg,    setSaveMsg]    = useState('')
  const [pw,         setPw]         = useState('')
  const [pwSaving,   setPwSaving]   = useState(false)
  const [pwMsg,      setPwMsg]      = useState('')
  const [year,       setYear]       = useState(CUR_YEAR)
  const [annual,     setAnnual]     = useState(null)
  const [annLoad,    setAnnLoad]    = useState(true)
  const [members,    setMembers]    = useState([])
  const [showDel,    setShowDel]    = useState(false)
  const [delText,    setDelText]    = useState('')
  const [delLoading, setDelLoading] = useState(false)
  const [activeTab,  setActiveTab]  = useState('profile')

  useEffect(()=>{ fetchAnnual(year) },[year])
  useEffect(()=>{ if(profile?.team_id) fetchMembers(profile.team_id) },[profile])

  async function fetchMembers(tid) {
    const {data} = await supabase.from('profiles').select('id,full_name,xp,streak').eq('team_id',tid).order('xp',{ascending:false})
    setMembers(data||[])
  }

  async function fetchAnnual(yr) {
    setAnnLoad(true)
    const mks = Array.from({length:12},(_,i)=>`${yr}-${String(i+1).padStart(2,'0')}`)
    const [h,t,l] = await Promise.all([
      supabase.from('habit_completions').select('month_year,habit_id,counter_value,xp_earned').eq('user_id',user.id).like('month_year',`${yr}-%`),
      supabase.from('transactions').select('month_year,type,price,commission').eq('user_id',user.id).like('month_year',`${yr}-%`),
      supabase.from('listings').select('month_year,unit_count').eq('user_id',user.id).like('month_year',`${yr}-%`),
    ])
    const habs=h.data||[], txs=t.data||[], lists=l.data||[]
    const byMonth = mks.map((mk,i)=>{
      const mh=habs.filter(x=>x.month_year===mk)
      const mt=txs.filter(x=>x.month_year===mk)
      const ml=lists.filter(x=>x.month_year===mk)
      const closed=mt.filter(x=>x.type==='closed')
      const vol  = closed.reduce((a,x)=>{ const n=parseFloat(String(x.price||'').replace(/[^0-9.]/g,'')); return a+(isNaN(n)?0:n) },0)
      const comm = closed.reduce((a,x)=>{ const n=parseFloat(String(x.commission||'').replace(/[^0-9.]/g,'')); return a+(isNaN(n)?0:n) },0)
      return { m:MONTHS[i], mk, days:mh.length, xp:mh.reduce((a,x)=>a+(x.xp_earned||0),0),
        appts:mh.filter(x=>x.habit_id==='appointments').reduce((a,x)=>a+(x.counter_value||1),0),
        shows:mh.filter(x=>x.habit_id==='showing').reduce((a,x)=>a+(x.counter_value||1),0),
        listed:ml.reduce((a,x)=>a+(x.unit_count||0),0),
        offers:mt.filter(x=>x.type==='offer_made').length,
        pending:mt.filter(x=>x.type==='pending').length,
        closed:closed.length, vol, comm }
    })
    const tot = byMonth.reduce((a,m)=>({
      days:a.days+m.days, xp:a.xp+m.xp, appts:a.appts+m.appts, shows:a.shows+m.shows,
      listed:a.listed+m.listed, offers:a.offers+m.offers, pending:a.pending+m.pending,
      closed:a.closed+m.closed, vol:a.vol+m.vol, comm:a.comm+m.comm,
    }),{days:0,xp:0,appts:0,shows:0,listed:0,offers:0,pending:0,closed:0,vol:0,comm:0})
    setAnnual({byMonth,tot}); setAnnLoad(false)
  }

  async function saveName() {
    if(!name.trim()) return
    setSaving(true)
    await supabase.from('profiles').update({full_name:name.trim()}).eq('id',user.id)
    await refreshProfile()
    setSaveMsg('Saved ✓'); setTimeout(()=>setSaveMsg(''),3000); setSaving(false)
  }

  async function savePassword() {
    if(pw.length<6){setPwMsg('Min 6 characters'); return}
    setPwSaving(true)
    const {error} = await supabase.auth.updateUser({password:pw})
    setPwMsg(error?`Error: ${error.message}`:'Password updated ✓')
    setTimeout(()=>setPwMsg(''),4000); setPw(''); setPwSaving(false)
  }

  async function deleteAccount() {
    if(delText!=='DELETE') return
    setDelLoading(true)
    await supabase.from('habit_completions').delete().eq('user_id',user.id)
    await supabase.from('listings').delete().eq('user_id',user.id)
    await supabase.from('transactions').delete().eq('user_id',user.id)
    await supabase.from('team_members').delete().eq('user_id',user.id)
    await supabase.from('profiles').delete().eq('id',user.id)
    await supabase.auth.signOut()
  }

  const curMonth = new Date().toISOString().slice(0,7)
  const tabs = [{id:'profile',l:'Profile'},{id:'annual',l:'Annual Summary'},{id:'settings',l:'Settings'}]

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
            <span style={{ fontSize:12, color:'var(--nav-sub)', fontStyle:'italic' }}>Profile</span>
          </>}
        />

        <div className="page-inner" style={{ maxWidth:880 }}>

          {/* Rank banner */}
          <div className="card" style={{ padding:24, marginBottom:20, borderTop:`3px solid ${rank.color}`, display:'flex', gap:20, alignItems:'center', flexWrap:'wrap' }}>
            <div style={{ width:58, height:58, borderRadius:14, background:`${rank.color}15`, border:`1.5px solid ${rank.color}33`,
              display:'flex', alignItems:'center', justifyContent:'center', fontSize:28, flexShrink:0 }}>
              {rank.icon}
            </div>
            <div style={{ flex:1, minWidth:180 }}>
              <div className="serif" style={{ fontSize:28, color:'var(--text)', lineHeight:1, marginBottom:3 }}>{profile?.full_name||'Agent'}</div>
              <div style={{ fontSize:12, color:'var(--muted)', marginBottom:10 }}>{user?.email}</div>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <span style={{ fontSize:12, fontWeight:600, color:rank.color }}>{rank.icon} {rank.name}</span>
                <div style={{ flex:1, maxWidth:200, height:5, background:'var(--bg3)', borderRadius:3 }}>
                  <div style={{ height:'100%', background:rank.color, borderRadius:3, width:`${rankPct}%`, transition:'width .6s' }}/>
                </div>
                <span className="mono" style={{ fontSize:11, color:'var(--muted)' }}>{(profile?.xp||0).toLocaleString()} XP</span>
              </div>
              {nextRank && <div style={{ fontSize:11, color:'var(--dim)', marginTop:4 }}>
                {(nextRank.min-(profile?.xp||0)).toLocaleString()} XP to {nextRank.name}
              </div>}
            </div>
            <div style={{ display:'flex', gap:10 }}>
              {[{l:'Total XP',v:(profile?.xp||0).toLocaleString(),c:rank.color},{l:'Streak',v:`🔥 ${profile?.streak||0}`,c:'#f97316'}].map((s,i)=>(
                <div key={i} className="card-inset" style={{ padding:'10px 16px', textAlign:'center', minWidth:80 }}>
                  <div className="label" style={{ marginBottom:4 }}>{s.l}</div>
                  <div className="serif" style={{ fontSize:22, color:s.c, fontWeight:700 }}>{s.v}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Tabs */}
          <div className="tabs">
            {tabs.map(t=>(
              <button key={t.id} className={`tab-item${activeTab===t.id?' on':''}`} onClick={()=>setActiveTab(t.id)}>{t.l}</button>
            ))}
          </div>

          {/* ── Profile tab ── */}
          {activeTab==='profile' && (
            <div style={{ display:'flex', flexDirection:'column', gap:16, animation:'fadeUp .25s ease' }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                <div className="card" style={{ padding:22 }}>
                  <div className="serif" style={{ fontSize:18, color:'var(--text)', marginBottom:14 }}>Display Name</div>
                  <div className="label" style={{ marginBottom:6 }}>Name</div>
                  <input className="field-input" value={name} onChange={e=>setName(e.target.value)} placeholder="Full name" style={{ marginBottom:12 }}/>
                  {saveMsg && <div style={{ fontSize:12, color:'var(--green)', marginBottom:8 }}>{saveMsg}</div>}
                  <button className="btn-primary" onClick={saveName} disabled={saving||!name.trim()} style={{ width:'100%' }}>
                    {saving?'Saving…':'Save Name'}
                  </button>
                </div>
                <div className="card" style={{ padding:22 }}>
                  <div className="serif" style={{ fontSize:18, color:'var(--text)', marginBottom:14 }}>Change Password</div>
                  <div className="label" style={{ marginBottom:6 }}>New Password</div>
                  <input className="field-input" type="password" value={pw} onChange={e=>setPw(e.target.value)} placeholder="Min 6 chars" style={{ marginBottom:12 }}/>
                  {pwMsg && <div style={{ fontSize:12, color:pwMsg.includes('Error')?'var(--red)':'var(--green)', marginBottom:8 }}>{pwMsg}</div>}
                  <button className="btn-primary" onClick={savePassword} disabled={pwSaving||pw.length<6} style={{ width:'100%' }}>
                    {pwSaving?'Updating…':'Update Password'}
                  </button>
                </div>
              </div>

              {/* Team */}
              {profile?.teams ? (
                <div className="card" style={{ padding:22 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, flexWrap:'wrap', gap:10 }}>
                    <div className="serif" style={{ fontSize:18, color:'var(--text)' }}>{profile.teams.name}</div>
                    <div className="card-inset" style={{ padding:'8px 18px', textAlign:'center' }}>
                      <div className="label" style={{ marginBottom:3 }}>Invite Code</div>
                      <div className="mono" style={{ fontSize:20, fontWeight:700, color:'var(--gold)', letterSpacing:5 }}>{profile.teams.invite_code}</div>
                    </div>
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
                    {members.map((m,i)=>{
                      const r=getRank(m.xp||0); const isMe=m.id===user.id
                      return (
                        <div key={m.id} className={`member-row${isMe?' me':''}`}>
                          <div className="mono" style={{ width:24, fontSize:11, color:'var(--dim)', textAlign:'center' }}>{i+1}</div>
                          <div style={{ width:30, height:30, borderRadius:'50%', background:`${r.color}15`, border:`1px solid ${r.color}30`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, flexShrink:0 }}>{r.icon}</div>
                          <div style={{ flex:1 }}>
                            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                              <span style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{m.full_name||'Agent'}</span>
                              {isMe && <span style={{ fontSize:9, padding:'1px 6px', borderRadius:4, background:'rgba(5,150,105,.1)', color:'var(--green)', border:'1px solid rgba(5,150,105,.2)', fontWeight:700 }}>YOU</span>}
                            </div>
                            <div style={{ fontSize:11, color:'var(--muted)' }}>{r.name}</div>
                          </div>
                          <div style={{ textAlign:'right' }}>
                            <div className="serif" style={{ fontSize:20, color:r.color, fontWeight:700 }}>{(m.xp||0).toLocaleString()}</div>
                            <div style={{ fontSize:11, color:'#f97316' }}>🔥 {m.streak||0}</div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <div className="card" style={{ padding:22, textAlign:'center', color:'var(--muted)', fontSize:13 }}>
                  Not on a team. Go to <strong>Teams</strong> to create or join one.
                </div>
              )}

              {/* Danger zone */}
              <div className="card" style={{ padding:22, borderTop:'3px solid var(--red)' }}>
                <div className="serif" style={{ fontSize:18, color:'var(--red)', marginBottom:4 }}>Danger Zone</div>
                <div style={{ fontSize:13, color:'var(--muted)', marginBottom:14 }}>
                  Permanently delete your account and all data. Cannot be undone.
                </div>
                {!showDel ? (
                  <button onClick={()=>setShowDel(true)} style={{
                    background:'rgba(220,38,38,.06)', border:'1px solid rgba(220,38,38,.25)',
                    color:'var(--red)', borderRadius:8, padding:'9px 18px', cursor:'pointer', fontSize:13, fontWeight:600
                  }}>Delete Account</button>
                ) : (
                  <div style={{ background:'rgba(220,38,38,.04)', border:'1px solid rgba(220,38,38,.15)', borderRadius:10, padding:18 }}>
                    <div style={{ fontSize:13, color:'var(--text2)', marginBottom:14, lineHeight:1.7 }}>
                      This will permanently erase all habits, listings, transactions and profile data.
                    </div>
                    <div className="label" style={{ marginBottom:6 }}>Type DELETE to confirm</div>
                    <input className="field-input" value={delText} onChange={e=>setDelText(e.target.value)} placeholder="DELETE"
                      style={{ marginBottom:14, maxWidth:200, fontWeight:700, letterSpacing:3, color:'var(--red)' }}/>
                    <div style={{ display:'flex', gap:8 }}>
                      <button className="btn-outline" onClick={()=>{setShowDel(false);setDelText('')}}>Cancel</button>
                      <button onClick={deleteAccount} disabled={delLoading||delText!=='DELETE'}
                        style={{ background:delText==='DELETE'?'var(--red)':'rgba(220,38,38,.15)', border:'none',
                          color:delText==='DELETE'?'#fff':'rgba(220,38,38,.4)', borderRadius:8, padding:'9px 20px',
                          cursor:delText==='DELETE'?'pointer':'not-allowed', fontWeight:600, fontSize:13 }}>
                        {delLoading?'Deleting…':'Yes, Delete Everything'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Annual tab ── */}
          {activeTab==='annual' && (
            <div style={{ animation:'fadeUp .25s ease' }}>
              <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20, flexWrap:'wrap' }}>
                <div className="serif" style={{ fontSize:18, color:'var(--text)' }}>Annual Summary</div>
                <div style={{ display:'flex', gap:6 }}>
                  {[CUR_YEAR,CUR_YEAR-1,CUR_YEAR-2].map(y=>(
                    <button key={y} onClick={()=>setYear(y)} style={{
                      padding:'5px 14px', borderRadius:7, border:'1.5px solid', cursor:'pointer', fontSize:12, fontWeight:600, transition:'all .15s',
                      background:year===y?'var(--text)':'transparent',
                      borderColor:year===y?'var(--text)':'var(--b3)',
                      color:year===y?'var(--bg)':'var(--text2)',
                    }}>{y}</button>
                  ))}
                </div>
              </div>

              {annLoad ? <Loader/> : annual && (
                <>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(100px,1fr))', gap:8, marginBottom:20 }}>
                    {[
                      {l:'Habit Days',v:annual.tot.days,          c:'var(--green)'},
                      {l:'Total XP',  v:annual.tot.xp.toLocaleString(),c:rank.color},
                      {l:'Appts',     v:annual.tot.appts,         c:'var(--green)'},
                      {l:'Showings',  v:annual.tot.shows,         c:'#0ea5e9'},
                      {l:'Listed',    v:annual.tot.listed,        c:'#10b981'},
                      {l:'Offers',    v:annual.tot.offers,        c:'#0ea5e9'},
                      {l:'Pending',   v:annual.tot.pending,       c:'var(--gold2)'},
                      {l:'Closed',    v:annual.tot.closed,        c:'var(--green)'},
                      ...(annual.tot.vol>0  ?[{l:'Volume',    v:fmtMoney(annual.tot.vol),  c:'var(--green)'}]:[]),
                      ...(annual.tot.comm>0 ?[{l:'Commission',v:fmtMoney(annual.tot.comm), c:'var(--green)'}]:[]),
                    ].map((s,i)=>(
                      <div key={i} className="card-inset" style={{ padding:'10px 12px', textAlign:'center' }}>
                        <div className="label" style={{ marginBottom:4 }}>{s.l}</div>
                        <div className="serif" style={{ fontSize:20, color:s.c, fontWeight:700 }}>{s.v}</div>
                      </div>
                    ))}
                  </div>

                  <div className="card" style={{ overflowX:'auto' }}>
                    <table style={{ width:'100%', borderCollapse:'collapse', minWidth:640, fontSize:13 }}>
                      <thead>
                        <tr style={{ borderBottom:'1.5px solid var(--b1)' }}>
                          {['','Days','Appts','Shows','Listed','Offers','Pending','Closed','Volume','Comm'].map((h,i)=>(
                            <th key={i} style={{ padding:'10px', textAlign:i===0?'left':'center' }}>
                              <span className="label">{h}</span>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {annual.byMonth.map((m,i)=>{
                          const isCur = m.mk===curMonth
                          const hasData = m.days>0||m.closed>0
                          return (
                            <tr key={m.mk} style={{ borderBottom:'1px solid var(--b1)', opacity:hasData?1:.4,
                              background:isCur?'var(--gold3)':'transparent' }}>
                              <td style={{ padding:'8px 10px', fontWeight:isCur?700:500,
                                color:isCur?'var(--gold)':'var(--text)', fontSize:13 }}>
                                {m.m}
                                {isCur && <span style={{ fontSize:9, marginLeft:6, padding:'1px 5px', borderRadius:3,
                                  background:'var(--gold4)', color:'var(--gold)', fontWeight:700 }}>NOW</span>}
                              </td>
                              {[m.days,m.appts,m.shows,m.listed,m.offers,m.pending,m.closed].map((v,j)=>(
                                <td key={j} style={{ padding:'8px 10px', textAlign:'center', fontFamily:"'JetBrains Mono',monospace", fontSize:12,
                                  color:v>0?['var(--green)','var(--green)','#0ea5e9','#10b981','#0ea5e9','var(--gold2)','var(--green)'][j]:'var(--dim)',
                                  fontWeight:v>0?700:400 }}>
                                  {v||'—'}
                                </td>
                              ))}
                              <td style={{ padding:'8px 10px', textAlign:'center', fontFamily:"'JetBrains Mono',monospace", fontSize:11, color:m.vol>0?'var(--green)':'var(--dim)' }}>{m.vol>0?fmtMoney(m.vol):'—'}</td>
                              <td style={{ padding:'8px 10px', textAlign:'center', fontFamily:"'JetBrains Mono',monospace", fontSize:11, color:m.comm>0?'var(--green)':'var(--dim)' }}>{m.comm>0?fmtMoney(m.comm):'—'}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                      <tfoot>
                        <tr style={{ borderTop:'2px solid var(--b2)' }}>
                          <td style={{ padding:'8px 10px', fontFamily:"'JetBrains Mono',monospace", fontSize:11, fontWeight:700, color:'var(--gold)' }}>{year}</td>
                          {[annual.tot.days,annual.tot.appts,annual.tot.shows,annual.tot.listed,annual.tot.offers,annual.tot.pending,annual.tot.closed].map((v,i)=>(
                            <td key={i} style={{ padding:'8px 10px', textAlign:'center', fontFamily:"'JetBrains Mono',monospace", fontSize:12, fontWeight:700,
                              color:['var(--green)','var(--green)','#0ea5e9','#10b981','#0ea5e9','var(--gold2)','var(--green)'][i] }}>{v}</td>
                          ))}
                          <td style={{ padding:'8px 10px', textAlign:'center', fontFamily:"'JetBrains Mono',monospace", fontSize:11, fontWeight:700, color:'var(--green)' }}>{annual.tot.vol>0?fmtMoney(annual.tot.vol):'—'}</td>
                          <td style={{ padding:'8px 10px', textAlign:'center', fontFamily:"'JetBrains Mono',monospace", fontSize:11, fontWeight:700, color:'var(--green)' }}>{annual.tot.comm>0?fmtMoney(annual.tot.comm):'—'}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── Settings tab ── */}
          {activeTab==='settings' && (
            <div style={{ display:'flex', flexDirection:'column', gap:14, animation:'fadeUp .25s ease' }}>

              {/* Theme */}
              <div className="card" style={{ padding:24 }}>
                <div className="serif" style={{ fontSize:18, color:'var(--text)', marginBottom:4 }}>Appearance</div>
                <div style={{ fontSize:13, color:'var(--muted)', marginBottom:20 }}>Choose how RealtyGrind looks for you.</div>
                <div style={{ display:'flex', gap:12 }}>
                  {['light','dark'].map(t => (
                    <button key={t} onClick={()=>{ if(theme!==t) onToggleTheme() }} style={{
                      flex:1, padding:'18px 16px', borderRadius:10, cursor:'pointer', transition:'all .15s',
                      border:`2px solid ${theme===t?'var(--gold)':'var(--b2)'}`,
                      background: theme===t ? 'var(--gold3)' : 'var(--surface2)',
                      display:'flex', flexDirection:'column', alignItems:'center', gap:8,
                    }}>
                      <span style={{ fontSize:28 }}>{t==='light'?'☀️':'🌙'}</span>
                      <span style={{ fontSize:13, fontWeight:600, color:theme===t?'var(--gold)':'var(--text2)',
                        textTransform:'capitalize' }}>{t} Mode</span>
                      {theme===t && <span style={{ fontSize:9, padding:'2px 7px', borderRadius:4, background:'var(--gold4)',
                        color:'var(--gold)', fontWeight:700, letterSpacing:.8 }}>ACTIVE</span>}
                    </button>
                  ))}
                </div>
                <div style={{ marginTop:16, display:'flex', alignItems:'center', justifyContent:'space-between',
                  padding:'12px 16px', borderRadius:9, background:'var(--bg2)', border:'1px solid var(--b1)' }}>
                  <div>
                    <div style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>Quick Toggle</div>
                    <div style={{ fontSize:11, color:'var(--muted)' }}>Also available in the top nav bar</div>
                  </div>
                  <ThemeToggle theme={theme} onToggle={onToggleTheme}/>
                </div>
              </div>

              {/* Account info */}
              <div className="card" style={{ padding:24 }}>
                <div className="serif" style={{ fontSize:18, color:'var(--text)', marginBottom:14 }}>Account</div>
                <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                  {[
                    {l:'Email', v:user?.email},
                    {l:'Member since', v:user?.created_at?new Date(user.created_at).toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'}):'—'},
                    {l:'Rank', v:`${rank.icon} ${rank.name}`},
                    {l:'Total XP', v:(profile?.xp||0).toLocaleString()},
                  ].map((row,i)=>(
                    <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
                      padding:'10px 14px', borderRadius:8, background:'var(--bg2)', border:'1px solid var(--b1)' }}>
                      <span className="label">{row.l}</span>
                      <span style={{ fontSize:13, fontWeight:500, color:'var(--text)', fontFamily:"'JetBrains Mono',monospace" }}>{row.v}</span>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          )}

          <div style={{ height:32 }}/>
          <div style={{ textAlign:'center', fontSize:10, color:'var(--dim)', fontFamily:"'JetBrains Mono',monospace", letterSpacing:2, paddingBottom:24 }}>
            REALTYGRIND — YOUR CAREER, YOUR DATA
          </div>
        </div>
      </div>
    </>
  )
}
