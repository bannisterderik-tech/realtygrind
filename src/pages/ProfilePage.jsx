import { useState, useEffect, useRef, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { Loader, Wordmark, ThemeToggle, Ring, getRank, fmtMoney, RANKS } from '../design'
import { HABITS } from '../habits'
import { isActiveBilling } from '../lib/plans'
import { ALL_APPS } from './DirectoryPage'
import AvatarCropModal from '../components/AvatarCropModal'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const CUR_YEAR = new Date().getFullYear()

function AffLinkCopy({ link, gold }) {
  const [copied, setCopied] = useState(false)
  async function handleCopy() {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(()=>setCopied(false),2000) }
    catch { /* fallback: user can manually select */ }
  }
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8,
      background:'var(--bg2)', border:'1.5px solid var(--b2)', borderRadius:10, padding:'10px 14px' }}>
      <input readOnly value={link} style={{
        flex:1, background:'transparent', border:'none', color:gold,
        fontSize:12, fontWeight:600, fontFamily:"'JetBrains Mono',monospace",
        outline:'none', minWidth:0,
      }}/>
      <button onClick={handleCopy} className="btn-gold"
        style={{ padding:'6px 14px', fontSize:11, flexShrink:0 }}>
        {copied ? 'Copied!' : 'Copy'}
      </button>
    </div>
  )
}

export default function ProfilePage({ onNavigate, theme, onToggleTheme, onTaskDeleted, onTaskRestored }) {
  const { user, profile, refreshProfile } = useAuth()
  const rank     = getRank(profile?.xp||0)
  const nextRank = RANKS.find(r => r.min > (profile?.xp||0))
  const rankPct  = nextRank ? Math.round(((profile?.xp||0)-rank.min)/(nextRank.min-rank.min)*100) : 100
  const hasPasswordIdentity = user?.identities?.some(i => i.provider === 'email')

  // Unmount safety — prevent state updates after component unmounts
  const mountedRef = useRef(true)
  const timersRef  = useRef([])
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      timersRef.current.forEach(clearTimeout)
      timersRef.current = []
    }
  }, [])

  // Helper to register a setTimeout that auto-clears on unmount
  function safeTimeout(fn, ms) {
    const id = setTimeout(() => {
      timersRef.current = timersRef.current.filter(t => t !== id)
      fn()
    }, ms)
    timersRef.current.push(id)
    return id
  }

  const [name,       setName]       = useState(profile?.full_name||'')
  // Sync name when profile loads (initializer only runs once with null profile)
  useEffect(()=>{ if (profile?.full_name && !name) setName(profile.full_name) },[profile?.full_name])
  const [saving,     setSaving]     = useState(false)
  const [saveMsg,    setSaveMsg]    = useState('')
  const [pw,         setPw]         = useState('')
  const [pwSaving,   setPwSaving]   = useState(false)
  const [pwMsg,      setPwMsg]      = useState('')
  const [year,       setYear]       = useState(CUR_YEAR)
  const [annual,     setAnnual]     = useState(null)
  const [annLoad,    setAnnLoad]    = useState(true)
  const [showDel,    setShowDel]    = useState(false)
  const [delText,    setDelText]    = useState('')
  const [delLoading, setDelLoading] = useState(false)
  const [delError,   setDelError]   = useState(null)
  const [activeTab,  setActiveTab]  = useState('profile')
  const [history,    setHistory]    = useState([])
  const [histLoad,   setHistLoad]   = useState(false)
  const [histFetched,setHistFetched]= useState(false)
  const [closedHistory, setClosedHistory] = useState([])
  const [closedHistLoad, setClosedHistLoad] = useState(false)
  const [closedHistFetched, setClosedHistFetched] = useState(false)

  // Custom tasks
  const [customTasks,   setCustomTasks]  = useState([])
  const [deletedTasks,  setDeletedTasks] = useState([])
  const [ctLoaded,      setCtLoaded]     = useState(false)
  const [newTaskForm,  setNewTaskForm]  = useState(null) // null | {label,icon,xp}
  const [editingTask,  setEditingTask]  = useState(null) // null | task object
  const [habitPrefs,   setHabitPrefs]   = useState({ hidden:[], order:[], edits:{} })
  const [editingHabit, setEditingHabit] = useState(null) // { id, label, icon, xp, isBuiltIn }
  const [goals,        setGoals]        = useState({ xp:'', prospecting:'', appointments:'', showing:'', closed:'' })
  const [goalsSaving,  setGoalsSaving]  = useState(false)
  const [goalsMsg,     setGoalsMsg]     = useState('')
  const [gciTarget,     setGciTarget]     = useState('')
  const [avgCommission, setAvgCommission] = useState('')
  const [calcResult,    setCalcResult]    = useState(null)
  const [bio,      setBio]      = useState({ phone:'', license:'', specialty:'', about:'', review_link:'', timezone:'' })
  const [bioSaving, setBioSaving] = useState(false)
  const [bioMsg,    setBioMsg]   = useState('')
  const [avatarUrl,     setAvatarUrl]     = useState(profile?.goals?.avatar_url || '')
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [avatarMsg,    setAvatarMsg]    = useState(null) // { text, type: 'success'|'error' }
  const [cropFile,     setCropFile]     = useState(null)
  const [cropImgSrc,   setCropImgSrc]   = useState(null)
  const avatarInputRef = useRef(null)
  // Coaching notes (read from team_prefs, replies saved to own profile.goals)
  const [profileReplyForms,   setProfileReplyForms]   = useState({})
  const [profileReplySaving,  setProfileReplySaving]  = useState(null)
  const fetchAnnualSeqRef = useRef(0)
  const profileDataLoaded = useRef(false)
  const goalsLoaded = useRef(false)
  const prefsLoadedForTeam = useRef(null) // track which team_id we loaded prefs for

  useEffect(()=>{ if (user?.id) fetchAnnual(year) },[year, user?.id])
  useEffect(()=>{ if(activeTab==='history' && !histFetched) fetchHistory() },[activeTab, histFetched])
  useEffect(()=>{ if(activeTab==='closed-history' && !closedHistFetched) fetchClosedHistory() },[activeTab, closedHistFetched])
  useEffect(()=>{
    if (!user?.id || ctLoaded) return
    supabase.from('custom_tasks').select('*')
      .eq('user_id', user.id).eq('is_default', true)
      .order('created_at')
      .then(({data}) => {
        if (!mountedRef.current) return
        if (data) {
          setCustomTasks(data.filter(t => !t.is_deleted))
          setDeletedTasks(data.filter(t => t.is_deleted))
        }
        setCtLoaded(true)
      })
      .catch(err => { if (mountedRef.current) console.error('Failed to load custom tasks:', err) })
  },[user?.id]) // eslint-disable-line react-hooks/exhaustive-deps — ctLoaded intentionally omitted to prevent double-fire

  // Load habit_prefs (for solo users) and bio (always per-user) in a single query
  useEffect(()=>{
    if (!user?.id) return
    const teamId = profile?.team_id || null
    // Skip if we already loaded for this exact team context
    if (profileDataLoaded.current && prefsLoadedForTeam.current === teamId) return
    profileDataLoaded.current = true
    prefsLoadedForTeam.current = teamId

    if (teamId && profile?.teams) {
      // On a team — use team_prefs for habit prefs (owner and member both see team defaults)
      setHabitPrefs(profile.teams.team_prefs || { hidden:[], order:[], edits:{} })
    }
    // Always fetch per-user habit_prefs: solo users need it for habitPrefs,
    // and all users need it for bio (bio is never stored in team_prefs)
    supabase.from('profiles').select('habit_prefs').eq('id', user.id).single()
      .then(({data}) => {
        if (!mountedRef.current) return
        if (data?.habit_prefs) {
          // Only set habitPrefs from own profile when NOT on a team
          if (!teamId) setHabitPrefs(data.habit_prefs)
          // Bio is always per-user
          if (data.habit_prefs.bio) setBio(b => ({ ...b, ...data.habit_prefs.bio }))
        }
      })
      .catch(err => { if (mountedRef.current) console.error('Failed to load profile data:', err) })
  },[user?.id, profile?.team_id])

  useEffect(()=>{
    if (!user?.id || goalsLoaded.current) return
    goalsLoaded.current = true
    supabase.from('profiles').select('goals').eq('id', user.id).single()
      .then(({data}) => {
        if (!mountedRef.current) return
        if (data?.goals) {
          setGoals(g=>({ ...g, ...Object.fromEntries(Object.entries(data.goals).map(([k,v])=>[k,v||''])) }))
          if (data.goals.gci_target)     setGciTarget(String(data.goals.gci_target))
          if (data.goals.avg_commission) setAvgCommission(String(data.goals.avg_commission))
          if (data.goals.avatar_url)     setAvatarUrl(data.goals.avatar_url)
        }
      })
      .catch(err => { if (mountedRef.current) console.error('Failed to load goals:', err) })
  },[user?.id])

  async function saveBio() {
    setBioSaving(true)
    try {
      const { data } = await supabase.from('profiles').select('habit_prefs').eq('id', user.id).single()
      const current = data?.habit_prefs || {}
      const { error } = await supabase.from('profiles').update({ habit_prefs: { ...current, bio } }).eq('id', user.id)
      if (error) throw error
      setBioMsg('Saved ✓'); safeTimeout(() => setBioMsg(''), 3000)
    } catch (err) {
      console.error('saveBio error:', err)
      setBioMsg('Failed to save')
    } finally {
      setBioSaving(false)
    }
  }

  // Step 1: validate + open crop modal
  function handleFileSelect(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { setAvatarMsg({ text:'Please select an image file', type:'error' }); safeTimeout(()=>setAvatarMsg(null),3000); return }
    if (file.size > 5 * 1024 * 1024) { setAvatarMsg({ text:'Image must be under 5 MB', type:'error' }); safeTimeout(()=>setAvatarMsg(null),3000); return }
    const url = URL.createObjectURL(file)
    setCropImgSrc(url)
    setCropFile(file)
    if (avatarInputRef.current) avatarInputRef.current.value = ''
  }

  function cancelCrop() {
    if (cropImgSrc) URL.revokeObjectURL(cropImgSrc)
    setCropFile(null); setCropImgSrc(null)
  }

  // Step 2: receive cropped data URL from modal → save directly to profile
  async function uploadCroppedAvatar(dataUrl) {
    if (cropImgSrc) URL.revokeObjectURL(cropImgSrc)
    setCropFile(null); setCropImgSrc(null)
    setAvatarUploading(true)
    try {
      const { data: current } = await supabase.from('profiles').select('goals').eq('id', user.id).single()
      const merged = { ...(current?.goals || {}), avatar_url: dataUrl }
      const { error: saveErr } = await supabase.from('profiles').update({ goals: merged }).eq('id', user.id)
      if (saveErr) throw saveErr
      setAvatarUrl(dataUrl)
      setAvatarMsg({ text:'Photo updated ✓', type:'success' }); safeTimeout(()=>setAvatarMsg(null),3000)
      if (refreshProfile) refreshProfile()
    } catch (err) {
      console.error('Avatar save failed:', err?.message || err)
      setAvatarMsg({ text:'Photo save failed — please try again', type:'error' }); safeTimeout(()=>setAvatarMsg(null),5000)
    } finally {
      setAvatarUploading(false)
    }
  }

  async function saveProfileReply(noteId) {
    const text = (profileReplyForms[noteId] || '').trim()
    if (!text) return
    setProfileReplySaving(noteId)
    try {
      const { data } = await supabase.from('profiles').select('goals').eq('id', user.id).single()
      const existingGoals = data?.goals || {}
      const existingReplies = existingGoals.coaching_replies || {}
      const noteReplies = existingReplies[noteId] || []
      const newReply = { id: Date.now().toString(36), authorId: user.id, text, createdAt: new Date().toISOString() }
      const updatedReplies = { ...existingReplies, [noteId]: [...noteReplies, newReply] }
      const updatedGoals = { ...existingGoals, coaching_replies: updatedReplies }
      const { error } = await supabase.from('profiles').update({ goals: updatedGoals }).eq('id', user.id)
      if (error) throw error
      await refreshProfile()
      setProfileReplyForms(f => ({ ...f, [noteId]: '' }))
    } catch(err) {
      console.error('saveProfileReply error:', err)
    } finally {
      setProfileReplySaving(null)
    }
  }

  async function saveGoals() {
    setGoalsSaving(true)
    try {
      // Fetch existing goals to preserve coaching_replies and other non-goal data
      const { data: current } = await supabase.from('profiles').select('goals').eq('id', user.id).single()
      const existing = current?.goals || {}
      const parsed = {}
      Object.entries(goals).forEach(([k,v])=>{ const n=parseInt(v); if(n>0) parsed[k]=n })
      if (parseInt(gciTarget) > 0)     parsed.gci_target     = parseInt(gciTarget)
      if (parseInt(avgCommission) > 0) parsed.avg_commission = parseInt(avgCommission)
      // Merge: keep coaching_replies and any other keys, overwrite goal fields
      const merged = { ...existing, ...parsed }
      // Remove goal keys that were cleared (value 0 or empty) but keep non-goal keys
      const goalKeys = ['xp','prospecting','appointments','showing','closed','gci_target','avg_commission']
      goalKeys.forEach(k => { if (!parsed[k]) delete merged[k] })
      const { error } = await supabase.from('profiles').update({ goals: merged }).eq('id', user.id)
      if (error) throw error
      setGoalsMsg('Goals saved!')
      safeTimeout(()=>setGoalsMsg(''), 2500)
    } catch (err) {
      console.error('saveGoals error:', err)
      setGoalsMsg('Failed to save')
      safeTimeout(()=>setGoalsMsg(''), 2500)
    } finally {
      setGoalsSaving(false)
    }
  }

  async function fetchHistory() {
    setHistLoad(true)
    try {
      const {data} = await supabase.from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .in('type', ['offer_made','offer_received'])
        .order('month_year', {ascending:false})
      if (data) {
        const order = []
        const map   = {}
        data.forEach(t => {
          const mk = t.month_year || 'Unknown'
          if (!map[mk]) { map[mk] = []; order.push(mk) }
          map[mk].push(t)
        })
        setHistory(order.map(mk => ({ mk, items: map[mk] })))
      }
    } catch (err) {
      console.error('fetchHistory error:', err)
    } finally {
      setHistFetched(true)
      setHistLoad(false)
    }
  }

  async function fetchClosedHistory() {
    setClosedHistLoad(true)
    try {
      const {data} = await supabase.from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .eq('type', 'closed')
        .order('month_year', {ascending:false})
      if (data) {
        const order = []
        const map   = {}
        data.forEach(t => {
          const mk = t.month_year || 'Unknown'
          if (!map[mk]) { map[mk] = []; order.push(mk) }
          map[mk].push(t)
        })
        setClosedHistory(order.map(mk => ({ mk, items: map[mk] })))
      }
    } catch (err) {
      console.error('fetchClosedHistory error:', err)
    } finally {
      setClosedHistFetched(true)
      setClosedHistLoad(false)
    }
  }

  async function fetchAnnual(yr) {
    const seq = ++fetchAnnualSeqRef.current
    setAnnLoad(true)
    try {
    const mks = Array.from({length:12},(_,i)=>`${yr}-${String(i+1).padStart(2,'0')}`)
    const [h,t,l] = await Promise.all([
      supabase.from('habit_completions').select('month_year,habit_id,counter_value,xp_earned').eq('user_id',user.id).like('month_year',`${yr}-%`),
      supabase.from('transactions').select('month_year,type,price,commission').eq('user_id',user.id).like('month_year',`${yr}-%`),
      supabase.from('listings').select('month_year,unit_count').eq('user_id',user.id).like('month_year',`${yr}-%`),
    ])
    if (seq !== fetchAnnualSeqRef.current) return  // stale — newer fetch in progress
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
    setAnnual({byMonth,tot})
    } catch (err) {
      console.error('fetchAnnual error:', err)
    } finally {
      setAnnLoad(false)
    }
  }

  async function saveName() {
    if(!name.trim()) return
    setSaving(true)
    try {
      const { error } = await supabase.from('profiles').update({full_name:name.trim()}).eq('id',user.id)
      if (error) throw error
      await refreshProfile()
      setSaveMsg('Saved ✓'); safeTimeout(()=>setSaveMsg(''),3000)
    } catch (err) {
      setSaveMsg('Failed to save'); safeTimeout(()=>setSaveMsg(''),3000)
      console.error('saveName error:', err)
    } finally {
      setSaving(false)
    }
  }

  async function savePassword() {
    if(pw.length<6){setPwMsg('Min 6 characters'); return}
    setPwSaving(true)
    try {
      const {error} = await supabase.auth.updateUser({password:pw})
      if (error) throw error
      setPwMsg('Password updated ✓')
      setPw('')
    } catch (err) {
      setPwMsg(`Error: ${err.message||'Failed to update'}`)
      console.error('savePassword error:', err)
    } finally {
      safeTimeout(()=>setPwMsg(''),4000)
      setPwSaving(false)
    }
  }

  async function deleteAccount() {
    if (delText !== 'DELETE') return
    setDelLoading(true)
    setDelError(null)
    try {
      // RPC runs with SECURITY DEFINER so it can delete from auth.users
      const { error } = await supabase.rpc('delete_user')
      if (error) {
        setDelError(error.message || 'Delete failed — check Supabase logs.')
        setDelLoading(false)
        return
      }
      await supabase.auth.signOut()
    } catch (err) {
      setDelError(err.message || 'Delete failed unexpectedly.')
      console.error('deleteAccount error:', err)
      setDelLoading(false)
    }
  }

  // ── Custom tasks CRUD ──────────────────────────────────────────────────────
  async function saveNewTask() {
    if (!newTaskForm?.label?.trim()) return
    try {
      const {data, error} = await supabase.from('custom_tasks').insert({
        user_id:user.id, label:newTaskForm.label.trim(),
        icon:newTaskForm.icon.trim()||'✅', xp:Number(newTaskForm.xp)||15,
        is_default:true
      }).select().single()
      if (error) throw error
      if (data) setCustomTasks(prev => [...prev, data])
      setNewTaskForm(null)
    } catch (err) { console.error('saveNewTask error:', err) }
  }

  async function updateTask(id, changes) {
    try {
      const { error } = await supabase.from('custom_tasks').update(changes).eq('id',id).eq('user_id',user.id)
      if (error) throw error
      setCustomTasks(prev => prev.map(t => t.id===id ? {...t,...changes} : t))
      setEditingTask(null)
    } catch (err) { console.error('updateTask error:', err) }
  }

  async function deleteDefaultTask(id) {
    try {
      const { error } = await supabase.from('custom_tasks').update({ is_deleted: true }).eq('id',id).eq('user_id',user.id)
      if (error) throw error
      const task = customTasks.find(t => t.id === id)
      setCustomTasks(prev => prev.filter(t => t.id !== id))
      if (task) {
        const deleted = { ...task, is_deleted: true }
        setDeletedTasks(prev => [...prev, deleted])
        onTaskDeleted?.({ id:task.id, label:task.label, icon:task.icon, xp:task.xp, isDefault:true })
      }
    } catch (err) { console.error('deleteDefaultTask error:', err) }
  }

  async function restoreTask(task) {
    try {
      const { error } = await supabase.from('custom_tasks').update({ is_deleted: false }).eq('id',task.id).eq('user_id',user.id)
      if (error) throw error
      setDeletedTasks(prev => prev.filter(t => t.id !== task.id))
      setCustomTasks(prev => [...prev, { ...task, is_deleted: false }])
      onTaskRestored?.({ id:task.id, label:task.label, icon:task.icon, xp:task.xp, isDefault:true })
    } catch (err) { console.error('restoreTask error:', err) }
  }

  // ── Habit prefs helpers ────────────────────────────────────────────────────
  async function saveHabitPrefs(newPrefs) {
    setHabitPrefs(newPrefs)
    try {
      if (isTeamOwner) {
        // Owner: save to teams table — all members inherit these settings
        await supabase.from('teams').update({ team_prefs: newPrefs }).eq('id', profile.team_id)
        await refreshProfile()
      } else {
        await supabase.from('profiles').update({ habit_prefs: newPrefs }).eq('id', user.id)
      }
    } catch (err) {
      console.error('saveHabitPrefs error:', err)
    }
  }

  function moveHabit(id, dir) {
    const ids = effectiveHabits.map(h => h.id)
    const i   = ids.indexOf(id)
    if (dir==='up'   && i===0)              return
    if (dir==='down' && i===ids.length-1)   return
    const j = dir==='up' ? i-1 : i+1
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    saveHabitPrefs({...habitPrefs, order: ids})
  }

  function hideBuiltIn(id) {
    saveHabitPrefs({...habitPrefs, hidden:[...(habitPrefs.hidden||[]), id]})
  }

  function restoreBuiltIn(id) {
    saveHabitPrefs({...habitPrefs, hidden:(habitPrefs.hidden||[]).filter(x=>x!==id)})
  }

  async function saveHabitEdit() {
    if (!editingHabit || !editingHabit.label.trim()) return
    if (editingHabit.isBuiltIn) {
      const newEdits = {
        ...(habitPrefs.edits||{}),
        [editingHabit.id]: {
          label: editingHabit.label.trim(),
          icon:  editingHabit.icon.trim() || (HABITS.find(h=>h.id===editingHabit.id)?.icon||'✅'),
          xp:    Number(editingHabit.xp)||15,
        }
      }
      await saveHabitPrefs({...habitPrefs, edits: newEdits})
    } else {
      await updateTask(editingHabit.id, {
        label: editingHabit.label.trim(),
        icon:  editingHabit.icon.trim()||'✅',
        xp:    Number(editingHabit.xp)||15,
      })
    }
    setEditingHabit(null)
  }

  const curMonth = new Date().toISOString().slice(0,7)
  const tabs = [{id:'profile',l:'Profile'},{id:'goals',l:'Goals'},{id:'annual',l:'Annual Summary'},{id:'history',l:'Offer History'},{id:'closed-history',l:'Closed Deals'},{id:'settings',l:'Settings'}]

  // Team role
  const isOnTeam    = !!profile?.team_id
  const isTeamOwner = isOnTeam && profile?.teams?.created_by === user?.id
  const isMemberOnly = isOnTeam && !isTeamOwner

  // Computed: unified habit list for the manager card (memoized to avoid re-computing every render)
  const effectiveHabits = useMemo(() => {
    const builtInEff = HABITS
      .filter(h => !(habitPrefs.hidden||[]).includes(h.id))
      .map(h => { const ed=(habitPrefs.edits||{})[h.id]||{}; return {...h, label:ed.label||h.label, icon:ed.icon||h.icon, xp:ed.xp||h.xp, isBuiltIn:true} })
    const customDefs  = isMemberOnly ? [] : customTasks.map(t => ({...t, isBuiltIn:false}))
    const allHabItems = [...builtInEff, ...customDefs]
    const habOrderArr = habitPrefs.order || []
    if (habOrderArr.length) {
      const idx={}; habOrderArr.forEach((id,i)=>idx[id]=i)
      allHabItems.sort((a,b)=>(idx[a.id]??999)-(idx[b.id]??999))
    }
    return allHabItems
  }, [habitPrefs, customTasks, isMemberOnly])

  const hiddenBuiltIns = useMemo(
    () => HABITS.filter(h => (habitPrefs.hidden||[]).includes(h.id)),
    [habitPrefs.hidden]
  )

  // ── Income Goal Calculator helpers ──────────────────────────────────────────
  function getMonthsRemaining() {
    // 12 - current month index (0-based) = months remaining including current month
    // Jan=0 → 12, Feb=1 → 11, ... Dec=11 → 1
    return Math.max(12 - new Date().getMonth(), 1)
  }
  const monthsRemaining = getMonthsRemaining()

  function computeCalc() {
    const gci  = parseFloat(String(gciTarget).replace(/[^0-9.]/g,''))
    const comm = parseFloat(String(avgCommission).replace(/[^0-9.]/g,'')) || 10000
    if (!gci || gci <= 0) return
    const mo = monthsRemaining, wd = mo * 22
    const c = gci / comm
    const s = c * 3
    const a = s / 0.7
    const k = a * 20
    setCalcResult({
      closings: { year:c, month:c/mo, day:c/wd },
      showings: { year:s, month:s/mo, day:s/wd },
      appts:    { year:a, month:a/mo, day:a/wd },
      calls:    { year:k, month:k/mo, day:k/wd },
    })
  }

  async function applyCalcAsGoals() {
    if (!calcResult) return
    const newGoals = {
      ...goals,
      prospecting:  String(Math.ceil(calcResult.calls.month)),
      appointments: String(Math.ceil(calcResult.appts.month)),
      showing:      String(Math.ceil(calcResult.showings.month)),
      closed:       String(Math.ceil(calcResult.closings.month)),
    }
    setGoals(newGoals)
    const parsed = {}
    Object.entries(newGoals).forEach(([k,v])=>{ const n=parseInt(v); if(n>0) parsed[k]=n })
    if (parseInt(gciTarget) > 0)     parsed.gci_target     = parseInt(gciTarget)
    if (parseInt(avgCommission) > 0) parsed.avg_commission = parseInt(avgCommission)
    try {
      await supabase.from('profiles').update({ goals: parsed }).eq('id', user.id)
      setGoalsMsg('Goals applied from calculator!')
      safeTimeout(()=>setGoalsMsg(''), 3000)
    } catch (err) {
      console.error('applyCalcAsGoals error:', err)
      setGoalsMsg('Failed to apply goals')
      safeTimeout(()=>setGoalsMsg(''), 3000)
    }
  }

  return (
    <>
      <div className="page-inner" style={{ maxWidth:880 }}>

          {/* Rank banner */}
          <div className="card" style={{ padding:28, marginBottom:20, borderTop:`3px solid ${rank.color}`,
            background:`linear-gradient(135deg, ${rank.color}0d 0%, var(--surface) 55%)`,
            display:'flex', gap:22, alignItems:'center', flexWrap:'wrap' }}>
            <div style={{ position:'relative', flexShrink:0, cursor:'pointer' }}
              onClick={()=>avatarInputRef.current?.click()} title="Change profile photo">
              <Ring pct={rankPct} size={84} sw={6} color={rank.color}/>
              <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" style={{ width:64, height:64, borderRadius:'50%', objectFit:'cover' }}/>
                ) : (
                  <div style={{ width:64, height:64, borderRadius:'50%',
                    background:`linear-gradient(135deg, ${rank.color}, ${rank.color}88)`,
                    display:'flex', alignItems:'center', justifyContent:'center',
                    fontSize:26, fontWeight:700, color:'#fff' }}>
                    {(profile?.full_name||'A').charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              {avatarUploading && (
                <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center',
                  background:'rgba(0,0,0,.5)', borderRadius:'50%' }}>
                  <Loader/>
                </div>
              )}
              <div style={{ position:'absolute', bottom:-2, right:-2, width:22, height:22, borderRadius:'50%',
                background:'var(--surface)', border:'2px solid var(--b2)',
                display:'flex', alignItems:'center', justifyContent:'center', fontSize:11 }}>
                📷
              </div>
              <input ref={avatarInputRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" onChange={handleFileSelect}
                style={{ display:'none' }}/>
              {avatarMsg && (
                <div style={{ position:'absolute', top:'100%', left:'50%', transform:'translateX(-50%)',
                  marginTop:6, fontSize:11, fontWeight:600, whiteSpace:'nowrap',
                  color: avatarMsg.type === 'error' ? 'var(--red, #ef4444)' : 'var(--green)' }}>
                  {avatarMsg.text}
                </div>
              )}
            </div>
            <div style={{ flex:1, minWidth:180 }}>
              <div style={{ fontSize:10, color:rank.color, fontFamily:"'JetBrains Mono',monospace", letterSpacing:.8,
                textTransform:'uppercase', fontWeight:700, marginBottom:5 }}>
                {rank.name}
              </div>
              <div className="serif" style={{ fontSize:32, color:'var(--text)', lineHeight:1.05, marginBottom:4, letterSpacing:'-.02em', fontWeight:600 }}>
                {profile?.full_name||'Agent'}
              </div>
              <div style={{ fontSize:12, color:'var(--muted)', marginBottom:12 }}>{user?.email}</div>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <div className="progress-track" style={{ flex:1, maxWidth:220 }}>
                  <div className="progress-fill" style={{ width:`${rankPct}%`, background:rank.color }}/>
                </div>
                <span className="mono" style={{ fontSize:11, color:rank.color, fontWeight:700 }}>{(profile?.xp||0).toLocaleString()} XP</span>
              </div>
              {nextRank && <div style={{ fontSize:11, color:'var(--dim)', marginTop:5 }}>
                {(nextRank.min-(profile?.xp||0)).toLocaleString()} XP until {nextRank.icon} {nextRank.name}
              </div>}
            </div>
            <div style={{ display:'flex', gap:10 }}>
              {[{l:'Total XP',v:(profile?.xp||0).toLocaleString(),c:rank.color},{l:'Streak',v:`🔥 ${profile?.streak||0}`,c:'#f97316'}].map((s,i)=>(
                <div key={i} className="card-inset" style={{ padding:'12px 18px', textAlign:'center', minWidth:88 }}>
                  <div className="label" style={{ marginBottom:5 }}>{s.l}</div>
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
            <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
              {/* Account Settings — name + password stacked */}
              <div className="card" style={{ padding:24 }}>
                <div className="serif" style={{ fontSize:18, color:'var(--text)', marginBottom:20 }}>Account Settings</div>

                {/* Display name row */}
                <div style={{ marginBottom:20 }}>
                  <div className="label" style={{ marginBottom:7 }}>Display Name</div>
                  <div style={{ display:'flex', gap:8 }}>
                    <input className="field-input" value={name} onChange={e=>setName(e.target.value)}
                      placeholder="Full name" style={{ flex:1 }}/>
                    <button className="btn-primary" onClick={saveName} disabled={saving||!name.trim()}
                      style={{ padding:'0 18px', whiteSpace:'nowrap' }}>
                      {saving ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                  {saveMsg && <div style={{ fontSize:12, color:'var(--green)', marginTop:7 }}>{saveMsg}</div>}
                </div>

                <div style={{ height:1, background:'var(--b1)', marginBottom:20 }}/>

                {/* Password row */}
                <div>
                  <div className="label" style={{ marginBottom:7 }}>{hasPasswordIdentity ? 'Change Password' : 'Set Password'}</div>
                  <div style={{ display:'flex', gap:8 }}>
                    <input className="field-input" type="password" value={pw} onChange={e=>setPw(e.target.value)}
                      placeholder={hasPasswordIdentity ? "New password — min 6 characters" : "Create a password — min 6 characters"} style={{ flex:1 }}/>
                    <button className="btn-primary" onClick={savePassword} disabled={pwSaving||pw.length<6}
                      style={{ padding:'0 18px', whiteSpace:'nowrap' }}>
                      {pwSaving ? 'Saving…' : 'Update'}
                    </button>
                  </div>
                  {pwMsg && <div style={{ fontSize:12, color:pwMsg.includes('Error')?'var(--red)':'var(--green)', marginTop:7 }}>{pwMsg}</div>}
                </div>
              </div>

              {/* ── Refer & Earn / Affiliate Link ─────────────────── */}
              {(() => {
                const affLink = profile?.habit_prefs?.affiliate_link
                const gold = theme === 'dark' ? '#d97706' : '#b45309'
                return (
                  <div className="card" style={{ padding:24, borderTop:`3px solid ${gold}`,
                    background:`linear-gradient(135deg, ${gold}08 0%, var(--surface) 60%)` }}>
                    <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
                      <span style={{ fontSize:20 }}>💰</span>
                      <span className="serif" style={{ fontSize:18, fontWeight:700, color:'var(--text)' }}>Refer & Earn</span>
                    </div>
                    {affLink ? (
                      <>
                        <p style={{ fontSize:13, color:'var(--muted)', lineHeight:1.6, marginBottom:12,
                          fontFamily:"'Poppins',sans-serif" }}>
                          Share your link — earn 20% on every referral for 12 months.
                        </p>
                        <AffLinkCopy link={affLink} gold={gold} />
                      </>
                    ) : (
                      <>
                        <p style={{ fontSize:13, color:'var(--muted)', lineHeight:1.6, marginBottom:14,
                          fontFamily:"'Poppins',sans-serif" }}>
                          Earn 20% on every referral's subscription for 12 months. No cap on earnings.
                        </p>
                        <button className="btn-gold" onClick={() => onNavigate('affiliates')}
                          style={{ fontSize:13, padding:'9px 22px' }}>
                          Learn More →
                        </button>
                      </>
                    )}
                  </div>
                )
              })()}

              {/* Professional Info */}
              <div className="card" style={{ padding:24 }}>
                <div className="serif" style={{ fontSize:18, color:'var(--text)', marginBottom:4 }}>Professional Info</div>
                <div style={{ fontSize:12, color:'var(--muted)', marginBottom:18 }}>Shown to your team on the roster and member detail panel.</div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                  <div>
                    <div className="label" style={{ marginBottom:4 }}>Phone</div>
                    <input className="field-input" value={bio.phone}
                      onChange={e => setBio(b => ({ ...b, phone: e.target.value }))} placeholder="416-555-1234" />
                  </div>
                  <div>
                    <div className="label" style={{ marginBottom:4 }}>License #</div>
                    <input className="field-input" value={bio.license}
                      onChange={e => setBio(b => ({ ...b, license: e.target.value }))} placeholder="ON-12345" />
                  </div>
                </div>
                <div style={{ marginTop:14 }}>
                  <div className="label" style={{ marginBottom:4 }}>Specialty</div>
                  <select className="field-input" value={bio.specialty}
                    onChange={e => setBio(b => ({ ...b, specialty: e.target.value }))}>
                    <option value="">— Select —</option>
                    {['Buyers','Sellers','Both','Commercial','Rentals'].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div style={{ marginTop:14 }}>
                  <div className="label" style={{ marginBottom:4 }}>
                    About <span style={{ color:'var(--dim)', fontWeight:400 }}>(tagline · max 100 chars)</span>
                  </div>
                  <input className="field-input" value={bio.about} maxLength={100}
                    onChange={e => setBio(b => ({ ...b, about: e.target.value }))}
                    placeholder="Helping families find home in the GTA since 2015" />
                </div>
                <div style={{ marginTop:14 }}>
                  <div className="label" style={{ marginBottom:4 }}>
                    Review Link <span style={{ color:'var(--dim)', fontWeight:400 }}>(Google, Zillow, etc.)</span>
                  </div>
                  <input className="field-input" value={bio.review_link}
                    onChange={e => setBio(b => ({ ...b, review_link: e.target.value }))}
                    placeholder="https://g.page/r/your-business/review" />
                </div>
                <div style={{ marginTop:14 }}>
                  <div className="label" style={{ marginBottom:4 }}>
                    Timezone <span style={{ color:'var(--dim)', fontWeight:400 }}>(used for standup dates & daily tracking)</span>
                  </div>
                  <select className="field-input" value={bio.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone}
                    onChange={e => setBio(b => ({ ...b, timezone: e.target.value }))}>
                    {Intl.supportedValuesOf('timeZone').map(tz => <option key={tz} value={tz}>{tz.replace(/_/g,' ')}</option>)}
                  </select>
                </div>
                <div style={{ marginTop:16, display:'flex', alignItems:'center', gap:12 }}>
                  <button className="btn-primary" onClick={saveBio} disabled={bioSaving} style={{ fontSize:13 }}>
                    {bioSaving ? 'Saving…' : 'Save Info'}
                  </button>
                  {bioMsg && <span style={{ fontSize:12, color: bioMsg.includes('Failed') ? 'var(--red)' : 'var(--green)' }}>{bioMsg}</span>}
                </div>
              </div>

              {/* Coaching Notes from team (only shown when on a team with notes) */}
              {(()=>{
                if (!profile?.team_id) return null
                const NC = { praise:'#10b981', goal:'#d97706', concern:'#f43f5e', general:'#0ea5e9' }
                const teamNotes = profile?.teams?.team_prefs?.coaching_notes || []
                const myNotes = teamNotes
                  .filter(n => n.agentId === user?.id)
                  .sort((a,b) => (b.pinned?1:0)-(a.pinned?1:0) || new Date(b.createdAt)-new Date(a.createdAt))
                if (myNotes.length === 0) return null
                return (
                  <div className="card" style={{ padding:24 }}>
                    <div className="serif" style={{ fontSize:18, color:'var(--text)', marginBottom:4 }}>📋 Coaching Notes</div>
                    <div style={{ fontSize:12, color:'var(--muted)', marginBottom:18 }}>
                      Notes from your team coach. Reply to keep the conversation going.
                    </div>
                    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                      {myNotes.map(note=>{
                        const c = NC[note.type] || NC.general
                        const myReplies = profile?.goals?.coaching_replies?.[note.id] || []
                        const allReplies = [...(note.replies||[]), ...myReplies]
                          .sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt))
                        return (
                          <div key={note.id} style={{ padding:'14px 16px', borderRadius:10,
                            border: note.pinned ? '1px solid rgba(217,119,6,.45)' : '1px solid var(--b2)',
                            background: note.pinned ? 'var(--gold3)' : 'var(--bg2)' }}>
                            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8, flexWrap:'wrap' }}>
                              <span style={{ fontSize:9, padding:'2px 7px', borderRadius:4, fontWeight:700,
                                background:`${c}18`, color:c, border:`1px solid ${c}33`,
                                textTransform:'uppercase', letterSpacing:'.5px', flexShrink:0 }}>{note.type}</span>
                              {note.pinned && <span style={{ fontSize:10, color:'var(--gold2)', flexShrink:0 }}>📌 Pinned</span>}
                              <span style={{ marginLeft:'auto', fontSize:11, color:'var(--dim)', flexShrink:0 }}>
                                {(()=>{
                                  if (!note.createdAt) return ''
                                  const diff = Math.floor((Date.now() - new Date(note.createdAt).getTime()) / 1000)
                                  if (diff < 60) return 'just now'
                                  if (diff < 3600) return `${Math.floor(diff/60)}m ago`
                                  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`
                                  const d = Math.floor(diff/86400)
                                  return d === 1 ? '1 day ago' : `${d} days ago`
                                })()}
                              </span>
                            </div>
                            <div style={{ fontSize:13, color:'var(--text)', lineHeight:1.6, marginBottom:10 }}>{note.text}</div>

                            {/* Replies thread */}
                            {allReplies.length > 0 && (
                              <div style={{ borderLeft:'2px solid var(--b2)', paddingLeft:10, marginBottom:10,
                                display:'flex', flexDirection:'column', gap:6 }}>
                                {allReplies.map(r=>{
                                  const isCoach = r.authorId !== user?.id
                                  return (
                                    <div key={r.id}>
                                      <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:2 }}>
                                        <span style={{ fontSize:11, fontWeight:600, color: isCoach ? 'var(--gold)' : 'var(--text)' }}>
                                          {isCoach ? 'Coach' : 'You'}
                                        </span>
                                        {isCoach && <span style={{ fontSize:9, padding:'1px 5px', borderRadius:3, background:'var(--gold4)', color:'var(--gold)', fontWeight:700 }}>COACH</span>}
                                      </div>
                                      <div style={{ fontSize:12, color:'var(--text2)', lineHeight:1.5 }}>{r.text}</div>
                                    </div>
                                  )
                                })}
                              </div>
                            )}

                            {/* Reply form */}
                            <div style={{ display:'flex', gap:6 }}>
                              <input className="field-input"
                                value={profileReplyForms[note.id]||''}
                                onChange={e=>setProfileReplyForms(f=>({...f,[note.id]:e.target.value.slice(0,300)}))}
                                onKeyDown={e=>e.key==='Enter'&&!e.shiftKey&&saveProfileReply(note.id)}
                                placeholder="Reply to your coach…"
                                style={{ flex:1, padding:'7px 11px', fontSize:12 }}/>
                              <button onClick={()=>saveProfileReply(note.id)}
                                disabled={profileReplySaving===note.id||!(profileReplyForms[note.id]||'').trim()}
                                style={{ fontSize:12, padding:'7px 14px', borderRadius:7, cursor:'pointer',
                                  background:'var(--text)', border:'none', color:'var(--bg)', fontWeight:600, flexShrink:0 }}>
                                {profileReplySaving===note.id ? '…' : 'Send'}
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })()}

              {/* Daily Habits & Tasks */}
              <div className="card" style={{ padding:22 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:isMemberOnly?8:16 }}>
                  <div>
                    <div className="serif" style={{ fontSize:18, color:'var(--text)', marginBottom:2 }}>Daily Habits &amp; Tasks</div>
                    <div style={{ fontSize:12, color:'var(--muted)' }}>
                      {isMemberOnly
                        ? 'Set by your team leader'
                        : isTeamOwner
                          ? 'Managing team defaults — changes apply to all members'
                          : 'Reorder, edit, hide or add tasks — changes appear on your Today checklist'}
                    </div>
                  </div>
                  {!isMemberOnly && (
                    <button className="btn-outline" style={{ fontSize:12 }}
                      onClick={() => { setNewTaskForm({label:'',icon:'✅',xp:'15'}); setEditingHabit(null) }}>
                      ＋ Add Task
                    </button>
                  )}
                </div>
                {isTeamOwner && (
                  <div style={{ fontSize:11, color:'#8b5cf6', marginBottom:12, display:'flex', alignItems:'center', gap:6,
                    padding:'6px 10px', borderRadius:7, background:'rgba(139,92,246,.08)', border:'1px solid rgba(139,92,246,.18)' }}>
                    <span>👑</span> Team owner — your edits apply to all team members
                  </div>
                )}

                {/* New task form — owners and solo users only */}
                {newTaskForm && !isMemberOnly && (
                  <div style={{ display:'grid', gridTemplateColumns:'56px 1fr 72px auto', gap:8,
                    alignItems:'flex-end', marginBottom:14, padding:14, borderRadius:10,
                    background:'var(--bg2,var(--b1))', border:'1px solid var(--b2)' }}>
                    <div>
                      <div className="label" style={{ marginBottom:4 }}>Icon</div>
                      <input className="field-input" value={newTaskForm.icon} maxLength={2}
                        onChange={e=>setNewTaskForm(f=>({...f,icon:e.target.value}))}
                        style={{ textAlign:'center', fontSize:18, padding:'6px 0' }}/>
                    </div>
                    <div>
                      <div className="label" style={{ marginBottom:4 }}>Label</div>
                      <input className="field-input" value={newTaskForm.label} autoFocus
                        onChange={e=>setNewTaskForm(f=>({...f,label:e.target.value}))}
                        onKeyDown={e=>e.key==='Enter'&&saveNewTask()}
                        placeholder="Task name"/>
                    </div>
                    <div>
                      <div className="label" style={{ marginBottom:4 }}>XP</div>
                      <input className="field-input" value={newTaskForm.xp} type="number"
                        onChange={e=>setNewTaskForm(f=>({...f,xp:e.target.value}))}
                        onKeyDown={e=>e.key==='Enter'&&saveNewTask()}
                        min="0" max="500"/>
                    </div>
                    <div style={{ display:'flex', gap:6, paddingBottom:2 }}>
                      <button className="btn-gold" style={{ fontSize:12 }} onClick={saveNewTask}
                        disabled={!newTaskForm.label.trim()}>Save</button>
                      <button className="btn-outline" style={{ fontSize:12 }} onClick={()=>setNewTaskForm(null)}>✕</button>
                    </div>
                  </div>
                )}

                {/* Unified habit + task list */}
                {effectiveHabits.length === 0 && !newTaskForm && (
                  <div style={{ fontSize:13, color:'var(--muted)', padding:'10px 0' }}>
                    No active habits — restore hidden ones below or add a custom task.
                  </div>
                )}
                {effectiveHabits.map((h, hIdx) => (
                  <div key={h.id}>
                    {editingHabit?.id === h.id ? (
                      /* Inline edit row */
                      <div style={{ display:'grid', gridTemplateColumns:'56px 1fr 72px auto', gap:8,
                        alignItems:'flex-end', marginBottom:8, padding:'10px 12px', borderRadius:10,
                        background:'var(--bg2,var(--b1))', border:'1px solid var(--b2)' }}>
                        <div>
                          <div className="label" style={{ marginBottom:4 }}>Icon</div>
                          <input className="field-input" value={editingHabit.icon} maxLength={2}
                            onChange={e=>setEditingHabit(eh=>({...eh,icon:e.target.value}))}
                            style={{ textAlign:'center', fontSize:18, padding:'6px 0' }}/>
                        </div>
                        <div>
                          <div className="label" style={{ marginBottom:4 }}>Label</div>
                          <input className="field-input" value={editingHabit.label} autoFocus
                            onChange={e=>setEditingHabit(eh=>({...eh,label:e.target.value}))}
                            onKeyDown={e=>e.key==='Enter'&&saveHabitEdit()}
                            placeholder="Task name"/>
                        </div>
                        <div>
                          <div className="label" style={{ marginBottom:4 }}>XP</div>
                          <input className="field-input" value={editingHabit.xp} type="number"
                            onChange={e=>setEditingHabit(eh=>({...eh,xp:e.target.value}))}
                            min="0" max="500"/>
                        </div>
                        <div style={{ display:'flex', gap:6, paddingBottom:2 }}>
                          <button className="btn-gold" style={{ fontSize:12 }} onClick={saveHabitEdit}
                            disabled={!editingHabit.label.trim()}>Save</button>
                          <button className="btn-outline" style={{ fontSize:12 }} onClick={()=>setEditingHabit(null)}>✕</button>
                        </div>
                      </div>
                    ) : (
                      /* Display row */
                      <div style={{ display:'flex', alignItems:'center', gap:8, padding:'9px 4px',
                        borderBottom:'1px solid var(--b1)' }}>
                        {/* Reorder arrows — owners and solo users only */}
                        {!isMemberOnly && (
                          <div style={{ display:'flex', flexDirection:'column', gap:0, flexShrink:0 }}>
                            <button onClick={()=>moveHabit(h.id,'up')} disabled={hIdx===0}
                              style={{ background:'none', border:'none', lineHeight:1, padding:'2px 4px',
                                cursor:hIdx===0?'default':'pointer',
                                color:hIdx===0?'var(--dim)':'var(--muted)', fontSize:10 }}>▲</button>
                            <button onClick={()=>moveHabit(h.id,'down')} disabled={hIdx===effectiveHabits.length-1}
                              style={{ background:'none', border:'none', lineHeight:1, padding:'2px 4px',
                                cursor:hIdx===effectiveHabits.length-1?'default':'pointer',
                                color:hIdx===effectiveHabits.length-1?'var(--dim)':'var(--muted)', fontSize:10 }}>▼</button>
                          </div>
                        )}
                        <span style={{ fontSize:18, flexShrink:0 }}>{h.icon}</span>
                        <span style={{ flex:1, fontSize:13, fontWeight:500, color:'var(--text)', minWidth:0 }}>{h.label}</span>
                        {h.isBuiltIn && (
                          <span style={{ fontSize:9, padding:'2px 6px', borderRadius:4,
                            background:'var(--b1)', color:'var(--dim)', fontWeight:600,
                            letterSpacing:.5, flexShrink:0, whiteSpace:'nowrap' }}>BUILT-IN</span>
                        )}
                        <span style={{ fontSize:11, color:'var(--muted)', fontFamily:"'JetBrains Mono',monospace", flexShrink:0 }}>+{h.xp} XP</span>
                        {!isMemberOnly && (
                          <>
                            <button className="btn-outline" style={{ fontSize:11, padding:'4px 10px', flexShrink:0 }}
                              onClick={()=>{ setEditingHabit({...h}); setNewTaskForm(null) }}>Edit</button>
                            {h.isBuiltIn ? (
                              <button className="btn-del" title="Hide from checklist" onClick={()=>hideBuiltIn(h.id)}>✕</button>
                            ) : (
                              <button className="btn-del" onClick={()=>deleteDefaultTask(h.id)}>✕</button>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                ))}

                {/* Hidden built-ins — restore section (owners and solo users only) */}
                {hiddenBuiltIns.length > 0 && !isMemberOnly && (
                  <div style={{ marginTop:18, paddingTop:14, borderTop:'1px dashed var(--b2)' }}>
                    <div style={{ fontSize:10, color:'var(--dim)', fontWeight:700, letterSpacing:1,
                      marginBottom:10, textTransform:'uppercase' }}>Hidden Habits</div>
                    {hiddenBuiltIns.map(h => (
                      <div key={h.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 4px',
                        borderBottom:'1px solid var(--b1)', opacity:.55 }}>
                        <span style={{ width:24, flexShrink:0 }}/>
                        <span style={{ fontSize:16, flexShrink:0 }}>{h.icon}</span>
                        <span style={{ flex:1, fontSize:13, color:'var(--muted)', textDecoration:'line-through' }}>{h.label}</span>
                        <span style={{ fontSize:11, color:'var(--dim)', fontFamily:"'JetBrains Mono',monospace", flexShrink:0 }}>+{h.xp} XP</span>
                        <button className="btn-outline" style={{ fontSize:11, padding:'4px 10px', flexShrink:0 }}
                          onClick={()=>restoreBuiltIn(h.id)}>Restore</button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Deleted custom tasks — restore section */}
                {deletedTasks.length > 0 && !isMemberOnly && (
                  <div style={{ marginTop:18, paddingTop:14, borderTop:'1px dashed var(--b2)' }}>
                    <div style={{ fontSize:10, color:'var(--dim)', fontWeight:700, letterSpacing:1,
                      marginBottom:10, textTransform:'uppercase' }}>Deleted Tasks</div>
                    {deletedTasks.map(t => (
                      <div key={t.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 4px',
                        borderBottom:'1px solid var(--b1)', opacity:.55 }}>
                        <span style={{ width:24, flexShrink:0 }}/>
                        <span style={{ fontSize:16, flexShrink:0 }}>{t.icon}</span>
                        <span style={{ flex:1, fontSize:13, color:'var(--muted)', textDecoration:'line-through' }}>{t.label}</span>
                        <span style={{ fontSize:11, color:'var(--dim)', fontFamily:"'JetBrains Mono',monospace", flexShrink:0 }}>+{t.xp} XP</span>
                        <button className="btn-outline" style={{ fontSize:11, padding:'4px 10px', flexShrink:0 }}
                          onClick={()=>restoreTask(t)}>Restore</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Danger zone */}
              <div className="card" style={{ padding:22, borderTop:'3px solid var(--red)' }}>
                <div className="serif" style={{ fontSize:18, color:'var(--red)', marginBottom:4 }}>Danger Zone</div>
                <div style={{ fontSize:13, color:'var(--muted)', marginBottom:14 }}>
                  Permanently delete your account and all data. Cannot be undone.
                </div>
                <button onClick={()=>setShowDel(true)} style={{
                  background:'rgba(220,38,38,.06)', border:'1px solid rgba(220,38,38,.25)',
                  color:'var(--red)', borderRadius:8, padding:'9px 18px', cursor:'pointer', fontSize:13, fontWeight:600
                }}>Delete Account</button>
              </div>

              {/* Delete confirmation modal */}
              {showDel && (
                <div style={{
                  position:'fixed', inset:0, zIndex:900,
                  background:'rgba(0,0,0,.65)', backdropFilter:'blur(4px)',
                  display:'flex', alignItems:'center', justifyContent:'center',
                  padding:24,
                }} onClick={e=>{ if(e.target===e.currentTarget){setShowDel(false);setDelText('');setDelError(null)} }}>
                  <div className="card" style={{
                    padding:28, maxWidth:420, width:'100%',
                    borderTop:'3px solid var(--red)',
                  }}>
                    <div className="serif" style={{ fontSize:18, color:'var(--red)', marginBottom:8 }}>Delete Account</div>
                    <div style={{ fontSize:13, color:'var(--text2)', marginBottom:18, lineHeight:1.7 }}>
                      This will permanently erase all habits, listings, transactions and profile data. This cannot be undone.
                    </div>
                    <div className="label" style={{ marginBottom:6 }}>Type DELETE to confirm</div>
                    <input className="field-input" value={delText} onChange={e=>setDelText(e.target.value)}
                      placeholder="DELETE"
                      style={{ marginBottom:18, width:'100%', fontWeight:700, letterSpacing:3, color:'var(--red)' }}/>
                    <div style={{ display:'flex', gap:8 }}>
                      <button className="btn-outline" onClick={()=>{setShowDel(false);setDelText('');setDelError(null)}}>Cancel</button>
                      <button onClick={deleteAccount} disabled={delLoading||delText!=='DELETE'}
                        style={{ background:delText==='DELETE'?'var(--red)':'rgba(220,38,38,.15)', border:'none',
                          color:delText==='DELETE'?'#fff':'rgba(220,38,38,.4)', borderRadius:8, padding:'9px 20px',
                          cursor:delText==='DELETE'?'pointer':'not-allowed', fontWeight:600, fontSize:13 }}>
                        {delLoading?'Deleting…':'Yes, Delete Everything'}
                      </button>
                    </div>
                    {delError && (
                      <div style={{ marginTop:10, fontSize:12, color:'var(--red)' }}>
                        ⚠ {delError}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Goals tab ── */}
          {activeTab==='goals' && (
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

              {/* Monthly Goals card */}
              <div className="card" style={{ padding:24 }}>
                <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:20, gap:12, flexWrap:'wrap' }}>
                  <div>
                    <div className="serif" style={{ fontSize:20, color:'var(--text)', marginBottom:3, letterSpacing:'-.01em' }}>🎯 Monthly Goals</div>
                    <div style={{ fontSize:12, color:'var(--muted)' }}>Set targets to track progress on your dashboard.</div>
                  </div>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(155px,1fr))', gap:14 }}>
                  {[
                    { key:'xp',           label:'Monthly XP Target',      icon:'⚡', placeholder:'e.g. 2000' },
                    { key:'prospecting',  label:'Prospecting Calls',       icon:'📞', placeholder:'e.g. 40' },
                    { key:'appointments', label:'Appointments Booked',     icon:'📅', placeholder:'e.g. 10' },
                    { key:'showing',      label:'Property Showings',       icon:'🔑', placeholder:'e.g. 20' },
                    { key:'listings',     label:'Listings Taken',           icon:'🏡', placeholder:'e.g. 5' },
                    { key:'buyers',       label:'Buyer Reps Signed',       icon:'🤝', placeholder:'e.g. 5' },
                    { key:'closed',       label:'Deals to Close',          icon:'🎉', placeholder:'e.g. 3' },
                  ].map(f=>(
                    <div key={f.key}>
                      <div className="label" style={{ marginBottom:5 }}>{f.icon} {f.label}</div>
                      <input type="number" min="0" className="field-input"
                        value={goals[f.key]||''}
                        onChange={e=>setGoals(g=>({...g,[f.key]:e.target.value}))}
                        placeholder={f.placeholder}
                        style={{ width:'100%' }}/>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop:18, display:'flex', alignItems:'center', gap:12 }}>
                  <button className="btn-primary" onClick={saveGoals} disabled={goalsSaving}
                    style={{ padding:'9px 22px', fontSize:13 }}>
                    {goalsSaving ? 'Saving…' : 'Save Goals'}
                  </button>
                  {goalsMsg && <span style={{ fontSize:12, color:goalsMsg.includes('Failed')?'var(--red)':'var(--green)' }}>{goalsMsg}</span>}
                </div>
              </div>

              {/* Income Goal Calculator card */}
              <div className="card" style={{ padding:24 }}>
                <div className="serif" style={{ fontSize:20, color:'var(--text)', marginBottom:3, letterSpacing:'-.01em' }}>🧮 Income Goal Calculator</div>
                <div style={{ fontSize:12, color:'var(--muted)', marginBottom:20 }}>
                  Enter your annual GCI target — we'll reverse-engineer your daily activity requirements.
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:14, marginBottom:18 }}>
                  <div>
                    <div className="label" style={{ marginBottom:5 }}>💰 Annual GCI Target</div>
                    <input type="number" min="0" className="field-input"
                      value={gciTarget}
                      onChange={e=>{ setGciTarget(e.target.value); setCalcResult(null) }}
                      placeholder="e.g. 200000"
                      style={{ width:'100%', fontFamily:"'JetBrains Mono',monospace", color:'var(--gold2)' }}/>
                  </div>
                  <div>
                    <div className="label" style={{ marginBottom:5 }}>🤝 Avg Commission Per Deal</div>
                    <input type="number" min="0" className="field-input"
                      value={avgCommission}
                      onChange={e=>{ setAvgCommission(e.target.value); setCalcResult(null) }}
                      placeholder="e.g. 10000"
                      style={{ width:'100%', fontFamily:"'JetBrains Mono',monospace", color:'var(--green)' }}/>
                  </div>
                  <div>
                    <div className="label" style={{ marginBottom:5 }}>📅 Months Remaining (this year)</div>
                    <div style={{ padding:'8px 12px', borderRadius:8, background:'var(--bg2)', border:'1px solid var(--b1)',
                      fontFamily:"'JetBrains Mono',monospace", fontSize:14, color:'var(--muted)' }}>
                      {monthsRemaining} month{monthsRemaining!==1?'s':''}
                    </div>
                  </div>
                </div>
                <button className="btn-primary" onClick={computeCalc}
                  style={{ padding:'9px 24px', fontSize:13, marginBottom: calcResult ? 20 : 0 }}>
                  Calculate
                </button>
                {calcResult && (
                  <>
                    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13, marginBottom:12 }}>
                      <thead>
                        <tr style={{ borderBottom:'1.5px solid var(--b1)' }}>
                          {['Activity','Per Year','Per Month','Per Day'].map((h,i)=>(
                            <th key={i} style={{ padding:'8px 10px', textAlign:i===0?'left':'right',
                              color:'var(--muted)', fontWeight:500, fontSize:11, whiteSpace:'nowrap' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          { icon:'📞', label:'Prospecting Calls', key:'calls',    color:'var(--gold2)' },
                          { icon:'📅', label:'Appointments',      key:'appts',    color:'var(--green)' },
                          { icon:'🔑', label:'Showings',          key:'showings', color:'#0ea5e9' },
                          { icon:'🎉', label:'Closings',          key:'closings', color:'var(--green)' },
                        ].map((row,i)=>(
                          <tr key={i} style={{ borderBottom:'1px solid var(--b1)' }}>
                            <td style={{ padding:'10px 10px', color:'var(--text)', fontWeight:500 }}>{row.icon} {row.label}</td>
                            <td style={{ padding:'10px 10px', textAlign:'right', fontFamily:"'JetBrains Mono',monospace", color:row.color, fontWeight:600 }}>
                              {Math.ceil(calcResult[row.key].year)}
                            </td>
                            <td style={{ padding:'10px 10px', textAlign:'right', fontFamily:"'JetBrains Mono',monospace", color:row.color, fontWeight:600 }}>
                              {Math.ceil(calcResult[row.key].month)}
                            </td>
                            <td style={{ padding:'10px 10px', textAlign:'right', fontFamily:"'JetBrains Mono',monospace", color:row.color, fontWeight:600 }}>
                              {calcResult[row.key].day < 1
                                ? `${(calcResult[row.key].day * 22).toFixed(1)}/wk`
                                : Math.ceil(calcResult[row.key].day)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div style={{ fontSize:10, color:'var(--dim)', marginBottom:16 }}>
                      Ratios: 3 showings/closing · 70% appt→showing · 20 calls/appt · {monthsRemaining} months × 22 work days
                    </div>
                    <button className="btn-gold" onClick={applyCalcAsGoals}
                      style={{ padding:'9px 24px', fontSize:13 }}>
                      ✓ Apply as My Goals
                    </button>
                  </>
                )}
              </div>

            </div>
          )}

          {/* ── Annual tab ── */}
          {activeTab==='annual' && (
            <div>
              <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20, flexWrap:'wrap' }}>
                <div className="serif" style={{ fontSize:18, color:'var(--text)' }}>Annual Summary — {CUR_YEAR}</div>
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

          {/* ── History tab ── */}
          {activeTab==='history' && (
            <div>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:20, flexWrap:'wrap' }}>
                <div className="serif" style={{ fontSize:18, color:'var(--text)' }}>Offer History</div>
                <div style={{ fontSize:13, color:'var(--muted)' }}>All-time offers made &amp; received across every month</div>
              </div>

              {histLoad ? <Loader/> : history.length === 0 ? (
                <div className="card" style={{ padding:48, textAlign:'center', color:'var(--dim)', fontSize:13 }}>
                  No offer history yet — offers you make or receive will appear here.
                </div>
              ) : (
                <>
                  {/* Lifetime summary */}
                  {(()=>{
                    const allItems = history.flatMap(g => g.items)
                    const made     = allItems.filter(t => t.type==='offer_made')
                    const recvd    = allItems.filter(t => t.type==='offer_received')
                    const vol = [...made,...recvd].reduce((a,t)=>{ const n=parseFloat(String(t.price||'').replace(/[^0-9.]/g,'')); return a+(isNaN(n)?0:n) },0)
                    const comm = allItems.reduce((a,t)=>{ const n=parseFloat(String(t.commission||'').replace(/[^0-9.]/g,'')); return a+(isNaN(n)?0:n) },0)
                    return (
                      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(120px,1fr))', gap:10, marginBottom:24 }}>
                        {[
                          {l:'Offers Made',   v:made.length,                c:'#0ea5e9'},
                          {l:"Offers Rec'd",  v:recvd.length,               c:'#8b5cf6'},
                          {l:'Total Volume',  v:vol>0?fmtMoney(vol):'—',    c:'var(--gold2)'},
                          {l:'Est. Comm.',    v:comm>0?fmtMoney(comm):'—',  c:'var(--green)'},
                        ].map((s,i) => (
                          <div key={i} className="card-inset" style={{ padding:'12px 14px', textAlign:'center' }}>
                            <div className="label" style={{ marginBottom:4 }}>{s.l}</div>
                            <div className="serif" style={{ fontSize:22, color:s.c, fontWeight:700 }}>{s.v}</div>
                          </div>
                        ))}
                      </div>
                    )
                  })()}

                  {/* Timeline grouped by month */}
                  <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                    {history.map(group => {
                      const [y, m] = group.mk.split('-')
                      const mName  = MONTHS[parseInt(m)-1]
                      const label  = mName ? `${mName} '${(y||'').slice(2)}` : group.mk
                      const madeCount = group.items.filter(t => t.type==='offer_made').length
                      const rcvdCount = group.items.filter(t => t.type==='offer_received').length
                      return (
                        <div key={group.mk} className="card" style={{ padding:20 }}>
                          {/* Month header */}
                          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14, flexWrap:'wrap' }}>
                            <div className="serif" style={{ fontSize:17, color:'var(--text)', fontWeight:600 }}>{label}</div>
                            {madeCount > 0 && (
                              <span style={{ fontSize:10, padding:'2px 9px', borderRadius:20, fontWeight:700,
                                background:'rgba(14,165,233,.1)', color:'#0ea5e9', border:'1px solid rgba(14,165,233,.25)',
                                fontFamily:"'JetBrains Mono',monospace" }}>
                                📤 {madeCount} MADE
                              </span>
                            )}
                            {rcvdCount > 0 && (
                              <span style={{ fontSize:10, padding:'2px 9px', borderRadius:20, fontWeight:700,
                                background:'rgba(139,92,246,.1)', color:'#8b5cf6', border:'1px solid rgba(139,92,246,.25)',
                                fontFamily:"'JetBrains Mono',monospace" }}>
                                📥 {rcvdCount} RECEIVED
                              </span>
                            )}
                          </div>

                          {/* Entries */}
                          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                            {group.items.map(t => {
                              const isMade = t.type === 'offer_made'
                              const color  = isMade ? '#0ea5e9' : '#8b5cf6'
                              const bg     = isMade ? 'rgba(14,165,233,.06)' : 'rgba(139,92,246,.06)'
                              const border = isMade ? 'rgba(14,165,233,.18)' : 'rgba(139,92,246,.18)'
                              return (
                                <div key={t.id} style={{
                                  display:'grid',
                                  gridTemplateColumns:'auto 1fr auto auto',
                                  gap:10, alignItems:'center',
                                  padding:'10px 14px', borderRadius:9, background:bg, border:`1px solid ${border}`,
                                }}>
                                  <div style={{ fontSize:16 }}>{isMade ? '📤' : '📥'}</div>
                                  <div style={{ minWidth:0 }}>
                                    <div style={{ fontSize:13, fontWeight:600, color:'var(--text)',
                                      overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                                      {t.address || 'No address'}
                                    </div>
                                    <div style={{ fontSize:10, color:color, fontFamily:"'JetBrains Mono',monospace",
                                      fontWeight:700, marginTop:2, letterSpacing:.4 }}>
                                      {isMade ? 'OFFER MADE' : 'OFFER RECEIVED'}
                                    </div>
                                  </div>
                                  {t.price ? (
                                    <div style={{ fontSize:12, fontWeight:700, color:'var(--gold2)',
                                      fontFamily:"'JetBrains Mono',monospace", whiteSpace:'nowrap' }}>
                                      {t.price}
                                    </div>
                                  ) : <div/>}
                                  {t.commission ? (
                                    <div style={{ fontSize:12, fontWeight:700, color:'var(--green)',
                                      fontFamily:"'JetBrains Mono',monospace", whiteSpace:'nowrap' }}>
                                      {t.commission}
                                    </div>
                                  ) : <div/>}
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── Closed History tab ── */}
          {activeTab==='closed-history' && (
            <div>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:20, flexWrap:'wrap' }}>
                <div className="serif" style={{ fontSize:18, color:'var(--text)' }}>Closed Deals</div>
                <div style={{ fontSize:13, color:'var(--muted)' }}>All-time closed transactions across every month</div>
              </div>

              {closedHistLoad ? <Loader/> : closedHistory.length === 0 ? (
                <div className="card" style={{ padding:48, textAlign:'center', color:'var(--dim)', fontSize:13 }}>
                  No closed deals yet — deals you close will appear here.
                </div>
              ) : (
                <>
                  {/* Lifetime summary */}
                  {(()=>{
                    const allItems = closedHistory.flatMap(g => g.items)
                    const sellers  = allItems.filter(t => t.deal_side==='seller' || t.closed_from==='Listing')
                    const buyers   = allItems.filter(t => t.deal_side==='buyer' || (t.deal_side!=='seller' && t.closed_from!=='Listing'))
                    const vol = allItems.reduce((a,t)=>{ const n=parseFloat(String(t.price||'').replace(/[^0-9.]/g,'')); return a+(isNaN(n)?0:n) },0)
                    const comm = allItems.reduce((a,t)=>{ const n=parseFloat(String(t.commission||'').replace(/[^0-9.]/g,'')); return a+(isNaN(n)?0:n) },0)
                    return (
                      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(110px,1fr))', gap:10, marginBottom:24 }}>
                        {[
                          {l:'Deals Closed', v:allItems.length,              c:'#10b981'},
                          {l:'Seller Side',  v:sellers.length,               c:'#8b5cf6'},
                          {l:'Buyer Side',   v:buyers.length,                c:'#0ea5e9'},
                          {l:'Total Volume', v:vol>0?fmtMoney(vol):'—',      c:'var(--gold2)'},
                          {l:'Total Comm.',  v:comm>0?fmtMoney(comm):'—',    c:'var(--green)'},
                        ].map((s,i) => (
                          <div key={i} className="card-inset" style={{ padding:'12px 14px', textAlign:'center' }}>
                            <div className="label" style={{ marginBottom:4 }}>{s.l}</div>
                            <div className="serif" style={{ fontSize:22, color:s.c, fontWeight:700 }}>{s.v}</div>
                          </div>
                        ))}
                      </div>
                    )
                  })()}

                  {/* Timeline grouped by month */}
                  <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                    {closedHistory.map(group => {
                      const [y, m] = group.mk.split('-')
                      const mName  = MONTHS[parseInt(m)-1]
                      const label  = mName ? `${mName} '${(y||'').slice(2)}` : group.mk
                      const sellerCount = group.items.filter(t => t.deal_side==='seller' || t.closed_from==='Listing').length
                      const buyerCount = group.items.length - sellerCount
                      return (
                        <div key={group.mk} className="card" style={{ padding:20 }}>
                          {/* Month header */}
                          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14, flexWrap:'wrap' }}>
                            <div className="serif" style={{ fontSize:17, color:'var(--text)', fontWeight:600 }}>{label}</div>
                            {sellerCount > 0 && (
                              <span style={{ fontSize:10, padding:'2px 9px', borderRadius:20, fontWeight:700,
                                background:'rgba(139,92,246,.1)', color:'#8b5cf6', border:'1px solid rgba(139,92,246,.25)',
                                fontFamily:"'JetBrains Mono',monospace" }}>
                                🏡 {sellerCount} SELLER
                              </span>
                            )}
                            {buyerCount > 0 && (
                              <span style={{ fontSize:10, padding:'2px 9px', borderRadius:20, fontWeight:700,
                                background:'rgba(14,165,233,.1)', color:'#0ea5e9', border:'1px solid rgba(14,165,233,.25)',
                                fontFamily:"'JetBrains Mono',monospace" }}>
                                🤝 {buyerCount} BUYER
                              </span>
                            )}
                          </div>

                          {/* Entries */}
                          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                            {group.items.map(t => {
                              const isSeller = t.deal_side === 'seller' || t.closed_from === 'Listing'
                              const color  = isSeller ? '#8b5cf6' : '#0ea5e9'
                              const bg     = isSeller ? 'rgba(139,92,246,.06)' : 'rgba(14,165,233,.06)'
                              const border = isSeller ? 'rgba(139,92,246,.18)' : 'rgba(14,165,233,.18)'
                              return (
                                <div key={t.id} style={{
                                  display:'grid',
                                  gridTemplateColumns:'auto 1fr auto auto',
                                  gap:10, alignItems:'center',
                                  padding:'10px 14px', borderRadius:9, background:bg, border:`1px solid ${border}`,
                                }}>
                                  <div style={{ fontSize:16 }}>{isSeller ? '🏡' : '🤝'}</div>
                                  <div style={{ minWidth:0 }}>
                                    <div style={{ fontSize:13, fontWeight:600, color:'var(--text)',
                                      overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                                      {t.address || 'No address'}
                                    </div>
                                    <div style={{ fontSize:10, color:color, fontFamily:"'JetBrains Mono',monospace",
                                      fontWeight:700, marginTop:2, letterSpacing:.4 }}>
                                      {isSeller ? 'SELLER' : 'BUYER'}
                                    </div>
                                  </div>
                                  {t.price ? (
                                    <div style={{ fontSize:12, fontWeight:700, color:'var(--gold2)',
                                      fontFamily:"'JetBrains Mono',monospace", whiteSpace:'nowrap' }}>
                                      {t.price}
                                    </div>
                                  ) : <div/>}
                                  {t.commission ? (
                                    <div style={{ fontSize:12, fontWeight:700, color:'var(--green)',
                                      fontFamily:"'JetBrains Mono',monospace", whiteSpace:'nowrap' }}>
                                      {t.commission}
                                    </div>
                                  ) : <div/>}
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── Settings tab ── */}
          {activeTab==='settings' && (
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

              {/* Account info */}
              <div className="card" style={{ padding:24 }}>
                <div className="serif" style={{ fontSize:18, color:'var(--text)', marginBottom:14 }}>Account</div>
                <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                  {[
                    {l:'Email', v:user?.email},
                    {l:'Member since', v:user?.created_at?new Date(user.created_at).toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'}):'—'},
                    ...(habitPrefs?.xp_enabled !== false ? [
                      {l:'Rank', v:`${rank.icon} ${rank.name}`},
                      {l:'Total XP', v:(profile?.xp||0).toLocaleString()},
                    ] : []),
                  ].map((row,i)=>(
                    <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
                      padding:'10px 14px', borderRadius:8, background:'var(--bg2)', border:'1px solid var(--b1)' }}>
                      <span className="label">{row.l}</span>
                      <span style={{ fontSize:13, fontWeight:500, color:'var(--text)', fontFamily:"'JetBrains Mono',monospace" }}>{row.v}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* XP Toggle — solo agents only (team members get this from team settings) */}
              {!profile?.team_id && (
                <div className="card" style={{ padding:24 }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
                    <div>
                      <div style={{ fontSize:14, fontWeight:600, color:'var(--text)', marginBottom:4 }}>⚡ XP &amp; Streaks</div>
                      <div style={{ fontSize:12, color:'var(--muted)', lineHeight:1.5 }}>
                        {(habitPrefs?.xp_enabled !== false)
                          ? 'XP points and streaks are visible on your dashboard.'
                          : 'XP points and streaks are hidden.'}
                      </div>
                    </div>
                    <button onClick={async ()=>{
                      const current = habitPrefs?.xp_enabled !== false
                      const newPrefs = { ...habitPrefs, xp_enabled: !current }
                      try {
                        const { error } = await supabase.from('profiles').update({ habit_prefs: newPrefs }).eq('id', user.id)
                        if (!error) setHabitPrefs(newPrefs)
                      } catch(e){ console.error('xp toggle error:', e) }
                    }} style={{
                      width:42, height:24, borderRadius:12, cursor:'pointer', border:'none',
                      position:'relative', flexShrink:0, transition:'background .2s',
                      background: (habitPrefs?.xp_enabled !== false) ? '#10b981' : 'var(--b2)',
                    }}>
                      <div style={{
                        width:18, height:18, borderRadius:9,
                        background:'#fff', position:'absolute', top:3,
                        transition:'left .2s',
                        left: (habitPrefs?.xp_enabled !== false) ? 21 : 3,
                      }}/>
                    </button>
                  </div>
                </div>
              )}

              {/* Tools Directory — solo agents only (team members get this from team settings) */}
              {!profile?.team_id && (
                <div className="card" style={{ padding: 24 }}>
                  <div className="serif" style={{ fontSize: 18, color: 'var(--text)', marginBottom: 8 }}>🔗 Tools Directory</div>
                  <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16, lineHeight: 1.6 }}>
                    Choose which real estate tools appear in your Tools page.
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {ALL_APPS.map(app => {
                      const enabledTools = habitPrefs?.enabled_tools
                      const defaultIds = ['fub','redx','skyslope','rmls','gdrive','gmail','zillow','rpr','ylopo']
                      const isEnabled = enabledTools ? enabledTools.includes(app.id) : defaultIds.includes(app.id)
                      return (
                        <div key={app.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', borderRadius: 8, background: 'var(--bg2)', border: '1px solid var(--b1)' }}>
                          <span style={{ fontSize: 18, flexShrink: 0 }}>{app.icon}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{app.name}</div>
                            <div style={{ fontSize: 10, color: 'var(--muted)' }}>{app.category}</div>
                          </div>
                          <button
                            onClick={async () => {
                              const current = habitPrefs?.enabled_tools || defaultIds
                              const updated = isEnabled
                                ? current.filter(id => id !== app.id)
                                : [...current, app.id]
                              const newPrefs = { ...habitPrefs, enabled_tools: updated }
                              try {
                                const { error: err } = await supabase.from('profiles').update({ habit_prefs: newPrefs }).eq('id', user.id)
                                if (err) throw err
                                setHabitPrefs(newPrefs)
                              } catch (err) {
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
                      )
                    })}
                  </div>
                </div>
              )}

            </div>
          )}

          <div style={{ height:32 }}/>
          <div style={{ textAlign:'center', fontSize:10, color:'var(--dim)', fontFamily:"'JetBrains Mono',monospace", letterSpacing:2, paddingBottom:24 }}>
            REALTYGRIND — YOUR CAREER, YOUR DATA
          </div>
        </div>

        {/* Avatar crop modal */}
        {cropFile && cropImgSrc && (
          <AvatarCropModal src={cropImgSrc} onConfirm={uploadCroppedAvatar} onCancel={cancelCrop}/>
        )}
    </>
  )
}
