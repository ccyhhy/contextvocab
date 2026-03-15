"use client"

import { ArrowRight, AlertTriangle, CheckCircle2, GraduationCap, Lightbulb, PenLine, Volume2, Wand2 } from "lucide-react"
import { motion } from "framer-motion"
import type { EvaluationResult, StudySubmissionResult } from "../actions"
import { AnimatedScore, ErrorTag, SubScoreBar } from "./study-ui"

function EvaluationDetails({
  evaluation,
  sentence,
  onPlayAudio,
}: {
  evaluation: EvaluationResult
  sentence: string
  onPlayAudio: (text: string) => void
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2.5">
        <SubScoreBar label="语法" score={evaluation.grammarScore} color="bg-gradient-to-r from-blue-500 to-blue-400" />
        <SubScoreBar label="用词" score={evaluation.wordUsageScore} color="bg-gradient-to-r from-emerald-500 to-emerald-400" />
        <SubScoreBar label="自然度" score={evaluation.naturalness} color="bg-gradient-to-r from-purple-500 to-purple-400" />
      </div>

      {evaluation.correctedSentence && evaluation.correctedSentence !== sentence && (
        <motion.div
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="rounded-xl border border-emerald-500/[0.12] bg-emerald-500/[0.06] p-4"
        >
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-medium text-emerald-400">
              <PenLine className="h-3 w-3" />
              修正后的句子
            </div>
            <button
              type="button"
              onClick={() => onPlayAudio(evaluation.correctedSentence)}
              className="p-1 text-emerald-400/60 transition-colors hover:text-emerald-400"
              title="朗读句子"
            >
              <Volume2 className="h-4 w-4" />
            </button>
          </div>
          <p className="text-sm italic leading-relaxed text-emerald-200">
            &quot;{evaluation.correctedSentence}&quot;
          </p>
          {evaluation.correctedSentenceMeaning && (
            <p className="mt-2 text-xs leading-6 text-emerald-100/80">
              中文释义：{evaluation.correctedSentenceMeaning}
            </p>
          )}
        </motion.div>
      )}

      {evaluation.errors.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className="space-y-2"
        >
          {evaluation.errors.map((err, index) => (
            <div
              key={`${err.type}-${err.original}-${index}`}
              className="flex gap-3 rounded-xl border border-red-500/[0.1] bg-red-500/[0.04] p-3"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <ErrorTag type={err.type} />
                  <span className="text-xs text-zinc-500">
                    <span className="text-red-400/70 line-through">{err.original}</span>
                    <span className="mx-1.5">→</span>
                    <span className="text-emerald-400">{err.correction}</span>
                  </span>
                </div>
                <p className="text-xs leading-relaxed text-zinc-400">{err.explanation}</p>
              </div>
            </div>
          ))}
        </motion.div>
      )}

      {evaluation.praise && (
        <motion.div
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
          className="flex gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] p-3"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
          <p className="text-sm leading-relaxed text-zinc-300">{evaluation.praise}</p>
        </motion.div>
      )}

      {evaluation.suggestion && (
        <motion.div
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9 }}
          className="flex gap-3 rounded-xl border border-amber-500/[0.1] bg-amber-500/[0.04] p-3"
        >
          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <p className="text-sm leading-relaxed text-zinc-300">{evaluation.suggestion}</p>
        </motion.div>
      )}

      {(evaluation.advancedExpressions.length > 0 || evaluation.polishedSentence) && (
        <motion.div
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.0 }}
          className="overflow-hidden rounded-2xl border border-indigo-500/[0.12] bg-gradient-to-br from-indigo-500/[0.06] to-purple-500/[0.04]"
        >
          <div className="flex items-center gap-2 border-b border-indigo-500/[0.08] bg-indigo-500/[0.04] px-4 py-3">
            <GraduationCap className="h-4 w-4 text-indigo-400" />
            <span className="text-xs font-semibold tracking-wide text-indigo-300">高阶润色</span>
            <span className="ml-auto text-[10px] text-indigo-400/60">学习更地道的表达</span>
          </div>

          <div className="space-y-3 p-4">
            {evaluation.advancedExpressions.map((expr, index) => (
              <motion.div
                key={`${expr.original}-${expr.advanced}-${index}`}
                initial={{ opacity: 0, x: -5 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 1.1 + index * 0.1 }}
                className="space-y-2 rounded-xl border border-white/[0.04] bg-black/20 p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded bg-white/[0.04] px-2 py-0.5 font-mono text-sm text-zinc-400">
                    {expr.original}
                  </span>
                  <span className="text-zinc-600">→</span>
                  <span className="rounded bg-indigo-500/10 px-2 py-0.5 text-sm font-semibold text-indigo-300">
                    {expr.advanced}
                  </span>
                </div>
                {(expr.originalMeaning || expr.advancedMeaning) && (
                  <p className="text-xs leading-6 text-zinc-500">
                    {expr.originalMeaning ? `原表达：${expr.originalMeaning}` : ""}
                    {expr.originalMeaning && expr.advancedMeaning ? " | " : ""}
                    {expr.advancedMeaning ? `更地道表达：${expr.advancedMeaning}` : ""}
                  </p>
                )}
                <p className="text-xs leading-relaxed text-zinc-400">{expr.explanation}</p>
                {expr.example && (
                  <div className="flex items-start justify-between gap-2 border-l-2 border-indigo-500/20 pl-3">
                    <div className="space-y-1">
                      <p className="text-xs italic text-zinc-500">{expr.example}</p>
                      {expr.exampleMeaning && (
                        <p className="text-xs leading-6 text-zinc-600">中文释义：{expr.exampleMeaning}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => onPlayAudio(expr.example)}
                      className="shrink-0 p-0.5 text-indigo-400/50 hover:text-indigo-400"
                      title="朗读例句"
                    >
                      <Volume2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </motion.div>
            ))}

            {evaluation.polishedSentence && (
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.3 }}
                className="rounded-xl border border-indigo-500/[0.1] bg-gradient-to-r from-indigo-500/[0.06] to-purple-500/[0.06] p-4"
              >
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Wand2 className="h-3.5 w-3.5 text-purple-400" />
                    <span className="text-xs font-medium text-purple-300">母语者级润色</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onPlayAudio(evaluation.polishedSentence)}
                    className="p-1 text-purple-400/60 transition-colors hover:text-purple-400"
                    title="朗读句子"
                  >
                    <Volume2 className="h-4 w-4" />
                  </button>
                </div>
                <p className="text-sm italic leading-relaxed text-indigo-200">
                  &quot;{evaluation.polishedSentence}&quot;
                </p>
                {evaluation.polishedSentenceMeaning && (
                  <p className="mt-2 text-xs leading-6 text-indigo-100/75">
                    中文释义：{evaluation.polishedSentenceMeaning}
                  </p>
                )}
              </motion.div>
            )}
          </div>
        </motion.div>
      )}
    </div>
  )
}

function getScoreClasses(score: number) {
  if (score >= 80) {
    return {
      panel: "score-glow-green",
      bar: "bg-gradient-to-r from-green-400 via-emerald-500 to-green-600",
      badge: "border-green-500/40 bg-green-500/10 text-green-400 shadow-green-500/20",
    }
  }

  if (score >= 60) {
    return {
      panel: "score-glow-yellow",
      bar: "bg-gradient-to-r from-yellow-400 via-amber-500 to-orange-500",
      badge: "border-yellow-500/40 bg-yellow-500/10 text-yellow-400 shadow-yellow-500/20",
    }
  }

  return {
    panel: "score-glow-red",
    bar: "bg-gradient-to-r from-red-400 via-rose-500 to-red-600",
    badge: "border-red-500/40 bg-red-500/10 text-red-400 shadow-red-500/20",
  }
}

export function StudyEvaluationResult({
  visible,
  result,
  sentence,
  mounted,
  onRewrite,
  onNext,
  onPlayAudio,
}: {
  visible: boolean
  result: StudySubmissionResult | null
  sentence: string
  mounted: boolean
  onRewrite: () => void
  onNext: () => void
  onPlayAudio: (text: string) => void
}) {
  if (!visible || !result) {
    return null
  }

  const scoreClasses = getScoreClasses(result.evaluation.score)

  return (
    <motion.div
      initial={{ opacity: 0, y: 30, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 30, scale: 0.96 }}
      transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
      className={`glass-panel relative w-full flex-shrink-0 overflow-hidden rounded-3xl border-t-0 p-8 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.5)] sm:p-10 ${scoreClasses.panel}`}
    >
      <motion.div
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 0.6, delay: 0.2 }}
        className={`absolute left-0 right-0 top-0 h-1.5 origin-left ${scoreClasses.bar}`}
      />

      <div className="mb-6 mt-2 flex items-start justify-between">
        <div>
          <h3 className="mb-2 bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-xl font-bold text-transparent">
            AI 评估结果
          </h3>
          <p className="mb-2 text-[11px] uppercase tracking-[0.18em] text-blue-300/70">
            Eval Model {result.evaluationModelLabel}
          </p>
          {result.reviewImpact === "practice_only" && (
            <p className="mb-2 text-xs text-amber-200/80">
              本次是重写练习，不影响复习间隔，也不会计入学习记录。
            </p>
          )}
          <p className="line-clamp-2 rounded-lg border border-white/5 bg-black/20 p-3 text-sm italic text-zinc-400">
            &quot; {sentence} &quot;
          </p>
        </div>

        <motion.div
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ duration: 0.5, delay: 0.3, type: "spring", stiffness: 200 }}
          className={`flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-[3px] shadow-lg ${scoreClasses.badge}`}
        >
          <AnimatedScore score={result.evaluation.score} />
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="mb-6"
      >
        <EvaluationDetails evaluation={result.evaluation} sentence={sentence} onPlayAudio={onPlayAudio} />
      </motion.div>

      <div className="flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-4 sm:flex-row">
        <div className="flex flex-col text-xs text-zinc-500">
          {result.nextSrs ? (
            <>
              <span>
                下次复习：
                {mounted ? new Date(result.nextSrs.nextReviewDate).toLocaleDateString("zh-CN") : "..."}
              </span>
              <span>当前难度系数：{result.nextSrs.easeFactor}</span>
            </>
          ) : (
            <span>重写练习不会改变当前单词的复习安排。</span>
          )}
        </div>
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <button
            type="button"
            onClick={onRewrite}
            className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-5 py-3 text-sm font-medium text-amber-100 transition-all hover:bg-amber-500/15"
          >
            根据反馈再写一次
          </button>
          <button
            type="button"
            onClick={onNext}
            className="group flex w-full items-center justify-center gap-2 rounded-xl bg-white/10 px-6 py-3 text-sm font-medium text-white transition-all hover:bg-white/20 sm:w-auto"
          >
            下一个单词
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </button>
        </div>
      </div>
    </motion.div>
  )
}
