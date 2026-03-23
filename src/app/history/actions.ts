'use server'

import { requireActionSession } from '@/lib/supabase/user'

export interface SentenceRecord {
  id: string
  word: string
  sentence: string
  score: number
  feedback: string
  created_at: string
  attemptStatus: string
  usageQuality: string
  usesWordInContext: boolean
  isMetaSentence: boolean
}

export interface GrammarAttemptRecord {
  id: string
  title: string
  pattern: string
  sentence: string
  score: number
  feedback: string
  created_at: string
  attemptStatus: string
  patternMatched: boolean
  structureAccuracy: number | null
  sceneFit: number | null
  naturalness: number | null
}

export interface HistoryResult {
  sentences: SentenceRecord[]
  total: number
  page: number
  pageSize: number
}

export interface GrammarHistoryResult {
  attempts: GrammarAttemptRecord[]
  total: number
  page: number
  pageSize: number
}

export type HistorySortBy = 'newest' | 'oldest' | 'highest' | 'lowest'

type JoinedWord = { word: string } | Array<{ word: string }> | null
type JoinedGrammarItem =
  | { title: string; pattern: string }
  | Array<{ title: string; pattern: string }>
  | null

interface SentenceHistoryRow {
  id: string
  original_text: string
  ai_score: number | null
  ai_feedback: string | null
  created_at: string
  attempt_status?: string | null
  usage_quality?: string | null
  uses_word_in_context?: boolean | null
  is_meta_sentence?: boolean | null
  words: JoinedWord
}

interface GrammarAttemptHistoryRow {
  id: string
  original_text: string
  ai_score: number | null
  ai_feedback: string | null
  created_at: string
  attempt_status?: string | null
  pattern_matched?: boolean | null
  structure_accuracy?: number | null
  scene_fit?: number | null
  naturalness?: number | null
  grammar_items: JoinedGrammarItem
}

function readJoinedWord(words: JoinedWord): string {
  if (Array.isArray(words)) {
    return words[0]?.word ?? 'Unknown'
  }

  return words?.word ?? 'Unknown'
}

function readJoinedGrammarItem(grammarItems: JoinedGrammarItem) {
  if (Array.isArray(grammarItems)) {
    return grammarItems[0] ?? null
  }

  return grammarItems ?? null
}

export async function getSentenceHistory({
  page = 1,
  pageSize = 15,
  search = '',
  sortBy = 'newest',
}: {
  page?: number
  pageSize?: number
  search?: string
  sortBy?: HistorySortBy
} = {}): Promise<HistoryResult> {
  const { supabase, user } = await requireActionSession()
  const userId = user.id
  const offset = (page - 1) * pageSize

  let query = supabase
    .from('sentences')
    .select(
      'id, original_text, ai_score, ai_feedback, created_at, attempt_status, usage_quality, uses_word_in_context, is_meta_sentence, words!inner(word)',
      { count: 'exact' }
    )
    .eq('user_id', userId)

  if (search.trim()) {
    query = query.or(
      `original_text.ilike.%${search.trim()}%,words.word.ilike.%${search.trim()}%`
    )
  }

  switch (sortBy) {
    case 'oldest':
      query = query.order('created_at', { ascending: true })
      break
    case 'highest':
      query = query.order('ai_score', { ascending: false })
      break
    case 'lowest':
      query = query.order('ai_score', { ascending: true })
      break
    case 'newest':
    default:
      query = query.order('created_at', { ascending: false })
      break
  }

  query = query.range(offset, offset + pageSize - 1)

  const { data, count, error } = await query

  if (error || !data) {
    console.error('Sentence history query error:', error)
    return { sentences: [], total: 0, page, pageSize }
  }

  const sentences: SentenceRecord[] = (data as SentenceHistoryRow[]).map((row) => ({
    id: row.id,
    word: readJoinedWord(row.words),
    sentence: row.original_text,
    score: row.ai_score ?? 0,
    feedback: row.ai_feedback || '',
    created_at: row.created_at,
    attemptStatus: row.attempt_status ?? 'valid',
    usageQuality: row.usage_quality ?? 'weak',
    usesWordInContext: row.uses_word_in_context === true,
    isMetaSentence: row.is_meta_sentence === true,
  }))

  return {
    sentences,
    total: count || 0,
    page,
    pageSize,
  }
}

export async function getGrammarAttemptHistory({
  page = 1,
  pageSize = 15,
  search = '',
  sortBy = 'newest',
}: {
  page?: number
  pageSize?: number
  search?: string
  sortBy?: HistorySortBy
} = {}): Promise<GrammarHistoryResult> {
  const { supabase, user } = await requireActionSession()
  const userId = user.id
  const offset = (page - 1) * pageSize

  let query = supabase
    .from('grammar_attempts')
    .select(
      'id, original_text, ai_score, ai_feedback, created_at, attempt_status, pattern_matched, structure_accuracy, scene_fit, naturalness, grammar_items!inner(title, pattern)',
      { count: 'exact' }
    )
    .eq('user_id', userId)

  if (search.trim()) {
    query = query.or(
      `original_text.ilike.%${search.trim()}%,grammar_items.title.ilike.%${search.trim()}%,grammar_items.pattern.ilike.%${search.trim()}%`
    )
  }

  switch (sortBy) {
    case 'oldest':
      query = query.order('created_at', { ascending: true })
      break
    case 'highest':
      query = query.order('ai_score', { ascending: false })
      break
    case 'lowest':
      query = query.order('ai_score', { ascending: true })
      break
    case 'newest':
    default:
      query = query.order('created_at', { ascending: false })
      break
  }

  query = query.range(offset, offset + pageSize - 1)

  const { data, count, error } = await query

  if (error || !data) {
    console.error('Grammar history query error:', error)
    return { attempts: [], total: 0, page, pageSize }
  }

  const attempts: GrammarAttemptRecord[] = (data as GrammarAttemptHistoryRow[]).map((row) => {
    const grammarItem = readJoinedGrammarItem(row.grammar_items)

    return {
      id: row.id,
      title: grammarItem?.title ?? 'Unknown pattern',
      pattern: grammarItem?.pattern ?? '',
      sentence: row.original_text,
      score: row.ai_score ?? 0,
      feedback: row.ai_feedback || '',
      created_at: row.created_at,
      attemptStatus: row.attempt_status ?? 'valid',
      patternMatched: row.pattern_matched === true,
      structureAccuracy:
        typeof row.structure_accuracy === 'number' ? row.structure_accuracy : null,
      sceneFit: typeof row.scene_fit === 'number' ? row.scene_fit : null,
      naturalness: typeof row.naturalness === 'number' ? row.naturalness : null,
    }
  })

  return {
    attempts,
    total: count || 0,
    page,
    pageSize,
  }
}
