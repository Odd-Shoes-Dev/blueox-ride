import { supabase, withTimeout } from './client'
import { uploadPublicFile } from './storage'
import type { User as SupabaseUser, Session } from '@supabase/supabase-js'
import type { User } from '@/shared/types'

// Re-exported so callers never need to import '@supabase/supabase-js' directly.
export type { SupabaseUser, Session }

export function getSession() {
  return withTimeout(supabase.auth.getSession(), 8000)
}

export function onAuthStateChange(callback: (event: string, session: Session | null) => void) {
  return supabase.auth.onAuthStateChange(callback)
}

export async function signUp(email: string, password: string, fullName: string) {
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } },
  })
  return { error: error as Error | null }
}

export async function signIn(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  return { error: error as Error | null }
}

export async function signOut() {
  await supabase.auth.signOut()
}

// Fetches the user's profile row, creating it if the signup trigger hasn't
// run yet. Returns null on any failure (caller treats null as "no profile").
export async function getOrCreateUserProfile(
  userId: string,
  userEmail?: string,
  fullName?: string
): Promise<User | null> {
  try {
    const { data, error } = await withTimeout(
      supabase.from('users').select('*').eq('id', userId).single(),
      10000
    )

    if (error) {
      console.error('Error fetching profile:', error)

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
    console.error('Profile fetch error:', err)
    return null
  }
}

export async function updateUserProfile(
  userId: string,
  updates: Partial<User>
): Promise<{ error: Error | null }> {
  const { error } = await withTimeout(
    supabase.from('users').update(updates).eq('id', userId),
    15000
  )
  return { error: error as Error | null }
}

export async function uploadAvatar(userId: string, file: File): Promise<string> {
  const fileExt = file.name.split('.').pop()
  const filePath = `${userId}/${Date.now()}.${fileExt}`
  return uploadPublicFile('avatars', filePath, file)
}
