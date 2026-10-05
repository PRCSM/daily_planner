import type { Table } from 'dexie'
import type { SyncTable } from '@/lib/enums'
import { readClock } from '@/lib/clock'
import { newId } from '@/lib/ids'
import { db } from './db'
import type { BaseRow, SyncQueueRow, TableRowMap } from './types'

/**
 * THE one write path. Every user mutation goes through putRow / softDelete so that:
 *  - the row is stamped (updatedAt), and
 *  - a sync-queue entry is written in the SAME transaction (no write can skip the queue).
 * Remote-origin writes (sync pull) and seed writes use applyRemote / seedPut, which never enqueue.
 */

export const stamp = (): string => readClock().iso

type Row<K extends SyncTable> = TableRowMap[K]
const tableOf = <K extends SyncTable>(name: K) => db[name] as unknown as Table<Row<K>, string>

/** Fresh base fields for a new row. Pass `id` for deterministic rows. */
export function baseFields(id?: string): BaseRow {
  const now = stamp()
  return { id: id ?? newId(), createdAt: now, updatedAt: now, deletedAt: null, syncedAt: null }
}

/** Build a complete row from its domain fields. */
export function makeRow<T extends BaseRow>(fields: Omit<T, keyof BaseRow>, id?: string): T {
  return { ...baseFields(id), ...fields } as T
}

/** Seed rows that the user hasn't touched are reproducible from the bundle — they never ride the sync queue. */
function shouldEnqueue(row: object): boolean {
  const r = row as { seeded?: boolean; userModified?: boolean }
  return !(r.seeded === true && r.userModified !== true)
}

function queueEntry(table: string, row: BaseRow, op: 'put' | 'delete'): SyncQueueRow {
  const { syncedAt: _syncedAt, ...payload } = row
  return { id: `${table}:${row.id}`, table, rowId: row.id, op, payload: payload as Record<string, unknown>, createdAt: stamp(), attempts: 0 }
}

/** Run several writes atomically. Always includes the sync queue so enqueueing joins the transaction. */
export function runTx<R>(tables: SyncTable[], fn: () => Promise<R>): Promise<R> {
  return db.transaction('rw', [...tables.map((t) => db[t]), db.syncQueue], fn)
}

/** Insert or replace a row as a USER edit. Bumps updatedAt; marks edited seed rows userModified. */
export async function putRow<K extends SyncTable>(table: K, row: Row<K>): Promise<Row<K>> {
  const next = { ...row, updatedAt: stamp() } as Row<K>
  const seedable = next as unknown as { seeded?: boolean; userModified?: boolean }
  if (seedable.seeded === true) seedable.userModified = true
  await runTx([table], async () => {
    await tableOf(table).put(next)
    if (shouldEnqueue(next)) await db.syncQueue.put(queueEntry(table, next, 'put'))
  })
  return next
}

/** Patch an existing row by id. Throws if it doesn't exist (a silent no-op would hide a bug). */
export async function patchRow<K extends SyncTable>(table: K, id: string, patch: Partial<Row<K>>): Promise<Row<K>> {
  return runTx([table], async () => {
    const cur = await tableOf(table).get(id)
    if (!cur) throw new Error(`patchRow: ${table}/${id} not found`)
    const next = { ...cur, ...patch, id, updatedAt: stamp() } as Row<K>
    const seedable = next as unknown as { seeded?: boolean; userModified?: boolean }
    if (seedable.seeded === true) seedable.userModified = true
    await tableOf(table).put(next)
    if (shouldEnqueue(next)) await db.syncQueue.put(queueEntry(table, next, 'put'))
    return next
  })
}

/** Soft delete: sets deletedAt so the deletion itself syncs. */
export async function softDelete<K extends SyncTable>(table: K, id: string): Promise<void> {
  await runTx([table], async () => {
    const cur = await tableOf(table).get(id)
    if (!cur || cur.deletedAt) return
    const now = stamp()
    const next = { ...cur, deletedAt: now, updatedAt: now } as Row<K>
    const seedable = next as unknown as { seeded?: boolean; userModified?: boolean }
    // Deleting a seeded row is a user decision a seed refresh must not undo.
    if (seedable.seeded === true) seedable.userModified = true
    await tableOf(table).put(next)
    await db.syncQueue.put(queueEntry(table, next, 'delete'))
  })
}

/** Remote/seed-origin write: does not touch updatedAt, never enqueues. */
export async function applyRemote<K extends SyncTable>(table: K, row: Row<K>): Promise<void> {
  await tableOf(table).put({ ...row, syncedAt: stamp() })
}
export async function seedPut<K extends SyncTable>(table: K, rows: Row<K>[]): Promise<void> {
  if (rows.length) await tableOf(table).bulkPut(rows)
}

/** Live (non-deleted) rows only. */
export const alive = <T extends { deletedAt: string | null }>(rows: T[]): T[] => rows.filter((r) => !r.deletedAt)

/** All live rows of a table. */
export async function listAlive<K extends SyncTable>(table: K): Promise<Row<K>[]> {
  return alive(await tableOf(table).toArray())
}
export async function getAlive<K extends SyncTable>(table: K, id: string): Promise<Row<K> | undefined> {
  const r = await tableOf(table).get(id)
  return r && !r.deletedAt ? r : undefined
}
