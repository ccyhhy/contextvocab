import { Loader2, Inbox } from "lucide-react"
import { motion } from "framer-motion"
import type { StudyContentType } from "@/lib/study-content"
import type { StudyLibrary, StudyView } from "../actions"
import { CustomDropdown, officialLibraryNames } from "./study-toolbar"

export function StudyEmptyState({
  availableLibraries,
  librarySlug,
  studyView,
  loading = false,
  selectedLibraryContentType,
  onLibraryChange,
  onStudyViewChange,
  onRefresh,
  onLibraryDropdownOpenChange,
  onLibraryOptionHover,
}: {
  availableLibraries: StudyLibrary[]
  librarySlug: string
  studyView: StudyView
  loading?: boolean
  selectedLibraryContentType?: StudyContentType | null
  onLibraryChange: (value: string) => void | Promise<void>
  onStudyViewChange: (value: string) => void | Promise<void>
  onRefresh: () => void | Promise<void>
  onLibraryDropdownOpenChange?: (open: boolean) => void
  onLibraryOptionHover?: (value: string) => void
}) {
  const isGrammarLibrary = selectedLibraryContentType === "grammar"

  const libraryOptions = [{ label: "全部词库", value: "all" }, ...availableLibraries.map(item => ({
    label: officialLibraryNames[item.slug] ?? item.name,
    value: item.slug
  }))]

  const grammarViews = [
    { label: "全部句法卡", value: "all" },
    { label: "薄弱项", value: "weak" },
    { label: "最近失败", value: "recent_failures" }
  ]

  const wordViews = [
    { label: "全部单词", value: "all" },
    { label: "收藏", value: "favorites" },
    { label: "薄弱项", value: "weak" },
    { label: "最近失败", value: "recent_failures" }
  ]

  const viewOptions = isGrammarLibrary ? grammarViews : wordViews

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 pt-4 sm:pt-8 relative z-10">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <CustomDropdown
            value={librarySlug}
            onChange={onLibraryChange}
            options={libraryOptions}
            onOpenChange={onLibraryDropdownOpenChange}
            onOptionHover={onLibraryOptionHover}
          />

          <CustomDropdown
            value={studyView}
            onChange={onStudyViewChange}
            options={viewOptions}
          />

          {isGrammarLibrary ? (
            <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 px-3 py-2 text-sm font-medium tracking-wide text-blue-200">
              句法模式
            </div>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => void onRefresh()}
          className="rounded-xl border border-white/5 bg-white/5 px-5 py-2.5 text-sm font-medium text-white transition-all hover:bg-white/10 active:scale-95 sm:ml-auto"
        >
          强制刷新
        </button>
      </div>

      <div className="glass-panel flex min-h-[460px] flex-col items-center justify-center rounded-3xl p-12 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_0_80px_rgba(0,0,0,0.5)] bg-black/40">
        {loading ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center space-y-6"
          >
            <div className="relative flex h-24 w-24 items-center justify-center rounded-[2rem] bg-gradient-to-tr from-blue-600/20 to-emerald-500/20 shadow-[0_0_60px_rgba(59,130,246,0.15)] border border-white/10 backdrop-blur-md">
              <Loader2 className="h-10 w-10 animate-spin text-blue-400 drop-shadow-lg" />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-bold tracking-tight text-white drop-shadow-sm">正在调度学习流...</h3>
              <p className="text-sm text-zinc-400 max-w-sm">
                正在根据你的进度和历史记录为你准备下一批{isGrammarLibrary ? "训练卡片" : "词汇模块"}
              </p>
            </div>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center space-y-6"
          >
            <div className="flex h-24 w-24 items-center justify-center rounded-[2rem] bg-white/[0.03] border border-white/[0.06] shadow-inner">
              <Inbox className="h-10 w-10 text-zinc-500" />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-bold tracking-tight text-white">空荡荡的队列</h3>
              <p className="text-sm text-zinc-400 max-w-sm">
                {isGrammarLibrary ? "当前筛选下还没有可接触的句法卡片。" : "当前词库或筛选下没有待复习的单词。"}
              </p>
            </div>
            {studyView !== "all" && (
              <button
                type="button"
                onClick={() => onStudyViewChange("all")}
                className="mt-4 rounded-xl border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition-all hover:bg-white/10 hover:shadow-[0_0_20px_rgba(255,255,255,0.05)]"
              >
                切换为全部视图
              </button>
            )}
          </motion.div>
        )}
      </div>
    </div>
  )
}
