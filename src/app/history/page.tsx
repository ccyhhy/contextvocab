import { getGrammarAttemptHistory, getSentenceHistory } from './actions'
import { requirePageUser } from '@/lib/supabase/user'
import HistoryClient from './history-client'

export default async function HistoryPage() {
  await requirePageUser()

  const [initialSentenceData, initialGrammarData] = await Promise.all([
    getSentenceHistory(),
    getGrammarAttemptHistory(),
  ])

  return (
    <HistoryClient
      initialSentenceData={initialSentenceData}
      initialGrammarData={initialGrammarData}
    />
  )
}
