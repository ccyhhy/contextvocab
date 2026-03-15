"use client"

import { AnimatePresence, motion } from "framer-motion"
import type { VisibleFeedbackSections } from "@/lib/evaluation-format"

type StreamPhase = "idle" | "connecting" | "feedback" | "structuring"

const previewBlocks: Array<{
  key: keyof VisibleFeedbackSections
  title: string
  placeholder: string
}> = [
  { key: "overall", title: "总体判断", placeholder: "AI 正在形成整体结论..." },
  { key: "issue", title: "主要问题", placeholder: "AI 正在定位最关键的问题..." },
  { key: "tip", title: "改进建议", placeholder: "AI 正在生成可执行建议..." },
  { key: "progress", title: "历史对比", placeholder: "AI 正在结合历史记录做对比..." },
]

export function StudyStreamingPreview({
  visible,
  streamPhase,
  streamProgressChars,
  streamSections,
}: {
  visible: boolean
  streamPhase: StreamPhase
  streamProgressChars: number
  streamSections: VisibleFeedbackSections
}) {
  if (!visible) {
    return null
  }

  const hasAnyPreview = previewBlocks.some((block) => Boolean(streamSections[block.key]))

  const phaseLabel =
    streamPhase === "connecting"
      ? "正在连接模型..."
      : streamPhase === "structuring"
        ? "正在整理结构化评分..."
        : "AI 正在实时分析你的句子"

  const phaseHint =
    streamPhase === "structuring"
      ? "文字点评已经生成，接下来会整理成最终评分卡。"
      : "这部分内容是边生成边显示的，不需要等到整段结束。"

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        className="glass-panel w-full rounded-3xl border border-blue-500/15 bg-gradient-to-br from-blue-500/[0.05] to-cyan-500/[0.03] p-6 sm:p-7"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-blue-300/70">
              Live Feedback
            </p>
            <h3 className="mt-2 text-lg font-semibold text-white">{phaseLabel}</h3>
            <p className="mt-1 text-sm text-zinc-400">{phaseHint}</p>
          </div>
          <div className="shrink-0 rounded-full border border-blue-400/20 bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-300">
            {streamProgressChars > 0 ? `${streamProgressChars} chars` : "waiting"}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {previewBlocks.map((block, index) => (
            <motion.div
              key={block.key}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="min-h-28 rounded-2xl border border-white/8 bg-black/30 p-4"
            >
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-blue-300/75">
                {block.title}
              </p>
              {streamSections[block.key] ? (
                <p className="whitespace-pre-wrap text-sm leading-7 text-zinc-200">
                  {streamSections[block.key]}
                </p>
              ) : (
                <p className="text-sm leading-7 text-zinc-500">{block.placeholder}</p>
              )}
            </motion.div>
          ))}
        </div>

        {!hasAnyPreview && (
          <motion.p
            animate={{ opacity: [0.45, 1, 0.45] }}
            transition={{ duration: 1.6, repeat: Infinity }}
            className="mt-4 text-sm leading-7 text-zinc-500"
          >
            AI 已收到你的句子，正在生成第一轮分析...
          </motion.p>
        )}
      </motion.div>
    </AnimatePresence>
  )
}
