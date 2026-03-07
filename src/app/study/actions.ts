'use server'

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  buildEvaluationSystemPrompt,
  buildEvaluationUserPrompt,
  extractEvaluationJson,
} from '@/lib/evaluation-format'
import { calculateNextReview, type ReviewBucket } from '@/lib/srs'
import {
  buildStudyMixPlan,
  getStudyPriorityReason,
  sortDueCandidates,
  type StudyPriorityReason,
} from '@/lib/study-scheduler'
import { requireActionSession } from '@/lib/supabase/user'

export type AttemptStatus = 'valid' | 'needs_help'
export type UsageQuality = 'strong' | 'weak' | 'meta' | 'invalid'

export interface AdvancedExpression {
  original: string
  advanced: string
  explanation: string
  example: string
}

export interface ErrorItem {
  type: string
  original: string
  correction: string
  explanation: string
}

export interface EvaluationResult {
  score: number
  correctedSentence: string
  errors: ErrorItem[]
  praise: string
  suggestion: string
  naturalness: number
  grammarScore: number
  wordUsageScore: number
  advancedExpressions: AdvancedExpression[]
  polishedSentence: string
  attemptStatus: AttemptStatus
  usageQuality: UsageQuality
  usesWordInContext: boolean
  isMetaSentence: boolean
}

export interface StudyWordInfo {
  word: string
  definition?: string | null
  tags?: string | null
  phonetic?: string | null
  example?: string | null
}

export interface StudyBatchItem {
  id: string
  word_id: string
  words: StudyWordInfo
  isNew: boolean
  priorityReason: StudyPriorityReason
}

export interface GetStudyBatchParams {
  tag?: string
  skippedWordIds?: string[]
  favoritesOnly?: boolean
  batchSize?: number
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
  attemptStatus?: unknown
  usageQuality?: unknown
  usesWordInContext?: unknown
  isMetaSentence?: unknown
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

interface WordRow extends WordRecord {
  word: string
  definition?: string | null
  tags?: string | null
  phonetic?: string | null
  example?: string | null
}

interface UserWordRecord {
  id: string
  word_id: string
  repetitions: number
  interval: number
  ease_factor: number
  next_review_date?: string | null
  last_score?: number | null
  last_reviewed_at?: string | null
  consecutive_failures?: number | null
  lapse_count?: number | null
  words?: WordRow | WordRow[] | null
}

interface PastSentenceRow {
  original_text: string | null
}

interface FavoriteRow {
  word_id: string | null
}

let favoriteColumnSupported: boolean | null = null
let pickUnstudiedWordRpcSupported: boolean | null = null

const DEFAULT_STUDY_BATCH_SIZE = 5

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function sanitizeText(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function sanitizeAttemptStatus(value: unknown): AttemptStatus {
  return value === 'needs_help' ? 'needs_help' : 'valid'
}

function sanitizeUsageQuality(value: unknown): UsageQuality {
  if (value === 'strong' || value === 'weak' || value === 'meta' || value === 'invalid') {
    return value
  }
  return 'weak'
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }
  return 'Unknown error'
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
    attemptStatus: 'needs_help',
    usageQuality: 'invalid',
    usesWordInContext: false,
    isMetaSentence: false,
  }
}

function normalizeEvaluation(payload: EvaluationPayload, fallbackSentence: string): EvaluationResult {
  const errorItems = Array.isArray(payload.errors) ? (payload.errors as ErrorPayload[]) : []
  const advancedItems = Array.isArray(payload.advancedExpressions)
    ? (payload.advancedExpressions as AdvancedExpressionPayload[])
    : []

  const attemptStatus = sanitizeAttemptStatus(payload.attemptStatus)
  const usageQuality = sanitizeUsageQuality(payload.usageQuality)
  const allowRewrite = attemptStatus === 'valid'

  return {
    score: clamp(Number(payload.score) || 0, 0, 100),
    correctedSentence: allowRewrite ? sanitizeText(payload.correctedSentence) || fallbackSentence : '',
    errors: errorItems.map((item) => ({
      type: sanitizeText(item.type) || 'grammar',
      original: sanitizeText(item.original),
      correction: sanitizeText(item.correction),
      explanation: sanitizeText(item.explanation),
    })),
    praise: sanitizeText(payload.praise) || '继续保持。',
    suggestion:
      sanitizeText(payload.suggestion) ||
      '先用造句辅助搭一个简单句，再逐步补充细节。',
    naturalness: clamp(Number(payload.naturalness) || 3, 1, 5),
    grammarScore: clamp(Number(payload.grammarScore) || 3, 1, 5),
    wordUsageScore: clamp(Number(payload.wordUsageScore) || 3, 1, 5),
    advancedExpressions: allowRewrite
      ? advancedItems.map((item) => ({
          original: sanitizeText(item.original),
          advanced: sanitizeText(item.advanced),
          explanation: sanitizeText(item.explanation),
          example: sanitizeText(item.example),
        }))
      : [],
    polishedSentence: allowRewrite ? sanitizeText(payload.polishedSentence) : '',
    attemptStatus,
    usageQuality,
    usesWordInContext: payload.usesWordInContext === true,
    isMetaSentence: payload.isMetaSentence === true,
  }
}

function parseEvaluationJson(content: string, fallbackSentence: string): EvaluationResult {
  const jsonStr = extractEvaluationJson(content)
  const parsed = JSON.parse(jsonStr) as EvaluationPayload
  return normalizeEvaluation(parsed, fallbackSentence)
}

function buildSystemPrompt(word: string, definition: string, tags?: string, learningHistory?: string[]) {
  return buildEvaluationSystemPrompt({
    word,
    definition,
    tags,
    learningHistory,
  })
}

function isMissingFavoriteColumnError(error: { message?: string; details?: string } | null) {
  const message = `${error?.message ?? ''} ${error?.details ?? ''}`.toLowerCase()
  return message.includes('is_favorite')
}

function isWordRecord(value: unknown): value is WordRecord {
  return typeof value === 'object' && value !== null && typeof (value as WordRecord).id === 'string'
}

function isUserWordRecord(value: unknown): value is UserWordRecord {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const record = value as UserWordRecord
  return (
    typeof record.id === 'string' &&
    typeof record.word_id === 'string' &&
    typeof record.repetitions === 'number' &&
    typeof record.interval === 'number' &&
    typeof record.ease_factor === 'number'
  )
}

function normalizeWordInfo(value: unknown): StudyWordInfo | null {
  if (Array.isArray(value)) {
    return normalizeWordInfo(value[0])
  }

  if (typeof value !== 'object' || value === null) {
    return null
  }

  const row = value as WordRow
  if (typeof row.word !== 'string') {
    return null
  }

  return {
    word: row.word,
    definition: row.definition ?? null,
    tags: row.tags ?? null,
    phonetic: row.phonetic ?? null,
    example: row.example ?? null,
  }
}

function normalizeStudyBatchItem(
  value: unknown,
  overrides: Pick<StudyBatchItem, 'isNew' | 'priorityReason'>
): StudyBatchItem | null {
  if (!isUserWordRecord(value)) {
    return null
  }

  const words = normalizeWordInfo(value.words)
  if (!words) {
    return null
  }

  return {
    id: value.id,
    word_id: value.word_id,
    words,
    isNew: overrides.isNew,
    priorityReason: overrides.priorityReason,
  }
}

function toPostgrestInList(ids: string[]) {
  const safeIds = ids.map((id) => id.replace(/"/g, '')).filter(Boolean)
  return `(${safeIds.map((id) => `"${id}"`).join(',')})`
}

function getTodayDateString() {
  return new Date().toISOString().split('T')[0]
}

function buildWordFeedbackForStorage(
  evaluation: EvaluationResult,
  originalSentence: string
) {
  const sections = [
    evaluation.attemptStatus === 'needs_help'
      ? '【状态】本次输入更像占位或无效尝试，建议先使用造句辅助。'
      : '',
    evaluation.errors.length > 0
      ? `【错误】\n${evaluation.errors
          .map(
            (error) =>
              `- ${error.original} -> ${error.correction} (${error.explanation})`
          )
          .join('\n')}`
      : '',
    evaluation.correctedSentence && evaluation.correctedSentence !== originalSentence
      ? `【修正后句子】${evaluation.correctedSentence}`
      : '',
    `【点评】${evaluation.praise}`,
    `【建议】${evaluation.suggestion}`,
  ]

  return sections.filter(Boolean).join('\n\n')
}

function getNextFailureCounters(
  current: UserWordRecord,
  reviewBucket: ReviewBucket
) {
  const currentFailures = current.consecutive_failures ?? 0
  const currentLapses = current.lapse_count ?? 0

  if (reviewBucket === 'again') {
    return {
      consecutiveFailures: currentFailures + 1,
      lapseCount: currentLapses + 1,
    }
  }

  if (reviewBucket === 'hard') {
    return {
      consecutiveFailures: currentFailures,
      lapseCount: currentLapses,
    }
  }

  return {
    consecutiveFailures: 0,
    lapseCount: currentLapses,
  }
}

async function getUserFavoriteWordIds(
  supabase: SupabaseClient,
  userId: string
): Promise<string[]> {
  if (favoriteColumnSupported === false) {
    return []
  }

  const { data, error } = await supabase
    .from('user_words')
    .select('word_id')
    .eq('user_id', userId)
    .eq('is_favorite', true)

  if (error || !data) {
    if (error) {
      if (isMissingFavoriteColumnError(error)) {
        favoriteColumnSupported = false
      } else {
        console.error('Failed to load favorite words:', error)
      }
    }
    return []
  }

  favoriteColumnSupported = true

  return (data as FavoriteRow[])
    .map((row) => row.word_id)
    .filter((wordId): wordId is string => typeof wordId === 'string')
}

async function pickRandomUnseenWord(
  tag: string,
  skippedWordIds: string[],
  preferredWordIds: string[],
  supabase: SupabaseClient,
  userId: string,
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

async function findFallbackUnseenWord(
  tag: string,
  skippedWordIds: string[],
  preferredWordIds: string[],
  supabase: SupabaseClient,
  userId: string
): Promise<WordRecord | null> {
  const { data: studiedRows } = await supabase
    .from('user_words')
    .select('word_id')
    .eq('user_id', userId)

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
  return isWordRecord(fallback) ? fallback : null
}

async function pickUnseenWord(
  tag: string,
  skippedWordIds: string[],
  preferredWordIds: string[],
  supabase: SupabaseClient,
  userId: string
): Promise<WordRecord | null> {
  if (pickUnstudiedWordRpcSupported !== false && preferredWordIds.length === 0) {
    const { data: rpcCandidates, error: rpcError } = await supabase.rpc('pick_unstudied_word', {
      p_user_id: userId,
      p_tag: tag,
      p_skipped_ids: skippedWordIds,
    })

    if (rpcError) {
      pickUnstudiedWordRpcSupported = false
    } else {
      pickUnstudiedWordRpcSupported = true
      if (Array.isArray(rpcCandidates) && isWordRecord(rpcCandidates[0])) {
        return rpcCandidates[0]
      }
    }
  }

  const randomCandidate = await pickRandomUnseenWord(
    tag,
    skippedWordIds,
    preferredWordIds,
    supabase,
    userId
  )

  if (randomCandidate) {
    return randomCandidate
  }

  return findFallbackUnseenWord(tag, skippedWordIds, preferredWordIds, supabase, userId)
}

async function attachWordToUser(
  wordId: string,
  reviewDate: string,
  supabase: SupabaseClient,
  userId: string
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
      is_favorite: false,
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

async function getDueWordCount(
  supabase: SupabaseClient,
  userId: string,
  tag: string,
  today: string,
  skippedWordIds: string[],
  preferredWordIds: string[]
) {
  let query = supabase
    .from('user_words')
    .select('id, words!inner(id)', { count: 'exact', head: true })
    .eq('user_id', userId)
    .lte('next_review_date', today)

  if (tag !== 'All') {
    query = query.eq('words.tags', tag)
  }
  if (preferredWordIds.length > 0) {
    query = query.in('word_id', preferredWordIds)
  }
  if (skippedWordIds.length > 0) {
    query = query.not('word_id', 'in', toPostgrestInList(skippedWordIds))
  }

  const { count } = await query
  return count ?? 0
}

async function getDueStudyItems(
  supabase: SupabaseClient,
  userId: string,
  tag: string,
  today: string,
  skippedWordIds: string[],
  preferredWordIds: string[],
  batchSize: number
) {
  let query = supabase
    .from('user_words')
    .select('*, words!inner(*)')
    .eq('user_id', userId)
    .lte('next_review_date', today)

  if (tag !== 'All') {
    query = query.eq('words.tags', tag)
  }
  if (preferredWordIds.length > 0) {
    query = query.in('word_id', preferredWordIds)
  }
  if (skippedWordIds.length > 0) {
    query = query.not('word_id', 'in', toPostgrestInList(skippedWordIds))
  }

  const { data } = await query.limit(Math.max(batchSize * 6, 24))
  const sorted = sortDueCandidates((data ?? []) as UserWordRecord[], today)

  return sorted
    .map((row) =>
      normalizeStudyBatchItem(row, {
        isNew: false,
        priorityReason: getStudyPriorityReason(row, today),
      })
    )
    .filter((item): item is StudyBatchItem => item !== null)
}

async function getNewStudyItems(
  supabase: SupabaseClient,
  userId: string,
  tag: string,
  skippedWordIds: string[],
  preferredWordIds: string[],
  batchSize: number,
  reviewDate: string
) {
  const items: StudyBatchItem[] = []
  const excludedWordIds = new Set(skippedWordIds)

  while (items.length < batchSize) {
    const candidate = await pickUnseenWord(
      tag,
      Array.from(excludedWordIds),
      preferredWordIds,
      supabase,
      userId
    )

    if (!candidate) {
      break
    }

    excludedWordIds.add(candidate.id)
    const attached = await attachWordToUser(candidate.id, reviewDate, supabase, userId)
    const item = normalizeStudyBatchItem(attached, {
      isNew: true,
      priorityReason: 'new',
    })

    if (item) {
      items.push(item)
    }
  }

  return items
}

function composeStudyBatch(
  dueItems: StudyBatchItem[],
  newItems: StudyBatchItem[],
  dueCount: number,
  favoritesOnly: boolean,
  batchSize: number
) {
  const plan = buildStudyMixPlan(dueCount, batchSize, favoritesOnly)
  const dueQueue = [...dueItems]
  const newQueue = [...newItems]
  const batch: StudyBatchItem[] = []

  for (const slot of plan) {
    if (slot === 'review' && dueQueue.length > 0) {
      batch.push(dueQueue.shift()!)
      continue
    }

    if (slot === 'new' && newQueue.length > 0) {
      batch.push(newQueue.shift()!)
      continue
    }

    if (dueQueue.length > 0) {
      batch.push(dueQueue.shift()!)
      continue
    }

    if (newQueue.length > 0) {
      batch.push(newQueue.shift()!)
    }
  }

  while (batch.length < batchSize) {
    if (dueQueue.length > 0) {
      batch.push(dueQueue.shift()!)
      continue
    }

    if (newQueue.length > 0) {
      batch.push(newQueue.shift()!)
      continue
    }

    break
  }

  return batch
}

async function getWordLearningHistory(
  supabase: SupabaseClient,
  userId: string,
  wordId: string
) {
  const { data: pastRecords } = await supabase
    .from('sentences')
    .select('original_text')
    .eq('user_id', userId)
    .eq('word_id', wordId)
    .order('created_at', { ascending: false })
    .limit(5)

  return (pastRecords ?? [])
    .map((record) => (record as PastSentenceRow).original_text)
    .filter((value): value is string => typeof value === 'string')
    .reverse()
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
    console.warn('OPENAI_API_KEY is missing. Using mock evaluation.')
    return {
      ...makeErrorResult('请先配置服务端 AI 环境变量。'),
      correctedSentence: sentence,
      score: 50,
      attemptStatus: 'needs_help',
      usageQuality: 'invalid',
      usesWordInContext: false,
      isMetaSentence: false,
      praise: `你尝试使用了 "${word}"，但当前环境还没有真实 AI 评估。`,
      suggestion: '请先配置 OPENAI_API_KEY、OPENAI_API_BASE 和 OPENAI_MODEL。',
    }
  }

  const systemPrompt = buildSystemPrompt(word, definition, tags, learningHistory)

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 30000)

      const response = await fetch(`${apiBase}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: buildEvaluationUserPrompt(sentence) },
          ],
          temperature: 0.3,
        }),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorText = await response.text()
        if (response.status === 429 && attempt < 1) {
          await new Promise((resolve) => setTimeout(resolve, 2000))
          continue
        }
        throw new Error(`API error (${response.status}): ${errorText.slice(0, 200)}`)
      }

      const data = await response.json()
      const content = data.choices?.[0]?.message?.content
      if (!content) {
        throw new Error('AI returned empty content')
      }

      return parseEvaluationJson(content, sentence)
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        if (attempt < 1) {
          continue
        }
        return makeErrorResult('评估超时，请稍后重试。')
      }

      if (error instanceof SyntaxError) {
        console.error('AI returned malformed JSON:', error)
        return makeErrorResult('AI 返回格式异常，请重试。')
      }

      if (attempt < 1) {
        continue
      }

      console.error('Failed to evaluate sentence:', error)
      return makeErrorResult(`评估失败：${getErrorMessage(error)}`)
    }
  }

  return makeErrorResult('多次尝试后仍未拿到评估结果。')
}

export async function getStudyBatch(params: GetStudyBatchParams = {}) {
  const {
    tag = 'All',
    skippedWordIds = [],
    favoritesOnly = false,
    batchSize = DEFAULT_STUDY_BATCH_SIZE,
  } = params
  const { supabase, user } = await requireActionSession()
  const today = getTodayDateString()
  const preferredWordIds = favoritesOnly
    ? await getUserFavoriteWordIds(supabase, user.id)
    : []

  if (favoritesOnly && preferredWordIds.length === 0) {
    return [] as StudyBatchItem[]
  }

  const dueCount = await getDueWordCount(
    supabase,
    user.id,
    tag,
    today,
    skippedWordIds,
    preferredWordIds
  )

  const dueItems = await getDueStudyItems(
    supabase,
    user.id,
    tag,
    today,
    skippedWordIds,
    preferredWordIds,
    batchSize
  )

  const newItems = favoritesOnly
    ? []
    : await getNewStudyItems(
        supabase,
        user.id,
        tag,
        [...skippedWordIds, ...dueItems.map((item) => item.word_id)],
        preferredWordIds,
        batchSize,
        today
      )

  return composeStudyBatch(dueItems, newItems, dueCount, favoritesOnly, batchSize)
}

export async function getNextWord(
  tag: string = 'All',
  skippedWordIds: string[] = [],
  favoritesOnly: boolean = false
) {
  const batch = await getStudyBatch({
    tag,
    skippedWordIds,
    favoritesOnly,
    batchSize: 1,
  })

  return batch[0] ?? null
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
  const { supabase, user } = await requireActionSession()
  let evaluation: EvaluationResult | null = null

  if (streamedContent?.trim()) {
    try {
      evaluation = parseEvaluationJson(streamedContent, sentence)
    } catch (error) {
      console.error('Failed to parse streamed evaluation content:', error)
    }
  }

  if (!evaluation) {
    const learningHistory = await getWordLearningHistory(supabase, user.id, wordId)
    evaluation = await evaluateSentence(wordStr, sentence, definition, tags, learningHistory)
  }

  const { data: currentSrs } = await supabase
    .from('user_words')
    .select('*')
    .eq('id', userWordId)
    .single()

  if (!currentSrs || !isUserWordRecord(currentSrs)) {
    throw new Error('User word not found')
  }

  const nextSrs = calculateNextReview(
    {
      repetitions: currentSrs.repetitions,
      interval: currentSrs.interval,
      easeFactor: currentSrs.ease_factor,
    },
    evaluation.score
  )

  const reviewStats = getNextFailureCounters(currentSrs, nextSrs.reviewBucket)
  const reviewedAt = new Date().toISOString()

  const { error: updateError } = await supabase
    .from('user_words')
    .update({
      repetitions: nextSrs.repetitions,
      interval: nextSrs.interval,
      ease_factor: nextSrs.easeFactor,
      next_review_date: nextSrs.nextReviewDate.toISOString().split('T')[0],
      last_score: evaluation.score,
      last_reviewed_at: reviewedAt,
      consecutive_failures: reviewStats.consecutiveFailures,
      lapse_count: reviewStats.lapseCount,
    })
    .eq('id', userWordId)

  if (updateError) {
    throw updateError
  }

  const { data: savedSentence } = await supabase
    .from('sentences')
    .insert({
      user_id: user.id,
      word_id: wordId,
      original_text: sentence,
      ai_score: evaluation.score,
      ai_feedback: buildWordFeedbackForStorage(evaluation, sentence),
      attempt_status: evaluation.attemptStatus,
      usage_quality: evaluation.usageQuality,
      uses_word_in_context: evaluation.usesWordInContext,
      is_meta_sentence: evaluation.isMetaSentence,
    })
    .select()
    .single()

  return { evaluation, nextSrs, savedSentence }
}

export async function getFavoriteWordIds() {
  const { supabase, user } = await requireActionSession()
  return getUserFavoriteWordIds(supabase, user.id)
}

export async function toggleFavoriteWord(wordId: string, nextFavorite: boolean) {
  const { supabase, user } = await requireActionSession()
  const today = getTodayDateString()

  if (favoriteColumnSupported === false) {
    throw new Error('收藏功能需要先执行最新的 Supabase schema。')
  }

  await attachWordToUser(wordId, today, supabase, user.id)

  const { error } = await supabase
    .from('user_words')
    .update({ is_favorite: nextFavorite })
    .eq('user_id', user.id)
    .eq('word_id', wordId)

  if (error) {
    if (isMissingFavoriteColumnError(error)) {
      favoriteColumnSupported = false
      throw new Error('收藏功能需要先执行最新的 Supabase schema。')
    }

    throw error
  }

  favoriteColumnSupported = true

  return getUserFavoriteWordIds(supabase, user.id)
}
