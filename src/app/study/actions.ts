'use server'

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  buildEvaluationSystemPrompt,
  buildGrammarEvaluationSystemPrompt,
  buildEvaluationUserPrompt,
  extractEvaluationJson,
} from '@/lib/evaluation-format'
import {
  buildTextGenerationRequest,
  extractTextFromOpenAiResponse,
  getOpenAiApiUrl,
  normalizeOpenAiApiType,
} from '@/lib/openai-api'
import type {
  GrammarContrastInfo,
  GrammarExampleInfo,
  GrammarSlotDefinition,
  GrammarStudyInfo,
  GrammarTemplateInfo,
  StudyContentType,
  StudyTargetKind,
} from '@/lib/study-content'
import { normalizeStudyContentType } from '@/lib/study-content'
import { isLearnerFriendlyExampleSentence } from '@/lib/example-safety'
import { getGrammarFamilyLabel } from '@/lib/grammar-family'
import { type ReviewBucket, type SRSData } from '@/lib/srs'
import { type StudyPriorityReason } from '@/lib/study-scheduler'
import { requireActionSession } from '@/lib/supabase/user'
import { getTodayDateString } from '@/lib/app-date'
import {
  hydrateStudyBatchWordDetails as loadHydratedStudyBatchWordDetails,
  loadNewStudyItems,
  loadStudyBatch,
  loadDueStudyItems,
  rewriteStudySentence,
  loadStudyEnrichmentProgress,
  loadStudyLibraries,
  loadStudyLibraryOptions,
  loadStudySidebarData,
  rewriteStudyGrammarAttempt,
  submitStudySentence,
  submitStudyGrammarAttempt,
} from './services'

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
  patternMatched: boolean
  structureAccuracy: number
  sceneFit: number
}

export interface StudySubmissionResult {
  evaluation: EvaluationResult
  nextSrs: SRSData | null
  savedSentence: unknown | null
  evaluationModelLabel: string
  reviewImpact: 'scheduled' | 'practice_only'
  targetKind: StudyTargetKind
  userWordId: string | null
  userGrammarItemId: string | null
}

export interface HistoryReviewContext {
  historyId: string
  targetKind: StudyTargetKind
  title: string
  subtitle?: string | null
  sentence: string
  score: number
  feedback: string
  createdAt: string
}

export interface HistoryReviewTarget {
  batchItem: StudyBatchItem | null
  review: HistoryReviewContext | null
  preferredLibrarySlug?: string | null
}

export interface StudyWordContrast {
  word: string
  note: string
}

export interface StudyWordExample {
  sentence: string
  translation?: string | null
  scene?: string | null
  isPrimary: boolean
}

export interface StudyWordProfile {
  coreMeaning: string
  semanticFeel?: string | null
  usageNote?: string | null
  usageRegister?: string | null
  sceneTags: string[]
  collocations: string[]
  contrastWords: StudyWordContrast[]
}

export interface StudyWordInfo {
  word: string
  definition?: string | null
  tags?: string | null
  phonetic?: string | null
  example?: string | null
  profile?: StudyWordProfile | null
  examples?: StudyWordExample[]
}

export interface StudyBatchWordItem {
  kind: 'word'
  id: string
  userWordId: string | null
  word_id: string
  words: StudyWordInfo
  isNew: boolean
  priorityReason: StudyPriorityReason
}

export interface StudyBatchGrammarItem {
  kind: 'grammar'
  id: string
  userGrammarItemId: string | null
  grammar_item_id: string
  grammar: GrammarStudyInfo
  isNew: boolean
  priorityReason: StudyPriorityReason
}

export type StudyBatchItem = StudyBatchWordItem | StudyBatchGrammarItem

export interface StudyLibrary {
  id: string
  slug: string
  name: string
  description: string | null
  sourceType: 'official' | 'custom'
  contentType: StudyContentType
  wordCount: number
  activeCount: number
  dueCount: number
  remainingCount: number
  planStatus: 'active' | 'paused' | 'completed' | 'not_started'
  dailyNewLimit: number | null
}

export interface StudyEnrichmentProgress {
  slug: string
  name: string
  totalWords: number
  coveredWords: number
  refinedWords: number
  exampleWords: number
}

export interface SentenceHelpItem {
  sentence: string
  cue: string
  source: 'ai' | 'dictionary_example' | 'local_template'
}

export interface SentenceHelpResult {
  items: SentenceHelpItem[]
  sourceType: 'ai' | 'fallback' | 'unavailable'
  providerLabel: string
  modelName: string | null
  fallbackReason:
    | 'no_hint_config'
    | 'request_failed'
    | 'empty_content'
    | 'parse_error'
    | 'validation_failed'
    | 'request_exception'
    | null
  sourceLabel: string
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
  patternMatched?: unknown
  structureAccuracy?: unknown
  sceneFit?: unknown
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

interface WordProfileRow {
  word_id: string
  core_meaning?: string | null
  semantic_feel?: string | null
  usage_note?: string | null
  usage_register?: string | null
  scene_tags?: string[] | null
  collocations?: unknown
  contrast_words?: unknown
}

interface WordProfileExampleRow {
  word_id: string
  sentence?: string | null
  translation?: string | null
  scene?: string | null
  is_primary?: boolean | null
  quality_score?: number | null
}

interface GrammarItemRow {
  id: string
  slug: string
  title: string
  short_label?: string | null
  pattern: string
  family: string
  subtype?: string | null
  anchor?: string | null
  core_explanation: string
  usage_note?: string | null
  usage_register?: string | null
  scene_tags?: string[] | null
  slot_schema?: unknown
  common_errors?: unknown
}

interface LibraryGrammarItemRow {
  grammar_item_id?: string | null
  position?: number | null
  grammar_items?: GrammarItemRow | GrammarItemRow[] | null
}

interface GrammarItemExampleRow {
  grammar_item_id: string
  sentence?: string | null
  translation?: string | null
  note?: string | null
  scene?: string | null
  is_primary?: boolean | null
  quality_score?: number | null
}

interface GrammarItemTemplateRow {
  grammar_item_id: string
  label?: string | null
  template?: string | null
  slot_hints?: unknown
  example_sentence?: string | null
  example_translation?: string | null
  position?: number | null
}

interface GrammarItemContrastRow {
  grammar_item_id: string
  contrast_item_id?: string | null
  note?: string | null
  position?: number | null
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

interface UserGrammarItemRecord {
  id: string
  grammar_item_id: string
  repetitions: number
  interval: number
  ease_factor: number
  next_review_date?: string | null
  last_score?: number | null
  last_reviewed_at?: string | null
  consecutive_failures?: number | null
  lapse_count?: number | null
}

type FailureCounterRecord = Pick<UserWordRecord, 'consecutive_failures' | 'lapse_count'>

interface PastSentenceRow {
  original_text: string | null
}

interface HistorySentenceReviewRow {
  id: string
  word_id: string
  original_text: string
  ai_score?: number | null
  ai_feedback?: string | null
  created_at: string
  words?: WordRow | WordRow[] | null
}

interface HistoryGrammarAttemptReviewRow {
  id: string
  grammar_item_id: string
  original_text: string
  ai_score?: number | null
  ai_feedback?: string | null
  created_at: string
  grammar_items?: GrammarItemRow | GrammarItemRow[] | null
}

interface UserGrammarBatchRow extends UserGrammarItemRecord {
  grammar_items?: GrammarItemRow | GrammarItemRow[] | null
}

interface LibraryGrammarMembershipRow {
  library_id?: string | null
  position?: number | null
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
  content_type?: StudyContentType | null
}

interface LibraryWordRow {
  word_id: string | null
}

interface SentenceHelpPayload {
  hints?: unknown
}

interface SentenceHelpItemPayload {
  sentence?: unknown
  cue?: unknown
  text?: unknown
  tip?: unknown
  explanation?: unknown
  reason?: unknown
}

let favoriteColumnSupported: boolean | null = null
const DEFAULT_STUDY_BATCH_SIZE = 5
const SUPABASE_PAGE_SIZE = 1000
const STUDY_LIBRARY_MEMBERSHIP_CACHE_TTL_MS = 60 * 60 * 1000
const STUDY_LIBRARY_OPTIONS_CACHE_TTL_MS = 60 * 1000
const STUDY_SIDEBAR_DATA_CACHE_TTL_MS = 30 * 1000
const STUDY_PERFORMANCE_LOG_THRESHOLD_MS = 150
const SENTENCE_HELP_MAX_OUTPUT_TOKENS = 360
const EVALUATION_MAX_OUTPUT_TOKENS = 2000
const LEGACY_LIBRARY_OPTIONS = [
  { slug: 'all', name: '全部词库', tag: 'All' },
  { slug: 'cet-4', name: '大学英语四级', tag: 'CET-4' },
  { slug: 'cet-6', name: '大学英语六级', tag: 'CET-6' },
] as const

interface TimedCacheEntry<T> {
  value: T
  expiresAt: number
}

const libraryWordIdsCache = new Map<string, TimedCacheEntry<string[]>>()
const libraryGrammarItemIdsCache = new Map<string, TimedCacheEntry<string[]>>()
const studyLibraryOptionsCache = new Map<string, TimedCacheEntry<StudyLibrary[]>>()
const studySidebarDataCache = new Map<
  string,
  TimedCacheEntry<{
    libraries: StudyLibrary[]
    enrichmentProgress: StudyEnrichmentProgress[]
  }>
>()

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

function getActiveTimedCacheValue<T>(entry?: TimedCacheEntry<T> | null) {
  if (!entry) {
    return null
  }

  if (entry.expiresAt <= Date.now()) {
    return null
  }

  return entry.value
}

function setTimedCacheValue<T>(
  cache: Map<string, TimedCacheEntry<T>>,
  key: string,
  value: T,
  ttlMs: number
) {
  cache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  })

  return value
}

function logStudyPerformance(
  label: string,
  startedAt: number,
  metadata?: Record<string, string | number | boolean | null | undefined>
) {
  const durationMs = Date.now() - startedAt
  if (durationMs < STUDY_PERFORMANCE_LOG_THRESHOLD_MS) {
    return
  }

  const details =
    metadata && Object.keys(metadata).length > 0
      ? ` ${Object.entries(metadata)
          .map(([key, value]) => `${key}=${String(value)}`)
          .join(' ')}`
      : ''

  console.info(`[study:perf] ${label} ${durationMs}ms${details}`)
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

function extractJsonArray(content: string) {
  const trimmed = content.trim()
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return trimmed
  }

  const match = trimmed.match(/\[[\s\S]*\]/)
  return match?.[0] ?? trimmed
}

function stripMarkdownCodeFence(content: string) {
  const trimmed = content.trim()
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  if (fenced?.[1]) {
    return fenced[1].trim()
  }

  return trimmed
}

function repairJsonLikeString(content: string) {
  return content
    .replace(/^\uFEFF/, '')
    .replace(/,\s*([}\]])/g, '$1')
    .trim()
}

function normalizeSentenceHelpPayloadValue(value: unknown): SentenceHelpPayload {
  if (Array.isArray(value)) {
    return { hints: value }
  }

  if (typeof value !== 'object' || value === null) {
    return {}
  }

  const record = value as Record<string, unknown>

  if (Array.isArray(record.hints)) {
    return { hints: record.hints }
  }

  if (Array.isArray(record.items)) {
    return { hints: record.items }
  }

  if (Array.isArray(record.examples)) {
    return { hints: record.examples }
  }

  if (typeof record.data === 'object' && record.data !== null) {
    const nested = normalizeSentenceHelpPayloadValue(record.data)
    if (Array.isArray(nested.hints)) {
      return nested
    }
  }

  if (typeof record.result === 'object' && record.result !== null) {
    const nested = normalizeSentenceHelpPayloadValue(record.result)
    if (Array.isArray(nested.hints)) {
      return nested
    }
  }

  if (typeof record.output === 'object' && record.output !== null) {
    const nested = normalizeSentenceHelpPayloadValue(record.output)
    if (Array.isArray(nested.hints)) {
      return nested
    }
  }

  return {}
}

function parseSentenceHelpPayload(content: string): SentenceHelpPayload {
  const candidates = Array.from(
    new Set(
      [
        content,
        stripMarkdownCodeFence(content),
        extractJsonObject(stripMarkdownCodeFence(content)),
        extractJsonArray(stripMarkdownCodeFence(content)),
      ]
        .map((item) => repairJsonLikeString(item))
        .filter(Boolean)
    )
  )

  let lastError: unknown = null

  for (const candidate of candidates) {
    try {
      return normalizeSentenceHelpPayloadValue(JSON.parse(candidate))
    } catch (error) {
      lastError = error
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Unable to parse sentence help payload')
}

function getModelProviderLabel(apiBase: string) {
  if (apiBase.includes('bigmodel.cn')) {
    return '智谱'
  }

  if (apiBase.includes('betterclau.de')) {
    return 'BetterClaude'
  }

  if (apiBase.includes('openai.com')) {
    return 'OpenAI'
  }

  return 'Custom'
}

function formatModelLabel(model: string, apiBase: string) {
  return `${getModelProviderLabel(apiBase)} / ${model}`
}

function getChatCompletionsUrl(apiBase: string, apiType = normalizeOpenAiApiType(undefined)) {
  return getOpenAiApiUrl(apiBase, apiType)
}

function shouldUseStructuredJsonOutputForSentenceHelp(apiType: string, apiBase: string) {
  if (apiType !== 'responses') {
    return false
  }

  // BetterClaude's Responses proxy intermittently 502s when sentence-help requests
  // ask for JSON object formatting, so we fall back to prompt-only JSON there.
  if (apiBase.includes('betterclau.de')) {
    return false
  }

  return true
}

function getResponseHeaderValue(headers: Headers, names: string[]) {
  for (const name of names) {
    const value = headers.get(name)
    if (value) {
      return value
    }
  }

  return null
}

function getProviderRequestId(headers: Headers) {
  return getResponseHeaderValue(headers, [
    'x-request-id',
    'request-id',
    'x-openai-request-id',
    'openai-request-id',
    'x-trace-id',
    'trace-id',
    'x-b3-traceid',
  ])
}

function describeResponseValue(value: unknown): string {
  if (typeof value === 'string') {
    return `string(${value.length})`
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return typeof value
  }

  if (Array.isArray(value)) {
    return `array(${value.length})`
  }

  if (typeof value === 'object' && value !== null) {
    return `object(${Object.keys(value as Record<string, unknown>).slice(0, 6).join(',')})`
  }

  return String(value)
}

function summarizeOpenAiPayloadShape(payload: unknown) {
  if (typeof payload !== 'object' || payload === null) {
    return {
      payloadType: typeof payload,
    }
  }

  const record = payload as Record<string, unknown>
  const firstChoice =
    Array.isArray(record.choices) && record.choices[0] && typeof record.choices[0] === 'object'
      ? (record.choices[0] as Record<string, unknown>)
      : null
  const firstChoiceMessage =
    firstChoice && typeof firstChoice.message === 'object' && firstChoice.message !== null
      ? (firstChoice.message as Record<string, unknown>)
      : null
  const firstOutput =
    Array.isArray(record.output) && record.output[0] && typeof record.output[0] === 'object'
      ? (record.output[0] as Record<string, unknown>)
      : null

  return {
    topLevelKeys: Object.keys(record).slice(0, 12),
    outputText: describeResponseValue(record.output_text),
    output: describeResponseValue(record.output),
    content: describeResponseValue(record.content),
    choices: describeResponseValue(record.choices),
    error: describeResponseValue(record.error),
    firstChoiceKeys: firstChoice ? Object.keys(firstChoice).slice(0, 8) : [],
    firstChoiceFinishReason:
      typeof firstChoice?.finish_reason === 'string' ? firstChoice.finish_reason : null,
    firstChoiceMessageKeys: firstChoiceMessage ? Object.keys(firstChoiceMessage).slice(0, 8) : [],
    firstChoiceMessageContent: describeResponseValue(firstChoiceMessage?.content),
    firstChoiceReasoningContent: describeResponseValue(firstChoiceMessage?.reasoning_content),
    firstOutputKeys: firstOutput ? Object.keys(firstOutput).slice(0, 8) : [],
    firstOutputContent: describeResponseValue(firstOutput?.content),
  }
}

function summarizeSentenceHelpPayloadForLogs(payload: SentenceHelpPayload) {
  const hints = Array.isArray(payload.hints) ? payload.hints : []

  return {
    hintCount: hints.length,
    hintShapes: hints.slice(0, 4).map((item) => {
      if (typeof item === 'string') {
        return {
          type: 'string',
          length: item.trim().length,
        }
      }

      if (typeof item !== 'object' || item === null) {
        return {
          type: typeof item,
        }
      }

      const record = item as Record<string, unknown>
      return {
        type: 'object',
        keys: Object.keys(record).slice(0, 8),
        sentence: describeResponseValue(record.sentence),
        text: describeResponseValue(record.text),
        cue: describeResponseValue(record.cue),
        tip: describeResponseValue(record.tip),
      }
    }),
  }
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
    patternMatched: false,
    structureAccuracy: 0,
    sceneFit: 0,
  }
}

function normalizeEvaluation(
  payload: EvaluationPayload,
  fallbackSentence: string,
  targetKind: 'word' | 'grammar' = 'word'
): EvaluationResult {
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
  const structureAccuracy = clamp(
    Number(payload.structureAccuracy) || Number(payload.grammarScore) || 3,
    1,
    5
  )
  const sceneFit = clamp(Number(payload.sceneFit) || Number(payload.wordUsageScore) || 3, 1, 5)
  const grammarScore =
    targetKind === 'grammar'
      ? structureAccuracy
      : clamp(Number(payload.grammarScore) || 3, 1, 5)
  const wordUsageScore =
    targetKind === 'grammar'
      ? sceneFit
      : clamp(Number(payload.wordUsageScore) || 3, 1, 5)
  const patternMatched =
    targetKind === 'grammar'
      ? payload.patternMatched === true
      : payload.patternMatched === true || payload.usesWordInContext === true

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
    grammarScore,
    wordUsageScore,
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
    patternMatched,
    structureAccuracy,
    sceneFit,
  }
}

function parseEvaluationJson(
  content: string,
  fallbackSentence: string,
  targetKind: 'word' | 'grammar' = 'word'
): EvaluationResult {
  const jsonStr = extractEvaluationJson(content)
  const parsed = JSON.parse(jsonStr) as EvaluationPayload
  return normalizeEvaluation(parsed, fallbackSentence, targetKind)
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function buildDictionaryExampleSentenceHelp(example?: string | null): SentenceHelpItem[] {
  const trimmed = example?.trim()
  if (!trimmed) {
    return []
  }

  return [
    {
      sentence: trimmed,
      cue: '这是一条例句库里已有的句子。你可以先照着改写，再换成自己的场景。',
      source: 'dictionary_example',
    },
  ]
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function normalizeSentenceHelp(
  payload: SentenceHelpPayload,
  word: string
): SentenceHelpItem[] {
  const items = Array.isArray(payload.hints) ? payload.hints : []
  const normalizedWord = word.trim().toLowerCase()

  return items
    .map((item) => {
      if (typeof item === 'string') {
        return {
          sentence: item.trim(),
          cue: '',
        }
      }

      const payloadItem = (item ?? {}) as SentenceHelpItemPayload
      return {
        sentence: sanitizeText(payloadItem.sentence ?? payloadItem.text).trim(),
        cue: sanitizeText(
          payloadItem.cue ?? payloadItem.tip ?? payloadItem.explanation ?? payloadItem.reason
        ).trim(),
      }
    })
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
      source: 'ai' as const,
    }))
    .slice(0, 4)
}

function getSentenceHelpFallbackReasonText(
  reason: NonNullable<SentenceHelpResult['fallbackReason']>,
  remoteModelLabel: string
) {
  switch (reason) {
    case 'no_hint_config':
      return '未配置提示模型'
    case 'request_failed':
      return `${remoteModelLabel} 请求失败`
    case 'empty_content':
      return `${remoteModelLabel} 未返回可用内容`
    case 'parse_error':
      return `${remoteModelLabel} 返回格式异常`
    case 'validation_failed':
      return `${remoteModelLabel} 返回的句子未通过校验`
    case 'request_exception':
      return `${remoteModelLabel} 请求异常`
    default:
      return '提示来源未知'
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function buildSentenceHelpFallbackResult(args: {
  reason: NonNullable<SentenceHelpResult['fallbackReason']>
  remoteModelLabel: string
  providerLabel: string
  modelName: string | null
  dictionaryExampleItems: SentenceHelpItem[]
}): SentenceHelpResult {
  const reasonText = getSentenceHelpFallbackReasonText(args.reason, args.remoteModelLabel)

  if (args.dictionaryExampleItems.length > 0) {
    return {
      items: args.dictionaryExampleItems,
      sourceType: 'fallback',
      providerLabel: args.providerLabel,
      modelName: args.modelName,
      fallbackReason: args.reason,
      sourceLabel: `来源：词库例句（${reasonText}）`,
    }
  }

  return {
    items: [],
    sourceType: 'unavailable',
    providerLabel: args.providerLabel,
    modelName: args.modelName,
    fallbackReason: args.reason,
    sourceLabel: `来源：${reasonText}，且当前词条没有可用例句`,
  }
}

const MAX_SENTENCE_HELP_ITEMS = 4

type SentenceHelpPartOfSpeech =
  | 'transitive_verb'
  | 'intransitive_verb'
  | 'verb'
  | 'noun'
  | 'adjective'
  | 'adverb'
  | 'unknown'

function normalizeSentenceHelpKeySafe(sentence: string) {
  return sentence.trim().replace(/\s+/g, ' ').toLowerCase()
}

function dedupeSentenceHelpItemsSafe(items: SentenceHelpItem[]) {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = normalizeSentenceHelpKeySafe(item.sentence)
    if (!key || seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
}

function capitalizeWordForSentenceHelp(word: string) {
  if (!word) {
    return word
  }
  return word.charAt(0).toUpperCase() + word.slice(1)
}

function inferSentenceHelpPartOfSpeechSafe(definition?: string | null): SentenceHelpPartOfSpeech {
  const normalized = (definition ?? '').toLowerCase()

  if (normalized.includes('vt.') && normalized.includes('vi.')) {
    return 'verb'
  }
  if (normalized.includes('vt.')) {
    return 'transitive_verb'
  }
  if (normalized.includes('vi.') || normalized.includes('v.i.')) {
    return 'intransitive_verb'
  }
  if (normalized.includes('v.') || normalized.includes('verb')) {
    return 'verb'
  }
  if (normalized.includes('n.') || normalized.includes('noun')) {
    return 'noun'
  }
  if (normalized.includes('adj.') || normalized.includes('adjective')) {
    return 'adjective'
  }
  if (normalized.includes('adv.') || normalized.includes('adverb')) {
    return 'adverb'
  }
  return 'unknown'
}

function buildDictionaryExampleSentenceHelpSafe(
  exampleCandidates: Array<string | null | undefined>
): SentenceHelpItem[] {
  return dedupeSentenceHelpItemsSafe(
    exampleCandidates
      .map((item) => item?.trim() ?? '')
      .filter((item) => item.length > 0)
      .filter((item) => isLearnerFriendlyExampleSentence(item))
      .map((sentence) => ({
        sentence,
        cue:
          '\u8fd9\u662f\u8bcd\u5e93\u91cc\u5df2\u6709\u7684\u4f8b\u53e5\uff0c\u4f60\u53ef\u4ee5\u5148\u7167\u7740\u6539\u5199\uff0c\u518d\u6362\u6210\u81ea\u5df1\u7684\u573a\u666f\u3002',
        source: 'dictionary_example' as const,
      }))
  ).slice(0, MAX_SENTENCE_HELP_ITEMS)
}

function buildLocalTemplateSentenceHelpSafe(
  word: string,
  definition?: string | null
): SentenceHelpItem[] {
  const trimmedWord = word.trim()
  if (!trimmedWord) {
    return []
  }

  const capitalizedWord = capitalizeWordForSentenceHelp(trimmedWord)
  const cueReplaceObject =
    '\u5148\u7528\u8fd9\u4e2a\u53e5\u578b\u8d77\u6b65\uff0c\u518d\u628a it \u6216 something \u6362\u6210\u66f4\u5177\u4f53\u7684\u5bf9\u8c61\u3002'
  const cueAddContext =
    '\u53ef\u4ee5\u518d\u8865\u4e00\u4e2a\u4eba\u7269\u3001\u65f6\u95f4\u6216\u5730\u70b9\uff0c\u53e5\u5b50\u4f1a\u66f4\u81ea\u7136\u3002'

  const templatesByPos: Record<SentenceHelpPartOfSpeech, SentenceHelpItem[]> = {
    transitive_verb: [
      {
        sentence: `I need to ${trimmedWord} it before noon.`,
        cue: cueReplaceObject,
        source: 'local_template',
      },
      {
        sentence: `She wants to ${trimmedWord} something for the project.`,
        cue: cueReplaceObject,
        source: 'local_template',
      },
      {
        sentence: `We should ${trimmedWord} this part first.`,
        cue: cueAddContext,
        source: 'local_template',
      },
    ],
    intransitive_verb: [
      {
        sentence: `I can ${trimmedWord} here.`,
        cue: '\u5982\u679c\u8fd9\u662f\u4e0d\u53ca\u7269\u52a8\u8bcd\uff0c\u5148\u7528\u201c\u8c01 + \u52a8\u4f5c\u201d\u5f00\u53e5\u6700\u7a33\u3002',
        source: 'local_template',
      },
      {
        sentence: `She will ${trimmedWord} again tomorrow.`,
        cue: cueAddContext,
        source: 'local_template',
      },
      {
        sentence: `We had to ${trimmedWord} early.`,
        cue: cueAddContext,
        source: 'local_template',
      },
    ],
    verb: [
      {
        sentence: `I need to ${trimmedWord} today.`,
        cue: '\u5982\u679c\u611f\u89c9\u7f3a\u5185\u5bb9\uff0c\u53ef\u4ee5\u7ed9\u5b83\u8865\u4e00\u4e2a\u5bf9\u8c61\u6216\u573a\u666f\u3002',
        source: 'local_template',
      },
      {
        sentence: `She tried to ${trimmedWord} it more carefully.`,
        cue: cueReplaceObject,
        source: 'local_template',
      },
      {
        sentence: `We can ${trimmedWord} again later.`,
        cue: cueAddContext,
        source: 'local_template',
      },
    ],
    noun: [
      {
        sentence: `The ${trimmedWord} became important during the meeting.`,
        cue: '\u540d\u8bcd\u53ef\u4ee5\u5148\u7528 the + \u5355\u8bcd + became/is + \u8865\u5145\u4fe1\u606f \u8fd9\u79cd\u6846\u67b6\u3002',
        source: 'local_template',
      },
      {
        sentence: `I noticed the ${trimmedWord} right away.`,
        cue: cueAddContext,
        source: 'local_template',
      },
      {
        sentence: `${capitalizedWord} can help in daily life.`,
        cue: '\u53ef\u4ee5\u518d\u8865\u4e0a\u201c\u600e\u4e48\u5e2e\u4e0a\u5fd9\u201d\uff0c\u628a\u53e5\u5b50\u5199\u5f97\u66f4\u5177\u4f53\u3002',
        source: 'local_template',
      },
    ],
    adjective: [
      {
        sentence: `It was a ${trimmedWord} decision.`,
        cue: '\u5f62\u5bb9\u8bcd\u53ef\u4ee5\u5148\u4fee\u9970 decision, plan, situation \u8fd9\u7c7b\u9ad8\u9891\u540d\u8bcd\u3002',
        source: 'local_template',
      },
      {
        sentence: `The plan looks ${trimmedWord} now.`,
        cue: cueAddContext,
        source: 'local_template',
      },
      {
        sentence: `We faced a ${trimmedWord} situation yesterday.`,
        cue: cueAddContext,
        source: 'local_template',
      },
    ],
    adverb: [
      {
        sentence: `She spoke ${trimmedWord} during the meeting.`,
        cue: '\u526f\u8bcd\u901a\u5e38\u653e\u5728\u52a8\u4f5c\u540e\u9762\uff0c\u5148\u60f3\u201c\u8c01\u505a\u4e86\u4ec0\u4e48\uff0c\u505a\u5f97\u600e\u4e48\u6837\u201d\u3002',
        source: 'local_template',
      },
      {
        sentence: `He worked ${trimmedWord} to finish on time.`,
        cue: cueAddContext,
        source: 'local_template',
      },
      {
        sentence: `They reacted ${trimmedWord} when the news arrived.`,
        cue: cueAddContext,
        source: 'local_template',
      },
    ],
    unknown: [
      {
        sentence: `I can use ${trimmedWord} in a short sentence first.`,
        cue: '\u4e0d\u786e\u5b9a\u8bcd\u6027\u65f6\uff0c\u5148\u642d\u4e00\u4e2a\u6700\u77ed\u53ef\u7528\u53e5\uff0c\u518d\u6162\u6162\u8865\u7ec6\u8282\u3002',
        source: 'local_template',
      },
      {
        sentence: `${capitalizedWord} fits this situation well.`,
        cue: cueAddContext,
        source: 'local_template',
      },
      {
        sentence: `This example makes ${trimmedWord} easier to remember.`,
        cue: '\u540e\u9762\u53ef\u4ee5\u6539\u6210\u66f4\u50cf\u4f60\u81ea\u5df1\u4f1a\u8bf4\u7684\u573a\u666f\u3002',
        source: 'local_template',
      },
    ],
  }

  return templatesByPos[inferSentenceHelpPartOfSpeechSafe(definition)] ?? templatesByPos.unknown
}

function buildFallbackSentenceHelpItemsSafe(args: {
  word: string
  definition?: string | null
  exampleCandidates: Array<string | null | undefined>
}) {
  return dedupeSentenceHelpItemsSafe([
    ...buildDictionaryExampleSentenceHelpSafe(args.exampleCandidates),
    ...buildLocalTemplateSentenceHelpSafe(args.word, args.definition),
  ]).slice(0, MAX_SENTENCE_HELP_ITEMS)
}

function buildGrammarFallbackSentenceHelpItemsSafe(args: {
  examples: GrammarExampleInfo[]
  templates: GrammarTemplateInfo[]
}) {
  const templateItems: SentenceHelpItem[] = args.templates.flatMap((template, index) => {
    const sentence = template.exampleSentence?.trim() ?? ''
    if (!sentence) {
      return []
    }

    return [
      {
        sentence,
        cue:
          index === 0
            ? '????????????????????????'
            : '??????????????????????????',
        source: 'local_template',
      },
    ]
  })

  const exampleItems: SentenceHelpItem[] = args.examples
    .map((example) => example.sentence?.trim() ?? '')
    .filter((sentence) => sentence.length > 0)
    .filter((sentence) => isLearnerFriendlyExampleSentence(sentence))
    .map((sentence) => ({
      sentence,
      cue: '??????????????????????????????',
      source: 'dictionary_example' as const,
    }))

  return dedupeSentenceHelpItemsSafe([...templateItems, ...exampleItems]).slice(
    0,
    MAX_SENTENCE_HELP_ITEMS
  )
}

function normalizeSentenceHelpSafe(
  payload: SentenceHelpPayload,
  word: string
): SentenceHelpItem[] {
  const items = Array.isArray(payload.hints) ? payload.hints : []
  const normalizedWord = word.trim().toLowerCase()

  return dedupeSentenceHelpItemsSafe(
    items
      .map((item) => {
        if (typeof item === 'string') {
          return {
            sentence: item.trim(),
            cue: '',
          }
        }

        const payloadItem = (item ?? {}) as SentenceHelpItemPayload
        return {
          sentence: sanitizeText(payloadItem.sentence ?? payloadItem.text).trim(),
          cue: sanitizeText(
            payloadItem.cue ?? payloadItem.tip ?? payloadItem.explanation ?? payloadItem.reason
          ).trim(),
        }
      })
      .filter((item) => item.sentence.length > 0)
      .filter((item) => isLearnerFriendlyExampleSentence(item.sentence))
      .filter((item) => {
        if (!normalizedWord) {
          return true
        }

        const normalizedSentence = item.sentence.toLowerCase()
        return normalizedSentence.includes(normalizedWord)
      })
      .map((item) => ({
        sentence: item.sentence,
        cue:
          item.cue ||
          '\u5148\u7167\u7740\u5199\uff0c\u518d\u628a\u4eba\u7269\u3001\u65f6\u95f4\u6216\u573a\u666f\u66ff\u6362\u6210\u4f60\u81ea\u5df1\u7684\u3002',
        source: 'ai' as const,
      }))
  ).slice(0, MAX_SENTENCE_HELP_ITEMS)
}

function normalizeGrammarSentenceHelpSafe(
  payload: SentenceHelpPayload,
  pattern: string
): SentenceHelpItem[] {
  const items = Array.isArray(payload.hints) ? payload.hints : []
  const normalizedPattern = pattern.trim().toLowerCase()

  return dedupeSentenceHelpItemsSafe(
    items
      .map((item) => {
        if (typeof item === 'string') {
          return {
            sentence: item.trim(),
            cue: '',
          }
        }

        const payloadItem = (item ?? {}) as SentenceHelpItemPayload
        return {
          sentence: sanitizeText(payloadItem.sentence ?? payloadItem.text).trim(),
          cue: sanitizeText(
            payloadItem.cue ?? payloadItem.tip ?? payloadItem.explanation ?? payloadItem.reason
          ).trim(),
        }
      })
      .filter((item) => item.sentence.length > 0)
      .filter((item) => isLearnerFriendlyExampleSentence(item.sentence))
      .filter((item) => {
        if (!normalizedPattern) {
          return true
        }

        const normalizedSentence = item.sentence.toLowerCase()
        const requiredTokens = normalizedPattern
          .replace(/\([^)]*\)/g, ' ')
          .replace(/[^a-z\s]/g, ' ')
          .split(/\s+/)
          .filter(
            (token) =>
              token.length > 1 &&
              !['clause', 'noun', 'base', 'that', 'statement', 'question'].includes(token)
          )
          .slice(0, 2)

        return requiredTokens.every((token) => normalizedSentence.includes(token))
      })
      .map((item) => ({
        sentence: item.sentence,
        cue: item.cue || '先照着这个结构写，再把信息换成你自己的场景。',
        source: 'ai' as const,
      }))
  ).slice(0, MAX_SENTENCE_HELP_ITEMS)
}

function getSentenceHelpFallbackReasonTextSafe(
  reason: NonNullable<SentenceHelpResult['fallbackReason']>,
  remoteModelLabel: string
) {
  switch (reason) {
    case 'no_hint_config':
      return '\u672a\u914d\u7f6e\u63d0\u793a\u6a21\u578b'
    case 'request_failed':
      return `${remoteModelLabel} \u8bf7\u6c42\u5931\u8d25`
    case 'empty_content':
      return `${remoteModelLabel} \u672a\u8fd4\u56de\u53ef\u7528\u5185\u5bb9`
    case 'parse_error':
      return `${remoteModelLabel} \u8fd4\u56de\u683c\u5f0f\u5f02\u5e38`
    case 'validation_failed':
      return `${remoteModelLabel} \u8fd4\u56de\u7684\u53e5\u5b50\u672a\u901a\u8fc7\u6821\u9a8c`
    case 'request_exception':
      return `${remoteModelLabel} \u8bf7\u6c42\u5f02\u5e38`
    default:
      return '\u63d0\u793a\u6765\u6e90\u672a\u77e5'
  }
}

function getSentenceHelpFallbackSourceSummarySafe(items: SentenceHelpItem[]) {
  const hasDictionaryExample = items.some((item) => item.source === 'dictionary_example')
  const hasLocalTemplate = items.some((item) => item.source === 'local_template')

  if (hasDictionaryExample && hasLocalTemplate) {
    return '\u8bcd\u5e93\u4f8b\u53e5 + \u672c\u5730\u6a21\u677f'
  }
  if (hasDictionaryExample) {
    return '\u8bcd\u5e93\u4f8b\u53e5'
  }
  if (hasLocalTemplate) {
    return '\u672c\u5730\u6a21\u677f'
  }
  return '\u56de\u9000\u5185\u5bb9'
}

function buildSentenceHelpFallbackResultSafe(args: {
  reason: NonNullable<SentenceHelpResult['fallbackReason']>
  remoteModelLabel: string
  providerLabel: string
  modelName: string | null
  fallbackItems: SentenceHelpItem[]
}): SentenceHelpResult {
  const reasonText = getSentenceHelpFallbackReasonTextSafe(args.reason, args.remoteModelLabel)

  if (args.fallbackItems.length > 0) {
    return {
      items: args.fallbackItems,
      sourceType: 'fallback',
      providerLabel: args.providerLabel,
      modelName: args.modelName,
      fallbackReason: args.reason,
      sourceLabel: `\u6765\u6e90\uff1a${getSentenceHelpFallbackSourceSummarySafe(args.fallbackItems)}\uff08${reasonText}\uff09`,
    }
  }

  return {
    items: [],
    sourceType: 'unavailable',
    providerLabel: args.providerLabel,
    modelName: args.modelName,
    fallbackReason: args.reason,
    sourceLabel: `\u6765\u6e90\uff1a${reasonText}\uff0c\u4e14\u5f53\u524d\u8bcd\u6761\u6ca1\u6709\u53ef\u7528\u7684\u4f8b\u53e5\u6216\u6a21\u677f`,
  }
}

function buildWordSystemPrompt(
  word: string,
  definition: string,
  tags?: string,
  learningHistory?: string[]
) {
  return buildEvaluationSystemPrompt({
    word,
    definition,
    tags,
    learningHistory,
  })
}

function buildGrammarSystemPrompt(input: {
  title: string
  pattern: string
  coreExplanation: string
  usageNote?: string | null
  sceneTags?: string[]
  examples?: string[]
  templates?: string[]
  learningHistory?: string[]
}) {
  return buildGrammarEvaluationSystemPrompt(input)
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
    message.includes('library_grammar_items') ||
    message.includes('user_library_plans') ||
    message.includes('user_library_words') ||
    message.includes('user_library_grammar_items')
  )
}

function isMissingWordProfileTableError(error: { message?: string; details?: string } | null) {
  const message = `${error?.message ?? ''} ${error?.details ?? ''}`.toLowerCase()
  return message.includes('word_profiles') || message.includes('word_profile_examples')
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
    profile: null,
    examples: [],
  }
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as string[]
  }

  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}

function normalizeStudyWordProfile(value: unknown): StudyWordProfile | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }

  const row = value as WordProfileRow
  if (typeof row.word_id !== 'string' || typeof row.core_meaning !== 'string') {
    return null
  }

  const contrastWords = Array.isArray(row.contrast_words)
    ? row.contrast_words
        .map((item) => {
          if (typeof item !== 'object' || item === null) {
            return null
          }

          const record = item as Record<string, unknown>
          const word = sanitizeText(record.word).trim()
          const note = sanitizeText(record.note).trim()
          if (!word || !note) {
            return null
          }

          return { word, note }
        })
        .filter((item): item is StudyWordContrast => item !== null)
    : []

  return {
    coreMeaning: row.core_meaning,
    semanticFeel: row.semantic_feel ?? null,
    usageNote: row.usage_note ?? null,
    usageRegister: row.usage_register ?? null,
    sceneTags: normalizeStringArray(row.scene_tags),
    collocations: normalizeStringArray(row.collocations),
    contrastWords,
  }
}

function normalizeStudyWordExamples(rows: unknown[]) {
  return rows
    .filter((row): row is WordProfileExampleRow => typeof row === 'object' && row !== null)
    .filter((row) => typeof row.sentence === 'string' && row.sentence.trim().length > 0)
    .sort((left, right) => {
      if (Boolean(left.is_primary) !== Boolean(right.is_primary)) {
        return left.is_primary ? -1 : 1
      }

      return (right.quality_score ?? 0) - (left.quality_score ?? 0)
    })
    .map((row) => ({
      sentence: row.sentence as string,
      translation: row.translation ?? null,
      scene: row.scene ?? null,
      isPrimary: row.is_primary === true,
    }))
}

function normalizeGrammarItemRow(value: unknown): GrammarItemRow | null {
  if (Array.isArray(value)) {
    return normalizeGrammarItemRow(value[0])
  }

  if (typeof value !== 'object' || value === null) {
    return null
  }

  const row = value as GrammarItemRow
  if (
    typeof row.id !== 'string' ||
    typeof row.slug !== 'string' ||
    typeof row.title !== 'string' ||
    typeof row.pattern !== 'string' ||
    typeof row.family !== 'string' ||
    typeof row.core_explanation !== 'string'
  ) {
    return null
  }

  return row
}

function normalizeGrammarSlotSchema(value: unknown): GrammarSlotDefinition[] {
  if (!Array.isArray(value)) {
    return []
  }

  const slots: GrammarSlotDefinition[] = []

  for (const item of value) {
    if (typeof item !== 'object' || item === null) {
      continue
    }

    const record = item as Record<string, unknown>
    const key = sanitizeText(record.key).trim()
    const label = sanitizeText(record.label).trim()
    const type = sanitizeText(record.type).trim()
    const hint = sanitizeText(record.hint).trim()

    if (!key || !label || !type) {
      continue
    }

    slots.push({
      key,
      label,
      type: type as GrammarSlotDefinition['type'],
      required: record.required !== false,
      hint: hint || null,
    })
  }

  return slots
}

function normalizeGrammarExamples(rows: unknown[]): GrammarExampleInfo[] {
  return rows
    .filter((row): row is GrammarItemExampleRow => typeof row === 'object' && row !== null)
    .filter((row) => typeof row.sentence === 'string' && row.sentence.trim().length > 0)
    .sort((left, right) => {
      if (Boolean(left.is_primary) !== Boolean(right.is_primary)) {
        return left.is_primary ? -1 : 1
      }

      return (right.quality_score ?? 0) - (left.quality_score ?? 0)
    })
    .map((row) => ({
      sentence: row.sentence as string,
      translation: row.translation ?? null,
      note: row.note ?? null,
      scene: row.scene ?? null,
      isPrimary: row.is_primary === true,
    }))
}

function normalizeGrammarTemplates(rows: unknown[]): GrammarTemplateInfo[] {
  return rows
    .filter((row): row is GrammarItemTemplateRow => typeof row === 'object' && row !== null)
    .filter(
      (row) =>
        typeof row.label === 'string' &&
        row.label.trim().length > 0 &&
        typeof row.template === 'string' &&
        row.template.trim().length > 0
    )
    .sort((left, right) => (left.position ?? 0) - (right.position ?? 0))
    .map((row, index) => ({
      label: row.label as string,
      template: row.template as string,
      slotHints: normalizeStringArray(row.slot_hints),
      exampleSentence: row.example_sentence ?? null,
      exampleTranslation: row.example_translation ?? null,
      position: typeof row.position === 'number' ? row.position : index + 1,
    }))
}

function normalizeGrammarContrasts(
  rows: unknown[],
  titlesById: Map<string, { slug: string; title: string }>
): GrammarContrastInfo[] {
  return rows
    .filter((row): row is GrammarItemContrastRow => typeof row === 'object' && row !== null)
    .filter(
      (row) =>
        typeof row.contrast_item_id === 'string' &&
        typeof row.note === 'string' &&
        row.note.trim().length > 0
    )
    .sort((left, right) => (left.position ?? 0) - (right.position ?? 0))
    .map((row) => {
      const linked = titlesById.get(row.contrast_item_id as string)
      if (!linked) {
        return null
      }

      return {
        slug: linked.slug,
        title: linked.title,
        note: row.note as string,
      }
    })
    .filter((item): item is GrammarContrastInfo => item !== null)
}

function buildGrammarStudyInfo(
  row: GrammarItemRow,
  examples: GrammarExampleInfo[],
  templates: GrammarTemplateInfo[],
  contrasts: GrammarContrastInfo[]
): GrammarStudyInfo {
  return {
    kind: 'grammar',
    slug: row.slug,
    title: row.title,
    shortLabel: row.short_label ?? null,
    pattern: row.pattern,
    family: row.family,
    familyLabel: getGrammarFamilyLabel(row.family),
    subtype: row.subtype ?? null,
    anchor: row.anchor ?? null,
    coreExplanation: row.core_explanation,
    usageNote: row.usage_note ?? null,
    usageRegister: row.usage_register ?? null,
    sceneTags: normalizeStringArray(row.scene_tags),
    slotSchema: normalizeGrammarSlotSchema(row.slot_schema),
    commonErrors: normalizeStringArray(row.common_errors),
    contrasts,
    examples,
    templates,
  }
}

function normalizeStudyBatchItem(
  value: unknown,
  overrides: Pick<StudyBatchWordItem, 'isNew' | 'priorityReason'>
): StudyBatchWordItem | null {
  if (!isUserWordRecord(value)) {
    return null
  }

  const words = normalizeWordInfo(value.words)
  if (!words) {
    return null
  }

  return {
    kind: 'word',
    id: value.id,
    userWordId: value.id,
    word_id: value.word_id,
    words,
    isNew: overrides.isNew,
    priorityReason: overrides.priorityReason,
  }
}

function normalizeNewStudyBatchItem(
  value: unknown,
  overrides: Pick<StudyBatchWordItem, 'isNew' | 'priorityReason'>
): StudyBatchWordItem | null {
  if (!isWordRecord(value)) {
    return null
  }

  const words = normalizeWordInfo(value)
  if (!words) {
    return null
  }

  return {
    kind: 'word',
    id: `new:${value.id}`,
    userWordId: null,
    word_id: value.id,
    words,
    isNew: overrides.isNew,
    priorityReason: overrides.priorityReason,
  }
}

function toPostgrestInList(ids: string[]) {
  const safeIds = ids.map((id) => id.replace(/"/g, '')).filter(Boolean)
  return `(${safeIds.map((id) => `"${id}"`).join(',')})`
}

async function getLibraryBySlug(supabase: SupabaseClient, librarySlug: string) {
  const normalizedSlug = normalizeLibrarySlug(librarySlug)
  if (normalizedSlug === 'all') {
    return null
  }

  const { data, error } = await supabase
    .from('libraries')
    .select('id, slug, name, description, source_type, content_type')
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
  const cached = getActiveTimedCacheValue(libraryWordIdsCache.get(libraryId))
  if (cached) {
    return cached
  }

  const collectedWordIds: string[] = []
  let from = 0

  while (true) {
    const to = from + SUPABASE_PAGE_SIZE - 1
    const { data, error } = await supabase
      .from('library_words')
      .select('word_id')
      .eq('library_id', libraryId)
      .order('position', { ascending: true, nullsFirst: false })
      .range(from, to)

    if (error) {
      if (!isMissingLibrariesTableError(error)) {
        console.error('Failed to load library words:', error)
      }
      return [] as string[]
    }

    const rows = (data ?? []) as LibraryWordRow[]
    collectedWordIds.push(
      ...rows
        .map((row) => row.word_id)
        .filter((wordId): wordId is string => typeof wordId === 'string')
    )

    if (rows.length < SUPABASE_PAGE_SIZE) {
      break
    }

    from += SUPABASE_PAGE_SIZE
  }

  return setTimedCacheValue(
    libraryWordIdsCache,
    libraryId,
    collectedWordIds,
    STUDY_LIBRARY_MEMBERSHIP_CACHE_TTL_MS
  )
}

async function getLibraryGrammarItemIds(supabase: SupabaseClient, libraryId: string) {
  const cached = getActiveTimedCacheValue(libraryGrammarItemIdsCache.get(libraryId))
  if (cached) {
    return cached
  }

  const collectedItemIds: string[] = []
  let from = 0

  while (true) {
    const to = from + SUPABASE_PAGE_SIZE - 1
    const { data, error } = await supabase
      .from('library_grammar_items')
      .select('grammar_item_id')
      .eq('library_id', libraryId)
      .order('position', { ascending: true, nullsFirst: false })
      .range(from, to)

    if (error) {
      if (!isMissingLibrariesTableError(error)) {
        console.error('Failed to load library grammar items:', error)
      }
      return [] as string[]
    }

    const rows = (data ?? []) as Array<{ grammar_item_id?: string | null }>
    collectedItemIds.push(
      ...rows
        .map((row) => row.grammar_item_id)
        .filter((grammarItemId): grammarItemId is string => typeof grammarItemId === 'string')
    )

    if (rows.length < SUPABASE_PAGE_SIZE) {
      break
    }

    from += SUPABASE_PAGE_SIZE
  }

  return setTimedCacheValue(
    libraryGrammarItemIdsCache,
    libraryId,
    collectedItemIds,
    STUDY_LIBRARY_MEMBERSHIP_CACHE_TTL_MS
  )
}

function isUserGrammarItemRecord(value: unknown): value is UserGrammarItemRecord {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const record = value as UserGrammarItemRecord
  return (
    typeof record.id === 'string' &&
    typeof record.grammar_item_id === 'string' &&
    typeof record.repetitions === 'number' &&
    typeof record.interval === 'number' &&
    typeof record.ease_factor === 'number'
  )
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

async function touchUserLibraryGrammarItems(
  supabase: SupabaseClient,
  userId: string,
  libraryId: string,
  grammarItemIds: string[]
) {
  if (grammarItemIds.length === 0) {
    return
  }

  const now = new Date().toISOString()
  const payload = Array.from(new Set(grammarItemIds)).map((grammarItemId) => ({
    user_id: userId,
    library_id: libraryId,
    grammar_item_id: grammarItemId,
    introduced_at: now,
    first_studied_at: now,
    last_studied_at: now,
    source: 'scheduled',
  }))

  const { error } = await supabase
    .from('user_library_grammar_items')
    .upsert(payload, { onConflict: 'user_id,library_id,grammar_item_id' })

  if (error) {
    console.error('Failed to touch user library grammar items:', error)
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

async function touchLibraryGrammarProgress(
  supabase: SupabaseClient,
  userId: string,
  grammarItemId: string,
  librarySlug?: string | null
) {
  const library = await getLibraryBySlug(supabase, librarySlug ?? 'all')
  if (!library) {
    return
  }

  await ensureUserLibraryPlan(supabase, userId, library.id)
  await touchUserLibraryGrammarItems(supabase, userId, library.id, [grammarItemId])
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

function buildGrammarFeedbackForStorage(
  evaluation: EvaluationResult,
  originalSentence: string
) {
  const sections = [
    evaluation.patternMatched
      ? '【结构命中】已命中目标句法结构。'
      : '【结构命中】本次没有清晰命中目标句法结构。',
    `【原句】${originalSentence}`,
    evaluation.correctedSentence ? `【建议改写】${evaluation.correctedSentence}` : '',
    evaluation.praise ? `【点评】${evaluation.praise}` : '',
    evaluation.suggestion ? `【建议】${evaluation.suggestion}` : '',
  ]

  return sections.filter(Boolean).join('\n\n')
}

function getNextFailureCounters(
  current: FailureCounterRecord,
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

async function getStartedWordIds(
  supabase: SupabaseClient,
  userId: string,
  candidateWordIds?: string[]
) {
  const startedWordIds = new Set<string>()
  const tables = ['user_words', 'sentences', 'user_library_words'] as const

  for (const table of tables) {
    if (candidateWordIds && candidateWordIds.length > 0) {
      for (let from = 0; from < candidateWordIds.length; from += SUPABASE_PAGE_SIZE) {
        const chunk = candidateWordIds.slice(from, from + SUPABASE_PAGE_SIZE)
        if (chunk.length === 0) {
          continue
        }

        const { data, error } = await supabase
          .from(table)
          .select('word_id')
          .eq('user_id', userId)
          .in('word_id', chunk)

        if (error) {
          console.error(`Failed to load started word ids from ${table}:`, error)
          continue
        }

        for (const row of (data ?? []) as Array<{ word_id?: string | null }>) {
          if (typeof row.word_id === 'string') {
            startedWordIds.add(row.word_id)
          }
        }
      }

      continue
    }

    for (let from = 0; ; from += SUPABASE_PAGE_SIZE) {
      const to = from + SUPABASE_PAGE_SIZE - 1
      const { data, error } = await supabase
        .from(table)
        .select('word_id')
        .eq('user_id', userId)
        .range(from, to)

      if (error) {
        console.error(`Failed to load started word ids from ${table}:`, error)
        break
      }

      const rows = (data ?? []) as Array<{ word_id?: string | null }>
      for (const row of rows) {
        if (typeof row.word_id === 'string') {
          startedWordIds.add(row.word_id)
        }
      }

      if (rows.length < SUPABASE_PAGE_SIZE) {
        break
      }
    }
  }

  return startedWordIds
}

async function getDueWordIds(
  supabase: SupabaseClient,
  userId: string,
  today: string
) {
  const dueWordIds = new Set<string>()

  for (let from = 0; ; from += SUPABASE_PAGE_SIZE) {
    const to = from + SUPABASE_PAGE_SIZE - 1
      const { data, error } = await supabase
        .from('user_words')
        .select('word_id')
        .eq('user_id', userId)
        .not('last_reviewed_at', 'is', null)
        .lte('next_review_date', today)
        .range(from, to)

    if (error) {
      console.error('Failed to load due word ids:', error)
      break
    }

    const rows = (data ?? []) as Array<{ word_id?: string | null }>
    for (const row of rows) {
      if (typeof row.word_id === 'string') {
        dueWordIds.add(row.word_id)
      }
    }

    if (rows.length < SUPABASE_PAGE_SIZE) {
      break
    }
  }

  return dueWordIds
}

async function attachWordToUser(
  wordId: string,
  reviewDate: string | null,
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

async function attachGrammarItemToUser(
  grammarItemId: string,
  reviewDate: string,
  supabase: SupabaseClient,
  userId: string,
  libraryId?: string | null
) {
  const { data: inserted, error: insertError } = await supabase
    .from('user_grammar_items')
    .insert({
      user_id: userId,
      grammar_item_id: grammarItemId,
      interval: 0,
      ease_factor: 2.5,
      repetitions: 0,
      next_review_date: reviewDate,
      is_favorite: false,
    })
    .select('*')
    .maybeSingle()

  if (inserted) {
    if (libraryId) {
      await ensureUserLibraryPlan(supabase, userId, libraryId)
      await touchUserLibraryGrammarItems(supabase, userId, libraryId, [grammarItemId])
    }
    return inserted
  }

  if (insertError && insertError.code !== '23505') {
    throw insertError
  }

  const { data: existing, error: existingError } = await supabase
    .from('user_grammar_items')
    .select('*')
    .eq('user_id', userId)
    .eq('grammar_item_id', grammarItemId)
    .maybeSingle()

  if (existingError) {
    throw existingError
  }

  if (existing && libraryId) {
    await ensureUserLibraryPlan(supabase, userId, libraryId)
    await touchUserLibraryGrammarItems(supabase, userId, libraryId, [grammarItemId])
  }

  return existing
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
  return loadDueStudyItems({
    supabase,
    userId,
    tag,
    today,
    skippedWordIds,
    preferredWordIds,
    batchSize,
    studyView,
    libraryWordIds,
    deps: {
      getRecentFailureSince,
      toPostgrestInList,
      normalizeStudyBatchItem,
      logStudyPerformance,
    },
  })
}

async function getNewStudyItems(
  supabase: SupabaseClient,
  userId: string,
  tag: string,
  skippedWordIds: string[],
  preferredWordIds: string[],
  batchSize: number,
  libraryId: string | null = null,
  libraryWordIds: string[] = []
) {
  return loadNewStudyItems({
    supabase,
    userId,
    tag,
    skippedWordIds,
    preferredWordIds,
    batchSize,
    libraryId,
    libraryWordIds,
    deps: {
      getStartedWordIds,
      toPostgrestInList,
      normalizeNewStudyBatchItem,
      logStudyPerformance,
    },
  })
}

async function hydrateStudyBatchWordDetails(
  supabase: SupabaseClient,
  batch: StudyBatchWordItem[]
): Promise<StudyBatchWordItem[]> {
  return loadHydratedStudyBatchWordDetails({
    supabase,
    batch,
    deps: {
      normalizeStudyWordProfile,
      normalizeStudyWordExamples,
      isMissingWordProfileTableError,
      logStudyPerformance,
    },
  })
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

async function getGrammarLearningHistory(
  supabase: SupabaseClient,
  userId: string,
  grammarItemId: string
) {
  const { data: pastRecords } = await supabase
    .from('grammar_attempts')
    .select('original_text')
    .eq('user_id', userId)
    .eq('grammar_item_id', grammarItemId)
    .order('created_at', { ascending: false })
    .limit(5)

  return (pastRecords ?? [])
    .map((record) => (record as PastSentenceRow).original_text)
    .filter((value): value is string => typeof value === 'string')
    .reverse()
}

async function loadGrammarStudySupportData(
  supabase: SupabaseClient,
  grammarItemIds: string[]
) {
  const emptyMaps = {
    examplesByItemId: new Map<string, GrammarExampleInfo[]>(),
    templatesByItemId: new Map<string, GrammarTemplateInfo[]>(),
    contrastsByItemId: new Map<string, GrammarContrastInfo[]>(),
  }

  if (grammarItemIds.length === 0) {
    return emptyMaps
  }

  const [{ data: exampleRows, error: examplesError }, { data: templateRows, error: templatesError }, { data: contrastRows, error: contrastsError }] =
    await Promise.all([
      supabase
        .from('grammar_item_examples')
        .select('grammar_item_id, sentence, translation, note, scene, is_primary, quality_score')
        .in('grammar_item_id', grammarItemIds),
      supabase
        .from('grammar_item_templates')
        .select(
          'grammar_item_id, label, template, slot_hints, example_sentence, example_translation, position'
        )
        .in('grammar_item_id', grammarItemIds),
      supabase
        .from('grammar_item_contrasts')
        .select('grammar_item_id, contrast_item_id, note, position')
        .in('grammar_item_id', grammarItemIds),
    ])

  if (examplesError) {
    console.error('Failed to load grammar examples:', examplesError)
  }

  if (templatesError) {
    console.error('Failed to load grammar templates:', templatesError)
  }

  if (contrastsError) {
    console.error('Failed to load grammar contrasts:', contrastsError)
  }

  const contrastRowsList = (contrastRows ?? []) as GrammarItemContrastRow[]
  const contrastItemIds = Array.from(
    new Set(
      contrastRowsList
        .map((row) => row.contrast_item_id)
        .filter((grammarItemId): grammarItemId is string => typeof grammarItemId === 'string')
    )
  )

  const contrastTitleMap = new Map<string, { slug: string; title: string }>()
  if (contrastItemIds.length > 0) {
    const { data: contrastItems, error: contrastItemsError } = await supabase
      .from('grammar_items')
      .select('id, slug, title')
      .in('id', contrastItemIds)

    if (contrastItemsError) {
      console.error('Failed to load grammar contrast item titles:', contrastItemsError)
    } else {
      for (const row of (contrastItems ?? []) as Array<{
        id?: string | null
        slug?: string | null
        title?: string | null
      }>) {
        if (
          typeof row.id === 'string' &&
          typeof row.slug === 'string' &&
          typeof row.title === 'string'
        ) {
          contrastTitleMap.set(row.id, {
            slug: row.slug,
            title: row.title,
          })
        }
      }
    }
  }

  const examplesByItemId = new Map<string, GrammarExampleInfo[]>()
  const templatesByItemId = new Map<string, GrammarTemplateInfo[]>()
  const contrastsByItemId = new Map<string, GrammarContrastInfo[]>()

  for (const grammarItemId of grammarItemIds) {
    examplesByItemId.set(
      grammarItemId,
      normalizeGrammarExamples(
        ((exampleRows ?? []) as GrammarItemExampleRow[]).filter(
          (example) => example.grammar_item_id === grammarItemId
        )
      )
    )
    templatesByItemId.set(
      grammarItemId,
      normalizeGrammarTemplates(
        ((templateRows ?? []) as GrammarItemTemplateRow[]).filter(
          (template) => template.grammar_item_id === grammarItemId
        )
      )
    )
    contrastsByItemId.set(
      grammarItemId,
      normalizeGrammarContrasts(
        contrastRowsList.filter((contrast) => contrast.grammar_item_id === grammarItemId),
        contrastTitleMap
      )
    )
  }

  return {
    examplesByItemId,
    templatesByItemId,
    contrastsByItemId,
  }
}

function getGrammarPriorityReason(
  item: Pick<UserGrammarItemRecord, 'next_review_date' | 'last_score' | 'consecutive_failures'>,
  today: string
): StudyPriorityReason {
  const nextReviewDate = sanitizeText(item.next_review_date)
  const consecutiveFailures = item.consecutive_failures ?? 0
  const lastScore = item.last_score ?? 100

  if (nextReviewDate && nextReviewDate < today) {
    return consecutiveFailures >= 3 ? 'leech_due' : 'overdue'
  }

  if (lastScore < 75 || consecutiveFailures >= 2) {
    return 'weak_due'
  }

  if (nextReviewDate && nextReviewDate <= today) {
    return 'due'
  }

  return 'new'
}

async function getStartedGrammarItemIdsForLibrary(
  supabase: SupabaseClient,
  userId: string,
  libraryGrammarItemIds: string[]
) {
  const startedIds = new Set<string>()
  if (libraryGrammarItemIds.length === 0) {
    return startedIds
  }

  const [userGrammarRows, grammarAttemptRows, libraryProgressRows] = await Promise.all([
    supabase
      .from('user_grammar_items')
      .select('grammar_item_id')
      .eq('user_id', userId)
      .in('grammar_item_id', libraryGrammarItemIds),
    supabase
      .from('grammar_attempts')
      .select('grammar_item_id')
      .eq('user_id', userId)
      .in('grammar_item_id', libraryGrammarItemIds),
    supabase
      .from('user_library_grammar_items')
      .select('grammar_item_id')
      .eq('user_id', userId)
      .in('grammar_item_id', libraryGrammarItemIds),
  ])

  for (const response of [userGrammarRows, grammarAttemptRows, libraryProgressRows]) {
    if (response.error) {
      console.error('Failed to load started grammar item ids:', response.error)
      continue
    }

    const rows = (response.data ?? []) as Array<{ grammar_item_id?: string | null }>
    for (const row of rows) {
      if (typeof row.grammar_item_id === 'string') {
        startedIds.add(row.grammar_item_id)
      }
    }
  }

  return startedIds
}

async function loadGrammarReviewRows({
  supabase,
  userId,
  libraryGrammarItemIds,
  skippedItemIds,
  studyView,
  today,
  limit,
}: {
  supabase: SupabaseClient
  userId: string
  libraryGrammarItemIds: string[]
  skippedItemIds: string[]
  studyView: StudyView
  today: string
  limit: number
}) {
  if (libraryGrammarItemIds.length === 0) {
    return [] as UserGrammarBatchRow[]
  }

  let query = supabase
    .from('user_grammar_items')
    .select(
      'id, grammar_item_id, repetitions, interval, ease_factor, next_review_date, last_score, last_reviewed_at, consecutive_failures, lapse_count, is_favorite, grammar_items!inner(id, slug, title, short_label, pattern, family, subtype, anchor, core_explanation, usage_note, usage_register, scene_tags, slot_schema, common_errors)'
    )
    .eq('user_id', userId)
    .in('grammar_item_id', libraryGrammarItemIds)

  if (skippedItemIds.length > 0) {
    query = query.not('grammar_item_id', 'in', toPostgrestInList(skippedItemIds))
  }

  switch (studyView) {
    case 'favorites':
      query = query
        .eq('is_favorite', true)
        .order('last_reviewed_at', { ascending: true, nullsFirst: true })
        .order('created_at', { ascending: true, nullsFirst: true })
      break
    case 'weak':
      query = query
        .or('last_score.lt.75,consecutive_failures.gte.2')
        .order('last_score', { ascending: true, nullsFirst: false })
        .order('consecutive_failures', { ascending: false, nullsFirst: false })
        .order('last_reviewed_at', { ascending: true, nullsFirst: true })
      break
    case 'recent_failures':
      query = query
        .or('last_score.lt.60,consecutive_failures.gte.1')
        .gte('last_reviewed_at', getRecentFailureSince())
        .order('last_reviewed_at', { ascending: false, nullsFirst: false })
        .order('last_score', { ascending: true, nullsFirst: false })
      break
    case 'all':
    default:
      query = query
        .lte('next_review_date', today)
        .order('next_review_date', { ascending: true })
        .order('consecutive_failures', { ascending: false, nullsFirst: false })
        .order('last_reviewed_at', { ascending: true, nullsFirst: true })
      break
  }

  const { data, error } = await query.limit(limit)
  if (error) {
    console.error('Failed to load grammar review rows:', error)
    return [] as UserGrammarBatchRow[]
  }

  return (data ?? []) as UserGrammarBatchRow[]
}

async function loadGrammarStudyBatch({
  supabase,
  userId,
  library,
  skippedItemIds,
  batchSize,
  studyView,
  today,
}: {
  supabase: SupabaseClient
  userId: string
  library: LibraryRow
  skippedItemIds: string[]
  batchSize: number
  studyView: StudyView
  today: string
}): Promise<StudyBatchGrammarItem[]> {
  const libraryGrammarItemIds = await getLibraryGrammarItemIds(supabase, library.id)
  if (libraryGrammarItemIds.length === 0) {
    return []
  }

  const targetSize = Math.max(batchSize * 4, 24)
  const reviewRows = await loadGrammarReviewRows({
    supabase,
    userId,
    libraryGrammarItemIds,
    skippedItemIds,
    studyView,
    today,
    limit: targetSize,
  })

  const normalizedReviewRows = reviewRows
    .map((row) => {
      const grammar = normalizeGrammarItemRow(row.grammar_items)
      if (!grammar) {
        return null
      }

      return {
        userGrammarItemId: row.id,
        grammarItemId: row.grammar_item_id,
        grammar,
        priorityReason: getGrammarPriorityReason(row, today),
      }
    })
    .filter(
      (
        row
      ): row is {
        userGrammarItemId: string
        grammarItemId: string
        grammar: GrammarItemRow
        priorityReason: StudyPriorityReason
      } => row !== null
    )

  const reviewQueue =
    studyView === 'all'
      ? normalizedReviewRows.filter((row) => row.priorityReason !== 'new')
      : normalizedReviewRows

  const selectedReviewRows = reviewQueue.slice(0, batchSize)
  const excludedItemIds = new Set([
    ...skippedItemIds,
    ...selectedReviewRows.map((row) => row.grammarItemId),
  ])

  let newRows: Array<{
    grammarItemId: string
    grammar: GrammarItemRow
  }> = []

  if (studyView === 'all' && selectedReviewRows.length < batchSize) {
    const startedGrammarItemIds = await getStartedGrammarItemIdsForLibrary(
      supabase,
      userId,
      libraryGrammarItemIds
    )
    const candidateNewIds = libraryGrammarItemIds.filter(
      (grammarItemId: string) =>
        !startedGrammarItemIds.has(grammarItemId) && !excludedItemIds.has(grammarItemId)
    )

    if (candidateNewIds.length > 0) {
      const newQuery = supabase
        .from('library_grammar_items')
        .select(
          'grammar_item_id, position, grammar_items!inner(id, slug, title, short_label, pattern, family, subtype, anchor, core_explanation, usage_note, usage_register, scene_tags, slot_schema, common_errors)'
        )
        .eq('library_id', library.id)
        .in('grammar_item_id', candidateNewIds)
        .order('position', { ascending: true, nullsFirst: false })
        .limit(batchSize - selectedReviewRows.length)

      const { data, error } = await newQuery
      if (error) {
        console.error('Failed to load new grammar study rows:', error)
      } else {
        newRows = ((data ?? []) as LibraryGrammarItemRow[])
          .map((row) => {
            const grammar = normalizeGrammarItemRow(row.grammar_items)
            const grammarItemId =
              typeof row.grammar_item_id === 'string'
                ? row.grammar_item_id
                : grammar?.id ?? null
            if (!grammar || !grammarItemId) {
              return null
            }

            return {
              grammarItemId,
              grammar,
            }
          })
          .filter(
            (row): row is { grammarItemId: string; grammar: GrammarItemRow } => row !== null
          )
      }
    }
  }

  const combinedRows = [
    ...selectedReviewRows.map((row) => ({
      kind: 'review' as const,
      userGrammarItemId: row.userGrammarItemId,
      grammarItemId: row.grammarItemId,
      grammar: row.grammar,
      priorityReason: row.priorityReason,
    })),
    ...newRows.map((row) => ({
      kind: 'new' as const,
      userGrammarItemId: null,
      grammarItemId: row.grammarItemId,
      grammar: row.grammar,
      priorityReason: 'new' as StudyPriorityReason,
    })),
  ]

  if (combinedRows.length === 0) {
    return []
  }

  const grammarItemIds = combinedRows.map((row) => row.grammarItemId)
  const { examplesByItemId, templatesByItemId, contrastsByItemId } =
    await loadGrammarStudySupportData(supabase, grammarItemIds)

  void ensureUserLibraryPlan(supabase, userId, library.id).catch((error) => {
    console.error('Failed to ensure user library plan during grammar batch load:', error)
  })

  return combinedRows.map((row) => ({
    kind: 'grammar',
    id: row.grammarItemId,
    userGrammarItemId: row.userGrammarItemId,
    grammar_item_id: row.grammarItemId,
    grammar: buildGrammarStudyInfo(
      row.grammar,
      examplesByItemId.get(row.grammarItemId) ?? [],
      templatesByItemId.get(row.grammarItemId) ?? [],
      contrastsByItemId.get(row.grammarItemId) ?? []
    ),
    isNew: row.kind === 'new',
    priorityReason: row.priorityReason,
  }))
}

export async function getStudyLibraries(): Promise<StudyLibrary[]> {
  const { supabase, user } = await requireActionSession()
  return loadStudyLibraries({
    supabase,
    userId: user.id,
    today: getTodayDateString(),
    legacyLibraryOptions: LEGACY_LIBRARY_OPTIONS,
    deps: {
      getStartedWordIds,
      getDueWordIds,
      getLibraryWordIds,
      isMissingLibrariesTableError,
      isMissingWordProfileTableError,
      logStudyPerformance,
    },
  })
}

export async function getStudyLibraryOptions(): Promise<StudyLibrary[]> {
  const { supabase, user } = await requireActionSession()
  const cacheKey = user.id
  const cached = getActiveTimedCacheValue(studyLibraryOptionsCache.get(cacheKey))
  if (cached) {
    return cached
  }

  const options = await loadStudyLibraryOptions({
    supabase,
    legacyLibraryOptions: LEGACY_LIBRARY_OPTIONS,
    deps: {
      isMissingLibrariesTableError,
    },
  })

  return setTimedCacheValue(
    studyLibraryOptionsCache,
    cacheKey,
    options,
    STUDY_LIBRARY_OPTIONS_CACHE_TTL_MS
  )
}

export async function getStudyEnrichmentProgress(
  libraries: StudyLibrary[] = []
): Promise<StudyEnrichmentProgress[]> {
  const { supabase } = await requireActionSession()
  return loadStudyEnrichmentProgress({
    supabase,
    libraries,
    deps: {
      getLibraryWordIds,
      isMissingWordProfileTableError,
      logStudyPerformance,
    },
  })
}

export async function getStudySidebarData(): Promise<{
  libraries: StudyLibrary[]
  enrichmentProgress: StudyEnrichmentProgress[]
}> {
  const { supabase, user } = await requireActionSession()
  const cacheKey = `${user.id}:${getTodayDateString()}`
  const cached = getActiveTimedCacheValue(studySidebarDataCache.get(cacheKey))
  if (cached) {
    return cached
  }

  const sidebarData = await loadStudySidebarData({
    supabase,
    userId: user.id,
    today: getTodayDateString(),
    legacyLibraryOptions: LEGACY_LIBRARY_OPTIONS,
    deps: {
      getStartedWordIds,
      getDueWordIds,
      getLibraryWordIds,
      isMissingLibrariesTableError,
      isMissingWordProfileTableError,
      logStudyPerformance,
    },
  })

  return setTimedCacheValue(
    studySidebarDataCache,
    cacheKey,
    sidebarData,
    STUDY_SIDEBAR_DATA_CACHE_TTL_MS
  )
}

export async function generateSentenceHelp(
  wordId: string,
  word: string,
  definition: string,
  tags?: string,
  example?: string | null,
  exampleCandidates: string[] = []
): Promise<SentenceHelpResult> {
  const apiKey = process.env.OPENAI_HINT_API_KEY || process.env.OPENAI_API_KEY
  const apiBase =
    process.env.OPENAI_HINT_API_BASE ||
    process.env.OPENAI_API_BASE ||
    'https://api.openai.com/v1'
  const apiType = normalizeOpenAiApiType(
    process.env.OPENAI_HINT_API_TYPE || process.env.OPENAI_API_TYPE
  )
  const model = process.env.OPENAI_HINT_MODEL || process.env.OPENAI_MODEL || 'gpt-5.2'
  const providerLabel = getModelProviderLabel(apiBase)
  const remoteModelLabel = formatModelLabel(model, apiBase)
  const fallbackItems = buildFallbackSentenceHelpItemsSafe({
    word,
    definition,
    exampleCandidates: [example, ...exampleCandidates],
  })
  const requestUrl = getChatCompletionsUrl(apiBase, apiType)
  const structuredJsonMode = shouldUseStructuredJsonOutputForSentenceHelp(apiType, apiBase)

  if (!apiKey) {
    return buildSentenceHelpFallbackResultSafe({
      reason: 'no_hint_config',
      remoteModelLabel,
      providerLabel: 'Local',
      modelName: null,
      fallbackItems,
    })
  }

  try {
    const { supabase, user } = await requireActionSession()
    const learningHistory = await getWordLearningHistory(supabase, user.id, wordId)
    const response = await fetch(requestUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(
        buildTextGenerationRequest({
          apiType,
          model,
          temperature: 0.4,
          jsonMode: structuredJsonMode,
          maxOutputTokens: SENTENCE_HELP_MAX_OUTPUT_TOKENS,
          systemPrompt: [
            'You help a Chinese learner make a sentence with one target English word.',
            'Return JSON only.',
            'Generate exactly 3 short, natural example sentences that use the exact target word unchanged.',
            'The sentences must clearly show the meaning in context, not talk about the word itself.',
            'Keep them beginner-friendly but useful enough to adapt.',
            'Each item must include:',
            '- sentence: an English sentence.',
            '- cue: one concise coaching tip in Simplified Chinese explaining why this sentence works or how to adapt it.',
            'Do not wrap the JSON in markdown code fences.',
            'Do not add any explanation before or after the JSON.',
            'Avoid fake dictionary-style lines and avoid repetitive sentence frames.',
            'Schema: {"hints":[{"sentence":"...","cue":"..."}]}',
          ].join('\n'),
          userPrompt: [
            `Target word: ${word}`,
            `Definition: ${definition || 'N/A'}`,
            `Word list tag: ${tags || 'General'}`,
            `Dictionary examples:\n${[example, ...exampleCandidates].filter(Boolean).join('\n') || 'N/A'}`,
            learningHistory.length > 0
              ? `Past learner sentences:\n${learningHistory.map((item, index) => `${index + 1}. ${item}`).join('\n')}`
              : 'Past learner sentences: none',
            'Generate better sentence hints that are specific to the meaning.',
          ].join('\n\n'),
        })
      ),
    })

    if (!response.ok) {
      const requestId = getProviderRequestId(response.headers)
      const errorBodyPreview = (await response.text().catch(() => '')).slice(0, 1200)

      console.error('Sentence help request failed:', {
        wordId,
        word,
        remoteModelLabel,
        providerLabel,
        apiType,
        requestUrl,
        structuredJsonMode,
        status: response.status,
        statusText: response.statusText,
        requestId,
        errorBodyPreview,
      })

      return buildSentenceHelpFallbackResultSafe({
        reason: 'request_failed',
        remoteModelLabel,
        providerLabel,
        modelName: model,
        fallbackItems,
      })
    }

    const data = await response.json()
    const requestId = getProviderRequestId(response.headers)
    const responseShape = summarizeOpenAiPayloadShape(data)
    const content = extractTextFromOpenAiResponse(data)
    if (!content) {
      console.error('Sentence help response had no extractable content:', {
        wordId,
        word,
        remoteModelLabel,
        providerLabel,
        apiType,
        requestUrl,
        structuredJsonMode,
        status: response.status,
        requestId,
        responseShape,
      })

      return buildSentenceHelpFallbackResultSafe({
        reason: 'empty_content',
        remoteModelLabel,
        providerLabel,
        modelName: model,
        fallbackItems,
      })
    }

    let parsed: SentenceHelpPayload
    try {
      parsed = parseSentenceHelpPayload(content)
    } catch (error) {
      console.error('Failed to parse sentence help JSON:', {
        wordId,
        word,
        remoteModelLabel,
        providerLabel,
        apiType,
        requestUrl,
        structuredJsonMode,
        status: response.status,
        requestId,
        responseShape,
        error,
        rawContentPreview: content.slice(0, 1200),
      })
      return buildSentenceHelpFallbackResultSafe({
        reason: 'parse_error',
        remoteModelLabel,
        providerLabel,
        modelName: model,
        fallbackItems,
      })
    }

    const normalized = normalizeSentenceHelpSafe(parsed, word)

    if (normalized.length === 0) {
      console.error('Sentence help response failed validation:', {
        wordId,
        word,
        remoteModelLabel,
        providerLabel,
        apiType,
        requestUrl,
        structuredJsonMode,
        status: response.status,
        requestId,
        responseShape,
        parsedShape: summarizeSentenceHelpPayloadForLogs(parsed),
        rawContentPreview: content.slice(0, 1200),
      })

      return buildSentenceHelpFallbackResultSafe({
        reason: 'validation_failed',
        remoteModelLabel,
        providerLabel,
        modelName: model,
        fallbackItems,
      })
    }

    return {
      items: normalized,
      sourceType: 'ai',
      providerLabel,
      modelName: model,
      fallbackReason: null,
      sourceLabel: `来源：${remoteModelLabel}`,
    }
  } catch (error) {
    console.error('Failed to generate sentence help:', {
      wordId,
      word,
      remoteModelLabel,
      providerLabel,
      apiType,
      requestUrl,
      structuredJsonMode,
      error,
    })
    return buildSentenceHelpFallbackResultSafe({
      reason: 'request_exception',
      remoteModelLabel,
      providerLabel,
      modelName: model,
      fallbackItems,
    })
  }
}

export async function generateGrammarSentenceHelp(
  grammarItemId: string,
  title: string,
  pattern: string,
  coreExplanation: string,
  usageNote?: string | null,
  sceneTags: string[] = [],
  templates: GrammarTemplateInfo[] = [],
  examples: GrammarExampleInfo[] = []
): Promise<SentenceHelpResult> {
  const apiKey = process.env.OPENAI_HINT_API_KEY || process.env.OPENAI_API_KEY
  const apiBase =
    process.env.OPENAI_HINT_API_BASE ||
    process.env.OPENAI_API_BASE ||
    'https://api.openai.com/v1'
  const apiType = normalizeOpenAiApiType(
    process.env.OPENAI_HINT_API_TYPE || process.env.OPENAI_API_TYPE
  )
  const model = process.env.OPENAI_HINT_MODEL || process.env.OPENAI_MODEL || 'gpt-5.2'
  const providerLabel = getModelProviderLabel(apiBase)
  const remoteModelLabel = formatModelLabel(model, apiBase)
  const fallbackItems = buildGrammarFallbackSentenceHelpItemsSafe({
    examples,
    templates,
  })
  const requestUrl = getChatCompletionsUrl(apiBase, apiType)
  const structuredJsonMode = shouldUseStructuredJsonOutputForSentenceHelp(apiType, apiBase)

  if (!apiKey) {
    return buildSentenceHelpFallbackResultSafe({
      reason: 'no_hint_config',
      remoteModelLabel,
      providerLabel: 'Local',
      modelName: null,
      fallbackItems,
    })
  }

  try {
    const { supabase, user } = await requireActionSession()
    const learningHistory = await getGrammarLearningHistory(supabase, user.id, grammarItemId)
    const response = await fetch(requestUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(
        buildTextGenerationRequest({
          apiType,
          model,
          temperature: 0.4,
          jsonMode: structuredJsonMode,
          maxOutputTokens: SENTENCE_HELP_MAX_OUTPUT_TOKENS,
          systemPrompt: [
            'You help a Chinese learner write one sentence with a target English grammar pattern.',
            'Return JSON only.',
            'Generate exactly 3 short, natural example sentences that clearly use the target pattern.',
            'The sentences must sound like something a learner can adapt, not like grammar notes.',
            'Each item must include:',
            '- sentence: an English sentence.',
            '- cue: one concise coaching tip in Simplified Chinese explaining why this sentence fits the pattern or how to adapt it.',
            'Do not wrap the JSON in markdown code fences.',
            'Do not add any explanation before or after the JSON.',
            'Do not output placeholders like ___ or generic meta sentences about grammar.',
            'Schema: {"hints":[{"sentence":"...","cue":"..."}]}',
          ].join('\n'),
          userPrompt: [
            `Target grammar title: ${title}`,
            `Target pattern: ${pattern}`,
            `Core explanation: ${coreExplanation}`,
            `Usage note: ${usageNote || 'N/A'}`,
            `Scene tags: ${sceneTags.join(', ') || 'N/A'}`,
            `Template examples:\n${
              templates
                .map((template, index) =>
                  `${index + 1}. ${template.template}${template.exampleSentence ? ` -> ${template.exampleSentence}` : ''}`
                )
                .join('\n') || 'N/A'
            }`,
            `Reference examples:\n${
              examples.map((example, index) => `${index + 1}. ${example.sentence}`).join('\n') || 'N/A'
            }`,
            learningHistory.length > 0
              ? `Past learner sentences:\n${learningHistory.map((item, index) => `${index + 1}. ${item}`).join('\n')}`
              : 'Past learner sentences: none',
            'Generate better sentence hints that clearly match the target pattern and are easy to adapt.',
          ].join('\n\n'),
        })
      ),
    })

    if (!response.ok) {
      const requestId = getProviderRequestId(response.headers)
      const errorBodyPreview = (await response.text().catch(() => '')).slice(0, 1200)

      console.error('Grammar sentence help request failed:', {
        grammarItemId,
        title,
        pattern,
        remoteModelLabel,
        providerLabel,
        apiType,
        requestUrl,
        structuredJsonMode,
        status: response.status,
        statusText: response.statusText,
        requestId,
        errorBodyPreview,
      })

      return buildSentenceHelpFallbackResultSafe({
        reason: 'request_failed',
        remoteModelLabel,
        providerLabel,
        modelName: model,
        fallbackItems,
      })
    }

    const data = await response.json()
    const requestId = getProviderRequestId(response.headers)
    const responseShape = summarizeOpenAiPayloadShape(data)
    const content = extractTextFromOpenAiResponse(data)
    if (!content) {
      console.error('Grammar sentence help response had no extractable content:', {
        grammarItemId,
        title,
        pattern,
        remoteModelLabel,
        providerLabel,
        apiType,
        requestUrl,
        structuredJsonMode,
        status: response.status,
        requestId,
        responseShape,
      })

      return buildSentenceHelpFallbackResultSafe({
        reason: 'empty_content',
        remoteModelLabel,
        providerLabel,
        modelName: model,
        fallbackItems,
      })
    }

    let parsed: SentenceHelpPayload
    try {
      parsed = parseSentenceHelpPayload(content)
    } catch (error) {
      console.error('Failed to parse grammar sentence help JSON:', {
        grammarItemId,
        title,
        pattern,
        remoteModelLabel,
        providerLabel,
        apiType,
        requestUrl,
        structuredJsonMode,
        status: response.status,
        requestId,
        responseShape,
        error,
        rawContentPreview: content.slice(0, 1200),
      })

      return buildSentenceHelpFallbackResultSafe({
        reason: 'parse_error',
        remoteModelLabel,
        providerLabel,
        modelName: model,
        fallbackItems,
      })
    }

    const normalized = normalizeGrammarSentenceHelpSafe(parsed, pattern)

    if (normalized.length === 0) {
      console.error('Grammar sentence help response failed validation:', {
        grammarItemId,
        title,
        pattern,
        remoteModelLabel,
        providerLabel,
        apiType,
        requestUrl,
        structuredJsonMode,
        status: response.status,
        requestId,
        responseShape,
        parsedShape: summarizeSentenceHelpPayloadForLogs(parsed),
        rawContentPreview: content.slice(0, 1200),
      })

      return buildSentenceHelpFallbackResultSafe({
        reason: 'validation_failed',
        remoteModelLabel,
        providerLabel,
        modelName: model,
        fallbackItems,
      })
    }

    return {
      items: normalized,
      sourceType: 'ai',
      providerLabel,
      modelName: model,
      fallbackReason: null,
      sourceLabel: `来源：${remoteModelLabel}`,
    }
  } catch (error) {
    console.error('Failed to generate grammar sentence help:', {
      grammarItemId,
      title,
      pattern,
      remoteModelLabel,
      providerLabel,
      apiType,
      requestUrl,
      structuredJsonMode,
      error,
    })

    return buildSentenceHelpFallbackResultSafe({
      reason: 'request_exception',
      remoteModelLabel,
      providerLabel,
      modelName: model,
      fallbackItems,
    })
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
  const apiType = normalizeOpenAiApiType(process.env.OPENAI_API_TYPE)
  const model = process.env.OPENAI_MODEL || 'gpt-5.2'

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

  const systemPrompt = buildWordSystemPrompt(word, definition, tags, learningHistory)

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 30000)

      const response = await fetch(getChatCompletionsUrl(apiBase, apiType), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(
        buildTextGenerationRequest({
          apiType,
          model,
          systemPrompt,
          userPrompt: buildEvaluationUserPrompt(sentence),
          temperature: 0.3,
          maxOutputTokens: EVALUATION_MAX_OUTPUT_TOKENS,
        })
      ),
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
      const content = extractTextFromOpenAiResponse(data)
      if (!content) {
        throw new Error('AI returned empty content')
      }

      return parseEvaluationJson(content, sentence, 'word')
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

export async function evaluateGrammarSentence(input: {
  title: string
  pattern: string
  coreExplanation: string
  usageNote?: string | null
  sceneTags?: string[]
  templates?: string[]
  examples?: string[]
  sentence: string
  learningHistory?: string[]
}): Promise<EvaluationResult> {
  const apiKey = process.env.OPENAI_API_KEY
  const apiBase = process.env.OPENAI_API_BASE || 'https://api.openai.com/v1'
  const apiType = normalizeOpenAiApiType(process.env.OPENAI_API_TYPE)
  const model = process.env.OPENAI_MODEL || 'gpt-5.2'

  if (!apiKey) {
    console.warn('OPENAI_API_KEY is missing. Using mock grammar evaluation.')
    return {
      ...makeErrorResult('请先配置服务端 AI 环境变量。'),
      correctedSentence: input.sentence,
      score: 50,
      attemptStatus: 'needs_help',
      usageQuality: 'invalid',
      praise: `你已经开始练习 "${input.title}"，但当前环境还没有真实 AI 评估。`,
      suggestion: '请先配置 OPENAI_API_KEY、OPENAI_API_BASE 和 OPENAI_MODEL。',
      grammarScore: 2,
      wordUsageScore: 2,
      structureAccuracy: 2,
      sceneFit: 2,
    }
  }

  const systemPrompt = buildGrammarSystemPrompt({
    title: input.title,
    pattern: input.pattern,
    coreExplanation: input.coreExplanation,
    usageNote: input.usageNote,
    sceneTags: input.sceneTags,
    templates: input.templates,
    examples: input.examples,
    learningHistory: input.learningHistory,
  })

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 30000)

      const response = await fetch(getChatCompletionsUrl(apiBase, apiType), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(
          buildTextGenerationRequest({
            apiType,
            model,
            systemPrompt,
            userPrompt: buildEvaluationUserPrompt(input.sentence),
            temperature: 0.3,
            maxOutputTokens: EVALUATION_MAX_OUTPUT_TOKENS,
          })
        ),
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
      const content = extractTextFromOpenAiResponse(data)
      if (!content) {
        throw new Error('AI returned empty content')
      }

      return parseEvaluationJson(content, input.sentence, 'grammar')
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        if (attempt < 1) {
          continue
        }
        return makeErrorResult('评估超时，请稍后重试。')
      }

      if (error instanceof SyntaxError) {
        console.error('AI returned malformed grammar JSON:', error)
        return makeErrorResult('AI 返回格式异常，请重试。')
      }

      if (attempt < 1) {
        continue
      }

      console.error('Failed to evaluate grammar sentence:', error)
      return makeErrorResult(`评估失败：${getErrorMessage(error)}`)
    }
  }

  return makeErrorResult('多次尝试后仍未拿到评估结果。')
}

export async function getStudyBatch(params: GetStudyBatchParams = {}) {
  const { supabase, user } = await requireActionSession()
  const librarySlug = normalizeLibrarySlug(params.librarySlug)
  const library =
    librarySlug !== 'all' ? await getLibraryBySlug(supabase, librarySlug) : null

  if (library && normalizeStudyContentType(library.content_type) === 'grammar') {
    return loadGrammarStudyBatch({
      supabase,
      userId: user.id,
      library,
      skippedItemIds: params.skippedWordIds ?? [],
      batchSize: clamp(params.batchSize ?? DEFAULT_STUDY_BATCH_SIZE, 1, 20),
      studyView: resolveStudyView(params),
      today: getTodayDateString(),
    })
  }

  return loadStudyBatch({
    supabase,
    userId: user.id,
    today: getTodayDateString(),
    params,
    defaultBatchSize: DEFAULT_STUDY_BATCH_SIZE,
    deps: {
      normalizeLibrarySlug,
      getLibrarySlugForLegacyTag,
      getLegacyTagForLibrarySlug,
      resolveStudyView,
      isReviewOnlyView,
      getUserFavoriteWordIds,
      getLibraryBySlug,
      getLibraryWordIds,
      ensureUserLibraryPlan,
      getDueStudyItems,
      getNewStudyItems,
      hydrateStudyBatchWordDetails,
      logStudyPerformance,
    },
  })
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

export async function getHistorySentenceReviewTarget(
  sentenceId: string
): Promise<HistoryReviewTarget> {
  const startedAt = Date.now()
  const normalizedSentenceId = sanitizeText(sentenceId).trim()
  if (!normalizedSentenceId) {
    return { batchItem: null, review: null }
  }

  const { supabase, user } = await requireActionSession()
  const { data, error } = await supabase
    .from('sentences')
    .select(
      'id, word_id, original_text, ai_score, ai_feedback, created_at, words!inner(id, word, definition, tags, phonetic, example)'
    )
    .eq('user_id', user.id)
    .eq('id', normalizedSentenceId)
    .maybeSingle()

  if (error) {
    console.error('Failed to load history sentence review target:', error)
    logStudyPerformance('getHistorySentenceReviewTarget', startedAt, {
      found: false,
      reason: 'query_error',
    })
    return { batchItem: null, review: null }
  }

  const sentenceRow = data as HistorySentenceReviewRow | null
  if (!sentenceRow || typeof sentenceRow.word_id !== 'string') {
    logStudyPerformance('getHistorySentenceReviewTarget', startedAt, {
      found: false,
      reason: 'missing_sentence',
    })
    return { batchItem: null, review: null }
  }
  const joinedWord = Array.isArray(sentenceRow.words) ? sentenceRow.words[0] : sentenceRow.words

  const baseBatchItem =
    normalizeNewStudyBatchItem(joinedWord, {
      isNew: false,
      priorityReason: 'due',
    })

  if (!baseBatchItem) {
    logStudyPerformance('getHistorySentenceReviewTarget', startedAt, {
      found: false,
      reason: 'missing_batch_item',
    })
    return { batchItem: null, review: null }
  }

  const [hydratedBatchItem] = await hydrateStudyBatchWordDetails(supabase, [baseBatchItem])
  if (!hydratedBatchItem) {
    logStudyPerformance('getHistorySentenceReviewTarget', startedAt, {
      found: false,
      reason: 'missing_hydrated_item',
    })
    return { batchItem: null, review: null }
  }

  const target: HistoryReviewTarget = {
    batchItem: hydratedBatchItem,
    review: {
      historyId: sentenceRow.id,
      targetKind: 'word',
      title: hydratedBatchItem.words.word,
      subtitle: hydratedBatchItem.words.definition ?? null,
      sentence: sentenceRow.original_text,
      score: typeof sentenceRow.ai_score === 'number' ? sentenceRow.ai_score : 0,
      feedback: sentenceRow.ai_feedback ?? '',
      createdAt: sentenceRow.created_at,
    },
  }

  logStudyPerformance('getHistorySentenceReviewTarget', startedAt, {
    found: true,
    wordId: sentenceRow.word_id,
  })

  return target
}

export async function getHistoryGrammarReviewTarget(
  attemptId: string
): Promise<HistoryReviewTarget> {
  const normalizedAttemptId = sanitizeText(attemptId).trim()
  if (!normalizedAttemptId) {
    return { batchItem: null, review: null }
  }

  const { supabase, user } = await requireActionSession()
  const { data, error } = await supabase
    .from('grammar_attempts')
    .select(
      'id, grammar_item_id, original_text, ai_score, ai_feedback, created_at, grammar_items!inner(id, slug, title, short_label, pattern, family, subtype, anchor, core_explanation, usage_note, usage_register, scene_tags, slot_schema, common_errors)'
    )
    .eq('user_id', user.id)
    .eq('id', normalizedAttemptId)
    .maybeSingle()

  if (error) {
    console.error('Failed to load history grammar review target:', error)
    return { batchItem: null, review: null }
  }

  const attemptRow = data as HistoryGrammarAttemptReviewRow | null
  if (!attemptRow || typeof attemptRow.grammar_item_id !== 'string') {
    return { batchItem: null, review: null }
  }

  const grammarRow = normalizeGrammarItemRow(attemptRow.grammar_items)
  if (!grammarRow) {
    return { batchItem: null, review: null }
  }

  const [{ data: userGrammarData, error: userGrammarError }, { data: libraryMemberships, error: libraryMembershipError }] =
    await Promise.all([
      supabase
        .from('user_grammar_items')
        .select('*')
        .eq('user_id', user.id)
        .eq('grammar_item_id', attemptRow.grammar_item_id)
        .maybeSingle(),
      supabase
        .from('library_grammar_items')
        .select('library_id, position')
        .eq('grammar_item_id', attemptRow.grammar_item_id)
        .order('position', { ascending: true, nullsFirst: false }),
    ])

  if (userGrammarError) {
    console.error('Failed to load user grammar item for history review:', userGrammarError)
  }

  if (libraryMembershipError) {
    console.error('Failed to load grammar library memberships for history review:', libraryMembershipError)
  }

  const { examplesByItemId, templatesByItemId, contrastsByItemId } =
    await loadGrammarStudySupportData(supabase, [attemptRow.grammar_item_id])

  const userGrammarItem =
    userGrammarData && typeof userGrammarData === 'object'
      ? (userGrammarData as UserGrammarItemRecord)
      : null

  const libraryIds = ((libraryMemberships ?? []) as LibraryGrammarMembershipRow[])
    .map((row) => row.library_id)
    .filter((libraryId): libraryId is string => typeof libraryId === 'string')

  let preferredLibrarySlug: string | null = null
  if (libraryIds.length > 0) {
    const { data: libraries, error: librariesError } = await supabase
      .from('libraries')
      .select('id, slug')
      .in('id', libraryIds)

    if (librariesError) {
      console.error('Failed to load grammar history libraries:', librariesError)
    } else {
      const slugById = new Map<string, string>()
      for (const row of (libraries ?? []) as Array<{ id?: string | null; slug?: string | null }>) {
        if (typeof row.id === 'string' && typeof row.slug === 'string') {
          slugById.set(row.id, row.slug)
        }
      }

      preferredLibrarySlug =
        libraryIds.map((libraryId) => slugById.get(libraryId)).find((slug): slug is string => Boolean(slug)) ??
        null
    }
  }

  return {
    batchItem: {
      kind: 'grammar',
      id: userGrammarItem?.id ?? attemptRow.grammar_item_id,
      userGrammarItemId: userGrammarItem?.id ?? null,
      grammar_item_id: attemptRow.grammar_item_id,
      grammar: buildGrammarStudyInfo(
        grammarRow,
        examplesByItemId.get(attemptRow.grammar_item_id) ?? [],
        templatesByItemId.get(attemptRow.grammar_item_id) ?? [],
        contrastsByItemId.get(attemptRow.grammar_item_id) ?? []
      ),
      isNew: false,
      priorityReason: 'due',
    },
    review: {
      historyId: attemptRow.id,
      targetKind: 'grammar',
      title: grammarRow.title,
      subtitle: grammarRow.pattern,
      sentence: attemptRow.original_text,
      score: typeof attemptRow.ai_score === 'number' ? attemptRow.ai_score : 0,
      feedback: attemptRow.ai_feedback ?? '',
      createdAt: attemptRow.created_at,
    },
    preferredLibrarySlug,
  }
}

export async function submitSentence(
  userWordId: string | null,
  wordId: string,
  wordStr: string,
  definition: string,
  tags: string,
  sentence: string,
  librarySlug?: string,
  streamedContent?: string | null
): Promise<StudySubmissionResult> {
  const { supabase, user } = await requireActionSession()
  return submitStudySentence({
    supabase,
    userId: user.id,
    today: getTodayDateString(),
    userWordId,
    wordId,
    wordStr,
    definition,
    tags,
    sentence,
    librarySlug,
    streamedContent,
    deps: {
      parseEvaluationJson,
      getWordLearningHistory,
      evaluateSentence,
      toUserWordRecord: (value) => (isUserWordRecord(value) ? value : null),
      getLibraryBySlug,
      attachWordToUser,
      getNextFailureCounters,
      buildWordFeedbackForStorage,
      touchLibraryProgress,
      formatModelLabel,
    },
  })
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
  return rewriteStudySentence({
    supabase,
    userId: user.id,
    wordId,
    wordStr,
    definition,
    tags,
    sentence,
    librarySlug,
    streamedContent,
    deps: {
      parseEvaluationJson,
      getWordLearningHistory,
      evaluateSentence,
      touchLibraryProgress,
      formatModelLabel,
    },
  })
}

export async function submitGrammarSentence(
  userGrammarItemId: string | null,
  grammarItemId: string,
  title: string,
  pattern: string,
  coreExplanation: string,
  usageNote: string | null,
  sceneTags: string[],
  templates: string[],
  examples: string[],
  sentence: string,
  librarySlug?: string,
  streamedContent?: string | null
): Promise<StudySubmissionResult> {
  const { supabase, user } = await requireActionSession()
  return submitStudyGrammarAttempt({
    supabase,
    userId: user.id,
    today: getTodayDateString(),
    userGrammarItemId,
    grammarItemId,
    title,
    pattern,
    coreExplanation,
    usageNote,
    sceneTags,
    templates,
    examples,
    sentence,
    librarySlug,
    streamedContent,
    deps: {
      parseEvaluationJson,
      getGrammarLearningHistory,
      evaluateGrammarSentence,
      toUserGrammarRecord: (value) => (isUserGrammarItemRecord(value) ? value : null),
      getLibraryBySlug,
      attachGrammarItemToUser,
      getNextFailureCounters,
      buildGrammarFeedbackForStorage,
      touchLibraryGrammarProgress,
      formatModelLabel,
    },
  })
}

export async function rewriteGrammarSentence(
  grammarItemId: string,
  title: string,
  pattern: string,
  coreExplanation: string,
  usageNote: string | null,
  sceneTags: string[],
  templates: string[],
  examples: string[],
  sentence: string,
  librarySlug?: string,
  streamedContent?: string | null
): Promise<StudySubmissionResult> {
  const { supabase, user } = await requireActionSession()
  return rewriteStudyGrammarAttempt({
    supabase,
    userId: user.id,
    grammarItemId,
    title,
    pattern,
    coreExplanation,
    usageNote,
    sceneTags,
    templates,
    examples,
    sentence,
    librarySlug,
    streamedContent,
    deps: {
      parseEvaluationJson,
      getGrammarLearningHistory,
      evaluateGrammarSentence,
      touchLibraryGrammarProgress,
      formatModelLabel,
    },
  })
}

export async function getFavoriteWordIds() {
  const { supabase, user } = await requireActionSession()
  return getUserFavoriteWordIds(supabase, user.id)
}

export async function toggleFavoriteWord(wordId: string, nextFavorite: boolean) {
  const { supabase, user } = await requireActionSession()

  if (favoriteColumnSupported === false) {
    throw new Error('收藏功能需要先执行最新的 Supabase schema。')
  }

  const userWord = await attachWordToUser(wordId, null, supabase, user.id)
  const onlyUsedForFavorite =
    nextFavorite &&
    !!userWord &&
    (userWord.repetitions ?? 0) === 0 &&
    userWord.last_reviewed_at == null &&
    userWord.last_score == null &&
    (userWord.consecutive_failures ?? 0) === 0 &&
    (userWord.lapse_count ?? 0) === 0 &&
    (userWord.interval ?? 0) === 0

  const { error } = await supabase
    .from('user_words')
    .update(
      onlyUsedForFavorite
        ? {
            is_favorite: nextFavorite,
            next_review_date: null,
          }
        : { is_favorite: nextFavorite }
    )
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
