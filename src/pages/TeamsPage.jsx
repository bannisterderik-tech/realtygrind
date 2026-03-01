import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { CSS, Loader, Wordmark, ThemeToggle, Ring, getRank, CAT, StatCard, fmtMoney } from '../design'
import { HABITS } from '../habits'
import { canUseTeams, getMaxMembers, getPlan, isActiveBilling } from '../lib/plans'

const HABITS_FOR_DISPLAY = [
  { id:'prospecting', label:'Prospecting', cat:'leads' },
  { id:'appointments', label:'Appointments', cat:'leads' },
  { id:'showing', label:'Showings', cat:'leads' },
  { id:'newlisting', label:'Listings', cat:'listings' },
  { id:'market', label:'Market', cat:'market' },
]

// All 11 built-in habit IDs — used to exclude custom task rows from ring calculations
const BUILT_IN_HABIT_IDS = [
  'prospecting','followup','appointments','showing','newlisting',
  'social','crm','market','networking','training','review',
]
// Total month slots = 11 habits × 4 weeks × 7 days (matches App.jsx totalPossible)
const TOTAL_MONTH_SLOTS = BUILT_IN_HABIT_IDS.length * 28

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
  const [groupForm,      setGroupForm]      = useState(null)     // null | { name, leaderId, memberIds, editingId }
  const [groupSaving,    setGroupSaving]    = useState(false)
  const [groupView,      setGroupView]      = useState(null)     // null | groupId — full group dashboard
  const [groupChallengeForm,   setGroupChallengeForm]   = useState(null)  // null | { title, metric, bonusXp }
  const [groupChallengeSaving, setGroupChallengeSaving] = useState(false)
  const [adminSubTab,    setAdminSubTab]    = useState('coaching') // 'coaching'|'groups'|'standup'|'settings'
  const [filterAgent,    setFilterAgent]    = useState('all')         // 'all' | memberId
  const [noteForm,       setNoteForm]       = useState(null)          // null | { agentId, text, type, editingId }
  const [noteSaving,     setNoteSaving]     = useState(false)
  const [replyForms,     setReplyForms]     = useState({})            // { [noteId | userId_date]: string }
  const [replySaving,    setReplySaving]    = useState(null)          // id being saved, or null
  const [viewingMember,        setViewingMember]        = useState(null)  // member object | null
  const [memberDetail,         setMemberDetail]         = useState(null)  // { txs, habitCounts } | null
  const [memberDetailLoading,  setMemberDetailLoading]  = useState(false)
  const [inviteEmail,   setInviteEmail]   = useState('')
  const [inviteSending, setInviteSending] = useState(false)
  const [inviteMsg,     setInviteMsg]     = useState(null)   // null | { type:'ok'|'err', text }
  const [removeConfirm, setRemoveConfirm] = useState(null)   // null | memberId
  const [removeSaving,  setRemoveSaving]  = useState(false)
  const [transferTarget, setTransferTarget] = useState('')   // '' | memberId
  const [transferSaving, setTransferSaving] = useState(false)
  const [transferConfirm, setTransferConfirm] = useState(false) // two-step confirm
  const fetchSeqRef = useRef(0)  // increments per fetch; stale results are discarded
  const [confirmModal,    setConfirmModal]    = useState(null)   // { message, label, onConfirm } | null
  const [panelNoteForm,   setPanelNoteForm]   = useState(null)   // { text, type } | null
  const [panelNoteSaving, setPanelNoteSaving] = useState(false)
  const [teamListings,    setTeamListings]    = useState([])     // active listings for all team members

  const MONTH_YEAR = new Date().toISOString().slice(0,7)

  // Depend only on team_id — prevents re-fetching every time the profile object
  // is recreated (e.g. on token refresh) while nothing meaningful has changed.
  useEffect(()=>{
    if (profile?.team_id) {
      setMode('myteam'); fetchMembers(profile.team_id)
    } else if (profile !== null && !profile?.team_id) {
      // User left the team or has no team — reset to landing menu
      setMode('menu'); setMembers([]); setTeamData(null); setMemberStats({})
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[profile?.team_id])

  // If groupView points to a group that no longer exists (e.g. was deleted),
  // reset it — do this in an effect, NOT during render.
  useEffect(()=>{
    if (groupView) {
      const groups = teamData?.team_prefs?.groups || []
      if (!groups.find(g => g.id === groupView)) setGroupView(null)
    }
  },[groupView, teamData])

  // Escape key listener for member detail panel — attached via useEffect so it
  // doesn't interfere with the rest of the page while no panel is open.
  useEffect(()=>{
    if (!viewingMember) return
    const handleKey = (e) => {
      if (e.key === 'Escape') { setViewingMember(null); setMemberDetail(null) }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  },[viewingMember])

  async function fetchMembers(tid) {
    setLoading(true)
    try {
    const {data:mems} = await supabase.from('profiles').select('id,full_name,xp,streak,goals,habit_prefs').eq('team_id',tid).order('xp',{ascending:false})
    setMembers(mems||[])
    const {data:team} = await supabase.from('teams').select('*').eq('id',tid).single()
    setTeamData(team)
    // Load habit stats for all members
    if (mems?.length) {
      const ids = mems.map(m=>m.id)
      const {data:habs} = await supabase.from('habit_completions').select('user_id,habit_id,counter_value,week_index,day_index')
        .in('user_id',ids).eq('month_year',MONTH_YEAR).limit(5000)
      const {data:txs} = await supabase.from('transactions').select('user_id,type,price,commission')
        .in('user_id',ids).eq('month_year',MONTH_YEAR).limit(2000)
      const todayIdx = getTodayIndices()
      // Respect hidden habits so denominator matches what agents actually see
      const hiddenHabits = team?.team_prefs?.hidden || []
      const TOTAL_DAILY = Math.max(BUILT_IN_HABIT_IDS.length - hiddenHabits.length, 1)
      // Total possible for the full month = active habits × 4 weeks × 7 days
      const totalMonthSlots = TOTAL_DAILY * 28
      const stats = {}
      ids.forEach(id=>{
        const mh = (habs||[]).filter(h=>h.user_id===id)
        // Only count built-in habits — exclude custom task completions (stored as UUIDs)
        const mhBuiltIn = mh.filter(h => BUILT_IN_HABIT_IDS.includes(h.habit_id))
        const mt = (txs||[]).filter(t=>t.user_id===id)
        const habits = {}
        HABITS_FOR_DISPLAY.forEach(h=>{ habits[h.id] = mh.filter(x=>x.habit_id===h.id).reduce((a,x)=>a+(x.counter_value||1),0) })
        const closedVol  = mt.filter(t=>t.type==='closed').reduce((a,t)=>{ const n=parseFloat(String(t.price||'').replace(/[^0-9.]/g,'')); return a+(isNaN(n)?0:n) },0)
        const closedComm = mt.filter(t=>t.type==='closed').reduce((a,t)=>{ const n=parseFloat(String(t.commission||'').replace(/[^0-9.]/g,'')); return a+(isNaN(n)?0:n) },0)
        const todayRows  = mhBuiltIn.filter(h => h.week_index===todayIdx.week && h.day_index===todayIdx.day)
        const todayDone  = new Set(todayRows.map(h=>h.habit_id)).size
        // monthDays = unique (habit × day) combos for built-ins only, capped at total slots
        const monthDays  = new Set(mhBuiltIn.map(h=>`${h.habit_id}-${h.week_index}-${h.day_index}`)).size
        const monthlyPct = Math.min(Math.round(monthDays / totalMonthSlots * 100), 100)
        stats[id] = {
          habits, closed:mt.filter(t=>t.type==='closed').length, closedVol, closedComm,
          totalHabits: mhBuiltIn.length,
          todayDone, todayPct: Math.min(Math.round(todayDone / TOTAL_DAILY * 100), 100),
          monthlyPct, appts: habits.appointments||0, showings: habits.showing||0,
        }
      })
      setMemberStats(stats)

      // Load active listings for all members
      const { data: listRows } = await supabase
        .from('listings')
        .select('id,address,status,price,commission,user_id')
        .in('user_id', ids)
        .neq('status', 'closed')
        .gt('unit_count', 0)
        .order('created_at', { ascending: false })
        .limit(500)
      const nameMap = Object.fromEntries((mems||[]).map(m=>[m.id, m.full_name||'Agent']))
      setTeamListings((listRows||[]).map(l=>({ ...l, agentName: nameMap[l.user_id]||'Agent' })))
    }
    } catch (err) {
      console.error('fetchMembers error:', err)
      setError('Failed to load team data. Please refresh.')
    } finally {
      setLoading(false)
    }
  }

  async function fetchMemberDetail(member) {
    // Prevent concurrent fetches from stomping each other
    const seq = ++fetchSeqRef.current
    setViewingMember(member)
    setMemberDetail(null)
    setRemoveConfirm(null)
    setPanelNoteForm(null)
    setMemberDetailLoading(true)
    try {
      const [{ data: txs }, { data: habs }, { data: activeLists }] = await Promise.all([
        supabase.from('transactions').select('id,type,price,commission,address')
          .eq('user_id', member.id).eq('month_year', MONTH_YEAR),
        supabase.from('habit_completions').select('habit_id,counter_value')
          .eq('user_id', member.id).eq('month_year', MONTH_YEAR),
        supabase.from('listings').select('id,address,status,price,commission,unit_count')
          .eq('user_id', member.id).neq('status', 'closed').gt('unit_count', 0),
      ])
      if (seq !== fetchSeqRef.current) return  // a newer click fired — discard these results
      const habitCounts = {}
      BUILT_IN_HABIT_IDS.forEach(id => {
        habitCounts[id] = (habs||[])
          .filter(h => h.habit_id === id)
          .reduce((a, h) => a + (h.counter_value || 1), 0)
      })
      setMemberDetail({ txs: txs||[], habitCounts, activeLists: activeLists||[] })
    } finally {
      if (seq === fetchSeqRef.current) setMemberDetailLoading(false)
    }
  }

  async function createTeam() {
    if (!teamName.trim()) return
    if (!canUseTeams(profile)) {
      setError('Creating a team requires a Team or Brokerage plan.')
      return
    }
    setLoading(true); setError('')
    try {
      const code = Math.random().toString(36).slice(2,7).toUpperCase()
      const maxMem = getMaxMembers(profile.plan)
      const {data:team,error:e} = await supabase.from('teams')
        .insert({name:teamName.trim(), created_by:user.id, invite_code:code, max_members: maxMem === Infinity ? null : maxMem}).select().single()
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
      // Check member limit
      const {count} = await supabase.from('team_members').select('id',{count:'exact',head:true}).eq('team_id',team.id)
      if (team.max_members && count >= team.max_members) throw new Error(`This team has reached its member limit (${team.max_members}). Ask the team owner to upgrade their plan.`)
      await supabase.from('team_members').insert({team_id:team.id, user_id:user.id, role:'member'})
      await supabase.from('profiles').update({team_id:team.id}).eq('id',user.id)
      await refreshProfile()
      setSuccess(`You joined "${team.name}"!`)
      setMode('myteam'); fetchMembers(team.id)
    } catch(e) { setError(e.message) }
    setLoading(false)
  }

  async function leaveTeam() {
    setLoading(true); setError('')
    try {
      // Clean up any group membership/leadership before leaving
      const groups = teamData?.team_prefs?.groups || []
      const needsCleanup = groups.some(g => g.memberIds.includes(user.id) || g.leaderId === user.id)
      if (needsCleanup) {
        const updatedGroups = groups.map(g => ({
          ...g,
          leaderId: g.leaderId === user.id ? '' : g.leaderId,
          memberIds: g.memberIds.filter(id => id !== user.id),
        }))
        const newPrefs = { ...(teamData.team_prefs||{}), groups: updatedGroups }
        const { error: e0 } = await supabase.from('teams').update({ team_prefs: newPrefs }).eq('id', profile.team_id)
        if (e0) throw e0
      }
      const { error: e1 } = await supabase.from('team_members').delete().eq('user_id', user.id)
      if (e1) throw e1
      const { error: e2 } = await supabase.from('profiles').update({ team_id: null }).eq('id', user.id)
      if (e2) throw e2
      await refreshProfile()
      setMode('menu'); setMembers([]); setTeamData(null)
    } catch (err) {
      setError('Failed to leave team. Please try again.')
      console.error('leaveTeam error:', err)
    } finally {
      setLoading(false)
    }
  }

  // ── Remove Member (owner-only) ────────────────────────────────────────────
  async function removeMember(memberId) {
    setRemoveSaving(true); setError('')
    // Build updated prefs optimistically
    const groups = (teamData?.team_prefs?.groups || []).map(g => ({
      ...g,
      leaderId:  g.leaderId  === memberId ? '' : g.leaderId,
      memberIds: g.memberIds.filter(id => id !== memberId),
    }))
    const admins = (teamData?.team_prefs?.admins || []).filter(id => id !== memberId)
    const newPrefs = { ...(teamData.team_prefs || {}), groups, admins }
    try {
      const { error: e1 } = await supabase.from('teams').update({ team_prefs: newPrefs }).eq('id', profile.team_id)
      if (e1) throw e1
      const { error: e2 } = await supabase.from('team_members').delete().eq('user_id', memberId).eq('team_id', profile.team_id)
      if (e2) throw e2
      const { error: e3 } = await supabase.from('profiles').update({ team_id: null }).eq('id', memberId)
      if (e3) throw e3
      setTeamData(td => ({ ...td, team_prefs: newPrefs }))
      setMembers(ms => ms.filter(m => m.id !== memberId))
      setRemoveConfirm(null)
      setViewingMember(null); setMemberDetail(null)
    } catch (err) {
      setError('Failed to remove member. Please try again.')
      console.error('removeMember error:', err)
    } finally {
      setRemoveSaving(false)
    }
  }

  // ── Transfer Ownership (owner-only) ──────────────────────────────────────
  async function transferOwnership(newOwnerId) {
    if (!newOwnerId) return
    setTransferSaving(true); setError('')
    try {
      const { error } = await supabase.from('teams').update({ created_by: newOwnerId }).eq('id', profile.team_id)
      if (error) throw error
      setTeamData(td => ({ ...td, created_by: newOwnerId }))
      setTransferTarget('')
      setTransferConfirm(false)
      await refreshProfile()  // current user is now a regular member
    } catch (err) {
      setError('Failed to transfer ownership. Please try again.')
      console.error('transferOwnership error:', err)
    } finally {
      setTransferSaving(false)
    }
  }

  // ── Toggle Co-admin (owner-only) ──────────────────────────────────────────
  async function toggleAdmin(memberId) {
    const current = teamData?.team_prefs?.admins || []
    const updated = current.includes(memberId)
      ? current.filter(id => id !== memberId)
      : [...current, memberId]
    const newPrefs = { ...(teamData.team_prefs || {}), admins: updated }
    try {
      const { error } = await supabase.from('teams').update({ team_prefs: newPrefs }).eq('id', profile.team_id)
      if (error) throw error
      setTeamData(td => ({ ...td, team_prefs: newPrefs }))
    } catch (err) {
      setError('Failed to update admin role. Please try again.')
      console.error('toggleAdmin error:', err)
    }
  }

  // ── Email Invite ──────────────────────────────────────────────────────────
  async function sendInvite() {
    const email = inviteEmail.trim().toLowerCase()
    if (!email) return
    // Basic email format check before hitting the API
    if (!email.includes('@') || !email.includes('.')) {
      setInviteMsg({ type:'err', text: 'Please enter a valid email address.' })
      return
    }
    setInviteSending(true); setInviteMsg(null)
    try {
      // Check member limit before sending invite
      if (teamData?.max_members) {
        const currentCount = members.length
        const pendingCount = (teamData?.team_prefs?.pending_invites || []).length
        if (currentCount + pendingCount >= teamData.max_members) {
          throw new Error(`Team is at capacity (${teamData.max_members} members). Upgrade your plan to add more.`)
        }
      }
      // Use raw fetch — supabase.functions.invoke doesn't support the new publishable key format
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/invite-member`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ email, teamId: profile.team_id }),
        }
      )
      const result = await resp.json()
      if (!resp.ok) {
        const raw = result.error || 'Failed to send invite.'
        const alreadyExists = /already (registered|exists|invited)/i.test(raw) || /user.*exist/i.test(raw)
        throw new Error(
          alreadyExists
            ? `${email} already has an account. Share your invite code with them and they can join directly.`
            : raw
        )
      }
      // Track in team_prefs.pending_invites
      const existing = teamData?.team_prefs?.pending_invites || []
      if (!existing.find(i => i.email === email)) {
        const newPrefs = { ...(teamData?.team_prefs||{}),
          pending_invites: [...existing, { email, invitedAt: new Date().toISOString(), invitedBy: user.id }]
        }
        await supabase.from('teams').update({ team_prefs: newPrefs }).eq('id', profile.team_id)
        setTeamData(td => ({ ...td, team_prefs: newPrefs }))
      }
      setInviteEmail('')
      setInviteMsg({ type:'ok', text:`Invite sent to ${email}` })
    } catch(e) {
      setInviteMsg({ type:'err', text: e.message || 'Failed to send invite.' })
    } finally {
      setInviteSending(false)
    }
  }

  async function removeInvite(email) {
    const updated = (teamData?.team_prefs?.pending_invites || []).filter(i => i.email !== email)
    const newPrefs = { ...(teamData?.team_prefs||{}), pending_invites: updated }
    try {
      const { error } = await supabase.from('teams').update({ team_prefs: newPrefs }).eq('id', profile.team_id)
      if (error) throw error
      setTeamData(td => ({ ...td, team_prefs: newPrefs }))
    } catch (err) {
      console.error('removeInvite error:', err)
    }
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
    try {
      const { error } = await supabase.from('teams').update({ team_prefs: updated }).eq('id', profile.team_id)
      if (error) throw error
      setTeamData(td => ({ ...td, team_prefs: updated }))
      setChallengeForm(null)
    } catch (err) {
      setError('Failed to save challenge. Please try again.')
      console.error('saveChallenge error:', err)
    } finally {
      setChallengeSaving(false)
    }
  }

  async function endChallenge(challengeId) {
    const challenge = (teamData?.team_prefs?.challenges||[]).find(c=>c.id===challengeId)
    if (!challenge) return
    // Find winner
    const ranked = [...members].sort((a,b) => getMemberMetricVal(b.id, challenge.metric) - getMemberMetricVal(a.id, challenge.metric))
    const winner = ranked[0]
    if (!winner) return
    try {
      // Award bonus XP
      if (challenge.bonusXp > 0) {
        const newXp = (winner.xp||0) + challenge.bonusXp
        const { error: xpErr } = await supabase.from('profiles').update({ xp: newXp }).eq('id', winner.id)
        if (xpErr) throw xpErr
        setMembers(ms => ms.map(m => m.id===winner.id ? {...m, xp:newXp} : m))
      }
      // Mark ended
      const updated = {
        ...(teamData?.team_prefs||{}),
        challenges: (teamData.team_prefs?.challenges||[]).map(c =>
          c.id===challengeId ? { ...c, status:'ended', winnerId:winner.id } : c
        )
      }
      const { error } = await supabase.from('teams').update({ team_prefs: updated }).eq('id', profile.team_id)
      if (error) throw error
      setTeamData(td => ({ ...td, team_prefs: updated }))
    } catch (err) {
      setError('Failed to end challenge. Please try again.')
      console.error('endChallenge error:', err)
    }
  }

  // ── Accountability Groups ─────────────────────────────────────────────────
  async function saveGroup() {
    if (!groupForm?.name?.trim()) return
    setGroupSaving(true)
    // Safety: always ensure the leader is included in memberIds
    const leaderId   = groupForm.leaderId || ''
    const memberIds  = leaderId && !groupForm.memberIds.includes(leaderId)
      ? [...groupForm.memberIds, leaderId]
      : groupForm.memberIds
    const existing = teamData?.team_prefs?.groups || []
    let updated
    if (groupForm.editingId) {
      updated = existing.map(g => g.id===groupForm.editingId
        ? { ...g, name:groupForm.name.trim(), leaderId, memberIds } : g)
    } else {
      updated = [...existing, {
        id: Date.now().toString(36),
        name: groupForm.name.trim(),
        leaderId,
        memberIds,
      }]
    }
    const newPrefs = { ...(teamData?.team_prefs||{}), groups: updated }
    try {
      const { error } = await supabase.from('teams').update({ team_prefs: newPrefs }).eq('id', profile.team_id)
      if (error) throw error
      setTeamData(td => ({ ...td, team_prefs: newPrefs }))
      setGroupForm(null)
    } catch (err) {
      setError('Failed to save group. Please try again.')
      console.error('saveGroup error:', err)
    } finally {
      setGroupSaving(false)
    }
  }

  async function deleteGroup(gid) {
    const updated = (teamData?.team_prefs?.groups||[]).filter(g => g.id !== gid)
    const newPrefs = { ...(teamData?.team_prefs||{}), groups: updated }
    try {
      const { error } = await supabase.from('teams').update({ team_prefs: newPrefs }).eq('id', profile.team_id)
      if (error) throw error
      setTeamData(td => ({ ...td, team_prefs: newPrefs }))
    } catch (err) {
      setError('Failed to delete group. Please try again.')
      console.error('deleteGroup error:', err)
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

  // ── Group Challenges ──────────────────────────────────────────────────────
  async function saveGroupChallenge(groupId) {
    if (!groupChallengeForm?.title?.trim()) return
    setGroupChallengeSaving(true)
    const groups = teamData?.team_prefs?.groups || []
    const newChallenge = {
      id: Date.now().toString(36),
      title: groupChallengeForm.title.trim(),
      metric: groupChallengeForm.metric,
      bonusXp: parseInt(groupChallengeForm.bonusXp) || 0,
      status: 'active',
      createdAt: new Date().toISOString(),
    }
    const updatedGroups = groups.map(g => g.id === groupId
      ? { ...g, challenges: [...(g.challenges||[]), newChallenge] } : g)
    const newPrefs = { ...(teamData.team_prefs||{}), groups: updatedGroups }
    try {
      const { error } = await supabase.from('teams').update({ team_prefs: newPrefs }).eq('id', profile.team_id)
      if (error) throw error
      setTeamData(td => ({ ...td, team_prefs: newPrefs }))
      setGroupChallengeForm(null)
    } catch (err) {
      setError('Failed to save group challenge. Please try again.')
      console.error('saveGroupChallenge error:', err)
    } finally {
      setGroupChallengeSaving(false)
    }
  }

  async function endGroupChallenge(groupId, challengeId) {
    const groups = teamData?.team_prefs?.groups || []
    const group  = groups.find(g => g.id === groupId)
    if (!group) return
    const challenge = (group.challenges||[]).find(c => c.id === challengeId)
    if (!challenge) return
    const groupMems = members.filter(m => group.memberIds.includes(m.id))
    const ranked = [...groupMems].sort((a,b) => getMemberMetricVal(b.id, challenge.metric) - getMemberMetricVal(a.id, challenge.metric))
    const winner = ranked[0]
    if (!winner) return
    try {
      if (challenge.bonusXp > 0) {
        const newXp = (winner.xp||0) + challenge.bonusXp
        const { error: xpErr } = await supabase.from('profiles').update({ xp: newXp }).eq('id', winner.id)
        if (xpErr) throw xpErr
        setMembers(ms => ms.map(m => m.id===winner.id ? { ...m, xp:newXp } : m))
      }
      const updatedGroups = groups.map(g => g.id === groupId
        ? { ...g, challenges: (g.challenges||[]).map(c =>
            c.id===challengeId ? { ...c, status:'ended', winnerId: winner.id } : c) }
        : g)
      const newPrefs = { ...(teamData.team_prefs||{}), groups: updatedGroups }
      const { error } = await supabase.from('teams').update({ team_prefs: newPrefs }).eq('id', profile.team_id)
      if (error) throw error
      setTeamData(td => ({ ...td, team_prefs: newPrefs }))
    } catch (err) {
      setError('Failed to end group challenge. Please try again.')
      console.error('endGroupChallenge error:', err)
    }
  }

  // ── Coaching Notes ────────────────────────────────────────────────────────
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
    // Owner and group leaders reply via teams table; regular agents reply via their own profile
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
        // Agent writes reply to their own profile row (always allowed)
        const existingReplies = profile?.goals?.coaching_replies || {}
        const noteReplies = existingReplies[noteId] || []
        const updatedCoachingReplies = { ...existingReplies, [noteId]: [...noteReplies, newReply] }
        const updatedGoals = { ...(profile?.goals||{}), coaching_replies: updatedCoachingReplies }
        const { error } = await supabase.from('profiles').update({ goals: updatedGoals }).eq('id', user.id)
        if (error) throw error
        // Optimistically update members list so coach can see it after next fetch
        setMembers(ms => ms.map(m => m.id===user.id ? { ...m, goals: updatedGoals } : m))
      }
      setReplyForms(f => ({ ...f, [noteId]: '' }))
    } catch (err) {
      console.error('saveReply error:', err)
    } finally {
      setReplySaving(null)
    }
  }

  // ── Coaching note from the detail panel (pre-sets agentId = viewingMember) ──
  async function savePanelNote() {
    if (!panelNoteForm?.text?.trim() || !viewingMember?.id || !user?.id) return
    const trimmed = panelNoteForm.text.trim().slice(0, MAX_NOTE_LEN)
    setPanelNoteSaving(true)
    try {
      const existing = teamData?.team_prefs?.coaching_notes || []
      const newNote = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2,5),
        agentId:   viewingMember.id,
        coachId:   user.id,
        text:      trimmed,
        type:      panelNoteForm.type || 'general',
        pinned:    false,
        replies:   [],
        createdAt: new Date().toISOString(),
      }
      const updatedPrefs = { ...(teamData?.team_prefs||{}), coaching_notes: [...existing, newNote] }
      const { error } = await supabase.from('teams').update({ team_prefs: updatedPrefs }).eq('id', profile?.team_id)
      if (error) throw error
      setTeamData(td => ({ ...td, team_prefs: updatedPrefs }))
      setPanelNoteForm(null)
    } catch (err) {
      setError('Failed to save note. Please try again.')
      console.error('savePanelNote error:', err)
    } finally {
      setPanelNoteSaving(false)
    }
  }

  // ── Derived values ─────────────────────────────────────────────────────────
  const isTeamOwner      = !!(teamData?.created_by === user?.id)
  const teamAdmins       = teamData?.team_prefs?.admins || []
  const isAdmin          = teamAdmins.includes(user?.id) && !isTeamOwner
  const allGroups        = teamData?.team_prefs?.groups || []
  const myLedGroup       = allGroups.find(g => g.leaderId === user?.id) || null
  const isGroupLeader    = !!myLedGroup && !isTeamOwner && !isAdmin
  const myGroupMembers   = myLedGroup ? members.filter(m => myLedGroup.memberIds.includes(m.id)) : []
  const canViewDetail    = (m) => isTeamOwner || isAdmin || (isGroupLeader && myLedGroup?.memberIds.includes(m.id))
  const isAdminOrOwner   = isTeamOwner || isAdmin || isGroupLeader
  const coachableMembers = (isGroupLeader && !isAdmin && !isTeamOwner)
    ? myGroupMembers
    : members.filter(m => m.id !== user?.id)
  const allCoachingNotes = teamData?.team_prefs?.coaching_notes || []
  const myCoachingNotes  = allCoachingNotes.filter(n => n.agentId === user?.id)
  const pendingInvites   = teamData?.team_prefs?.pending_invites || []

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
            <div style={{ maxWidth:560, animation:'fadeUp .25s ease' }}>
              {!canUseTeams(profile) && (() => {
                const hasSub = profile?.stripe_customer_id && isActiveBilling(profile?.billing_status)
                const currentPlan = getPlan(profile?.plan)
                return (
                  <div className="card" style={{ padding:24, marginBottom:16, borderLeft:'3px solid #d97706',
                    background:'rgba(217,119,6,.06)' }}>
                    <div style={{ fontWeight:700, color:'var(--text)', fontSize:15, marginBottom:6 }}>
                      Teams require a Team plan ($99/mo)
                    </div>
                    <div style={{ fontSize:13, color:'var(--muted)', lineHeight:1.6, marginBottom:14 }}>
                      {hasSub && currentPlan
                        ? `You're on the ${currentPlan.name} plan. Upgrade to Team to create and manage teams with up to 15 agents.`
                        : 'Start a 14-day free trial of the Team plan to create and manage teams with up to 15 agents.'}
                    </div>
                    {hasSub ? (
                      <button className="btn-gold" onClick={async () => {
                        setLoading(true)
                        try {
                          const { data, error: e } = await supabase.functions.invoke('create-portal-session', {
                            body: { returnUrl: window.location.origin }
                          })
                          if (e) throw e
                          if (data?.url) window.location.href = data.url
                        } catch (err) { setError('Could not open billing portal.') }
                        setLoading(false)
                      }} disabled={loading} style={{ fontSize:13, padding:'10px 20px' }}>
                        {loading ? 'Opening...' : 'Upgrade via Billing Portal'}
                      </button>
                    ) : (
                      <button className="btn-gold" onClick={async () => {
                        setLoading(true)
                        try {
                          const { data, error: e } = await supabase.functions.invoke('create-checkout', {
                            body: { planId: 'team', isAnnual: false, returnUrl: window.location.origin }
                          })
                          if (e) throw e
                          if (data?.url) window.location.href = data.url
                        } catch (err) { setError('Could not start checkout.') }
                        setLoading(false)
                      }} disabled={loading} style={{ fontSize:13, padding:'10px 20px' }}>
                        {loading ? 'Redirecting...' : 'Start Team Plan — Free 14-Day Trial'}
                      </button>
                    )}
                  </div>
                )
              })()}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
              <div className="card" style={{ padding:28, textAlign:'center', cursor: canUseTeams(profile) ? 'pointer' : 'default',
                opacity: canUseTeams(profile) ? 1 : .5 }}
                onClick={() => canUseTeams(profile) && setMode('create')}>
                <div style={{ fontSize:40, marginBottom:14 }}>🏗️</div>
                <div className="serif" style={{ fontSize:20, color:'var(--text)', marginBottom:8 }}>Create a Team</div>
                <div style={{ fontSize:13, color:'var(--muted)', lineHeight:1.6 }}>Start a team and invite colleagues with a code.</div>
                <button className="btn-primary" disabled={!canUseTeams(profile)} style={{ marginTop:16, width:'100%' }}>Create Team</button>
              </div>
              <div className="card" style={{ padding:28, textAlign:'center', cursor:'pointer' }}
                onClick={()=>setMode('join')}>
                <div style={{ fontSize:40, marginBottom:14 }}>🤝</div>
                <div className="serif" style={{ fontSize:20, color:'var(--text)', marginBottom:8 }}>Join a Team</div>
                <div style={{ fontSize:13, color:'var(--muted)', lineHeight:1.6 }}>Enter an invite code to join an existing team.</div>
                <button className="btn-outline" style={{ marginTop:16, width:'100%' }}>Join Team</button>
              </div>
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

                  {/* ── Group Dashboard (full-page view when a group is selected) ── */}
                  {groupView && (()=>{
                    const group = allGroups.find(g => g.id === groupView)
                    if (!group) return null // useEffect above will reset groupView
                    const groupLeaderMember = members.find(m => m.id === group.leaderId)
                    const groupMems   = members.filter(m => group.memberIds.includes(m.id))
                    const todayStr    = new Date().toISOString().slice(0,10)
                    const canManageGroup = isTeamOwner || group.leaderId === user?.id
                    const activeChallenges = (group.challenges||[]).filter(c=>c.status==='active')
                    const endedChallenges  = (group.challenges||[]).filter(c=>c.status==='ended').slice(-3).reverse()
                    return (
                      <div style={{ animation:'fadeUp .2s ease' }}>
                        {/* Header */}
                        <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:24, flexWrap:'wrap' }}>
                          <button className="btn-outline" style={{ fontSize:12, padding:'7px 14px' }}
                            onClick={()=>{ setGroupView(null); setGroupChallengeForm(null) }}>← Back</button>
                          <div>
                            <div className="serif" style={{ fontSize:26, color:'var(--text)', lineHeight:1.1 }}>🫂 {group.name}</div>
                            <div style={{ fontSize:12, color:'var(--muted)', marginTop:3 }}>
                              {groupMems.length} member{groupMems.length!==1?'s':''} ·{' '}
                              {groupLeaderMember ? `👑 ${groupLeaderMember.full_name}` : 'No leader assigned'}
                            </div>
                          </div>
                        </div>

                        {/* Members grid */}
                        <div style={{ marginBottom:32 }}>
                          <div className="serif" style={{ fontSize:20, color:'var(--text)', marginBottom:14 }}>👥 Members</div>
                          {groupMems.length === 0 && <div style={{ fontSize:13, color:'var(--muted)', fontStyle:'italic' }}>No members yet.</div>}
                          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:12 }}>
                            {groupMems.map(m => {
                              const rank    = getRank(m.xp||0)
                              const stats   = memberStats[m.id]||{}
                              const isLead  = m.id === group.leaderId
                              return (
                                <div key={m.id} className="card" style={{ padding:14,
                                  cursor: canViewDetail(m) ? 'pointer' : 'default',
                                  border: isLead ? '1px solid rgba(139,92,246,.3)' : '1px solid var(--b2)' }}
                                  onClick={canViewDetail(m) && !memberDetailLoading ? ()=>fetchMemberDetail(m) : undefined}>
                                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
                                    <div style={{ width:34, height:34, borderRadius:'50%',
                                      background:`linear-gradient(135deg,${rank.color},${rank.color}99)`,
                                      display:'flex', alignItems:'center', justifyContent:'center',
                                      fontSize:13, fontWeight:700, color:'#fff', flexShrink:0 }}>
                                      {(m.full_name||'A').charAt(0).toUpperCase()}
                                    </div>
                                    <div style={{ flex:1, minWidth:0 }}>
                                      <div style={{ fontSize:13, fontWeight:600, color:'var(--text)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{m.full_name||'Agent'}</div>
                                      <div style={{ fontSize:10, color:'var(--muted)' }}>{rank.name} · 🔥{m.streak||0}</div>
                                    </div>
                                    {isLead && <span style={{ fontSize:9, padding:'2px 5px', borderRadius:4, background:'rgba(139,92,246,.12)', color:'#8b5cf6', fontWeight:700, flexShrink:0 }}>LEAD</span>}
                                  </div>
                                  <div style={{ display:'flex', gap:10, justifyContent:'center' }}>
                                    <div style={{ textAlign:'center' }}>
                                      <div style={{ fontSize:9, color:'var(--muted)', marginBottom:4 }}>TODAY</div>
                                      <Ring pct={stats.todayPct||0} size={52} color={rank.color}/>
                                    </div>
                                    <div style={{ textAlign:'center' }}>
                                      <div style={{ fontSize:9, color:'var(--muted)', marginBottom:4 }}>MONTH</div>
                                      <Ring pct={stats.monthlyPct||0} size={52} color='#0ea5e9'/>
                                    </div>
                                  </div>
                                  {canViewDetail(m) && <div style={{ marginTop:8, fontSize:10, color:'var(--dim)', textAlign:'center' }}>Click to view details</div>}
                                </div>
                              )
                            })}
                          </div>
                        </div>

                        {/* Group Challenges */}
                        <div style={{ marginBottom:32 }}>
                          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
                            <div className="serif" style={{ fontSize:20, color:'var(--text)' }}>🏆 Group Challenges</div>
                            {canManageGroup && !groupChallengeForm && (
                              <button className="btn-outline" style={{ fontSize:12 }}
                                onClick={()=>setGroupChallengeForm({ title:'', metric:'prospecting', bonusXp:'100' })}>
                                + New Challenge
                              </button>
                            )}
                          </div>
                          {canManageGroup && groupChallengeForm && (
                            <div className="card" style={{ padding:20, marginBottom:16, border:'1px solid rgba(217,119,6,.3)', background:'var(--gold3)' }}>
                              <div className="serif" style={{ fontSize:15, color:'var(--text)', marginBottom:14 }}>New Group Challenge</div>
                              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                                <div>
                                  <div className="label" style={{ marginBottom:5 }}>Title</div>
                                  <input className="field-input" value={groupChallengeForm.title}
                                    onChange={e=>setGroupChallengeForm(f=>({...f,title:e.target.value}))}
                                    placeholder="e.g. Most Calls This Week 📞" style={{ width:'100%' }}/>
                                </div>
                                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                                  <div>
                                    <div className="label" style={{ marginBottom:5 }}>Metric</div>
                                    <select className="field-input" value={groupChallengeForm.metric}
                                      onChange={e=>setGroupChallengeForm(f=>({...f,metric:e.target.value}))} style={{ width:'100%' }}>
                                      {CHALLENGE_METRICS.map(m=><option key={m.value} value={m.value}>{m.label}</option>)}
                                    </select>
                                  </div>
                                  <div>
                                    <div className="label" style={{ marginBottom:5 }}>Bonus XP</div>
                                    <input type="number" className="field-input" value={groupChallengeForm.bonusXp}
                                      onChange={e=>setGroupChallengeForm(f=>({...f,bonusXp:e.target.value}))}
                                      placeholder="e.g. 300" style={{ width:'100%' }}/>
                                  </div>
                                </div>
                                <div style={{ display:'flex', gap:8 }}>
                                  <button className="btn-primary" onClick={()=>saveGroupChallenge(group.id)}
                                    disabled={groupChallengeSaving||!groupChallengeForm.title.trim()}
                                    style={{ fontSize:13, padding:'9px 22px' }}>
                                    {groupChallengeSaving?'Saving…':'🚀 Launch Challenge'}
                                  </button>
                                  <button className="btn-outline" onClick={()=>setGroupChallengeForm(null)} style={{ fontSize:13 }}>Cancel</button>
                                </div>
                              </div>
                            </div>
                          )}
                          {activeChallenges.length===0 && !groupChallengeForm && (
                            <div style={{ fontSize:13, color:'var(--muted)', fontStyle:'italic', padding:'8px 0' }}>
                              {canManageGroup ? 'No active challenges — create one to motivate your group!' : 'No active challenges right now.'}
                            </div>
                          )}
                          {activeChallenges.map(c=>{
                            const metricLabel = CHALLENGE_METRICS.find(m=>m.value===c.metric)?.label || c.metric
                            const ranked = [...groupMems].map(m=>({ ...m, val:getMemberMetricVal(m.id,c.metric) })).sort((a,b)=>b.val-a.val)
                            const maxVal = Math.max(...ranked.map(r=>r.val), 1)
                            return (
                              <div key={c.id} className="card" style={{ padding:20, marginBottom:12, border:'1px solid rgba(217,119,6,.2)' }}>
                                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14, gap:8 }}>
                                  <div>
                                    <div style={{ fontWeight:700, fontSize:15, color:'var(--text)' }}>{c.title}</div>
                                    <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>
                                      {metricLabel} · {c.bonusXp>0?`+${c.bonusXp} XP for winner`:'Bragging rights'}
                                    </div>
                                  </div>
                                  {canManageGroup && (
                                    <button onClick={()=>setConfirmModal({ message:'Award XP to the current leader and end this challenge?', label:'End & Award', onConfirm:()=>endGroupChallenge(group.id,c.id) })}
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
                                          {m.id===user?.id && <span style={{ marginLeft:5, fontSize:9, color:'var(--muted)' }}>(you)</span>}
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
                          {endedChallenges.length>0 && (
                            <details style={{ marginTop:8 }}>
                              <summary style={{ fontSize:12, color:'var(--muted)', cursor:'pointer', userSelect:'none' }}>Past challenges ({endedChallenges.length})</summary>
                              <div style={{ marginTop:8, display:'flex', flexDirection:'column', gap:8 }}>
                                {endedChallenges.map(c=>{
                                  const winner = groupMems.find(m=>m.id===c.winnerId)
                                  return (
                                    <div key={c.id} style={{ padding:'10px 14px', borderRadius:9, background:'var(--bg2)', border:'1px solid var(--b1)', fontSize:12, color:'var(--muted)' }}>
                                      <span style={{ fontWeight:600, color:'var(--text)' }}>{c.title}</span>
                                      {winner && <span> — 🏆 {winner.full_name||'Agent'} won {c.bonusXp>0?`+${c.bonusXp} XP`:''}</span>}
                                    </div>
                                  )
                                })}
                              </div>
                            </details>
                          )}
                        </div>

                        {/* Group Listings */}
                        {(()=>{
                          const groupListings = teamListings.filter(l => groupMems.some(m=>m.id===l.user_id))
                          if (!groupListings.length) return null
                          return (
                            <div style={{ marginBottom:32 }}>
                              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
                                <div className="serif" style={{ fontSize:20, color:'var(--text)' }}>🏠 Active Listings</div>
                                <span style={{ fontSize:11, padding:'3px 10px', borderRadius:20, fontWeight:600,
                                  background:'rgba(16,185,129,.1)', color:'var(--green)', border:'1px solid rgba(16,185,129,.2)' }}>
                                  {groupListings.length} active
                                </span>
                              </div>
                              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                                {groupListings.map(l => {
                                  const pA = v => { const n=parseFloat(String(v||'').replace(/[^0-9.]/g,'')); return isNaN(n)?0:n }
                                  const price = pA(l.price); const comm = pA(l.commission)
                                  const isMe  = l.user_id === user?.id
                                  const sc    = l.status === 'pending' ? '#6366f1' : '#10b981'
                                  return (
                                    <div key={l.id} style={{ padding:'12px 16px', borderRadius:10,
                                      border:`1px solid ${isMe ? 'rgba(217,119,6,.3)' : 'var(--b2)'}`,
                                      background: isMe ? 'var(--gold3)' : 'var(--surface)' }}>
                                      <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:(price>0||comm>0)?6:0 }}>
                                        <span style={{ fontSize:9, padding:'2px 7px', borderRadius:4, fontWeight:700,
                                          background:`${sc}15`, color:sc, border:`1px solid ${sc}30`,
                                          textTransform:'uppercase', letterSpacing:'.5px', flexShrink:0 }}>
                                          {l.status || 'Active'}
                                        </span>
                                        {l.address && (
                                          <span style={{ fontSize:13, color:'var(--text)', fontWeight:500, flex:1, minWidth:0,
                                            overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{l.address}</span>
                                        )}
                                        <span style={{ fontSize:11, flexShrink:0, whiteSpace:'nowrap',
                                          color: isMe ? 'var(--gold)' : 'var(--dim)', fontWeight: isMe ? 700 : 400 }}>
                                          {isMe ? '⭐ You' : l.agentName}
                                        </span>
                                      </div>
                                      {(price>0 || comm>0) && (
                                        <div style={{ display:'flex', gap:20 }}>
                                          {price>0 && <div>
                                            <div style={{ fontSize:9, color:'var(--dim)', fontWeight:700, letterSpacing:'.5px' }}>LIST PRICE</div>
                                            <div style={{ fontSize:13, color:'var(--text)', fontWeight:600, fontFamily:"'JetBrains Mono',monospace" }}>{fmtMoney(price)}</div>
                                          </div>}
                                          {comm>0 && <div>
                                            <div style={{ fontSize:9, color:'var(--dim)', fontWeight:700, letterSpacing:'.5px' }}>COMMISSION</div>
                                            <div style={{ fontSize:13, color:'var(--green)', fontWeight:600, fontFamily:"'JetBrains Mono',monospace" }}>{fmtMoney(comm)}</div>
                                          </div>}
                                        </div>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          )
                        })()}

                        {/* Standup Feed */}
                        <div>
                          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
                            <div className="serif" style={{ fontSize:20, color:'var(--text)' }}>⚡ Today's Standups</div>
                            <div style={{ fontSize:12, color:'var(--muted)' }}>
                              {groupMems.filter(m=>m.habit_prefs?.standup_today?.date===todayStr).length}/{groupMems.length} submitted
                            </div>
                          </div>
                          {groupMems.length===0 && <div style={{ fontSize:13, color:'var(--muted)', fontStyle:'italic' }}>No members yet.</div>}
                          {groupMems.map(m=>{
                            const sd = m.habit_prefs?.standup_today
                            const submitted = sd?.date === todayStr
                            const rank = getRank(m.xp||0)
                            const key  = `${m.id}_${todayStr}`
                            const replies = teamData?.team_prefs?.standup_replies?.[key] || []
                            return (
                              <div key={m.id} className="card" style={{ padding:18, marginBottom:12,
                                borderLeft: submitted ? '3px solid var(--green)' : '3px solid var(--b2)',
                                opacity: submitted ? 1 : 0.65 }}>
                                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:submitted?14:0 }}>
                                  <div style={{ width:34, height:34, borderRadius:'50%',
                                    background:`linear-gradient(135deg,${rank.color},${rank.color}88)`,
                                    display:'flex', alignItems:'center', justifyContent:'center',
                                    fontSize:14, fontWeight:700, color:'#fff', flexShrink:0 }}>
                                    {(m.full_name||'?').charAt(0).toUpperCase()}
                                  </div>
                                  <div style={{ flex:1, minWidth:0 }}>
                                    <div style={{ fontSize:14, fontWeight:600, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{m.full_name||'Agent'}</div>
                                    <div style={{ fontSize:11, color:'var(--muted)' }}>{submitted ? 'Submitted today' : 'Not submitted yet'}</div>
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
                                    {replies.length>0 && (
                                      <div style={{ borderLeft:'2px solid var(--b2)', paddingLeft:10, marginTop:4, display:'flex', flexDirection:'column', gap:8 }}>
                                        {replies.map(r=>{
                                          const author = members.find(x=>x.id===r.authorId)
                                          return (
                                            <div key={r.id}>
                                              <div style={{ fontSize:11, fontWeight:600, color:'var(--gold)', marginBottom:2 }}>
                                                {author?.full_name||'Leader'} <span style={{ fontSize:9, color:'var(--dim)', fontWeight:400 }}>{relativeTime(r.createdAt)}</span>
                                              </div>
                                              <div style={{ fontSize:12, color:'var(--text2)', lineHeight:1.5 }}>{r.text}</div>
                                            </div>
                                          )
                                        })}
                                      </div>
                                    )}
                                    {canManageGroup && (
                                      <div style={{ display:'flex', gap:6, marginTop:4 }}>
                                        <input className="field-input" value={replyForms[key]||''}
                                          onChange={e=>setReplyForms(f=>({...f,[key]:e.target.value.slice(0,300)}))}
                                          onKeyDown={e=>e.key==='Enter'&&!e.shiftKey&&saveStandupReply(m.id,todayStr)}
                                          placeholder="Reply to standup…"
                                          style={{ flex:1, padding:'6px 10px', fontSize:12 }}/>
                                        <button onClick={()=>saveStandupReply(m.id,todayStr)}
                                          disabled={replySaving===key||!(replyForms[key]||'').trim()}
                                          style={{ fontSize:11, padding:'6px 12px', borderRadius:6, cursor:'pointer',
                                            background:'var(--text)', border:'none', color:'var(--bg)', fontWeight:600, flexShrink:0 }}>
                                          {replySaving===key ? '…' : 'Send'}
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })()}

                  {/* ── Normal team view (hidden when group dashboard is open) ── */}
                  {!groupView && <>

                  {/* Team header */}
                  {teamData && (
                    <div className="card" style={{ padding:22, marginBottom:16, display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:14,
                      background:'linear-gradient(135deg, rgba(217,119,6,.04) 0%, var(--surface) 60%)', borderTop:'2px solid rgba(217,119,6,.3)' }}>
                      <div>
                        <div className="serif" style={{ fontSize:28, color:'var(--text)', marginBottom:4, letterSpacing:'-.01em' }}>{teamData.name}</div>
                        <div style={{ fontSize:12, color:'var(--muted)' }}>{members.length} member{members.length!==1?'s':''}</div>
                      </div>
                      <div style={{ display:'flex', gap:12, alignItems:'center' }}>
                        <div className="card-inset" style={{ padding:'10px 20px', textAlign:'center' }}>
                          <div className="label" style={{ marginBottom:4 }}>Invite Code</div>
                          <div className="mono" style={{ fontSize:22, fontWeight:700, color:'var(--gold)', letterSpacing:5 }}>
                            {teamData.invite_code}
                          </div>
                        </div>
                        {/* Owner and group leaders cannot leave — owner created the team, leaders must resign first */}
                        {!isTeamOwner && !isGroupLeader && (
                          <button onClick={()=>setConfirmModal({ message:'Leave this team? Your group membership will also be removed.', label:'Leave Team', onConfirm:leaveTeam })} style={{
                            background:'rgba(220,38,38,.06)', border:'1px solid rgba(220,38,38,.2)',
                            color:'var(--red)', borderRadius:8, padding:'9px 16px', cursor:'pointer', fontSize:12, fontWeight:600
                          }}>Leave Team</button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* ── Invite by Email (owner only) ─────────────────────── */}
                  {isTeamOwner && (
                    <div className="card" style={{
                      padding:'18px 20px', marginBottom:16,
                      borderLeft:'3px solid var(--gold2)',
                      background:'linear-gradient(135deg, rgba(217,119,6,.06) 0%, var(--surface) 55%)',
                    }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
                        <span style={{ fontSize:16 }}>✉️</span>
                        <span className="serif" style={{ fontSize:15, color:'var(--text)', fontWeight:600 }}>Invite Members by Email</span>
                        <span style={{ fontSize:11, color:'var(--muted)', marginLeft:'auto' }}>They'll receive a setup link</span>
                      </div>
                      <div style={{ display:'flex', gap:8, marginBottom: inviteMsg ? 10 : 0 }}>
                        <input className="field-input" type="text" value={inviteEmail}
                          onChange={e=>{ setInviteEmail(e.target.value); setInviteMsg(null) }}
                          onKeyDown={e=>e.key==='Enter'&&sendInvite()}
                          placeholder="agent@brokerage.com" style={{ flex:1 }}/>
                        <button type="button" className="btn-primary" onClick={sendInvite}
                          disabled={inviteSending || !inviteEmail.trim()}
                          style={{ fontSize:13, padding:'9px 20px', whiteSpace:'nowrap' }}>
                          {inviteSending ? 'Sending…' : 'Send Invite'}
                        </button>
                      </div>
                      {inviteMsg && (
                        <div style={{ fontSize:12, marginBottom: pendingInvites.length ? 12 : 0,
                          color: inviteMsg.type==='ok' ? 'var(--green)' : 'var(--red)' }}>
                          {inviteMsg.type==='ok' ? '✓ ' : '✗ '}{inviteMsg.text}
                        </div>
                      )}
                      {pendingInvites.length > 0 && (
                        <div>
                          <div style={{ fontSize:10, color:'var(--muted)', fontWeight:700, letterSpacing:'.5px',
                            textTransform:'uppercase', marginBottom:6, borderTop:'1px solid var(--b2)', paddingTop:10 }}>
                            Pending Invites
                          </div>
                          {pendingInvites.map(inv => (
                            <div key={inv.email} style={{ display:'flex', alignItems:'center', gap:8,
                              padding:'6px 0', borderBottom:'1px solid var(--b2)' }}>
                              <div style={{ flex:1, fontSize:12, color:'var(--text)' }}>{inv.email}</div>
                              <div style={{ fontSize:11, color:'var(--muted)' }}>{relativeTime(inv.invitedAt)}</div>
                              <button type="button" onClick={()=>removeInvite(inv.email)} style={{ background:'none', border:'none',
                                cursor:'pointer', color:'var(--muted)', fontSize:15, padding:'0 4px', lineHeight:1 }}
                                title="Remove invite">✕</button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* My Groups section — shows ALL groups the user belongs to */}
                  {(()=>{
                    const myGroups = allGroups.filter(g => g.memberIds.includes(user?.id) || g.leaderId===user?.id)
                    if (myGroups.length === 0 && !isTeamOwner) return (
                      <div style={{ border:'1.5px dashed var(--b2)', borderRadius:10, padding:'18px 20px',
                        fontSize:13, color:'var(--muted)', textAlign:'center', marginBottom:16 }}>
                        🫂 Not in a group yet. Ask your team owner to add you.
                      </div>
                    )
                    if (myGroups.length === 0) return null
                    return (
                      <>
                        {myGroups.map(myGroup => {
                          const isLeader  = myGroup.leaderId === user?.id
                          const groupMates = members.filter(m => (myGroup.memberIds.includes(m.id) || myGroup.leaderId===m.id) && m.id!==user?.id)
                          const me = members.find(m => m.id===user?.id)
                          return (
                            <div key={myGroup.id} className="card" style={{ padding:20, marginBottom:16,
                              border:'1px solid rgba(139,92,246,.3)',
                              background:'linear-gradient(135deg, rgba(139,92,246,.05) 0%, var(--surface) 70%)' }}>
                              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14, flexWrap:'wrap' }}>
                                <span style={{ fontSize:18 }}>🫂</span>
                                <span className="serif" style={{ fontSize:18, color:'var(--text)' }}>{myGroup.name}</span>
                                {isLeader && <span style={{ fontSize:10, padding:'2px 8px', borderRadius:10, background:'rgba(139,92,246,.12)', color:'#8b5cf6', fontWeight:700 }}>LEADER</span>}
                                <span style={{ fontSize:11, padding:'2px 8px', borderRadius:10, background:'rgba(139,92,246,.08)', color:'#8b5cf6', fontWeight:600 }}>{myGroup.memberIds.length} members</span>
                                {(isLeader || isTeamOwner) && (
                                  <button className="btn-outline" style={{ marginLeft:'auto', fontSize:11, padding:'5px 12px' }}
                                    onClick={()=>{ setGroupView(myGroup.id); setGroupChallengeForm(null) }}>
                                    View Dashboard →
                                  </button>
                                )}
                              </div>
                              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:12 }}>
                                {me && (()=>{
                                  const myRank  = getRank(me.xp||0)
                                  const myStats = memberStats[me.id]||{}
                                  return (
                                    <div className="card" style={{ padding:14, border:'1px solid rgba(217,119,6,.3)', background:'var(--gold3)' }}>
                                      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
                                        <div style={{ width:34, height:34, borderRadius:'50%',
                                          background:`linear-gradient(135deg,${myRank.color},${myRank.color}99)`,
                                          display:'flex', alignItems:'center', justifyContent:'center',
                                          fontSize:13, fontWeight:700, color:'#fff', flexShrink:0 }}>
                                          {(me.full_name||'A').charAt(0).toUpperCase()}
                                        </div>
                                        <div style={{ flex:1, minWidth:0 }}>
                                          <div style={{ fontSize:13, fontWeight:600, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{me.full_name||'Agent'}</div>
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
                                {groupMates.map(mate=>{
                                  const mateRank  = getRank(mate.xp||0)
                                  const mateStats = memberStats[mate.id]||{}
                                  const isLeaderMate = myGroup.leaderId === mate.id
                                  return (
                                    <div key={mate.id} className="card" style={{ padding:14,
                                      cursor: isLeader ? 'pointer' : 'default',
                                      border: isLeaderMate ? '1px solid rgba(139,92,246,.3)' : '1px solid var(--b2)' }}
                                      onClick={isLeader && !memberDetailLoading && !viewingMember ? ()=>fetchMemberDetail(mate) : undefined}>
                                      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
                                        <div style={{ width:34, height:34, borderRadius:'50%',
                                          background:`linear-gradient(135deg,${mateRank.color},${mateRank.color}99)`,
                                          display:'flex', alignItems:'center', justifyContent:'center',
                                          fontSize:13, fontWeight:700, color:'#fff', flexShrink:0 }}>
                                          {(mate.full_name||'A').charAt(0).toUpperCase()}
                                        </div>
                                        <div style={{ flex:1, minWidth:0 }}>
                                          <div style={{ fontSize:13, fontWeight:600, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{mate.full_name||'Agent'}</div>
                                          <div style={{ fontSize:10, color:'var(--muted)' }}>{mateRank.name} · 🔥 {mate.streak||0}</div>
                                        </div>
                                        {isLeaderMate && <span style={{ fontSize:9, padding:'2px 5px', borderRadius:4, background:'rgba(139,92,246,.1)', color:'#8b5cf6', fontWeight:700 }}>LEAD</span>}
                                      </div>
                                      <div style={{ display:'flex', gap:10, justifyContent:'center' }}>
                                        <div style={{ textAlign:'center' }}>
                                          <div style={{ fontSize:9, color:'var(--muted)', marginBottom:4 }}>TODAY</div>
                                          <Ring pct={mateStats.todayPct||0} size={52} color={mateRank.color}/>
                                        </div>
                                        <div style={{ textAlign:'center' }}>
                                          <div style={{ fontSize:9, color:'var(--muted)', marginBottom:4 }}>MONTH</div>
                                          <Ring pct={mateStats.monthlyPct||0} size={52} color='#0ea5e9'/>
                                        </div>
                                      </div>
                                      {isLeader && <div style={{ marginTop:8, fontSize:10, color:'var(--dim)', textAlign:'center' }}>Click to view details</div>}
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          )
                        })}
                      </>
                    )
                  })()}

                  {/* Tab bar */}
                  <div className="tabs" style={{ marginBottom:16 }}>
                    <button className={`tab-item${teamsTab==='roster'?' on':''}`} onClick={()=>setTeamsTab('roster')}>👥 Roster</button>
                    {isAdminOrOwner && (
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
                      const isAdminMember = teamAdmins.includes(m.id)
                      const bio   = m.habit_prefs?.bio || {}
                      return (
                        <div key={m.id} className={`card${isMe?' ':' '}`}
                          onClick={(canViewDetail(m) && !memberDetailLoading && !viewingMember) ? ()=>fetchMemberDetail(m) : undefined}
                          style={{
                            padding:18, border:`1px solid ${isMe?'rgba(217,119,6,.35)':'var(--b2)'}`,
                            background:isMe?'var(--gold3)':'var(--surface)',
                            cursor: (canViewDetail(m) && !memberDetailLoading && !viewingMember) ? 'pointer' : 'default',
                            transition:'opacity .15s',
                            opacity: (isAdminOrOwner && memberDetailLoading) ? 0.6 : 1,
                          }}>
                          <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:stats?10:0 }}>
                            <div className="mono" style={{ width:26, fontSize:12, color:'var(--dim)', textAlign:'center', fontWeight:700 }}>
                              {i+1}
                            </div>
                            <div style={{ width:38, height:38, borderRadius:'50%',
                              background:`linear-gradient(135deg, ${rank.color}, ${rank.color}99)`,
                              display:'flex', alignItems:'center', justifyContent:'center',
                              fontSize:15, fontWeight:700, color:'#fff', flexShrink:0, letterSpacing:0,
                              boxShadow:`0 2px 8px ${rank.color}44` }}>
                              {(m.full_name||'A').charAt(0).toUpperCase()}
                            </div>
                            <div style={{ flex:1, minWidth:0 }}>
                              <div style={{ display:'flex', alignItems:'center', gap:7, flexWrap:'wrap' }}>
                                <span style={{ fontSize:14, fontWeight:600, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:'100%' }}>{m.full_name||'Agent'}</span>
                                {isMe && <span style={{ fontSize:9, padding:'2px 6px', borderRadius:4, background:'var(--gold4)', color:'var(--gold)', fontWeight:700 }}>YOU</span>}
                                {isOwner && <span style={{ fontSize:9, padding:'2px 6px', borderRadius:4, background:'rgba(139,92,246,.12)', color:'#8b5cf6', fontWeight:700 }}>OWNER</span>}
                                {isAdminMember && !isOwner && <span style={{ fontSize:9, padding:'2px 6px', borderRadius:4, background:'rgba(14,165,233,.12)', color:'#0ea5e9', fontWeight:700 }}>ADMIN</span>}
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
                          {/* Bio snippet — specialty + phone */}
                          {(bio.specialty || bio.phone) && (
                            <div style={{ marginTop:7, display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
                              {bio.specialty && <span style={{ fontSize:10, padding:'2px 7px', borderRadius:4,
                                background:'rgba(14,165,233,.1)', color:'#0ea5e9', border:'1px solid rgba(14,165,233,.2)' }}>
                                {bio.specialty}
                              </span>}
                              {bio.phone && <span style={{ fontSize:10, color:'var(--muted)', fontFamily:'monospace' }}>
                                📞 {bio.phone}
                              </span>}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {/* ── Team Listings ── */}
                  {teamListings.length > 0 && (
                    <div style={{ marginTop:28 }}>
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
                        <div className="serif" style={{ fontSize:20, color:'var(--text)' }}>🏠 Active Listings</div>
                        <span style={{ fontSize:11, padding:'3px 10px', borderRadius:20, fontWeight:600,
                          background:'rgba(16,185,129,.1)', color:'var(--green)', border:'1px solid rgba(16,185,129,.2)' }}>
                          {teamListings.length} active
                        </span>
                      </div>
                      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                        {teamListings.map(l => {
                          const pA = v => { const n=parseFloat(String(v||'').replace(/[^0-9.]/g,'')); return isNaN(n)?0:n }
                          const price = pA(l.price); const comm = pA(l.commission)
                          const isMe  = l.user_id === user?.id
                          const sc    = l.status === 'pending' ? '#6366f1' : '#10b981'
                          return (
                            <div key={l.id} style={{ padding:'12px 16px', borderRadius:10,
                              border:`1px solid ${isMe ? 'rgba(217,119,6,.3)' : 'var(--b2)'}`,
                              background: isMe ? 'var(--gold3)' : 'var(--surface)' }}>
                              <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:(price>0||comm>0)?6:0 }}>
                                <span style={{ fontSize:9, padding:'2px 7px', borderRadius:4, fontWeight:700,
                                  background:`${sc}15`, color:sc, border:`1px solid ${sc}30`,
                                  textTransform:'uppercase', letterSpacing:'.5px', flexShrink:0 }}>
                                  {l.status || 'Active'}
                                </span>
                                {l.address && (
                                  <span style={{ fontSize:13, color:'var(--text)', fontWeight:500, flex:1, minWidth:0,
                                    overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{l.address}</span>
                                )}
                                <span style={{ fontSize:11, flexShrink:0, whiteSpace:'nowrap',
                                  color: isMe ? 'var(--gold)' : 'var(--dim)', fontWeight: isMe ? 700 : 400 }}>
                                  {isMe ? '⭐ You' : l.agentName}
                                </span>
                              </div>
                              {(price>0 || comm>0) && (
                                <div style={{ display:'flex', gap:20 }}>
                                  {price>0 && <div>
                                    <div style={{ fontSize:9, color:'var(--dim)', fontWeight:700, letterSpacing:'.5px' }}>LIST PRICE</div>
                                    <div style={{ fontSize:13, color:'var(--text)', fontWeight:600, fontFamily:"'JetBrains Mono',monospace" }}>{fmtMoney(price)}</div>
                                  </div>}
                                  {comm>0 && <div>
                                    <div style={{ fontSize:9, color:'var(--dim)', fontWeight:700, letterSpacing:'.5px' }}>COMMISSION</div>
                                    <div style={{ fontSize:13, color:'var(--green)', fontWeight:600, fontFamily:"'JetBrains Mono',monospace" }}>{fmtMoney(comm)}</div>
                                  </div>}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

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
                                  <button onClick={()=>setConfirmModal({ message:'Award XP to the current leader and end this challenge?', label:'End & Award', onConfirm:()=>endChallenge(c.id) })}
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
                      <div className="serif" style={{ fontSize:20, color:'var(--text)', marginBottom:14, letterSpacing:'-.01em' }}>📋 My Coaching Notes</div>
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
                  {teamsTab==='admin' && isAdminOrOwner && (
                    <div>
                      {/* Admin sub-tab bar */}
                      <div className="tabs" style={{ marginBottom:20 }}>
                        <button className={`tab-item${adminSubTab==='coaching'?' on':''}`} onClick={()=>setAdminSubTab('coaching')}>📝 Coaching</button>
                        {(isTeamOwner||isAdmin) && <button className={`tab-item${adminSubTab==='groups'?' on':''}`} onClick={()=>setAdminSubTab('groups')}>🫂 Groups</button>}
                        <button className={`tab-item${adminSubTab==='standup'?' on':''}`} onClick={()=>setAdminSubTab('standup')}>⚡ Standup</button>
                        {isTeamOwner && <button className={`tab-item${adminSubTab==='settings'?' on':''}`} onClick={()=>setAdminSubTab('settings')}>⚙️ Settings</button>}
                      </div>

                      {/* Coaching sub-tab */}
                      {adminSubTab==='coaching' && (
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
                            const NC = { praise:'#10b981', goal:'#d97706', concern:'#f43f5e', general:'#0ea5e9' }
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
                                              placeholder="Reply…"
                                              style={{ flex:1, padding:'6px 10px', fontSize:12 }}/>
                                            <button onClick={()=>saveReply(note.id)}
                                              disabled={replySaving===note.id||!(replyForms[note.id]||'').trim()}
                                              style={{ fontSize:11, padding:'6px 12px', borderRadius:6, cursor:'pointer',
                                                background:'var(--text)', border:'none', color:'var(--bg)', fontWeight:600, flexShrink:0 }}>
                                              {replySaving===note.id ? '…' : 'Send'}
                                            </button>
                                          </div>

                                          {/* Pin/Delete only for team owner — group leaders lack DB write access */}
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
                                    <option value="">Select agent…</option>
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
                                    onChange={e=>setNoteForm(f=>({...f,text:e.target.value.slice(0,500)}))}
                                    placeholder="Write your coaching note here…" rows={4}
                                    style={{ width:'100%', resize:'vertical', minHeight:90 }}/>
                                  <div style={{ fontSize:10, color:'var(--dim)', textAlign:'right', marginTop:3 }}>
                                    {(noteForm.text||'').length}/500
                                  </div>
                                </div>
                                <div style={{ display:'flex', gap:8 }}>
                                  <button className="btn-primary" onClick={saveNote}
                                    disabled={noteSaving||!noteForm.text?.trim()||!noteForm.agentId||noteForm.agentId===user?.id}
                                    style={{ fontSize:13, padding:'9px 22px' }}>
                                    {noteSaving ? 'Saving…' : 'Save Note'}
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

                      {/* Groups sub-tab — owner full access; admins read-only */}
                      {adminSubTab==='groups' && (isTeamOwner || isAdmin) && (
                        <div>
                          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
                            <div>
                              <div className="serif" style={{ fontSize:20, color:'var(--text)', marginBottom:2 }}>🫂 Accountability Groups</div>
                              <div style={{ fontSize:12, color:'var(--muted)' }}>Assign a leader to each group — leaders can coach and view their members' activity.</div>
                            </div>
                            {isTeamOwner && !groupForm && (
                              <button className="btn-outline" onClick={()=>setGroupForm({ name:'', leaderId:'', memberIds:[], editingId:null })}
                                style={{ fontSize:12 }}>+ New Group</button>
                            )}
                          </div>

                          {isTeamOwner && groupForm && (
                            <div className="card" style={{ padding:20, marginBottom:16, border:'1px solid rgba(139,92,246,.3)', background:'rgba(139,92,246,.04)' }}>
                              <div className="serif" style={{ fontSize:15, color:'var(--text)', marginBottom:14 }}>
                                {groupForm.editingId ? 'Edit Group' : 'New Group'}
                              </div>
                              <div style={{ marginBottom:12 }}>
                                <div className="label" style={{ marginBottom:5 }}>Group Name</div>
                                <input className="field-input" value={groupForm.name}
                                  onChange={e=>setGroupForm(f=>({...f,name:e.target.value}))}
                                  placeholder="e.g. Alpha Team" style={{ width:'100%' }}/>
                              </div>
                              <div style={{ marginBottom:12 }}>
                                <div className="label" style={{ marginBottom:5 }}>Group Leader</div>
                                <select className="field-input" value={groupForm.leaderId}
                                  onChange={e=>{
                                    const newLeaderId = e.target.value
                                    setGroupForm(f=>({
                                      ...f,
                                      leaderId: newLeaderId,
                                      // auto-add the new leader to members if not already included
                                      memberIds: newLeaderId && !f.memberIds.includes(newLeaderId)
                                        ? [...f.memberIds, newLeaderId]
                                        : f.memberIds,
                                    }))
                                  }} style={{ width:'100%' }}>
                                  <option value="">Select a leader…</option>
                                  {members.map(m=><option key={m.id} value={m.id}>{m.full_name||'Agent'}</option>)}
                                </select>
                              </div>
                              <div style={{ marginBottom:12 }}>
                                <div className="label" style={{ marginBottom:8 }}>Members (any number)</div>
                                <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                                  {members.map(m=>{
                                    const isLeader = groupForm.leaderId === m.id
                                    const checked  = isLeader || groupForm.memberIds.includes(m.id)
                                    const mRank    = getRank(m.xp||0)
                                    return (
                                      <label key={m.id} style={{ display:'flex', alignItems:'center', gap:8,
                                        cursor: isLeader ? 'not-allowed' : 'pointer',
                                        padding:'6px 10px', borderRadius:6,
                                        background:checked?'rgba(139,92,246,.08)':'var(--bg2)',
                                        border:`1px solid ${checked?'rgba(139,92,246,.3)':'var(--b1)'}`,
                                        opacity: isLeader ? 0.85 : 1 }}>
                                        <input type="checkbox" checked={checked} disabled={isLeader}
                                          title={isLeader ? 'Leader is always a member of their group' : undefined}
                                          onChange={e=>!isLeader && setGroupForm(f=>({...f, memberIds: e.target.checked
                                            ? [...f.memberIds, m.id]
                                            : f.memberIds.filter(id=>id!==m.id)
                                          }))}/>
                                        <span style={{ fontSize:14 }}>{mRank.icon}</span>
                                        <span style={{ fontSize:13, fontWeight:500, color:'var(--text)' }}>{m.full_name||'Agent'}</span>
                                        {isLeader && <span style={{ fontSize:10, padding:'1px 6px', borderRadius:4, background:'rgba(139,92,246,.18)', color:'#8b5cf6', fontWeight:700 }}>LEADER</span>}
                                        {isLeader && <span style={{ fontSize:10, color:'var(--dim)', marginLeft:'auto' }}>always a member</span>}
                                      </label>
                                    )
                                  })}
                                </div>
                              </div>
                              <div style={{ display:'flex', gap:8 }}>
                                <button className="btn-primary" onClick={saveGroup} disabled={groupSaving||!groupForm.name.trim()}
                                  style={{ fontSize:13, padding:'9px 22px' }}>
                                  {groupSaving?'Saving…':'Save Group'}
                                </button>
                                <button className="btn-outline" onClick={()=>setGroupForm(null)} style={{ fontSize:13 }}>Cancel</button>
                              </div>
                            </div>
                          )}

                          {allGroups.length===0 && !groupForm && (
                            <div style={{ fontSize:13, color:'var(--muted)', fontStyle:'italic', padding:'12px 0' }}>
                              No groups yet. Create one to assign leaders and build accountability.
                            </div>
                          )}
                          {allGroups.map(grp=>{
                            const leader = members.find(m=>m.id===grp.leaderId)
                            return (
                              <div key={grp.id} className="card" style={{ padding:16, marginBottom:10 }}>
                                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:10 }}>
                                  <div>
                                    <div style={{ fontWeight:600, fontSize:14, color:'var(--text)', marginBottom:4 }}>🫂 {grp.name}</div>
                                    <div style={{ fontSize:12, color:'var(--muted)', marginBottom:4 }}>
                                      {grp.memberIds.length} {grp.memberIds.length===1?'member':'members'} · {grp.memberIds.map(id=>members.find(m=>m.id===id)?.full_name||'?').join(', ')}
                                    </div>
                                    {leader && <div style={{ fontSize:11, color:'#8b5cf6', fontWeight:600 }}>👑 Leader: {leader.full_name||'Agent'}</div>}
                                  </div>
                                  <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                                    <button className="btn-outline" style={{ fontSize:11, padding:'5px 10px' }}
                                      onClick={()=>{ setGroupView(grp.id); setGroupChallengeForm(null) }}>
                                      📊 Dashboard
                                    </button>
                                    {isTeamOwner && (<>
                                      <button className="btn-outline" style={{ fontSize:11, padding:'5px 10px' }}
                                        onClick={()=>{
                                          const safeMemberIds = grp.leaderId && !grp.memberIds.includes(grp.leaderId)
                                            ? [...grp.memberIds, grp.leaderId]
                                            : [...grp.memberIds]
                                          setGroupForm({ name:grp.name, leaderId:grp.leaderId, memberIds:safeMemberIds, editingId:grp.id })
                                        }}>
                                        Edit
                                      </button>
                                      <button onClick={()=>setConfirmModal({ message:`Delete the group "${grp.name}"? Members won't be removed from the team.`, label:'Delete Group', onConfirm:()=>deleteGroup(grp.id) })}
                                        style={{ background:'rgba(220,38,38,.06)', border:'1px solid rgba(220,38,38,.2)',
                                          color:'var(--red)', borderRadius:7, padding:'5px 10px', cursor:'pointer', fontSize:11, fontWeight:600 }}>
                                        ✕
                                      </button>
                                    </>)}
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}

                      {/* Standup sub-tab — owner sees all, group leader sees their group */}
                      {adminSubTab==='standup' && (()=>{
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
                                          placeholder="Reply to standup…"
                                          style={{ flex:1, padding:'6px 10px', fontSize:12 }}/>
                                        <button onClick={()=>saveStandupReply(m.id,todayStr)}
                                          disabled={replySaving===key||!(replyForms[key]||'').trim()}
                                          style={{ fontSize:11, padding:'6px 12px', borderRadius:6, cursor:'pointer',
                                            background:'var(--text)', border:'none', color:'var(--bg)', fontWeight:600, flexShrink:0 }}>
                                          {replySaving===key ? '…' : 'Send'}
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
                    </div>
                  )}

                      {/* ── Settings sub-tab (owner only) ─────────────────── */}
                      {teamsTab==='admin' && adminSubTab==='settings' && isTeamOwner && (
                        <div>
                          {/* Team Admins */}
                          <div style={{ marginBottom:32 }}>
                            <div className="serif" style={{ fontSize:20, color:'var(--text)', marginBottom:6 }}>👑 Team Admins</div>
                            <div style={{ fontSize:13, color:'var(--muted)', marginBottom:16, lineHeight:1.6 }}>
                              Admins can view all member details, write coaching notes for any agent, and see all standups. They cannot manage groups or transfer ownership.
                            </div>
                            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                              {members.filter(m=>m.id!==user?.id).map(m => {
                                const isAdminMember = teamAdmins.includes(m.id)
                                const rank = getRank(m.xp||0)
                                return (
                                  <div key={m.id} className="card" style={{ padding:'12px 16px', display:'flex', alignItems:'center', gap:12 }}>
                                    <div style={{ width:32, height:32, borderRadius:'50%', flexShrink:0,
                                      background:`linear-gradient(135deg,${rank.color},${rank.color}99)`,
                                      display:'flex', alignItems:'center', justifyContent:'center',
                                      fontSize:13, fontWeight:700, color:'#fff' }}>
                                      {(m.full_name||'A').charAt(0).toUpperCase()}
                                    </div>
                                    <div style={{ flex:1, minWidth:0 }}>
                                      <div style={{ fontSize:13, fontWeight:600, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{m.full_name||'Agent'}</div>
                                      <div style={{ fontSize:11, color:'var(--muted)' }}>{rank.name}</div>
                                    </div>
                                    {isAdminMember && <span style={{ fontSize:9, padding:'2px 6px', borderRadius:4, background:'rgba(14,165,233,.12)', color:'#0ea5e9', fontWeight:700, flexShrink:0 }}>ADMIN</span>}
                                    <button onClick={()=>toggleAdmin(m.id)}
                                      style={{ fontSize:11, padding:'6px 14px', borderRadius:6, cursor:'pointer', flexShrink:0,
                                        border: isAdminMember ? '1px solid rgba(220,38,38,.3)' : '1px solid rgba(14,165,233,.3)',
                                        background: isAdminMember ? 'rgba(220,38,38,.07)' : 'rgba(14,165,233,.07)',
                                        color: isAdminMember ? 'var(--red)' : '#0ea5e9', fontWeight:600 }}>
                                      {isAdminMember ? 'Remove Admin' : 'Make Admin'}
                                    </button>
                                  </div>
                                )
                              })}
                              {members.filter(m=>m.id!==user?.id).length===0 && (
                                <div style={{ fontSize:13, color:'var(--muted)', fontStyle:'italic' }}>No other members yet.</div>
                              )}
                            </div>
                          </div>

                          {/* Transfer Ownership — danger zone */}
                          <div style={{ border:'1px solid rgba(220,38,38,.25)', borderRadius:12, padding:24 }}>
                            <div className="serif" style={{ fontSize:18, color:'var(--red)', marginBottom:8 }}>⚠️ Transfer Ownership</div>
                            <div style={{ fontSize:13, color:'var(--muted)', marginBottom:16, lineHeight:1.6 }}>
                              This is permanent. You will become a regular member and lose all owner controls. The selected member will become the new team owner.
                            </div>
                            <div style={{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
                              <select className="field-input" value={transferTarget}
                                onChange={e=>{ setTransferTarget(e.target.value); setTransferConfirm(false) }}
                                style={{ flex:1, minWidth:160 }}>
                                <option value="">— Select new owner —</option>
                                {members.filter(m=>m.id!==user?.id).map(m=>(
                                  <option key={m.id} value={m.id}>{m.full_name||'Agent'}</option>
                                ))}
                              </select>
                              {!transferConfirm ? (
                                <button onClick={()=>setTransferConfirm(true)}
                                  disabled={!transferTarget}
                                  style={{ fontSize:12, padding:'9px 18px', borderRadius:7, cursor: transferTarget ? 'pointer' : 'not-allowed',
                                    border:'1px solid rgba(220,38,38,.3)', background:'rgba(220,38,38,.08)',
                                    color: transferTarget ? 'var(--red)' : 'var(--dim)', fontWeight:600, flexShrink:0 }}>
                                  Transfer Ownership
                                </button>
                              ) : (
                                <div style={{ display:'flex', gap:8 }}>
                                  <button className="btn-outline" style={{ fontSize:12 }}
                                    onClick={()=>setTransferConfirm(false)} disabled={transferSaving}>Cancel</button>
                                  <button onClick={()=>transferOwnership(transferTarget)} disabled={transferSaving}
                                    style={{ fontSize:12, padding:'9px 18px', borderRadius:7,
                                      border:'1px solid var(--red)', background:'rgba(220,38,38,.15)',
                                      color:'var(--red)', cursor:'pointer', fontWeight:700, flexShrink:0 }}>
                                    {transferSaving ? 'Transferring…' : '⚠️ Confirm Transfer'}
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                  </>} {/* end !groupView normal view */}

                </>
              )}
            </div>
          )}
        </div>
      </div>
      {/* ── Member detail overlay (owner / admin / group leader) ── */}
      {viewingMember && isAdminOrOwner && (() => {
        const rank  = getRank(viewingMember.xp || 0)
        const stats = memberStats[viewingMember.id] || {}
        const txs         = memberDetail?.txs || []
        const habitCounts = memberDetail?.habitCounts || {}
        const activeLists = memberDetail?.activeLists || []
        const parseAmt = str => { const n = parseFloat(String(str||'').replace(/[^0-9.]/g,'')); return isNaN(n)?0:n }
        const byType = t => txs.filter(x => x.type === t)
        const closed     = byType('closed')
        const pending    = byType('pending')
        const offersMade = byType('offer_made')
        const offersRec  = byType('offer_received')
        const listings   = byType('listing')
        const buyerReps  = byType('buyer_rep')
        const closedVol  = closed.reduce((a,t) => a + parseAmt(t.price), 0)
        const closedComm = closed.reduce((a,t) => a + parseAmt(t.commission), 0)
        const TYPE_META  = {
          listing:        { label:'Listing',      color:'#8b5cf6' },
          buyer_rep:      { label:'Buyer Rep',    color:'#0ea5e9' },
          offer_made:     { label:'Offer Made',   color:'#d97706' },
          offer_received: { label:"Offer Rec'd",  color:'#f97316' },
          pending:        { label:'Pending',      color:'#6366f1' },
          closed:         { label:'Closed',       color:'var(--green)' },
        }
        const closePanel = () => { setViewingMember(null); setMemberDetail(null); setRemoveConfirm(null); setPanelNoteForm(null) }
        return (
          <div style={{ position:'fixed', inset:0, zIndex:1000, display:'flex' }}>
            {/* Backdrop — no animation, appears instantly to avoid dark-flash on re-renders */}
            <div style={{ flex:1, background:'rgba(0,0,0,.42)', cursor:'pointer',
              display:'flex', alignItems:'flex-end', justifyContent:'flex-start',
              padding:'0 0 24px 24px' }}
              onClick={closePanel}>
              <div style={{ fontSize:11, color:'rgba(255,255,255,.4)', letterSpacing:'.5px', userSelect:'none' }}>
                ESC or click to close
              </div>
            </div>
            {/* Slide-in panel — animates only this div, never the backdrop */}
            <div style={{ width:'min(480px,100vw)', background:'var(--surface)', overflowY:'auto',
              borderLeft:'3px solid var(--b3)',
              boxShadow:'-8px 0 32px rgba(0,0,0,.45)',
              display:'flex', flexDirection:'column',
              animation:'slideInRight .22s cubic-bezier(.4,0,.2,1)' }}>

              {/* Header */}
              <div style={{ padding:'24px 24px 20px', borderBottom:'1px solid var(--b2)', flexShrink:0,
                background:`linear-gradient(135deg,${rank.color}0c 0%,var(--surface) 60%)`,
                borderTop:`3px solid ${rank.color}` }}>
                <div style={{ display:'flex', alignItems:'center', gap:14 }}>
                  <div style={{ width:52, height:52, borderRadius:'50%', flexShrink:0,
                    background:`linear-gradient(135deg,${rank.color},${rank.color}99)`,
                    display:'flex', alignItems:'center', justifyContent:'center',
                    fontSize:22, fontWeight:700, color:'#fff',
                    boxShadow:`0 4px 16px ${rank.color}44` }}>
                    {(viewingMember.full_name||'A').charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div className="serif" style={{ fontSize:20, color:'var(--text)', fontWeight:700, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{viewingMember.full_name||'Agent'}</div>
                    <div style={{ fontSize:12, color:'var(--muted)', marginTop:2 }}>{rank.icon} {rank.name} · 🔥 {viewingMember.streak||0} day streak</div>
                  </div>
                  <div style={{ textAlign:'right', flexShrink:0 }}>
                    <div className="serif" style={{ fontSize:22, color:rank.color, fontWeight:700, lineHeight:1 }}>{(viewingMember.xp||0).toLocaleString()}</div>
                    <div style={{ fontSize:10, color:'var(--dim)', marginTop:2 }}>XP</div>
                  </div>
                  <button onClick={closePanel} style={{ background:'rgba(0,0,0,.15)', border:'1px solid var(--b3)', fontSize:20,
                    color:'var(--text)', cursor:'pointer', padding:'4px 10px', borderRadius:6,
                    lineHeight:1, flexShrink:0 }}>×</button>
                </div>
              </div>

              {/* Bio card — only shown if member has filled in Professional Info */}
              {(()=>{ const bio = viewingMember.habit_prefs?.bio || {}
                return (bio.phone||bio.license||bio.specialty||bio.about) ? (
                  <div style={{ padding:'14px 24px', borderBottom:'1px solid var(--b2)',
                    display:'flex', flexDirection:'column', gap:6 }}>
                    {bio.about && <div style={{ fontSize:13, color:'var(--text)', fontStyle:'italic' }}>"{bio.about}"</div>}
                    <div style={{ display:'flex', gap:12, flexWrap:'wrap', alignItems:'center' }}>
                      {bio.specialty && <span style={{ fontSize:11, padding:'2px 8px', borderRadius:4,
                        background:'rgba(14,165,233,.1)', color:'#0ea5e9', border:'1px solid rgba(14,165,233,.2)' }}>
                        {bio.specialty}
                      </span>}
                      {bio.phone && <span style={{ fontSize:11, color:'var(--muted)' }}>📞 {bio.phone}</span>}
                      {bio.license && <span style={{ fontSize:11, color:'var(--muted)' }}>🪪 {bio.license}</span>}
                    </div>
                  </div>
                ) : null
              })()}

              {memberDetailLoading ? (
                <div style={{ padding:48, textAlign:'center', color:'var(--muted)',
                  display:'flex', flexDirection:'column', alignItems:'center', gap:14 }}>
                  <Loader/>
                  <div style={{ fontSize:13 }}>Loading activity…</div>
                </div>
              ) : (
                <div style={{ padding:24, display:'flex', flexDirection:'column', gap:24 }}>

                  {/* Activity rings */}
                  <div>
                    <div className="serif" style={{ fontSize:15, color:'var(--text)', marginBottom:14 }}>Activity</div>
                    <div style={{ display:'flex', gap:28 }}>
                      <div style={{ textAlign:'center' }}>
                        <Ring pct={stats.todayPct||0} size={72} sw={6} color={rank.color}/>
                        <div style={{ fontSize:10, color:'var(--muted)', marginTop:6, fontWeight:700, letterSpacing:'.5px' }}>TODAY</div>
                      </div>
                      <div style={{ textAlign:'center' }}>
                        <Ring pct={stats.monthlyPct||0} size={72} sw={6} color='#0ea5e9'/>
                        <div style={{ fontSize:10, color:'var(--muted)', marginTop:6, fontWeight:700, letterSpacing:'.5px' }}>MONTH</div>
                      </div>
                    </div>
                  </div>

                  {/* Habit pills */}
                  {HABITS.filter(h => (habitCounts[h.id]||0) > 0).length > 0 && (
                    <div>
                      <div className="serif" style={{ fontSize:15, color:'var(--text)', marginBottom:10 }}>Habits This Month</div>
                      <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                        {HABITS.filter(h => (habitCounts[h.id]||0) > 0).map(h => {
                          const cs = CAT[h.cat] || CAT.leads
                          return (
                            <span key={h.id} style={{ fontSize:11, padding:'4px 10px', borderRadius:6,
                              background:cs.light, color:cs.color, border:`1px solid ${cs.border}`,
                              fontFamily:"'JetBrains Mono',monospace", fontWeight:600 }}>
                              {h.icon} {h.label}: {habitCounts[h.id]}
                            </span>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Pipeline summary */}
                  <div>
                    <div className="serif" style={{ fontSize:15, color:'var(--text)', marginBottom:12 }}>Pipeline</div>
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(110px,1fr))', gap:10 }}>
                      {[
                        { l:'Listings',    v:listings.length,   c:'#8b5cf6' },
                        { l:'Buyer Reps',  v:buyerReps.length,  c:'#0ea5e9' },
                        { l:'Offers Made', v:offersMade.length, c:'#d97706' },
                        { l:"Offers Rec'd",v:offersRec.length,  c:'#f97316' },
                        { l:'Pending',     v:pending.length,    c:'#6366f1' },
                        { l:'Closed',      v:closed.length,     c:'var(--green)' },
                        ...(closedVol >0 ? [{l:'Volume',     v:fmtMoney(closedVol),  c:'var(--green)'}] : []),
                        ...(closedComm>0 ? [{l:'Commission', v:fmtMoney(closedComm), c:'var(--green)'}] : []),
                      ].map((s,i) => (
                        <div key={i} className="card" style={{ padding:'10px 12px', textAlign:'center' }}>
                          <div style={{ fontSize:9, color:'var(--dim)', fontWeight:700,
                            letterSpacing:'.5px', textTransform:'uppercase', marginBottom:4 }}>{s.l}</div>
                          <div className="serif" style={{ fontSize:20, color:s.c, fontWeight:700 }}>{s.v}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Transaction rows */}
                  {txs.length > 0 && (
                    <div>
                      <div className="serif" style={{ fontSize:15, color:'var(--text)', marginBottom:12 }}>Transactions</div>
                      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                        {txs.map(t => {
                          const meta  = TYPE_META[t.type] || { label:t.type, color:'var(--muted)' }
                          const price = parseAmt(t.price)
                          const comm  = parseAmt(t.commission)
                          return (
                            <div key={t.id} className="card" style={{ padding:'12px 14px', border:'1px solid var(--b2)' }}>
                              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:(t.address||price>0||comm>0)?6:0 }}>
                                <span style={{ fontSize:9, padding:'2px 7px', borderRadius:4, fontWeight:700,
                                  background:`${meta.color}15`, color:meta.color, border:`1px solid ${meta.color}30`,
                                  textTransform:'uppercase', letterSpacing:'.5px', flexShrink:0 }}>{meta.label}</span>
                                {t.address && (
                                  <span style={{ fontSize:12, color:'var(--text)', fontWeight:500, flex:1, minWidth:0,
                                    overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{t.address}</span>
                                )}
                              </div>
                              {(price>0 || comm>0) && (
                                <div style={{ display:'flex', gap:16 }}>
                                  {price>0 && (
                                    <div>
                                      <div style={{ fontSize:9, color:'var(--dim)', fontWeight:700, letterSpacing:'.5px' }}>PRICE</div>
                                      <div style={{ fontSize:13, color:'var(--text)', fontWeight:600 }}>{fmtMoney(price)}</div>
                                    </div>
                                  )}
                                  {comm>0 && (
                                    <div>
                                      <div style={{ fontSize:9, color:'var(--dim)', fontWeight:700, letterSpacing:'.5px' }}>COMMISSION</div>
                                      <div style={{ fontSize:13, color:'var(--green)', fontWeight:600 }}>{fmtMoney(comm)}</div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {txs.length === 0 && (
                    <div style={{ fontSize:13, color:'var(--muted)', fontStyle:'italic', textAlign:'center', padding:'8px 0' }}>
                      No transactions logged this month.
                    </div>
                  )}

                  {/* ── Active Listings ── */}
                  {activeLists.length > 0 && (
                    <div>
                      <div className="serif" style={{ fontSize:15, color:'var(--text)', marginBottom:12 }}>🏠 Active Listings</div>
                      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                        {activeLists.map(l => {
                          const price = parseAmt(l.price)
                          const comm  = parseAmt(l.commission)
                          const statusColor = l.status === 'pending' ? '#6366f1' : '#10b981'
                          return (
                            <div key={l.id} className="card" style={{ padding:'12px 14px', border:'1px solid var(--b2)' }}>
                              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:(price>0||comm>0)?6:0 }}>
                                <span style={{ fontSize:9, padding:'2px 7px', borderRadius:4, fontWeight:700,
                                  background:`${statusColor}15`, color:statusColor, border:`1px solid ${statusColor}30`,
                                  textTransform:'uppercase', letterSpacing:'.5px', flexShrink:0 }}>
                                  {l.status || 'Active'}
                                </span>
                                {l.address && (
                                  <span style={{ fontSize:12, color:'var(--text)', fontWeight:500, flex:1, minWidth:0,
                                    overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{l.address}</span>
                                )}
                              </div>
                              {(price>0 || comm>0) && (
                                <div style={{ display:'flex', gap:16 }}>
                                  {price>0 && (
                                    <div>
                                      <div style={{ fontSize:9, color:'var(--dim)', fontWeight:700, letterSpacing:'.5px' }}>LIST PRICE</div>
                                      <div style={{ fontSize:13, color:'var(--text)', fontWeight:600 }}>{fmtMoney(price)}</div>
                                    </div>
                                  )}
                                  {comm>0 && (
                                    <div>
                                      <div style={{ fontSize:9, color:'var(--dim)', fontWeight:700, letterSpacing:'.5px' }}>COMMISSION</div>
                                      <div style={{ fontSize:13, color:'var(--green)', fontWeight:600 }}>{fmtMoney(comm)}</div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                </div>
              )}

              {/* ── Coaching Notes (visible to admins, owner, group leaders) ── */}
              {(()=>{
                const NC = { praise:'#10b981', goal:'#d97706', concern:'#f43f5e', general:'#0ea5e9' }
                const viewerNotes = allCoachingNotes
                  .filter(n => n.agentId === viewingMember.id)
                  .sort((a,b) => (b.pinned?1:0)-(a.pinned?1:0) || new Date(b.createdAt)-new Date(a.createdAt))
                return (
                  <div style={{ padding:'20px 24px', borderTop:'1px solid var(--b2)' }}>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
                      <div className="serif" style={{ fontSize:15, color:'var(--text)' }}>📋 Coaching Notes</div>
                      {!panelNoteForm && (
                        <button onClick={()=>setPanelNoteForm({ text:'', type:'general' })}
                          style={{ fontSize:11, padding:'5px 12px', borderRadius:6, cursor:'pointer',
                            border:'1px solid var(--b3)', background:'transparent',
                            color:'var(--text2)', fontWeight:600 }}>+ Add Note</button>
                      )}
                    </div>

                    {/* Add-note form */}
                    {panelNoteForm && (
                      <div style={{ marginBottom:14, padding:14, borderRadius:10,
                        background:'rgba(14,165,233,.04)', border:'1px solid rgba(14,165,233,.2)' }}>
                        <div style={{ display:'flex', gap:6, marginBottom:10, flexWrap:'wrap' }}>
                          {['general','praise','goal','concern'].map(t=>{
                            const tc = NC[t]
                            const active = panelNoteForm.type===t
                            return (
                              <button key={t} onClick={()=>setPanelNoteForm(f=>({...f,type:t}))}
                                style={{ fontSize:10, padding:'3px 9px', borderRadius:5, cursor:'pointer',
                                  fontWeight:600, textTransform:'capitalize',
                                  border: active ? 'none' : `1px solid ${tc}44`,
                                  background: active ? tc : `${tc}12`,
                                  color: active ? '#fff' : tc }}>
                                {t}
                              </button>
                            )
                          })}
                        </div>
                        <textarea className="field-input" value={panelNoteForm.text}
                          onChange={e=>setPanelNoteForm(f=>({...f,text:e.target.value.slice(0,500)}))}
                          placeholder="Write coaching note…" rows={3}
                          style={{ width:'100%', resize:'vertical', fontSize:13, marginBottom:4, minHeight:72 }}/>
                        <div style={{ fontSize:10, color:'var(--dim)', textAlign:'right', marginBottom:8 }}>
                          {(panelNoteForm.text||'').length}/500
                        </div>
                        <div style={{ display:'flex', gap:8 }}>
                          <button className="btn-primary" onClick={savePanelNote}
                            disabled={panelNoteSaving||!panelNoteForm.text.trim()}
                            style={{ fontSize:12, padding:'7px 16px' }}>
                            {panelNoteSaving ? 'Saving…' : 'Save Note'}
                          </button>
                          <button className="btn-outline" onClick={()=>setPanelNoteForm(null)}
                            style={{ fontSize:12 }}>Cancel</button>
                        </div>
                      </div>
                    )}

                    {/* Notes list */}
                    {viewerNotes.length === 0 && !panelNoteForm ? (
                      <div style={{ fontSize:12, color:'var(--muted)', fontStyle:'italic', textAlign:'center', padding:'8px 0' }}>
                        No coaching notes yet for this agent.
                      </div>
                    ) : (
                      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                        {viewerNotes.map(note=>{
                          const c = NC[note.type] || NC.general
                          const agentMember = members.find(m=>m.id===note.agentId)
                          const agentReplies = agentMember?.goals?.coaching_replies?.[note.id] || []
                          const allReplies = [...(note.replies||[]), ...agentReplies]
                            .sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt))
                          return (
                            <div key={note.id} style={{ padding:'12px 14px', borderRadius:10,
                              border: note.pinned ? '1px solid rgba(217,119,6,.45)' : '1px solid var(--b2)',
                              background: note.pinned ? 'var(--gold3)' : 'var(--bg2)' }}>
                              <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:7, flexWrap:'wrap' }}>
                                <span style={{ fontSize:9, padding:'2px 7px', borderRadius:4, fontWeight:700,
                                  background:`${c}18`, color:c, border:`1px solid ${c}33`,
                                  textTransform:'uppercase', letterSpacing:'.5px', flexShrink:0 }}>{note.type}</span>
                                {note.pinned && <span style={{ fontSize:10, color:'var(--gold2)', flexShrink:0 }}>📌</span>}
                                <span style={{ marginLeft:'auto', fontSize:10, color:'var(--dim)', flexShrink:0 }}>{relativeTime(note.createdAt)}</span>
                              </div>
                              <div style={{ fontSize:13, color:'var(--text)', lineHeight:1.6, marginBottom:8 }}>{note.text}</div>

                              {/* Replies thread */}
                              {allReplies.length>0 && (
                                <div style={{ borderLeft:'2px solid var(--b2)', paddingLeft:10, marginBottom:8,
                                  display:'flex', flexDirection:'column', gap:6 }}>
                                  {allReplies.map(r=>{
                                    const isCoach = r.authorId !== note.agentId
                                    return (
                                      <div key={r.id}>
                                        <div style={{ display:'flex', alignItems:'center', gap:5, marginBottom:2 }}>
                                          <span style={{ fontSize:10, fontWeight:600, color: isCoach ? 'var(--gold)' : 'var(--text)' }}>
                                            {isCoach ? (members.find(m=>m.id===r.authorId)?.full_name||'Coach') : (viewingMember.full_name||'Agent')}
                                          </span>
                                          {isCoach && <span style={{ fontSize:8, padding:'1px 4px', borderRadius:3, background:'var(--gold4)', color:'var(--gold)', fontWeight:700 }}>COACH</span>}
                                          <span style={{ fontSize:9, color:'var(--dim)', marginLeft:2 }}>{relativeTime(r.createdAt)}</span>
                                        </div>
                                        <div style={{ fontSize:12, color:'var(--text2)', lineHeight:1.5 }}>{r.text}</div>
                                      </div>
                                    )
                                  })}
                                </div>
                              )}

                              {/* Reply input */}
                              <div style={{ display:'flex', gap:6, marginBottom: isTeamOwner ? 8 : 0 }}>
                                <input className="field-input" value={replyForms[note.id]||''}
                                  onChange={e=>setReplyForms(f=>({...f,[note.id]:e.target.value.slice(0,300)}))}
                                  onKeyDown={e=>e.key==='Enter'&&!e.shiftKey&&saveReply(note.id)}
                                  placeholder="Reply…"
                                  style={{ flex:1, padding:'5px 10px', fontSize:11 }}/>
                                <button onClick={()=>saveReply(note.id)}
                                  disabled={replySaving===note.id||!(replyForms[note.id]||'').trim()}
                                  style={{ fontSize:11, padding:'5px 11px', borderRadius:6, cursor:'pointer',
                                    background:'var(--text)', border:'none', color:'var(--bg)', fontWeight:600, flexShrink:0 }}>
                                  {replySaving===note.id ? '…' : 'Send'}
                                </button>
                              </div>

                              {/* Pin / Delete (owner only) */}
                              {isTeamOwner && (
                                <div style={{ display:'flex', gap:6 }}>
                                  <button onClick={()=>pinNote(note.id)}
                                    style={{ fontSize:10, padding:'3px 8px', borderRadius:5, cursor:'pointer',
                                      background: note.pinned?'rgba(217,119,6,.12)':'var(--bg2)',
                                      border: note.pinned?'1px solid rgba(217,119,6,.3)':'1px solid var(--b2)',
                                      color: note.pinned?'var(--gold)':'var(--muted)', fontWeight:600 }}>
                                    {note.pinned ? '📌 Unpin' : '📌 Pin'}
                                  </button>
                                  <button onClick={()=>setConfirmModal({ message:'Delete this coaching note?', label:'Delete Note', onConfirm:()=>deleteNote(note.id) })}
                                    style={{ fontSize:10, padding:'3px 8px', borderRadius:5, cursor:'pointer',
                                      background:'rgba(220,38,38,.06)', border:'1px solid rgba(220,38,38,.2)',
                                      color:'var(--red)', fontWeight:600 }}>
                                    Delete
                                  </button>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* Remove Member footer — owner only, not for self */}
              {isTeamOwner && viewingMember.id !== user?.id && (
                <div style={{ padding:'20px 24px', borderTop:'1px solid var(--b2)', flexShrink:0 }}>
                  {removeConfirm === viewingMember.id ? (
                    <div style={{ display:'flex', gap:8 }}>
                      <button className="btn-outline" style={{ fontSize:12 }}
                        onClick={() => setRemoveConfirm(null)} disabled={removeSaving}>Cancel</button>
                      <button onClick={() => removeMember(viewingMember.id)} disabled={removeSaving}
                        style={{ fontSize:12, padding:'8px 16px', borderRadius:7,
                          border:'1px solid var(--red)', background:'rgba(220,38,38,.1)',
                          color:'var(--red)', cursor:'pointer', fontWeight:600 }}>
                        {removeSaving ? 'Removing…' : 'Confirm Remove'}
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => setRemoveConfirm(viewingMember.id)}
                      style={{ fontSize:12, padding:'8px 16px', borderRadius:7,
                        border:'1px solid rgba(220,38,38,.25)', background:'none',
                        color:'var(--red)', cursor:'pointer' }}>
                      Remove from Team
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )
      })()}

      {/* ── Custom Confirm Modal (replaces all browser confirm() calls) ── */}
      {confirmModal && (
        <div style={{ position:'fixed', inset:0, zIndex:2000,
          background:'rgba(0,0,0,.65)', backdropFilter:'blur(4px)',
          display:'flex', alignItems:'center', justifyContent:'center',
          padding:20, animation:'fadeIn .15s ease' }}
          onClick={()=>setConfirmModal(null)}>
          <div className="card" style={{ padding:'24px 28px', maxWidth:400, width:'100%',
            borderTop:'3px solid var(--red)', animation:'scaleIn .18s ease' }}
            onClick={e=>e.stopPropagation()}>
            <div style={{ fontSize:14, color:'var(--text)', marginBottom:22, lineHeight:1.65 }}>
              {confirmModal.message}
            </div>
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
              <button className="btn-outline" style={{ fontSize:13 }}
                onClick={()=>setConfirmModal(null)}>Cancel</button>
              <button onClick={()=>{ confirmModal.onConfirm(); setConfirmModal(null) }}
                style={{ fontSize:13, padding:'9px 20px', borderRadius:9,
                  border:'1px solid var(--red)', background:'rgba(220,38,38,.1)',
                  color:'var(--red)', fontWeight:700, cursor:'pointer' }}>
                {confirmModal.label || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
