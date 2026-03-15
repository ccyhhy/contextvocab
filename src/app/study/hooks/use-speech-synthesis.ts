"use client"

import { useEffect, useRef, useState } from "react"

export interface SpeechConfig {
  ttsRate: number
  ttsPitch: number
  voiceURI: string
}

const DEFAULT_SPEECH_CONFIG: SpeechConfig = { ttsRate: 0.9, ttsPitch: 1, voiceURI: "" }
const SPEECH_CONFIG_STORAGE_KEY = "contextvocab-speech-config"
export const DEFAULT_PREVIEW_SENTENCE = "The quick brown fox jumps over the lazy dog."

function getInitialSpeechConfig() {
  if (typeof window === "undefined") {
    return DEFAULT_SPEECH_CONFIG
  }

  const saved = window.localStorage.getItem(SPEECH_CONFIG_STORAGE_KEY)
  if (!saved) {
    return DEFAULT_SPEECH_CONFIG
  }

  try {
    return normalizeSpeechConfig(JSON.parse(saved))
  } catch {
    return DEFAULT_SPEECH_CONFIG
  }
}

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

export function useSpeechSynthesis() {
  const [speechConfig, setSpeechConfig] = useState<SpeechConfig>(() => getInitialSpeechConfig())
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([])
  const speechConfigRef = useRef<SpeechConfig>(speechConfig)
  const activeSpeechTokenRef = useRef(0)

  const updateSpeechConfig = (updater: (current: SpeechConfig) => SpeechConfig) => {
    setSpeechConfig((current) => {
      const next = updater(current)
      speechConfigRef.current = next
      return next
    })
  }

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

  const saveSpeechConfig = () => {
    if (typeof window === "undefined") {
      return
    }

    window.localStorage.setItem(SPEECH_CONFIG_STORAGE_KEY, JSON.stringify(speechConfigRef.current))
  }

  return {
    speechConfig,
    availableVoices,
    updateSpeechConfig,
    playAudio,
    saveSpeechConfig,
  }
}
