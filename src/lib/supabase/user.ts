import type { User } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { createClient } from './server'

function isMissingSessionError(message?: string) {
  return message?.toLowerCase().includes('auth session missing') ?? false
}

export async function getCurrentUser(): Promise<User | null> {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error) {
    if (!isMissingSessionError(error.message)) {
      console.error('Failed to load current user:', error.message)
    }
    return null
  }

  return user
}

export async function requirePageUser(): Promise<User> {
  const user = await getCurrentUser()

  if (!user) {
    redirect('/login')
  }

  return user
}

export async function requireActionSession() {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    throw new Error('User is not authenticated')
  }

  return { supabase, user }
}
