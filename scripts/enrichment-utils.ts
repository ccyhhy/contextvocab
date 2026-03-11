import { createHash } from 'crypto'
import { mkdirSync, writeFileSync } from 'fs'
import path from 'path'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceRoleClient, normalizeWord } from './official-word-utils'

const DEFAULT_TIMEOUT_MS = 12000
const AI_TIMEOUT_MS = 25000
const ENRICHED_DATA_VERSION = 1
const DEFAULT_OUTPUT_FILE = path.join(process.cwd(), 'data', 'enriched', 'word-profiles.generated.json')
const AI_MAX_EXAMPLES = 2

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
  generationMethod: 'fallback' | 'ai'
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
  }
  items: EnrichedWordRecord[]
}

export interface EnrichCliOptions {
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
  study: ['study', 'student', 'school', 'class', 'teacher', 'exam', 'homework', 'university'],
  work: ['work', 'job', 'office', 'company', 'manager', 'team', 'project', 'meeting', 'boss'],
  money: ['money', 'price', 'cost', 'budget', 'market', 'tax', 'pay', 'payment'],
  health: ['health', 'doctor', 'hospital', 'patient', 'pain', 'wound', 'blood', 'exercise'],
  time: ['time', 'deadline', 'schedule', 'urgent', 'late', 'early', 'today', 'tomorrow'],
  travel: ['travel', 'trip', 'airport', 'train', 'flight', 'hotel', 'road', 'bus'],
  technology: ['computer', 'software', 'internet', 'phone', 'data', 'system', 'online', 'digital'],
  relationships: ['friend', 'family', 'mother', 'father', 'child', 'children', 'wife', 'husband', 'baby', 'girl', 'boy'],
  communication: ['say', 'speak', 'tell', 'talk', 'ask', 'answer', 'report', 'message'],
  emotions: ['happy', 'sad', 'angry', 'worried', 'afraid', 'fear', 'love', 'stress'],
  government: ['government', 'policy', 'law', 'public', 'official', 'tax', 'vote'],
}

export function parseEnrichCliArgs(argv: string[]): EnrichCliOptions {
  return {
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
    query = query.in('word', options.words.map((item) => normalizeWord(item).toLowerCase()))
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
  const normalizedWord = normalizeWord(word).toLowerCase()
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
  const normalizedWord = normalizeWord(word).toLowerCase()
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
  options: { withAi: boolean }
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
  const aiResult = options.withAi
    ? await tryGenerateAiProfile(wordRow, dictionaryEvidence, datamuseEvidence, collocations, evidenceExamples)
    : null

  const examples = selectBestExamples([
    ...evidenceExamples,
    ...(aiResult?.examples ?? []),
  ]).map((item, index) => ({
    ...item,
    isPrimary: index === 0,
  }))

  const profile = aiResult?.profile ?? fallbackProfile
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
      sourceName: 'ai_summary',
      sourceKind: 'profile_generation',
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

  const confidenceScore = clamp(
    0.35 +
      (dictionaryEvidence ? 0.2 : 0) +
      (examples.length >= 2 ? 0.2 : 0) +
      (collocations.length >= 3 ? 0.15 : 0) +
      (contrastWords.length >= 2 ? 0.1 : 0),
    0.35,
    0.92
  )

  return {
    coreMeaning: wordRow.definition.trim(),
    semanticFeel: buildSemanticFeel(sceneTags, collocations),
    usageNote: buildUsageNote(sceneTags, collocations, examples.length),
    usageRegister: inferUsageRegister(dictionaryEvidence, wordRow.tags),
    sceneTags,
    collocations,
    contrastWords,
    confidenceScore: Number(confidenceScore.toFixed(2)),
    generationMethod: 'fallback',
  }
}

async function tryGenerateAiProfile(
  wordRow: SourceWordRow,
  dictionaryEvidence: DictionaryEvidence | null,
  datamuseEvidence: DatamuseEvidence,
  collocations: string[],
  examples: WordExampleInput[]
) {
  const apiKey = process.env.OPENAI_ENRICH_API_KEY || process.env.OPENAI_API_KEY
  const apiBase = process.env.OPENAI_ENRICH_API_BASE || process.env.OPENAI_API_BASE || 'https://api.openai.com/v1'
  const model = process.env.OPENAI_ENRICH_MODEL || process.env.OPENAI_MODEL

  if (!apiKey || !model) {
    return null
  }

  const response = await fetchJsonWithTimeout<{
    choices?: Array<{
      message?: {
        content?: unknown
      }
    }>
  }>(
    `${apiBase}/chat/completions`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content: [
              'You build learner-friendly lexical profiles for a Chinese English learner.',
              'Use only the supplied evidence. If evidence is weak, be conservative.',
              'Return JSON only.',
              'Write all explanatory text in Simplified Chinese.',
              'Schema:',
              '{"coreMeaning":"...", "semanticFeel":"...", "usageNote":"...", "usageRegister":"formal|neutral|informal|null", "sceneTags":["..."], "collocations":["..."], "contrastWords":[{"word":"...","note":"..."}], "confidenceScore":0.0, "exampleSuggestions":[{"sentence":"...","translation":"...","scene":"..."}]}',
              `Only include exampleSuggestions when the real examples are insufficient, and cap them at ${AI_MAX_EXAMPLES}.`,
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
                realExamples: examples.map((item) => item.sentence),
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
    return null
  }

  try {
    const parsed = parseJsonObject(content) as Record<string, unknown>
    const profile: WordProfileInput = {
      coreMeaning: toOptionalString(parsed.coreMeaning) ?? wordRow.definition,
      semanticFeel:
        toOptionalString(parsed.semanticFeel) ??
        buildSemanticFeel(inferSceneTags([wordRow.definition]), collocations),
      usageNote:
        toOptionalString(parsed.usageNote) ??
        buildUsageNote(inferSceneTags([wordRow.definition]), collocations, examples.length),
      usageRegister: normalizeRegisterValue(parsed.usageRegister),
      sceneTags: dedupeStrings(normalizeStringList(parsed.sceneTags)).slice(0, 6),
      collocations: dedupeStrings(normalizeStringList(parsed.collocations)).slice(0, 8),
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
      generationMethod: 'ai',
    }

    if (profile.sceneTags.length === 0) {
      profile.sceneTags = inferSceneTags([wordRow.definition, ...examples.map((item) => item.sentence)])
    }

    if (profile.collocations.length === 0) {
      profile.collocations = collocations.slice(0, 8)
    }

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

    return {
      profile,
      examples: generatedExamples,
      rawPayload: parsed,
    }
  } catch {
    return null
  }
}

function deriveCollocations(
  word: string,
  examples: WordExampleInput[],
  datamuseEvidence: DatamuseEvidence,
  primaryPartOfSpeech: string | null
) {
  const normalizedWord = word.toLowerCase()
  const candidates = new Set<string>()

  for (const example of examples) {
    for (const phrase of extractExamplePhrases(normalizedWord, example.sentence)) {
      candidates.add(phrase)
    }
  }

  const normalizedPos = primaryPartOfSpeech?.toLowerCase() ?? ''

  if (normalizedPos === 'noun' || !normalizedPos) {
    for (const left of datamuseEvidence.leftCollocationHints) {
      candidates.add(`${left} ${normalizedWord}`)
    }
  }

  if (normalizedPos === 'adjective' || normalizedPos === 'noun' || !normalizedPos) {
    for (const right of datamuseEvidence.rightCollocationHints) {
      candidates.add(`${normalizedWord} ${right}`)
    }
  }

  return Array.from(candidates)
    .map((item) => item.trim())
    .filter((item) => item.includes(' '))
    .filter((item) => !/^(a|an|the)\s/i.test(item))
    .filter((item) => !/\s(a|an|the)$/i.test(item))
    .slice(0, 8)
}

function extractExamplePhrases(word: string, sentence: string) {
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
    const prev = tokens[index - 1]
    const next = tokens[index + 1]

    if (prev && !isWeakCollocationToken(prev)) {
      if (isBeVerb(prev) && token.endsWith('ed')) {
        matches.push(`be ${token}`)
      } else {
        matches.push(`${prev} ${token}`)
      }
    }

    if (next && !isWeakCollocationToken(next)) {
      matches.push(`${token} ${next}`)
    }

    if (prev && next && !isWeakCollocationToken(prev) && !isWeakCollocationToken(next)) {
      matches.push(`${prev} ${token} ${next}`)
    }
  }

  return dedupeStrings(matches)
}

function isWeakCollocationToken(token: string) {
  return ['a', 'an', 'the', 'this', 'that', 'these', 'those', 'my', 'your', 'his', 'her', 'our', 'their'].includes(
    token
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

function inferSceneTags(texts: string[]) {
  const scoreMap = new Map<string, number>()
  const combinedText = texts.join(' ').toLowerCase()

  for (const [scene, keywords] of Object.entries(SCENE_KEYWORDS)) {
    const score = keywords.reduce((count, keyword) => (combinedText.includes(keyword) ? count + 1 : count), 0)
    if (score > 0) {
      scoreMap.set(scene, score)
    }
  }

  const ranked = [...scoreMap.entries()]
    .sort((left, right) => right[1] - left[1])
  const topScore = ranked[0]?.[1] ?? 0

  if (ranked.length === 1 && topScore <= 1) {
    return ['general']
  }

  return ranked.length > 0 ? ranked.slice(0, 4).map(([scene]) => scene) : ['general']
}

function inferPrimarySceneTag(text: string) {
  return inferSceneTags([text])[0] ?? 'general'
}

function buildSemanticFeel(sceneTags: string[], collocations: string[]) {
  const sceneText = sceneTags.join('、')
  const collocationText = collocations.slice(0, 2).join(' / ')
  if (collocationText) {
    return `这个词常见于 ${sceneText} 场景，通常和 ${collocationText} 这类搭配一起记更容易形成语感。`
  }
  return `这个词更适合放回 ${sceneText} 这类具体场景里理解，而不是只背一个孤立释义。`
}

function buildUsageNote(sceneTags: string[], collocations: string[], exampleCount: number) {
  const sceneText = sceneTags.join('、')
  const collocationText = collocations.slice(0, 3).join('、')
  if (collocationText && exampleCount > 0) {
    return `先连着搭配记 ${collocationText}，再参考例句替换人物、时间或地点，把它放进 ${sceneText} 场景里复用。`
  }
  return `先用最短句把它放进 ${sceneText} 场景里，再逐步补充更多细节。`
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

  if (wordCount >= 4 && wordCount <= 14) {
    score += 0.15
  } else if (wordCount <= 20) {
    score += 0.05
  } else {
    score -= 0.08
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

  return Number(clamp(score, 0.05, 0.98).toFixed(2))
}

function selectBestExamples(examples: WordExampleInput[]) {
  return examples
    .filter((item) => item.sentence.trim().length > 0)
    .filter((item) => item.qualityScore >= 0.45)
    .sort((left, right) => right.qualityScore - left.qualityScore)
    .slice(0, 4)
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
  return Boolean(
    (process.env.OPENAI_ENRICH_API_KEY || process.env.OPENAI_API_KEY) &&
      (process.env.OPENAI_ENRICH_MODEL || process.env.OPENAI_MODEL)
  )
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
    .map((item) => normalizeWord(item).toLowerCase())
    .filter(Boolean)
}

function normalizeStringList(value: unknown) {
  return dedupeStrings(
    (Array.isArray(value) ? value : [])
      .map((item) => toOptionalString(item))
      .filter((item): item is string => Boolean(item))
  )
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
