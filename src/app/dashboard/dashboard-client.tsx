"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import { ArrowRight, BookOpen, CalendarCheck, Clock, Flame, Trophy } from "lucide-react"
import type { DashboardStats, RecentActivity } from "./actions"

function AnimatedCounter({ value, suffix = "" }: { value: number; suffix?: string }) {
  return (
    <motion.span
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="text-3xl font-black tracking-tight sm:text-4xl"
    >
      {value}
      {suffix}
    </motion.span>
  )
}

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 80
      ? "text-green-400 bg-green-500/10 border-green-500/20"
      : score >= 60
        ? "text-yellow-400 bg-yellow-500/10 border-yellow-500/20"
        : "text-red-400 bg-red-500/10 border-red-500/20"

  return (
    <span
      className={`inline-flex h-8 w-12 items-center justify-center rounded-full border text-xs font-bold ${color}`}
    >
      {score}
    </span>
  )
}

function UsageBadge({
  usageQuality,
  attemptStatus,
}: {
  usageQuality: string
  attemptStatus: string
}) {
  if (attemptStatus === "needs_help") {
    return (
      <span className="rounded-full border border-red-500/20 bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-300">
        Need Help
      </span>
    )
  }

  if (usageQuality === "meta") {
    return (
      <span className="rounded-full border border-orange-500/20 bg-orange-500/10 px-2 py-0.5 text-[10px] font-medium text-orange-300">
        Meta
      </span>
    )
  }

  if (usageQuality === "weak") {
    return (
      <span className="rounded-full border border-yellow-500/20 bg-yellow-500/10 px-2 py-0.5 text-[10px] font-medium text-yellow-300">
        Weak
      </span>
    )
  }

  return (
    <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
      In Context
    </span>
  )
}

function formatTimeAgo(dateStr: string) {
  const now = new Date()
  const date = new Date(dateStr)
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)

  if (diffMin < 1) {
    return "刚刚"
  }

  if (diffMin < 60) {
    return `${diffMin} 分钟前`
  }

  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) {
    return `${diffHr} 小时前`
  }

  const diffDay = Math.floor(diffHr / 24)
  if (diffDay === 1) {
    return "昨天"
  }

  if (diffDay < 30) {
    return `${diffDay} 天前`
  }

  return date.toLocaleDateString("zh-CN")
}

const statCards = [
  {
    key: "dueToday",
    label: "今日待复习",
    icon: CalendarCheck,
    color: "text-blue-400",
    bgGlow: "from-blue-500/10 to-blue-600/5",
    stat: (stats: DashboardStats) => stats.dueToday,
  },
  {
    key: "totalStudied",
    label: "已学单词",
    icon: BookOpen,
    color: "text-emerald-400",
    bgGlow: "from-emerald-500/10 to-emerald-600/5",
    stat: (stats: DashboardStats) => stats.totalStudied,
  },
  {
    key: "averageScore",
    label: "平均得分",
    icon: Trophy,
    color: "text-amber-400",
    bgGlow: "from-amber-500/10 to-amber-600/5",
    stat: (stats: DashboardStats) => stats.averageScore,
  },
  {
    key: "streakDays",
    label: "连续学习",
    icon: Flame,
    color: "text-orange-400",
    bgGlow: "from-orange-500/10 to-orange-600/5",
    stat: (stats: DashboardStats) => stats.streakDays,
    suffix: "天",
  },
]

export default function DashboardClient({
  stats,
  recentActivity,
}: {
  stats: DashboardStats
  recentActivity: RecentActivity[]
}) {
  return (
    <div className="mx-auto w-full max-w-4xl space-y-8 p-4 sm:p-8">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">学习仪表盘</h1>
        <p className="mt-1 text-sm text-zinc-500">累计造句 {stats.totalSentences} 条</p>
      </motion.div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {statCards.map((card, index) => {
          const Icon = card.icon
          const value = card.stat(stats)
          return (
            <motion.div
              key={card.key}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: index * 0.08 }}
              className="glass-panel group relative overflow-hidden rounded-2xl p-5 transition-all hover:border-white/[0.12] sm:p-6"
            >
              <div
                className={`absolute inset-0 bg-gradient-to-br ${card.bgGlow} opacity-0 transition-opacity group-hover:opacity-100`}
              />
              <div className="relative z-10">
                <div className="mb-3 flex items-center gap-2">
                  <Icon className={`h-4 w-4 ${card.color}`} />
                  <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                    {card.label}
                  </span>
                </div>
                <AnimatedCounter value={value} suffix={card.suffix} />
              </div>
            </motion.div>
          )
        })}
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.2 }}
        className="grid grid-cols-2 gap-3 sm:grid-cols-4"
      >
        <div className="glass-panel rounded-2xl p-4">
          <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">In Context</p>
          <p className="mt-2 text-2xl font-black text-emerald-300">{stats.contextualUsageCount}</p>
        </div>
        <div className="glass-panel rounded-2xl p-4">
          <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Weak</p>
          <p className="mt-2 text-2xl font-black text-yellow-300">{stats.weakUsageCount}</p>
        </div>
        <div className="glass-panel rounded-2xl p-4">
          <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Meta</p>
          <p className="mt-2 text-2xl font-black text-orange-300">{stats.metaSentenceCount}</p>
        </div>
        <div className="glass-panel rounded-2xl p-4">
          <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Need Help</p>
          <p className="mt-2 text-2xl font-black text-red-300">{stats.needsHelpCount}</p>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.35 }}
        className="flex gap-3"
      >
        <Link
          href="/study"
          className="glass-panel group flex flex-1 items-center justify-between rounded-2xl p-4 transition-all hover:border-blue-500/20"
        >
          <div>
            <p className="text-sm font-semibold text-white">继续学习</p>
            <p className="mt-0.5 text-xs text-zinc-500">还有 {stats.dueToday} 个单词待复习</p>
          </div>
          <ArrowRight className="h-5 w-5 text-zinc-500 transition-all group-hover:translate-x-1 group-hover:text-blue-400" />
        </Link>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.45 }}
        className="space-y-4"
      >
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
            <Clock className="h-4 w-4 text-zinc-500" />
            最近动态
          </h2>
          <Link href="/history" className="text-xs text-zinc-500 transition-colors hover:text-zinc-300">
            查看全部 {"->"}
          </Link>
        </div>

        {recentActivity.length === 0 ? (
          <div className="glass-panel rounded-2xl p-8 text-center">
            <p className="text-sm text-zinc-500">还没有造句记录，先去学习一轮。</p>
          </div>
        ) : (
          <div className="space-y-2">
            {recentActivity.map((item, index) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: 0.45 + index * 0.04 }}
                className="glass-panel group flex items-center gap-4 rounded-xl px-4 py-3 transition-all hover:border-white/[0.12]"
              >
                <ScoreBadge score={item.score} />
                <div className="min-w-0 flex-1">
                  <div className="mb-0.5 flex items-center gap-2">
                    <span className="text-sm font-semibold text-white">{item.word}</span>
                    <span className="text-xs text-zinc-500">{formatTimeAgo(item.created_at)}</span>
                    <UsageBadge usageQuality={item.usageQuality} attemptStatus={item.attemptStatus} />
                  </div>
                  <p className="truncate text-xs text-zinc-400">{item.sentence}</p>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  )
}
