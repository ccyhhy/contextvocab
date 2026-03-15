import path from 'path'
import {
  buildDataset,
  createEnrichmentClient,
  fetchSourceWords,
  generateEnrichedRecord,
  getDefaultOutputFile,
  parseEnrichCliArgs,
  summarizeEnrichedRecord,
  writeEnrichedDataset,
} from './enrichment-utils'

async function main() {
  const options = parseEnrichCliArgs(process.argv.slice(2))
  const supabase = createEnrichmentClient()
  const sourceWords = await fetchSourceWords(supabase, options)

  if (sourceWords.length === 0) {
    throw new Error('No source words matched the current selection.')
  }

  const concurrency = Math.min(options.concurrency, sourceWords.length)
  console.log(
    `Starting enrichment: stage=${options.stage} refineMode=${options.refineMode} words=${sourceWords.length} concurrency=${concurrency} ai=${options.withAi ? 'yes' : 'no'}`
  )

  const items = await enrichWordsInParallel(sourceWords, {
    concurrency,
      withAi: options.withAi,
      stage: options.stage,
      refineMode: options.refineMode,
    })

  const dataset = buildDataset(items, {
    stage: options.stage,
    tag: options.tag,
    limit: options.limit,
    offset: options.offset,
    words: options.words,
    refineMode: options.stage === 'refine' ? options.refineMode : null,
  })

  const outputPath = path.resolve(options.output || getDefaultOutputFile())

  if (options.dryRun) {
    console.log('Dry run complete. No file written.')
    console.log(JSON.stringify(items.map(summarizeEnrichedRecord), null, 2))
    console.log(`Planned output: ${outputPath}`)
    return
  }

  const writtenPath = writeEnrichedDataset(outputPath, dataset)
  console.log(`Enriched dataset written to ${writtenPath}`)
  console.log(`  words: ${items.length}`)
  console.log(`  stage: ${options.stage}`)
  console.log(`  with AI: ${options.withAi ? 'yes' : 'no'}`)
  if (options.stage === 'refine') {
    console.log(`  refine mode: ${options.refineMode}`)
  }
  console.log(`  concurrency: ${concurrency}`)
}

async function enrichWordsInParallel(
  sourceWords: Awaited<ReturnType<typeof fetchSourceWords>>,
  options: {
    concurrency: number
    withAi: boolean
    stage: 'base' | 'refine'
    refineMode: 'lite' | 'full'
  }
) {
  const items = new Array(sourceWords.length)
  let nextIndex = 0
  let completed = 0

  async function worker() {
    while (true) {
      const currentIndex = nextIndex
      nextIndex += 1

      if (currentIndex >= sourceWords.length) {
        return
      }

      const wordRow = sourceWords[currentIndex]
      const startedAt = Date.now()

      try {
        const enriched = await generateEnrichedRecord(wordRow, {
          withAi: options.withAi,
          stage: options.stage,
          refineMode: options.refineMode,
        })
        items[currentIndex] = enriched
        completed += 1

        if (shouldLogProgress(completed, sourceWords.length)) {
          const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(1)
          console.log(
            `[${completed}/${sourceWords.length}] ${wordRow.word} method=${enriched.profile.generationMethod} examples=${enriched.examples.length} collocations=${enriched.profile.collocations.length} elapsed=${elapsedSeconds}s`
          )
        }
      } catch (error) {
        throw new Error(
          `Failed to enrich "${wordRow.word}" at index ${currentIndex}: ${error instanceof Error ? error.message : String(error)}`
        )
      }
    }
  }

  await Promise.all(Array.from({ length: options.concurrency }, () => worker()))
  return items
}

function shouldLogProgress(completed: number, total: number) {
  return completed <= 3 || completed === total || completed % 10 === 0
}

main().catch((error) => {
  console.error('Word enrichment failed:', error)
  process.exit(1)
})
