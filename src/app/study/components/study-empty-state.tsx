"use client"

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
}: {
  availableLibraries: StudyLibrary[]
  librarySlug: string
  studyView: StudyView
  loading?: boolean
  selectedLibraryContentType?: StudyContentType | null
  onLibraryChange: (value: string) => void | Promise<void>
  onStudyViewChange: (value: string) => void | Promise<void>
  onRefresh: () => void | Promise<void>
}) {
  const isGrammarLibrary = selectedLibraryContentType === "grammar"
  const message = loading
    ? isGrammarLibrary
      ? "正在加载当前筛选下的句法卡片..."
      : "正在加载当前筛选下的学习内容..."
    : isGrammarLibrary
      ? "当前筛选下还没有可学习的句法卡片。"
      : "当前筛选下还没有可学习的单词。"

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
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CustomDropdown
            value={librarySlug}
            onChange={onLibraryChange}
            options={libraryOptions}
          />

          <CustomDropdown
            value={studyView}
            onChange={onStudyViewChange}
            options={viewOptions}
          />

          {isGrammarLibrary ? (
            <div className="rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-sm text-zinc-300">
              句法模式
            </div>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => void onRefresh()}
          className="rounded-lg bg-white/10 px-4 py-2 text-sm text-white"
        >
          刷新
        </button>
      </div>

      <div className="glass-panel rounded-3xl p-10 text-center text-zinc-300">
        {message}
      </div>
    </div>
  )
}
