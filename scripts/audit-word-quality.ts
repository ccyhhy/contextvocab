import { mkdirSync, writeFileSync } from 'fs'
import path from 'path'
import { createServiceRoleClient, normalizeWord } from './official-word-utils'

const DEFAULT_OUTPUT_FILE = path.join(process.cwd(), 'data', 'logs', 'word-quality-audit.json')
const DEFAULT_WORDS_DIR = path.join(process.cwd(), 'data', 'enriched', 'quality-audit')
const PAGE_SIZE = 1000
const ALLOWED_HEADWORD_PATTERN = /^[A-Za-z' -]+$/

interface CliOptions {
  output: string
  wordsDir: string
}

interface WordRow {
  id: string
  word: string
  definition: string | null
  tags: string | null
}

interface ProfileRow {
  word_id: string
  usage_register: string | null
  scene_tags: string[] | null
  collocations: unknown
  contrast_words: Array<{ word?: string; note?: string }> | null
  confidence_score: number | null
  generation_method: string | null
}

interface ExampleRow {
  word_id: string
}

interface IssueWordRow {
  wordId: string
  word: string
  definition: string | null
  tags: string | null
}

async function main() {
  const options = parseCliArgs(process.argv.slice(2))
  const supabase = createServiceRoleClient()
  const words = await fetchAllWords(supabase)
  const profiles = await fetchAllProfiles(supabase)
  const examples = await fetchAllExamples(supabase)

  const wordById = new Map(words.map((row) => [row.id, row]))
  const exampleCounts = new Map<string, number>()
  const methodCounts = new Map<string, number>()

  for (const row of examples) {
    exampleCounts.set(row.word_id, (exampleCounts.get(row.word_id) ?? 0) + 1)
  }

  const lexicalNoiseWords = words.filter((row) => isMalformedHeadword(row.word))
  const zeroExampleWords: IssueWordRow[] = []
  const lowExampleWords: IssueWordRow[] = []

  for (const row of words) {
    const exampleCount = exampleCounts.get(row.id) ?? 0
    if (exampleCount === 0) {
      zeroExampleWords.push(toIssueWord(row))
    }
    if (exampleCount < 2) {
      lowExampleWords.push(toIssueWord(row))
    }
  }

  const zeroCollocationWords: IssueWordRow[] = []
  const lowCollocationWords: IssueWordRow[] = []
  const generalOnlyWords: IssueWordRow[] = []
  const legacyGenerationMethodWords: Array<IssueWordRow & { generationMethod: string | null }> = []
  const selfContrastWords: Array<IssueWordRow & { contrastWords: Array<{ word?: string; note?: string }> }> = []

  for (const row of profiles) {
    const word = wordById.get(row.word_id)
    if (!word) {
      continue
    }

    const generationMethod = row.generation_method ?? 'null'
    methodCounts.set(generationMethod, (methodCounts.get(generationMethod) ?? 0) + 1)

    const collocations = normalizeStringArray(row.collocations)
    if (collocations.length === 0) {
      zeroCollocationWords.push(toIssueWord(word))
    }
    if (collocations.length < 3) {
      lowCollocationWords.push(toIssueWord(word))
    }

    const sceneTags = normalizeStringArray(row.scene_tags)
    if (sceneTags.length === 1 && sceneTags[0] === 'general') {
      generalOnlyWords.push(toIssueWord(word))
    }

    if (row.generation_method && row.generation_method !== 'ai_refine') {
      legacyGenerationMethodWords.push({
        ...toIssueWord(word),
        generationMethod: row.generation_method,
      })
    }

    const target = word.word.trim().toLowerCase()
    const contrastWords = Array.isArray(row.contrast_words) ? row.contrast_words : []
    if (contrastWords.some((item) => normalizeWord(item.word ?? '').toLowerCase() === target)) {
      selfContrastWords.push({
        ...toIssueWord(word),
        contrastWords,
      })
    }
  }

  const recommendedFullRefineWords = dedupeIssueWords([...lowExampleWords, ...lowCollocationWords])
  const recommendedBaseRepairWords = dedupeIssueWords([...generalOnlyWords, ...lowCollocationWords])

  const summary = {
    generatedAt: new Date().toISOString(),
    totalWords: words.length,
    totalProfiles: profiles.length,
    generationMethods: Object.fromEntries(
      [...methodCounts.entries()].sort((left, right) => left[0].localeCompare(right[0]))
    ),
    lexicalNoise: lexicalNoiseWords.length,
    zeroExamples: zeroExampleWords.length,
    lowExamples: lowExampleWords.length,
    zeroCollocations: zeroCollocationWords.length,
    lowCollocations: lowCollocationWords.length,
    generalOnly: generalOnlyWords.length,
    legacyGenerationMethods: legacyGenerationMethodWords.length,
    selfContrast: selfContrastWords.length,
    recommendedFullRefineWords: recommendedFullRefineWords.length,
    recommendedBaseRepairWords: recommendedBaseRepairWords.length,
  }

  const payload = {
    summary,
    lexicalNoiseWords: lexicalNoiseWords.map(toIssueWord),
    zeroExampleWords,
    lowExampleWords,
    zeroCollocationWords,
    lowCollocationWords,
    generalOnlyWords,
    legacyGenerationMethodWords,
    selfContrastWords,
    recommendedFullRefineWords,
    recommendedBaseRepairWords,
  }

  const outputPath = path.resolve(options.output)
  mkdirSync(path.dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')

  const wordsDir = path.resolve(options.wordsDir)
  mkdirSync(wordsDir, { recursive: true })
  writeWordFile(path.join(wordsDir, 'lexical-noise.words.txt'), lexicalNoiseWords.map((row) => row.word))
  writeWordFile(path.join(wordsDir, 'zero-examples.words.txt'), zeroExampleWords.map((row) => row.word))
  writeWordFile(path.join(wordsDir, 'low-examples.words.txt'), lowExampleWords.map((row) => row.word))
  writeWordFile(path.join(wordsDir, 'zero-collocations.words.txt'), zeroCollocationWords.map((row) => row.word))
  writeWordFile(path.join(wordsDir, 'low-collocations.words.txt'), lowCollocationWords.map((row) => row.word))
  writeWordFile(path.join(wordsDir, 'general-only.words.txt'), generalOnlyWords.map((row) => row.word))
  writeWordFile(path.join(wordsDir, 'recommended-full-refine.words.txt'), recommendedFullRefineWords.map((row) => row.word))
  writeWordFile(path.join(wordsDir, 'recommended-base-repair.words.txt'), recommendedBaseRepairWords.map((row) => row.word))

  console.log('Word quality audit complete')
  console.log(`  report: ${outputPath}`)
  console.log(`  words dir: ${wordsDir}`)
  console.log(`  total words: ${summary.totalWords}`)
  console.log(`  lexical noise: ${summary.lexicalNoise}`)
  console.log(`  zero examples: ${summary.zeroExamples}`)
  console.log(`  low examples: ${summary.lowExamples}`)
  console.log(`  zero collocations: ${summary.zeroCollocations}`)
  console.log(`  low collocations: ${summary.lowCollocations}`)
  console.log(`  general only: ${summary.generalOnly}`)
  console.log(`  legacy generation methods: ${summary.legacyGenerationMethods}`)
  console.log(`  self contrast: ${summary.selfContrast}`)
  console.log(`  recommended full refine words: ${summary.recommendedFullRefineWords}`)
  console.log(`  recommended base repair words: ${summary.recommendedBaseRepairWords}`)
}

function parseCliArgs(argv: string[]): CliOptions {
  return {
    output: getStringArg(argv, '--output') ?? DEFAULT_OUTPUT_FILE,
    wordsDir: getStringArg(argv, '--words-dir') ?? DEFAULT_WORDS_DIR,
  }
}

function getStringArg(argv: string[], name: string) {
  const index = argv.indexOf(name)
  if (index === -1) {
    return null
  }

  const value = argv[index + 1]
  return value && !value.startsWith('--') ? value : null
}

function isMalformedHeadword(value: string) {
  const normalized = normalizeWord(value)
  return !ALLOWED_HEADWORD_PATTERN.test(normalized) || normalized.includes('(') || normalized.includes(')') || normalized.toLowerCase() === 'reservior'
}

function toIssueWord(row: WordRow): IssueWordRow {
  return {
    wordId: row.id,
    word: row.word,
    definition: row.definition,
    tags: row.tags,
  }
}

function normalizeStringArray(value: unknown) {
  const items =
    Array.isArray(value)
      ? value
      : typeof value === 'string'
        ? safeParseArray(value)
        : []

  return Array.from(
    new Set(
      items
        .map((item) => (typeof item === 'string' ? item.trim().toLowerCase() : ''))
        .filter(Boolean)
    )
  )
}

function safeParseArray(value: string): unknown[] {
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function dedupeIssueWords(rows: IssueWordRow[]) {
  const map = new Map<string, IssueWordRow>()
  for (const row of rows) {
    map.set(row.wordId, row)
  }
  return Array.from(map.values()).sort((left, right) => left.word.localeCompare(right.word))
}

function writeWordFile(filePath: string, words: string[]) {
  const lines = words.map((word) => word.trim()).filter(Boolean)
  writeFileSync(filePath, lines.length > 0 ? `${lines.join('\n')}\n` : '', 'utf8')
}

async function fetchAllWords(supabase: ReturnType<typeof createServiceRoleClient>) {
  const rows: WordRow[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const to = from + PAGE_SIZE - 1
    const { data, error } = await supabase
      .from('words')
      .select('id, word, definition, tags')
      .order('word')
      .range(from, to)

    if (error) {
      throw error
    }

    const page = (data ?? []) as WordRow[]
    rows.push(...page)
    if (page.length < PAGE_SIZE) {
      return rows
    }
  }
}

async function fetchAllProfiles(supabase: ReturnType<typeof createServiceRoleClient>) {
  const rows: ProfileRow[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const to = from + PAGE_SIZE - 1
    const { data, error } = await supabase
      .from('word_profiles')
      .select('word_id, usage_register, scene_tags, collocations, contrast_words, confidence_score, generation_method')
      .order('word_id')
      .range(from, to)

    if (error) {
      throw error
    }

    const page = (data ?? []) as ProfileRow[]
    rows.push(...page)
    if (page.length < PAGE_SIZE) {
      return rows
    }
  }
}

async function fetchAllExamples(supabase: ReturnType<typeof createServiceRoleClient>) {
  const rows: ExampleRow[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const to = from + PAGE_SIZE - 1
    const { data, error } = await supabase
      .from('word_profile_examples')
      .select('word_id')
      .order('word_id')
      .range(from, to)

    if (error) {
      throw error
    }

    const page = (data ?? []) as ExampleRow[]
    rows.push(...page)
    if (page.length < PAGE_SIZE) {
      return rows
    }
  }
}

main().catch((error) => {
  console.error('Word quality audit failed:', error)
  process.exit(1)
})
