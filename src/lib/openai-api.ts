export type OpenAiApiType = 'chat_completions' | 'responses'

export function normalizeOpenAiApiType(value?: string | null): OpenAiApiType {
  const normalized = (value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (
    normalized === 'responses' ||
    normalized === 'openai_responses' ||
    normalized === 'response'
  ) {
    return 'responses'
  }

  return 'chat_completions'
}

export function getOpenAiApiUrl(apiBase: string, apiType: OpenAiApiType) {
  const trimmed = apiBase.trim().replace(/\/+$/, '')
  const suffix = apiType === 'responses' ? '/responses' : '/chat/completions'
  return trimmed.endsWith(suffix) ? trimmed : `${trimmed}${suffix}`
}

export function buildTextGenerationRequest({
  apiType,
  model,
  systemPrompt,
  userPrompt,
  temperature,
  stream = false,
  jsonMode = false,
  maxOutputTokens,
}: {
  apiType: OpenAiApiType
  model: string
  systemPrompt: string
  userPrompt: string
  temperature: number
  stream?: boolean
  jsonMode?: boolean
  maxOutputTokens?: number
}) {
  if (apiType === 'responses') {
    return {
      model,
      instructions: systemPrompt,
      input: userPrompt,
      temperature,
      stream,
      store: false,
      ...(typeof maxOutputTokens === 'number' ? { max_output_tokens: maxOutputTokens } : {}),
      ...(jsonMode
        ? {
            text: {
              format: {
                type: 'json_object',
              },
            },
          }
        : {}),
    }
  }

  return {
    model,
    temperature,
    ...(stream ? { stream: true } : {}),
    ...(typeof maxOutputTokens === 'number' ? { max_tokens: maxOutputTokens } : {}),
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  }
}

function joinTextFragments(content: unknown): string {
  if (typeof content === 'string') {
    return content
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string') {
          return item
        }

        if (typeof item !== 'object' || item === null) {
          return ''
        }

        const record = item as Record<string, unknown>
        if (typeof record.text === 'string') {
          return record.text
        }

        if (typeof record.content === 'string') {
          return record.content
        }

        if (typeof (record.text as { value?: unknown } | null)?.value === 'string') {
          return (record.text as { value: string }).value
        }

        return joinTextFragments(record.content)
      })
      .join('\n')
  }

  if (typeof content === 'object' && content !== null) {
    const record = content as Record<string, unknown>
    if (typeof record.text === 'string') {
      return record.text
    }

    if (typeof (record.text as { value?: unknown } | null)?.value === 'string') {
      return (record.text as { value: string }).value
    }

    return joinTextFragments(record.content)
  }

  return ''
}

export function extractTextFromOpenAiResponse(payload: unknown): string {
  if (typeof payload !== 'object' || payload === null) {
    return ''
  }

  const record = payload as Record<string, unknown>
  const outputText = joinTextFragments(record.output_text).trim()
  if (outputText) {
    return outputText
  }

  const choices = Array.isArray(record.choices) ? record.choices : []
  for (const choice of choices) {
    if (typeof choice !== 'object' || choice === null) {
      continue
    }

    const messageContent = joinTextFragments(
      (choice as { message?: { content?: unknown } }).message?.content
    ).trim()
    if (messageContent) {
      return messageContent
    }
  }

  const outputItems = Array.isArray(record.output) ? record.output : []
  const outputContent = outputItems
    .map((item) => {
      if (typeof item !== 'object' || item === null) {
        return ''
      }

      return joinTextFragments((item as Record<string, unknown>).content)
    })
    .join('\n')
    .trim()

  if (outputContent) {
    return outputContent
  }

  return joinTextFragments(record.content).trim()
}

export function extractTextFromResponseEvent(
  eventName: string | null,
  payload: unknown
): string | null {
  if (typeof payload !== 'object' || payload === null) {
    return null
  }

  const record = payload as Record<string, unknown>
  if (typeof record.delta === 'string') {
    return record.delta
  }

  if (eventName?.includes('output_text') && typeof record.text === 'string') {
    return record.text
  }

  const nestedResponseText = extractTextFromOpenAiResponse(record.response)
  if (nestedResponseText) {
    return nestedResponseText
  }

  const directText = extractTextFromOpenAiResponse(record)
  return directText || null
}
