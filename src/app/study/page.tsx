import {
  getFavoriteWordIds,
  getHistoryGrammarReviewTarget,
  getHistorySentenceReviewTarget,
  getStudyBatch,
  getStudyLibraryOptions,
} from './actions'
import { requirePageUser } from '@/lib/supabase/user'
import StudyClient from './study-client'

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

  const resolvedSearchParams = searchParams ? await searchParams : undefined
  const requestedLibrarySlug =
    resolvedSearchParams?.library?.trim().toLowerCase() || 'all'
  const reviewSentenceId = resolvedSearchParams?.reviewSentenceId?.trim() || ''
  const reviewGrammarAttemptId =
    resolvedSearchParams?.reviewGrammarAttemptId?.trim() || ''

  const [historyReviewTarget, initialFavoriteWordIds, libraries] = await Promise.all([
    reviewSentenceId
      ? getHistorySentenceReviewTarget(reviewSentenceId)
      : reviewGrammarAttemptId
        ? getHistoryGrammarReviewTarget(reviewGrammarAttemptId)
        : Promise.resolve(null),
    getFavoriteWordIds(),
    getStudyLibraryOptions(),
  ])

  const initialLibrarySlug =
    historyReviewTarget?.preferredLibrarySlug?.trim().toLowerCase() ||
    requestedLibrarySlug
  const reviewBatchItem = historyReviewTarget?.batchItem ?? null
  const skippedItemIds = reviewBatchItem
    ? [reviewBatchItem.kind === 'grammar' ? reviewBatchItem.grammar_item_id : reviewBatchItem.word_id]
    : []

  const followupBatch = await getStudyBatch({
    librarySlug: initialLibrarySlug,
    skippedWordIds: skippedItemIds,
    batchSize: reviewBatchItem ? 4 : undefined,
  })
  const initialBatch = reviewBatchItem ? [reviewBatchItem, ...followupBatch] : followupBatch

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
