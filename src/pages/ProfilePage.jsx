import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

const RANKS = [
  { name: 'Rookie Agent',  min: 0,    max: 500,      color: '#94a3b8', bg: '#f1f5f9', icon: '🏅' },
  { name: 'Associate',     min: 500,  max: 1500,     color: '#16a34a', bg: '#dcfce7', icon: '🥈' },
  { name: 'Senior Agent',  min: 1500, max: 3000,     color: '#ca8a04', bg: '#fef9c3', icon: '🥇' },
  { name: 'Top Producer',  min: 3000, max: 6000,     color: '#ea580c', bg: '#ffedd5', icon: '🏆' },
  { name: 'Elite Broker',  min: 6000, max: Infinity, color: '#7c3aed', bg: '#ede9fe', icon: '💎' },
]
function getRank(xp) { return [...RANKS].reverse().find(r => xp >= r.min) || RANKS[0] }

function fmtVal(v) {
  const n = parseFloat(String(v||'').replace(/[^0-9.]/g,''))
  if (isNaN(n)||n===0) return null
  return n>=1000000?'$'+(n/1000000).toFixed(2)+'M':n>=1000?'$'+(n/1000).toFixed(0)+'K':'$'+n.toFixed(0)
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const CURRENT_YEAR = new Date().getFullYear()

export default function ProfilePage({ onBack }) {
  const { user, profile, refreshProfile } = useAuth()
  const rank = getRank(profile?.xp || 0)
  const nextRank = RANKS[RANKS.indexOf(rank)+1]

  // Edit state
  const [fullName, setFullName]     = useState(profile?.full_name || '')
  const [saving, setSaving]         = useState(false)
  const [saveMsg, setSaveMsg]       = useState('')

  // Password change
  const [newPassword, setNewPassword] = useState('')
  const [pwSaving, setPwSaving]       = useState(false)
  const [pwMsg, setPwMsg]             = useState('')

  // Team data
  const [members, setMembers]   = useState([])
  const [isOwner, setIsOwner]   = useState(false)

  // Annual data
  const [annualData, setAnnualData]   = useState(null)
  const [annualLoading, setAnnualLoading] = useState(true)
  const [selectedYear, setSelectedYear]   = useState(CURRENT_YEAR)

  // Delete
  const [showDelete, setShowDelete]     = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [deleteLoading, setDeleteLoading] = useState(false)

  useEffect(() => {
    if (profile?.team_id) fetchTeam(profile.team_id)
    fetchAnnualData(selectedYear)
  }, [profile, selectedYear])

  async function fetchTeam(teamId) {
    const { data: mems } = await supabase
      .from('profiles').select('id,full_name,email,xp,streak')
      .eq('team_id', teamId).order('xp', { ascending: false })
    setMembers(mems || [])
    const { data: team } = await supabase.from('teams').select('created_by').eq('id', teamId).single()
    if (team) setIsOwner(team.created_by === user.id)
  }

  async function fetchAnnualData(year) {
    setAnnualLoading(true)
    const yearStr = String(year)

    // All 12 months
    const monthKeys = Array.from({length:12},(_,i)=>`${year}-${String(i+1).padStart(2,'0')}`)

    const [habitsRes, txRes, listRes] = await Promise.all([
      supabase.from('habit_completions').select('month_year,habit_id,counter_value,xp_earned')
        .eq('user_id', user.id).like('month_year', `${yearStr}-%`),
      supabase.from('transactions').select('month_year,type,price,commission')
        .eq('user_id', user.id).like('month_year', `${yearStr}-%`),
      supabase.from('listings').select('month_year,unit_count')
        .eq('user_id', user.id).like('month_year', `${yearStr}-%`),
    ])

    const habits   = habitsRes.data  || []
    const txs      = txRes.data      || []
    const listings = listRes.data    || []

    // Build per-month breakdown
    const byMonth = monthKeys.map((mk, i) => {
      const mHabits   = habits.filter(h => h.month_year === mk)
      const mTxs      = txs.filter(t => t.month_year === mk)
      const mListings = listings.filter(l => l.month_year === mk)

      const habitDays    = mHabits.length
      const totalXp      = mHabits.reduce((a,h)=>a+(h.xp_earned||0),0)
      const appointments = mHabits.filter(h=>h.habit_id==='appointments').reduce((a,h)=>a+(h.counter_value||1),0)
      const showings     = mHabits.filter(h=>h.habit_id==='showing').reduce((a,h)=>a+(h.counter_value||1),0)
      const closedTxs    = mTxs.filter(t=>t.type==='closed')
      const closedCount  = closedTxs.length
      const closedVolume = closedTxs.reduce((a,t)=>{ const n=parseFloat(String(t.price||'').replace(/[^0-9.]/g,'')); return a+(isNaN(n)?0:n) },0)
      const commission   = closedTxs.reduce((a,t)=>{ const n=parseFloat(String(t.commission||'').replace(/[^0-9.]/g,'')); return a+(isNaN(n)?0:n) },0)
      const offersMade   = mTxs.filter(t=>t.type==='offer_made').length
      const pending      = mTxs.filter(t=>t.type==='pending').length
      const listed       = mListings.reduce((a,l)=>a+(l.unit_count||0),0)

      return { month: MONTHS[i], mk, habitDays, totalXp, appointments, showings, closedCount, closedVolume, commission, offersMade, pending, listed }
    })

    // Annual totals
    const totals = byMonth.reduce((acc, m) => ({
      habitDays:    acc.habitDays    + m.habitDays,
      totalXp:      acc.totalXp      + m.totalXp,
      appointments: acc.appointments + m.appointments,
      showings:     acc.showings     + m.showings,
      closedCount:  acc.closedCount  + m.closedCount,
      closedVolume: acc.closedVolume + m.closedVolume,
      commission:   acc.commission   + m.commission,
      offersMade:   acc.offersMade   + m.offersMade,
      pending:      acc.pending      + m.pending,
      listed:       acc.listed       + m.listed,
    }), { habitDays:0, totalXp:0, appointments:0, showings:0, closedCount:0, closedVolume:0, commission:0, offersMade:0, pending:0, listed:0 })

    setAnnualData({ byMonth, totals })
    setAnnualLoading(false)
  }

  async function saveName() {
    if (!fullName.trim()) return
    setSaving(true); setSaveMsg('')
    await supabase.from('profiles').update({ full_name: fullName.trim() }).eq('id', user.id)
    await refreshProfile()
    setSaveMsg('✅ Name updated!')
    setTimeout(()=>setSaveMsg(''),3000)
    setSaving(false)
  }

  async function savePassword() {
    if (newPassword.length < 6) { setPwMsg('❌ Min 6 characters'); return }
    setPwSaving(true); setPwMsg('')
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setPwMsg(error ? `❌ ${error.message}` : '✅ Password updated!')
    setTimeout(()=>setPwMsg(''),4000)
    setNewPassword('')
    setPwSaving(false)
  }

  async function deleteAccount() {
    if (deleteConfirm !== 'DELETE') return
    setDeleteLoading(true)
    try {
      await supabase.from('habit_completions').delete().eq('user_id', user.id)
      await supabase.from('listings').delete().eq('user_id', user.id)
      await supabase.from('transactions').delete().eq('user_id', user.id)
      await supabase.from('team_members').delete().eq('user_id', user.id)
      await supabase.from('profiles').delete().eq('id', user.id)
      await supabase.auth.signOut()
    } catch(e){ console.error(e) }
    setDeleteLoading(false)
  }

  const rankProg = nextRank ? Math.round(((profile?.xp||0)-rank.min)/(nextRank.min-rank.min)*100) : 100

  return (
    <div style={{minHeight:'100vh',background:'linear-gradient(135deg,#f0f9ff,#f0fdf4,#fefce8)',fontFamily:"'DM Mono',monospace"}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Mono:wght@400;500&display=swap');*{box-sizing:border-box;margin:0;padding:0;}input:focus{outline:2px solid #86efac;outline-offset:1px;}`}</style>

      {/* Header */}
      <div style={{background:'white',borderBottom:'1px solid #e2e8f0',padding:'14px 24px',display:'flex',alignItems:'center',gap:16,boxShadow:'0 1px 8px rgba(0,0,0,0.06)'}}>
        <button onClick={onBack} style={{background:'#f1f5f9',border:'1px solid #e2e8f0',borderRadius:8,padding:'6px 16px',cursor:'pointer',fontSize:12,color:'#64748b',fontFamily:"'Syne',sans-serif",fontWeight:700}}>← Back</button>
        <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:20,color:'#1e293b'}}>👤 My Profile</div>
      </div>

      <div style={{maxWidth:860,margin:'0 auto',padding:'24px 16px',display:'flex',flexDirection:'column',gap:16}}>

        {/* ── Rank Card ── */}
        <div style={{background:`linear-gradient(135deg,${rank.color}22,${rank.color}08)`,border:`2px solid ${rank.color}44`,borderRadius:20,padding:'24px 28px',display:'flex',gap:20,alignItems:'center',flexWrap:'wrap',boxShadow:'0 4px 20px rgba(0,0,0,0.07)'}}>
          <div style={{fontSize:56}}>{rank.icon}</div>
          <div style={{flex:1,minWidth:220}}>
            <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:22,color:'#1e293b'}}>{profile?.full_name||'Agent'}</div>
            <div style={{fontSize:12,color:'#64748b',marginBottom:10}}>{user?.email}</div>
            <div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:14,color:rank.color,marginBottom:6}}>{rank.icon} {rank.name}</div>
            <div style={{height:8,background:'#e2e8f0',borderRadius:4,marginBottom:4,maxWidth:300}}>
              <div style={{height:'100%',background:rank.color,borderRadius:4,width:`${rankProg}%`,transition:'width 0.5s'}} />
            </div>
            <div style={{fontSize:10,color:'#94a3b8'}}>{(profile?.xp||0).toLocaleString()} XP{nextRank?` → ${nextRank.min.toLocaleString()} for ${nextRank.icon} ${nextRank.name}`:' — MAX RANK!'}</div>
          </div>
          <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
            <div style={{background:'white',borderRadius:14,padding:'12px 18px',textAlign:'center',border:'1px solid #e2e8f0',minWidth:80}}>
              <div style={{fontSize:10,color:'#94a3b8',letterSpacing:1}}>TOTAL XP</div>
              <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:22,color:rank.color}}>{(profile?.xp||0).toLocaleString()}</div>
            </div>
            <div style={{background:'white',borderRadius:14,padding:'12px 18px',textAlign:'center',border:'1px solid #e2e8f0',minWidth:80}}>
              <div style={{fontSize:10,color:'#94a3b8',letterSpacing:1}}>STREAK</div>
              <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:22,color:'#ea580c'}}>🔥 {profile?.streak||0}</div>
            </div>
          </div>
        </div>

        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>

          {/* ── Edit Name ── */}
          <div style={{background:'white',border:'1px solid #e2e8f0',borderRadius:16,padding:22,boxShadow:'0 1px 6px rgba(0,0,0,0.05)'}}>
            <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:15,color:'#1e293b',marginBottom:16}}>✏️ Edit Name</div>
            <div style={{marginBottom:12}}>
              <label style={{fontSize:11,color:'#64748b',fontWeight:600,letterSpacing:0.5,display:'block',marginBottom:6}}>DISPLAY NAME</label>
              <input value={fullName} onChange={e=>setFullName(e.target.value)}
                style={{width:'100%',border:'1.5px solid #e2e8f0',borderRadius:10,padding:'10px 14px',fontSize:13,fontFamily:"'DM Mono',monospace",color:'#1e293b'}} />
            </div>
            {saveMsg && <div style={{fontSize:11,color:'#16a34a',marginBottom:8,fontWeight:700}}>{saveMsg}</div>}
            <button onClick={saveName} disabled={saving||!fullName.trim()} style={{background:'#16a34a',color:'white',border:'none',borderRadius:10,padding:'10px 20px',cursor:'pointer',fontSize:12,fontFamily:"'Syne',sans-serif",fontWeight:700,width:'100%'}}>
              {saving?'Saving...':'Save Name'}
            </button>
          </div>

          {/* ── Change Password ── */}
          <div style={{background:'white',border:'1px solid #e2e8f0',borderRadius:16,padding:22,boxShadow:'0 1px 6px rgba(0,0,0,0.05)'}}>
            <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:15,color:'#1e293b',marginBottom:16}}>🔒 Change Password</div>
            <div style={{marginBottom:12}}>
              <label style={{fontSize:11,color:'#64748b',fontWeight:600,letterSpacing:0.5,display:'block',marginBottom:6}}>NEW PASSWORD</label>
              <input type="password" value={newPassword} onChange={e=>setNewPassword(e.target.value)} placeholder="Min 6 characters"
                style={{width:'100%',border:'1.5px solid #e2e8f0',borderRadius:10,padding:'10px 14px',fontSize:13,fontFamily:"'DM Mono',monospace",color:'#1e293b'}} />
            </div>
            {pwMsg && <div style={{fontSize:11,color:pwMsg.startsWith('✅')?'#16a34a':'#dc2626',marginBottom:8,fontWeight:700}}>{pwMsg}</div>}
            <button onClick={savePassword} disabled={pwSaving||newPassword.length<6} style={{background:'#0369a1',color:'white',border:'none',borderRadius:10,padding:'10px 20px',cursor:'pointer',fontSize:12,fontFamily:"'Syne',sans-serif",fontWeight:700,width:'100%'}}>
              {pwSaving?'Updating...':'Update Password'}
            </button>
          </div>
        </div>

        {/* ── Team Section ── */}
        {profile?.teams ? (
          <div style={{background:'white',border:'1px solid #e2e8f0',borderRadius:16,padding:22,boxShadow:'0 1px 6px rgba(0,0,0,0.05)'}}>
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:16}}>
              <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:15,color:'#1e293b'}}>👥 {profile.teams.name}</div>
              {isOwner && <span style={{fontSize:9,background:'#fef9c3',color:'#ca8a04',border:'1px solid #fde047',borderRadius:5,padding:'2px 8px',fontWeight:700}}>👑 OWNER</span>}
              <div style={{marginLeft:'auto',background:'#f0fdf4',border:'2px dashed #86efac',borderRadius:10,padding:'6px 14px',textAlign:'center'}}>
                <div style={{fontSize:9,color:'#94a3b8',letterSpacing:1}}>INVITE CODE</div>
                <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:18,color:'#16a34a',letterSpacing:4}}>{profile.teams.invite_code}</div>
              </div>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              {members.map((m,i)=>{
                const r=getRank(m.xp||0)
                const isMe=m.id===user.id
                return (
                  <div key={m.id} style={{display:'flex',alignItems:'center',gap:12,background:isMe?'#f0fdf4':'#f8fafc',border:`1px solid ${isMe?'#86efac':'#e2e8f0'}`,borderRadius:12,padding:'10px 16px'}}>
                    <div style={{width:32,height:32,borderRadius:'50%',background:r.color+'22',border:`2px solid ${r.color}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,flexShrink:0}}>{r.icon}</div>
                    <div style={{flex:1}}>
                      <div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:13,color:'#1e293b',display:'flex',alignItems:'center',gap:6}}>
                        {m.full_name||m.email}
                        {isMe&&<span style={{fontSize:9,background:'#dcfce7',color:'#16a34a',borderRadius:4,padding:'1px 6px'}}>YOU</span>}
                      </div>
                      <div style={{fontSize:10,color:'#94a3b8'}}>{r.icon} {r.name}</div>
                    </div>
                    <div style={{textAlign:'right'}}>
                      <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:15,color:r.color}}>{(m.xp||0).toLocaleString()} XP</div>
                      <div style={{fontSize:10,color:'#ea580c'}}>🔥 {m.streak||0}d</div>
                    </div>
                    <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:16,color:'#cbd5e1',width:24,textAlign:'center'}}>#{i+1}</div>
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          <div style={{background:'white',border:'1px solid #e2e8f0',borderRadius:16,padding:22,textAlign:'center',color:'#94a3b8',fontSize:12,boxShadow:'0 1px 6px rgba(0,0,0,0.05)'}}>
            👥 You're not on a team yet. Go to <strong>Teams</strong> to create or join one.
          </div>
        )}

        {/* ── Annual Summary ── */}
        <div style={{background:'white',border:'1px solid #e2e8f0',borderRadius:16,padding:22,boxShadow:'0 1px 6px rgba(0,0,0,0.05)'}}>
          <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:16,flexWrap:'wrap'}}>
            <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:15,color:'#1e293b'}}>📆 Annual Summary</div>
            <div style={{display:'flex',gap:6}}>
              {[CURRENT_YEAR, CURRENT_YEAR-1, CURRENT_YEAR-2].map(y=>(
                <button key={y} onClick={()=>setSelectedYear(y)} style={{background:selectedYear===y?'#1e293b':'#f1f5f9',color:selectedYear===y?'white':'#64748b',border:'1px solid #e2e8f0',borderRadius:8,padding:'5px 12px',cursor:'pointer',fontSize:11,fontFamily:"'Syne',sans-serif",fontWeight:700}}>{y}</button>
              ))}
            </div>
          </div>

          {annualLoading ? (
            <div style={{textAlign:'center',padding:30,color:'#94a3b8',fontSize:12}}>Loading {selectedYear} data...</div>
          ) : annualData && (
            <>
              {/* Annual totals row */}
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(120px,1fr))',gap:10,marginBottom:20}}>
                {[
                  {label:'Habit Days',     val:annualData.totals.habitDays,                         color:'#16a34a', bg:'#f0fdf4', border:'#86efac',      icon:'✅'},
                  {label:'Total XP',       val:annualData.totals.totalXp.toLocaleString(),           color:'#7c3aed', bg:'#ede9fe', border:'#c4b5fd',      icon:'🏆'},
                  {label:'Appointments',   val:annualData.totals.appointments,                       color:'#15803d', bg:'#dcfce7', border:'#86efac',      icon:'📅'},
                  {label:'Showings',       val:annualData.totals.showings,                           color:'#0369a1', bg:'#e0f2fe', border:'#7dd3fc',      icon:'🔑'},
                  {label:'Listed',         val:annualData.totals.listed,                             color:'#0f766e', bg:'#f0fdfa', border:'#5eead4',      icon:'🏡'},
                  {label:'Offers Made',    val:annualData.totals.offersMade,                         color:'#0369a1', bg:'#e0f2fe', border:'#7dd3fc',      icon:'📤'},
                  {label:'Went Pending',   val:annualData.totals.pending,                            color:'#ca8a04', bg:'#fef9c3', border:'#fde047',      icon:'⏳'},
                  {label:'Closed Deals',   val:annualData.totals.closedCount,                        color:'#15803d', bg:'#dcfce7', border:'#86efac',      icon:'🎉'},
                  ...(annualData.totals.closedVolume>0?[{label:'Closed Volume', val:fmtVal(annualData.totals.closedVolume)||'$0', color:'#15803d', bg:'#f0fdf4', border:'#86efac', icon:'💵'}]:[]),
                  ...(annualData.totals.commission>0?[{label:'Commission',      val:fmtVal(annualData.totals.commission)||'$0',  color:'#16a34a', bg:'#dcfce7', border:'#86efac', icon:'💰'}]:[]),
                ].map((s,i)=>(
                  <div key={i} style={{background:s.bg,border:`1px solid ${s.border}`,borderRadius:12,padding:'10px 12px',textAlign:'center'}}>
                    <div style={{fontSize:9,color:'#64748b',marginBottom:3}}>{s.icon} {s.label}</div>
                    <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:18,color:s.color}}>{s.val}</div>
                  </div>
                ))}
              </div>

              {/* Monthly breakdown table */}
              <div style={{overflowX:'auto'}}>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:11,minWidth:700}}>
                  <thead>
                    <tr style={{background:'#f8fafc',borderBottom:'2px solid #e2e8f0'}}>
                      {['Month','Habit Days','Appts','Showings','Listed','Offers','Pending','Closed','Volume','Commission'].map(h=>(
                        <th key={h} style={{padding:'8px 10px',textAlign:h==='Month'?'left':'center',fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:9,color:'#64748b',letterSpacing:1,whiteSpace:'nowrap'}}>{h.toUpperCase()}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {annualData.byMonth.map((m,i)=>{
                      const hasActivity = m.habitDays>0||m.closedCount>0||m.appointments>0||m.showings>0
                      const isCurrent = m.mk === new Date().toISOString().slice(0,7)
                      return (
                        <tr key={m.mk} style={{borderBottom:'1px solid #f1f5f9',background:isCurrent?'#f0fdf4':i%2===0?'white':'#fafcff',opacity:hasActivity?1:0.5}}>
                          <td style={{padding:'8px 10px',fontFamily:"'Syne',sans-serif",fontWeight:isCurrent?800:600,fontSize:12,color:isCurrent?'#16a34a':'#334155'}}>
                            {m.month} {isCurrent&&<span style={{fontSize:8,background:'#dcfce7',color:'#16a34a',borderRadius:3,padding:'1px 4px',marginLeft:4}}>NOW</span>}
                          </td>
                          <td style={{padding:'8px 10px',textAlign:'center',color:m.habitDays>0?'#16a34a':'#cbd5e1',fontWeight:700}}>{m.habitDays||'—'}</td>
                          <td style={{padding:'8px 10px',textAlign:'center',color:m.appointments>0?'#15803d':'#cbd5e1',fontWeight:700}}>{m.appointments||'—'}</td>
                          <td style={{padding:'8px 10px',textAlign:'center',color:m.showings>0?'#0369a1':'#cbd5e1',fontWeight:700}}>{m.showings||'—'}</td>
                          <td style={{padding:'8px 10px',textAlign:'center',color:m.listed>0?'#0f766e':'#cbd5e1',fontWeight:700}}>{m.listed||'—'}</td>
                          <td style={{padding:'8px 10px',textAlign:'center',color:m.offersMade>0?'#0369a1':'#cbd5e1',fontWeight:700}}>{m.offersMade||'—'}</td>
                          <td style={{padding:'8px 10px',textAlign:'center',color:m.pending>0?'#ca8a04':'#cbd5e1',fontWeight:700}}>{m.pending||'—'}</td>
                          <td style={{padding:'8px 10px',textAlign:'center',color:m.closedCount>0?'#15803d':'#cbd5e1',fontWeight:700}}>{m.closedCount||'—'}</td>
                          <td style={{padding:'8px 10px',textAlign:'center',color:m.closedVolume>0?'#15803d':'#cbd5e1',fontWeight:600,fontSize:10}}>{m.closedVolume>0?fmtVal(m.closedVolume):'—'}</td>
                          <td style={{padding:'8px 10px',textAlign:'center',color:m.commission>0?'#16a34a':'#cbd5e1',fontWeight:600,fontSize:10}}>{m.commission>0?fmtVal(m.commission):'—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{borderTop:'2px solid #e2e8f0',background:'#f8fafc'}}>
                      <td style={{padding:'8px 10px',fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:11,color:'#1e293b'}}>TOTAL {selectedYear}</td>
                      <td style={{padding:'8px 10px',textAlign:'center',fontFamily:"'Syne',sans-serif",fontWeight:800,color:'#16a34a'}}>{annualData.totals.habitDays}</td>
                      <td style={{padding:'8px 10px',textAlign:'center',fontFamily:"'Syne',sans-serif",fontWeight:800,color:'#15803d'}}>{annualData.totals.appointments}</td>
                      <td style={{padding:'8px 10px',textAlign:'center',fontFamily:"'Syne',sans-serif",fontWeight:800,color:'#0369a1'}}>{annualData.totals.showings}</td>
                      <td style={{padding:'8px 10px',textAlign:'center',fontFamily:"'Syne',sans-serif",fontWeight:800,color:'#0f766e'}}>{annualData.totals.listed}</td>
                      <td style={{padding:'8px 10px',textAlign:'center',fontFamily:"'Syne',sans-serif",fontWeight:800,color:'#0369a1'}}>{annualData.totals.offersMade}</td>
                      <td style={{padding:'8px 10px',textAlign:'center',fontFamily:"'Syne',sans-serif",fontWeight:800,color:'#ca8a04'}}>{annualData.totals.pending}</td>
                      <td style={{padding:'8px 10px',textAlign:'center',fontFamily:"'Syne',sans-serif",fontWeight:800,color:'#15803d'}}>{annualData.totals.closedCount}</td>
                      <td style={{padding:'8px 10px',textAlign:'center',fontFamily:"'Syne',sans-serif",fontWeight:800,color:'#15803d',fontSize:10}}>{annualData.totals.closedVolume>0?fmtVal(annualData.totals.closedVolume):'—'}</td>
                      <td style={{padding:'8px 10px',textAlign:'center',fontFamily:"'Syne',sans-serif",fontWeight:800,color:'#16a34a',fontSize:10}}>{annualData.totals.commission>0?fmtVal(annualData.totals.commission):'—'}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}
        </div>

        {/* ── Danger Zone ── */}
        <div style={{background:'white',border:'1.5px solid #fecaca',borderRadius:16,padding:22,boxShadow:'0 1px 6px rgba(0,0,0,0.05)'}}>
          <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:15,color:'#dc2626',marginBottom:4}}>⚠️ Danger Zone</div>
          <div style={{fontSize:11,color:'#94a3b8',marginBottom:14}}>Permanently delete your account and all associated data. This cannot be undone.</div>

          {!showDelete ? (
            <button onClick={()=>setShowDelete(true)} style={{background:'#fef2f2',border:'1.5px solid #fecaca',color:'#dc2626',borderRadius:10,padding:'10px 20px',cursor:'pointer',fontSize:12,fontFamily:"'Syne',sans-serif",fontWeight:700}}>
              🗑️ Delete My Account
            </button>
          ) : (
            <div style={{background:'#fef2f2',border:'1.5px solid #fecaca',borderRadius:12,padding:'18px 20px'}}>
              <div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:14,color:'#dc2626',marginBottom:8}}>This will permanently delete:</div>
              <div style={{fontSize:11,color:'#64748b',marginBottom:14,lineHeight:1.8}}>
                • All your habit completion history<br/>
                • All listings and transactions<br/>
                • Your profile and XP progress<br/>
                • Your team membership
              </div>
              <div style={{marginBottom:14}}>
                <label style={{fontSize:11,color:'#dc2626',fontWeight:700,display:'block',marginBottom:6}}>Type DELETE to confirm:</label>
                <input value={deleteConfirm} onChange={e=>setDeleteConfirm(e.target.value)} placeholder="DELETE"
                  style={{border:'1.5px solid #fecaca',borderRadius:8,padding:'8px 14px',fontSize:13,fontFamily:"'DM Mono',monospace",color:'#dc2626',fontWeight:700,width:'100%',maxWidth:200}} />
              </div>
              <div style={{display:'flex',gap:10}}>
                <button onClick={()=>{setShowDelete(false);setDeleteConfirm('')}} style={{background:'white',border:'1px solid #e2e8f0',color:'#64748b',borderRadius:9,padding:'9px 20px',cursor:'pointer',fontSize:12,fontFamily:"'Syne',sans-serif",fontWeight:700}}>Cancel</button>
                <button onClick={deleteAccount} disabled={deleteLoading||deleteConfirm!=='DELETE'} style={{background:deleteConfirm==='DELETE'?'#dc2626':'#fca5a5',color:'white',border:'none',borderRadius:9,padding:'9px 20px',cursor:deleteConfirm==='DELETE'?'pointer':'not-allowed',fontSize:12,fontFamily:"'Syne',sans-serif",fontWeight:700}}>
                  {deleteLoading?'Deleting everything...':'Yes, Delete My Account'}
                </button>
              </div>
            </div>
          )}
        </div>

        <div style={{textAlign:'center',padding:'4px 0 12px',fontSize:9,color:'#cbd5e1',letterSpacing:2}}>REALTYGRIND — YOUR CAREER, YOUR DATA</div>
      </div>
    </div>
  )
}
