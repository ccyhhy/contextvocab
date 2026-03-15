import type { SupabaseClient } from '@supabase/supabase-js'
import type { StudyBatchItem } from '../actions'

interface StudyNewWordServiceDeps {
  getStartedWordIds: (
    supabase: SupabaseClient,
    userId: string,
    candidateWordIds?: string[]
  ) => Promise<Set<string>>
  toPostgrestInList: (ids: string[]) => string
  normalizeNewStudyBatchItem: (
    value: unknown,
    overrides: Pick<StudyBatchItem, 'isNew' | 'priorityReason'>
  ) => StudyBatchItem | null
  logStudyPerformance: (
    label: string,
    startedAt: number,
    metadata?: Record<string, string | number | boolean | null | undefined>
  ) => void
}

interface WordCandidate {
  id: string
}

function isWordCandidate(value: unknown): value is WordCandidate {
  return typeof (value as { id?: unknown } | null)?.id === 'string'
}

async function isWordStartedOutsideUserWords(
  supabase: SupabaseClient,
  userId: string,
  wordId: string
) {
  const [
    { data: sentenceRow, error: sentenceError },
    { data: libraryWordRow, error: libraryWordError },
  ] = await Promise.all([
    supabase
      .from('sentences')
      .select('word_id')
      .eq('user_id', userId)
      .eq('word_id', wordId)
      .maybeSingle(),
    supabase
      .from('user_library_words')
      .select('word_id')
      .eq('user_id', userId)
      .eq('word_id', wordId)
      .maybeSingle(),
  ])

  if (sentenceError) {
    console.error('Failed to check sentence history for unseen-word RPC candidate:', sentenceError)
  }

  if (libraryWordError) {
    console.error(
      'Failed to check user_library_words for unseen-word RPC candidate:',
      libraryWordError
    )
  }

  return (
    typeof (sentenceRow as { word_id?: string | null } | null)?.word_id === 'string' ||
    typeof (libraryWordRow as { word_id?: string | null } | null)?.word_id === 'string'
  )
}

async function pickUnseenWordViaRpc(
  tag: string,
  skippedWordIds: string[],
  supabase: SupabaseClient,
  userId: string,
  attempts = 8
): Promise<unknown | null> {
  const excludedWordIds = [...new Set(skippedWordIds)]

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const { data, error } = await supabase.rpc('pick_unstudied_word', {
      p_user_id: userId,
      p_tag: tag === 'All' ? null : tag,
      p_skipped_ids: excludedWordIds,
    })

    if (error) {
      console.error('Failed to pick unseen word via RPC:', error)
      return null
    }

    const candidate = Array.isArray(data) ? data[0] : null
    if (!isWordCandidate(candidate)) {
      return null
    }

    const startedOutsideUserWords = await isWordStartedOutsideUserWords(
      supabase,
      userId,
      candidate.id
    )

    if (!startedOutsideUserWords) {
      return candidate
    }

    excludedWordIds.push(candidate.id)
  }

  return null
}

async function pickRandomUnseenWord(
  tag: string,
  skippedWordIds: string[],
  preferredWordIds: string[],
  supabase: SupabaseClient,
  startedWordIds: Set<string>,
  attempts = 8
): Promise<unknown | null> {
  let countQuery = supabase.from('words').select('id', { count: 'exact', head: true })
  if (tag !== 'All') {
    countQuery = countQuery.eq('tags', tag)
  }
  if (preferredWordIds.length > 0) {
    countQuery = countQuery.in('id', preferredWordIds)
  }

  const { count } = await countQuery
  if (!count || count <= 0) {
    return null
  }

  const skippedSet = new Set(skippedWordIds)
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const randomOffset = Math.floor(Math.random() * count)
    let pickQuery = supabase.from('words').select('*').range(randomOffset, randomOffset).limit(1)
    if (tag !== 'All') {
      pickQuery = pickQuery.eq('tags', tag)
    }
    if (preferredWordIds.length > 0) {
      pickQuery = pickQuery.in('id', preferredWordIds)
    }

    const { data } = await pickQuery
    const candidate = data?.[0]
    if (!isWordCandidate(candidate) || skippedSet.has(candidate.id)) {
      continue
    }

    if (!startedWordIds.has(candidate.id)) {
      return candidate
    }
  }

  return null
}

async function findFallbackUnseenWord(
  tag: string,
  skippedWordIds: string[],
  preferredWordIds: string[],
  supabase: SupabaseClient,
  startedWordIds: Set<string>,
  deps: Pick<StudyNewWordServiceDeps, 'toPostgrestInList'>
): Promise<unknown | null> {
  const excludeIds = [...new Set([...startedWordIds, ...skippedWordIds])]
  let fallbackQuery = supabase.from('words').select('*')
  if (tag !== 'All') {
    fallbackQuery = fallbackQuery.eq('tags', tag)
  }
  if (preferredWordIds.length > 0) {
    fallbackQuery = fallbackQuery.in('id', preferredWordIds)
  }
  if (excludeIds.length > 0) {
    fallbackQuery = fallbackQuery.not('id', 'in', deps.toPostgrestInList(excludeIds))
  }

  const { data: fallbackCandidates } = await fallbackQuery.limit(1)
  return fallbackCandidates?.[0] ?? null
}

async function pickUnseenWord(
  tag: string,
  skippedWordIds: string[],
  preferredWordIds: string[],
  supabase: SupabaseClient,
  userId: string,
  deps: Pick<StudyNewWordServiceDeps, 'getStartedWordIds' | 'toPostgrestInList'>
): Promise<unknown | null> {
  if (preferredWordIds.length === 0) {
    const rpcCandidate = await pickUnseenWordViaRpc(tag, skippedWordIds, supabase, userId)
    if (rpcCandidate) {
      return rpcCandidate
    }
  }

  const startedWordIds = await deps.getStartedWordIds(supabase, userId)
  const randomCandidate = await pickRandomUnseenWord(
    tag,
    skippedWordIds,
    preferredWordIds,
    supabase,
    startedWordIds
  )

  if (randomCandidate) {
    return randomCandidate
  }

  return findFallbackUnseenWord(
    tag,
    skippedWordIds,
    preferredWordIds,
    supabase,
    startedWordIds,
    deps
  )
}

async function getWordById(supabase: SupabaseClient, wordId: string) {
  const { data, error } = await supabase.from('words').select('*').eq('id', wordId).maybeSingle()
  if (error) {
    throw error
  }
  return data
}

export async function loadNewStudyItems({
  supabase,
  userId,
  tag,
  skippedWordIds,
  preferredWordIds,
  batchSize,
  libraryWordIds = [],
  deps,
}: {
  supabase: SupabaseClient
  userId: string
  tag: string
  skippedWordIds: string[]
  preferredWordIds: string[]
  batchSize: number
  libraryWordIds?: string[]
  deps: StudyNewWordServiceDeps
}) {
  const startedAt = Date.now()
  const items: StudyBatchItem[] = []
  const excludedWordIds = new Set(skippedWordIds)
  let libraryUnseenWordIds = libraryWordIds

  if (libraryWordIds.length > 0) {
    const startedWordIds = await deps.getStartedWordIds(supabase, userId, libraryWordIds)
    libraryUnseenWordIds = libraryWordIds.filter((wordId) => !startedWordIds.has(wordId))
  }

  while (items.length < batchSize) {
    let candidate: unknown | null
    if (libraryWordIds.length > 0) {
      const availableWordIds = libraryUnseenWordIds.filter((wordId) => !excludedWordIds.has(wordId))

      if (availableWordIds.length === 0) {
        break
      }

      const randomIndex = Math.floor(Math.random() * availableWordIds.length)
      candidate = await getWordById(supabase, availableWordIds[randomIndex]!)
    } else {
      candidate = await pickUnseenWord(
        tag,
        Array.from(excludedWordIds),
        preferredWordIds,
        supabase,
        userId,
        deps
      )
    }

    if (!isWordCandidate(candidate)) {
      break
    }

    excludedWordIds.add(candidate.id)
    const item = deps.normalizeNewStudyBatchItem(candidate, {
      isNew: true,
      priorityReason: 'new',
    })

    if (item) {
      items.push(item)
    }
  }

  deps.logStudyPerformance('getNewStudyItems', startedAt, {
    tag,
    batchSize,
    resultCount: items.length,
    libraryScoped: libraryWordIds.length > 0,
    preferred: preferredWordIds.length,
    skipped: skippedWordIds.length,
  })

  return items
}
