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
  generateSentenceHelp,
  getStudyBatch,
  rewriteSentence,
  submitSentence,
  toggleFavoriteWord,
  type EvaluationResult,
  type SentenceHelpItem,
  type SentenceHelpResult,
  type StudySubmissionResult,
  type StudyBatchItem,
  type StudyLibrary,
  type StudyView,
} from "./actions"

type StreamPhase = "idle" | "connecting" | "feedback" | "structuring"
type SubmissionResult = StudySubmissionResult
type SentenceHelpState = "idle" | "loading" | "ready"
type SubmissionMode = "scheduled" | "practice"

interface SpeechConfig {
  ttsRate: number
  ttsPitch: number
  voiceURI: string
}

interface StreamEvent {
  content?: string
  error?: string
}

const DEFAULT_SPEECH_CONFIG: SpeechConfig = { ttsRate: 0.9, ttsPitch: 1, voiceURI: "" }
const SPEECH_CONFIG_STORAGE_KEY = "contextvocab-speech-config"
const DEFAULT_PREVIEW_SENTENCE = "The quick brown fox jumps over the lazy dog."

function normalizeSpeechConfig(value: unknown): SpeechConfig {
  if (typeof value !== "object" || value === null) {
    return DEFAULT_SPEECH_CONFIG
  }

  const config = value as Partial<SpeechConfig>
  return {
    ttsRate:
      typeof config.ttsRate === "number" && Number.isFinite(config.ttsRate)
        ? config.ttsRate
        : DEFAULT_SPEECH_CONFIG.ttsRate,
    ttsPitch:
      typeof config.ttsPitch === "number" && Number.isFinite(config.ttsPitch)
        ? config.ttsPitch
        : DEFAULT_SPEECH_CONFIG.ttsPitch,
    voiceURI: typeof config.voiceURI === "string" ? config.voiceURI : DEFAULT_SPEECH_CONFIG.voiceURI,
  }
}

function scoreVoice(voice: SpeechSynthesisVoice) {
  const name = voice.name.toLowerCase()
  const lang = voice.lang.toLowerCase()

  if (!lang.startsWith("en")) return -1

  let score = 0
  if (voice.default) score += 5
  if (lang === "en-us") score += 4
  if (lang === "en-gb") score += 3
  if (name.includes("natural")) score += 6
  if (name.includes("neural")) score += 6
  if (name.includes("enhanced")) score += 5
  if (name.includes("premium")) score += 5
  if (name.includes("aria")) score += 6
  if (name.includes("jenny")) score += 6
  if (name.includes("guy")) score += 4
  if (name.includes("samantha")) score += 5
  if (name.includes("ava")) score += 4
  if (name.includes("serena")) score += 4
  if (name.includes("google")) score += 3
  if (name.includes("microsoft")) score += 2

  return score
}

function pickPreferredVoice(voices: SpeechSynthesisVoice[]) {
  const englishVoices = voices.filter((voice) => voice.lang.toLowerCase().startsWith("en"))
  if (englishVoices.length === 0) return null

  return [...englishVoices].sort((left, right) => scoreVoice(right) - scoreVoice(left))[0] ?? null
}

function splitSpeechText(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim()
  if (!normalized) return []

  const rawSegments = normalized.match(/[^.!?;:,]+[.!?;:,]?/g) ?? [normalized]
  const segments: string[] = []

  for (const segment of rawSegments) {
    const trimmed = segment.trim()
    if (!trimmed) continue

    if (trimmed.length <= 120) {
      segments.push(trimmed)
      continue
    }

    const words = trimmed.split(" ")
    let current = ""
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word
      if (candidate.length > 120 && current) {
        segments.push(current)
        current = word
      } else {
        current = candidate
      }
    }
    if (current) {
      segments.push(current)
    }
  }

  return segments
}

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

function getStudyViewLabel(view: StudyView) {
  switch (view) {
    case "favorites":
      return "收藏"
    case "weak":
      return "弱项"
    case "recent_failures":
      return "最近失误"
    case "all":
    default:
      return "全部"
  }
}

function getPlanStatusLabel(status: StudyLibrary["planStatus"]) {
  switch (status) {
    case "active":
      return "进行中"
    case "paused":
      return "已暂停"
    case "completed":
      return "已完成"
    case "not_started":
    default:
      return "未开始"
  }
}

function shouldHighlightPriority(reason: StudyBatchItem["priorityReason"]) {
  return reason === "leech_due" || reason === "overdue" || reason === "weak_due"
}

function getSentenceHelpItemSourceLabel(source: SentenceHelpItem["source"]) {
  switch (source) {
    case "dictionary_example":
      return "词库例句"
    case "ai":
    default:
      return "AI生成"
  }
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
    grammar: { label: "语法", color: "text-red-400 bg-red-500/10 border-red-500/20" },
    word_usage: { label: "用词", color: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
    naturalness: { label: "自然度", color: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
    spelling: { label: "拼写", color: "text-purple-400 bg-purple-500/10 border-purple-500/20" },
  }

  const c = config[type] || config.grammar
  return <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border ${c.color}`}>{c.label}</span>
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
  libraries,
  initialLibrarySlug,
}: {
  initialBatch: StudyBatchItem[]
  initialFavoriteWordIds: string[]
  libraries: StudyLibrary[]
  initialLibrarySlug: string
}) {
  const [currentWord, setCurrentWord] = useState<StudyBatchItem | null>(initialBatch[0] ?? null)
  const [queuedWords, setQueuedWords] = useState<StudyBatchItem[]>(initialBatch.slice(1))
  const [sentence, setSentence] = useState("")
  const [status, setStatus] = useState<"idle" | "submitting" | "result">("idle")
  const [submissionMode, setSubmissionMode] = useState<SubmissionMode>("scheduled")
  const [result, setResult] = useState<SubmissionResult | null>(null)
  const [streamPhase, setStreamPhase] = useState<StreamPhase>("idle")
  const [streamProgressChars, setStreamProgressChars] = useState(0)
  const [streamSections, setStreamSections] = useState<VisibleFeedbackSections>(EMPTY_VISIBLE_FEEDBACK)
  const [showSentenceHelp, setShowSentenceHelp] = useState(false)
  const [librarySlug, setLibrarySlug] = useState<string>(initialLibrarySlug)
  const [studyView, setStudyView] = useState<StudyView>("all")
  const [favoriteWordIds, setFavoriteWordIds] = useState<string[]>(initialFavoriteWordIds)
  const [favoritePending, setFavoritePending] = useState(false)
  const [loadingNext, setLoadingNext] = useState(false)
  const [refillingQueue, setRefillingQueue] = useState(false)
  const [skippedWordIds, setSkippedWordIds] = useState<string[]>([])
  const [showSettings, setShowSettings] = useState(false)
  const [speechConfig, setSpeechConfig] = useState<SpeechConfig>(DEFAULT_SPEECH_CONFIG)
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([])
  const [mounted, setMounted] = useState(false)
  const [sentenceHelpItems, setSentenceHelpItems] = useState<SentenceHelpItem[]>([])
  const [sentenceHelpState, setSentenceHelpState] = useState<SentenceHelpState>("idle")
  const [sentenceHelpSourceLabel, setSentenceHelpSourceLabel] = useState("")

  const queueContextRef = useRef(0)
  const requeuedNewWordIdsRef = useRef<Set<string>>(new Set())
  const speechConfigRef = useRef<SpeechConfig>(DEFAULT_SPEECH_CONFIG)
  const activeSpeechTokenRef = useRef(0)
  const sentenceInputRef = useRef<HTMLTextAreaElement | null>(null)
  const sentenceHelpCacheRef = useRef<Record<string, SentenceHelpResult>>({})
  const selectedLibrary =
    libraries.find((item) => item.slug === librarySlug) ?? null

  const updateSpeechConfig = (updater: (current: SpeechConfig) => SpeechConfig) => {
    setSpeechConfig((current) => {
      const next = updater(current)
      speechConfigRef.current = next
      return next
    })
  }

  useEffect(() => {
    setMounted(true)
    const saved = localStorage.getItem(SPEECH_CONFIG_STORAGE_KEY)
    if (saved) {
      try {
        const parsed = normalizeSpeechConfig(JSON.parse(saved))
        speechConfigRef.current = parsed
        setSpeechConfig(parsed)
      } catch {
        speechConfigRef.current = DEFAULT_SPEECH_CONFIG
        setSpeechConfig(DEFAULT_SPEECH_CONFIG)
      }
    }
  }, [])

  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      return
    }

    const synth = window.speechSynthesis

    const loadVoices = () => {
      const voices = synth.getVoices()
      const englishVoices = voices.filter((voice) => voice.lang.toLowerCase().startsWith("en"))
      setAvailableVoices(englishVoices)

      const preferredVoice = pickPreferredVoice(englishVoices)
      if (!preferredVoice) {
        return
      }

      const currentConfig = speechConfigRef.current
      const hasMatchingVoice =
        currentConfig.voiceURI &&
        englishVoices.some((voice) => voice.voiceURI === currentConfig.voiceURI)

      if (hasMatchingVoice) {
        return
      }

      updateSpeechConfig((current) => ({
        ...current,
        voiceURI: preferredVoice.voiceURI,
      }))
    }

    loadVoices()
    synth.addEventListener?.("voiceschanged", loadVoices)
    synth.onvoiceschanged = loadVoices

    return () => {
      synth.cancel()
      activeSpeechTokenRef.current += 1
      synth.onvoiceschanged = null
      synth.removeEventListener?.("voiceschanged", loadVoices)
    }
  }, [])

  useEffect(() => {
    if (!showSentenceHelp || !currentWord) {
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
  }, [showSentenceHelp, currentWord])

  const playAudio = (text: string) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return
    const config = speechConfigRef.current
    const synth = window.speechSynthesis
    const voice =
      availableVoices.find((item) => item.voiceURI === config.voiceURI) ??
      pickPreferredVoice(availableVoices)
    const segments = splitSpeechText(text)

    if (segments.length === 0) {
      return
    }

    activeSpeechTokenRef.current += 1
    const token = activeSpeechTokenRef.current
    synth.cancel()

    const speakSegment = (index: number) => {
      if (token !== activeSpeechTokenRef.current || index >= segments.length) {
        return
      }

      const utterance = new SpeechSynthesisUtterance(segments[index])
      utterance.lang = voice?.lang || "en-US"
      utterance.rate = config.ttsRate
      utterance.pitch = config.ttsPitch
      if (voice) {
        utterance.voice = voice
      }
      utterance.onend = () => {
        speakSegment(index + 1)
      }
      utterance.onerror = () => {
        activeSpeechTokenRef.current += 1
      }
      synth.speak(utterance)
    }

    speakSegment(0)
  }

  const applySentenceHelp = (text: string) => {
    setSentence(text)
    setShowSentenceHelp(false)

    requestAnimationFrame(() => {
      const input = sentenceInputRef.current
      if (!input) return
      input.focus()
      input.setSelectionRange(text.length, text.length)
    })
  }

  const fetchBatch = async (
    nextLibrarySlug: string,
    nextStudyView: StudyView,
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
      librarySlug: nextLibrarySlug,
      studyView: nextStudyView,
      skippedWordIds: excludedWordIds,
      batchSize,
    })
  }

  const applyBatch = (batch: StudyBatchItem[]) => {
    setCurrentWord(batch[0] ?? null)
    setQueuedWords(batch.slice(1))
  }

  const reloadStudyBatch = async (
    nextLibrarySlug = librarySlug,
    nextStudyView = studyView,
    nextSkippedWordIds = skippedWordIds
  ) => {
    queueContextRef.current += 1
    const context = queueContextRef.current
    setLoadingNext(true)
    try {
      const batch = await fetchBatch(nextLibrarySlug, nextStudyView, nextSkippedWordIds, null, [])
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
          librarySlug,
          studyView,
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
  }, [currentWord, queuedWords, librarySlug, studyView, skippedWordIds])

  const submitCurrentSentence = async (mode: SubmissionMode = submissionMode) => {
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

      if (
        mode === "scheduled" &&
        currentWord.isNew &&
        !requeuedNewWordIdsRef.current.has(currentWord.word_id)
      ) {
        const insertOffset = submission.evaluation.score < 75 ? 1 : 3
        requeuedNewWordIdsRef.current.add(currentWord.word_id)
        setQueuedWords((existingQueue) => {
          if (existingQueue.some((item) => item.word_id === currentWord.word_id)) {
            return existingQueue
          }

          const requeuedWord: StudyBatchItem = {
            ...currentWord,
            id: submission.userWordId ?? currentWord.id,
            userWordId: submission.userWordId,
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

  const handleRewrite = () => {
    const nextSentence =
      result?.evaluation.correctedSentence ||
      result?.evaluation.polishedSentence ||
      sentence

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
      { preserveSentence: true }
    )
    setSubmissionMode("practice")
    setSentence(nextSentence)

    requestAnimationFrame(() => {
      const input = sentenceInputRef.current
      if (!input) return
      input.focus()
      input.setSelectionRange(nextSentence.length, nextSentence.length)
    })
  }

  const handleNext = async (
    nextLibrarySlug = librarySlug,
    isSkipping = false,
    nextStudyView = studyView
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
      setSubmissionMode("scheduled")
      setCurrentWord(nextWord)
      setQueuedWords(restQueue)
      return
    }

    setSubmissionMode("scheduled")
    await reloadStudyBatch(nextLibrarySlug, nextStudyView, nextSkippedWordIds)
  }

  const handleLibraryChange = async (event: React.ChangeEvent<HTMLSelectElement>) => {
    const nextLibrarySlug = event.target.value
    setLibrarySlug(nextLibrarySlug)
    setSkippedWordIds([])
    requeuedNewWordIdsRef.current.clear()
    setSubmissionMode("scheduled")
    resetViewState({
      setSentence,
      setResult,
      setStatus,
      setStreamPhase,
      setStreamProgressChars,
      setStreamSections,
      setShowSentenceHelp,
    })
    await reloadStudyBatch(nextLibrarySlug, studyView, [])
  }

  const handleStudyModeChange = async (event: React.ChangeEvent<HTMLSelectElement>) => {
    const nextStudyView = event.target.value as StudyView
    setStudyView(nextStudyView)
    setSkippedWordIds([])
    requeuedNewWordIdsRef.current.clear()
    setSubmissionMode("scheduled")
    resetViewState({
      setSentence,
      setResult,
      setStatus,
      setStreamPhase,
      setStreamProgressChars,
      setStreamSections,
      setShowSentenceHelp,
    })
    await reloadStudyBatch(librarySlug, nextStudyView, [])
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
      if (studyView === "favorites" && !updatedFavorites.includes(currentWord.word_id)) {
        await handleNext(librarySlug, false, studyView)
      }
    } catch (error) {
      console.error(error)
      alert(error instanceof Error ? error.message : "收藏更新失败。")
    } finally {
      setFavoritePending(false)
    }
  }

  const renderStreamingPreview = () => {
    if (status !== "submitting") {
      return null
    }

    const previewBlocks: Array<{
      key: keyof VisibleFeedbackSections
      title: string
      placeholder: string
    }> = [
      { key: "overall", title: "总体判断", placeholder: "AI 正在形成整体结论..." },
      { key: "issue", title: "主要问题", placeholder: "AI 正在定位最关键的问题..." },
      { key: "tip", title: "改进建议", placeholder: "AI 正在生成可执行建议..." },
      { key: "progress", title: "历史对比", placeholder: "AI 正在结合历史记录做对比..." },
    ]
    const hasAnyPreview = previewBlocks.some((block) => Boolean(streamSections[block.key]))

    const phaseLabel =
      streamPhase === "connecting"
        ? "正在连接模型..."
        : streamPhase === "structuring"
          ? "正在整理结构化评分..."
          : "AI 正在实时分析你的句子"

    const phaseHint =
      streamPhase === "structuring"
        ? "文字点评已经生成，接下来会整理成最终评分卡。"
        : "这部分内容是边生成边显示的，不需要等到整段结束。"

    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        className="glass-panel w-full rounded-3xl p-6 sm:p-7 border border-blue-500/15 bg-gradient-to-br from-blue-500/[0.05] to-cyan-500/[0.03]"
      >
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-blue-300/70 font-semibold">Live Feedback</p>
            <h3 className="text-lg font-semibold text-white mt-2">{phaseLabel}</h3>
            <p className="text-sm text-zinc-400 mt-1">{phaseHint}</p>
          </div>
          <div className="shrink-0 rounded-full border border-blue-400/20 bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-300">
            {streamProgressChars > 0 ? `${streamProgressChars} chars` : "waiting"}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {previewBlocks.map((block, index) => (
            <motion.div
              key={block.key}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="rounded-2xl border border-white/8 bg-black/30 p-4 min-h-28"
            >
              <p className="text-xs font-semibold tracking-[0.18em] uppercase text-blue-300/75 mb-3">
                {block.title}
              </p>
              {streamSections[block.key] ? (
                <p className="whitespace-pre-wrap text-sm leading-7 text-zinc-200">
                  {streamSections[block.key]}
                </p>
              ) : (
                <p className="text-sm leading-7 text-zinc-500">{block.placeholder}</p>
              )}
            </motion.div>
          ))}
        </div>

        {!hasAnyPreview && (
          <motion.p
            animate={{ opacity: [0.45, 1, 0.45] }}
            transition={{ duration: 1.6, repeat: Infinity }}
            className="text-sm leading-7 text-zinc-500 mt-4"
          >
            AI 已收到你的句子，正在生成第一轮分析...
          </motion.p>
        )}
      </motion.div>
    )
  }

  const renderEvaluation = (evaluation: EvaluationResult) => (
    <div className="space-y-4">
      <div className="space-y-2.5">
        <SubScoreBar label="语法" score={evaluation.grammarScore} color="bg-gradient-to-r from-blue-500 to-blue-400" />
        <SubScoreBar label="用词" score={evaluation.wordUsageScore} color="bg-gradient-to-r from-emerald-500 to-emerald-400" />
        <SubScoreBar label="自然度" score={evaluation.naturalness} color="bg-gradient-to-r from-purple-500 to-purple-400" />
      </div>

      {evaluation.correctedSentence && evaluation.correctedSentence !== sentence && (
        <motion.div
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="p-4 rounded-xl bg-emerald-500/[0.06] border border-emerald-500/[0.12]"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-xs text-emerald-400 font-medium">
              <PenLine className="w-3 h-3" />
              修正后的句子
            </div>
            <button type="button" onClick={() => playAudio(evaluation.correctedSentence)} className="text-emerald-400/60 hover:text-emerald-400 transition-colors p-1" title="朗读句子">
              <Volume2 className="w-4 h-4" />
            </button>
          </div>
          <p className="text-sm text-emerald-200 italic leading-relaxed">&quot;{evaluation.correctedSentence}&quot;</p>
          {evaluation.correctedSentenceMeaning && (
            <p className="mt-2 text-xs leading-6 text-emerald-100/80">
              中文释义：{evaluation.correctedSentenceMeaning}
            </p>
          )}
        </motion.div>
      )}

      {evaluation.errors.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className="space-y-2"
        >
          {evaluation.errors.map((err, i) => (
            <div key={i} className="p-3 rounded-xl bg-red-500/[0.04] border border-red-500/[0.1] flex gap-3">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <ErrorTag type={err.type} />
                  <span className="text-xs text-zinc-500">
                    <span className="line-through text-red-400/70">{err.original}</span>
                    <span className="mx-1.5">→</span>
                    <span className="text-emerald-400">{err.correction}</span>
                  </span>
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed">{err.explanation}</p>
              </div>
            </div>
          ))}
        </motion.div>
      )}

      {evaluation.praise && (
        <motion.div
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
          className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] flex gap-3"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <p className="text-sm text-zinc-300 leading-relaxed">{evaluation.praise}</p>
        </motion.div>
      )}

      {evaluation.suggestion && (
        <motion.div
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9 }}
          className="p-3 rounded-xl bg-amber-500/[0.04] border border-amber-500/[0.1] flex gap-3"
        >
          <Lightbulb className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-sm text-zinc-300 leading-relaxed">{evaluation.suggestion}</p>
        </motion.div>
      )}

      {(evaluation.advancedExpressions.length > 0 || evaluation.polishedSentence) && (
        <motion.div
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.0 }}
          className="rounded-2xl bg-gradient-to-br from-indigo-500/[0.06] to-purple-500/[0.04] border border-indigo-500/[0.12] overflow-hidden"
        >
          <div className="px-4 py-3 border-b border-indigo-500/[0.08] bg-indigo-500/[0.04] flex items-center gap-2">
            <GraduationCap className="w-4 h-4 text-indigo-400" />
            <span className="text-xs font-semibold text-indigo-300 tracking-wide">高阶润色</span>
            <span className="text-[10px] text-indigo-400/60 ml-auto">学习更地道的表达</span>
          </div>

          <div className="p-4 space-y-3">
            {evaluation.advancedExpressions.map((expr, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -5 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 1.1 + i * 0.1 }}
                className="p-3 rounded-xl bg-black/20 border border-white/[0.04] space-y-2"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-zinc-400 bg-white/[0.04] px-2 py-0.5 rounded font-mono">{expr.original}</span>
                  <span className="text-zinc-600">→</span>
                  <span className="text-sm font-semibold text-indigo-300 bg-indigo-500/10 px-2 py-0.5 rounded">{expr.advanced}</span>
                </div>
                {(expr.originalMeaning || expr.advancedMeaning) && (
                  <p className="text-xs leading-6 text-zinc-500">
                    {expr.originalMeaning ? `原表达：${expr.originalMeaning}` : ""}
                    {expr.originalMeaning && expr.advancedMeaning ? " | " : ""}
                    {expr.advancedMeaning ? `更地道表达：${expr.advancedMeaning}` : ""}
                  </p>
                )}
                <p className="text-xs text-zinc-400 leading-relaxed">{expr.explanation}</p>
                {expr.example && (
                  <div className="flex items-start justify-between gap-2 pl-3 border-l-2 border-indigo-500/20">
                    <div className="space-y-1">
                      <p className="text-xs text-zinc-500 italic">
                        {expr.example}
                      </p>
                      {expr.exampleMeaning && (
                        <p className="text-xs leading-6 text-zinc-600">
                          中文释义：{expr.exampleMeaning}
                        </p>
                      )}
                    </div>
                    <button type="button" onClick={() => playAudio(expr.example)} className="text-indigo-400/50 hover:text-indigo-400 shrink-0 p-0.5" title="朗读例句">
                      <Volume2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </motion.div>
            ))}

            {evaluation.polishedSentence && (
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.3 }}
                className="p-4 rounded-xl bg-gradient-to-r from-indigo-500/[0.06] to-purple-500/[0.06] border border-indigo-500/[0.1]"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Wand2 className="w-3.5 h-3.5 text-purple-400" />
                    <span className="text-xs font-medium text-purple-300">母语者级润色</span>
                  </div>
                  <button type="button" onClick={() => playAudio(evaluation.polishedSentence)} className="text-purple-400/60 hover:text-purple-400 transition-colors p-1" title="朗读句子">
                    <Volume2 className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-sm text-indigo-200 italic leading-relaxed">
                  &quot;{evaluation.polishedSentence}&quot;
                </p>
                {evaluation.polishedSentenceMeaning && (
                  <p className="mt-2 text-xs leading-6 text-indigo-100/75">
                    中文释义：{evaluation.polishedSentenceMeaning}
                  </p>
                )}
              </motion.div>
            )}
          </div>
        </motion.div>
      )}
    </div>
  )

  if (!currentWord) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <select
              value={librarySlug}
              onChange={handleLibraryChange}
              className="rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-sm text-zinc-200"
            >
              <option value="all">全部词库</option>
              {libraries.map((item) => (
                <option key={item.id} value={item.slug}>
                  {item.name}
                </option>
              ))}
            </select>
            <select
              value={studyView}
              onChange={handleStudyModeChange}
              className="rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-sm text-zinc-200"
            >
              <option value="all">全部单词</option>
              <option value="favorites">收藏</option>
              <option value="weak">弱项</option>
              <option value="recent_failures">最近失误</option>
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
            当前条件下没有可学习的单词了。
          </div>
        </div>
    )
  }

  const evaluation: EvaluationResult | null = result?.evaluation ?? null
  const isFavorite = favoriteWordIds.includes(currentWord.word_id)

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
                  音色
                </label>
                <select
                  value={speechConfig.voiceURI}
                  onChange={(event) =>
                    updateSpeechConfig((current) => ({
                      ...current,
                      voiceURI: event.target.value,
                    }))
                  }
                  className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-zinc-200"
                >
                  {availableVoices.length === 0 ? (
                    <option value="">当前浏览器还没加载可用英语音色</option>
                  ) : (
                    availableVoices.map((voice) => (
                      <option key={voice.voiceURI} value={voice.voiceURI}>
                        {voice.name} ({voice.lang})
                      </option>
                    ))
                  )}
                </select>
                <p className="text-xs leading-6 text-zinc-500">
                  不同浏览器和系统的音色差异很大。优先选听起来更清晰、停顿更自然的英语音色。
                </p>

                <label className="block text-sm text-zinc-300">
                  语速 {speechConfig.ttsRate.toFixed(1)}x
                </label>
                <input
                  type="range"
                  min="0.6"
                  max="1.4"
                  step="0.1"
                  value={speechConfig.ttsRate}
                  onChange={(event) =>
                    updateSpeechConfig((current) => ({
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
                  max="1.5"
                  step="0.1"
                  value={speechConfig.ttsPitch}
                  onChange={(event) =>
                    updateSpeechConfig((current) => ({
                      ...current,
                      ttsPitch: Number(event.target.value),
                    }))
                  }
                  className="w-full"
                />

                <div className="flex justify-between">
                  <button
                    type="button"
                    onClick={() => playAudio(DEFAULT_PREVIEW_SENTENCE)}
                    className="rounded-md border border-white/10 px-3 py-2 text-sm text-zinc-300"
                  >
                    试听句子
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
            value={librarySlug}
            onChange={handleLibraryChange}
            disabled={loadingNext || status === "submitting"}
            className="rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-sm text-zinc-200"
          >
            <option value="all">全部词库</option>
            {libraries.map((item) => (
              <option key={item.id} value={item.slug}>
                {item.name}
              </option>
            ))}
          </select>
          <select
            value={studyView}
            onChange={handleStudyModeChange}
            disabled={loadingNext || status === "submitting"}
            className="rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-sm text-zinc-200"
          >
            <option value="all">全部单词</option>
            <option value="favorites">收藏</option>
            <option value="weak">弱项</option>
            <option value="recent_failures">最近失误</option>
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
          队列 {queuedWords.length} {(loadingNext || refillingQueue) ? (loadingNext ? "加载中" : "预取中") : ""}
        </div>
      </div>

      <div className="glass-panel rounded-2xl px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-zinc-300">
          <span className="text-zinc-500">词库</span>
          <span className="font-medium text-white">{selectedLibrary?.name ?? "全部词库"}</span>
          <span className="text-zinc-500">视图</span>
          <span>{getStudyViewLabel(studyView)}</span>
          {selectedLibrary ? (
            <>
              <span className="text-zinc-500">计划</span>
              <span>{getPlanStatusLabel(selectedLibrary.planStatus)}</span>
              <span className="text-zinc-500">待复习</span>
              <span>{selectedLibrary.dueCount}</span>
              <span className="text-zinc-500">未学</span>
              <span>{selectedLibrary.remainingCount}</span>
            </>
          ) : (
            <>
              <span className="text-zinc-500">当前队列</span>
              <span>{queuedWords.length + (currentWord ? 1 : 0)}</span>
            </>
          )}
        </div>
      </div>

      <div className={`glass-panel rounded-3xl p-8 ${loadingNext ? "pointer-events-none opacity-50 blur-sm" : ""}`}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex min-h-8 items-center gap-2">
            {shouldHighlightPriority(currentWord.priorityReason) ? (
              <span className="rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-300">
                {getPriorityLabel(currentWord.priorityReason)}
              </span>
            ) : null}
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
          <div className="min-w-0">
            <div className="flex items-center gap-4">
              <h1 className="text-5xl font-extrabold text-white">{currentWord.words.word}</h1>
              <button
                type="button"
                onClick={() => playAudio(currentWord.words.word)}
                className="text-zinc-500 transition-colors hover:text-blue-400"
              >
                <Volume2 className="h-6 w-6" />
              </button>
            </div>
            {currentWord.words.phonetic ? (
              <p className="mt-2 text-base font-medium tracking-[0.08em] text-blue-200/80">
                {currentWord.words.phonetic}
              </p>
            ) : null}
          </div>
        </div>

        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 text-zinc-300">
          <p className="flex items-start gap-3">
            <BookOpen className="mt-1 h-5 w-5 shrink-0 text-blue-400/70" />
            <span>{currentWord.words.definition}</span>
          </p>
        </div>

        {currentWord.words.tags ? (
          <p className="mt-3 text-xs text-zinc-500">标签：{currentWord.words.tags}</p>
        ) : null}
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
            ref={sentenceInputRef}
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
              onClick={() => handleNext(librarySlug, true)}
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
                  {submissionMode === "practice" ? "提交重写" : "提交"}
                </>
              )}
            </button>
          </div>
        </form>
      )}

      {showSentenceHelp && (
        <div className="glass-panel rounded-3xl border border-amber-500/15 bg-amber-500/[0.05] p-6 text-sm text-zinc-300">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="font-medium text-white">先填一个最短可用句子</div>
              <p className="mt-1 text-xs text-zinc-400">点任意一条会直接填入输入框，你可以再改。</p>
              {sentenceHelpSourceLabel && (
                <p className="mt-1 text-[11px] tracking-[0.12em] text-amber-300/70">
                  {sentenceHelpSourceLabel}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setShowSentenceHelp(false)}
              className="text-zinc-400"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-2">
            {sentenceHelpState === "loading" && (
              <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-zinc-400">
                正在生成更贴合这个单词的造句提示...
              </div>
            )}

            {sentenceHelpState === "ready" && sentenceHelpItems.length === 0 && (
              <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-zinc-400">
                暂时没有生成到可用提示，直接参考释义先写一个短句也可以。
              </div>
            )}

            {sentenceHelpItems.map((item) => (
              <button
                key={`${currentWord.word_id}-${item.sentence}`}
                type="button"
                onClick={() => applySentenceHelp(item.sentence)}
                className="block w-full rounded-xl border border-white/10 px-3 py-3 text-left hover:bg-white/5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="text-sm leading-relaxed text-zinc-100">{item.sentence}</div>
                  <span className="shrink-0 rounded-full border border-amber-400/20 bg-amber-400/10 px-2 py-1 text-[10px] font-medium text-amber-100">
                    {getSentenceHelpItemSourceLabel(item.source)}
                  </span>
                </div>
                <div className="mt-1 text-xs leading-6 text-amber-200/80">{item.cue}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      <AnimatePresence>{renderStreamingPreview()}</AnimatePresence>

      {status === "result" && result && evaluation && (
        <motion.div
          initial={{ opacity: 0, y: 30, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 30, scale: 0.96 }}
          transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
          className={`glass-panel w-full rounded-3xl p-8 sm:p-10 border-t-0 relative overflow-hidden flex-shrink-0 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.5)] ${
            result.evaluation.score >= 80 ? 'score-glow-green' :
            result.evaluation.score >= 60 ? 'score-glow-yellow' :
            'score-glow-red'
          }`}
        >
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className={`absolute top-0 left-0 right-0 h-1.5 origin-left ${
              result.evaluation.score >= 80 ? 'bg-gradient-to-r from-green-400 via-emerald-500 to-green-600' :
              result.evaluation.score >= 60 ? 'bg-gradient-to-r from-yellow-400 via-amber-500 to-orange-500' :
              'bg-gradient-to-r from-red-400 via-rose-500 to-red-600'
            }`}
          />

          <div className="flex items-start justify-between mb-6 mt-2">
            <div>
              <h3 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-white to-zinc-400 mb-2">AI 评估结果</h3>
              <p className="mb-2 text-[11px] uppercase tracking-[0.18em] text-blue-300/70">
                Eval Model {result.evaluationModelLabel}
              </p>
              {result.reviewImpact === "practice_only" && (
                <p className="mb-2 text-xs text-amber-200/80">
                  本次是重写练习，不影响复习间隔，也不会计入学习记录。
                </p>
              )}
              <p className="text-sm text-zinc-400 italic bg-black/20 p-3 rounded-lg border border-white/5 line-clamp-2">&quot; {sentence} &quot;</p>
            </div>

            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ duration: 0.5, delay: 0.3, type: "spring", stiffness: 200 }}
              className={`flex items-center justify-center shrink-0 h-20 w-20 rounded-full border-[3px] shadow-lg ${
                result.evaluation.score >= 80 ? "border-green-500/40 text-green-400 bg-green-500/10 shadow-green-500/20" :
                result.evaluation.score >= 60 ? "border-yellow-500/40 text-yellow-400 bg-yellow-500/10 shadow-yellow-500/20" :
                "border-red-500/40 text-red-400 bg-red-500/10 shadow-red-500/20"
              }`}
            >
              <AnimatedScore score={result.evaluation.score} />
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="mb-6"
          >
            {renderEvaluation(result.evaluation)}
          </motion.div>

          <div className="flex flex-col sm:flex-row items-center justify-between pt-4 border-t border-white/10 gap-4">
            <div className="flex flex-col text-xs text-zinc-500">
              {result.nextSrs ? (
                <>
                  <span>下次复习：{mounted ? new Date(result.nextSrs.nextReviewDate).toLocaleDateString("zh-CN") : '...'}</span>
                  <span>当前难度系数：{result.nextSrs.easeFactor}</span>
                </>
              ) : (
                <span>重写练习不会改变当前单词的复习安排。</span>
              )}
            </div>
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <button
                type="button"
                onClick={handleRewrite}
                className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-5 py-3 text-sm font-medium text-amber-100 transition-all hover:bg-amber-500/15"
              >
                根据反馈再写一次
              </button>
              <button
                onClick={() => handleNext(librarySlug)}
                className="group flex items-center justify-center gap-2 rounded-xl bg-white/10 px-6 py-3 text-sm font-medium text-white transition-all hover:bg-white/20 w-full sm:w-auto"
              >
                下一个单词
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  )
}
