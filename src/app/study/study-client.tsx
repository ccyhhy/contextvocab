"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Sparkles, ArrowRight, BookOpen, SkipForward, Settings, X, Save, AlertTriangle, CheckCircle2, Lightbulb, PenLine, GraduationCap, Wand2, Volume2, Heart } from "lucide-react"
import {
  EMPTY_VISIBLE_FEEDBACK,
  extractVisibleFeedback,
  parseVisibleFeedbackSections,
  type VisibleFeedbackSections,
} from "@/lib/evaluation-format"
import { submitSentence, getNextWord, type EvaluationResult } from "./actions"

const DEFAULT_SPEECH_CONFIG: SpeechConfig = {
  ttsRate: 1.0,
  ttsPitch: 1.0
}

interface SpeechConfig {
  ttsRate: number
  ttsPitch: number
}

const FAVORITES_STORAGE_KEY = "contextvocab-favorites"
const SPEECH_CONFIG_STORAGE_KEY = "contextvocab-speech-config"

interface StreamEvaluateRequest {
  word: string
  sentence: string
  definition: string
  tags: string
  wordId: string
}

interface StreamEvent {
  content?: string
  error?: string
}

type StreamPhase = "idle" | "connecting" | "feedback" | "structuring"
type StudyMode = "all" | "favorites"

interface WordInfo {
  word: string
  definition?: string | null
  tags?: string | null
  phonetic?: string | null
  example?: string | null
}

interface StudyWord {
  id: string
  word_id: string
  words: WordInfo
}

type SubmissionResult = Awaited<ReturnType<typeof submitSentence>>

type WordPartOfSpeech = "verb" | "noun" | "adjective" | "adverb" | "unknown"

function inferPartOfSpeech(definition?: string | null): WordPartOfSpeech {
  if (!definition) {
    return "unknown"
  }

  const normalized = definition.toLowerCase()
  if (normalized.includes("adj.")) return "adjective"
  if (normalized.includes("adv.")) return "adverb"
  if (normalized.includes("vt.") || normalized.includes("vi.") || normalized.includes("v.")) return "verb"
  if (normalized.includes("n.")) return "noun"
  return "unknown"
}

function buildSentenceStarters(word: string, definition?: string | null): string[] {
  const pos = inferPartOfSpeech(definition)

  switch (pos) {
    case "verb":
      return [
        `I try to ${word} `,
        `We need to ${word} `,
        `It is difficult to ${word} `,
        `People often ${word} when `,
      ]
    case "noun":
      return [
        `The ${word} is important because `,
        `I learned that ${word} can `,
        `This ${word} helps us `,
        `One common example of ${word} is `,
      ]
    case "adjective":
      return [
        `It is ${word} to `,
        `The movie was ${word} because `,
        `I felt ${word} when `,
        `This idea seems ${word} in `,
      ]
    case "adverb":
      return [
        `She spoke ${word} when `,
        `He finished the task ${word} because `,
        `The team worked ${word} to `,
        `I usually respond ${word} if `,
      ]
    default:
      return [
        `I used the word "${word}" when `,
        `In daily life, ${word} can be used to describe `,
        `A simple sentence with ${word} is that `,
        `One situation related to ${word} is `,
      ]
  }
}

function buildScenePrompts(word: string, definition?: string | null): string[] {
  const pos = inferPartOfSpeech(definition)

  switch (pos) {
    case "verb":
      return [
        `想一个“学校或工作”场景，谁在 ${word} 什么？`,
        `想一个“计划失败或成功”的场景，用 ${word} 描述动作。`,
        `把主语换成 I / we / they，再说他们为什么要 ${word}。`,
      ]
    case "noun":
      return [
        `先说这个 ${word} 是什么，再补充它为什么重要。`,
        `想一个你见过的具体例子，用 ${word} 指代它。`,
        `把 ${word} 放进“原因 + 结果”的句子里。`,
      ]
    case "adjective":
      return [
        `先找一个人、事、物，再判断它为什么是 ${word}。`,
        `可以用“be + ${word} + because ...”这个结构。`,
        `想一个你最近真实经历过的情境，会更容易造句。`,
      ]
    case "adverb":
      return [
        `先确定一个动作，再思考这个动作是怎样发生的。`,
        `可以用“动词 + ${word}”描述做事方式。`,
        `想一个说话、做事或反应的场景最容易套用。`,
      ]
    default:
      return [
        `先别追求复杂，先写一个主语，再把 ${word} 放进去。`,
        `优先用你熟悉的场景，比如学校、朋友、日常生活。`,
        `如果卡住，就先写半句，再补原因或结果。`,
      ]
  }
}

async function streamEvaluateSentence(
  payload: StreamEvaluateRequest,
  onChunk?: (chunk: string, fullText: string) => void
): Promise<string> {
  const response = await fetch('/api/evaluate', {
    method: 'POST',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`流式评估失败 (${response.status}): ${errorText.slice(0, 200)}`)
  }

  if (!response.body) {
    throw new Error('流式评估未返回数据')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let eventDataLines: string[] = []
  let fullText = ''
  let receivedDone = false

  const flushEvent = () => {
    if (eventDataLines.length === 0) {
      return
    }

    const data = eventDataLines.join('\n').trim()
    eventDataLines = []
    if (!data) {
      return
    }

    if (data === '[DONE]') {
      receivedDone = true
      return
    }

    try {
      const event = JSON.parse(data) as StreamEvent
      if (typeof event.error === 'string' && event.error) {
        throw new Error(event.error)
      }
      if (typeof event.content === 'string' && event.content) {
        fullText += event.content
        onChunk?.(event.content, fullText)
      }
    } catch (error) {
      if (error instanceof SyntaxError) {
        return
      }
      if (error instanceof Error) {
        throw error
      }
    }
  }

  const consumeLine = (line: string) => {
    if (line === '') {
      flushEvent()
      return
    }

    if (line.startsWith('data:')) {
      eventDataLines.push(line.slice(5).trimStart())
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }

    buffer += decoder.decode(value, { stream: true })
    let newlineIndex = buffer.indexOf('\n')
    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex).replace(/\r$/, '')
      buffer = buffer.slice(newlineIndex + 1)
      consumeLine(line)
      newlineIndex = buffer.indexOf('\n')
    }
  }

  buffer += decoder.decode()
  if (buffer) {
    consumeLine(buffer.replace(/\r$/, ''))
  }
  flushEvent()

  if (!receivedDone || !fullText.trim()) {
    throw new Error('AI 流式返回内容不完整，请重试')
  }

  return fullText
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
      <span className="text-xs text-zinc-500 w-16 shrink-0 text-right">{label}</span>
      <div className="flex-1 h-2 bg-white/[0.06] rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${(score / 5) * 100}%` }}
          transition={{ duration: 0.6, delay: 0.5, ease: "easeOut" }}
          className={`h-full rounded-full ${color}`}
        />
      </div>
      <span className="text-xs text-zinc-400 w-6 font-mono">{score}/5</span>
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

export default function StudyClient({ initialWord }: { initialWord: StudyWord | null }) {
  const [currentWord, setCurrentWord] = useState<StudyWord | null>(initialWord)
  const [sentence, setSentence] = useState("")
  const [status, setStatus] = useState<"idle" | "submitting" | "result">("idle")
  const [result, setResult] = useState<SubmissionResult | null>(null)
  const [streamProgressChars, setStreamProgressChars] = useState(0)
  const [streamSections, setStreamSections] = useState<VisibleFeedbackSections>(EMPTY_VISIBLE_FEEDBACK)
  const [streamPhase, setStreamPhase] = useState<StreamPhase>("idle")
  const [showExample, setShowExample] = useState(false)
  const [showSentenceHelp, setShowSentenceHelp] = useState(false)
  const [library, setLibrary] = useState<"All" | "CET-4" | "CET-6">("All")
  const [studyMode, setStudyMode] = useState<StudyMode>("all")
  const [favoriteWordIds, setFavoriteWordIds] = useState<string[]>([])
  const [loadingNext, setLoadingNext] = useState(false)
  const [skippedWordIds, setSkippedWordIds] = useState<string[]>([])
  const [wordKey, setWordKey] = useState(0)

  const playAudio = (text: string) => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = "en-US"
      if (speechConfig.ttsRate) utterance.rate = speechConfig.ttsRate
      if (speechConfig.ttsPitch) utterance.pitch = speechConfig.ttsPitch
      
      // Try to find a good English voice if available
      const voices = window.speechSynthesis.getVoices()
      const enVoices = voices.filter(v => v.lang.startsWith('en-'))
      if (enVoices.length > 0) {
        // Prefer US English female voices if possible, otherwise just any English voice
        const preferred = enVoices.find(v => v.name.includes('Google') && v.lang === 'en-US') || enVoices[0]
        utterance.voice = preferred
      }
      
      window.speechSynthesis.speak(utterance)
    }
  }

  // Settings State
  const [showSettings, setShowSettings] = useState(false)
  const [speechConfig, setSpeechConfig] = useState<SpeechConfig>(DEFAULT_SPEECH_CONFIG)
  const [mounted, setMounted] = useState(false)
  
  useEffect(() => {
    setMounted(true)
    const saved = localStorage.getItem(SPEECH_CONFIG_STORAGE_KEY)
    if (saved) {
      try {
        setSpeechConfig(JSON.parse(saved))
      } catch (e) {
        console.error("Failed to parse saved speech config", e)
      }
    }
  }, [])

  useEffect(() => {
    const savedFavorites = localStorage.getItem(FAVORITES_STORAGE_KEY)
    if (!savedFavorites) {
      return
    }

    try {
      const parsed = JSON.parse(savedFavorites)
      if (Array.isArray(parsed)) {
        setFavoriteWordIds(parsed.filter((value): value is string => typeof value === "string"))
      }
    } catch (error) {
      console.error("Failed to parse favorites", error)
    }
  }, [])

  const handleSaveSettings = () => {
    localStorage.setItem(SPEECH_CONFIG_STORAGE_KEY, JSON.stringify(speechConfig))
    setShowSettings(false)
  }

  const getPreferredWordIds = (mode: StudyMode) => (mode === "favorites" ? favoriteWordIds : [])

  const updateFavorites = (updater: (current: string[]) => string[]) => {
    setFavoriteWordIds((current) => {
      const next = updater(current)
      localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }

  const submitCurrentSentence = async () => {
    if (!sentence.trim()) {
      alert("请先写一个句子再提交。")
      return
    }
    if (!currentWord) {
      return
    }

    setStatus("submitting")
    setStreamProgressChars(0)
    setStreamSections(EMPTY_VISIBLE_FEEDBACK)
    setStreamPhase("connecting")
    try {
      const wordData = currentWord.words
      let streamedContent: string | null = null

      try {
        streamedContent = await streamEvaluateSentence(
          {
            word: wordData.word,
            sentence,
            definition: wordData.definition || '',
            tags: wordData.tags || '',
            wordId: currentWord.word_id,
          },
          (_, fullText) => {
            setStreamProgressChars(fullText.length)
            const visibleFeedback = extractVisibleFeedback(fullText)
            setStreamSections(parseVisibleFeedbackSections(visibleFeedback.feedback))
            setStreamPhase(visibleFeedback.hasJsonStart ? "structuring" : "feedback")
          }
        )
      } catch (streamError) {
        // Graceful fallback to non-streaming server-side evaluation.
        console.error('Streaming evaluation failed, falling back:', streamError)
        streamedContent = null
        setStreamSections(EMPTY_VISIBLE_FEEDBACK)
        setStreamPhase("idle")
      }

      const res = await submitSentence(
        currentWord.id,
        currentWord.word_id,
        wordData.word,
        wordData.definition || '',
        wordData.tags || '',
        sentence,
        streamedContent
      )
      setResult(res)
      setStatus("result")
    } catch (err) {
      console.error(err)
      alert("AI 评估出错了，请检查服务端环境变量或网络连接。")
      setStatus("idle")
    } finally {
      setStreamProgressChars(0)
      setStreamPhase("idle")
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await submitCurrentSentence()
  }

  const handleNext = async (
    targetLibrary = library,
    isSkipping = false,
    targetMode = studyMode
  ) => {
    setLoadingNext(true)
    setSentence("")
    setResult(null)
    setStreamProgressChars(0)
    setStreamSections(EMPTY_VISIBLE_FEEDBACK)
    setStreamPhase("idle")
    setStatus("idle")
    setShowExample(false)
    setShowSentenceHelp(false)
    
    let updatedSkippedList = [...skippedWordIds]
    if (isSkipping && currentWord) {
      updatedSkippedList = [...skippedWordIds, currentWord.word_id]
      setSkippedWordIds(updatedSkippedList)
    }

    try {
      const next = await getNextWord(targetLibrary, updatedSkippedList, getPreferredWordIds(targetMode))
      setCurrentWord(next)
      setWordKey(k => k + 1)
    } catch (err) {
      console.error(err)
      alert("获取下一个单词失败。")
    } finally {
      setLoadingNext(false)
    }
  }

  const handleLibraryChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newLib = e.target.value as "All" | "CET-4" | "CET-6"
    setLibrary(newLib)
    setSkippedWordIds([])
    
    setLoadingNext(true)
    try {
      const next = await getNextWord(newLib, [], getPreferredWordIds(studyMode))
      setCurrentWord(next)
      setWordKey(k => k + 1)
      setSentence("")
      setResult(null)
      setStreamProgressChars(0)
      setStreamSections(EMPTY_VISIBLE_FEEDBACK)
      setStreamPhase("idle")
      setStatus("idle")
      setShowExample(false)
      setShowSentenceHelp(false)
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingNext(false)
    }
  }

  const handleStudyModeChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextMode = e.target.value as StudyMode
    setStudyMode(nextMode)
    setSkippedWordIds([])

    setLoadingNext(true)
    try {
      const next = await getNextWord(library, [], getPreferredWordIds(nextMode))
      setCurrentWord(next)
      setWordKey((k) => k + 1)
      setSentence("")
      setResult(null)
      setStreamProgressChars(0)
      setStreamSections(EMPTY_VISIBLE_FEEDBACK)
      setStreamPhase("idle")
      setStatus("idle")
      setShowExample(false)
      setShowSentenceHelp(false)
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingNext(false)
    }
  }

  // Controls bar
const renderControls = () => (
    <div className="flex items-center gap-3 w-full justify-between mb-4">
      <div className="flex items-center gap-2 flex-wrap">
        <label className="text-sm text-zinc-400 font-medium">词库：</label>
        <select 
          value={library}
          onChange={handleLibraryChange}
          disabled={loadingNext || status === "submitting"}
          className="bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-zinc-200 outline-none focus:border-blue-500/50 disabled:opacity-50"
        >
          <option value="All">全部词库</option>
          <option value="CET-4">四级</option>
          <option value="CET-6">六级</option>
        </select>

        <select
          value={studyMode}
          onChange={handleStudyModeChange}
          disabled={loadingNext || status === "submitting"}
          className="bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-zinc-200 outline-none focus:border-blue-500/50 disabled:opacity-50"
        >
          <option value="all">全部单词</option>
          <option value="favorites">仅看收藏</option>
        </select>
        
        <button
          onClick={() => setShowSettings(true)}
          className="ml-2 p-1.5 text-zinc-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors flex items-center gap-2"
          title="朗读设置"
        >
          <Settings className="w-4 h-4" />
          <span className="text-xs font-medium hidden sm:inline">朗读设置</span>
        </button>
      </div>
      {loadingNext && <span className="text-xs tracking-wider text-blue-400 animate-pulse uppercase font-semibold">加载中...</span>}
    </div>
  )

const settingsModalJsx = showSettings && (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="bg-[#0f0f13] border border-white/10 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between p-4 border-b border-white/10 bg-white/5">
          <h3 className="font-semibold text-white flex items-center gap-2">
            <Settings className="w-4 h-4 text-blue-400" />
            朗读设置
          </h3>
          <button onClick={() => setShowSettings(false)} className="text-zinc-400 hover:text-white transition-colors p-1">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <p className="text-sm text-zinc-300 leading-6">
              AI 模型配置已改为服务端环境变量管理。
            </p>
            <p className="text-xs text-zinc-500 leading-6">
              本地开发请修改 <code>.env.local</code>，部署到 Vercel 后请在项目环境变量里设置
              <code> OPENAI_API_KEY </code>
              <code> OPENAI_API_BASE </code>
              和 <code>OPENAI_MODEL</code>。
            </p>
          </div>
          
          <div className="h-px bg-white/10 my-1"></div>
          
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">语音语速 (Rate)</label>
              <span className="text-xs text-zinc-500 font-mono">{speechConfig.ttsRate.toFixed(1)}x</span>
            </div>
            <input
              type="range"
              min="0.5"
              max="2.0"
              step="0.1"
              value={speechConfig.ttsRate}
              onChange={e => setSpeechConfig({...speechConfig, ttsRate: parseFloat(e.target.value)})}
              className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-500 hover:accent-blue-400"
            />
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">语音语调 (Pitch)</label>
              <span className="text-xs text-zinc-500 font-mono">{speechConfig.ttsPitch.toFixed(1)}</span>
            </div>
            <input
              type="range"
              min="0.5"
              max="2.0"
              step="0.1"
              value={speechConfig.ttsPitch}
              onChange={e => setSpeechConfig({...speechConfig, ttsPitch: parseFloat(e.target.value)})}
              className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-500 hover:accent-blue-400"
            />
          </div>
          
          <div className="flex justify-end pt-2">
            <button 
              type="button" 
              onClick={() => playAudio("This is a test to check the voice settings.")}
              className="text-xs px-3 py-1.5 rounded-md bg-white/5 hover:bg-white/10 text-zinc-300 transition-colors flex items-center gap-1.5 border border-white/5"
            >
              <Volume2 className="w-3.5 h-3.5" /> 试听声音
            </button>
          </div>
        </div>
        <div className="p-4 border-t border-white/10 bg-white/5 flex justify-end">
          <button
            onClick={handleSaveSettings}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <Save className="w-4 h-4" /> 保存设置
          </button>
        </div>
      </motion.div>
    </div>
  )

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

  // Render the rich evaluation result
  const renderEvaluation = (evaluation: EvaluationResult) => (
    <div className="space-y-4">
      {/* Sub-scores */}
      <div className="space-y-2.5">
        <SubScoreBar label="语法" score={evaluation.grammarScore} color="bg-gradient-to-r from-blue-500 to-blue-400" />
        <SubScoreBar label="用词" score={evaluation.wordUsageScore} color="bg-gradient-to-r from-emerald-500 to-emerald-400" />
        <SubScoreBar label="自然度" score={evaluation.naturalness} color="bg-gradient-to-r from-purple-500 to-purple-400" />
      </div>

      {/* Corrected sentence */}
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
        </motion.div>
      )}

      {/* Errors */}
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

      {/* Praise */}
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

      {/* Suggestion */}
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

      {/* Advanced Expressions — 高阶润色 */}
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
            {/* Vocabulary upgrades */}
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
                <p className="text-xs text-zinc-400 leading-relaxed">{expr.explanation}</p>
                {expr.example && (
                  <div className="flex items-start justify-between gap-2 pl-3 border-l-2 border-indigo-500/20">
                    <p className="text-xs text-zinc-500 italic">
                      {expr.example}
                    </p>
                    <button type="button" onClick={() => playAudio(expr.example)} className="text-indigo-400/50 hover:text-indigo-400 shrink-0 p-0.5" title="朗读例句">
                      <Volume2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </motion.div>
            ))}

            {/* Polished sentence */}
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
              </motion.div>
            )}
          </div>
        </motion.div>
      )}
    </div>
  )

  if (!currentWord) {
    return (
      <div className="flex flex-col items-center justify-center w-full max-w-2xl mx-auto">
        <AnimatePresence>{settingsModalJsx}</AnimatePresence>
        {renderControls()}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass-panel w-full p-12 rounded-2xl text-center flex flex-col items-center justify-center"
        >
          <Sparkles className="h-12 w-12 text-yellow-500 mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">
            {studyMode === "favorites" ? "收藏夹里暂时没有可学习单词" : "全部完成！"}
          </h2>
          <p className="text-zinc-400 mb-6">
            {studyMode === "favorites"
              ? "你可以先把常错、常忘或者想重点记的单词加入收藏，再回来集中刷。"
              : "当前词库暂时没有待复习的单词了。"}
          </p>
          <button 
            onClick={() => handleNext(library, false, studyMode)}
            className="rounded-xl bg-white/10 px-6 py-3 text-sm font-medium text-white transition-all hover:bg-white/20"
          >
            刷新 / 换一个
          </button>
        </motion.div>
      </div>
    )
  }

  const wordData = currentWord.words
  const isFavorite = favoriteWordIds.includes(currentWord.word_id)
  const sentenceStarters = buildSentenceStarters(wordData.word, wordData.definition)
  const scenePrompts = buildScenePrompts(wordData.word, wordData.definition)

  const applyStarter = (starter: string) => {
    setSentence(starter)
  }

  const appendIdea = (idea: string) => {
    setSentence((current) => {
      if (!current.trim()) {
        return `${idea} `
      }
      return current.endsWith(" ") ? `${current}${idea}` : `${current} ${idea}`
    })
  }

  const toggleFavorite = async () => {
    const nextFavorites = isFavorite
      ? favoriteWordIds.filter((id) => id !== currentWord.word_id)
      : [...favoriteWordIds, currentWord.word_id]

    updateFavorites(() => nextFavorites)

    if (studyMode === "favorites" && isFavorite) {
      const remainingFavorites = nextFavorites.filter((id) => id !== currentWord.word_id)
      setLoadingNext(true)
      try {
        const next = await getNextWord(library, skippedWordIds, remainingFavorites)
        setCurrentWord(next)
        setWordKey((k) => k + 1)
        setSentence("")
        setResult(null)
        setStreamProgressChars(0)
        setStreamSections(EMPTY_VISIBLE_FEEDBACK)
        setStreamPhase("idle")
        setStatus("idle")
        setShowExample(false)
        setShowSentenceHelp(false)
      } catch (error) {
        console.error(error)
      } finally {
        setLoadingNext(false)
      }
    }
  }

  const sentenceHelpPanel = showSentenceHelp && (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="glass-panel w-full rounded-3xl p-6 sm:p-7 border border-amber-500/15 bg-gradient-to-br from-amber-500/[0.06] to-orange-500/[0.03] space-y-5"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-amber-300/70 font-semibold">Sentence Help</p>
          <h3 className="text-lg font-semibold text-white mt-2">先用模板把句子搭起来</h3>
          <p className="text-sm text-zinc-400 mt-1">目标不是替你完成，而是帮你跨过“完全写不出来”的第一步。</p>
        </div>
        <button
          type="button"
          onClick={() => setShowSentenceHelp(false)}
          className="rounded-full border border-white/10 bg-white/5 p-2 text-zinc-400 transition-colors hover:text-white hover:bg-white/10"
          title="关闭辅助"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="rounded-2xl border border-white/8 bg-black/25 p-4">
        <p className="text-xs font-semibold tracking-[0.18em] uppercase text-amber-300/75 mb-3">句子开头</p>
        <div className="grid gap-2">
          {sentenceStarters.map((starter) => (
            <button
              key={starter}
              type="button"
              onClick={() => applyStarter(starter)}
              className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-left text-sm text-zinc-200 transition-all hover:border-amber-400/25 hover:bg-white/[0.06]"
            >
              {starter}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-white/8 bg-black/25 p-4">
        <p className="text-xs font-semibold tracking-[0.18em] uppercase text-amber-300/75 mb-3">联想提示</p>
        <div className="space-y-2">
          {scenePrompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => appendIdea(prompt)}
              className="block w-full rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-left text-sm text-zinc-300 transition-all hover:border-amber-400/25 hover:bg-white/[0.06]"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>

      {wordData.example && (
        <div className="rounded-2xl border border-white/8 bg-black/25 p-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <p className="text-xs font-semibold tracking-[0.18em] uppercase text-amber-300/75">参考例句</p>
            <button
              type="button"
              onClick={() => setSentence(wordData.example ?? "")}
              className="text-xs font-medium text-amber-300 transition-colors hover:text-amber-200"
            >
              放进输入框参考
            </button>
          </div>
          <p className="text-sm leading-7 text-zinc-300">{wordData.example}</p>
        </div>
      )}
    </motion.div>
  )

  return (
    <div className="flex flex-col items-center justify-center w-full max-w-2xl mx-auto space-y-6 relative">
      <AnimatePresence>{settingsModalJsx}</AnimatePresence>
      {renderControls()}
      
      {/* Word Card */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`word-${wordKey}`}
          initial={{ opacity: 0, y: 20, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.98 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className={`glass-panel w-full rounded-3xl p-8 sm:p-10 relative overflow-hidden flex-shrink-0 shadow-[0_0_40px_-10px_rgba(59,130,246,0.15)] ${loadingNext ? 'opacity-50 blur-sm pointer-events-none' : ''}`}
        >
          <div className="absolute top-0 right-0 p-5">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={toggleFavorite}
                className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all ${
                  isFavorite
                    ? "border-rose-500/30 bg-rose-500/12 text-rose-300"
                    : "border-white/10 bg-black/20 text-zinc-400 hover:text-white hover:border-white/20"
                }`}
                title={isFavorite ? "取消收藏" : "收藏这个单词"}
              >
                <Heart className={`w-3.5 h-3.5 ${isFavorite ? "fill-current" : ""}`} />
                {isFavorite ? "已收藏" : "收藏"}
              </button>
              <span className="px-3 py-1 text-xs font-bold uppercase tracking-widest bg-blue-500/10 text-blue-400 rounded-full border border-blue-500/20 shadow-inner">
                {wordData.tags || "词汇"}
              </span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-baseline gap-2 sm:gap-4 mb-6">
            <h1 className="text-5xl sm:text-6xl font-extrabold text-transparent bg-clip-text bg-gradient-to-br from-white via-zinc-200 to-zinc-500 tracking-tight drop-shadow-sm flex items-center gap-4">
              {wordData.word}
              <button 
                type="button" 
                onClick={(e) => { e.preventDefault(); playAudio(wordData.word); }} 
                className="text-zinc-500 hover:text-blue-400 transition-colors" 
                title="朗读单词"
              >
                <Volume2 className="w-8 h-8 sm:w-10 sm:h-10 opacity-70 hover:opacity-100" />
              </button>
            </h1>
            {wordData.phonetic && (
              <span className="text-xl text-blue-300/80 font-mono tracking-wide font-medium">
                {wordData.phonetic}
              </span>
            )}
          </div>

          <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/[0.08] mb-6 text-zinc-300 shadow-inner">
            <p className="flex items-start text-base sm:text-lg leading-relaxed">
              <BookOpen className="w-5 h-5 mr-3 mt-1 text-blue-400/70 shrink-0" />
              <span>{wordData.definition}</span>
            </p>
          </div>

          {wordData.example && (
            <div className="mt-4">
              {!showExample ? (
                <button 
                  type="button"
                  onClick={() => setShowExample(true)}
                  className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
                >
                  查看例句
                </button>
              ) : (
                <motion.p
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="text-sm text-zinc-400 italic bg-black/20 p-3 rounded-lg border border-white/5"
                >
                  &quot;{wordData.example}&quot;
                </motion.p>
              )}
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Input Area */}
      <AnimatePresence>
        {status !== "result" && (
          <motion.form
            onSubmit={handleSubmit}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3, delay: 0.1 }}
            className={`w-full flex flex-col gap-4 flex-shrink-0 transition-all duration-300 ${loadingNext ? 'opacity-50 blur-sm pointer-events-none' : ''}`}
          >
            <div className="relative group">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-3xl blur opacity-0 group-focus-within:opacity-100 transition duration-500"></div>
              <textarea
                value={sentence}
                onChange={(e) => setSentence(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (sentence.trim() && status !== "submitting") {
                      void submitCurrentSentence()
                    }
                  }
                }}
                placeholder={`请用 "${wordData.word}" 造一个句子...\n按 Enter 提交，Shift + Enter 换行`}
                className="relative w-full h-36 bg-[#09090b]/80 backdrop-blur-md border border-white/10 rounded-3xl p-5 text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-blue-500/50 shadow-inner resize-none transition-all text-lg leading-relaxed shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)]"
                disabled={status === "submitting"}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowSentenceHelp((current) => !current)}
                className="inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-200 transition-all hover:bg-amber-500/15"
              >
                <Lightbulb className="h-4 w-4" />
                {showSentenceHelp ? "收起造句辅助" : "不会造句？给我提示"}
              </button>

              {sentence.trim() && (
                <button
                  type="button"
                  onClick={() => setSentence("")}
                  className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-zinc-300 transition-all hover:bg-white/10 hover:text-white"
                >
                  清空重写
                </button>
              )}
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => handleNext(library, true)}
                disabled={status === "submitting"}
                className="flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium text-zinc-400 hover:text-white transition-colors disabled:opacity-50"
              >
                跳过
                <SkipForward className="h-4 w-4" />
              </button>

              <button
                type="submit"
                disabled={!sentence.trim() || status === "submitting"}
                className="group flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-8 py-3 text-sm font-semibold text-white transition-all hover:bg-blue-500 disabled:opacity-50 disabled:bg-white/10 disabled:text-zinc-500 w-full sm:w-auto"
              >
                {status === "submitting" ? (
                  <motion.span
                    animate={{ opacity: [1, 0.5, 1] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  >
                    {streamPhase === "structuring" ? "正在整理评分..." : "AI 实时评估中..."}
                    {streamProgressChars > 0 ? ` ${streamProgressChars}字` : ""}
                  </motion.span>
                ) : (
                  <>
                    提交
                    <Sparkles className="h-4 w-4 transition-transform group-hover:scale-110" />
                  </>
                )}
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      <AnimatePresence>{sentenceHelpPanel}</AnimatePresence>
      <AnimatePresence>{renderStreamingPreview()}</AnimatePresence>

      {/* Result Card */}
      <AnimatePresence>
        {status === "result" && result && (
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

            {/* Header: Title + Score Circle */}
            <div className="flex items-start justify-between mb-6 mt-2">
              <div>
                <h3 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-white to-zinc-400 mb-2">AI 评估结果</h3>
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

            {/* Rich structured feedback */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="mb-6"
            >
              {renderEvaluation(result.evaluation)}
            </motion.div>

            {/* Footer */}
            <div className="flex flex-col sm:flex-row items-center justify-between pt-4 border-t border-white/10 gap-4">
              <div className="flex flex-col text-xs text-zinc-500">
                <span>下次复习：{mounted ? new Date(result.nextSrs.nextReviewDate).toLocaleDateString("zh-CN") : '...'}</span>
                <span>当前难度系数：{result.nextSrs.easeFactor}</span>
              </div>
              <button
                onClick={() => handleNext(library)}
                className="group flex items-center justify-center gap-2 rounded-xl bg-white/10 px-6 py-3 text-sm font-medium text-white transition-all hover:bg-white/20 w-full sm:w-auto"
              >
                下一个单词
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
