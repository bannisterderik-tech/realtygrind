import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext({})

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id, session.user.user_metadata)
      else setLoading(false)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id, session.user.user_metadata)
      else { setProfile(null); setLoading(false) }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function fetchProfile(userId, userMeta) {
    const { data } = await supabase
      .from('profiles')
      .select('*, teams(name, invite_code, created_by, team_prefs)')
      .eq('id', userId)
      .single()

    // ── Auto-join team for invited users ────────────────────────────────────
    // When an owner invites someone via email, we store team_id in user_metadata.
    // On first login the profile has no team_id yet — auto-join them here.
    const pendingTeamId = userMeta?.team_id
    if (data && !data.team_id && pendingTeamId) {
      await supabase.from('team_members').upsert(
        { team_id: pendingTeamId, user_id: userId, role: 'member' },
        { onConflict: 'user_id' }
      )
      await supabase.from('profiles').update({ team_id: pendingTeamId }).eq('id', userId)
      // Re-fetch with the updated team relationship
      // (no need to clear user_metadata — profile.team_id being set prevents re-joining)
      const { data: updated } = await supabase
        .from('profiles')
        .select('*, teams(name, invite_code, created_by, team_prefs)')
        .eq('id', userId)
        .single()
      setProfile(updated)
      setLoading(false)
      return
    }

    setProfile(data)
    setLoading(false)
  }

  async function refreshProfile() {
    if (user) fetchProfile(user.id, user.user_metadata)
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
