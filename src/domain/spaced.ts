import type { DsaStatus } from '@/lib/enums'
import { addDays, diffDays } from './dates'
import type { DateStr } from './dates'

/**
 * Spaced repetition, automatic — the user never manages a schedule.
 *   solve SOLVED_UNAIDED               → reviewDue = null
 *   solve anything else (count 0)      → solvedDate + 7d
 *   review, clean                      → reviewDue = null
 *   review, not clean (count >= 1)     → reviewedOn + 21d
 */
export const FIRST_REVIEW_DAYS = 7
export const LATER_REVIEW_DAYS = 21

export interface Schedule {
  reviewDue: DateStr | null
  reviewCount: number
}

export function scheduleAfterSolve(status: DsaStatus, solvedDate: DateStr): Schedule {
  if (status === 'SOLVED_UNAIDED') return { reviewDue: null, reviewCount: 0 }
  return { reviewDue: addDays(solvedDate, FIRST_REVIEW_DAYS), reviewCount: 0 }
}

export function scheduleAfterReview(prev: { reviewCount: number }, reviewedOn: DateStr, clean: boolean): Schedule & { lastReviewedDate: DateStr } {
  const reviewCount = prev.reviewCount + 1
  return clean
    ? { reviewDue: null, reviewCount, lastReviewedDate: reviewedOn }
    : { reviewDue: addDays(reviewedOn, LATER_REVIEW_DAYS), reviewCount, lastReviewedDate: reviewedOn }
}

export const isReviewDue = (reviewDue: DateStr | null, today: DateStr): boolean => reviewDue !== null && reviewDue <= today
/** Whole days past due (0 = due today). Negative = not yet due. */
export const daysOverdue = (reviewDue: DateStr, today: DateStr): number => diffDays(reviewDue, today)
