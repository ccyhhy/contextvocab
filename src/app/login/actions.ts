'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { getAdminClient } from '@/lib/supabase'
import { createClient } from '@/lib/supabase/server'

type FlashType = 'error' | 'success' | 'info'

function buildLoginRedirect(
  message: string,
  type: FlashType = 'error',
  mode: 'login' | 'signup' | 'reset' = 'login'
) {
  return `/login?mode=${mode}&type=${type}&message=${encodeURIComponent(message)}`
}

function readString(formData: FormData, key: string) {
  const value = formData.get(key)
  return typeof value === 'string' ? value.trim() : ''
}

async function getBaseUrl() {
  const requestHeaders = await headers()
  const origin = requestHeaders.get('origin')
  if (origin) {
    return origin
  }

  const forwardedHost = requestHeaders.get('x-forwarded-host')
  const forwardedProto = requestHeaders.get('x-forwarded-proto') ?? 'https'
  if (forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`
  }

  const host = requestHeaders.get('host')
  if (host) {
    const protocol = host.includes('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https'
    return `${protocol}://${host}`
  }

  return 'http://localhost:3000'
}

async function findUserByEmail(email: string): Promise<User | null> {
  const admin = getAdminClient()
  const target = email.toLowerCase()

  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) {
      console.error('Failed to list auth users:', error.message)
      return null
    }

    const user = data.users.find((entry) => entry.email?.toLowerCase() === target) ?? null
    if (user) {
      return user
    }

    if (!data.nextPage) {
      break
    }
  }

  return null
}

async function confirmExistingUser(email: string, password?: string) {
  const admin = getAdminClient()
  const existingUser = await findUserByEmail(email)

  if (!existingUser) {
    return false
  }

  const attributes: { email_confirm?: boolean; password?: string } = {
    email_confirm: true,
  }

  if (password) {
    attributes.password = password
  }

  const { error } = await admin.auth.admin.updateUserById(existingUser.id, attributes)
  if (error) {
    console.error('Failed to confirm existing user:', error.message)
    return false
  }

  return true
}

export async function login(formData: FormData) {
  const supabase = await createClient()

  const email = readString(formData, 'email')
  const password = readString(formData, 'password')

  if (!email || !password) {
    redirect(buildLoginRedirect('请输入邮箱和密码。'))
  }

  let { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error?.message?.toLowerCase().includes('email not confirmed')) {
    const confirmed = await confirmExistingUser(email)
    if (confirmed) {
      const retry = await supabase.auth.signInWithPassword({ email, password })
      error = retry.error
    }
  }

  if (error) {
    redirect(buildLoginRedirect(error.message || '登录失败，请检查邮箱和密码。'))
  }

  revalidatePath('/', 'layout')
  redirect('/study')
}

export async function signup(formData: FormData) {
  const admin = getAdminClient()
  const supabase = await createClient()

  const email = readString(formData, 'signupEmail')
  const password = readString(formData, 'signupPassword')
  const confirmPassword = readString(formData, 'confirmPassword')

  if (!email || !password || !confirmPassword) {
    redirect(buildLoginRedirect('请完整填写注册信息。', 'error', 'signup'))
  }

  if (password.length < 6) {
    redirect(buildLoginRedirect('密码至少需要 6 位。', 'error', 'signup'))
  }

  if (password !== confirmPassword) {
    redirect(buildLoginRedirect('两次输入的密码不一致。', 'error', 'signup'))
  }

  const { error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (createError) {
    if (createError.message.toLowerCase().includes('already')) {
      const recovered = await confirmExistingUser(email, password)
      if (!recovered) {
        redirect(buildLoginRedirect('这个邮箱已经注册，请直接登录或重置密码。', 'info', 'login'))
      }
    } else {
      redirect(buildLoginRedirect(createError.message || '注册失败，请稍后再试。', 'error', 'signup'))
    }
  }

  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (signInError) {
    redirect(buildLoginRedirect(signInError.message || '注册成功，但自动登录失败，请直接登录。', 'info', 'login'))
  }

  revalidatePath('/', 'layout')
  redirect('/study')
}

export async function requestPasswordReset(formData: FormData) {
  const supabase = await createClient()
  const email = readString(formData, 'resetEmail')

  if (!email) {
    redirect(buildLoginRedirect('请输入要找回的邮箱。', 'error', 'reset'))
  }

  const redirectTo = `${await getBaseUrl()}/auth/callback?next=/reset-password`
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })

  if (error) {
    redirect(buildLoginRedirect(error.message || '发送重置邮件失败，请稍后再试。', 'error', 'reset'))
  }

  redirect(buildLoginRedirect('重置邮件已发送，请检查邮箱。', 'success', 'reset'))
}

export async function updatePassword(formData: FormData) {
  const supabase = await createClient()
  const password = readString(formData, 'newPassword')
  const confirmPassword = readString(formData, 'confirmNewPassword')

  if (!password || !confirmPassword) {
    redirect('/reset-password?type=error&message=' + encodeURIComponent('请完整填写新密码。'))
  }

  if (password.length < 6) {
    redirect('/reset-password?type=error&message=' + encodeURIComponent('密码至少需要 6 位。'))
  }

  if (password !== confirmPassword) {
    redirect('/reset-password?type=error&message=' + encodeURIComponent('两次输入的密码不一致。'))
  }

  const { error } = await supabase.auth.updateUser({ password })

  if (error) {
    redirect('/reset-password?type=error&message=' + encodeURIComponent(error.message || '密码更新失败。'))
  }

  redirect(buildLoginRedirect('密码已更新，请使用新密码登录。', 'success', 'login'))
}

export async function signout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
