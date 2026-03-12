import { readFileSync, readdirSync } from 'fs'
import path from 'path'
import {
  createServiceRoleClient,
  sanitizeOfficialWordEntry,
  type WordInsertInput,
  upsertWords,
} from './official-word-utils'

interface RawCet4Word {
  word: string
  mean: string
  phonetic_symbol: string
  initial: string
}

function parseCet4File(filePath: string) {
  const raw = JSON.parse(readFileSync(filePath, 'utf-8')) as RawCet4Word[]

  return raw
    .map((item) => {
      const cleaned = sanitizeOfficialWordEntry(item.word, item.mean)
      return {
        word: cleaned.word,
        phonetic: item.phonetic_symbol?.trim() ?? '',
        definition: cleaned.definition,
        tags: 'CET-4',
        example: null,
      }
    })
    .filter((item) => item.word.length > 0 && item.definition.length > 0)
}

async function main() {
  const supabase = createServiceRoleClient()
  const dataDir = path.join(process.cwd(), 'data')
  const files = readdirSync(dataDir)
    .filter((file) => /^CET4_[A-Z]\.json$/.test(file))
    .sort()

  if (files.length === 0) {
    throw new Error('No CET-4 source files found in data/.')
  }

  const allWords: WordInsertInput[] = []
  for (const file of files) {
    allWords.push(...parseCet4File(path.join(dataDir, file)))
  }

  const summary = await upsertWords(supabase, allWords)
  console.log('CET-4 import complete')
  console.log(`  source files: ${files.length}`)
  console.log(`  parsed words: ${allWords.length}`)
  console.log(`  inserted: ${summary.inserted}`)
  console.log(`  updated: ${summary.updated}`)
  console.log(`  unchanged: ${summary.unchanged}`)
}

main().catch((error) => {
  console.error('CET-4 import failed:', error)
  process.exit(1)
})
