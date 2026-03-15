"use client"

import { useState } from "react"
import {
  EMPTY_VISIBLE_FEEDBACK,
  extractVisibleFeedback,
  parseVisibleFeedbackSections,
  type VisibleFeedbackSections,
} from "@/lib/evaluation-format"
import { rewriteSentence, submitSentence, type StudyBatchItem, type StudySubmissionResult } from "../actions"

export type StreamPhase = "idle" | "connecting" | "feedback" | "structuring"
export type SubmissionStatus = "idle" | "submitting" | "result"
export type SubmissionMode = "scheduled" | "practice"

interface StreamEvent {
  content?: string
  error?: string
}

async function streamEvaluateSentence(
  payload: {
    word: string
    sentence: string
    definition: string
    tags: string
    wordId: string
  },
  onChunk?: (fullText: string) => void
) {
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
  currentWord,
  sentence,
  librarySlug,
  onRequeueReviewedNewWord,
}: {
  currentWord: StudyBatchItem | null
  sentence: string
  librarySlug: string
  onRequeueReviewedNewWord: (args: {
    reviewedWord: StudyBatchItem
    userWordId?: string | null
    score: number
  }) => void
}) {
  const [status, setStatus] = useState<SubmissionStatus>("idle")
  const [result, setResult] = useState<StudySubmissionResult | null>(null)
  const [streamPhase, setStreamPhase] = useState<StreamPhase>("idle")
  const [streamProgressChars, setStreamProgressChars] = useState(0)
  const [streamSections, setStreamSections] = useState<VisibleFeedbackSections>(EMPTY_VISIBLE_FEEDBACK)

  const resetSubmissionState = () => {
    setResult(null)
    setStatus("idle")
    setStreamPhase("idle")
    setStreamProgressChars(0)
    setStreamSections(EMPTY_VISIBLE_FEEDBACK)
  }

  const submitCurrentSentence = async (mode: SubmissionMode) => {
    if (!sentence.trim() || !currentWord) {
      alert("请先写一个句子。")
      return
    }

    setStatus("submitting")
    setStreamPhase("connecting")
    setStreamProgressChars(0)
    setStreamSections(EMPTY_VISIBLE_FEEDBACK)

    try {
      const wordData = currentWord.words
      let streamedContent: string | null = null

      try {
        streamedContent = await streamEvaluateSentence(
          {
            word: wordData.word,
            sentence,
            definition: wordData.definition || "",
            tags: wordData.tags || "",
            wordId: currentWord.word_id,
          },
          (fullText) => {
            setStreamProgressChars(fullText.length)
            const visibleFeedback = extractVisibleFeedback(fullText)
            setStreamSections(parseVisibleFeedbackSections(visibleFeedback.feedback))
            setStreamPhase(visibleFeedback.hasJsonStart ? "structuring" : "feedback")
          }
        )
      } catch (error) {
        console.error(error)
      }

      const submission =
        mode === "practice"
          ? await rewriteSentence(
              currentWord.word_id,
              wordData.word,
              wordData.definition || "",
              wordData.tags || "",
              sentence,
              librarySlug,
              streamedContent
            )
          : await submitSentence(
              currentWord.userWordId,
              currentWord.word_id,
              wordData.word,
              wordData.definition || "",
              wordData.tags || "",
              sentence,
              librarySlug,
              streamedContent
            )

      setResult(submission)
      setStatus("result")

      if (mode === "scheduled") {
        onRequeueReviewedNewWord({
          reviewedWord: currentWord,
          userWordId: submission.userWordId,
          score: submission.evaluation.score,
        })
      }
    } catch (error) {
      console.error(error)
      alert("AI 评估失败。")
      setStatus("idle")
    } finally {
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
