import { db } from '../db'
import { alive, makeRow, patchRow, putRow, runTx, softDelete } from '../rows'
import { detId } from '@/lib/ids'
import type { Track } from '@/lib/enums'
import type { DailyLogRow, LogBlockRow } from '../types'

export async function getLog(date: string): Promise<DailyLogRow | undefined> {
  const r = await db.dailyLogs.where('date').equals(date).first()
  return r && !r.deletedAt ? r : undefined
}

export type LogDefaults = Pick<DailyLogRow, 'weekNumber' | 'phase'>

/** The one daily log for `date`. Deterministic id so two devices converge; a soft-deleted log is revived. */
export async function ensureLog(date: string, defaults: LogDefaults): Promise<DailyLogRow> {
  return runTx(['dailyLogs'], async () => {
    const existing = await db.dailyLogs.where('date').equals(date).first()
    if (existing && !existing.deletedAt) return existing
    if (existing) return patchRow('dailyLogs', existing.id, { deletedAt: null })
    const row = makeRow<DailyLogRow>(
      { date, ...defaults, applicationsSent: 0, conceptsLearned: [], trained: false, aiOffRespected: true, energy: 3 },
      detId('dailyLog', date),
    )
    return putRow('dailyLogs', row)
  })
}

export const patchLog = (id: string, patch: Partial<DailyLogRow>) => patchRow('dailyLogs', id, patch)

export async function blocksForLog(logId: string): Promise<LogBlockRow[]> {
  return alive(await db.logBlocks.where('logId').equals(logId).toArray()).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export const addBlock = (row: LogBlockRow) => putRow('logBlocks', row)
export const updateBlock = (id: string, patch: Partial<LogBlockRow>) => patchRow('logBlocks', id, patch)
export const removeBlock = (id: string) => softDelete('logBlocks', id)
export const newBlock = (fields: Omit<LogBlockRow, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'syncedAt'>) => makeRow<LogBlockRow>(fields)

/** Logs + blocks for an inclusive date range, two indexed queries. */
export async function rangeBundle(from: string, to: string): Promise<{ logs: DailyLogRow[]; blocks: LogBlockRow[] }> {
  return db.transaction('r', db.dailyLogs, db.logBlocks, async () => ({
    logs: alive(await db.dailyLogs.where('date').between(from, to, true, true).toArray()),
    blocks: alive(await db.logBlocks.where('date').between(from, to, true, true).toArray()),
  }))
}

/** Last-used tracks, most recent first (for track-chip ordering). */
export async function recentTracks(limit = 80): Promise<Track[]> {
  const rows = alive(await db.logBlocks.orderBy('updatedAt').reverse().limit(limit).toArray())
  const seen: Track[] = []
  for (const r of rows) if (!seen.includes(r.track)) seen.push(r.track)
  return seen
}

/** Recent distinct topics (newest first) with their track, for autocomplete chips. */
export async function recentTopics(limit = 200): Promise<{ topic: string; track: Track }[]> {
  const rows = alive(await db.logBlocks.orderBy('updatedAt').reverse().limit(limit).toArray())
  const seen = new Set<string>()
  const out: { topic: string; track: Track }[] = []
  for (const r of rows) {
    const t = r.topic?.trim()
    if (!t) continue
    const k = `${r.track}|${t.toLowerCase()}`
    if (seen.has(k)) continue
    seen.add(k)
    out.push({ topic: t, track: r.track })
  }
  return out
}

/** Most recent log strictly before `date` that has fuel the user actually entered — source of "yesterday's defaults". */
export async function latestFuelBefore(date: string): Promise<DailyLogRow | undefined> {
  const rows = await db.dailyLogs.where('date').below(date).reverse().limit(14).toArray()
  return alive(rows).find((l) => l.fuelEntered)
}

export async function allLogs(): Promise<DailyLogRow[]> {
  return alive(await db.dailyLogs.orderBy('date').toArray())
}
export async function allBlocks(): Promise<LogBlockRow[]> {
  return alive(await db.logBlocks.toArray())
}
