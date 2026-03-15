"use client"

import { Lightbulb, SkipForward, Sparkles } from "lucide-react"

export function StudySentenceComposer({
  word,
  sentence,
  inputRef,
  showSentenceHelp,
  isSubmitting,
  isPracticeMode,
  onSentenceChange,
  onSubmit,
  onToggleHelp,
  onSkip,
}: {
  word: string
  sentence: string
  inputRef: React.RefObject<HTMLTextAreaElement | null>
  showSentenceHelp: boolean
  isSubmitting: boolean
  isPracticeMode: boolean
  onSentenceChange: (value: string) => void
  onSubmit: () => void
  onToggleHelp: () => void
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
        placeholder={`请用 "${word}" 造句...`}
        className="h-36 rounded-3xl border border-white/10 bg-[#09090b]/80 p-5 text-lg text-zinc-100 outline-none focus:border-blue-500/50"
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onToggleHelp}
          className="inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-4 py-2 text-sm text-amber-200"
        >
          <Lightbulb className="h-4 w-4" />
          {showSentenceHelp ? "收起造句辅助" : "我不会造句，给我提示"}
        </button>

        <button
          type="button"
          onClick={onSkip}
          className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm text-zinc-300"
        >
          <SkipForward className="h-4 w-4" />
          跳过
        </button>

        <button
          type="submit"
          disabled={!sentence.trim() || isSubmitting}
          className="ml-auto inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white disabled:bg-white/10 disabled:text-zinc-500"
        >
          {isSubmitting ? (
            "AI 评估中..."
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              {isPracticeMode ? "提交重写" : "提交"}
            </>
          )}
        </button>
      </div>
    </form>
  )
}
