import { NextRequest } from 'next/server'
import {
  buildEvaluationSystemPrompt,
  buildEvaluationUserPrompt,
} from '@/lib/evaluation-format'
import { requireActionSession } from '@/lib/supabase/user'

interface EvaluateRequestBody {
  word?: string
  sentence?: string
  definition?: string
  tags?: string
  wordId?: string
}

interface ProviderDeltaChunk {
  choices?: Array<{
    delta?: {
      content?: string
    }
  }>
}

interface PastSentenceRow {
  original_text: string | null
}

function readProviderContent(payload: string): string | null {
  const parsed = JSON.parse(payload) as ProviderDeltaChunk
  const content = parsed.choices?.[0]?.delta?.content
  return typeof content === 'string' ? content : null
}

export async function POST(request: NextRequest) {
  const body = await request.json() as EvaluateRequestBody
  const { word, sentence, definition = '', tags = '', wordId } = body

  const apiKey = process.env.OPENAI_API_KEY
  const apiBase = process.env.OPENAI_API_BASE || 'https://api.openai.com/v1'
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini'

  if (!apiKey) {
    return Response.json({ error: 'no-key' }, { status: 400 })
  }
  if (!word || !sentence || !wordId) {
    return Response.json({ error: 'invalid-request' }, { status: 400 })
  }

  let supabase
  let userId

  try {
    const session = await requireActionSession()
    supabase = session.supabase
    userId = session.user.id
  } catch {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { data: pastRecords } = await supabase
    .from('sentences')
    .select('original_text')
    .eq('user_id', userId)
    .eq('word_id', wordId)
    .order('created_at', { ascending: false })
    .limit(5)

  const learningHistory = (pastRecords ?? [])
    .map((record) => (record as PastSentenceRow).original_text)
    .filter((value): value is string => typeof value === 'string')
    .reverse()

  const systemPrompt = buildEvaluationSystemPrompt({
    word,
    definition,
    tags,
    learningHistory,
  })

  try {
    const response = await fetch(`${apiBase}/chat/completions`, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        stream: true,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: buildEvaluationUserPrompt(sentence) },
        ],
        temperature: 0.3,
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      return Response.json(
        { error: `API error (${response.status}): ${errText.slice(0, 200)}` },
        { status: response.status }
      )
    }

    const providerBody = response.body
    if (!providerBody) {
      return Response.json({ error: 'Empty provider stream' }, { status: 502 })
    }

    const encoder = new TextEncoder()
    const readable = new ReadableStream({
      async start(controller) {
        const reader = providerBody.getReader()
        const decoder = new TextDecoder()
        let streamBuffer = ''
        let eventDataLines: string[] = []
        let sentDone = false

        const pushEventData = () => {
          if (eventDataLines.length === 0) {
            return
          }

          const data = eventDataLines.join('\n').trim()
          eventDataLines = []

          if (!data) {
            return
          }

          if (data === '[DONE]') {
            sentDone = true
            controller.enqueue(encoder.encode('data: [DONE]\n\n'))
            return
          }

          try {
            const content = readProviderContent(data)
            if (content) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`))
            }
          } catch {
            // Ignore malformed provider events and keep the stream alive.
          }
        }

        const consumeLine = (line: string) => {
          if (line === '') {
            pushEventData()
            return
          }

          if (line.startsWith('data:')) {
            eventDataLines.push(line.slice(5).trimStart())
          }
        }

        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) {
              break
            }

            streamBuffer += decoder.decode(value, { stream: true })

            let newlineIndex = streamBuffer.indexOf('\n')
            while (newlineIndex !== -1) {
              const line = streamBuffer.slice(0, newlineIndex).replace(/\r$/, '')
              streamBuffer = streamBuffer.slice(newlineIndex + 1)
              consumeLine(line)
              newlineIndex = streamBuffer.indexOf('\n')
            }
          }

          streamBuffer += decoder.decode()
          if (streamBuffer) {
            consumeLine(streamBuffer.replace(/\r$/, ''))
          }
          pushEventData()

          if (!sentDone) {
            controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          }
        } catch {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ error: 'Stream interrupted' })}\n\n`)
          )
        } finally {
          controller.close()
        }
      },
    })

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return Response.json({ error: message }, { status: 500 })
  }
}
