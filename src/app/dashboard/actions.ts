'use server'

import { requireActionSession } from '@/lib/supabase/user'

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
  attempt_status?: string | null
  usage_quality?: string | null
  uses_word_in_context?: boolean | null
  is_meta_sentence?: boolean | null
}

interface SentenceDateRow {
  created_at: string
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

export async function getDashboardStats(): Promise<DashboardStats> {
  const { supabase, user } = await requireActionSession()
  const userId = user.id
  const today = new Date().toISOString().split('T')[0]

  // Total studied words
  const { count: totalStudied } = await supabase
    .from('user_words')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)

  // Due today
  const { count: dueToday } = await supabase
    .from('user_words')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .lte('next_review_date', today)

  // Average score from sentences
  const { data: scoreData } = await supabase
    .from('sentences')
    .select('ai_score, attempt_status, usage_quality, uses_word_in_context, is_meta_sentence')
    .eq('user_id', userId)

  let averageScore = 0
  const totalSentences = scoreData?.length || 0
  let contextualUsageCount = 0
  let weakUsageCount = 0
  let metaSentenceCount = 0
  let needsHelpCount = 0
  if (scoreData && scoreData.length > 0) {
    const rows = scoreData as SentenceScoreRow[]
    const sum = rows.reduce((acc, row) => acc + (row.ai_score ?? 0), 0)
    averageScore = Math.round(sum / scoreData.length)
    contextualUsageCount = rows.filter((row) => row.uses_word_in_context === true).length
    weakUsageCount = rows.filter((row) => row.usage_quality === 'weak').length
    metaSentenceCount = rows.filter((row) => row.is_meta_sentence === true).length
    needsHelpCount = rows.filter((row) => row.attempt_status === 'needs_help').length
  }

  // Streak: count consecutive days with at least one sentence, going backwards from today
  const { data: sentenceDates } = await supabase
    .from('sentences')
    .select('created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(365)

  let streakDays = 0
  if (sentenceDates && sentenceDates.length > 0) {
    const rows = sentenceDates as SentenceDateRow[]
    const uniqueDays = new Set(
      rows.map((row) => new Date(row.created_at).toISOString().split('T')[0])
    )
    const checkDate = new Date()
    // If no sentence today, check if yesterday had one (allow checking from yesterday)
    const todayStr = checkDate.toISOString().split('T')[0]
    if (!uniqueDays.has(todayStr)) {
      checkDate.setDate(checkDate.getDate() - 1)
    }
    
    for (let i = 0; i < 365; i++) {
      const dateStr = checkDate.toISOString().split('T')[0]
      if (uniqueDays.has(dateStr)) {
        streakDays++
        checkDate.setDate(checkDate.getDate() - 1)
      } else {
        break
      }
    }
  }

  return {
    totalStudied: totalStudied || 0,
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

  if (error || !data) return []

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
