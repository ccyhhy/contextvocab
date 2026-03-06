"use client"

import { motion } from "framer-motion"
import { BookOpen, CalendarCheck, Trophy, Flame, Clock, ArrowRight } from "lucide-react"
import Link from "next/link"
import type { DashboardStats, RecentActivity } from "./actions"

function AnimatedCounter({ value, suffix = "" }: { value: number; suffix?: string }) {
  return (
    <motion.span
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="text-3xl sm:text-4xl font-black tracking-tight"
    >
      {value}{suffix}
    </motion.span>
  )
}

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 80 ? "text-green-400 bg-green-500/10 border-green-500/20" :
    score >= 60 ? "text-yellow-400 bg-yellow-500/10 border-yellow-500/20" :
    "text-red-400 bg-red-500/10 border-red-500/20"
  return (
    <span className={`inline-flex items-center justify-center h-8 w-12 rounded-full text-xs font-bold border ${color}`}>
      {score}
    </span>
  )
}

function formatTimeAgo(dateStr: string): string {
  const now = new Date()
  const date = new Date(dateStr)
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  
  if (diffMin < 1) return "刚刚"
  if (diffMin < 60) return `${diffMin}分钟前`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}小时前`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay === 1) return "昨天"
  if (diffDay < 30) return `${diffDay}天前`
  return date.toLocaleDateString("zh-CN")
}

const statCards = [
  {
    key: "dueToday",
    label: "今日待复习",
    icon: CalendarCheck,
    color: "text-blue-400",
    bgGlow: "from-blue-500/10 to-blue-600/5",
    stat: (s: DashboardStats) => s.dueToday,
  },
  {
    key: "totalStudied",
    label: "已学单词",
    icon: BookOpen,
    color: "text-emerald-400",
    bgGlow: "from-emerald-500/10 to-emerald-600/5",
    stat: (s: DashboardStats) => s.totalStudied,
  },
  {
    key: "averageScore",
    label: "平均得分",
    icon: Trophy,
    color: "text-amber-400",
    bgGlow: "from-amber-500/10 to-amber-600/5",
    stat: (s: DashboardStats) => s.averageScore,
    suffix: "",
  },
  {
    key: "streakDays",
    label: "连续学习",
    icon: Flame,
    color: "text-orange-400",
    bgGlow: "from-orange-500/10 to-orange-600/5",
    stat: (s: DashboardStats) => s.streakDays,
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
    <div className="w-full max-w-4xl mx-auto p-4 sm:p-8 space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">学习仪表盘</h1>
        <p className="text-sm text-zinc-500 mt-1">已累计造句 {stats.totalSentences} 句</p>
      </motion.div>

      {/* Stat Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {statCards.map((card, i) => {
          const Icon = card.icon
          const value = card.stat(stats)
          return (
            <motion.div
              key={card.key}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.08 }}
              className="glass-panel rounded-2xl p-5 sm:p-6 flex flex-col gap-3 relative overflow-hidden group hover:border-white/[0.12] transition-all"
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${card.bgGlow} opacity-0 group-hover:opacity-100 transition-opacity`} />
              <div className="relative z-10">
                <div className="flex items-center gap-2 mb-3">
                  <Icon className={`w-4 h-4 ${card.color}`} />
                  <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">{card.label}</span>
                </div>
                <AnimatedCounter value={value} suffix={card.suffix} />
              </div>
            </motion.div>
          )
        })}
      </div>

      {/* Quick Actions */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.4 }}
        className="flex gap-3"
      >
        <Link
          href="/study"
          className="flex-1 glass-panel rounded-2xl p-4 flex items-center justify-between group hover:border-blue-500/20 transition-all"
        >
          <div>
            <p className="text-sm font-semibold text-white">继续学习</p>
            <p className="text-xs text-zinc-500 mt-0.5">还有 {stats.dueToday} 个单词待复习</p>
          </div>
          <ArrowRight className="w-5 h-5 text-zinc-500 group-hover:text-blue-400 group-hover:translate-x-1 transition-all" />
        </Link>
      </motion.div>

      {/* Recent Activity */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.5 }}
        className="space-y-4"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Clock className="w-4 h-4 text-zinc-500" />
            最近动态
          </h2>
          <Link href="/history" className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
            查看全部 →
          </Link>
        </div>

        {recentActivity.length === 0 ? (
          <div className="glass-panel rounded-2xl p-8 text-center">
            <p className="text-zinc-500 text-sm">还没有造句记录，快去学习吧！</p>
          </div>
        ) : (
          <div className="space-y-2">
            {recentActivity.map((item, i) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: 0.5 + i * 0.04 }}
                className="glass-panel rounded-xl px-4 py-3 flex items-center gap-4 group hover:border-white/[0.12] transition-all"
              >
                <ScoreBadge score={item.score} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-semibold text-white">{item.word}</span>
                    <span className="text-xs text-zinc-600">·</span>
                    <span className="text-xs text-zinc-500">{formatTimeAgo(item.created_at)}</span>
                  </div>
                  <p className="text-xs text-zinc-400 truncate">{item.sentence}</p>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  )
}
