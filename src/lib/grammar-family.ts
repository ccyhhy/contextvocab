const GRAMMAR_FAMILY_LABELS: Record<string, string> = {
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

export function getGrammarFamilyLabel(family: string) {
  return GRAMMAR_FAMILY_LABELS[family] ?? family.replace(/_/g, " / ")
}
