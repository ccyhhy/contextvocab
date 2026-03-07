import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export interface WordInsertInput {
  word: string
  phonetic: string
  definition: string
  tags: string
  example: string | null
}

interface ExistingWordRow {
  id: string
  word: string
  phonetic: string | null
  definition: string | null
  tags: string | null
  example: string | null
}

export interface ImportSummary {
  inserted: number
  updated: number
  unchanged: number
}

export const CHUNK_SIZE = 200

export function createServiceRoleClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment variables.'
    )
  }

  return createClient(supabaseUrl, serviceRoleKey)
}

export function normalizeWord(value: string) {
  return value.replace(/^\uFEFF/, '').trim()
}

export function normalizeTags(tags: string | null | undefined) {
  return Array.from(
    new Set(
      (tags ?? '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    )
  ).join(',')
}

export function mergeTags(...tagSets: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      tagSets
        .flatMap((tagSet) => (tagSet ?? '').split(','))
        .map((item) => item.trim())
        .filter(Boolean)
    )
  ).join(',')
}

export function dedupeWordInputs(items: WordInsertInput[]) {
  const byWord = new Map<string, WordInsertInput>()

  for (const item of items) {
    const normalizedWord = normalizeWord(item.word).toLowerCase()
    if (!normalizedWord) {
      continue
    }

    const nextItem: WordInsertInput = {
      ...item,
      word: normalizedWord,
      phonetic: item.phonetic.trim(),
      definition: item.definition.trim(),
      tags: normalizeTags(item.tags),
      example: item.example?.trim() || null,
    }

    const existing = byWord.get(normalizedWord)
    if (!existing) {
      byWord.set(normalizedWord, nextItem)
      continue
    }

    byWord.set(normalizedWord, {
      word: normalizedWord,
      phonetic: existing.phonetic || nextItem.phonetic,
      definition: existing.definition || nextItem.definition,
      tags: mergeTags(existing.tags, nextItem.tags),
      example: existing.example || nextItem.example,
    })
  }

  return Array.from(byWord.values())
}

async function getExistingWords(supabase: SupabaseClient, words: string[]) {
  const { data, error } = await supabase
    .from('words')
    .select('id, word, phonetic, definition, tags, example')
    .in('word', words)

  if (error) {
    throw error
  }

  return new Map(
    ((data ?? []) as ExistingWordRow[]).map((row) => [row.word.toLowerCase(), row])
  )
}

export async function upsertWords(
  supabase: SupabaseClient,
  items: WordInsertInput[]
): Promise<ImportSummary> {
  const summary: ImportSummary = {
    inserted: 0,
    updated: 0,
    unchanged: 0,
  }

  const normalizedItems = dedupeWordInputs(items)

  for (let index = 0; index < normalizedItems.length; index += CHUNK_SIZE) {
    const chunk = normalizedItems.slice(index, index + CHUNK_SIZE)
    const existingMap = await getExistingWords(
      supabase,
      chunk.map((item) => item.word)
    )

    const payload = chunk.map((item) => {
      const existing = existingMap.get(item.word)
      const nextRecord = {
        word: item.word,
        phonetic: item.phonetic || existing?.phonetic || '',
        definition: item.definition || existing?.definition || '',
        tags: mergeTags(existing?.tags, item.tags),
        example: item.example ?? existing?.example ?? null,
      }

      if (!existing) {
        summary.inserted += 1
      } else if (
        nextRecord.phonetic !== (existing.phonetic ?? '') ||
        nextRecord.definition !== (existing.definition ?? '') ||
        nextRecord.tags !== normalizeTags(existing.tags) ||
        nextRecord.example !== (existing.example ?? null)
      ) {
        summary.updated += 1
      } else {
        summary.unchanged += 1
      }

      return nextRecord
    })

    const { error } = await supabase
      .from('words')
      .upsert(payload, { onConflict: 'word' })

    if (error) {
      throw error
    }
  }

  return summary
}

export function hasTag(tags: string | null | undefined, target: string) {
  const normalizedTarget = target.trim().toLowerCase()
  return (tags ?? '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .includes(normalizedTarget)
}
