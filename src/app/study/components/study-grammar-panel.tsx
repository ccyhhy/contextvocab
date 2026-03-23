"use client"

import { useState } from "react"
import { AlertTriangle, BookOpen, Lightbulb } from "lucide-react"
import type { StudyBatchGrammarItem } from "../actions"
import {
  getPriorityLabel,
  getSceneTagLabel,
  getUsageRegisterLabel,
  shouldHighlightPriority,
} from "./study-ui"

export function StudyGrammarPanel({
  currentGrammar,
  loadingNext,
}: {
  currentGrammar: StudyBatchGrammarItem
  loadingNext: boolean
}) {
  const [activeTab, setActiveTab] = useState<"examples" | "details" | "errors">("examples")
  
  const grammar = currentGrammar.grammar
  const usageRegisterLabel = getUsageRegisterLabel(grammar.usageRegister)
  const familyLabelMap: Record<string, string> = {
    reason_result: "原因与结果",
    concession_contrast: "让步与转折",
    condition: "条件",
    time_sequence: "时间与顺序",
    noun_clause: "名词性从句",
    relative_clause: "定语从句",
    purpose_comparison: "目的与比较",
    functional_pattern: "功能句型",
    emphasis_pattern: "强调结构",
  }
  const familyLabel = familyLabelMap[grammar.family] ?? grammar.family.replace(/_/g, " / ")

  const primaryTemplate = grammar.templates[0]
  const otherTemplates = grammar.templates.slice(1)

  const hasExamples = grammar.examples.length > 0
  const hasErrors = grammar.commonErrors.length > 0
  const hasDetails = otherTemplates.length > 0 || grammar.slotSchema.length > 0
  
  let currentTab = activeTab
  if (currentTab === "examples" && !hasExamples) currentTab = hasDetails ? "details" : "errors"
  if (currentTab === "errors" && !hasErrors) currentTab = hasExamples ? "examples" : "details"
  if (currentTab === "details" && !hasDetails) currentTab = hasExamples ? "examples" : "errors"

  return (
    <div
      className={`glass-panel rounded-3xl p-6 sm:p-8 ${
        loadingNext ? "pointer-events-none opacity-50 blur-sm" : ""
      }`}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex min-h-8 flex-wrap items-center gap-2">
          {shouldHighlightPriority(currentGrammar.priorityReason) ? (
            <span className="rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-300">
              {getPriorityLabel(currentGrammar.priorityReason)}
            </span>
          ) : null}
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-300">
            句法
          </span>
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-400">
            {familyLabel}
          </span>
        </div>
      </div>

      <div className="rounded-2xl border border-blue-500/10 bg-blue-500/[0.02] p-5 text-zinc-300 sm:p-6">
        <div className="flex items-start gap-4">
          <BookOpen className="mt-1 h-6 w-6 shrink-0 text-blue-400/80" />
          <div className="min-w-0 flex-1 space-y-3">
            <h1 className="text-3xl sm:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-b from-white to-white/60 tracking-tight pb-1">{grammar.title}</h1>
            <p className="text-lg font-medium text-blue-200/90">{grammar.pattern}</p>
            <p className="text-[15px] leading-relaxed text-zinc-200">{grammar.coreExplanation}</p>
            
            {(grammar.usageNote || grammar.sceneTags.length > 0 || usageRegisterLabel) && (
              <div className="mt-4 rounded-xl border border-white/[0.04] bg-black/20 p-4">
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                  <Lightbulb className="h-3.5 w-3.5 text-amber-300/70" />
                  用法
                </div>
                {grammar.usageNote ? (
                  <p className="mt-2 text-sm leading-6 text-zinc-300">{grammar.usageNote}</p>
                ) : null}
                {grammar.sceneTags.length > 0 || usageRegisterLabel ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {grammar.sceneTags.map((tag) => (
                      <span
                        key={`${currentGrammar.grammar_item_id}-scene-${tag}`}
                        className="rounded-full border border-blue-500/20 bg-blue-500/10 px-2.5 py-1 text-xs text-blue-100"
                      >
                        {getSceneTagLabel(tag)}
                      </span>
                    ))}
                    {usageRegisterLabel ? (
                      <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-zinc-300">
                        {usageRegisterLabel}
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </div>

      {primaryTemplate && (
        <div className="mt-5 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 sm:p-6">
          <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">最稳妥模板</p>
          <div className="mt-3 space-y-3">
            <p className="text-base font-semibold text-white">{primaryTemplate.template}</p>
            {primaryTemplate.slotHints.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {primaryTemplate.slotHints.map((hint) => (
                  <span
                    key={`${currentGrammar.grammar_item_id}-primary-hint-${hint}`}
                    className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-300"
                  >
                    {hint}
                  </span>
                ))}
              </div>
            ) : null}
            {primaryTemplate.exampleSentence ? (
              <div className="mt-3 rounded-xl border border-white/5 bg-black/20 p-4 text-sm leading-6">
                <p className="text-zinc-200">{primaryTemplate.exampleSentence}</p>
                {primaryTemplate.exampleTranslation ? (
                  <p className="mt-1 text-zinc-500">{primaryTemplate.exampleTranslation}</p>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      )}

      {grammar.contrasts.length > 0 && (
        <div className="mt-5 rounded-2xl border border-white/[0.08] bg-black/20 p-5 sm:p-6">
          <p className="mb-3 text-[11px] uppercase tracking-[0.18em] text-zinc-500">易混辨析</p>
          <div className="grid gap-3 md:grid-cols-2">
            {grammar.contrasts.map((contrast) => (
              <div
                key={`${currentGrammar.grammar_item_id}-contrast-${contrast.slug}`}
                className="rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3 text-sm leading-6"
              >
                <span className="font-semibold text-white">{contrast.title}</span>
                <span className="text-zinc-400">：{contrast.note}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {(hasExamples || hasDetails || hasErrors) && (
        <div className="mt-6">
          <div className="flex flex-wrap gap-2 border-b border-white/10 pb-3">
            {hasExamples && (
              <button
                onClick={() => setActiveTab("examples")}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  currentTab === "examples"
                    ? "bg-white/10 text-white"
                    : "text-zinc-400 hover:bg-white/5 hover:text-zinc-300"
                }`}
              >
                场景例句
              </button>
            )}
            {hasDetails && (
              <button
                onClick={() => setActiveTab("details")}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  currentTab === "details"
                    ? "bg-white/10 text-white"
                    : "text-zinc-400 hover:bg-white/5 hover:text-zinc-300"
                }`}
              >
                模板与槽位
              </button>
            )}
            {hasErrors && (
              <button
                onClick={() => setActiveTab("errors")}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  currentTab === "errors"
                    ? "bg-white/10 text-white"
                    : "text-zinc-400 hover:bg-white/5 hover:text-zinc-300"
                }`}
              >
                常见误区
              </button>
            )}
          </div>

          <div className="mt-4">
            {currentTab === "examples" && hasExamples && (
              <div className="grid gap-3 sm:grid-cols-2">
                {grammar.examples.map((example) => (
                  <div
                    key={`${currentGrammar.grammar_item_id}-example-${example.sentence}`}
                    className="rounded-xl border border-white/5 bg-white/[0.02] p-4"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      {example.isPrimary ? (
                        <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-200">
                          核心例句
                        </span>
                      ) : null}
                      {example.scene ? (
                        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-zinc-400">
                          {example.scene}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 text-sm leading-6 text-zinc-200">{example.sentence}</p>
                    {example.translation ? (
                      <p className="mt-1 text-xs leading-5 text-zinc-500">{example.translation}</p>
                    ) : null}
                    {example.note ? (
                      <p className="mt-2 text-xs leading-5 text-zinc-400">{example.note}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            )}

            {currentTab === "details" && hasDetails && (
              <div className="space-y-6">
                {grammar.slotSchema.length > 0 && (
                  <div>
                    <p className="mb-3 text-[11px] uppercase tracking-[0.18em] text-zinc-500">结构槽位说明</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {grammar.slotSchema.map((slot) => (
                        <div
                          key={`${currentGrammar.grammar_item_id}-slot-${slot.key}`}
                          className="rounded-xl border border-white/5 bg-white/[0.02] p-4"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-zinc-200">{slot.label}</span>
                            <span className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-zinc-400">
                              {slot.type}
                            </span>
                            {!slot.required ? (
                              <span className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-zinc-400">
                                可省略
                              </span>
                            ) : null}
                          </div>
                          {slot.hint ? (
                            <p className="mt-2 text-sm leading-6 text-zinc-400">{slot.hint}</p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {otherTemplates.length > 0 && (
                  <div>
                    <p className="mb-3 text-[11px] uppercase tracking-[0.18em] text-zinc-500">其他可用模板</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {otherTemplates.map((template) => (
                        <div
                          key={`${currentGrammar.grammar_item_id}-template-${template.position}-${template.label}`}
                          className="rounded-xl border border-white/5 bg-white/[0.02] p-4"
                        >
                          <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">
                            {template.label}
                          </p>
                          <p className="mt-2 text-sm font-medium leading-6 text-white">
                            {template.template}
                          </p>
                          {template.slotHints.length > 0 ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {template.slotHints.map((hint) => (
                                <span
                                  key={`${currentGrammar.grammar_item_id}-hint-${template.position}-${hint}`}
                                  className="rounded-xl bg-white/5 px-3 py-1.5 text-xs text-zinc-300"
                                >
                                  {hint}
                                </span>
                              ))}
                            </div>
                          ) : null}
                          {template.exampleSentence ? (
                            <div className="mt-3 text-sm leading-6 text-zinc-300">
                              <p>{template.exampleSentence}</p>
                              {template.exampleTranslation ? (
                                <p className="text-xs text-zinc-500">
                                  {template.exampleTranslation}
                                </p>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {currentTab === "errors" && hasErrors && (
              <div className="rounded-xl border border-red-500/10 bg-red-500/[0.02] p-5">
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                  <AlertTriangle className="h-3.5 w-3.5 text-red-400/70" />
                  常见出错点
                </div>
                <div className="mt-3 space-y-3">
                  {grammar.commonErrors.map((error) => (
                    <p
                      key={`${currentGrammar.grammar_item_id}-error-${error}`}
                      className="text-sm leading-6 text-zinc-300"
                    >
                      • {error}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
