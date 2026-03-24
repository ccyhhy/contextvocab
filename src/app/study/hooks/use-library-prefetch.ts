"use client"

import { useEffect, useRef } from "react"
import { getStudyBatch, type StudyBatchItem, type StudyLibrary, type StudyView } from "../actions"

type PrefetchedCache = Map<string, StudyBatchItem[]>

function makeCacheKey(librarySlug: string, studyView: StudyView) {
  return `${librarySlug}::${studyView}`
}

function getPrefetchViewsForLibrary(library: StudyLibrary): StudyView[] {
  if (library.contentType === "grammar") {
    return ["all", "weak", "recent_failures"]
  }

  return ["all", "weak", "recent_failures", "favorites"]
}

export function useLibraryPrefetch({
  availableLibraries,
  activeLibrarySlug,
  activeStudyView,
}: {
  availableLibraries: StudyLibrary[]
  activeLibrarySlug: string
  activeStudyView: StudyView
}) {
  const cacheRef = useRef<PrefetchedCache>(new Map())
  const prefetchedRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    const timer = setTimeout(() => {
      for (const library of availableLibraries) {
        for (const view of getPrefetchViewsForLibrary(library)) {
          if (library.slug === activeLibrarySlug && view === activeStudyView) {
            continue
          }

          const key = makeCacheKey(library.slug, view)
          if (prefetchedRef.current.has(key)) {
            continue
          }

          prefetchedRef.current.add(key)

          void getStudyBatch({
            librarySlug: library.slug,
            studyView: view,
            batchSize: 5,
          })
            .then((batch) => {
              if (batch.length > 0) {
                cacheRef.current.set(key, batch)
              } else {
                cacheRef.current.delete(key)
              }
            })
            .catch(() => {
              prefetchedRef.current.delete(key)
            })
        }
      }
    }, 1200)

    return () => clearTimeout(timer)
  }, [availableLibraries, activeLibrarySlug, activeStudyView])

  const popCachedBatch = (
    librarySlug: string,
    studyView: StudyView
  ): StudyBatchItem[] | null => {
    const key = makeCacheKey(librarySlug, studyView)
    const cached = cacheRef.current.get(key)
    if (cached && cached.length > 0) {
      cacheRef.current.delete(key)
      prefetchedRef.current.delete(key)
      return cached
    }
    return null
  }

  return { popCachedBatch }
}
