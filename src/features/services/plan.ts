import { runTx } from '@/data/rows'
import { allReviews, saveReview } from '@/data/repos/plan'
import type { WeeklyReviewRow } from '@/data/types'
import { burnoutFlagFor } from '@/domain/burnout'

export interface ReviewPatch {
  q1Dsa?: string
  q2Core?: string
  q3Shipped?: string
  q4Applications?: string
  /** TRI-STATE: null = unanswered. Never coerced to false. */
  q5FuelOk?: boolean | null
}

/**
 * Saves the Sunday review, then re-derives burnoutFlag for this week AND the next one
 * (an edit to Q5 changes whether the following week's run of two "no"s exists).
 */
export const saveWeeklyReview = (weekNumber: number, patch: ReviewPatch): Promise<WeeklyReviewRow> => runTx(['weeklyReviews'], () => saveWeeklyReviewTx(weekNumber, patch))

async function saveWeeklyReviewTx(weekNumber: number, patch: ReviewPatch): Promise<WeeklyReviewRow> {
  await saveReview(weekNumber, patch)
  const reviews = await allReviews()
  let saved: WeeklyReviewRow | undefined
  for (const w of [weekNumber, weekNumber + 1]) {
    const r = reviews.find((x) => x.weekNumber === w)
    if (!r) continue
    const flag = burnoutFlagFor(reviews, w)
    const next = r.burnoutFlag === flag ? r : await saveReview(w, { burnoutFlag: flag })
    if (w === weekNumber) saved = next
  }
  return saved!
}
