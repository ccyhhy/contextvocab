import { login, signup } from './actions'
import { Sparkles, ArrowRight } from 'lucide-react'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ message: string }>
}) {
  const resolvedSearchParams = await searchParams

  return (
    <div className="flex h-screen w-full items-center justify-center p-4">
      <div className="glass-panel relative w-full max-w-md overflow-hidden rounded-2xl p-8 shadow-2xl">
        {/* Glow decoration */}
        <div className="absolute -left-20 -top-20 h-40 w-40 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="absolute -bottom-20 -right-20 h-40 w-40 rounded-full bg-purple-500/20 blur-3xl" />

        <div className="relative z-10">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/5 shadow-inner">
              <Sparkles className="h-8 w-8 text-blue-400" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-white mb-2">ContextVocab</h1>
            <p className="text-sm text-zinc-400">通过语境掌握英语</p>
          </div>

          <form className="flex w-full flex-col justify-center gap-4 text-foreground">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500" htmlFor="email">
                邮箱
              </label>
              <input
                className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none transition-all placeholder:text-zinc-600 focus:border-blue-500/50 focus:bg-black/40"
                name="email"
                type="email"
                placeholder="you@example.com"
                required
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500" htmlFor="password">
                密码
              </label>
              <input
                className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none transition-all placeholder:text-zinc-600 focus:border-blue-500/50 focus:bg-black/40"
                name="password"
                type="password"
                placeholder="••••••••"
                required
              />
            </div>

            <div className="mt-4 flex flex-col gap-3">
              <button
                formAction={login}
                className="group flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition-all hover:bg-blue-500"
              >
                登录
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </button>
              
              <button
                formAction={signup}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-zinc-300 transition-all hover:bg-white/10 hover:text-white"
              >
                注册账号
              </button>
            </div>

            {resolvedSearchParams?.message && (
              <p className="mt-4 rounded-lg bg-red-500/10 p-4 text-center text-sm text-red-500 border border-red-500/20">
                {resolvedSearchParams.message}
              </p>
            )}
          </form>
        </div>
      </div>
    </div>
  )
}
