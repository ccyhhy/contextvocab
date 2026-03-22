import { existsSync, readFileSync } from 'fs'
import path from 'path'
import {
  type GrammarGeneratedItem,
  type GrammarLibraryGeneratedDataset,
  generateGrammarItemDraft,
  normalizeGeneratedDataset,
  parseGenerateGrammarCliArgs,
  readGrammarSeedDataset,
  writeGrammarGeneratedDataset,
} from './grammar-library-utils'

async function main() {
  const options = parseGenerateGrammarCliArgs(process.argv.slice(2))
  const seedDataset = readGrammarSeedDataset(options.input)
  const selectedItems = filterSeedItems(seedDataset.items, options.slugs, options.limit)
  const existingDataset = readExistingGeneratedDataset(options.output)
  const existingItems = existingDataset?.items ?? []
  const existingBySlug = new Map(existingItems.map((item) => [item.slug, item]))
  const pendingItems = selectedItems.filter((item) => !existingBySlug.has(item.slug))

  if (selectedItems.length === 0) {
    throw new Error('No seed items matched the current selection.')
  }

  const itemsByFamily = new Map<string, typeof seedDataset.items>()
  for (const item of seedDataset.items) {
    const familyItems = itemsByFamily.get(item.family) ?? []
    familyItems.push(item)
    itemsByFamily.set(item.family, familyItems)
  }

  const generated = await generateInParallel(pendingItems, {
    concurrency: options.concurrency,
    getFamilyPeers: (family) => itemsByFamily.get(family) ?? [],
    onItemComplete: (item) => {
      existingBySlug.set(item.slug, item)
      persistGeneratedDataset(options.output, seedDataset.library, options.input, existingBySlug)
    },
  })

  const allGenerated = selectedItems
    .map((item) => existingBySlug.get(item.slug))
    .filter((item): item is GrammarGeneratedItem => Boolean(item))

  const failedCount = selectedItems.length - allGenerated.length
  persistGeneratedDataset(options.output, seedDataset.library, options.input, existingBySlug)

  const dataset = {
    library: seedDataset.library,
    generatedAt: new Date().toISOString(),
    source: path.resolve(options.input),
    model: process.env.OPENAI_ENRICH_REFINE_MODEL || process.env.OPENAI_ENRICH_MODEL || process.env.OPENAI_MODEL || null,
    items: allGenerated,
  }

  const writtenPath = writeGrammarGeneratedDataset(options.output, dataset)
  console.log(`Grammar item generation complete`)
  console.log(`  seed: ${path.resolve(options.input)}`)
  console.log(`  output: ${writtenPath}`)
  console.log(`  items: ${allGenerated.length}`)
  console.log(`  concurrency: ${options.concurrency}`)
  console.log(`  reused: ${existingItems.length}`)
  console.log(`  generated this run: ${generated.length}`)

  if (failedCount > 0) {
    throw new Error(`Generation finished with ${failedCount} item(s) still missing. Re-run the same command to resume.`)
  }
}

async function generateInParallel(
  items: ReturnType<typeof readGrammarSeedDataset>['items'],
  options: {
    concurrency: number
    getFamilyPeers: (family: string) => ReturnType<typeof readGrammarSeedDataset>['items']
    onItemComplete: (item: GrammarGeneratedItem) => void
  }
) {
  const results = new Array<GrammarGeneratedItem>(items.length)
  let nextIndex = 0
  let completed = 0
  const failures: Array<{ slug: string; message: string }> = []

  async function worker() {
    while (true) {
      const currentIndex = nextIndex
      nextIndex += 1

      if (currentIndex >= items.length) {
        return
      }

      const item = items[currentIndex]
      const startedAt = Date.now()
      try {
        const generated = await generateGrammarItemDraft(item, options.getFamilyPeers(item.family))
        results[currentIndex] = generated
        options.onItemComplete(generated)
        completed += 1
        console.log(
          `[${completed}/${items.length}] ${item.slug} examples=${generated.examples.length} templates=${generated.templates.length} elapsed=${((Date.now() - startedAt) / 1000).toFixed(1)}s`
        )
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        failures.push({ slug: item.slug, message })
        console.error(`[fail] ${item.slug} ${message}`)
      }
    }
  }

  const workerCount = Math.min(options.concurrency, items.length)
  await Promise.all(Array.from({ length: workerCount }, () => worker()))
  if (failures.length > 0) {
    console.error(`Failed items (${failures.length}): ${failures.map((item) => item.slug).join(', ')}`)
  }
  return results.filter((item): item is GrammarGeneratedItem => Boolean(item))
}

function filterSeedItems(
  items: ReturnType<typeof readGrammarSeedDataset>['items'],
  slugs: string[],
  limit: number | null
) {
  const filtered = slugs.length > 0 ? items.filter((item) => slugs.includes(item.slug)) : items
  return limit ? filtered.slice(0, limit) : filtered
}

function readExistingGeneratedDataset(filePath: string) {
  const absolutePath = path.resolve(filePath)
  if (!existsSync(absolutePath)) {
    return null
  }

  return normalizeGeneratedDataset(
    JSON.parse(readFileSync(absolutePath, 'utf-8')) as GrammarLibraryGeneratedDataset
  )
}

function persistGeneratedDataset(
  outputPath: string,
  library: ReturnType<typeof readGrammarSeedDataset>['library'],
  inputPath: string,
  itemsBySlug: Map<string, GrammarGeneratedItem>
) {
  const items = Array.from(itemsBySlug.values()).sort((a, b) => a.slug.localeCompare(b.slug))
  return writeGrammarGeneratedDataset(outputPath, {
    library,
    generatedAt: new Date().toISOString(),
    source: path.resolve(inputPath),
    model:
      process.env.OPENAI_ENRICH_REFINE_MODEL ||
      process.env.OPENAI_ENRICH_MODEL ||
      process.env.OPENAI_MODEL ||
      null,
    items,
  })
}

main().catch((error) => {
  console.error('Grammar item generation failed:', error)
  process.exit(1)
})
