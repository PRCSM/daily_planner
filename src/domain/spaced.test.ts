import { describe, expect, it } from 'vitest'
import { DSA_STATUSES } from '@/lib/enums'
import { addDays } from './dates'
import { daysOverdue, isReviewDue, scheduleAfterReview, scheduleAfterSolve } from './spaced'
import { T0 } from '@/test/factories'

describe('spaced repetition', () => {
  it('unaided solve needs no review', () => {
    expect(scheduleAfterSolve('SOLVED_UNAIDED', T0)).toEqual({ reviewDue: null, reviewCount: 0 })
  })
  it('every other outcome is reviewed 7 days after solving', () => {
    for (const s of DSA_STATUSES.filter((x) => x !== 'SOLVED_UNAIDED')) {
      expect(scheduleAfterSolve(s, T0)).toEqual({ reviewDue: addDays(T0, 7), reviewCount: 0 })
    }
  })
  it('a clean review clears the schedule (first or later)', () => {
    for (const reviewCount of [0, 1, 4]) {
      expect(scheduleAfterReview({ reviewCount }, T0, true)).toEqual({ reviewDue: null, reviewCount: reviewCount + 1, lastReviewedDate: T0 })
    }
  })
  it('a failed review reschedules 21 days from the REVIEW date, not the original due date', () => {
    const reviewedLate = addDays(T0, 30)
    expect(scheduleAfterReview({ reviewCount: 0 }, reviewedLate, false)).toEqual({ reviewDue: addDays(reviewedLate, 21), reviewCount: 1, lastReviewedDate: reviewedLate })
    expect(scheduleAfterReview({ reviewCount: 1 }, reviewedLate, false).reviewDue).toBe(addDays(reviewedLate, 21))
  })
  it('due / overdue', () => {
    expect(isReviewDue(null, T0)).toBe(false)
    expect(isReviewDue(T0, T0)).toBe(true)
    expect(isReviewDue(addDays(T0, 1), T0)).toBe(false)
    expect(isReviewDue(addDays(T0, -3), T0)).toBe(true)
    expect(daysOverdue(addDays(T0, -3), T0)).toBe(3)
    expect(daysOverdue(T0, T0)).toBe(0)
    expect(daysOverdue(addDays(T0, 2), T0)).toBe(-2)
  })
})
