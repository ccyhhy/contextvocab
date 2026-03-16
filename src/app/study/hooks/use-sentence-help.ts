"use client"

import { type MutableRefObject, useEffect, useRef, useState } from "react"
import {
  generateSentenceHelp,
  type SentenceHelpItem,
  type SentenceHelpResult,
  type StudyBatchItem,
} from "../actions"

export type SentenceHelpState = "idle" | "loading" | "ready"

const SENTENCE_HELP_CACHE_VERSION = "provider-v2"

function getSentenceHelpCacheKey(wordId: string) {
  return `${SENTENCE_HELP_CACHE_VERSION}:${wordId}`
}

function loadSentenceHelpForWord({
  word,
  cache,
  inflightRequests,
}: {
  word: StudyBatchItem
  cache: MutableRefObject<Record<string, SentenceHelpResult>>
  inflightRequests: MutableRefObject<Record<string, Promise<SentenceHelpResult>>>
}) {
  const cacheKey = getSentenceHelpCacheKey(word.word_id)
  const cached = cache.current[cacheKey]
  if (cached) {
    return Promise.resolve(cached)
  }

  const inflightRequest = inflightRequests.current[cacheKey]
  if (inflightRequest) {
    return inflightRequest
  }

  const request = generateSentenceHelp(
    word.word_id,
    word.words.word,
    word.words.definition || "",
    word.words.tags || "",
    word.words.example || null
  )
    .then((result) => {
      cache.current[cacheKey] = result
      return result
    })
    .finally(() => {
      delete inflightRequests.current[cacheKey]
    })

  inflightRequests.current[cacheKey] = request
  return request
}

export function useSentenceHelp({
  currentWord,
  enabled,
}: {
  currentWord: StudyBatchItem | null
  enabled: boolean
}) {
  const [sentenceHelpItems, setSentenceHelpItems] = useState<SentenceHelpItem[]>([])
  const [sentenceHelpState, setSentenceHelpState] = useState<SentenceHelpState>("idle")
  const [sentenceHelpSourceLabel, setSentenceHelpSourceLabel] = useState("")
  const sentenceHelpCacheRef = useRef<Record<string, SentenceHelpResult>>({})
  const sentenceHelpRequestRef = useRef<Record<string, Promise<SentenceHelpResult>>>({})

  useEffect(() => {
    if (!currentWord) {
      return
    }

    void loadSentenceHelpForWord({
      word: currentWord,
      cache: sentenceHelpCacheRef,
      inflightRequests: sentenceHelpRequestRef,
    }).catch((error) => {
      console.error("Failed to prefetch sentence help:", error)
    })
  }, [currentWord])

  useEffect(() => {
    if (!currentWord) {
      return
    }

    if (!enabled) {
      return
    }

    const cacheKey = getSentenceHelpCacheKey(currentWord.word_id)
    const cached = sentenceHelpCacheRef.current[cacheKey]
    if (cached) {
      setSentenceHelpItems(cached.items)
      setSentenceHelpSourceLabel(cached.sourceLabel)
      setSentenceHelpState("ready")
      return
    }

    let cancelled = false
    setSentenceHelpItems([])
    setSentenceHelpSourceLabel("来源：正在请求提示...")
    setSentenceHelpState("loading")

    void loadSentenceHelpForWord({
      word: currentWord,
      cache: sentenceHelpCacheRef,
      inflightRequests: sentenceHelpRequestRef,
    })
      .then((result) => {
        if (cancelled) return
        setSentenceHelpItems(result.items)
        setSentenceHelpSourceLabel(result.sourceLabel)
        setSentenceHelpState("ready")
      })
      .catch((error) => {
        console.error(error)
        if (cancelled) return
        setSentenceHelpItems([])
        setSentenceHelpSourceLabel("来源：提示请求异常")
        setSentenceHelpState("ready")
      })

    return () => {
      cancelled = true
    }
  }, [currentWord, enabled])

  return {
    sentenceHelpItems,
    sentenceHelpState,
    sentenceHelpSourceLabel,
  }
}
