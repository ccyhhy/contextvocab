"use client"

import { BookOpen, Copy, X } from "lucide-react"
import type { GrammarExampleInfo, GrammarTemplateInfo } from "@/lib/study-content"

export function StudyGrammarHelpPanel({
  visible,
  templates,
  examples,
  onClose,
  onApply,
}: {
  visible: boolean
  templates: GrammarTemplateInfo[]
  examples: GrammarExampleInfo[]
  onClose: () => void
  onApply: (text: string) => void
}) {
  if (!visible) {
    return null
  }

  const hasTemplates = templates.length > 0
  const hasExamples = examples.length > 0

  if (!hasTemplates && !hasExamples) {
    return (
      <div className="glass-panel rounded-2xl border border-white/[0.08] p-5">
        <div className="flex items-center justify-between">
          <span className="text-sm text-zinc-400">暂无可用的造句提示</span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-zinc-500 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="glass-panel space-y-4 rounded-2xl border border-white/[0.08] p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-zinc-200">
          <BookOpen className="h-4 w-4 text-amber-400" />
          造句提示
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1 text-zinc-500 transition-colors hover:bg-white/10 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {hasTemplates ? (
        <div className="space-y-2">
          <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">造句模板</p>
          <div className="space-y-2">
            {templates.map((template) => (
              <button
                key={`hint-tpl-${template.position}-${template.label}`}
                type="button"
                onClick={() => onApply(template.exampleSentence ?? template.template)}
                className="group flex w-full items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-left transition-colors hover:border-amber-500/20 hover:bg-amber-500/[0.04]"
              >
                <Copy className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-600 transition-colors group-hover:text-amber-400" />
                <div className="min-w-0 space-y-1">
                  <p className="text-sm leading-6 text-zinc-100">{template.template}</p>
                  {template.exampleSentence ? (
                    <p className="text-xs leading-5 text-zinc-500">
                      例：{template.exampleSentence}
                    </p>
                  ) : null}
                  {template.exampleTranslation ? (
                    <p className="text-xs leading-5 text-zinc-600">{template.exampleTranslation}</p>
                  ) : null}
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {hasExamples ? (
        <div className="space-y-2">
          <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">参考例句</p>
          <div className="space-y-2">
            {examples.map((example) => (
              <button
                key={`hint-ex-${example.sentence}`}
                type="button"
                onClick={() => onApply(example.sentence)}
                className="group flex w-full items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-left transition-colors hover:border-blue-500/20 hover:bg-blue-500/[0.04]"
              >
                <Copy className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-600 transition-colors group-hover:text-blue-400" />
                <div className="min-w-0 space-y-1">
                  <p className="text-sm leading-6 text-zinc-100">{example.sentence}</p>
                  {example.translation ? (
                    <p className="text-xs leading-5 text-zinc-500">{example.translation}</p>
                  ) : null}
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <p className="text-xs leading-5 text-zinc-600">
        点击任意提示可填入输入框，建议在此基础上改写为自己的句子。
      </p>
    </div>
  )
}
