"use client"

import { Clock3, History, RotateCcw } from "lucide-react"
import type { HistoryReviewContext } from "../actions"

export function StudyHistoryReviewPanel({
  review,
  onReuseSentence,
}: {
  review: HistoryReviewContext
  onReuseSentence: (sentence: string) => void
}) {
  const createdAt = new Date(review.createdAt)
  const targetLabel = review.targetKind === "grammar" ? "目标结构" : "目标词"

  return (
    <div className="glass-panel rounded-2xl border border-amber-500/15 bg-amber-500/[0.05] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-amber-100">
          <History className="h-4 w-4 text-amber-300" />
          历史造句复习
        </div>

        <button
          type="button"
          onClick={() => onReuseSentence(review.sentence)}
          className="inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-100 transition-colors hover:bg-amber-500/15"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          填入原句
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
        <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
          {targetLabel}：{review.title}
        </span>
        {review.subtitle ? (
          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
            {review.subtitle}
          </span>
        ) : null}
        <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
          上次得分：{review.score}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
          <Clock3 className="h-3 w-3" />
          {createdAt.toLocaleDateString("zh-CN")}{" "}
          {createdAt.toLocaleTimeString("zh-CN", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>

      <div className="mt-4 rounded-xl border border-white/[0.06] bg-black/20 p-4">
        <p className="text-xs text-zinc-500">你上次写的是</p>
        <p className="mt-2 text-sm italic leading-7 text-zinc-100">
          &quot;{review.sentence}&quot;
        </p>
      </div>

      {review.feedback ? (
        <div className="mt-3 rounded-xl border border-white/[0.06] bg-black/20 p-4">
          <p className="text-xs text-zinc-500">上次 AI 反馈</p>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-zinc-300">
            {review.feedback}
          </p>
        </div>
      ) : null}
    </div>
  )
}
