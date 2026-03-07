export type ReviewBucket = 'easy' | 'good' | 'hard' | 'again'

export interface SRSData {
  repetitions: number
  interval: number
  easeFactor: number
  nextReviewDate: Date
  reviewBucket: ReviewBucket
}

export function getReviewBucket(score: number): ReviewBucket {
  if (score >= 90) return 'easy'
  if (score >= 75) return 'good'
  if (score >= 60) return 'hard'
  return 'again'
}

export function calculateNextReview(
  current: { repetitions: number; interval: number; easeFactor: number },
  score: number
): SRSData {
  const reviewBucket = getReviewBucket(score)
  let repetitions = current.repetitions
  let interval = current.interval
  let easeFactor = current.easeFactor

  switch (reviewBucket) {
    case 'easy': {
      if (repetitions === 0) {
        interval = 2
      } else if (repetitions === 1) {
        interval = 7
      } else {
        interval = Math.max(1, Math.round(interval * (easeFactor + 0.15)))
      }
      repetitions += 1
      easeFactor += 0.15
      break
    }
    case 'good': {
      if (repetitions === 0) {
        interval = 1
      } else if (repetitions === 1) {
        interval = 5
      } else {
        interval = Math.max(1, Math.round(interval * easeFactor))
      }
      repetitions += 1
      easeFactor += 0.05
      break
    }
    case 'hard': {
      if (repetitions === 0) {
        interval = 1
      } else if (repetitions === 1) {
        interval = 3
      } else {
        interval = Math.max(1, Math.round(interval * easeFactor * 0.6))
      }
      repetitions += 1
      easeFactor -= 0.05
      break
    }
    case 'again':
    default: {
      repetitions = 0
      interval = 1
      easeFactor -= 0.2
      break
    }
  }

  if (easeFactor < 1.3) {
    easeFactor = 1.3
  }

  const nextReviewDate = new Date()
  nextReviewDate.setDate(nextReviewDate.getDate() + interval)

  return {
    repetitions,
    interval,
    easeFactor: Number(easeFactor.toFixed(3)),
    nextReviewDate,
    reviewBucket,
  }
}
