'use server'

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  buildEvaluationSystemPrompt,
  buildEvaluationUserPrompt,
  extractEvaluationJson,
} from '@/lib/evaluation-format'
import { calculateNextReview, type ReviewBucket, type SRSData } from '@/lib/srs'
import {
  buildStudyMixPlan,
  getStudyPriorityReason,
  sortDueCandidates,
  type StudyPriorityReason,
} from '@/lib/study-scheduler'
import { requireActionSession } from '@/lib/supabase/user'

export type AttemptStatus = 'valid' | 'needs_help'
export type UsageQuality = 'strong' | 'weak' | 'meta' | 'invalid'
export type StudyView = 'all' | 'favorites' | 'weak' | 'recent_failures'

export interface AdvancedExpression {
  original: string
  originalMeaning: string
  advanced: string
  advancedMeaning: string
  explanation: string
  example: string
  exampleMeaning: string
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
  correctedSentenceMeaning: string
  errors: ErrorItem[]
  praise: string
  suggestion: string
  naturalness: number
  grammarScore: number
  wordUsageScore: number
  advancedExpressions: AdvancedExpression[]
  polishedSentence: string
  polishedSentenceMeaning: string
  attemptStatus: AttemptStatus
  usageQuality: UsageQuality
  usesWordInContext: boolean
  isMetaSentence: boolean
}

export interface StudySubmissionResult {
  evaluation: EvaluationResult
  nextSrs: SRSData | null
  savedSentence: unknown | null
  evaluationModelLabel: string
  reviewImpact: 'scheduled' | 'practice_only'
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

export interface StudyLibrary {
  id: string
  slug: string
  name: string
  description: string | null
  sourceType: 'official' | 'custom'
  wordCount: number
  activeCount: number
  dueCount: number
  remainingCount: number
  planStatus: 'active' | 'paused' | 'completed' | 'not_started'
  dailyNewLimit: number | null
}

export interface SentenceHelpItem {
  sentence: string
  cue: string
}

export interface SentenceHelpResult {
  items: SentenceHelpItem[]
  modelLabel: string
}

export interface GetStudyBatchParams {
  librarySlug?: string
  studyView?: StudyView
  tag?: string
  skippedWordIds?: string[]
  favoritesOnly?: boolean
  batchSize?: number
}

interface EvaluationPayload {
  score?: unknown
  correctedSentence?: unknown
  correctedSentenceMeaning?: unknown
  errors?: unknown
  praise?: unknown
  suggestion?: unknown
  naturalness?: unknown
  grammarScore?: unknown
  wordUsageScore?: unknown
  advancedExpressions?: unknown
  polishedSentence?: unknown
  polishedSentenceMeaning?: unknown
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
  originalMeaning?: unknown
  advanced?: unknown
  advancedMeaning?: unknown
  explanation?: unknown
  example?: unknown
  exampleMeaning?: unknown
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

interface LibraryRow {
  id: string
  slug: string
  name: string
  description?: string | null
  source_type?: 'official' | 'custom' | null
}

interface LibraryWordRow {
  word_id: string | null
}

interface UserLibraryPlanRow {
  status?: 'active' | 'paused' | 'completed' | null
  daily_new_limit?: number | null
}

interface SentenceHelpPayload {
  hints?: unknown
}

interface SentenceHelpItemPayload {
  sentence?: unknown
  cue?: unknown
}

let favoriteColumnSupported: boolean | null = null
let pickUnstudiedWordRpcSupported: boolean | null = null

const DEFAULT_STUDY_BATCH_SIZE = 5
const LEGACY_LIBRARY_OPTIONS = [
  { slug: 'all', name: '全部词库', tag: 'All' },
  { slug: 'cet-4', name: 'CET-4', tag: 'CET-4' },
  { slug: 'cet-6', name: 'CET-6', tag: 'CET-6' },
] as const

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

function normalizeLibrarySlug(value?: string | null) {
  const normalized = (value ?? '').trim().toLowerCase()
  if (!normalized || normalized === 'all') {
    return 'all'
  }
  if (normalized === 'cet-4' || normalized === 'cet4') {
    return 'cet-4'
  }
  if (normalized === 'cet-6' || normalized === 'cet6') {
    return 'cet-6'
  }
  return normalized
}

function getLegacyTagForLibrarySlug(librarySlug: string) {
  return LEGACY_LIBRARY_OPTIONS.find((option) => option.slug === normalizeLibrarySlug(librarySlug))?.tag ?? 'All'
}

function getLibrarySlugForLegacyTag(tag?: string | null) {
  const normalized = (tag ?? '').trim().toLowerCase()
  if (!normalized || normalized === 'all') {
    return 'all'
  }

  return LEGACY_LIBRARY_OPTIONS.find((option) => option.tag.toLowerCase() === normalized)?.slug ?? 'all'
}

function resolveStudyView(params: Pick<GetStudyBatchParams, 'studyView' | 'favoritesOnly'>): StudyView {
  if (params.studyView) {
    return params.studyView
  }
  return params.favoritesOnly ? 'favorites' : 'all'
}

function isReviewOnlyView(studyView: StudyView) {
  return studyView !== 'all'
}

function getRecentFailureSince() {
  const date = new Date()
  date.setDate(date.getDate() - 14)
  return date.toISOString()
}

function extractJsonObject(content: string) {
  const trimmed = content.trim()
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return trimmed
  }

  const match = trimmed.match(/\{[\s\S]*\}/)
  return match?.[0] ?? trimmed
}

function formatModelLabel(model: string, apiBase: string) {
  const provider = apiBase.includes('bigmodel.cn')
    ? '智谱'
    : apiBase.includes('openai.com')
      ? 'OpenAI'
      : 'Custom'

  return `${provider} / ${model}`
}

function makeErrorResult(message: string): EvaluationResult {
  return {
    score: 0,
    correctedSentence: '',
    correctedSentenceMeaning: '',
    errors: [],
    praise: '',
    suggestion: message,
    naturalness: 0,
    grammarScore: 0,
    wordUsageScore: 0,
    advancedExpressions: [],
    polishedSentence: '',
    polishedSentenceMeaning: '',
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
  const allowRewrite =
    usageQuality !== 'invalid' &&
    (attemptStatus === 'valid' ||
      sanitizeText(payload.correctedSentence).length > 0 ||
      sanitizeText(payload.polishedSentence).length > 0)

  return {
    score: clamp(Number(payload.score) || 0, 0, 100),
    correctedSentence: allowRewrite ? sanitizeText(payload.correctedSentence) || fallbackSentence : '',
    correctedSentenceMeaning: allowRewrite ? sanitizeText(payload.correctedSentenceMeaning) : '',
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
          originalMeaning: sanitizeText(item.originalMeaning),
          advanced: sanitizeText(item.advanced),
          advancedMeaning: sanitizeText(item.advancedMeaning),
          explanation: sanitizeText(item.explanation),
          example: sanitizeText(item.example),
          exampleMeaning: sanitizeText(item.exampleMeaning),
        }))
      : [],
    polishedSentence: allowRewrite ? sanitizeText(payload.polishedSentence) : '',
    polishedSentenceMeaning: allowRewrite ? sanitizeText(payload.polishedSentenceMeaning) : '',
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

function inferPartOfSpeech(definition?: string | null) {
  const normalized = (definition || '').toLowerCase()
  if (normalized.includes('adj.')) return 'adjective'
  if (normalized.includes('adv.')) return 'adverb'
  if (normalized.includes('vt.') || normalized.includes('vi.') || normalized.includes('v.')) {
    return 'verb'
  }
  if (normalized.includes('n.')) return 'noun'
  return 'unknown'
}

function capitalizeWord(word: string) {
  if (!word) return word
  return word.charAt(0).toUpperCase() + word.slice(1)
}

function buildFallbackSentenceHelp(word: string, definition?: string | null, example?: string | null) {
  const pos = inferPartOfSpeech(definition)
  const capitalizedWord = capitalizeWord(word)
  const suggestions: SentenceHelpItem[] = []

  if (example) {
    suggestions.push({
      sentence: example,
      cue: '先参考词库自带例句，再改成你自己的情境。',
    })
  }

  const byPos: Record<string, SentenceHelpItem[]> = {
    verb: [
      {
        sentence: `We need to ${word} the problem before it gets worse.`,
        cue: '把它当动作，用“谁要做这件事”来造句。',
      },
      {
        sentence: `She tried to ${word} her ideas clearly in the meeting.`,
        cue: '放进工作或沟通场景，句子会更自然。',
      },
      {
        sentence: `It is hard to ${word} the change without more support.`,
        cue: '不会写复杂句时，可以先用 It is hard to... 结构。',
      },
    ],
    noun: [
      {
        sentence: `The ${word} became a serious problem for our team.`,
        cue: '名词最稳的写法是“the + 单词 + became/is + 描述”。',
      },
      {
        sentence: `${capitalizedWord} plays an important role in daily life.`,
        cue: '如果这个词是抽象概念，用 plays an important role 很容易起句。',
      },
      {
        sentence: `I noticed the ${word} when I read the report.`,
        cue: '也可以写“我在某个场景里注意到它”。',
      },
    ],
    adjective: [
      {
        sentence: `It was a ${word} decision, but it solved the problem.`,
        cue: '形容词可以直接修饰 decision, plan, situation 这类高频名词。',
      },
      {
        sentence: `The new rule made the process more ${word}.`,
        cue: '用 make ... more + 形容词，是很稳的句型。',
      },
      {
        sentence: `We faced a ${word} situation at work yesterday.`,
        cue: '也可以把它放进“situation/problem/plan”这类通用场景。',
      },
    ],
    adverb: [
      {
        sentence: `She answered ${word} when the teacher asked the question.`,
        cue: '副词一般修饰动作，先想“谁做了什么，做得怎么样”。',
      },
      {
        sentence: `He spoke ${word} during the interview.`,
        cue: '把副词接在 spoke, worked, reacted, responded 后面最容易。',
      },
      {
        sentence: `They worked ${word} to finish the project on time.`,
        cue: '也可以放进努力、反应、说话这类常见动作里。',
      },
    ],
    unknown: [
      {
        sentence: `I used ${word} in a real conversation today.`,
        cue: '如果词性不清楚，先参考词义，再把句子改成具体场景。',
      },
      {
        sentence: `This example helped me understand ${word} better.`,
        cue: '先写一条简单句，再替换成更具体的人物和场景。',
      },
      {
        sentence: `${capitalizedWord} is easier to remember in a real situation.`,
        cue: '不知道怎么展开时，先围绕 situation / conversation / work 来写。',
      },
    ],
  }

  for (const item of byPos[pos] ?? byPos.unknown) {
    if (!suggestions.some((existing) => existing.sentence === item.sentence)) {
      suggestions.push(item)
    }
  }

  return suggestions.slice(0, 4)
}

function normalizeSentenceHelp(
  payload: SentenceHelpPayload,
  word: string,
  fallback: SentenceHelpItem[]
) {
  const items = Array.isArray(payload.hints) ? (payload.hints as SentenceHelpItemPayload[]) : []
  const normalizedWord = word.trim().toLowerCase()

  const normalized = items
    .map((item) => ({
      sentence: sanitizeText(item.sentence).trim(),
      cue: sanitizeText(item.cue).trim(),
    }))
    .filter((item) => item.sentence.length > 0)
    .filter((item) => {
      if (!normalizedWord) {
        return true
      }

      const normalizedSentence = item.sentence.toLowerCase()
      return normalizedSentence.includes(normalizedWord)
    })
    .map((item) => ({
      sentence: item.sentence,
      cue: item.cue || '先照着写，再把人物、时间或场景替换成你自己的。',
    }))

  if (normalized.length > 0) {
    return {
      items: normalized.slice(0, 4),
      usedFallback: false,
    }
  }

  return {
    items: fallback,
    usedFallback: true,
  }
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

function isMissingLibrariesTableError(error: { message?: string; details?: string } | null) {
  const message = `${error?.message ?? ''} ${error?.details ?? ''}`.toLowerCase()
  return (
    message.includes('libraries') ||
    message.includes('library_words') ||
    message.includes('user_library_plans') ||
    message.includes('user_library_words')
  )
}

function applyStudyViewFilters(query: any, studyView: StudyView) {
  switch (studyView) {
    case 'favorites':
      return query.eq('is_favorite', true)
    case 'weak':
      return query.or('last_score.lt.75,consecutive_failures.gte.2')
    case 'recent_failures':
      return query
        .or('last_score.lt.60,consecutive_failures.gte.1')
        .gte('last_reviewed_at', getRecentFailureSince())
    case 'all':
    default:
      return query
  }
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

async function getLibraryBySlug(supabase: SupabaseClient, librarySlug: string) {
  const normalizedSlug = normalizeLibrarySlug(librarySlug)
  if (normalizedSlug === 'all') {
    return null
  }

  const { data, error } = await supabase
    .from('libraries')
    .select('id, slug, name, description, source_type')
    .eq('slug', normalizedSlug)
    .maybeSingle()

  if (error) {
    if (!isMissingLibrariesTableError(error)) {
      console.error('Failed to load library by slug:', error)
    }
    return null
  }

  return (data as LibraryRow | null) ?? null
}

async function getLibraryWordIds(supabase: SupabaseClient, libraryId: string) {
  const { data, error } = await supabase
    .from('library_words')
    .select('word_id')
    .eq('library_id', libraryId)

  if (error || !data) {
    if (error && !isMissingLibrariesTableError(error)) {
      console.error('Failed to load library words:', error)
    }
    return [] as string[]
  }

  return (data as LibraryWordRow[])
    .map((row) => row.word_id)
    .filter((wordId): wordId is string => typeof wordId === 'string')
}

async function ensureUserLibraryPlan(
  supabase: SupabaseClient,
  userId: string,
  libraryId: string
) {
  const now = new Date().toISOString()
  const { error } = await supabase
    .from('user_library_plans')
    .upsert(
      {
        user_id: userId,
        library_id: libraryId,
        status: 'active',
        last_studied_at: now,
      },
      { onConflict: 'user_id,library_id' }
    )

  if (error && !isMissingLibrariesTableError(error)) {
    console.error('Failed to ensure user library plan:', error)
  }
}

async function touchUserLibraryWord(
  supabase: SupabaseClient,
  userId: string,
  libraryId: string,
  wordId: string
) {
  const now = new Date().toISOString()
  const { data: existing, error: existingError } = await supabase
    .from('user_library_words')
    .select('id')
    .eq('user_id', userId)
    .eq('library_id', libraryId)
    .eq('word_id', wordId)
    .maybeSingle()

  if (existingError && !isMissingLibrariesTableError(existingError)) {
    console.error('Failed to load user library word:', existingError)
    return
  }

  if (existing) {
    const { error } = await supabase
      .from('user_library_words')
      .update({ last_studied_at: now })
      .eq('id', existing.id)

    if (error && !isMissingLibrariesTableError(error)) {
      console.error('Failed to update user library word:', error)
    }
    return
  }

  const { error } = await supabase.from('user_library_words').insert({
    user_id: userId,
    library_id: libraryId,
    word_id: wordId,
    introduced_at: now,
    first_studied_at: now,
    last_studied_at: now,
    source: 'scheduled',
  })

  if (error && !isMissingLibrariesTableError(error)) {
    console.error('Failed to insert user library word:', error)
  }
}

async function touchLibraryProgress(
  supabase: SupabaseClient,
  userId: string,
  wordId: string,
  librarySlug?: string | null
) {
  const library = await getLibraryBySlug(supabase, librarySlug ?? 'all')
  if (!library) {
    return
  }

  await ensureUserLibraryPlan(supabase, userId, library.id)
  await touchUserLibraryWord(supabase, userId, library.id, wordId)
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

async function getWordById(supabase: SupabaseClient, wordId: string) {
  const { data, error } = await supabase.from('words').select('*').eq('id', wordId).maybeSingle()
  if (error) {
    throw error
  }
  return isWordRecord(data) ? data : null
}

async function attachWordToUser(
  wordId: string,
  reviewDate: string,
  supabase: SupabaseClient,
  userId: string,
  libraryId?: string | null
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
    if (libraryId) {
      await ensureUserLibraryPlan(supabase, userId, libraryId)
      await touchUserLibraryWord(supabase, userId, libraryId, wordId)
    }
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

  if (existing && libraryId) {
    await ensureUserLibraryPlan(supabase, userId, libraryId)
    await touchUserLibraryWord(supabase, userId, libraryId, wordId)
  }

  return existing
}

async function getDueWordCount(
  supabase: SupabaseClient,
  userId: string,
  tag: string,
  today: string,
  skippedWordIds: string[],
  preferredWordIds: string[],
  studyView: StudyView,
  libraryWordIds: string[] = []
) {
  let query = supabase
    .from('user_words')
    .select('id, words!inner(id)', { count: 'exact', head: true })
    .eq('user_id', userId)
    .lte('next_review_date', today)

  query = applyStudyViewFilters(query, studyView)

  if (tag !== 'All') {
    query = query.eq('words.tags', tag)
  }
  if (libraryWordIds.length > 0) {
    query = query.in('word_id', libraryWordIds)
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
  batchSize: number,
  studyView: StudyView,
  libraryWordIds: string[] = []
) {
  let query = supabase
    .from('user_words')
    .select('*, words!inner(*)')
    .eq('user_id', userId)
    .lte('next_review_date', today)

  query = applyStudyViewFilters(query, studyView)

  if (tag !== 'All') {
    query = query.eq('words.tags', tag)
  }
  if (libraryWordIds.length > 0) {
    query = query.in('word_id', libraryWordIds)
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
  reviewDate: string,
  libraryWordIds: string[] = [],
  libraryId?: string | null
) {
  const items: StudyBatchItem[] = []
  const excludedWordIds = new Set(skippedWordIds)
  let libraryUnseenWordIds = libraryWordIds

  if (libraryWordIds.length > 0) {
    const { data: studiedRows } = await supabase
      .from('user_words')
      .select('word_id')
      .eq('user_id', userId)
      .in('word_id', libraryWordIds)

    const studiedWordIds = new Set(
      (studiedRows ?? [])
        .map((row) => row.word_id)
        .filter((id): id is string => typeof id === 'string')
    )

    libraryUnseenWordIds = libraryWordIds.filter((wordId) => !studiedWordIds.has(wordId))
  }

  while (items.length < batchSize) {
    let candidate: WordRecord | null
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
        userId
      )
    }

    if (!candidate) {
      break
    }

    excludedWordIds.add(candidate.id)
    const attached = await attachWordToUser(candidate.id, reviewDate, supabase, userId, libraryId)
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

async function buildLibrarySummary(
  supabase: SupabaseClient,
  userId: string,
  library: LibraryRow
): Promise<StudyLibrary> {
  const libraryWordIds = await getLibraryWordIds(supabase, library.id)
  const wordCount = libraryWordIds.length
  const planPromise = supabase
    .from('user_library_plans')
    .select('status, daily_new_limit')
    .eq('user_id', userId)
    .eq('library_id', library.id)
    .maybeSingle()

  if (libraryWordIds.length === 0) {
    const { data: plan } = await planPromise
    const planRow = (plan as UserLibraryPlanRow | null) ?? null
    return {
      id: library.id,
      slug: library.slug,
      name: library.name,
      description: library.description ?? null,
      sourceType: library.source_type === 'custom' ? 'custom' : 'official',
      wordCount: 0,
      activeCount: 0,
      dueCount: 0,
      remainingCount: 0,
      planStatus: planRow?.status ?? 'not_started',
      dailyNewLimit: planRow?.daily_new_limit ?? null,
    }
  }

  const today = getTodayDateString()
  const [{ count: active }, { count: due }, { data: plan }] = await Promise.all([
    supabase
      .from('user_words')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .in('word_id', libraryWordIds),
    supabase
      .from('user_words')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .in('word_id', libraryWordIds)
      .lte('next_review_date', today),
    planPromise,
  ])

  const planRow = (plan as UserLibraryPlanRow | null) ?? null
  const activeCount = active ?? 0

  return {
    id: library.id,
    slug: library.slug,
    name: library.name,
    description: library.description ?? null,
    sourceType: library.source_type === 'custom' ? 'custom' : 'official',
    wordCount,
    activeCount,
    dueCount: due ?? 0,
    remainingCount: Math.max(wordCount - activeCount, 0),
    planStatus: planRow?.status ?? 'not_started',
    dailyNewLimit: planRow?.daily_new_limit ?? null,
  }
}

export async function getStudyLibraries(): Promise<StudyLibrary[]> {
  const { supabase, user } = await requireActionSession()
  const { data, error } = await supabase
    .from('libraries')
    .select('id, slug, name, description, source_type')
    .order('name', { ascending: true })

  if (error || !data) {
    if (error && !isMissingLibrariesTableError(error)) {
      console.error('Failed to load study libraries:', error)
    }

    return LEGACY_LIBRARY_OPTIONS.filter((option) => option.slug !== 'all').map((option) => ({
      id: option.slug,
      slug: option.slug,
      name: option.name,
      description: null,
      sourceType: 'official',
      wordCount: 0,
      activeCount: 0,
      dueCount: 0,
      remainingCount: 0,
      planStatus: 'not_started',
      dailyNewLimit: null,
    }))
  }

  const libraries = (data as LibraryRow[]).filter(
    (row) => typeof row.id === 'string' && typeof row.slug === 'string' && typeof row.name === 'string'
  )

  return Promise.all(libraries.map((library) => buildLibrarySummary(supabase, user.id, library)))
}

export async function generateSentenceHelp(
  wordId: string,
  word: string,
  definition: string,
  tags?: string,
  example?: string | null
): Promise<SentenceHelpResult> {
  const apiKey = process.env.OPENAI_HINT_API_KEY || process.env.OPENAI_API_KEY
  const apiBase =
    process.env.OPENAI_HINT_API_BASE ||
    process.env.OPENAI_API_BASE ||
    'https://api.openai.com/v1'
  const model = process.env.OPENAI_HINT_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini'
  const remoteModelLabel = formatModelLabel(model, apiBase)
  const fallback = buildFallbackSentenceHelp(word, definition, example)

  if (!apiKey) {
    return { items: fallback, modelLabel: '本地兜底' }
  }

  try {
    const { supabase, user } = await requireActionSession()
    const learningHistory = await getWordLearningHistory(supabase, user.id, wordId)
    const response = await fetch(`${apiBase}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        messages: [
          {
            role: 'system',
            content: [
              'You help a Chinese learner make a sentence with one target English word.',
              'Return JSON only.',
              'Generate 3 to 4 short, natural example sentences that use the exact target word unchanged.',
              'The sentences must clearly show the meaning in context, not talk about the word itself.',
              'Keep them beginner-friendly but useful enough to adapt.',
              'Each item must include:',
              '- sentence: an English sentence.',
              '- cue: one concise coaching tip in Simplified Chinese explaining why this sentence works or how to adapt it.',
              'Avoid fake dictionary-style lines and avoid repetitive sentence frames.',
              'Schema: {"hints":[{"sentence":"...","cue":"..."}]}',
            ].join('\n'),
          },
          {
            role: 'user',
            content: [
              `Target word: ${word}`,
              `Definition: ${definition || 'N/A'}`,
              `Word list tag: ${tags || 'General'}`,
              `Dictionary example: ${example || 'N/A'}`,
              learningHistory.length > 0
                ? `Past learner sentences:\n${learningHistory.map((item, index) => `${index + 1}. ${item}`).join('\n')}`
                : 'Past learner sentences: none',
              'Generate better sentence hints that are specific to the meaning.',
            ].join('\n\n'),
          },
        ],
      }),
    })

    if (!response.ok) {
      return { items: fallback, modelLabel: `${remoteModelLabel} -> 本地兜底` }
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content
    if (typeof content !== 'string' || !content.trim()) {
      return { items: fallback, modelLabel: `${remoteModelLabel} -> 本地兜底` }
    }

    const parsed = JSON.parse(extractJsonObject(content)) as SentenceHelpPayload
    const normalized = normalizeSentenceHelp(parsed, word, fallback)

    return {
      items: normalized.items,
      modelLabel: normalized.usedFallback
        ? `${remoteModelLabel} -> 本地兜底`
        : remoteModelLabel,
    }
  } catch (error) {
    console.error('Failed to generate sentence help:', error)
    return { items: fallback, modelLabel: `${remoteModelLabel} -> 本地兜底` }
  }
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
    librarySlug,
    studyView,
    tag = 'All',
    skippedWordIds = [],
    favoritesOnly = false,
    batchSize = DEFAULT_STUDY_BATCH_SIZE,
  } = params
  const { supabase, user } = await requireActionSession()
  const today = getTodayDateString()
  const resolvedLibrarySlug = normalizeLibrarySlug(librarySlug ?? getLibrarySlugForLegacyTag(tag))
  const resolvedStudyView = resolveStudyView({ studyView, favoritesOnly })
  const preferredWordIds = resolvedStudyView === 'favorites'
    ? await getUserFavoriteWordIds(supabase, user.id)
    : []
  let tagFilter = tag
  let libraryId: string | null = null
  let libraryWordIds: string[] = []

  if (resolvedLibrarySlug !== 'all') {
    const library = await getLibraryBySlug(supabase, resolvedLibrarySlug)
    if (library) {
      libraryId = library.id
      tagFilter = 'All'
      libraryWordIds = await getLibraryWordIds(supabase, library.id)
      await ensureUserLibraryPlan(supabase, user.id, library.id)
    } else {
      tagFilter = getLegacyTagForLibrarySlug(resolvedLibrarySlug)
    }
  } else {
    tagFilter = 'All'
  }

  if (resolvedStudyView === 'favorites' && preferredWordIds.length === 0) {
    return [] as StudyBatchItem[]
  }

  const dueCount = await getDueWordCount(
    supabase,
    user.id,
    tagFilter,
    today,
    skippedWordIds,
    preferredWordIds,
    resolvedStudyView,
    libraryWordIds
  )

  const dueItems = await getDueStudyItems(
    supabase,
    user.id,
    tagFilter,
    today,
    skippedWordIds,
    preferredWordIds,
    batchSize,
    resolvedStudyView,
    libraryWordIds
  )

  const newItems = isReviewOnlyView(resolvedStudyView)
    ? []
    : await getNewStudyItems(
        supabase,
        user.id,
        tagFilter,
        [...skippedWordIds, ...dueItems.map((item) => item.word_id)],
        preferredWordIds,
        batchSize,
        today,
        libraryWordIds,
        libraryId
      )

  return composeStudyBatch(dueItems, newItems, dueCount, isReviewOnlyView(resolvedStudyView), batchSize)
}

export async function getNextWord(
  librarySlug: string = 'all',
  skippedWordIds: string[] = [],
  studyView: StudyView = 'all'
) {
  const batch = await getStudyBatch({
    librarySlug,
    skippedWordIds,
    studyView,
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
  librarySlug?: string,
  streamedContent?: string | null
): Promise<StudySubmissionResult> {
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

  await touchLibraryProgress(supabase, user.id, wordId, librarySlug)

  const evaluationModel =
    process.env.OPENAI_MODEL || 'gpt-4o-mini'
  const evaluationApiBase =
    process.env.OPENAI_API_BASE || 'https://api.openai.com/v1'

  return {
    evaluation,
    nextSrs,
    savedSentence,
    evaluationModelLabel: formatModelLabel(evaluationModel, evaluationApiBase),
    reviewImpact: 'scheduled',
  }
}

export async function rewriteSentence(
  wordId: string,
  wordStr: string,
  definition: string,
  tags: string,
  sentence: string,
  librarySlug?: string,
  streamedContent?: string | null
): Promise<StudySubmissionResult> {
  const { supabase, user } = await requireActionSession()
  let evaluation: EvaluationResult | null = null

  if (streamedContent?.trim()) {
    try {
      evaluation = parseEvaluationJson(streamedContent, sentence)
    } catch (error) {
      console.error('Failed to parse streamed rewrite evaluation content:', error)
    }
  }

  if (!evaluation) {
    const learningHistory = await getWordLearningHistory(supabase, user.id, wordId)
    evaluation = await evaluateSentence(wordStr, sentence, definition, tags, learningHistory)
  }

  await touchLibraryProgress(supabase, user.id, wordId, librarySlug)

  const evaluationModel = process.env.OPENAI_MODEL || 'gpt-4o-mini'
  const evaluationApiBase = process.env.OPENAI_API_BASE || 'https://api.openai.com/v1'

  return {
    evaluation,
    nextSrs: null,
    savedSentence: null,
    evaluationModelLabel: formatModelLabel(evaluationModel, evaluationApiBase),
    reviewImpact: 'practice_only',
  }
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
