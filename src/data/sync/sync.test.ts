import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CadenceDB, setActiveDb } from '../db'
import { createEvent, removeEvent, updateEvent } from '../repos/events'
import { ensureLog, patchLog } from '../repos/logs'
import { PULL_PAGE, PUSH_BATCH, backoffMs, pendingCount, readSyncMeta, syncOnce, validateRemoteRow } from './worker'
import { FakeRemote } from './fakeRemote'
import { ensureSeeded } from '../seed'
import { patchRow } from '../rows'
import { RemoteError } from '@/lib/remote'
import { localDate, setClockSource } from '@/lib/clock'
import { addDays } from '@/domain/dates'
import { T0 } from '@/test/factories'
import type { EventRow } from '../types'

let A: CadenceDB, B: CadenceDB, cloud: FakeRemote
let tick = 0
/** Advance the injected clock so every write gets a strictly later updatedAt. */
const advance = () => {
  const t = localDate(T0, '08:00').getTime() + ++tick * 1000
  setClockSource(() => new Date(t))
}
const as = (d: CadenceDB) => setActiveDb(d)
const newEvent = (title: string, o: Partial<EventRow> = {}) => createEvent({ title, type: 'CUSTOM', date: T0, recurrence: 'NONE', criticality: 'SOFT', sourceModule: 'CALENDAR', ...o })

beforeEach(() => {
  A = new CadenceDB(`sync-a-${Math.random()}`)
  B = new CadenceDB(`sync-b-${Math.random()}`)
  cloud = new FakeRemote()
  tick = 0
  advance()
  as(A)
})
afterEach(() => setClockSource())

describe('offline: nothing is lost, nothing blocks', () => {
  it('writes while offline accumulate in the queue; a failed push keeps every entry and records the error', async () => {
    cloud.offline = true
    await newEvent('one')
    await newEvent('two')
    const res = await syncOnce(A, cloud)
    expect(res).toMatchObject({ ok: false, error: { kind: 'OFFLINE' } })
    expect(await pendingCount(A)).toBe(2)
    const q = await A.syncQueue.toArray()
    expect(q.every((e) => e.attempts === 1 && e.error === 'network down' && e.attemptedAt)).toBe(true)
    expect((await readSyncMeta(A)).lastError).toMatch(/OFFLINE/)
    expect(cloud.rows.size).toBe(0)
  })
  it('replay on reconnect drains the queue, stamps syncedAt, and clears the error', async () => {
    cloud.offline = true
    const e = await newEvent('one')
    await syncOnce(A, cloud)
    cloud.offline = false
    const res = await syncOnce(A, cloud)
    expect(res.ok).toBe(true)
    expect(res.pushed).toBe(1)
    expect(await pendingCount(A)).toBe(0)
    expect(cloud.rows.get(`events:${e.id}`)!.data.title).toBe('one')
    expect((await A.events.get(e.id))!.syncedAt).not.toBeNull()
    expect((await readSyncMeta(A)).lastError).toBeNull()
    expect((await readSyncMeta(A)).lastSyncAt).not.toBeNull()
  })
  it('a long offline stretch of edits replays as ONE push per row, carrying only the latest version', async () => {
    cloud.offline = true
    const e = await newEvent('v1')
    for (const t of ['v2', 'v3', 'v4']) await updateEvent(e.id, { title: t })
    cloud.offline = false
    await syncOnce(A, cloud)
    expect(cloud.pushCalls).toHaveLength(1)
    expect(cloud.pushCalls[0]).toHaveLength(1)
    expect(cloud.rows.get(`events:${e.id}`)!.data.title).toBe('v4')
  })
  it('auth / server failures are classified and leave the queue intact', async () => {
    await newEvent('x')
    cloud.failWith = new RemoteError('AUTH', 'jwt expired')
    expect((await syncOnce(A, cloud)).error).toEqual({ kind: 'AUTH', message: 'jwt expired' })
    cloud.failWith = new Error('weird') as RemoteError
    expect((await syncOnce(A, cloud)).error!.kind).toBe('SERVER')
    expect(await pendingCount(A)).toBe(1)
  })
  it('a failing PULL after a good push still reports failure and keeps the watermark unmoved', async () => {
    await newEvent('x')
    const failingPull = { push: cloud.push.bind(cloud), pull: async () => { throw new RemoteError('SERVER', 'pull broke') } }
    const res = await syncOnce(A, failingPull)
    expect(res.ok).toBe(false)
    expect(res.pushed).toBe(1)
    expect((await readSyncMeta(A)).watermark).toBe(0)
  })
})

describe('edits made while a push is in flight', () => {
  it('stay queued (the entry is only deleted if unchanged since it was read)', async () => {
    const e = await newEvent('before')
    cloud.duringPush = async () => {
      advance()
      await updateEvent(e.id, { title: 'during' }) // lands mid-push
    }
    await syncOnce(A, cloud)
    expect(await pendingCount(A)).toBe(1)
    expect(cloud.rows.get(`events:${e.id}`)!.data.title).toBe('before')
    advance()
    await syncOnce(A, cloud)
    expect(await pendingCount(A)).toBe(0)
    expect(cloud.rows.get(`events:${e.id}`)!.data.title).toBe('during')
  })
})

describe('two devices converge (last-write-wins per row)', () => {
  it('a row created on A appears on B', async () => {
    const e = await newEvent('from A')
    await syncOnce(A, cloud)
    const r = await syncOnce(B, cloud)
    expect(r).toMatchObject({ ok: true, applied: 1 })
    expect((await B.events.get(e.id))!.title).toBe('from A')
    expect(await pendingCount(B)).toBe(0) // pulled rows are NOT re-queued
  })
  it('the later edit wins on both devices, whichever syncs first', async () => {
    const e = await newEvent('base')
    await syncOnce(A, cloud)
    await syncOnce(B, cloud)
    advance()
    await updateEvent(e.id, { title: 'A edit' }) // earlier
    advance()
    as(B)
    await updateEvent(e.id, { title: 'B edit' }) // later
    as(A)
    await syncOnce(A, cloud)
    await syncOnce(B, cloud)
    await syncOnce(A, cloud)
    expect((await A.events.get(e.id))!.title).toBe('B edit')
    expect((await B.events.get(e.id))!.title).toBe('B edit')
    expect(cloud.rows.get(`events:${e.id}`)!.data.title).toBe('B edit')
    expect(await pendingCount(A)).toBe(0)
    expect(await pendingCount(B)).toBe(0)
  })
  it('an OLDER offline edit cannot clobber a newer one already in the cloud', async () => {
    const e = await newEvent('base')
    await syncOnce(A, cloud)
    await syncOnce(B, cloud)
    advance()
    as(B)
    await updateEvent(e.id, { title: 'stale (made first, synced last)' })
    advance()
    as(A)
    await updateEvent(e.id, { title: 'fresh' })
    await syncOnce(A, cloud)
    await syncOnce(B, cloud) // B pushes its older edit → ignored, then pulls "fresh"
    expect(cloud.rows.get(`events:${e.id}`)!.data.title).toBe('fresh')
    expect((await B.events.get(e.id))!.title).toBe('fresh')
    expect(await pendingCount(B)).toBe(0)
  })
  it('pull applies a newer remote row over an older local one, and a failed push leaves the obsolete queued edit to be dropped', async () => {
    const e = await newEvent('base')
    await syncOnce(A, cloud)
    await syncOnce(B, cloud)
    advance()
    await updateEvent(e.id, { title: 'A older' }) // queued on A, never pushed (push will fail)
    advance()
    as(B)
    await updateEvent(e.id, { title: 'B newer' })
    await syncOnce(B, cloud)
    as(A)
    const pushOnlyFails = { push: async () => { throw new RemoteError('OFFLINE', 'x') }, pull: cloud.pull.bind(cloud) }
    expect((await syncOnce(A, pushOnlyFails)).ok).toBe(false) // push fails first, so pull never runs…
    expect(await pendingCount(A)).toBe(1)
    await syncOnce(A, cloud) // …then a healthy round: older edit pushed (ignored by LWW), newer pulled
    expect((await A.events.get(e.id))!.title).toBe('B newer')
    expect(await pendingCount(A)).toBe(0)
  })
  it('an equal-timestamp echo of our own push is ignored (no flip-flopping)', async () => {
    await newEvent('x')
    const r1 = await syncOnce(A, cloud)
    expect(r1.applied).toBe(0)
    const r2 = await syncOnce(A, cloud)
    expect(r2).toMatchObject({ pushed: 0, applied: 0 })
  })
})

describe('soft delete propagates', () => {
  it('a delete on A hides the row on B', async () => {
    const e = await newEvent('doomed')
    await syncOnce(A, cloud)
    await syncOnce(B, cloud)
    advance()
    await removeEvent(e.id)
    await syncOnce(A, cloud)
    expect(cloud.rows.get(`events:${e.id}`)!.deletedAt).not.toBeNull()
    await syncOnce(B, cloud)
    expect((await B.events.get(e.id))!.deletedAt).not.toBeNull()
  })
  it('an edit after a delete on another device resurrects only if it is newer (LWW)', async () => {
    const e = await newEvent('x')
    await syncOnce(A, cloud)
    await syncOnce(B, cloud)
    advance()
    await removeEvent(e.id)
    advance()
    as(B)
    await updateEvent(e.id, { title: 'revived' })
    await syncOnce(B, cloud)
    await syncOnce(A, cloud)
    expect((await A.events.get(e.id))!.deletedAt).toBeNull()
    expect((await A.events.get(e.id))!.title).toBe('revived')
  })
})

describe('seeded rows', () => {
  it('untouched seed rows are never pushed; a user edit to one is, and reaches another device', async () => {
    await ensureSeeded()
    expect(await pendingCount(A)).toBe(0)
    const deepA = (await A.events.toArray()).find((x) => x.title === 'Deep A — DSA')!
    advance()
    await patchRow('events', deepA.id, { startTime: '05:30' })
    await syncOnce(A, cloud)
    expect(cloud.rows.size).toBe(1)
    as(B)
    await ensureSeeded()
    await syncOnce(B, cloud)
    expect((await B.events.get(deepA.id))!.startTime).toBe('05:30') // same deterministic id on both devices
    expect((await B.events.get(deepA.id))!.userModified).toBe(true)
    // …and a seed refresh on B must not undo it
    await ensureSeeded(true)
    expect((await B.events.get(deepA.id))!.startTime).toBe('05:30')
  })
})

describe('deterministic one-per-date rows converge instead of colliding', () => {
  it('two devices logging the same day end up with ONE dailyLog', async () => {
    const defaults = { weekNumber: 4, phase: 'GET_PRESENTABLE' } as const
    const a = await ensureLog(T0, defaults)
    await patchLog(a.id, { shipped: 'from A' })
    as(B)
    advance()
    const b = await ensureLog(T0, defaults)
    expect(b.id).toBe(a.id)
    await patchLog(b.id, { shipped: 'from B' })
    await syncOnce(A, cloud)
    await syncOnce(B, cloud)
    await syncOnce(A, cloud)
    expect(await A.dailyLogs.count()).toBe(1)
    expect(await B.dailyLogs.count()).toBe(1)
    expect((await A.dailyLogs.toArray())[0]!.shipped).toBe('from B')
  })
  it('a unique-index collision from a row with a DIFFERENT id is skipped, not fatal', async () => {
    await A.dailyLogs.put({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', createdAt: 'x', updatedAt: '2026-01-01T00:00:00.000Z', deletedAt: null, syncedAt: null, date: T0, weekNumber: 1, phase: 'FROM_SCRATCH', applicationsSent: 0, conceptsLearned: [], trained: false, aiOffRespected: true, energy: 3 })
    cloud.rows.set('dailyLogs:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', { table: 'dailyLogs', id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', updatedAt: '2030-01-01T00:00:00.000Z', deletedAt: null, seq: 1, data: { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', updatedAt: '2030-01-01T00:00:00.000Z', date: T0 } })
    cloud.seq = 1
    const res = await syncOnce(A, cloud)
    expect(res).toMatchObject({ ok: true, skipped: 1, applied: 0 })
  })
})

describe('pagination, batching and the watermark', () => {
  it('pulls in pages and resumes from the stored watermark (second sync fetches nothing new)', async () => {
    for (let i = 0; i < 5; i++) {
      const id = `00000000-0000-4000-8000-00000000000${i}`
      cloud.rows.set(`events:${id}`, { table: 'events', id, updatedAt: `2026-02-0${i + 1}T00:00:00.000Z`, deletedAt: null, seq: i + 1, data: { id, updatedAt: `2026-02-0${i + 1}T00:00:00.000Z`, title: `r${i}` } })
    }
    cloud.seq = 5
    const first = await syncOnce(A, cloud)
    expect(first.applied).toBe(5)
    expect((await readSyncMeta(A)).watermark).toBe(5)
    cloud.pullCalls = 0
    const second = await syncOnce(A, cloud)
    expect(second.pulled).toBe(0)
    expect(cloud.pullCalls).toBe(1)
  })
  it('pages when more than a page is waiting', async () => {
    const n = PULL_PAGE + 25
    for (let i = 0; i < n; i++) {
      const id = `10000000-0000-4000-8000-${String(i).padStart(12, '0')}`
      cloud.rows.set(`events:${id}`, { table: 'events', id, updatedAt: '2026-02-01T00:00:00.000Z', deletedAt: null, seq: i + 1, data: { id, updatedAt: '2026-02-01T00:00:00.000Z', title: `r${i}` } })
    }
    cloud.seq = n
    const res = await syncOnce(A, cloud)
    expect(res.applied).toBe(n)
    expect(await A.events.count()).toBe(n)
  })
  it('pushes in batches', async () => {
    const n = PUSH_BATCH + 10
    for (let i = 0; i < n; i++) await newEvent(`e${i}`)
    const res = await syncOnce(A, cloud)
    expect(res.pushed).toBe(n)
    expect(cloud.pushCalls.map((c) => c.length)).toEqual([PUSH_BATCH, 10])
  })
})

describe('the cloud is a trust boundary: remote rows are validated', () => {
  const good = { table: 'events', id: '20000000-0000-4000-8000-000000000001', updatedAt: '2026-02-01T00:00:00.000Z', deletedAt: null, seq: 1, data: { id: '20000000-0000-4000-8000-000000000001', updatedAt: '2026-02-01T00:00:00.000Z', title: 't' } }
  it('accepts a well-formed row', () => {
    expect(validateRemoteRow(good)).toMatchObject({ id: good.id, title: 't', syncedAt: null })
  })
  it('rejects unknown tables, bad ids, mismatched ids, bad timestamps, non-object data', () => {
    expect(validateRemoteRow({ ...good, table: 'users' })).toBeNull()
    expect(validateRemoteRow({ ...good, table: '__proto__' })).toBeNull()
    expect(validateRemoteRow({ ...good, id: 'not-a-uuid' })).toBeNull()
    expect(validateRemoteRow({ ...good, data: { ...good.data, id: '20000000-0000-4000-8000-00000000ffff' } })).toBeNull()
    expect(validateRemoteRow({ ...good, updatedAt: 'yesterday' })).toBeNull()
    expect(validateRemoteRow({ ...good, data: { ...good.data, updatedAt: 'x' } })).toBeNull()
    expect(validateRemoteRow({ ...good, data: null as never })).toBeNull()
    expect(validateRemoteRow({ ...good, data: [] as never })).toBeNull()
  })
  it('bad rows are skipped and counted, good ones in the same page still apply', async () => {
    cloud.rows.set('a', { ...good, seq: 1 })
    cloud.rows.set('b', { ...good, id: 'bad', seq: 2 })
    cloud.rows.set('c', { ...good, table: 'nope', seq: 3 })
    cloud.seq = 3
    const res = await syncOnce(A, cloud)
    expect(res).toMatchObject({ ok: true, applied: 1, skipped: 2 })
    expect(await A.events.count()).toBe(1)
  })
})

describe('backoff', () => {
  it('doubles from 5s up to a 5 minute ceiling; zero failures → no delay', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 20].map(backoffMs)).toEqual([0, 5000, 10000, 20000, 40000, 80000, 160000, 300000, 300000])
  })
})
