"use client"

import { useState, useRef, useEffect } from "react"
import { Settings, ChevronDown, Check } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import type { StudyContentType } from "@/lib/study-content"
import type { StudyLibrary, StudyView } from "../actions"

export function CustomDropdown({
  value,
  onChange,
  disabled,
  options,
  onOpenChange,
  onOptionHover,
}: {
  value: string
  onChange: (val: string) => void
  disabled?: boolean
  options: { label: string; value: string }[]
  onOpenChange?: (open: boolean) => void
  onOptionHover?: (val: string) => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
        onOpenChange?.(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [onOpenChange])

  const selectedOption = options.find((opt) => opt.value === value) || options[0]

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          const nextOpen = !isOpen
          setIsOpen(nextOpen)
          onOpenChange?.(nextOpen)
        }}
        className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/60 px-4 py-2 text-sm font-medium text-zinc-200 outline-none transition-all hover:bg-black/80 focus:border-white/20 focus:ring-2 focus:ring-white/10 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="truncate">{selectedOption?.label}</span>
        <ChevronDown 
          className="h-4 w-4 text-zinc-500 transition-transform duration-200" 
          style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }} 
        />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -5, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -5, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute left-0 top-full z-50 mt-2 max-h-60 w-56 overflow-auto rounded-xl border border-white/10 bg-zinc-900/95 p-1.5 shadow-xl backdrop-blur-xl"
          >
            {options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onMouseEnter={() => onOptionHover?.(opt.value)}
                onFocus={() => onOptionHover?.(opt.value)}
                onClick={() => {
                  onChange(opt.value)
                  setIsOpen(false)
                  onOpenChange?.(false)
                }}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                  value === opt.value
                    ? "bg-blue-500/10 text-blue-400 font-medium"
                    : "text-zinc-300 hover:bg-white/5 hover:text-white"
                }`}
              >
                <span className="truncate">{opt.label}</span>
                {value === opt.value && <Check className="h-4 w-4" />}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export const officialLibraryNames: Record<string, string> = {
  "cet-4": "大学英语四级",
  "cet-6": "大学英语六级",
  "basic-scene-grammar": "基础场景句法",
}

export function StudyToolbar({
  availableLibraries,
  librarySlug,
  studyView,
  selectedLibraryContentType,
  disabled,
  queuedCount,
  loadingNext,
  refillingQueue,
  onLibraryChange,
  onStudyViewChange,
  onOpenSettings,
  onLibraryDropdownOpenChange,
  onLibraryOptionHover,
}: {
  availableLibraries: StudyLibrary[]
  librarySlug: string
  studyView: StudyView
  selectedLibraryContentType?: StudyContentType | null
  disabled: boolean
  queuedCount: number
  loadingNext: boolean
  refillingQueue: boolean
  onLibraryChange: (value: string) => void | Promise<void>
  onStudyViewChange: (value: string) => void | Promise<void>
  onOpenSettings: () => void
  onLibraryDropdownOpenChange?: (open: boolean) => void
  onLibraryOptionHover?: (value: string) => void
}) {
  const isGrammarLibrary = selectedLibraryContentType === "grammar"
  const queueLabel =
    loadingNext || refillingQueue
      ? queuedCount > 0
        ? `队列 ${queuedCount}`
        : "后续队列补充中"
      : `队列 ${queuedCount}`

  const libraryOptions = [{ label: "全部词库", value: "all" }, ...availableLibraries.map(item => ({
    label: officialLibraryNames[item.slug] ?? item.name,
    value: item.slug
  }))]

  const grammarViews = [
    { label: "全部句法卡", value: "all" },
    { label: "薄弱项", value: "weak" },
    { label: "最近失败", value: "recent_failures" }
  ]

  const wordViews = [
    { label: "全部单词", value: "all" },
    { label: "收藏", value: "favorites" },
    { label: "薄弱项", value: "weak" },
    { label: "最近失败", value: "recent_failures" }
  ]

  const viewOptions = isGrammarLibrary ? grammarViews : wordViews

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <CustomDropdown
          value={librarySlug}
          onChange={onLibraryChange}
          disabled={disabled}
          options={libraryOptions}
          onOpenChange={onLibraryDropdownOpenChange}
          onOptionHover={onLibraryOptionHover}
        />

        <CustomDropdown
          value={studyView}
          onChange={onStudyViewChange}
          disabled={disabled}
          options={viewOptions}
        />

        {isGrammarLibrary ? (
          <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 px-3 py-2 text-sm font-medium tracking-wide text-blue-200">
            句法模式
          </div>
        ) : null}

        <button
          type="button"
          onClick={onOpenSettings}
          className="rounded-xl p-2.5 text-zinc-400 transition-all duration-300 hover:rotate-90 hover:bg-white/10 hover:text-white active:scale-95"
        >
          <Settings className="h-4 w-4" />
        </button>
      </div>

      <div className="flex items-center gap-2 rounded-full border border-white/5 bg-white/5 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
        <span className="text-zinc-400">{queueLabel}</span>
        {loadingNext || refillingQueue ? (
          <span className="flex items-center gap-1.5 text-blue-400">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" />
            </span>
            {loadingNext ? "加载中" : "补充中"}
          </span>
        ) : null}
      </div>
    </div>
  )
}
