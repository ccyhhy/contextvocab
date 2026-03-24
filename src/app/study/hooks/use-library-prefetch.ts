"use client"

import { useEffect, useRef } from "react"
import { getStudyBatch, type StudyBatchItem, type StudyLibrary, type StudyView } from "../actions"

type PrefetchedCache = Map<string, StudyBatchItem[]>

function makeCacheKey(librarySlug: string, studyView: StudyView) {
  return `${librarySlug}::${studyView}`
}

/**
 * Pre-fetches "all" view batches for every available library in the background
 * immediately after the study page is idle. When user switches library, we can
 * serve from cache instantly instead of waiting for a server round-trip.
 */
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

  // Kick off pre-fetching in the background once (after a short idle delay)
  useEffect(() => {
    const timer = setTimeout(() => {
      const libsToFetch = availableLibraries.filter(
        (lib) => lib.slug !== activeLibrarySlug
      )

      for (const lib of libsToFetch) {
        const view: StudyView = "all"
        const key = makeCacheKey(lib.slug, view)

        if (prefetchedRef.current.has(key)) continue
        prefetchedRef.current.add(key)

        // Fire-and-forget - errors are non-critical
        getStudyBatch({ librarySlug: lib.slug, studyView: view, batchSize: 5 })
          .then((batch) => {
            if (batch.length > 0) {
              cacheRef.current.set(key, batch)
            }
          })
          .catch(() => {
            // If prefetch fails, just remove from "attempted" so it can retry
            prefetchedRef.current.delete(key)
          })
      }
    }, 2000) // Wait 2s for the active study session to settle first

    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableLibraries.length]) // Only run once when library list changes

  /**
   * Try to pop a batch from cache for the given library+view combination.
   * Returns null if not cached (caller should fall back to server fetch).
   * Also immediately invalidates the cache entry so the next switch re-fetches.
   */
  const popCachedBatch = (
    librarySlug: string,
    studyView: StudyView
  ): StudyBatchItem[] | null => {
    const key = makeCacheKey(librarySlug, studyView)
    const cached = cacheRef.current.get(key)
    if (cached && cached.length > 0) {
      cacheRef.current.delete(key)         // consume so next switch re-fills
      prefetchedRef.current.delete(key)    // allow it to be re-prefetched later
      return cached
    }
    return null
  }

  /**
   * Manually refresh the prefetch cache for a specific library (e.g. after
   * the user finishes studying there and we want fresh data for next time).
   */
  const invalidateLibrary = (librarySlug: string) => {
    for (const view of ["all", "weak", "recent_failures", "favorites"] as StudyView[]) {
      const key = makeCacheKey(librarySlug, view)
      cacheRef.current.delete(key)
      prefetchedRef.current.delete(key)
    }
  }

  return { popCachedBatch, invalidateLibrary }
}
