import type { User } from '@supabase/supabase-js'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from './server'

function isMissingSessionError(message?: string) {
  return message?.toLowerCase().includes('auth session missing') ?? false
}

const getCachedSession = cache(async () => {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error) {
    if (!isMissingSessionError(error.message)) {
      console.error('Failed to load current user:', error.message)
    }
    return { supabase, user: null as User | null }
  }

  return { supabase, user }
})

export async function getCurrentUser(): Promise<User | null> {
  const { user } = await getCachedSession()
  return user
}

export async function requirePageUser(): Promise<User> {
  const { user } = await getCachedSession()

  if (!user) {
    redirect('/login')
  }

  return user
}

export async function requireActionSession() {
  const { supabase, user } = await getCachedSession()

  if (!user) {
    throw new Error('User is not authenticated')
  }

  return { supabase, user }
}
