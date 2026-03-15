import { readFileSync } from 'fs'
import path from 'path'
import {
  createEnrichmentClient,
  normalizeEnrichmentStage,
  normalizeRefineMode,
  parseImportCliArgs,
  type EnrichmentStage,
  type EnrichedWordDataset,
  type EnrichedWordRecord,
  type RefineMode,
} from './enrichment-utils'

const CHUNK_SIZE = 100

async function main() {
  const options = parseImportCliArgs(process.argv.slice(2))
  const inputPath = path.resolve(options.input)
  const supabase = createEnrichmentClient()
  const dataset = JSON.parse(readFileSync(inputPath, 'utf-8')) as EnrichedWordDataset
  const stage = normalizeEnrichmentStage(dataset.selection?.stage) ?? 'refine'
  const refineMode = normalizeRefineMode(dataset.selection?.refineMode) ?? 'full'

  if (!Array.isArray(dataset.items) || dataset.items.length === 0) {
    throw new Error('Input dataset has no items to import.')
  }

  const skippedItems = dataset.items.filter((item) => {
    const methodAllowed =
      options.requireGenerationMethods.length === 0 ||
      options.requireGenerationMethods.includes(item.profile.generationMethod)
    return (
      !methodAllowed ||
      item.examples.length < options.minExamples ||
      item.profile.collocations.length < options.minCollocations
    )
  })
  const filteredItems = dataset.items.filter((item) => {
    const methodAllowed =
      options.requireGenerationMethods.length === 0 ||
      options.requireGenerationMethods.includes(item.profile.generationMethod)
    return (
      methodAllowed &&
      item.examples.length >= options.minExamples &&
      item.profile.collocations.length >= options.minCollocations
    )
  })

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
    await importChunk(
      supabase,
      chunk,
      summary,
      stage,
      refineMode,
      options.syncPrimaryExample,
      options.dryRun,
      options.examplesOnly
    )
  }

  console.log('Enriched import complete')
  console.log(`  input: ${inputPath}`)
  console.log(`  stage: ${stage}`)
  if (stage === 'refine') {
    console.log(`  refine mode: ${refineMode}`)
  }
  console.log(`  imported words: ${filteredItems.length}`)
  console.log(`  skipped words: ${skippedItems.length}`)
  if (options.examplesOnly) {
    console.log(`  import mode: examples_only`)
  }
  if (options.requireGenerationMethods.length > 0) {
    console.log(`  required generation methods: ${options.requireGenerationMethods.join(', ')}`)
  }
  console.log(`  profiles upserted: ${summary.profilesUpserted}`)
  console.log(`  examples inserted: ${summary.examplesInserted}`)
  console.log(`  sources inserted: ${summary.sourcesInserted}`)
  console.log(`  synced primary examples: ${summary.syncedPrimaryExamples}`)

  if (skippedItems.length > 0) {
    console.log(
      `  skipped list: ${skippedItems.map((item) => `${item.word}(method=${item.profile.generationMethod},ex=${item.examples.length},col=${item.profile.collocations.length})`).join(', ')}`
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
  refineMode: RefineMode,
  syncPrimaryExample: boolean,
  dryRun: boolean,
  examplesOnly: boolean
) {
  const wordIds = chunk.map((item) => item.wordId)
  const preserveBaseFieldsForLiteRefine = stage === 'refine' && refineMode === 'lite'
  const replaceExamplesForFullRefine = stage === 'refine' && refineMode === 'full'
  const existingProfiles =
    dryRun || (stage !== 'base' && !preserveBaseFieldsForLiteRefine)
      ? new Map<string, ExistingWordProfileRow>()
      : await fetchExistingProfiles(supabase, wordIds)

  const profileRows = examplesOnly
    ? []
    : chunk.map((item) => {
        const existing = existingProfiles.get(item.wordId)
        const preserveRefinedMethod = isRefinedGenerationMethod(existing?.generation_method)
        const preserveExistingAiRefine = existing?.generation_method === 'ai_refine' && item.profile.generationMethod !== 'ai_refine'

        if (stage === 'refine' && preserveBaseFieldsForLiteRefine) {
          return {
            word_id: item.wordId,
            core_meaning: existing?.core_meaning ?? item.profile.coreMeaning,
            semantic_feel: preserveExistingAiRefine
              ? (existing?.semantic_feel ?? item.profile.semanticFeel ?? null)
              : (item.profile.semanticFeel || existing?.semantic_feel || null),
            usage_note: preserveExistingAiRefine
              ? (existing?.usage_note ?? item.profile.usageNote ?? null)
              : (item.profile.usageNote || existing?.usage_note || null),
            usage_register: existing?.usage_register ?? item.profile.usageRegister,
            scene_tags: existing?.scene_tags ?? item.profile.sceneTags,
            collocations: existing?.collocations ?? item.profile.collocations,
            contrast_words: preserveExistingAiRefine
              ? existing?.contrast_words ?? item.profile.contrastWords
              : item.profile.contrastWords.length > 0
                ? item.profile.contrastWords
                : existing?.contrast_words ?? [],
            confidence_score: existing?.confidence_score ?? item.profile.confidenceScore,
            generation_method: preserveExistingAiRefine
              ? existing?.generation_method
              : item.profile.generationMethod,
          }
        }

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

  const primaryExampleRows = syncPrimaryExample && stage !== 'base' && replaceExamplesForFullRefine
    ? chunk
        .map((item) => ({
          wordId: item.wordId,
          example: item.examples.find((example) => example.isPrimary)?.sentence ?? null,
        }))
        .filter((item) => Boolean(item.example))
    : []

  if (dryRun) {
    summary.profilesUpserted += profileRows.length
    summary.examplesInserted += replaceExamplesForFullRefine || stage === 'base' ? exampleRows.length : 0
    summary.sourcesInserted += sourceRows.length
    summary.syncedPrimaryExamples += primaryExampleRows.length
    return
  }

  if (profileRows.length > 0) {
    const { error: profileError } = await supabase
      .from('word_profiles')
      .upsert(profileRows, { onConflict: 'word_id' })

    if (profileError) {
      throw profileError
    }
  }

  if (stage === 'refine') {
    if (replaceExamplesForFullRefine) {
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
    }

    if (refineMode === 'full') {
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
    } else if (sourceRows.length > 0) {
      const { error: sourceError } = await supabase
        .from('word_profile_sources')
        .upsert(sourceRows, { onConflict: 'word_id,source_name,source_kind,payload_hash' })

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
  core_meaning: string | null
  semantic_feel: string | null
  usage_note: string | null
  usage_register: string | null
  scene_tags: string[] | null
  collocations: unknown
  contrast_words: unknown
  confidence_score: number | null
  generation_method: string | null
}

async function fetchExistingProfiles(
  supabase: ReturnType<typeof createEnrichmentClient>,
  wordIds: string[]
) {
  const { data, error } = await supabase
    .from('word_profiles')
    .select('word_id, core_meaning, semantic_feel, usage_note, usage_register, scene_tags, collocations, contrast_words, confidence_score, generation_method')
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
