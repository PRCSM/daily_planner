import { db } from '../db'
import { alive, makeRow, patchRow, putRow, softDelete } from '../rows'
import { detId } from '@/lib/ids'
import type { PlannerDayRow, PlannerTaskRow } from '../types'

export async function getDay(date: string): Promise<PlannerDayRow | undefined> {
  const d = await db.plannerDays.where('date').equals(date).first()
  return d && !d.deletedAt ? d : undefined
}
export async function ensureDay(date: string): Promise<PlannerDayRow> {
  const existing = await db.plannerDays.where('date').equals(date).first()
  if (existing && !existing.deletedAt) return existing
  if (existing) return patchRow('plannerDays', existing.id, { deletedAt: null })
  return putRow('plannerDays', makeRow<PlannerDayRow>({ date }, detId('plannerDay', date)))
}
export const setIntention = async (date: string, intention: string) => {
  const d = await ensureDay(date)
  return patchRow('plannerDays', d.id, { intention })
}
/** Day + its tasks in one transaction. */
export async function dayBundle(date: string): Promise<{ day?: PlannerDayRow; tasks: PlannerTaskRow[] }> {
  return db.transaction('r', db.plannerDays, db.plannerTasks, async () => {
    const d = await db.plannerDays.where('date').equals(date).first()
    const day = d && !d.deletedAt ? d : undefined
    const tasks = day ? alive(await db.plannerTasks.where('dayId').equals(day.id).toArray()).sort((a, b) => a.orderIndex - b.orderIndex) : []
    return { day, tasks }
  })
}
export type NewTask = Omit<PlannerTaskRow, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'syncedAt'>
export const addTask = (fields: NewTask) => putRow('plannerTasks', makeRow<PlannerTaskRow>(fields))
export const updateTask = (id: string, patch: Partial<PlannerTaskRow>) => patchRow('plannerTasks', id, patch)
export const removeTask = (id: string) => softDelete('plannerTasks', id)
