"use client"

import type { StudyEnrichmentProgress } from "../actions"
import { EnrichmentProgressBar } from "./study-ui"

type StudySidebarState = "loading" | "ready" | "error"

export function StudyEnrichmentSummary({
  selectedEnrichmentProgress,
  studySidebarState,
}: {
  selectedEnrichmentProgress: StudyEnrichmentProgress | null
  studySidebarState: StudySidebarState
}) {
  if (selectedEnrichmentProgress) {
    return (
      <div className="glass-panel rounded-2xl px-4 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">词库完善进度</div>
            <div className="mt-1 text-sm text-zinc-300">
              当前显示 <span className="font-medium text-white">{selectedEnrichmentProgress.name}</span>
            </div>
          </div>
          <div className="text-right text-xs text-zinc-500">
            <div>
              例句覆盖 {selectedEnrichmentProgress.exampleWords} / {selectedEnrichmentProgress.totalWords}
            </div>
          </div>
        </div>

        <div className="mt-4 space-y-4">
          <EnrichmentProgressBar
            label="基础覆盖"
            value={selectedEnrichmentProgress.coveredWords}
            total={selectedEnrichmentProgress.totalWords}
            barClassName="bg-gradient-to-r from-sky-500 to-cyan-400"
          />
          <EnrichmentProgressBar
            label="深度精修"
            value={selectedEnrichmentProgress.refinedWords}
            total={selectedEnrichmentProgress.totalWords}
            barClassName="bg-gradient-to-r from-emerald-500 to-teal-400"
          />
        </div>

        <div className="mt-3 text-xs leading-6 text-zinc-500">
          基础覆盖表示已有核心义、场景和搭配。深度精修表示已有更完整的语义说明、辨析或高质量例句。
        </div>
      </div>
    )
  }

  if (studySidebarState === "loading") {
    return (
      <div className="glass-panel rounded-2xl px-4 py-4">
        <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">词库完善进度</div>
        <div className="mt-2 text-sm text-zinc-300">正在后台加载词库摘要和完善进度，单词学习可以先开始。</div>
      </div>
    )
  }

  if (studySidebarState === "error") {
    return (
      <div className="glass-panel rounded-2xl px-4 py-4">
        <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">词库完善进度</div>
        <div className="mt-2 text-sm text-amber-200">词库统计暂时加载失败，但当前学习批次不受影响。</div>
      </div>
    )
  }

  return null
}
