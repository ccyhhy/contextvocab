import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

type ContrastWord = {
  word: string
  note?: string | null
}

type Profile = {
  coreMeaning?: string | null
  semanticFeel?: string | null
  usageNote?: string | null
  sceneTags?: string[] | null
  collocations?: string[] | null
  contrastWords?: ContrastWord[] | null
  confidenceScore?: number | null
  generationMethod?: string | null
}

type Example = {
  sentence?: string | null
}

type Item = {
  word: string
  definition?: string | null
  phonetic?: string | null
  tags?: string | null
  profile: Profile
  examples?: Example[] | null
}

type OutputFile = {
  items: Item[]
}

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, 'utf8')) as T
}

function simplifyItem(item: Item) {
  return {
    word: item.word,
    definition: item.definition ?? '',
    phonetic: item.phonetic ?? '',
    tags: item.tags ?? '',
    exampleSentences: (item.examples ?? [])
      .map((example) => example.sentence?.trim())
      .filter((sentence): sentence is string => Boolean(sentence))
      .slice(0, 3),
    coreMeaning: item.profile.coreMeaning ?? '',
    semanticFeel: item.profile.semanticFeel ?? '',
    usageNote: item.profile.usageNote ?? '',
    sceneTags: item.profile.sceneTags ?? [],
    collocations: item.profile.collocations ?? [],
    contrastWords: (item.profile.contrastWords ?? []).map((entry) => ({
      word: entry.word,
      note: entry.note ?? '',
    })),
    confidenceScore: item.profile.confidenceScore ?? null,
    generationMethod: item.profile.generationMethod ?? '',
  }
}

const gpt52Path = resolve(
  'e:/codework/words/data/enriched/refine-next/refine-lite-jsonminify-gpt52-suspicious-first100.c100.json',
)
const gpt54Path = resolve(
  'e:/codework/words/data/enriched/refine-next/refine-lite-maya-gpt54-suspicious-first20.c3.json',
)

const gpt52 = readJson<OutputFile>(gpt52Path)
const gpt54 = readJson<OutputFile>(gpt54Path)

const gpt52ByWord = new Map(gpt52.items.map((item) => [item.word, item] as const))
const overlapWords = gpt54.items
  .map((item) => item.word)
  .filter((word) => gpt52ByWord.has(word))

const items = overlapWords.map((word) => {
  const item52 = gpt52ByWord.get(word)
  const item54 = gpt54.items.find((item) => item.word === word)

  if (!item52 || !item54) {
    throw new Error(`Missing overlap item for word: ${word}`)
  }

  return {
    word,
    source: {
      definition: item54.definition ?? item52.definition ?? '',
      phonetic: item54.phonetic ?? item52.phonetic ?? '',
      tags: item54.tags ?? item52.tags ?? '',
      exampleSentences: (item54.examples ?? item52.examples ?? [])
        .map((example) => example.sentence?.trim())
        .filter((sentence): sentence is string => Boolean(sentence))
        .slice(0, 3),
    },
    candidates: {
      gpt_5_2: simplifyItem(item52),
      gpt_5_4: simplifyItem(item54),
    },
  }
})

const bundle = {
  generatedAt: new Date().toISOString(),
  task: 'compare_refine_quality',
  scope: 'first20_overlap_words',
  sourceFiles: {
    gpt_5_2: gpt52Path,
    gpt_5_4: gpt54Path,
  },
  evaluationRubric: [
    'Whether semanticFeel captures the core meaning, tone, and common usage feel.',
    'Whether usageNote is actually useful for Chinese English learners and supports reuse.',
    'Whether contrastWords are true contrast terms rather than loose synonyms or off-topic related words.',
    'Whether the output is strong enough to be used directly in a production lexicon.',
  ],
  outputRequirements: [
    'Start with an overall conclusion about which model is better for this lexicon refine task.',
    'For each word, choose exactly one winner: gpt_5_2, gpt_5_4, or tie.',
    'Give a short reason for each word, focusing on semanticFeel, usageNote, and contrastWords.',
    'Finish with total counts and the most common issues for each model.',
  ],
  items,
}

const prompt = `You are reviewing two candidate outputs for an English lexicon refine task.
Compare gpt_5_2 and gpt_5_4 using the paired data below.

Evaluation rules:
1. Judge whether semanticFeel captures the core meaning, tone, and common usage feel.
2. Judge whether usageNote is genuinely useful for Chinese English learners.
3. Judge whether contrastWords are high-quality contrast terms, not just loose synonyms or off-topic related words.
4. Judge whether the result is strong enough to be used directly in a production lexicon.

Use this exact output structure:

Overall conclusion:
- Write 3 to 6 sentences.

Per-word results:
- word: <word> | winner: gpt_5_2 / gpt_5_4 / tie | reason: <1 to 2 short sentences>

Summary:
- gpt_5_2 wins: <number>
- gpt_5_4 wins: <number>
- ties: <number>
- common issues in gpt_5_2: <2 to 4 points>
- common issues in gpt_5_4: <2 to 4 points>

Review data:

${JSON.stringify(bundle, null, 2)}
`

const bundlePath = resolve(
  'e:/codework/words/data/enriched/refine-next/gemini-compare-gpt52-vs-gpt54-first20.json',
)
const promptPath = resolve(
  'e:/codework/words/data/enriched/refine-next/gemini-compare-gpt52-vs-gpt54-first20.prompt.md',
)

writeFileSync(bundlePath, `${JSON.stringify(bundle, null, 2)}\n`, 'utf8')
writeFileSync(promptPath, `${prompt}\n`, 'utf8')

console.log(bundlePath)
console.log(promptPath)
