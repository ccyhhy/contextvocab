import { getSentenceHistory } from "./actions"
import HistoryClient from "./history-client"

export default async function HistoryPage() {
  const initialData = await getSentenceHistory()

  return <HistoryClient initialData={initialData} />
}
