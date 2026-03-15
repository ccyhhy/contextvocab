"use client"

import { BookOpen, Heart, Lightbulb, Volume2 } from "lucide-react"
import type { StudyBatchItem } from "../actions"
import { getPriorityLabel, getSceneTagLabel, getUsageRegisterLabel, shouldHighlightPriority } from "./study-ui"

export function StudyWordPanel({
  currentWord,
  isFavorite,
  favoritePending,
  isSubmitting,
  onToggleFavorite,
  onPlayAudio,
  onApplySentenceHelp,
  loadingNext,
}: {
  currentWord: StudyBatchItem
  isFavorite: boolean
  favoritePending: boolean
  isSubmitting: boolean
  onToggleFavorite: () => void
  onPlayAudio: (text: string) => void
  onApplySentenceHelp: (text: string) => void
  loadingNext: boolean
}) {
  const wordProfile = currentWord.words.profile ?? null
  const wordExamples =
    (currentWord.words.examples ?? []).length > 0
      ? currentWord.words.examples ?? []
      : currentWord.words.example
        ? [{ sentence: currentWord.words.example, translation: null, scene: null, isPrimary: true }]
        : []
  const previewExamples = [...wordExamples]
    .sort((left, right) => {
      const leftScore = (left.translation ? 10 : 0) + (left.scene && left.scene !== "general" ? 3 : 0)
      const rightScore = (right.translation ? 10 : 0) + (right.scene && right.scene !== "general" ? 3 : 0)
      return rightScore - leftScore
    })
    .slice(0, 2)
  const primaryDefinition = wordProfile?.coreMeaning?.trim() || currentWord.words.definition || ""
  const secondaryDefinition =
    wordProfile?.coreMeaning?.trim() &&
    currentWord.words.definition &&
    wordProfile.coreMeaning.trim() !== currentWord.words.definition.trim()
      ? currentWord.words.definition
      : null
  const sceneTags = wordProfile?.sceneTags ?? []
  const collocations = wordProfile?.collocations.slice(0, 6) ?? []
  const contrastWords = wordProfile?.contrastWords.slice(0, 2) ?? []
  const usageRegisterLabel = getUsageRegisterLabel(wordProfile?.usageRegister)

  return (
    <div className={`glass-panel rounded-3xl p-8 ${loadingNext ? "pointer-events-none opacity-50 blur-sm" : ""}`}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex min-h-8 items-center gap-2">
          {shouldHighlightPriority(currentWord.priorityReason) ? (
            <span className="rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-300">
              {getPriorityLabel(currentWord.priorityReason)}
            </span>
          ) : null}
        </div>

        <button
          type="button"
          onClick={onToggleFavorite}
          disabled={favoritePending || isSubmitting}
          className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs ${
            isFavorite
              ? "border-rose-500/30 bg-rose-500/12 text-rose-300"
              : "border-white/10 text-zinc-400"
          }`}
        >
          <Heart className={`h-3.5 w-3.5 ${isFavorite ? "fill-current" : ""}`} />
          {isFavorite ? "已收藏" : "收藏"}
        </button>
      </div>

      <div className="mb-4 flex items-center gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-4">
            <h1 className="text-5xl font-extrabold text-white">{currentWord.words.word}</h1>
            <button
              type="button"
              onClick={() => onPlayAudio(currentWord.words.word)}
              className="text-zinc-500 transition-colors hover:text-blue-400"
            >
              <Volume2 className="h-6 w-6" />
            </button>
          </div>
          {currentWord.words.phonetic ? (
            <p className="mt-2 text-base font-medium tracking-[0.08em] text-blue-200/80">
              {currentWord.words.phonetic}
            </p>
          ) : null}
        </div>
      </div>

      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 text-zinc-300">
        <div className="flex items-start gap-3">
          <BookOpen className="mt-1 h-5 w-5 shrink-0 text-blue-400/70" />
          <div className="space-y-2">
            <p>{primaryDefinition}</p>
            {secondaryDefinition ? <p className="text-sm leading-7 text-zinc-500">{secondaryDefinition}</p> : null}
          </div>
        </div>
      </div>

      {(wordProfile || previewExamples.length > 0) && (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {(wordProfile?.semanticFeel || wordProfile?.usageNote) && (
            <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-5 md:col-span-2">
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                <Lightbulb className="h-3.5 w-3.5 text-amber-300/70" />
                使用画像
              </div>
              {wordProfile?.semanticFeel ? (
                <p className="mt-3 text-sm leading-7 text-zinc-200">{wordProfile.semanticFeel}</p>
              ) : null}
              {wordProfile?.usageNote ? (
                <p className="mt-3 text-sm leading-7 text-zinc-400">{wordProfile.usageNote}</p>
              ) : null}
            </div>
          )}

          {(sceneTags.length > 0 || collocations.length > 0 || usageRegisterLabel) && (
            <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-5">
              <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">场景与搭配</p>
              {sceneTags.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {sceneTags.map((tag) => (
                    <span
                      key={`${currentWord.word_id}-scene-${tag}`}
                      className="rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-xs text-blue-100"
                    >
                      {getSceneTagLabel(tag)}
                    </span>
                  ))}
                  {usageRegisterLabel ? (
                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-300">
                      {usageRegisterLabel}
                    </span>
                  ) : null}
                </div>
              ) : null}
              {collocations.length > 0 ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {collocations.map((item) => (
                    <span
                      key={`${currentWord.word_id}-collocation-${item}`}
                      className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-200"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          )}

          {previewExamples.length > 0 && (
            <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">可仿写例句</p>
                <span className="text-[11px] text-zinc-500">点击可直接填入</span>
              </div>
              <div className="mt-3 space-y-3">
                {previewExamples.map((item) => (
                  <button
                    key={`${currentWord.word_id}-preview-${item.sentence}`}
                    type="button"
                    onClick={() => onApplySentenceHelp(item.sentence)}
                    className="block w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3 text-left transition-colors hover:bg-white/5"
                  >
                    <div className="text-sm leading-7 text-zinc-100">{item.sentence}</div>
                    {item.translation ? (
                      <div className="mt-1 text-xs leading-6 text-zinc-500">{item.translation}</div>
                    ) : null}
                  </button>
                ))}
              </div>
            </div>
          )}

          {contrastWords.length > 0 && (
            <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-5 md:col-span-2">
              <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">近义提醒</p>
              <div className="mt-3 space-y-3">
                {contrastWords.map((item) => (
                  <div
                    key={`${currentWord.word_id}-contrast-${item.word}`}
                    className="text-sm leading-7 text-zinc-300"
                  >
                    <span className="font-semibold text-white">{item.word}</span>
                    <span className="text-zinc-400">: {item.note}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {currentWord.words.tags ? <p className="mt-3 text-xs text-zinc-500">标签：{currentWord.words.tags}</p> : null}
    </div>
  )
}
