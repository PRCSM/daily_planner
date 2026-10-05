import type { WeeklyReviewRow } from '@/data/types'

/**
 * Burnout auto-flag. Sunday Review Q5 (sleep / training / rest) is TRI-STATE:
 *   true / false = an explicit answer, null = unanswered.
 * Two CONSECUTIVE explicitly-false answers flag burnout. null — or a missing review — BREAKS the
 * run, so false → null → false does NOT flag (otherwise skipped reviews would start firing it).
 */
type Q5 = Pick<WeeklyReviewRow, 'weekNumber' | 'q5FuelOk'>

const answer = (reviews: Q5[], week: number): boolean | null => reviews.find((r) => r.weekNumber === week)?.q5FuelOk ?? null

/** Does the review for `week` complete a run of two consecutive explicit "no"s? */
export function burnoutFlagFor(reviews: Q5[], week: number): boolean {
  return answer(reviews, week) === false && answer(reviews, week - 1) === false
}

/**
 * Is the "cut the plan 25%" card showing in `currentWeek`? It is NON-DISMISSIBLE: it stays until
 * the current week's own fuel answer is an explicit yes.
 */
export function burnoutActive(reviews: Q5[], currentWeek: number): boolean {
  if (burnoutFlagFor(reviews, currentWeek)) return true
  return burnoutFlagFor(reviews, currentWeek - 1) && answer(reviews, currentWeek) !== true
}

export const CUT_FRACTION = 0.25
/** The reduced target while flagged (rounded up — never demand less than 1 when there was a target). */
export const reducedTarget = (target: number): number => (target <= 0 ? 0 : Math.max(1, Math.round(target * (1 - CUT_FRACTION))))
