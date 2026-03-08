'use server'

import type { SupabaseClient } from '@supabase/supabase-js'
import { requireActionSession } from '@/lib/supabase/user'
import { formatDateInAppTimeZone, getTodayDateString, shiftDateString } from '@/lib/app-date'

const DASHBOARD_PAGE_SIZE = 1000

export interface DashboardStats {
  totalStudied: number
  dueToday: number
  averageScore: number
  totalSentences: number
  streakDays: number
  contextualUsageCount: number
  weakUsageCount: number
  metaSentenceCount: number
  needsHelpCount: number
}

export interface RecentActivity {
  id: string
  word: string
  sentence: string
  score: number
  created_at: string
  attemptStatus: string
  usageQuality: string
}

interface SentenceScoreRow {
  ai_score: number | null
  created_at: string
  attempt_status?: string | null
  usage_quality?: string | null
  uses_word_in_context?: boolean | null
  is_meta_sentence?: boolean | null
}

interface WordIdRow {
  word_id?: string | null
}

type JoinedWord = { word: string } | Array<{ word: string }> | null

interface RecentActivityRow {
  id: string
  original_text: string
  ai_score: number | null
  created_at: string
  attempt_status?: string | null
  usage_quality?: string | null
  words: JoinedWord
}

function readJoinedWord(words: JoinedWord): string {
  if (Array.isArray(words)) {
    return words[0]?.word ?? 'Unknown'
  }

  return words?.word ?? 'Unknown'
}

async function getAllWordIdsByTable(
  supabase: SupabaseClient,
  table: 'user_words' | 'sentences',
  userId: string,
  options?: {
    reviewedOnly?: boolean
  }
) {
  const wordIds: string[] = []
  let from = 0

  while (true) {
    const to = from + DASHBOARD_PAGE_SIZE - 1
    let query = supabase
      .from(table)
      .select('word_id')
      .eq('user_id', userId)

    if (options?.reviewedOnly && table === 'user_words') {
      query = query.not('last_reviewed_at', 'is', null)
    }

    const { data, error } = await query.range(from, to)

    if (error) {
      console.error('Failed to load word ids for dashboard stats:', error)
      return wordIds
    }

    const rows = (data ?? []) as WordIdRow[]
    wordIds.push(
      ...rows
        .map((row) => row.word_id)
        .filter((wordId): wordId is string => typeof wordId === 'string')
    )

    if (rows.length < DASHBOARD_PAGE_SIZE) {
      break
    }

    from += DASHBOARD_PAGE_SIZE
  }

  return wordIds
}

async function getStartedWordCount(supabase: SupabaseClient, userId: string) {
  const [reviewedWordIds, sentenceWordIds] = await Promise.all([
    getAllWordIdsByTable(supabase, 'user_words', userId, { reviewedOnly: true }),
    getAllWordIdsByTable(supabase, 'sentences', userId),
  ])

  return new Set([...reviewedWordIds, ...sentenceWordIds]).size
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const { supabase, user } = await requireActionSession()
  const userId = user.id
  const today = getTodayDateString()

  const [{ count: dueToday }, scoreResult, totalStudied] = await Promise.all([
    supabase
      .from('user_words')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .not('last_reviewed_at', 'is', null)
      .lte('next_review_date', today),
    supabase
      .from('sentences')
      .select('ai_score, created_at, attempt_status, usage_quality, uses_word_in_context, is_meta_sentence')
      .eq('user_id', userId),
    getStartedWordCount(supabase, userId),
  ])

  const scoreData = scoreResult.data as SentenceScoreRow[] | null

  let averageScore = 0
  const totalSentences = scoreData?.length || 0
  let contextualUsageCount = 0
  let weakUsageCount = 0
  let metaSentenceCount = 0
  let needsHelpCount = 0

  if (scoreData && scoreData.length > 0) {
    const scoredRows = scoreData.filter((row) => typeof row.ai_score === 'number')
    const sum = scoredRows.reduce((acc, row) => acc + (row.ai_score ?? 0), 0)
    averageScore = scoredRows.length > 0 ? Math.round(sum / scoredRows.length) : 0
    contextualUsageCount = scoreData.filter((row) => row.uses_word_in_context === true).length
    weakUsageCount = scoreData.filter((row) => row.usage_quality === 'weak').length
    metaSentenceCount = scoreData.filter((row) => row.is_meta_sentence === true).length
    needsHelpCount = scoreData.filter((row) => row.attempt_status === 'needs_help').length
  }

  let streakDays = 0
  if (scoreData && scoreData.length > 0) {
    const uniqueDays = new Set(
      scoreData.map((row) => formatDateInAppTimeZone(row.created_at))
    )
    let checkDate = uniqueDays.has(today) ? today : shiftDateString(today, -1)

    for (let i = 0; i < 365; i += 1) {
      if (!uniqueDays.has(checkDate)) {
        break
      }

      streakDays += 1
      checkDate = shiftDateString(checkDate, -1)
    }
  }

  return {
    totalStudied,
    dueToday: dueToday || 0,
    averageScore,
    totalSentences,
    streakDays,
    contextualUsageCount,
    weakUsageCount,
    metaSentenceCount,
    needsHelpCount,
  }
}

export async function getRecentActivity(limit: number = 10): Promise<RecentActivity[]> {
  const { supabase, user } = await requireActionSession()
  const userId = user.id

  const { data, error } = await supabase
    .from('sentences')
    .select('id, original_text, ai_score, created_at, attempt_status, usage_quality, words!inner(word)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error || !data) {
    return []
  }

  return (data as RecentActivityRow[]).map((row) => ({
    id: row.id,
    word: readJoinedWord(row.words),
    sentence: row.original_text,
    score: row.ai_score ?? 0,
    created_at: row.created_at,
    attemptStatus: row.attempt_status ?? 'valid',
    usageQuality: row.usage_quality ?? 'weak',
  }))
}
