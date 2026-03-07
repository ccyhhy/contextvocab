"use client"

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FormEvent, useEffect, useMemo, useState } from 'react'
import { KeyRound, LoaderCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

type SearchValue = string | string[] | undefined

function readSearchParam(value: SearchValue) {
  return Array.isArray(value) ? value[0] ?? '' : value ?? ''
}

function getBannerClasses(type: string) {
  if (type === 'success') {
    return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
  }

  if (type === 'info') {
    return 'border-blue-500/20 bg-blue-500/10 text-blue-300'
  }

  return 'border-red-500/20 bg-red-500/10 text-red-300'
}

type RecoveryState = 'checking' | 'ready' | 'invalid'

export default function ResetPasswordClient({
  searchParams,
}: {
  searchParams: Record<string, SearchValue>
}) {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [recoveryState, setRecoveryState] = useState<RecoveryState>('checking')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState(readSearchParam(searchParams.message))
  const [messageType, setMessageType] = useState(readSearchParam(searchParams.type) || 'error')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false

    const applySession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (cancelled) {
        return
      }

      if (session?.user) {
        setEmail(session.user.email ?? '')
        setRecoveryState('ready')
      }
    }

    const timer = window.setTimeout(async () => {
      await applySession()
      if (!cancelled) {
        setRecoveryState((current) => (current === 'ready' ? current : 'invalid'))
      }
    }, 1200)

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
        if (session?.user && !cancelled) {
          setEmail(session.user.email ?? '')
          setRecoveryState('ready')
        }
      }
    })

    void applySession()

    return () => {
      cancelled = true
      window.clearTimeout(timer)
      subscription.unsubscribe()
    }
  }, [supabase])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!newPassword || !confirmPassword) {
      setMessage('请完整填写新密码。')
      setMessageType('error')
      return
    }

    if (newPassword.length < 6) {
      setMessage('密码至少需要 6 位。')
      setMessageType('error')
      return
    }

    if (newPassword !== confirmPassword) {
      setMessage('两次输入的密码不一致。')
      setMessageType('error')
      return
    }

    setSubmitting(true)
    setMessage('')

    const { error } = await supabase.auth.updateUser({ password: newPassword })

    if (error) {
      setMessage(error.message || '密码更新失败。')
      setMessageType('error')
      setSubmitting(false)
      return
    }

    await supabase.auth.signOut()
    router.replace('/login?mode=login&type=success&message=' + encodeURIComponent('密码已更新，请使用新密码登录。'))
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
              {recoveryState === 'ready'
                ? <>当前正在为 <span className="text-zinc-200">{email || '当前账号'}</span> 重置密码。</>
                : recoveryState === 'checking'
                  ? '正在验证重置链接，请稍候。'
                  : '重置链接无效、已过期，或者浏览器还没有完成恢复会话。'}
            </p>
          </div>
        </div>

        {message && (
          <div className={`mb-6 rounded-2xl border px-4 py-3 text-sm ${getBannerClasses(messageType)}`}>
            {message}
          </div>
        )}

        {recoveryState === 'checking' ? (
          <div className="rounded-2xl border border-white/8 bg-black/20 px-4 py-8 text-center text-sm text-zinc-400">
            <LoaderCircle className="mx-auto mb-3 h-5 w-5 animate-spin text-amber-300" />
            正在接收密码重置会话...
          </div>
        ) : recoveryState === 'invalid' ? (
          <div className="rounded-2xl border border-red-500/10 bg-red-500/5 px-4 py-5 text-sm leading-6 text-zinc-300">
            <p>请重新从登录页发送一封新的重置邮件，再点击邮件里的最新链接。</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
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
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                disabled={submitting}
                className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-zinc-100 outline-none transition-all placeholder:text-zinc-600 focus:border-amber-500/50 focus:bg-black/40 disabled:opacity-60"
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
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                disabled={submitting}
                className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-zinc-100 outline-none transition-all placeholder:text-zinc-600 focus:border-amber-500/50 focus:bg-black/40 disabled:opacity-60"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className={cn(
                'group relative inline-flex w-full items-center justify-center overflow-hidden rounded-2xl border border-amber-400/20 bg-amber-500/14 px-4 py-3 text-sm font-semibold text-amber-100 shadow-[0_12px_30px_-12px_rgba(245,158,11,0.75)] transition-all duration-200 hover:bg-amber-500/22 active:bg-amber-500/28',
                'focus:outline-none focus:ring-2 focus:ring-white/20 focus:ring-offset-2 focus:ring-offset-black/30',
                'disabled:cursor-not-allowed disabled:scale-[0.99] disabled:opacity-85'
              )}
            >
              <span
                className={cn(
                  'pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,transparent_20%,rgba(255,255,255,0.22)_50%,transparent_80%)] transition-transform duration-700',
                  submitting
                    ? 'translate-x-0 opacity-100'
                    : '-translate-x-[180%] opacity-0 group-hover:translate-x-[180%] group-hover:opacity-100'
                )}
              />
              <span className="relative flex items-center justify-center gap-2">
                {submitting ? (
                  <>
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                    <span>更新中...</span>
                  </>
                ) : (
                  <span>更新密码</span>
                )}
              </span>
            </button>
          </form>
        )}

        <div className="mt-6 text-sm text-zinc-500">
          <Link href="/login?mode=login" className="text-zinc-300 transition-colors hover:text-white">
            返回登录
          </Link>
        </div>
      </div>
    </div>
  )
}
