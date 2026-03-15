import { createContext, useContext, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext({})

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const mountedRef = useRef(true)
  const profileLoadedRef = useRef(false)  // prevents duplicate profile fetches
  const signOutTimerRef = useRef(null)    // debounce SIGNED_OUT to avoid transient clears on wake

  useEffect(() => {
    mountedRef.current = true
    profileLoadedRef.current = false

    // onAuthStateChange fires immediately with INITIAL_SESSION — no need to also
    // call getSession(), which was causing fetchProfile to run twice on mount.
    if (!supabase) { setLoading(false); return }
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mountedRef.current) return

      // ── SIGNED_OUT — debounce to avoid transient clears on wake from sleep ──
      // On wake, Supabase may fire SIGNED_OUT then SIGNED_IN in quick succession.
      // Wait 500ms before actually clearing state; cancel if SIGNED_IN arrives first.
      if (event === 'SIGNED_OUT') {
        signOutTimerRef.current = setTimeout(() => {
          if (!mountedRef.current) return
          setUser(null)
          setProfile(null)
          setLoading(false)
          profileLoadedRef.current = false
        }, 500)
        return
      }

      // Any non-signout event cancels pending signout (e.g. wake reconnect)
      if (signOutTimerRef.current) {
        clearTimeout(signOutTimerRef.current)
        signOutTimerRef.current = null
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

      // ── TOKEN_REFRESHED — user data unchanged, skip if same user ──
      if (event === 'TOKEN_REFRESHED') {
        setUser(prev => prev?.id === session.user.id ? prev : session.user)
        return
      }

      // ── INITIAL_SESSION or SIGNED_IN — load profile once ──
      // Use functional update so React bails out of re-render when user id hasn't
      // changed (wake from sleep, network reconnect fire SIGNED_IN with same user).
      setUser(prev => prev?.id === session.user.id ? prev : session.user)
      if (!profileLoadedRef.current) {
        profileLoadedRef.current = true
        fetchProfile(session.user.id, session.user.user_metadata, session.user.email)
      } else {
        // Only call setLoading if it's actually still true — avoids a no-op state
        // update that would still recalculate the context useMemo.
        setLoading(prev => prev ? false : prev)
      }
    })

    return () => {
      mountedRef.current = false
      if (signOutTimerRef.current) clearTimeout(signOutTimerRef.current)
      subscription.unsubscribe()
    }
  }, [])

  async function fetchProfile(userId, userMeta, userEmail) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*, teams(name, invite_code, created_by, team_prefs, presentations_addon_status, pres_generations_used, pres_generations_reset, cma_addon_status, cma_generations_used, cma_generations_reset)')
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

      // ── Fetch team member role (owner/member/tc) ──────────────────────────
      if (data?.team_id) {
        try {
          const { data: tmRow } = await supabase
            .from('team_members')
            .select('role')
            .eq('user_id', userId)
            .eq('team_id', data.team_id)
            .single()
          if (tmRow) data.team_member_role = tmRow.role
        } catch (_) { /* non-fatal */ }
      }

      // ── Auto-join team for users invited via email ──────────────────────────
      // team_id is stored in user_metadata by the invite edge function.
      // On first login, profile.team_id is null — auto-join here.
      // Wrapped in its own try/catch so a failed auto-join doesn't break the
      // entire auth flow — user still loads with their profile (sans team).
      const pendingTeamId = userMeta?.team_id
      if (data && !data.team_id && pendingTeamId) {
        try {
          await supabase.from('team_members').upsert(
            { team_id: pendingTeamId, user_id: userId, role: 'member' },
            { onConflict: 'user_id' }
          )
          await supabase.from('profiles').update({ team_id: pendingTeamId }).eq('id', userId)
          // Clean up pending invite for this user's email
          if (userEmail) {
            const { data: teamRow } = await supabase.from('teams').select('team_prefs').eq('id', pendingTeamId).single()
            const pending = teamRow?.team_prefs?.pending_invites || []
            const cleaned = pending.filter(i => i.email.toLowerCase() !== userEmail.toLowerCase())
            if (cleaned.length !== pending.length) {
              await supabase.from('teams').update({
                team_prefs: { ...(teamRow.team_prefs || {}), pending_invites: cleaned }
              }).eq('id', pendingTeamId)
            }
          }
          if (!mountedRef.current) return
          const { data: updated } = await supabase
            .from('profiles')
            .select('*, teams(name, invite_code, created_by, team_prefs, presentations_addon_status, pres_generations_used, pres_generations_reset, cma_addon_status, cma_generations_used, cma_generations_reset)')
            .eq('id', userId)
            .single()
          // Attach team member role
          if (updated?.team_id) {
            try {
              const { data: tmRow } = await supabase.from('team_members').select('role').eq('user_id', userId).eq('team_id', updated.team_id).single()
              if (tmRow) updated.team_member_role = tmRow.role
            } catch (_) { /* non-fatal */ }
          }
          if (mountedRef.current) {
            setProfile(updated ?? null)
            setLoading(false)
          }
          return
        } catch (joinErr) {
          console.error('Auto-join team failed (continuing with profile):', joinErr)
          // Fall through to set profile without team — user can retry join later
        }
      }

      setProfile(data ?? null)
      setLoading(false)
    } catch (err) {
      console.error('fetchProfile exception:', err)
      if (mountedRef.current) { setProfile(null); setLoading(false) }
    }
  }

  const userRef = useRef(user)
  userRef.current = user
  const refreshProfile = useCallback(() => {
    const u = userRef.current
    if (u) fetchProfile(u.id, u.user_metadata, u.email)
  }, [])

  const contextValue = useMemo(() => ({ user, profile, loading, refreshProfile }), [user, profile, loading, refreshProfile])

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
