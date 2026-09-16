import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://zwuoewhxqndmutbfyzka.supabase.co'
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_J7IptpekQyw7IaT1iPNZOg_8NHPZO-m'

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
})

// Default timeout for requests (15 seconds)
const DEFAULT_TIMEOUT = 15000

// Error class for timeout
export class RequestTimeoutError extends Error {
  constructor(message = 'Request timed out') {
    super(message)
    this.name = 'RequestTimeoutError'
  }
}

// Error class for auth failures
export class AuthSessionError extends Error {
  constructor(message = 'Session expired or invalid') {
    super(message)
    this.name = 'AuthSessionError'
  }
}

// Type for thenable objects (like Supabase query builders)
interface Thenable<T> {
  then<TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2>
}

// Wrap a promise or thenable with a timeout
export function withTimeout<T>(
  promiseOrThenable: Promise<T> | Thenable<T>,
  timeoutMs: number = DEFAULT_TIMEOUT
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new RequestTimeoutError(`Request timed out after ${timeoutMs}ms`))
    }, timeoutMs)

    // Convert thenable to promise if needed
    Promise.resolve(promiseOrThenable)
      .then((result) => {
        clearTimeout(timer)
        resolve(result)
      })
      .catch((error) => {
        clearTimeout(timer)
        reject(error)
      })
  })
}

// Check if session is valid before making requests
export async function checkSessionHealth(): Promise<{ valid: boolean; error?: string }> {
  try {
    const { data: { session }, error } = await withTimeout(
      supabase.auth.getSession(),
      5000
    )

    if (error) {
      return { valid: false, error: error.message }
    }

    if (!session) {
      return { valid: false, error: 'No active session' }
    }

    // Check if token is about to expire (within 5 minutes)
    const expiresAt = session.expires_at
    if (expiresAt) {
      const expiresAtMs = expiresAt * 1000
      const fiveMinutes = 5 * 60 * 1000
      if (Date.now() > expiresAtMs - fiveMinutes) {
        // Try to refresh the session
        const { error: refreshError } = await withTimeout(
          supabase.auth.refreshSession(),
          5000
        )
        if (refreshError) {
          return { valid: false, error: 'Session refresh failed' }
        }
      }
    }

    return { valid: true }
  } catch (err) {
    if (err instanceof RequestTimeoutError) {
      return { valid: false, error: 'Session check timed out' }
    }
    return { valid: false, error: 'Session check failed' }
  }
}

// Force clear session and redirect to login
export function forceLogout() {
  // Clear all Supabase-related storage
  localStorage.removeItem('sb-zwuoewhxqndmutbfyzka-auth-token')
  sessionStorage.clear()

  // Sign out from Supabase (don't await, just fire and forget)
  supabase.auth.signOut().catch(() => {})

  // Redirect to login
  window.location.href = '/login?session_expired=true'
}

// Helper to get the current user's ID
export async function getCurrentUserId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}

// Helper to check if user is authenticated
export async function isAuthenticated(): Promise<boolean> {
  const { data: { session } } = await supabase.auth.getSession()
  return !!session
}
