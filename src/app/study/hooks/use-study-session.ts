"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { getStudyBatch, type StudyBatchItem, type StudyView } from "../actions"

function buildExcludedWordIds(
  deferredWords: StudyBatchItem[],
  activeWord: StudyBatchItem | null,
  pendingQueue: StudyBatchItem[]
) {
  return Array.from(
    new Set([
      ...deferredWords.map((item) => item.word_id),
      ...(activeWord ? [activeWord.word_id] : []),
      ...pendingQueue.map((item) => item.word_id),
    ])
  )
}

function appendDeferredWord(deferredWords: StudyBatchItem[], currentWord: StudyBatchItem) {
  const nextDeferredWords = deferredWords.filter((item) => item.word_id !== currentWord.word_id)
  nextDeferredWords.push(currentWord)
  return nextDeferredWords
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
  const [currentWord, setCurrentWord] = useState<StudyBatchItem | null>(initialBatch[0] ?? null)
  const [queuedWords, setQueuedWords] = useState<StudyBatchItem[]>(initialBatch.slice(1))
  const [deferredWords, setDeferredWords] = useState<StudyBatchItem[]>([])
  const [loadingNext, setLoadingNext] = useState(false)
  const [refillingQueue, setRefillingQueue] = useState(false)

  const queueContextRef = useRef(0)
  const requeuedNewWordIdsRef = useRef<Set<string>>(new Set())

  const fetchBatch = useCallback(
    async (
      nextLibrarySlug: string,
      nextStudyView: StudyView,
      nextDeferredWords: StudyBatchItem[],
      activeWord: StudyBatchItem | null,
      pendingQueue: StudyBatchItem[],
      nextBatchSize = batchSize
    ) => {
      return getStudyBatch({
        librarySlug: nextLibrarySlug,
        studyView: nextStudyView,
        skippedWordIds: buildExcludedWordIds(nextDeferredWords, activeWord, pendingQueue),
        batchSize: nextBatchSize,
      })
    },
    [batchSize]
  )

  const applyBatch = (batch: StudyBatchItem[]) => {
    setCurrentWord(batch[0] ?? null)
    setQueuedWords(batch.slice(1))
  }

  const reloadStudyBatch = async (
    nextLibrarySlug = librarySlug,
    nextStudyView = studyView,
    nextDeferredWords = deferredWords,
    options?: { restoreDeferredOnEmpty?: boolean }
  ) => {
    queueContextRef.current += 1
    const context = queueContextRef.current
    setLoadingNext(true)

    try {
      const batch = await fetchBatch(nextLibrarySlug, nextStudyView, nextDeferredWords, null, [])
      if (queueContextRef.current === context) {
        const shouldRestoreDeferred = options?.restoreDeferredOnEmpty ?? true

        if (batch.length > 0) {
          applyBatch(batch)
          return
        }

        if (shouldRestoreDeferred && nextDeferredWords.length > 0) {
          applyBatch(nextDeferredWords)
          setDeferredWords([])
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
    if (!currentWord || queuedWords.length > 2) {
      return
    }

    const activeWord = currentWord
    let cancelled = false
    const context = queueContextRef.current

    async function run() {
      setRefillingQueue(true)
      try {
        const refillBatch = await fetchBatch(
          librarySlug,
          studyView,
          deferredWords,
          currentWord,
          queuedWords,
          batchSize
        )

        if (cancelled || queueContextRef.current !== context || refillBatch.length === 0) {
          return
        }

        setQueuedWords((existingQueue) => {
          const existingIds = new Set(existingQueue.map((item) => item.word_id))
          const mergedQueue = [...existingQueue]

          for (const item of refillBatch) {
            if (!existingIds.has(item.word_id) && item.word_id !== activeWord.word_id) {
              existingIds.add(item.word_id)
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
  }, [batchSize, currentWord, deferredWords, fetchBatch, queuedWords, librarySlug, studyView])

  const advanceToNextWord = async ({
    nextLibrarySlug = librarySlug,
    nextStudyView = studyView,
    isSkipping = false,
  }: {
    nextLibrarySlug?: string
    nextStudyView?: StudyView
    isSkipping?: boolean
  } = {}) => {
    if (isSkipping && currentWord && queuedWords.length > 0) {
      const [nextWord, ...restQueue] = queuedWords
      setCurrentWord(nextWord)
      setQueuedWords([...restQueue, currentWord])
      return
    }

    if (isSkipping && currentWord) {
      const nextDeferredWords = appendDeferredWord(deferredWords, currentWord)
      setDeferredWords(nextDeferredWords)
      await reloadStudyBatch(nextLibrarySlug, nextStudyView, nextDeferredWords, {
        restoreDeferredOnEmpty: false,
      })
      return
    }

    if (queuedWords.length > 0) {
      const [nextWord, ...restQueue] = queuedWords
      setCurrentWord(nextWord)
      setQueuedWords(restQueue)
      return
    }

    await reloadStudyBatch(nextLibrarySlug, nextStudyView)
  }

  const resetSessionScope = () => {
    setDeferredWords([])
    requeuedNewWordIdsRef.current.clear()
  }

  const requeueReviewedNewWord = ({
    reviewedWord,
    userWordId,
    score,
  }: {
    reviewedWord: StudyBatchItem
    userWordId?: string | null
    score: number
  }) => {
    if (!reviewedWord.isNew || requeuedNewWordIdsRef.current.has(reviewedWord.word_id)) {
      return
    }

    const insertOffset = score < 75 ? 1 : 3
    requeuedNewWordIdsRef.current.add(reviewedWord.word_id)
    setQueuedWords((existingQueue) => {
      if (existingQueue.some((item) => item.word_id === reviewedWord.word_id)) {
        return existingQueue
      }

      const requeuedWord: StudyBatchItem = {
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
    currentWord,
    queuedWords,
    loadingNext,
    refillingQueue,
    reloadStudyBatch,
    advanceToNextWord,
    resetSessionScope,
    requeueReviewedNewWord,
  }
}
