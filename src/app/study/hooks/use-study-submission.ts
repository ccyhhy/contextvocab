"use client"

import { startTransition, useEffect, useRef, useState } from "react"
import {
  EMPTY_VISIBLE_FEEDBACK,
  extractVisibleFeedback,
  parseVisibleFeedbackSections,
  type VisibleFeedbackSections,
} from "@/lib/evaluation-format"
import {
  isStudyBatchGrammarItem,
  isStudyBatchWordItem,
  rewriteGrammarSentence,
  rewriteSentence,
  submitGrammarSentence,
  submitSentence,
  type StudyBatchItem,
  type StudyBatchWordItem,
  type StudySubmissionResult,
} from "../actions"

export type StreamPhase = "idle" | "connecting" | "feedback" | "structuring"
export type SubmissionStatus = "idle" | "submitting" | "result"
export type SubmissionMode = "scheduled" | "practice"

interface StreamEvent {
  content?: string
  error?: string
}

type StreamWordPayload = {
  targetKind?: "word"
  word: string
  sentence: string
  definition: string
  tags: string
  wordId: string
}

type StreamGrammarPayload = {
  targetKind: "grammar"
  sentence: string
  grammarItemId: string
  title: string
  pattern: string
  coreExplanation: string
  usageNote?: string | null
  sceneTags?: string[]
  templates?: string[]
  examples?: string[]
}

type StreamPayload = StreamWordPayload | StreamGrammarPayload

async function streamEvaluateSentence(payload: StreamPayload, onChunk?: (fullText: string) => void) {
  const response = await fetch("/api/evaluate", {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })

  if (!response.ok || !response.body) {
    throw new Error("Stream request failed")
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let eventDataLines: string[] = []
  let fullText = ""

  const flushEvent = () => {
    if (eventDataLines.length === 0) return
    const data = eventDataLines.join("\n").trim()
    eventDataLines = []
    if (!data || data === "[DONE]") return
    const event = JSON.parse(data) as StreamEvent
    if (event.error) {
      throw new Error(event.error)
    }
    if (event.content) {
      fullText += event.content
      onChunk?.(fullText)
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let newlineIndex = buffer.indexOf("\n")
    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex).replace(/\r$/, "")
      buffer = buffer.slice(newlineIndex + 1)
      if (line === "") {
        flushEvent()
      } else if (line.startsWith("data:")) {
        eventDataLines.push(line.slice(5).trimStart())
      }
      newlineIndex = buffer.indexOf("\n")
    }
  }

  buffer += decoder.decode()
  if (buffer) {
    const line = buffer.replace(/\r$/, "")
    if (line.startsWith("data:")) {
      eventDataLines.push(line.slice(5).trimStart())
    }
  }
  flushEvent()
  return fullText
}

export function useStudySubmission({
  currentItem,
  sentence,
  librarySlug,
  onRequeueReviewedNewWord,
}: {
  currentItem: StudyBatchItem | null
  sentence: string
  librarySlug: string
  onRequeueReviewedNewWord: (args: {
    reviewedWord: StudyBatchWordItem
    userWordId?: string | null
    score: number
  }) => void
}) {
  const [status, setStatus] = useState<SubmissionStatus>("idle")
  const [result, setResult] = useState<StudySubmissionResult | null>(null)
  const [streamPhase, setStreamPhase] = useState<StreamPhase>("idle")
  const [streamProgressChars, setStreamProgressChars] = useState(0)
  const [streamSections, setStreamSections] = useState<VisibleFeedbackSections>(EMPTY_VISIBLE_FEEDBACK)
  const pendingStreamTextRef = useRef<string | null>(null)
  const previewFrameRef = useRef<number | null>(null)
  const previewTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cancelScheduledPreviewUpdate = () => {
    if (previewFrameRef.current !== null && typeof window !== "undefined") {
      window.cancelAnimationFrame(previewFrameRef.current)
      previewFrameRef.current = null
    }

    if (previewTimeoutRef.current !== null) {
      clearTimeout(previewTimeoutRef.current)
      previewTimeoutRef.current = null
    }
  }

  const flushScheduledPreviewUpdate = () => {
    const fullText = pendingStreamTextRef.current
    pendingStreamTextRef.current = null

    if (!fullText) {
      return
    }

    const visibleFeedback = extractVisibleFeedback(fullText)

    startTransition(() => {
      setStreamProgressChars(fullText.length)
      setStreamSections(parseVisibleFeedbackSections(visibleFeedback.feedback))
      setStreamPhase(visibleFeedback.hasJsonStart ? "structuring" : "feedback")
    })
  }

  const schedulePreviewUpdate = (fullText: string) => {
    pendingStreamTextRef.current = fullText

    if (previewFrameRef.current !== null || previewTimeoutRef.current !== null) {
      return
    }

    if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
      previewFrameRef.current = window.requestAnimationFrame(() => {
        previewFrameRef.current = null
        flushScheduledPreviewUpdate()
      })
      return
    }

    previewTimeoutRef.current = setTimeout(() => {
      previewTimeoutRef.current = null
      flushScheduledPreviewUpdate()
    }, 16)
  }

  useEffect(() => {
    return () => {
      cancelScheduledPreviewUpdate()
    }
  }, [])

  const resetSubmissionState = () => {
    cancelScheduledPreviewUpdate()
    pendingStreamTextRef.current = null
    setResult(null)
    setStatus("idle")
    setStreamPhase("idle")
    setStreamProgressChars(0)
    setStreamSections(EMPTY_VISIBLE_FEEDBACK)
  }

  const submitCurrentSentence = async (mode: SubmissionMode = "scheduled") => {
    if (!sentence.trim() || !currentItem) {
      alert("Write a sentence first.")
      return
    }

    setStatus("submitting")
    setStreamPhase("connecting")
    setStreamProgressChars(0)
    setStreamSections(EMPTY_VISIBLE_FEEDBACK)

    const currentWord = isStudyBatchWordItem(currentItem) ? currentItem : null
    const currentGrammar = isStudyBatchGrammarItem(currentItem) ? currentItem : null

    try {
      let streamedContent: string | null = null

      try {
        const payload: StreamPayload = currentWord
          ? {
              word: currentWord.words.word,
              sentence,
              definition: currentWord.words.definition || "",
              tags: currentWord.words.tags || "",
              wordId: currentWord.word_id,
            }
          : {
              targetKind: "grammar",
              sentence,
              grammarItemId: currentGrammar!.grammar_item_id,
              title: currentGrammar!.grammar.title,
              pattern: currentGrammar!.grammar.pattern,
              coreExplanation: currentGrammar!.grammar.coreExplanation,
              usageNote: currentGrammar!.grammar.usageNote || null,
              sceneTags: currentGrammar!.grammar.sceneTags,
              templates: currentGrammar!.grammar.templates.map((item) => item.template),
              examples: currentGrammar!.grammar.examples.map((item) => item.sentence),
            }

        streamedContent = await streamEvaluateSentence(payload, (fullText) => {
          schedulePreviewUpdate(fullText)
        })

        cancelScheduledPreviewUpdate()
        flushScheduledPreviewUpdate()
      } catch (error) {
        cancelScheduledPreviewUpdate()
        console.error(error)
      }

      const submission =
        mode === "practice"
          ? currentWord
            ? await rewriteSentence(
                currentWord.word_id,
                currentWord.words.word,
                currentWord.words.definition || "",
                currentWord.words.tags || "",
                sentence,
                librarySlug,
                streamedContent
              )
            : await rewriteGrammarSentence(
                currentGrammar!.grammar_item_id,
                currentGrammar!.grammar.title,
                currentGrammar!.grammar.pattern,
                currentGrammar!.grammar.coreExplanation,
                currentGrammar!.grammar.usageNote || null,
                currentGrammar!.grammar.sceneTags,
                currentGrammar!.grammar.templates.map((item) => item.template),
                currentGrammar!.grammar.examples.map((item) => item.sentence),
                sentence,
                librarySlug,
                streamedContent
              )
          : currentWord
            ? await submitSentence(
                currentWord.userWordId,
                currentWord.word_id,
                currentWord.words.word,
                currentWord.words.definition || "",
                currentWord.words.tags || "",
                sentence,
                librarySlug,
                streamedContent
              )
            : await submitGrammarSentence(
                currentGrammar!.userGrammarItemId,
                currentGrammar!.grammar_item_id,
                currentGrammar!.grammar.title,
                currentGrammar!.grammar.pattern,
                currentGrammar!.grammar.coreExplanation,
                currentGrammar!.grammar.usageNote || null,
                currentGrammar!.grammar.sceneTags,
                currentGrammar!.grammar.templates.map((item) => item.template),
                currentGrammar!.grammar.examples.map((item) => item.sentence),
                sentence,
                librarySlug,
                streamedContent
              )

      setResult(submission)
      setStatus("result")

      if (mode === "scheduled" && currentWord) {
        onRequeueReviewedNewWord({
          reviewedWord: currentWord,
          userWordId: submission.userWordId,
          score: submission.evaluation.score,
        })
      }
    } catch (error) {
      console.error(error)
      alert("AI evaluation failed.")
      setStatus("idle")
    } finally {
      cancelScheduledPreviewUpdate()
      pendingStreamTextRef.current = null
      setStreamPhase("idle")
      setStreamProgressChars(0)
    }
  }

  const beginRewrite = (currentSentence: string) => {
    const nextSentence = result?.evaluation.correctedSentence || result?.evaluation.polishedSentence || currentSentence
    resetSubmissionState()
    return nextSentence
  }

  return {
    status,
    result,
    streamPhase,
    streamProgressChars,
    streamSections,
    submitCurrentSentence,
    resetSubmissionState,
    beginRewrite,
  }
}
