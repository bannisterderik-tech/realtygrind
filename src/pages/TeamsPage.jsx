import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

export default function TeamsPage({ onBack }) {
  const { user, profile, refreshProfile } = useAuth()
  const [mode, setMode] = useState('menu') // menu | create | join | myteam
  const [teamName, setTeamName] = useState('')
  const [maxMembers, setMaxMembers] = useState(4)
  const [inviteCode, setInviteCode] = useState('')
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

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
  }

  async function createTeam() {
    if (!teamName.trim()) return
    setLoading(true); setError('')
    try {
      // Create team
      const { data: team, error: teamErr } = await supabase
        .from('teams')
        .insert({ name: teamName.trim(), created_by: user.id, max_members: maxMembers })
        .select().single()
      if (teamErr) throw teamErr

      // Add owner to team_members
      await supabase.from('team_members').insert({ team_id: team.id, user_id: user.id, role: 'owner' })

      // Update profile with team_id
      await supabase.from('profiles').update({ team_id: team.id }).eq('id', user.id)

      await refreshProfile()
      setSuccess(`Team "${teamName}" created! Your invite code is: ${team.invite_code}`)
      setMode('myteam')
      fetchMembers(team.id)
    } catch (e) {
      setError(e.message)
    }
    setLoading(false)
  }

  async function joinTeam() {
    if (!inviteCode.trim()) return
    setLoading(true); setError('')
    try {
      // Find team by invite code
      const { data: team, error: findErr } = await supabase
        .from('teams')
        .select('*')
        .eq('invite_code', inviteCode.trim().toUpperCase())
        .single()
      if (findErr || !team) throw new Error('Team not found. Check your invite code.')

      // Check member count
      const { count } = await supabase
        .from('team_members')
        .select('*', { count: 'exact', head: true })
        .eq('team_id', team.id)
      if (count >= team.max_members) throw new Error(`This team is full (max ${team.max_members} members).`)

      // Join team
      await supabase.from('team_members').insert({ team_id: team.id, user_id: user.id, role: 'member' })
      await supabase.from('profiles').update({ team_id: team.id }).eq('id', user.id)

      await refreshProfile()
      setSuccess(`You joined "${team.name}"!`)
      setMode('myteam')
      fetchMembers(team.id)
    } catch (e) {
      setError(e.message)
    }
    setLoading(false)
  }

  async function leaveTeam() {
    if (!confirm('Are you sure you want to leave your team?')) return
    setLoading(true)
    await supabase.from('team_members').delete().eq('user_id', user.id)
    await supabase.from('profiles').update({ team_id: null }).eq('id', user.id)
    await refreshProfile()
    setMode('menu')
    setMembers([])
    setLoading(false)
  }

  const RANKS = [
    { name: 'Rookie', min: 0, color: '#94a3b8', icon: '🏅' },
    { name: 'Associate', min: 500, color: '#16a34a', icon: '🥈' },
    { name: 'Senior', min: 1500, color: '#ca8a04', icon: '🥇' },
    { name: 'Top Producer', min: 3000, color: '#ea580c', icon: '🏆' },
    { name: 'Elite Broker', min: 6000, color: '#7c3aed', icon: '💎' },
  ]
  function getRank(xp) { return [...RANKS].reverse().find(r => xp >= r.min) || RANKS[0] }

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#f0f9ff,#f0fdf4,#fefce8)', fontFamily: "'DM Mono',monospace" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Mono:wght@400;500&display=swap');`}</style>

      <div style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 16, boxShadow: '0 1px 8px rgba(0,0,0,0.06)' }}>
        <button onClick={onBack} style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 12, color: '#64748b', fontFamily: "'Syne',sans-serif", fontWeight: 700 }}>← Back</button>
        <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 20, color: '#1e293b' }}>👥 Teams</div>
      </div>

      <div style={{ maxWidth: 600, margin: '0 auto', padding: '24px 16px' }}>
        {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '12px 16px', fontSize: 12, color: '#dc2626', marginBottom: 16 }}>{error}</div>}
        {success && <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 10, padding: '12px 16px', fontSize: 12, color: '#16a34a', marginBottom: 16 }}>{success}</div>}

        {/* MY TEAM VIEW */}
        {mode === 'myteam' && profile?.teams && (
          <div>
            <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 16, padding: 24, marginBottom: 16, boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>
              <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 18, color: '#1e293b', marginBottom: 4 }}>👥 {profile.teams.name}</div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 16 }}>Share this code with teammates to invite them:</div>
              <div style={{ background: '#f0fdf4', border: '2px dashed #86efac', borderRadius: 12, padding: '14px 20px', textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: '#94a3b8', letterSpacing: 2, marginBottom: 4 }}>INVITE CODE</div>
                <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 32, color: '#16a34a', letterSpacing: 8 }}>{profile.teams.invite_code}</div>
              </div>
            </div>

            <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 16, padding: 24, boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>
              <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 13, color: '#64748b', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 14 }}>Team Members ({members.length})</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {members.map((m, i) => {
                  const rank = getRank(m.xp || 0)
                  const isMe = m.id === user.id
                  return (
                    <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 12, background: isMe ? '#f0fdf4' : '#f8fafc', border: `1px solid ${isMe ? '#86efac' : '#e2e8f0'}`, borderRadius: 12, padding: '12px 16px' }}>
                      <div style={{ width: 32, height: 32, borderRadius: '50%', background: rank.color + '22', border: `2px solid ${rank.color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>{rank.icon}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 13, color: '#1e293b' }}>
                          {m.full_name || m.email} {isMe && <span style={{ fontSize: 9, background: '#dcfce7', color: '#16a34a', borderRadius: 4, padding: '1px 6px', marginLeft: 4 }}>YOU</span>}
                        </div>
                        <div style={{ fontSize: 10, color: '#94a3b8' }}>{rank.icon} {rank.name}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 16, color: rank.color }}>{(m.xp || 0).toLocaleString()} XP</div>
                        <div style={{ fontSize: 10, color: '#ea580c' }}>🔥 {m.streak || 0} day streak</div>
                      </div>
                      <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 18, color: '#94a3b8', width: 28, textAlign: 'center' }}>#{i + 1}</div>
                    </div>
                  )
                })}
              </div>

              <button onClick={leaveTeam} disabled={loading} style={{ marginTop: 20, background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: 10, padding: '10px 20px', cursor: 'pointer', fontSize: 12, fontFamily: "'Syne',sans-serif", fontWeight: 700 }}>
                Leave Team
              </button>
            </div>
          </div>
        )}

        {/* MENU - no team yet */}
        {mode === 'menu' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <button onClick={() => setMode('create')} style={{ background: 'white', border: '1.5px solid #e2e8f0', borderRadius: 16, padding: '28px 20px', cursor: 'pointer', textAlign: 'center', boxShadow: '0 1px 6px rgba(0,0,0,0.05)', transition: 'all 0.2s' }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>🏗️</div>
              <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 15, color: '#1e293b', marginBottom: 6 }}>Create a Team</div>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>Start a new team and invite your agents</div>
            </button>
            <button onClick={() => setMode('join')} style={{ background: 'white', border: '1.5px solid #e2e8f0', borderRadius: 16, padding: '28px 20px', cursor: 'pointer', textAlign: 'center', boxShadow: '0 1px 6px rgba(0,0,0,0.05)', transition: 'all 0.2s' }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>🔗</div>
              <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 15, color: '#1e293b', marginBottom: 6 }}>Join a Team</div>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>Enter an invite code from your team lead</div>
            </button>
          </div>
        )}

        {/* CREATE TEAM */}
        {mode === 'create' && (
          <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 16, padding: 28, boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>
            <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 18, color: '#1e293b', marginBottom: 20 }}>🏗️ Create a Team</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ fontSize: 11, color: '#64748b', fontWeight: 600, letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>TEAM NAME</label>
                <input value={teamName} onChange={e => setTeamName(e.target.value)} placeholder="e.g. The A-Team, Dream Team..."
                  style={{ width: '100%', border: '1.5px solid #e2e8f0', borderRadius: 10, padding: '10px 14px', fontSize: 13, fontFamily: "'DM Mono',monospace", color: '#1e293b', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#64748b', fontWeight: 600, letterSpacing: 0.5, display: 'block', marginBottom: 10 }}>TEAM SIZE</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[2, 3, 4].map(n => (
                    <button key={n} onClick={() => setMaxMembers(n)} style={{
                      flex: 1, padding: '12px 0', border: `2px solid ${maxMembers === n ? '#16a34a' : '#e2e8f0'}`,
                      borderRadius: 10, background: maxMembers === n ? '#f0fdf4' : 'white',
                      color: maxMembers === n ? '#16a34a' : '#64748b', fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 18, cursor: 'pointer',
                    }}>
                      {n}
                      <div style={{ fontSize: 9, fontWeight: 400, marginTop: 2 }}>{n === 2 ? 'agents' : n === 3 ? 'agents' : 'agents'}</div>
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setMode('menu')} style={{ flex: 1, background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 10, padding: '11px 0', cursor: 'pointer', fontSize: 13, fontFamily: "'Syne',sans-serif", fontWeight: 700, color: '#64748b' }}>Cancel</button>
                <button onClick={createTeam} disabled={loading || !teamName.trim()} style={{ flex: 2, background: '#16a34a', color: 'white', border: 'none', borderRadius: 10, padding: '11px 0', cursor: 'pointer', fontSize: 13, fontFamily: "'Syne',sans-serif", fontWeight: 700 }}>
                  {loading ? 'Creating...' : 'Create Team'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* JOIN TEAM */}
        {mode === 'join' && (
          <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 16, padding: 28, boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>
            <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 18, color: '#1e293b', marginBottom: 20 }}>🔗 Join a Team</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ fontSize: 11, color: '#64748b', fontWeight: 600, letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>INVITE CODE</label>
                <input value={inviteCode} onChange={e => setInviteCode(e.target.value.toUpperCase())} placeholder="e.g. AB12CD" maxLength={6}
                  style={{ width: '100%', border: '1.5px solid #e2e8f0', borderRadius: 10, padding: '10px 14px', fontSize: 22, fontFamily: "'Syne',sans-serif", fontWeight: 800, color: '#16a34a', textAlign: 'center', letterSpacing: 6, boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setMode('menu')} style={{ flex: 1, background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 10, padding: '11px 0', cursor: 'pointer', fontSize: 13, fontFamily: "'Syne',sans-serif", fontWeight: 700, color: '#64748b' }}>Cancel</button>
                <button onClick={joinTeam} disabled={loading || inviteCode.length < 6} style={{ flex: 2, background: '#16a34a', color: 'white', border: 'none', borderRadius: 10, padding: '11px 0', cursor: 'pointer', fontSize: 13, fontFamily: "'Syne',sans-serif", fontWeight: 700 }}>
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
