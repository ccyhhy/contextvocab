"use client"

import type { ChangeEvent } from "react"
import type { StudyContentType } from "@/lib/study-content"
import type { StudyLibrary, StudyView } from "../actions"

export function StudyEmptyState({
  availableLibraries,
  librarySlug,
  studyView,
  selectedLibraryContentType,
  onLibraryChange,
  onStudyViewChange,
  onRefresh,
}: {
  availableLibraries: StudyLibrary[]
  librarySlug: string
  studyView: StudyView
  selectedLibraryContentType?: StudyContentType | null
  onLibraryChange: (event: ChangeEvent<HTMLSelectElement>) => void | Promise<void>
  onStudyViewChange: (event: ChangeEvent<HTMLSelectElement>) => void | Promise<void>
  onRefresh: () => void | Promise<void>
}) {
  const isGrammarLibrary = selectedLibraryContentType === "grammar"

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <select
            value={librarySlug}
            onChange={onLibraryChange}
            className="rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-sm text-zinc-200"
          >
            <option value="all">All libraries</option>
            {availableLibraries.map((item) => (
              <option key={item.id} value={item.slug}>
                {item.name}
              </option>
            ))}
          </select>

          {!isGrammarLibrary ? (
            <select
              value={studyView}
              onChange={onStudyViewChange}
              className="rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-sm text-zinc-200"
            >
              <option value="all">All words</option>
              <option value="favorites">Favorites</option>
              <option value="weak">Weak items</option>
              <option value="recent_failures">Recent failures</option>
            </select>
          ) : (
            <div className="rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-sm text-zinc-300">
              Grammar mode
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => void onRefresh()}
          className="rounded-lg bg-white/10 px-4 py-2 text-sm text-white"
        >
          Refresh
        </button>
      </div>

      <div className="glass-panel rounded-3xl p-10 text-center text-zinc-300">
        {isGrammarLibrary
          ? "No grammar cards are available for this selection yet."
          : "No study words are available for this selection right now."}
      </div>
    </div>
  )
}
