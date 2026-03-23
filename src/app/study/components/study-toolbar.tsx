"use client"

import type { ChangeEvent } from "react"
import { Settings } from "lucide-react"
import type { StudyContentType } from "@/lib/study-content"
import type { StudyLibrary, StudyView } from "../actions"

export function StudyToolbar({
  availableLibraries,
  librarySlug,
  studyView,
  selectedLibraryContentType,
  disabled,
  queuedCount,
  loadingNext,
  refillingQueue,
  onLibraryChange,
  onStudyViewChange,
  onOpenSettings,
}: {
  availableLibraries: StudyLibrary[]
  librarySlug: string
  studyView: StudyView
  selectedLibraryContentType?: StudyContentType | null
  disabled: boolean
  queuedCount: number
  loadingNext: boolean
  refillingQueue: boolean
  onLibraryChange: (event: ChangeEvent<HTMLSelectElement>) => void | Promise<void>
  onStudyViewChange: (event: ChangeEvent<HTMLSelectElement>) => void | Promise<void>
  onOpenSettings: () => void
}) {
  const isGrammarLibrary = selectedLibraryContentType === "grammar"
  const queueLabel =
    loadingNext || refillingQueue
      ? queuedCount > 0
        ? `队列 ${queuedCount}`
        : "后续队列补充中"
      : `队列 ${queuedCount}`

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={librarySlug}
          onChange={onLibraryChange}
          disabled={disabled}
          className="cursor-pointer rounded-xl border border-white/10 bg-black/60 px-4 py-2 text-sm font-medium text-zinc-200 outline-none transition-all hover:bg-black/80 focus:border-white/20 focus:ring-2 focus:ring-white/10"
        >
          <option value="all">全部词库</option>
          {availableLibraries.map((item) => (
            <option key={item.id} value={item.slug}>
              {item.name}
            </option>
          ))}
        </select>

        {isGrammarLibrary ? (
          <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 px-4 py-2 text-sm font-medium tracking-wide text-blue-200">
            句法模式
          </div>
        ) : (
          <select
            value={studyView}
            onChange={onStudyViewChange}
            disabled={disabled}
            className="cursor-pointer rounded-xl border border-white/10 bg-black/60 px-4 py-2 text-sm font-medium text-zinc-200 outline-none transition-all hover:bg-black/80 focus:border-white/20 focus:ring-2 focus:ring-white/10"
          >
            <option value="all">全部单词</option>
            <option value="favorites">收藏</option>
            <option value="weak">薄弱项</option>
            <option value="recent_failures">最近失败</option>
          </select>
        )}

        <button
          type="button"
          onClick={onOpenSettings}
          className="rounded-xl p-2.5 text-zinc-400 transition-all duration-300 hover:rotate-90 hover:bg-white/10 hover:text-white active:scale-95"
        >
          <Settings className="h-4 w-4" />
        </button>
      </div>

      <div className="flex items-center gap-2 rounded-full border border-white/5 bg-white/5 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
        <span className="text-zinc-400">{queueLabel}</span>
        {loadingNext || refillingQueue ? (
          <span className="flex items-center gap-1.5 text-blue-400">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" />
            </span>
            {loadingNext ? "加载中" : "补充中"}
          </span>
        ) : null}
      </div>
    </div>
  )
}
