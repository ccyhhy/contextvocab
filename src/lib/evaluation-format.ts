export interface EvaluationPromptInput {
  word: string
  definition: string
  tags?: string
  learningHistory?: string[]
}

export interface VisibleFeedbackSections {
  overall: string
  issue: string
  tip: string
  progress: string
}

export const FEEDBACK_START_TAG = "<feedback>"
export const FEEDBACK_END_TAG = "</feedback>"
export const JSON_START_TAG = "<json>"
export const JSON_END_TAG = "</json>"
export const EMPTY_VISIBLE_FEEDBACK: VisibleFeedbackSections = {
  overall: "",
  issue: "",
  tip: "",
  progress: "",
}

function buildHistoryBlock(learningHistory?: string[]): string {
  if (!learningHistory || learningHistory.length === 0) {
    return "No prior sentences are available for this target word."
  }

  return [
    "Prior learning history for this target word, ordered from oldest to newest:",
    ...learningHistory.map((sentence, index) => `${index + 1}. "${sentence}"`),
    "Refer to this history in the visible feedback when it is relevant.",
  ].join("\n")
}

function buildJsonSchemaDescription(): string {
  return `{
  "score": <integer 0-100>,
  "correctedSentence": "<corrected English sentence; keep the target word or a valid inflection>",
  "errors": [
    {
      "type": "<grammar|word_usage|naturalness|spelling>",
      "original": "<problematic fragment>",
      "correction": "<better wording>",
      "explanation": "<brief explanation in Simplified Chinese>"
    }
  ],
  "praise": "<specific praise in Simplified Chinese>",
  "suggestion": "<specific action item in Simplified Chinese>",
  "naturalness": <integer 1-5>,
  "grammarScore": <integer 1-5>,
  "wordUsageScore": <integer 1-5>,
  "attemptStatus": "<valid|needs_help>",
  "usageQuality": "<strong|weak|meta|invalid>",
  "usesWordInContext": <true|false>,
  "isMetaSentence": <true|false>,
  "advancedExpressions": [
    {
      "original": "<plain word or phrase from the student's sentence>",
      "advanced": "<more advanced replacement>",
      "explanation": "<brief explanation in Simplified Chinese>",
      "example": "<short English example sentence>"
    }
  ],
  "polishedSentence": "<polished English sentence; keep the target word or a valid inflection>"
}`
}

export function buildEvaluationSystemPrompt({
  word,
  definition,
  tags,
  learningHistory,
}: EvaluationPromptInput): string {
  return `You are a rigorous English teacher evaluating a sentence written by a Chinese learner.

Target word: "${word}"
Definition: ${definition || "N/A"}
Word list tag: ${tags || "General"}

${buildHistoryBlock(learningHistory)}

Evaluation priorities:
1. The target word must stay in the corrected sentence and polished sentence. Never replace it with a synonym.
2. Judge word usage, grammar, naturalness, and sentence quality fairly.
3. Praise and suggestions must be concrete, and they must be written in Simplified Chinese.
4. Explanations inside errors and advancedExpressions must be written in Simplified Chinese.
5. correctedSentence and polishedSentence must be English only.
6. If there is no error, return an empty errors array.
7. Provide 2-3 advancedExpressions when there is enough material, but do not replace the target word itself.
8. If the learner input is random text, irrelevant filler, fragments that do not form a real sentence, or an obviously fake attempt because they cannot make a sentence, set attemptStatus to "needs_help".
9. When attemptStatus is "needs_help", keep the score below 60, do not invent a polished rewrite, and return correctedSentence/polishedSentence as empty strings unless there is a minimally salvageable real sentence core.
10. When attemptStatus is "needs_help", the Chinese suggestion must explicitly tell the learner to use sentence help and start from a short simple sentence.
11. Very important: penalize meta sentences that talk about the word itself instead of using the word to express a real meaning.
12. Examples of low-value meta sentences include patterns like "I like the word X", "This word is hard", "I know this word", "I use the word X", or similar sentence shells that merely mention the vocabulary item.
13. A grammatically correct sentence can still be low quality if it does not show the meaning, collocation, or real usage of the target word in context.
14. For those meta or shallow sentences, keep the score below 60 unless the sentence genuinely demonstrates the target word's meaning in context. Explain in Chinese that the learner is talking about the word rather than using the word.
15. Do not reward short meta sentences with a high score just because the grammar is simple and correct.
16. Set usageQuality as follows:
   - strong: the learner clearly uses the target word to express a concrete meaning in context.
   - weak: the learner attempts to use the word, but the context is thin, generic, or only partially shows the meaning.
   - meta: the learner is mainly talking about the word itself rather than using it.
   - invalid: the input is random, irrelevant, or not a meaningful sentence attempt.
17. usesWordInContext must be true only when the sentence uses the target word to express a real idea or situation.
18. isMetaSentence must be true when the sentence is mainly about the word as a vocabulary item.

Scoring guide:
- 90-100: excellent, natural, precise, near-native.
- 75-89: strong, only small issues.
- 60-74: understandable but clearly imperfect.
- 40-59: major issues or weak target-word usage.
- 0-39: unacceptable or irrelevant.

Output format:
1. First output a visible feedback block wrapped exactly with ${FEEDBACK_START_TAG} and ${FEEDBACK_END_TAG}.
2. Inside that feedback block, output exactly four labeled lines in this exact order:
   overall: <one short line in Simplified Chinese>
   issue: <one short line in Simplified Chinese>
   tip: <one short line in Simplified Chinese>
   progress: <one short line in Simplified Chinese>
3. Always include all four lines. If there is no useful history comparison, set progress to a short neutral Chinese line.
4. Then output a JSON block wrapped exactly with ${JSON_START_TAG} and ${JSON_END_TAG}.
5. The JSON must be valid and match this schema exactly:
${buildJsonSchemaDescription()}

Do not add any text before ${FEEDBACK_START_TAG}, between ${FEEDBACK_END_TAG} and ${JSON_START_TAG}, or after ${JSON_END_TAG}.`
}

export function buildEvaluationUserPrompt(sentence: string): string {
  return `Evaluate this English sentence:\n\n"${sentence}"`
}

export function extractEvaluationJson(content: string): string {
  const taggedMatch = content.match(/<json>\s*([\s\S]*?)\s*<\/json>/i)
  if (taggedMatch?.[1]) {
    return taggedMatch[1].trim()
  }

  return content.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim()
}

export function extractVisibleFeedback(content: string): {
  feedback: string
  hasFeedbackStart: boolean
  hasFeedbackEnd: boolean
  hasJsonStart: boolean
} {
  const feedbackStartIndex = content.indexOf(FEEDBACK_START_TAG)
  const feedbackEndIndex = content.indexOf(FEEDBACK_END_TAG)
  const jsonStartIndex = content.indexOf(JSON_START_TAG)

  if (feedbackStartIndex === -1) {
    return {
      feedback: "",
      hasFeedbackStart: false,
      hasFeedbackEnd: false,
      hasJsonStart: jsonStartIndex !== -1,
    }
  }

  const contentStart = feedbackStartIndex + FEEDBACK_START_TAG.length
  let contentEnd = content.length

  if (feedbackEndIndex !== -1) {
    contentEnd = feedbackEndIndex
  } else if (jsonStartIndex !== -1) {
    contentEnd = jsonStartIndex
  }

  return {
    feedback: content.slice(contentStart, contentEnd).trim(),
    hasFeedbackStart: true,
    hasFeedbackEnd: feedbackEndIndex !== -1,
    hasJsonStart: jsonStartIndex !== -1,
  }
}

export function parseVisibleFeedbackSections(feedback: string): VisibleFeedbackSections {
  const sections: VisibleFeedbackSections = { ...EMPTY_VISIBLE_FEEDBACK }
  let currentKey: keyof VisibleFeedbackSections | null = null

  for (const rawLine of feedback.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) {
      continue
    }

    const match = line.match(/^(overall|issue|tip|progress)\s*:\s*(.*)$/i)
    if (match) {
      currentKey = match[1].toLowerCase() as keyof VisibleFeedbackSections
      sections[currentKey] = match[2].trim()
      continue
    }

    if (currentKey) {
      sections[currentKey] = sections[currentKey]
        ? `${sections[currentKey]}\n${line}`
        : line
    }
  }

  return sections
}
