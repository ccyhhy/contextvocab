import { getFavoriteWordIds, getStudyBatch } from "./actions"
import { requirePageUser } from "@/lib/supabase/user"
import StudyClient from "./study-client"

export default async function StudyPage() {
  await requirePageUser()
  const [initialBatch, initialFavoriteWordIds] = await Promise.all([
    getStudyBatch(),
    getFavoriteWordIds(),
  ])

  return (
    <div className="w-full h-full flex items-center justify-center">
      <StudyClient
        initialBatch={initialBatch}
        initialFavoriteWordIds={initialFavoriteWordIds}
      />
    </div>
  )
}
