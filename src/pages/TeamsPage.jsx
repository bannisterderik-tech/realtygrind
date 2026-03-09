import { useState, useEffect, useRef, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { Loader, Wordmark, ThemeToggle, Ring, getRank, CAT, StatCard, fmtMoney, resolveCommission } from '../design'
import { HABITS } from '../habits'
import { canUseTeams, getMaxMembers, getPlan, isActiveBilling } from '../lib/plans'
import { ALL_APPS } from './DirectoryPage'
import AvatarCropModal from '../components/AvatarCropModal'

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
// Current month in YYYY-MM format — used for habit/transaction queries
const MONTH_YEAR = new Date().toISOString().slice(0,7)

// UI_NOTE_LIMIT: character cap shown to the user in the coaching-note textarea.
// MAX_NOTE_LEN (4000, defined inside the component) is the backend safety truncation
// applied when persisting — it's intentionally larger so existing long notes aren't lost.
const UI_NOTE_LIMIT = 500

const CHALLENGE_METRICS = [
  { value:'prospecting',  label:'Prospecting Calls' },
  { value:'appointments', label:'Appointments Booked' },
  { value:'showing',      label:'Property Showings' },
  { value:'newlisting',   label:'Listings Taken' },
  { value:'closed',       label:'Deals Closed' },
  { value:'xp',           label:'Total XP' },
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

const DEFAULT_RECRUIT_SUBJECT = 'Invitation to join {team_name}'
const DEFAULT_RECRUIT_BODY = `Hi {recruit_name},

{referrer_name} sent me your information and asked me to reach out.

Here is a bit about what we offer at {team_name}:

- Collaborative team environment focused on agent success
- Access to cutting-edge tools and resources
- Ongoing training and professional development

I'd love to set up a time to chat and tell you more about what we're building here.

Best regards`

function buildRecruitMailto(recruit, submitterName, teamName, emailSettings) {
  const subjectTpl = emailSettings?.subject?.trim() || DEFAULT_RECRUIT_SUBJECT
  const bodyTpl = emailSettings?.body?.trim() || DEFAULT_RECRUIT_BODY
  const replace = s => s
    .replace(/\{recruit_name\}/gi, recruit.name || '')
    .replace(/\{referrer_name\}/gi, submitterName || '')
    .replace(/\{team_name\}/gi, teamName || 'our team')
  return `mailto:${encodeURIComponent(recruit.email)}?subject=${encodeURIComponent(replace(subjectTpl))}&body=${encodeURIComponent(replace(bodyTpl))}`
}

function buildRecruitMailtoPreview(teamName, emailSettings) {
  const subjectTpl = emailSettings?.subject?.trim() || DEFAULT_RECRUIT_SUBJECT
  const bodyTpl = emailSettings?.body?.trim() || DEFAULT_RECRUIT_BODY
  const replace = s => s
    .replace(/\{recruit_name\}/gi, '{Recruit Name}')
    .replace(/\{referrer_name\}/gi, '{Referring Agent}')
    .replace(/\{team_name\}/gi, teamName || '{Team Name}')
  return `Subject: ${replace(subjectTpl)}\n\n${replace(bodyTpl)}`
}

// Reusable avatar: shows profile photo if available, otherwise initials
function MemberAvatar({ member, size=38, rank }) {
  const r = rank || getRank(member?.xp||0)
  const url = member?.goals?.avatar_url
  return (
    <div style={{ width:size, height:size, borderRadius:'50%',
      background: url ? 'transparent' : `linear-gradient(135deg, ${r.color}, ${r.color}99)`,
      display:'flex', alignItems:'center', justifyContent:'center',
      fontSize:Math.round(size*0.4), fontWeight:700, color:'#fff', flexShrink:0, letterSpacing:0,
      boxShadow:`0 2px 8px ${r.color}44`, overflow:'hidden' }}>
      {url ? (
        <img src={url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
      ) : (member?.full_name||'A').charAt(0).toUpperCase()}
    </div>
  )
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
  const [teamsTab,       setTeamsTab]       = useState('roster') // 'roster' | 'groups' | 'challenges' | 'listings' | 'buyers' | 'settings'
  const [settingsSubTab, setSettingsSubTab] = useState('invites') // 'invites' | 'admins' | 'groups' | 'ai' | 'directory' | 'danger'
  const [groupForm,      setGroupForm]      = useState(null)     // null | { name, leaderId, memberIds, editingId }
  const [groupSaving,    setGroupSaving]    = useState(false)
  const [groupView,      setGroupView]      = useState(null)     // null | groupId — full group dashboard
  const [groupChallengeForm,   setGroupChallengeForm]   = useState(null)  // null | { title, metric, bonusXp }
  const [groupChallengeSaving, setGroupChallengeSaving] = useState(false)
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
  const fetchSeqRef = useRef(0)        // increments per fetchMemberDetail; stale results are discarded
  const fetchMembersSeqRef = useRef(0) // increments per fetchMembers; prevents stale team data
  const lastFetchedTeamId = useRef(null) // prevents duplicate fetches for the same team
  const fetchInFlight = useRef(false)    // prevents concurrent fetchMembers calls
  const [confirmModal,    setConfirmModal]    = useState(null)   // { message, label, onConfirm } | null
  const [panelNoteForm,   setPanelNoteForm]   = useState(null)   // { text, type } | null
  const [panelNoteSaving, setPanelNoteSaving] = useState(false)
  const [teamListings,    setTeamListings]    = useState([])     // active listings for all team members
  const [tvMode,          setTvMode]          = useState(false)   // fullscreen TV leaderboard
  const [editingToolId,   setEditingToolId]   = useState(null)    // tool id whose URL is being edited
  const [editingToolUrl,  setEditingToolUrl]  = useState('')      // URL being typed
  const [customToolForm,  setCustomToolForm]  = useState(null)    // null | { name, url, icon, category }
  const [buyerNeedForm,   setBuyerNeedForm]   = useState(null)    // null | { text }
  const [buyerNeedSaving, setBuyerNeedSaving] = useState(false)
  const [buyerFilter,     setBuyerFilter]     = useState('all')   // 'all' | memberId
  const [buyerReplyForms, setBuyerReplyForms] = useState({})      // { [needId]: string }
  const [buyerReplySaving,setBuyerReplySaving]= useState(null)    // needId being saved, or null
  const [recruitForm,     setRecruitForm]     = useState(null)    // null | { name, email, phone }
  const [recruitSaving,   setRecruitSaving]   = useState(false)
  const [recruitFilter,   setRecruitFilter]   = useState('all')  // 'all' | 'submitted' | 'contacted' | 'hired' | 'declined'
  const [recruitNoteEditing, setRecruitNoteEditing] = useState(null) // recruitId being edited
  const [recruitNoteText,    setRecruitNoteText]    = useState('')
  const [recruitEmailSubject, setRecruitEmailSubject] = useState('')
  const [recruitEmailBody,    setRecruitEmailBody]    = useState('')
  const [recruitEmailSaving,  setRecruitEmailSaving]  = useState(false)
  const [slackUrl,        setSlackUrl]        = useState('')      // team Slack workspace URL
  const [slackSaving,     setSlackSaving]     = useState(false)
  const [logoCropSrc,     setLogoCropSrc]     = useState(null)    // object URL for crop modal
  const [logoSaving,      setLogoSaving]      = useState(false)
  const logoInputRef      = useRef(null)

  // Depend only on team_id — prevents re-fetching every time the profile object
  // is recreated (e.g. on token refresh) while nothing meaningful has changed.
  // Guards: skip if already fetching the same team, skip if profile is transiently null
  // (e.g. during token refresh / wake from sleep).
  useEffect(()=>{
    const tid = profile?.team_id
    if (tid) {
      // Skip if we already fetched (or are fetching) this exact team
      if (lastFetchedTeamId.current === tid) return
      setMode('myteam')
      fetchMembers(tid)
    } else if (profile !== null && !tid) {
      // Only reset if we actually had a team before (prevents flash on wake)
      if (lastFetchedTeamId.current) {
        lastFetchedTeamId.current = null
        setMode('menu'); setMembers([]); setTeamData(null); setMemberStats({})
      } else if (mode !== 'menu' && mode !== 'create' && mode !== 'join') {
        setMode('menu')
      }
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
      if (e.key === 'Escape') { setViewingMember(null); setMemberDetail(null); setMemberDetailLoading(false) }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  },[viewingMember])

  // Safety: auto-close the member detail panel if the viewed member was removed
  // from the members array (e.g. after removeMember or if a re-fetch excluded them).
  useEffect(()=>{
    if (viewingMember && members.length > 0 && !members.find(m => m.id === viewingMember.id)) {
      setViewingMember(null); setMemberDetail(null); setMemberDetailLoading(false)
    }
  },[viewingMember, members])

  async function fetchMembers(tid) {
    if (fetchInFlight.current) return // prevent concurrent calls
    fetchInFlight.current = true
    lastFetchedTeamId.current = tid
    const seq = ++fetchMembersSeqRef.current
    setLoading(true)
    try {
    const {data:mems} = await supabase.from('profiles').select('id,full_name,xp,streak,goals,habit_prefs').eq('team_id',tid).order('xp',{ascending:false})
    if (seq !== fetchMembersSeqRef.current) return // stale — a newer fetch was triggered
    setMembers(mems||[])
    const {data:team} = await supabase.from('teams').select('*').eq('id',tid).single()
    if (seq !== fetchMembersSeqRef.current) return
    setTeamData(team)
    setSlackUrl(team?.team_prefs?.slack_url || '')
    setRecruitEmailSubject(team?.team_prefs?.recruit_email_settings?.subject || '')
    setRecruitEmailBody(team?.team_prefs?.recruit_email_settings?.body || '')
    // Load habit stats for all members
    if (mems?.length) {
      const ids = mems.map(m=>m.id)
      const {data:habs} = await supabase.from('habit_completions').select('user_id,habit_id,counter_value,week_index,day_index')
        .in('user_id',ids).eq('month_year',MONTH_YEAR).limit(5000)
      const {data:txs} = await supabase.from('transactions').select('user_id,type,price,commission')
        .in('user_id',ids).eq('month_year',MONTH_YEAR).limit(2000)
      if (seq !== fetchMembersSeqRef.current) return
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
      if (seq !== fetchMembersSeqRef.current) return
      const nameMap = Object.fromEntries((mems||[]).map(m=>[m.id, m.full_name||'Agent']))
      setTeamListings((listRows||[]).map(l=>({ ...l, agentName: nameMap[l.user_id]||'Agent' })))
    }
    } catch (err) {
      console.error('fetchMembers error:', err)
      if (seq === fetchMembersSeqRef.current) setError('Failed to load team data. Please refresh.')
    } finally {
      fetchInFlight.current = false
      if (seq === fetchMembersSeqRef.current) setLoading(false)
    }
  }

  async function fetchMemberDetail(member) {
    if (!member?.id) return  // safety: bail if member object is invalid
    // Prevent concurrent fetches from stomping each other
    const seq = ++fetchSeqRef.current
    setViewingMember(member)
    setMemberDetail(null)
    setRemoveConfirm(null)
    setPanelNoteForm(null)
    setMemberDetailLoading(true)
    try {
      const [{ data: txs, error: e1 }, { data: habs, error: e2 }, { data: activeLists, error: e3 }] = await Promise.all([
        supabase.from('transactions').select('id,type,price,commission,address')
          .eq('user_id', member.id).eq('month_year', MONTH_YEAR),
        supabase.from('habit_completions').select('habit_id,counter_value')
          .eq('user_id', member.id).eq('month_year', MONTH_YEAR),
        supabase.from('listings').select('id,address,status,price,commission,unit_count')
          .eq('user_id', member.id).neq('status', 'closed').gt('unit_count', 0),
      ])
      if (seq !== fetchSeqRef.current) return  // a newer click fired — discard these results
      if (e1 || e2 || e3) console.warn('fetchMemberDetail partial error:', e1?.message, e2?.message, e3?.message)
      const habitCounts = {}
      BUILT_IN_HABIT_IDS.forEach(id => {
        habitCounts[id] = (habs||[])
          .filter(h => h.habit_id === id)
          .reduce((a, h) => a + (h.counter_value || 1), 0)
      })
      setMemberDetail({ txs: txs||[], habitCounts, activeLists: activeLists||[] })
    } catch (err) {
      console.error('fetchMemberDetail error:', err)
      // Still show the panel with empty data rather than crashing
      if (seq === fetchSeqRef.current) {
        setMemberDetail({ txs: [], habitCounts: {}, activeLists: [] })
      }
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
        .insert({name:teamName.trim(), created_by:user.id, invite_code:code, max_members: maxMem}).select().single()
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
      if (team.max_members && count >= team.max_members) throw new Error(`This team has reached its ${team.max_members}-member limit. Contact support to add more seats ($7/seat/mo).`)
      await supabase.from('team_members').insert({team_id:team.id, user_id:user.id, role:'member'})
      await supabase.from('profiles').update({team_id:team.id}).eq('id',user.id)
      // Clean up pending invite for this user's email
      const pending = team.team_prefs?.pending_invites || []
      if (pending.length > 0 && user.email) {
        const cleaned = pending.filter(i => i.email.toLowerCase() !== user.email.toLowerCase())
        if (cleaned.length !== pending.length) {
          await supabase.from('teams').update({
            team_prefs: { ...(team.team_prefs || {}), pending_invites: cleaned }
          }).eq('id', team.id)
        }
      }
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
      const { error: e1 } = await supabase.from('team_members').delete().eq('user_id', user.id).eq('team_id', profile.team_id)
      if (e1) throw e1
      const { error: e2 } = await supabase.from('profiles').update({ team_id: null }).eq('id', user.id)
      if (e2) throw e2
      await refreshProfile()
      setMembers([]); setTeamData(null)

      // ── Force Solo trial signup — team members lose coverage when they leave ──
      // If the user doesn't have their own active subscription, redirect to Solo checkout
      const { data: freshProfile } = await supabase.from('profiles').select('billing_status, plan, stripe_customer_id').eq('id', user.id).single()
      const hasOwnSub = freshProfile?.stripe_customer_id && isActiveBilling(freshProfile?.billing_status)
      if (!hasOwnSub) {
        try {
          const { data: coData, error: coErr } = await supabase.functions.invoke('create-checkout', {
            body: { planId: 'solo', isAnnual: false, returnUrl: window.location.origin }
          })
          if (!coErr && coData?.url) {
            window.location.href = coData.url
            return // don't setLoading(false) — page is navigating away
          }
        } catch (coEx) {
          console.error('Solo checkout redirect failed:', coEx)
        }
      }
      setMode('menu')
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

      // ── Close the panel & clear stale state immediately ──
      setRemoveConfirm(null)
      setViewingMember(null)
      setMemberDetail(null)
      setMemberDetailLoading(false)
      setMemberStats(prev => { const next = { ...prev }; delete next[memberId]; return next })

      // ── Full re-fetch from DB for 100 % consistent state ──
      // (avoids stale optimistic data that can crash subsequent actions)
      await fetchMembers(profile.team_id)
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
      // Update team_members roles to match: new owner becomes 'owner', old owner becomes 'member'
      const { error: e2 } = await supabase.from('team_members').update({ role: 'owner' }).eq('user_id', newOwnerId).eq('team_id', profile.team_id)
      if (e2) {
        // Rollback: revert teams.created_by to the original owner
        await supabase.from('teams').update({ created_by: user.id }).eq('id', profile.team_id)
        throw new Error('Failed to update new owner role. Transfer has been rolled back.')
      }
      const { error: e3 } = await supabase.from('team_members').update({ role: 'member' }).eq('user_id', user.id).eq('team_id', profile.team_id)
      if (e3) {
        // Rollback: revert both changes
        await supabase.from('teams').update({ created_by: user.id }).eq('id', profile.team_id)
        await supabase.from('team_members').update({ role: 'member' }).eq('user_id', newOwnerId).eq('team_id', profile.team_id)
        throw new Error('Failed to update old owner role. Transfer has been rolled back.')
      }
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
          throw new Error(`Team is at capacity (${teamData.max_members} seats). Contact support to add more seats ($7/seat/mo).`)
        }
      }
      // Use raw fetch with a fresh token (getSession can return stale tokens)
      const { data: { session }, error: sessErr } = await supabase.auth.refreshSession()
      if (sessErr || !session) throw new Error('Not authenticated — please sign out and back in')
      let resp, result
      try {
        resp = await fetch(
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
      } catch (fetchErr) {
        throw new Error(`Network error: ${fetchErr.message}`)
      }
      try { result = await resp.json() } catch { result = {} }
      if (!resp.ok) {
        const raw = result.error || `Server error (${resp.status})`
        const alreadyExists = /already (registered|exists|invited)/i.test(raw) || /user.*exist/i.test(raw)
        const isRateLimit = /rate.limit/i.test(raw)
        throw new Error(
          alreadyExists
            ? `${email} already has an account. Share your invite code with them and they can join directly.`
            : isRateLimit
            ? 'Too many invites sent recently. Please wait a few minutes and try again.'
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

  async function deleteChallenge(challengeId) {
    const challenge = (teamData?.team_prefs?.challenges||[]).find(c=>c.id===challengeId)
    if (!challenge) return
    try {
      // Deduct bonus XP from winner if challenge was ended and XP was awarded
      if (challenge.status === 'ended' && challenge.winnerId && challenge.bonusXp > 0) {
        const winner = members.find(m=>m.id===challenge.winnerId)
        if (winner) {
          const newXp = Math.max((winner.xp||0) - challenge.bonusXp, 0)
          const { error: xpErr } = await supabase.from('profiles').update({ xp: newXp }).eq('id', winner.id)
          if (xpErr) throw xpErr
          setMembers(ms => ms.map(m => m.id===winner.id ? {...m, xp:newXp} : m))
          if (winner.id === user.id) refreshProfile()
        }
      }
      // Remove challenge from team_prefs
      const updated = {
        ...(teamData?.team_prefs||{}),
        challenges: (teamData.team_prefs?.challenges||[]).filter(c=>c.id!==challengeId)
      }
      const { error } = await supabase.from('teams').update({ team_prefs: updated }).eq('id', profile.team_id)
      if (error) throw error
      setTeamData(td => ({ ...td, team_prefs: updated }))
      setSuccess(challenge.bonusXp > 0 && challenge.winnerId
        ? `Challenge deleted. ${challenge.bonusXp} XP removed from winner.`
        : 'Challenge deleted.')
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError('Failed to delete challenge.')
      console.error('deleteChallenge error:', err)
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

  async function deleteGroupChallenge(groupId, challengeId) {
    const groups = teamData?.team_prefs?.groups || []
    const group = groups.find(g => g.id === groupId)
    if (!group) return
    const challenge = (group.challenges||[]).find(c => c.id === challengeId)
    if (!challenge) return
    try {
      // Deduct bonus XP from winner if challenge was ended and XP was awarded
      if (challenge.status === 'ended' && challenge.winnerId && challenge.bonusXp > 0) {
        const winner = members.find(m=>m.id===challenge.winnerId)
        if (winner) {
          const newXp = Math.max((winner.xp||0) - challenge.bonusXp, 0)
          const { error: xpErr } = await supabase.from('profiles').update({ xp: newXp }).eq('id', winner.id)
          if (xpErr) throw xpErr
          setMembers(ms => ms.map(m => m.id===winner.id ? {...m, xp:newXp} : m))
          if (winner.id === user.id) refreshProfile()
        }
      }
      // Remove challenge from group
      const updatedGroups = groups.map(g => g.id === groupId
        ? { ...g, challenges: (g.challenges||[]).filter(c=>c.id!==challengeId) } : g)
      const newPrefs = { ...(teamData.team_prefs||{}), groups: updatedGroups }
      const { error } = await supabase.from('teams').update({ team_prefs: newPrefs }).eq('id', profile.team_id)
      if (error) throw error
      setTeamData(td => ({ ...td, team_prefs: newPrefs }))
      setSuccess(challenge.bonusXp > 0 && challenge.winnerId
        ? `Challenge deleted. ${challenge.bonusXp} XP removed from winner.`
        : 'Challenge deleted.')
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError('Failed to delete group challenge.')
      console.error('deleteGroupChallenge error:', err)
    }
  }

  // ── Coaching Notes (detail panel only — main coaching UI moved to CoachingPage) ──
  const MAX_NOTE_LEN = 4000

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

  // ── Buyer Needs Handlers ─────────────────────────────────────────────────
  async function saveBuyerNeed() {
    if (!buyerNeedForm?.text?.trim() || !user?.id) return
    const trimmed = buyerNeedForm.text.trim().slice(0, MAX_NOTE_LEN)
    setBuyerNeedSaving(true)
    try {
      const myMember = members.find(m => m.id === user.id)
      const currentGoals = myMember?.goals || profile?.goals || {}
      const existing = currentGoals.buyer_needs || []
      const newNeed = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
        authorId: user.id,
        text: trimmed,
        replies: [],
        resolved: false,
        createdAt: new Date().toISOString(),
      }
      const updatedGoals = { ...currentGoals, buyer_needs: [...existing, newNeed] }
      const { error } = await supabase.from('profiles').update({ goals: updatedGoals }).eq('id', user.id)
      if (error) throw error
      setMembers(ms => ms.map(m => m.id === user.id ? { ...m, goals: updatedGoals } : m))
      setBuyerNeedForm(null)
    } catch (err) {
      setError('Failed to save buyer need. Please try again.')
      console.error('saveBuyerNeed error:', err)
    } finally {
      setBuyerNeedSaving(false)
    }
  }

  async function deleteBuyerNeed(needId) {
    const myMember = members.find(m => m.id === user.id)
    const currentGoals = myMember?.goals || profile?.goals || {}
    const updated = (currentGoals.buyer_needs || []).filter(n => n.id !== needId)
    const updatedGoals = { ...currentGoals, buyer_needs: updated }
    try {
      const { error } = await supabase.from('profiles').update({ goals: updatedGoals }).eq('id', user.id)
      if (error) throw error
      setMembers(ms => ms.map(m => m.id === user.id ? { ...m, goals: updatedGoals } : m))
    } catch (err) { console.error('deleteBuyerNeed error:', err) }
  }

  async function toggleBuyerNeedResolved(needId) {
    const myMember = members.find(m => m.id === user.id)
    const currentGoals = myMember?.goals || profile?.goals || {}
    const updated = (currentGoals.buyer_needs || []).map(n =>
      n.id === needId ? { ...n, resolved: !n.resolved } : n)
    const updatedGoals = { ...currentGoals, buyer_needs: updated }
    try {
      const { error } = await supabase.from('profiles').update({ goals: updatedGoals }).eq('id', user.id)
      if (error) throw error
      setMembers(ms => ms.map(m => m.id === user.id ? { ...m, goals: updatedGoals } : m))
    } catch (err) { console.error('toggleBuyerNeedResolved error:', err) }
  }

  async function saveBuyerReply(needId) {
    const text = (buyerReplyForms[needId] || '').trim()
    if (!text) return
    setBuyerReplySaving(needId)
    const newReply = { id: Date.now().toString(36), authorId: user.id, text, createdAt: new Date().toISOString() }
    try {
      const myMember = members.find(m => m.id === user.id)
      const currentGoals = myMember?.goals || profile?.goals || {}
      const existingReplies = currentGoals.buyer_replies || {}
      const needReplies = existingReplies[needId] || []
      const updatedGoals = { ...currentGoals, buyer_replies: { ...existingReplies, [needId]: [...needReplies, newReply] } }
      const { error } = await supabase.from('profiles').update({ goals: updatedGoals }).eq('id', user.id)
      if (error) throw error
      setMembers(ms => ms.map(m => m.id === user.id ? { ...m, goals: updatedGoals } : m))
      setBuyerReplyForms(f => ({ ...f, [needId]: '' }))
    } catch (err) { console.error('saveBuyerReply error:', err) }
    finally { setBuyerReplySaving(null) }
  }

  // ── Recruit Handlers ────────────────────────────────────────────────────
  async function saveRecruit() {
    if (!recruitForm?.name?.trim() || !recruitForm?.email?.trim()) return
    setRecruitSaving(true)
    try {
      const existing = teamData?.team_prefs?.recruits || []
      const newRecruit = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
        name: recruitForm.name.trim(),
        email: recruitForm.email.trim(),
        phone: (recruitForm.phone || '').trim(),
        submittedBy: user.id,
        submitterName: profile?.full_name || 'Agent',
        status: 'submitted',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        mgmtNotes: '',
      }
      const newPrefs = { ...(teamData.team_prefs || {}), recruits: [...existing, newRecruit] }
      const { error: err } = await supabase.from('teams').update({ team_prefs: newPrefs }).eq('id', teamData.id)
      if (err) throw err
      setTeamData(prev => ({ ...prev, team_prefs: newPrefs }))
      setRecruitForm(null)
      // Award 25 XP
      const currentXp = profile?.xp || 0
      await supabase.from('profiles').update({ xp: currentXp + 25 }).eq('id', user.id)
      refreshProfile()
      setSuccess('Recruit submitted! +25 XP')
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError('Failed to submit recruit.')
      console.error('saveRecruit error:', err)
    } finally {
      setRecruitSaving(false)
    }
  }

  async function updateRecruitStatus(recruitId, newStatus) {
    const recruits = teamData?.team_prefs?.recruits || []
    const recruit = recruits.find(r => r.id === recruitId)
    if (!recruit) return
    const wasHired = recruit.status === 'hired'
    const updated = recruits.map(r => r.id === recruitId
      ? { ...r, status: newStatus, updatedAt: new Date().toISOString() } : r)
    const newPrefs = { ...(teamData.team_prefs || {}), recruits: updated }
    try {
      const { error: err } = await supabase.from('teams').update({ team_prefs: newPrefs }).eq('id', teamData.id)
      if (err) throw err
      setTeamData(prev => ({ ...prev, team_prefs: newPrefs }))
      // Award 100 XP bonus to submitter when newly marked as hired
      if (newStatus === 'hired' && !wasHired) {
        const submitter = members.find(m => m.id === recruit.submittedBy)
        if (submitter) {
          const subXp = submitter.xp || 0
          await supabase.from('profiles').update({ xp: subXp + 100 }).eq('id', submitter.id)
          if (submitter.id === user.id) refreshProfile()
          setSuccess(`${recruit.name} marked as hired! ${recruit.submitterName} earned +100 XP`)
          setTimeout(() => setSuccess(''), 3000)
        }
      }
    } catch (err) { console.error('updateRecruitStatus error:', err) }
  }

  async function updateRecruitNotes(recruitId) {
    const updated = (teamData?.team_prefs?.recruits || []).map(r =>
      r.id === recruitId ? { ...r, mgmtNotes: recruitNoteText, updatedAt: new Date().toISOString() } : r)
    const newPrefs = { ...(teamData.team_prefs || {}), recruits: updated }
    try {
      const { error: err } = await supabase.from('teams').update({ team_prefs: newPrefs }).eq('id', teamData.id)
      if (err) throw err
      setTeamData(prev => ({ ...prev, team_prefs: newPrefs }))
      setRecruitNoteEditing(null)
      setRecruitNoteText('')
    } catch (err) { console.error('updateRecruitNotes error:', err) }
  }

  async function deleteRecruit(recruitId) {
    const updated = (teamData?.team_prefs?.recruits || []).filter(r => r.id !== recruitId)
    const newPrefs = { ...(teamData.team_prefs || {}), recruits: updated }
    try {
      const { error: err } = await supabase.from('teams').update({ team_prefs: newPrefs }).eq('id', teamData.id)
      if (err) throw err
      setTeamData(prev => ({ ...prev, team_prefs: newPrefs }))
    } catch (err) { console.error('deleteRecruit error:', err) }
  }

  // ── Recruit Email Settings Handlers ─────────────────────────────────────
  async function saveRecruitEmail() {
    setRecruitEmailSaving(true)
    try {
      const newSettings = {
        subject: recruitEmailSubject.trim(),
        body: recruitEmailBody.trim(),
      }
      const newPrefs = { ...(teamData.team_prefs || {}), recruit_email_settings: newSettings }
      const { error: err } = await supabase.from('teams').update({ team_prefs: newPrefs }).eq('id', teamData.id)
      if (err) throw err
      setTeamData(prev => ({ ...prev, team_prefs: newPrefs }))
      setSuccess('Email template saved!')
      setTimeout(() => setSuccess(''), 2000)
    } catch (err) { console.error('saveRecruitEmail error:', err) }
    finally { setRecruitEmailSaving(false) }
  }

  function resetRecruitEmail() {
    setRecruitEmailSubject('')
    setRecruitEmailBody('')
  }

  // ── Team logo ──
  function handleLogoSelect(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) return
    if (file.size > 5 * 1024 * 1024) return
    setLogoCropSrc(URL.createObjectURL(file))
    if (logoInputRef.current) logoInputRef.current.value = ''
  }
  function cancelLogoCrop() {
    if (logoCropSrc) URL.revokeObjectURL(logoCropSrc)
    setLogoCropSrc(null)
  }
  async function saveTeamLogo(dataUrl) {
    if (logoCropSrc) URL.revokeObjectURL(logoCropSrc)
    setLogoCropSrc(null)
    setLogoSaving(true)
    try {
      const prefs = { ...(teamData.team_prefs || {}), logo_url: dataUrl }
      const { error: err } = await supabase.from('teams').update({ team_prefs: prefs }).eq('id', teamData.id)
      if (err) throw err
      setTeamData(prev => ({ ...prev, team_prefs: prefs }))
    } catch (err) {
      console.error('Logo save failed:', err)
    } finally {
      setLogoSaving(false)
    }
  }

  // ── Derived values (memoized to avoid recomputing on every render) ────────
  const {
    isTeamOwner, teamAdmins, isAdmin, allGroups, myLedGroup,
    isGroupLeader, myGroupMembers, isAdminOrOwner, coachableMembers,
    allCoachingNotes, myCoachingNotes, pendingInvites, allBuyerNeeds, allRecruits,
  } = useMemo(() => {
    const _isSuperAdmin     = profile?.app_role === 'admin'
    const _isTeamOwner      = !!(teamData?.created_by === user?.id) || _isSuperAdmin
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
    const _pendingInvites   = teamData?.team_prefs?.pending_invites || []
    // Buyer Needs: merge from all members' profiles.goals.buyer_needs
    const _allBuyerNeeds = members.flatMap(m => (m.goals?.buyer_needs || []).map(n => ({ ...n, _authorName: m.full_name || 'Agent' })))
    // Merge replies from all members' profiles.goals.buyer_replies
    _allBuyerNeeds.forEach(need => {
      const externalReplies = members.flatMap(m => (m.goals?.buyer_replies?.[need.id] || []))
      need._allReplies = [...(need.replies || []), ...externalReplies]
        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    })
    const _allRecruits = teamData?.team_prefs?.recruits || []
    return {
      isTeamOwner: _isTeamOwner, teamAdmins: _teamAdmins, isAdmin: _isAdmin,
      allGroups: _allGroups, myLedGroup: _myLedGroup, isGroupLeader: _isGroupLeader,
      myGroupMembers: _myGroupMembers, isAdminOrOwner: _isAdminOrOwner,
      coachableMembers: _coachableMembers, allCoachingNotes: _allCoachingNotes,
      myCoachingNotes: _myCoachingNotes, pendingInvites: _pendingInvites,
      allBuyerNeeds: _allBuyerNeeds, allRecruits: _allRecruits,
    }
  }, [teamData, user?.id, members])
  const canViewDetail = (m) => isTeamOwner || isAdmin || (isGroupLeader && myLedGroup?.memberIds.includes(m.id))

  return (
    <>
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
            <div style={{ maxWidth:560 }}>
              {!canUseTeams(profile) && (() => {
                const hasSub = profile?.stripe_customer_id && isActiveBilling(profile?.billing_status)
                const currentPlan = getPlan(profile?.plan)
                return (
                  <div className="card" style={{ padding:24, marginBottom:16, borderLeft:'3px solid #d97706',
                    background:'rgba(217,119,6,.06)' }}>
                    <div style={{ fontWeight:700, color:'var(--text)', fontSize:15, marginBottom:6 }}>
                      Teams require a Team plan ($199/mo)
                    </div>
                    <div style={{ fontSize:13, color:'var(--muted)', lineHeight:1.6, marginBottom:14 }}>
                      {hasSub && currentPlan
                        ? `You're on the ${currentPlan.name} plan. Upgrade to Team to create and manage teams with up to 15 agents.`
                        : 'Subscribe to the Team plan ($199/mo) to create and manage teams with up to 15 agents.'}
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
                        {loading ? 'Redirecting...' : 'Start Team Plan — $199/mo'}
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
            <div style={{ maxWidth:420 }}>
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
            <div style={{ maxWidth:380 }}>
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
            <div>
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
                      <div>
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
                                  onClick={(canViewDetail(m) && !memberDetailLoading && !viewingMember) ? ()=>fetchMemberDetail(m) : undefined}>
                                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
                                    <MemberAvatar member={m} size={34} rank={rank}/>
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
                                    <div key={c.id} style={{ padding:'10px 14px', borderRadius:9, background:'var(--bg2)', border:'1px solid var(--b1)', fontSize:12, color:'var(--muted)',
                                      display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
                                      <div>
                                        <span style={{ fontWeight:600, color:'var(--text)' }}>{c.title}</span>
                                        {winner && <span> — 🏆 {winner.full_name||'Agent'} won {c.bonusXp>0?`+${c.bonusXp} XP`:''}</span>}
                                      </div>
                                      {isAdminOrOwner && (
                                        <button onClick={()=>setConfirmModal({
                                          message:`Delete "${c.title}"?${c.bonusXp>0 && c.winnerId ? ` This will remove ${c.bonusXp} XP from the winner.` : ''}`,
                                          label:'Delete & Remove XP',
                                          onConfirm:()=>deleteGroupChallenge(group.id, c.id),
                                        })} style={{
                                          background:'none', border:'1px solid rgba(220,38,38,.2)', borderRadius:6,
                                          padding:'3px 8px', fontSize:10, cursor:'pointer', color:'var(--red)', flexShrink:0,
                                        }}>🗑</button>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                            </details>
                          )}
                        </div>

                        {/* Group Listings (leaders/admins/owner only) */}
                        {canManageGroup && (()=>{
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
                                  const price = pA(l.price); const comm = resolveCommission(l.commission, l.price)
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

                        {/* Standup Feed (leaders/admins/owner only) */}
                        {canManageGroup && <div>
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
                                  <MemberAvatar member={m} size={34} rank={rank}/>
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
                        </div>}
                      </div>
                    )
                  })()}

                  {/* ── Normal team view (hidden when group dashboard is open) ── */}
                  {!groupView && <>

                  {/* Team header */}
                  {teamData && (
                    <div className="card" style={{ padding:22, marginBottom:16, display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:14,
                      background:'linear-gradient(135deg, rgba(217,119,6,.04) 0%, var(--surface) 60%)', borderTop:'2px solid rgba(217,119,6,.3)' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:16 }}>
                        {/* Team logo */}
                        <div style={{ position:'relative', flexShrink:0, cursor: isTeamOwner ? 'pointer' : 'default' }}
                          onClick={() => isTeamOwner && logoInputRef.current?.click()}
                          title={isTeamOwner ? 'Change team logo' : ''}>
                          {teamData.team_prefs?.logo_url ? (
                            <img src={teamData.team_prefs.logo_url} alt="" style={{
                              width:56, height:56, borderRadius:12, objectFit:'cover',
                              border:'2px solid var(--b2)' }}/>
                          ) : (
                            <div style={{ width:56, height:56, borderRadius:12,
                              background:'linear-gradient(135deg, var(--gold), #92400e)',
                              display:'flex', alignItems:'center', justifyContent:'center',
                              fontSize:24, fontWeight:800, color:'#fff', letterSpacing:0,
                              border:'2px solid rgba(217,119,6,.3)' }}>
                              {(teamData.name||'T').charAt(0).toUpperCase()}
                            </div>
                          )}
                          {isTeamOwner && (
                            <div style={{ position:'absolute', bottom:-3, right:-3, width:20, height:20, borderRadius:'50%',
                              background:'var(--surface)', border:'2px solid var(--b2)',
                              display:'flex', alignItems:'center', justifyContent:'center', fontSize:10 }}>
                              📷
                            </div>
                          )}
                          {logoSaving && (
                            <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center',
                              justifyContent:'center', background:'rgba(0,0,0,.5)', borderRadius:12 }}>
                              <Loader/>
                            </div>
                          )}
                          <input ref={logoInputRef} type="file" accept="image/*" onChange={handleLogoSelect}
                            style={{ display:'none' }}/>
                        </div>
                        <div>
                          <div className="serif" style={{ fontSize:28, color:'var(--text)', marginBottom:4, letterSpacing:'-.01em' }}>{teamData.name}</div>
                          <div style={{ fontSize:12, color:'var(--muted)' }}>
                            {members.length} member{members.length!==1?'s':''}
                            {teamData.max_members ? ` · ${members.length}/${teamData.max_members} seats` : ''}
                          </div>
                          {members.length > 0 && (
                            <button onClick={()=>setTvMode(true)}
                              style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'4px 12px',
                                marginTop:6, background:'rgba(59,130,246,.08)', border:'1px solid rgba(59,130,246,.2)',
                                borderRadius:20, cursor:'pointer', transition:'all .15s',
                                fontSize:11, fontWeight:700, color:'#3b82f6',
                                fontFamily:"'JetBrains Mono',monospace" }}>
                              <span style={{ fontSize:12 }}>📺</span> TV Mode
                            </button>
                          )}
                        </div>
                      </div>
                      <div style={{ display:'flex', gap:12, alignItems:'center' }}>
                        {(isTeamOwner || isAdmin) && (
                        <div className="card-inset" style={{ padding:'10px 20px', textAlign:'center', position:'relative' }}>
                          <div className="label" style={{ marginBottom:4 }}>Invite Code</div>
                          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                            <div className="mono" style={{ fontSize:22, fontWeight:700, color:'var(--gold)', letterSpacing:5 }}>
                              {teamData.invite_code}
                            </div>
                            <button title="Copy invite code" onClick={(e)=>{
                              e.stopPropagation()
                              navigator.clipboard.writeText(teamData.invite_code).then(()=>{
                                const btn = e.currentTarget
                                btn.textContent = '✓'
                                btn.style.color = '#10b981'
                                setTimeout(()=>{ btn.textContent = '📋'; btn.style.color = 'var(--muted)' }, 1500)
                              })
                            }} style={{
                              background:'none', border:'1px solid var(--b2)', borderRadius:6,
                              cursor:'pointer', fontSize:14, padding:'4px 7px', color:'var(--muted)',
                              transition:'all .15s', lineHeight:1,
                            }}>📋</button>
                          </div>
                        </div>
                        )}
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

                  {/* ── Page Tabs (prominent, at top) ── */}
                  <div className="tabs" style={{ marginBottom:24, display:'flex', alignItems:'center', gap:2, flexWrap:'wrap' }}>
                    <button className={`tab-item${teamsTab==='roster'?' on':''}`} onClick={()=>setTeamsTab('roster')}
                      style={{ fontSize:14, padding:'10px 18px', fontWeight:600 }}>👥 Roster</button>
                    <button className={`tab-item${teamsTab==='challenges'?' on':''}`} onClick={()=>setTeamsTab('challenges')}
                      style={{ fontSize:14, padding:'10px 18px', fontWeight:600 }}>🏆 Challenges</button>
                    <button className={`tab-item${teamsTab==='listings'?' on':''}`} onClick={()=>setTeamsTab('listings')}
                      style={{ fontSize:14, padding:'10px 18px', fontWeight:600 }}>🏠 Listings</button>
                    <button className={`tab-item${teamsTab==='buyers'?' on':''}`} onClick={()=>setTeamsTab('buyers')}
                      style={{ fontSize:14, padding:'10px 18px', fontWeight:600 }}>🏡 Buyers</button>
                    <button className={`tab-item${teamsTab==='groups'?' on':''}`} onClick={()=>setTeamsTab('groups')}
                      style={{ fontSize:14, padding:'10px 18px', fontWeight:600 }}>🫂 Groups</button>
                    <button className={`tab-item${teamsTab==='recruit'?' on':''}`} onClick={()=>setTeamsTab('recruit')}
                      style={{ fontSize:14, padding:'10px 18px', fontWeight:600 }}>🎯 Recruit</button>
                    {isTeamOwner && (
                      <button className={`tab-item${teamsTab==='settings'?' on':''}`} onClick={()=>setTeamsTab('settings')}
                        style={{ fontSize:14, padding:'10px 18px', fontWeight:600 }}>⚙️ Settings</button>
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
                            <MemberAvatar member={m} size={38} rank={rank}/>
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
                  </>
                  )} {/* end roster tab */}

                  {/* ════════ CHALLENGES TAB ════════ */}
                  {teamsTab==='challenges' && (
                  <>
                  {(() => {
                    const isOwner = teamData?.created_by === user?.id
                    const allChallenges = teamData?.team_prefs?.challenges || []
                    const active  = allChallenges.filter(c=>c.status==='active')
                    const ended   = allChallenges.filter(c=>c.status==='ended').slice(-3).reverse()
                    return (
                      <div>
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
                            <div className="serif" style={{ fontSize:15, color:'var(--text)', marginBottom:8 }}>New Challenge</div>
                            {/* Quick-start templates */}
                            <div style={{ marginBottom:14 }}>
                              <div className="label" style={{ marginBottom:6, fontSize:10 }}>Quick Start Templates</div>
                              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                                {[
                                  { icon:'📞', title:'Prospecting Blitz', metric:'prospecting', bonusXp:'500' },
                                  { icon:'📅', title:'Appointment Sprint', metric:'appointments', bonusXp:'400' },
                                  { icon:'🔑', title:'Showing Challenge', metric:'showings', bonusXp:'400' },
                                  { icon:'🏠', title:'Listing Contest', metric:'listings', bonusXp:'750' },
                                  { icon:'🎉', title:'Close More', metric:'closed', bonusXp:'1000' },
                                  { icon:'⚡', title:'XP Race', metric:'xp', bonusXp:'300' },
                                ].map(t=>(
                                  <button key={t.title} onClick={()=>setChallengeForm({ title:t.title, metric:t.metric, bonusXp:t.bonusXp })} style={{
                                    background:challengeForm.title===t.title?'var(--gold2)':'var(--surface)', border:'1px solid var(--b2)',
                                    borderRadius:8, padding:'6px 12px', fontSize:11, cursor:'pointer',
                                    color:challengeForm.title===t.title?'#fff':'var(--text2)', fontWeight:600,
                                    display:'flex', alignItems:'center', gap:4, transition:'all .15s',
                                    fontFamily:'Poppins,sans-serif',
                                  }}>{t.icon} {t.title}</button>
                                ))}
                              </div>
                            </div>
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
                                  <div style={{ display:'flex', gap:6 }}>
                                    <button onClick={()=>setConfirmModal({ message:'Award XP to the current leader and end this challenge?', label:'End & Award', onConfirm:()=>endChallenge(c.id) })}
                                      style={{ background:'rgba(220,38,38,.08)', border:'1px solid rgba(220,38,38,.2)',
                                        color:'var(--red)', borderRadius:7, padding:'6px 12px', fontSize:11, cursor:'pointer', fontWeight:600, whiteSpace:'nowrap' }}>
                                      End & Award
                                    </button>
                                    <button onClick={()=>setConfirmModal({ message:`Delete "${c.title}" without awarding XP?`, label:'Delete', onConfirm:()=>deleteChallenge(c.id) })}
                                      style={{ background:'none', border:'1px solid rgba(220,38,38,.2)', borderRadius:7,
                                        padding:'6px 10px', fontSize:11, cursor:'pointer', color:'var(--red)', whiteSpace:'nowrap' }}>
                                      🗑
                                    </button>
                                  </div>
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
                                    border:'1px solid var(--b1)', fontSize:12, color:'var(--muted)',
                                    display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
                                    <div>
                                      <span style={{ fontWeight:600, color:'var(--text)' }}>{c.title}</span>
                                      {winner && <span> — 🏆 {winner.full_name||'Agent'} won {c.bonusXp>0?`+${c.bonusXp} XP`:''}</span>}
                                    </div>
                                    {isTeamOwner && (
                                      <button onClick={()=>setConfirmModal({
                                        message:`Delete "${c.title}"?${c.bonusXp>0 && c.winnerId ? ` This will remove ${c.bonusXp} XP from the winner.` : ''}`,
                                        label:'Delete & Remove XP',
                                        onConfirm:()=>deleteChallenge(c.id),
                                      })} style={{
                                        background:'none', border:'1px solid rgba(220,38,38,.2)', borderRadius:6,
                                        padding:'3px 8px', fontSize:10, cursor:'pointer', color:'var(--red)', flexShrink:0,
                                      }}>🗑</button>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          </details>
                        )}
                      </div>
                    )
                  })()}
                  </>
                  )} {/* end challenges tab */}

                  {/* ════════ LISTINGS TAB ════════ */}
                  {teamsTab==='listings' && (()=>{
                    const parseNum = v => { const n=parseFloat(String(v||'').replace(/[^0-9.]/g,'')); return isNaN(n)?0:n }
                    const activeListings = teamListings.filter(l=>l.status!=='pending')
                    const pendingListings = teamListings.filter(l=>l.status==='pending')
                    const totalVolume = teamListings.reduce((s,l)=>s+parseNum(l.price),0)
                    const totalCommission = teamListings.reduce((s,l)=>s+resolveCommission(l.commission, l.price),0)
                    // Agent breakdown
                    const agentMap = {}
                    teamListings.forEach(l=>{
                      const aid = l.user_id
                      if (!agentMap[aid]) agentMap[aid] = { name:l.agentName, count:0, volume:0, commission:0 }
                      agentMap[aid].count++
                      agentMap[aid].volume += parseNum(l.price)
                      agentMap[aid].commission += resolveCommission(l.commission, l.price)
                    })
                    const agentBreakdown = Object.entries(agentMap)
                      .map(([id,v])=>({id,...v}))
                      .sort((a,b)=>b.count-a.count)
                    return (
                  <>
                  <div>
                    {/* Header */}
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
                      <div className="serif" style={{ fontSize:22, color:'var(--text)' }}>🏠 Team Listings</div>
                    </div>

                    {teamListings.length === 0 ? (
                      <div style={{ border:'1.5px dashed var(--b2)', borderRadius:12, padding:'32px 20px',
                        fontSize:14, color:'var(--muted)', textAlign:'center' }}>
                        🏠 No active listings right now.
                      </div>
                    ) : (<>
                    {/* Summary stat cards */}
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))', gap:12, marginBottom:24 }}>
                      <div className="card" style={{ padding:'16px 18px', borderLeft:'3px solid #10b981' }}>
                        <div style={{ fontSize:10, color:'var(--muted)', fontWeight:700, letterSpacing:'.5px', textTransform:'uppercase', marginBottom:6 }}>Active</div>
                        <div className="serif" style={{ fontSize:28, color:'#10b981', fontWeight:700, lineHeight:1 }}>{activeListings.length}</div>
                      </div>
                      <div className="card" style={{ padding:'16px 18px', borderLeft:'3px solid #6366f1' }}>
                        <div style={{ fontSize:10, color:'var(--muted)', fontWeight:700, letterSpacing:'.5px', textTransform:'uppercase', marginBottom:6 }}>Pending</div>
                        <div className="serif" style={{ fontSize:28, color:'#6366f1', fontWeight:700, lineHeight:1 }}>{pendingListings.length}</div>
                      </div>
                      <div className="card" style={{ padding:'16px 18px', borderLeft:'3px solid var(--text)' }}>
                        <div style={{ fontSize:10, color:'var(--muted)', fontWeight:700, letterSpacing:'.5px', textTransform:'uppercase', marginBottom:6 }}>Total Volume</div>
                        <div className="mono" style={{ fontSize:20, color:'var(--text)', fontWeight:700, lineHeight:1 }}>{fmtMoney(totalVolume)}</div>
                      </div>
                      <div className="card" style={{ padding:'16px 18px', borderLeft:'3px solid var(--green)' }}>
                        <div style={{ fontSize:10, color:'var(--muted)', fontWeight:700, letterSpacing:'.5px', textTransform:'uppercase', marginBottom:6 }}>Total Commission</div>
                        <div className="mono" style={{ fontSize:20, color:'var(--green)', fontWeight:700, lineHeight:1 }}>{fmtMoney(totalCommission)}</div>
                      </div>
                    </div>

                    {/* Agent breakdown */}
                    {agentBreakdown.length > 1 && (
                      <div style={{ marginBottom:24 }}>
                        <div style={{ fontSize:12, color:'var(--muted)', fontWeight:700, letterSpacing:'.5px', textTransform:'uppercase', marginBottom:10 }}>By Agent</div>
                        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                          {agentBreakdown.map(a=>{
                            const maxCount = agentBreakdown[0].count
                            const isMe = a.id === user?.id
                            return (
                              <div key={a.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'8px 14px',
                                borderRadius:8, background: isMe ? 'var(--gold3)' : 'var(--bg2)',
                                border: isMe ? '1px solid rgba(217,119,6,.25)' : '1px solid var(--b1)' }}>
                                <div style={{ flex:1, minWidth:0 }}>
                                  <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4 }}>
                                    <span style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{a.name}</span>
                                    {isMe && <span style={{ fontSize:8, padding:'1px 5px', borderRadius:3, background:'var(--gold4)', color:'var(--gold)', fontWeight:700 }}>YOU</span>}
                                    <span className="mono" style={{ fontSize:11, color:'var(--muted)', marginLeft:'auto' }}>
                                      {a.count} listing{a.count!==1?'s':''}
                                    </span>
                                  </div>
                                  <div style={{ height:5, background:'var(--b1)', borderRadius:99, overflow:'hidden' }}>
                                    <div style={{ height:'100%', width:`${Math.max(Math.round(a.count/maxCount*100),8)}%`,
                                      background: isMe ? 'var(--gold)' : '#10b981', borderRadius:99, transition:'width .4s' }}/>
                                  </div>
                                </div>
                                <div style={{ textAlign:'right', flexShrink:0 }}>
                                  <div className="mono" style={{ fontSize:12, color:'var(--text)', fontWeight:600 }}>{fmtMoney(a.volume)}</div>
                                  {a.commission>0 && <div className="mono" style={{ fontSize:10, color:'var(--green)' }}>{fmtMoney(a.commission)} comm</div>}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {/* Listing cards */}
                    <div style={{ fontSize:12, color:'var(--muted)', fontWeight:700, letterSpacing:'.5px', textTransform:'uppercase', marginBottom:10 }}>All Listings</div>
                    <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                      {teamListings.map(l => {
                        const price = parseNum(l.price); const comm = resolveCommission(l.commission, l.price)
                        const isMe  = l.user_id === user?.id
                        const isPending = l.status === 'pending'
                        const sc = isPending ? '#6366f1' : '#10b981'
                        return (
                          <div key={l.id} className="card" style={{ padding:'14px 18px',
                            border:`1px solid ${isMe ? 'rgba(217,119,6,.3)' : 'var(--b2)'}`,
                            background: isMe ? 'var(--gold3)' : 'var(--surface)' }}>
                            <div style={{ display:'flex', alignItems:'flex-start', gap:12 }}>
                              {/* Status dot */}
                              <div style={{ width:8, height:8, borderRadius:'50%', background:sc, flexShrink:0, marginTop:6 }}/>
                              <div style={{ flex:1, minWidth:0 }}>
                                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4, flexWrap:'wrap' }}>
                                  <span style={{ fontSize:14, color:'var(--text)', fontWeight:600,
                                    overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1, minWidth:0 }}>
                                    {l.address || 'Untitled Listing'}
                                  </span>
                                  <span style={{ fontSize:9, padding:'2px 8px', borderRadius:4, fontWeight:700,
                                    background:`${sc}15`, color:sc, border:`1px solid ${sc}30`,
                                    textTransform:'uppercase', letterSpacing:'.5px', flexShrink:0 }}>
                                    {l.status || 'Active'}
                                  </span>
                                </div>
                                <div style={{ display:'flex', alignItems:'center', gap:16, flexWrap:'wrap' }}>
                                  <span style={{ fontSize:11, color: isMe ? 'var(--gold)' : 'var(--muted)', fontWeight: isMe ? 700 : 500 }}>
                                    {isMe ? '⭐ You' : l.agentName}
                                  </span>
                                  {price>0 && (
                                    <span className="mono" style={{ fontSize:13, color:'var(--text)', fontWeight:700 }}>
                                      {fmtMoney(price)}
                                    </span>
                                  )}
                                  {comm>0 && (
                                    <span className="mono" style={{ fontSize:12, color:'var(--green)', fontWeight:600 }}>
                                      {fmtMoney(comm)} comm
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    </>)}
                  </div>
                  </>
                  )})()}{/* end listings tab */}

                  {/* ════════ GROUPS TAB ════════ */}
                  {teamsTab==='groups' && (
                        <div>
                          {/* My Groups — visible to everyone */}
                          {(()=>{
                            const myGroups = allGroups.filter(g => g.memberIds.includes(user?.id) || g.leaderId===user?.id)
                            if (myGroups.length === 0 && !isAdminOrOwner) return (
                              <div style={{ border:'1.5px dashed var(--b2)', borderRadius:10, padding:'18px 20px',
                                fontSize:13, color:'var(--muted)', textAlign:'center', marginBottom:24 }}>
                                🫂 You're not in any group yet. Ask your team owner to add you.
                              </div>
                            )
                            if (myGroups.length === 0) return (
                              <div style={{ fontSize:13, color:'var(--muted)', fontStyle:'italic', padding:'16px 0' }}>
                                No groups yet.{isTeamOwner && ' Go to Settings → Groups to create one.'}
                              </div>
                            )
                            return (
                              <div style={{ marginBottom:28 }}>
                                {myGroups.map(myGroup => {
                                  const isLeader  = myGroup.leaderId === user?.id
                                  const groupMates = members.filter(m => (myGroup.memberIds.includes(m.id) || myGroup.leaderId===m.id) && m.id!==user?.id)
                                  const me = members.find(m => m.id===user?.id)
                                  return (
                                    <div key={myGroup.id} className="card" style={{ padding:20, marginBottom:12,
                                      border:'1px solid rgba(139,92,246,.3)',
                                      background:'linear-gradient(135deg, rgba(139,92,246,.05) 0%, var(--surface) 70%)' }}>
                                      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14, flexWrap:'wrap' }}>
                                        <span style={{ fontSize:18 }}>🫂</span>
                                        <span className="serif" style={{ fontSize:18, color:'var(--text)' }}>{myGroup.name}</span>
                                        {isLeader && <span style={{ fontSize:10, padding:'2px 8px', borderRadius:10, background:'rgba(139,92,246,.12)', color:'#8b5cf6', fontWeight:700 }}>LEADER</span>}
                                        <span style={{ fontSize:11, padding:'2px 8px', borderRadius:10, background:'rgba(139,92,246,.08)', color:'#8b5cf6', fontWeight:600 }}>{myGroup.memberIds.length} members</span>
                                        <button className="btn-outline" style={{ marginLeft:'auto', fontSize:11, padding:'5px 12px' }}
                                          onClick={()=>{ setGroupView(myGroup.id); setGroupChallengeForm(null) }}>
                                          View Dashboard →
                                        </button>
                                      </div>
                                      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:12 }}>
                                        {me && (()=>{
                                          const myRank  = getRank(me.xp||0)
                                          const myStats = memberStats[me.id]||{}
                                          return (
                                            <div className="card" style={{ padding:14, border:'1px solid rgba(217,119,6,.3)', background:'var(--gold3)' }}>
                                              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
                                                <MemberAvatar member={me} size={34} rank={myRank}/>
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
                                                <MemberAvatar member={mate} size={34} rank={mateRank}/>
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
                              </div>
                            )
                          })()}
                        </div>
                  )} {/* end groups tab */}

                  {/* ════════ BUYERS TAB ════════ */}
                  {teamsTab==='buyers' && (
                    <div>
                      {/* Header */}
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20, flexWrap:'wrap', gap:10 }}>
                        <div>
                          <div className="serif" style={{ fontSize:22, color:'var(--text)', marginBottom:2 }}>🏡 Buyer Needs</div>
                          <div style={{ fontSize:12, color:'var(--muted)' }}>Post what your buyers are looking for. Teammates can reply with matching properties.</div>
                        </div>
                      </div>

                      {/* Filter pills */}
                      <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:20 }}>
                        {[{id:'all',label:'All Members'}, ...members.map(m=>({id:m.id,label:m.full_name||'Agent'}))].map(opt=>(
                          <button key={opt.id} onClick={()=>setBuyerFilter(opt.id)} style={{
                            padding:'5px 14px', borderRadius:20, fontSize:12, fontWeight:600, cursor:'pointer',
                            border: buyerFilter===opt.id ? 'none' : '1px solid var(--b2)',
                            background: buyerFilter===opt.id ? 'var(--text)' : 'transparent',
                            color: buyerFilter===opt.id ? 'var(--bg)' : 'var(--text2)',
                            transition:'all .15s', fontFamily:'Poppins,sans-serif',
                          }}>{opt.label}{opt.id===user?.id ? ' (You)' : ''}</button>
                        ))}
                      </div>

                      {/* Needs feed */}
                      {(()=>{
                        const visible = [...allBuyerNeeds]
                          .filter(n => buyerFilter==='all' || n.authorId===buyerFilter)
                          .sort((a,b) => (a.resolved?1:0)-(b.resolved?1:0) || new Date(b.createdAt)-new Date(a.createdAt))
                        return (
                          <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:20 }}>
                            {visible.length===0 && (
                              <div style={{ border:'1.5px dashed var(--b2)', borderRadius:12, padding:'32px 20px',
                                fontSize:14, color:'var(--muted)', textAlign:'center' }}>
                                No buyer needs posted yet. Add one below!
                              </div>
                            )}
                            {visible.map(need=>{
                              const name = need._authorName || 'Agent'
                              const isMe = need.authorId===user?.id
                              const canManage = need.authorId===user?.id || isTeamOwner
                              return (
                                <div key={need.id} className="card" style={{
                                  padding:'14px 16px',
                                  border: need.resolved ? '1px solid rgba(16,185,129,.4)' : isMe ? '1px solid rgba(217,119,6,.3)' : '1px solid var(--b2)',
                                  background: need.resolved ? 'rgba(16,185,129,.04)' : isMe ? 'var(--gold3)' : 'var(--surface)',
                                  opacity: need.resolved ? 0.7 : 1,
                                }}>
                                  <div style={{ display:'flex', alignItems:'flex-start', gap:10 }}>
                                    {/* Avatar */}
                                    {(()=>{ const author = members.find(mm=>mm.id===need.authorId); return author ? <MemberAvatar member={author} size={32}/> : (
                                      <div style={{ width:32, height:32, borderRadius:'50%',
                                        background: isMe ? 'rgba(217,119,6,.15)' : 'rgba(14,165,233,.12)',
                                        border: `1.5px solid ${isMe ? 'rgba(217,119,6,.3)' : 'rgba(14,165,233,.25)'}`,
                                        display:'flex', alignItems:'center', justifyContent:'center',
                                        fontSize:14, fontWeight:700, color: isMe ? 'var(--gold)' : '#0ea5e9', flexShrink:0 }}>
                                        {name.charAt(0).toUpperCase()}
                                      </div>
                                    )})()}
                                    <div style={{ flex:1, minWidth:0 }}>
                                      {/* Header row */}
                                      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6, flexWrap:'wrap' }}>
                                        <span style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{name}</span>
                                        {isMe && <span style={{ fontSize:9, padding:'2px 5px', borderRadius:3, background:'var(--gold4)', color:'var(--gold)', fontWeight:700 }}>YOU</span>}
                                        {need.resolved && <span style={{ fontSize:9, padding:'2px 6px', borderRadius:4, fontWeight:700, background:'rgba(16,185,129,.12)', color:'#10b981', border:'1px solid rgba(16,185,129,.25)' }}>MATCHED</span>}
                                        <span style={{ marginLeft:'auto', fontSize:11, color:'var(--dim)' }}>{relativeTime(need.createdAt)}</span>
                                      </div>
                                      {/* Need text */}
                                      <div style={{ fontSize:13, color:'var(--text)', lineHeight:1.6, marginBottom:8, whiteSpace:'pre-wrap' }}>{need.text}</div>

                                      {/* Replies thread */}
                                      {(need._allReplies||[]).length > 0 && (
                                        <div style={{ borderLeft:'2px solid var(--b2)', paddingLeft:10, marginBottom:10, display:'flex', flexDirection:'column', gap:8 }}>
                                          {(need._allReplies||[]).map(r=>{
                                            const rAuthor = members.find(m=>m.id===r.authorId)
                                            const rName = rAuthor?.full_name || (r.authorId===user?.id ? 'You' : 'Agent')
                                            const rIsMe = r.authorId===user?.id
                                            return (
                                              <div key={r.id}>
                                                <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:3 }}>
                                                  <span style={{ fontSize:11, fontWeight:600, color: rIsMe ? 'var(--gold)' : 'var(--text)' }}>{rName}</span>
                                                  {rIsMe && <span style={{ fontSize:8, padding:'1px 5px', borderRadius:3, background:'var(--gold4)', color:'var(--gold)', fontWeight:700 }}>YOU</span>}
                                                  <span style={{ fontSize:10, color:'var(--dim)' }}>{relativeTime(r.createdAt)}</span>
                                                </div>
                                                <div style={{ fontSize:12, color:'var(--text2)', lineHeight:1.5, whiteSpace:'pre-wrap' }}>{r.text}</div>
                                              </div>
                                            )
                                          })}
                                        </div>
                                      )}

                                      {/* Reply input */}
                                      {!need.resolved && (
                                        <div style={{ display:'flex', gap:6, marginBottom:8 }}>
                                          <input className="field-input" value={buyerReplyForms[need.id]||''}
                                            onChange={e=>setBuyerReplyForms(f=>({...f,[need.id]:e.target.value.slice(0,500)}))}
                                            onKeyDown={e=>e.key==='Enter'&&!e.shiftKey&&saveBuyerReply(need.id)}
                                            placeholder="Reply with a matching property..."
                                            style={{ flex:1, padding:'6px 10px', fontSize:12 }}/>
                                          <button onClick={()=>saveBuyerReply(need.id)}
                                            disabled={buyerReplySaving===need.id||!(buyerReplyForms[need.id]||'').trim()}
                                            style={{ fontSize:11, padding:'6px 12px', borderRadius:6, cursor:'pointer',
                                              background:'var(--text)', border:'none', color:'var(--bg)', fontWeight:600, flexShrink:0,
                                              opacity: buyerReplySaving===need.id||!(buyerReplyForms[need.id]||'').trim() ? 0.4 : 1 }}>
                                            {buyerReplySaving===need.id ? '...' : 'Send'}
                                          </button>
                                        </div>
                                      )}

                                      {/* Resolve / Delete actions */}
                                      {canManage && (
                                        <div style={{ display:'flex', gap:6 }}>
                                          <button onClick={()=>toggleBuyerNeedResolved(need.id)} style={{
                                            fontSize:11, padding:'4px 10px', borderRadius:6, cursor:'pointer',
                                            background: need.resolved ? 'rgba(16,185,129,.12)' : 'var(--bg2)',
                                            border: need.resolved ? '1px solid rgba(16,185,129,.3)' : '1px solid var(--b2)',
                                            color: need.resolved ? '#10b981' : 'var(--muted)', fontWeight:600 }}>
                                            {need.resolved ? 'Reopen' : 'Mark Matched'}
                                          </button>
                                          <button onClick={()=>setConfirmModal({ message:'Delete this buyer need and all its replies?', label:'Delete', onConfirm:()=>deleteBuyerNeed(need.id) })} style={{
                                            fontSize:11, padding:'4px 10px', borderRadius:6, cursor:'pointer',
                                            background:'rgba(220,38,38,.06)', border:'1px solid rgba(220,38,38,.2)',
                                            color:'var(--red)', fontWeight:600 }}>
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

                      {/* Add buyer need form / button */}
                      {buyerNeedForm ? (
                        <div className="card" style={{ padding:20, border:'1px solid rgba(14,165,233,.25)', background:'rgba(14,165,233,.04)' }}>
                          <div className="serif" style={{ fontSize:15, color:'var(--text)', marginBottom:14 }}>Post a Buyer Need</div>
                          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                            <div>
                              <div style={{ fontSize:12, color:'var(--muted)', marginBottom:5 }}>What is your buyer looking for?</div>
                              <textarea className="field-input" value={buyerNeedForm.text}
                                onChange={e=>setBuyerNeedForm(f=>({...f,text:e.target.value.slice(0,UI_NOTE_LIMIT)}))}
                                placeholder="e.g. 3BR/2BA in Westlake area, $400-500k range, needs good schools nearby..."
                                rows={4} style={{ width:'100%', resize:'vertical', minHeight:90 }}/>
                              <div style={{ fontSize:10, color:'var(--dim)', textAlign:'right', marginTop:3 }}>
                                {(buyerNeedForm.text||'').length}/{UI_NOTE_LIMIT}
                              </div>
                            </div>
                            <div style={{ display:'flex', gap:8 }}>
                              <button className="btn-primary" onClick={saveBuyerNeed}
                                disabled={buyerNeedSaving||!buyerNeedForm.text?.trim()}
                                style={{ fontSize:13, padding:'9px 22px' }}>
                                {buyerNeedSaving ? 'Posting...' : 'Post Need'}
                              </button>
                              <button className="btn-outline" onClick={()=>setBuyerNeedForm(null)} style={{ fontSize:13 }}>Cancel</button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <button className="btn-outline"
                          onClick={()=>setBuyerNeedForm({ text:'' })}
                          style={{ fontSize:13 }}>+ Post a Buyer Need</button>
                      )}
                    </div>
                  )} {/* end buyers tab */}

                  {/* ════════ RECRUIT TAB ════════ */}
                  {teamsTab==='recruit' && (
                    <div>
                      {/* Summary stat cards */}
                      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))', gap:10, marginBottom:20 }}>
                        <StatCard label="Total Submitted" value={allRecruits.length} color="#3b82f6"/>
                        <StatCard label="Contacted" value={allRecruits.filter(r=>r.status==='contacted').length} color="#d97706"/>
                        <StatCard label="Hired" value={allRecruits.filter(r=>r.status==='hired').length} color="#10b981"/>
                        <StatCard label="Declined" value={allRecruits.filter(r=>r.status==='declined').length} color="var(--muted)"/>
                      </div>

                      {/* Filter pills */}
                      <div style={{ display:'flex', gap:6, marginBottom:18, flexWrap:'wrap' }}>
                        {['all','submitted','contacted','hired','declined'].map(f => (
                          <button key={f} onClick={()=>setRecruitFilter(f)}
                            style={{
                              padding:'5px 14px', borderRadius:20, fontSize:11, fontWeight:700,
                              fontFamily:"'JetBrains Mono',monospace", cursor:'pointer', transition:'all .15s',
                              textTransform:'capitalize',
                              background: recruitFilter===f ? 'var(--gold2)' : 'var(--bg2)',
                              color: recruitFilter===f ? '#fff' : 'var(--muted)',
                              border: recruitFilter===f ? '1px solid var(--gold2)' : '1px solid var(--b2)',
                            }}>
                            {f === 'all' ? `All (${allRecruits.length})` : `${f} (${allRecruits.filter(r=>r.status===f).length})`}
                          </button>
                        ))}
                      </div>

                      {/* Submit form */}
                      {recruitForm ? (
                        <div className="card" style={{ padding:18, marginBottom:20 }}>
                          <div style={{ fontSize:14, fontWeight:700, marginBottom:12, color:'var(--text)' }}>🎯 Submit a Recruit</div>
                          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                            <input className="field-input" placeholder="Agent Name *" value={recruitForm.name}
                              onChange={e=>setRecruitForm(f=>({...f, name:e.target.value}))}
                              style={{ fontSize:13 }}/>
                            <input className="field-input" placeholder="Email *" type="email" value={recruitForm.email}
                              onChange={e=>setRecruitForm(f=>({...f, email:e.target.value}))}
                              style={{ fontSize:13 }}/>
                            <input className="field-input" placeholder="Phone" type="tel" value={recruitForm.phone}
                              onChange={e=>setRecruitForm(f=>({...f, phone:e.target.value}))}
                              style={{ fontSize:13 }}/>
                            <div style={{ display:'flex', gap:8 }}>
                              <button className="btn-primary" onClick={saveRecruit}
                                disabled={recruitSaving || !recruitForm.name?.trim() || !recruitForm.email?.trim()}
                                style={{ fontSize:12, padding:'8px 18px' }}>
                                {recruitSaving ? 'Submitting...' : 'Submit (+25 XP)'}
                              </button>
                              <button className="btn-outline" onClick={()=>setRecruitForm(null)}
                                style={{ fontSize:12, padding:'8px 14px' }}>Cancel</button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <button className="btn-outline" onClick={()=>setRecruitForm({ name:'', email:'', phone:'' })}
                          style={{ fontSize:13, marginBottom:20 }}>🎯 Submit a Recruit</button>
                      )}

                      {/* Recruit cards */}
                      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                        {(() => {
                          const STATUS_COLORS = { submitted:'#3b82f6', contacted:'#d97706', hired:'#10b981', declined:'#dc2626' }
                          const filtered = allRecruits
                            .filter(r => recruitFilter === 'all' || r.status === recruitFilter)
                            .filter(r => isAdminOrOwner || r.submittedBy === user.id)
                            .sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt))
                          if (filtered.length === 0) return (
                            <div style={{ textAlign:'center', padding:40, color:'var(--muted)', fontSize:13 }}>
                              {allRecruits.length === 0 ? 'No recruits submitted yet. Be the first!' : 'No recruits match this filter.'}
                            </div>
                          )
                          return filtered.map(r => {
                            const col = STATUS_COLORS[r.status] || '#3b82f6'
                            const submitter = members.find(m => m.id === r.submittedBy)
                            return (
                              <div key={r.id} className="card" style={{ padding:16 }}>
                                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:12, flexWrap:'wrap' }}>
                                  <div style={{ flex:1, minWidth:180 }}>
                                    <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:6 }}>
                                      {submitter && <MemberAvatar member={submitter} size={28}/>}
                                      <div>
                                        <div style={{ fontSize:15, fontWeight:700, color:'var(--text)' }}>{r.name}</div>
                                        <div style={{ fontSize:11, color:'var(--muted)' }}>
                                          by {r.submitterName} · {relativeTime(r.createdAt)}
                                        </div>
                                      </div>
                                    </div>
                                    <div style={{ display:'flex', flexDirection:'column', gap:3, marginTop:8, fontSize:12 }}>
                                      <div style={{ color:'var(--dim)' }}>📧 <span style={{ color:'var(--text)' }}>{r.email}</span></div>
                                      {r.phone && <div style={{ color:'var(--dim)' }}>📞 <span style={{ color:'var(--text)' }}>{r.phone}</span></div>}
                                    </div>
                                  </div>
                                  <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:8 }}>
                                    {/* Status badge */}
                                    <span style={{
                                      padding:'3px 10px', borderRadius:12, fontSize:10, fontWeight:700,
                                      textTransform:'uppercase', letterSpacing:'.5px',
                                      background:`${col}18`, color:col, border:`1px solid ${col}33`,
                                    }}>{r.status}</span>
                                    {/* Management controls */}
                                    {isAdminOrOwner && (
                                      <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                                        <select value={r.status} onChange={e=>updateRecruitStatus(r.id, e.target.value)}
                                          style={{
                                            fontSize:11, padding:'4px 8px', borderRadius:6,
                                            border:'1px solid var(--b2)', background:'var(--bg2)',
                                            color:'var(--text)', cursor:'pointer',
                                          }}>
                                          <option value="submitted">Submitted</option>
                                          <option value="contacted">Contacted</option>
                                          <option value="hired">Hired</option>
                                          <option value="declined">Declined</option>
                                        </select>
                                        <a href={buildRecruitMailto(r, r.submitterName, teamData?.name, teamData?.team_prefs?.recruit_email_settings)}
                                          title={`Email ${r.name}`} style={{
                                          background:'none', border:'1px solid var(--b2)', borderRadius:6,
                                          padding:'3px 8px', fontSize:11, cursor:'pointer', color:'var(--muted)',
                                          textDecoration:'none', display:'inline-flex', alignItems:'center',
                                        }}>✉️</a>
                                        <button onClick={()=>{
                                          if (recruitNoteEditing === r.id) { setRecruitNoteEditing(null); setRecruitNoteText('') }
                                          else { setRecruitNoteEditing(r.id); setRecruitNoteText(r.mgmtNotes || '') }
                                        }} style={{
                                          background:'none', border:'1px solid var(--b2)', borderRadius:6,
                                          padding:'3px 8px', fontSize:11, cursor:'pointer', color:'var(--muted)',
                                        }}>📝</button>
                                        <button onClick={()=>setConfirmModal({
                                          message:`Remove recruit "${r.name}"?`,
                                          label:'Delete',
                                          onConfirm:()=>deleteRecruit(r.id),
                                        })} style={{
                                          background:'none', border:'1px solid rgba(220,38,38,.2)', borderRadius:6,
                                          padding:'3px 8px', fontSize:11, cursor:'pointer', color:'var(--red)',
                                        }}>✕</button>
                                      </div>
                                    )}
                                  </div>
                                </div>
                                {/* Management notes (expandable) */}
                                {isAdminOrOwner && recruitNoteEditing === r.id && (
                                  <div style={{ marginTop:10, borderTop:'1px solid var(--b2)', paddingTop:10 }}>
                                    <textarea className="field-input" value={recruitNoteText}
                                      onChange={e=>setRecruitNoteText(e.target.value)}
                                      placeholder="Management notes..."
                                      rows={2} style={{ fontSize:12, resize:'vertical' }}/>
                                    <div style={{ display:'flex', gap:6, marginTop:6 }}>
                                      <button className="btn-primary" onClick={()=>updateRecruitNotes(r.id)}
                                        style={{ fontSize:11, padding:'5px 12px' }}>Save Note</button>
                                      <button className="btn-outline" onClick={()=>{setRecruitNoteEditing(null);setRecruitNoteText('')}}
                                        style={{ fontSize:11, padding:'5px 12px' }}>Cancel</button>
                                    </div>
                                  </div>
                                )}
                                {isAdminOrOwner && r.mgmtNotes && recruitNoteEditing !== r.id && (
                                  <div style={{ marginTop:8, fontSize:11, color:'var(--dim)', fontStyle:'italic',
                                    borderTop:'1px solid var(--b2)', paddingTop:8 }}>
                                    📝 {r.mgmtNotes}
                                  </div>
                                )}
                              </div>
                            )
                          })
                        })()}
                      </div>
                    </div>
                  )} {/* end recruit tab */}

                  {/* ════════ SETTINGS TAB (owner only) ════════ */}
                  {teamsTab==='settings' && isTeamOwner && (
                        <div>
                          {/* Settings sub-tabs */}
                          <div style={{ display:'flex', gap:0, marginBottom:20, borderBottom:'1px solid var(--b2)', flexWrap:'wrap' }}>
                            {[
                              { id:'invites', label:'✉️ Invites' },
                              { id:'admins',  label:'👑 Admins' },
                              { id:'groups',  label:'🫂 Groups' },
                              { id:'ai',      label:'🤖 AI Tools' },
                              { id:'directory', label:'🔗 Directory' },
                              { id:'integrations', label:'🔌 Integrations' },
                              { id:'recruit',  label:'🎯 Recruit Email' },
                              { id:'danger',  label:'⚠️ Danger Zone' },
                            ].map(t=>(
                              <button key={t.id} onClick={()=>setSettingsSubTab(t.id)} style={{
                                background:'none', border:'none', cursor:'pointer', fontSize:12, fontWeight:600,
                                padding:'10px 16px', color: settingsSubTab===t.id ? 'var(--text)' : 'var(--muted)',
                                borderBottom: settingsSubTab===t.id ? '2px solid var(--gold2)' : '2px solid transparent',
                                transition:'all .15s', fontFamily:'Poppins,sans-serif',
                              }}>{t.label}</button>
                            ))}
                          </div>

                          {/* ── Invites sub-tab ── */}
                          {settingsSubTab==='invites' && (
                          <div className="card" style={{
                            padding:'18px 20px',
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

                          {/* ── Admins sub-tab ── */}
                          {settingsSubTab==='admins' && (
                          <div>
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
                                    <MemberAvatar member={m} size={32} rank={rank}/>
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
                          )}

                          {/* ── Groups sub-tab (Manage Groups — moved from Groups tab) ── */}
                          {settingsSubTab==='groups' && (
                          <div>
                            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
                              <div>
                                <div className="serif" style={{ fontSize:20, color:'var(--text)', marginBottom:2 }}>🫂 Manage Groups</div>
                                <div style={{ fontSize:12, color:'var(--muted)' }}>Assign a leader to each group — leaders can coach and view their members' activity.</div>
                              </div>
                              {!groupForm && (
                                <button className="btn-outline" onClick={()=>setGroupForm({ name:'', leaderId:'', memberIds:[], editingId:null })}
                                  style={{ fontSize:12 }}>+ New Group</button>
                              )}
                            </div>

                            {groupForm && (
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
                                    </div>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                          )}

                          {/* ── AI Tools sub-tab ── */}
                          {settingsSubTab==='ai' && (
                          <div className="card" style={{ padding: 24 }}>
                            <div className="serif" style={{ fontSize: 18, color: 'var(--text)', marginBottom: 8 }}>🤖 AI Tools</div>
                            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16, lineHeight: 1.6 }}>
                              Control whether team members can access AI-powered tools like the AI Assistant.
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                              <div>
                                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>AI Assistant</div>
                                <div style={{ fontSize: 11, color: 'var(--muted)' }}>Real estate coaching, listing analysis, and pipeline review</div>
                              </div>
                              <button
                                onClick={async () => {
                                  const current = teamData?.team_prefs?.ai_tools?.assistant_enabled !== false
                                  const newAiTools = { ...(teamData?.team_prefs?.ai_tools || {}), assistant_enabled: !current }
                                  const newPrefs = { ...(teamData?.team_prefs || {}), ai_tools: newAiTools }
                                  try {
                                    const { error } = await supabase.from('teams').update({ team_prefs: newPrefs }).eq('id', profile.team_id)
                                    if (error) throw error
                                    setTeamData(td => ({ ...td, team_prefs: newPrefs }))
                                  } catch (err) {
                                    setError('Failed to update AI settings.')
                                    console.error('toggleAI error:', err)
                                  }
                                }}
                                style={{
                                  width: 48, height: 26, borderRadius: 13, cursor: 'pointer', border: 'none',
                                  position: 'relative', flexShrink: 0, transition: 'background .2s',
                                  background: (teamData?.team_prefs?.ai_tools?.assistant_enabled !== false)
                                    ? '#8b5cf6' : 'var(--b2)',
                                }}
                              >
                                <div style={{
                                  width: 20, height: 20, borderRadius: 10,
                                  background: '#fff', position: 'absolute', top: 3,
                                  transition: 'left .2s',
                                  left: (teamData?.team_prefs?.ai_tools?.assistant_enabled !== false) ? 25 : 3,
                                }} />
                              </button>
                            </div>
                          </div>
                          )}

                          {/* ── Directory sub-tab ── */}
                          {settingsSubTab==='directory' && (
                          <>
                          {/* ── Tools Directory ── */}
                          <div className="card" style={{ padding: 24, marginBottom: 20 }}>
                            <div className="serif" style={{ fontSize: 18, color: 'var(--text)', marginBottom: 8 }}>🔗 Tools Directory</div>
                            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16, lineHeight: 1.6 }}>
                              Manage your team's tools — toggle visibility, edit URLs, or add custom tools.
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              {/* Built-in tools */}
                              {ALL_APPS.map(app => {
                                const enabledTools = teamData?.team_prefs?.enabled_tools
                                const defaultIds = ['fub','redx','skyslope','rmls','gdrive','gmail','zillow','rpr','ylopo']
                                const isEnabled = enabledTools ? enabledTools.includes(app.id) : defaultIds.includes(app.id)
                                const overrideUrl = teamData?.team_prefs?.tool_overrides?.[app.id]?.url
                                const displayUrl = overrideUrl
                                  ? overrideUrl.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '').slice(0,40)
                                  : app.display
                                const isEditing = editingToolId === app.id
                                return (
                                  <div key={app.id} style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--bg2)', border: '1px solid var(--b1)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                      <span style={{ fontSize: 18, flexShrink: 0 }}>{app.icon}</span>
                                      <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{app.name}</div>
                                        <div style={{ fontSize: 10, color: 'var(--muted)' }}>{app.category}</div>
                                      </div>
                                      {!isEditing && (
                                        <button onClick={() => { setEditingToolId(app.id); setEditingToolUrl(overrideUrl || app.url) }}
                                          title="Edit URL" style={{ background: 'none', border: '1px solid var(--b2)', borderRadius: 5,
                                            padding: '3px 7px', fontSize: 11, cursor: 'pointer', color: 'var(--muted)', flexShrink: 0 }}>
                                          ✏️
                                        </button>
                                      )}
                                      <button
                                        onClick={async () => {
                                          const current = teamData?.team_prefs?.enabled_tools || defaultIds
                                          const updated = isEnabled
                                            ? current.filter(id => id !== app.id)
                                            : [...current, app.id]
                                          const newPrefs = { ...(teamData?.team_prefs || {}), enabled_tools: updated }
                                          try {
                                            const { error: err } = await supabase.from('teams').update({ team_prefs: newPrefs }).eq('id', profile.team_id)
                                            if (err) throw err
                                            setTeamData(td => ({ ...td, team_prefs: newPrefs }))
                                          } catch (err) {
                                            setError('Failed to update tools.')
                                            console.error('toggleTool error:', err)
                                          }
                                        }}
                                        style={{
                                          width: 42, height: 24, borderRadius: 12, cursor: 'pointer', border: 'none',
                                          position: 'relative', flexShrink: 0, transition: 'background .2s',
                                          background: isEnabled ? '#10b981' : 'var(--b2)',
                                        }}
                                      >
                                        <div style={{
                                          width: 18, height: 18, borderRadius: 9,
                                          background: '#fff', position: 'absolute', top: 3,
                                          transition: 'left .2s',
                                          left: isEnabled ? 21 : 3,
                                        }} />
                                      </button>
                                    </div>
                                    {/* URL display / edit */}
                                    {isEditing ? (
                                      <div style={{ display: 'flex', gap: 6, marginTop: 8, paddingLeft: 30 }}>
                                        <input className="field-input" value={editingToolUrl}
                                          onChange={e => setEditingToolUrl(e.target.value)}
                                          onKeyDown={e => e.key === 'Enter' && (async () => {
                                            const url = editingToolUrl.trim()
                                            if (!url) return
                                            const overrides = { ...(teamData?.team_prefs?.tool_overrides || {}), [app.id]: { url } }
                                            const newPrefs = { ...(teamData?.team_prefs || {}), tool_overrides: overrides }
                                            try {
                                              const { error: err } = await supabase.from('teams').update({ team_prefs: newPrefs }).eq('id', profile.team_id)
                                              if (err) throw err
                                              setTeamData(td => ({ ...td, team_prefs: newPrefs }))
                                              setEditingToolId(null)
                                            } catch (err) { setError('Failed to save URL.'); console.error(err) }
                                          })()}
                                          placeholder="https://..." style={{ flex: 1, fontSize: 12, padding: '6px 10px' }}/>
                                        <button onClick={async () => {
                                          const url = editingToolUrl.trim()
                                          if (!url) return
                                          const overrides = { ...(teamData?.team_prefs?.tool_overrides || {}), [app.id]: { url } }
                                          const newPrefs = { ...(teamData?.team_prefs || {}), tool_overrides: overrides }
                                          try {
                                            const { error: err } = await supabase.from('teams').update({ team_prefs: newPrefs }).eq('id', profile.team_id)
                                            if (err) throw err
                                            setTeamData(td => ({ ...td, team_prefs: newPrefs }))
                                            setEditingToolId(null)
                                          } catch (err) { setError('Failed to save URL.'); console.error(err) }
                                        }} style={{ fontSize: 11, padding: '5px 12px', borderRadius: 6, cursor: 'pointer',
                                          background: 'var(--text)', border: 'none', color: 'var(--bg)', fontWeight: 600, flexShrink: 0 }}>
                                          Save
                                        </button>
                                        <button onClick={() => setEditingToolId(null)} style={{ fontSize: 11, padding: '5px 10px',
                                          borderRadius: 6, cursor: 'pointer', background: 'none', border: '1px solid var(--b2)',
                                          color: 'var(--muted)', flexShrink: 0 }}>
                                          Cancel
                                        </button>
                                        {overrideUrl && (
                                          <button onClick={async () => {
                                            const overrides = { ...(teamData?.team_prefs?.tool_overrides || {}) }
                                            delete overrides[app.id]
                                            const newPrefs = { ...(teamData?.team_prefs || {}), tool_overrides: overrides }
                                            try {
                                              const { error: err } = await supabase.from('teams').update({ team_prefs: newPrefs }).eq('id', profile.team_id)
                                              if (err) throw err
                                              setTeamData(td => ({ ...td, team_prefs: newPrefs }))
                                              setEditingToolId(null)
                                            } catch (err) { setError('Failed to reset URL.'); console.error(err) }
                                          }} title="Reset to default URL" style={{ fontSize: 10, padding: '5px 8px',
                                            borderRadius: 6, cursor: 'pointer', background: 'rgba(220,38,38,.06)',
                                            border: '1px solid rgba(220,38,38,.2)', color: 'var(--red)', flexShrink: 0 }}>
                                            Reset
                                          </button>
                                        )}
                                      </div>
                                    ) : (
                                      <div style={{ paddingLeft: 30, marginTop: 2 }}>
                                        <span style={{ fontSize: 10, color: overrideUrl ? '#0ea5e9' : 'var(--dim)',
                                          fontFamily: "'JetBrains Mono',monospace" }}>
                                          {displayUrl}
                                        </span>
                                        {overrideUrl && <span style={{ fontSize: 9, marginLeft: 6, padding: '1px 5px',
                                          borderRadius: 3, background: 'rgba(14,165,233,.1)', color: '#0ea5e9',
                                          fontWeight: 700 }}>CUSTOM URL</span>}
                                      </div>
                                    )}
                                  </div>
                                )
                              })}

                              {/* Custom tools */}
                              {(teamData?.team_prefs?.custom_tools || []).map(tool => {
                                const enabledTools = teamData?.team_prefs?.enabled_tools
                                const defaultIds = ['fub','redx','skyslope','rmls','gdrive','gmail','zillow','rpr','ylopo']
                                const isEnabled = enabledTools ? enabledTools.includes(tool.id) : false
                                const isEditing = editingToolId === tool.id
                                const displayUrl = (tool.url || '').replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '').slice(0,40)
                                return (
                                  <div key={tool.id} style={{ padding: '10px 12px', borderRadius: 8,
                                    background: 'var(--bg2)', border: '1px solid rgba(217,119,6,.25)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                      <span style={{ fontSize: 18, flexShrink: 0 }}>{tool.icon || '🔧'}</span>
                                      <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{tool.name}</span>
                                          <span style={{ fontSize: 8, padding: '1px 5px', borderRadius: 3,
                                            background: 'var(--gold4)', color: 'var(--gold)', fontWeight: 700 }}>CUSTOM</span>
                                        </div>
                                        <div style={{ fontSize: 10, color: 'var(--muted)' }}>{tool.category || 'Custom'}</div>
                                      </div>
                                      {!isEditing && (
                                        <button onClick={() => { setEditingToolId(tool.id); setEditingToolUrl(tool.url || '') }}
                                          title="Edit" style={{ background: 'none', border: '1px solid var(--b2)', borderRadius: 5,
                                            padding: '3px 7px', fontSize: 11, cursor: 'pointer', color: 'var(--muted)', flexShrink: 0 }}>
                                          ✏️
                                        </button>
                                      )}
                                      <button onClick={() => setConfirmModal({
                                        message: `Remove "${tool.name}" from your tools directory?`,
                                        label: 'Remove Tool',
                                        onConfirm: async () => {
                                          const updated = (teamData?.team_prefs?.custom_tools || []).filter(t => t.id !== tool.id)
                                          const updatedEnabled = (teamData?.team_prefs?.enabled_tools || defaultIds).filter(id => id !== tool.id)
                                          const newPrefs = { ...(teamData?.team_prefs || {}), custom_tools: updated, enabled_tools: updatedEnabled }
                                          try {
                                            const { error: err } = await supabase.from('teams').update({ team_prefs: newPrefs }).eq('id', profile.team_id)
                                            if (err) throw err
                                            setTeamData(td => ({ ...td, team_prefs: newPrefs }))
                                          } catch (err) { setError('Failed to remove tool.'); console.error(err) }
                                        }
                                      })} title="Remove tool" style={{ background: 'rgba(220,38,38,.06)', border: '1px solid rgba(220,38,38,.2)',
                                        borderRadius: 5, padding: '3px 7px', fontSize: 11, cursor: 'pointer', color: 'var(--red)', flexShrink: 0 }}>
                                        ✕
                                      </button>
                                      <button
                                        onClick={async () => {
                                          const current = teamData?.team_prefs?.enabled_tools || defaultIds
                                          const updated = isEnabled
                                            ? current.filter(id => id !== tool.id)
                                            : [...current, tool.id]
                                          const newPrefs = { ...(teamData?.team_prefs || {}), enabled_tools: updated }
                                          try {
                                            const { error: err } = await supabase.from('teams').update({ team_prefs: newPrefs }).eq('id', profile.team_id)
                                            if (err) throw err
                                            setTeamData(td => ({ ...td, team_prefs: newPrefs }))
                                          } catch (err) { setError('Failed to update tools.'); console.error(err) }
                                        }}
                                        style={{
                                          width: 42, height: 24, borderRadius: 12, cursor: 'pointer', border: 'none',
                                          position: 'relative', flexShrink: 0, transition: 'background .2s',
                                          background: isEnabled ? '#10b981' : 'var(--b2)',
                                        }}
                                      >
                                        <div style={{
                                          width: 18, height: 18, borderRadius: 9,
                                          background: '#fff', position: 'absolute', top: 3,
                                          transition: 'left .2s',
                                          left: isEnabled ? 21 : 3,
                                        }} />
                                      </button>
                                    </div>
                                    {/* URL display / edit for custom tool */}
                                    {isEditing ? (
                                      <div style={{ display: 'flex', gap: 6, marginTop: 8, paddingLeft: 30 }}>
                                        <input className="field-input" value={editingToolUrl}
                                          onChange={e => setEditingToolUrl(e.target.value)}
                                          onKeyDown={e => e.key === 'Enter' && (async () => {
                                            const url = editingToolUrl.trim()
                                            if (!url) return
                                            const updated = (teamData?.team_prefs?.custom_tools || []).map(t =>
                                              t.id === tool.id ? { ...t, url, display: url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '') } : t)
                                            const newPrefs = { ...(teamData?.team_prefs || {}), custom_tools: updated }
                                            try {
                                              const { error: err } = await supabase.from('teams').update({ team_prefs: newPrefs }).eq('id', profile.team_id)
                                              if (err) throw err
                                              setTeamData(td => ({ ...td, team_prefs: newPrefs }))
                                              setEditingToolId(null)
                                            } catch (err) { setError('Failed to save URL.'); console.error(err) }
                                          })()}
                                          placeholder="https://..." style={{ flex: 1, fontSize: 12, padding: '6px 10px' }}/>
                                        <button onClick={async () => {
                                          const url = editingToolUrl.trim()
                                          if (!url) return
                                          const updated = (teamData?.team_prefs?.custom_tools || []).map(t =>
                                            t.id === tool.id ? { ...t, url, display: url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '') } : t)
                                          const newPrefs = { ...(teamData?.team_prefs || {}), custom_tools: updated }
                                          try {
                                            const { error: err } = await supabase.from('teams').update({ team_prefs: newPrefs }).eq('id', profile.team_id)
                                            if (err) throw err
                                            setTeamData(td => ({ ...td, team_prefs: newPrefs }))
                                            setEditingToolId(null)
                                          } catch (err) { setError('Failed to save URL.'); console.error(err) }
                                        }} style={{ fontSize: 11, padding: '5px 12px', borderRadius: 6, cursor: 'pointer',
                                          background: 'var(--text)', border: 'none', color: 'var(--bg)', fontWeight: 600, flexShrink: 0 }}>
                                          Save
                                        </button>
                                        <button onClick={() => setEditingToolId(null)} style={{ fontSize: 11, padding: '5px 10px',
                                          borderRadius: 6, cursor: 'pointer', background: 'none', border: '1px solid var(--b2)',
                                          color: 'var(--muted)', flexShrink: 0 }}>
                                          Cancel
                                        </button>
                                      </div>
                                    ) : displayUrl ? (
                                      <div style={{ paddingLeft: 30, marginTop: 2 }}>
                                        <span style={{ fontSize: 10, color: 'var(--dim)', fontFamily: "'JetBrains Mono',monospace" }}>
                                          {displayUrl}
                                        </span>
                                      </div>
                                    ) : null}
                                  </div>
                                )
                              })}
                            </div>

                            {/* Add Custom Tool */}
                            {customToolForm ? (
                              <div style={{ marginTop: 14, padding: 16, borderRadius: 10,
                                border: '1px solid rgba(217,119,6,.3)', background: 'var(--gold3)' }}>
                                <div className="serif" style={{ fontSize: 14, color: 'var(--text)', marginBottom: 12 }}>Add Custom Tool</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 }}>
                                    <div>
                                      <div className="label" style={{ marginBottom: 4, fontSize: 10 }}>Tool Name</div>
                                      <input className="field-input" value={customToolForm.name}
                                        onChange={e => setCustomToolForm(f => ({ ...f, name: e.target.value }))}
                                        placeholder="e.g. Dotloop" style={{ width: '100%', fontSize: 12 }}/>
                                    </div>
                                    <div>
                                      <div className="label" style={{ marginBottom: 4, fontSize: 10 }}>Icon</div>
                                      <input className="field-input" value={customToolForm.icon}
                                        onChange={e => setCustomToolForm(f => ({ ...f, icon: e.target.value }))}
                                        placeholder="🔧" style={{ width: 48, fontSize: 16, textAlign: 'center' }}/>
                                    </div>
                                  </div>
                                  <div>
                                    <div className="label" style={{ marginBottom: 4, fontSize: 10 }}>URL</div>
                                    <input className="field-input" value={customToolForm.url}
                                      onChange={e => setCustomToolForm(f => ({ ...f, url: e.target.value }))}
                                      placeholder="https://app.dotloop.com" style={{ width: '100%', fontSize: 12 }}/>
                                  </div>
                                  <div>
                                    <div className="label" style={{ marginBottom: 4, fontSize: 10 }}>Category</div>
                                    <select className="field-input" value={customToolForm.category}
                                      onChange={e => setCustomToolForm(f => ({ ...f, category: e.target.value }))}
                                      style={{ width: '100%', fontSize: 12 }}>
                                      <option value="CRM">CRM</option>
                                      <option value="Lead Gen">Lead Gen</option>
                                      <option value="Transactions">Transactions</option>
                                      <option value="MLS">MLS</option>
                                      <option value="Productivity">Productivity</option>
                                      <option value="Research">Research</option>
                                      <option value="Marketing">Marketing</option>
                                      <option value="Custom">Custom</option>
                                    </select>
                                  </div>
                                  <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                                    <button onClick={async () => {
                                      const name = customToolForm.name?.trim()
                                      const url = customToolForm.url?.trim()
                                      if (!name || !url) return
                                      const newTool = {
                                        id: 'custom-' + Date.now().toString(36),
                                        name,
                                        url,
                                        icon: customToolForm.icon?.trim() || '🔧',
                                        category: customToolForm.category || 'Custom',
                                        display: url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''),
                                      }
                                      const existing = teamData?.team_prefs?.custom_tools || []
                                      const defaultIds = ['fub','redx','skyslope','rmls','gdrive','gmail','zillow','rpr','ylopo']
                                      const currentEnabled = teamData?.team_prefs?.enabled_tools || defaultIds
                                      const newPrefs = {
                                        ...(teamData?.team_prefs || {}),
                                        custom_tools: [...existing, newTool],
                                        enabled_tools: [...currentEnabled, newTool.id],
                                      }
                                      try {
                                        const { error: err } = await supabase.from('teams').update({ team_prefs: newPrefs }).eq('id', profile.team_id)
                                        if (err) throw err
                                        setTeamData(td => ({ ...td, team_prefs: newPrefs }))
                                        setCustomToolForm(null)
                                      } catch (err) { setError('Failed to add tool.'); console.error(err) }
                                    }} disabled={!customToolForm.name?.trim() || !customToolForm.url?.trim()}
                                      className="btn-primary" style={{ fontSize: 12, padding: '8px 18px' }}>
                                      Add Tool
                                    </button>
                                    <button onClick={() => setCustomToolForm(null)}
                                      className="btn-outline" style={{ fontSize: 12 }}>
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <button onClick={() => setCustomToolForm({ name: '', url: '', icon: '🔧', category: 'Custom' })}
                                style={{ marginTop: 12, width: '100%', padding: '10px 16px', borderRadius: 8,
                                  border: '1.5px dashed var(--b2)', background: 'none', cursor: 'pointer',
                                  fontSize: 13, color: 'var(--muted)', fontWeight: 600, transition: 'all .15s',
                                  fontFamily: 'Poppins,sans-serif',
                                }}
                                onMouseEnter={e => { e.target.style.borderColor = 'var(--gold2)'; e.target.style.color = 'var(--gold)' }}
                                onMouseLeave={e => { e.target.style.borderColor = 'var(--b2)'; e.target.style.color = 'var(--muted)' }}>
                                + Add Custom Tool
                              </button>
                            )}
                          </div>
                          </>
                          )}

                          {/* ── Danger Zone sub-tab ── */}
                          {/* ── Integrations sub-tab ── */}
                          {settingsSubTab==='integrations' && (
                          <div className="card" style={{
                            padding:'18px 20px',
                            borderLeft:'3px solid #611f69',
                            background:'linear-gradient(135deg, rgba(97,31,105,.06) 0%, var(--surface) 55%)',
                          }}>
                            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
                              <span style={{ fontSize:16 }}>💬</span>
                              <span className="serif" style={{ fontSize:15, color:'var(--text)', fontWeight:600 }}>Slack Workspace</span>
                              <span style={{ fontSize:11, color:'var(--muted)', marginLeft:'auto' }}>Shows a join button on member dashboards</span>
                            </div>
                            <div style={{ fontSize:12, color:'var(--muted)', marginBottom:12, lineHeight:1.6 }}>
                              Paste your Slack workspace URL (e.g. https://yourteam.slack.com) and a Slack button will appear on every team member's dashboard.
                            </div>
                            <div style={{ display:'flex', gap:8, marginBottom: 0 }}>
                              <input className="field-input" type="url" value={slackUrl}
                                onChange={e=>setSlackUrl(e.target.value)}
                                placeholder="https://yourteam.slack.com" style={{ flex:1 }}/>
                              <button type="button" className="btn-primary" onClick={async()=>{
                                setSlackSaving(true)
                                try {
                                  const newPrefs = { ...(teamData.team_prefs||{}), slack_url: slackUrl.trim() }
                                  const { error: e } = await supabase.from('teams').update({ team_prefs: newPrefs }).eq('id', profile.team_id)
                                  if (e) throw e
                                  setTeamData(td=>({ ...td, team_prefs: newPrefs }))
                                } catch(e) { console.error(e) }
                                setSlackSaving(false)
                              }}
                                disabled={slackSaving}
                                style={{ fontSize:13, padding:'9px 20px', whiteSpace:'nowrap' }}>
                                {slackSaving ? 'Saving…' : 'Save'}
                              </button>
                            </div>
                            {slackUrl.trim() && (
                              <div style={{ marginTop:12, fontSize:12, color:'var(--green)' }}>
                                ✓ Slack button will appear on team member dashboards
                              </div>
                            )}
                          </div>
                          )}

                          {/* ── Recruit Email sub-tab ── */}
                          {settingsSubTab==='recruit' && (
                          <div className="card" style={{
                            padding:'18px 20px',
                            borderLeft:'3px solid #3b82f6',
                            background:'linear-gradient(135deg, rgba(59,130,246,.06) 0%, var(--surface) 55%)',
                          }}>
                            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
                              <span style={{ fontSize:16 }}>🎯</span>
                              <span className="serif" style={{ fontSize:15, color:'var(--text)', fontWeight:600 }}>
                                Recruit Outreach Email
                              </span>
                              <span style={{ fontSize:11, color:'var(--muted)', marginLeft:'auto' }}>
                                Customize the email sent to recruits
                              </span>
                            </div>

                            <div style={{ fontSize:12, color:'var(--muted)', marginBottom:12, lineHeight:1.6 }}>
                              When you click the ✉️ icon on a recruit card, their email client opens
                              with this template. Use placeholders to personalize each email:
                            </div>

                            {/* Placeholder tokens */}
                            <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:16 }}>
                              {[
                                { token:'{recruit_name}', desc:'Recruit\'s name' },
                                { token:'{referrer_name}', desc:'Agent who referred' },
                                { token:'{team_name}', desc:'Your team name' },
                              ].map(t => (
                                <button key={t.token} onClick={()=>{
                                  navigator.clipboard.writeText(t.token)
                                  setSuccess(`Copied ${t.token}`)
                                  setTimeout(()=>setSuccess(''),1500)
                                }} style={{
                                  fontSize:10, padding:'3px 8px', borderRadius:6,
                                  background:'rgba(59,130,246,.08)', color:'#3b82f6',
                                  border:'1px solid rgba(59,130,246,.2)',
                                  fontFamily:"'JetBrains Mono',monospace",
                                  cursor:'pointer', transition:'all .15s',
                                }} title={`Click to copy ${t.token}`}>{t.token}</button>
                              ))}
                            </div>

                            {/* Subject */}
                            <div style={{ marginBottom:16 }}>
                              <div style={{ fontSize:12, fontWeight:700, color:'var(--text)', marginBottom:6 }}>
                                Subject Line
                              </div>
                              <input className="field-input" value={recruitEmailSubject}
                                onChange={e => setRecruitEmailSubject(e.target.value)}
                                placeholder={DEFAULT_RECRUIT_SUBJECT}
                                style={{ fontSize:12, width:'100%' }}/>
                            </div>

                            {/* Body */}
                            <div style={{ marginBottom:16 }}>
                              <div style={{ fontSize:12, fontWeight:700, color:'var(--text)', marginBottom:6 }}>
                                Email Body
                              </div>
                              <textarea className="field-input" value={recruitEmailBody}
                                onChange={e => setRecruitEmailBody(e.target.value)}
                                placeholder={DEFAULT_RECRUIT_BODY}
                                rows={12} style={{ fontSize:12, resize:'vertical', width:'100%', lineHeight:1.6 }}/>
                            </div>

                            {/* Actions */}
                            <div style={{ display:'flex', gap:8, marginBottom:16 }}>
                              <button className="btn-primary" onClick={saveRecruitEmail}
                                disabled={recruitEmailSaving}
                                style={{ fontSize:12, padding:'8px 16px' }}>
                                {recruitEmailSaving ? 'Saving...' : 'Save Template'}
                              </button>
                              <button className="btn-outline" onClick={resetRecruitEmail}
                                style={{ fontSize:12, padding:'8px 16px' }}>
                                Reset to Default
                              </button>
                            </div>

                            {/* Email preview */}
                            <div style={{ borderTop:'1px solid var(--b2)', paddingTop:14 }}>
                              <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', marginBottom:8,
                                textTransform:'uppercase', letterSpacing:'.5px' }}>Preview</div>
                              <pre style={{ fontSize:11, color:'var(--dim)', whiteSpace:'pre-wrap',
                                background:'var(--bg2)', padding:12, borderRadius:8, lineHeight:1.5,
                                border:'1px solid var(--b2)', margin:0, fontFamily:"'Poppins',sans-serif" }}>
{buildRecruitMailtoPreview(teamData?.name, { subject: recruitEmailSubject, body: recruitEmailBody })}
                              </pre>
                            </div>
                          </div>
                          )}

                          {settingsSubTab==='danger' && (
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
                          )}

                        </div>
                  )} {/* end settings tab */}

                  </>} {/* end !groupView normal view */}

                </>
              )}
            </div>
          )}
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
        const closePanel = () => { setViewingMember(null); setMemberDetail(null); setMemberDetailLoading(false); setRemoveConfirm(null); setPanelNoteForm(null) }
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
              }}>

              {/* Header */}
              <div style={{ padding:'24px 24px 20px', borderBottom:'1px solid var(--b2)', flexShrink:0,
                background:`linear-gradient(135deg,${rank.color}0c 0%,var(--surface) 60%)`,
                borderTop:`3px solid ${rank.color}` }}>
                <div style={{ display:'flex', alignItems:'center', gap:14 }}>
                  <MemberAvatar member={viewingMember} size={52} rank={rank}/>
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
                          onChange={e=>setPanelNoteForm(f=>({...f,text:e.target.value.slice(0,UI_NOTE_LIMIT)}))}
                          placeholder="Write coaching note…" rows={3}
                          style={{ width:'100%', resize:'vertical', fontSize:13, marginBottom:4, minHeight:72 }}/>
                        <div style={{ fontSize:10, color:'var(--dim)', textAlign:'right', marginBottom:8 }}>
                          {(panelNoteForm.text||'').length}/{UI_NOTE_LIMIT}
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
          padding:20 }}
          onClick={()=>setConfirmModal(null)}>
          <div className="card" style={{ padding:'24px 28px', maxWidth:400, width:'100%',
            borderTop:'3px solid var(--red)' }}
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

      {/* ── TV Leaderboard Mode ────────────────────────────── */}
      {tvMode && (()=>{
        const parseNum = v => { const n=parseFloat(String(v||'').replace(/[^0-9.]/g,'')); return isNaN(n)?0:n }
        const tvChallenges = (teamData?.team_prefs?.challenges||[]).filter(c=>c.status==='active')
        const tvVolume = teamListings.reduce((s,l)=>s+parseNum(l.price),0)
        const tvComm = teamListings.reduce((s,l)=>s+resolveCommission(l.commission,l.price),0)
        const tvActiveListing = teamListings.filter(l=>l.status!=='pending').length
        const tvPendingListing = teamListings.filter(l=>l.status==='pending').length
        const tvTotalClosed = Object.values(memberStats).reduce((s,st)=>s+(st.closed||0),0)
        const tvTotalXp = members.reduce((s,m)=>s+(m.xp||0),0)
        return (
        <div data-theme={theme} style={{
          position:'fixed', inset:0, zIndex:99999, background:'var(--bg)',
          display:'flex', flexDirection:'column', overflow:'auto',
        }}>
          {/* TV Header */}
          <div className="tv-header-pad" style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
            borderBottom:'1px solid var(--b2)', boxShadow:'0 1px 0 var(--b1)', flexShrink:0 }}>
            <div style={{ display:'flex', alignItems:'center', gap:14 }}>
              <span style={{ fontSize:26 }}>🏡</span>
              <div>
                <div style={{ fontSize:24, fontWeight:700, color:'var(--text)', fontFamily:"'Fraunces',serif", letterSpacing:'-.02em' }}>
                  {teamData?.name || 'Team'} Dashboard
                </div>
                <div style={{ fontSize:12, color:'var(--muted)', fontFamily:"'JetBrains Mono',monospace" }}>
                  {new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'})}
                </div>
              </div>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              <span style={{ fontSize:11, color:'var(--dim)', fontFamily:"'JetBrains Mono',monospace" }}>{members.length} agents</span>
              <ThemeToggle theme={theme} onToggle={onToggleTheme}/>
              <button onClick={()=>setTvMode(false)} style={{
                background:'var(--surface)', border:'1px solid var(--b3)', borderRadius:8, padding:'7px 18px',
                color:'var(--muted)', fontSize:12, cursor:'pointer', fontWeight:600,
              }}>✕ Exit</button>
            </div>
          </div>

          <div className="tv-body-pad" style={{ flex:1, overflow:'auto' }}>
            {/* ── Top stats row ── */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap:12, marginBottom:24 }}>
              {[
                { label:'TEAM XP', value:tvTotalXp.toLocaleString(), color:'#d97706', icon:'⚡' },
                { label:'DEALS CLOSED', value:tvTotalClosed, color:'#10b981', icon:'🎉' },
                { label:'ACTIVE LISTINGS', value:tvActiveListing, color:'#10b981', icon:'🏠' },
                { label:'PENDING', value:tvPendingListing, color:'#6366f1', icon:'📋' },
                { label:'TOTAL VOLUME', value:fmtMoney(tvVolume), color:'var(--text)', icon:'💰' },
                { label:'COMMISSION', value:fmtMoney(tvComm), color:'#10b981', icon:'💵' },
              ].map(s=>(
                <div key={s.label} style={{
                  padding:'18px 20px', borderRadius:14, background:'var(--surface)',
                  border:`1px solid ${s.color.startsWith('var(') ? 'var(--b2)' : s.color+'22'}`,
                  boxShadow: s.color.startsWith('var(') ? 'none' : `0 2px 12px ${s.color}11`,
                  position:'relative', overflow:'hidden',
                }}>
                  <div style={{ position:'absolute', top:0, left:0, right:0, height:2,
                    background: s.color.startsWith('var(') ? 'var(--b3)' : s.color, opacity:0.6 }}/>
                  <div style={{ fontSize:10, color:'var(--muted)', fontWeight:700, letterSpacing:'.5px', marginBottom:8, textTransform:'uppercase' }}>{s.icon} {s.label}</div>
                  <div style={{ fontSize:26, fontWeight:700, color:s.color, fontFamily:"'Fraunces',serif", lineHeight:1 }}>{s.value}</div>
                </div>
              ))}
            </div>

            {/* ── Main grid: Leaderboard + Right column ── */}
            <div className="tv-main-grid">

              {/* LEFT: Leaderboard */}
              <div>
                <div style={{ fontSize:11, color:'var(--muted)', fontWeight:700, letterSpacing:1.2, textTransform:'uppercase', marginBottom:14,
                  display:'flex', alignItems:'center', gap:10 }}>
                  <span>🏆 LEADERBOARD</span>
                  <div style={{ flex:1, height:1, background:'var(--b2)' }}/>
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                  {members.map((m,i)=>{
                    const rank = getRank(m.xp||0)
                    const stats = memberStats[m.id]||{}
                    const medal = i===0?'🥇':i===1?'🥈':i===2?'🥉':null
                    return (
                      <div key={m.id} style={{
                        display:'flex', alignItems:'center', gap:16, padding:'12px 18px',
                        borderRadius:12, border:`1px solid ${i<3?rank.color+'33':'var(--b2)'}`,
                        background:i===0?'var(--gold5)':'var(--surface)',
                        borderLeft:i<3?`3px solid ${rank.color}`:'3px solid transparent',
                        boxShadow:i===0?'var(--shadow)':'none',
                      }}>
                        <div style={{ width:32, fontSize:medal?24:16, textAlign:'center', color:'var(--muted)', fontWeight:700, fontFamily:"'JetBrains Mono',monospace" }}>
                          {medal || (i+1)}
                        </div>
                        <MemberAvatar member={m} size={42} rank={rank}/>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:16, fontWeight:700, color:'var(--text)' }}>{m.full_name||'Agent'}</div>
                          <div style={{ fontSize:11, color:'var(--muted)' }}>{rank.icon} {rank.name} {(m.streak||0)>0?`· 🔥 ${m.streak}`:''}</div>
                        </div>
                        <div className="tv-leaderboard-stats">
                          {HABITS_FOR_DISPLAY.slice(0,3).map(h=>{
                            const v = stats.habits?.[h.id]||0
                            if (!v) return null
                            return <div key={h.id} style={{ textAlign:'center' }}>
                              <div style={{ fontSize:16, fontWeight:700, color:'var(--text)' }}>{v}</div>
                              <div style={{ fontSize:8, color:'var(--muted)', letterSpacing:'.3px' }}>{h.label.slice(0,5).toUpperCase()}</div>
                            </div>
                          })}
                          {stats.closed>0 && <div style={{ textAlign:'center' }}>
                            <div style={{ fontSize:16, fontWeight:700, color:'#10b981' }}>{stats.closed}</div>
                            <div style={{ fontSize:8, color:'var(--muted)' }}>CLOSED</div>
                          </div>}
                          <div style={{ textAlign:'right', minWidth:70 }}>
                            <div style={{ fontSize:i===0?28:24, fontWeight:700, color:rank.color, fontFamily:"'Fraunces',serif", lineHeight:1 }}>
                              {(m.xp||0).toLocaleString()}
                            </div>
                            <div style={{ fontSize:9, color:'var(--muted)', fontFamily:"'JetBrains Mono',monospace" }}>XP</div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* RIGHT: Challenges + Listings + Groups */}
              <div style={{ display:'flex', flexDirection:'column', gap:16 }}>

                {/* Challenges */}
                <div style={{ borderRadius:12, background:'var(--surface)', border:'1px solid var(--b2)', padding:18 }}>
                  <div style={{ fontSize:11, color:'var(--muted)', fontWeight:700, letterSpacing:1.2, textTransform:'uppercase', marginBottom:12,
                    display:'flex', alignItems:'center', gap:10 }}>
                    <span>🏆 ACTIVE CHALLENGES</span>
                    <div style={{ flex:1, height:1, background:'var(--b2)' }}/>
                  </div>
                  {tvChallenges.length===0 ? (
                    <div style={{ fontSize:12, color:'var(--dim)', fontStyle:'italic' }}>No active challenges</div>
                  ) : tvChallenges.map(c=>{
                    const metricLabel = CHALLENGE_METRICS.find(m=>m.value===c.metric)?.label||c.metric
                    const ranked = [...members].map(m=>({...m,val:getMemberMetricVal(m.id,c.metric)})).sort((a,b)=>b.val-a.val)
                    const topThree = ranked.slice(0,3)
                    return (
                      <div key={c.id} style={{ marginBottom:tvChallenges.indexOf(c)<tvChallenges.length-1?14:0 }}>
                        <div style={{ fontSize:14, fontWeight:700, color:'var(--text)', marginBottom:2 }}>{c.title}</div>
                        <div style={{ fontSize:10, color:'var(--muted)', marginBottom:8 }}>{metricLabel} · +{c.bonusXp||0} XP</div>
                        {topThree.map((m,i)=>{
                          const maxV = Math.max(topThree[0]?.val||1,1)
                          return (
                            <div key={m.id} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:5 }}>
                              <span style={{ fontSize:14, width:20, textAlign:'center' }}>{i===0?'🥇':i===1?'🥈':'🥉'}</span>
                              <div style={{ flex:1, minWidth:0 }}>
                                <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, marginBottom:2 }}>
                                  <span style={{ color:i===0?'#d97706':'var(--text2)', fontWeight:i===0?700:400 }}>{m.full_name||'Agent'}</span>
                                  <span style={{ color:i===0?'#d97706':'var(--muted)', fontWeight:700 }}>{m.val}</span>
                                </div>
                                <div style={{ height:4, background:'var(--bg3)', borderRadius:99 }}>
                                  <div style={{ height:'100%', width:`${Math.max(Math.round(m.val/maxV*100),m.val>0?6:0)}%`,
                                    background:i===0?'#d97706':i===1?'var(--b3)':'var(--dim)', borderRadius:99, transition:'width .4s' }}/>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                        {ranked.length>3 && <div style={{ fontSize:10, color:'var(--dim)', marginTop:4 }}>+{ranked.length-3} more</div>}
                      </div>
                    )
                  })}
                </div>

                {/* Listings */}
                <div style={{ borderRadius:12, background:'var(--surface)', border:'1px solid var(--b2)', padding:18 }}>
                  <div style={{ fontSize:11, color:'var(--muted)', fontWeight:700, letterSpacing:1.2, textTransform:'uppercase', marginBottom:12,
                    display:'flex', alignItems:'center', gap:10 }}>
                    <span>🏠 LISTINGS</span>
                    <div style={{ flex:1, height:1, background:'var(--b2)' }}/>
                  </div>
                  {teamListings.length===0 ? (
                    <div style={{ fontSize:12, color:'var(--dim)', fontStyle:'italic' }}>No active listings</div>
                  ) : (<>
                    <div style={{ display:'flex', flexDirection:'column', gap:6, maxHeight:240, overflow:'auto' }}>
                      {teamListings.slice(0,8).map(l=>{
                        const price = parseNum(l.price)
                        const isPending = l.status==='pending'
                        return (
                          <div key={l.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px',
                            borderRadius:8, background:'var(--bg2)', border:'1px solid var(--b2)' }}>
                            <div style={{ width:6, height:6, borderRadius:'50%', background:isPending?'#6366f1':'#10b981', flexShrink:0 }}/>
                            <div style={{ flex:1, minWidth:0 }}>
                              <div style={{ fontSize:12, color:'var(--text2)', fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                                {l.address||'Untitled'}
                              </div>
                              <div style={{ fontSize:10, color:'var(--muted)' }}>{l.agentName}</div>
                            </div>
                            {price>0 && <div style={{ fontSize:12, color:'var(--text)', fontWeight:700, fontFamily:"'JetBrains Mono',monospace", flexShrink:0 }}>
                              {fmtMoney(price)}
                            </div>}
                          </div>
                        )
                      })}
                    </div>
                    {teamListings.length>8 && <div style={{ fontSize:10, color:'var(--dim)', marginTop:6 }}>+{teamListings.length-8} more listings</div>}
                  </>)}
                </div>

                {/* Groups */}
                {allGroups.length>0 && (
                <div style={{ borderRadius:12, background:'var(--surface)', border:'1px solid var(--b2)', padding:18 }}>
                  <div style={{ fontSize:11, color:'var(--muted)', fontWeight:700, letterSpacing:1.2, textTransform:'uppercase', marginBottom:12,
                    display:'flex', alignItems:'center', gap:10 }}>
                    <span>🫂 GROUPS</span>
                    <div style={{ flex:1, height:1, background:'var(--b2)' }}/>
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                    {allGroups.map(grp=>{
                      const leader = members.find(m=>m.id===grp.leaderId)
                      const grpXp = grp.memberIds.reduce((s,id)=>{
                        const m = members.find(mm=>mm.id===id)
                        return s+(m?.xp||0)
                      },0)
                      return (
                        <div key={grp.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 14px',
                          borderRadius:8, background:'var(--bg2)', border:'1px solid var(--b2)' }}>
                          <span style={{ fontSize:16 }}>🫂</span>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontSize:13, fontWeight:700, color:'var(--text)' }}>{grp.name}</div>
                            <div style={{ fontSize:10, color:'var(--muted)' }}>
                              {grp.memberIds.length} members{leader ? ` · 👑 ${leader.full_name||'Agent'}` : ''}
                            </div>
                          </div>
                          <div style={{ textAlign:'right', flexShrink:0 }}>
                            <div style={{ fontSize:16, fontWeight:700, color:'#8b5cf6', fontFamily:"'Fraunces',serif" }}>{grpXp.toLocaleString()}</div>
                            <div style={{ fontSize:8, color:'var(--muted)' }}>GROUP XP</div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
                )}
              </div>
            </div>
          </div>

          {/* TV Footer */}
          <div style={{ flexShrink:0 }}>
            <div style={{ height:1, background:'linear-gradient(90deg, transparent, var(--b2) 25%, var(--b2) 75%, transparent)' }}/>
            <div className="tv-footer-pad" style={{ textAlign:'center',
              fontSize:10, color:'var(--dim)', fontFamily:"'JetBrains Mono',monospace", letterSpacing:2 }}>
              REALTYGRIND · TEAM DASHBOARD · CLOSE MORE EVERY DAY
            </div>
          </div>
        </div>
      )})()}

      {/* Team logo crop modal */}
      {logoCropSrc && (
        <AvatarCropModal src={logoCropSrc} onConfirm={saveTeamLogo} onCancel={cancelLogoCrop}
          title="Crop Team Logo" round={false}/>
      )}
    </>
  )
}
