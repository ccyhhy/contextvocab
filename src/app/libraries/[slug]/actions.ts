'use server'

import type { SupabaseClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { requireActionSession } from '@/lib/supabase/user'

const LIBRARY_WORD_PAGE_SIZE = 100
const ADD_WORD_SEARCH_LIMIT = 12
const LIBRARY_SEARCH_MATCH_LIMIT = 200
const LIBRARY_STATS_CHUNK_SIZE = 1000
const OFFICIAL_LIBRARY_DESCRIPTIONS: Record<string, string> = {
  'cet-4': '大学英语四级核心词库',
  'cet-6': '大学英语六级核心词库',
}

export interface LibraryDetail {
  id: string
  slug: string
  name: string
  description: string | null
  sourceType: 'official' | 'custom'
  isEditable: boolean
  wordCount: number
  activeCount: number
  dueCount: number
  remainingCount: number
  planStatus: 'active' | 'paused' | 'completed' | 'not_started'
  dailyNewLimit: number | null
}

export interface LibraryDetailWord {
  wordId: string
  word: string
  definition: string
  phonetic: string | null
  tags: string | null
  example: string | null
  position: number | null
}

export interface LibraryWordPage {
  items: LibraryDetailWord[]
  totalCount: number
  nextOffset: number | null
  query: string
}

export interface SearchableWord {
  id: string
  word: string
  definition: string
  phonetic: string | null
  tags: string | null
  alreadyInLibrary: boolean
}

export interface LibraryWordMutationResult {
  ok: boolean
  message: string
}

export interface LibraryBatchImportResult extends LibraryWordMutationResult {
  matchedCount?: number
  addedCount?: number
  alreadyExistsCount?: number
  unmatchedWords?: string[]
}

interface LibraryRow {
  id: string
  slug: string
  name: string
  description?: string | null
  source_type?: 'official' | 'custom' | null
  created_by?: string | null
}

interface UserLibraryPlanRow {
  status?: 'active' | 'paused' | 'completed' | null
  daily_new_limit?: number | null
}

interface LibraryWordRow {
  position?: number | null
  words?: WordRow | WordRow[] | null
}

interface WordRow {
  id: string
  word: string
  definition: string
  phonetic?: string | null
  tags?: string | null
  example?: string | null
}

interface WordIdRow {
  word_id?: string | null
}

function normalizeLibrarySlug(value: string) {
  return value.trim().toLowerCase()
}

function normalizeWordRow(value: unknown): WordRow | null {
  if (Array.isArray(value)) {
    return normalizeWordRow(value[0])
  }

  if (typeof value !== 'object' || value === null) {
    return null
  }

  const row = value as WordRow
  if (
    typeof row.id !== 'string' ||
    typeof row.word !== 'string' ||
    typeof row.definition !== 'string'
  ) {
    return null
  }

  return row
}

function normalizeLibraryWordRow(value: unknown): LibraryDetailWord | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }

  const row = value as LibraryWordRow
  const word = normalizeWordRow(row.words)
  if (!word) {
    return null
  }

  return {
    wordId: word.id,
    word: word.word,
    definition: word.definition,
    phonetic: word.phonetic ?? null,
    tags: word.tags ?? null,
    example: word.example ?? null,
    position: typeof row.position === 'number' ? row.position : null,
  }
}

function getTodayDateString() {
  return new Date().toISOString().slice(0, 10)
}

function getSearchPattern(query: string) {
  return `%${query.trim().replace(/\s+/g, '%')}%`
}

function parseWordInput(raw: string) {
  return Array.from(
    new Set(
      raw
        .split(/[\n\r,;\t ]+/)
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean)
    )
  )
}

function getLibraryDescription(library: Pick<LibraryRow, 'slug' | 'description' | 'source_type'>) {
  if (library.source_type === 'official') {
    return OFFICIAL_LIBRARY_DESCRIPTIONS[library.slug] ?? library.description ?? null
  }

  return library.description ?? null
}

async function getReadableLibraryBySlug(
  supabase: SupabaseClient,
  librarySlug: string
): Promise<LibraryRow | null> {
  const { data, error } = await supabase
    .from('libraries')
    .select('id, slug, name, description, source_type, created_by')
    .eq('slug', normalizeLibrarySlug(librarySlug))
    .maybeSingle()

  if (error) {
    console.error('Failed to load library by slug:', error)
    return null
  }

  return (data as LibraryRow | null) ?? null
}

async function getEditableLibraryBySlug(
  supabase: SupabaseClient,
  userId: string,
  librarySlug: string
): Promise<LibraryRow | null> {
  const { data, error } = await supabase
    .from('libraries')
    .select('id, slug, name, description, source_type, created_by')
    .eq('slug', normalizeLibrarySlug(librarySlug))
    .eq('created_by', userId)
    .eq('source_type', 'custom')
    .maybeSingle()

  if (error) {
    console.error('Failed to load editable library by slug:', error)
    return null
  }

  return (data as LibraryRow | null) ?? null
}

async function getAllLibraryWordIds(supabase: SupabaseClient, libraryId: string) {
  const wordIds: string[] = []
  let from = 0

  while (true) {
    const to = from + LIBRARY_WORD_PAGE_SIZE - 1
    const { data, error } = await supabase
      .from('library_words')
      .select('word_id')
      .eq('library_id', libraryId)
      .order('position', { ascending: true, nullsFirst: false })
      .range(from, to)

    if (error) {
      console.error('Failed to load library word ids:', error)
      return []
    }

    const rows = (data ?? []) as WordIdRow[]
    const batch = rows
      .map((row) => row.word_id)
      .filter((wordId): wordId is string => typeof wordId === 'string')

    wordIds.push(...batch)

    if (rows.length < LIBRARY_WORD_PAGE_SIZE) {
      break
    }

    from += LIBRARY_WORD_PAGE_SIZE
  }

  return wordIds
}

async function getStartedLibraryWordIds(
  supabase: SupabaseClient,
  userId: string,
  libraryWordIds: string[]
) {
  const startedWordIds = new Set<string>()

  for (let from = 0; from < libraryWordIds.length; from += LIBRARY_STATS_CHUNK_SIZE) {
    const chunk = libraryWordIds.slice(from, from + LIBRARY_STATS_CHUNK_SIZE)
    if (chunk.length === 0) {
      continue
    }

    const [
      { data: userWordRows, error: userWordError },
      { data: sentenceRows, error: sentenceError },
      { data: libraryWordRows, error: libraryWordError },
    ] = await Promise.all([
      supabase
        .from('user_words')
        .select('word_id')
        .eq('user_id', userId)
        .in('word_id', chunk),
      supabase
        .from('sentences')
        .select('word_id')
        .eq('user_id', userId)
        .in('word_id', chunk),
      supabase
        .from('user_library_words')
        .select('word_id')
        .eq('user_id', userId)
        .in('word_id', chunk),
    ])

    if (userWordError) {
      console.error('Failed to load started library user_words:', userWordError)
    }

    if (sentenceError) {
      console.error('Failed to load started library sentences:', sentenceError)
    }

    if (libraryWordError) {
      console.error('Failed to load started user_library_words for library detail:', libraryWordError)
    }

    for (const row of (userWordRows ?? []) as WordIdRow[]) {
      if (typeof row.word_id === 'string') {
        startedWordIds.add(row.word_id)
      }
    }

    for (const row of (sentenceRows ?? []) as WordIdRow[]) {
      if (typeof row.word_id === 'string') {
        startedWordIds.add(row.word_id)
      }
    }

    for (const row of (libraryWordRows ?? []) as WordIdRow[]) {
      if (typeof row.word_id === 'string') {
        startedWordIds.add(row.word_id)
      }
    }
  }

  return startedWordIds
}

async function buildLibraryDetail(
  supabase: SupabaseClient,
  userId: string,
  library: LibraryRow
): Promise<LibraryDetail> {
  const libraryWordIds = await getAllLibraryWordIds(supabase, library.id)
  const wordCount = libraryWordIds.length
  const today = getTodayDateString()
  const planPromise = supabase
    .from('user_library_plans')
    .select('status, daily_new_limit')
    .eq('user_id', userId)
    .eq('library_id', library.id)
    .maybeSingle()

  if (wordCount === 0) {
    const { data: plan } = await planPromise
    const planRow = (plan as UserLibraryPlanRow | null) ?? null

    return {
      id: library.id,
      slug: library.slug,
      name: library.name,
      description: getLibraryDescription(library),
      sourceType: library.source_type === 'custom' ? 'custom' : 'official',
      isEditable: library.source_type === 'custom' && library.created_by === userId,
      wordCount: 0,
      activeCount: 0,
      dueCount: 0,
      remainingCount: 0,
      planStatus: planRow?.status ?? 'not_started',
      dailyNewLimit: planRow?.daily_new_limit ?? null,
    }
  }

  const [startedWordIds, { count: due }, { data: plan }] = await Promise.all([
    getStartedLibraryWordIds(supabase, userId, libraryWordIds),
    supabase
      .from('user_words')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .in('word_id', libraryWordIds)
      .lte('next_review_date', today),
    planPromise,
  ])

  const planRow = (plan as UserLibraryPlanRow | null) ?? null
  const activeCount = startedWordIds.size

  return {
    id: library.id,
    slug: library.slug,
    name: library.name,
    description: getLibraryDescription(library),
    sourceType: library.source_type === 'custom' ? 'custom' : 'official',
    isEditable: library.source_type === 'custom' && library.created_by === userId,
    wordCount,
    activeCount,
    dueCount: due ?? 0,
    remainingCount: Math.max(wordCount - activeCount, 0),
    planStatus: planRow?.status ?? 'not_started',
    dailyNewLimit: planRow?.daily_new_limit ?? null,
  }
}

async function getLibraryWordsByWordIds(
  supabase: SupabaseClient,
  libraryId: string,
  wordIds: string[]
) {
  if (wordIds.length === 0) {
    return []
  }

  const { data, error } = await supabase
    .from('library_words')
    .select('position, words!inner(id, word, definition, phonetic, tags, example)')
    .eq('library_id', libraryId)
    .in('word_id', wordIds)
    .order('position', { ascending: true, nullsFirst: false })

  if (error) {
    console.error('Failed to load matched library words:', error)
    return []
  }

  return ((data ?? []) as LibraryWordRow[])
    .map((row) => normalizeLibraryWordRow(row))
    .filter((row): row is LibraryDetailWord => row !== null)
}

export async function getLibraryDetail(librarySlug: string) {
  const { supabase, user } = await requireActionSession()
  const library = await getReadableLibraryBySlug(supabase, librarySlug)

  if (!library) {
    return null
  }

  return buildLibraryDetail(supabase, user.id, library)
}

export async function getLibraryWordsPage(input: {
  librarySlug: string
  offset?: number
  query?: string
}): Promise<LibraryWordPage> {
  const { supabase } = await requireActionSession()
  const library = await getReadableLibraryBySlug(supabase, input.librarySlug)

  if (!library) {
    return {
      items: [],
      totalCount: 0,
      nextOffset: null,
      query: input.query?.trim() ?? '',
    }
  }

  const query = input.query?.trim() ?? ''
  if (query) {
    const { data: matchedWords, error: searchError } = await supabase
      .from('words')
      .select('id')
      .ilike('word', getSearchPattern(query))
      .order('word', { ascending: true })
      .limit(LIBRARY_SEARCH_MATCH_LIMIT)

    if (searchError) {
      console.error('Failed to search words within library:', searchError)
      return { items: [], totalCount: 0, nextOffset: null, query }
    }

    const matchedWordIds = (matchedWords ?? [])
      .map((row) => (row as { id?: string }).id)
      .filter((wordId): wordId is string => typeof wordId === 'string')

    const items = await getLibraryWordsByWordIds(supabase, library.id, matchedWordIds)
    return {
      items,
      totalCount: items.length,
      nextOffset: null,
      query,
    }
  }

  const offset = Math.max(input.offset ?? 0, 0)
  const to = offset + LIBRARY_WORD_PAGE_SIZE - 1
  const { data, error, count } = await supabase
    .from('library_words')
    .select('position, words!inner(id, word, definition, phonetic, tags, example)', {
      count: 'exact',
    })
    .eq('library_id', library.id)
    .order('position', { ascending: true, nullsFirst: false })
    .range(offset, to)

  if (error) {
    console.error('Failed to load library words page:', error)
    return { items: [], totalCount: 0, nextOffset: null, query: '' }
  }

  const items = ((data ?? []) as LibraryWordRow[])
    .map((row) => normalizeLibraryWordRow(row))
    .filter((row): row is LibraryDetailWord => row !== null)

  const totalCount = count ?? items.length
  return {
    items,
    totalCount,
    nextOffset: offset + items.length < totalCount ? offset + items.length : null,
    query: '',
  }
}

export async function searchWordsToAdd(
  librarySlug: string,
  rawQuery: string
): Promise<SearchableWord[]> {
  const { supabase, user } = await requireActionSession()
  const library = await getEditableLibraryBySlug(supabase, user.id, librarySlug)
  const query = rawQuery.trim()

  if (!library || !query) {
    return []
  }

  const { data, error } = await supabase
    .from('words')
    .select('id, word, definition, phonetic, tags')
    .ilike('word', getSearchPattern(query))
    .order('word', { ascending: true })
    .limit(ADD_WORD_SEARCH_LIMIT)

  if (error) {
    console.error('Failed to search words to add:', error)
    return []
  }

  const words = (data ?? []) as WordRow[]
  const candidateIds = words.map((row) => row.id)

  if (candidateIds.length === 0) {
    return []
  }

  const { data: existingRows, error: existingError } = await supabase
    .from('library_words')
    .select('word_id')
    .eq('library_id', library.id)
    .in('word_id', candidateIds)

  if (existingError) {
    console.error('Failed to load existing library matches:', existingError)
    return words.map((row) => ({
      id: row.id,
      word: row.word,
      definition: row.definition,
      phonetic: row.phonetic ?? null,
      tags: row.tags ?? null,
      alreadyInLibrary: false,
    }))
  }

  const existingIds = new Set(
    ((existingRows ?? []) as WordIdRow[])
      .map((row) => row.word_id)
      .filter((wordId): wordId is string => typeof wordId === 'string')
  )

  return words.map((row) => ({
    id: row.id,
    word: row.word,
    definition: row.definition,
    phonetic: row.phonetic ?? null,
    tags: row.tags ?? null,
    alreadyInLibrary: existingIds.has(row.id),
  }))
}

export async function addWordToLibrary(
  librarySlug: string,
  wordId: string
): Promise<LibraryWordMutationResult> {
  const { supabase, user } = await requireActionSession()
  const library = await getEditableLibraryBySlug(supabase, user.id, librarySlug)

  if (!library) {
    return { ok: false, message: '只有你创建的自定义词库可以编辑。' }
  }

  const { data: existing } = await supabase
    .from('library_words')
    .select('id')
    .eq('library_id', library.id)
    .eq('word_id', wordId)
    .maybeSingle()

  if (existing) {
    return { ok: false, message: '这个单词已经在当前词库里了。' }
  }

  const { data: lastRow } = await supabase
    .from('library_words')
    .select('position')
    .eq('library_id', library.id)
    .order('position', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle()

  const nextPosition = typeof lastRow?.position === 'number' ? lastRow.position + 1 : 1
  const { error } = await supabase.from('library_words').insert({
    library_id: library.id,
    word_id: wordId,
    position: nextPosition,
  })

  if (error) {
    console.error('Failed to add word to library:', error)
    return { ok: false, message: '加词失败，请稍后再试。' }
  }

  revalidatePath('/libraries')
  revalidatePath(`/libraries/${library.slug}`)
  revalidatePath('/study')

  return { ok: true, message: '已加入词库。' }
}

export async function removeWordFromLibrary(
  librarySlug: string,
  wordId: string
): Promise<LibraryWordMutationResult> {
  const { supabase, user } = await requireActionSession()
  const library = await getEditableLibraryBySlug(supabase, user.id, librarySlug)

  if (!library) {
    return { ok: false, message: '只有你创建的自定义词库可以编辑。' }
  }

  const { error } = await supabase
    .from('library_words')
    .delete()
    .eq('library_id', library.id)
    .eq('word_id', wordId)

  if (error) {
    console.error('Failed to remove word from library:', error)
    return { ok: false, message: '移除失败，请稍后再试。' }
  }

  revalidatePath('/libraries')
  revalidatePath(`/libraries/${library.slug}`)
  revalidatePath('/study')

  return { ok: true, message: '已从词库移除。' }
}

export async function importWordsToLibrary(
  librarySlug: string,
  wordsText: string
): Promise<LibraryBatchImportResult> {
  const { supabase, user } = await requireActionSession()
  const library = await getEditableLibraryBySlug(supabase, user.id, librarySlug)

  if (!library) {
    return { ok: false, message: '只有你创建的自定义词库可以编辑。' }
  }

  const candidateWords = parseWordInput(wordsText)
  if (candidateWords.length === 0) {
    return { ok: false, message: '请至少输入一个要导入的单词。' }
  }

  const { data: matchedRows, error: matchError } = await supabase
    .from('words')
    .select('id, word')
    .in('word', candidateWords)

  if (matchError) {
    console.error('Failed to match words for library import:', matchError)
    return { ok: false, message: '匹配单词失败，请稍后再试。' }
  }

  const matchedWords = ((matchedRows ?? []) as Array<{ id: string; word: string }>).sort((a, b) =>
    a.word.localeCompare(b.word)
  )
  const matchedMap = new Map(matchedWords.map((row) => [row.word.toLowerCase(), row]))
  const unmatchedWords = candidateWords.filter((word) => !matchedMap.has(word))

  if (matchedWords.length === 0) {
    return {
      ok: false,
      message: '没有匹配到可导入的单词。',
      matchedCount: 0,
      addedCount: 0,
      alreadyExistsCount: 0,
      unmatchedWords: unmatchedWords.slice(0, 20),
    }
  }

  const matchedWordIds = matchedWords.map((row) => row.id)
  const { data: existingRows, error: existingError } = await supabase
    .from('library_words')
    .select('word_id')
    .eq('library_id', library.id)
    .in('word_id', matchedWordIds)

  if (existingError) {
    console.error('Failed to load existing library words for import:', existingError)
    return { ok: false, message: '读取词库现有单词失败，请稍后再试。' }
  }

  const existingWordIds = new Set(
    ((existingRows ?? []) as WordIdRow[])
      .map((row) => row.word_id)
      .filter((wordId): wordId is string => typeof wordId === 'string')
  )

  const wordsToInsert = matchedWords.filter((row) => !existingWordIds.has(row.id))
  const alreadyExistsCount = matchedWords.length - wordsToInsert.length

  if (wordsToInsert.length === 0) {
    return {
      ok: false,
      message: '匹配到的单词都已经在这个词库里了。',
      matchedCount: matchedWords.length,
      addedCount: 0,
      alreadyExistsCount,
      unmatchedWords: unmatchedWords.slice(0, 20),
    }
  }

  const { data: lastRow } = await supabase
    .from('library_words')
    .select('position')
    .eq('library_id', library.id)
    .order('position', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle()

  const startingPosition = typeof lastRow?.position === 'number' ? lastRow.position + 1 : 1
  const payload = wordsToInsert.map((row, index) => ({
    library_id: library.id,
    word_id: row.id,
    position: startingPosition + index,
  }))

  const { error: insertError } = await supabase.from('library_words').insert(payload)

  if (insertError) {
    console.error('Failed to import words into library:', insertError)
    return { ok: false, message: '批量导入失败，请稍后再试。' }
  }

  revalidatePath('/libraries')
  revalidatePath(`/libraries/${library.slug}`)
  revalidatePath('/study')

  return {
    ok: true,
    message:
      unmatchedWords.length > 0 || alreadyExistsCount > 0
        ? `已导入 ${wordsToInsert.length} 个单词，${alreadyExistsCount} 个已存在，${unmatchedWords.length} 个未匹配。`
        : `已导入 ${wordsToInsert.length} 个单词。`,
    matchedCount: matchedWords.length,
    addedCount: wordsToInsert.length,
    alreadyExistsCount,
    unmatchedWords: unmatchedWords.slice(0, 20),
  }
}
