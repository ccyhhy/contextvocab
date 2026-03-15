"use client"

import { X } from "lucide-react"
import type { SentenceHelpItem } from "../actions"
import type { SentenceHelpState } from "../hooks/use-sentence-help"
import { getSentenceHelpItemSourceLabel } from "./study-ui"

export function StudySentenceHelpPanel({
  visible,
  sourceLabel,
  state,
  items,
  onClose,
  onApply,
}: {
  visible: boolean
  sourceLabel: string
  state: SentenceHelpState
  items: SentenceHelpItem[]
  onClose: () => void
  onApply: (text: string) => void
}) {
  if (!visible) {
    return null
  }

  return (
    <div className="glass-panel rounded-3xl border border-amber-500/15 bg-amber-500/[0.05] p-6 text-sm text-zinc-300">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="font-medium text-white">先填一个最短可用句子</div>
          <p className="mt-1 text-xs text-zinc-400">点任意一条会直接填入输入框，你可以再改。</p>
          {sourceLabel ? (
            <p className="mt-1 text-[11px] tracking-[0.12em] text-amber-300/70">{sourceLabel}</p>
          ) : null}
        </div>
        <button type="button" onClick={onClose} className="text-zinc-400">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-2">
        {state === "loading" && (
          <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-zinc-400">
            正在生成更贴合这个单词的造句提示...
          </div>
        )}

        {state === "ready" && items.length === 0 && (
          <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-zinc-400">
            暂时没有生成到可用提示，直接参考释义先写一个短句也可以。
          </div>
        )}

        {items.map((item) => (
          <button
            key={`${item.source}-${item.sentence}`}
            type="button"
            onClick={() => onApply(item.sentence)}
            className="block w-full rounded-xl border border-white/10 px-3 py-3 text-left hover:bg-white/5"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="text-sm leading-relaxed text-zinc-100">{item.sentence}</div>
              <span className="shrink-0 rounded-full border border-amber-400/20 bg-amber-400/10 px-2 py-1 text-[10px] font-medium text-amber-100">
                {getSentenceHelpItemSourceLabel(item.source)}
              </span>
            </div>
            <div className="mt-1 text-xs leading-6 text-amber-200/80">{item.cue}</div>
          </button>
        ))}
      </div>
    </div>
  )
}
