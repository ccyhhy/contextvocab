'use server'

import { getAdminClient, GUEST_ID } from '@/lib/supabase'

export interface DashboardStats {
  totalStudied: number
  dueToday: number
  averageScore: number
  totalSentences: number
  streakDays: number
}

export interface RecentActivity {
  id: string
  word: string
  sentence: string
  score: number
  created_at: string
}

interface SentenceScoreRow {
  ai_score: number | null
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
  words: JoinedWord
}

function readJoinedWord(words: JoinedWord): string {
  if (Array.isArray(words)) {
    return words[0]?.word ?? 'Unknown'
  }

  return words?.word ?? 'Unknown'
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const supabase = getAdminClient()
  const userId = GUEST_ID
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
    .select('ai_score')
    .eq('user_id', userId)

  let averageScore = 0
  const totalSentences = scoreData?.length || 0
  if (scoreData && scoreData.length > 0) {
    const rows = scoreData as SentenceScoreRow[]
    const sum = rows.reduce((acc, row) => acc + (row.ai_score ?? 0), 0)
    averageScore = Math.round(sum / scoreData.length)
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
  }
}

export async function getRecentActivity(limit: number = 10): Promise<RecentActivity[]> {
  const supabase = getAdminClient()
  const userId = GUEST_ID

  const { data, error } = await supabase
    .from('sentences')
    .select('id, original_text, ai_score, created_at, words!inner(word)')
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
  }))
}
