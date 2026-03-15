"use client"

import type { ChangeEvent } from "react"
import type { StudyLibrary, StudyView } from "../actions"

export function StudyEmptyState({
  availableLibraries,
  librarySlug,
  studyView,
  onLibraryChange,
  onStudyViewChange,
  onRefresh,
}: {
  availableLibraries: StudyLibrary[]
  librarySlug: string
  studyView: StudyView
  onLibraryChange: (event: ChangeEvent<HTMLSelectElement>) => void | Promise<void>
  onStudyViewChange: (event: ChangeEvent<HTMLSelectElement>) => void | Promise<void>
  onRefresh: () => void | Promise<void>
}) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <select
            value={librarySlug}
            onChange={onLibraryChange}
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
            className="rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-sm text-zinc-200"
          >
            <option value="all">全部单词</option>
            <option value="favorites">收藏</option>
            <option value="weak">弱项</option>
            <option value="recent_failures">最近失误</option>
          </select>
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
        当前条件下没有可学习的单词了。
      </div>
    </div>
  )
}
