"use client"

import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  GraduationCap,
  Heart,
  Lightbulb,
  PenLine,
  Save,
  Settings,
  SkipForward,
  Sparkles,
  Volume2,
  Wand2,
  X,
} from "lucide-react"
import {
  EMPTY_VISIBLE_FEEDBACK,
  extractVisibleFeedback,
  parseVisibleFeedbackSections,
  type VisibleFeedbackSections,
} from "@/lib/evaluation-format"
import {
  getStudyBatch,
  submitSentence,
  toggleFavoriteWord,
  type EvaluationResult,
  type StudyBatchItem,
} from "./actions"

type StreamPhase = "idle" | "connecting" | "feedback" | "structuring"
type StudyMode = "all" | "favorites"
type SubmissionResult = Awaited<ReturnType<typeof submitSentence>>

interface SpeechConfig {
  ttsRate: number
  ttsPitch: number
}

interface StreamEvent {
  content?: string
  error?: string
}

const DEFAULT_SPEECH_CONFIG: SpeechConfig = { ttsRate: 1, ttsPitch: 1 }
const SPEECH_CONFIG_STORAGE_KEY = "contextvocab-speech-config"

function getPriorityLabel(reason: StudyBatchItem["priorityReason"]) {
  switch (reason) {
    case "leech_due":
      return "顽固复习"
    case "overdue":
      return "逾期复习"
    case "weak_due":
      return "低分回捞"
    case "due":
      return "今日复习"
    case "new":
    default:
      return "新词"
  }
}

function inferPartOfSpeech(definition?: string | null) {
  const normalized = (definition || "").toLowerCase()
  if (normalized.includes("adj.")) return "adjective"
  if (normalized.includes("adv.")) return "adverb"
  if (normalized.includes("vt.") || normalized.includes("vi.") || normalized.includes("v.")) {
    return "verb"
  }
  if (normalized.includes("n.")) return "noun"
  return "unknown"
}

function buildSentenceStarters(word: string, definition?: string | null) {
  const pos = inferPartOfSpeech(definition)

  switch (pos) {
    case "verb":
      return [
        `I want to ${word} because ...`,
        `We decided to ${word} when ...`,
        `It is hard to ${word} if ...`,
      ]
    case "noun":
      return [
        `The ${word} became important when ...`,
        `One example of ${word} is ...`,
        `This ${word} matters because ...`,
      ]
    case "adjective":
      return [
        `The ${word} plan is hard to finish because ...`,
        `In the ${word} situation, we need to ...`,
        `This is ${word} for me because ...`,
      ]
    case "adverb":
      return [
        `She spoke ${word} when ...`,
        `He responded ${word} because ...`,
        `They worked ${word} to ...`,
      ]
    default:
      return [
        `I used "${word}" when ...`,
        `In this situation, "${word}" means ...`,
        `A simple sentence with "${word}" is ...`,
      ]
  }
}

function buildUsageCoachingSkeletons(
  word: string,
  definition?: string | null,
  evaluation?: EvaluationResult | null
) {
  const baseStarters = buildSentenceStarters(word, definition)
  const pos = inferPartOfSpeech(definition)

  if (evaluation?.isMetaSentence || evaluation?.usageQuality === "meta") {
    switch (pos) {
      case "verb":
        return [
          `I had to ${word} because ...`,
          `We chose to ${word} when ...`,
          `People ${word} if ...`,
        ]
      case "noun":
        return [
          `The ${word} caused a problem because ...`,
          `I noticed the ${word} when ...`,
          `This ${word} can help people who ...`,
        ]
      case "adjective":
        return [
          `The ${word} plan may change because ...`,
          `In the ${word} situation, I need to ...`,
          `She is reading about ${word} events because ...`,
        ]
      case "adverb":
        return [
          `She spoke ${word} during the meeting because ...`,
          `He answered ${word} after ...`,
          `They worked ${word} to finish ...`,
        ]
      default:
        return baseStarters
    }
  }

  if (evaluation?.attemptStatus === "needs_help" || evaluation?.usageQuality === "invalid") {
    return baseStarters
  }

  if (evaluation?.usageQuality === "weak") {
    switch (pos) {
      case "verb":
        return [
          `I ${word} the plan because ...`,
          `We need to ${word} before ...`,
          `They tried to ${word} after ...`,
        ]
      case "noun":
        return [
          `The ${word} helped us because ...`,
          `I saw a ${word} when ...`,
          `This ${word} changed after ...`,
        ]
      case "adjective":
        return [
          `The ${word} problem became worse when ...`,
          `Under the ${word} conditions, we should ...`,
          `My ${word} goal is to ...`,
        ]
      case "adverb":
        return [
          `She answered ${word} after ...`,
          `He moved ${word} because ...`,
          `They reacted ${word} when ...`,
        ]
      default:
        return baseStarters
    }
  }

  return baseStarters
}

function AnimatedScore({ score }: { score: number }) {
  const [displayScore, setDisplayScore] = useState(0)

  useEffect(() => {
    let start = 0
    const duration = 800
    const stepTime = 16
    const steps = duration / stepTime
    const increment = score / steps
    const timer = setInterval(() => {
      start += increment
      if (start >= score) {
        setDisplayScore(score)
        clearInterval(timer)
      } else {
        setDisplayScore(Math.round(start))
      }
    }, stepTime)

    return () => clearInterval(timer)
  }, [score])

  return <span className="text-2xl font-black">{displayScore}</span>
}

function SubScoreBar({ label, score, color }: { label: string; score: number; color: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-16 shrink-0 text-right text-xs text-zinc-500">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${(score / 5) * 100}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className={`h-full rounded-full ${color}`}
        />
      </div>
      <span className="w-6 font-mono text-xs text-zinc-400">{score}/5</span>
    </div>
  )
}

function ErrorTag({ type }: { type: string }) {
  const config: Record<string, { label: string; color: string }> = {
    grammar: { label: "语法", color: "border-red-500/20 bg-red-500/10 text-red-400" },
    word_usage: { label: "用词", color: "border-amber-500/20 bg-amber-500/10 text-amber-400" },
    naturalness: { label: "自然度", color: "border-blue-500/20 bg-blue-500/10 text-blue-400" },
    spelling: { label: "拼写", color: "border-purple-500/20 bg-purple-500/10 text-purple-400" },
  }

  const item = config[type] || config.grammar
  return (
    <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase ${item.color}`}>
      {item.label}
    </span>
  )
}

function resetViewState(setters: {
  setSentence: (value: string) => void
  setResult: (value: SubmissionResult | null) => void
  setStatus: (value: "idle" | "submitting" | "result") => void
  setStreamPhase: (value: StreamPhase) => void
  setStreamProgressChars: (value: number) => void
  setStreamSections: (value: VisibleFeedbackSections) => void
  setShowSentenceHelp: (value: boolean) => void
}, options?: { preserveSentence?: boolean; keepSentenceHelp?: boolean }) {
  if (!options?.preserveSentence) {
    setters.setSentence("")
  }
  setters.setResult(null)
  setters.setStatus("idle")
  setters.setStreamPhase("idle")
  setters.setStreamProgressChars(0)
  setters.setStreamSections(EMPTY_VISIBLE_FEEDBACK)
  if (!options?.keepSentenceHelp) {
    setters.setShowSentenceHelp(false)
  }
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

export default function StudyClient({
  initialBatch,
  initialFavoriteWordIds,
}: {
  initialBatch: StudyBatchItem[]
  initialFavoriteWordIds: string[]
}) {
  const [currentWord, setCurrentWord] = useState<StudyBatchItem | null>(initialBatch[0] ?? null)
  const [queuedWords, setQueuedWords] = useState<StudyBatchItem[]>(initialBatch.slice(1))
  const [sentence, setSentence] = useState("")
  const [status, setStatus] = useState<"idle" | "submitting" | "result">("idle")
  const [result, setResult] = useState<SubmissionResult | null>(null)
  const [streamPhase, setStreamPhase] = useState<StreamPhase>("idle")
  const [streamProgressChars, setStreamProgressChars] = useState(0)
  const [streamSections, setStreamSections] = useState<VisibleFeedbackSections>(EMPTY_VISIBLE_FEEDBACK)
  const [showSentenceHelp, setShowSentenceHelp] = useState(false)
  const [library, setLibrary] = useState<"All" | "CET-4" | "CET-6">("All")
  const [studyMode, setStudyMode] = useState<StudyMode>("all")
  const [favoriteWordIds, setFavoriteWordIds] = useState<string[]>(initialFavoriteWordIds)
  const [favoritePending, setFavoritePending] = useState(false)
  const [loadingNext, setLoadingNext] = useState(false)
  const [refillingQueue, setRefillingQueue] = useState(false)
  const [skippedWordIds, setSkippedWordIds] = useState<string[]>([])
  const [showSettings, setShowSettings] = useState(false)
  const [speechConfig, setSpeechConfig] = useState<SpeechConfig>(DEFAULT_SPEECH_CONFIG)
  const [mounted, setMounted] = useState(false)

  const queueContextRef = useRef(0)
  const requeuedNewWordIdsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    setMounted(true)
    const saved = localStorage.getItem(SPEECH_CONFIG_STORAGE_KEY)
    if (saved) {
      try {
        setSpeechConfig(JSON.parse(saved) as SpeechConfig)
      } catch {
        setSpeechConfig(DEFAULT_SPEECH_CONFIG)
      }
    }
  }, [])

  const playAudio = (text: string) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = "en-US"
    utterance.rate = speechConfig.ttsRate
    utterance.pitch = speechConfig.ttsPitch
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(utterance)
  }

  const fetchBatch = async (
    nextLibrary: "All" | "CET-4" | "CET-6",
    nextMode: StudyMode,
    nextSkippedWordIds: string[],
    activeWord: StudyBatchItem | null,
    pendingQueue: StudyBatchItem[],
    batchSize = 5
  ) => {
    const excludedWordIds = Array.from(
      new Set([
        ...nextSkippedWordIds,
        ...(activeWord ? [activeWord.word_id] : []),
        ...pendingQueue.map((item) => item.word_id),
      ])
    )

    return getStudyBatch({
      tag: nextLibrary,
      favoritesOnly: nextMode === "favorites",
      skippedWordIds: excludedWordIds,
      batchSize,
    })
  }

  const applyBatch = (batch: StudyBatchItem[]) => {
    setCurrentWord(batch[0] ?? null)
    setQueuedWords(batch.slice(1))
  }

  const reloadStudyBatch = async (
    nextLibrary = library,
    nextMode = studyMode,
    nextSkippedWordIds = skippedWordIds
  ) => {
    queueContextRef.current += 1
    const context = queueContextRef.current
    setLoadingNext(true)
    try {
      const batch = await fetchBatch(nextLibrary, nextMode, nextSkippedWordIds, null, [])
      if (queueContextRef.current === context) {
        applyBatch(batch)
      }
    } catch (error) {
      console.error(error)
      alert("获取学习批次失败。")
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
          library,
          studyMode,
          skippedWordIds,
          currentWord,
          queuedWords,
          5
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
  }, [currentWord, queuedWords, library, studyMode, skippedWordIds])

  const submitCurrentSentence = async () => {
    if (!sentence.trim() || !currentWord) {
      alert("请先写句子。")
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

      const submission = await submitSentence(
        currentWord.id,
        currentWord.word_id,
        wordData.word,
        wordData.definition || "",
        wordData.tags || "",
        sentence,
        streamedContent
      )

      setResult(submission)
      setStatus("result")

      if (currentWord.isNew && !requeuedNewWordIdsRef.current.has(currentWord.word_id)) {
        const insertOffset = submission.evaluation.score < 75 ? 1 : 3
        requeuedNewWordIdsRef.current.add(currentWord.word_id)
        setQueuedWords((existingQueue) => {
          if (existingQueue.some((item) => item.word_id === currentWord.word_id)) {
            return existingQueue
          }

          const requeuedWord: StudyBatchItem = {
            ...currentWord,
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
    } catch (error) {
      console.error(error)
      alert("AI 评估失败。")
      setStatus("idle")
    } finally {
      setStreamPhase("idle")
      setStreamProgressChars(0)
    }
  }

  const handleNext = async (
    nextLibrary = library,
    isSkipping = false,
    nextMode = studyMode
  ) => {
    let nextSkippedWordIds = [...skippedWordIds]
    if (isSkipping && currentWord) {
      nextSkippedWordIds = Array.from(new Set([...nextSkippedWordIds, currentWord.word_id]))
      setSkippedWordIds(nextSkippedWordIds)
    }

    resetViewState({
      setSentence,
      setResult,
      setStatus,
      setStreamPhase,
      setStreamProgressChars,
      setStreamSections,
      setShowSentenceHelp,
    })

    if (queuedWords.length > 0) {
      const [nextWord, ...restQueue] = queuedWords
      setCurrentWord(nextWord)
      setQueuedWords(restQueue)
      return
    }

    await reloadStudyBatch(nextLibrary, nextMode, nextSkippedWordIds)
  }

  const retryCurrentWord = () => {
    resetViewState(
      {
        setSentence,
        setResult,
        setStatus,
        setStreamPhase,
        setStreamProgressChars,
        setStreamSections,
        setShowSentenceHelp,
      },
      { preserveSentence: true, keepSentenceHelp: true }
    )
    setShowSentenceHelp(true)
  }

  const handleLibraryChange = async (event: React.ChangeEvent<HTMLSelectElement>) => {
    const nextLibrary = event.target.value as "All" | "CET-4" | "CET-6"
    setLibrary(nextLibrary)
    setSkippedWordIds([])
    requeuedNewWordIdsRef.current.clear()
    resetViewState({
      setSentence,
      setResult,
      setStatus,
      setStreamPhase,
      setStreamProgressChars,
      setStreamSections,
      setShowSentenceHelp,
    })
    await reloadStudyBatch(nextLibrary, studyMode, [])
  }

  const handleStudyModeChange = async (event: React.ChangeEvent<HTMLSelectElement>) => {
    const nextMode = event.target.value as StudyMode
    setStudyMode(nextMode)
    setSkippedWordIds([])
    requeuedNewWordIdsRef.current.clear()
    resetViewState({
      setSentence,
      setResult,
      setStatus,
      setStreamPhase,
      setStreamProgressChars,
      setStreamSections,
      setShowSentenceHelp,
    })
    await reloadStudyBatch(library, nextMode, [])
  }

  const toggleFavorite = async () => {
    if (!currentWord) return
    setFavoritePending(true)
    try {
      const updatedFavorites = await toggleFavoriteWord(
        currentWord.word_id,
        !favoriteWordIds.includes(currentWord.word_id)
      )
      setFavoriteWordIds(updatedFavorites)
      if (studyMode === "favorites" && !updatedFavorites.includes(currentWord.word_id)) {
        await handleNext(library, false, studyMode)
      }
    } catch (error) {
      console.error(error)
      alert(error instanceof Error ? error.message : "收藏更新失败。")
    } finally {
      setFavoritePending(false)
    }
  }

  if (!currentWord) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <select
              value={library}
              onChange={handleLibraryChange}
              className="rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-sm text-zinc-200"
            >
              <option value="All">全部词库</option>
              <option value="CET-4">四级</option>
              <option value="CET-6">六级</option>
            </select>
            <select
              value={studyMode}
              onChange={handleStudyModeChange}
              className="rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-sm text-zinc-200"
            >
              <option value="all">全部单词</option>
              <option value="favorites">仅看收藏</option>
            </select>
          </div>
          <button
            type="button"
            onClick={() => reloadStudyBatch()}
            className="rounded-lg bg-white/10 px-4 py-2 text-sm text-white"
          >
            刷新
          </button>
        </div>

        <div className="glass-panel rounded-3xl p-10 text-center text-zinc-300">
          当前条件下没有可学习单词了。
        </div>
      </div>
    )
  }

  const evaluation: EvaluationResult | null = result?.evaluation ?? null
  const isFavorite = favoriteWordIds.includes(currentWord.word_id)
  const coachingSkeletons = buildUsageCoachingSkeletons(
    currentWord.words.word,
    currentWord.words.definition,
    evaluation
  )

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <AnimatePresence>
        {showSettings && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0f0f13] p-6"
            >
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2 text-white">
                  <Settings className="h-4 w-4 text-blue-400" />
                  朗读设置
                </div>
                <button
                  type="button"
                  onClick={() => setShowSettings(false)}
                  className="text-zinc-400"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-4">
                <label className="block text-sm text-zinc-300">
                  速度 {speechConfig.ttsRate.toFixed(1)}x
                </label>
                <input
                  type="range"
                  min="0.5"
                  max="2"
                  step="0.1"
                  value={speechConfig.ttsRate}
                  onChange={(event) =>
                    setSpeechConfig((current) => ({
                      ...current,
                      ttsRate: Number(event.target.value),
                    }))
                  }
                  className="w-full"
                />

                <label className="block text-sm text-zinc-300">
                  音调 {speechConfig.ttsPitch.toFixed(1)}
                </label>
                <input
                  type="range"
                  min="0.5"
                  max="2"
                  step="0.1"
                  value={speechConfig.ttsPitch}
                  onChange={(event) =>
                    setSpeechConfig((current) => ({
                      ...current,
                      ttsPitch: Number(event.target.value),
                    }))
                  }
                  className="w-full"
                />

                <div className="flex justify-between">
                  <button
                    type="button"
                    onClick={() => playAudio(currentWord.words.word)}
                    className="rounded-md border border-white/10 px-3 py-2 text-sm text-zinc-300"
                  >
                    试听
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      localStorage.setItem(
                        SPEECH_CONFIG_STORAGE_KEY,
                        JSON.stringify(speechConfig)
                      )
                      setShowSettings(false)
                    }}
                    className="flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm text-white"
                  >
                    <Save className="h-4 w-4" />
                    保存
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={library}
            onChange={handleLibraryChange}
            disabled={loadingNext || status === "submitting"}
            className="rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-sm text-zinc-200"
          >
            <option value="All">全部词库</option>
            <option value="CET-4">四级</option>
            <option value="CET-6">六级</option>
          </select>
          <select
            value={studyMode}
            onChange={handleStudyModeChange}
            disabled={loadingNext || status === "submitting"}
            className="rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-sm text-zinc-200"
          >
            <option value="all">全部单词</option>
            <option value="favorites">仅看收藏</option>
          </select>
          <button
            type="button"
            onClick={() => setShowSettings(true)}
            className="rounded-lg p-2 text-zinc-400 transition-colors hover:bg-white/10 hover:text-white"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>

        <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">
          Queue {queuedWords.length} {(loadingNext || refillingQueue) ? (loadingNext ? "loading" : "prefetch") : ""}
        </div>
      </div>

      <div className={`glass-panel rounded-3xl p-8 ${loadingNext ? "pointer-events-none opacity-50 blur-sm" : ""}`}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-300">
              {getPriorityLabel(currentWord.priorityReason)}
            </span>
            <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-zinc-400">
              {currentWord.words.tags || "词汇"}
            </span>
          </div>

          <button
            type="button"
            onClick={toggleFavorite}
            disabled={favoritePending || status === "submitting"}
            className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs ${
              isFavorite
                ? "border-rose-500/30 bg-rose-500/12 text-rose-300"
                : "border-white/10 text-zinc-400"
            }`}
          >
            <Heart className={`h-3.5 w-3.5 ${isFavorite ? "fill-current" : ""}`} />
            {isFavorite ? "已收藏" : "收藏"}
          </button>
        </div>

        <div className="mb-4 flex items-center gap-4">
          <h1 className="text-5xl font-extrabold text-white">{currentWord.words.word}</h1>
          <button
            type="button"
            onClick={() => playAudio(currentWord.words.word)}
            className="text-zinc-500 transition-colors hover:text-blue-400"
          >
            <Volume2 className="h-6 w-6" />
          </button>
        </div>

        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 text-zinc-300">
          <p className="flex items-start gap-3">
            <BookOpen className="mt-1 h-5 w-5 shrink-0 text-blue-400/70" />
            <span>{currentWord.words.definition}</span>
          </p>
        </div>
      </div>

      {status !== "result" && (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void submitCurrentSentence()
          }}
          className="flex flex-col gap-4"
        >
          <textarea
            value={sentence}
            onChange={(event) => setSentence(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault()
                if (sentence.trim() && status !== "submitting") {
                  void submitCurrentSentence()
                }
              }
            }}
            placeholder={`请用 "${currentWord.words.word}" 造句...`}
            className="h-36 rounded-3xl border border-white/10 bg-[#09090b]/80 p-5 text-lg text-zinc-100 outline-none focus:border-blue-500/50"
          />

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowSentenceHelp((current) => !current)}
              className="inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-4 py-2 text-sm text-amber-200"
            >
              <Lightbulb className="h-4 w-4" />
              {showSentenceHelp ? "收起造句辅助" : "我不会造句，给我提示"}
            </button>

            <button
              type="button"
              onClick={() => handleNext(library, true)}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm text-zinc-300"
            >
              <SkipForward className="h-4 w-4" />
              跳过
            </button>

            <button
              type="submit"
              disabled={!sentence.trim() || status === "submitting"}
              className="ml-auto inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white disabled:bg-white/10 disabled:text-zinc-500"
            >
              {status === "submitting" ? "AI 评估中..." : (
                <>
                  <Sparkles className="h-4 w-4" />
                  提交
                </>
              )}
            </button>
          </div>
        </form>
      )}

      {showSentenceHelp && (
        <div className="glass-panel rounded-3xl border border-amber-500/15 bg-amber-500/[0.05] p-6 text-sm text-zinc-300">
          <div className="mb-3 flex items-center justify-between">
            <div className="font-medium text-white">先写一个最短可用句子</div>
            <button
              type="button"
              onClick={() => setShowSentenceHelp(false)}
              className="text-zinc-400"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setSentence(`I use ${currentWord.words.word} when `)}
              className="block w-full rounded-xl border border-white/10 px-3 py-2 text-left hover:bg-white/5"
            >
              I use {currentWord.words.word} when ...
            </button>
            <button
              type="button"
              onClick={() => setSentence(`This ${currentWord.words.word} is important because `)}
              className="block w-full rounded-xl border border-white/10 px-3 py-2 text-left hover:bg-white/5"
            >
              This {currentWord.words.word} is important because ...
            </button>
            {currentWord.words.example && (
              <button
                type="button"
                onClick={() => setSentence(currentWord.words.example || "")}
                className="block w-full rounded-xl border border-white/10 px-3 py-2 text-left hover:bg-white/5"
              >
                参考例句：{currentWord.words.example}
              </button>
            )}
            {coachingSkeletons.map((skeleton) => (
              <button
                key={skeleton}
                type="button"
                onClick={() => setSentence((current) => (current.trim() ? `${current} ${skeleton}` : skeleton))}
                className="block w-full rounded-xl border border-white/10 px-3 py-2 text-left hover:bg-white/5"
              >
                {skeleton}
              </button>
            ))}
          </div>
        </div>
      )}

      {status === "submitting" && (
        <div className="glass-panel rounded-3xl border border-blue-500/15 bg-blue-500/[0.05] p-6">
          <div className="mb-3 text-sm text-blue-300">
            {streamPhase === "structuring" ? "正在整理结构化结果..." : "AI 正在实时分析你的句子"}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {(["overall", "issue", "tip", "progress"] as const).map((key) => (
              <div key={key} className="min-h-24 rounded-2xl border border-white/8 bg-black/30 p-4">
                <div className="mb-2 text-xs uppercase tracking-[0.18em] text-blue-300/75">
                  {key}
                </div>
                <div className="text-sm text-zinc-200">{streamSections[key] || "..."}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 text-xs text-zinc-500">{streamProgressChars} chars</div>
        </div>
      )}

      {status === "result" && result && evaluation && (
        <div
          className={`glass-panel relative overflow-hidden rounded-3xl p-8 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.5)] ${
            evaluation.score >= 80
              ? "score-glow-green"
              : evaluation.score >= 60
                ? "score-glow-yellow"
                : "score-glow-red"
          }`}
        >
          <div
            className={`absolute left-0 right-0 top-0 h-1.5 ${
              evaluation.score >= 80
                ? "bg-gradient-to-r from-green-400 via-emerald-500 to-green-600"
                : evaluation.score >= 60
                  ? "bg-gradient-to-r from-yellow-400 via-amber-500 to-orange-500"
                  : "bg-gradient-to-r from-red-400 via-rose-500 to-red-600"
            }`}
          />

          <div className="mb-6 mt-2 flex items-start justify-between gap-4">
            <div>
              <h3 className="bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-xl font-bold text-transparent">
                AI 评估结果
              </h3>
              <p className="mt-2 rounded-lg border border-white/5 bg-black/20 p-3 text-sm italic text-zinc-400">
                &quot;{sentence}&quot;
              </p>
            </div>
            <div
              className={`flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-[3px] shadow-lg ${
                evaluation.score >= 80
                  ? "border-green-500/40 bg-green-500/10 text-green-400 shadow-green-500/20"
                  : evaluation.score >= 60
                    ? "border-yellow-500/40 bg-yellow-500/10 text-yellow-400 shadow-yellow-500/20"
                    : "border-red-500/40 bg-red-500/10 text-red-400 shadow-red-500/20"
              }`}
            >
              <AnimatedScore score={evaluation.score} />
            </div>
          </div>

          {evaluation.attemptStatus === "needs_help" && (
            <div className="mb-4 flex gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/[0.06] p-4 text-sm text-zinc-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
              <div>这次输入还没形成一个自然完整的例句。先用造句辅助搭一个短句骨架，再补上人物、时间或原因，会更容易写出来。</div>
            </div>
          )}

          {evaluation.isMetaSentence && (
            <div className="mb-4 flex gap-3 rounded-2xl border border-orange-500/20 bg-orange-500/[0.06] p-4 text-sm text-zinc-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-orange-300" />
              <div>这句话更像是在谈这个词本身，还没有真正把它放进语境里使用。下面的修改版可以作为一个更自然的表达方向。</div>
            </div>
          )}

          {evaluation.usageQuality === "weak" && !evaluation.isMetaSentence && evaluation.attemptStatus === "valid" && (
            <div className="mb-4 flex gap-3 rounded-2xl border border-blue-500/20 bg-blue-500/[0.06] p-4 text-sm text-zinc-300">
              <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-blue-300" />
              <div>这句话已经成句了，但语境还偏薄。给它补上人物、时间、原因或结果，表达会更自然，学习价值也会更高。</div>
            </div>
          )}

          <div className="mb-5 space-y-3 rounded-2xl border border-white/8 bg-black/20 p-4">
            <SubScoreBar label="语法" score={evaluation.grammarScore} color="bg-red-400" />
            <SubScoreBar label="用词" score={evaluation.wordUsageScore} color="bg-amber-400" />
            <SubScoreBar label="自然度" score={evaluation.naturalness} color="bg-blue-400" />
          </div>

          <div className="mb-4 rounded-xl border border-emerald-500/[0.12] bg-emerald-500/[0.06] p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-emerald-300">
              <CheckCircle2 className="h-4 w-4" />
              点评亮点
            </div>
            <p className="text-sm leading-7 text-emerald-100">{evaluation.praise || "继续保持，已经有不错的句子基础了。"}</p>
          </div>

          {evaluation.correctedSentence && (
            <div className="mb-4 rounded-xl border border-emerald-500/[0.12] bg-emerald-500/[0.06] p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-medium text-emerald-300">
                  <PenLine className="h-3.5 w-3.5" />
                  修正后的句子
                </div>
                <button
                  type="button"
                  onClick={() => playAudio(evaluation.correctedSentence)}
                  className="p-1 text-emerald-300/70 transition-colors hover:text-emerald-300"
                  title="朗读句子"
                >
                  <Volume2 className="h-4 w-4" />
                </button>
              </div>
              <p className="text-sm italic leading-relaxed text-emerald-100">
                &quot;{evaluation.correctedSentence}&quot;
              </p>
            </div>
          )}

          {evaluation.errors.length > 0 && (
            <div className="mb-4 space-y-2">
              {evaluation.errors.map((error, index) => (
                <div
                  key={`${error.type}-${error.original}-${index}`}
                  className="rounded-xl border border-white/8 bg-white/[0.03] p-4"
                >
                  <div className="mb-2 flex items-center gap-2">
                    <ErrorTag type={error.type} />
                    <code className="rounded bg-black/25 px-2 py-0.5 text-xs text-zinc-300">
                      {error.original}
                    </code>
                    <span className="text-zinc-600">→</span>
                    <code className="rounded bg-black/25 px-2 py-0.5 text-xs text-emerald-300">
                      {error.correction}
                    </code>
                  </div>
                  <p className="text-sm leading-7 text-zinc-300">{error.explanation}</p>
                </div>
              ))}
            </div>
          )}

          {evaluation.suggestion && (
            <div className="mb-4 rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-zinc-100">
                <Lightbulb className="h-4 w-4 text-amber-300" />
                下一步建议
              </div>
              <p className="text-sm leading-7 text-zinc-300">{evaluation.suggestion}</p>
            </div>
          )}

          {(evaluation.advancedExpressions.length > 0 || evaluation.polishedSentence) && (
            <div className="mb-4 overflow-hidden rounded-2xl border border-indigo-500/[0.12] bg-gradient-to-br from-indigo-500/[0.06] to-purple-500/[0.04]">
              <div className="flex items-center gap-2 border-b border-indigo-500/[0.08] bg-indigo-500/[0.04] px-4 py-3">
                <GraduationCap className="h-4 w-4 text-indigo-300" />
                <span className="text-xs font-semibold tracking-wide text-indigo-200">高阶润色</span>
                <span className="ml-auto text-[10px] text-indigo-300/60">学更自然的表达</span>
              </div>

              <div className="space-y-3 p-4">
                {evaluation.advancedExpressions.map((expression, index) => (
                  <div
                    key={`${expression.original}-${expression.advanced}-${index}`}
                    className="rounded-xl border border-white/[0.04] bg-black/20 p-3"
                  >
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="rounded bg-white/[0.04] px-2 py-0.5 font-mono text-sm text-zinc-300">
                        {expression.original}
                      </span>
                      <span className="text-zinc-600">→</span>
                      <span className="rounded bg-indigo-500/10 px-2 py-0.5 font-mono text-sm text-indigo-200">
                        {expression.advanced}
                      </span>
                    </div>
                    <p className="text-sm leading-7 text-zinc-300">{expression.explanation}</p>
                    {expression.example && (
                      <p className="mt-2 text-sm italic text-indigo-100/85">&quot;{expression.example}&quot;</p>
                    )}
                  </div>
                ))}

                {evaluation.polishedSentence && (
                  <div className="rounded-xl border border-indigo-500/[0.1] bg-gradient-to-r from-indigo-500/[0.06] to-purple-500/[0.06] p-4">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-xs font-medium text-purple-200">
                        <Wand2 className="h-3.5 w-3.5 text-purple-300" />
                        母语者级润色
                      </div>
                      <button
                        type="button"
                        onClick={() => playAudio(evaluation.polishedSentence)}
                        className="p-1 text-purple-300/70 transition-colors hover:text-purple-300"
                        title="朗读句子"
                      >
                        <Volume2 className="h-4 w-4" />
                      </button>
                    </div>
                    <p className="text-sm italic leading-relaxed text-indigo-100">
                      &quot;{evaluation.polishedSentence}&quot;
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {(evaluation.attemptStatus === "needs_help" ||
            evaluation.isMetaSentence ||
            evaluation.usageQuality === "weak") && (
            <div className="mb-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-zinc-300">
              <div className="mb-2 font-medium text-white">下一句可以直接从这些骨架开始：</div>
              <div className="space-y-2">
                {coachingSkeletons.map((skeleton) => (
                  <button
                    key={`result-${skeleton}`}
                    type="button"
                    onClick={() => {
                      setSentence(skeleton)
                      retryCurrentWord()
                    }}
                    className="block w-full rounded-lg border border-white/10 px-3 py-2 text-left hover:bg-white/5"
                  >
                    {skeleton}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-6 flex flex-col gap-3 border-t border-white/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col text-xs text-zinc-500">
              <span>下次复习：{mounted ? new Date(result.nextSrs.nextReviewDate).toLocaleDateString("zh-CN") : "..."}</span>
              <span>当前难度系数：{result.nextSrs.easeFactor}</span>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={retryCurrentWord}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-zinc-200"
              >
                {evaluation.attemptStatus === "needs_help" ? "打开造句辅助，再试一次" : "参考修改后再试一次"}
              </button>
              <button
                type="button"
                onClick={() => handleNext(library)}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-white/10 px-5 py-3 text-sm text-white"
              >
                下一个单词
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
