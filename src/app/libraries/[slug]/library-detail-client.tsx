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
  getLibraryGrammarPage,
  getLibraryWordsPage,
  importWordsToLibrary,
  removeWordFromLibrary,
  searchWordsToAdd,
  type LibraryBatchImportResult,
  type LibraryDetail,
  type LibraryDetailGrammarItem,
  type LibraryGrammarPage,
  type LibraryWordMutationResult,
  type LibraryWordPage,
  type SearchableWord,
} from "./actions"

const OFFICIAL_LIBRARY_DESCRIPTIONS: Record<string, string> = {
  "cet-4": "大学英语四级核心词汇库。",
  "cet-6": "大学英语六级核心词汇库。",
  "basic-scene-grammar": "覆盖高频结构与句型骨架的基础场景句法库。",
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
      "将学习内容按词库组织，同时继续共用同一套学习进度与复习系统。"
    )
  }

  return (
    library.description ??
    "将学习内容按词库组织，同时继续共用同一套学习进度与复习系统。"
  )
}

function getContentTypeLabel(contentType: LibraryDetail["contentType"]) {
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

function getItemLabel(contentType: LibraryDetail["contentType"]) {
  return contentType === "grammar" ? "条目" : "单词"
}

function getProgressLabel(contentType: LibraryDetail["contentType"]) {
  return contentType === "grammar" ? "已接触进度" : "学习进度"
}

function buildStudyHref(librarySlug: string, studyView: "all" | "weak" | "recent_failures") {
  const params = new URLSearchParams({ library: librarySlug })
  if (studyView !== "all") {
    params.set("view", studyView)
  }
  return `/study?${params.toString()}`
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

function GrammarCard({ item }: { item: LibraryDetailGrammarItem }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-black/20 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-lg font-bold text-white">{item.title}</span>
            {typeof item.position === "number" ? (
              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-zinc-400">
                #{item.position}
              </span>
            ) : null}
            <span className="rounded-full border border-blue-500/20 bg-blue-500/10 px-2 py-1 text-[11px] text-blue-100">
              {item.family}
            </span>
          </div>
          <p className="mt-2 text-sm font-medium text-blue-200/90">{item.pattern}</p>
          <p className="mt-3 text-sm leading-7 text-zinc-300">{item.coreExplanation}</p>
          {item.usageNote ? (
            <p className="mt-2 text-sm leading-7 text-zinc-400">{item.usageNote}</p>
          ) : null}
              {item.sceneTags.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {item.sceneTags.map((tag) => (
                <span
                  key={`${item.grammarItemId}-scene-${tag}`}
                  className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-zinc-300"
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
          {item.primaryTemplate ? (
            <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3 text-sm text-zinc-200">
              <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">模板</p>
              <p className="mt-2">{item.primaryTemplate}</p>
            </div>
          ) : null}
          {item.primaryExample ? (
            <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3 text-sm text-zinc-200">
              <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">例句</p>
              <p className="mt-2">{item.primaryExample}</p>
              {item.primaryExampleTranslation ? (
                <p className="mt-1 text-xs leading-6 text-zinc-500">
                  {item.primaryExampleTranslation}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export default function LibraryDetailClient({
  initialLibrary,
  initialWordPage,
  initialGrammarPage,
}: {
  initialLibrary: LibraryDetail
  initialWordPage: LibraryWordPage | null
  initialGrammarPage: LibraryGrammarPage | null
}) {
  const router = useRouter()
  const library = initialLibrary
  const isGrammarLibrary = library.contentType === "grammar"
  const [wordPage, setWordPage] = useState<LibraryWordPage>(
    initialWordPage ?? { items: [], totalCount: 0, nextOffset: null, query: "" }
  )
  const [grammarPage, setGrammarPage] = useState<LibraryGrammarPage>(
    initialGrammarPage ?? { items: [], totalCount: 0, nextOffset: null, query: "" }
  )
  const [libraryQueryInput, setLibraryQueryInput] = useState(
    isGrammarLibrary ? (initialGrammarPage?.query ?? "") : (initialWordPage?.query ?? "")
  )
  const [addQueryInput, setAddQueryInput] = useState("")
  const [batchWordsText, setBatchWordsText] = useState("")
  const [submittedAddQuery, setSubmittedAddQuery] = useState("")
  const [addResults, setAddResults] = useState<SearchableWord[]>([])
  const [mutationResult, setMutationResult] = useState<LibraryWordMutationResult | null>(null)
  const [batchImportResult, setBatchImportResult] = useState<LibraryBatchImportResult | null>(null)
  const [pendingWordId, setPendingWordId] = useState<string | null>(null)
  const [isLoadingItems, startLoadingItems] = useTransition()
  const [isSearchingAdd, startSearchingAdd] = useTransition()
  const [isMutating, startMutating] = useTransition()
  const [isImporting, startImporting] = useTransition()
  const progress = getLibraryProgress(library)
  const allItemsIntroduced = library.wordCount > 0 && library.remainingCount === 0
  const itemLabel = getItemLabel(library.contentType)
  const progressLabel = getProgressLabel(library.contentType)

  const runLibrarySearch = (query: string) => {
    setMutationResult(null)
    setBatchImportResult(null)
    startLoadingItems(async () => {
      if (isGrammarLibrary) {
        const nextPage = await getLibraryGrammarPage({
          librarySlug: library.slug,
          query,
        })
        setGrammarPage(nextPage)
        return
      }

      const nextPage = await getLibraryWordsPage({
        librarySlug: library.slug,
        query,
      })
      setWordPage(nextPage)
    })
  }

  const loadMoreItems = () => {
    if (isGrammarLibrary) {
      if (grammarPage.nextOffset === null || grammarPage.query) {
        return
      }

      setMutationResult(null)
      setBatchImportResult(null)
      startLoadingItems(async () => {
        const nextPage = await getLibraryGrammarPage({
          librarySlug: library.slug,
          offset: grammarPage.nextOffset ?? 0,
        })

        setGrammarPage((current) => ({
          items: [...current.items, ...nextPage.items],
          totalCount: nextPage.totalCount,
          nextOffset: nextPage.nextOffset,
          query: current.query,
        }))
      })
      return
    }

    if (wordPage.nextOffset === null || wordPage.query) {
      return
    }

    setMutationResult(null)
    setBatchImportResult(null)
    startLoadingItems(async () => {
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

  const handleSearchLibraryItems = (event: FormEvent<HTMLFormElement>) => {
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
        current.map((item) => (item.id === wordId ? { ...item, alreadyInLibrary: true } : item))
      )
      router.refresh()
    })
  }

  const handleRemoveWord = (wordId: string) => {
    const confirmed = window.confirm("确定要把这个单词从当前词库中移除吗？")
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
            href={buildStudyHref(library.slug, "all")}
            className="inline-flex items-center gap-2 rounded-xl border border-blue-500/20 bg-blue-500/10 px-4 py-2 text-sm font-medium text-blue-100 transition-colors hover:bg-blue-500/15"
          >
            开始学习
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="glass-panel rounded-3xl border border-white/[0.08] p-6">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-zinc-400">
                  <BookOpen className="h-3.5 w-3.5" />
                  {library.sourceType === "official" ? "官方" : "自定义"}
                </div>
                <div className="inline-flex items-center rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-blue-100">
                  {getContentTypeLabel(library.contentType)}
                </div>
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
                <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">{itemLabel}</p>
                <p className="mt-2 text-2xl font-black text-white">{library.wordCount}</p>
              </div>
              <div className="rounded-2xl border border-white/8 bg-black/20 p-4">
                <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">待复习</p>
                <p className="mt-2 text-2xl font-black text-amber-200">{library.dueCount}</p>
              </div>
              <div className="rounded-2xl border border-white/8 bg-black/20 p-4">
                <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">已开始</p>
                <p className="mt-2 text-2xl font-black text-blue-200">{library.activeCount}</p>
              </div>
              <div className="rounded-2xl border border-white/8 bg-black/20 p-4">
                <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">未开始</p>
                <p className="mt-2 text-2xl font-black text-white">{library.remainingCount}</p>
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-white/8 bg-black/20 p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                  {progressLabel}
                </p>
                <p className="mt-2 text-2xl font-black text-white">{progress}%</p>
              </div>
              <div className="text-sm text-zinc-400">
                {allItemsIntroduced
                  ? "这个词库里的计划内容都已经进入你的学习流了。"
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
            <span>每日新内容：{library.dailyNewLimit ?? "未设置"}</span>
            <span>
              {library.isEditable && !isGrammarLibrary
                ? "可编辑自定义词库"
                : "只读词库"}
            </span>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href={buildStudyHref(library.slug, "all")}
              className="inline-flex items-center gap-2 rounded-xl border border-blue-500/20 bg-blue-500/10 px-4 py-2 text-sm font-medium text-blue-100 transition-colors hover:bg-blue-500/15"
            >
              开始学习
            </Link>
            <Link
              href={buildStudyHref(library.slug, "weak")}
              className="inline-flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-100 transition-colors hover:bg-amber-500/15"
            >
              练薄弱项
            </Link>
            <Link
              href={buildStudyHref(library.slug, "recent_failures")}
              className="inline-flex items-center gap-2 rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-2 text-sm font-medium text-rose-100 transition-colors hover:bg-rose-500/15"
            >
              练最近失败
            </Link>
          </div>
        </div>
      </div>

      {!isGrammarLibrary ? <ResultNotice result={mutationResult} /> : null}
      {!isGrammarLibrary ? <BatchImportNotice result={batchImportResult} /> : null}

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="space-y-4">
          <div className="glass-panel rounded-3xl border border-white/[0.08] p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-xl font-bold text-white">
                  {isGrammarLibrary ? "句法条目" : "词库内容"}
                </h2>
                <p className="mt-1 text-sm text-zinc-400">
                  {isGrammarLibrary
                    ? "搜索这个句法词库中已经收录的结构卡。"
                    : "搜索这个词库里已经收录的单词。默认顺序沿用词库顺序。"}
                </p>
              </div>
              <div className="text-sm text-zinc-500">
                当前显示{" "}
                {isGrammarLibrary ? grammarPage.items.length : wordPage.items.length} /{" "}
                {isGrammarLibrary ? grammarPage.totalCount : wordPage.totalCount}
              </div>
            </div>

            <form
              onSubmit={handleSearchLibraryItems}
              className="mt-5 flex flex-col gap-3 sm:flex-row"
            >
              <input
                value={libraryQueryInput}
                onChange={(event) => setLibraryQueryInput(event.target.value)}
                placeholder={isGrammarLibrary ? "搜索结构名称或标题" : "搜索词库中的单词"}
                className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition-colors focus:border-blue-500/40"
              />
              <button
                type="submit"
                disabled={isLoadingItems}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white/10 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Search className="h-4 w-4" />
                {isLoadingItems ? "搜索中..." : "搜索"}
              </button>
            </form>

            <div className="mt-5 space-y-3">
              {isGrammarLibrary ? (
                grammarPage.items.length > 0 ? (
                  grammarPage.items.map((item) => (
                    <GrammarCard key={item.grammarItemId} item={item} />
                  ))
                ) : (
                  <div className="rounded-2xl border border-white/8 bg-black/20 px-4 py-6 text-sm text-zinc-400">
                    {isLoadingItems ? "正在加载句法条目..." : "没有找到匹配的句法条目。"}
                  </div>
                )
              ) : wordPage.items.length > 0 ? (
                wordPage.items.map((item) => (
                  <div key={item.wordId} className="rounded-2xl border border-white/8 bg-black/20 p-4">
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
                  {isLoadingItems ? "正在加载单词..." : "没有找到匹配的单词。"}
                </div>
              )}
            </div>

            {((isGrammarLibrary && grammarPage.nextOffset !== null && !grammarPage.query) ||
              (!isGrammarLibrary && wordPage.nextOffset !== null && !wordPage.query)) && (
              <button
                type="button"
                onClick={loadMoreItems}
                disabled={isLoadingItems}
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-zinc-100 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLoadingItems ? "加载中..." : "加载更多"}
              </button>
            )}
          </div>
        </section>

        <aside className="space-y-4">
          <div className="glass-panel rounded-3xl border border-white/[0.08] p-6">
            <h2 className="text-xl font-bold text-white">
              {library.isEditable && !isGrammarLibrary ? "搜索并添加单词" : "说明"}
            </h2>
            <p className="mt-2 text-sm leading-7 text-zinc-400">
              {library.isEditable && !isGrammarLibrary
                ? "从全局词表里搜索现有单词，并把它们追加到这个自定义词库中。"
                : isGrammarLibrary
                  ? "句法词库目前在词库页仍是只读浏览模式。你可以先在这里查阅卡片，再去学习页练习。"
                  : "官方词库目前在词库页是只读的。如果你想自定义内容，建议先复制到自己的自定义单词词库。"}
            </p>

            {library.isEditable && !isGrammarLibrary ? (
              <>
                <form onSubmit={handleImportWords} className="mt-5 flex flex-col gap-3">
                  <textarea
                    value={batchWordsText}
                    onChange={(event) => setBatchWordsText(event.target.value)}
                    placeholder="每行一个单词，或用逗号分隔多个单词"
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
                    placeholder="搜索全局词表"
                    className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition-colors focus:border-emerald-500/40"
                  />
                  <button
                    type="submit"
                    disabled={isSearchingAdd}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Search className="h-4 w-4" />
                    {isSearchingAdd ? "搜索中..." : "搜索可添加的单词"}
                  </button>
                </form>

                <div className="mt-5 space-y-3">
                  {addResults.map((item) => (
                    <div key={item.id} className="rounded-2xl border border-white/8 bg-black/20 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-white">{item.word}</span>
                            {item.phonetic ? (
                              <span className="text-xs text-blue-200/80">{item.phonetic}</span>
                            ) : null}
                          </div>
                          <p className="mt-2 text-sm leading-6 text-zinc-300">{item.definition}</p>
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
                            ? "已添加"
                            : isMutating && pendingWordId === item.id
                              ? "添加中..."
                              : "添加"}
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
                {isGrammarLibrary
                  ? "这里目前主要用于浏览句法卡片。后续如果要补句法词库编辑能力，可以在不改学习模型的前提下继续加。"
                  : "这个官方词库目前在词库页里是只读的。"}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
