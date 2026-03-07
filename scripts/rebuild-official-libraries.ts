import {
  CHUNK_SIZE,
  createServiceRoleClient,
  hasTag,
  normalizeWord,
} from './official-word-utils'

interface LibraryRow {
  id: string
  slug: string
  name: string
}

interface WordRow {
  id: string
  word: string
  tags: string | null
}

interface LibraryWordInsert {
  library_id: string
  word_id: string
  position: number
}

const OFFICIAL_LIBRARIES = [
  {
    slug: 'cet-4',
    name: 'CET-4',
    description: '大学英语四级核心词库',
    tag: 'CET-4',
  },
  {
    slug: 'cet-6',
    name: 'CET-6',
    description: '大学英语六级核心词库',
    tag: 'CET-6',
  },
] as const

async function ensureLibraries() {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('libraries')
    .upsert(
      OFFICIAL_LIBRARIES.map((library) => ({
        slug: library.slug,
        name: library.name,
        description: library.description,
        source_type: 'official',
        language: 'en',
        is_public: true,
      })),
      { onConflict: 'slug' }
    )
    .select('id, slug, name')

  if (error) {
    throw error
  }

  return (data ?? []) as LibraryRow[]
}

async function getAllWords() {
  const supabase = createServiceRoleClient()
  const words: WordRow[] = []
  let from = 0

  while (true) {
    const { data, error } = await supabase
      .from('words')
      .select('id, word, tags')
      .order('word', { ascending: true })
      .range(from, from + CHUNK_SIZE - 1)

    if (error) {
      throw error
    }

    const rows = (data ?? []) as WordRow[]
    words.push(...rows)

    if (rows.length < CHUNK_SIZE) {
      break
    }

    from += CHUNK_SIZE
  }

  return words
}

async function rebuildLibraryWords(library: LibraryRow, words: WordRow[]) {
  const supabase = createServiceRoleClient()
  const libraryConfig = OFFICIAL_LIBRARIES.find((item) => item.slug === library.slug)

  if (!libraryConfig) {
    return 0
  }

  const matchedWords = words
    .filter((word) => hasTag(word.tags, libraryConfig.tag))
    .sort((left, right) => normalizeWord(left.word).localeCompare(normalizeWord(right.word)))

  const { error: deleteError } = await supabase
    .from('library_words')
    .delete()
    .eq('library_id', library.id)

  if (deleteError) {
    throw deleteError
  }

  for (let index = 0; index < matchedWords.length; index += CHUNK_SIZE) {
    const chunk = matchedWords.slice(index, index + CHUNK_SIZE)
    const payload: LibraryWordInsert[] = chunk.map((word, chunkIndex) => ({
      library_id: library.id,
      word_id: word.id,
      position: index + chunkIndex + 1,
    }))

    const { error: insertError } = await supabase
      .from('library_words')
      .insert(payload)

    if (insertError) {
      throw insertError
    }
  }

  return matchedWords.length
}

async function main() {
  const libraries = await ensureLibraries()
  const words = await getAllWords()

  console.log(`Loaded ${words.length} words from public.words`)

  for (const library of libraries) {
    const count = await rebuildLibraryWords(library, words)
    console.log(`Rebuilt ${library.slug}: ${count} words`)
  }
}

main().catch((error) => {
  console.error('Official library rebuild failed:', error)
  process.exit(1)
})
