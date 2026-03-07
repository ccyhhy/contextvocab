'use server'

import { revalidatePath } from 'next/cache'
import { requireActionSession } from '@/lib/supabase/user'

export interface LibraryMutationResult {
  ok: boolean
  message: string
  librarySlug?: string
  matchedCount?: number
  unmatchedWords?: string[]
}

interface MatchedWordRow {
  id: string
  word: string
}

function slugifyLibraryName(name: string) {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  const fallback = `custom-${Date.now().toString(36)}`
  if (!base) {
    return fallback
  }

  return `${base}-${Date.now().toString(36).slice(-4)}`
}

function parseWordInput(raw: string) {
  return Array.from(
    new Set(
      raw
        .split(/[\n\r,;，；\t ]+/)
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean)
    )
  )
}

async function createLibraryWithWords(input: {
  name: string
  description?: string
  matchedWords: MatchedWordRow[]
  unmatchedWords?: string[]
}): Promise<LibraryMutationResult> {
  const { supabase, user } = await requireActionSession()
  const name = input.name.trim()
  const description = input.description?.trim() || null
  const matchedWords = input.matchedWords
  const unmatchedWords = input.unmatchedWords ?? []

  if (!name) {
    return { ok: false, message: '请先填写词库名称。' }
  }

  if (matchedWords.length === 0) {
    return {
      ok: false,
      message: '没有可加入词库的单词。',
      unmatchedWords: unmatchedWords.slice(0, 20),
    }
  }

  const slug = slugifyLibraryName(name)

  const { data: library, error: libraryError } = await supabase
    .from('libraries')
    .insert({
      slug,
      name,
      description,
      source_type: 'custom',
      language: 'en',
      is_public: false,
      created_by: user.id,
    })
    .select('id, slug')
    .single()

  if (libraryError || !library) {
    console.error('Failed to create custom library:', libraryError)
    return { ok: false, message: '创建词库失败，请稍后再试。' }
  }

  const libraryWordsPayload = matchedWords.map((row, index) => ({
    library_id: library.id,
    word_id: row.id,
    position: index + 1,
  }))

  const { error: linkError } = await supabase.from('library_words').insert(libraryWordsPayload)

  if (linkError) {
    console.error('Failed to insert library words:', linkError)
    await supabase.from('libraries').delete().eq('id', library.id)
    return { ok: false, message: '词库创建成功，但加入单词时失败了，请重试。' }
  }

  revalidatePath('/libraries')
  revalidatePath('/study')

  return {
    ok: true,
    message:
      unmatchedWords.length > 0
        ? `词库已创建，加入 ${matchedWords.length} 个单词，另有 ${unmatchedWords.length} 个未匹配。`
        : `词库已创建，加入 ${matchedWords.length} 个单词。`,
    librarySlug: library.slug,
    matchedCount: matchedWords.length,
    unmatchedWords: unmatchedWords.slice(0, 20),
  }
}

export async function createCustomLibrary(input: {
  name: string
  description?: string
  wordsText: string
}): Promise<LibraryMutationResult> {
  const { supabase } = await requireActionSession()
  const candidateWords = parseWordInput(input.wordsText)

  if (candidateWords.length === 0) {
    return { ok: false, message: '请至少输入一个单词。' }
  }

  const { data: matchedRows, error: matchError } = await supabase
    .from('words')
    .select('id, word')
    .in('word', candidateWords)

  if (matchError) {
    console.error('Failed to match words for custom library:', matchError)
    return { ok: false, message: '匹配单词失败，请稍后再试。' }
  }

  const matched = ((matchedRows ?? []) as MatchedWordRow[]).sort((a, b) =>
    a.word.localeCompare(b.word)
  )
  const matchedMap = new Map(matched.map((row) => [row.word.toLowerCase(), row]))
  const unmatchedWords = candidateWords.filter((word) => !matchedMap.has(word))

  if (matched.length === 0) {
    return {
      ok: false,
      message: '没有匹配到可加入的单词。当前版本只支持加入词表中已有单词。',
      unmatchedWords: unmatchedWords.slice(0, 20),
    }
  }

  return createLibraryWithWords({
    name: input.name,
    description: input.description,
    matchedWords: matched,
    unmatchedWords,
  })
}

export async function createLibraryFromFavorites(input: {
  name: string
  description?: string
}): Promise<LibraryMutationResult> {
  const { supabase, user } = await requireActionSession()

  const { data, error } = await supabase
    .from('user_words')
    .select('word_id, words!inner(id, word)')
    .eq('user_id', user.id)
    .eq('is_favorite', true)
    .order('updated_at', { ascending: false })

  if (error) {
    console.error('Failed to load favorite words for library creation:', error)
    return { ok: false, message: '读取收藏单词失败，请稍后再试。' }
  }

  const matchedWords = Array.from(
    new Map(
      (data ?? [])
        .map((row) => {
          const words = Array.isArray(row.words) ? row.words[0] : row.words
          if (!words || typeof words.id !== 'string' || typeof words.word !== 'string') {
            return null
          }

          return [words.id, { id: words.id, word: words.word }] as const
        })
        .filter((row): row is readonly [string, MatchedWordRow] => row !== null)
    ).values()
  ).sort((a, b) => a.word.localeCompare(b.word))

  if (matchedWords.length === 0) {
    return { ok: false, message: '你还没有收藏任何单词，暂时无法从收藏生成词库。' }
  }

  return createLibraryWithWords({
    name: input.name,
    description: input.description,
    matchedWords,
  })
}

export async function deleteCustomLibrary(libraryId: string): Promise<LibraryMutationResult> {
  const { supabase, user } = await requireActionSession()

  const { data: library, error: libraryError } = await supabase
    .from('libraries')
    .select('id, source_type, created_by')
    .eq('id', libraryId)
    .maybeSingle()

  if (libraryError) {
    console.error('Failed to load library before deletion:', libraryError)
    return { ok: false, message: '读取词库信息失败，请稍后再试。' }
  }

  if (!library) {
    return { ok: false, message: '词库不存在，或已经被删除。' }
  }

  if (library.source_type !== 'custom' || library.created_by !== user.id) {
    return { ok: false, message: '只能删除你自己创建的自定义词库。' }
  }

  const { error: deleteError } = await supabase.from('libraries').delete().eq('id', libraryId)

  if (deleteError) {
    console.error('Failed to delete custom library:', deleteError)
    return { ok: false, message: '删除词库失败，请稍后再试。' }
  }

  revalidatePath('/libraries')
  revalidatePath('/study')

  return {
    ok: true,
    message: '自定义词库已删除。',
  }
}
