"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  getStudyBatch,
  type StudyBatchItem,
  type StudyBatchWordItem,
  type StudyView,
} from "../actions"
import { getStudyBatchItemKey, isStudyBatchWordItem } from "../study-batch-item"

function buildExcludedItemIds(
  deferredItems: StudyBatchItem[],
  activeItem: StudyBatchItem | null,
  pendingQueue: StudyBatchItem[]
) {
  return Array.from(
    new Set([
      ...deferredItems.map((item) => getStudyBatchItemKey(item)),
      ...(activeItem ? [getStudyBatchItemKey(activeItem)] : []),
      ...pendingQueue.map((item) => getStudyBatchItemKey(item)),
    ])
  )
}

function appendDeferredItem(deferredItems: StudyBatchItem[], currentItem: StudyBatchItem) {
  const currentItemKey = getStudyBatchItemKey(currentItem)
  const nextDeferredItems = deferredItems.filter(
    (item) => getStudyBatchItemKey(item) !== currentItemKey
  )
  nextDeferredItems.push(currentItem)
  return nextDeferredItems
}

export function useStudySession({
  initialBatch,
  librarySlug,
  studyView,
  batchSize = 5,
  onBatchError,
}: {
  initialBatch: StudyBatchItem[]
  librarySlug: string
  studyView: StudyView
  batchSize?: number
  onBatchError?: (error: unknown) => void
}) {
  const [currentItem, setCurrentItem] = useState<StudyBatchItem | null>(initialBatch[0] ?? null)
  const [queuedItems, setQueuedItems] = useState<StudyBatchItem[]>(initialBatch.slice(1))
  const [deferredItems, setDeferredItems] = useState<StudyBatchItem[]>([])
  const [loadingNext, setLoadingNext] = useState(false)
  const [refillingQueue, setRefillingQueue] = useState(false)

  const queueContextRef = useRef(0)
  const requeuedNewWordIdsRef = useRef<Set<string>>(new Set())

  const fetchBatch = useCallback(
    async (
      nextLibrarySlug: string,
      nextStudyView: StudyView,
      nextDeferredItems: StudyBatchItem[],
      activeItem: StudyBatchItem | null,
      pendingQueue: StudyBatchItem[],
      nextBatchSize = batchSize
    ) => {
      return getStudyBatch({
        librarySlug: nextLibrarySlug,
        studyView: nextStudyView,
        skippedWordIds: buildExcludedItemIds(nextDeferredItems, activeItem, pendingQueue),
        batchSize: nextBatchSize,
      })
    },
    [batchSize]
  )

  const applyBatch = (batch: StudyBatchItem[]) => {
    setCurrentItem(batch[0] ?? null)
    setQueuedItems(batch.slice(1))
  }

  const reloadStudyBatch = async (
    nextLibrarySlug = librarySlug,
    nextStudyView = studyView,
    nextDeferredItems = deferredItems,
    options?: { restoreDeferredOnEmpty?: boolean }
  ) => {
    queueContextRef.current += 1
    const context = queueContextRef.current
    setLoadingNext(true)

    try {
      const batch = await fetchBatch(nextLibrarySlug, nextStudyView, nextDeferredItems, null, [])
      if (queueContextRef.current === context) {
        const shouldRestoreDeferred = options?.restoreDeferredOnEmpty ?? true

        if (batch.length > 0) {
          applyBatch(batch)
          return
        }

        if (shouldRestoreDeferred && nextDeferredItems.length > 0) {
          applyBatch(nextDeferredItems)
          setDeferredItems([])
          return
        }

        applyBatch([])
      }
    } catch (error) {
      console.error(error)
      onBatchError?.(error)
    } finally {
      if (queueContextRef.current === context) {
        setLoadingNext(false)
      }
    }
  }

  useEffect(() => {
    if (!currentItem || queuedItems.length > 2) {
      return
    }

    const activeItem = currentItem
    let cancelled = false
    const context = queueContextRef.current

    async function run() {
      setRefillingQueue(true)
      try {
        const refillBatch = await fetchBatch(
          librarySlug,
          studyView,
          deferredItems,
          currentItem,
          queuedItems,
          batchSize
        )

        if (cancelled || queueContextRef.current !== context || refillBatch.length === 0) {
          return
        }

        setQueuedItems((existingQueue) => {
          const existingIds = new Set(existingQueue.map((item) => getStudyBatchItemKey(item)))
          const mergedQueue = [...existingQueue]

          for (const item of refillBatch) {
            const itemKey = getStudyBatchItemKey(item)
            if (!existingIds.has(itemKey) && itemKey !== getStudyBatchItemKey(activeItem)) {
              existingIds.add(itemKey)
              mergedQueue.push(item)
            }
          }

          return mergedQueue
        })
      } catch (error) {
        console.error(error)
      } finally {
        if (!cancelled && queueContextRef.current === context) {
          setRefillingQueue(false)
        }
      }
    }

    void run()

    return () => {
      cancelled = true
    }
  }, [batchSize, currentItem, deferredItems, fetchBatch, queuedItems, librarySlug, studyView])

  const advanceToNextItem = async ({
    nextLibrarySlug = librarySlug,
    nextStudyView = studyView,
    isSkipping = false,
  }: {
    nextLibrarySlug?: string
    nextStudyView?: StudyView
    isSkipping?: boolean
  } = {}) => {
    if (isSkipping && currentItem && queuedItems.length > 0) {
      const [nextItem, ...restQueue] = queuedItems
      setCurrentItem(nextItem)
      setQueuedItems([...restQueue, currentItem])
      return
    }

    if (isSkipping && currentItem) {
      const nextDeferredItems = appendDeferredItem(deferredItems, currentItem)
      setDeferredItems(nextDeferredItems)
      await reloadStudyBatch(nextLibrarySlug, nextStudyView, nextDeferredItems, {
        restoreDeferredOnEmpty: false,
      })
      return
    }

    if (queuedItems.length > 0) {
      const [nextItem, ...restQueue] = queuedItems
      setCurrentItem(nextItem)
      setQueuedItems(restQueue)
      return
    }

    await reloadStudyBatch(nextLibrarySlug, nextStudyView)
  }

  const resetSessionScope = () => {
    setDeferredItems([])
    requeuedNewWordIdsRef.current.clear()
  }

  const requeueReviewedNewWord = ({
    reviewedWord,
    userWordId,
    score,
  }: {
    reviewedWord: StudyBatchWordItem
    userWordId?: string | null
    score: number
  }) => {
    if (
      !reviewedWord.isNew ||
      !isStudyBatchWordItem(reviewedWord) ||
      requeuedNewWordIdsRef.current.has(reviewedWord.word_id)
    ) {
      return
    }

    const insertOffset = score < 75 ? 1 : 3
    requeuedNewWordIdsRef.current.add(reviewedWord.word_id)
    setQueuedItems((existingQueue) => {
      if (
        existingQueue.some(
          (item) => isStudyBatchWordItem(item) && item.word_id === reviewedWord.word_id
        )
      ) {
        return existingQueue
      }

      const requeuedWord: StudyBatchWordItem = {
        ...reviewedWord,
        id: userWordId ?? reviewedWord.id,
        userWordId: userWordId ?? null,
        isNew: false,
        priorityReason: "due",
      }

      const insertIndex = Math.min(insertOffset, existingQueue.length)
      return [
        ...existingQueue.slice(0, insertIndex),
        requeuedWord,
        ...existingQueue.slice(insertIndex),
      ]
    })
  }

  return {
    currentItem,
    queuedItems,
    loadingNext,
    refillingQueue,
    reloadStudyBatch,
    advanceToNextItem,
    resetSessionScope,
    requeueReviewedNewWord,
  }
}
