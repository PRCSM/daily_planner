import { db } from '../db'
import { alive, getAlive, makeRow, patchRow, putRow, softDelete } from '../rows'
import type { ApplicationRow } from '../types'

export type NewApplication = Omit<ApplicationRow, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'syncedAt'>
export const addApplication = (fields: NewApplication) => putRow('applications', makeRow<ApplicationRow>(fields))
export const updateApplication = (id: string, patch: Partial<ApplicationRow>) => patchRow('applications', id, patch)
export const removeApplication = (id: string) => softDelete('applications', id)
export const getApplication = (id: string) => getAlive('applications', id)
export async function allApplications(): Promise<ApplicationRow[]> {
  return alive(await db.applications.toArray())
}
