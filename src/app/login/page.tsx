import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowRight, KeyRound, ShieldCheck, Sparkles } from 'lucide-react'
import { getCurrentUser } from '@/lib/supabase/user'
import { login, requestPasswordReset, signup } from './actions'
import AuthSubmitButton from './auth-submit-button'

type SearchValue = string | string[] | undefined
type AuthMode = 'login' | 'signup' | 'reset'

function readSearchParam(value: SearchValue) {
  return Array.isArray(value) ? value[0] ?? '' : value ?? ''
}

function normalizeMode(value: string): AuthMode {
  if (value === 'signup' || value === 'reset') {
    return value
  }
  return 'login'
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

function AuthSwitch({ activeMode }: { activeMode: AuthMode }) {
  const items: Array<{ mode: AuthMode; label: string }> = [
    { mode: 'login', label: '登录' },
    { mode: 'signup', label: '注册' },
    { mode: 'reset', label: '重置密码' },
  ]

  return (
    <div className="inline-flex rounded-2xl border border-white/10 bg-black/20 p-1">
      {items.map((item) => {
        const isActive = activeMode === item.mode
        return (
          <Link
            key={item.mode}
            href={`/login?mode=${item.mode}`}
            className={`rounded-xl px-4 py-2 text-sm font-medium transition-all ${
              isActive
                ? 'bg-white/[0.08] text-white'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {item.label}
          </Link>
        )
      })}
    </div>
  )
}

function LoginForm() {
  return (
    <form action={login} className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500" htmlFor="login-email">
          Email
        </label>
        <input
          id="login-email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          required
          className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-zinc-100 outline-none transition-all placeholder:text-zinc-600 focus:border-blue-500/50 focus:bg-black/40"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500" htmlFor="login-password">
          Password
        </label>
        <input
          id="login-password"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="At least 6 characters"
          required
          className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-zinc-100 outline-none transition-all placeholder:text-zinc-600 focus:border-blue-500/50 focus:bg-black/40"
        />
      </div>

      <AuthSubmitButton
        tone="blue"
        pendingLabel="登录中..."
        icon={<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />}
      >
        登录
      </AuthSubmitButton>
    </form>
  )
}

function SignupForm() {
  return (
    <form action={signup} className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500" htmlFor="signup-email">
          Email
        </label>
        <input
          id="signup-email"
          name="signupEmail"
          type="email"
          autoComplete="email"
          placeholder="your-new-account@example.com"
          required
          className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-zinc-100 outline-none transition-all placeholder:text-zinc-600 focus:border-emerald-500/50 focus:bg-black/40"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500" htmlFor="signup-password">
          Password
        </label>
        <input
          id="signup-password"
          name="signupPassword"
          type="password"
          autoComplete="new-password"
          placeholder="At least 6 characters"
          required
          className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-zinc-100 outline-none transition-all placeholder:text-zinc-600 focus:border-emerald-500/50 focus:bg-black/40"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500" htmlFor="confirm-password">
          Confirm Password
        </label>
        <input
          id="confirm-password"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          placeholder="Repeat your password"
          required
          className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-zinc-100 outline-none transition-all placeholder:text-zinc-600 focus:border-emerald-500/50 focus:bg-black/40"
        />
      </div>

      <AuthSubmitButton tone="emerald" pendingLabel="注册中...">
        注册账号
      </AuthSubmitButton>
    </form>
  )
}

function ResetForm() {
  return (
    <form action={requestPasswordReset} className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500" htmlFor="reset-email">
          Email
        </label>
        <input
          id="reset-email"
          name="resetEmail"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          required
          className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-zinc-100 outline-none transition-all placeholder:text-zinc-600 focus:border-amber-500/50 focus:bg-black/40"
        />
      </div>

      <AuthSubmitButton tone="amber" pendingLabel="发送中...">
        发送重置邮件
      </AuthSubmitButton>
    </form>
  )
}

function AuthContent({ mode }: { mode: AuthMode }) {
  if (mode === 'signup') {
    return {
      icon: <ShieldCheck className="h-6 w-6 text-emerald-300" />,
      iconShell: 'bg-emerald-500/10',
      title: '创建账号',
      description: '直接注册并登录；如果这个邮箱之前卡在未确认状态，系统会自动修复。',
      form: <SignupForm />,
    }
  }

  if (mode === 'reset') {
    return {
      icon: <KeyRound className="h-6 w-6 text-amber-300" />,
      iconShell: 'bg-amber-500/10',
      title: '忘记密码',
      description: '输入邮箱后会收到一封重置密码邮件，点击邮件链接后可设置新密码。',
      form: <ResetForm />,
    }
  }

  return {
    icon: <Sparkles className="h-6 w-6 text-blue-300" />,
    iconShell: 'bg-blue-500/10',
    title: '登录账号',
    description: '登录后继续学习、查看历史记录，并同步你的收藏单词。',
    form: <LoginForm />,
  }
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, SearchValue>>
}) {
  const user = await getCurrentUser()
  const resolvedSearchParams = await searchParams

  if (user) {
    redirect('/study')
  }

  const message = readSearchParam(resolvedSearchParams.message)
  const type = readSearchParam(resolvedSearchParams.type) || 'error'
  const mode = normalizeMode(readSearchParam(resolvedSearchParams.mode))
  const content = AuthContent({ mode })

  return (
    <div className="flex min-h-screen w-full items-center justify-center p-4 sm:p-6">
      <div className="glass-panel relative w-full max-w-xl overflow-hidden rounded-3xl p-6 shadow-2xl sm:p-8">
        <div className="absolute -left-20 -top-20 h-40 w-40 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="absolute -bottom-20 -right-20 h-40 w-40 rounded-full bg-cyan-500/20 blur-3xl" />

        <div className="relative z-10 space-y-6">
          <div className="space-y-4">
            <div className="mb-2 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/5 shadow-inner">
              <Sparkles className="h-7 w-7 text-blue-400" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-white">ContextVocab</h1>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                一个入口完成登录、注册和密码找回。
              </p>
            </div>
            <AuthSwitch activeMode={mode} />
          </div>

          {message && (
            <div className={`rounded-2xl border px-4 py-3 text-sm ${getBannerClasses(type)}`}>
              {message}
            </div>
          )}

          <section className="rounded-3xl border border-white/8 bg-black/20 p-6 sm:p-8">
            <div className="mb-8 flex items-start gap-4">
              <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${content.iconShell}`}>
                {content.icon}
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white">{content.title}</h2>
                <p className="mt-2 text-sm leading-6 text-zinc-400">
                  {content.description}
                </p>
              </div>
            </div>
            {content.form}
          </section>
        </div>
      </div>
    </div>
  )
}
