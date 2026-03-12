import { readFileSync, readdirSync } from 'fs'
import path from 'path'
import { createServiceRoleClient, normalizeWord, sanitizeOfficialWordEntry } from './official-word-utils'

interface WordRow {
  id: string
  word: string
  tags: string | null
}

interface CleanupOptions {
  dryRun: boolean
}

const PAGE_SIZE = 1000
const DESTRUCTIVE_REFERENCE_TABLES = [
  'word_profiles',
  'word_profile_examples',
  'word_profile_sources',
  'user_library_words',
  'user_words',
  'sentences',
] as const

async function main() {
  const options = parseCliArgs(process.argv.slice(2))
  const supabase = createServiceRoleClient()
  const officialSourceWords = loadOfficialSourceWords()
  const officialLowerMap = buildLowercaseSourceMap(officialSourceWords)
  const words = await fetchAllWords()

  const staleCaseVariants = words.filter((row) => {
    const exactWord = normalizeWord(row.word)
    if (!exactWord || officialSourceWords.has(exactWord)) {
      return false
    }

    return officialLowerMap.has(exactWord.toLowerCase())
  })

  if (staleCaseVariants.length === 0) {
    console.log('No stale case-variant words found.')
    return
  }

  const referenceSummary = await collectReferenceSummary(supabase, staleCaseVariants.map((row) => row.id))
  const blockingTables = Object.entries(referenceSummary).filter(
    ([table, count]) => table !== 'library_words' && count > 0
  )

  if (blockingTables.length > 0) {
    throw new Error(
      `Cleanup blocked because stale rows are referenced outside library_words: ${blockingTables
        .map(([table, count]) => `${table}=${count}`)
        .join(', ')}`
    )
  }

  console.log('Stale official case variants')
  console.log(
    staleCaseVariants
      .map((row) => {
        const canonical = officialLowerMap.get(row.word.toLowerCase()) ?? []
        return `  ${row.word} -> ${canonical.join(' / ')}`
      })
      .join('\n')
  )
  console.log(`  words: ${staleCaseVariants.length}`)
  console.log(`  library references: ${referenceSummary.library_words}`)

  if (options.dryRun) {
    console.log('Dry run complete. No rows deleted.')
    return
  }

  const staleIds = staleCaseVariants.map((row) => row.id)

  const { error: deleteLibraryWordsError } = await supabase
    .from('library_words')
    .delete()
    .in('word_id', staleIds)

  if (deleteLibraryWordsError) {
    throw deleteLibraryWordsError
  }

  const { error: deleteWordsError } = await supabase
    .from('words')
    .delete()
    .in('id', staleIds)

  if (deleteWordsError) {
    throw deleteWordsError
  }

  console.log('Cleanup complete')
  console.log(`  deleted words: ${staleCaseVariants.length}`)
  console.log(`  deleted library rows: ${referenceSummary.library_words}`)
}

function parseCliArgs(argv: string[]): CleanupOptions {
  return {
    dryRun: argv.includes('--dry-run'),
  }
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
      const word = cleaned.word
      const definition = cleaned.definition
      if (word && definition) {
        sourceWords.add(word)
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
    const word = cleaned.word
    const definition = cleaned.definition

    if (word && definition) {
      sourceWords.add(word)
    }
  }

  return sourceWords
}

function buildLowercaseSourceMap(sourceWords: Set<string>) {
  const map = new Map<string, string[]>()

  for (const word of sourceWords) {
    const lower = word.toLowerCase()
    map.set(lower, [...(map.get(lower) ?? []), word].sort((left, right) => left.localeCompare(right)))
  }

  return map
}

async function fetchAllWords() {
  const supabase = createServiceRoleClient()
  const rows: WordRow[] = []

  for (let from = 0; ; from += PAGE_SIZE) {
    const to = from + PAGE_SIZE - 1
    const { data, error } = await supabase
      .from('words')
      .select('id, word, tags')
      .order('word', { ascending: true })
      .range(from, to)

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

async function collectReferenceSummary(
  supabase: ReturnType<typeof createServiceRoleClient>,
  wordIds: string[]
) {
  const tables = ['library_words', ...DESTRUCTIVE_REFERENCE_TABLES] as const
  const result = {} as Record<(typeof tables)[number], number>

  for (const table of tables) {
    const { count, error } = await supabase
      .from(table)
      .select('word_id', { count: 'exact', head: true })
      .in('word_id', wordIds)

    if (error) {
      throw error
    }

    result[table] = count ?? 0
  }

  return result
}

main().catch((error) => {
  console.error('Official word variant cleanup failed:', error)
  process.exit(1)
})
