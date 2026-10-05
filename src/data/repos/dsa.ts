import { db } from '../db'
import { alive, getAlive, makeRow, patchRow, putRow, softDelete } from '../rows'
import type { DsaProblemRow } from '../types'

export type NewProblem = Omit<DsaProblemRow, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'syncedAt'>
export const getProblem = (id: string) => getAlive('dsaProblems', id)
export const addProblem = (fields: NewProblem) => putRow('dsaProblems', makeRow<DsaProblemRow>(fields))
export const updateProblem = (id: string, patch: Partial<DsaProblemRow>) => patchRow('dsaProblems', id, patch)
export const removeProblem = (id: string) => softDelete('dsaProblems', id)

export async function allProblems(): Promise<DsaProblemRow[]> {
  return alive(await db.dsaProblems.orderBy('solvedDate').reverse().toArray())
}

/** Problems whose review is due on/before `today`, oldest-due first. Absent from results when none. */
export async function reviewQueue(today: string): Promise<DsaProblemRow[]> {
  const rows = await db.dsaProblems.where('reviewDue').belowOrEqual(today).toArray()
  return alive(rows).filter((p) => p.reviewDue !== null).sort((a, b) => (a.reviewDue ?? '').localeCompare(b.reviewDue ?? ''))
}

export async function problemsOnDate(date: string): Promise<DsaProblemRow[]> {
  return alive(await db.dsaProblems.where('solvedDate').equals(date).toArray())
}
