export type StudyContentType = 'word' | 'grammar' | 'mixed'
export type StudyTargetKind = 'word' | 'grammar'

export type GrammarSlotType =
  | 'clause'
  | 'noun_phrase'
  | 'verb_ing'
  | 'to_infinitive'
  | 'relative_clause'
  | 'statement_clause'
  | 'question_clause'
  | 'prepositional_phrase'
  | 'fixed_chunk'
  | 'custom'

export interface GrammarSlotDefinition {
  key: string
  label: string
  type: GrammarSlotType
  required: boolean
  hint?: string | null
}

export interface GrammarExampleInfo {
  sentence: string
  translation?: string | null
  note?: string | null
  scene?: string | null
  isPrimary: boolean
}

export interface GrammarContrastInfo {
  slug: string
  title: string
  note: string
}

export interface GrammarTemplateInfo {
  label: string
  template: string
  slotHints: string[]
  exampleSentence?: string | null
  exampleTranslation?: string | null
  position: number
}

export interface GrammarStudyInfo {
  kind: 'grammar'
  slug: string
  title: string
  shortLabel?: string | null
  pattern: string
  family: string
  subtype?: string | null
  anchor?: string | null
  coreExplanation: string
  usageNote?: string | null
  usageRegister?: string | null
  sceneTags: string[]
  slotSchema: GrammarSlotDefinition[]
  commonErrors: string[]
  contrasts: GrammarContrastInfo[]
  examples: GrammarExampleInfo[]
  templates: GrammarTemplateInfo[]
}

export function normalizeStudyContentType(value?: string | null): StudyContentType {
  switch ((value ?? '').trim().toLowerCase()) {
    case 'grammar':
      return 'grammar'
    case 'mixed':
      return 'mixed'
    case 'word':
    default:
      return 'word'
  }
}
