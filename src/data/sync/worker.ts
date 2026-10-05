import type { Table } from 'dexie'
import { SYNC_TABLES, type SyncTable } from '@/lib/enums'
import { readClock } from '@/lib/clock'
import { RemoteError, type PushRow, type Remote, type RemoteRow } from '@/lib/remote'
import type { CadenceDB } from '../db'
import type { BaseRow, SyncQueueRow } from '../types'

/**
 * Local-first sync. All writes already went to Dexie (and the queue) — UI never waits on this.
 *
 *   push  drain the queue to the cloud. One entry per row (latest write wins), so replay after a long
 *         offline stretch sends each row once. An entry is removed ONLY if it is unchanged since we read it —
 *         an edit made while the push was in flight stays queued.
 *   pull  fetch rows newer than the server-seq watermark and apply them LAST-WRITE-WINS on updatedAt.
 *         Remote rows are validated before they touch the database (trust boundary).
 */

export const PUSH_BATCH = 200
export const PULL_PAGE = 500
const WATERMARK_KEY = 'pullSeq'
const LAST_SYNC_KEY = 'lastSyncAt'
const LAST_ERROR_KEY = 'lastSyncError'

export interface SyncResult {
  ok: boolean
  pushed: number
  pulled: number
  /** Remote rows applied (new or newer than local). */
  applied: number
  /** Remote rows rejected by validation or a unique-index conflict. */
  skipped: number
  error?: { kind: string; message: string }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isoOk = (s: unknown): s is string => typeof s === 'string' && !Number.isNaN(Date.parse(s))
const tableSet = new Set<string>(SYNC_TABLES)

/** Validate a row from the cloud before applying it. Returns the clean row or null. */
export function validateRemoteRow(r: RemoteRow): (BaseRow & Record<string, unknown>) | null {
  if (!r || typeof r !== 'object') return null
  if (!tableSet.has(r.table)) return null
  if (typeof r.id !== 'string' || !UUID.test(r.id)) return null
  if (!isoOk(r.updatedAt)) return null
  const d = r.data
  if (!d || typeof d !== 'object' || Array.isArray(d)) return null
  if (d.id !== r.id) return null // the document must describe the row it is stored under
  if (!isoOk(d.updatedAt)) return null
  return { ...(d as Record<string, unknown>), id: r.id, updatedAt: d.updatedAt as string, deletedAt: typeof d.deletedAt === 'string' ? d.deletedAt : (r.deletedAt ?? null), createdAt: typeof d.createdAt === 'string' ? d.createdAt : (d.updatedAt as string), syncedAt: null }
}

const tbl = (db: CadenceDB, name: string) => (db as unknown as Record<string, Table<BaseRow & Record<string, unknown>, string>>)[name]!

async function pushAll(db: CadenceDB, remote: Remote, onProgress?: () => void): Promise<number> {
  let pushed = 0
  for (;;) {
    const entries = await db.syncQueue.orderBy('createdAt').limit(PUSH_BATCH).toArray()
    if (entries.length === 0) return pushed
    const rows: PushRow[] = entries.map((e) => ({
      table: e.table as SyncTable,
      id: e.rowId,
      updatedAt: String(e.payload.updatedAt),
      deletedAt: (e.payload.deletedAt as string | null) ?? null,
      data: e.payload,
    }))
    try {
      await remote.push(rows)
    } catch (err) {
      const stamp = readClock().iso
      const message = err instanceof Error ? err.message : String(err)
      await db.transaction('rw', db.syncQueue, async () => {
        for (const e of entries) {
          const cur = await db.syncQueue.get(e.id)
          if (cur) await db.syncQueue.put({ ...cur, attempts: cur.attempts + 1, attemptedAt: stamp, error: message })
        }
      })
      throw err
    }
    const syncedAt = readClock().iso
    await db.transaction('rw', [db.syncQueue, ...SYNC_TABLES.map((t) => tbl(db, t))], async () => {
      for (const e of entries) {
        const cur: SyncQueueRow | undefined = await db.syncQueue.get(e.id)
        // Unchanged since we read it → done. Edited meanwhile → leave it queued for the next round.
        if (cur && cur.payload.updatedAt === e.payload.updatedAt) {
          await db.syncQueue.delete(e.id)
          const row = await tbl(db, e.table).get(e.rowId)
          if (row && row.updatedAt === e.payload.updatedAt) await tbl(db, e.table).put({ ...row, syncedAt })
        }
      }
    })
    pushed += entries.length
    onProgress?.()
    if (entries.length < PUSH_BATCH) return pushed
  }
}

type PullOutcome = { pulled: number; applied: number; skipped: number }

async function applyPage(db: CadenceDB, rows: RemoteRow[]): Promise<{ applied: number; skipped: number }> {
  let applied = 0
  let skipped = 0
  for (const raw of rows) {
    const remote = validateRemoteRow(raw)
    if (!remote) {
      skipped++
      continue
    }
    const table = tbl(db, raw.table)
    try {
      await db.transaction('rw', [table, db.syncQueue], async () => {
        const local = await table.get(remote.id)
        // LAST-WRITE-WINS per row. Equal timestamps keep local (that's our own push echoing back).
        if (local && local.updatedAt >= remote.updatedAt) return
        await table.put({ ...remote, syncedAt: readClock().iso })
        const q = await db.syncQueue.get(`${raw.table}:${remote.id}`)
        // A queued local edit older than what we just accepted is obsolete — drop it (it would be rejected anyway).
        if (q && String(q.payload.updatedAt) <= remote.updatedAt) await db.syncQueue.delete(q.id)
        applied++
      })
    } catch (e) {
      // e.g. a unique index (dailyLogs.date, weeklyReviews.weekNumber …) hit by a row with a different id.
      if (e instanceof Error && e.name === 'ConstraintError') skipped++
      else throw e
    }
  }
  return { applied, skipped }
}

async function pullAll(db: CadenceDB, remote: Remote): Promise<PullOutcome> {
  let watermark = ((await db.syncMeta.get(WATERMARK_KEY))?.value as number | undefined) ?? 0
  const out: PullOutcome = { pulled: 0, applied: 0, skipped: 0 }
  for (;;) {
    const page = await remote.pull(watermark, PULL_PAGE)
    if (page.rows.length === 0) return out
    const r = await applyPage(db, page.rows)
    out.pulled += page.rows.length
    out.applied += r.applied
    out.skipped += r.skipped
    watermark = Math.max(watermark, page.maxSeq)
    await db.syncMeta.put({ key: WATERMARK_KEY, value: watermark })
    if (page.rows.length < PULL_PAGE) return out
  }
}

/** One full round: push, then pull. Never throws — failures come back in the result and are recorded. */
export async function syncOnce(db: CadenceDB, remote: Remote): Promise<SyncResult> {
  const res: SyncResult = { ok: false, pushed: 0, pulled: 0, applied: 0, skipped: 0 }
  try {
    res.pushed = await pushAll(db, remote)
    const p = await pullAll(db, remote)
    res.pulled = p.pulled
    res.applied = p.applied
    res.skipped = p.skipped
    res.ok = true
    await db.syncMeta.bulkPut([
      { key: LAST_SYNC_KEY, value: readClock().iso },
      { key: LAST_ERROR_KEY, value: null },
    ])
  } catch (err) {
    const kind = err instanceof RemoteError ? err.kind : 'SERVER'
    const message = err instanceof Error ? err.message : String(err)
    res.error = { kind, message }
    await db.syncMeta.put({ key: LAST_ERROR_KEY, value: `${kind}: ${message}` })
  }
  return res
}

export const pendingCount = (db: CadenceDB): Promise<number> => db.syncQueue.count()

/** Exponential backoff with a ceiling: 5s, 10s, 20s … 5min. */
export function backoffMs(failures: number): number {
  if (failures <= 0) return 0
  return Math.min(5 * 60_000, 5_000 * 2 ** (failures - 1))
}

export async function readSyncMeta(db: CadenceDB): Promise<{ lastSyncAt: string | null; lastError: string | null; watermark: number }> {
  const [a, b, c] = await Promise.all([db.syncMeta.get(LAST_SYNC_KEY), db.syncMeta.get(LAST_ERROR_KEY), db.syncMeta.get(WATERMARK_KEY)])
  return { lastSyncAt: (a?.value as string | null) ?? null, lastError: (b?.value as string | null) ?? null, watermark: (c?.value as number | undefined) ?? 0 }
}
