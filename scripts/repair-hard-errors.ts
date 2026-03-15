import { readdirSync, readFileSync, writeFileSync } from 'fs'
import path from 'path'
import { createServiceRoleClient, normalizeLexicalWord, normalizeWord, sanitizeOfficialWordEntry } from './official-word-utils'

interface CliOptions {
  apply: boolean
  report: string | null
}

interface WordRow {
  id: string
  word: string
}

interface ProfileRegisterRow {
  word_id: string
  usage_register: string | null
}

interface ContrastItem {
  word?: string
  note?: string
}

interface ProfileContrastRow {
  word_id: string
  contrast_words: ContrastItem[] | null
  words: {
    word: string
  }
}

interface ProfileMethodRow {
  word_id: string
  generation_method: string | null
  words: {
    word: string
  }
}

interface HeadwordRepair {
  wordId: string
  from: string
  to: string
}

interface SelfContrastRepair {
  wordId: string
  word: string
  removed: string[]
  nextContrastWords: ContrastItem[]
}

const PAGE_SIZE = 1000
const REPAIR_SYMBOL_REPLACEMENTS = [
  [/\u0254/g, 'o'],
  [/\u014b/g, 'n'],
  [/\u0283/g, 'f'],
] as const
const ASCII_HEADWORD_REVIEW = new Map<string, string>([['reservior', 'reservoir']])

async function main() {
  const options = parseCliArgs(process.argv.slice(2))
  const supabase = createServiceRoleClient()
  const officialWords = loadOfficialSourceWords()

  const words = await fetchAllWords(supabase)
  const profilesByRegister = await fetchAllProfileRegisters(supabase)
  const profilesByContrast = await fetchAllProfileContrasts(supabase)
  const profilesByMethod = await fetchAllProfileMethods(supabase)

  const currentWordMap = new Map(words.map((row) => [row.word, row.id]))

  const safeHeadwordRepairs: HeadwordRepair[] = []
  const collidingHeadwordRepairs: Array<HeadwordRepair & { existingWordId: string }> = []
  const manualHeadwordReview: Array<{ wordId: string; from: string; suggested: string }> = []

  for (const row of words) {
    const repaired = repairHeadwordCandidate(row.word)
    if (!repaired || repaired === row.word) {
      const asciiSuggestion = ASCII_HEADWORD_REVIEW.get(row.word)
      if (asciiSuggestion) {
        manualHeadwordReview.push({
          wordId: row.id,
          from: row.word,
          suggested: asciiSuggestion,
        })
      }
      continue
    }

    if (!officialWords.has(repaired)) {
      manualHeadwordReview.push({
        wordId: row.id,
        from: row.word,
        suggested: repaired,
      })
      continue
    }

    const existingWordId = currentWordMap.get(repaired)
    if (existingWordId && existingWordId !== row.id) {
      collidingHeadwordRepairs.push({
        wordId: row.id,
        existingWordId,
        from: row.word,
        to: repaired,
      })
      continue
    }

    safeHeadwordRepairs.push({
      wordId: row.id,
      from: row.word,
      to: repaired,
    })
  }

  const neutralUsageRegisters = profilesByRegister.filter((row) => row.usage_register === 'neutral')
  const selfContrastRepairs = buildSelfContrastRepairs(profilesByContrast)
  const legacyGenerationMethods = profilesByMethod.filter((row) => row.generation_method && row.generation_method !== 'ai_refine')

  const report = {
    generatedAt: new Date().toISOString(),
    summary: {
      totalWords: words.length,
      safeHeadwordRepairs: safeHeadwordRepairs.length,
      collidingHeadwordRepairs: collidingHeadwordRepairs.length,
      manualHeadwordReview: manualHeadwordReview.length,
      neutralUsageRegisters: neutralUsageRegisters.length,
      selfContrastRepairs: selfContrastRepairs.length,
      legacyGenerationMethods: legacyGenerationMethods.length,
    },
    safeHeadwordRepairs,
    collidingHeadwordRepairs,
    manualHeadwordReview,
    neutralUsageRegisterWords: neutralUsageRegisters.slice(0, 200).map((row) => row.word_id),
    selfContrastRepairs: selfContrastRepairs.map((row) => ({
      wordId: row.wordId,
      word: row.word,
      removed: row.removed,
      nextContrastWords: row.nextContrastWords,
    })),
    legacyGenerationMethods: legacyGenerationMethods.map((row) => ({
      wordId: row.word_id,
      word: row.words.word,
      generationMethod: row.generation_method,
    })),
  }

  if (options.report) {
    const reportPath = path.resolve(options.report)
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
    console.log(`Report written to ${reportPath}`)
  }

  console.log('Hard error audit')
  console.log(`  safe headword repairs: ${safeHeadwordRepairs.length}`)
  console.log(`  colliding headword repairs: ${collidingHeadwordRepairs.length}`)
  console.log(`  manual headword review: ${manualHeadwordReview.length}`)
  console.log(`  neutral usage_register: ${neutralUsageRegisters.length}`)
  console.log(`  self contrast repairs: ${selfContrastRepairs.length}`)
  console.log(`  legacy generation methods: ${legacyGenerationMethods.length}`)

  if (!options.apply) {
    console.log('Dry run complete. No database rows updated.')
    return
  }

  for (const repair of safeHeadwordRepairs) {
    const { error } = await supabase.from('words').update({ word: repair.to }).eq('id', repair.wordId)
    if (error) {
      throw error
    }
  }

  if (neutralUsageRegisters.length > 0) {
    const { error } = await supabase
      .from('word_profiles')
      .update({ usage_register: null })
      .eq('usage_register', 'neutral')
    if (error) {
      throw error
    }
  }

  for (const repair of selfContrastRepairs) {
    const { error } = await supabase
      .from('word_profiles')
      .update({ contrast_words: repair.nextContrastWords })
      .eq('word_id', repair.wordId)
    if (error) {
      throw error
    }
  }

  console.log('Applied hard-error cleanup')
  console.log(`  headwords updated: ${safeHeadwordRepairs.length}`)
  console.log(`  usage_register normalized: ${neutralUsageRegisters.length}`)
  console.log(`  self contrast repaired: ${selfContrastRepairs.length}`)
}

function parseCliArgs(argv: string[]): CliOptions {
  return {
    apply: argv.includes('--apply'),
    report: getStringArg(argv, '--report') ?? null,
  }
}

function getStringArg(argv: string[], name: string) {
  const index = argv.indexOf(name)
  if (index === -1) {
    return null
  }

  const next = argv[index + 1]
  if (!next || next.startsWith('--')) {
    return null
  }

  return next
}

function repairHeadwordCandidate(value: string) {
  let normalized = normalizeWord(value).normalize('NFKC')
  for (const [pattern, replacement] of REPAIR_SYMBOL_REPLACEMENTS) {
    normalized = normalized.replace(pattern, replacement)
  }
  return normalizeLexicalWord(normalized)
}

function loadOfficialSourceWords() {
  const sourceWords = new Set<string>()
  const dataDir = path.join(process.cwd(), 'data')
  const cet4Files = readdirSync(dataDir)
    .filter((file) => /^CET4_[A-Z]\.json$/.test(file))
    .sort()

  for (const file of cet4Files) {
    const rows = JSON.parse(readFileSync(path.join(dataDir, file), 'utf-8')) as Array<{
      word?: string
      mean?: string
    }>

    for (const row of rows) {
      const cleaned = sanitizeOfficialWordEntry(row.word ?? '', row.mean ?? '')
      if (cleaned.word && cleaned.definition) {
        sourceWords.add(cleaned.word)
      }
    }
  }

  const cet6Lines = readFileSync(path.join(dataDir, 'CET6.txt'), 'utf-8').split(/\r?\n/)
  for (const line of cet6Lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      continue
    }

    const parsedWord = trimmed.split(/[\s\[]/)[0] ?? ''
    const phoneticMatch = trimmed.match(/\[([^\]]+)\]/)
    const rawDefinition = phoneticMatch
      ? trimmed.slice(trimmed.indexOf(']') + 1).trim()
      : trimmed.slice(parsedWord.length).trim()
    const cleaned = sanitizeOfficialWordEntry(parsedWord, rawDefinition)

    if (cleaned.word && cleaned.definition) {
      sourceWords.add(cleaned.word)
    }
  }

  return sourceWords
}

function buildSelfContrastRepairs(rows: ProfileContrastRow[]) {
  const repairs: SelfContrastRepair[] = []

  for (const row of rows) {
    const target = row.words.word.toLowerCase()
    const contrastWords = Array.isArray(row.contrast_words) ? row.contrast_words : []
    const nextContrastWords = contrastWords.filter((item) => normalizeWord(item.word ?? '').toLowerCase() !== target)
    if (nextContrastWords.length === contrastWords.length) {
      continue
    }

    repairs.push({
      wordId: row.word_id,
      word: row.words.word,
      removed: contrastWords
        .filter((item) => normalizeWord(item.word ?? '').toLowerCase() === target)
        .map((item) => normalizeWord(item.word ?? ''))
        .filter(Boolean),
      nextContrastWords,
    })
  }

  return repairs
}

async function fetchAllWords(supabase: ReturnType<typeof createServiceRoleClient>) {
  const rows: WordRow[] = []

  for (let from = 0; ; from += PAGE_SIZE) {
    const to = from + PAGE_SIZE - 1
    const { data, error } = await supabase.from('words').select('id, word').order('word').range(from, to)

    if (error) {
      throw error
    }

    rows.push(...((data ?? []) as WordRow[]))
    if (!data || data.length < PAGE_SIZE) {
      break
    }
  }

  return rows
}

async function fetchAllProfileRegisters(supabase: ReturnType<typeof createServiceRoleClient>) {
  const rows: ProfileRegisterRow[] = []

  for (let from = 0; ; from += PAGE_SIZE) {
    const to = from + PAGE_SIZE - 1
    const { data, error } = await supabase
      .from('word_profiles')
      .select('word_id, usage_register')
      .order('word_id')
      .range(from, to)

    if (error) {
      throw error
    }

    rows.push(...((data ?? []) as ProfileRegisterRow[]))
    if (!data || data.length < PAGE_SIZE) {
      break
    }
  }

  return rows
}

async function fetchAllProfileContrasts(supabase: ReturnType<typeof createServiceRoleClient>) {
  const rows: ProfileContrastRow[] = []

  for (let from = 0; ; from += PAGE_SIZE) {
    const to = from + PAGE_SIZE - 1
    const { data, error } = await supabase
      .from('word_profiles')
      .select('word_id, contrast_words, words!inner(word)')
      .order('word_id')
      .range(from, to)

    if (error) {
      throw error
    }

    rows.push(...((data ?? []) as ProfileContrastRow[]))
    if (!data || data.length < PAGE_SIZE) {
      break
    }
  }

  return rows
}

async function fetchAllProfileMethods(supabase: ReturnType<typeof createServiceRoleClient>) {
  const rows: ProfileMethodRow[] = []

  for (let from = 0; ; from += PAGE_SIZE) {
    const to = from + PAGE_SIZE - 1
    const { data, error } = await supabase
      .from('word_profiles')
      .select('word_id, generation_method, words!inner(word)')
      .order('word_id')
      .range(from, to)

    if (error) {
      throw error
    }

    rows.push(...((data ?? []) as ProfileMethodRow[]))
    if (!data || data.length < PAGE_SIZE) {
      break
    }
  }

  return rows
}

main().catch((error) => {
  console.error('Hard error repair failed:', error)
  process.exit(1)
})
