import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { CSS, Loader, Wordmark, ThemeToggle, Ring, getRank, CAT, StatCard, fmtMoney } from '../design'

const HABITS_FOR_DISPLAY = [
  { id:'prospecting', label:'Prospecting', cat:'leads' },
  { id:'appointments', label:'Appointments', cat:'leads' },
  { id:'showing', label:'Showings', cat:'leads' },
  { id:'newlisting', label:'Listings', cat:'listings' },
  { id:'market', label:'Market', cat:'market' },
]

function getTodayIndices() {
  const d = new Date()
  return { week: Math.min(Math.floor((d.getDate()-1)/7),3), day: d.getDay() }
}

function relativeTime(isoStr) {
  if (!isoStr) return ''
  const diff = Math.floor((Date.now() - new Date(isoStr).getTime()) / 1000)
  if (diff < 60)    return 'just now'
  if (diff < 3600)  return `${Math.floor(diff/60)}m ago`
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`
  const d = Math.floor(diff/86400)
  return d === 1 ? '1 day ago' : `${d} days ago`
}

export default function TeamsPage({ onNavigate, theme, onToggleTheme }) {
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
  const [challengeForm, setChallengeForm] = useState(null) // null | { title, metric, bonusXp }
  const [challengeSaving, setChallengeSaving] = useState(false)
  const [teamsTab,       setTeamsTab]       = useState('roster') // 'roster' | 'admin'
  const [podForm,        setPodForm]        = useState(null)     // null | { name, memberIds, editingId }
  const [podSaving,      setPodSaving]      = useState(false)
  const [podMemberStats, setPodMemberStats] = useState({})       // { [userId]: { todayPct, monthlyPct, xp, streak } }
  const [podStatsLoaded, setPodStatsLoaded] = useState(false)
  const [adminSubTab,    setAdminSubTab]    = useState('performance') // 'performance'|'coaching'|'pods'
  const [filterAgent,    setFilterAgent]    = useState('all')         // 'all' | memberId
  const [noteForm,       setNoteForm]       = useState(null)          // null | { agentId, text, type, editingId }
  const [noteSaving,     setNoteSaving]     = useState(false)
  const [replyForms,     setReplyForms]     = useState({})            // { [noteId]: string }
  const [replySaving,    setReplySaving]    = useState(null)          // noteId being saved, or null

  const MONTH_YEAR = new Date().toISOString().slice(0,7)

  useEffect(()=>{
    if (profile?.team_id) { setMode('myteam'); fetchMembers(profile.team_id) }
  },[profile])

  async function fetchMembers(tid) {
    setLoading(true)
    const {data:mems} = await supabase.from('profiles').select('id,full_name,xp,streak,goals').eq('team_id',tid).order('xp',{ascending:false})
    setMembers(mems||[])
    const {data:team} = await supabase.from('teams').select('*').eq('id',tid).single()
    setTeamData(team)
    // Load habit stats for all members
    if (mems?.length) {
      const ids = mems.map(m=>m.id)
      const {data:habs} = await supabase.from('habit_completions').select('user_id,habit_id,counter_value,week_index,day_index')
        .in('user_id',ids).eq('month_year',MONTH_YEAR)
      const {data:txs} = await supabase.from('transactions').select('user_id,type,price,commission')
        .in('user_id',ids).eq('month_year',MONTH_YEAR)
      const todayIdx = getTodayIndices()
      const TOTAL_DAILY = 11
      const stats = {}
      ids.forEach(id=>{
        const mh = (habs||[]).filter(h=>h.user_id===id)
        const mt = (txs||[]).filter(t=>t.user_id===id)
        const habits = {}
        HABITS_FOR_DISPLAY.forEach(h=>{ habits[h.id] = mh.filter(x=>x.habit_id===h.id).reduce((a,x)=>a+(x.counter_value||1),0) })
        const closedVol  = mt.filter(t=>t.type==='closed').reduce((a,t)=>{ const n=parseFloat(String(t.price||'').replace(/[^0-9.]/g,'')); return a+(isNaN(n)?0:n) },0)
        const closedComm = mt.filter(t=>t.type==='closed').reduce((a,t)=>{ const n=parseFloat(String(t.commission||'').replace(/[^0-9.]/g,'')); return a+(isNaN(n)?0:n) },0)
        const todayRows  = mh.filter(h => h.week_index===todayIdx.week && h.day_index===todayIdx.day)
        const todayDone  = new Set(todayRows.map(h=>h.habit_id)).size
        const monthDays  = new Set(mh.map(h=>`${h.habit_id}-${h.week_index}-${h.day_index}`)).size
        const activeDays = new Set(mh.map(h=>`${h.week_index}-${h.day_index}`)).size
        const monthlyPct = activeDays > 0 ? Math.round(monthDays / (activeDays * TOTAL_DAILY) * 100) : 0
        stats[id] = {
          habits, closed:mt.filter(t=>t.type==='closed').length, closedVol, closedComm, totalHabits:mh.length,
          todayDone, todayPct: Math.round(todayDone / TOTAL_DAILY * 100), monthlyPct, activeDays,
          appts: habits.appointments||0, showings: habits.showing||0,
        }
      })
      setMemberStats(stats)
      // Fetch pod stats if user is in a pod
      const pods = team?.team_prefs?.pods || []
      const myPod_ = pods.find(p => p.memberIds?.includes(user?.id))
      if (myPod_) fetchPodStats(myPod_, mems)
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

  const CHALLENGE_METRICS = [
    { value:'prospecting',  label:'Prospecting Calls' },
    { value:'appointments', label:'Appointments Booked' },
    { value:'showing',      label:'Property Showings' },
    { value:'newlisting',   label:'Listings Taken' },
    { value:'closed',       label:'Deals Closed' },
    { value:'xp',           label:'Total XP' },
  ]

  function getMemberMetricVal(memberId, metric) {
    const s = memberStats[memberId]||{}
    if (metric === 'xp') return members.find(m=>m.id===memberId)?.xp || 0
    if (metric === 'closed') return s.closed||0
    return s.habits?.[metric]||0
  }

  async function saveChallenge() {
    if (!challengeForm?.title?.trim() || !challengeForm?.metric) return
    setChallengeSaving(true)
    const newC = {
      id: Date.now().toString(36),
      title: challengeForm.title.trim(),
      metric: challengeForm.metric,
      bonusXp: parseInt(challengeForm.bonusXp)||0,
      createdAt: new Date().toISOString(),
      status: 'active',
      winnerId: null
    }
    const existing = teamData?.team_prefs?.challenges || []
    const updated = { ...(teamData?.team_prefs||{}), challenges: [...existing, newC] }
    await supabase.from('teams').update({ team_prefs: updated }).eq('id', profile.team_id)
    setTeamData(td => ({ ...td, team_prefs: updated }))
    setChallengeForm(null)
    setChallengeSaving(false)
  }

  async function endChallenge(challengeId) {
    const challenge = (teamData?.team_prefs?.challenges||[]).find(c=>c.id===challengeId)
    if (!challenge) return
    // Find winner
    const ranked = [...members].sort((a,b) => getMemberMetricVal(b.id, challenge.metric) - getMemberMetricVal(a.id, challenge.metric))
    const winner = ranked[0]
    if (!winner) return
    // Award bonus XP
    if (challenge.bonusXp > 0) {
      const newXp = (winner.xp||0) + challenge.bonusXp
      await supabase.from('profiles').update({ xp: newXp }).eq('id', winner.id)
      setMembers(ms => ms.map(m => m.id===winner.id ? {...m, xp:newXp} : m))
    }
    // Mark ended
    const updated = {
      ...(teamData?.team_prefs||{}),
      challenges: (teamData.team_prefs?.challenges||[]).map(c =>
        c.id===challengeId ? { ...c, status:'ended', winnerId:winner.id } : c
      )
    }
    await supabase.from('teams').update({ team_prefs: updated }).eq('id', profile.team_id)
    setTeamData(td => ({ ...td, team_prefs: updated }))
  }

  // ── Accountability Pods ────────────────────────────────────────────────────
  async function fetchPodStats(pod, mems) {
    const ids = pod.memberIds.filter(id => id !== user?.id)
    if (!ids.length) { setPodStatsLoaded(true); return }
    const todayIdx = getTodayIndices()
    const { data:habs } = await supabase.from('habit_completions')
      .select('user_id,habit_id,week_index,day_index')
      .in('user_id', ids).eq('month_year', MONTH_YEAR)
    const stats = {}
    ids.forEach(id => {
      const member = mems.find(m => m.id === id)
      if (!member) return
      const mh = (habs||[]).filter(h => h.user_id === id)
      const todayRows  = mh.filter(h => h.week_index===todayIdx.week && h.day_index===todayIdx.day)
      const todayDone  = new Set(todayRows.map(h=>h.habit_id)).size
      const monthDays  = new Set(mh.map(h=>`${h.habit_id}-${h.week_index}-${h.day_index}`)).size
      const activeDays = new Set(mh.map(h=>`${h.week_index}-${h.day_index}`)).size
      stats[id] = {
        full_name:  member.full_name,
        xp:         member.xp || 0,
        streak:     member.streak || 0,
        todayPct:   Math.round(todayDone / 11 * 100),
        monthlyPct: activeDays > 0 ? Math.round(monthDays / (activeDays * 11) * 100) : 0,
      }
    })
    setPodMemberStats(stats)
    setPodStatsLoaded(true)
  }

  async function savePod() {
    if (!podForm?.name?.trim() || podForm.memberIds.length < 2 || podForm.memberIds.length > 5) return
    setPodSaving(true)
    const allPods_ = teamData?.team_prefs?.pods || []
    let updatedPods
    if (podForm.editingId) {
      updatedPods = allPods_.map(p => p.id===podForm.editingId
        ? { ...p, name:podForm.name.trim(), memberIds:podForm.memberIds } : p)
    } else {
      const occupied = allPods_.flatMap(p => p.memberIds)
      if (podForm.memberIds.some(id => occupied.includes(id))) {
        alert('One or more members are already in a pod.')
        setPodSaving(false); return
      }
      updatedPods = [...allPods_, { id:Date.now().toString(36), name:podForm.name.trim(), memberIds:podForm.memberIds }]
    }
    const updatedPrefs = { ...(teamData?.team_prefs||{}), pods: updatedPods }
    await supabase.from('teams').update({ team_prefs: updatedPrefs }).eq('id', profile.team_id)
    setTeamData(td => ({ ...td, team_prefs: updatedPrefs }))
    setPodForm(null); setPodSaving(false)
  }

  async function deletePod(podId) {
    if (!confirm('Delete this pod?')) return
    const updatedPods = (teamData?.team_prefs?.pods || []).filter(p => p.id !== podId)
    const updatedPrefs = { ...(teamData?.team_prefs||{}), pods: updatedPods }
    await supabase.from('teams').update({ team_prefs: updatedPrefs }).eq('id', profile.team_id)
    setTeamData(td => ({ ...td, team_prefs: updatedPrefs }))
  }

  // ── Coaching Notes ────────────────────────────────────────────────────────
  async function saveNote() {
    if (!noteForm?.text?.trim() || !noteForm?.agentId) return
    setNoteSaving(true)
    const existing = teamData?.team_prefs?.coaching_notes || []
    let updated
    if (noteForm.editingId) {
      updated = existing.map(n => n.id === noteForm.editingId
        ? { ...n, text: noteForm.text.trim(), type: noteForm.type } : n)
    } else {
      updated = [...existing, {
        id: Date.now().toString(36),
        agentId: noteForm.agentId,
        coachId: user.id,
        text: noteForm.text.trim(),
        type: noteForm.type || 'general',
        pinned: false,
        createdAt: new Date().toISOString(),
      }]
    }
    const updatedPrefs = { ...(teamData?.team_prefs||{}), coaching_notes: updated }
    await supabase.from('teams').update({ team_prefs: updatedPrefs }).eq('id', profile.team_id)
    setTeamData(td => ({ ...td, team_prefs: updatedPrefs }))
    setNoteForm(null)
    setNoteSaving(false)
  }

  async function deleteNote(noteId) {
    if (!confirm('Delete this note?')) return
    const updated = (teamData?.team_prefs?.coaching_notes||[]).filter(n=>n.id!==noteId)
    const updatedPrefs = { ...(teamData?.team_prefs||{}), coaching_notes: updated }
    await supabase.from('teams').update({ team_prefs: updatedPrefs }).eq('id', profile.team_id)
    setTeamData(td => ({ ...td, team_prefs: updatedPrefs }))
  }

  async function pinNote(noteId) {
    const updated = (teamData?.team_prefs?.coaching_notes||[]).map(n=>
      n.id===noteId ? { ...n, pinned: !n.pinned } : n)
    const updatedPrefs = { ...(teamData?.team_prefs||{}), coaching_notes: updated }
    await supabase.from('teams').update({ team_prefs: updatedPrefs }).eq('id', profile.team_id)
    setTeamData(td => ({ ...td, team_prefs: updatedPrefs }))
  }

  async function saveReply(noteId) {
    const text = (replyForms[noteId]||'').trim()
    if (!text) return
    setReplySaving(noteId)
    const newReply = { id: Date.now().toString(36), authorId: user.id, text, createdAt: new Date().toISOString() }
    const isOwner = teamData?.created_by === user?.id
    if (isOwner) {
      // Owner has UPDATE on teams table
      const updated = (teamData?.team_prefs?.coaching_notes||[]).map(n=>
        n.id===noteId ? { ...n, replies: [...(n.replies||[]), newReply] } : n)
      const updatedPrefs = { ...(teamData?.team_prefs||{}), coaching_notes: updated }
      await supabase.from('teams').update({ team_prefs: updatedPrefs }).eq('id', profile.team_id)
      setTeamData(td => ({ ...td, team_prefs: updatedPrefs }))
    } else {
      // Agent writes reply to their own profile row (always allowed)
      const existingReplies = profile?.goals?.coaching_replies || {}
      const noteReplies = existingReplies[noteId] || []
      const updatedCoachingReplies = { ...existingReplies, [noteId]: [...noteReplies, newReply] }
      const updatedGoals = { ...(profile?.goals||{}), coaching_replies: updatedCoachingReplies }
      await supabase.from('profiles').update({ goals: updatedGoals }).eq('id', user.id)
      // Optimistically update members list so coach can see it after next fetch
      setMembers(ms => ms.map(m => m.id===user.id ? { ...m, goals: updatedGoals } : m))
    }
    setReplyForms(f => ({ ...f, [noteId]: '' }))
    setReplySaving(null)
  }

  // ── Derived values ─────────────────────────────────────────────────────────
  const isTeamOwner      = !!(teamData?.created_by === user?.id)
  const allPods          = teamData?.team_prefs?.pods || []
  const myPod            = allPods.find(p => p.memberIds?.includes(user?.id)) || null
  const myPodMates       = myPod ? members.filter(m => myPod.memberIds.includes(m.id) && m.id !== user?.id) : []
  const allCoachingNotes = teamData?.team_prefs?.coaching_notes || []
  const myCoachingNotes  = allCoachingNotes.filter(n => n.agentId === user?.id)

  return (
    <>
      <style>{CSS}</style>
      <div className="page">

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

                  {/* My Pod section */}
                  {myPod ? (
                    <div className="card" style={{ padding:20, marginBottom:16, border:'1px solid rgba(139,92,246,.25)', background:'rgba(139,92,246,.04)' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14 }}>
                        <span style={{ fontSize:16 }}>🫂</span>
                        <span className="serif" style={{ fontSize:16, color:'var(--text)' }}>{myPod.name}</span>
                        <span style={{ fontSize:11, color:'var(--muted)' }}>{myPod.memberIds.length} members</span>
                      </div>
                      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:12 }}>
                        {(() => {
                          const me = members.find(m => m.id===user?.id)
                          if (!me) return null
                          const myRank  = getRank(me.xp||0)
                          const myStats = memberStats[me.id]||{}
                          return (
                            <div className="card" style={{ padding:14, border:'1px solid rgba(217,119,6,.3)', background:'var(--gold3)' }}>
                              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
                                <span style={{ fontSize:18 }}>{myRank.icon}</span>
                                <div style={{ flex:1 }}>
                                  <div style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{me.full_name||'Agent'}</div>
                                  <div style={{ fontSize:10, color:'var(--muted)' }}>{myRank.name} · 🔥 {me.streak||0}</div>
                                </div>
                                <span style={{ fontSize:9, padding:'2px 5px', borderRadius:4, background:'var(--gold4)', color:'var(--gold)', fontWeight:700 }}>YOU</span>
                              </div>
                              <div style={{ display:'flex', gap:10, justifyContent:'center' }}>
                                <div style={{ textAlign:'center' }}>
                                  <div style={{ fontSize:9, color:'var(--muted)', marginBottom:4 }}>TODAY</div>
                                  <Ring pct={myStats.todayPct||0} size={52} color={myRank.color}/>
                                </div>
                                <div style={{ textAlign:'center' }}>
                                  <div style={{ fontSize:9, color:'var(--muted)', marginBottom:4 }}>MONTH</div>
                                  <Ring pct={myStats.monthlyPct||0} size={52} color='#0ea5e9'/>
                                </div>
                              </div>
                            </div>
                          )
                        })()}
                        {myPodMates.map(mate=>{
                          const mateRank  = getRank(mate.xp||0)
                          const mateStats = podMemberStats[mate.id]
                          return (
                            <div key={mate.id} className="card" style={{ padding:14 }}>
                              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
                                <span style={{ fontSize:18 }}>{mateRank.icon}</span>
                                <div style={{ flex:1 }}>
                                  <div style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{mate.full_name||'Agent'}</div>
                                  <div style={{ fontSize:10, color:'var(--muted)' }}>{mateRank.name} · 🔥 {mate.streak||0}</div>
                                </div>
                              </div>
                              {podStatsLoaded && mateStats ? (
                                <div style={{ display:'flex', gap:10, justifyContent:'center', marginBottom:8 }}>
                                  <div style={{ textAlign:'center' }}>
                                    <div style={{ fontSize:9, color:'var(--muted)', marginBottom:4 }}>TODAY</div>
                                    <Ring pct={mateStats.todayPct} size={52} color={mateRank.color}/>
                                  </div>
                                  <div style={{ textAlign:'center' }}>
                                    <div style={{ fontSize:9, color:'var(--muted)', marginBottom:4 }}>MONTH</div>
                                    <Ring pct={mateStats.monthlyPct} size={52} color='#0ea5e9'/>
                                  </div>
                                </div>
                              ) : (
                                <div style={{ textAlign:'center', padding:'12px 0', marginBottom:8 }}><Loader/></div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ) : (
                    <div style={{ border:'1.5px dashed var(--b2)', borderRadius:10, padding:'18px 20px',
                      fontSize:13, color:'var(--muted)', textAlign:'center', marginBottom:16 }}>
                      {isTeamOwner
                        ? '🫂 No pods yet — create pods from the Admin tab to boost accountability.'
                        : '🫂 Not in a pod yet. Ask your team owner to add you.'}
                    </div>
                  )}

                  {/* Tab bar */}
                  <div className="tabs" style={{ marginBottom:16 }}>
                    <button className={`tab-item${teamsTab==='roster'?' on':''}`} onClick={()=>setTeamsTab('roster')}>👥 Roster</button>
                    {isTeamOwner && (
                      <button className={`tab-item${teamsTab==='admin'?' on':''}`} onClick={()=>setTeamsTab('admin')}>📊 Admin</button>
                    )}
                  </div>

                  {/* Roster tab */}
                  {teamsTab==='roster' && (
                  <>
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
                            <div style={{ display:'flex', gap:8, flexWrap:'wrap', paddingLeft:0, marginTop:8 }}>
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

                  {/* ── Team Challenges ── */}
                  {(() => {
                    const isOwner = teamData?.created_by === user?.id
                    const allChallenges = teamData?.team_prefs?.challenges || []
                    const active  = allChallenges.filter(c=>c.status==='active')
                    const ended   = allChallenges.filter(c=>c.status==='ended').slice(-3).reverse()
                    return (
                      <div style={{ marginTop:28 }}>
                        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
                          <div className="serif" style={{ fontSize:20, color:'var(--text)' }}>🏆 Team Challenges</div>
                          {isOwner && !challengeForm && (
                            <button className="btn-outline" onClick={()=>setChallengeForm({ title:'', metric:'prospecting', bonusXp:'100' })}
                              style={{ fontSize:12 }}>+ New Challenge</button>
                          )}
                        </div>

                        {/* Create form (owner only) */}
                        {isOwner && challengeForm && (
                          <div className="card" style={{ padding:20, marginBottom:16, border:'1px solid rgba(217,119,6,.3)', background:'var(--gold3)' }}>
                            <div className="serif" style={{ fontSize:15, color:'var(--text)', marginBottom:14 }}>New Challenge</div>
                            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                              <div>
                                <div className="label" style={{ marginBottom:5 }}>Challenge Title</div>
                                <input className="field-input" value={challengeForm.title}
                                  onChange={e=>setChallengeForm(f=>({...f,title:e.target.value}))}
                                  placeholder="e.g. Most Prospecting Calls This Week 📞"
                                  style={{ width:'100%' }}/>
                              </div>
                              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                                <div>
                                  <div className="label" style={{ marginBottom:5 }}>Metric</div>
                                  <select className="field-input" value={challengeForm.metric}
                                    onChange={e=>setChallengeForm(f=>({...f,metric:e.target.value}))}
                                    style={{ width:'100%' }}>
                                    {CHALLENGE_METRICS.map(m=>(
                                      <option key={m.value} value={m.value}>{m.label}</option>
                                    ))}
                                  </select>
                                </div>
                                <div>
                                  <div className="label" style={{ marginBottom:5 }}>Bonus XP for Winner</div>
                                  <input type="number" className="field-input" value={challengeForm.bonusXp}
                                    onChange={e=>setChallengeForm(f=>({...f,bonusXp:e.target.value}))}
                                    placeholder="e.g. 300" style={{ width:'100%' }}/>
                                </div>
                              </div>
                              <div style={{ display:'flex', gap:8, marginTop:4 }}>
                                <button className="btn-primary" onClick={saveChallenge} disabled={challengeSaving}
                                  style={{ fontSize:13, padding:'9px 22px' }}>
                                  {challengeSaving?'Saving…':'🚀 Launch Challenge'}
                                </button>
                                <button className="btn-outline" onClick={()=>setChallengeForm(null)}
                                  style={{ fontSize:13 }}>Cancel</button>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Active challenges */}
                        {active.length===0 && !challengeForm && (
                          <div style={{ fontSize:13, color:'var(--muted)', fontStyle:'italic', padding:'16px 0' }}>
                            {isOwner ? 'No active challenges. Create one to motivate your team!' : 'No active challenges right now.'}
                          </div>
                        )}
                        {active.map(c=>{
                          const metricLabel = CHALLENGE_METRICS.find(m=>m.value===c.metric)?.label || c.metric
                          const ranked = [...members]
                            .map(m=>({ ...m, val: getMemberMetricVal(m.id, c.metric) }))
                            .sort((a,b)=>b.val-a.val)
                          const maxVal = Math.max(...ranked.map(r=>r.val), 1)
                          return (
                            <div key={c.id} className="card" style={{ padding:20, marginBottom:12, border:'1px solid rgba(217,119,6,.2)' }}>
                              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14, gap:8 }}>
                                <div>
                                  <div style={{ fontWeight:700, fontSize:15, color:'var(--text)' }}>{c.title}</div>
                                  <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>
                                    {metricLabel} · {c.bonusXp > 0 ? `+${c.bonusXp} XP for winner` : 'Bragging rights'}
                                  </div>
                                </div>
                                {isOwner && (
                                  <button onClick={()=>{ if(confirm('End challenge and award XP to leader?')) endChallenge(c.id) }}
                                    style={{ background:'rgba(220,38,38,.08)', border:'1px solid rgba(220,38,38,.2)',
                                      color:'var(--red)', borderRadius:7, padding:'6px 12px', fontSize:11, cursor:'pointer', fontWeight:600, whiteSpace:'nowrap' }}>
                                    End & Award
                                  </button>
                                )}
                              </div>
                              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                                {ranked.map((m,i)=>(
                                  <div key={m.id}>
                                    <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, marginBottom:3 }}>
                                      <span style={{ color:i===0?'var(--gold)':'var(--text)', fontWeight:i===0?700:400 }}>
                                        {i===0?'🥇 ':i===1?'🥈 ':i===2?'🥉 ':''}{m.full_name||'Agent'}
                                        {m.id===user.id && <span style={{ marginLeft:5, fontSize:9, color:'var(--muted)' }}>(you)</span>}
                                      </span>
                                      <span style={{ fontWeight:700, color:i===0?'var(--gold)':'var(--text)' }}>{m.val}</span>
                                    </div>
                                    <div style={{ height:6, background:'var(--b1)', borderRadius:99, overflow:'hidden' }}>
                                      <div style={{ height:'100%', width:`${Math.max(Math.round(m.val/maxVal*100),m.val>0?4:0)}%`,
                                        background:i===0?'var(--gold)':i===1?'#94a3b8':'#cd7c32', borderRadius:99, transition:'width .5s' }}/>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )
                        })}

                        {/* Recently ended */}
                        {ended.length>0 && (
                          <details style={{ marginTop:8 }}>
                            <summary style={{ fontSize:12, color:'var(--muted)', cursor:'pointer', userSelect:'none' }}>
                              Past challenges ({ended.length})
                            </summary>
                            <div style={{ marginTop:8, display:'flex', flexDirection:'column', gap:8 }}>
                              {ended.map(c=>{
                                const winner = members.find(m=>m.id===c.winnerId)
                                return (
                                  <div key={c.id} style={{ padding:'10px 14px', borderRadius:9, background:'var(--bg2)',
                                    border:'1px solid var(--b1)', fontSize:12, color:'var(--muted)' }}>
                                    <span style={{ fontWeight:600, color:'var(--text)' }}>{c.title}</span>
                                    {winner && <span> — 🏆 {winner.full_name||'Agent'} won {c.bonusXp>0?`+${c.bonusXp} XP`:''}</span>}
                                  </div>
                                )
                              })}
                            </div>
                          </details>
                        )}
                      </div>
                    )
                  })()}
                  {/* ── My Coaching Notes (visible to all members) ── */}
                  {myCoachingNotes.length > 0 && (
                    <div style={{ marginTop:28 }}>
                      <div className="serif" style={{ fontSize:18, color:'var(--text)', marginBottom:12 }}>📋 My Coaching Notes</div>
                      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                        {[...myCoachingNotes]
                          .sort((a,b) => (b.pinned?1:0)-(a.pinned?1:0) || new Date(b.createdAt)-new Date(a.createdAt))
                          .map(note => {
                            const NC = { praise:'#10b981', goal:'#d97706', concern:'#f43f5e', general:'#0ea5e9' }
                            const c = NC[note.type]||NC.general
                            return (
                              <div key={note.id} className="card" style={{
                                padding:'14px 16px',
                                border: note.pinned ? '1px solid rgba(217,119,6,.45)' : '1px solid var(--b2)',
                                background: note.pinned ? 'var(--gold3)' : 'var(--surface)',
                              }}>
                                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                                  <span style={{ fontSize:10, padding:'2px 7px', borderRadius:4, fontWeight:700,
                                    background:`${c}18`, color:c, border:`1px solid ${c}33`,
                                    textTransform:'uppercase', letterSpacing:'.5px' }}>{note.type}</span>
                                  {note.pinned && <span style={{ fontSize:10, color:'var(--gold2)' }}>📌 Pinned</span>}
                                  <span style={{ marginLeft:'auto', fontSize:11, color:'var(--dim)' }}>{relativeTime(note.createdAt)}</span>
                                </div>
                                <div style={{ fontSize:13, color:'var(--text)', lineHeight:1.6, marginBottom:10 }}>{note.text}</div>

                                {/* Replies */}
                                {(()=>{
                                  const myAgentReplies = profile?.goals?.coaching_replies?.[note.id] || []
                                  const allReplies = [...(note.replies||[]), ...myAgentReplies].sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt))
                                  return allReplies.length > 0 && (
                                  <div style={{ borderLeft:'2px solid var(--b2)', paddingLeft:10, marginBottom:10, display:'flex', flexDirection:'column', gap:8 }}>
                                    {allReplies.map(r=>{
                                      const isCoach = r.authorId===teamData?.created_by
                                      const rName = isCoach ? (members.find(m=>m.id===r.authorId)?.full_name||'Coach') : 'You'
                                      return (
                                        <div key={r.id}>
                                          <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:3 }}>
                                            <span style={{ fontSize:11, fontWeight:600, color: isCoach ? 'var(--gold)' : 'var(--text)' }}>{rName}</span>
                                            {isCoach && <span style={{ fontSize:9, padding:'1px 5px', borderRadius:3, background:'var(--gold4)', color:'var(--gold)', fontWeight:700 }}>COACH</span>}
                                            <span style={{ fontSize:10, color:'var(--dim)' }}>{relativeTime(r.createdAt)}</span>
                                          </div>
                                          <div style={{ fontSize:12, color:'var(--text2)', lineHeight:1.5 }}>{r.text}</div>
                                        </div>
                                      )
                                    })}
                                  </div>
                                )})()}

                                {/* Agent reply form */}
                                <div style={{ display:'flex', gap:6 }}>
                                  <input className="field-input" value={replyForms[note.id]||''}
                                    onChange={e=>setReplyForms(f=>({...f,[note.id]:e.target.value.slice(0,300)}))}
                                    onKeyDown={e=>e.key==='Enter'&&!e.shiftKey&&saveReply(note.id)}
                                    placeholder="Reply to your coach…"
                                    style={{ flex:1, padding:'6px 10px', fontSize:12 }}/>
                                  <button onClick={()=>saveReply(note.id)}
                                    disabled={replySaving===note.id||!(replyForms[note.id]||'').trim()}
                                    style={{ fontSize:11, padding:'6px 12px', borderRadius:6, cursor:'pointer',
                                      background:'var(--text)', border:'none', color:'var(--bg)', fontWeight:600, flexShrink:0 }}>
                                    {replySaving===note.id ? '…' : 'Send'}
                                  </button>
                                </div>
                              </div>
                            )
                          })}
                      </div>
                    </div>
                  )}

                  </>
                  )} {/* end roster tab */}

                  {/* Admin tab */}
                  {teamsTab==='admin' && isTeamOwner && (
                    <div>
                      {/* Admin sub-tab bar */}
                      <div className="tabs" style={{ marginBottom:20 }}>
                        <button className={`tab-item${adminSubTab==='performance'?' on':''}`} onClick={()=>setAdminSubTab('performance')}>📊 Performance</button>
                        <button className={`tab-item${adminSubTab==='coaching'?' on':''}`} onClick={()=>setAdminSubTab('coaching')}>📝 Coaching</button>
                        <button className={`tab-item${adminSubTab==='pods'?' on':''}`} onClick={()=>setAdminSubTab('pods')}>🫂 Pods</button>
                      </div>

                      {/* Performance sub-tab */}
                      {adminSubTab==='performance' && (() => {
                        const now = new Date()
                        const monthLabel = now.toLocaleString('en-US',{month:'long', year:'numeric'})
                        const allStats = Object.values(memberStats)
                        const avgToday    = allStats.length ? Math.round(allStats.reduce((a,s)=>a+(s.todayPct||0),0)/allStats.length) : 0
                        const avgMonth    = allStats.length ? Math.round(allStats.reduce((a,s)=>a+(s.monthlyPct||0),0)/allStats.length) : 0
                        const totalAppts  = allStats.reduce((a,s)=>a+(s.appts||0),0)
                        const totalShows  = allStats.reduce((a,s)=>a+(s.showings||0),0)
                        const totalClosed = allStats.reduce((a,s)=>a+(s.closed||0),0)
                        const totalVol    = allStats.reduce((a,s)=>a+(s.closedVol||0),0)
                        const totalComm   = allStats.reduce((a,s)=>a+(s.closedComm||0),0)
                        return (
                          <div>
                            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
                              <div className="serif" style={{ fontSize:20, color:'var(--text)' }}>📊 Team Performance — {monthLabel}</div>
                              <div style={{ fontSize:12, color:'var(--muted)' }}>{members.length} agent{members.length!==1?'s':''}</div>
                            </div>
                            <div className="card" style={{ padding:18, marginBottom:20, border:'1px solid rgba(217,119,6,.3)', background:'var(--gold3)' }}>
                              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(110px,1fr))', gap:12 }}>
                                {[
                                  { l:'Avg Today %',  v:`${avgToday}%`,         c:'var(--green)' },
                                  { l:'Avg Month %',  v:`${avgMonth}%`,         c:'#0ea5e9' },
                                  { l:'Total Appts',  v:totalAppts,              c:'var(--green)' },
                                  { l:'Total Shows',  v:totalShows,              c:'#0ea5e9' },
                                  { l:'Total Closed', v:totalClosed,             c:'var(--green)' },
                                  ...(totalVol >0?[{l:'Volume',    v:fmtMoney(totalVol),  c:'var(--green)'}]:[]),
                                  ...(totalComm>0?[{l:'Commission',v:fmtMoney(totalComm), c:'var(--green)'}]:[]),
                                ].map((s,i)=>(
                                  <div key={i} style={{ textAlign:'center' }}>
                                    <div className="label" style={{ marginBottom:4 }}>{s.l}</div>
                                    <div className="serif" style={{ fontSize:20, color:s.c, fontWeight:700 }}>{s.v}</div>
                                  </div>
                                ))}
                              </div>
                            </div>
                            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                              {members.map((m,i)=>{
                                const rank  = getRank(m.xp||0)
                                const isMe  = m.id===user?.id
                                const stats = memberStats[m.id]||{}
                                return (
                                  <div key={m.id} className="card" style={{
                                    padding:18, border:`1px solid ${isMe?'rgba(217,119,6,.35)':'var(--b2)'}`,
                                    background:isMe?'var(--gold3)':'var(--surface)',
                                  }}>
                                    <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14, flexWrap:'wrap' }}>
                                      <div className="mono" style={{ width:22, fontSize:11, color:'var(--dim)', fontWeight:700 }}>{i+1}</div>
                                      <div style={{ width:32, height:32, borderRadius:'50%', background:`${rank.color}18`,
                                        border:`1.5px solid ${rank.color}33`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, flexShrink:0 }}>
                                        {rank.icon}
                                      </div>
                                      <div style={{ flex:1 }}>
                                        <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                                          <span style={{ fontSize:14, fontWeight:600, color:'var(--text)' }}>{m.full_name||'Agent'}</span>
                                          {isMe && <span style={{ fontSize:9, padding:'2px 5px', borderRadius:4, background:'var(--gold4)', color:'var(--gold)', fontWeight:700 }}>YOU</span>}
                                        </div>
                                        <div style={{ fontSize:11, color:'var(--muted)' }}>{rank.name} · 🔥 {m.streak||0} streak</div>
                                      </div>
                                      <div className="serif" style={{ fontSize:20, color:rank.color, fontWeight:700 }}>{(m.xp||0).toLocaleString()} XP</div>
                                    </div>
                                    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(100px,1fr))', gap:10, alignItems:'center' }}>
                                      <div style={{ textAlign:'center' }}>
                                        <div style={{ fontSize:9, color:'var(--muted)', marginBottom:4 }}>TODAY</div>
                                        <Ring pct={stats.todayPct||0} size={52} color={rank.color}/>
                                      </div>
                                      <div style={{ textAlign:'center' }}>
                                        <div style={{ fontSize:9, color:'var(--muted)', marginBottom:4 }}>MONTH</div>
                                        <Ring pct={stats.monthlyPct||0} size={52} color='#0ea5e9'/>
                                      </div>
                                      <StatCard icon='📅' label='Appts' value={stats.appts||0} color='var(--green)'/>
                                      <StatCard icon='🔑' label='Showings' value={stats.showings||0} color='#0ea5e9'/>
                                      <StatCard icon='🎉' label='Closed' value={stats.closed||0} color='var(--green)'
                                        sub={stats.closedVol>0 ? fmtMoney(stats.closedVol) : undefined}/>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })()}

                      {/* Coaching sub-tab */}
                      {adminSubTab==='coaching' && (
                        <div>
                          {/* Agent filter pills */}
                          <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:20 }}>
                            {[{id:'all',label:'All Agents'}, ...members.map(m=>({id:m.id,label:m.full_name||'Agent'}))].map(opt=>(
                              <button key={opt.id} onClick={()=>setFilterAgent(opt.id)} style={{
                                padding:'5px 14px', borderRadius:20, fontSize:12, fontWeight:600, cursor:'pointer',
                                border: filterAgent===opt.id ? 'none' : '1px solid var(--b2)',
                                background: filterAgent===opt.id ? 'var(--text)' : 'transparent',
                                color: filterAgent===opt.id ? 'var(--bg)' : 'var(--text2)',
                                transition:'all .15s',
                              }}>{opt.label}</button>
                            ))}
                          </div>

                          {/* Notes feed */}
                          {(() => {
                            const NC = { praise:'#10b981', goal:'#d97706', concern:'#f43f5e', general:'#0ea5e9' }
                            const visible = [...allCoachingNotes]
                              .filter(n => filterAgent==='all' || n.agentId===filterAgent)
                              .sort((a,b) => (b.pinned?1:0)-(a.pinned?1:0) || new Date(b.createdAt)-new Date(a.createdAt))
                            return (
                              <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:20 }}>
                                {visible.length===0 && (
                                  <div style={{ fontSize:13, color:'var(--muted)', fontStyle:'italic', padding:'16px 0' }}>
                                    No coaching notes yet. Add one below.
                                  </div>
                                )}
                                {visible.map(note=>{
                                  const agent = members.find(m=>m.id===note.agentId)
                                  const name = agent?.full_name||'Agent'
                                  const c = NC[note.type]||NC.general
                                  return (
                                    <div key={note.id} className="card" style={{
                                      padding:'14px 16px',
                                      border: note.pinned ? '1px solid rgba(217,119,6,.5)' : '1px solid var(--b2)',
                                      background: note.pinned ? 'var(--gold3)' : 'var(--surface)',
                                    }}>
                                      <div style={{ display:'flex', alignItems:'flex-start', gap:10 }}>
                                        <div style={{ width:32, height:32, borderRadius:'50%', background:`${c}18`,
                                          border:`1.5px solid ${c}33`, display:'flex', alignItems:'center',
                                          justifyContent:'center', fontSize:14, fontWeight:700, color:c, flexShrink:0 }}>
                                          {name.charAt(0).toUpperCase()}
                                        </div>
                                        <div style={{ flex:1, minWidth:0 }}>
                                          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6, flexWrap:'wrap' }}>
                                            <span style={{ fontSize:10, padding:'2px 7px', borderRadius:4, fontWeight:700,
                                              background:`${c}18`, color:c, border:`1px solid ${c}33`,
                                              textTransform:'uppercase', letterSpacing:'.5px' }}>{note.type}</span>
                                            <span style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{name}</span>
                                            {note.pinned && <span style={{ fontSize:10, color:'var(--gold2)' }}>📌</span>}
                                            <span style={{ marginLeft:'auto', fontSize:11, color:'var(--dim)' }}>{relativeTime(note.createdAt)}</span>
                                          </div>
                                          <div style={{ fontSize:13, color:'var(--text)', lineHeight:1.6, marginBottom:8 }}>{note.text}</div>

                                          {/* Replies thread */}
                                          {(()=>{
                                            const agentMember = members.find(m=>m.id===note.agentId)
                                            const agentProfileReplies = agentMember?.goals?.coaching_replies?.[note.id] || []
                                            const allReplies = [...(note.replies||[]), ...agentProfileReplies].sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt))
                                            return allReplies.length > 0 && (
                                            <div style={{ borderLeft:'2px solid var(--b2)', paddingLeft:10, marginBottom:10, display:'flex', flexDirection:'column', gap:8 }}>
                                              {allReplies.map(r=>{
                                                const author = members.find(m=>m.id===r.authorId)
                                                const authorName = author?.full_name || (r.authorId===user.id ? 'You' : 'Agent')
                                                const isCoach = r.authorId===teamData?.created_by
                                                return (
                                                  <div key={r.id}>
                                                    <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:3 }}>
                                                      <span style={{ fontSize:11, fontWeight:600, color: isCoach ? 'var(--gold)' : 'var(--text)' }}>{authorName}</span>
                                                      {isCoach && <span style={{ fontSize:9, padding:'1px 5px', borderRadius:3, background:'var(--gold4)', color:'var(--gold)', fontWeight:700 }}>COACH</span>}
                                                      <span style={{ fontSize:10, color:'var(--dim)' }}>{relativeTime(r.createdAt)}</span>
                                                    </div>
                                                    <div style={{ fontSize:12, color:'var(--text2)', lineHeight:1.5 }}>{r.text}</div>
                                                  </div>
                                                )
                                              })}
                                            </div>
                                          )})()}

                                          {/* Reply form (coach) */}
                                          <div style={{ display:'flex', gap:6, marginBottom:8 }}>
                                            <input className="field-input" value={replyForms[note.id]||''}
                                              onChange={e=>setReplyForms(f=>({...f,[note.id]:e.target.value.slice(0,300)}))}
                                              onKeyDown={e=>e.key==='Enter'&&!e.shiftKey&&saveReply(note.id)}
                                              placeholder="Reply…"
                                              style={{ flex:1, padding:'6px 10px', fontSize:12 }}/>
                                            <button onClick={()=>saveReply(note.id)}
                                              disabled={replySaving===note.id||!(replyForms[note.id]||'').trim()}
                                              style={{ fontSize:11, padding:'6px 12px', borderRadius:6, cursor:'pointer',
                                                background:'var(--text)', border:'none', color:'var(--bg)', fontWeight:600, flexShrink:0 }}>
                                              {replySaving===note.id ? '…' : 'Send'}
                                            </button>
                                          </div>

                                          <div style={{ display:'flex', gap:6 }}>
                                            <button onClick={()=>pinNote(note.id)} style={{ fontSize:11, padding:'4px 10px', borderRadius:6,
                                              cursor:'pointer', background: note.pinned ? 'rgba(217,119,6,.12)' : 'var(--bg2)',
                                              border: note.pinned ? '1px solid rgba(217,119,6,.3)' : '1px solid var(--b2)',
                                              color: note.pinned ? 'var(--gold)' : 'var(--muted)', fontWeight:600 }}>
                                              {note.pinned ? '📌 Unpin' : '📌 Pin'}
                                            </button>
                                            <button onClick={()=>deleteNote(note.id)} style={{ fontSize:11, padding:'4px 10px',
                                              borderRadius:6, cursor:'pointer', background:'rgba(220,38,38,.06)',
                                              border:'1px solid rgba(220,38,38,.2)', color:'var(--red)', fontWeight:600 }}>
                                              Delete
                                            </button>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            )
                          })()}

                          {/* Add Note form / button */}
                          {noteForm ? (
                            <div className="card" style={{ padding:20, border:'1px solid rgba(14,165,233,.25)', background:'rgba(14,165,233,.04)' }}>
                              <div className="serif" style={{ fontSize:15, color:'var(--text)', marginBottom:14 }}>Add Coaching Note</div>
                              <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                                <div>
                                  <div className="label" style={{ marginBottom:5 }}>Agent</div>
                                  <select className="field-input" value={noteForm.agentId}
                                    onChange={e=>setNoteForm(f=>({...f,agentId:e.target.value}))} style={{ width:'100%' }}>
                                    <option value="">Select agent…</option>
                                    {members.filter(m=>m.id!==user?.id).map(m=><option key={m.id} value={m.id}>{m.full_name||'Agent'}</option>)}
                                  </select>
                                </div>
                                <div>
                                  <div className="label" style={{ marginBottom:5 }}>Type</div>
                                  <select className="field-input" value={noteForm.type}
                                    onChange={e=>setNoteForm(f=>({...f,type:e.target.value}))} style={{ width:'100%' }}>
                                    <option value="praise">Praise</option>
                                    <option value="goal">Goal</option>
                                    <option value="concern">Concern</option>
                                    <option value="general">General</option>
                                  </select>
                                </div>
                                <div>
                                  <div className="label" style={{ marginBottom:5 }}>Note</div>
                                  <textarea className="field-input" value={noteForm.text}
                                    onChange={e=>setNoteForm(f=>({...f,text:e.target.value.slice(0,500)}))}
                                    placeholder="Write your coaching note here…" rows={4}
                                    style={{ width:'100%', resize:'vertical', minHeight:90 }}/>
                                  <div style={{ fontSize:10, color:'var(--dim)', textAlign:'right', marginTop:3 }}>
                                    {(noteForm.text||'').length}/500
                                  </div>
                                </div>
                                <div style={{ display:'flex', gap:8 }}>
                                  <button className="btn-primary" onClick={saveNote}
                                    disabled={noteSaving||!noteForm.text?.trim()||!noteForm.agentId}
                                    style={{ fontSize:13, padding:'9px 22px' }}>
                                    {noteSaving ? 'Saving…' : 'Save Note'}
                                  </button>
                                  <button className="btn-outline" onClick={()=>setNoteForm(null)} style={{ fontSize:13 }}>Cancel</button>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <button className="btn-outline"
                              onClick={()=>setNoteForm({ agentId: filterAgent==='all' ? '' : filterAgent, text:'', type:'general', editingId:null })}
                              style={{ fontSize:13 }}>+ Add Coaching Note</button>
                          )}
                        </div>
                      )}

                      {/* Pods sub-tab */}
                      {adminSubTab==='pods' && (
                        <div>
                          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
                            <div className="serif" style={{ fontSize:20, color:'var(--text)' }}>🫂 Accountability Circles</div>
                            {!podForm && (
                              <button className="btn-outline" onClick={()=>setPodForm({ name:'', memberIds:[], editingId:null })}
                                style={{ fontSize:12 }}>+ New Circle</button>
                            )}
                          </div>

                          {podForm && (
                            <div className="card" style={{ padding:20, marginBottom:16, border:'1px solid rgba(139,92,246,.3)', background:'rgba(139,92,246,.04)' }}>
                              <div className="serif" style={{ fontSize:15, color:'var(--text)', marginBottom:14 }}>
                                {podForm.editingId ? 'Edit Circle' : 'New Circle'}
                              </div>
                              <div style={{ marginBottom:12 }}>
                                <div className="label" style={{ marginBottom:5 }}>Circle Name</div>
                                <input className="field-input" value={podForm.name}
                                  onChange={e=>setPodForm(f=>({...f,name:e.target.value}))}
                                  placeholder="e.g. Alpha Circle" style={{ width:'100%' }}/>
                              </div>
                              <div style={{ marginBottom:12 }}>
                                <div className="label" style={{ marginBottom:8 }}>Members (2–5)</div>
                                <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                                  {members.map(m=>{
                                    const checked = podForm.memberIds.includes(m.id)
                                    const atMax   = !checked && podForm.memberIds.length >= 5
                                    const mRank   = getRank(m.xp||0)
                                    return (
                                      <label key={m.id} style={{ display:'flex', alignItems:'center', gap:8, cursor:atMax?'not-allowed':'pointer',
                                        opacity:atMax?0.45:1, padding:'6px 10px', borderRadius:6,
                                        background:checked?'rgba(139,92,246,.08)':'var(--bg2)', border:`1px solid ${checked?'rgba(139,92,246,.3)':'var(--b1)'}` }}>
                                        <input type="checkbox" checked={checked} disabled={atMax}
                                          onChange={e=>setPodForm(f=>({...f, memberIds: e.target.checked
                                            ? [...f.memberIds, m.id]
                                            : f.memberIds.filter(id=>id!==m.id)
                                          }))}/>
                                        <span style={{ fontSize:14 }}>{mRank.icon}</span>
                                        <span style={{ fontSize:13, fontWeight:500, color:'var(--text)' }}>{m.full_name||'Agent'}</span>
                                        <span style={{ fontSize:11, color:'var(--muted)' }}>{mRank.name}</span>
                                      </label>
                                    )
                                  })}
                                </div>
                                {podForm.memberIds.length > 0 && podForm.memberIds.length < 2 && (
                                  <div style={{ fontSize:11, color:'var(--gold2)', marginTop:6 }}>⚠ Select at least 2 members</div>
                                )}
                              </div>
                              <div style={{ display:'flex', gap:8 }}>
                                <button className="btn-primary" onClick={savePod} disabled={podSaving||podForm.memberIds.length<2||!podForm.name.trim()}
                                  style={{ fontSize:13, padding:'9px 22px' }}>
                                  {podSaving?'Saving…':'Save Circle'}
                                </button>
                                <button className="btn-outline" onClick={()=>setPodForm(null)} style={{ fontSize:13 }}>Cancel</button>
                              </div>
                            </div>
                          )}

                          {allPods.length===0 && !podForm && (
                            <div style={{ fontSize:13, color:'var(--muted)', fontStyle:'italic', padding:'12px 0' }}>
                              No circles yet. Create one to group agents into accountability circles.
                            </div>
                          )}
                          {allPods.map(pod=>(
                            <div key={pod.id} className="card" style={{ padding:16, marginBottom:10, display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:10 }}>
                              <div>
                                <div style={{ fontWeight:600, fontSize:14, color:'var(--text)', marginBottom:4 }}>🫂 {pod.name}</div>
                                <div style={{ fontSize:12, color:'var(--muted)' }}>
                                  {pod.memberIds.length} members · {pod.memberIds.map(id=>members.find(m=>m.id===id)?.full_name||'?').join(', ')}
                                </div>
                              </div>
                              <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                                <button className="btn-outline" style={{ fontSize:11, padding:'5px 10px' }}
                                  onClick={()=>setPodForm({ name:pod.name, memberIds:[...pod.memberIds], editingId:pod.id })}>
                                  Edit
                                </button>
                                <button onClick={()=>deletePod(pod.id)}
                                  style={{ background:'rgba(220,38,38,.06)', border:'1px solid rgba(220,38,38,.2)',
                                    color:'var(--red)', borderRadius:7, padding:'5px 10px', cursor:'pointer', fontSize:11, fontWeight:600 }}>
                                  ✕
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
