"use client"

import type { ChangeEvent } from "react"
import { Settings } from "lucide-react"
import type { StudyLibrary, StudyView } from "../actions"

export function StudyToolbar({
  availableLibraries,
  librarySlug,
  studyView,
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
  disabled: boolean
  queuedCount: number
  loadingNext: boolean
  refillingQueue: boolean
  onLibraryChange: (event: ChangeEvent<HTMLSelectElement>) => void | Promise<void>
  onStudyViewChange: (event: ChangeEvent<HTMLSelectElement>) => void | Promise<void>
  onOpenSettings: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={librarySlug}
          onChange={onLibraryChange}
          disabled={disabled}
          className="rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-sm text-zinc-200"
        >
          <option value="all">全部词库</option>
          {availableLibraries.map((item) => (
            <option key={item.id} value={item.slug}>
              {item.name}
            </option>
          ))}
        </select>
        <select
          value={studyView}
          onChange={onStudyViewChange}
          disabled={disabled}
          className="rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-sm text-zinc-200"
        >
          <option value="all">全部单词</option>
          <option value="favorites">收藏</option>
          <option value="weak">弱项</option>
          <option value="recent_failures">最近失误</option>
        </select>
        <button
          type="button"
          onClick={onOpenSettings}
          className="rounded-lg p-2 text-zinc-400 transition-colors hover:bg-white/10 hover:text-white"
        >
          <Settings className="h-4 w-4" />
        </button>
      </div>

      <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">
        队列 {queuedCount} {loadingNext || refillingQueue ? (loadingNext ? "加载中" : "预取中") : ""}
      </div>
    </div>
  )
}
