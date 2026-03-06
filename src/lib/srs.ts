/**
 * SuperMemo-2 (SM-2) Spaced Repetition Algorithm implementation
 * Adjusted for AI scoring of sentences (0-100 score mapped to 0-5 SM-2 quality).
 */

export interface SRSData {
  repetitions: number
  interval: number
  easeFactor: number
  nextReviewDate: Date
}

/**
 * Maps an AI score (0-100) to SM-2 quality score (0-5)
 * 5: Perfect response, flawless sentence
 * 4: Good response, minor issues
 * 3: Passing response, grammatical errors but understandable
 * 2: Poor response, major errors
 * 1: Very poor, barely understandable
 * 0: Complete failure or blank
 */
export function mapScoreToQuality(score: number): number {
  if (score >= 90) return 5
  if (score >= 80) return 4
  if (score >= 60) return 3
  if (score >= 40) return 2
  if (score >= 20) return 1
  return 0
}

/**
 * Calculates the next SRS state given the current state and AI score.
 */
export function calculateNextReview(
  current: { repetitions: number; interval: number; easeFactor: number },
  score: number // 0-100
): SRSData {
  const quality = mapScoreToQuality(score)
  
  let newRepetitions = current.repetitions
  let newInterval = current.interval
  let newEaseFactor = current.easeFactor

  // Quality >= 3 is a correct response in SM-2
  if (quality >= 3) {
    if (newRepetitions === 0) {
      newInterval = 1
    } else if (newRepetitions === 1) {
      newInterval = 6
    } else {
      newInterval = Math.round(newInterval * newEaseFactor)
    }
    newRepetitions += 1
  } else {
    // Incorrect response, reset repetitions
    newRepetitions = 0
    newInterval = 1
  }

  // Update ease factor: EF' = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
  newEaseFactor = newEaseFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
  
  // SM-2 rule: EF must not drop below 1.3
  if (newEaseFactor < 1.3) {
    newEaseFactor = 1.3
  }

  const nextReviewDate = new Date()
  nextReviewDate.setDate(nextReviewDate.getDate() + newInterval)

  return {
    repetitions: newRepetitions,
    interval: newInterval,
    easeFactor: Number(newEaseFactor.toFixed(3)),
    nextReviewDate
  }
}
