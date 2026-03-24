"use client"

import { useCallback, useEffect, useRef } from "react"
import { type StudyBatchItem, type StudyView } from "../actions"

type PrefetchedCache = Map<string, StudyBatchItem[]>

const MAX_CACHED_BATCHES = 8
const CACHE_STORAGE_KEY = "study-prefetch-cache-v1"

function makeCacheKey(librarySlug: string, studyView: StudyView) {
  return `${librarySlug}::${studyView}`
}

export function useLibraryPrefetch() {
  const cacheRef = useRef<PrefetchedCache>(new Map())

  const persistCache = useCallback((cache: PrefetchedCache) => {
    if (typeof window === "undefined") {
      return
    }

    try {
      const entries = Array.from(cache.entries())
      window.sessionStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(entries))
    } catch {
      // Ignore sessionStorage write errors - cache still works in memory.
    }
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    try {
      const raw = window.sessionStorage.getItem(CACHE_STORAGE_KEY)
      if (!raw) {
        return
      }

      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) {
        return
      }

      const hydratedEntries = parsed.filter(
        (entry): entry is [string, StudyBatchItem[]] =>
          Array.isArray(entry) &&
          typeof entry[0] === "string" &&
          Array.isArray(entry[1]) &&
          entry[1].length > 0
      )

      cacheRef.current = new Map(hydratedEntries.slice(-MAX_CACHED_BATCHES))
    } catch {
      // Ignore malformed persisted cache payloads.
    }
  }, [])

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
    persistCache(nextCache)
  }, [persistCache])

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
    persistCache(nextCache)
    return cached
  }, [persistCache])

  const hasCachedBatch = useCallback((librarySlug: string, studyView: StudyView) => {
    const key = makeCacheKey(librarySlug, studyView)
    const cached = cacheRef.current.get(key)
    return Array.isArray(cached) && cached.length > 0
  }, [])

  return { popCachedBatch, storeCachedBatch, hasCachedBatch }
}
