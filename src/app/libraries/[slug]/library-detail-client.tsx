"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { type FormEvent, useState, useTransition } from "react"
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Plus,
  Search,
  Trash2,
} from "lucide-react"
import {
  addWordToLibrary,
  getLibraryWordsPage,
  importWordsToLibrary,
  removeWordFromLibrary,
  searchWordsToAdd,
  type LibraryBatchImportResult,
  type LibraryDetail,
  type LibraryWordMutationResult,
  type LibraryWordPage,
  type SearchableWord,
} from "./actions"

const OFFICIAL_LIBRARY_DESCRIPTIONS: Record<string, string> = {
  "cet-4": "大学英语四级核心词库",
  "cet-6": "大学英语六级核心词库",
}

function getLibraryProgress(counts: { wordCount: number; activeCount: number }) {
  if (counts.wordCount <= 0) {
    return 0
  }

  return Math.min(100, Math.round((counts.activeCount / counts.wordCount) * 100))
}

function getPlanStatusLabel(status: LibraryDetail["planStatus"]) {
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

function getLibraryDescription(library: Pick<LibraryDetail, "slug" | "sourceType" | "description">) {
  if (library.sourceType === "official") {
    return (
      OFFICIAL_LIBRARY_DESCRIPTIONS[library.slug] ??
      library.description ??
      "按词库组织新词来源，复习仍共享全局 SRS 和记忆进度。"
    )
  }

  return library.description || "按词库组织新词来源，复习仍共享全局 SRS 和记忆进度。"
}

function ResultNotice({ result }: { result: LibraryWordMutationResult | null }) {
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
      {result.message}
    </div>
  )
}

function BatchImportNotice({ result }: { result: LibraryBatchImportResult | null }) {
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
      {(typeof result.addedCount === "number" ||
        typeof result.alreadyExistsCount === "number" ||
        typeof result.matchedCount === "number") && (
        <p className="mt-2 text-xs opacity-90">
          匹配 {result.matchedCount ?? 0} / 新增 {result.addedCount ?? 0} / 已存在{" "}
          {result.alreadyExistsCount ?? 0}
        </p>
      )}
      {result.unmatchedWords && result.unmatchedWords.length > 0 && (
        <p className="mt-2 text-xs leading-6 opacity-90">
          未匹配：{result.unmatchedWords.join(", ")}
        </p>
      )}
    </div>
  )
}

export default function LibraryDetailClient({
  initialLibrary,
  initialWordPage,
}: {
  initialLibrary: LibraryDetail
  initialWordPage: LibraryWordPage
}) {
  const router = useRouter()
  const [wordPage, setWordPage] = useState(initialWordPage)
  const [libraryQueryInput, setLibraryQueryInput] = useState(initialWordPage.query)
  const [addQueryInput, setAddQueryInput] = useState("")
  const [batchWordsText, setBatchWordsText] = useState("")
  const [submittedAddQuery, setSubmittedAddQuery] = useState("")
  const [addResults, setAddResults] = useState<SearchableWord[]>([])
  const [mutationResult, setMutationResult] = useState<LibraryWordMutationResult | null>(null)
  const [batchImportResult, setBatchImportResult] = useState<LibraryBatchImportResult | null>(null)
  const [pendingWordId, setPendingWordId] = useState<string | null>(null)
  const [isLoadingWords, startLoadingWords] = useTransition()
  const [isSearchingAdd, startSearchingAdd] = useTransition()
  const [isMutating, startMutating] = useTransition()
  const [isImporting, startImporting] = useTransition()
  const library = initialLibrary
  const progress = getLibraryProgress(library)
  const allWordsIntroduced = library.wordCount > 0 && library.remainingCount === 0

  const runLibrarySearch = (query: string) => {
    setMutationResult(null)
    setBatchImportResult(null)
    startLoadingWords(async () => {
      const nextPage = await getLibraryWordsPage({
        librarySlug: library.slug,
        query,
      })
      setWordPage(nextPage)
    })
  }

  const loadMoreWords = () => {
    if (wordPage.nextOffset === null || wordPage.query) {
      return
    }

    setMutationResult(null)
    setBatchImportResult(null)
    startLoadingWords(async () => {
      const nextPage = await getLibraryWordsPage({
        librarySlug: library.slug,
        offset: wordPage.nextOffset ?? 0,
      })

      setWordPage((current) => ({
        items: [...current.items, ...nextPage.items],
        totalCount: nextPage.totalCount,
        nextOffset: nextPage.nextOffset,
        query: current.query,
      }))
    })
  }

  const handleSearchLibraryWords = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    runLibrarySearch(libraryQueryInput.trim())
  }

  const handleSearchWordsToAdd = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const query = addQueryInput.trim()
    setMutationResult(null)
    setBatchImportResult(null)
    setSubmittedAddQuery(query)

    startSearchingAdd(async () => {
      const results = await searchWordsToAdd(library.slug, query)
      setAddResults(results)
    })
  }

  const handleImportWords = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setMutationResult(null)
    setBatchImportResult(null)

    startImporting(async () => {
      const result = await importWordsToLibrary(library.slug, batchWordsText)
      setBatchImportResult(result)

      if (!result.ok) {
        return
      }

      setBatchWordsText("")
      setSubmittedAddQuery("")
      setAddQueryInput("")
      setAddResults([])
      router.refresh()
    })
  }

  const handleAddWord = (wordId: string) => {
    setMutationResult(null)
    setBatchImportResult(null)
    setPendingWordId(wordId)

    startMutating(async () => {
      const result = await addWordToLibrary(library.slug, wordId)
      setMutationResult(result)
      setPendingWordId(null)

      if (!result.ok) {
        return
      }

      setAddResults((current) =>
        current.map((item) =>
          item.id === wordId ? { ...item, alreadyInLibrary: true } : item
        )
      )
      router.refresh()
    })
  }

  const handleRemoveWord = (wordId: string) => {
    const confirmed = window.confirm("确定把这个单词从当前词库移除吗？")
    if (!confirmed) {
      return
    }

    setMutationResult(null)
    setBatchImportResult(null)
    setPendingWordId(wordId)

    startMutating(async () => {
      const result = await removeWordFromLibrary(library.slug, wordId)
      setMutationResult(result)
      setPendingWordId(null)

      if (!result.ok) {
        return
      }

      router.refresh()
    })
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 p-4 sm:p-8">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/libraries"
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-zinc-200 transition-colors hover:bg-white/10"
          >
            <ArrowLeft className="h-4 w-4" />
            返回词库
          </Link>

          <Link
            href={`/study?library=${encodeURIComponent(library.slug)}`}
            className="inline-flex items-center gap-2 rounded-xl border border-blue-500/20 bg-blue-500/10 px-4 py-2 text-sm font-medium text-blue-100 transition-colors hover:bg-blue-500/15"
          >
            进入学习
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="glass-panel rounded-3xl border border-white/[0.08] p-6">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-zinc-400">
                <BookOpen className="h-3.5 w-3.5" />
                {library.sourceType === "official" ? "Official" : "Custom"}
              </div>
              <h1 className="mt-4 text-3xl font-black tracking-tight text-white sm:text-4xl">
                {library.name}
              </h1>
              <p className="mt-3 text-sm leading-7 text-zinc-400">
                {getLibraryDescription(library)}
              </p>
            </div>

            <div className="grid min-w-0 grid-cols-2 gap-3 sm:min-w-[320px]">
              <div className="rounded-2xl border border-white/8 bg-black/20 p-4">
                <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Words</p>
                <p className="mt-2 text-2xl font-black text-white">{library.wordCount}</p>
              </div>
              <div className="rounded-2xl border border-white/8 bg-black/20 p-4">
                <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Due</p>
                <p className="mt-2 text-2xl font-black text-amber-200">{library.dueCount}</p>
              </div>
              <div className="rounded-2xl border border-white/8 bg-black/20 p-4">
                <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Started</p>
                <p className="mt-2 text-2xl font-black text-blue-200">{library.activeCount}</p>
              </div>
              <div className="rounded-2xl border border-white/8 bg-black/20 p-4">
                <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Remaining</p>
                <p className="mt-2 text-2xl font-black text-white">{library.remainingCount}</p>
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-white/8 bg-black/20 p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                  新词引入进度
                </p>
                <p className="mt-2 text-2xl font-black text-white">{progress}%</p>
              </div>
              <div className="text-sm text-zinc-400">
                {allWordsIntroduced
                  ? "这个词库的新词都已经进入学习流程。"
                  : `已开始 ${library.activeCount} / 未开始 ${library.remainingCount}`}
              </div>
            </div>

            <div className="mt-4 h-3 overflow-hidden rounded-full bg-white/8">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-400 via-cyan-300 to-emerald-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-zinc-400">
            <span>计划状态：{getPlanStatusLabel(library.planStatus)}</span>
            <span>每日新词：{library.dailyNewLimit ?? "未设置"}</span>
            <span>{library.isEditable ? "可编辑的自定义词库" : "官方词库只读"}</span>
          </div>
        </div>
      </div>

      <ResultNotice result={mutationResult} />
      <BatchImportNotice result={batchImportResult} />

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="space-y-4">
          <div className="glass-panel rounded-3xl border border-white/[0.08] p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-xl font-bold text-white">词库单词</h2>
                <p className="mt-1 text-sm text-zinc-400">
                  支持在当前词库内搜索。默认按加入顺序展示。
                </p>
              </div>
              <div className="text-sm text-zinc-500">
                已显示 {wordPage.items.length} / {wordPage.totalCount}
              </div>
            </div>

            <form
              onSubmit={handleSearchLibraryWords}
              className="mt-5 flex flex-col gap-3 sm:flex-row"
            >
              <input
                value={libraryQueryInput}
                onChange={(event) => setLibraryQueryInput(event.target.value)}
                placeholder="搜索当前词库中的单词"
                className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition-colors focus:border-blue-500/40"
              />
              <button
                type="submit"
                disabled={isLoadingWords}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white/10 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Search className="h-4 w-4" />
                {isLoadingWords ? "搜索中..." : "搜索"}
              </button>
            </form>

            <div className="mt-5 space-y-3">
              {wordPage.items.length > 0 ? (
                wordPage.items.map((item) => (
                  <div
                    key={item.wordId}
                    className="rounded-2xl border border-white/8 bg-black/20 p-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="text-lg font-bold text-white">{item.word}</span>
                          {typeof item.position === "number" ? (
                            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-zinc-400">
                              #{item.position}
                            </span>
                          ) : null}
                          {item.phonetic ? (
                            <span className="text-sm text-blue-200/80">{item.phonetic}</span>
                          ) : null}
                        </div>
                        <p className="mt-2 text-sm leading-7 text-zinc-300">{item.definition}</p>
                        {item.tags ? (
                          <p className="mt-2 text-xs text-zinc-500">标签：{item.tags}</p>
                        ) : null}
                      </div>

                      {library.isEditable ? (
                        <button
                          type="button"
                          onClick={() => handleRemoveWord(item.wordId)}
                          disabled={isMutating && pendingWordId === item.wordId}
                          className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-100 transition-colors hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          {isMutating && pendingWordId === item.wordId ? "移除中..." : "移除"}
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-white/8 bg-black/20 px-4 py-6 text-sm text-zinc-400">
                  {isLoadingWords ? "正在加载单词..." : "没有找到匹配的单词。"}
                </div>
              )}
            </div>

            {wordPage.nextOffset !== null && !wordPage.query ? (
              <button
                type="button"
                onClick={loadMoreWords}
                disabled={isLoadingWords}
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-zinc-100 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLoadingWords ? "加载中..." : "加载更多"}
              </button>
            ) : null}
          </div>
        </section>

        <aside className="space-y-4">
          <div className="glass-panel rounded-3xl border border-white/[0.08] p-6">
            <h2 className="text-xl font-bold text-white">
              {library.isEditable ? "搜索并加词" : "只读说明"}
            </h2>
            <p className="mt-2 text-sm leading-7 text-zinc-400">
              {library.isEditable
                ? "从全局单词表搜索现有单词，并追加到当前自定义词库。"
                : "官方词库当前只支持查看和进入学习，不支持手动加词或删词。"}
            </p>

            {library.isEditable ? (
              <>
                <form onSubmit={handleImportWords} className="mt-5 flex flex-col gap-3">
                  <textarea
                    value={batchWordsText}
                    onChange={(event) => setBatchWordsText(event.target.value)}
                    placeholder={"批量粘贴单词，每行一个或用逗号分隔"}
                    className="h-40 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm leading-7 text-white outline-none transition-colors focus:border-emerald-500/40"
                  />
                  <p className="text-xs leading-6 text-zinc-500">
                    批量导入会把新匹配到的单词追加到词库末尾，已存在的单词会自动跳过。
                  </p>
                  <button
                    type="submit"
                    disabled={isImporting}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Plus className="h-4 w-4" />
                    {isImporting ? "导入中..." : "批量导入单词"}
                  </button>
                </form>

                <div className="mt-6 h-px bg-white/10" />

                <form onSubmit={handleSearchWordsToAdd} className="mt-5 flex flex-col gap-3">
                  <input
                    value={addQueryInput}
                    onChange={(event) => setAddQueryInput(event.target.value)}
                    placeholder="搜索全局单词表中的单词"
                    className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition-colors focus:border-emerald-500/40"
                  />
                  <button
                    type="submit"
                    disabled={isSearchingAdd}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Search className="h-4 w-4" />
                    {isSearchingAdd ? "搜索中..." : "搜索可添加单词"}
                  </button>
                </form>

                <div className="mt-5 space-y-3">
                  {addResults.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-2xl border border-white/8 bg-black/20 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-white">{item.word}</span>
                            {item.phonetic ? (
                              <span className="text-xs text-blue-200/80">{item.phonetic}</span>
                            ) : null}
                          </div>
                          <p className="mt-2 text-sm leading-6 text-zinc-300">
                            {item.definition}
                          </p>
                          {item.tags ? (
                            <p className="mt-2 text-xs text-zinc-500">标签：{item.tags}</p>
                          ) : null}
                        </div>

                        <button
                          type="button"
                          onClick={() => handleAddWord(item.id)}
                          disabled={item.alreadyInLibrary || (isMutating && pendingWordId === item.id)}
                          className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-100 transition-colors hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          {item.alreadyInLibrary
                            ? "已在词库中"
                            : isMutating && pendingWordId === item.id
                              ? "加入中..."
                              : "加入"}
                        </button>
                      </div>
                    </div>
                  ))}

                  {submittedAddQuery && addResults.length === 0 && !isSearchingAdd ? (
                    <div className="rounded-2xl border border-white/8 bg-black/20 px-4 py-6 text-sm text-zinc-400">
                      没有找到可添加的匹配单词。
                    </div>
                  ) : null}
                </div>
              </>
            ) : (
              <div className="mt-5 rounded-2xl border border-white/8 bg-black/20 px-4 py-5 text-sm leading-7 text-zinc-400">
                如果后续要支持官方词库扩展，更合适的做法是“复制为自定义词库”后再维护，而不是直接修改官方词库。
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
