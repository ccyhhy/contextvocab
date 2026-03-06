import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const next = requestUrl.searchParams.get('next') ?? '/study'
  const safeNext = next.startsWith('/') ? next : '/study'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

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
