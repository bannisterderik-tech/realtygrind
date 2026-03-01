import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext({})

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const mountedRef = useRef(true)
  const profileLoadedRef = useRef(false)  // prevents duplicate profile fetches

  useEffect(() => {
    mountedRef.current = true
    profileLoadedRef.current = false

    // onAuthStateChange fires immediately with INITIAL_SESSION — no need to also
    // call getSession(), which was causing fetchProfile to run twice on mount.
    if (!supabase) { setLoading(false); return }
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mountedRef.current) return

      // ── SIGNED_OUT is the ONLY event that should clear state ──
      if (event === 'SIGNED_OUT') {
        setUser(null)
        setProfile(null)
        setLoading(false)
        profileLoadedRef.current = false
        return
      }

      // ── No session: only act on INITIAL_SESSION (first load, user not logged in) ──
      // All other events without a session (network blips during refresh) are ignored
      // to prevent unmount/remount duplication.
      if (!session?.user) {
        if (event === 'INITIAL_SESSION') {
          setUser(null)
          setProfile(null)
          setLoading(false)
        }
        return
      }

      // ── TOKEN_REFRESHED — user data unchanged, just update token ref ──
      if (event === 'TOKEN_REFRESHED') {
        setUser(session.user)
        return
      }

      // ── INITIAL_SESSION or SIGNED_IN — load profile once ──
      setUser(session.user)
      if (!profileLoadedRef.current) {
        profileLoadedRef.current = true
        fetchProfile(session.user.id, session.user.user_metadata)
      } else {
        setLoading(false)
      }
    })

    return () => {
      mountedRef.current = false
      subscription.unsubscribe()
    }
  }, [])

  async function fetchProfile(userId, userMeta) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*, teams(name, invite_code, created_by, team_prefs)')
        .eq('id', userId)
        .single()

      if (!mountedRef.current) return

      // PGRST116 = no rows returned — new user with no profile yet, not fatal
      if (error && error.code !== 'PGRST116') {
        console.error('fetchProfile error:', error.message)
        setProfile(null)
        setLoading(false)
        return
      }

      // ── Auto-join team for users invited via email ──────────────────────────
      // team_id is stored in user_metadata by the invite edge function.
      // On first login, profile.team_id is null — auto-join here.
      const pendingTeamId = userMeta?.team_id
      if (data && !data.team_id && pendingTeamId) {
        await supabase.from('team_members').upsert(
          { team_id: pendingTeamId, user_id: userId, role: 'member' },
          { onConflict: 'user_id' }
        )
        await supabase.from('profiles').update({ team_id: pendingTeamId }).eq('id', userId)
        const { data: updated } = await supabase
          .from('profiles')
          .select('*, teams(name, invite_code, created_by, team_prefs)')
          .eq('id', userId)
          .single()
        if (mountedRef.current) {
          setProfile(updated ?? null)
          setLoading(false)
        }
        return
      }

      setProfile(data ?? null)
      setLoading(false)
    } catch (err) {
      console.error('fetchProfile exception:', err)
      if (mountedRef.current) { setProfile(null); setLoading(false) }
    }
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
