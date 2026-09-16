import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from 'react'
import { supabase, withTimeout, checkSessionHealth, forceLogout, RequestTimeoutError } from '@/lib/supabase'
import type { User as SupabaseUser, Session } from '@supabase/supabase-js'
import type { User } from '@/types'

interface AuthContextType {
  user: SupabaseUser | null
  profile: User | null
  session: Session | null
  loading: boolean
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
  updateProfile: (updates: Partial<User>) => Promise<{ error: Error | null }>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SupabaseUser | null>(null)
  const [profile, setProfile] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchProfile = async (userId: string, userEmail?: string, fullName?: string): Promise<User | null> => {
    try {
      const { data, error } = await withTimeout(
        supabase
          .from('users')
          .select('*')
          .eq('id', userId)
          .single(),
        10000
      )

      if (error) {
        console.error('Error fetching profile:', error)

        // If profile doesn't exist (trigger may have failed), create it
        if (error.code === 'PGRST116') {
          console.log('Profile not found, creating one...')
          const { data: newProfile, error: createError } = await withTimeout(
            supabase
              .from('users')
              .insert({
                id: userId,
                email: userEmail || '',
                full_name: fullName || 'User',
              })
              .select()
              .single(),
            10000
          )

          if (createError) {
            console.error('Error creating profile:', createError)
            return null
          }
          return newProfile as User
        }
        return null
      }
      return data as User
    } catch (err) {
      if (err instanceof RequestTimeoutError) {
        console.error('Profile fetch timed out')
      } else {
        console.error('Profile fetch error:', err)
      }
      return null
    }
  }

  const refreshProfile = async () => {
    if (user) {
      const profileData = await fetchProfile(user.id)
      setProfile(profileData)
    }
  }

  // Track if a session health check is in progress
  const healthCheckInProgress = useRef(false)
  const userRef = useRef(user)

  // Keep userRef in sync
  useEffect(() => {
    userRef.current = user
  }, [user])

  // Periodic session health check - no dependencies to avoid loops
  const performHealthCheck = useCallback(async () => {
    if (healthCheckInProgress.current || !userRef.current) return

    healthCheckInProgress.current = true
    try {
      const health = await checkSessionHealth()
      if (!health.valid && userRef.current) {
        console.warn('Session health check failed:', health.error)
        // Only force logout if the error indicates a truly dead session
        if (health.error === 'Session refresh failed' || health.error === 'Session check timed out') {
          forceLogout()
        }
      }
    } catch (err) {
      console.error('Health check error:', err)
    } finally {
      healthCheckInProgress.current = false
    }
  }, []) // Empty deps - uses ref instead

  useEffect(() => {
    let isMounted = true

    // Timeout to prevent infinite loading (10 seconds max)
    const loadingTimeout = setTimeout(() => {
      if (isMounted && loading) {
        console.warn('Auth loading timeout - forcing completion')
        setLoading(false)
      }
    }, 10000)

    // Get initial session
    const initAuth = async () => {
      try {
        const { data: { session }, error } = await withTimeout(
          supabase.auth.getSession(),
          8000
        )

        if (error) {
          console.error('Session error:', error)
          if (isMounted) setLoading(false)
          return
        }

        if (isMounted) {
          setSession(session)
          setUser(session?.user ?? null)

          if (session?.user) {
            const fullName = session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || 'User'
            const profileData = await fetchProfile(session.user.id, session.user.email, fullName)
            if (isMounted) setProfile(profileData)
          }

          setLoading(false)
        }
      } catch (err) {
        console.error('Auth init error:', err)
        if (isMounted) setLoading(false)
      }
    }

    initAuth()

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!isMounted) return

        // Handle specific auth events
        if (event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
          console.log('Auth event:', event)
        }

        setSession(session)
        setUser(session?.user ?? null)

        if (session?.user) {
          const fullName = session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || 'User'
          const profileData = await fetchProfile(session.user.id, session.user.email, fullName)
          if (isMounted) setProfile(profileData)
        } else {
          setProfile(null)
        }
        setLoading(false)
      }
    )

    // Periodic session health check every 5 minutes when tab is visible
    const healthCheckInterval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        performHealthCheck()
      }
    }, 5 * 60 * 1000)

    // Also check health when tab becomes visible after being hidden
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        performHealthCheck()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      isMounted = false
      clearTimeout(loadingTimeout)
      clearInterval(healthCheckInterval)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      subscription.unsubscribe()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Run once on mount - performHealthCheck is stable via ref

  const signUp = async (email: string, password: string, fullName: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName }
      }
    })
    return { error: error as Error | null }
  }

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    return { error: error as Error | null }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
    setSession(null)
  }

  const updateProfile = async (updates: Partial<User>): Promise<{ error: Error | null }> => {
    if (!user) return { error: new Error('Not authenticated') }

    try {
      // Check session health before making the request
      const sessionHealth = await checkSessionHealth()
      if (!sessionHealth.valid) {
        console.error('Session invalid:', sessionHealth.error)
        forceLogout()
        return { error: new Error('Session expired. Please log in again.') }
      }

      const { error } = await withTimeout(
        supabase
          .from('users')
          .update(updates)
          .eq('id', user.id),
        15000
      )

      if (!error) {
        setProfile(prev => prev ? { ...prev, ...updates } : null)
      }

      return { error: error as Error | null }
    } catch (err) {
      if (err instanceof RequestTimeoutError) {
        console.error('Profile update timed out')
        return { error: new Error('Update timed out. Please try again.') }
      }
      return { error: err as Error }
    }
  }

  const value = {
    user,
    profile,
    session,
    loading,
    signUp,
    signIn,
    signOut,
    updateProfile,
    refreshProfile,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
