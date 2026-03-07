import { getFavoriteWordIds, getStudyLibraries } from '@/app/study/actions'
import { requirePageUser } from '@/lib/supabase/user'
import LibrariesClient from './libraries-client'

export default async function LibrariesPage() {
  await requirePageUser()

  const [libraries, favoriteWordIds] = await Promise.all([
    getStudyLibraries(),
    getFavoriteWordIds(),
  ])

  return (
    <LibrariesClient
      initialLibraries={libraries}
      favoriteCount={favoriteWordIds.length}
    />
  )
}
