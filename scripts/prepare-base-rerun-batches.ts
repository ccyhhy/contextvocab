import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import path from 'path'

const DEFAULT_CANDIDATES_FILE = path.join(process.cwd(), 'data', 'enriched', 'base-rerun-candidates.json')
const DEFAULT_OUTPUT_DIR = path.join(process.cwd(), 'data', 'enriched', 'base-rerun-batches')
const DEFAULT_MIN_SCORE = 7
const DEFAULT_BATCH_SIZE = 20

interface CliOptions {
  input: string
  outputDir: string
  minScore: number
  batchSize: number
}

interface CandidateRow {
  word: string
  score: number
  reasons?: unknown
}

interface CandidatePayload {
  items?: CandidateRow[]
}

interface BatchManifestRow {
  batchNumber: number
  wordCount: number
  wordsFile: string
  outputFile: string
  words: string[]
}

async function main() {
  const options = parseCliArgs(process.argv.slice(2))
  const inputPath = path.resolve(options.input)
  const outputDir = path.resolve(options.outputDir)
  const payload = JSON.parse(readFileSync(inputPath, 'utf-8')) as CandidatePayload
  const words = dedupeWords(
    (Array.isArray(payload.items) ? payload.items : [])
      .filter((item) => typeof item?.word === 'string' && Number(item?.score) >= options.minScore)
      .map((item) => item.word)
  )

  if (words.length === 0) {
    throw new Error(`No candidate words found with minScore >= ${options.minScore}`)
  }

  mkdirSync(outputDir, { recursive: true })

  const prefix = `score-gte-${options.minScore}`
  const allWordsFile = path.join(outputDir, `${prefix}.words.txt`)
  writeWordFile(allWordsFile, words)

  const batches: BatchManifestRow[] = []
  for (let index = 0; index < words.length; index += options.batchSize) {
    const batchNumber = Math.floor(index / options.batchSize) + 1
    const batchWords = words.slice(index, index + options.batchSize)
    const suffix = String(batchNumber).padStart(2, '0')
    const wordsFile = path.join(outputDir, `${prefix}-batch-${suffix}.words.txt`)
    const outputFile = path.join(outputDir, `${prefix}-batch-${suffix}.json`)

    writeWordFile(wordsFile, batchWords)
    batches.push({
      batchNumber,
      wordCount: batchWords.length,
      wordsFile,
      outputFile,
      words: batchWords,
    })
  }

  const manifestPath = path.join(outputDir, `${prefix}.manifest.json`)
  writeFileSync(
    manifestPath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        input: inputPath,
        minScore: options.minScore,
        batchSize: options.batchSize,
        totalWords: words.length,
        allWordsFile,
        batches,
      },
      null,
      2
    )}\n`,
    'utf-8'
  )

  console.log(`Prepared base rerun batches`)
  console.log(`  input: ${inputPath}`)
  console.log(`  output dir: ${outputDir}`)
  console.log(`  min score: ${options.minScore}`)
  console.log(`  total words: ${words.length}`)
  console.log(`  batches: ${batches.length}`)
  console.log(`  manifest: ${manifestPath}`)

  for (const batch of batches.slice(0, 10)) {
    console.log(
      `  - batch ${batch.batchNumber}: words=${batch.wordCount} wordsFile=${batch.wordsFile}`
    )
  }
}

function parseCliArgs(argv: string[]): CliOptions {
  return {
    input: getStringArg(argv, '--input') ?? DEFAULT_CANDIDATES_FILE,
    outputDir: getStringArg(argv, '--output-dir') ?? DEFAULT_OUTPUT_DIR,
    minScore: getNumberArg(argv, '--min-score', DEFAULT_MIN_SCORE),
    batchSize: getNumberArg(argv, '--batch-size', DEFAULT_BATCH_SIZE),
  }
}

function writeWordFile(filePath: string, words: string[]) {
  writeFileSync(filePath, `${words.join('\n')}\n`, 'utf-8')
}

function dedupeWords(words: string[]) {
  return Array.from(
    new Set(
      words
        .map((item) => item.trim())
        .filter(Boolean)
    )
  )
}

function getStringArg(argv: string[], name: string) {
  const index = argv.indexOf(name)
  if (index === -1) {
    return null
  }

  const value = argv[index + 1]
  return value && !value.startsWith('--') ? value : null
}

function getNumberArg(argv: string[], name: string, fallback: number) {
  const value = getStringArg(argv, name)
  const parsed = value ? Number(value) : fallback
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : fallback
}

main().catch((error) => {
  console.error('Prepare base rerun batches failed:', error)
  process.exit(1)
})
