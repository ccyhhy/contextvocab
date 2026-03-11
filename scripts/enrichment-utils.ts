import { createHash } from 'crypto'
import { mkdirSync, writeFileSync } from 'fs'
import path from 'path'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceRoleClient, normalizeWord } from './official-word-utils'

const DEFAULT_TIMEOUT_MS = 12000
const AI_TIMEOUT_MS = Number(process.env.OPENAI_ENRICH_TIMEOUT_MS || 65000)
const AI_RETRY_COUNT = 2
const ENRICHED_DATA_VERSION = 2
const DEFAULT_OUTPUT_FILE = path.join(process.cwd(), 'data', 'enriched', 'word-profiles.generated.json')
const AI_MAX_EXAMPLES = 2
const CHAT_COMPLETIONS_SUFFIX = '/chat/completions'

export type EnrichmentStage = 'base' | 'refine'
type AiTask = 'base' | 'refine' | 'example'

interface AiConfig {
  apiKey: string
  apiBase: string
  model: string
}

const SCENE_LABELS: Record<string, string> = {
  general: '通用',
  study: '学习',
  work: '工作',
  money: '金钱',
  health: '健康',
  time: '时间',
  travel: '出行',
  technology: '科技',
  relationships: '关系',
  communication: '沟通',
  emotions: '情绪',
  government: '公共事务',
  safety: '安全',
  environment: '环境',
}

const AI_SCENE_TAGS = Object.keys(SCENE_LABELS)

const ARTICLE_TOKENS = new Set(['a', 'an', 'the'])
const COMMON_PREPOSITIONS = new Set([
  'about',
  'across',
  'after',
  'against',
  'around',
  'at',
  'before',
  'behind',
  'between',
  'by',
  'for',
  'from',
  'in',
  'into',
  'of',
  'off',
  'on',
  'onto',
  'over',
  'through',
  'to',
  'toward',
  'under',
  'with',
  'without',
])
const COMMON_FUNCTION_WORDS = new Set([
  ...ARTICLE_TOKENS,
  ...COMMON_PREPOSITIONS,
  'and',
  'or',
  'but',
  'if',
  'so',
  'than',
  'that',
  'this',
  'these',
  'those',
  'my',
  'your',
  'his',
  'her',
  'our',
  'their',
  'its',
  'i',
  'you',
  'he',
  'she',
  'we',
  'they',
  'me',
  'him',
  'them',
  'it',
  'will',
  'would',
  'can',
  'could',
  'should',
  'may',
  'might',
  'must',
  'do',
  'does',
  'did',
  'have',
  'has',
  'had',
  'not',
])

interface DatamuseWord {
  word?: unknown
}

interface DictionaryApiLicense {
  name?: unknown
  url?: unknown
}

interface DictionaryApiPhonetic {
  text?: unknown
}

interface DictionaryApiDefinition {
  definition?: unknown
  example?: unknown
  synonyms?: unknown
  antonyms?: unknown
}

interface DictionaryApiMeaning {
  partOfSpeech?: unknown
  definitions?: unknown
  synonyms?: unknown
  antonyms?: unknown
}

interface DictionaryApiEntry {
  phonetic?: unknown
  phonetics?: unknown
  meanings?: unknown
  license?: DictionaryApiLicense | null
  sourceUrls?: unknown
}

export interface SourceWordRow {
  id: string
  word: string
  phonetic: string | null
  definition: string
  tags: string | null
  example: string | null
}

export interface WordContrastInput {
  word: string
  note: string
}

export interface WordProfileInput {
  coreMeaning: string
  semanticFeel: string
  usageNote: string
  usageRegister: string | null
  sceneTags: string[]
  collocations: string[]
  contrastWords: WordContrastInput[]
  confidenceScore: number
  generationMethod: 'fallback_base' | 'ai_base' | 'fallback_refine' | 'ai_refine' | 'fallback' | 'ai'
}

export interface WordExampleInput {
  sentence: string
  translation: string | null
  scene: string | null
  sourceName: string
  sourceUrl: string | null
  license: string | null
  qualityScore: number
  isPrimary: boolean
}

export interface WordSourceInput {
  sourceName: string
  sourceKind: string
  sourceUrl: string | null
  license: string | null
  payload: unknown
  payloadHash: string
}

export interface EnrichedWordRecord {
  word: string
  wordId: string
  definition: string
  phonetic: string | null
  tags: string | null
  profile: WordProfileInput
  examples: WordExampleInput[]
  sources: WordSourceInput[]
}

export interface EnrichedWordDataset {
  version: number
  generatedAt: string
  selection: {
    tag: string | null
    limit: number
    offset: number
    words: string[]
    stage: EnrichmentStage
  }
  items: EnrichedWordRecord[]
}

export interface EnrichCliOptions {
  stage: EnrichmentStage
  tag: string | null
  limit: number
  offset: number
  words: string[]
  output: string
  dryRun: boolean
  withAi: boolean
}

export interface ImportCliOptions {
  input: string
  dryRun: boolean
  syncPrimaryExample: boolean
  minExamples: number
  minCollocations: number
}

export interface DictionaryMeaningSummary {
  partOfSpeech: string | null
  definitions: string[]
  examples: string[]
  synonyms: string[]
  antonyms: string[]
}

export interface DictionaryEvidence {
  phonetic: string | null
  meanings: DictionaryMeaningSummary[]
  examples: WordExampleInput[]
  sourceUrl: string | null
  license: string | null
  rawPayload: unknown
}

export interface DatamuseEvidence {
  meaningHints: string[]
  synonymHints: string[]
  associationHints: string[]
  leftCollocationHints: string[]
  rightCollocationHints: string[]
  rawPayload: Record<string, unknown>
}

const SCENE_KEYWORDS: Record<string, string[]> = {
  safety: ['danger', 'risk', 'safety', 'safe', 'hazard', 'warning', 'injury', 'accident', 'fire', 'emergency'],
  study: ['study', 'student', 'school', 'class', 'teacher', 'exam', 'homework', 'university'],
  work: ['work', 'job', 'office', 'company', 'manager', 'team', 'project', 'meeting', 'boss'],
  money: ['money', 'price', 'cost', 'budget', 'market', 'tax', 'pay', 'payment'],
  health: ['health', 'doctor', 'hospital', 'patient', 'pain', 'wound', 'blood', 'exercise'],
  time: ['time', 'deadline', 'schedule', 'urgent', 'late', 'early', 'today', 'tomorrow'],
  travel: ['travel', 'trip', 'airport', 'train', 'flight', 'hotel', 'road', 'bus'],
  technology: ['computer', 'software', 'internet', 'phone', 'data', 'system', 'online', 'digital'],
  environment: ['environment', 'pollution', 'waste', 'climate', 'chemical', 'toxic', 'smoke', 'water', 'air'],
  relationships: ['friend', 'family', 'mother', 'father', 'child', 'children', 'wife', 'husband', 'baby', 'girl', 'boy'],
  communication: ['say', 'speak', 'tell', 'talk', 'ask', 'answer', 'report', 'message'],
  emotions: ['happy', 'sad', 'angry', 'worried', 'afraid', 'fear', 'love', 'stress'],
  government: ['government', 'policy', 'law', 'public', 'official', 'tax', 'vote'],
}

export function parseEnrichCliArgs(argv: string[]): EnrichCliOptions {
  const stage = normalizeEnrichmentStage(getStringArg(argv, '--stage')) ?? 'base'
  return {
    stage,
    tag: getStringArg(argv, '--tag') ?? null,
    limit: getNumberArg(argv, '--limit', 50),
    offset: getNumberArg(argv, '--offset', 0),
    words: getListArg(argv, '--words'),
    output: getStringArg(argv, '--output') ?? DEFAULT_OUTPUT_FILE,
    dryRun: hasFlag(argv, '--dry-run'),
    withAi: hasFlag(argv, '--with-ai') || (!hasFlag(argv, '--no-ai') && hasAnyAiConfig()),
  }
}

export function parseImportCliArgs(argv: string[]): ImportCliOptions {
  return {
    input: getStringArg(argv, '--input') ?? DEFAULT_OUTPUT_FILE,
    dryRun: hasFlag(argv, '--dry-run'),
    syncPrimaryExample: !hasFlag(argv, '--skip-sync-example'),
    minExamples: getNumberArg(argv, '--min-examples', 0),
    minCollocations: getNumberArg(argv, '--min-collocations', 0),
  }
}

export function createEnrichmentClient() {
  return createServiceRoleClient()
}

export function getDefaultOutputFile() {
  return DEFAULT_OUTPUT_FILE
}

export async function fetchSourceWords(
  supabase: SupabaseClient,
  options: Pick<EnrichCliOptions, 'tag' | 'limit' | 'offset' | 'words'>
) {
  let query = supabase
    .from('words')
    .select('id, word, phonetic, definition, tags, example')
    .order('word', { ascending: true })

  if (options.words.length > 0) {
    query = query.in('word', options.words.map((item) => normalizeWord(item)))
  } else if (options.tag) {
    query = query.ilike('tags', `%${options.tag}%`)
  }

  query = query.range(options.offset, options.offset + Math.max(options.limit - 1, 0))

  const { data, error } = await query
  if (error) {
    throw error
  }

  return ((data ?? []) as SourceWordRow[]).filter(
    (item) => typeof item.id === 'string' && typeof item.word === 'string' && typeof item.definition === 'string'
  )
}

export async function fetchDictionaryEvidence(word: string): Promise<DictionaryEvidence | null> {
  const normalizedWord = normalizeWord(word)
  if (!normalizedWord) {
    return null
  }

  const payload = await fetchJsonWithTimeout<unknown>(
    `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(normalizedWord)}`
  )

  if (!Array.isArray(payload) || payload.length === 0) {
    return null
  }

  const entry = payload[0] as DictionaryApiEntry
  const phonetic = firstNonEmptyString([
    toOptionalString(entry.phonetic),
    ...((Array.isArray(entry.phonetics) ? entry.phonetics : []) as DictionaryApiPhonetic[]).map((item) =>
      toOptionalString(item.text)
    ),
  ])
  const sourceUrl = firstNonEmptyString(
    (Array.isArray(entry.sourceUrls) ? entry.sourceUrls : []).map((item) => toOptionalString(item))
  )
  const license = [toOptionalString(entry.license?.name), toOptionalString(entry.license?.url)]
    .filter(Boolean)
    .join(' | ') || null

  const meanings = ((Array.isArray(entry.meanings) ? entry.meanings : []) as DictionaryApiMeaning[])
    .map((meaning) => {
      const definitions = ((Array.isArray(meaning.definitions) ? meaning.definitions : []) as DictionaryApiDefinition[])
        .map((definition) => ({
          definition: toOptionalString(definition.definition),
          example: toOptionalString(definition.example),
          synonyms: normalizeStringList(definition.synonyms),
          antonyms: normalizeStringList(definition.antonyms),
        }))
        .filter((item) => Boolean(item.definition))

      return {
        partOfSpeech: toOptionalString(meaning.partOfSpeech),
        definitions: definitions.map((item) => item.definition as string),
        examples: definitions.map((item) => item.example).filter((item): item is string => Boolean(item)),
        synonyms: dedupeStrings([
          ...normalizeStringList(meaning.synonyms),
          ...definitions.flatMap((item) => item.synonyms),
        ]),
        antonyms: dedupeStrings([
          ...normalizeStringList(meaning.antonyms),
          ...definitions.flatMap((item) => item.antonyms),
        ]),
      } satisfies DictionaryMeaningSummary
    })
    .filter((item) => item.definitions.length > 0)

  const examples = selectBestExamples(
    dedupeStrings(meanings.flatMap((item) => item.examples)).map((sentence) => ({
      sentence,
      translation: null,
      scene: inferPrimarySceneTag(`${word} ${sentence}`),
      sourceName: 'dictionaryapi',
      sourceUrl,
      license,
      qualityScore: scoreExampleSentence(word, sentence),
      isPrimary: false,
    }))
  )

  return {
    phonetic,
    meanings,
    examples,
    sourceUrl,
    license,
    rawPayload: payload,
  }
}

export async function fetchDatamuseEvidence(word: string): Promise<DatamuseEvidence> {
  const normalizedWord = normalizeWord(word)
  const [meaningHints, synonymHints, associationHints, leftCollocationHints, rightCollocationHints] =
    await Promise.all([
      fetchDatamuseWordList(`https://api.datamuse.com/words?ml=${encodeURIComponent(normalizedWord)}&max=8&md=p`),
      fetchDatamuseWordList(`https://api.datamuse.com/words?rel_syn=${encodeURIComponent(normalizedWord)}&max=8&md=p`),
      fetchDatamuseWordList(`https://api.datamuse.com/words?rel_trg=${encodeURIComponent(normalizedWord)}&max=8&md=p`),
      fetchDatamuseWordList(`https://api.datamuse.com/words?rel_jjb=${encodeURIComponent(normalizedWord)}&max=8&md=p`),
      fetchDatamuseWordList(`https://api.datamuse.com/words?rel_jja=${encodeURIComponent(normalizedWord)}&max=8&md=p`),
    ])

  return {
    meaningHints: pickDatamuseWords(meaningHints),
    synonymHints: pickDatamuseWords(synonymHints),
    associationHints: pickDatamuseWords(associationHints),
    leftCollocationHints: pickDatamuseWords(leftCollocationHints),
    rightCollocationHints: pickDatamuseWords(rightCollocationHints),
    rawPayload: {
      meaningHints,
      synonymHints,
      associationHints,
      leftCollocationHints,
      rightCollocationHints,
    },
  }
}

export async function generateEnrichedRecord(
  wordRow: SourceWordRow,
  options: { withAi: boolean; stage: EnrichmentStage }
): Promise<EnrichedWordRecord> {
  const dictionaryEvidence = await fetchDictionaryEvidence(wordRow.word)
  const datamuseEvidence = await fetchDatamuseEvidence(wordRow.word)
  const seedExample = buildSeedExample(wordRow)
  const evidenceExamples = selectBestExamples([
    ...(dictionaryEvidence?.examples ?? []),
    ...(seedExample ? [seedExample] : []),
  ])

  const primaryPartOfSpeech = dictionaryEvidence?.meanings[0]?.partOfSpeech ?? null
  const collocations = deriveCollocations(
    wordRow.word,
    evidenceExamples,
    datamuseEvidence,
    primaryPartOfSpeech
  )
  const fallbackProfile = buildFallbackProfile(wordRow, dictionaryEvidence, datamuseEvidence, collocations, evidenceExamples)
  const baseFallbackProfile = buildBaseProfile(fallbackProfile)

  const aiResult =
    options.withAi && options.stage === 'base'
      ? await tryGenerateAiBaseProfile(wordRow, dictionaryEvidence, datamuseEvidence, collocations, evidenceExamples)
      : options.withAi
        ? await tryGenerateAiRefineProfile(wordRow, dictionaryEvidence, datamuseEvidence, collocations, evidenceExamples)
        : null

  const examples =
    options.stage === 'base'
      ? selectBestExamples(evidenceExamples).map((item, index) => ({
          ...item,
          isPrimary: index === 0,
        }))
      : selectBestExamples([
          ...evidenceExamples,
          ...(aiResult?.examples ?? []),
        ]).map((item, index) => ({
          ...item,
          isPrimary: index === 0,
        }))

  const profile =
    options.stage === 'base'
      ? aiResult?.profile ?? baseFallbackProfile
      : aiResult?.profile ?? fallbackProfile
  const sources: WordSourceInput[] = [
    {
      sourceName: 'seed_words',
      sourceKind: 'seed_definition',
      sourceUrl: null,
      license: null,
      payload: {
        definition: wordRow.definition,
        phonetic: wordRow.phonetic,
        example: wordRow.example,
        tags: wordRow.tags,
      },
      payloadHash: computePayloadHash({
        definition: wordRow.definition,
        phonetic: wordRow.phonetic,
        example: wordRow.example,
        tags: wordRow.tags,
      }),
    },
    {
      sourceName: 'datamuse',
      sourceKind: 'association_lookup',
      sourceUrl: `https://api.datamuse.com/words?ml=${encodeURIComponent(wordRow.word)}`,
      license: null,
      payload: datamuseEvidence.rawPayload,
      payloadHash: computePayloadHash(datamuseEvidence.rawPayload),
    },
  ]

  if (dictionaryEvidence) {
    sources.push({
      sourceName: 'dictionaryapi',
      sourceKind: 'dictionary_lookup',
      sourceUrl: dictionaryEvidence.sourceUrl,
      license: dictionaryEvidence.license,
      payload: dictionaryEvidence.rawPayload,
      payloadHash: computePayloadHash(dictionaryEvidence.rawPayload),
    })
  }

  if (aiResult) {
    sources.push({
      sourceName: options.stage === 'base' ? 'ai_base_summary' : 'ai_refine_summary',
      sourceKind: options.stage === 'base' ? 'base_profile_generation' : 'refine_profile_generation',
      sourceUrl: null,
      license: null,
      payload: aiResult.rawPayload,
      payloadHash: computePayloadHash(aiResult.rawPayload),
    })
  }

  return {
    word: wordRow.word,
    wordId: wordRow.id,
    definition: wordRow.definition,
    phonetic: dictionaryEvidence?.phonetic ?? wordRow.phonetic ?? null,
    tags: wordRow.tags ?? null,
    profile,
    examples,
    sources,
  }
}

export function buildDataset(
  items: EnrichedWordRecord[],
  selection: EnrichedWordDataset['selection']
): EnrichedWordDataset {
  return {
    version: ENRICHED_DATA_VERSION,
    generatedAt: new Date().toISOString(),
    selection,
    items,
  }
}

export function summarizeEnrichedRecord(record: EnrichedWordRecord) {
  return {
    word: record.word,
    method: record.profile.generationMethod,
    sceneTags: record.profile.sceneTags,
    collocations: record.profile.collocations,
    examples: record.examples.map((item) => item.sentence),
  }
}

export function writeEnrichedDataset(filePath: string, dataset: EnrichedWordDataset) {
  const resolvedPath = path.resolve(filePath)
  mkdirSync(path.dirname(resolvedPath), { recursive: true })
  writeFileSync(resolvedPath, `${JSON.stringify(dataset, null, 2)}\n`, 'utf-8')
  return resolvedPath
}

function buildChatCompletionsUrl(apiBase: string) {
  const trimmed = apiBase.trim().replace(/\/+$/, '')
  return trimmed.endsWith(CHAT_COMPLETIONS_SUFFIX)
    ? trimmed
    : `${trimmed}${CHAT_COMPLETIONS_SUFFIX}`
}

function formatSceneTagsForChinese(sceneTags: string[]) {
  return sceneTags.map((tag) => SCENE_LABELS[tag] ?? tag).join('、')
}

function buildSeedExample(wordRow: SourceWordRow): WordExampleInput | null {
  const sentence = wordRow.example?.trim()
  if (!sentence) {
    return null
  }

  return {
    sentence,
    translation: null,
    scene: inferPrimarySceneTag(`${wordRow.word} ${sentence}`),
    sourceName: 'seed_words',
    sourceUrl: null,
    license: null,
    qualityScore: scoreExampleSentence(wordRow.word, sentence),
    isPrimary: false,
  }
}

function buildBaseProfile(profile: WordProfileInput): WordProfileInput {
  return {
    ...profile,
    semanticFeel: '',
    usageNote: '',
    contrastWords: [],
    generationMethod:
      profile.generationMethod === 'ai' || profile.generationMethod === 'ai_refine'
        ? 'ai_base'
        : 'fallback_base',
  }
}

function buildFallbackProfile(
  wordRow: SourceWordRow,
  dictionaryEvidence: DictionaryEvidence | null,
  datamuseEvidence: DatamuseEvidence,
  collocations: string[],
  examples: WordExampleInput[]
): WordProfileInput {
  const sceneTags = inferSceneTags([
    wordRow.definition,
    ...(dictionaryEvidence?.meanings.flatMap((item) => item.definitions) ?? []),
    ...examples.map((item) => item.sentence),
  ])

  const contrastWords = dedupeContrastWords([
    ...datamuseEvidence.synonymHints.slice(0, 5).map((item) => ({
      word: item,
      note: `与 ${wordRow.word} 语义接近，使用时需要再结合上下文确认侧重点。`,
    })),
    ...(dictionaryEvidence?.meanings[0]?.synonyms.slice(0, 3).map((item) => ({
      word: item,
      note: '这是词典中的近义项，适合后续人工补充更细的辨析。',
    })) ?? []),
  ]).slice(0, 5)
  const refinedContrastWords = contrastWords
    .map((item) => ({
      word: item.word,
      note: item.note.includes('词典')
        ? '这是词典里的近义词线索，适合后续再补更细的辨析。'
        : `和 ${wordRow.word} 意思接近，但具体语气、场景或侧重点可能不同，建议结合例句再区分。`,
    }))
    .slice(0, 3)

  const confidenceScore = clamp(
    0.35 +
      (dictionaryEvidence ? 0.2 : 0) +
      (examples.length >= 2 ? 0.2 : 0) +
      (collocations.length >= 3 ? 0.15 : 0) +
      (refinedContrastWords.length >= 2 ? 0.1 : 0),
    0.35,
    0.92
  )

  return {
    coreMeaning: wordRow.definition.trim(),
    semanticFeel: buildLearnerSemanticFeel(sceneTags, collocations),
    usageNote: buildLearnerUsageNote(sceneTags, collocations, examples.length),
    usageRegister: inferUsageRegister(dictionaryEvidence, wordRow.tags),
    sceneTags,
    collocations,
    contrastWords: refinedContrastWords,
    confidenceScore: Number(confidenceScore.toFixed(2)),
    generationMethod: 'fallback_refine',
  }
}

async function tryGenerateAiBaseProfile(
  wordRow: SourceWordRow,
  dictionaryEvidence: DictionaryEvidence | null,
  datamuseEvidence: DatamuseEvidence,
  collocations: string[],
  examples: WordExampleInput[]
) {
  const aiConfig = resolveAiConfig('base')
  const primaryPartOfSpeech = dictionaryEvidence?.meanings[0]?.partOfSpeech ?? null

  if (!aiConfig) {
    return null
  }

  for (let attempt = 0; attempt < AI_RETRY_COUNT; attempt += 1) {
    const response = await fetchJsonWithTimeout<{
      choices?: Array<{
        message?: {
          content?: unknown
        }
      }>
    }>(
      buildChatCompletionsUrl(aiConfig.apiBase),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${aiConfig.apiKey}`,
        },
        body: JSON.stringify({
          model: aiConfig.model,
          temperature: 0.1,
          messages: [
            {
              role: 'system',
              content: [
                'You build the fast base layer of a learner-friendly lexical profile for a Chinese CET-4/CET-6 English learner.',
                'Use the supplied evidence as the factual boundary. Rephrase and rank it, but do not invent unsupported senses.',
                'Return JSON only.',
                'Write all explanatory text in Simplified Chinese.',
                `sceneTags must come from this closed set: ${AI_SCENE_TAGS.join(', ')}.`,
                'Keep only the most learnable sense.',
                'Only fill these fields: coreMeaning, usageRegister, sceneTags, collocations, confidenceScore.',
                'collocations: keep 3 to 6 high-value items only. Remove fragments, stopwords, and awkward leftovers.',
                'Schema:',
                '{"coreMeaning":"...", "usageRegister":"formal|neutral|informal|null", "sceneTags":["..."], "collocations":["..."], "confidenceScore":0.0}',
              ].join('\n'),
            },
            {
              role: 'user',
              content: JSON.stringify(
                {
                  word: wordRow.word,
                  seedDefinition: wordRow.definition,
                  seedExample: wordRow.example,
                  tags: wordRow.tags,
                  dictionaryEvidence: dictionaryEvidence
                    ? {
                        phonetic: dictionaryEvidence.phonetic,
                        meanings: dictionaryEvidence.meanings,
                        examples: dictionaryEvidence.examples.map((item) => item.sentence),
                      }
                    : null,
                  datamuseEvidence,
                  derivedCollocations: collocations,
                  realExamples: examples.map((item) => ({
                    sentence: item.sentence,
                    scene: item.scene,
                    qualityScore: item.qualityScore,
                    sourceName: item.sourceName,
                  })),
                },
                null,
                2
              ),
            },
          ],
        }),
      },
      AI_TIMEOUT_MS
    )

    const content = extractChatContent(response?.choices?.[0]?.message?.content)
    if (!content) {
      continue
    }

    try {
      const parsed = parseJsonObject(content) as Record<string, unknown>
      const fallbackProfile = buildBaseProfile(
        buildFallbackProfile(wordRow, dictionaryEvidence, datamuseEvidence, collocations, examples)
      )

      const profile: WordProfileInput = {
        ...fallbackProfile,
        coreMeaning: toOptionalString(parsed.coreMeaning) ?? fallbackProfile.coreMeaning,
        usageRegister: normalizeRegisterValue(parsed.usageRegister) ?? fallbackProfile.usageRegister,
        sceneTags: normalizeAiSceneTags(parsed.sceneTags),
        collocations: normalizeAiCollocations(wordRow.word, parsed.collocations, primaryPartOfSpeech, collocations),
        confidenceScore: clamp(Number(parsed.confidenceScore) || fallbackProfile.confidenceScore, 0.3, 0.95),
        generationMethod: 'ai_base',
      }

      if (profile.sceneTags.length === 0) {
        profile.sceneTags = fallbackProfile.sceneTags
      }

      if (profile.collocations.length === 0) {
        profile.collocations = collocations.slice(0, 8)
      }

      return {
        profile,
        examples: [] as WordExampleInput[],
        rawPayload: parsed,
      }
    } catch {
      continue
    }
  }

  return null
}

async function tryGenerateAiRefineProfile(
  wordRow: SourceWordRow,
  dictionaryEvidence: DictionaryEvidence | null,
  datamuseEvidence: DatamuseEvidence,
  collocations: string[],
  examples: WordExampleInput[]
) {
  const aiConfig = resolveAiConfig('refine')
  const primaryPartOfSpeech = dictionaryEvidence?.meanings[0]?.partOfSpeech ?? null
  const shouldRefreshExamples = needsExampleUpgrade(examples)

  if (!aiConfig) {
    return null
  }

  for (let attempt = 0; attempt < AI_RETRY_COUNT; attempt += 1) {
    const response = await fetchJsonWithTimeout<{
      choices?: Array<{
        message?: {
          content?: unknown
        }
      }>
    }>(
      buildChatCompletionsUrl(aiConfig.apiBase),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${aiConfig.apiKey}`,
        },
        body: JSON.stringify({
          model: aiConfig.model,
          temperature: 0.2,
          messages: [
            {
              role: 'system',
              content: [
                'You build learner-friendly lexical profiles for a Chinese CET-4/CET-6 English learner.',
                'Use the supplied evidence as the factual boundary. Rephrase and rank it, but do not invent unsupported dictionary facts or niche senses.',
                'Optimize for learning value, not exhaustive dictionary coverage.',
                'Return JSON only.',
                'Write all explanatory text in Simplified Chinese.',
                `sceneTags must come from this closed set: ${AI_SCENE_TAGS.join(', ')}.`,
                'coreMeaning: one concise Chinese paraphrase of the most learnable sense. Do not copy the full seed definition verbatim.',
                'semanticFeel: explain what kind of situation, tone, or implied meaning the word usually carries.',
                'usageNote: tell the learner how to reuse the word naturally.',
                'collocations: keep 3 to 6 high-value items only. Remove fragments, stopwords, and awkward leftovers. Prefer adjective+noun, noun phrase, verb+object, verb+preposition, or fixed phrases.',
                'contrastWords: keep at most 3 items, and each note must explain the difference in Chinese instead of saying they are merely similar.',
                'When generating exampleSuggestions, do not reuse, translate, or lightly rewrite any sentence from realExamples.',
                'Avoid archaic, literary, gambling, golf, war, or CPU-specific senses unless the evidence strongly shows that they are the main learner sense.',
                'Prefer everyday CET-style examples in safety, health, environment, school, or work contexts.',
                'Each exampleSuggestion must use the exact target word, or its normal plural form for nouns. Do not replace it with a derived form like hazardous.',
                'Schema:',
                '{"coreMeaning":"...", "semanticFeel":"...", "usageNote":"...", "usageRegister":"formal|neutral|informal|null", "sceneTags":["..."], "collocations":["..."], "contrastWords":[{"word":"...","note":"..."}], "confidenceScore":0.0, "exampleSuggestions":[{"sentence":"...","translation":"...","scene":"..."}]}',
                `If shouldRefreshExamples is true, include 1 or 2 short, natural, easy-to-adapt B1-B2 exampleSuggestions with Chinese translations. Cap them at ${AI_MAX_EXAMPLES}.`,
              ].join('\n'),
            },
            {
              role: 'user',
              content: JSON.stringify(
                {
                  word: wordRow.word,
                  seedDefinition: wordRow.definition,
                  seedExample: wordRow.example,
                  tags: wordRow.tags,
                  dictionaryEvidence: dictionaryEvidence
                    ? {
                        phonetic: dictionaryEvidence.phonetic,
                        meanings: dictionaryEvidence.meanings,
                        examples: dictionaryEvidence.examples.map((item) => item.sentence),
                      }
                    : null,
                  datamuseEvidence,
                  derivedCollocations: collocations,
                  realExamples: examples.map((item) => ({
                    sentence: item.sentence,
                    scene: item.scene,
                    qualityScore: item.qualityScore,
                    sourceName: item.sourceName,
                  })),
                  shouldRefreshExamples,
                },
                null,
                2
              ),
            },
          ],
        }),
      },
      AI_TIMEOUT_MS
    )

    const content = extractChatContent(response?.choices?.[0]?.message?.content)
    if (!content) {
      continue
    }

    try {
      const parsed = parseJsonObject(content) as Record<string, unknown>
      const profile: WordProfileInput = {
        coreMeaning: toOptionalString(parsed.coreMeaning) ?? wordRow.definition,
        semanticFeel:
          toOptionalString(parsed.semanticFeel) ??
          buildLearnerSemanticFeel(inferSceneTags([wordRow.definition]), collocations),
        usageNote:
          toOptionalString(parsed.usageNote) ??
          buildLearnerUsageNote(inferSceneTags([wordRow.definition]), collocations, examples.length),
        usageRegister: normalizeRegisterValue(parsed.usageRegister),
        sceneTags: normalizeAiSceneTags(parsed.sceneTags),
        collocations: normalizeAiCollocations(wordRow.word, parsed.collocations, primaryPartOfSpeech, collocations),
        contrastWords: dedupeContrastWords(
          (Array.isArray(parsed.contrastWords) ? parsed.contrastWords : [])
            .map((item) => {
              if (typeof item !== "object" || item === null) {
                return null
              }

              const record = item as Record<string, unknown>
              const word = toOptionalString(record.word)
              const note = toOptionalString(record.note)
              if (!word || !note) {
                return null
              }

              return { word, note }
            })
            .filter((item): item is WordContrastInput => item !== null)
        ).slice(0, 6),
        confidenceScore: clamp(Number(parsed.confidenceScore) || 0.6, 0.3, 0.98),
        generationMethod: 'ai_refine',
      }

      if (profile.sceneTags.length === 0) {
        profile.sceneTags = inferSceneTags([wordRow.definition, ...examples.map((item) => item.sentence)])
      }

      if (profile.collocations.length === 0) {
        profile.collocations = collocations.slice(0, 8)
      }

      const existingExampleTexts = new Set(
        examples.map((item) => normalizeExampleKey(item.sentence))
      )
      const generatedExampleItems = (Array.isArray(parsed.exampleSuggestions) ? parsed.exampleSuggestions : [])
        .map((item): WordExampleInput | null => {
          if (typeof item !== 'object' || item === null) {
            return null
          }

          const record = item as Record<string, unknown>
          const sentence = toOptionalString(record.sentence)
          if (!sentence) {
            return null
          }

          if (
            existingExampleTexts.has(normalizeExampleKey(sentence)) ||
            !sentenceContainsTargetWord(sentence, wordRow.word)
          ) {
            return null
          }

          return {
            sentence,
            translation: toOptionalString(record.translation),
            scene: toOptionalString(record.scene),
            sourceName: 'ai_generated',
            sourceUrl: null,
            license: null,
            qualityScore: scoreExampleSentence(wordRow.word, sentence),
            isPrimary: false,
          }
        })
        .filter((item): item is WordExampleInput => item !== null)

      const generatedExamples = selectBestExamples(generatedExampleItems).slice(0, AI_MAX_EXAMPLES)
      const finalizedExamples =
        generatedExamples.length > 0 || !shouldRefreshExamples
          ? generatedExamples
          : await tryGenerateAiExamples({
              ...(resolveAiConfig('example') ?? aiConfig),
              word: wordRow.word,
              coreMeaning: profile.coreMeaning,
              sceneTags: profile.sceneTags,
              collocations: profile.collocations,
              existingExamples: examples,
            })

      return {
        profile,
        examples: finalizedExamples,
        rawPayload: parsed,
      }
    } catch {
      continue
    }
  }

  return null
}

async function tryGenerateAiExamples(args: {
  apiKey: string
  apiBase: string
  model: string
  word: string
  coreMeaning: string
  sceneTags: string[]
  collocations: string[]
  existingExamples: WordExampleInput[]
}) {
  const response = await fetchJsonWithTimeout<{
    choices?: Array<{
      message?: {
        content?: unknown
      }
    }>
  }>(
    buildChatCompletionsUrl(args.apiBase),
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${args.apiKey}`,
      },
      body: JSON.stringify({
        model: args.model,
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content: [
              'You generate learner-friendly English example sentences for one target word.',
              'Return JSON only.',
              'Write translations in Simplified Chinese.',
              'Generate exactly 2 short, natural, everyday sentences.',
              'Do not reuse, translate, or lightly rewrite any sentence from bannedExamples.',
              'Avoid literary, archaic, war, gambling, golf, or technical edge-case contexts.',
              'Prefer work, safety, health, school, or environment scenes when they fit.',
              'Each sentence must use the exact target word, or its normal plural form for nouns. Do not swap it with a derived form.',
              'Schema: {"examples":[{"sentence":"...","translation":"...","scene":"..."}]}',
            ].join('\n'),
          },
          {
            role: 'user',
            content: JSON.stringify(
              {
                word: args.word,
                coreMeaning: args.coreMeaning,
                preferredScenes: args.sceneTags,
                helpfulCollocations: args.collocations,
                bannedExamples: args.existingExamples.map((item) => item.sentence),
              },
              null,
              2
            ),
          },
        ],
      }),
    },
    AI_TIMEOUT_MS
  )

  const content = extractChatContent(response?.choices?.[0]?.message?.content)
  if (!content) {
    return []
  }

  try {
    const parsed = parseJsonObject(content) as Record<string, unknown>
    const bannedExamples = new Set(args.existingExamples.map((item) => normalizeExampleKey(item.sentence)))

    return selectBestExamples(
      (Array.isArray(parsed.examples) ? parsed.examples : [])
        .map((item): WordExampleInput | null => {
          if (typeof item !== 'object' || item === null) {
            return null
          }

          const record = item as Record<string, unknown>
          const sentence = toOptionalString(record.sentence)
          if (
            !sentence ||
            bannedExamples.has(normalizeExampleKey(sentence)) ||
            !sentenceContainsTargetWord(sentence, args.word)
          ) {
            return null
          }

          return {
            sentence,
            translation: toOptionalString(record.translation),
            scene: toOptionalString(record.scene),
            sourceName: 'ai_generated',
            sourceUrl: null,
            license: null,
            qualityScore: scoreExampleSentence(args.word, sentence),
            isPrimary: false,
          }
        })
        .filter((item): item is WordExampleInput => item !== null)
    ).slice(0, AI_MAX_EXAMPLES)
  } catch {
    return []
  }
}

function deriveCollocations(
  word: string,
  examples: WordExampleInput[],
  datamuseEvidence: DatamuseEvidence,
  primaryPartOfSpeech: string | null
) {
  const normalizedWord = word.toLowerCase()
  const normalizedPos = primaryPartOfSpeech?.toLowerCase() ?? ''
  const candidateScores = new Map<string, number>()

  for (const example of examples) {
    for (const phrase of extractExamplePhrases(normalizedWord, example.sentence, normalizedPos)) {
      addScoredCandidate(candidateScores, phrase, 1)
    }
  }

  if (normalizedPos === 'noun' || !normalizedPos) {
    for (const left of datamuseEvidence.leftCollocationHints) {
      addScoredCandidate(candidateScores, `${left} ${normalizedWord}`, 1.35)
    }
  }

  if (normalizedPos === 'adjective' || normalizedPos === 'noun' || !normalizedPos) {
    for (const right of datamuseEvidence.rightCollocationHints) {
      addScoredCandidate(candidateScores, `${normalizedWord} ${right}`, normalizedPos === 'noun' ? 0.7 : 1.1)
    }
  }

  return Array.from(candidateScores.entries())
    .map(([phrase, score]) => ({
      phrase: normalizeCollocationCandidate(normalizedWord, phrase),
      score,
    }))
    .filter((item) => isUsefulCollocationCandidate(normalizedWord, item.phrase, normalizedPos))
    .sort((left, right) => right.score - left.score || left.phrase.localeCompare(right.phrase))
    .map((item) => item.phrase)
    .filter((item, index, items) => items.indexOf(item) === index)
    .slice(0, 8)
}

function extractExamplePhrases(word: string, sentence: string, primaryPartOfSpeech: string) {
  const normalized = sentence
    .toLowerCase()
    .replace(/[^a-z\s'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!normalized) {
    return []
  }

  const tokens = normalized.split(' ')
  const matches: string[] = []

  for (let index = 0; index < tokens.length; index += 1) {
    if (!isWordVariantToken(tokens[index], word)) {
      continue
    }

    const token = tokens[index]
    const normalizedToken = normalizeCollocationToken(word, token)
    const prev = tokens[index - 1]
    const prevTwo = tokens[index - 2]
    const next = tokens[index + 1]
    const nextTwo = tokens[index + 2]

    if (prev && !isWeakCollocationToken(prev)) {
      if (isBeVerb(prev) && token.endsWith('ed')) {
        matches.push(`be ${normalizedToken}`)
      } else {
        matches.push(`${prev} ${normalizedToken}`)
      }
    }

    if (next && !isWeakCollocationToken(next)) {
      matches.push(`${normalizedToken} ${next}`)
    }

    if (prev && next && !isWeakCollocationToken(prev) && !isWeakCollocationToken(next)) {
      matches.push(`${prev} ${normalizedToken} ${next}`)
    }

    if (
      primaryPartOfSpeech === 'verb' &&
      next &&
      ARTICLE_TOKENS.has(next) &&
      nextTwo &&
      !isWeakCollocationToken(nextTwo)
    ) {
      matches.push(`${normalizedToken} ${next} ${nextTwo}`)
    }

    if (
      primaryPartOfSpeech === 'adjective' &&
      next &&
      COMMON_PREPOSITIONS.has(next)
    ) {
      matches.push(`${normalizedToken} ${next}`)
    }

    if (
      primaryPartOfSpeech === 'noun' &&
      prevTwo &&
      ARTICLE_TOKENS.has(prev) &&
      !isWeakCollocationToken(prevTwo)
    ) {
      matches.push(`${prevTwo} ${normalizedToken}`)
    }
  }

  return dedupeStrings(matches)
}

function isWeakCollocationToken(token: string) {
  return (
    COMMON_FUNCTION_WORDS.has(token) ||
    /^(i|you|he|she|we|they|it)(?:'ll|'re|'ve|'d|'m|s)$/.test(token)
  )
}

function isBeVerb(token: string) {
  return ['am', 'is', 'are', 'was', 'were', 'be', 'been', 'being'].includes(token)
}

function isWordVariantToken(token: string, baseWord: string) {
  if (token === baseWord) {
    return true
  }

  return [
    `${baseWord}s`,
    `${baseWord}es`,
    `${baseWord}d`,
    `${baseWord}ed`,
    `${baseWord}ing`,
  ].includes(token)
}

function normalizeCollocationToken(baseWord: string, token: string) {
  return isWordVariantToken(token, baseWord) ? baseWord : token
}

function normalizeCollocationCandidate(baseWord: string, candidate: string) {
  return candidate
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((token) => normalizeCollocationToken(baseWord, token))
    .join(' ')
}

function addScoredCandidate(map: Map<string, number>, phrase: string, delta: number) {
  const normalized = phrase.trim().toLowerCase()
  if (!normalized.includes(' ')) {
    return
  }

  map.set(normalized, (map.get(normalized) ?? 0) + delta)
}

function isUsefulCollocationCandidate(baseWord: string, candidate: string, primaryPartOfSpeech: string) {
  const tokens = candidate.split(/\s+/).filter(Boolean)
  if (tokens.length < 2 || tokens.length > 3) {
    return false
  }

  if (tokens.some((token) => !/^[a-z][a-z'-]*$/.test(token))) {
    return false
  }

  const containsBaseWord = tokens.some((token) => token === baseWord)
  if (!containsBaseWord) {
    return false
  }

  const first = tokens[0]
  const last = tokens[tokens.length - 1]
  if (primaryPartOfSpeech === 'noun') {
    if (COMMON_FUNCTION_WORDS.has(first) || COMMON_FUNCTION_WORDS.has(last)) {
      return false
    }
  } else if (primaryPartOfSpeech === 'verb') {
    if (COMMON_FUNCTION_WORDS.has(first) && first !== baseWord) {
      return false
    }
    if (tokens.length === 2 && COMMON_PREPOSITIONS.has(last)) {
      return false
    }
  } else if (primaryPartOfSpeech === 'adjective') {
    if (COMMON_FUNCTION_WORDS.has(first) && first !== baseWord) {
      return false
    }
  }

  if (tokens.length === 2 && COMMON_FUNCTION_WORDS.has(first) && COMMON_FUNCTION_WORDS.has(last)) {
    return false
  }

  return true
}

function inferSceneTags(texts: string[]) {
  const scoreMap = new Map<string, number>()
  const combinedText = texts.join(' ').toLowerCase()

  for (const [scene, keywords] of Object.entries(SCENE_KEYWORDS)) {
    const score = keywords.reduce((count, keyword) => {
      if (!combinedText.includes(keyword)) {
        return count
      }

      const emphasis = scene === 'safety' || scene === 'environment' ? 2 : 1
      return count + emphasis
    }, 0)
    if (score > 0) {
      scoreMap.set(scene, score)
    }
  }

  const ranked = [...scoreMap.entries()]
    .sort((left, right) => right[1] - left[1])

  if (ranked.length === 0) {
    return ['general']
  }

  const topScore = ranked[0]?.[1] ?? 0
  if (topScore <= 1) {
    return ['general']
  }

  return ranked
    .filter(([, score]) => score >= Math.max(2, topScore - 1))
    .slice(0, 4)
    .map(([scene]) => scene)
}

function inferPrimarySceneTag(text: string) {
  return inferSceneTags([text])[0] ?? 'general'
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function buildSemanticFeel(sceneTags: string[], collocations: string[]) {
  const sceneText = sceneTags.join('、')
  const collocationText = collocations.slice(0, 2).join(' / ')
  if (collocationText) {
    return `这个词常见于 ${sceneText} 场景，通常和 ${collocationText} 这类搭配一起记更容易形成语感。`
  }
  return `这个词更适合放回 ${sceneText} 这类具体场景里理解，而不是只背一个孤立释义。`
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function buildUsageNote(sceneTags: string[], collocations: string[], exampleCount: number) {
  const sceneText = sceneTags.join('、')
  const collocationText = collocations.slice(0, 3).join('、')
  if (collocationText && exampleCount > 0) {
    return `先连着搭配记 ${collocationText}，再参考例句替换人物、时间或地点，把它放进 ${sceneText} 场景里复用。`
  }
  return `先用最短句把它放进 ${sceneText} 场景里，再逐步补充更多细节。`
}

function buildLearnerSemanticFeel(sceneTags: string[], collocations: string[]) {
  const sceneText = formatSceneTagsForChinese(sceneTags)
  const collocationText = collocations.slice(0, 2).join(' / ')
  if (collocationText) {
    return `这个词更适合放回 ${sceneText} 这些场景里理解，连着 ${collocationText} 这类搭配一起记，语感会更稳定。`
  }

  return `这个词更适合放回 ${sceneText} 这些具体场景里理解，而不是只背一条孤立释义。`
}

function buildLearnerUsageNote(sceneTags: string[], collocations: string[], exampleCount: number) {
  const sceneText = formatSceneTagsForChinese(sceneTags)
  const collocationText = collocations.slice(0, 3).join('、')
  if (collocationText && exampleCount > 0) {
    return `先连着搭配记 ${collocationText}，再参考例句替换人物、时间或地点，把它放回 ${sceneText} 这些场景里复用。`
  }

  return `先用一个短句把它放进 ${sceneText} 这些场景里，再逐步补充更多细节。`
}

function inferUsageRegister(dictionaryEvidence: DictionaryEvidence | null, tags: string | null) {
  const combined = [
    ...(dictionaryEvidence?.meanings.map((item) => item.partOfSpeech ?? '') ?? []),
    tags ?? '',
  ]
    .join(' ')
    .toLowerCase()

  if (combined.includes('formal') || combined.includes('academic')) {
    return 'formal'
  }
  if (combined.includes('informal') || combined.includes('spoken')) {
    return 'informal'
  }
  return 'neutral'
}

function scoreExampleSentence(word: string, sentence: string) {
  const trimmed = sentence.trim()
  if (!trimmed) {
    return 0
  }

  let score = 0.45
  const wordCount = trimmed.split(/\s+/).length

  if (new RegExp(`\\b${escapeRegExp(normalizeWord(word).toLowerCase())}\\b`, 'i').test(trimmed)) {
    score += 0.2
  }

  if (wordCount >= 5 && wordCount <= 12) {
    score += 0.18
  } else if (wordCount <= 18) {
    score += 0.08
  } else {
    score -= 0.12
  }

  if (!/[;:]/.test(trimmed)) {
    score += 0.05
  }

  if ((trimmed.match(/,/g) ?? []).length > 2) {
    score -= 0.08
  }

  if (/[0-9]/.test(trimmed)) {
    score -= 0.04
  }

  if (/["()]/.test(trimmed)) {
    score -= 0.05
  }

  const internalCapitalizedTokens = trimmed
    .split(/\s+/)
    .slice(1)
    .map((token) => token.replace(/[^A-Za-z'-]/g, ''))
    .filter((token) => /^[A-Z][a-z]+(?:['-][A-Za-z]+)?$/.test(token))
  if (internalCapitalizedTokens.length >= 2) {
    score -= 0.08
  }

  return Number(clamp(score, 0.05, 0.98).toFixed(2))
}

function selectBestExamples(examples: WordExampleInput[]) {
  return dedupeExampleInputs(examples)
    .filter((item) => item.sentence.trim().length > 0)
    .filter((item) => item.qualityScore >= 0.45)
    .sort((left, right) => rankExampleForLearning(right) - rankExampleForLearning(left))
    .slice(0, 4)
}

function rankExampleForLearning(example: WordExampleInput) {
  let score = example.qualityScore
  const wordCount = example.sentence.trim().split(/\s+/).length

  if (example.translation) {
    score += 0.08
  }

  if (example.scene && example.scene !== 'general') {
    score += 0.03
  }

  if (example.sourceName === 'ai_generated') {
    score += 0.18
  }

  if (wordCount >= 5 && wordCount <= 12) {
    score += 0.04
  }

  return Number(score.toFixed(2))
}

function needsExampleUpgrade(examples: WordExampleInput[]) {
  if (examples.length < 2) {
    return true
  }

  return rankExampleForLearning(examples[0]) < 0.78
}

function dedupeExampleInputs(examples: WordExampleInput[]) {
  const map = new Map<string, WordExampleInput>()

  for (const example of examples) {
    const key = normalizeExampleKey(example.sentence)
    const existing = map.get(key)
    if (!existing) {
      map.set(key, example)
      continue
    }

    if (rankExampleForLearning(example) > rankExampleForLearning(existing)) {
      map.set(key, example)
    }
  }

  return Array.from(map.values())
}

function dedupeContrastWords(items: WordContrastInput[]) {
  const seen = new Set<string>()
  const deduped: WordContrastInput[] = []

  for (const item of items) {
    const normalized = normalizeWord(item.word).toLowerCase()
    if (!normalized || seen.has(normalized)) {
      continue
    }

    seen.add(normalized)
    deduped.push({
      word: normalized,
      note: item.note.trim(),
    })
  }

  return deduped
}

async function fetchDatamuseWordList(url: string) {
  const payload = await fetchJsonWithTimeout<unknown>(url)
  return Array.isArray(payload) ? (payload as DatamuseWord[]) : []
}

function pickDatamuseWords(items: DatamuseWord[]) {
  return dedupeStrings(
    items
      .map((item) => toOptionalString(item.word))
      .filter((item): item is string => Boolean(item))
  ).slice(0, 8)
}

async function fetchJsonWithTimeout<T>(input: string, init?: RequestInit, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(input, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(init?.headers ?? {}),
      },
    })

    if (!response.ok) {
      return null
    }

    return (await response.json()) as T
  } catch {
    return null
  } finally {
    clearTimeout(timeoutId)
  }
}

function extractChatContent(content: unknown) {
  if (typeof content === 'string') {
    return content.trim()
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string') {
          return item
        }

        if (typeof item === 'object' && item !== null) {
          return toOptionalString((item as Record<string, unknown>).text) ?? ''
        }

        return ''
      })
      .join('\n')
      .trim()
  }

  return ''
}

function parseJsonObject(text: string) {
  const trimmed = text.trim()
  const candidate = trimmed.match(/\{[\s\S]*\}/)?.[0] ?? trimmed
  return JSON.parse(candidate)
}

function computePayloadHash(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function hasAnyAiConfig() {
  return Boolean(resolveAiConfig('base') || resolveAiConfig('refine') || resolveAiConfig('example'))
}

function resolveAiConfig(task: AiTask): AiConfig | null {
  const candidates =
    task === 'base'
      ? [
          ['OPENAI_ENRICH_BASE_API_KEY', 'OPENAI_ENRICH_BASE_API_BASE', 'OPENAI_ENRICH_BASE_MODEL'],
          ['OPENAI_HINT_API_KEY', 'OPENAI_HINT_API_BASE', 'OPENAI_HINT_MODEL'],
          ['OPENAI_ENRICH_API_KEY', 'OPENAI_ENRICH_API_BASE', 'OPENAI_ENRICH_MODEL'],
          ['OPENAI_API_KEY', 'OPENAI_API_BASE', 'OPENAI_MODEL'],
        ]
      : task === 'example'
        ? [
            ['OPENAI_ENRICH_EXAMPLE_API_KEY', 'OPENAI_ENRICH_EXAMPLE_API_BASE', 'OPENAI_ENRICH_EXAMPLE_MODEL'],
            ['OPENAI_ENRICH_BASE_API_KEY', 'OPENAI_ENRICH_BASE_API_BASE', 'OPENAI_ENRICH_BASE_MODEL'],
            ['OPENAI_HINT_API_KEY', 'OPENAI_HINT_API_BASE', 'OPENAI_HINT_MODEL'],
            ['OPENAI_ENRICH_API_KEY', 'OPENAI_ENRICH_API_BASE', 'OPENAI_ENRICH_MODEL'],
            ['OPENAI_API_KEY', 'OPENAI_API_BASE', 'OPENAI_MODEL'],
          ]
        : [
            ['OPENAI_ENRICH_REFINE_API_KEY', 'OPENAI_ENRICH_REFINE_API_BASE', 'OPENAI_ENRICH_REFINE_MODEL'],
            ['OPENAI_ENRICH_API_KEY', 'OPENAI_ENRICH_API_BASE', 'OPENAI_ENRICH_MODEL'],
            ['OPENAI_API_KEY', 'OPENAI_API_BASE', 'OPENAI_MODEL'],
          ]

  for (const [apiKeyName, apiBaseName, modelName] of candidates) {
    const apiKey = process.env[apiKeyName]
    const model = process.env[modelName]

    if (!apiKey || !model) {
      continue
    }

    return {
      apiKey,
      apiBase: process.env[apiBaseName] || 'https://api.openai.com/v1',
      model,
    }
  }

  return null
}

export function normalizeEnrichmentStage(value: string | null | undefined): EnrichmentStage | null {
  return value === 'base' || value === 'refine' ? value : null
}

function hasFlag(argv: string[], name: string) {
  return argv.includes(name)
}

function getStringArg(argv: string[], name: string) {
  const index = argv.indexOf(name)
  if (index === -1) {
    return null
  }

  const value = argv[index + 1]
  return value && !value.startsWith('--') ? value : null
}

function getNumberArg(argv: string[], name: string, fallback: number) {
  const value = getStringArg(argv, name)
  const parsed = value ? Number(value) : fallback
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

function getListArg(argv: string[], name: string) {
  const value = getStringArg(argv, name)
  if (!value) {
    return []
  }

  return value
    .split(',')
    .map((item) => normalizeWord(item))
    .filter(Boolean)
}

function normalizeAiSceneTags(value: unknown) {
  const tags = dedupeStrings(normalizeStringList(value))
    .map((item) => item.toLowerCase())
    .filter((item) => AI_SCENE_TAGS.includes(item))
  const filtered = tags.length > 1 ? tags.filter((item) => item !== 'general') : tags
  return filtered.slice(0, 4)
}

function normalizeAiCollocations(
  word: string,
  value: unknown,
  primaryPartOfSpeech: string | null,
  fallbackCollocations: string[]
) {
  const normalizedWord = normalizeWord(word).toLowerCase()
  const normalizedPos = primaryPartOfSpeech?.toLowerCase() ?? ''
  const aiCollocations = dedupeStrings(normalizeStringList(value))
    .map((item) => normalizeCollocationCandidate(normalizedWord, item))
    .filter((item) => isUsefulCollocationCandidate(normalizedWord, item, normalizedPos))

  return (aiCollocations.length > 0 ? aiCollocations : fallbackCollocations).slice(0, 8)
}

function normalizeStringList(value: unknown) {
  return dedupeStrings(
    (Array.isArray(value) ? value : [])
      .map((item) => toOptionalString(item))
      .filter((item): item is string => Boolean(item))
  )
}

function normalizeExampleKey(sentence: string) {
  return sentence.trim().toLowerCase().replace(/\s+/g, ' ')
}

function sentenceContainsTargetWord(sentence: string, word: string) {
  const normalizedWord = normalizeWord(word).toLowerCase()
  const tokens = sentence
    .toLowerCase()
    .replace(/[^a-z\s'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)

  return tokens.some((token) => token === normalizedWord || token === `${normalizedWord}s`)
}

function toOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function firstNonEmptyString(items: Array<string | null>) {
  return items.find((item) => Boolean(item)) ?? null
}

function dedupeStrings(items: string[]) {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)))
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function normalizeRegisterValue(value: unknown) {
  if (value === 'formal' || value === 'neutral' || value === 'informal') {
    return value
  }

  return null
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
