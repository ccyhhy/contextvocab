"use client"

import type { ChangeEvent } from "react"
import { Settings } from "lucide-react"
import type { StudyContentType } from "@/lib/study-content"
import type { StudyLibrary, StudyView } from "../actions"

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
}: {
  availableLibraries: StudyLibrary[]
  librarySlug: string
  studyView: StudyView
  selectedLibraryContentType?: StudyContentType | null
  disabled: boolean
  queuedCount: number
  loadingNext: boolean
  refillingQueue: boolean
  onLibraryChange: (event: ChangeEvent<HTMLSelectElement>) => void | Promise<void>
  onStudyViewChange: (event: ChangeEvent<HTMLSelectElement>) => void | Promise<void>
  onOpenSettings: () => void
}) {
  const isGrammarLibrary = selectedLibraryContentType === "grammar"

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={librarySlug}
          onChange={onLibraryChange}
          disabled={disabled}
          className="rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-sm text-zinc-200"
        >
          <option value="all">All libraries</option>
          {availableLibraries.map((item) => (
            <option key={item.id} value={item.slug}>
              {item.name}
            </option>
          ))}
        </select>

        {isGrammarLibrary ? (
          <div className="rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-sm text-zinc-300">
            Grammar mode
          </div>
        ) : (
          <select
            value={studyView}
            onChange={onStudyViewChange}
            disabled={disabled}
            className="rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-sm text-zinc-200"
          >
            <option value="all">All words</option>
            <option value="favorites">Favorites</option>
            <option value="weak">Weak items</option>
            <option value="recent_failures">Recent failures</option>
          </select>
        )}

        <button
          type="button"
          onClick={onOpenSettings}
          className="rounded-lg p-2 text-zinc-400 transition-colors hover:bg-white/10 hover:text-white"
        >
          <Settings className="h-4 w-4" />
        </button>
      </div>

      <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">
        Queue {queuedCount} {loadingNext || refillingQueue ? (loadingNext ? "loading" : "refilling") : ""}
      </div>
    </div>
  )
}
