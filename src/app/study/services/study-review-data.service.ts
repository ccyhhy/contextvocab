import type { SupabaseClient } from '@supabase/supabase-js'
import { getStudyPriorityReason, sortDueCandidates } from '@/lib/study-scheduler'
import type { StudyBatchItem, StudyView, StudyWordExample, StudyWordProfile } from '../actions'

type DueStudyCategory = 'leech_due' | 'overdue' | 'weak_due' | 'due'

interface StudyReviewDataServiceDeps {
  getRecentFailureSince: () => string
  toPostgrestInList: (ids: string[]) => string
  normalizeStudyBatchItem: (
    value: unknown,
    overrides: Pick<StudyBatchItem, 'isNew' | 'priorityReason'>
  ) => StudyBatchItem | null
  normalizeStudyWordProfile: (value: unknown) => StudyWordProfile | null
  normalizeStudyWordExamples: (rows: unknown[]) => StudyWordExample[]
  isMissingWordProfileTableError: (error: { message?: string; details?: string } | null) => boolean
  logStudyPerformance: (
    label: string,
    startedAt: number,
    metadata?: Record<string, string | number | boolean | null | undefined>
  ) => void
}

interface DueQueryChain {
  eq: (column: string, value: unknown) => DueQueryChain
  lte: (column: string, value: unknown) => DueQueryChain
  gte: (column: string, value: unknown) => DueQueryChain
  lt: (column: string, value: unknown) => DueQueryChain
  or: (filters: string) => DueQueryChain
  in: (column: string, values: string[]) => DueQueryChain
  not: (column: string, operator: string, value: string) => DueQueryChain
}

function applyDueFilters(
  query: DueQueryChain,
  {
    tag,
    skippedWordIds,
    preferredWordIds,
    studyView,
    libraryWordIds,
    deps,
  }: {
    tag: string
    skippedWordIds: string[]
    preferredWordIds: string[]
    studyView: StudyView
    libraryWordIds: string[]
    deps: Pick<StudyReviewDataServiceDeps, 'getRecentFailureSince' | 'toPostgrestInList'>
  }
) {
  let nextQuery = query

  switch (studyView) {
    case 'favorites':
      nextQuery = nextQuery.eq('is_favorite', true)
      break
    case 'weak':
      nextQuery = nextQuery.or('last_score.lt.75,consecutive_failures.gte.2')
      break
    case 'recent_failures':
      nextQuery = nextQuery
        .or('last_score.lt.60,consecutive_failures.gte.1')
        .gte('last_reviewed_at', deps.getRecentFailureSince())
      break
    case 'all':
    default:
      break
  }

  if (tag !== 'All') {
    nextQuery = nextQuery.eq('words.tags', tag)
  }
  if (libraryWordIds.length > 0) {
    nextQuery = nextQuery.in('word_id', libraryWordIds)
  }
  if (preferredWordIds.length > 0) {
    nextQuery = nextQuery.in('word_id', preferredWordIds)
  }
  if (skippedWordIds.length > 0) {
    nextQuery = nextQuery.not('word_id', 'in', deps.toPostgrestInList(skippedWordIds))
  }

  return nextQuery
}

async function loadDueRowsByCategory({
  supabase,
  userId,
  tag,
  today,
  skippedWordIds,
  preferredWordIds,
  studyView,
  libraryWordIds,
  category,
  limit,
  deps,
}: {
  supabase: SupabaseClient
  userId: string
  tag: string
  today: string
  skippedWordIds: string[]
  preferredWordIds: string[]
  studyView: StudyView
  libraryWordIds: string[]
  category: DueStudyCategory
  limit: number
  deps: Pick<
    StudyReviewDataServiceDeps,
    'getRecentFailureSince' | 'toPostgrestInList' | 'logStudyPerformance'
  >
}) {
  const startedAt = Date.now()
  let query = applyDueFilters(
    supabase
      .from('user_words')
      .select('*, words!inner(*)')
      .eq('user_id', userId)
      .lte('next_review_date', today),
    {
      tag,
      skippedWordIds,
      preferredWordIds,
      studyView,
      libraryWordIds,
      deps,
    }
  )

  switch (category) {
    case 'leech_due':
      query = query
        .gte('consecutive_failures', 3)
        .order('consecutive_failures', { ascending: false, nullsFirst: false })
        .order('next_review_date', { ascending: true })
        .order('last_reviewed_at', { ascending: true, nullsFirst: true })
      break
    case 'overdue':
      query = query
        .lt('next_review_date', today)
        .order('next_review_date', { ascending: true })
        .order('last_reviewed_at', { ascending: true, nullsFirst: true })
      break
    case 'weak_due':
      query = query
        .eq('next_review_date', today)
        .lt('last_score', 75)
        .order('last_score', { ascending: true, nullsFirst: false })
        .order('last_reviewed_at', { ascending: true, nullsFirst: true })
      break
    case 'due':
      query = query
        .eq('next_review_date', today)
        .order('last_reviewed_at', { ascending: true, nullsFirst: true })
        .order('created_at', { ascending: true, nullsFirst: true })
      break
    default:
      break
  }

  const { data } = await query.limit(limit)
  const rows = sortDueCandidates(
    (data ?? []) as Parameters<typeof sortDueCandidates>[0],
    today
  ).filter((row) => getStudyPriorityReason(row, today) === category)

  deps.logStudyPerformance('getDueRowsByCategory', startedAt, {
    category,
    studyView,
    tag,
    libraryScoped: libraryWordIds.length > 0,
    preferred: preferredWordIds.length,
    skipped: skippedWordIds.length,
    rows: rows.length,
    limit,
  })

  return rows
}

export async function loadDueWordCount({
  supabase,
  userId,
  tag,
  today,
  skippedWordIds,
  preferredWordIds,
  studyView,
  libraryWordIds = [],
  deps,
}: {
  supabase: SupabaseClient
  userId: string
  tag: string
  today: string
  skippedWordIds: string[]
  preferredWordIds: string[]
  studyView: StudyView
  libraryWordIds?: string[]
  deps: Pick<
    StudyReviewDataServiceDeps,
    'getRecentFailureSince' | 'toPostgrestInList' | 'logStudyPerformance'
  >
}) {
  const startedAt = Date.now()
  const query = applyDueFilters(
    supabase
      .from('user_words')
      .select('id, words!inner(id)', { count: 'exact', head: true })
      .eq('user_id', userId)
      .lte('next_review_date', today),
    {
      tag,
      skippedWordIds,
      preferredWordIds,
      studyView,
      libraryWordIds,
      deps,
    }
  )

  const { count } = await query
  const total = count ?? 0

  deps.logStudyPerformance('getDueWordCount', startedAt, {
    studyView,
    tag,
    libraryScoped: libraryWordIds.length > 0,
    skipped: skippedWordIds.length,
    preferred: preferredWordIds.length,
    count: total,
  })

  return total
}

export async function loadDueStudyItems({
  supabase,
  userId,
  tag,
  today,
  skippedWordIds,
  preferredWordIds,
  batchSize,
  studyView,
  libraryWordIds = [],
  deps,
}: {
  supabase: SupabaseClient
  userId: string
  tag: string
  today: string
  skippedWordIds: string[]
  preferredWordIds: string[]
  batchSize: number
  studyView: StudyView
  libraryWordIds?: string[]
  deps: Pick<
    StudyReviewDataServiceDeps,
    | 'getRecentFailureSince'
    | 'toPostgrestInList'
    | 'normalizeStudyBatchItem'
    | 'logStudyPerformance'
  >
}) {
  const startedAt = Date.now()
  const targetSize = Math.max(batchSize * 6, 24)
  const categories: DueStudyCategory[] = ['leech_due', 'overdue', 'weak_due', 'due']
  const items: StudyBatchItem[] = []

  for (const category of categories) {
    const rows = await loadDueRowsByCategory({
      supabase,
      userId,
      tag,
      today,
      skippedWordIds,
      preferredWordIds,
      studyView,
      libraryWordIds,
      category,
      limit: targetSize,
      deps,
    })

    for (const row of rows) {
      const item = deps.normalizeStudyBatchItem(row, {
        isNew: false,
        priorityReason: category,
      })

      if (!item) {
        continue
      }

      items.push(item)
      if (items.length >= targetSize) {
        deps.logStudyPerformance('getDueStudyItems', startedAt, {
          studyView,
          tag,
          targetSize,
          resultCount: items.length,
          libraryScoped: libraryWordIds.length > 0,
        })
        return items
      }
    }
  }

  deps.logStudyPerformance('getDueStudyItems', startedAt, {
    studyView,
    tag,
    targetSize,
    resultCount: items.length,
    libraryScoped: libraryWordIds.length > 0,
  })

  return items
}

export async function hydrateStudyBatchWordDetails({
  supabase,
  batch,
  deps,
}: {
  supabase: SupabaseClient
  batch: StudyBatchItem[]
  deps: Pick<
    StudyReviewDataServiceDeps,
    | 'normalizeStudyWordProfile'
    | 'normalizeStudyWordExamples'
    | 'isMissingWordProfileTableError'
    | 'logStudyPerformance'
  >
}): Promise<StudyBatchItem[]> {
  const startedAt = Date.now()
  if (batch.length === 0) {
    return batch
  }

  const wordIds = Array.from(new Set(batch.map((item) => item.word_id)))
  const [profilesResponse, examplesResponse] = await Promise.all([
    supabase
      .from('word_profiles')
      .select(
        'word_id, core_meaning, semantic_feel, usage_note, usage_register, scene_tags, collocations, contrast_words'
      )
      .in('word_id', wordIds),
    supabase
      .from('word_profile_examples')
      .select('word_id, sentence, translation, scene, is_primary, quality_score')
      .in('word_id', wordIds),
  ])

  if (profilesResponse.error || examplesResponse.error) {
    const relevantError = profilesResponse.error ?? examplesResponse.error

    if (!deps.isMissingWordProfileTableError(relevantError)) {
      console.error('Failed to hydrate study word details:', relevantError)
    }

    deps.logStudyPerformance('hydrateStudyBatchWordDetails', startedAt, {
      batchSize: batch.length,
      hydratedWords: 0,
      fallback: true,
    })

    return batch
  }

  const profileMap = new Map<string, StudyWordProfile>()
  for (const row of profilesResponse.data ?? []) {
    const normalized = deps.normalizeStudyWordProfile(row)
    if (normalized && typeof row.word_id === 'string') {
      profileMap.set(row.word_id, normalized)
    }
  }

  const exampleRowsByWordId = new Map<string, unknown[]>()
  for (const row of examplesResponse.data ?? []) {
    if (typeof row.word_id !== 'string') {
      continue
    }

    const existingRows = exampleRowsByWordId.get(row.word_id) ?? []
    existingRows.push(row)
    exampleRowsByWordId.set(row.word_id, existingRows)
  }

  const hydratedBatch = batch.map((item) => {
    const hydratedExamples = deps.normalizeStudyWordExamples(
      exampleRowsByWordId.get(item.word_id) ?? []
    )
    const hydratedProfile = profileMap.get(item.word_id) ?? null

    return {
      ...item,
      words: {
        ...item.words,
        profile: hydratedProfile,
        examples: hydratedExamples,
        example: hydratedExamples[0]?.sentence ?? item.words.example ?? null,
      },
    }
  })

  deps.logStudyPerformance('hydrateStudyBatchWordDetails', startedAt, {
    batchSize: batch.length,
    hydratedWords: hydratedBatch.length,
  })

  return hydratedBatch
}
