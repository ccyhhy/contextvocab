import { getSentenceHistory } from './actions'
import { requirePageUser } from '@/lib/supabase/user'
import HistoryClient from './history-client'

const HISTORY_PAGE_LOG_THRESHOLD_MS = 150

function logHistoryPagePerformance(
  startedAt: number,
  metadata?: Record<string, string | number | boolean | null | undefined>
) {
  const durationMs = Date.now() - startedAt
  if (durationMs < HISTORY_PAGE_LOG_THRESHOLD_MS) {
    return
  }

  const details =
    metadata && Object.keys(metadata).length > 0
      ? ` ${Object.entries(metadata)
          .map(([key, value]) => `${key}=${String(value)}`)
          .join(' ')}`
      : ''

  console.info(`[history:page] ${durationMs}ms${details}`)
}

export default async function HistoryPage() {
  await requirePageUser()
  return renderHistoryPage()
}

async function renderHistoryPage() {
  const startedAt = Date.now()
  const initialSentenceData = await getSentenceHistory()

  logHistoryPagePerformance(startedAt, {
    sentenceTotal: initialSentenceData.total,
    pageSize: initialSentenceData.pageSize,
  })

  return (
    <HistoryClient
      initialSentenceData={initialSentenceData}
      initialGrammarData={null}
    />
  )
}
