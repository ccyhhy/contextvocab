"use client"

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
    functional_patterns: "功能句型",
  }
  const familyLabel = familyLabelMap[grammar.family] ?? grammar.family.replace(/_/g, " / ")

  return (
    <div
      className={`glass-panel rounded-3xl p-8 ${
        loadingNext ? "pointer-events-none opacity-50 blur-sm" : ""
      }`}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex min-h-8 items-center gap-2">
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

      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 text-zinc-300">
        <div className="flex items-start gap-3">
          <BookOpen className="mt-1 h-5 w-5 shrink-0 text-blue-400/70" />
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">句式</p>
            <h1 className="text-3xl font-extrabold text-white sm:text-4xl">{grammar.title}</h1>
            <p className="text-base text-blue-200/90">{grammar.pattern}</p>
            <p className="text-sm leading-7 text-zinc-200">{grammar.coreExplanation}</p>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {(grammar.usageNote || grammar.sceneTags.length > 0 || usageRegisterLabel) && (
          <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-5">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-zinc-500">
              <Lightbulb className="h-3.5 w-3.5 text-amber-300/70" />
              用法
            </div>
            {grammar.usageNote ? (
              <p className="mt-3 text-sm leading-7 text-zinc-200">{grammar.usageNote}</p>
            ) : null}
            {grammar.sceneTags.length > 0 || usageRegisterLabel ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {grammar.sceneTags.map((tag) => (
                  <span
                    key={`${currentGrammar.grammar_item_id}-scene-${tag}`}
                    className="rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-xs text-blue-100"
                  >
                    {getSceneTagLabel(tag)}
                  </span>
                ))}
                {usageRegisterLabel ? (
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-300">
                    {usageRegisterLabel}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
        )}

        {grammar.slotSchema.length > 0 && (
          <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-5">
            <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">结构槽位</p>
            <div className="mt-3 space-y-3">
              {grammar.slotSchema.map((slot) => (
                <div
                  key={`${currentGrammar.grammar_item_id}-slot-${slot.key}`}
                  className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-white">{slot.label}</span>
                    <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-zinc-400">
                      {slot.type}
                    </span>
                    {!slot.required ? (
                    <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-zinc-400">
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

        {grammar.templates.length > 0 && (
          <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-5 md:col-span-2">
            <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">可套用模板</p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {grammar.templates.map((template) => (
                <div
                  key={`${currentGrammar.grammar_item_id}-template-${template.position}-${template.label}`}
                  className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-4"
                >
                  <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">
                    {template.label}
                  </p>
                  <p className="mt-2 text-sm font-medium leading-7 text-white">
                    {template.template}
                  </p>
                  {template.slotHints.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {template.slotHints.map((hint) => (
                        <span
                          key={`${currentGrammar.grammar_item_id}-hint-${template.position}-${hint}`}
                          className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-300"
                        >
                          {hint}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {template.exampleSentence ? (
                    <div className="mt-3 text-sm leading-7 text-zinc-300">
                      <p>{template.exampleSentence}</p>
                      {template.exampleTranslation ? (
                        <p className="mt-1 text-xs leading-6 text-zinc-500">
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

        {grammar.examples.length > 0 && (
          <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-5 md:col-span-2">
            <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">例句</p>
            <div className="mt-3 space-y-3">
              {grammar.examples.map((example) => (
                <div
                  key={`${currentGrammar.grammar_item_id}-example-${example.sentence}`}
                  className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-4"
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
                  <p className="mt-2 text-sm leading-7 text-zinc-100">{example.sentence}</p>
                  {example.translation ? (
                    <p className="mt-1 text-xs leading-6 text-zinc-500">{example.translation}</p>
                  ) : null}
                  {example.note ? (
                    <p className="mt-2 text-xs leading-6 text-zinc-400">{example.note}</p>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        )}

        {grammar.commonErrors.length > 0 && (
          <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-5">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-zinc-500">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-300/70" />
              常见误区
            </div>
            <div className="mt-3 space-y-2">
              {grammar.commonErrors.map((error) => (
                <p
                  key={`${currentGrammar.grammar_item_id}-error-${error}`}
                  className="text-sm leading-7 text-zinc-300"
                >
                  {error}
                </p>
              ))}
            </div>
          </div>
        )}

        {grammar.contrasts.length > 0 && (
          <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-5">
            <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">易混对比</p>
            <div className="mt-3 space-y-3">
              {grammar.contrasts.map((contrast) => (
                <div
                  key={`${currentGrammar.grammar_item_id}-contrast-${contrast.slug}`}
                  className="text-sm leading-7 text-zinc-300"
                >
                  <span className="font-semibold text-white">{contrast.title}</span>
                  <span className="text-zinc-400">: {contrast.note}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
