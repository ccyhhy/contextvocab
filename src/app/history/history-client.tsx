"use client"

import {
  useDeferredValue,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react"
import { AnimatePresence, motion } from "framer-motion"
import { ChevronDown, ChevronUp, Clock, MessageSquare, Search, SortAsc } from "lucide-react"
import {
  getSentenceHistory,
  type HistoryResult,
  type HistorySortBy,
  type SentenceRecord,
} from "./actions"

const SEARCH_DEBOUNCE_MS = 300

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 80
      ? "text-green-400 bg-green-500/10 border-green-500/20"
      : score >= 60
        ? "text-yellow-400 bg-yellow-500/10 border-yellow-500/20"
        : "text-red-400 bg-red-500/10 border-red-500/20"

  return (
    <span className={`inline-flex h-10 w-14 items-center justify-center rounded-xl border text-sm font-bold ${color}`}>
      {score}
    </span>
  )
}

function UsageBadge({ item }: { item: SentenceRecord }) {
  if (item.attemptStatus === "needs_help") {
    return (
      <span className="rounded-full border border-red-500/20 bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-300">
        Need Help
      </span>
    )
  }

  if (item.isMetaSentence) {
    return (
      <span className="rounded-full border border-orange-500/20 bg-orange-500/10 px-2 py-0.5 text-[10px] font-medium text-orange-300">
        Meta
      </span>
    )
  }

  if (item.usageQuality === "weak") {
    return (
      <span className="rounded-full border border-yellow-500/20 bg-yellow-500/10 px-2 py-0.5 text-[10px] font-medium text-yellow-300">
        Weak
      </span>
    )
  }

  return (
    <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
      In Context
    </span>
  )
}

function SentenceCard({ item }: { item: SentenceRecord }) {
  const [expanded, setExpanded] = useState(false)
  const date = new Date(item.created_at)

  return (
    <motion.div
      layout
      className="glass-panel overflow-hidden rounded-2xl transition-all hover:border-white/[0.12]"
    >
      <button
        onClick={() => setExpanded((current) => !current)}
        className="flex w-full items-center gap-4 px-5 py-4 text-left"
      >
        <ScoreBadge score={item.score} />
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            <span className="text-sm font-semibold text-white">{item.word}</span>
            <UsageBadge item={item} />
            <span className="flex items-center gap-1 text-xs text-zinc-500">
              <Clock className="h-3 w-3" />
              {date.toLocaleDateString("zh-CN")}{" "}
              {date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
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
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t border-white/[0.06] px-5 pb-4 pt-0">
              <div className="mt-3 flex flex-wrap gap-2">
                <UsageBadge item={item} />
                <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] font-medium text-zinc-400">
                  {item.usesWordInContext ? "Used In Context" : "Not In Context"}
                </span>
              </div>

              <div className="mt-3 rounded-xl border border-white/[0.05] bg-[#09090b]/60 p-4">
                <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-zinc-500">
                  <MessageSquare className="h-3 w-3" />
                  AI 评语
                </div>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">
                  {item.feedback || "暂无评语。"}
                </p>
              </div>

              <div className="mt-3 rounded-lg border border-white/[0.04] bg-white/[0.02] p-3">
                <p className="mb-1 text-xs text-zinc-500">你的造句</p>
                <p className="text-sm italic text-zinc-200">&quot;{item.sentence}&quot;</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

const sortOptions: Array<{ value: HistorySortBy; label: string }> = [
  { value: "newest", label: "最新优先" },
  { value: "oldest", label: "最早优先" },
  { value: "highest", label: "最高分优先" },
  { value: "lowest", label: "最低分优先" },
]

export default function HistoryClient({ initialData }: { initialData: HistoryResult }) {
  const [data, setData] = useState<HistoryResult>(initialData)
  const [searchInput, setSearchInput] = useState("")
  const deferredSearch = useDeferredValue(searchInput)
  const [appliedSearch, setAppliedSearch] = useState("")
  const [sortBy, setSortBy] = useState<HistorySortBy>("newest")
  const [isPending, startTransition] = useTransition()
  const didMountRef = useRef(false)
  const latestRequestRef = useRef(0)
  const appliedSearchRef = useRef(appliedSearch)
  const sortByRef = useRef(sortBy)

  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize))

  useEffect(() => {
    appliedSearchRef.current = appliedSearch
  }, [appliedSearch])

  useEffect(() => {
    sortByRef.current = sortBy
  }, [sortBy])

  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true
      return
    }

    const nextSearch = deferredSearch.trim()
    const timer = window.setTimeout(() => {
      setAppliedSearch(nextSearch)
      const requestId = ++latestRequestRef.current

      startTransition(async () => {
        const result = await getSentenceHistory({
          page: 1,
          search: nextSearch,
          sortBy: sortByRef.current,
        })

        if (latestRequestRef.current === requestId) {
          setData(result)
        }
      })
    }, SEARCH_DEBOUNCE_MS)

    return () => window.clearTimeout(timer)
  }, [deferredSearch, startTransition])

  const handleSortChange = (value: HistorySortBy) => {
    setSortBy(value)
    const requestId = ++latestRequestRef.current

    startTransition(async () => {
      const result = await getSentenceHistory({
        page: 1,
        search: appliedSearchRef.current,
        sortBy: value,
      })

      if (latestRequestRef.current === requestId) {
        setData(result)
      }
    })
  }

  const handlePageChange = (newPage: number) => {
    const requestId = ++latestRequestRef.current

    startTransition(async () => {
      const result = await getSentenceHistory({
        page: newPage,
        search: appliedSearchRef.current,
        sortBy: sortByRef.current,
      })

      if (latestRequestRef.current === requestId) {
        setData(result)
      }
    })

    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-4 sm:p-8" aria-busy={isPending}>
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">历史记录</h1>
        <p className="mt-1 text-sm text-zinc-500">共 {data.total} 条造句记录</p>
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
            placeholder="搜索单词或句子..."
            className="w-full rounded-xl border border-white/10 bg-black/40 py-2.5 pl-10 pr-4 text-sm text-zinc-200 outline-none transition-all placeholder:text-zinc-600 focus:border-blue-500/50"
          />
        </div>

        <div className="relative">
          <SortAsc className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <select
            value={sortBy}
            onChange={(event) => handleSortChange(event.target.value as HistorySortBy)}
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

      <div className={`space-y-2 transition-opacity ${isPending ? "opacity-50" : ""}`}>
        {data.sentences.length === 0 ? (
          <div className="glass-panel rounded-2xl p-12 text-center">
            <p className="text-sm text-zinc-500">
              {appliedSearch ? "没有找到匹配的记录。" : "还没有造句记录，先去学习一轮。"}
            </p>
          </div>
        ) : (
          data.sentences.map((item, index) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.03, duration: 0.3 }}
            >
              <SentenceCard item={item} />
            </motion.div>
          ))
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <button
            onClick={() => handlePageChange(data.page - 1)}
            disabled={data.page <= 1}
            className="rounded-lg px-3 py-2 text-sm font-medium text-zinc-400 transition-all hover:bg-white/[0.06] hover:text-white disabled:pointer-events-none disabled:opacity-30"
          >
            <ChevronUp className="h-4 w-4 -rotate-90" />
          </button>

          {Array.from({ length: Math.min(totalPages, 7) }, (_, index) => {
            let pageNum: number
            if (totalPages <= 7) {
              pageNum = index + 1
            } else if (data.page <= 4) {
              pageNum = index + 1
            } else if (data.page >= totalPages - 3) {
              pageNum = totalPages - 6 + index
            } else {
              pageNum = data.page - 3 + index
            }

            return (
              <button
                key={pageNum}
                onClick={() => handlePageChange(pageNum)}
                className={`h-9 w-9 rounded-lg text-sm font-medium transition-all ${
                  pageNum === data.page
                    ? "bg-blue-600 text-white"
                    : "text-zinc-400 hover:bg-white/[0.06] hover:text-white"
                }`}
              >
                {pageNum}
              </button>
            )
          })}

          <button
            onClick={() => handlePageChange(data.page + 1)}
            disabled={data.page >= totalPages}
            className="rounded-lg px-3 py-2 text-sm font-medium text-zinc-400 transition-all hover:bg-white/[0.06] hover:text-white disabled:pointer-events-none disabled:opacity-30"
          >
            <ChevronUp className="h-4 w-4 rotate-90" />
          </button>
        </div>
      )}
    </div>
  )
}
