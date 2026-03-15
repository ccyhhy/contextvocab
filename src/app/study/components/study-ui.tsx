"use client"

import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import type { SentenceHelpItem, StudyBatchItem, StudyLibrary, StudyView } from "../actions"

export function getPriorityLabel(reason: StudyBatchItem["priorityReason"]) {
  switch (reason) {
    case "leech_due":
      return "顽固复习"
    case "overdue":
      return "逾期复习"
    case "weak_due":
      return "低分回捞"
    case "due":
      return "今日复习"
    case "new":
    default:
      return "新词"
  }
}

export function getStudyViewLabel(view: StudyView) {
  switch (view) {
    case "favorites":
      return "收藏"
    case "weak":
      return "弱项"
    case "recent_failures":
      return "最近失误"
    case "all":
    default:
      return "全部"
  }
}

export function getPlanStatusLabel(status: StudyLibrary["planStatus"]) {
  switch (status) {
    case "active":
      return "进行中"
    case "paused":
      return "已暂停"
    case "completed":
      return "已完成"
    case "not_started":
    default:
      return "未开始"
  }
}

export function shouldHighlightPriority(reason: StudyBatchItem["priorityReason"]) {
  return reason === "leech_due" || reason === "overdue" || reason === "weak_due"
}

export function getSentenceHelpItemSourceLabel(source: SentenceHelpItem["source"]) {
  switch (source) {
    case "dictionary_example":
      return "词库例句"
    case "ai":
    default:
      return "AI生成"
  }
}

export function getUsageRegisterLabel(register?: string | null) {
  switch (register) {
    case "formal":
      return "偏正式"
    case "informal":
      return "偏口语"
    case "neutral":
      return "中性"
    default:
      return ""
  }
}

export function getSceneTagLabel(tag: string) {
  const labels: Record<string, string> = {
    general: "通用",
    study: "学习",
    work: "工作",
    money: "金钱",
    health: "健康",
    time: "时间",
    travel: "出行",
    technology: "科技",
    relationships: "关系",
    communication: "沟通",
    emotions: "情绪",
    government: "公共事务",
    safety: "安全",
    environment: "环境",
  }

  return labels[tag] ?? tag
}

function formatCoveragePercent(done: number, total: number) {
  if (total <= 0) {
    return 0
  }

  return Math.round((done / total) * 100)
}

export function EnrichmentProgressBar({
  label,
  value,
  total,
  barClassName,
}: {
  label: string
  value: number
  total: number
  barClassName: string
}) {
  const percent = formatCoveragePercent(value, total)

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <span className="text-zinc-200">{label}</span>
          <span className="text-xs text-zinc-500">
            {value} / {total}
          </span>
        </div>
        <span className="text-xs font-medium text-zinc-300">{percent}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${percent}%` }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          className={`h-full rounded-full ${barClassName}`}
        />
      </div>
    </div>
  )
}

export function AnimatedScore({ score }: { score: number }) {
  const [displayScore, setDisplayScore] = useState(0)

  useEffect(() => {
    let start = 0
    const duration = 800
    const stepTime = 16
    const steps = duration / stepTime
    const increment = score / steps
    const timer = setInterval(() => {
      start += increment
      if (start >= score) {
        setDisplayScore(score)
        clearInterval(timer)
      } else {
        setDisplayScore(Math.round(start))
      }
    }, stepTime)

    return () => clearInterval(timer)
  }, [score])

  return <span className="text-2xl font-black">{displayScore}</span>
}

export function SubScoreBar({ label, score, color }: { label: string; score: number; color: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-16 shrink-0 text-right text-xs text-zinc-500">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${(score / 5) * 100}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className={`h-full rounded-full ${color}`}
        />
      </div>
      <span className="w-6 font-mono text-xs text-zinc-400">{score}/5</span>
    </div>
  )
}

export function ErrorTag({ type }: { type: string }) {
  const config: Record<string, { label: string; color: string }> = {
    grammar: { label: "语法", color: "text-red-400 bg-red-500/10 border-red-500/20" },
    word_usage: { label: "用词", color: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
    naturalness: { label: "自然度", color: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
    spelling: { label: "拼写", color: "text-purple-400 bg-purple-500/10 border-purple-500/20" },
  }

  const resolved = config[type] || config.grammar
  return (
    <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase ${resolved.color}`}>
      {resolved.label}
    </span>
  )
}
