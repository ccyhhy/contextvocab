"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { ArrowRight, BookOpen, Clock3, Layers3, Plus, Sparkles } from "lucide-react"
import type { StudyLibrary } from "@/app/study/actions"
import { createCustomLibrary, type CreateLibraryResult } from "./actions"

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

export default function LibrariesClient({ initialLibraries }: { initialLibraries: StudyLibrary[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [wordsText, setWordsText] = useState("")
  const [result, setResult] = useState<CreateLibraryResult | null>(null)

  const handleCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setResult(null)

    startTransition(async () => {
      const nextResult = await createCustomLibrary({
        name,
        description,
        wordsText,
      })

      setResult(nextResult)

      if (!nextResult.ok) {
        return
      }

      setName("")
      setDescription("")
      setWordsText("")
      router.refresh()
    })
  }

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
              词库负责决定新词从哪里来，复习节奏仍然由全局 SRS 控制。现在你可以直接创建自定义词库，把现有词表里的单词组织成自己的学习集合。
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

      <div className="grid gap-6 xl:grid-cols-[1.1fr_1.4fr]">
        <form
          onSubmit={handleCreate}
          className="glass-panel rounded-3xl border border-white/[0.08] p-6"
        >
          <div className="flex items-center gap-2 text-white">
            <Plus className="h-4 w-4 text-blue-400" />
            <h2 className="text-lg font-semibold">新建自定义词库</h2>
          </div>
          <p className="mt-2 text-sm leading-7 text-zinc-400">
            当前版本会把你输入的单词与现有词表做精确匹配，只把匹配成功的词加入词库。
          </p>

          <div className="mt-5 space-y-4">
            <div>
              <label className="mb-2 block text-sm text-zinc-300">词库名称</label>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="例如：面试高频词"
                className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition-colors focus:border-blue-500/40"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-zinc-300">描述</label>
              <input
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="一句话说明这个词库的用途"
                className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition-colors focus:border-blue-500/40"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-zinc-300">单词列表</label>
              <textarea
                value={wordsText}
                onChange={(event) => setWordsText(event.target.value)}
                placeholder={`每行一个，或直接粘贴一串。\nexample\nimpact\nbear\nissue`}
                className="h-52 w-full rounded-3xl border border-white/10 bg-[#09090b]/80 p-4 text-sm leading-7 text-zinc-100 outline-none transition-colors focus:border-blue-500/40"
              />
              <p className="mt-2 text-xs leading-6 text-zinc-500">
                支持换行、空格、逗号、分号分隔。当前只会加入 `words` 表里已经存在的单词。
              </p>
            </div>

            <button
              type="submit"
              disabled={isPending}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition-all disabled:bg-white/10 disabled:text-zinc-500"
            >
              <Plus className="h-4 w-4" />
              {isPending ? "创建中..." : "创建词库"}
            </button>
          </div>

          {result && (
            <div
              className={`mt-5 rounded-2xl border px-4 py-3 text-sm ${
                result.ok
                  ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-100"
                  : "border-red-500/20 bg-red-500/10 text-red-100"
              }`}
            >
              <p>{result.message}</p>
              {result.ok && result.librarySlug && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    href={`/study?library=${encodeURIComponent(result.librarySlug)}`}
                    className="inline-flex items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-xs font-medium text-emerald-50"
                  >
                    直接开始学习
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              )}
              {result.unmatchedWords && result.unmatchedWords.length > 0 && (
                <p className="mt-3 text-xs leading-6 opacity-90">
                  未匹配：{result.unmatchedWords.join(", ")}
                </p>
              )}
            </div>
          )}
        </form>

        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {initialLibraries.map((library) => (
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

          {initialLibraries.length === 0 && (
            <div className="glass-panel rounded-3xl p-10 text-center text-zinc-400">
              还没有可用词库。你可以先创建一个自定义词库，或者检查 Supabase schema 是否已经执行到最新版本。
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
