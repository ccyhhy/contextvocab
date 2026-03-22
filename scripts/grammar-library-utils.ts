import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import path from 'path'
import {
  buildTextGenerationRequest,
  extractTextFromOpenAiResponse,
  getOpenAiApiUrl,
  normalizeOpenAiApiType,
  type OpenAiApiType,
} from '../src/lib/openai-api'
import type {
  GrammarContrastInfo,
  GrammarExampleInfo,
  GrammarSlotDefinition,
  GrammarSlotType,
  GrammarTemplateInfo,
} from '../src/lib/study-content'
import { createServiceRoleClient, normalizeWord } from './official-word-utils'

const DEFAULT_OUTPUT_FILE = path.join(
  process.cwd(),
  'data',
  'grammar',
  'generated',
  'grammar-items.generated.json'
)
const DEFAULT_GENERATE_TIMEOUT_MS = Number(process.env.OPENAI_ENRICH_TIMEOUT_MS || 95000)
const DEFAULT_RETRY_COUNT = 5
const DEFAULT_CONCURRENCY = 2
const VALID_USAGE_REGISTERS = new Set(['formal', 'neutral', 'informal'])
const MIN_CORE_EXPLANATION_LENGTH = 70
const MIN_USAGE_NOTE_LENGTH = 120
const MIN_SCENE_TAGS = 4
const MIN_SLOT_SCHEMA = 2
const MIN_COMMON_ERRORS = 5
const MIN_CONTRASTS = 4
const MIN_EXAMPLES = 5
const MIN_TEMPLATES = 3
const VALID_SLOT_TYPES = new Set<GrammarSlotType>([
  'clause',
  'noun_phrase',
  'verb_ing',
  'to_infinitive',
  'relative_clause',
  'statement_clause',
  'question_clause',
  'prepositional_phrase',
  'fixed_chunk',
  'custom',
])

interface AiConfig {
  apiKey: string
  apiBase: string
  model: string
  apiType: OpenAiApiType
}

export interface GrammarLibrarySeed {
  slug: string
  name: string
  description?: string | null
  sourceType?: 'official' | 'custom'
  language?: string
  isPublic?: boolean
}

export interface GrammarSeedItem {
  slug: string
  title: string
  pattern: string
  family: string
  subtype?: string | null
  anchor?: string | null
  brief: string
  sceneHints?: string[]
  contrastHints?: string[]
}

export interface GrammarGeneratedItem {
  slug: string
  title: string
  shortLabel?: string | null
  pattern: string
  family: string
  subtype?: string | null
  anchor?: string | null
  coreExplanation: string
  usageNote?: string | null
  usageRegister?: 'formal' | 'neutral' | 'informal' | null
  sceneTags: string[]
  slotSchema: GrammarSlotDefinition[]
  commonErrors: string[]
  contrasts: GrammarContrastInfo[]
  examples: GrammarExampleInfo[]
  templates: GrammarTemplateInfo[]
  difficulty: number
}

export interface GrammarLibrarySeedDataset {
  library: GrammarLibrarySeed
  items: GrammarSeedItem[]
}

export interface GrammarLibraryGeneratedDataset {
  library: GrammarLibrarySeed
  generatedAt: string
  source: string
  model: string | null
  items: GrammarGeneratedItem[]
}

export interface GenerateGrammarCliOptions {
  input: string
  output: string
  concurrency: number
  limit: number | null
  slugs: string[]
}

export interface ImportGrammarCliOptions {
  input: string
  dryRun: boolean
}

export function parseGenerateGrammarCliArgs(argv: string[]): GenerateGrammarCliOptions {
  return {
    input:
      getStringArg(argv, '--input') ??
      path.join(process.cwd(), 'data', 'grammar', 'grammar-seed.sample.json'),
    output: getStringArg(argv, '--output') ?? DEFAULT_OUTPUT_FILE,
    concurrency: getPositiveIntegerArg(argv, '--concurrency', DEFAULT_CONCURRENCY),
    limit: getOptionalPositiveIntegerArg(argv, '--limit'),
    slugs: getListArg(argv, '--slugs'),
  }
}

export function parseImportGrammarCliArgs(argv: string[]): ImportGrammarCliOptions {
  return {
    input: getStringArg(argv, '--input') ?? DEFAULT_OUTPUT_FILE,
    dryRun: argv.includes('--dry-run'),
  }
}

export function createGrammarLibraryClient() {
  return createServiceRoleClient()
}

export function readGrammarSeedDataset(filePath: string): GrammarLibrarySeedDataset {
  const absolutePath = path.resolve(filePath)
  const parsed = JSON.parse(readFileSync(absolutePath, 'utf-8')) as Partial<GrammarLibrarySeedDataset>
  const items = Array.isArray(parsed.items)
    ? parsed.items.map(normalizeSeedItem).filter(isPresent)
    : []

  if (!parsed.library || typeof parsed.library !== 'object') {
    throw new Error(`Seed file is missing the library section: ${absolutePath}`)
  }

  if (items.length === 0) {
    throw new Error(`Seed file has no valid items: ${absolutePath}`)
  }

  return {
    library: normalizeLibrarySeed(parsed.library as GrammarLibrarySeed),
    items,
  }
}

export function writeGrammarGeneratedDataset(
  filePath: string,
  dataset: GrammarLibraryGeneratedDataset
) {
  const absolutePath = path.resolve(filePath)
  mkdirSync(path.dirname(absolutePath), { recursive: true })
  writeFileSync(absolutePath, `${JSON.stringify(dataset, null, 2)}\n`, 'utf-8')
  return absolutePath
}

export async function generateGrammarItemDraft(
  seed: GrammarSeedItem,
  familyPeers: GrammarSeedItem[]
): Promise<GrammarGeneratedItem> {
  const aiConfig = resolveGrammarAiConfig()

  if (!aiConfig) {
    throw new Error(
      'No AI config found for grammar generation. Reuse OPENAI_ENRICH_REFINE_* / OPENAI_ENRICH_* / OPENAI_* variables.'
    )
  }

  const userPayload = buildGrammarUserPayload(seed, familyPeers)
  const systemPrompt = buildCompactGrammarSystemPrompt()

  for (let attempt = 0; attempt <= DEFAULT_RETRY_COUNT; attempt += 1) {
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    try {
      const controller = new AbortController()
      timeoutId = setTimeout(() => controller.abort(), DEFAULT_GENERATE_TIMEOUT_MS)

      const response = await fetch(getOpenAiApiUrl(aiConfig.apiBase, aiConfig.apiType), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${aiConfig.apiKey}`,
        },
        body: JSON.stringify(
          buildTextGenerationRequest({
            apiType: aiConfig.apiType,
            model: aiConfig.model,
            temperature: 0.2,
            jsonMode: false,
            maxOutputTokens: 1700,
            systemPrompt,
            userPrompt: JSON.stringify(userPayload, null, 2),
          })
        ),
        signal: controller.signal,
      })

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '')
        throw new Error(`AI request failed (${response.status}): ${errorBody.slice(0, 240)}`)
      }

      const payload = await response.json()
      const content = extractTextFromOpenAiResponse(payload)
      if (!content) {
        throw new Error('AI returned empty content')
      }

      return normalizeGeneratedItem(seed, JSON.parse(extractJsonObject(content)))
    } catch (error) {
      if (attempt >= DEFAULT_RETRY_COUNT) {
        throw error
      }

      await sleep(getRetryDelayMs(attempt))
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    }
  }

  throw new Error(`Failed to generate grammar card for ${seed.slug}`)
}

export function normalizeLibrarySeed(library: GrammarLibrarySeed): GrammarLibrarySeed {
  const slug = normalizeWord(library.slug ?? '').toLowerCase()
  const name = normalizeWord(library.name ?? '')

  if (!slug || !name) {
    throw new Error('Library seed must include slug and name.')
  }

  return {
    slug,
    name,
    description: normalizeOptionalString(library.description),
    sourceType: library.sourceType === 'custom' ? 'custom' : 'official',
    language: normalizeOptionalString(library.language) || 'en',
    isPublic: library.isPublic !== false,
  }
}

export function normalizeGeneratedDataset(
  dataset: GrammarLibraryGeneratedDataset
): GrammarLibraryGeneratedDataset {
  const items = Array.isArray(dataset.items) ? dataset.items : []

  return {
    library: normalizeLibrarySeed(dataset.library),
    generatedAt: normalizeOptionalString(dataset.generatedAt) ?? new Date().toISOString(),
    source: normalizeOptionalString(dataset.source) ?? 'unknown',
    model: normalizeOptionalString(dataset.model),
    items: items.map((item) =>
      normalizeGeneratedItem(
        {
          slug: item.slug,
          title: item.title,
          pattern: item.pattern,
          family: item.family,
          subtype: item.subtype,
          anchor: item.anchor,
          brief: item.coreExplanation,
        },
        item
      )
    ),
  }
}

function normalizeSeedItem(value: unknown): GrammarSeedItem | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }

  const row = value as Partial<GrammarSeedItem>
  const slug = normalizeWord(row.slug ?? '').toLowerCase()
  const title = normalizeWord(row.title ?? '')
  const pattern = normalizeWord(row.pattern ?? '')
  const family = normalizeWord(row.family ?? '').toLowerCase()
  const brief = normalizeWord(row.brief ?? '')

  if (!slug || !title || !pattern || !family || !brief) {
    return null
  }

  return {
    slug,
    title,
    pattern,
    family,
    subtype: normalizeOptionalString(row.subtype)?.toLowerCase() ?? null,
    anchor: normalizeOptionalString(row.anchor),
    brief,
    sceneHints: normalizeStringArray(row.sceneHints),
    contrastHints: normalizeStringArray(row.contrastHints),
  }
}

function normalizeGeneratedItem(seed: GrammarSeedItem, value: unknown): GrammarGeneratedItem {
  if (typeof value !== 'object' || value === null) {
    throw new Error(`Generated payload for ${seed.slug} is not an object.`)
  }

  const row = value as Record<string, unknown>
  const coreExplanation =
    pickOptionalString(row, ['coreExplanation', 'core_explanation']) ?? seed.brief
  const usageNote = pickOptionalString(row, ['usageNote', 'usage_note'])
  const sceneTags = dedupeStrings([
    ...(seed.sceneHints ?? []),
    ...normalizeStringArray(row.sceneTags),
    ...normalizeStringArray(row.scene_tags),
  ]).slice(0, 8)
  const slotSchema = normalizeSlotSchema(row.slotSchema ?? row.slot_schema)
  const commonErrors = dedupeStrings([
    ...normalizeStringArray(row.commonErrors),
    ...normalizeStringArray(row.common_errors),
  ]).slice(0, 6)
  const contrasts = normalizeContrasts(seed, row.contrasts)
  const examples = normalizeExamples(row.examples)
  const templates = normalizeTemplates(row.templates)

  if (coreExplanation.length < MIN_CORE_EXPLANATION_LENGTH) {
    throw new Error(`Generated item ${seed.slug} has a core explanation that is too short.`)
  }

  if (!usageNote || usageNote.length < MIN_USAGE_NOTE_LENGTH) {
    throw new Error(`Generated item ${seed.slug} has a usage note that is too short.`)
  }

  if (sceneTags.length < MIN_SCENE_TAGS) {
    throw new Error(`Generated item ${seed.slug} has too few scene tags.`)
  }

  if (slotSchema.length < MIN_SLOT_SCHEMA) {
    throw new Error(`Generated item ${seed.slug} has too few slot definitions.`)
  }

  if (commonErrors.length < MIN_COMMON_ERRORS) {
    throw new Error(`Generated item ${seed.slug} has too few common errors.`)
  }

  if (contrasts.length < MIN_CONTRASTS) {
    throw new Error(`Generated item ${seed.slug} has too few contrasts.`)
  }

  if (examples.length < MIN_EXAMPLES) {
    throw new Error(`Generated item ${seed.slug} has too few valid examples.`)
  }

  if (templates.length < MIN_TEMPLATES) {
    throw new Error(`Generated item ${seed.slug} has too few valid templates.`)
  }

  return {
    slug: seed.slug,
    title: seed.title,
    shortLabel: pickOptionalString(row, ['shortLabel', 'short_label']),
    pattern: seed.pattern,
    family: seed.family,
    subtype: seed.subtype ?? null,
    anchor: seed.anchor ?? null,
    coreExplanation,
    usageNote,
    usageRegister: normalizeUsageRegister(
      pickOptionalString(row, ['usageRegister', 'usage_register'])
    ),
    sceneTags,
    slotSchema,
    commonErrors,
    contrasts,
    examples,
    templates,
    difficulty: normalizeDifficulty(row.difficulty),
  }
}

function normalizeExamples(value: unknown): GrammarExampleInfo[] {
  const rows = Array.isArray(value) ? value : []
  const normalized = rows
    .map((row, index) => {
      if (typeof row !== 'object' || row === null) {
        return null
      }

      const record = row as Record<string, unknown>
      const sentence = pickOptionalString(record, ['sentence', 'en', 'exampleSentence'])
      if (!sentence) {
        return null
      }

      return {
        sentence,
        translation: pickOptionalString(record, ['translation', 'zh', 'exampleTranslation']),
        note: pickOptionalString(record, ['note', 'usage']),
        scene: pickOptionalString(record, ['scene']),
        isPrimary: record.isPrimary === true || record.is_primary === true || index === 0,
      } satisfies GrammarExampleInfo
    })
    .filter(isPresent)

  if (normalized.length > 0 && !normalized.some((item) => item.isPrimary)) {
    normalized[0].isPrimary = true
  }

  return normalized.slice(0, 6)
}

function normalizeTemplates(value: unknown): GrammarTemplateInfo[] {
  const rows = Array.isArray(value) ? value : []
  return rows
    .map((row, index) => {
      if (typeof row !== 'object' || row === null) {
        return null
      }

      const record = row as Record<string, unknown>
      const label = pickOptionalString(record, ['label']) ?? `Template ${index + 1}`
      const template = pickOptionalString(record, ['template', 'en'])

      if (!label || !template) {
        return null
      }

      return {
        label,
        template,
        slotHints: dedupeStrings([
          ...normalizeStringArray(record.slotHints),
          ...normalizeStringArray(record.slot_hints),
        ]).slice(0, 6),
        exampleSentence: pickOptionalString(record, ['exampleSentence', 'example_sentence', 'en']),
        exampleTranslation: pickOptionalString(record, [
          'exampleTranslation',
          'example_translation',
          'zh',
        ]),
        position: normalizePositiveInteger(record.position, index + 1),
      } satisfies GrammarTemplateInfo
    })
    .filter(isPresent)
    .slice(0, 6)
}

function normalizeSlotSchema(value: unknown): GrammarSlotDefinition[] {
  if (!Array.isArray(value) && typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>
    return Object.entries(record)
      .map(([key, rawValue]) => ({
        key,
        label: key,
        type: inferSlotTypeFromText(typeof rawValue === 'string' ? rawValue : key),
        required: true,
        hint: normalizeOptionalString(rawValue),
      }))
      .slice(0, 6)
  }

  const rows = Array.isArray(value) ? value : []
  return rows
    .map((row, index) => {
      if (typeof row !== 'object' || row === null) {
        return null
      }

      const record = row as Record<string, unknown>
      const key = pickOptionalString(record, ['key']) ?? `slot_${index + 1}`
      const label = pickOptionalString(record, ['label']) ?? key
      const type = normalizeSlotType(record.type)

      return {
        key,
        label,
        type,
        required: record.required !== false,
        hint: pickOptionalString(record, ['hint']),
      } satisfies GrammarSlotDefinition
    })
    .filter(isPresent)
    .slice(0, 6)
}

function normalizeContrasts(seed: GrammarSeedItem, value: unknown): GrammarContrastInfo[] {
  const rows = Array.isArray(value) ? value : []
  const normalized = rows
    .map((row) => {
      if (typeof row !== 'object' || row === null) {
        return null
      }

      const record = row as Record<string, unknown>
      const title = pickOptionalString(record, ['title', 'pattern'])
      const slug =
        pickOptionalString(record, ['slug'])?.toLowerCase() ??
        (title ? slugifyContrastHint(title) : null)
      const note = pickOptionalString(record, ['note'])

      if (!slug || !title || !note || slug === seed.slug) {
        return null
      }

      return {
        slug,
        title,
        note,
      } satisfies GrammarContrastInfo
    })
    .filter(isPresent)

  return dedupeByKey(normalized, (item) => item.slug).slice(0, 6)
}

function normalizeDifficulty(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) {
    return 2
  }
  return Math.max(1, Math.min(5, Math.round(parsed)))
}

function normalizeUsageRegister(value: unknown): 'formal' | 'neutral' | 'informal' | null {
  const normalized = normalizeOptionalString(value)?.toLowerCase()
  if (normalized && VALID_USAGE_REGISTERS.has(normalized)) {
    return normalized as 'formal' | 'neutral' | 'informal'
  }
  if (!normalized) {
    return null
  }
  if (normalized.includes('formal') || normalized.includes('书面')) {
    return 'formal'
  }
  if (normalized.includes('informal') || normalized.includes('口语')) {
    return 'informal'
  }
  if (normalized.includes('neutral') || normalized.includes('中性')) {
    return 'neutral'
  }
  return null
}

function normalizeSlotType(value: unknown): GrammarSlotType {
  const normalized = normalizeOptionalString(value)?.toLowerCase() as GrammarSlotType | undefined
  if (normalized && VALID_SLOT_TYPES.has(normalized)) {
    return normalized
  }
  return 'custom'
}

function extractJsonObject(text: string) {
  const trimmed = text.trim()
  const match = trimmed.match(/\{[\s\S]*\}/)
  return match?.[0] ?? trimmed
}

function getStringArg(argv: string[], name: string) {
  const index = argv.indexOf(name)
  if (index === -1) {
    return null
  }

  const value = argv[index + 1]
  return value && !value.startsWith('--') ? value : null
}

function getListArg(argv: string[], name: string) {
  const value = getStringArg(argv, name)
  if (!value) {
    return []
  }

  return value
    .split(',')
    .map((item) => normalizeWord(item).toLowerCase())
    .filter(Boolean)
}

function getPositiveIntegerArg(argv: string[], name: string, fallback: number) {
  const value = getStringArg(argv, name)
  const parsed = value ? Number(value) : fallback
  return Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : fallback
}

function getOptionalPositiveIntegerArg(argv: string[], name: string) {
  const value = getStringArg(argv, name)
  if (!value) {
    return null
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : null
}

function getRetryDelayMs(attempt: number) {
  return Math.min(12000, 1500 * 2 ** attempt)
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function normalizeOptionalString(value: unknown) {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim()
  return normalized ? normalized : null
}

function pickOptionalString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = normalizeOptionalString(record[key])
    if (value) {
      return value
    }
  }
  return null
}

function normalizeStringArray(value: unknown) {
  const items = Array.isArray(value) ? value : []
  return dedupeStrings(
    items
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean)
  )
}

function isPresent<T>(value: T | null | undefined): value is T {
  return value != null
}

function dedupeStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))
}

function dedupeByKey<T>(values: T[], getKey: (value: T) => string) {
  const map = new Map<string, T>()
  for (const value of values) {
    map.set(getKey(value), value)
  }
  return Array.from(map.values())
}

function normalizePositiveInteger(value: unknown, fallback: number) {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : fallback
}

function slugifyContrastHint(value: string) {
  return normalizeWord(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function buildGrammarUserPayload(seed: GrammarSeedItem, familyPeers: GrammarSeedItem[]) {
  return {
    slug: seed.slug,
    title: seed.title,
    pattern: seed.pattern,
    family: seed.family,
    subtype: seed.subtype ?? null,
    anchor: seed.anchor ?? null,
    brief: seed.brief,
    sceneHints: seed.sceneHints ?? [],
    contrastHints: seed.contrastHints ?? [],
    familyPeers: familyPeers
      .filter((item) => item.slug !== seed.slug)
      .slice(0, 4)
      .map((item) => ({
        slug: item.slug,
        title: item.title,
        pattern: item.pattern,
      })),
  }
}

function buildCompactGrammarSystemPrompt() {
  return [
    'You are generating one premium grammar study card for a Chinese learner.',
    'Your goal is not to briefly describe a grammar pattern, but to teach it well enough that the learner can actually write a correct sentence after reading the card.',
    'Return exactly one valid minified JSON object. No markdown. No prose outside JSON.',
    'Keep title and pattern in English. Use Chinese for all explanations, notes, hints, error descriptions, and translations.',
    'Explanations must be concrete, learner-facing, and easy to act on. Do not explain only with abstract grammar jargon.',
    'This is a foundational grammar card. Prioritize clarity, correctness, usability, and contrastive learning over breadth.',
    'The learner must understand what this pattern does, what can appear after it, where it usually appears, when it sounds natural, when not to use it, how it differs from similar patterns, and one safe beginner template they can use immediately.',
    'Use usageRegister only: formal, neutral, informal, or null.',
    'coreExplanation must be 80-160 Chinese characters and include function + structural requirement + common sentence position.',
    'usageNote must be 140-260 Chinese characters and include tone/register + suitable scenes + unsuitable scenes + punctuation/position reminder + beginner-friendly advice.',
    'sceneTags must contain 4 to 6 concrete learner-facing items.',
    'slotSchema must contain 2 to 4 items. Each hint must clearly say what can go in the slot, one common mistake, and one mini example.',
    'commonErrors must contain 5 to 6 items. Each item must contain wrong pattern + why wrong + how to fix it.',
    'contrasts must contain 4 to 5 items. Each note must include structural difference, scene/tone difference, and one mini comparison or very short minimal pair.',
    'examples must contain 5 to 6 items and cover easiest core example, alternate position example, writing-style example, comparison-sensitive example, and everyday example.',
    'templates must contain 3 to 4 items and include safest beginner template, alternate-position template, and writing-oriented template.',
    'slotSchema must be an array of objects with keys: key, label, type, required, hint.',
    'Each example must use keys: sentence, translation, note, scene, isPrimary.',
    'Each template must use keys: label, template, slotHints, exampleSentence, exampleTranslation, position.',
    'Hard bans: no vague filler, no empty contrasts, no missing translations, no duplicate content, no contradiction between explanation and examples.',
    'Output keys:',
    '{"shortLabel":"string or null","coreExplanation":"string","usageNote":"string or null","usageRegister":"formal|neutral|informal|null","sceneTags":["string"],"slotSchema":[{"key":"string","label":"string","type":"clause|noun_phrase|verb_ing|to_infinitive|relative_clause|statement_clause|question_clause|prepositional_phrase|fixed_chunk|custom","required":true,"hint":"string or null"}],"commonErrors":["string"],"contrasts":[{"slug":"string","title":"string","note":"string"}],"examples":[{"sentence":"string","translation":"string","note":"string or null","scene":"string or null","isPrimary":true}],"templates":[{"label":"string","template":"string","slotHints":["string"],"exampleSentence":"string or null","exampleTranslation":"string or null","position":1}],"difficulty":1}',
  ].join('\n')
}

function inferSlotTypeFromText(value: string): GrammarSlotType {
  const normalized = value.toLowerCase()
  if (normalized.includes('relative')) {
    return 'relative_clause'
  }
  if (normalized.includes('question')) {
    return 'question_clause'
  }
  if (normalized.includes('statement')) {
    return 'statement_clause'
  }
  if (normalized.includes('noun')) {
    return 'noun_phrase'
  }
  if (normalized.includes('verb-ing') || normalized.includes('gerund') || normalized.includes('v-ing')) {
    return 'verb_ing'
  }
  if (normalized.includes('to-infinitive') || normalized.includes('to infinitive')) {
    return 'to_infinitive'
  }
  if (normalized.includes('preposition')) {
    return 'prepositional_phrase'
  }
  if (normalized.includes('clause')) {
    return 'clause'
  }
  return 'custom'
}

function resolveGrammarAiConfig(): AiConfig | null {
  const candidates = [
    [
      'OPENAI_ENRICH_REFINE_API_KEY',
      'OPENAI_ENRICH_REFINE_API_BASE',
      'OPENAI_ENRICH_REFINE_MODEL',
      'OPENAI_ENRICH_REFINE_API_TYPE',
    ],
    [
      'OPENAI_ENRICH_API_KEY',
      'OPENAI_ENRICH_API_BASE',
      'OPENAI_ENRICH_MODEL',
      'OPENAI_ENRICH_API_TYPE',
    ],
    ['OPENAI_API_KEY', 'OPENAI_API_BASE', 'OPENAI_MODEL', 'OPENAI_API_TYPE'],
  ] as const

  for (const [apiKeyName, apiBaseName, modelName, apiTypeName] of candidates) {
    const apiKey = process.env[apiKeyName]
    const model = process.env[modelName]

    if (!apiKey || !model) {
      continue
    }

    return {
      apiKey,
      apiBase: process.env[apiBaseName] || 'https://api.openai.com/v1',
      model,
      apiType: normalizeOpenAiApiType(process.env[apiTypeName] ?? process.env.OPENAI_API_TYPE),
    }
  }

  return null
}
