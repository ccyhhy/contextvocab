"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { type FormEvent, useState, useTransition } from "react"
import {
  ArrowRight,
  BookOpen,
  Clock3,
  Heart,
  Layers3,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react"
import type { StudyLibrary } from "@/app/study/actions"
import {
  createCustomLibrary,
  createLibraryFromFavorites,
  deleteCustomLibrary,
  type LibraryMutationResult,
} from "./actions"

const OFFICIAL_LIBRARY_DESCRIPTIONS: Record<string, string> = {
  "cet-4": "Core CET-4 vocabulary library.",
  "cet-6": "Core CET-6 vocabulary library.",
  "basic-scene-grammar": "Core scene-based grammar library for high-frequency structures and sentence frames.",
}

function getLibraryProgress(library: Pick<StudyLibrary, "wordCount" | "activeCount">) {
  if (library.wordCount <= 0) {
    return 0
  }

  return Math.min(100, Math.round((library.activeCount / library.wordCount) * 100))
}

function getPlanLabel(status: "active" | "paused" | "completed" | "not_started") {
  switch (status) {
    case "active":
      return "Active"
    case "paused":
      return "Paused"
    case "completed":
      return "Completed"
    case "not_started":
    default:
      return "Not started"
  }
}

function getLibraryDescription(library: Pick<StudyLibrary, "slug" | "sourceType" | "description">) {
  if (library.sourceType === "official") {
    return (
      OFFICIAL_LIBRARY_DESCRIPTIONS[library.slug] ??
      library.description ??
      "Organize learning content into libraries while keeping progress on the shared study system."
    )
  }

  return (
    library.description ??
    "Organize learning content into libraries while keeping progress on the shared study system."
  )
}

function getContentTypeLabel(contentType: StudyLibrary["contentType"]) {
  switch (contentType) {
    case "grammar":
      return "Grammar"
    case "mixed":
      return "Mixed"
    case "word":
    default:
      return "Words"
  }
}

function getItemLabel(contentType: StudyLibrary["contentType"]) {
  return contentType === "grammar" ? "Items" : "Words"
}

function ResultNotice({
  result,
  fallbackLinkLabel = "Start studying",
}: {
  result: LibraryMutationResult | null
  fallbackLinkLabel?: string
}) {
  if (!result) {
    return null
  }

  return (
    <div
      className={`rounded-2xl border px-4 py-3 text-sm ${
        result.ok
          ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-100"
          : "border-red-500/20 bg-red-500/10 text-red-100"
      }`}
    >
      <p>{result.message}</p>
      {result.ok && result.librarySlug && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href={`/study?library=${encodeURIComponent(result.librarySlug)}`}
            className="inline-flex items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-xs font-medium text-emerald-50"
          >
            {fallbackLinkLabel}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      )}
      {result.unmatchedWords && result.unmatchedWords.length > 0 && (
        <p className="mt-3 text-xs leading-6 opacity-90">
          Unmatched: {result.unmatchedWords.join(", ")}
        </p>
      )}
    </div>
  )
}

export default function LibrariesClient({
  initialLibraries,
  favoriteCount,
}: {
  initialLibraries: StudyLibrary[]
  favoriteCount: number
}) {
  const router = useRouter()
  const [isCreatingManual, startCreatingManual] = useTransition()
  const [isCreatingFavorites, startCreatingFavorites] = useTransition()
  const [deletingLibraryId, setDeletingLibraryId] = useState<string | null>(null)

  const [manualName, setManualName] = useState("")
  const [manualDescription, setManualDescription] = useState("")
  const [wordsText, setWordsText] = useState("")
  const [favoriteName, setFavoriteName] = useState("Favorites Library")
  const [favoriteDescription, setFavoriteDescription] = useState("")

  const [manualResult, setManualResult] = useState<LibraryMutationResult | null>(null)
  const [favoriteResult, setFavoriteResult] = useState<LibraryMutationResult | null>(null)
  const [deleteResult, setDeleteResult] = useState<LibraryMutationResult | null>(null)

  const officialLibraries = initialLibraries.filter((library) => library.sourceType === "official")
  const customLibraries = initialLibraries.filter((library) => library.sourceType === "custom")

  const handleCreateManual = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setManualResult(null)
    setFavoriteResult(null)
    setDeleteResult(null)

    startCreatingManual(async () => {
      const result = await createCustomLibrary({
        name: manualName,
        description: manualDescription,
        wordsText,
      })

      setManualResult(result)
      if (!result.ok) {
        return
      }

      setManualName("")
      setManualDescription("")
      setWordsText("")
      router.refresh()
    })
  }

  const handleCreateFromFavorites = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setManualResult(null)
    setFavoriteResult(null)
    setDeleteResult(null)

    startCreatingFavorites(async () => {
      const result = await createLibraryFromFavorites({
        name: favoriteName,
        description: favoriteDescription,
      })

      setFavoriteResult(result)
      if (!result.ok) {
        return
      }

      setFavoriteName("Favorites Library")
      setFavoriteDescription("")
      router.refresh()
    })
  }

  const handleDelete = async (library: StudyLibrary) => {
    const confirmed = window.confirm(
      `Delete the custom library "${library.name}"? This will not delete global words or study history.`
    )
    if (!confirmed) {
      return
    }

    setManualResult(null)
    setFavoriteResult(null)
    setDeleteResult(null)
    setDeletingLibraryId(library.id)

    const result = await deleteCustomLibrary(library.id)
    setDeleteResult(result)
    setDeletingLibraryId(null)

    if (result.ok) {
      router.refresh()
    }
  }

  const renderLibraryCard = (library: StudyLibrary) => {
    const progress = getLibraryProgress(library)
    const itemLabel = getItemLabel(library.contentType)

    return (
      <div key={library.id} className="glass-panel rounded-3xl border border-white/[0.08] p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-zinc-400">
                <Layers3 className="h-3.5 w-3.5" />
                {library.sourceType === "official" ? "Official" : "Custom"}
              </div>
              <div className="inline-flex items-center rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-blue-100">
                {getContentTypeLabel(library.contentType)}
              </div>
            </div>
            <h2 className="mt-4 text-2xl font-bold text-white">{library.name}</h2>
            <p className="mt-2 min-h-12 text-sm leading-6 text-zinc-400">
              {getLibraryDescription(library)}
            </p>
          </div>

          <div className="flex flex-col items-end gap-3">
            <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-200">
              {getPlanLabel(library.planStatus)}
            </span>
            {library.sourceType === "custom" && (
              <button
                type="button"
                onClick={() => handleDelete(library)}
                disabled={deletingLibraryId === library.id}
                className="inline-flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-100 transition-colors hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {deletingLibraryId === library.id ? "Deleting..." : "Delete"}
              </button>
            )}
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-white/8 bg-black/20 p-4">
            <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">{itemLabel}</p>
            <p className="mt-2 text-2xl font-black text-white">{library.wordCount}</p>
          </div>
          <div className="rounded-2xl border border-white/8 bg-black/20 p-4">
            <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Due</p>
            <p className="mt-2 text-2xl font-black text-amber-200">{library.dueCount}</p>
          </div>
          <div className="rounded-2xl border border-white/8 bg-black/20 p-4">
            <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Started</p>
            <p className="mt-2 text-2xl font-black text-blue-200">{library.activeCount}</p>
          </div>
          <div className="rounded-2xl border border-white/8 bg-black/20 p-4">
            <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Remaining</p>
            <p className="mt-2 text-2xl font-black text-white">{library.remainingCount}</p>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-white/8 bg-black/20 p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-zinc-400">Study progress</span>
            <span className="font-semibold text-white">{progress}%</span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/8">
            <div
              className="h-full rounded-full bg-gradient-to-r from-blue-400 via-cyan-300 to-emerald-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-zinc-500">
            <span>Started {library.activeCount}</span>
            <span>Total {library.wordCount}</span>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-zinc-400">
          <div className="flex items-center gap-2">
            <Clock3 className="h-4 w-4 text-zinc-500" />
            {library.dailyNewLimit ? `Daily new ${library.dailyNewLimit}` : "Daily new not set"}
          </div>
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-zinc-500" />
            Shared study system
          </div>
        </div>

        <Link
          href={`/study?library=${encodeURIComponent(library.slug)}`}
          className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-white/10 px-4 py-3 text-sm font-medium text-white transition-all hover:bg-white/15"
        >
          Start studying
          <ArrowRight className="h-4 w-4" />
        </Link>
        <Link
          href={`/libraries/${encodeURIComponent(library.slug)}`}
          className="mt-3 inline-flex w-full items-center justify-center rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm font-medium text-zinc-200 transition-all hover:bg-white/5"
        >
          {library.sourceType === "custom" && library.contentType === "word"
            ? "Manage library"
            : "View details"}
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 p-4 sm:p-8">
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-blue-300/70">
          Libraries
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">Libraries</h1>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-zinc-400">
              Libraries decide where new study content comes from. Review pacing still runs on the shared study system. Custom libraries currently support word collections, while official grammar libraries are read-only browsers plus study entry points.
            </p>
          </div>
          <Link
            href="/study"
            className="inline-flex items-center gap-2 rounded-xl border border-blue-500/20 bg-blue-500/10 px-4 py-3 text-sm font-medium text-blue-100 transition-all hover:bg-blue-500/15"
          >
            <Sparkles className="h-4 w-4" />
            Back to study
          </Link>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.45fr]">
        <div className="space-y-6">
          <form
            onSubmit={handleCreateManual}
            className="glass-panel rounded-3xl border border-white/[0.08] p-6"
          >
            <div className="flex items-center gap-2 text-white">
              <Plus className="h-4 w-4 text-blue-400" />
              <h2 className="text-lg font-semibold">Create a custom word library</h2>
            </div>
            <p className="mt-2 text-sm leading-7 text-zinc-400">
              Reorganize words that already exist in the global word list into your own topic-based library. This form currently matches only existing entries from the `words` table.
            </p>

            <div className="mt-5 space-y-4">
              <div>
                <label className="mb-2 block text-sm text-zinc-300">Library name</label>
                <input
                  value={manualName}
                  onChange={(event) => setManualName(event.target.value)}
                  placeholder="Interview essentials"
                  className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition-colors focus:border-blue-500/40"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-zinc-300">Description</label>
                <input
                  value={manualDescription}
                  onChange={(event) => setManualDescription(event.target.value)}
                  placeholder="What this word library is for"
                  className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition-colors focus:border-blue-500/40"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-zinc-300">Word list</label>
                <textarea
                  value={wordsText}
                  onChange={(event) => setWordsText(event.target.value)}
                  placeholder={`One word per line, or paste a list.\nexample\nimpact\nbear\nissue`}
                  className="h-52 w-full rounded-3xl border border-white/10 bg-[#09090b]/80 p-4 text-sm leading-7 text-zinc-100 outline-none transition-colors focus:border-blue-500/40"
                />
                <p className="mt-2 text-xs leading-6 text-zinc-500">
                  New lines, spaces, commas, and semicolons are all supported. Unmatched words will be listed separately.
                </p>
              </div>

              <button
                type="submit"
                disabled={isCreatingManual}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition-all disabled:bg-white/10 disabled:text-zinc-500"
              >
                <Plus className="h-4 w-4" />
                {isCreatingManual ? "Creating..." : "Create library"}
              </button>
            </div>

            <div className="mt-5">
              <ResultNotice result={manualResult} />
            </div>
          </form>

          <form
            onSubmit={handleCreateFromFavorites}
            className="glass-panel rounded-3xl border border-white/[0.08] p-6"
          >
            <div className="flex items-center gap-2 text-white">
              <Heart className="h-4 w-4 text-rose-400" />
              <h2 className="text-lg font-semibold">Create from favorites</h2>
            </div>
            <p className="mt-2 text-sm leading-7 text-zinc-400">
              Turn your current favorite words into a focused library for review or a short sprint.
            </p>

            <div className="mt-4 rounded-2xl border border-rose-500/15 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
              Available favorite words: <span className="font-semibold">{favoriteCount}</span>
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <label className="mb-2 block text-sm text-zinc-300">Library name</label>
                <input
                  value={favoriteName}
                  onChange={(event) => setFavoriteName(event.target.value)}
                  placeholder="My favorite words"
                  className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition-colors focus:border-rose-500/40"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-zinc-300">Description</label>
                <input
                  value={favoriteDescription}
                  onChange={(event) => setFavoriteDescription(event.target.value)}
                  placeholder="Why this favorite library exists"
                  className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition-colors focus:border-rose-500/40"
                />
              </div>

              <button
                type="submit"
                disabled={isCreatingFavorites || favoriteCount === 0}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-rose-600 px-4 py-3 text-sm font-semibold text-white transition-all disabled:bg-white/10 disabled:text-zinc-500"
              >
                <Heart className="h-4 w-4" />
                {isCreatingFavorites ? "Creating..." : "Create from favorites"}
              </button>
            </div>

            <div className="mt-5">
              <ResultNotice result={favoriteResult} fallbackLinkLabel="Study this favorites library" />
            </div>
          </form>

          {deleteResult && <ResultNotice result={deleteResult} />}
        </div>

        <div className="space-y-8">
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-white">Official libraries</h2>
              <span className="text-sm text-zinc-500">{officialLibraries.length}</span>
            </div>

            <div className="grid gap-4 md:grid-cols-2">{officialLibraries.map(renderLibraryCard)}</div>
          </section>

          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-white">Custom libraries</h2>
              <span className="text-sm text-zinc-500">{customLibraries.length}</span>
            </div>

            {customLibraries.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2">{customLibraries.map(renderLibraryCard)}</div>
            ) : (
              <div className="glass-panel rounded-3xl p-10 text-center text-zinc-400">
                You do not have any custom libraries yet. Create one manually or build one from your favorites.
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
