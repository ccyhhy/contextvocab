import { notFound } from 'next/navigation'
import { requirePageUser } from '@/lib/supabase/user'
import { getLibraryDetail, getLibraryGrammarPage, getLibraryWordsPage } from './actions'
import LibraryDetailClient from './library-detail-client'

export default async function LibraryDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await requirePageUser()
  const { slug } = await params
  const library = await getLibraryDetail(slug)

  if (!library) {
    notFound()
  }

  const initialWordPage =
    library.contentType === 'grammar' ? null : await getLibraryWordsPage({ librarySlug: slug })
  const initialGrammarPage =
    library.contentType === 'grammar' ? await getLibraryGrammarPage({ librarySlug: slug }) : null

  return (
    <LibraryDetailClient
      key={`${library.id}:${library.wordCount}:${library.activeCount}:${library.dueCount}:${library.remainingCount}`}
      initialLibrary={library}
      initialWordPage={initialWordPage}
      initialGrammarPage={initialGrammarPage}
    />
  )
}
