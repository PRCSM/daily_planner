import { db } from '../db'
import { alive, makeRow, patchRow, putRow, runTx, softDelete } from '../rows'
import type { TimetableSlotRow } from '../types'

export type NewSlot = Omit<TimetableSlotRow, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'syncedAt'>
export async function allSlots(): Promise<TimetableSlotRow[]> {
  return alive(await db.timetableSlots.toArray())
}
export const addSlot = (fields: NewSlot) => putRow('timetableSlots', makeRow<TimetableSlotRow>(fields))
export const updateSlot = (id: string, patch: Partial<TimetableSlotRow>) => patchRow('timetableSlots', id, patch)
export const removeSlot = (id: string) => softDelete('timetableSlots', id)

/** Replace the active timetable atomically (used by import & paint-mode save): old slots are soft-deleted, new ones added. */
export async function replaceSlots(next: NewSlot[]): Promise<void> {
  await runTx(['timetableSlots'], async () => {
    for (const s of alive(await db.timetableSlots.toArray())) await softDelete('timetableSlots', s.id)
    for (const s of next) await putRow('timetableSlots', makeRow<TimetableSlotRow>(s))
  })
}
