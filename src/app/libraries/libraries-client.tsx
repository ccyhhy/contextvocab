"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { type FormEvent, useState, useTransition } from "react"
import {
  ArrowRight,
  BookOpen,
  Clock3,
  Heart,
  Layers3,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react"
import type { StudyLibrary } from "@/app/study/actions"
import {
  createCustomLibrary,
  createLibraryFromFavorites,
  deleteCustomLibrary,
  type LibraryMutationResult,
} from "./actions"

const OFFICIAL_LIBRARY_DESCRIPTIONS: Record<string, string> = {
  "cet-4": "大学英语四级核心词汇",
  "cet-6": "大学英语六级核心词汇",
  "basic-scene-grammar": "覆盖高频表达与句型的基础场景句法",
}

function getLibraryProgress(library: Pick<StudyLibrary, "wordCount" | "activeCount">) {
  if (library.wordCount <= 0) {
    return 0
  }

  return Math.min(100, Math.round((library.activeCount / library.wordCount) * 100))
}

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

function getLibraryDescription(library: Pick<StudyLibrary, "slug" | "sourceType" | "description">) {
  if (library.sourceType === "official") {
    return (
      OFFICIAL_LIBRARY_DESCRIPTIONS[library.slug] ??
      library.description ??
      "将学习内容按词库进行组织，同时在全局复习系统中保持所有进度。"
    )
  }

  return (
    library.description ??
    "将学习内容按词库进行组织，同时在全局复习系统中保持所有进度。"
  )
}

function getContentTypeLabel(contentType: StudyLibrary["contentType"]) {
  switch (contentType) {
    case "grammar":
      return "句法"
    case "mixed":
      return "混合"
    case "word":
    default:
      return "单词"
  }
}

function getItemLabel(contentType: StudyLibrary["contentType"]) {
  return contentType === "grammar" ? "条目" : "单词"
}

function ResultNotice({
  result,
  fallbackLinkLabel = "开始学习",
}: {
  result: LibraryMutationResult | null
  fallbackLinkLabel?: string
}) {
  if (!result) {
    return null
  }

  return (
    <div
      className={`rounded-2xl border px-4 py-3 text-sm ${
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
            {fallbackLinkLabel}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      )}
      {result.unmatchedWords && result.unmatchedWords.length > 0 && (
        <p className="mt-3 text-xs leading-6 opacity-90">
          未匹配: {result.unmatchedWords.join(", ")}
        </p>
      )}
    </div>
  )
}

export default function LibrariesClient({
  initialLibraries,
  favoriteCount,
}: {
  initialLibraries: StudyLibrary[]
  favoriteCount: number
}) {
  const router = useRouter()
  const [isCreatingManual, startCreatingManual] = useTransition()
  const [isCreatingFavorites, startCreatingFavorites] = useTransition()
  const [deletingLibraryId, setDeletingLibraryId] = useState<string | null>(null)

  const [manualName, setManualName] = useState("")
  const [manualDescription, setManualDescription] = useState("")
  const [wordsText, setWordsText] = useState("")
  const [favoriteName, setFavoriteName] = useState("我的收藏")
  const [favoriteDescription, setFavoriteDescription] = useState("")

  const [manualResult, setManualResult] = useState<LibraryMutationResult | null>(null)
  const [favoriteResult, setFavoriteResult] = useState<LibraryMutationResult | null>(null)
  const [deleteResult, setDeleteResult] = useState<LibraryMutationResult | null>(null)

  const officialLibraries = initialLibraries.filter((library) => library.sourceType === "official")
  const customLibraries = initialLibraries.filter((library) => library.sourceType === "custom")

  const handleCreateManual = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setManualResult(null)
    setFavoriteResult(null)
    setDeleteResult(null)

    startCreatingManual(async () => {
      const result = await createCustomLibrary({
        name: manualName,
        description: manualDescription,
        wordsText,
      })

      setManualResult(result)
      if (!result.ok) {
        return
      }

      setManualName("")
      setManualDescription("")
      setWordsText("")
      router.refresh()
    })
  }

  const handleCreateFromFavorites = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setManualResult(null)
    setFavoriteResult(null)
    setDeleteResult(null)

    startCreatingFavorites(async () => {
      const result = await createLibraryFromFavorites({
        name: favoriteName,
        description: favoriteDescription,
      })

      setFavoriteResult(result)
      if (!result.ok) {
        return
      }

      setFavoriteName("我的收藏")
      setFavoriteDescription("")
      router.refresh()
    })
  }

  const handleDelete = async (library: StudyLibrary) => {
    const confirmed = window.confirm(
      `确定要删除自定义词库“${library.name}”吗？这将仅仅删除词库列表，全局单词进度和复习历史不会受影响。`
    )
    if (!confirmed) {
      return
    }

    setManualResult(null)
    setFavoriteResult(null)
    setDeleteResult(null)
    setDeletingLibraryId(library.id)

    const result = await deleteCustomLibrary(library.id)
    setDeleteResult(result)
    setDeletingLibraryId(null)

    if (result.ok) {
      router.refresh()
    }
  }

  const renderLibraryCard = (library: StudyLibrary) => {
    const progress = getLibraryProgress(library)
    const itemLabel = getItemLabel(library.contentType)

    return (
      <div key={library.id} className="glass-panel rounded-3xl border border-white/[0.08] p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-zinc-400">
                <Layers3 className="h-3.5 w-3.5" />
                {library.sourceType === "official" ? "官方官方" : "自定义"}
              </div>
              <div className="inline-flex items-center rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-blue-100">
                {getContentTypeLabel(library.contentType)}
              </div>
            </div>
            <h2 className="mt-4 text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-b from-white to-white/70">{library.name}</h2>
            <p className="mt-2 min-h-12 text-sm leading-6 text-zinc-400">
              {getLibraryDescription(library)}
            </p>
          </div>

          <div className="flex flex-col items-end gap-3">
            <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-200">
              {getPlanLabel(library.planStatus)}
            </span>
            {library.sourceType === "custom" && (
              <button
                type="button"
                onClick={() => handleDelete(library)}
                disabled={deletingLibraryId === library.id}
                className="inline-flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-100 transition-colors hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {deletingLibraryId === library.id ? "删除中..." : "删除"}
              </button>
            )}
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-3 flex flex-col items-center justify-center text-center">
            <p className="text-[11px] uppercase tracking-wider text-zinc-500">{itemLabel}</p>
            <p className="mt-1 flex items-center justify-center text-2xl font-black text-white">{library.wordCount}</p>
          </div>
          <div className="rounded-2xl border border-amber-500/20 bg-gradient-to-b from-amber-500/10 to-amber-500/[0.02] p-3 flex flex-col items-center justify-center text-center shadow-[inset_0_1px_0_rgba(245,158,11,0.1)]">
            <p className="text-[11px] uppercase tracking-wider text-amber-500/70">待复习</p>
            <p className="mt-1 flex items-center justify-center text-2xl font-black tracking-tight text-amber-400 drop-shadow-sm">{library.dueCount}</p>
          </div>
          <div className="rounded-2xl border border-blue-500/20 bg-gradient-to-b from-blue-500/10 to-blue-500/[0.02] p-3 flex flex-col items-center justify-center text-center shadow-[inset_0_1px_0_rgba(59,130,246,0.1)]">
            <p className="text-[11px] uppercase tracking-wider text-blue-400/70">已学习</p>
            <p className="mt-1 flex items-center justify-center text-2xl font-black tracking-tight text-blue-300 drop-shadow-sm">{library.activeCount}</p>
          </div>
          <div className="rounded-2xl border border-emerald-500/20 bg-gradient-to-b from-emerald-500/10 to-emerald-500/[0.02] p-3 flex flex-col items-center justify-center text-center shadow-[inset_0_1px_0_rgba(16,185,129,0.1)]">
            <p className="text-[11px] uppercase tracking-wider text-emerald-500/70">未学习</p>
            <p className="mt-1 flex items-center justify-center text-2xl font-black tracking-tight text-emerald-400 drop-shadow-sm">{library.remainingCount}</p>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-white/8 bg-black/20 p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-zinc-400">学习进度</span>
            <span className="font-semibold text-white">{progress}%</span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/8">
            <div
              className="h-full rounded-full bg-gradient-to-r from-blue-400 via-cyan-300 to-emerald-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-zinc-500">
            <span>已学 {library.activeCount}</span>
            <span>总计 {library.wordCount}</span>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-zinc-400">
          <div className="flex items-center gap-2">
            <Clock3 className="h-4 w-4 text-zinc-500" />
            {library.dailyNewLimit ? `每日新词 ${library.dailyNewLimit}` : "未设置单库每日限制"}
          </div>
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-zinc-500" />
            通过全局算法复习
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link
            href={`/study?library=${encodeURIComponent(library.slug)}`}
            className="group flex flex-1 items-center justify-center gap-2 rounded-2xl bg-white/10 px-4 py-3.5 text-sm font-semibold text-white shadow-lg shadow-black/20 transition-all hover:-translate-y-0.5 hover:bg-white/20"
          >
            开始学习
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
          <Link
            href={`/libraries/${encodeURIComponent(library.slug)}`}
            className="flex flex-1 items-center justify-center rounded-2xl border border-white/10 bg-transparent px-4 py-3.5 text-sm font-medium text-zinc-300 transition-all hover:bg-white/[0.03] hover:text-white"
          >
            {library.sourceType === "custom" && library.contentType === "word"
              ? "管理词库"
              : "查看详情"}
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 p-4 sm:p-8">
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-blue-300/70">
          我的词库
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">所有词库</h1>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-zinc-400">
              你可以通过挑选或创建专属词库来控制每日新词的来源。所有的复习进度依然由底层的全局复习算法统一调度。目前自定义词库支持搭建单词集合，官方句法库支持浏览与直接练习。
            </p>
          </div>
          <Link
            href="/study"
            className="inline-flex items-center gap-2 rounded-xl border border-blue-500/20 bg-blue-500/10 px-4 py-3 text-sm font-medium text-blue-100 transition-all hover:bg-blue-500/15"
          >
            <Sparkles className="h-4 w-4" />
            返回学习界面
          </Link>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.45fr]">
        <div className="space-y-6">
          <form
            onSubmit={handleCreateManual}
            className="glass-panel rounded-3xl border border-white/[0.08] p-6"
          >
            <div className="flex items-center gap-2 text-white">
              <Plus className="h-4 w-4 text-blue-400" />
              <h2 className="text-lg font-semibold">创建自定义词库</h2>
            </div>
            <p className="mt-2 text-sm leading-7 text-zinc-400">
              你可以将全局存在的单词重新打包成属于你自己的主题词库。目前仅支持提取系统数据库中已有的词汇。
            </p>

            <div className="mt-5 space-y-4">
              <div>
                <label className="mb-2 block text-sm text-zinc-300">词库名称</label>
                <input
                  value={manualName}
                  onChange={(event) => setManualName(event.target.value)}
                  placeholder="例如：面试英语精华"
                  className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition-colors focus:border-blue-500/40"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-zinc-300">简要描述</label>
                <input
                  value={manualDescription}
                  onChange={(event) => setManualDescription(event.target.value)}
                  placeholder="简要说明此词库的用途"
                  className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition-colors focus:border-blue-500/40"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-zinc-300">导入单词列表</label>
                <textarea
                  value={wordsText}
                  onChange={(event) => setWordsText(event.target.value)}
                  placeholder={`每行一个单词，或直接粘贴列表。\n例如：\nimpact\nbear\nissue`}
                  className="h-52 w-full rounded-3xl border border-white/10 bg-[#09090b]/80 p-4 text-sm leading-7 text-zinc-100 outline-none transition-colors focus:border-blue-500/40"
                />
                <p className="mt-2 text-xs leading-6 text-zinc-500">
                  支持换行符、空格、逗号和分号分隔。如果无法匹配系统现有单词，会被提示出来。
                </p>
              </div>

              <button
                type="submit"
                disabled={isCreatingManual}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition-all disabled:bg-white/10 disabled:text-zinc-500"
              >
                <Plus className="h-4 w-4" />
                {isCreatingManual ? "创建中..." : "保存自定义词库"}
              </button>
            </div>

            <div className="mt-5">
              <ResultNotice result={manualResult} />
            </div>
          </form>

          <form
            onSubmit={handleCreateFromFavorites}
            className="glass-panel rounded-3xl border border-white/[0.08] p-6"
          >
            <div className="flex items-center gap-2 text-white">
              <Heart className="h-4 w-4 text-rose-400" />
              <h2 className="text-lg font-semibold">从收藏夹生成</h2>
            </div>
            <p className="mt-2 text-sm leading-7 text-zinc-400">
              你可以一键将当前收藏夹内的所有生词打包成一个独立词库，方便集中突击。
            </p>

            <div className="mt-4 rounded-2xl border border-rose-500/15 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
              目前的收藏单词数量: <span className="font-semibold">{favoriteCount}</span>
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <label className="mb-2 block text-sm text-zinc-300">新词库名称</label>
                <input
                  value={favoriteName}
                  onChange={(event) => setFavoriteName(event.target.value)}
                  placeholder="例如：遗忘词汇重点突击"
                  className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition-colors focus:border-rose-500/40"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-zinc-300">简要描述</label>
                <input
                  value={favoriteDescription}
                  onChange={(event) => setFavoriteDescription(event.target.value)}
                  placeholder="简述为什么要单独复习这些收藏"
                  className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition-colors focus:border-rose-500/40"
                />
              </div>

              <button
                type="submit"
                disabled={isCreatingFavorites || favoriteCount === 0}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-rose-600 px-4 py-3 text-sm font-semibold text-white transition-all disabled:bg-white/10 disabled:text-zinc-500"
              >
                <Heart className="h-4 w-4" />
                {isCreatingFavorites ? "创建中..." : "从收藏夹一键生成"}
              </button>
            </div>

            <div className="mt-5">
              <ResultNotice result={favoriteResult} fallbackLinkLabel="立刻学习该词库" />
            </div>
          </form>

          {deleteResult && <ResultNotice result={deleteResult} />}
        </div>

        <div className="space-y-8">
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-white">官方系统词库</h2>
              <span className="text-sm text-zinc-500">{officialLibraries.length}</span>
            </div>

            <div className="grid gap-4 md:grid-cols-2">{officialLibraries.map(renderLibraryCard)}</div>
          </section>

          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-white">我的自建词库</h2>
              <span className="text-sm text-zinc-500">{customLibraries.length}</span>
            </div>

            {customLibraries.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2">{customLibraries.map(renderLibraryCard)}</div>
            ) : (
              <div className="glass-panel rounded-3xl p-10 text-center text-zinc-400">
                你目前还没有创建任何自定义词库。赶快通过上手或收藏夹新建一个吧。
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
