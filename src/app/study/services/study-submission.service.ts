import type { SupabaseClient } from '@supabase/supabase-js'
import { calculateNextReview } from '@/lib/srs'
import { shiftDateString } from '@/lib/app-date'
import type { EvaluationResult, StudySubmissionResult } from '../actions'

interface SubmissionUserWordRecord {
  id: string
  repetitions: number
  interval: number
  ease_factor: number
  next_review_date?: string | null
  last_score?: number | null
  last_reviewed_at?: string | null
  consecutive_failures?: number | null
  lapse_count?: number | null
}

interface SubmissionLibrary {
  id: string
}

interface StudySubmissionServiceDeps {
  parseEvaluationJson: (content: string, fallbackSentence: string) => EvaluationResult
  getWordLearningHistory: (
    supabase: SupabaseClient,
    userId: string,
    wordId: string
  ) => Promise<string[]>
  evaluateSentence: (
    wordStr: string,
    sentence: string,
    definition: string,
    tags: string,
    learningHistory: string[]
  ) => Promise<EvaluationResult>
  toUserWordRecord: (value: unknown) => SubmissionUserWordRecord | null
  getLibraryBySlug: (
    supabase: SupabaseClient,
    librarySlug: string
  ) => Promise<SubmissionLibrary | null>
  attachWordToUser: (
    wordId: string,
    reviewDate: string,
    supabase: SupabaseClient,
    userId: string,
    libraryId?: string | null
  ) => Promise<unknown>
  getNextFailureCounters: (
    currentSrs: SubmissionUserWordRecord,
    reviewBucket: ReturnType<typeof calculateNextReview>['reviewBucket']
  ) => {
    consecutiveFailures: number
    lapseCount: number
  }
  buildWordFeedbackForStorage: (evaluation: EvaluationResult, sentence: string) => string
  touchLibraryProgress: (
    supabase: SupabaseClient,
    userId: string,
    wordId: string,
    librarySlug?: string
  ) => Promise<void>
  formatModelLabel: (model: string, apiBase: string) => string
}

async function resolveEvaluation({
  supabase,
  userId,
  wordId,
  wordStr,
  sentence,
  definition,
  tags,
  streamedContent,
  parseLogLabel,
  deps,
}: {
  supabase: SupabaseClient
  userId: string
  wordId: string
  wordStr: string
  sentence: string
  definition: string
  tags: string
  streamedContent?: string | null
  parseLogLabel: string
  deps: Pick<
    StudySubmissionServiceDeps,
    'parseEvaluationJson' | 'getWordLearningHistory' | 'evaluateSentence'
  >
}) {
  let evaluation: EvaluationResult | null = null

  if (streamedContent?.trim()) {
    try {
      evaluation = deps.parseEvaluationJson(streamedContent, sentence)
    } catch (error) {
      console.error(parseLogLabel, error)
    }
  }

  if (evaluation) {
    return evaluation
  }

  const learningHistory = await deps.getWordLearningHistory(supabase, userId, wordId)
  return deps.evaluateSentence(wordStr, sentence, definition, tags, learningHistory)
}

function getEvaluationModelLabel(
  deps: Pick<StudySubmissionServiceDeps, 'formatModelLabel'>
) {
  const evaluationModel = process.env.OPENAI_MODEL || 'gpt-4o-mini'
  const evaluationApiBase = process.env.OPENAI_API_BASE || 'https://api.openai.com/v1'

  return deps.formatModelLabel(evaluationModel, evaluationApiBase)
}

export async function submitStudySentence({
  supabase,
  userId,
  today,
  userWordId,
  wordId,
  wordStr,
  definition,
  tags,
  sentence,
  librarySlug,
  streamedContent,
  deps,
}: {
  supabase: SupabaseClient
  userId: string
  today: string
  userWordId: string | null
  wordId: string
  wordStr: string
  definition: string
  tags: string
  sentence: string
  librarySlug?: string
  streamedContent?: string | null
  deps: StudySubmissionServiceDeps
}): Promise<StudySubmissionResult> {
  const evaluation = await resolveEvaluation({
    supabase,
    userId,
    wordId,
    wordStr,
    sentence,
    definition,
    tags,
    streamedContent,
    parseLogLabel: 'Failed to parse streamed evaluation content:',
    deps,
  })

  let currentSrs: SubmissionUserWordRecord | null = null

  if (userWordId) {
    const { data } = await supabase.from('user_words').select('*').eq('id', userWordId).single()
    currentSrs = deps.toUserWordRecord(data)
  }

  if (!currentSrs) {
    const library = await deps.getLibraryBySlug(supabase, librarySlug ?? 'all')
    const attached = await deps.attachWordToUser(wordId, today, supabase, userId, library?.id)
    currentSrs = deps.toUserWordRecord(attached)

    if (!currentSrs) {
      throw new Error('User word not found')
    }
  }

  const nextSrs = calculateNextReview(
    {
      repetitions: currentSrs.repetitions,
      interval: currentSrs.interval,
      easeFactor: currentSrs.ease_factor,
    },
    evaluation.score
  )

  const reviewStats = deps.getNextFailureCounters(currentSrs, nextSrs.reviewBucket)
  const reviewedAt = new Date().toISOString()
  const nextReviewDate = shiftDateString(today, nextSrs.interval)

  const { error: updateError } = await supabase
    .from('user_words')
    .update({
      repetitions: nextSrs.repetitions,
      interval: nextSrs.interval,
      ease_factor: nextSrs.easeFactor,
      next_review_date: nextReviewDate,
      last_score: evaluation.score,
      last_reviewed_at: reviewedAt,
      consecutive_failures: reviewStats.consecutiveFailures,
      lapse_count: reviewStats.lapseCount,
    })
    .eq('id', currentSrs.id)

  if (updateError) {
    throw updateError
  }

  const { data: savedSentence, error: savedSentenceError } = await supabase
    .from('sentences')
    .insert({
      user_id: userId,
      word_id: wordId,
      original_text: sentence,
      ai_score: evaluation.score,
      ai_feedback: deps.buildWordFeedbackForStorage(evaluation, sentence),
      attempt_status: evaluation.attemptStatus,
      usage_quality: evaluation.usageQuality,
      uses_word_in_context: evaluation.usesWordInContext,
      is_meta_sentence: evaluation.isMetaSentence,
    })
    .select()
    .single()

  if (savedSentenceError) {
    const { error: rollbackError } = await supabase
      .from('user_words')
      .update({
        repetitions: currentSrs.repetitions,
        interval: currentSrs.interval,
        ease_factor: currentSrs.ease_factor,
        next_review_date: currentSrs.next_review_date ?? today,
        last_score: currentSrs.last_score ?? null,
        last_reviewed_at: currentSrs.last_reviewed_at ?? null,
        consecutive_failures: currentSrs.consecutive_failures ?? 0,
        lapse_count: currentSrs.lapse_count ?? 0,
      })
      .eq('id', currentSrs.id)

    if (rollbackError) {
      console.error('Failed to rollback user_words after sentence insert error:', rollbackError)
      throw new Error('Failed to save sentence history and rollback study state.')
    }

    throw savedSentenceError
  }

  await deps.touchLibraryProgress(supabase, userId, wordId, librarySlug)

  return {
    evaluation,
    nextSrs,
    savedSentence,
    evaluationModelLabel: getEvaluationModelLabel(deps),
    reviewImpact: 'scheduled',
    userWordId: currentSrs.id,
  }
}

export async function rewriteStudySentence({
  supabase,
  userId,
  wordId,
  wordStr,
  definition,
  tags,
  sentence,
  librarySlug,
  streamedContent,
  deps,
}: {
  supabase: SupabaseClient
  userId: string
  wordId: string
  wordStr: string
  definition: string
  tags: string
  sentence: string
  librarySlug?: string
  streamedContent?: string | null
  deps: Pick<
    StudySubmissionServiceDeps,
    | 'parseEvaluationJson'
    | 'getWordLearningHistory'
    | 'evaluateSentence'
    | 'touchLibraryProgress'
    | 'formatModelLabel'
  >
}): Promise<StudySubmissionResult> {
  const evaluation = await resolveEvaluation({
    supabase,
    userId,
    wordId,
    wordStr,
    sentence,
    definition,
    tags,
    streamedContent,
    parseLogLabel: 'Failed to parse streamed rewrite evaluation content:',
    deps,
  })

  await deps.touchLibraryProgress(supabase, userId, wordId, librarySlug)

  return {
    evaluation,
    nextSrs: null,
    savedSentence: null,
    evaluationModelLabel: getEvaluationModelLabel(deps),
    reviewImpact: 'practice_only',
    userWordId: null,
  }
}
