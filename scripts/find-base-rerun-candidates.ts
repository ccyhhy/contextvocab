import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs'
import path from 'path'
import { createServiceRoleClient } from './official-word-utils'

const DEFAULT_OUTPUT_FILE = path.join(process.cwd(), 'data', 'enriched', 'base-rerun-candidates.json')
const DEFAULT_LOCAL_INPUT = path.join(process.cwd(), 'data', 'enriched')
const FETCH_CHUNK_SIZE = 1000
const WORD_CHUNK_SIZE = 500
const BASE_GENERATION_METHODS = new Set(['base', 'ai_base', 'fallback_base'])

const WEAK_COLLLOCATION_TOKENS = new Set([
  'general',
  'first',
  'own',
  'same',
  'other',
  'different',
  'another',
  'certain',
  'particular',
  'various',
  'common',
  'basic',
  'simple',
  'single',
  'initial',
  'final',
  'true',
  'false',
  'possible',
  'impossible',
])

interface CliOptions {
  input: string[]
  output: string
  limit: number
  minScore: number
}

interface WordProfileRow {
  word_id: string
  core_meaning: string
  usage_register: string | null
  scene_tags: unknown
  collocations: unknown
  confidence_score: number | null
  generation_method: string
}

interface WordRow {
  id: string
  word: string
  definition: string
  tags: string | null
}

interface EnrichedProfileLike {
  generationMethod?: unknown
  usageRegister?: unknown
  sceneTags?: unknown
  collocations?: unknown
  confidenceScore?: unknown
}

interface EnrichedItemLike {
  word?: unknown
  wordId?: unknown
  definition?: unknown
  tags?: unknown
  profile?: EnrichedProfileLike | null
}

interface ScanRow {
  wordId: string
  word: string
  definition: string
  tags: string | null
  generationMethod: string
  usageRegister: string | null
  sceneTags: unknown
  collocations: unknown
  confidenceScore: number | null
}

interface CandidateRow {
  wordId: string
  word: string
  definition: string
  tags: string | null
  generationMethod: string
  score: number
  reasons: string[]
  usageRegister: string | null
  sceneTags: string[]
  collocations: string[]
  confidenceScore: number | null
}

async function main() {
  const options = parseCliArgs(process.argv.slice(2))
  const sourceDescription =
    options.input.length > 0 ? options.input.map((item) => path.resolve(item)).join(', ') : 'supabase'
  const rows = options.input.length > 0
    ? loadRowsFromLocalInputs(options.input)
    : await loadRowsFromSupabase()

  const candidates = rows
    .map(buildCandidate)
    .filter((item): item is CandidateRow => item !== null)
    .filter((item) => item.score >= options.minScore)
    .sort((left, right) => right.score - left.score || left.word.localeCompare(right.word))

  const limitedCandidates = options.limit > 0 ? candidates.slice(0, options.limit) : candidates
  const payload = {
    generatedAt: new Date().toISOString(),
    source: sourceDescription,
    totalProfiles: rows.length,
    totalCandidates: candidates.length,
    minScore: options.minScore,
    items: limitedCandidates,
  }

  const outputPath = path.resolve(options.output)
  mkdirSync(path.dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8')

  console.log(`Base rerun candidate scan complete`)
  console.log(`  source: ${sourceDescription}`)
  console.log(`  total base profiles: ${rows.length}`)
  console.log(`  matched candidates: ${candidates.length}`)
  console.log(`  written: ${outputPath}`)

  for (const item of limitedCandidates.slice(0, 20)) {
    console.log(
      `  - ${item.word} score=${item.score} reasons=${item.reasons.join('|')} scene=${item.sceneTags.join(',') || '-'} register=${item.usageRegister ?? '-'}`
    )
  }
}

function parseCliArgs(argv: string[]): CliOptions {
  const input = getListArg(argv, '--input')
  return {
    input,
    output: getStringArg(argv, '--output') ?? DEFAULT_OUTPUT_FILE,
    limit: getNumberArg(argv, '--limit', 0),
    minScore: getNumberArg(argv, '--min-score', 3),
  }
}

async function loadRowsFromSupabase() {
  const supabase = createServiceRoleClient()
  const profiles = await fetchAllBaseProfiles(supabase)
  const wordMap = await fetchWordMap(supabase, profiles.map((item) => item.word_id))

  return profiles
    .map((profile) => {
      const wordRow = wordMap.get(profile.word_id)
      if (!wordRow) {
        return null
      }

      return {
        wordId: wordRow.id,
        word: wordRow.word,
        definition: wordRow.definition,
        tags: wordRow.tags ?? null,
        generationMethod: profile.generation_method,
        usageRegister: profile.usage_register,
        sceneTags: profile.scene_tags,
        collocations: profile.collocations,
        confidenceScore: profile.confidence_score,
      } satisfies ScanRow
    })
    .filter((item): item is ScanRow => item !== null)
}

function loadRowsFromLocalInputs(inputs: string[]) {
  const files = expandInputFiles(inputs)
  const rows = new Map<string, ScanRow>()

  for (const filePath of files) {
    const parsed = JSON.parse(readFileSync(filePath, 'utf-8')) as { items?: unknown }
    const items = Array.isArray(parsed.items) ? parsed.items : []

    for (const item of items) {
      const row = normalizeLocalItem(item as EnrichedItemLike)
      if (!row || !BASE_GENERATION_METHODS.has(row.generationMethod)) {
        continue
      }

      rows.set(row.wordId, row)
    }
  }

  if (rows.size === 0) {
    throw new Error(
      `No base items were found in local inputs. Try --input ${DEFAULT_LOCAL_INPUT}`
    )
  }

  return Array.from(rows.values())
}

async function fetchAllBaseProfiles(supabase: ReturnType<typeof createServiceRoleClient>) {
  const profiles: WordProfileRow[] = []
  let from = 0

  while (true) {
    const { data, error } = await supabase
      .from('word_profiles')
      .select('word_id, core_meaning, usage_register, scene_tags, collocations, confidence_score, generation_method')
      .in('generation_method', Array.from(BASE_GENERATION_METHODS))
      .range(from, from + FETCH_CHUNK_SIZE - 1)

    if (error) {
      throw error
    }

    const rows = ((data ?? []) as WordProfileRow[]).filter(
      (item) => typeof item.word_id === 'string' && typeof item.generation_method === 'string'
    )

    profiles.push(...rows)

    if (rows.length < FETCH_CHUNK_SIZE) {
      return profiles
    }

    from += FETCH_CHUNK_SIZE
  }
}

async function fetchWordMap(
  supabase: ReturnType<typeof createServiceRoleClient>,
  wordIds: string[]
) {
  const map = new Map<string, WordRow>()

  for (let index = 0; index < wordIds.length; index += WORD_CHUNK_SIZE) {
    const chunk = wordIds.slice(index, index + WORD_CHUNK_SIZE)
    const { data, error } = await supabase
      .from('words')
      .select('id, word, definition, tags')
      .in('id', chunk)

    if (error) {
      throw error
    }

    for (const row of (data ?? []) as WordRow[]) {
      if (typeof row.id !== 'string' || typeof row.word !== 'string' || typeof row.definition !== 'string') {
        continue
      }

      map.set(row.id, row)
    }
  }

  return map
}

function normalizeLocalItem(item: EnrichedItemLike): ScanRow | null {
  if (!item || typeof item !== 'object' || !item.profile || typeof item.profile !== 'object') {
    return null
  }

  const word = typeof item.word === 'string' ? item.word.trim() : ''
  const wordId =
    typeof item.wordId === 'string' && item.wordId.trim()
      ? item.wordId.trim()
      : word
  const definition = typeof item.definition === 'string' ? item.definition.trim() : ''
  const generationMethod =
    typeof item.profile.generationMethod === 'string' ? item.profile.generationMethod.trim() : ''

  if (!word || !wordId || !definition || !generationMethod) {
    return null
  }

  return {
    wordId,
    word,
    definition,
    tags: typeof item.tags === 'string' ? item.tags.trim() || null : null,
    generationMethod,
    usageRegister:
      typeof item.profile.usageRegister === 'string' && item.profile.usageRegister.trim()
        ? item.profile.usageRegister.trim().toLowerCase()
        : null,
    sceneTags: item.profile.sceneTags ?? [],
    collocations: item.profile.collocations ?? [],
    confidenceScore:
      typeof item.profile.confidenceScore === 'number' ? item.profile.confidenceScore : null,
  }
}

function expandInputFiles(inputs: string[]) {
  const files = new Set<string>()

  for (const rawInput of inputs) {
    const resolvedInput = path.resolve(rawInput)
    const stats = statSync(resolvedInput)

    if (stats.isDirectory()) {
      for (const filePath of walkJsonFiles(resolvedInput)) {
        const basename = path.basename(filePath).toLowerCase()
        if (basename.includes('base') && basename.endsWith('.json')) {
          files.add(filePath)
        }
      }
      continue
    }

    files.add(resolvedInput)
  }

  return Array.from(files).sort((left, right) => left.localeCompare(right))
}

function walkJsonFiles(directoryPath: string): string[] {
  const files: string[] = []

  for (const entry of readdirSync(directoryPath, { withFileTypes: true })) {
    const nextPath = path.join(directoryPath, entry.name)
    if (entry.isDirectory()) {
      files.push(...walkJsonFiles(nextPath))
      continue
    }

    if (entry.isFile() && entry.name.toLowerCase().endsWith('.json')) {
      files.push(nextPath)
    }
  }

  return files
}

function buildCandidate(row: ScanRow): CandidateRow | null {
  const sceneTags = normalizeStringArray(row.sceneTags)
  const collocations = normalizeStringArray(row.collocations)
  const reasons: string[] = []
  let score = 0

  if (sceneTags.length === 0) {
    reasons.push('scene_empty')
    score += 3
  } else if (sceneTags.length === 1 && sceneTags[0] === 'general') {
    reasons.push('scene_general_only')
    score += 3
  }

  if (!row.usageRegister || row.usageRegister === 'neutral') {
    reasons.push('register_generic')
    score += 1
  }

  if (collocations.length < 3) {
    reasons.push('collocation_count_low')
    score += 2
  }

  const weakCollocations = collocations.filter((item) => isWeakCollocation(item, row.word))
  if (weakCollocations.length >= Math.max(2, Math.ceil(collocations.length / 2))) {
    reasons.push(`weak_collocations:${weakCollocations.slice(0, 3).join('|')}`)
    score += 3
  }

  if ((row.confidenceScore ?? 0) < 0.6) {
    reasons.push('confidence_low')
    score += 1
  }

  if (score === 0) {
    return null
  }

  return {
    wordId: row.wordId,
    word: row.word,
    definition: row.definition,
    tags: row.tags,
    generationMethod: row.generationMethod,
    score,
    reasons,
    usageRegister: row.usageRegister,
    sceneTags,
    collocations,
    confidenceScore: row.confidenceScore,
  }
}

function normalizeStringArray(value: unknown) {
  const items =
    Array.isArray(value)
      ? value
      : typeof value === 'string'
        ? safeJsonArrayParse(value)
        : []

  return Array.from(
    new Set(
      items
        .map((item) => (typeof item === 'string' ? item.trim().toLowerCase() : ''))
        .filter(Boolean)
    )
  )
}

function safeJsonArrayParse(value: string): unknown[] {
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function isWeakCollocation(value: string, word: string) {
  const normalized = value.trim().toLowerCase()
  const tokens = normalized.split(/\s+/).filter(Boolean)
  const normalizedWord = word.trim().toLowerCase()

  if (tokens.length < 2 || !tokens.includes(normalizedWord)) {
    return true
  }

  const nonWordTokens = tokens.filter((token) => token !== normalizedWord)
  if (nonWordTokens.some((token) => WEAK_COLLLOCATION_TOKENS.has(token))) {
    return true
  }

  return false
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
    .map((item) => item.trim())
    .filter(Boolean)
}

function getNumberArg(argv: string[], name: string, fallback: number) {
  const value = getStringArg(argv, name)
  const parsed = value ? Number(value) : fallback
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

main().catch((error) => {
  console.error('Base rerun candidate scan failed:', error)
  process.exit(1)
})
