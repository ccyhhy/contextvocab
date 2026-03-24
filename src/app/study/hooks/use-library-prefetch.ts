"use client"

import { useCallback, useRef } from "react"
import { type StudyBatchItem, type StudyView } from "../actions"

type PrefetchedCache = Map<string, StudyBatchItem[]>

const MAX_CACHED_BATCHES = 8

function makeCacheKey(librarySlug: string, studyView: StudyView) {
  return `${librarySlug}::${studyView}`
}

export function useLibraryPrefetch() {
  const cacheRef = useRef<PrefetchedCache>(new Map())

  const storeCachedBatch = useCallback((
    librarySlug: string,
    studyView: StudyView,
    batch: StudyBatchItem[]
  ) => {
    if (batch.length === 0) {
      return
    }

    const key = makeCacheKey(librarySlug, studyView)
    const nextCache = new Map(cacheRef.current)
    nextCache.delete(key)
    nextCache.set(key, batch)

    while (nextCache.size > MAX_CACHED_BATCHES) {
      const oldestKey = nextCache.keys().next().value
      if (!oldestKey) {
        break
      }
      nextCache.delete(oldestKey)
    }

    cacheRef.current = nextCache
  }, [])

  const popCachedBatch = useCallback((
    librarySlug: string,
    studyView: StudyView
  ): StudyBatchItem[] | null => {
    const key = makeCacheKey(librarySlug, studyView)
    const cached = cacheRef.current.get(key)
    if (!cached || cached.length === 0) {
      return null
    }

    const nextCache = new Map(cacheRef.current)
    nextCache.delete(key)
    cacheRef.current = nextCache
    return cached
  }, [])

  return { popCachedBatch, storeCachedBatch }
}
