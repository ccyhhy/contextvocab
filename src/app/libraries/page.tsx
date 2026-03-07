import Link from "next/link"
import { ArrowRight, BookOpen, Clock3, Layers3, Sparkles } from "lucide-react"
import { requirePageUser } from "@/lib/supabase/user"
import { getStudyLibraries } from "@/app/study/actions"

function getPlanLabel(status: "active" | "paused" | "completed" | "not_started") {
  switch (status) {
    case "active":
      return "进行中"
    case "paused":
      return "已暂停"
    case "completed":
      return "已完成"
    case "not_started":
    default:
      return "未开始"
  }
}

export default async function LibrariesPage() {
  await requirePageUser()
  const libraries = await getStudyLibraries()

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 p-4 sm:p-8">
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-blue-300/70">
          Libraries
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">词库</h1>
            <p className="mt-2 max-w-2xl text-sm leading-7 text-zinc-400">
              词库负责决定新词从哪里来，复习节奏仍然由全局 SRS 控制。当前版本先支持官方词库与智能视图协同学习。
            </p>
          </div>
          <Link
            href="/study"
            className="inline-flex items-center gap-2 rounded-xl border border-blue-500/20 bg-blue-500/10 px-4 py-3 text-sm font-medium text-blue-100 transition-all hover:bg-blue-500/15"
          >
            <Sparkles className="h-4 w-4" />
            返回学习
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {libraries.map((library) => (
          <div
            key={library.id}
            className="glass-panel rounded-3xl border border-white/[0.08] p-6"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-zinc-400">
                  <Layers3 className="h-3.5 w-3.5" />
                  {library.sourceType === "official" ? "Official" : "Custom"}
                </div>
                <h2 className="mt-4 text-2xl font-bold text-white">{library.name}</h2>
                <p className="mt-2 min-h-12 text-sm leading-6 text-zinc-400">
                  {library.description || "按词库组织新词来源，复习仍共享全局记忆进度。"}
                </p>
              </div>
              <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-200">
                {getPlanLabel(library.planStatus)}
              </span>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-white/8 bg-black/20 p-4">
                <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Words</p>
                <p className="mt-2 text-2xl font-black text-white">{library.wordCount}</p>
              </div>
              <div className="rounded-2xl border border-white/8 bg-black/20 p-4">
                <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Due</p>
                <p className="mt-2 text-2xl font-black text-amber-200">{library.dueCount}</p>
              </div>
              <div className="rounded-2xl border border-white/8 bg-black/20 p-4">
                <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Active</p>
                <p className="mt-2 text-2xl font-black text-blue-200">{library.activeCount}</p>
              </div>
              <div className="rounded-2xl border border-white/8 bg-black/20 p-4">
                <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Remaining</p>
                <p className="mt-2 text-2xl font-black text-white">{library.remainingCount}</p>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-zinc-400">
              <div className="flex items-center gap-2">
                <Clock3 className="h-4 w-4 text-zinc-500" />
                {library.dailyNewLimit ? `每日新词 ${library.dailyNewLimit}` : "每日新词暂未设置"}
              </div>
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-zinc-500" />
                全局 SRS
              </div>
            </div>

            <Link
              href={`/study?library=${encodeURIComponent(library.slug)}`}
              className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-white/10 px-4 py-3 text-sm font-medium text-white transition-all hover:bg-white/15"
            >
              进入学习
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        ))}
      </div>

      {libraries.length === 0 && (
        <div className="glass-panel rounded-3xl p-10 text-center text-zinc-400">
          还没有可用词库。先执行最新的 Supabase schema，再回到这里查看官方词库。
        </div>
      )}
    </div>
  )
}
