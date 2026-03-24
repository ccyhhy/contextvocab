"use client"

import Link from "next/link"
import {
  type ReactNode,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react"
import { AnimatePresence, motion } from "framer-motion"
import {
  BookMarked,
  ChevronDown,
  ChevronUp,
  Clock,
  History,
  MessageSquare,
  Search,
  SortAsc,
  Sparkles,
} from "lucide-react"
import {
  getGrammarAttemptHistory,
  getSentenceHistory,
  type GrammarAttemptRecord,
  type GrammarHistoryResult,
  type HistoryResult,
  type HistorySortBy,
  type SentenceRecord,
} from "./actions"

const SEARCH_DEBOUNCE_MS = 300
const EMPTY_GRAMMAR_HISTORY: GrammarHistoryResult = {
  attempts: [],
  total: 0,
  page: 1,
  pageSize: 15,
}

function ScoreBadge({ score }: { score: number }) {
  const isHigh = score >= 80;
  const isMid = score >= 60 && score < 80;
  
  const baseColor = isHigh 
    ? "from-green-500/20 to-emerald-500/10 border-green-500/30 text-green-400 shadow-[0_0_15px_rgba(34,197,94,0.15)]" 
    : isMid 
      ? "from-yellow-500/20 to-amber-500/10 border-yellow-500/30 text-yellow-400 shadow-[0_0_15px_rgba(234,179,8,0.15)]"
      : "from-red-500/20 to-rose-500/10 border-red-500/30 text-red-400 shadow-[0_0_15px_rgba(239,68,68,0.15)]";

  return (
    <span
      className={`inline-flex shrink-0 h-12 w-16 items-center justify-center rounded-2xl border bg-gradient-to-br text-base font-black tracking-tight ${baseColor}`}
    >
      {score}
    </span>
  )
}

function WordUsageBadge({ item }: { item: SentenceRecord }) {
  if (item.attemptStatus === "needs_help") {
    return (
      <span className="rounded-full border border-red-500/20 bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-300">
        需要帮助
      </span>
    )
  }

  if (item.isMetaSentence) {
    return (
      <span className="rounded-full border border-orange-500/20 bg-orange-500/10 px-2 py-0.5 text-[10px] font-medium text-orange-300">
        元句子
      </span>
    )
  }

  if (item.usageQuality === "weak") {
    return (
      <span className="rounded-full border border-yellow-500/20 bg-yellow-500/10 px-2 py-0.5 text-[10px] font-medium text-yellow-300">
        用法偏弱
      </span>
    )
  }

  return (
    <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
      用法到位
    </span>
  )
}

function GrammarStatusBadge({ item }: { item: GrammarAttemptRecord }) {
  if (!item.patternMatched) {
    return (
      <span className="rounded-full border border-red-500/20 bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-300">
        未命中结构
      </span>
    )
  }

  if (item.attemptStatus === "needs_help") {
    return (
      <span className="rounded-full border border-yellow-500/20 bg-yellow-500/10 px-2 py-0.5 text-[10px] font-medium text-yellow-300">
        需要重练
      </span>
    )
  }

  return (
    <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
      结构命中
    </span>
  )
}

function MetricBadge({
  label,
  value,
}: {
  label: string
  value: number | null | undefined
}) {
  if (typeof value !== "number") {
    return null
  }

  return (
    <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[10px] text-zinc-400">
      {label} {value}/5
    </span>
  )
}

function WordSentenceCard({ item }: { item: SentenceRecord }) {
  const [expanded, setExpanded] = useState(false)
  const date = new Date(item.created_at)

  return (
    <motion.div
      layout
      className="glass-panel overflow-hidden rounded-2xl transition-all hover:border-white/[0.12]"
    >
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        className="flex w-full items-center gap-4 px-5 py-4 text-left"
      >
        <ScoreBadge score={item.score} />
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-white">{item.word}</span>
            <WordUsageBadge item={item} />
            <span className="flex items-center gap-1 text-xs text-zinc-500">
              <Clock className="h-3 w-3" />
              {date.toLocaleDateString("zh-CN")}{" "}
              {date.toLocaleTimeString("zh-CN", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
          <p className="truncate text-sm text-zinc-400">{item.sentence}</p>
        </div>
        <motion.div
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="shrink-0 text-zinc-500"
        >
          <ChevronDown className="h-4 w-4" />
        </motion.div>
      </button>

      <AnimatePresence>
        {expanded ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t border-white/[0.06] px-5 pb-4 pt-0">
              <div className="mt-3 flex flex-wrap gap-2">
                <WordUsageBadge item={item} />
                <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] font-medium text-zinc-400">
                  {item.usesWordInContext ? "已在语境中使用" : "未在语境中使用"}
                </span>
              </div>

              <div className="mt-4 rounded-2xl border border-indigo-500/10 bg-gradient-to-br from-indigo-500/[0.05] to-purple-500/[0.02] p-5">
                <div className="mb-3 flex items-center gap-2 text-[11px] font-bold tracking-widest text-indigo-300 uppercase">
                  <Sparkles className="h-4 w-4 text-indigo-400" />
                  AI 评语
                </div>
                <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-indigo-100/90">
                  {item.feedback || "暂无评语。"}
                </p>
              </div>

              <div className="mt-3 rounded-xl border border-white/[0.04] bg-black/20 p-4">
                <p className="mb-2 text-[11px] uppercase tracking-wider text-zinc-500 font-medium">你的造句</p>
                <p className="text-[15px] italic text-zinc-300 leading-relaxed">&quot;{item.sentence}&quot;</p>
              </div>

              <div className="mt-3 flex justify-end">
                <Link
                  href={`/study?reviewSentenceId=${item.id}`}
                  className="inline-flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/10 px-4 py-2 text-sm text-blue-100 transition-colors hover:bg-blue-500/15"
                >
                  <History className="h-4 w-4" />
                  复习这句
                </Link>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.div>
  )
}

function GrammarAttemptCard({ item }: { item: GrammarAttemptRecord }) {
  const [expanded, setExpanded] = useState(false)
  const date = new Date(item.created_at)

  return (
    <motion.div
      layout
      className="glass-panel overflow-hidden rounded-2xl transition-all hover:border-white/[0.12]"
    >
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        className="flex w-full items-center gap-4 px-5 py-4 text-left"
      >
        <ScoreBadge score={item.score} />
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-white">{item.title}</span>
            <GrammarStatusBadge item={item} />
            <span className="flex items-center gap-1 text-xs text-zinc-500">
              <Clock className="h-3 w-3" />
              {date.toLocaleDateString("zh-CN")}{" "}
              {date.toLocaleTimeString("zh-CN", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
          <p className="truncate text-sm text-blue-200/85">{item.pattern}</p>
          <p className="mt-1 truncate text-sm text-zinc-400">{item.sentence}</p>
        </div>
        <motion.div
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="shrink-0 text-zinc-500"
        >
          <ChevronDown className="h-4 w-4" />
        </motion.div>
      </button>

      <AnimatePresence>
        {expanded ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t border-white/[0.06] px-5 pb-4 pt-0">
              <div className="mt-3 flex flex-wrap gap-2">
                <GrammarStatusBadge item={item} />
                <MetricBadge label="结构" value={item.structureAccuracy} />
                <MetricBadge label="场景" value={item.sceneFit} />
                <MetricBadge label="自然度" value={item.naturalness} />
              </div>

              <div className="mt-4 rounded-2xl border border-indigo-500/10 bg-gradient-to-br from-indigo-500/[0.05] to-purple-500/[0.02] p-5">
                <div className="mb-3 flex items-center gap-2 text-[11px] font-bold tracking-widest text-indigo-300 uppercase">
                  <Sparkles className="h-4 w-4 text-indigo-400" />
                  AI 评鉴
                </div>
                <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-indigo-100/90">
                  {item.feedback || "暂无评语。"}
                </p>
              </div>

              <div className="mt-3 rounded-xl border border-white/[0.04] bg-black/20 p-4">
                <p className="mb-2 text-[11px] uppercase tracking-wider text-zinc-500 font-medium">你的练习句子</p>
                <p className="text-[15px] italic text-zinc-300 leading-relaxed">&quot;{item.sentence}&quot;</p>
              </div>

              <div className="mt-3 flex justify-end">
                <Link
                  href={`/study?reviewGrammarAttemptId=${item.id}`}
                  className="inline-flex items-center gap-2 rounded-full border border-violet-500/20 bg-violet-500/10 px-4 py-2 text-sm text-violet-100 transition-colors hover:bg-violet-500/15"
                >
                  <History className="h-4 w-4" />
                  复习这句
                </Link>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.div>
  )
}

function SectionHeader({
  icon,
  title,
  total,
  description,
}: {
  icon: ReactNode
  title: string
  total: number
  description: string
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <div className="flex items-center gap-2 text-base font-semibold text-white">
          {icon}
          {title}
        </div>
        <p className="mt-1 text-sm text-zinc-500">{description}</p>
      </div>
      <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-zinc-400">
        共 {total} 条
      </span>
    </div>
  )
}

function HistorySectionSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className="glass-panel overflow-hidden rounded-2xl border border-white/[0.08] p-5"
        >
          <div className="animate-pulse space-y-3">
            <div className="flex items-start gap-4">
              <div className="h-10 w-14 rounded-xl bg-white/[0.06]" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="h-4 w-40 rounded bg-white/[0.06]" />
                <div className="h-3 w-64 rounded bg-white/[0.05]" />
              </div>
            </div>
            <div className="h-16 rounded-xl bg-white/[0.04]" />
          </div>
        </div>
      ))}
    </div>
  )
}

function Pagination({
  page,
  total,
  pageSize,
  onPageChange,
}: {
  page: number
  total: number
  pageSize: number
  onPageChange: (page: number) => void
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  if (totalPages <= 1) {
    return null
  }

  const pageNumbers = Array.from({ length: Math.min(totalPages, 7) }, (_, index) => {
    if (totalPages <= 7) {
      return index + 1
    }
    if (page <= 4) {
      return index + 1
    }
    if (page >= totalPages - 3) {
      return totalPages - 6 + index
    }
    return page - 3 + index
  })

  return (
    <div className="flex items-center justify-center gap-2 pt-4">
      <button
        type="button"
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        className="rounded-lg px-3 py-2 text-sm font-medium text-zinc-400 transition-all hover:bg-white/[0.06] hover:text-white disabled:pointer-events-none disabled:opacity-30"
      >
        <ChevronUp className="h-4 w-4 -rotate-90" />
      </button>

      {pageNumbers.map((pageNumber) => (
        <button
          key={pageNumber}
          type="button"
          onClick={() => onPageChange(pageNumber)}
          className={`h-9 w-9 rounded-lg text-sm font-medium transition-all ${
            pageNumber === page
              ? "bg-blue-600 text-white"
              : "text-zinc-400 hover:bg-white/[0.06] hover:text-white"
          }`}
        >
          {pageNumber}
        </button>
      ))}

      <button
        type="button"
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        className="rounded-lg px-3 py-2 text-sm font-medium text-zinc-400 transition-all hover:bg-white/[0.06] hover:text-white disabled:pointer-events-none disabled:opacity-30"
      >
        <ChevronUp className="h-4 w-4 rotate-90" />
      </button>
    </div>
  )
}

const sortOptions: Array<{ value: HistorySortBy; label: string }> = [
  { value: "newest", label: "最新优先" },
  { value: "oldest", label: "最早优先" },
  { value: "highest", label: "最高分优先" },
  { value: "lowest", label: "最低分优先" },
]

async function loadGrammarHistory({
  page,
  search,
  sortBy,
}: {
  page: number
  search: string
  sortBy: HistorySortBy
}) {
  try {
    return await getGrammarAttemptHistory({
      page,
      search,
      sortBy,
    })
  } catch (error) {
    console.error("Failed to load grammar history:", error)
    return {
      ...EMPTY_GRAMMAR_HISTORY,
      page,
    }
  }
}

async function loadSentenceHistory({
  page,
  search,
  sortBy,
}: {
  page: number
  search: string
  sortBy: HistorySortBy
}) {
  try {
    return await getSentenceHistory({
      page,
      search,
      sortBy,
    })
  } catch (error) {
    console.error("Failed to load sentence history:", error)
    return {
      sentences: [],
      total: 0,
      page,
      pageSize: 15,
    }
  }
}

export default function HistoryClient({
  initialSentenceData,
  initialGrammarData,
}: {
  initialSentenceData: HistoryResult
  initialGrammarData?: GrammarHistoryResult | null
}) {
  const [sentenceData, setSentenceData] =
    useState<HistoryResult>(initialSentenceData)
  const [grammarData, setGrammarData] = useState<GrammarHistoryResult>(
    initialGrammarData ?? EMPTY_GRAMMAR_HISTORY
  )
  const [grammarLoading, setGrammarLoading] = useState(initialGrammarData == null)
  const [searchInput, setSearchInput] = useState("")
  const deferredSearch = useDeferredValue(searchInput)
  const [appliedSearch, setAppliedSearch] = useState("")
  const [sortBy, setSortBy] = useState<HistorySortBy>("newest")
  const [isPending, startTransition] = useTransition()
  const didMountRef = useRef(false)
  const latestCombinedRequestRef = useRef(0)
  const latestSentenceRequestRef = useRef(0)
  const latestGrammarRequestRef = useRef(0)
  const latestInitialGrammarRequestRef = useRef(0)
  const appliedSearchRef = useRef(appliedSearch)
  const sortByRef = useRef(sortBy)

  useEffect(() => {
    appliedSearchRef.current = appliedSearch
  }, [appliedSearch])

  useEffect(() => {
    sortByRef.current = sortBy
  }, [sortBy])

  useEffect(() => {
    if (initialGrammarData !== null && initialGrammarData !== undefined) {
      return
    }

    const requestId = ++latestInitialGrammarRequestRef.current

    startTransition(() => {
      void (async () => {
        const result = await loadGrammarHistory({
          page: 1,
          search: appliedSearchRef.current,
          sortBy: sortByRef.current,
        })

        if (latestInitialGrammarRequestRef.current === requestId) {
          setGrammarData(result)
          setGrammarLoading(false)
        }
      })()
    })
  }, [initialGrammarData, startTransition])

  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true
      return
    }

    const nextSearch = deferredSearch.trim()
    const timer = window.setTimeout(() => {
      setAppliedSearch(nextSearch)
      const requestId = ++latestCombinedRequestRef.current
      setGrammarLoading(true)

      startTransition(() => {
        void (async () => {
          const [nextSentenceData, nextGrammarData] = await Promise.all([
            loadSentenceHistory({
              page: 1,
              search: nextSearch,
              sortBy: sortByRef.current,
            }),
            loadGrammarHistory({
              page: 1,
              search: nextSearch,
              sortBy: sortByRef.current,
            }),
          ])

          if (latestCombinedRequestRef.current === requestId) {
            setSentenceData(nextSentenceData)
            setGrammarData(nextGrammarData)
            setGrammarLoading(false)
          }
        })()
      })
    }, SEARCH_DEBOUNCE_MS)

    return () => window.clearTimeout(timer)
  }, [deferredSearch, startTransition])

  const handleSortChange = (value: HistorySortBy) => {
    setSortBy(value)
    const requestId = ++latestCombinedRequestRef.current
    setGrammarLoading(true)

    startTransition(() => {
      void (async () => {
        const [nextSentenceData, nextGrammarData] = await Promise.all([
          loadSentenceHistory({
            page: 1,
            search: appliedSearchRef.current,
            sortBy: value,
          }),
          loadGrammarHistory({
            page: 1,
            search: appliedSearchRef.current,
            sortBy: value,
          }),
        ])

        if (latestCombinedRequestRef.current === requestId) {
          setSentenceData(nextSentenceData)
          setGrammarData(nextGrammarData)
          setGrammarLoading(false)
        }
      })()
    })
  }

  const handleSentencePageChange = (page: number) => {
    const requestId = ++latestSentenceRequestRef.current

    startTransition(() => {
      void (async () => {
        const result = await loadSentenceHistory({
          page,
          search: appliedSearchRef.current,
          sortBy: sortByRef.current,
        })

        if (latestSentenceRequestRef.current === requestId) {
          setSentenceData(result)
        }
      })()
    })

    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const handleGrammarPageChange = (page: number) => {
    const requestId = ++latestGrammarRequestRef.current
    setGrammarLoading(true)

    startTransition(() => {
      void (async () => {
        const result = await loadGrammarHistory({
          page,
          search: appliedSearchRef.current,
          sortBy: sortByRef.current,
        })

        if (latestGrammarRequestRef.current === requestId) {
          setGrammarData(result)
          setGrammarLoading(false)
        }
      })()
    })

    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  return (
    <div
      className="mx-auto w-full max-w-5xl space-y-8 p-4 sm:p-8"
      aria-busy={isPending}
    >
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
          历史复习
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          单词造句 {sentenceData.total} 条，句法练习 {grammarData.total} 条。
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="flex flex-col gap-3 sm:flex-row"
      >
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="搜索单词、句法或造句..."
            className="w-full rounded-xl border border-white/10 bg-black/40 py-2.5 pl-10 pr-4 text-sm text-zinc-200 outline-none transition-all placeholder:text-zinc-600 focus:border-blue-500/50"
          />
        </div>

        <div className="relative">
          <SortAsc className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <select
            value={sortBy}
            onChange={(event) =>
              handleSortChange(event.target.value as HistorySortBy)
            }
            className="cursor-pointer appearance-none rounded-xl border border-white/10 bg-black/40 py-2.5 pl-10 pr-8 text-sm text-zinc-200 outline-none transition-all focus:border-blue-500/50"
          >
            {sortOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </motion.div>

      <section className={`space-y-4 transition-opacity ${isPending ? "opacity-80" : ""}`}>
        <SectionHeader
          icon={<BookMarked className="h-4 w-4 text-blue-300" />}
          title="单词造句历史"
          total={sentenceData.total}
          description="回看你写过的单词句子，并从原句直接进入复习。"
        />

        {sentenceData.sentences.length === 0 ? (
          <div className="glass-panel rounded-2xl p-12 text-center">
            <p className="text-sm text-zinc-500">
              {appliedSearch
                ? "没有找到匹配的单词造句记录。"
                : "还没有单词造句记录，先去学习一轮吧。"}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {sentenceData.sentences.map((item, index) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.03, duration: 0.3 }}
              >
                <WordSentenceCard item={item} />
              </motion.div>
            ))}
          </div>
        )}

        <Pagination
          page={sentenceData.page}
          total={sentenceData.total}
          pageSize={sentenceData.pageSize}
          onPageChange={handleSentencePageChange}
        />
      </section>

      <section
        className={`space-y-4 transition-opacity ${grammarLoading ? "opacity-90" : ""}`}
      >
        <SectionHeader
          icon={<Sparkles className="h-4 w-4 text-violet-300" />}
          title="句法练习历史"
          total={grammarData.total}
          description="回看你练过的句法结构，并用原句快速重新练一遍。"
        />

        {grammarLoading && grammarData.attempts.length === 0 ? (
          <HistorySectionSkeleton />
        ) : grammarData.attempts.length === 0 ? (
          <div className="glass-panel rounded-2xl p-12 text-center">
            <p className="text-sm text-zinc-500">
              {appliedSearch
                ? "没有找到匹配的句法练习记录。"
                : "还没有句法练习记录，去 grammar 词库里试几张卡吧。"}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {grammarData.attempts.map((item, index) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.03, duration: 0.3 }}
              >
                <GrammarAttemptCard item={item} />
              </motion.div>
            ))}
          </div>
        )}

        <Pagination
          page={grammarData.page}
          total={grammarData.total}
          pageSize={grammarData.pageSize}
          onPageChange={handleGrammarPageChange}
        />
      </section>
    </div>
  )
}
