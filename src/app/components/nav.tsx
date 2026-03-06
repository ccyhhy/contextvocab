"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { BookOpen, BarChart3, History, Menu, X, Sparkles } from "lucide-react"

const navLinks = [
  { href: "/dashboard", label: "仪表盘", icon: BarChart3 },
  { href: "/study",     label: "学习",   icon: BookOpen },
  { href: "/history",   label: "历史",   icon: History },
]

export default function Nav() {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <nav className="w-full border-b border-white/[0.06] bg-black/40 backdrop-blur-xl sticky top-0 z-40">
      <div className="mx-auto max-w-5xl flex items-center justify-between px-4 sm:px-6 h-14">
        {/* Logo */}
        <Link href="/study" className="flex items-center gap-2.5 group">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-white/10 shadow-inner group-hover:from-blue-500/30 group-hover:to-purple-500/30 transition-all">
            <Sparkles className="w-4 h-4 text-blue-400" />
          </div>
          <span className="font-semibold tracking-wide text-zinc-100 text-sm">
            ContextVocab
          </span>
        </Link>

        {/* Desktop Links */}
        <div className="hidden sm:flex items-center gap-1">
          {navLinks.map((link) => {
            const isActive = pathname === link.href || pathname?.startsWith(link.href + "/")
            const Icon = link.icon
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`relative flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? "text-white"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]"
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? "text-blue-400" : ""}`} />
                {link.label}
                {isActive && (
                  <motion.div
                    layoutId="nav-indicator"
                    className="absolute inset-0 rounded-lg bg-white/[0.08] border border-white/[0.06]"
                    style={{ zIndex: -1 }}
                    transition={{ type: "spring", stiffness: 500, damping: 35 }}
                  />
                )}
              </Link>
            )
          })}
        </div>

        {/* Right side */}
        <div className="hidden sm:flex items-center gap-3">
          <span className="text-xs font-medium px-2.5 py-1 bg-white/[0.06] rounded-md text-zinc-400 border border-white/[0.06]">
            游客模式
          </span>
        </div>

        {/* Mobile hamburger */}
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="sm:hidden p-2 text-zinc-400 hover:text-white transition-colors"
          aria-label="切换导航"
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="sm:hidden overflow-hidden border-t border-white/[0.06]"
          >
            <div className="px-4 py-3 flex flex-col gap-1">
              {navLinks.map((link) => {
                const isActive = pathname === link.href || pathname?.startsWith(link.href + "/")
                const Icon = link.icon
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                      isActive
                        ? "text-white bg-white/[0.08] border border-white/[0.06]"
                        : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]"
                    }`}
                  >
                    <Icon className={`w-4 h-4 ${isActive ? "text-blue-400" : ""}`} />
                    {link.label}
                  </Link>
                )
              })}
              <div className="mt-2 pt-2 border-t border-white/[0.06]">
                <span className="text-xs font-medium px-3 py-1 text-zinc-500">
                  游客模式
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  )
}
