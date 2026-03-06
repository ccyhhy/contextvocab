import { getFavoriteWordIds, getNextWord } from "./actions"
import { requirePageUser } from "@/lib/supabase/user"
import StudyClient from "./study-client"

export default async function StudyPage() {
  await requirePageUser()
  const [initialWord, initialFavoriteWordIds] = await Promise.all([
    getNextWord(),
    getFavoriteWordIds(),
  ])

  return (
    <div className="w-full h-full flex items-center justify-center">
      <StudyClient
        initialWord={initialWord}
        initialFavoriteWordIds={initialFavoriteWordIds}
      />
    </div>
  )
}
