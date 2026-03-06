import Link from 'next/link'
import { redirect } from 'next/navigation'
import { KeyRound } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { updatePassword } from '@/app/login/actions'
import AuthSubmitButton from '@/app/login/auth-submit-button'

type SearchValue = string | string[] | undefined

function readSearchParam(value: SearchValue) {
  return Array.isArray(value) ? value[0] ?? '' : value ?? ''
}

function getBannerClasses(type: string) {
  if (type === 'success') {
    return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
  }

  return 'border-red-500/20 bg-red-500/10 text-red-300'
}

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, SearchValue>>
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const resolvedSearchParams = await searchParams
  const message = readSearchParam(resolvedSearchParams.message)
  const type = readSearchParam(resolvedSearchParams.type) || 'error'

  if (!user) {
    redirect('/login?mode=reset&type=error&message=' + encodeURIComponent('重置链接无效或已过期，请重新发送。'))
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center p-4 sm:p-6">
      <div className="glass-panel w-full max-w-lg rounded-3xl p-6 shadow-2xl sm:p-8">
        <div className="mb-8 flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-500/10">
            <KeyRound className="h-6 w-6 text-amber-300" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">设置新密码</h1>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              当前正在为 <span className="text-zinc-200">{user.email}</span> 重置密码。
            </p>
          </div>
        </div>

        {message && (
          <div className={`mb-6 rounded-2xl border px-4 py-3 text-sm ${getBannerClasses(type)}`}>
            {message}
          </div>
        )}

        <form action={updatePassword} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500" htmlFor="new-password">
              New Password
            </label>
            <input
              id="new-password"
              name="newPassword"
              type="password"
              autoComplete="new-password"
              placeholder="At least 6 characters"
              required
              className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-zinc-100 outline-none transition-all placeholder:text-zinc-600 focus:border-amber-500/50 focus:bg-black/40"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500" htmlFor="confirm-new-password">
              Confirm Password
            </label>
            <input
              id="confirm-new-password"
              name="confirmNewPassword"
              type="password"
              autoComplete="new-password"
              placeholder="Repeat your new password"
              required
              className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-zinc-100 outline-none transition-all placeholder:text-zinc-600 focus:border-amber-500/50 focus:bg-black/40"
            />
          </div>

          <AuthSubmitButton tone="amber" pendingLabel="更新中...">
            更新密码
          </AuthSubmitButton>
        </form>

        <div className="mt-6 text-sm text-zinc-500">
          <Link href="/login?mode=login" className="text-zinc-300 transition-colors hover:text-white">
            返回登录
          </Link>
        </div>
      </div>
    </div>
  )
}
