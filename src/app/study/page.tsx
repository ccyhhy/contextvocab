import {
  getFavoriteWordIds,
  getHistoryGrammarReviewTarget,
  getHistorySentenceReviewTarget,
  getStudyBatch,
  getStudyLibraryOptions,
} from './actions'
import { requirePageUser } from '@/lib/supabase/user'
import StudyClient from './study-client'

const STUDY_PAGE_LOG_THRESHOLD_MS = 150

function logStudyPagePerformance(
  startedAt: number,
  metadata?: Record<string, string | number | boolean | null | undefined>
) {
  const durationMs = Date.now() - startedAt
  if (durationMs < STUDY_PAGE_LOG_THRESHOLD_MS) {
    return
  }

  const details =
    metadata && Object.keys(metadata).length > 0
      ? ` ${Object.entries(metadata)
          .map(([key, value]) => `${key}=${String(value)}`)
          .join(' ')}`
      : ''

  console.info(`[study:page] ${durationMs}ms${details}`)
}

export default async function StudyPage({
  searchParams,
}: {
  searchParams?: Promise<{
    library?: string
    reviewSentenceId?: string
    reviewGrammarAttemptId?: string
  }>
}) {
  await requirePageUser()
  return renderStudyPage(searchParams)
}

async function renderStudyPage(
  searchParams?: Promise<{
    library?: string
    reviewSentenceId?: string
    reviewGrammarAttemptId?: string
  }>
) {
  const startedAt = Date.now()
  const resolvedSearchParams = searchParams ? await searchParams : undefined
  const requestedLibrarySlug =
    resolvedSearchParams?.library?.trim().toLowerCase() || 'all'
  const reviewSentenceId = resolvedSearchParams?.reviewSentenceId?.trim() || ''
  const reviewGrammarAttemptId =
    resolvedSearchParams?.reviewGrammarAttemptId?.trim() || ''
  const isReviewRoute = Boolean(reviewSentenceId || reviewGrammarAttemptId)
  const shouldDeferLibraryOptions = Boolean(reviewSentenceId) && !reviewGrammarAttemptId

  const [historyReviewTarget, initialFavoriteWordIds, libraries, initialBatchForRegularEntry] =
    await Promise.all([
      reviewSentenceId
        ? getHistorySentenceReviewTarget(reviewSentenceId)
        : reviewGrammarAttemptId
          ? getHistoryGrammarReviewTarget(reviewGrammarAttemptId)
          : Promise.resolve(null),
      getFavoriteWordIds(),
      shouldDeferLibraryOptions ? Promise.resolve([]) : getStudyLibraryOptions(),
      isReviewRoute
        ? Promise.resolve([])
        : getStudyBatch({
            librarySlug: requestedLibrarySlug,
          }),
    ])

  const initialLibrarySlug =
    historyReviewTarget?.preferredLibrarySlug?.trim().toLowerCase() ||
    requestedLibrarySlug
  const reviewBatchItem = historyReviewTarget?.batchItem ?? null
  const initialBatch = reviewBatchItem ? [reviewBatchItem] : initialBatchForRegularEntry

  logStudyPagePerformance(startedAt, {
    librarySlug: initialLibrarySlug,
    reviewRoute: isReviewRoute,
    hasReviewTarget: reviewBatchItem !== null,
    deferredLibraryOptions: shouldDeferLibraryOptions,
    initialBatch: initialBatch.length,
    libraries: libraries.length,
    favorites: initialFavoriteWordIds.length,
  })

  return (
    <div className="flex h-full w-full items-center justify-center">
      <StudyClient
        initialBatch={initialBatch}
        initialFavoriteWordIds={initialFavoriteWordIds}
        enrichmentProgress={[]}
        libraries={libraries}
        initialLibrarySlug={initialLibrarySlug}
        initialHistoryReview={historyReviewTarget?.review ?? null}
        initialSentenceDraft={historyReviewTarget?.review?.sentence ?? ''}
      />
    </div>
  )
}
