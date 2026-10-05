import { describe, expect, it } from 'vitest'
import { db } from './db'
import { applyRemote, makeRow, patchRow, putRow, softDelete, listAlive, getAlive, runTx } from './rows'
import { freshDbPerTest } from '@/test/db'
import { setClockSource, localDate } from '@/lib/clock'
import { T0 } from '@/test/factories'
import { addDays } from '@/domain/dates'
import type { EventRow, ApplicationRow } from './types'

freshDbPerTest()

const ev = (o: Partial<EventRow> = {}) => makeRow<EventRow>({ title: 'E', type: 'CUSTOM', date: T0, criticality: 'SOFT', recurrence: 'NONE', sourceModule: 'CALENDAR', done: false, seeded: false, userModified: false, ...o })

describe('putRow — the one write path', () => {
  it('stamps updatedAt from the injected clock and enqueues in the same transaction', async () => {
    const saved = await putRow('events', ev())
    expect(saved.updatedAt).toBe(localDate(T0, '10:00').toISOString())
    const q = await db.syncQueue.get(`events:${saved.id}`)
    expect(q).toMatchObject({ table: 'events', rowId: saved.id, op: 'put', attempts: 0 })
    expect((q!.payload as { title: string }).title).toBe('E')
    expect(q!.payload).not.toHaveProperty('syncedAt') // local-only bookkeeping never leaves the device
  })
  it('coalesces: many edits to one row leave ONE pending entry carrying the latest data', async () => {
    const r = await putRow('events', ev({ title: 'v1' }))
    await patchRow('events', r.id, { title: 'v2' })
    await patchRow('events', r.id, { title: 'v3' })
    const entries = await db.syncQueue.where('table').equals('events').toArray()
    expect(entries).toHaveLength(1)
    expect((entries[0]!.payload as { title: string }).title).toBe('v3')
  })
  it('rolls back the row if enqueueing fails (atomic)', async () => {
    const row = ev()
    await expect(
      runTx(['events'], async () => {
        await putRow('events', row)
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')
    expect(await db.events.get(row.id)).toBeUndefined()
    expect(await db.syncQueue.count()).toBe(0)
  })
  it('patchRow on a missing id throws instead of silently doing nothing', async () => {
    await expect(patchRow('events', 'nope', { title: 'x' })).rejects.toThrow(/not found/)
  })
  it('later edits get a later updatedAt', async () => {
    const r = await putRow('events', ev())
    setClockSource(() => localDate(addDays(T0, 1), '09:00'))
    const r2 = await patchRow('events', r.id, { title: 'later' })
    expect(r2.updatedAt > r.updatedAt).toBe(true)
  })
})

describe('soft delete', () => {
  it('sets deletedAt, hides the row from live queries, and enqueues the deletion so it can sync', async () => {
    const r = await putRow('events', ev())
    await softDelete('events', r.id)
    expect(await getAlive('events', r.id)).toBeUndefined()
    expect(await listAlive('events')).toHaveLength(0)
    const raw = await db.events.get(r.id)
    expect(raw!.deletedAt).not.toBeNull()
    const q = await db.syncQueue.get(`events:${r.id}`)
    expect(q!.op).toBe('delete')
    expect((q!.payload as { deletedAt: string }).deletedAt).toBe(raw!.deletedAt)
  })
  it('is idempotent and tolerates a missing row', async () => {
    const r = await putRow('events', ev())
    await softDelete('events', r.id)
    const first = (await db.events.get(r.id))!.deletedAt
    setClockSource(() => localDate(addDays(T0, 3), '09:00'))
    await softDelete('events', r.id)
    expect((await db.events.get(r.id))!.deletedAt).toBe(first)
    await expect(softDelete('events', 'missing')).resolves.toBeUndefined()
  })
})

describe('seeded rows', () => {
  const seeded = () => ev({ seeded: true, userModified: false })
  it('an UNTOUCHED seed write is not queued (it is reproducible from the bundle)', async () => {
    await db.events.put(seeded()) // loader path
    expect(await db.syncQueue.count()).toBe(0)
  })
  it('a user edit marks userModified=true and queues the row', async () => {
    const s = seeded()
    await db.events.put(s)
    const r = await patchRow('events', s.id, { title: 'mine' })
    expect(r.userModified).toBe(true)
    expect(await db.syncQueue.count()).toBe(1)
  })
  it('deleting a seeded row is a user decision too (userModified, queued)', async () => {
    const s = seeded()
    await db.events.put(s)
    await softDelete('events', s.id)
    expect((await db.events.get(s.id))!.userModified).toBe(true)
    expect(await db.syncQueue.count()).toBe(1)
  })
})

describe('applyRemote', () => {
  it('writes without touching updatedAt and never enqueues', async () => {
    const r = ev()
    r.updatedAt = '2026-01-01T00:00:00.000Z'
    await applyRemote('events', r)
    const got = (await db.events.get(r.id))!
    expect(got.updatedAt).toBe('2026-01-01T00:00:00.000Z')
    expect(got.syncedAt).not.toBeNull()
    expect(await db.syncQueue.count()).toBe(0)
  })
})

describe('other tables share the same path', () => {
  it('applications', async () => {
    const a = makeRow<ApplicationRow>({ company: 'X', role: 'SDE', type: 'FULL_TIME', status: 'SAVED' })
    await putRow('applications', a)
    expect((await db.syncQueue.get(`applications:${a.id}`))!.table).toBe('applications')
  })
})
