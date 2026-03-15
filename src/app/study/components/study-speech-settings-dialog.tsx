"use client"

import { AnimatePresence, motion } from "framer-motion"
import { Save, Settings, X } from "lucide-react"
import type { SpeechConfig } from "../hooks/use-speech-synthesis"

export function StudySpeechSettingsDialog({
  open,
  speechConfig,
  availableVoices,
  onClose,
  onChangeVoice,
  onChangeRate,
  onChangePitch,
  onPreview,
  onSave,
}: {
  open: boolean
  speechConfig: SpeechConfig
  availableVoices: SpeechSynthesisVoice[]
  onClose: () => void
  onChangeVoice: (voiceURI: string) => void
  onChangeRate: (rate: number) => void
  onChangePitch: (pitch: number) => void
  onPreview: () => void
  onSave: () => void
}) {
  return (
    <AnimatePresence>
      {open && (
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
              <button type="button" onClick={onClose} className="text-zinc-400">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4">
              <label className="block text-sm text-zinc-300">音色</label>
              <select
                value={speechConfig.voiceURI}
                onChange={(event) => onChangeVoice(event.target.value)}
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
                onChange={(event) => onChangeRate(Number(event.target.value))}
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
                onChange={(event) => onChangePitch(Number(event.target.value))}
                className="w-full"
              />

              <div className="flex justify-between">
                <button
                  type="button"
                  onClick={onPreview}
                  className="rounded-md border border-white/10 px-3 py-2 text-sm text-zinc-300"
                >
                  试听句子
                </button>
                <button
                  type="button"
                  onClick={onSave}
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
  )
}
