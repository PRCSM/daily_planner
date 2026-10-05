import { db } from '../db'
import { alive, listAlive, makeRow, patchRow, putRow } from '../rows'
import { detId } from '@/lib/ids'
import type { DeliverableRow, WeeklyReviewRow, WeeklyTargetRow } from '../types'

export async function allWeeks(): Promise<WeeklyTargetRow[]> {
  return alive(await db.weeklyTargets.orderBy('weekNumber').toArray())
}
export const allDeliverables = () => listAlive('deliverables')
export const setDeliverableDone = (id: string, done: boolean) => patchRow('deliverables', id, { done })
export const addDeliverable = (weekNumber: number, text: string, dueDate?: string) =>
  putRow('deliverables', makeRow<DeliverableRow>({ weekNumber, text, done: false, dueDate, seeded: false, userModified: false }))

export async function getReview(weekNumber: number): Promise<WeeklyReviewRow | undefined> {
  const r = await db.weeklyReviews.where('weekNumber').equals(weekNumber).first()
  return r && !r.deletedAt ? r : undefined
}
export async function allReviews(): Promise<WeeklyReviewRow[]> {
  return alive(await db.weeklyReviews.orderBy('weekNumber').toArray())
}
/** Create-or-update the single review for a week. q5FuelOk stays null until explicitly answered. */
export async function saveReview(weekNumber: number, patch: Partial<Omit<WeeklyReviewRow, 'id' | 'weekNumber'>>): Promise<WeeklyReviewRow> {
  const existing = await db.weeklyReviews.where('weekNumber').equals(weekNumber).first()
  if (existing) return patchRow('weeklyReviews', existing.id, { ...patch, deletedAt: null })
  return putRow('weeklyReviews', makeRow<WeeklyReviewRow>({ weekNumber, q5FuelOk: null, burnoutFlag: false, ...patch }, detId('weeklyReview', weekNumber)))
}
