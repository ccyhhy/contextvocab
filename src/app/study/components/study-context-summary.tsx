"use client"

import type { StudyLibrary, StudyView } from "../actions"
import { getPlanStatusLabel, getStudyViewLabel } from "./study-ui"

export function StudyContextSummary({
  selectedLibrary,
  studyView,
  hasLoadedSidebarSummary,
  currentQueueCount,
}: {
  selectedLibrary: StudyLibrary | null
  studyView: StudyView
  hasLoadedSidebarSummary: boolean
  currentQueueCount: number
}) {
  return (
    <div className="glass-panel rounded-2xl px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-zinc-300">
        <span className="text-zinc-500">词库</span>
        <span className="font-medium text-white">{selectedLibrary?.name ?? "全部词库"}</span>
        <span className="text-zinc-500">视图</span>
        <span>{getStudyViewLabel(studyView)}</span>
        {selectedLibrary ? (
          <>
            <span className="text-zinc-500">计划</span>
            <span>{hasLoadedSidebarSummary ? getPlanStatusLabel(selectedLibrary.planStatus) : "加载中"}</span>
            <span className="text-zinc-500">待复习</span>
            <span>{hasLoadedSidebarSummary ? selectedLibrary.dueCount : "..."}</span>
            <span className="text-zinc-500">未学</span>
            <span>{hasLoadedSidebarSummary ? selectedLibrary.remainingCount : "..."}</span>
          </>
        ) : (
          <>
            <span className="text-zinc-500">当前队列</span>
            <span>{currentQueueCount}</span>
          </>
        )}
      </div>
    </div>
  )
}
