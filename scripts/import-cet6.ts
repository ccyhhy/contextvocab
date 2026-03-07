import { readFileSync } from 'fs'
import path from 'path'
import {
  createServiceRoleClient,
  normalizeWord,
  type WordInsertInput,
  upsertWords,
} from './official-word-utils'

function parseLine(line: string): WordInsertInput | null {
  const trimmed = line.trim()
  if (!trimmed) {
    return null
  }

  const phoneticMatch = trimmed.match(/\[([^\]]+)\]/)
  const phonetic = phoneticMatch ? `[${phoneticMatch[1]}]` : ''
  const word = normalizeWord(trimmed.split(/[\s\[]/)[0] ?? '').toLowerCase()

  if (!word || !/^[a-z][a-z-]*$/i.test(word)) {
    return null
  }

  const definition = phoneticMatch
    ? trimmed.slice(trimmed.indexOf(']') + 1).trim()
    : trimmed.slice(word.length).trim()

  if (!definition) {
    return null
  }

  return {
    word,
    phonetic,
    definition,
    tags: 'CET-6',
    example: null,
  }
}

async function main() {
  const supabase = createServiceRoleClient()
  const filePath = path.join(process.cwd(), 'data', 'CET6.txt')
  const lines = readFileSync(filePath, 'utf-8').split(/\r?\n/)
  const words = lines.map(parseLine).filter((item): item is WordInsertInput => item !== null)

  const summary = await upsertWords(supabase, words)
  console.log('CET-6 import complete')
  console.log(`  parsed words: ${words.length}`)
  console.log(`  inserted: ${summary.inserted}`)
  console.log(`  updated: ${summary.updated}`)
  console.log(`  unchanged: ${summary.unchanged}`)
}

main().catch((error) => {
  console.error('CET-6 import failed:', error)
  process.exit(1)
})
