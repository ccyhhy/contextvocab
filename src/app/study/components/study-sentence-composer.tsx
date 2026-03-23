"use client"

import type { RefObject } from "react"
import { Lightbulb, SkipForward, Sparkles } from "lucide-react"

export function StudySentenceComposer({
  targetLabel,
  sentence,
  inputRef,
  showSentenceHelp = false,
  showHelpButton = true,
  isSubmitting,
  isPracticeMode,
  placeholderText,
  submitLabel,
  skipLabel = "跳过",
  onSentenceChange,
  onSubmit,
  onToggleHelp,
  onSkip,
}: {
  targetLabel: string
  sentence: string
  inputRef: RefObject<HTMLTextAreaElement | null>
  showSentenceHelp?: boolean
  showHelpButton?: boolean
  isSubmitting: boolean
  isPracticeMode: boolean
  placeholderText?: string
  submitLabel?: string
  skipLabel?: string
  onSentenceChange: (value: string) => void
  onSubmit: () => void
  onToggleHelp?: () => void
  onSkip: () => void
}) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit()
      }}
      className="flex flex-col gap-4"
    >
      <textarea
        ref={inputRef}
        value={sentence}
        onChange={(event) => onSentenceChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault()
            if (sentence.trim() && !isSubmitting) {
              onSubmit()
            }
          }
        }}
        placeholder={placeholderText ?? `请用 "${targetLabel}" 造句...`}
        className="h-36 resize-none rounded-3xl border border-white/10 bg-black/40 p-6 text-lg text-zinc-100 outline-none transition-all duration-300 placeholder:text-zinc-600 focus:border-blue-500/50 focus:bg-black/60 focus:ring-4 focus:ring-blue-500/10"
      />

      <div className="flex flex-wrap items-center gap-2">
        {showHelpButton ? (
          <button
            type="button"
            onClick={onToggleHelp}
            className="inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-4 py-2 text-sm text-amber-200 transition-colors hover:bg-amber-500/20"
          >
            <Lightbulb className="h-4 w-4" />
            {showSentenceHelp ? "收起提示" : "显示提示"}
          </button>
        ) : null}

        <button
          type="button"
          onClick={onSkip}
          className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm text-zinc-300 transition-colors hover:bg-white/5"
        >
          <SkipForward className="h-4 w-4" />
          {skipLabel}
        </button>

        <button
          type="submit"
          disabled={!sentence.trim() || isSubmitting}
          className="ml-auto inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 transition-all duration-300 hover:-translate-y-0.5 hover:bg-blue-500 disabled:translate-y-0 disabled:bg-white/10 disabled:text-zinc-500 disabled:shadow-none"
        >
          {isSubmitting ? (
            "AI 评估中..."
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              {submitLabel ?? (isPracticeMode ? "提交重写" : "提交")}
            </>
          )}
        </button>
      </div>
    </form>
  )
}
