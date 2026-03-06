'use server'

import {
  buildEvaluationSystemPrompt,
  buildEvaluationUserPrompt,
  extractEvaluationJson,
} from '@/lib/evaluation-format'
import { calculateNextReview } from '@/lib/srs'
import { getAdminClient, GUEST_ID } from '@/lib/supabase'

export interface EvaluationResult {
  score: number           // 0-100 overall score
  correctedSentence: string  // AI-corrected version
  errors: ErrorItem[]     // Specific error annotations
  praise: string          // What the student did well
  suggestion: string      // Actionable tip for improvement
  naturalness: number     // 1-5 how natural it sounds
  grammarScore: number    // 1-5 grammar correctness
  wordUsageScore: number  // 1-5 target word usage accuracy
  advancedExpressions: AdvancedExpression[] // Advanced vocabulary upgrades
  polishedSentence: string // Rewritten sentence using advanced expressions
}

export interface AdvancedExpression {
  original: string     // The word/phrase in the student's sentence
  advanced: string     // A more advanced alternative
  explanation: string  // Why this is better (in Chinese)
  example: string      // A short example sentence using the advanced word
}

export interface ErrorItem {
  type: string       // 'grammar' | 'word_usage' | 'naturalness' | 'spelling'
  original: string   // The problematic fragment
  correction: string // The corrected fragment
  explanation: string // Why it's wrong (in Chinese)
}

interface EvaluationPayload {
  score?: unknown
  correctedSentence?: unknown
  errors?: unknown
  praise?: unknown
  suggestion?: unknown
  naturalness?: unknown
  grammarScore?: unknown
  wordUsageScore?: unknown
  advancedExpressions?: unknown
  polishedSentence?: unknown
}

interface ErrorPayload {
  type?: unknown
  original?: unknown
  correction?: unknown
  explanation?: unknown
}

interface AdvancedExpressionPayload {
  original?: unknown
  advanced?: unknown
  explanation?: unknown
  example?: unknown
}

interface WordRecord {
  id: string
}

interface UserWordRecord {
  id: string
  repetitions: number
  interval: number
  ease_factor: number
}

let pickUnstudiedWordRpcSupported: boolean | null = null

function sanitizeText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function normalizeEvaluation(payload: EvaluationPayload, fallbackSentence: string): EvaluationResult {
  const errorItems = Array.isArray(payload.errors) ? payload.errors as ErrorPayload[] : []
  const advancedItems = Array.isArray(payload.advancedExpressions)
    ? payload.advancedExpressions as AdvancedExpressionPayload[]
    : []

  return {
    score: clamp(Number(payload.score) || 0, 0, 100),
    correctedSentence: sanitizeText(payload.correctedSentence) || fallbackSentence,
    errors: errorItems.map((item) => ({
      type: sanitizeText(item.type) || 'grammar',
      original: sanitizeText(item.original),
      correction: sanitizeText(item.correction),
      explanation: sanitizeText(item.explanation),
    })),
    praise: sanitizeText(payload.praise) || '继续加油！',
    suggestion: sanitizeText(payload.suggestion) || '尝试使用更复杂的句式。',
    naturalness: clamp(Number(payload.naturalness) || 3, 1, 5),
    grammarScore: clamp(Number(payload.grammarScore) || 3, 1, 5),
    wordUsageScore: clamp(Number(payload.wordUsageScore) || 3, 1, 5),
    advancedExpressions: advancedItems.map((item) => ({
      original: sanitizeText(item.original),
      advanced: sanitizeText(item.advanced),
      explanation: sanitizeText(item.explanation),
      example: sanitizeText(item.example),
    })),
    polishedSentence: sanitizeText(payload.polishedSentence),
  }
}

function parseEvaluationJson(content: string, fallbackSentence: string): EvaluationResult {
  const jsonStr = extractEvaluationJson(content)
  const parsed = JSON.parse(jsonStr) as EvaluationPayload
  return normalizeEvaluation(parsed, fallbackSentence)
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return '未知错误'
}

function buildSystemPrompt(word: string, definition: string, tags?: string, learningHistory?: string[]): string {
  return buildEvaluationSystemPrompt({
    word,
    definition,
    tags,
    learningHistory,
  })
}

const MOCK_RESULT: EvaluationResult = {
  score: 0,
  correctedSentence: '',
  errors: [],
  praise: '请先配置服务端 AI 环境变量以获取真实评估。',
  suggestion: '请在 .env.local 或 Vercel 环境变量中设置 AI 提供方配置。',
  naturalness: 0,
  grammarScore: 0,
  wordUsageScore: 0,
  advancedExpressions: [],
  polishedSentence: '',
}

export async function evaluateSentence(
  word: string,
  sentence: string,
  definition: string,
  tags?: string,
  learningHistory?: string[]
): Promise<EvaluationResult> {
  const apiKey = process.env.OPENAI_API_KEY
  const apiBase = process.env.OPENAI_API_BASE || 'https://api.openai.com/v1'
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini'

  if (!apiKey) {
    console.warn('⚠️ OPENAI_API_KEY is missing. Using mock evaluation.')
    return {
      ...MOCK_RESULT,
      correctedSentence: sentence,
      score: 50,
      praise: `（模拟评估）你尝试使用了"${word}"，但需要先配置服务端 AI 环境变量才能获得真实反馈。`,
      suggestion: '请在 .env.local 或 Vercel 环境变量中设置 OPENAI_API_KEY、OPENAI_API_BASE 和 OPENAI_MODEL。',
    }
  }

  const systemPrompt = buildSystemPrompt(word, definition, tags, learningHistory)

  // Retry up to 2 times
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 30000) // 30s timeout

      const response = await fetch(`${apiBase}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: buildEvaluationUserPrompt(sentence) },
          ],
          temperature: 0.3, // Lower temperature for more consistent scoring
        }),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errText = await response.text()
        // If rate limited, wait and retry
        if (response.status === 429 && attempt < 1) {
          await new Promise(r => setTimeout(r, 2000))
          continue
        }
        throw new Error(`API 错误 (${response.status}): ${errText.slice(0, 200)}`)
      }

      const data = await response.json()
      const content = data.choices?.[0]?.message?.content

      if (!content) {
        throw new Error('AI 返回了空内容')
      }

      return parseEvaluationJson(content, sentence)
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        if (attempt < 1) continue
        return makeErrorResult('请求超时，请稍后重试。你可以检查服务端环境变量中的 AI 接口地址是否正确。')
      }
      if (error instanceof SyntaxError) {
        // JSON parse failed — AI returned non-JSON
        console.error('AI returned non-JSON:', error)
        return makeErrorResult('AI 返回的格式异常，请重试。如果持续出现，请尝试更换模型。')
      }
      if (attempt < 1) continue
      console.error('Failed to evaluate sentence:', error)
      return makeErrorResult(
        `评估失败：${getErrorMessage(error)}。请检查服务端 AI 配置。`
      )
    }
  }

  return makeErrorResult('多次尝试均失败，请检查网络和服务端 AI 配置。')
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val))
}

function makeErrorResult(message: string): EvaluationResult {
  return {
    score: 0,
    correctedSentence: '',
    errors: [],
    praise: '',
    suggestion: message,
    naturalness: 0,
    grammarScore: 0,
    wordUsageScore: 0,
    advancedExpressions: [],
    polishedSentence: '',
  }
}

function toPostgrestInList(ids: string[]): string {
  const safeIds = ids.map((id) => id.replace(/"/g, '')).filter(Boolean)
  return `(${safeIds.map((id) => `"${id}"`).join(',')})`
}

function isWordRecord(value: unknown): value is WordRecord {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  return typeof (value as WordRecord).id === 'string'
}

function isUserWordRecord(value: unknown): value is UserWordRecord {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const record = value as UserWordRecord
  return (
    typeof record.id === 'string' &&
    typeof record.repetitions === 'number' &&
    typeof record.interval === 'number' &&
    typeof record.ease_factor === 'number'
  )
}

async function pickRandomUnseenWord(
  tag: string,
  skippedWordIds: string[],
  preferredWordIds: string[] = [],
  supabase = getAdminClient(),
  userId = GUEST_ID,
  attempts = 8
): Promise<WordRecord | null> {
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
  for (let attempt = 0; attempt < attempts; attempt++) {
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
    if (!isWordRecord(candidate) || skippedSet.has(candidate.id)) {
      continue
    }

    const { count: studiedCount } = await supabase
      .from('user_words')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('word_id', candidate.id)

    if (!studiedCount) {
      return candidate
    }
  }

  return null
}

async function attachWordToUser(
  wordId: string,
  reviewDate: string,
  supabase = getAdminClient(),
  userId = GUEST_ID
) {
  const { data: inserted, error: insertError } = await supabase
    .from('user_words')
    .insert({
      user_id: userId,
      word_id: wordId,
      interval: 0,
      ease_factor: 2.5,
      repetitions: 0,
      next_review_date: reviewDate,
    })
    .select('*, words(*)')
    .maybeSingle()

  if (inserted) {
    return inserted
  }

  if (insertError && insertError.code !== '23505') {
    throw insertError
  }

  const { data: existing, error: existingError } = await supabase
    .from('user_words')
    .select('*, words(*)')
    .eq('user_id', userId)
    .eq('word_id', wordId)
    .maybeSingle()

  if (existingError) {
    throw existingError
  }

  return existing
}

export async function getNextWord(
  tag: string = 'All',
  skippedWordIds: string[] = [],
  preferredWordIds: string[] = []
) {
  const supabase = getAdminClient()
  const user = { id: GUEST_ID }
  const today = new Date().toISOString().split('T')[0]

  // 1. Try to get a word that is due for review today
  let dueQuery = supabase
    .from('user_words')
    .select('*, words!inner(*)')
    .eq('user_id', user.id)
    .lte('next_review_date', today)
    .order('next_review_date', { ascending: true })

  if (tag !== 'All') {
    dueQuery = dueQuery.eq('words.tags', tag)
  }
  if (preferredWordIds.length > 0) {
    dueQuery = dueQuery.in('word_id', preferredWordIds)
  }

  if (skippedWordIds.length > 0) {
    dueQuery = dueQuery.not('word_id', 'in', toPostgrestInList(skippedWordIds))
  }

  const { data: dueWords } = await dueQuery.limit(1)

  if (dueWords && dueWords.length > 0) {
    return dueWords[0]
  }

  // 2. Try DB-side random selection first (fast path when RPC exists).
  let candidate: WordRecord | null = null
  if (pickUnstudiedWordRpcSupported !== false) {
    if (preferredWordIds.length === 0) {
      const { data: rpcCandidates, error: rpcError } = await supabase.rpc('pick_unstudied_word', {
        p_user_id: user.id,
        p_tag: tag,
        p_skipped_ids: skippedWordIds,
      })

      if (rpcError) {
        pickUnstudiedWordRpcSupported = false
      } else {
        pickUnstudiedWordRpcSupported = true
        if (Array.isArray(rpcCandidates) && isWordRecord(rpcCandidates[0])) {
          candidate = rpcCandidates[0]
        }
      }
    }
  }

  // 3. If RPC is unavailable, fall back to lightweight random sampling.
  if (!candidate) {
    candidate = await pickRandomUnseenWord(tag, skippedWordIds, preferredWordIds, supabase, user.id)
  }

  // 4. Deterministic fallback when random sampling misses (e.g. high studied ratio).
  if (!candidate) {
    const { data: studiedRows } = await supabase
      .from('user_words')
      .select('word_id')
      .eq('user_id', user.id)

    const studiedWordIds = (studiedRows ?? [])
      .map((row) => row.word_id)
      .filter((id): id is string => typeof id === 'string')
    const excludeIds = [...new Set([...studiedWordIds, ...skippedWordIds])]

    let fallbackQuery = supabase.from('words').select('*')
    if (tag !== 'All') {
      fallbackQuery = fallbackQuery.eq('tags', tag)
    }
    if (preferredWordIds.length > 0) {
      fallbackQuery = fallbackQuery.in('id', preferredWordIds)
    }
    if (excludeIds.length > 0) {
      fallbackQuery = fallbackQuery.not('id', 'in', toPostgrestInList(excludeIds))
    }

    const { data: fallbackCandidates } = await fallbackQuery.limit(1)
    const fallback = fallbackCandidates?.[0]
    if (isWordRecord(fallback)) {
      candidate = fallback
    }
  }

  if (candidate) {
    const userWord = await attachWordToUser(candidate.id, today, supabase, user.id)
    if (userWord) {
      return userWord
    }
  }

  return null
}

export async function submitSentence(
  userWordId: string,
  wordId: string,
  wordStr: string,
  definition: string,
  tags: string,
  sentence: string,
  streamedContent?: string | null
) {
  const supabase = getAdminClient()
  const user = { id: GUEST_ID }
  let evaluation: EvaluationResult | null = null

  if (streamedContent?.trim()) {
    try {
      evaluation = parseEvaluationJson(streamedContent, sentence)
    } catch (error) {
      console.error('Failed to parse streamed evaluation content:', error)
    }
  }

  if (!evaluation) {
    // 0. Fetch user's recent history for this word to provide memory context.
    // Query latest first for better index locality, then reverse to chronological order.
    const { data: pastRecords } = await supabase
      .from('sentences')
      .select('sentence')
      .eq('user_id', user.id)
      .eq('word_id', wordId)
      .order('created_at', { ascending: false })
      .limit(5)

    const learningHistory = (pastRecords ?? [])
      .map((record) => record.sentence)
      .filter((value): value is string => typeof value === 'string')
      .reverse()

    // 1. Evaluate with AI — passing definition, tags, and learning history context.
    evaluation = await evaluateSentence(wordStr, sentence, definition, tags, learningHistory)
  }

  // 2. Fetch current SRS state
  const { data: currentSrs } = await supabase
    .from('user_words')
    .select('*')
    .eq('id', userWordId)
    .single()

  if (!currentSrs || !isUserWordRecord(currentSrs)) throw new Error('User word not found')

  // 3. Calculate next SRS state
  const nextSrs = calculateNextReview({
    repetitions: currentSrs.repetitions,
    interval: currentSrs.interval,
    easeFactor: currentSrs.ease_factor
  }, evaluation.score)

  // 4. Update user_words table
  await supabase
    .from('user_words')
    .update({
      repetitions: nextSrs.repetitions,
      interval: nextSrs.interval,
      ease_factor: nextSrs.easeFactor,
      next_review_date: nextSrs.nextReviewDate.toISOString().split('T')[0]
    })
    .eq('id', userWordId)

  // 5. Build structured feedback string for storage
  const feedbackForDb = [
    evaluation.errors.length > 0
      ? `【错误】\n${evaluation.errors.map(e => `• ${e.original} → ${e.correction}：${e.explanation}`).join('\n')}`
      : '',
    evaluation.correctedSentence !== sentence ? `【修正句】${evaluation.correctedSentence}` : '',
    `【点评】${evaluation.praise}`,
    `【建议】${evaluation.suggestion}`,
  ].filter(Boolean).join('\n\n')

  // 6. Insert into sentences table for history
  const { data: savedSentence } = await supabase
    .from('sentences')
    .insert({
      user_id: user.id,
      word_id: wordId,
      original_text: sentence,
      ai_score: evaluation.score,
      ai_feedback: feedbackForDb
    })
    .select()
    .single()

  return { evaluation, nextSrs, savedSentence }
}
