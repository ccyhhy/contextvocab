import { NextResponse } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

const EMAIL_OTP_TYPES = new Set<EmailOtpType>([
  'signup',
  'invite',
  'magiclink',
  'recovery',
  'email_change',
  'email',
])

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const tokenHash = requestUrl.searchParams.get('token_hash')
  const type = requestUrl.searchParams.get('type')
  const next =
    requestUrl.searchParams.get('next') ??
    (type === 'recovery' ? '/reset-password' : '/study')
  const safeNext = next.startsWith('/') ? next : '/study'
  const supabase = await createClient()

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      return NextResponse.redirect(new URL(safeNext, requestUrl.origin))
    }
  }

  if (tokenHash && type && EMAIL_OTP_TYPES.has(type as EmailOtpType)) {
    const { error } = await supabase.auth.verifyOtp({
      type: type as EmailOtpType,
      token_hash: tokenHash,
    })

    if (!error) {
      return NextResponse.redirect(new URL(safeNext, requestUrl.origin))
    }
  }

  const loginUrl = new URL('/login', requestUrl.origin)
  loginUrl.searchParams.set('mode', 'login')
  loginUrl.searchParams.set('type', 'error')
  loginUrl.searchParams.set('message', '认证链接无效或已过期，请重新操作。')
  return NextResponse.redirect(loginUrl)
}
