import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://zwuoewhxqndmutbfyzka.supabase.co'
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_J7IptpekQyw7IaT1iPNZOg_8NHPZO-m'

// Internal client instance. Nothing outside shared/services/database should
// import this directly — go through the repository modules (usersRepository,
// ridesRepository, etc.) exported from ./index.ts instead.
export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
})

const DEFAULT_TIMEOUT = 15000

export class RequestTimeoutError extends Error {
  constructor(message = 'Request timed out') {
    super(message)
    this.name = 'RequestTimeoutError'
  }
}

export class AuthSessionError extends Error {
  constructor(message = 'Session expired or invalid') {
    super(message)
    this.name = 'AuthSessionError'
  }
}

interface Thenable<T> {
  then<TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2>
}

export function withTimeout<T>(
  promiseOrThenable: Promise<T> | Thenable<T>,
  timeoutMs: number = DEFAULT_TIMEOUT
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new RequestTimeoutError(`Request timed out after ${timeoutMs}ms`))
    }, timeoutMs)

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

    const expiresAt = session.expires_at
    if (expiresAt) {
      const expiresAtMs = expiresAt * 1000
      const fiveMinutes = 5 * 60 * 1000
      if (Date.now() > expiresAtMs - fiveMinutes) {
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

export function forceLogout() {
  localStorage.removeItem('sb-zwuoewhxqndmutbfyzka-auth-token')
  sessionStorage.clear()
  supabase.auth.signOut().catch(() => {})
  window.location.href = '/login?session_expired=true'
}

export async function getCurrentUserId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}

export async function isAuthenticated(): Promise<boolean> {
  const { data: { session } } = await supabase.auth.getSession()
  return !!session
}
