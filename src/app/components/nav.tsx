"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { AnimatePresence, motion } from "framer-motion"
import { BarChart3, BookOpen, History, Layers3, Menu, Sparkles, X } from "lucide-react"

const navLinks = [
  { href: "/dashboard", label: "仪表盘", icon: BarChart3 },
  { href: "/study", label: "学习", icon: BookOpen },
  { href: "/libraries", label: "词库", icon: Layers3 },
  { href: "/history", label: "历史", icon: History },
]

export default function Nav({ userEmail }: { userEmail?: string | null }) {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    for (const link of navLinks) {
      router.prefetch(link.href)
    }
  }, [router])

  return (
    <nav className="sticky top-0 z-40 w-full border-b border-white/[0.06] bg-black/40 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
        <Link href="/study" className="group flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-gradient-to-br from-blue-500/20 to-purple-500/20 shadow-inner transition-all group-hover:from-blue-500/30 group-hover:to-purple-500/30">
            <Sparkles className="h-4 w-4 text-blue-400" />
          </div>
          <span className="text-sm font-semibold tracking-wide text-zinc-100">ContextVocab</span>
        </Link>

        <div className="hidden items-center gap-1 sm:flex">
          {navLinks.map((link) => {
            const isActive = pathname === link.href || pathname?.startsWith(`${link.href}/`)
            const Icon = link.icon

            return (
              <Link
                key={link.href}
                href={link.href}
                prefetch
                className={`relative flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-all ${
                  isActive
                    ? "text-white"
                    : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
                }`}
              >
                <Icon className={`h-4 w-4 ${isActive ? "text-blue-400" : ""}`} />
                {link.label}
                {isActive && (
                  <motion.div
                    layoutId="nav-indicator"
                    className="absolute inset-0 rounded-lg border border-white/[0.06] bg-white/[0.08]"
                    style={{ zIndex: -1 }}
                    transition={{ type: "spring", stiffness: 500, damping: 35 }}
                  />
                )}
              </Link>
            )
          })}
        </div>

        <div className="hidden items-center gap-3 sm:flex">
          {userEmail ? (
            <>
              <span className="max-w-56 truncate rounded-md border border-white/[0.06] bg-white/[0.06] px-2.5 py-1 text-xs font-medium text-zinc-300">
                {userEmail}
              </span>
              <form action="/auth/signout" method="post">
                <button
                  type="submit"
                  className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-zinc-300 transition-all hover:bg-white/[0.08] hover:text-white"
                >
                  退出
                </button>
              </form>
            </>
          ) : (
            <Link
              href="/login"
              className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-zinc-300 transition-all hover:bg-white/[0.08] hover:text-white"
            >
              登录
            </Link>
          )}
        </div>

        <button
          onClick={() => setMobileOpen((current) => !current)}
          className="p-2 text-zinc-400 transition-colors hover:text-white sm:hidden"
          aria-label="切换导航"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden border-t border-white/[0.06] sm:hidden"
          >
            <div className="flex flex-col gap-1 px-4 py-3">
              {navLinks.map((link) => {
                const isActive = pathname === link.href || pathname?.startsWith(`${link.href}/`)
                const Icon = link.icon

                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    prefetch
                    onClick={() => setMobileOpen(false)}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
                      isActive
                        ? "border border-white/[0.06] bg-white/[0.08] text-white"
                        : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
                    }`}
                  >
                    <Icon className={`h-4 w-4 ${isActive ? "text-blue-400" : ""}`} />
                    {link.label}
                  </Link>
                )
              })}

              <div className="mt-2 border-t border-white/[0.06] pt-2">
                {userEmail ? (
                  <div className="space-y-2 px-3 py-1.5">
                    <p className="truncate text-xs font-medium text-zinc-500">{userEmail}</p>
                    <form action="/auth/signout" method="post">
                      <button
                        type="submit"
                        className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-left text-sm text-zinc-300 transition-all hover:bg-white/[0.08] hover:text-white"
                      >
                        退出
                      </button>
                    </form>
                  </div>
                ) : (
                  <Link
                    href="/login"
                    onClick={() => setMobileOpen(false)}
                    className="block px-3 py-2 text-sm text-zinc-400 transition-all hover:text-zinc-200"
                  >
                    登录
                  </Link>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  )
}
