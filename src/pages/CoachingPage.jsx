import { useState, useEffect, useRef, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { Loader, Wordmark, ThemeToggle, getRank } from '../design'
import { canUseTeams, isActiveBilling } from '../lib/plans'

const UI_NOTE_LIMIT = 500

function relativeTime(isoStr) {
  if (!isoStr) return ''
  const diff = Math.floor((Date.now() - new Date(isoStr).getTime()) / 1000)
  if (diff < 60)    return 'just now'
  if (diff < 3600)  return `${Math.floor(diff/60)}m ago`
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`
  const d = Math.floor(diff/86400)
  return d === 1 ? '1 day ago' : `${d} days ago`
}

export default function CoachingPage({ onNavigate, theme, onToggleTheme }) {
  const { user, profile, refreshProfile } = useAuth()
  const [loading,    setLoading]    = useState(true)
  const [teamData,   setTeamData]   = useState(null)
  const [members,    setMembers]    = useState([])
  const [error,      setError]      = useState('')
  const [subTab,     setSubTab]     = useState('coaching') // 'coaching' | 'standup'
  // Coaching state
  const [filterAgent,    setFilterAgent]    = useState('all')
  const [noteForm,       setNoteForm]       = useState(null)
  const [noteSaving,     setNoteSaving]     = useState(false)
  const [replyForms,     setReplyForms]     = useState({})
  const [replySaving,    setReplySaving]    = useState(null)
  const [confirmModal,   setConfirmModal]   = useState(null)

  // ── Data fetching ──────────────────────────────────────────────────────
  const fetchSeqRef = useRef(0)
  const lastFetchedTeamId = useRef(null)
  const fetchInFlight = useRef(false)

  useEffect(() => {
    const tid = profile?.team_id
    if (!tid) { setLoading(false); return }
    // Skip if already fetched this team (whether in-flight or completed)
    if (lastFetchedTeamId.current === tid) return
    fetchTeamData()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.team_id])

  async function fetchTeamData() {
    if (fetchInFlight.current) return
    fetchInFlight.current = true
    lastFetchedTeamId.current = profile.team_id
    setLoading(true)
    const seq = ++fetchSeqRef.current
    try {
      const { data: td, error: tdErr } = await supabase
        .from('teams').select('*').eq('id', profile.team_id).single()
      if (tdErr) throw tdErr
      if (seq !== fetchSeqRef.current) return
      setTeamData(td)

      const { data: mems, error: mErr } = await supabase
        .from('profiles').select('id, full_name, xp, streak, goals, habit_prefs')
        .eq('team_id', profile.team_id)
      if (mErr) throw mErr
      if (seq !== fetchSeqRef.current) return
      setMembers(mems || [])
    } catch (err) {
      console.error('CoachingPage fetch error:', err)
      setError('Failed to load team data.')
    } finally {
      fetchInFlight.current = false
      if (seq === fetchSeqRef.current) setLoading(false)
    }
  }

  // ── Derived values ─────────────────────────────────────────────────────
  const {
    isTeamOwner, teamAdmins, isAdmin, allGroups, myLedGroup,
    isGroupLeader, myGroupMembers, isAdminOrOwner, coachableMembers,
    allCoachingNotes, myCoachingNotes,
  } = useMemo(() => {
    const _isTeamOwner      = !!(teamData?.created_by === user?.id)
    const _teamAdmins       = teamData?.team_prefs?.admins || []
    const _isAdmin          = _teamAdmins.includes(user?.id) && !_isTeamOwner
    const _allGroups        = teamData?.team_prefs?.groups || []
    const _myLedGroup       = _allGroups.find(g => g.leaderId === user?.id) || null
    const _isGroupLeader    = !!_myLedGroup && !_isTeamOwner && !_isAdmin
    const _myGroupMembers   = _myLedGroup ? members.filter(m => _myLedGroup.memberIds.includes(m.id)) : []
    const _isAdminOrOwner   = _isTeamOwner || _isAdmin || _isGroupLeader
    const _coachableMembers = (_isGroupLeader && !_isAdmin && !_isTeamOwner)
      ? _myGroupMembers
      : members.filter(m => m.id !== user?.id)
    const _allCoachingNotes = teamData?.team_prefs?.coaching_notes || []
    const _myCoachingNotes  = _allCoachingNotes.filter(n => n.agentId === user?.id)
    return {
      isTeamOwner: _isTeamOwner, teamAdmins: _teamAdmins, isAdmin: _isAdmin,
      allGroups: _allGroups, myLedGroup: _myLedGroup, isGroupLeader: _isGroupLeader,
      myGroupMembers: _myGroupMembers, isAdminOrOwner: _isAdminOrOwner,
      coachableMembers: _coachableMembers, allCoachingNotes: _allCoachingNotes,
      myCoachingNotes: _myCoachingNotes,
    }
  }, [teamData, user?.id, members])

  // ── Coaching Note Handlers ─────────────────────────────────────────────
  const MAX_NOTE_LEN = 4000

  async function saveNote() {
    if (!noteForm?.text?.trim() || !noteForm?.agentId || !user?.id) return
    const trimmed = noteForm.text.trim().slice(0, MAX_NOTE_LEN)
    setNoteSaving(true)
    try {
      const existing = teamData?.team_prefs?.coaching_notes || []
      let updated
      if (noteForm.editingId) {
        updated = existing.map(n => n.id === noteForm.editingId
          ? { ...n, text: trimmed, type: noteForm.type } : n)
      } else {
        updated = [...existing, {
          id: Date.now().toString(36),
          agentId: noteForm.agentId,
          coachId: user.id,
          text: trimmed,
          type: noteForm.type || 'general',
          pinned: false,
          replies: [],
          createdAt: new Date().toISOString(),
        }]
      }
      const updatedPrefs = { ...(teamData?.team_prefs||{}), coaching_notes: updated }
      const { error } = await supabase.from('teams').update({ team_prefs: updatedPrefs }).eq('id', profile.team_id)
      if (error) throw error
      setTeamData(td => ({ ...td, team_prefs: updatedPrefs }))
      setNoteForm(null)
    } catch (err) {
      setError('Failed to save note. Please try again.')
      console.error('saveNote error:', err)
    } finally {
      setNoteSaving(false)
    }
  }

  async function deleteNote(noteId) {
    const updated = (teamData?.team_prefs?.coaching_notes||[]).filter(n=>n.id!==noteId)
    const updatedPrefs = { ...(teamData?.team_prefs||{}), coaching_notes: updated }
    try {
      const { error } = await supabase.from('teams').update({ team_prefs: updatedPrefs }).eq('id', profile.team_id)
      if (error) throw error
      setTeamData(td => ({ ...td, team_prefs: updatedPrefs }))
    } catch (err) {
      console.error('deleteNote error:', err)
    }
  }

  async function pinNote(noteId) {
    const updated = (teamData?.team_prefs?.coaching_notes||[]).map(n=>
      n.id===noteId ? { ...n, pinned: !n.pinned } : n)
    const updatedPrefs = { ...(teamData?.team_prefs||{}), coaching_notes: updated }
    try {
      const { error } = await supabase.from('teams').update({ team_prefs: updatedPrefs }).eq('id', profile.team_id)
      if (error) throw error
      setTeamData(td => ({ ...td, team_prefs: updatedPrefs }))
    } catch (err) {
      console.error('pinNote error:', err)
    }
  }

  async function saveReply(noteId) {
    const text = (replyForms[noteId]||'').trim()
    if (!text) return
    setReplySaving(noteId)
    const newReply = { id: Date.now().toString(36), authorId: user.id, text, createdAt: new Date().toISOString() }
    const isCoachOrLeader = isAdminOrOwner
    try {
      if (isCoachOrLeader) {
        const updated = (teamData?.team_prefs?.coaching_notes||[]).map(n=>
          n.id===noteId ? { ...n, replies: [...(n.replies||[]), newReply] } : n)
        const updatedPrefs = { ...(teamData?.team_prefs||{}), coaching_notes: updated }
        const { error } = await supabase.from('teams').update({ team_prefs: updatedPrefs }).eq('id', profile.team_id)
        if (error) throw error
        setTeamData(td => ({ ...td, team_prefs: updatedPrefs }))
      } else {
        // Read from members state (not stale profile) so consecutive replies don't overwrite each other
        const myMember = members.find(m => m.id === user.id)
        const currentGoals = myMember?.goals || profile?.goals || {}
        const existingReplies = currentGoals.coaching_replies || {}
        const noteReplies = existingReplies[noteId] || []
        const updatedCoachingReplies = { ...existingReplies, [noteId]: [...noteReplies, newReply] }
        const updatedGoals = { ...currentGoals, coaching_replies: updatedCoachingReplies }
        const { error } = await supabase.from('profiles').update({ goals: updatedGoals }).eq('id', user.id)
        if (error) throw error
        setMembers(ms => ms.map(m => m.id===user.id ? { ...m, goals: updatedGoals } : m))
      }
      setReplyForms(f => ({ ...f, [noteId]: '' }))
    } catch (err) {
      console.error('saveReply error:', err)
    } finally {
      setReplySaving(null)
    }
  }

  async function saveStandupReply(memberId, date) {
    const key = `${memberId}_${date}`
    const text = replyForms[key]?.trim()
    if (!text) return
    setReplySaving(key)
    try {
      const existing = teamData?.team_prefs?.standup_replies?.[key] || []
      const newReplies = [...existing, { id: Date.now().toString(36), authorId: user.id, text, createdAt: new Date().toISOString() }]
      const newPrefs = { ...(teamData.team_prefs||{}),
        standup_replies: { ...(teamData.team_prefs?.standup_replies||{}), [key]: newReplies }
      }
      const { error } = await supabase.from('teams').update({ team_prefs: newPrefs }).eq('id', profile.team_id)
      if (error) throw error
      setTeamData(td => ({ ...td, team_prefs: newPrefs }))
      setReplyForms(f => ({ ...f, [key]: '' }))
    } catch (err) {
      console.error('saveStandupReply error:', err)
    } finally {
      setReplySaving(null)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────
  if (!profile?.team_id) {
    return (
      <div className="page-inner" style={{ maxWidth:860 }}>
        <div className="card" style={{ padding:32, textAlign:'center' }}>
          <div className="serif" style={{ fontSize:22, color:'var(--text)', marginBottom:8 }}>📝 Coaching</div>
          <div style={{ fontSize:14, color:'var(--muted)', marginBottom:20 }}>Join a team to access coaching notes and standups.</div>
          <button className="btn-primary" onClick={()=>onNavigate('teams')} style={{ fontSize:14, padding:'10px 24px' }}>
            Go to Teams
          </button>
        </div>
      </div>
    )
  }

  if (loading) return <Loader/>

  const NC = { praise:'#10b981', goal:'#d97706', concern:'#f43f5e', general:'#0ea5e9' }

  return (
    <>
      <div className="page-inner" style={{ maxWidth:860 }}>

          {error && (
            <div style={{ background:'rgba(220,38,38,.06)', border:'1px solid rgba(220,38,38,.2)', borderRadius:9,
              padding:'10px 14px', marginBottom:16, fontSize:13, color:'var(--red)' }}>
              {error}
              <button onClick={()=>setError('')} style={{ float:'right', background:'none', border:'none', color:'var(--red)', cursor:'pointer', fontWeight:700 }}>✕</button>
            </div>
          )}

          {/* Page header */}
          <div style={{ marginBottom:24 }}>
            <div className="serif" style={{ fontSize:26, color:'var(--text)', letterSpacing:'-.02em', marginBottom:4 }}>📝 Coaching</div>
            <div style={{ fontSize:13, color:'var(--muted)' }}>Coaching notes, feedback, and daily standups for your team.</div>
          </div>

          {/* Sub-tab bar (only show admin tabs if user has coaching permissions) */}
          {isAdminOrOwner && (
            <div className="tabs" style={{ marginBottom:20 }}>
              <button className={`tab-item${subTab==='coaching'?' on':''}`} onClick={()=>setSubTab('coaching')}>📝 Coaching</button>
              <button className={`tab-item${subTab==='standup'?' on':''}`} onClick={()=>setSubTab('standup')}>⚡ Standup</button>
            </div>
          )}

          {/* ── Admin Coaching Tab ── */}
          {isAdminOrOwner && subTab==='coaching' && (
            <div>
              {/* Agent filter pills */}
              <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:20 }}>
                {[{id:'all',label: isGroupLeader ? `${myLedGroup?.name||'My Group'}` : 'All Agents'}, ...coachableMembers.map(m=>({id:m.id,label:m.full_name||'Agent'}))].map(opt=>(
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
                const visible = [...allCoachingNotes]
                  .filter(n => isGroupLeader ? myLedGroup.memberIds.includes(n.agentId) : n.agentId !== user?.id)
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
                                  placeholder="Reply..."
                                  style={{ flex:1, padding:'6px 10px', fontSize:12 }}/>
                                <button onClick={()=>saveReply(note.id)}
                                  disabled={replySaving===note.id||!(replyForms[note.id]||'').trim()}
                                  style={{ fontSize:11, padding:'6px 12px', borderRadius:6, cursor:'pointer',
                                    background:'var(--text)', border:'none', color:'var(--bg)', fontWeight:600, flexShrink:0 }}>
                                  {replySaving===note.id ? '...' : 'Send'}
                                </button>
                              </div>

                              {/* Pin/Delete only for team owner */}
                              {isTeamOwner && (
                                <div style={{ display:'flex', gap:6 }}>
                                  <button onClick={()=>pinNote(note.id)} style={{ fontSize:11, padding:'4px 10px', borderRadius:6,
                                    cursor:'pointer', background: note.pinned ? 'rgba(217,119,6,.12)' : 'var(--bg2)',
                                    border: note.pinned ? '1px solid rgba(217,119,6,.3)' : '1px solid var(--b2)',
                                    color: note.pinned ? 'var(--gold)' : 'var(--muted)', fontWeight:600 }}>
                                    {note.pinned ? '📌 Unpin' : '📌 Pin'}
                                  </button>
                                  <button onClick={()=>setConfirmModal({ message:'Delete this coaching note?', label:'Delete Note', onConfirm:()=>deleteNote(note.id) })} style={{ fontSize:11, padding:'4px 10px',
                                    borderRadius:6, cursor:'pointer', background:'rgba(220,38,38,.06)',
                                    border:'1px solid rgba(220,38,38,.2)', color:'var(--red)', fontWeight:600 }}>
                                    Delete
                                  </button>
                                </div>
                              )}
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
                        <option value="">Select agent...</option>
                        {coachableMembers.map(m=><option key={m.id} value={m.id}>{m.full_name||'Agent'}</option>)}
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
                        onChange={e=>setNoteForm(f=>({...f,text:e.target.value.slice(0,UI_NOTE_LIMIT)}))}
                        placeholder="Write your coaching note here..." rows={4}
                        style={{ width:'100%', resize:'vertical', minHeight:90 }}/>
                      <div style={{ fontSize:10, color:'var(--dim)', textAlign:'right', marginTop:3 }}>
                        {(noteForm.text||'').length}/{UI_NOTE_LIMIT}
                      </div>
                    </div>
                    <div style={{ display:'flex', gap:8 }}>
                      <button className="btn-primary" onClick={saveNote}
                        disabled={noteSaving||!noteForm.text?.trim()||!noteForm.agentId||noteForm.agentId===user?.id}
                        style={{ fontSize:13, padding:'9px 22px' }}>
                        {noteSaving ? 'Saving...' : 'Save Note'}
                      </button>
                      <button className="btn-outline" onClick={()=>setNoteForm(null)} style={{ fontSize:13 }}>Cancel</button>
                    </div>
                  </div>
                </div>
              ) : (
                <button className="btn-outline"
                  onClick={()=>setNoteForm({ agentId: (filterAgent==='all'||filterAgent===user?.id) ? '' : filterAgent, text:'', type:'general', editingId:null })}
                  style={{ fontSize:13 }}>+ Add Coaching Note</button>
              )}
            </div>
          )}

          {/* ── Admin Standup Tab ── */}
          {isAdminOrOwner && subTab==='standup' && (()=>{
            const todayStr = new Date().toISOString().slice(0,10)
            const visibleMembers = isGroupLeader ? myGroupMembers : members.filter(m=>m.id!==user?.id)
            return (
              <div>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
                  <div>
                    <div className="serif" style={{ fontSize:20, color:'var(--text)', marginBottom:2 }}>⚡ Daily Standups</div>
                    <div style={{ fontSize:12, color:'var(--muted)' }}>{new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})}</div>
                  </div>
                  <div style={{ fontSize:12, color:'var(--muted)' }}>
                    {visibleMembers.filter(m=>m.habit_prefs?.standup_today?.date===todayStr).length}/{visibleMembers.length} submitted
                  </div>
                </div>
                {visibleMembers.length===0 && (
                  <div style={{ fontSize:13, color:'var(--muted)', fontStyle:'italic', padding:'12px 0' }}>No members in your group yet.</div>
                )}
                {visibleMembers.map(m=>{
                  const sd = m.habit_prefs?.standup_today
                  const submitted = sd?.date === todayStr
                  const rank = getRank(m.xp||0)
                  const key = `${m.id}_${todayStr}`
                  const replies = teamData?.team_prefs?.standup_replies?.[key] || []
                  return (
                    <div key={m.id} className="card" style={{ padding:18, marginBottom:12,
                      borderLeft: submitted ? '3px solid var(--green)' : '3px solid var(--b2)',
                      opacity: submitted ? 1 : 0.65 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom: submitted?14:0 }}>
                        <div style={{ width:34, height:34, borderRadius:'50%',
                          background:`linear-gradient(135deg,${rank.color},${rank.color}88)`,
                          display:'flex', alignItems:'center', justifyContent:'center',
                          fontSize:14, fontWeight:700, color:'#fff', flexShrink:0 }}>
                          {(m.full_name||'?').charAt(0).toUpperCase()}
                        </div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:14, fontWeight:600, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{m.full_name||'Agent'}</div>
                          <div style={{ fontSize:11, color:'var(--muted)' }}>{submitted ? `Submitted ${new Date(sd.date).toLocaleDateString()}` : 'Not submitted yet'}</div>
                        </div>
                        {submitted && <span style={{ fontSize:11, color:'var(--green)', fontWeight:600, flexShrink:0 }}>✓ Done</span>}
                      </div>
                      {submitted && (
                        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                          {[
                            { label:'Accomplished yesterday', value:sd.q1 },
                            { label:'#1 priority today',      value:sd.q2 },
                            ...(sd.q3?.trim() ? [{ label:'Blocker', value:sd.q3 }] : []),
                          ].map(({label,value})=>(
                            <div key={label}>
                              <div style={{ fontSize:10, color:'var(--dim)', fontWeight:700, textTransform:'uppercase', letterSpacing:.6, marginBottom:3 }}>{label}</div>
                              <div style={{ fontSize:13, color:'var(--text)', lineHeight:1.55 }}>{value}</div>
                            </div>
                          ))}
                          {/* Replies */}
                          {replies.length>0 && (
                            <div style={{ borderLeft:'2px solid var(--b2)', paddingLeft:10, marginTop:4, display:'flex', flexDirection:'column', gap:8 }}>
                              {replies.map(r=>{
                                const author = members.find(x=>x.id===r.authorId)
                                return (
                                  <div key={r.id}>
                                    <div style={{ fontSize:11, fontWeight:600, color:'var(--gold)', marginBottom:2 }}>{author?.full_name||'Leader'} <span style={{ fontSize:9, color:'var(--dim)', fontWeight:400 }}>{relativeTime(r.createdAt)}</span></div>
                                    <div style={{ fontSize:12, color:'var(--text2)', lineHeight:1.5 }}>{r.text}</div>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                          {/* Reply input */}
                          <div style={{ display:'flex', gap:6, marginTop:4 }}>
                            <input className="field-input" value={replyForms[key]||''}
                              onChange={e=>setReplyForms(f=>({...f,[key]:e.target.value.slice(0,300)}))}
                              onKeyDown={e=>e.key==='Enter'&&!e.shiftKey&&saveStandupReply(m.id,todayStr)}
                              placeholder="Reply to standup..."
                              style={{ flex:1, padding:'6px 10px', fontSize:12 }}/>
                            <button onClick={()=>saveStandupReply(m.id,todayStr)}
                              disabled={replySaving===key||!(replyForms[key]||'').trim()}
                              style={{ fontSize:11, padding:'6px 12px', borderRadius:6, cursor:'pointer',
                                background:'var(--text)', border:'none', color:'var(--bg)', fontWeight:600, flexShrink:0 }}>
                              {replySaving===key ? '...' : 'Send'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })()}

          {/* ── My Coaching Notes (agent view — visible to all members) ── */}
          {!isAdminOrOwner && myCoachingNotes.length > 0 && (
            <div>
              <div className="serif" style={{ fontSize:20, color:'var(--text)', marginBottom:14, letterSpacing:'-.01em' }}>📋 My Coaching Notes</div>
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {[...myCoachingNotes]
                  .sort((a,b) => (b.pinned?1:0)-(a.pinned?1:0) || new Date(b.createdAt)-new Date(a.createdAt))
                  .map(note => {
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
                          const myMember = members.find(m=>m.id===user?.id)
                          const myAgentReplies = myMember?.goals?.coaching_replies?.[note.id] || []
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
                            placeholder="Reply to your coach..."
                            style={{ flex:1, padding:'6px 10px', fontSize:12 }}/>
                          <button onClick={()=>saveReply(note.id)}
                            disabled={replySaving===note.id||!(replyForms[note.id]||'').trim()}
                            style={{ fontSize:11, padding:'6px 12px', borderRadius:6, cursor:'pointer',
                              background:'var(--text)', border:'none', color:'var(--bg)', fontWeight:600, flexShrink:0 }}>
                            {replySaving===note.id ? '...' : 'Send'}
                          </button>
                        </div>
                      </div>
                    )
                  })}
              </div>
            </div>
          )}

          {/* Empty state for non-admin with no notes */}
          {!isAdminOrOwner && myCoachingNotes.length === 0 && (
            <div className="card" style={{ padding:32, textAlign:'center' }}>
              <div style={{ fontSize:28, marginBottom:8 }}>📝</div>
              <div className="serif" style={{ fontSize:18, color:'var(--text)', marginBottom:6 }}>No Coaching Notes Yet</div>
              <div style={{ fontSize:13, color:'var(--muted)', lineHeight:1.6 }}>
                Your team leader hasn't added any coaching notes for you yet. Check back soon!
              </div>
            </div>
          )}

        </div>

      {/* Confirm modal */}
      {confirmModal && (
        <div className="modal-overlay" onClick={()=>setConfirmModal(null)}>
          <div className="modal-card" onClick={e=>e.stopPropagation()}>
            <div style={{ fontSize:14, color:'var(--text)', marginBottom:20, lineHeight:1.6 }}>{confirmModal.message}</div>
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
              <button className="btn-outline" onClick={()=>setConfirmModal(null)} style={{ fontSize:13 }}>Cancel</button>
              <button onClick={()=>{ confirmModal.onConfirm(); setConfirmModal(null) }}
                style={{ fontSize:13, padding:'9px 22px', borderRadius:8, cursor:'pointer',
                  background:'rgba(220,38,38,.1)', border:'1px solid rgba(220,38,38,.3)',
                  color:'var(--red)', fontWeight:600 }}>
                {confirmModal.label}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
