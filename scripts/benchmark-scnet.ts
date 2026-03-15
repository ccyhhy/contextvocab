import { mkdirSync, writeFileSync } from 'fs'
import path from 'path'

interface BenchmarkOptions {
  apiKey: string
  baseUrl: string
  models: string[]
  levels: number[]
  repeats: number
  minRequestsPerLevel: number
  maxRequestsPerLevel: number
  maxTokens: number
  prompt: string
  timeoutMs: number
  cooldownMs: number
  stableSuccessRate: number
  stopOn429: boolean
  output: string | null
}

interface RequestResult {
  ok: boolean
  status: number | null
  elapsedMs: number
  errorKind: '429' | 'http' | 'network' | 'parse' | null
  errorMessage: string | null
}

interface LevelSummary {
  concurrency: number
  totalRequests: number
  success: number
  successRate: number
  tooManyRequests: number
  httpErrors: number
  networkErrors: number
  parseErrors: number
  p50Ms: number | null
  p95Ms: number | null
  avgMs: number | null
  sampleErrors: string[]
}

interface ModelSummary {
  model: string
  levels: LevelSummary[]
  highestStableConcurrency: number | null
  hit429: boolean
}

const DEFAULT_BASE_URL = 'https://api.scnet.cn/api/llm'
const DEFAULT_MODELS = ['DeepSeek-V3.2', 'MiniMax-M2.5']
const DEFAULT_LEVELS = [1, 2, 4, 8, 12, 16, 24, 32, 48, 64]
const DEFAULT_PROMPT = 'Reply with OK only.'

function parseArgs(argv: string[]): BenchmarkOptions {
  const apiKey = getStringArg(argv, '--api-key') ?? process.env.SCNET_API_KEY ?? ''
  if (!apiKey) {
    throw new Error('Missing API key. Pass --api-key or set SCNET_API_KEY.')
  }

  const levels = parseIntegerList(getStringArg(argv, '--levels')) ?? DEFAULT_LEVELS
  const models = parseStringList(getStringArg(argv, '--models')) ?? DEFAULT_MODELS

  return {
    apiKey,
    baseUrl: getStringArg(argv, '--base-url') ?? process.env.SCNET_API_BASE ?? DEFAULT_BASE_URL,
    models,
    levels,
    repeats: getPositiveIntegerArg(argv, '--repeats', 2),
    minRequestsPerLevel: getPositiveIntegerArg(argv, '--min-requests', 8),
    maxRequestsPerLevel: getPositiveIntegerArg(argv, '--max-requests', 128),
    maxTokens: getPositiveIntegerArg(argv, '--max-tokens', 4),
    prompt: getStringArg(argv, '--prompt') ?? DEFAULT_PROMPT,
    timeoutMs: getPositiveIntegerArg(argv, '--timeout-ms', 45000),
    cooldownMs: getPositiveIntegerArg(argv, '--cooldown-ms', 1500),
    stableSuccessRate: getRateArg(argv, '--stable-success-rate', 0.95),
    stopOn429: !argv.includes('--keep-going-after-429'),
    output: getStringArg(argv, '--output') ?? null,
  }
}

function resolveChatCompletionsUrl(baseUrl: string) {
  const trimmed = baseUrl.trim().replace(/\/+$/, '')
  if (trimmed.endsWith('/chat/completions')) {
    return trimmed
  }
  if (trimmed.endsWith('/v1')) {
    return `${trimmed}/chat/completions`
  }
  return `${trimmed}/v1/chat/completions`
}

async function runRequest(
  url: string,
  apiKey: string,
  model: string,
  prompt: string,
  maxTokens: number,
  timeoutMs: number
): Promise<RequestResult> {
  const startedAt = Date.now()
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: maxTokens,
        stream: false,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
      signal: controller.signal,
    })

    const elapsedMs = Date.now() - startedAt
    const text = await response.text()

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        elapsedMs,
        errorKind: response.status === 429 ? '429' : 'http',
        errorMessage: compactErrorText(text || response.statusText),
      }
    }

    try {
      JSON.parse(text)
      return {
        ok: true,
        status: response.status,
        elapsedMs,
        errorKind: null,
        errorMessage: null,
      }
    } catch (error) {
      return {
        ok: false,
        status: response.status,
        elapsedMs,
        errorKind: 'parse',
        errorMessage: compactErrorText(error instanceof Error ? error.message : String(error)),
      }
    }
  } catch (error) {
    const elapsedMs = Date.now() - startedAt
    return {
      ok: false,
      status: null,
      elapsedMs,
      errorKind: 'network',
      errorMessage: compactErrorText(error instanceof Error ? error.message : String(error)),
    }
  } finally {
    clearTimeout(timeoutId)
  }
}

async function runLevel(
  url: string,
  model: string,
  options: BenchmarkOptions,
  concurrency: number
): Promise<LevelSummary> {
  const totalRequests = Math.max(
    options.minRequestsPerLevel,
    Math.min(options.maxRequestsPerLevel, concurrency * options.repeats)
  )

  let nextIndex = 0
  const latencies: number[] = []
  const sampleErrors: string[] = []
  let success = 0
  let tooManyRequests = 0
  let httpErrors = 0
  let networkErrors = 0
  let parseErrors = 0

  async function worker() {
    while (true) {
      const currentIndex = nextIndex
      nextIndex += 1

      if (currentIndex >= totalRequests) {
        return
      }

      const result = await runRequest(
        url,
        options.apiKey,
        model,
        options.prompt,
        options.maxTokens,
        options.timeoutMs
      )

      if (result.ok) {
        success += 1
        latencies.push(result.elapsedMs)
        continue
      }

      if (result.errorKind === '429') {
        tooManyRequests += 1
      } else if (result.errorKind === 'parse') {
        parseErrors += 1
      } else if (result.errorKind === 'network') {
        networkErrors += 1
      } else {
        httpErrors += 1
      }

      if (sampleErrors.length < 5) {
        const statusLabel = result.status === null ? 'network' : String(result.status)
        sampleErrors.push(`${statusLabel}: ${result.errorMessage ?? 'unknown error'}`)
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()))

  return {
    concurrency,
    totalRequests,
    success,
    successRate: Number((success / totalRequests).toFixed(4)),
    tooManyRequests,
    httpErrors,
    networkErrors,
    parseErrors,
    p50Ms: percentile(latencies, 50),
    p95Ms: percentile(latencies, 95),
    avgMs: latencies.length > 0 ? Number((latencies.reduce((sum, value) => sum + value, 0) / latencies.length).toFixed(1)) : null,
    sampleErrors,
  }
}

async function sleep(ms: number) {
  if (ms <= 0) {
    return
  }
  await new Promise((resolve) => setTimeout(resolve, ms))
}

function percentile(values: number[], p: number) {
  if (values.length === 0) {
    return null
  }
  const sorted = [...values].sort((left, right) => left - right)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[index] ?? null
}

function compactErrorText(value: string) {
  return value.replace(/\s+/g, ' ').trim().slice(0, 240)
}

function parseIntegerList(value: string | null) {
  if (!value) {
    return null
  }
  const parsed = value
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isInteger(item) && item > 0)

  return parsed.length > 0 ? Array.from(new Set(parsed)) : null
}

function parseStringList(value: string | null) {
  if (!value) {
    return null
  }
  const items = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

  return items.length > 0 ? Array.from(new Set(items)) : null
}

function getStringArg(argv: string[], name: string) {
  const index = argv.indexOf(name)
  if (index === -1) {
    return null
  }
  const value = argv[index + 1]
  return value && !value.startsWith('--') ? value : null
}

function getPositiveIntegerArg(argv: string[], name: string, fallback: number) {
  const raw = getStringArg(argv, name)
  const parsed = raw ? Number(raw) : fallback
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function getRateArg(argv: string[], name: string, fallback: number) {
  const raw = getStringArg(argv, name)
  const parsed = raw ? Number(raw) : fallback
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 1 ? parsed : fallback
}

function formatLevelSummary(model: string, summary: LevelSummary) {
  const avg = summary.avgMs === null ? '-' : `${summary.avgMs}ms`
  const p50 = summary.p50Ms === null ? '-' : `${summary.p50Ms}ms`
  const p95 = summary.p95Ms === null ? '-' : `${summary.p95Ms}ms`
  const successRate = `${(summary.successRate * 100).toFixed(1)}%`
  return [
    `[${model}]`,
    `c=${summary.concurrency}`,
    `n=${summary.totalRequests}`,
    `ok=${summary.success}`,
    `rate=${successRate}`,
    `429=${summary.tooManyRequests}`,
    `http=${summary.httpErrors}`,
    `net=${summary.networkErrors}`,
    `parse=${summary.parseErrors}`,
    `avg=${avg}`,
    `p50=${p50}`,
    `p95=${p95}`,
  ].join(' ')
}

function getDefaultOutputPath() {
  const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, '').replace('T', '-')
  return path.join(process.cwd(), 'data', 'logs', `scnet-benchmark-${timestamp}.json`)
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const url = resolveChatCompletionsUrl(options.baseUrl)

  console.log(`SCNet benchmark starting`)
  console.log(`  endpoint: ${url}`)
  console.log(`  models: ${options.models.join(', ')}`)
  console.log(`  levels: ${options.levels.join(', ')}`)
  console.log(`  max tokens: ${options.maxTokens}`)
  console.log(`  repeats: ${options.repeats}`)

  const modelSummaries: ModelSummary[] = []

  for (const model of options.models) {
    console.log(`\nModel: ${model}`)
    const levels: LevelSummary[] = []
    let highestStableConcurrency: number | null = null
    let hit429 = false

    for (const concurrency of options.levels) {
      const summary = await runLevel(url, model, options, concurrency)
      levels.push(summary)
      console.log(formatLevelSummary(model, summary))

      const isStable =
        summary.tooManyRequests === 0 &&
        summary.httpErrors === 0 &&
        summary.networkErrors === 0 &&
        summary.parseErrors === 0 &&
        summary.successRate >= options.stableSuccessRate

      if (isStable) {
        highestStableConcurrency = concurrency
      }

      if (summary.tooManyRequests > 0) {
        hit429 = true
        if (options.stopOn429) {
          break
        }
      }

      await sleep(options.cooldownMs)
    }

    modelSummaries.push({
      model,
      levels,
      highestStableConcurrency,
      hit429,
    })
  }

  const outputPath = path.resolve(options.output ?? getDefaultOutputPath())
  mkdirSync(path.dirname(outputPath), { recursive: true })
  writeFileSync(
    outputPath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        endpoint: url,
        options: {
          ...options,
          apiKey: '[redacted]',
        },
        results: modelSummaries,
      },
      null,
      2
    )}\n`,
    'utf-8'
  )

  console.log(`\nReport written to ${outputPath}`)
}

main().catch((error) => {
  console.error('SCNet benchmark failed:', error)
  process.exit(1)
})
