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

export interface HistoryResult {
  sentences: SentenceRecord[]
  total: number
  page: number
  pageSize: number
}

export type HistorySortBy = "newest" | "oldest" | "highest" | "lowest"

type JoinedWord = { word: string } | Array<{ word: string }> | null

interface HistoryRow {
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

function readJoinedWord(words: JoinedWord): string {
  if (Array.isArray(words)) {
    return words[0]?.word ?? 'Unknown'
  }

  return words?.word ?? 'Unknown'
}

export async function getSentenceHistory({
  page = 1,
  pageSize = 15,
  search = "",
  sortBy = "newest",
}: {
  page?: number
  pageSize?: number
  search?: string
  sortBy?: HistorySortBy
} = {}): Promise<HistoryResult> {
  const { supabase, user } = await requireActionSession()
  const userId = user.id
  const offset = (page - 1) * pageSize

  // Build query
  let query = supabase
    .from('sentences')
    .select(
      'id, original_text, ai_score, ai_feedback, created_at, attempt_status, usage_quality, uses_word_in_context, is_meta_sentence, words!inner(word)',
      { count: 'exact' }
    )
    .eq('user_id', userId)

  // Search filter
  if (search.trim()) {
    query = query.or(`original_text.ilike.%${search.trim()}%,words.word.ilike.%${search.trim()}%`)
  }

  // Sort
  switch (sortBy) {
    case "oldest":
      query = query.order('created_at', { ascending: true })
      break
    case "highest":
      query = query.order('ai_score', { ascending: false })
      break
    case "lowest":
      query = query.order('ai_score', { ascending: true })
      break
    default:
      query = query.order('created_at', { ascending: false })
  }

  // Pagination
  query = query.range(offset, offset + pageSize - 1)

  const { data, count, error } = await query

  if (error || !data) {
    console.error('History query error:', error)
    return { sentences: [], total: 0, page, pageSize }
  }

  const sentences: SentenceRecord[] = (data as HistoryRow[]).map((row) => ({
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
