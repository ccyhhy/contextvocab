"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { type FormEvent, useState, useTransition } from "react"
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Plus,
  Search,
  Trash2,
} from "lucide-react"
import {
  addWordToLibrary,
  getLibraryGrammarPage,
  getLibraryWordsPage,
  importWordsToLibrary,
  removeWordFromLibrary,
  searchWordsToAdd,
  type LibraryBatchImportResult,
  type LibraryDetail,
  type LibraryDetailGrammarItem,
  type LibraryGrammarPage,
  type LibraryWordMutationResult,
  type LibraryWordPage,
  type SearchableWord,
} from "./actions"

const OFFICIAL_LIBRARY_DESCRIPTIONS: Record<string, string> = {
  "cet-4": "Core CET-4 vocabulary library.",
  "cet-6": "Core CET-6 vocabulary library.",
  "basic-scene-grammar": "Core scene-based grammar library for high-frequency structures and sentence frames.",
}

function getLibraryProgress(counts: { wordCount: number; activeCount: number }) {
  if (counts.wordCount <= 0) {
    return 0
  }

  return Math.min(100, Math.round((counts.activeCount / counts.wordCount) * 100))
}

function getPlanStatusLabel(status: LibraryDetail["planStatus"]) {
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

function getLibraryDescription(library: Pick<LibraryDetail, "slug" | "sourceType" | "description">) {
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

function getContentTypeLabel(contentType: LibraryDetail["contentType"]) {
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

function getItemLabel(contentType: LibraryDetail["contentType"]) {
  return contentType === "grammar" ? "Items" : "Words"
}

function ResultNotice({ result }: { result: LibraryWordMutationResult | null }) {
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
      {result.message}
    </div>
  )
}

function BatchImportNotice({ result }: { result: LibraryBatchImportResult | null }) {
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
      {(typeof result.addedCount === "number" ||
        typeof result.alreadyExistsCount === "number" ||
        typeof result.matchedCount === "number") && (
        <p className="mt-2 text-xs opacity-90">
          Matched {result.matchedCount ?? 0} / Added {result.addedCount ?? 0} / Existing{" "}
          {result.alreadyExistsCount ?? 0}
        </p>
      )}
      {result.unmatchedWords && result.unmatchedWords.length > 0 && (
        <p className="mt-2 text-xs leading-6 opacity-90">
          Unmatched: {result.unmatchedWords.join(", ")}
        </p>
      )}
    </div>
  )
}

function GrammarCard({ item }: { item: LibraryDetailGrammarItem }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-black/20 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-lg font-bold text-white">{item.title}</span>
            {typeof item.position === "number" ? (
              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-zinc-400">
                #{item.position}
              </span>
            ) : null}
            <span className="rounded-full border border-blue-500/20 bg-blue-500/10 px-2 py-1 text-[11px] text-blue-100">
              {item.family}
            </span>
          </div>
          <p className="mt-2 text-sm font-medium text-blue-200/90">{item.pattern}</p>
          <p className="mt-3 text-sm leading-7 text-zinc-300">{item.coreExplanation}</p>
          {item.usageNote ? (
            <p className="mt-2 text-sm leading-7 text-zinc-400">{item.usageNote}</p>
          ) : null}
          {item.sceneTags.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {item.sceneTags.map((tag) => (
                <span
                  key={`${item.grammarItemId}-scene-${tag}`}
                  className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-zinc-300"
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
          {item.primaryTemplate ? (
            <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3 text-sm text-zinc-200">
              <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Template</p>
              <p className="mt-2">{item.primaryTemplate}</p>
            </div>
          ) : null}
          {item.primaryExample ? (
            <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3 text-sm text-zinc-200">
              <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Example</p>
              <p className="mt-2">{item.primaryExample}</p>
              {item.primaryExampleTranslation ? (
                <p className="mt-1 text-xs leading-6 text-zinc-500">
                  {item.primaryExampleTranslation}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export default function LibraryDetailClient({
  initialLibrary,
  initialWordPage,
  initialGrammarPage,
}: {
  initialLibrary: LibraryDetail
  initialWordPage: LibraryWordPage | null
  initialGrammarPage: LibraryGrammarPage | null
}) {
  const router = useRouter()
  const library = initialLibrary
  const isGrammarLibrary = library.contentType === "grammar"
  const [wordPage, setWordPage] = useState<LibraryWordPage>(
    initialWordPage ?? { items: [], totalCount: 0, nextOffset: null, query: "" }
  )
  const [grammarPage, setGrammarPage] = useState<LibraryGrammarPage>(
    initialGrammarPage ?? { items: [], totalCount: 0, nextOffset: null, query: "" }
  )
  const [libraryQueryInput, setLibraryQueryInput] = useState(
    isGrammarLibrary ? (initialGrammarPage?.query ?? "") : (initialWordPage?.query ?? "")
  )
  const [addQueryInput, setAddQueryInput] = useState("")
  const [batchWordsText, setBatchWordsText] = useState("")
  const [submittedAddQuery, setSubmittedAddQuery] = useState("")
  const [addResults, setAddResults] = useState<SearchableWord[]>([])
  const [mutationResult, setMutationResult] = useState<LibraryWordMutationResult | null>(null)
  const [batchImportResult, setBatchImportResult] = useState<LibraryBatchImportResult | null>(null)
  const [pendingWordId, setPendingWordId] = useState<string | null>(null)
  const [isLoadingItems, startLoadingItems] = useTransition()
  const [isSearchingAdd, startSearchingAdd] = useTransition()
  const [isMutating, startMutating] = useTransition()
  const [isImporting, startImporting] = useTransition()
  const progress = getLibraryProgress(library)
  const allItemsIntroduced = library.wordCount > 0 && library.remainingCount === 0
  const itemLabel = getItemLabel(library.contentType)

  const runLibrarySearch = (query: string) => {
    setMutationResult(null)
    setBatchImportResult(null)
    startLoadingItems(async () => {
      if (isGrammarLibrary) {
        const nextPage = await getLibraryGrammarPage({
          librarySlug: library.slug,
          query,
        })
        setGrammarPage(nextPage)
        return
      }

      const nextPage = await getLibraryWordsPage({
        librarySlug: library.slug,
        query,
      })
      setWordPage(nextPage)
    })
  }

  const loadMoreItems = () => {
    if (isGrammarLibrary) {
      if (grammarPage.nextOffset === null || grammarPage.query) {
        return
      }

      setMutationResult(null)
      setBatchImportResult(null)
      startLoadingItems(async () => {
        const nextPage = await getLibraryGrammarPage({
          librarySlug: library.slug,
          offset: grammarPage.nextOffset ?? 0,
        })

        setGrammarPage((current) => ({
          items: [...current.items, ...nextPage.items],
          totalCount: nextPage.totalCount,
          nextOffset: nextPage.nextOffset,
          query: current.query,
        }))
      })
      return
    }

    if (wordPage.nextOffset === null || wordPage.query) {
      return
    }

    setMutationResult(null)
    setBatchImportResult(null)
    startLoadingItems(async () => {
      const nextPage = await getLibraryWordsPage({
        librarySlug: library.slug,
        offset: wordPage.nextOffset ?? 0,
      })

      setWordPage((current) => ({
        items: [...current.items, ...nextPage.items],
        totalCount: nextPage.totalCount,
        nextOffset: nextPage.nextOffset,
        query: current.query,
      }))
    })
  }

  const handleSearchLibraryItems = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    runLibrarySearch(libraryQueryInput.trim())
  }

  const handleSearchWordsToAdd = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const query = addQueryInput.trim()
    setMutationResult(null)
    setBatchImportResult(null)
    setSubmittedAddQuery(query)

    startSearchingAdd(async () => {
      const results = await searchWordsToAdd(library.slug, query)
      setAddResults(results)
    })
  }

  const handleImportWords = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setMutationResult(null)
    setBatchImportResult(null)

    startImporting(async () => {
      const result = await importWordsToLibrary(library.slug, batchWordsText)
      setBatchImportResult(result)

      if (!result.ok) {
        return
      }

      setBatchWordsText("")
      setSubmittedAddQuery("")
      setAddQueryInput("")
      setAddResults([])
      router.refresh()
    })
  }

  const handleAddWord = (wordId: string) => {
    setMutationResult(null)
    setBatchImportResult(null)
    setPendingWordId(wordId)

    startMutating(async () => {
      const result = await addWordToLibrary(library.slug, wordId)
      setMutationResult(result)
      setPendingWordId(null)

      if (!result.ok) {
        return
      }

      setAddResults((current) =>
        current.map((item) => (item.id === wordId ? { ...item, alreadyInLibrary: true } : item))
      )
      router.refresh()
    })
  }

  const handleRemoveWord = (wordId: string) => {
    const confirmed = window.confirm("Remove this word from the current library?")
    if (!confirmed) {
      return
    }

    setMutationResult(null)
    setBatchImportResult(null)
    setPendingWordId(wordId)

    startMutating(async () => {
      const result = await removeWordFromLibrary(library.slug, wordId)
      setMutationResult(result)
      setPendingWordId(null)

      if (!result.ok) {
        return
      }

      router.refresh()
    })
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 p-4 sm:p-8">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/libraries"
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-zinc-200 transition-colors hover:bg-white/10"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to libraries
          </Link>

          <Link
            href={`/study?library=${encodeURIComponent(library.slug)}`}
            className="inline-flex items-center gap-2 rounded-xl border border-blue-500/20 bg-blue-500/10 px-4 py-2 text-sm font-medium text-blue-100 transition-colors hover:bg-blue-500/15"
          >
            Start studying
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="glass-panel rounded-3xl border border-white/[0.08] p-6">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-zinc-400">
                  <BookOpen className="h-3.5 w-3.5" />
                  {library.sourceType === "official" ? "Official" : "Custom"}
                </div>
                <div className="inline-flex items-center rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-blue-100">
                  {getContentTypeLabel(library.contentType)}
                </div>
              </div>
              <h1 className="mt-4 text-3xl font-black tracking-tight text-white sm:text-4xl">
                {library.name}
              </h1>
              <p className="mt-3 text-sm leading-7 text-zinc-400">
                {getLibraryDescription(library)}
              </p>
            </div>

            <div className="grid min-w-0 grid-cols-2 gap-3 sm:min-w-[320px]">
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
          </div>

          <div className="mt-6 rounded-2xl border border-white/8 bg-black/20 p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                  Study progress
                </p>
                <p className="mt-2 text-2xl font-black text-white">{progress}%</p>
              </div>
              <div className="text-sm text-zinc-400">
                {allItemsIntroduced
                  ? "All scheduled content from this library has already been introduced."
                  : `Started ${library.activeCount} / Remaining ${library.remainingCount}`}
              </div>
            </div>

            <div className="mt-4 h-3 overflow-hidden rounded-full bg-white/8">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-400 via-cyan-300 to-emerald-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-zinc-400">
            <span>Plan: {getPlanStatusLabel(library.planStatus)}</span>
            <span>Daily new: {library.dailyNewLimit ?? "not set"}</span>
            <span>
              {library.isEditable && !isGrammarLibrary
                ? "Editable custom library"
                : "Read-only library"}
            </span>
          </div>
        </div>
      </div>

      {!isGrammarLibrary ? <ResultNotice result={mutationResult} /> : null}
      {!isGrammarLibrary ? <BatchImportNotice result={batchImportResult} /> : null}

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="space-y-4">
          <div className="glass-panel rounded-3xl border border-white/[0.08] p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-xl font-bold text-white">
                  {isGrammarLibrary ? "Grammar items" : "Library words"}
                </h2>
                <p className="mt-1 text-sm text-zinc-400">
                  {isGrammarLibrary
                    ? "Search the structures already included in this grammar library."
                    : "Search words already included in this library. Default order follows the library sequence."}
                </p>
              </div>
              <div className="text-sm text-zinc-500">
                Showing{" "}
                {isGrammarLibrary ? grammarPage.items.length : wordPage.items.length} /{" "}
                {isGrammarLibrary ? grammarPage.totalCount : wordPage.totalCount}
              </div>
            </div>

            <form
              onSubmit={handleSearchLibraryItems}
              className="mt-5 flex flex-col gap-3 sm:flex-row"
            >
              <input
                value={libraryQueryInput}
                onChange={(event) => setLibraryQueryInput(event.target.value)}
                placeholder={isGrammarLibrary ? "Search patterns or titles" : "Search words in this library"}
                className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition-colors focus:border-blue-500/40"
              />
              <button
                type="submit"
                disabled={isLoadingItems}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white/10 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Search className="h-4 w-4" />
                {isLoadingItems ? "Searching..." : "Search"}
              </button>
            </form>

            <div className="mt-5 space-y-3">
              {isGrammarLibrary ? (
                grammarPage.items.length > 0 ? (
                  grammarPage.items.map((item) => (
                    <GrammarCard key={item.grammarItemId} item={item} />
                  ))
                ) : (
                  <div className="rounded-2xl border border-white/8 bg-black/20 px-4 py-6 text-sm text-zinc-400">
                    {isLoadingItems ? "Loading grammar items..." : "No matching grammar items found."}
                  </div>
                )
              ) : wordPage.items.length > 0 ? (
                wordPage.items.map((item) => (
                  <div key={item.wordId} className="rounded-2xl border border-white/8 bg-black/20 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="text-lg font-bold text-white">{item.word}</span>
                          {typeof item.position === "number" ? (
                            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-zinc-400">
                              #{item.position}
                            </span>
                          ) : null}
                          {item.phonetic ? (
                            <span className="text-sm text-blue-200/80">{item.phonetic}</span>
                          ) : null}
                        </div>
                        <p className="mt-2 text-sm leading-7 text-zinc-300">{item.definition}</p>
                        {item.tags ? (
                          <p className="mt-2 text-xs text-zinc-500">Tags: {item.tags}</p>
                        ) : null}
                      </div>

                      {library.isEditable ? (
                        <button
                          type="button"
                          onClick={() => handleRemoveWord(item.wordId)}
                          disabled={isMutating && pendingWordId === item.wordId}
                          className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-100 transition-colors hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          {isMutating && pendingWordId === item.wordId ? "Removing..." : "Remove"}
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-white/8 bg-black/20 px-4 py-6 text-sm text-zinc-400">
                  {isLoadingItems ? "Loading words..." : "No matching words found."}
                </div>
              )}
            </div>

            {((isGrammarLibrary && grammarPage.nextOffset !== null && !grammarPage.query) ||
              (!isGrammarLibrary && wordPage.nextOffset !== null && !wordPage.query)) && (
              <button
                type="button"
                onClick={loadMoreItems}
                disabled={isLoadingItems}
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-zinc-100 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLoadingItems ? "Loading..." : "Load more"}
              </button>
            )}
          </div>
        </section>

        <aside className="space-y-4">
          <div className="glass-panel rounded-3xl border border-white/[0.08] p-6">
            <h2 className="text-xl font-bold text-white">
              {library.isEditable && !isGrammarLibrary ? "Search and add words" : "Notes"}
            </h2>
            <p className="mt-2 text-sm leading-7 text-zinc-400">
              {library.isEditable && !isGrammarLibrary
                ? "Search the global word list and append existing words into this custom library."
                : isGrammarLibrary
                  ? "Grammar libraries are currently read-only in the UI. You can browse cards here and study them from the study page."
                  : "Official libraries are read-only. If you want to customize the content, duplicate it into a custom word library first."}
            </p>

            {library.isEditable && !isGrammarLibrary ? (
              <>
                <form onSubmit={handleImportWords} className="mt-5 flex flex-col gap-3">
                  <textarea
                    value={batchWordsText}
                    onChange={(event) => setBatchWordsText(event.target.value)}
                    placeholder="Paste one word per line, or separate words with commas"
                    className="h-40 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm leading-7 text-white outline-none transition-colors focus:border-emerald-500/40"
                  />
                  <p className="text-xs leading-6 text-zinc-500">
                    Batch import appends new matched words to the end of the library and skips existing ones automatically.
                  </p>
                  <button
                    type="submit"
                    disabled={isImporting}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Plus className="h-4 w-4" />
                    {isImporting ? "Importing..." : "Batch import words"}
                  </button>
                </form>

                <div className="mt-6 h-px bg-white/10" />

                <form onSubmit={handleSearchWordsToAdd} className="mt-5 flex flex-col gap-3">
                  <input
                    value={addQueryInput}
                    onChange={(event) => setAddQueryInput(event.target.value)}
                    placeholder="Search the global word list"
                    className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition-colors focus:border-emerald-500/40"
                  />
                  <button
                    type="submit"
                    disabled={isSearchingAdd}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Search className="h-4 w-4" />
                    {isSearchingAdd ? "Searching..." : "Search addable words"}
                  </button>
                </form>

                <div className="mt-5 space-y-3">
                  {addResults.map((item) => (
                    <div key={item.id} className="rounded-2xl border border-white/8 bg-black/20 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-white">{item.word}</span>
                            {item.phonetic ? (
                              <span className="text-xs text-blue-200/80">{item.phonetic}</span>
                            ) : null}
                          </div>
                          <p className="mt-2 text-sm leading-6 text-zinc-300">{item.definition}</p>
                          {item.tags ? (
                            <p className="mt-2 text-xs text-zinc-500">Tags: {item.tags}</p>
                          ) : null}
                        </div>

                        <button
                          type="button"
                          onClick={() => handleAddWord(item.id)}
                          disabled={item.alreadyInLibrary || (isMutating && pendingWordId === item.id)}
                          className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-100 transition-colors hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          {item.alreadyInLibrary
                            ? "Already added"
                            : isMutating && pendingWordId === item.id
                              ? "Adding..."
                              : "Add"}
                        </button>
                      </div>
                    </div>
                  ))}

                  {submittedAddQuery && addResults.length === 0 && !isSearchingAdd ? (
                    <div className="rounded-2xl border border-white/8 bg-black/20 px-4 py-6 text-sm text-zinc-400">
                      No addable matching words were found.
                    </div>
                  ) : null}
                </div>
              </>
            ) : (
              <div className="mt-5 rounded-2xl border border-white/8 bg-black/20 px-4 py-5 text-sm leading-7 text-zinc-400">
                {isGrammarLibrary
                  ? "This page is the read-only browser for grammar cards. Editing tools for grammar libraries can be added later without changing the study model again."
                  : "This official library is currently read-only in the UI."}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
