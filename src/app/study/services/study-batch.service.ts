import type { SupabaseClient } from '@supabase/supabase-js'
import type { GetStudyBatchParams, StudyBatchItem, StudyView } from '../actions'

interface StudyBatchScopeLibrary {
  id: string
}

interface StudyBatchServiceDeps {
  normalizeLibrarySlug: (value?: string | null) => string
  getLibrarySlugForLegacyTag: (tag?: string | null) => string
  getLegacyTagForLibrarySlug: (librarySlug: string) => string
  resolveStudyView: (params: Pick<GetStudyBatchParams, 'studyView' | 'favoritesOnly'>) => StudyView
  isReviewOnlyView: (studyView: StudyView) => boolean
  getUserFavoriteWordIds: (supabase: SupabaseClient, userId: string) => Promise<string[]>
  getLibraryBySlug: (
    supabase: SupabaseClient,
    librarySlug: string
  ) => Promise<StudyBatchScopeLibrary | null>
  getLibraryWordIds: (supabase: SupabaseClient, libraryId: string) => Promise<string[]>
  ensureUserLibraryPlan: (
    supabase: SupabaseClient,
    userId: string,
    libraryId: string
  ) => Promise<void>
  getDueWordCount: (
    supabase: SupabaseClient,
    userId: string,
    tag: string,
    today: string,
    skippedWordIds: string[],
    preferredWordIds: string[],
    studyView: StudyView,
    libraryWordIds?: string[]
  ) => Promise<number>
  getDueStudyItems: (
    supabase: SupabaseClient,
    userId: string,
    tag: string,
    today: string,
    skippedWordIds: string[],
    preferredWordIds: string[],
    batchSize: number,
    studyView: StudyView,
    libraryWordIds?: string[]
  ) => Promise<StudyBatchItem[]>
  getNewStudyItems: (
    supabase: SupabaseClient,
    userId: string,
    tag: string,
    skippedWordIds: string[],
    preferredWordIds: string[],
    batchSize: number,
    libraryWordIds?: string[]
  ) => Promise<StudyBatchItem[]>
  hydrateStudyBatchWordDetails: (
    supabase: SupabaseClient,
    batch: StudyBatchItem[]
  ) => Promise<StudyBatchItem[]>
  logStudyPerformance: (
    label: string,
    startedAt: number,
    metadata?: Record<string, string | number | boolean | null | undefined>
  ) => void
}

function composeStudyBatch(
  dueItems: StudyBatchItem[],
  newItems: StudyBatchItem[],
  dueCount: number,
  favoritesOnly: boolean,
  batchSize: number
) {
  const targetReviewCount = favoritesOnly ? batchSize : Math.min(dueCount, Math.ceil(batchSize * 0.6))
  const targetNewCount = favoritesOnly ? 0 : Math.max(batchSize - targetReviewCount, 0)
  const dueQueue = [...dueItems]
  const newQueue = [...newItems]
  const batch: StudyBatchItem[] = []

  while (batch.length < batchSize) {
    const nextDue = dueQueue[0]
    const nextNew = newQueue[0]

    if (!nextDue && !nextNew) {
      break
    }

    const useReview =
      dueQueue.length > 0 &&
      (batch.filter((item) => !item.isNew).length < targetReviewCount ||
        newQueue.length === 0 ||
        batch.filter((item) => item.isNew).length >= targetNewCount)

    if (useReview) {
      batch.push(dueQueue.shift()!)
      continue
    }

    if (newQueue.length > 0) {
      batch.push(newQueue.shift()!)
      continue
    }

    batch.push(dueQueue.shift()!)
  }

  return batch
}

export async function loadStudyBatch({
  supabase,
  userId,
  today,
  params = {},
  defaultBatchSize,
  deps,
}: {
  supabase: SupabaseClient
  userId: string
  today: string
  params?: GetStudyBatchParams
  defaultBatchSize: number
  deps: StudyBatchServiceDeps
}): Promise<StudyBatchItem[]> {
  const startedAt = Date.now()
  const {
    librarySlug,
    studyView,
    tag = 'All',
    skippedWordIds = [],
    favoritesOnly = false,
    batchSize = defaultBatchSize,
  } = params

  const resolvedLibrarySlug = deps.normalizeLibrarySlug(
    librarySlug ?? deps.getLibrarySlugForLegacyTag(tag)
  )
  const resolvedStudyView = deps.resolveStudyView({ studyView, favoritesOnly })
  const preferredWordIds =
    resolvedStudyView === 'favorites' ? await deps.getUserFavoriteWordIds(supabase, userId) : []
  let tagFilter = tag
  let libraryWordIds: string[] = []

  if (resolvedLibrarySlug !== 'all') {
    const library = await deps.getLibraryBySlug(supabase, resolvedLibrarySlug)
    if (library) {
      tagFilter = 'All'
      libraryWordIds = await deps.getLibraryWordIds(supabase, library.id)
      await deps.ensureUserLibraryPlan(supabase, userId, library.id)
    } else {
      tagFilter = deps.getLegacyTagForLibrarySlug(resolvedLibrarySlug)
    }
  } else {
    tagFilter = 'All'
  }

  if (resolvedStudyView === 'favorites' && preferredWordIds.length === 0) {
    deps.logStudyPerformance('getStudyBatch', startedAt, {
      librarySlug: resolvedLibrarySlug,
      studyView: resolvedStudyView,
      batchSize,
      emptyFavorites: true,
    })

    return []
  }

  const [dueCount, dueItems] = await Promise.all([
    deps.getDueWordCount(
      supabase,
      userId,
      tagFilter,
      today,
      skippedWordIds,
      preferredWordIds,
      resolvedStudyView,
      libraryWordIds
    ),
    deps.getDueStudyItems(
      supabase,
      userId,
      tagFilter,
      today,
      skippedWordIds,
      preferredWordIds,
      batchSize,
      resolvedStudyView,
      libraryWordIds
    ),
  ])

  const newItems = deps.isReviewOnlyView(resolvedStudyView)
    ? []
    : await deps.getNewStudyItems(
        supabase,
        userId,
        tagFilter,
        [...skippedWordIds, ...dueItems.map((item) => item.word_id)],
        preferredWordIds,
        batchSize,
        libraryWordIds
      )

  const batch = composeStudyBatch(
    dueItems,
    newItems,
    dueCount,
    deps.isReviewOnlyView(resolvedStudyView),
    batchSize
  )
  const hydratedBatch = await deps.hydrateStudyBatchWordDetails(supabase, batch)

  deps.logStudyPerformance('getStudyBatch', startedAt, {
    librarySlug: resolvedLibrarySlug,
    studyView: resolvedStudyView,
    batchSize,
    dueCount,
    dueItems: dueItems.length,
    newItems: newItems.length,
    hydratedItems: hydratedBatch.length,
    libraryScoped: libraryWordIds.length > 0,
    preferred: preferredWordIds.length,
    skipped: skippedWordIds.length,
  })

  return hydratedBatch
}
