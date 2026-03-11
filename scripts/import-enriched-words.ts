import { readFileSync } from 'fs'
import path from 'path'
import {
  createEnrichmentClient,
  normalizeEnrichmentStage,
  parseImportCliArgs,
  type EnrichmentStage,
  type EnrichedWordDataset,
  type EnrichedWordRecord,
} from './enrichment-utils'

const CHUNK_SIZE = 100

async function main() {
  const options = parseImportCliArgs(process.argv.slice(2))
  const inputPath = path.resolve(options.input)
  const supabase = createEnrichmentClient()
  const dataset = JSON.parse(readFileSync(inputPath, 'utf-8')) as EnrichedWordDataset
  const stage = normalizeEnrichmentStage(dataset.selection?.stage) ?? 'refine'

  if (!Array.isArray(dataset.items) || dataset.items.length === 0) {
    throw new Error('Input dataset has no items to import.')
  }

  const skippedItems = dataset.items.filter(
    (item) =>
      item.examples.length < options.minExamples ||
      item.profile.collocations.length < options.minCollocations
  )
  const filteredItems = dataset.items.filter(
    (item) =>
      item.examples.length >= options.minExamples &&
      item.profile.collocations.length >= options.minCollocations
  )

  if (filteredItems.length === 0) {
    throw new Error('No enriched items passed the current import thresholds.')
  }

  const summary = {
    profilesUpserted: 0,
    examplesInserted: 0,
    sourcesInserted: 0,
    syncedPrimaryExamples: 0,
  }

  for (let index = 0; index < filteredItems.length; index += CHUNK_SIZE) {
    const chunk = filteredItems.slice(index, index + CHUNK_SIZE)
    await importChunk(supabase, chunk, summary, stage, options.syncPrimaryExample, options.dryRun)
  }

  console.log('Enriched import complete')
  console.log(`  input: ${inputPath}`)
  console.log(`  stage: ${stage}`)
  console.log(`  imported words: ${filteredItems.length}`)
  console.log(`  skipped words: ${skippedItems.length}`)
  console.log(`  profiles upserted: ${summary.profilesUpserted}`)
  console.log(`  examples inserted: ${summary.examplesInserted}`)
  console.log(`  sources inserted: ${summary.sourcesInserted}`)
  console.log(`  synced primary examples: ${summary.syncedPrimaryExamples}`)

  if (skippedItems.length > 0) {
    console.log(
      `  skipped list: ${skippedItems.map((item) => `${item.word}(ex=${item.examples.length},col=${item.profile.collocations.length})`).join(', ')}`
    )
  }
}

async function importChunk(
  supabase: ReturnType<typeof createEnrichmentClient>,
  chunk: EnrichedWordRecord[],
  summary: {
    profilesUpserted: number
    examplesInserted: number
    sourcesInserted: number
    syncedPrimaryExamples: number
  },
  stage: EnrichmentStage,
  syncPrimaryExample: boolean,
  dryRun: boolean
) {
  const wordIds = chunk.map((item) => item.wordId)
  const existingProfiles =
    dryRun || stage !== 'base'
      ? new Map<string, ExistingWordProfileRow>()
      : await fetchExistingProfiles(supabase, wordIds)

  const profileRows = chunk.map((item) => {
    const existing = existingProfiles.get(item.wordId)
    const preserveRefinedMethod = isRefinedGenerationMethod(existing?.generation_method)

    return {
      word_id: item.wordId,
      core_meaning: item.profile.coreMeaning,
      semantic_feel:
        stage === 'base'
          ? existing?.semantic_feel ?? null
          : item.profile.semanticFeel || null,
      usage_note:
        stage === 'base'
          ? existing?.usage_note ?? null
          : item.profile.usageNote || null,
      usage_register: item.profile.usageRegister,
      scene_tags: item.profile.sceneTags,
      collocations: item.profile.collocations,
      contrast_words:
        stage === 'base'
          ? existing?.contrast_words ?? []
          : item.profile.contrastWords,
      confidence_score: item.profile.confidenceScore,
      generation_method:
        stage === 'base' && preserveRefinedMethod
          ? existing?.generation_method
          : item.profile.generationMethod,
    }
  })

  const exampleRows = dedupeExampleRows(
    chunk.flatMap((item) =>
      item.examples.map((example) => ({
        word_id: item.wordId,
        sentence: example.sentence,
        translation: example.translation,
        scene: example.scene,
        source_name: example.sourceName,
        source_url: example.sourceUrl,
        license: example.license,
        quality_score: example.qualityScore,
        is_primary: example.isPrimary,
      }))
    )
  )

  const sourceRows = chunk.flatMap((item) =>
    item.sources.map((source) => ({
      word_id: item.wordId,
      source_name: source.sourceName,
      source_kind: source.sourceKind,
      source_url: source.sourceUrl,
      license: source.license,
      payload: source.payload,
      payload_hash: source.payloadHash,
    }))
  )

  const primaryExampleRows = syncPrimaryExample && stage !== 'base'
    ? chunk
        .map((item) => ({
          wordId: item.wordId,
          example: item.examples.find((example) => example.isPrimary)?.sentence ?? null,
        }))
        .filter((item) => Boolean(item.example))
    : []

  if (dryRun) {
    summary.profilesUpserted += profileRows.length
    summary.examplesInserted += exampleRows.length
    summary.sourcesInserted += sourceRows.length
    summary.syncedPrimaryExamples += primaryExampleRows.length
    return
  }

  const { error: profileError } = await supabase
    .from('word_profiles')
    .upsert(profileRows, { onConflict: 'word_id' })

  if (profileError) {
    throw profileError
  }

  if (stage === 'refine') {
    const { error: deleteExamplesError } = await supabase
      .from('word_profile_examples')
      .delete()
      .in('word_id', wordIds)

    if (deleteExamplesError) {
      throw deleteExamplesError
    }

    if (exampleRows.length > 0) {
      const { error: exampleError } = await supabase
        .from('word_profile_examples')
        .insert(exampleRows)

      if (exampleError) {
        throw exampleError
      }
    }

    const { error: deleteSourcesError } = await supabase
      .from('word_profile_sources')
      .delete()
      .in('word_id', wordIds)

    if (deleteSourcesError) {
      throw deleteSourcesError
    }

    if (sourceRows.length > 0) {
      const { error: sourceError } = await supabase
        .from('word_profile_sources')
        .insert(sourceRows)

      if (sourceError) {
        throw sourceError
      }
    }
  } else {
    if (exampleRows.length > 0) {
      const { error: exampleError } = await supabase
        .from('word_profile_examples')
        .upsert(exampleRows, { onConflict: 'word_id,sentence' })

      if (exampleError) {
        throw exampleError
      }
    }

    if (sourceRows.length > 0) {
      const { error: sourceError } = await supabase
        .from('word_profile_sources')
        .upsert(sourceRows, { onConflict: 'word_id,source_name,source_kind,payload_hash' })

      if (sourceError) {
        throw sourceError
      }
    }
  }

  if (primaryExampleRows.length > 0) {
    for (const row of primaryExampleRows) {
      const { error: wordError } = await supabase
        .from('words')
        .update({ example: row.example })
        .eq('id', row.wordId)

      if (wordError) {
        throw wordError
      }
    }
  }

  summary.profilesUpserted += profileRows.length
  summary.examplesInserted += exampleRows.length
  summary.sourcesInserted += sourceRows.length
  summary.syncedPrimaryExamples += primaryExampleRows.length
}

interface ExistingWordProfileRow {
  word_id: string
  semantic_feel: string | null
  usage_note: string | null
  contrast_words: unknown
  generation_method: string | null
}

async function fetchExistingProfiles(
  supabase: ReturnType<typeof createEnrichmentClient>,
  wordIds: string[]
) {
  const { data, error } = await supabase
    .from('word_profiles')
    .select('word_id, semantic_feel, usage_note, contrast_words, generation_method')
    .in('word_id', wordIds)

  if (error) {
    throw error
  }

  const rows = ((data ?? []) as ExistingWordProfileRow[]).filter(
    (row) => typeof row.word_id === 'string'
  )

  return new Map(rows.map((row) => [row.word_id, row]))
}

function isRefinedGenerationMethod(value: string | null | undefined) {
  if (!value) {
    return false
  }

  return !value.includes('base')
}

function dedupeExampleRows(
  rows: Array<{
    word_id: string
    sentence: string
    translation: string | null
    scene: string | null
    source_name: string
    source_url: string | null
    license: string | null
    quality_score: number
    is_primary: boolean
  }>
) {
  const map = new Map<string, (typeof rows)[number]>()

  for (const row of rows) {
    const key = `${row.word_id}::${row.sentence.trim().toLowerCase()}`
    const existing = map.get(key)
    if (!existing) {
      map.set(key, row)
      continue
    }

    const existingRank =
      (existing.is_primary ? 100 : 0) +
      (existing.translation ? 10 : 0) +
      (existing.quality_score ?? 0)
    const nextRank =
      (row.is_primary ? 100 : 0) +
      (row.translation ? 10 : 0) +
      (row.quality_score ?? 0)

    if (nextRank > existingRank) {
      map.set(key, row)
    }
  }

  return Array.from(map.values())
}

main().catch((error) => {
  console.error('Enriched import failed:', error)
  process.exit(1)
})
