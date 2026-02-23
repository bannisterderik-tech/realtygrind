import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

const RANKS = [
  { name: 'Rookie Agent',  min: 0,    color: '#94a3b8', icon: '🏅' },
  { name: 'Associate',     min: 500,  color: '#16a34a', icon: '🥈' },
  { name: 'Senior Agent',  min: 1500, color: '#ca8a04', icon: '🥇' },
  { name: 'Top Producer',  min: 3000, color: '#ea580c', icon: '🏆' },
  { name: 'Elite Broker',  min: 6000, color: '#7c3aed', icon: '💎' },
]
function getRank(xp) {
  return [...RANKS].reverse().find(r => xp >= r.min) || RANKS[0]
}

export default function Leaderboard({ onBack }) {
  const { profile } = useAuth()
  const [global, setGlobal] = useState([])
  const [team, setTeam] = useState([])
  const [tab, setTab] = useState('global')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchLeaderboards()
  }, [])

  async function fetchLeaderboards() {
    setLoading(true)

    // Global leaderboard
    const { data: globalData } = await supabase
      .from('profiles')
      .select('id, full_name, xp, streak, team_id, teams(name)')
      .order('xp', { ascending: false })
      .limit(50)
    setGlobal(globalData || [])

    // Team leaderboard (if user is in a team)
    if (profile?.team_id) {
      const { data: teamData } = await supabase
        .from('profiles')
        .select('id, full_name, xp, streak, team_id')
        .eq('team_id', profile.team_id)
        .order('xp', { ascending: false })
      setTeam(teamData || [])
    }

    setLoading(false)
  }

  const data = tab === 'global' ? global : team
  const medalColors = ['#f59e0b', '#94a3b8', '#cd7c32']

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#f0f9ff,#f0fdf4,#fefce8)', fontFamily: "'DM Mono',monospace" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Mono:wght@400;500&display=swap');`}</style>

      {/* Header */}
      <div style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 16, boxShadow: '0 1px 8px rgba(0,0,0,0.06)' }}>
        <button onClick={onBack} style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 12, color: '#64748b', fontFamily: "'Syne',sans-serif", fontWeight: 700 }}>← Back</button>
        <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 20, color: '#1e293b' }}>🏆 Leaderboard</div>
      </div>

      <div style={{ maxWidth: 700, margin: '0 auto', padding: '24px 16px' }}>
        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {['global', 'team'].map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              background: tab === t ? '#1e293b' : 'white',
              border: `1.5px solid ${tab === t ? '#1e293b' : '#e2e8f0'}`,
              color: tab === t ? 'white' : '#64748b',
              borderRadius: 9, padding: '8px 20px', fontSize: 11, cursor: 'pointer',
              fontFamily: "'Syne',sans-serif", fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1,
            }}>
              {t === 'global' ? '🌎 Global' : '👥 My Team'}
            </button>
          ))}
        </div>

        {tab === 'team' && !profile?.team_id && (
          <div style={{ background: 'white', borderRadius: 16, padding: 32, textAlign: 'center', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>👥</div>
            <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 16, color: '#1e293b', marginBottom: 8 }}>You're not on a team yet</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>Go back and join or create a team to see your team leaderboard</div>
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8', fontSize: 13 }}>Loading...</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {data.map((agent, i) => {
              const rank = getRank(agent.xp || 0)
              const isMe = agent.id === profile?.id
              const pos = i + 1
              return (
                <div key={agent.id} style={{
                  background: isMe ? '#f0fdf4' : 'white',
                  border: `1.5px solid ${isMe ? '#86efac' : pos <= 3 ? medalColors[i] + '44' : '#e2e8f0'}`,
                  borderRadius: 14, padding: '14px 18px',
                  display: 'flex', alignItems: 'center', gap: 14,
                  boxShadow: isMe ? '0 0 0 3px #86efac44' : '0 1px 4px rgba(0,0,0,0.05)',
                }}>
                  {/* Position */}
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                    background: pos <= 3 ? medalColors[i] : '#f1f5f9',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: pos <= 3 ? 16 : 13,
                    color: pos <= 3 ? 'white' : '#94a3b8',
                  }}>
                    {pos === 1 ? '🥇' : pos === 2 ? '🥈' : pos === 3 ? '🥉' : pos}
                  </div>

                  {/* Name & team */}
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 14, color: '#1e293b' }}>
                        {agent.full_name || agent.email || 'Agent'}
                      </span>
                      {isMe && <span style={{ fontSize: 9, background: '#dcfce7', color: '#16a34a', border: '1px solid #86efac', borderRadius: 4, padding: '1px 6px', fontWeight: 700 }}>YOU</span>}
                    </div>
                    <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
                      {rank.icon} {rank.name}
                      {agent.teams?.name && ` · 👥 ${agent.teams.name}`}
                    </div>
                  </div>

                  {/* Streak */}
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 9, color: '#94a3b8' }}>STREAK</div>
                    <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 16, color: '#ea580c' }}>🔥 {agent.streak || 0}</div>
                  </div>

                  {/* XP */}
                  <div style={{ textAlign: 'center', minWidth: 70 }}>
                    <div style={{ fontSize: 9, color: '#94a3b8' }}>XP</div>
                    <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 18, color: rank.color }}>{(agent.xp || 0).toLocaleString()}</div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
