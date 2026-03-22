import type { StudyBatchGrammarItem, StudyBatchItem, StudyBatchWordItem } from "./actions"

export function isStudyBatchWordItem(
  item: StudyBatchItem | null | undefined
): item is StudyBatchWordItem {
  return item?.kind === "word"
}

export function isStudyBatchGrammarItem(
  item: StudyBatchItem | null | undefined
): item is StudyBatchGrammarItem {
  return item?.kind === "grammar"
}

export function getStudyBatchItemKey(item: StudyBatchItem) {
  return item.kind === "grammar" ? item.grammar_item_id : item.word_id
}
