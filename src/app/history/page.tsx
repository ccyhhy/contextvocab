import { getSentenceHistory } from "./actions"
import { requirePageUser } from "@/lib/supabase/user"
import HistoryClient from "./history-client"

export default async function HistoryPage() {
  await requirePageUser()
  const initialData = await getSentenceHistory()

  return <HistoryClient initialData={initialData} />
}
