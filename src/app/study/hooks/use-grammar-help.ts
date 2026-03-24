"use client"

import { type MutableRefObject, useEffect, useRef, useState } from "react"
import {
  generateGrammarSentenceHelp,
  type SentenceHelpItem,
  type SentenceHelpResult,
  type StudyBatchGrammarItem,
} from "../actions"

export type GrammarHelpState = "idle" | "loading" | "ready"

const GRAMMAR_HELP_CACHE_VERSION = "provider-v1"

function getGrammarHelpCacheKey(grammarItemId: string) {
  return `${GRAMMAR_HELP_CACHE_VERSION}:${grammarItemId}`
}

function loadGrammarHelpForItem({
  grammarItem,
  cache,
  inflightRequests,
}: {
  grammarItem: StudyBatchGrammarItem
  cache: MutableRefObject<Record<string, SentenceHelpResult>>
  inflightRequests: MutableRefObject<Record<string, Promise<SentenceHelpResult>>>
}) {
  const cacheKey = getGrammarHelpCacheKey(grammarItem.grammar_item_id)
  const cached = cache.current[cacheKey]
  if (cached) {
    return Promise.resolve(cached)
  }

  const inflightRequest = inflightRequests.current[cacheKey]
  if (inflightRequest) {
    return inflightRequest
  }

  const request = generateGrammarSentenceHelp(
    grammarItem.grammar_item_id,
    grammarItem.grammar.title,
    grammarItem.grammar.pattern,
    grammarItem.grammar.coreExplanation,
    grammarItem.grammar.usageNote ?? null,
    grammarItem.grammar.sceneTags,
    grammarItem.grammar.templates,
    grammarItem.grammar.examples
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

export function useGrammarHelp({
  currentGrammar,
  enabled,
}: {
  currentGrammar: StudyBatchGrammarItem | null
  enabled: boolean
}) {
  const [grammarHelpItems, setGrammarHelpItems] = useState<SentenceHelpItem[]>([])
  const [grammarHelpState, setGrammarHelpState] = useState<GrammarHelpState>("idle")
  const [grammarHelpSourceLabel, setGrammarHelpSourceLabel] = useState("")
  const grammarHelpCacheRef = useRef<Record<string, SentenceHelpResult>>({})
  const grammarHelpRequestRef = useRef<Record<string, Promise<SentenceHelpResult>>>({})

  useEffect(() => {
    if (!currentGrammar) {
      return
    }

    void loadGrammarHelpForItem({
      grammarItem: currentGrammar,
      cache: grammarHelpCacheRef,
      inflightRequests: grammarHelpRequestRef,
    }).catch((error) => {
      console.error("Failed to prefetch grammar help:", error)
    })
  }, [currentGrammar])

  useEffect(() => {
    if (!currentGrammar || !enabled) {
      return
    }

    const cacheKey = getGrammarHelpCacheKey(currentGrammar.grammar_item_id)
    const cached = grammarHelpCacheRef.current[cacheKey]
    if (cached) {
      setGrammarHelpItems(cached.items)
      setGrammarHelpSourceLabel(cached.sourceLabel)
      setGrammarHelpState("ready")
      return
    }

    let cancelled = false
    setGrammarHelpItems([])
    setGrammarHelpSourceLabel("正在生成提示...")
    setGrammarHelpState("loading")

    void loadGrammarHelpForItem({
      grammarItem: currentGrammar,
      cache: grammarHelpCacheRef,
      inflightRequests: grammarHelpRequestRef,
    })
      .then((result) => {
        if (cancelled) return
        setGrammarHelpItems(result.items)
        setGrammarHelpSourceLabel(result.sourceLabel)
        setGrammarHelpState("ready")
      })
      .catch((error) => {
        console.error(error)
        if (cancelled) return
        setGrammarHelpItems([])
        setGrammarHelpSourceLabel("提示暂不可用")
        setGrammarHelpState("ready")
      })

    return () => {
      cancelled = true
    }
  }, [currentGrammar, enabled])

  return {
    grammarHelpItems,
    grammarHelpState,
    grammarHelpSourceLabel,
  }
}
