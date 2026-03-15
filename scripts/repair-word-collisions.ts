import { writeFileSync } from 'fs'
import path from 'path'
import {
  createServiceRoleClient,
  mergeTags,
  normalizeLexicalWord,
  normalizeWord,
} from './official-word-utils'

const DEFAULT_REPORT_FILE = path.join(process.cwd(), 'data', 'logs', 'word-collision-repair.json')
const PAGE_SIZE = 1000
const REPAIR_SYMBOL_REPLACEMENTS = [
  [/\u0254/g, 'o'],
  [/\u014b/g, 'n'],
  [/\u0283/g, 'f'],
  [/蓴/g, 'o'],
  [/艐/g, 'n'],
  [/蕛/g, 'f'],
] as const
const MANUAL_RENAMES = new Map<string, string>([['reservior', 'reservoir']])

interface CliOptions {
  apply: boolean
  report: string | null
}

interface WordRow {
  id: string
  word: string
  phonetic: string | null
  definition: string | null
  tags: string | null
  example: string | null
}

interface WordProfileRow {
  id: string
  word_id: string
  core_meaning: string | null
  semantic_feel: string | null
  usage_note: string | null
  usage_register: string | null
  scene_tags: string[] | null
  collocations: unknown
  contrast_words: Array<{ word?: string; note?: string }> | null
  confidence_score: number | null
  generation_method: string | null
}

interface ExampleRow {
  id: string
  word_id: string
  sentence: string
  translation: string | null
  scene: string | null
  source_name: string
  source_url: string | null
  license: string | null
  quality_score: number | null
  is_primary: boolean
}

interface SourceRow {
  id: string
  word_id: string
  source_name: string
  source_kind: string
  source_url: string | null
  license: string | null
  payload: unknown
  payload_hash: string
}

interface LibraryWordRow {
  id: string
  library_id: string
  word_id: string
  position: number | null
}

interface UserLibraryWordRow {
  id: string
  user_id: string
  library_id: string
  word_id: string
}

interface UserWordRow {
  id: string
  user_id: string
  word_id: string
}

interface SentenceRow {
  id: string
  word_id: string
}

interface CollisionCandidate {
  from: WordRow
  to: WordRow
  reason: 'collision' | 'manual'
}

async function main() {
  const options = parseCliArgs(process.argv.slice(2))
  const supabase = createServiceRoleClient()
  const words = await fetchAllWords(supabase)
  const collisions = buildCollisionCandidates(words)
  const report = {
    generatedAt: new Date().toISOString(),
    apply: options.apply,
    collisions: [] as Array<Record<string, unknown>>,
  }

  console.log('Word collision repair')
  console.log(`  candidates: ${collisions.length}`)

  for (const collision of collisions) {
    const details = await inspectCollision(supabase, collision)
    report.collisions.push(details)
    console.log(`  - ${collision.from.word} -> ${collision.to.word} (${collision.reason})`)

    if (!options.apply) {
      continue
    }

    await applyCollisionRepair(supabase, collision)
  }

  if (options.report) {
    const reportPath = path.resolve(options.report)
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
    console.log(`  report: ${reportPath}`)
  }

  if (!options.apply) {
    console.log('Dry run complete. No database rows updated.')
    return
  }

  console.log('Collision repair applied.')
}

function parseCliArgs(argv: string[]): CliOptions {
  return {
    apply: argv.includes('--apply'),
    report: getStringArg(argv, '--report') ?? DEFAULT_REPORT_FILE,
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

function buildCollisionCandidates(words: WordRow[]) {
  const byWord = new Map(words.map((row) => [row.word, row]))
  const seen = new Set<string>()
  const collisions: CollisionCandidate[] = []

  for (const row of words) {
    const manualTarget = MANUAL_RENAMES.get(row.word)
    if (manualTarget) {
      const canonical = byWord.get(manualTarget)
      if (canonical) {
        const key = `${row.id}:${canonical.id}`
        if (!seen.has(key)) {
          seen.add(key)
          collisions.push({ from: row, to: canonical, reason: 'manual' })
        }
      } else {
        collisions.push({
          from: row,
          to: {
            ...row,
            word: manualTarget,
          },
          reason: 'manual',
        })
      }
      continue
    }

    const repaired = repairHeadwordCandidate(row.word)
    if (!repaired || repaired === row.word) {
      continue
    }

    const canonical = byWord.get(repaired)
    if (!canonical || canonical.id === row.id) {
      continue
    }

    const key = `${row.id}:${canonical.id}`
    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    collisions.push({ from: row, to: canonical, reason: 'collision' })
  }

  return collisions.sort((left, right) => left.from.word.localeCompare(right.from.word))
}

function repairHeadwordCandidate(value: string) {
  let normalized = normalizeWord(value).normalize('NFKC')
  for (const [pattern, replacement] of REPAIR_SYMBOL_REPLACEMENTS) {
    normalized = normalized.replace(pattern, replacement)
  }
  return normalizeLexicalWord(normalized)
}

async function inspectCollision(
  supabase: ReturnType<typeof createServiceRoleClient>,
  collision: CollisionCandidate
) {
  const ids = [collision.from.id, collision.to.id]
  const [profiles, examples, sources, libraryWords, userLibraryWords, userWords, sentences] = await Promise.all([
    fetchWordProfiles(supabase, ids),
    fetchWordExamples(supabase, ids),
    fetchWordSources(supabase, ids),
    fetchLibraryWords(supabase, ids),
    fetchUserLibraryWords(supabase, ids),
    fetchUserWords(supabase, ids),
    fetchSentences(supabase, ids),
  ])

  return {
    from: collision.from.word,
    to: collision.to.word,
    reason: collision.reason,
    counts: {
      profiles: countByWordId(profiles, ids),
      examples: countByWordId(examples, ids),
      sources: countByWordId(sources, ids),
      libraryWords: countByWordId(libraryWords, ids),
      userLibraryWords: countByWordId(userLibraryWords, ids),
      userWords: countByWordId(userWords, ids),
      sentences: countByWordId(sentences, ids),
    },
  }
}

async function applyCollisionRepair(
  supabase: ReturnType<typeof createServiceRoleClient>,
  collision: CollisionCandidate
) {
  const from = collision.from
  const targetWord = collision.to

  if (targetWord.id === from.id) {
    const { error } = await supabase.from('words').update({ word: targetWord.word }).eq('id', from.id)
    if (error) {
      throw error
    }
    return
  }

  const ids = [from.id, targetWord.id]
  const [
    profiles,
    examples,
    sources,
    libraryWords,
    userLibraryWords,
    userWords,
    sentences,
  ] = await Promise.all([
    fetchWordProfiles(supabase, ids),
    fetchWordExamples(supabase, ids),
    fetchWordSources(supabase, ids),
    fetchLibraryWords(supabase, ids),
    fetchUserLibraryWords(supabase, ids),
    fetchUserWords(supabase, ids),
    fetchSentences(supabase, ids),
  ])

  const fromProfile = profiles.find((row) => row.word_id === from.id) ?? null
  const toProfile = profiles.find((row) => row.word_id === targetWord.id) ?? null

  const mergedWord = {
    phonetic: targetWord.phonetic || from.phonetic,
    definition: targetWord.definition || from.definition || '',
    tags: mergeTags(targetWord.tags, from.tags),
    example: targetWord.example || from.example,
  }

  const { error: wordUpdateError } = await supabase
    .from('words')
    .update(mergedWord)
    .eq('id', targetWord.id)

  if (wordUpdateError) {
    throw wordUpdateError
  }

  const mergedExamples = mergeExampleRows(
    examples.filter((row) => row.word_id === targetWord.id),
    examples.filter((row) => row.word_id === from.id),
    targetWord.id
  )
  if (mergedExamples.length > 0) {
    const { error } = await supabase
      .from('word_profile_examples')
      .upsert(mergedExamples, { onConflict: 'word_id,sentence' })
    if (error) {
      throw error
    }
  }

  const mergedSources = mergeSourceRows(
    sources.filter((row) => row.word_id === targetWord.id),
    sources.filter((row) => row.word_id === from.id),
    targetWord.id
  )
  if (mergedSources.length > 0) {
    const { error } = await supabase
      .from('word_profile_sources')
      .upsert(mergedSources, { onConflict: 'word_id,source_name,source_kind,payload_hash' })
    if (error) {
      throw error
    }
  }

  const mergedProfile = mergeProfiles(toProfile, fromProfile, targetWord.id)
  if (mergedProfile) {
    const { error } = await supabase
      .from('word_profiles')
      .upsert([mergedProfile], { onConflict: 'word_id' })
    if (error) {
      throw error
    }
  }

  await mergeLibraryWordRefs(supabase, libraryWords, from.id, targetWord.id)
  await mergeUserLibraryWordRefs(supabase, userLibraryWords, from.id, targetWord.id)
  await mergeUserWordRefs(supabase, userWords, from.id, targetWord.id)

  if (sentences.some((row) => row.word_id === from.id)) {
    const { error } = await supabase.from('sentences').update({ word_id: targetWord.id }).eq('word_id', from.id)
    if (error) {
      throw error
    }
  }

  const { error: deleteExamplesError } = await supabase.from('word_profile_examples').delete().eq('word_id', from.id)
  if (deleteExamplesError) {
    throw deleteExamplesError
  }

  const { error: deleteSourcesError } = await supabase.from('word_profile_sources').delete().eq('word_id', from.id)
  if (deleteSourcesError) {
    throw deleteSourcesError
  }

  const { error: deleteProfileError } = await supabase.from('word_profiles').delete().eq('word_id', from.id)
  if (deleteProfileError) {
    throw deleteProfileError
  }

  const { error: deleteWordError } = await supabase.from('words').delete().eq('id', from.id)
  if (deleteWordError) {
    throw deleteWordError
  }
}

function mergeProfiles(
  preferred: WordProfileRow | null,
  fallback: WordProfileRow | null,
  wordId: string
) {
  if (!preferred && !fallback) {
    return null
  }

  const ranked = [preferred, fallback]
    .filter((row): row is WordProfileRow => row !== null)
    .sort((left, right) => scoreProfile(right) - scoreProfile(left))
  const best = ranked[0]
  const alt = ranked[1] ?? null

  return {
    word_id: wordId,
    core_meaning: best.core_meaning ?? alt?.core_meaning ?? '',
    semantic_feel: pickLongerText(best.semantic_feel, alt?.semantic_feel ?? null),
    usage_note: pickLongerText(best.usage_note, alt?.usage_note ?? null),
    usage_register: best.usage_register ?? alt?.usage_register ?? null,
    scene_tags: mergeSceneTags(best.scene_tags, alt?.scene_tags ?? []),
    collocations: mergeStringLists(best.collocations, alt?.collocations ?? []),
    contrast_words: mergeContrastWords(best.contrast_words, alt?.contrast_words ?? []),
    confidence_score: Math.max(best.confidence_score ?? 0, alt?.confidence_score ?? 0) || null,
    generation_method: pickGenerationMethod(best.generation_method, alt?.generation_method ?? null),
  }
}

function scoreProfile(profile: WordProfileRow) {
  return (
    generationMethodWeight(profile.generation_method) * 1000 +
    (profile.semantic_feel?.length ?? 0) +
    (profile.usage_note?.length ?? 0) +
    normalizeStringList(profile.collocations).length * 20 +
    (Array.isArray(profile.contrast_words) ? profile.contrast_words.length : 0) * 10 +
    (normalizeStringList(profile.scene_tags).filter((item) => item !== 'general').length > 0 ? 50 : 0) +
    Math.round((profile.confidence_score ?? 0) * 100)
  )
}

function generationMethodWeight(value: string | null | undefined) {
  switch (value) {
    case 'ai_refine':
      return 5
    case 'fallback_refine':
      return 4
    case 'ai':
      return 3
    case 'fallback':
      return 2
    case 'ai_base':
      return 1
    default:
      return 0
  }
}

function pickGenerationMethod(primary: string | null | undefined, secondary: string | null | undefined) {
  return generationMethodWeight(primary) >= generationMethodWeight(secondary)
    ? (primary ?? secondary ?? 'ai_refine')
    : (secondary ?? primary ?? 'ai_refine')
}

function pickLongerText(primary: string | null | undefined, secondary: string | null | undefined) {
  const primaryText = primary?.trim() ?? ''
  const secondaryText = secondary?.trim() ?? ''
  return primaryText.length >= secondaryText.length ? (primaryText || secondaryText || null) : (secondaryText || primaryText || null)
}

function mergeSceneTags(primary: unknown, secondary: unknown) {
  const tags = mergeStringLists(primary, secondary)
  return tags.length > 1 ? tags.filter((item) => item !== 'general') : tags
}

function mergeStringLists(primary: unknown, secondary: unknown) {
  return Array.from(new Set([...normalizeStringList(primary), ...normalizeStringList(secondary)])).slice(0, 6)
}

function normalizeStringList(value: unknown) {
  const items =
    Array.isArray(value)
      ? value
      : typeof value === 'string'
        ? safeParseArray(value)
        : []

  return items
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
}

function safeParseArray(value: string): unknown[] {
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function mergeContrastWords(
  primary: Array<{ word?: string; note?: string }> | null | undefined,
  secondary: Array<{ word?: string; note?: string }> | null | undefined
) {
  const map = new Map<string, { word: string; note: string }>()
  for (const item of [...(primary ?? []), ...(secondary ?? [])]) {
    const word = normalizeWord(item.word ?? '')
    const note = normalizeWord(item.note ?? '')
    if (!word) {
      continue
    }

    const key = word.toLowerCase()
    const existing = map.get(key)
    if (!existing || note.length > existing.note.length) {
      map.set(key, { word, note })
    }
  }

  return Array.from(map.values()).slice(0, 3)
}

function mergeExampleRows(primary: ExampleRow[], secondary: ExampleRow[], wordId: string) {
  const map = new Map<string, Omit<ExampleRow, 'id'>>()
  for (const row of [...primary, ...secondary]) {
    const key = normalizeExampleKey(row.sentence)
    const candidate = {
      word_id: wordId,
      sentence: row.sentence,
      translation: row.translation,
      scene: row.scene,
      source_name: row.source_name,
      source_url: row.source_url,
      license: row.license,
      quality_score: row.quality_score,
      is_primary: row.is_primary,
    }
    const existing = map.get(key)
    if (!existing || scoreExample(candidate) > scoreExample(existing)) {
      map.set(key, candidate)
    }
  }

  return Array.from(map.values())
}

function normalizeExampleKey(value: string) {
  return normalizeWord(value).toLowerCase()
}

function scoreExample(row: Omit<ExampleRow, 'id'>) {
  return (row.is_primary ? 100 : 0) + (row.translation ? 10 : 0) + Math.round((row.quality_score ?? 0) * 10)
}

function mergeSourceRows(primary: SourceRow[], secondary: SourceRow[], wordId: string) {
  const map = new Map<string, Omit<SourceRow, 'id'>>()
  for (const row of [...primary, ...secondary]) {
    const key = `${row.source_name}::${row.source_kind}::${row.payload_hash}`
    if (map.has(key)) {
      continue
    }

    map.set(key, {
      word_id: wordId,
      source_name: row.source_name,
      source_kind: row.source_kind,
      source_url: row.source_url,
      license: row.license,
      payload: row.payload,
      payload_hash: row.payload_hash,
    })
  }

  return Array.from(map.values())
}

async function mergeLibraryWordRefs(
  supabase: ReturnType<typeof createServiceRoleClient>,
  rows: LibraryWordRow[],
  fromWordId: string,
  toWordId: string
) {
  const existingKeys = new Set(rows.filter((row) => row.word_id === toWordId).map((row) => `${row.library_id}`))

  for (const row of rows.filter((item) => item.word_id === fromWordId)) {
    if (existingKeys.has(row.library_id)) {
      const { error } = await supabase.from('library_words').delete().eq('id', row.id)
      if (error) {
        throw error
      }
      continue
    }

    const { error } = await supabase.from('library_words').update({ word_id: toWordId }).eq('id', row.id)
    if (error) {
      throw error
    }
  }
}

async function mergeUserLibraryWordRefs(
  supabase: ReturnType<typeof createServiceRoleClient>,
  rows: UserLibraryWordRow[],
  fromWordId: string,
  toWordId: string
) {
  const existingKeys = new Set(
    rows
      .filter((row) => row.word_id === toWordId)
      .map((row) => `${row.user_id}::${row.library_id}`)
  )

  for (const row of rows.filter((item) => item.word_id === fromWordId)) {
    const key = `${row.user_id}::${row.library_id}`
    if (existingKeys.has(key)) {
      const { error } = await supabase.from('user_library_words').delete().eq('id', row.id)
      if (error) {
        throw error
      }
      continue
    }

    const { error } = await supabase.from('user_library_words').update({ word_id: toWordId }).eq('id', row.id)
    if (error) {
      throw error
    }
  }
}

async function mergeUserWordRefs(
  supabase: ReturnType<typeof createServiceRoleClient>,
  rows: UserWordRow[],
  fromWordId: string,
  toWordId: string
) {
  const existingKeys = new Set(rows.filter((row) => row.word_id === toWordId).map((row) => row.user_id))

  for (const row of rows.filter((item) => item.word_id === fromWordId)) {
    if (existingKeys.has(row.user_id)) {
      const { error } = await supabase.from('user_words').delete().eq('id', row.id)
      if (error) {
        throw error
      }
      continue
    }

    const { error } = await supabase.from('user_words').update({ word_id: toWordId }).eq('id', row.id)
    if (error) {
      throw error
    }
  }
}

function countByWordId(rows: Array<{ word_id: string }>, ids: string[]) {
  return Object.fromEntries(ids.map((id) => [id, rows.filter((row) => row.word_id === id).length]))
}

async function fetchAllWords(supabase: ReturnType<typeof createServiceRoleClient>) {
  const rows: WordRow[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const to = from + PAGE_SIZE - 1
    const { data, error } = await supabase
      .from('words')
      .select('id, word, phonetic, definition, tags, example')
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

async function fetchWordProfiles(supabase: ReturnType<typeof createServiceRoleClient>, wordIds: string[]) {
  const { data, error } = await supabase
    .from('word_profiles')
    .select('id, word_id, core_meaning, semantic_feel, usage_note, usage_register, scene_tags, collocations, contrast_words, confidence_score, generation_method')
    .in('word_id', wordIds)

  if (error) {
    throw error
  }

  return (data ?? []) as WordProfileRow[]
}

async function fetchWordExamples(supabase: ReturnType<typeof createServiceRoleClient>, wordIds: string[]) {
  const { data, error } = await supabase
    .from('word_profile_examples')
    .select('id, word_id, sentence, translation, scene, source_name, source_url, license, quality_score, is_primary')
    .in('word_id', wordIds)

  if (error) {
    throw error
  }

  return (data ?? []) as ExampleRow[]
}

async function fetchWordSources(supabase: ReturnType<typeof createServiceRoleClient>, wordIds: string[]) {
  const { data, error } = await supabase
    .from('word_profile_sources')
    .select('id, word_id, source_name, source_kind, source_url, license, payload, payload_hash')
    .in('word_id', wordIds)

  if (error) {
    throw error
  }

  return (data ?? []) as SourceRow[]
}

async function fetchLibraryWords(supabase: ReturnType<typeof createServiceRoleClient>, wordIds: string[]) {
  const { data, error } = await supabase
    .from('library_words')
    .select('id, library_id, word_id, position')
    .in('word_id', wordIds)

  if (error) {
    throw error
  }

  return (data ?? []) as LibraryWordRow[]
}

async function fetchUserLibraryWords(supabase: ReturnType<typeof createServiceRoleClient>, wordIds: string[]) {
  const { data, error } = await supabase
    .from('user_library_words')
    .select('id, user_id, library_id, word_id')
    .in('word_id', wordIds)

  if (error) {
    throw error
  }

  return (data ?? []) as UserLibraryWordRow[]
}

async function fetchUserWords(supabase: ReturnType<typeof createServiceRoleClient>, wordIds: string[]) {
  const { data, error } = await supabase
    .from('user_words')
    .select('id, user_id, word_id')
    .in('word_id', wordIds)

  if (error) {
    throw error
  }

  return (data ?? []) as UserWordRow[]
}

async function fetchSentences(supabase: ReturnType<typeof createServiceRoleClient>, wordIds: string[]) {
  const { data, error } = await supabase
    .from('sentences')
    .select('id, word_id')
    .in('word_id', wordIds)

  if (error) {
    throw error
  }

  return (data ?? []) as SentenceRow[]
}

main().catch((error) => {
  console.error('Word collision repair failed:', error)
  process.exit(1)
})
