export type StudyPriorityReason = 'leech_due' | 'overdue' | 'weak_due' | 'due' | 'new'
export type BatchSlot = 'review' | 'new'

interface DueCandidate {
  next_review_date?: string | null
  last_score?: number | null
  consecutive_failures?: number | null
  last_reviewed_at?: string | null
}

function compareNullableDates(a?: string | null, b?: string | null) {
  if (a && b) {
    return a.localeCompare(b)
  }
  if (a) return -1
  if (b) return 1
  return 0
}

function getPriorityRank(reason: StudyPriorityReason) {
  switch (reason) {
    case 'leech_due':
      return 0
    case 'overdue':
      return 1
    case 'weak_due':
      return 2
    case 'due':
      return 3
    case 'new':
    default:
      return 4
  }
}

export function getStudyPriorityReason(
  candidate: DueCandidate,
  today: string
): Exclude<StudyPriorityReason, 'new'> {
  if ((candidate.consecutive_failures ?? 0) >= 3) {
    return 'leech_due'
  }

  const nextReviewDate = candidate.next_review_date ?? today
  if (nextReviewDate < today) {
    return 'overdue'
  }

  if (nextReviewDate === today && (candidate.last_score ?? 100) < 75) {
    return 'weak_due'
  }

  return 'due'
}

export function sortDueCandidates<T extends DueCandidate>(candidates: T[], today: string): T[] {
  return [...candidates].sort((left, right) => {
    const leftReason = getStudyPriorityReason(left, today)
    const rightReason = getStudyPriorityReason(right, today)
    const reasonRank = getPriorityRank(leftReason) - getPriorityRank(rightReason)
    if (reasonRank !== 0) {
      return reasonRank
    }

    const reviewDateRank = compareNullableDates(left.next_review_date, right.next_review_date)
    if (reviewDateRank !== 0) {
      return reviewDateRank
    }

    return compareNullableDates(left.last_reviewed_at, right.last_reviewed_at)
  })
}

export function buildStudyMixPlan(
  dueCount: number,
  batchSize: number,
  favoritesOnly: boolean
): BatchSlot[] {
  if (batchSize <= 0) {
    return []
  }

  if (favoritesOnly || dueCount >= 8) {
    return Array.from({ length: batchSize }, () => 'review')
  }

  if (dueCount === 0) {
    return Array.from({ length: batchSize }, () => 'new')
  }

  const reviewBlockSize = dueCount >= 4 ? 4 : 2
  const plan: BatchSlot[] = []

  while (plan.length < batchSize) {
    for (let index = 0; index < reviewBlockSize && plan.length < batchSize; index += 1) {
      plan.push('review')
    }

    if (plan.length < batchSize) {
      plan.push('new')
    }
  }

  return plan
}
