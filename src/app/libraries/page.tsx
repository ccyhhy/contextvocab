import { requirePageUser } from "@/lib/supabase/user"
import { getStudyLibraries } from "@/app/study/actions"
import LibrariesClient from "./libraries-client"

export default async function LibrariesPage() {
  await requirePageUser()
  const libraries = await getStudyLibraries()

  return <LibrariesClient initialLibraries={libraries} />
}
