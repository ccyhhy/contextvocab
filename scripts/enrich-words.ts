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

  const items = []
  for (const wordRow of sourceWords) {
    console.log(`enriching ${wordRow.word} [${options.stage}]...`)
    const enriched = await generateEnrichedRecord(wordRow, { withAi: options.withAi, stage: options.stage })
    items.push(enriched)
    console.log(
      `  method=${enriched.profile.generationMethod} examples=${enriched.examples.length} collocations=${enriched.profile.collocations.length}`
    )
  }

  const dataset = buildDataset(items, {
    stage: options.stage,
    tag: options.tag,
    limit: options.limit,
    offset: options.offset,
    words: options.words,
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
}

main().catch((error) => {
  console.error('Word enrichment failed:', error)
  process.exit(1)
})
