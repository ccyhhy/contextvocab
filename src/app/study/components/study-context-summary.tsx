"use client"

import { BookOpen, Layers, Target, Clock, Zap } from "lucide-react"
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
    <div className="glass-panel overflow-hidden rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Left: Library & View Info */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-xl bg-white/[0.04] px-3 py-1.5 border border-white/[0.05]">
            <BookOpen className="h-4 w-4 text-blue-400" />
            <span className="text-sm font-semibold text-white">
              {selectedLibrary?.name ?? "全部词库"}
            </span>
          </div>
          
          <div className="h-4 w-px bg-white/10 hidden sm:block"></div>
          
          <div className="flex items-center gap-2">
            <Layers className="h-3.5 w-3.5 text-zinc-500" />
            <span className="text-xs font-medium text-zinc-400">视图：</span>
            <span className="rounded-lg bg-blue-500/10 px-2.5 py-1 text-xs font-medium text-blue-300 border border-blue-500/20">
              {getStudyViewLabel(studyView)}
            </span>
          </div>
        </div>

        {/* Right: Stats */}
        <div className="flex flex-wrap items-center gap-4 text-sm">
          {selectedLibrary ? (
            <>
              <div className="flex flex-col sm:items-end">
                <span className="text-[10px] uppercase tracking-wider text-zinc-500 flex items-center gap-1 mb-0.5">
                  <Target className="h-3 w-3" /> 计划状态
                </span>
                <span className="font-medium text-zinc-300">
                  {hasLoadedSidebarSummary ? getPlanStatusLabel(selectedLibrary.planStatus) : "加载中..."}
                </span>
              </div>
              
              <div className="h-8 w-px bg-white/10 hidden sm:block"></div>
              
              <div className="flex gap-4 rounded-xl bg-white/[0.02] p-2 border border-white/[0.05]">
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase tracking-wider text-zinc-500 flex items-center gap-1 mb-0.5">
                    <Clock className="h-3 w-3 text-amber-500/70" /> 待复习
                  </span>
                  <span className="font-bold text-amber-100 pl-4">
                    {hasLoadedSidebarSummary ? selectedLibrary.dueCount : "..."}
                  </span>
                </div>
                
                <div className="w-px bg-white/10 my-1"></div>
                
                <div className="flex flex-col pr-2">
                  <span className="text-[10px] uppercase tracking-wider text-zinc-500 flex items-center gap-1 mb-0.5">
                    <BookOpen className="h-3 w-3 text-emerald-500/70" /> 待学习
                  </span>
                  <span className="font-bold text-emerald-100 pl-4">
                    {hasLoadedSidebarSummary ? selectedLibrary.remainingCount : "..."}
                  </span>
                </div>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-3 rounded-xl bg-violet-500/10 px-4 py-2 border border-violet-500/20">
              <Zap className="h-4 w-4 text-violet-400" />
              <div className="flex flex-col">
                <span className="text-[10px] uppercase tracking-wider text-violet-300/70">当前队列</span>
                <span className="font-bold text-violet-200 leading-none mt-0.5">{currentQueueCount} <span className="text-[10px] font-normal text-violet-300">项</span></span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
