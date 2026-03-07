import { getFavoriteWordIds, getStudyBatch, getStudyLibraries } from "./actions"
import { requirePageUser } from "@/lib/supabase/user"
import StudyClient from "./study-client"

export default async function StudyPage({
  searchParams,
}: {
  searchParams?: Promise<{ library?: string }>
}) {
  await requirePageUser()
  const resolvedSearchParams = searchParams ? await searchParams : undefined
  const initialLibrarySlug = resolvedSearchParams?.library?.trim().toLowerCase() || "all"
  const [initialBatch, initialFavoriteWordIds, libraries] = await Promise.all([
    getStudyBatch({ librarySlug: initialLibrarySlug }),
    getFavoriteWordIds(),
    getStudyLibraries(),
  ])

  return (
    <div className="w-full h-full flex items-center justify-center">
      <StudyClient
        initialBatch={initialBatch}
        initialFavoriteWordIds={initialFavoriteWordIds}
        libraries={libraries}
        initialLibrarySlug={initialLibrarySlug}
      />
    </div>
  )
}
