import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

const RANKS = [
  { name: 'Rookie Agent',  min: 0,    color: '#94a3b8', icon: '🏅' },
  { name: 'Associate',     min: 500,  color: '#16a34a', icon: '🥈' },
  { name: 'Senior Agent',  min: 1500, color: '#ca8a04', icon: '🥇' },
  { name: 'Top Producer',  min: 3000, color: '#ea580c', icon: '🏆' },
  { name: 'Elite Broker',  min: 6000, color: '#7c3aed', icon: '💎' },
]
function getRank(xp) { return [...RANKS].reverse().find(r => xp >= r.min) || RANKS[0] }

const MONTH_YEAR = new Date().toISOString().slice(0, 7)

const HABITS = [
  { id: 'prospecting',  label: 'Prospecting Calls',    icon: '📞', xp: 50 },
  { id: 'followup',     label: 'Follow-Up Emails',      icon: '✉️', xp: 30 },
  { id: 'appointments', label: 'Booked Appointments',   icon: '📅', xp: 55 },
  { id: 'listings',     label: 'New Listing Review',    icon: '🏠', xp: 40 },
  { id: 'social',       label: 'Social Media Post',     icon: '📱', xp: 20 },
  { id: 'crm',          label: 'Update CRM',            icon: '💾', xp: 25 },
  { id: 'showing',      label: 'Property Showing',      icon: '🔑', xp: 60 },
  { id: 'market',       label: 'Market Analysis',       icon: '📊', xp: 35 },
  { id: 'networking',   label: 'Network/Referral',      icon: '🤝', xp: 45 },
  { id: 'training',     label: 'Training/Learning',     icon: '📚', xp: 20 },
  { id: 'review',       label: 'Client Review Request', icon: '⭐', xp: 40 },
]

function StatBadge({ label, value, color, bg, border }) {
  return (
    <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 10, padding: '10px 14px', textAlign: 'center' }}>
      <div style={{ fontSize: 9, color: '#94a3b8', letterSpacing: 1, marginBottom: 3 }}>{label}</div>
      <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 20, color }}>{value}</div>
    </div>
  )
}

function MemberDetailModal({ member, onClose }) {
  const [habits, setHabits] = useState({})
  const [transactions, setTransactions] = useState([])
  const [listings, setListings] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadMemberData()
  }, [member])

  async function loadMemberData() {
    setLoading(true)

    // Load habit completions
    const { data: completions } = await supabase
      .from('habit_completions')
      .select('*')
      .eq('user_id', member.id)
      .eq('month_year', MONTH_YEAR)

    const habitSummary = {}
    HABITS.forEach(h => { habitSummary[h.id] = 0 })
    let totalAppts = 0
    if (completions) {
      completions.forEach(c => {
        if (habitSummary[c.habit_id] !== undefined) habitSummary[c.habit_id]++
        if (c.habit_id === 'appointments' && c.counter_value > 0) totalAppts += c.counter_value
      })
    }
    habitSummary._totalAppts = totalAppts
    setHabits(habitSummary)

    // Load transactions
    const { data: txData } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', member.id)
      .eq('month_year', MONTH_YEAR)
      .order('created_at', { ascending: false })
    setTransactions(txData || [])

    // Load listings
    const { data: listData } = await supabase
      .from('listings')
      .select('*')
      .eq('user_id', member.id)
      .eq('month_year', MONTH_YEAR)
    setListings(listData || [])

    setLoading(false)
  }

  const rank = getRank(member.xp || 0)
  const txByType = {
    offer_made:     transactions.filter(t => t.type === 'offer_made'),
    offer_received: transactions.filter(t => t.type === 'offer_received'),
    pending:        transactions.filter(t => t.type === 'pending'),
    closed:         transactions.filter(t => t.type === 'closed'),
  }
  const closedValue = txByType.closed.reduce((acc, t) => {
    const n = parseFloat(String(t.price || '').replace(/[^0-9.]/g, ''))
    return acc + (isNaN(n) ? 0 : n)
  }, 0)

  const totalDays = Object.entries(habits)
    .filter(([k]) => k !== '_totalAppts')
    .reduce((acc, [, v]) => acc + v, 0)

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'white', borderRadius: 20, width: '100%', maxWidth: 680, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 24px 80px rgba(0,0,0,0.25)' }}>

        {/* Modal Header */}
        <div style={{ background: rank.color + '15', borderBottom: `2px solid ${rank.color}33`, padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderRadius: '20px 20px 0 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 52, height: 52, borderRadius: '50%', background: rank.color + '22', border: `3px solid ${rank.color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>
              {rank.icon}
            </div>
            <div>
              <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 20, color: '#1e293b' }}>{member.full_name || member.email}</div>
              <div style={{ fontSize: 11, color: rank.color, fontWeight: 700 }}>{rank.icon} {rank.name} · {(member.xp || 0).toLocaleString()} XP</div>
              <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 1 }}>{member.email}</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 10, padding: '8px 14px', cursor: 'pointer', fontSize: 13, fontFamily: "'Syne',sans-serif", fontWeight: 700, color: '#64748b' }}>✕ Close</button>
        </div>

        <div style={{ padding: '20px 24px', fontFamily: "'DM Mono',monospace" }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Loading member data...</div>
          ) : (
            <>
              {/* Key Stats */}
              <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 11, color: '#94a3b8', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 10 }}>
                📊 {MONTH_YEAR} Overview
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(110px,1fr))', gap: 10, marginBottom: 22 }}>
                <StatBadge label="STREAK"         value={`🔥 ${member.streak || 0}`}        color="#ea580c" bg="#fff7ed" border="#fdba74" />
                <StatBadge label="TOTAL XP"       value={(member.xp||0).toLocaleString()}    color={rank.color} bg={rank.color+'15'} border={rank.color+'44'} />
                <StatBadge label="HABIT DAYS"     value={totalDays}                          color="#15803d" bg="#f0fdf4" border="#86efac" />
                <StatBadge label="APPOINTMENTS"   value={habits._totalAppts || 0}            color="#0369a1" bg="#e0f2fe" border="#7dd3fc" />
                <StatBadge label="PROPERTIES"     value={listings.length}                    color="#0f766e" bg="#f0fdfa" border="#5eead4" />
                <StatBadge label="OFFERS MADE"    value={txByType.offer_made.length}         color="#0369a1" bg="#e0f2fe" border="#7dd3fc" />
                <StatBadge label="OFFERS RECD"    value={txByType.offer_received.length}     color="#7c3aed" bg="#ede9fe" border="#c4b5fd" />
                <StatBadge label="PENDING"        value={txByType.pending.length}            color="#ca8a04" bg="#fef9c3" border="#fde047" />
                <StatBadge label="CLOSED"         value={txByType.closed.length}             color="#15803d" bg="#dcfce7" border="#86efac" />
              </div>

              {/* Closed value if any */}
              {closedValue > 0 && (
                <div style={{ background: '#f0fdf4', border: '1.5px solid #86efac', borderRadius: 12, padding: '12px 16px', marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 13, color: '#15803d' }}>🎉 Total Closed Volume This Month</span>
                  <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 22, color: '#15803d' }}>
                    ${closedValue >= 1000000 ? (closedValue/1000000).toFixed(2)+'M' : closedValue >= 1000 ? (closedValue/1000).toFixed(0)+'K' : closedValue.toFixed(0)}
                  </span>
                </div>
              )}

              {/* Habit Breakdown */}
              <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 11, color: '#94a3b8', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 10 }}>📅 Habit Completions This Month</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 22 }}>
                {HABITS.map(h => {
                  const count = habits[h.id] || 0
                  const pct   = Math.round((count / 28) * 100)
                  const col   = pct >= 70 ? '#16a34a' : pct >= 40 ? '#ca8a04' : pct > 0 ? '#ea580c' : '#cbd5e1'
                  return (
                    <div key={h.id} style={{ background: '#f8fafc', borderRadius: 10, padding: '10px 12px', border: `1px solid ${count > 0 ? col+'44' : '#f1f5f9'}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ fontSize: 11, color: '#334155' }}>{h.icon} {h.label}</span>
                        <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 13, color: col }}>{count}/28</span>
                      </div>
                      <div style={{ height: 5, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ height: '100%', background: col, borderRadius: 3, width: `${pct}%`, transition: 'width 0.4s ease' }} />
                      </div>
                      {h.id === 'appointments' && habits._totalAppts > 0 && (
                        <div style={{ fontSize: 9, color: '#0369a1', marginTop: 4 }}>📅 {habits._totalAppts} total appointments booked</div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Listings */}
              {listings.length > 0 && (
                <>
                  <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 11, color: '#94a3b8', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 10 }}>🏡 Active Listings</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 22 }}>
                    {listings.map((l, i) => (
                      <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f0fdfa', border: '1px solid #5eead4', borderRadius: 10, padding: '10px 14px' }}>
                        <span style={{ fontSize: 12, color: '#334155' }}>{i+1}. {l.address || 'No address'}</span>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                          <span style={{ fontSize: 10, color: '#0f766e', fontWeight: 700 }}>{l.unit_count} unit{l.unit_count !== 1 ? 's' : ''}</span>
                          <span style={{ fontSize: 9, background: l.status==='closed'?'#dcfce7':l.status==='pending'?'#fef9c3':'#f0fdfa', color: l.status==='closed'?'#15803d':l.status==='pending'?'#ca8a04':'#0f766e', border: `1px solid ${l.status==='closed'?'#86efac':l.status==='pending'?'#fde047':'#5eead4'}`, borderRadius: 5, padding: '2px 7px', fontWeight: 700 }}>
                            {l.status==='closed'?'🎉 Closed':l.status==='pending'?'⏳ Pending':'🟢 Active'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* Transactions */}
              {transactions.length > 0 && (
                <>
                  <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 11, color: '#94a3b8', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 10 }}>💼 Transactions</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {transactions.map(t => {
                      const typeInfo = {
                        offer_made:     { label:'Offer Made',     color:'#0369a1', bg:'#e0f2fe', border:'#7dd3fc', icon:'📤' },
                        offer_received: { label:'Offer Received', color:'#7c3aed', bg:'#ede9fe', border:'#c4b5fd', icon:'📥' },
                        pending:        { label:'Went Pending',   color:'#ca8a04', bg:'#fef9c3', border:'#fde047', icon:'⏳' },
                        closed:         { label:'Closed',         color:'#15803d', bg:'#dcfce7', border:'#86efac', icon:'🎉' },
                      }
                      const info = typeInfo[t.type] || typeInfo.offer_made
                      return (
                        <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: info.bg, border: `1px solid ${info.border}`, borderRadius: 10, padding: '10px 14px' }}>
                          <div>
                            <span style={{ fontSize: 9, color: info.color, fontWeight: 700, background: 'white', border: `1px solid ${info.border}`, borderRadius: 4, padding: '2px 7px', marginRight: 8 }}>{info.icon} {info.label}</span>
                            <span style={{ fontSize: 12, color: '#334155' }}>{t.address}</span>
                          </div>
                          {t.price && <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 13, color: info.color }}>{t.price}</span>}
                        </div>
                      )
                    })}
                  </div>
                </>
              )}

              {transactions.length === 0 && listings.length === 0 && (
                <div style={{ textAlign: 'center', padding: '20px 0', color: '#cbd5e1', fontSize: 12 }}>No transactions or listings recorded this month yet.</div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default function TeamsPage({ onBack }) {
  const { user, profile, refreshProfile } = useAuth()
  const [mode, setMode]           = useState('menu')
  const [teamName, setTeamName]   = useState('')

  const [inviteCode, setInviteCode] = useState('')
  const [members, setMembers]     = useState([])
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')
  const [success, setSuccess]     = useState('')
  const [selectedMember, setSelectedMember] = useState(null)
  const [isOwner, setIsOwner]     = useState(false)

  useEffect(() => {
    if (profile?.team_id) {
      setMode('myteam')
      fetchMembers(profile.team_id)
    }
  }, [profile])

  async function fetchMembers(teamId) {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, email, xp, streak')
      .eq('team_id', teamId)
      .order('xp', { ascending: false })
    setMembers(data || [])

    // Check if current user is the team owner
    const { data: teamData } = await supabase
      .from('teams')
      .select('created_by')
      .eq('id', teamId)
      .single()
    if (teamData) setIsOwner(teamData.created_by === user.id)
  }

  async function createTeam() {
    if (!teamName.trim()) return
    setLoading(true); setError('')
    try {
      const { data: team, error: e } = await supabase
        .from('teams')
        .insert({ name: teamName.trim(), created_by: user.id, max_members: 999 })
        .select().single()
      if (e) throw e
      await supabase.from('team_members').insert({ team_id: team.id, user_id: user.id, role: 'owner' })
      await supabase.from('profiles').update({ team_id: team.id }).eq('id', user.id)
      await refreshProfile()
      setSuccess(`Team "${teamName}" created! Invite code: ${team.invite_code}`)
      setMode('myteam')
      fetchMembers(team.id)
    } catch (e) { setError(e.message) }
    setLoading(false)
  }

  async function joinTeam() {
    if (!inviteCode.trim()) return
    setLoading(true); setError('')
    try {
      const { data: team, error: e } = await supabase
        .from('teams').select('*')
        .eq('invite_code', inviteCode.trim().toUpperCase()).single()
      if (e || !team) throw new Error('Team not found. Check your invite code.')
      await supabase.from('team_members').insert({ team_id: team.id, user_id: user.id, role: 'member' })
      await supabase.from('profiles').update({ team_id: team.id }).eq('id', user.id)
      await refreshProfile()
      setSuccess(`You joined "${team.name}"!`)
      setMode('myteam')
      fetchMembers(team.id)
    } catch (e) { setError(e.message) }
    setLoading(false)
  }

  async function leaveTeam() {
    if (!confirm('Are you sure you want to leave your team?')) return
    setLoading(true)
    await supabase.from('team_members').delete().eq('user_id', user.id)
    await supabase.from('profiles').update({ team_id: null }).eq('id', user.id)
    await refreshProfile()
    setMode('menu'); setMembers([]); setLoading(false)
  }

  return (
    <div style={{ minHeight:'100vh', background:'linear-gradient(135deg,#f0f9ff,#f0fdf4,#fefce8)', fontFamily:"'DM Mono',monospace" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Mono:wght@400;500&display=swap');`}</style>

      {selectedMember && <MemberDetailModal member={selectedMember} onClose={() => setSelectedMember(null)} />}

      <div style={{ background:'white', borderBottom:'1px solid #e2e8f0', padding:'14px 24px', display:'flex', alignItems:'center', gap:16, boxShadow:'0 1px 8px rgba(0,0,0,0.06)' }}>
        <button onClick={onBack} style={{ background:'#f1f5f9', border:'1px solid #e2e8f0', borderRadius:8, padding:'6px 14px', cursor:'pointer', fontSize:12, color:'#64748b', fontFamily:"'Syne',sans-serif", fontWeight:700 }}>← Back</button>
        <div style={{ fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:20, color:'#1e293b' }}>👥 Teams</div>
        {isOwner && mode === 'myteam' && (
          <div style={{ background:'#fef9c3', border:'1px solid #fde047', borderRadius:8, padding:'4px 12px', fontSize:10, color:'#ca8a04', fontWeight:700 }}>👑 TEAM OWNER</div>
        )}
      </div>

      <div style={{ maxWidth:680, margin:'0 auto', padding:'24px 16px' }}>
        {error   && <div style={{ background:'#fef2f2', border:'1px solid #fecaca', borderRadius:10, padding:'12px 16px', fontSize:12, color:'#dc2626', marginBottom:16 }}>{error}</div>}
        {success && <div style={{ background:'#f0fdf4', border:'1px solid #86efac', borderRadius:10, padding:'12px 16px', fontSize:12, color:'#16a34a', marginBottom:16 }}>{success}</div>}

        {/* MY TEAM */}
        {mode === 'myteam' && profile?.teams && (
          <div>
            {/* Invite code card */}
            <div style={{ background:'white', border:'1px solid #e2e8f0', borderRadius:16, padding:22, marginBottom:16, boxShadow:'0 1px 6px rgba(0,0,0,0.05)' }}>
              <div style={{ fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:18, color:'#1e293b', marginBottom:4 }}>👥 {profile.teams.name}</div>
              <div style={{ fontSize:11, color:'#94a3b8', marginBottom:14 }}>Share this invite code with teammates:</div>
              <div style={{ background:'#f0fdf4', border:'2px dashed #86efac', borderRadius:12, padding:'14px 20px', textAlign:'center' }}>
                <div style={{ fontSize:10, color:'#94a3b8', letterSpacing:2, marginBottom:4 }}>INVITE CODE</div>
                <div style={{ fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:32, color:'#16a34a', letterSpacing:8 }}>{profile.teams.invite_code}</div>
              </div>
            </div>

            {/* Members list */}
            <div style={{ background:'white', border:'1px solid #e2e8f0', borderRadius:16, padding:22, boxShadow:'0 1px 6px rgba(0,0,0,0.05)' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
                <div style={{ fontFamily:"'Syne',sans-serif", fontWeight:700, fontSize:13, color:'#64748b', letterSpacing:1, textTransform:'uppercase' }}>Team Members ({members.length})</div>
                {isOwner && <div style={{ fontSize:10, color:'#94a3b8' }}>Click any member to see full details</div>}
              </div>

              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {members.map((m, i) => {
                  const rank  = getRank(m.xp || 0)
                  const isMe  = m.id === user.id
                  return (
                    <div key={m.id}
                      onClick={() => isOwner && !isMe && setSelectedMember(m)}
                      style={{ display:'flex', alignItems:'center', gap:12, background:isMe?'#f0fdf4':'#f8fafc', border:`1px solid ${isMe?'#86efac':'#e2e8f0'}`, borderRadius:12, padding:'12px 16px', cursor:isOwner&&!isMe?'pointer':'default', transition:'all 0.15s', boxShadow: isOwner&&!isMe?'none':'none' }}
                      onMouseEnter={e => { if(isOwner&&!isMe) e.currentTarget.style.boxShadow='0 4px 16px rgba(0,0,0,0.10)' }}
                      onMouseLeave={e => { e.currentTarget.style.boxShadow='none' }}>

                      <div style={{ width:36, height:36, borderRadius:'50%', background:rank.color+'22', border:`2px solid ${rank.color}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, flexShrink:0 }}>{rank.icon}</div>

                      <div style={{ flex:1 }}>
                        <div style={{ fontFamily:"'Syne',sans-serif", fontWeight:700, fontSize:14, color:'#1e293b', display:'flex', alignItems:'center', gap:8 }}>
                          {m.full_name || m.email}
                          {isMe && <span style={{ fontSize:9, background:'#dcfce7', color:'#16a34a', borderRadius:4, padding:'1px 6px' }}>YOU</span>}
                          {m.id === profile?.teams?.created_by && <span style={{ fontSize:9, background:'#fef9c3', color:'#ca8a04', borderRadius:4, padding:'1px 6px' }}>👑 OWNER</span>}
                        </div>
                        <div style={{ fontSize:10, color:'#94a3b8' }}>{rank.icon} {rank.name}</div>
                      </div>

                      <div style={{ textAlign:'right' }}>
                        <div style={{ fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:16, color:rank.color }}>{(m.xp||0).toLocaleString()} XP</div>
                        <div style={{ fontSize:10, color:'#ea580c' }}>🔥 {m.streak||0} days</div>
                      </div>

                      <div style={{ fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:18, color:'#94a3b8', width:28, textAlign:'center' }}>#{i+1}</div>

                      {isOwner && !isMe && (
                        <div style={{ fontSize:18, color:'#94a3b8' }}>›</div>
                      )}
                    </div>
                  )
                })}
              </div>

              {isOwner && (
                <div style={{ marginTop:14, background:'#f0f9ff', border:'1px solid #7dd3fc', borderRadius:10, padding:'10px 14px', fontSize:11, color:'#0369a1' }}>
                  👑 As team owner, click any member's row to see their full habit, listing, and transaction details for this month.
                </div>
              )}

              <button onClick={leaveTeam} disabled={loading} style={{ marginTop:18, background:'#fef2f2', border:'1px solid #fecaca', color:'#dc2626', borderRadius:10, padding:'10px 20px', cursor:'pointer', fontSize:12, fontFamily:"'Syne',sans-serif", fontWeight:700 }}>
                Leave Team
              </button>
            </div>
          </div>
        )}

        {/* MENU */}
        {mode === 'menu' && (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <button onClick={()=>setMode('create')} style={{ background:'white', border:'1.5px solid #e2e8f0', borderRadius:16, padding:'28px 20px', cursor:'pointer', textAlign:'center', boxShadow:'0 1px 6px rgba(0,0,0,0.05)' }}>
              <div style={{ fontSize:36, marginBottom:10 }}>🏗️</div>
              <div style={{ fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:15, color:'#1e293b', marginBottom:6 }}>Create a Team</div>
              <div style={{ fontSize:11, color:'#94a3b8' }}>Start a new team and invite your agents</div>
            </button>
            <button onClick={()=>setMode('join')} style={{ background:'white', border:'1.5px solid #e2e8f0', borderRadius:16, padding:'28px 20px', cursor:'pointer', textAlign:'center', boxShadow:'0 1px 6px rgba(0,0,0,0.05)' }}>
              <div style={{ fontSize:36, marginBottom:10 }}>🔗</div>
              <div style={{ fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:15, color:'#1e293b', marginBottom:6 }}>Join a Team</div>
              <div style={{ fontSize:11, color:'#94a3b8' }}>Enter an invite code from your team lead</div>
            </button>
          </div>
        )}

        {/* CREATE */}
        {mode === 'create' && (
          <div style={{ background:'white', border:'1px solid #e2e8f0', borderRadius:16, padding:28, boxShadow:'0 1px 6px rgba(0,0,0,0.05)' }}>
            <div style={{ fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:18, color:'#1e293b', marginBottom:20 }}>🏗️ Create a Team</div>
            <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
              <div>
                <label style={{ fontSize:11, color:'#64748b', fontWeight:600, letterSpacing:0.5, display:'block', marginBottom:6 }}>TEAM NAME</label>
                <input value={teamName} onChange={e=>setTeamName(e.target.value)} placeholder="e.g. The A-Team..."
                  style={{ width:'100%', border:'1.5px solid #e2e8f0', borderRadius:10, padding:'10px 14px', fontSize:13, fontFamily:"'DM Mono',monospace", color:'#1e293b', boxSizing:'border-box' }} />
              </div>
              <div style={{ display:'flex', gap:10 }}>
                <button onClick={()=>setMode('menu')} style={{ flex:1, background:'#f1f5f9', border:'1px solid #e2e8f0', borderRadius:10, padding:'11px 0', cursor:'pointer', fontSize:13, fontFamily:"'Syne',sans-serif", fontWeight:700, color:'#64748b' }}>Cancel</button>
                <button onClick={createTeam} disabled={loading||!teamName.trim()} style={{ flex:2, background:'#16a34a', color:'white', border:'none', borderRadius:10, padding:'11px 0', cursor:'pointer', fontSize:13, fontFamily:"'Syne',sans-serif", fontWeight:700 }}>
                  {loading ? 'Creating...' : 'Create Team'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* JOIN */}
        {mode === 'join' && (
          <div style={{ background:'white', border:'1px solid #e2e8f0', borderRadius:16, padding:28, boxShadow:'0 1px 6px rgba(0,0,0,0.05)' }}>
            <div style={{ fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:18, color:'#1e293b', marginBottom:20 }}>🔗 Join a Team</div>
            <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
              <div>
                <label style={{ fontSize:11, color:'#64748b', fontWeight:600, letterSpacing:0.5, display:'block', marginBottom:6 }}>INVITE CODE</label>
                <input value={inviteCode} onChange={e=>setInviteCode(e.target.value.toUpperCase())} placeholder="e.g. AB12CD" maxLength={6}
                  style={{ width:'100%', border:'1.5px solid #e2e8f0', borderRadius:10, padding:'10px 14px', fontSize:22, fontFamily:"'Syne',sans-serif", fontWeight:800, color:'#16a34a', textAlign:'center', letterSpacing:6, boxSizing:'border-box' }} />
              </div>
              <div style={{ display:'flex', gap:10 }}>
                <button onClick={()=>setMode('menu')} style={{ flex:1, background:'#f1f5f9', border:'1px solid #e2e8f0', borderRadius:10, padding:'11px 0', cursor:'pointer', fontSize:13, fontFamily:"'Syne',sans-serif", fontWeight:700, color:'#64748b' }}>Cancel</button>
                <button onClick={joinTeam} disabled={loading||inviteCode.length<6} style={{ flex:2, background:'#16a34a', color:'white', border:'none', borderRadius:10, padding:'11px 0', cursor:'pointer', fontSize:13, fontFamily:"'Syne',sans-serif", fontWeight:700 }}>
                  {loading ? 'Joining...' : 'Join Team'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
