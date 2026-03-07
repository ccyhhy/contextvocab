'use server'

import { revalidatePath } from 'next/cache'
import { requireActionSession } from '@/lib/supabase/user'

export interface CreateLibraryResult {
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
        .split(/[\n\r,，;；\t ]+/)
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean)
    )
  )
}

export async function createCustomLibrary(input: {
  name: string
  description?: string
  wordsText: string
}): Promise<CreateLibraryResult> {
  const { supabase, user } = await requireActionSession()
  const name = input.name.trim()
  const description = input.description?.trim() || null
  const candidateWords = parseWordInput(input.wordsText)

  if (!name) {
    return { ok: false, message: '请先填写词库名称。' }
  }

  if (candidateWords.length === 0) {
    return { ok: false, message: '请至少输入一个单词。' }
  }

  const { data: matchedRows, error: matchError } = await supabase
    .from('words')
    .select('id, word')
    .in('word', candidateWords)

  if (matchError) {
    console.error('Failed to match words for custom library:', matchError)
    return { ok: false, message: '匹配单词失败，请稍后重试。' }
  }

  const matched = (matchedRows ?? []) as MatchedWordRow[]
  if (matched.length === 0) {
    return {
      ok: false,
      message: '没有匹配到可加入的单词。当前版本只支持加入词表中已有单词。',
      unmatchedWords: candidateWords.slice(0, 20),
    }
  }

  const matchedMap = new Map(matched.map((row) => [row.word.toLowerCase(), row]))
  const unmatchedWords = candidateWords.filter((word) => !matchedMap.has(word))
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
    return { ok: false, message: '创建词库失败，请稍后重试。' }
  }

  const libraryWordsPayload = matched.map((row, index) => ({
    library_id: library.id,
    word_id: row.id,
    position: index + 1,
  }))

  const { error: linkError } = await supabase
    .from('library_words')
    .insert(libraryWordsPayload)

  if (linkError) {
    console.error('Failed to insert library words:', linkError)
    await supabase.from('libraries').delete().eq('id', library.id)
    return { ok: false, message: '词库已创建失败，加入单词时出错，请重试。' }
  }

  revalidatePath('/libraries')
  revalidatePath('/study')

  return {
    ok: true,
    message:
      unmatchedWords.length > 0
        ? `已创建词库，加入 ${matched.length} 个单词，另有 ${unmatchedWords.length} 个未匹配。`
        : `已创建词库，加入 ${matched.length} 个单词。`,
    librarySlug: library.slug,
    matchedCount: matched.length,
    unmatchedWords: unmatchedWords.slice(0, 20),
  }
}
