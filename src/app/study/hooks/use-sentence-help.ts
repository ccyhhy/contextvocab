"use client"

import { useEffect, useRef, useState } from "react"
import {
  generateSentenceHelp,
  type SentenceHelpItem,
  type SentenceHelpResult,
  type StudyBatchItem,
} from "../actions"

export type SentenceHelpState = "idle" | "loading" | "ready"

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

  useEffect(() => {
    if (!enabled || !currentWord) {
      return
    }

    const cached = sentenceHelpCacheRef.current[currentWord.word_id]
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

    void generateSentenceHelp(
      currentWord.word_id,
      currentWord.words.word,
      currentWord.words.definition || "",
      currentWord.words.tags || "",
      currentWord.words.example || null
    )
      .then((result) => {
        if (cancelled) return
        sentenceHelpCacheRef.current[currentWord.word_id] = result
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
