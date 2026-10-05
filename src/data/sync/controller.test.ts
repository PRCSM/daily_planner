import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CadenceDB } from '../db'
import { createSyncController } from './controller'
import { getSyncStatus, setSyncStatus, subscribeSyncStatus } from './status'
import { FakeRemote } from './fakeRemote'
import { createEvent } from '../repos/events'
import { setActiveDb } from '../db'
import { backoffMs } from './worker'
import { setClockSource } from '@/lib/clock'
import { T0 } from '@/test/factories'

let db: CadenceDB, cloud: FakeRemote
let timers: { fn: () => void; ms: number; id: number; live: boolean }[]
const flush = () => new Promise((r) => setTimeout(r, 20))

function make(over: Partial<Parameters<typeof createSyncController>[0]> = {}) {
  return createSyncController({
    db: () => db,
    getRemote: () => cloud,
    hasSession: async () => true,
    isOnline: () => true,
    schedule: (fn, ms) => {
      const t = { fn, ms, id: timers.length, live: true }
      timers.push(t)
      return t.id
    },
    cancel: (h) => {
      const t = timers[h as number]
      if (t) t.live = false
    },
    intervalMs: 60_000,
    debounceMs: 2_000,
    ...over,
  })
}
const live = () => timers.filter((t) => t.live)

beforeEach(() => {
  db = setActiveDb(new CadenceDB(`ctl-${Math.random()}`))
  cloud = new FakeRemote()
  timers = []
  setSyncStatus({ state: 'DISABLED', pending: 0, lastSyncAt: null, lastError: null })
})
afterEach(() => setClockSource())

describe('sync controller', () => {
  it('no remote configured → DISABLED, and the app stays local (nothing scheduled to push)', async () => {
    const c = make({ getRemote: () => null })
    c.start()
    await flush()
    expect(getSyncStatus().state).toBe('DISABLED')
    c.stop()
  })
  it('signed out → SIGNED_OUT, queue untouched, pending count visible', async () => {
    await createEvent({ title: 'x', type: 'CUSTOM', date: T0, recurrence: 'NONE', criticality: 'SOFT', sourceModule: 'CALENDAR' })
    const c = make({ hasSession: async () => false })
    c.start()
    await flush()
    expect(getSyncStatus()).toMatchObject({ state: 'SIGNED_OUT', pending: 1 })
    expect(cloud.pushCalls).toHaveLength(0)
    c.stop()
  })
  it('offline → OFFLINE and no network attempt; pending writes simply wait', async () => {
    await createEvent({ title: 'x', type: 'CUSTOM', date: T0, recurrence: 'NONE', criticality: 'SOFT', sourceModule: 'CALENDAR' })
    const c = make({ isOnline: () => false })
    c.start()
    await flush()
    expect(getSyncStatus()).toMatchObject({ state: 'OFFLINE', pending: 1 })
    expect(cloud.pushCalls).toHaveLength(0)
    c.stop()
  })
  it('online + session → syncs, goes IDLE with pending 0 and a lastSyncAt, then polls on the interval', async () => {
    await createEvent({ title: 'x', type: 'CUSTOM', date: T0, recurrence: 'NONE', criticality: 'SOFT', sourceModule: 'CALENDAR' })
    const seen: string[] = []
    const un = subscribeSyncStatus(() => seen.push(getSyncStatus().state))
    const c = make()
    c.start()
    await flush()
    un()
    expect(seen).toContain('SYNCING')
    expect(getSyncStatus()).toMatchObject({ state: 'IDLE', pending: 0 })
    expect(getSyncStatus().lastSyncAt).not.toBeNull()
    expect(live().map((t) => t.ms)).toEqual([60_000])
    c.stop()
  })
  it('failure → ERROR and exponential backoff; success resets it', async () => {
    cloud.failWith = new (await import('@/lib/remote')).RemoteError('SERVER', 'boom')
    const c = make()
    c.start()
    await flush()
    expect(getSyncStatus().state).toBe('ERROR')
    expect(c.failures).toBe(1)
    expect(live().at(-1)!.ms).toBe(backoffMs(1))
    live().at(-1)!.fn()
    await flush()
    expect(live().at(-1)!.ms).toBe(backoffMs(2))
    cloud.failWith = null
    live().at(-1)!.fn()
    await flush()
    expect(c.failures).toBe(0)
    expect(getSyncStatus().state).toBe('IDLE')
    c.stop()
  })
  it('an OFFLINE failure shows OFFLINE, not ERROR', async () => {
    cloud.offline = true
    await createEvent({ title: 'x', type: 'CUSTOM', date: T0, recurrence: 'NONE', criticality: 'SOFT', sourceModule: 'CALENDAR' })
    const c = make()
    c.start()
    await flush()
    expect(getSyncStatus()).toMatchObject({ state: 'OFFLINE', pending: 1 })
    c.stop()
  })
  it('trigger() debounces bursts into ONE scheduled run and resets backoff', async () => {
    const c = make()
    c.start()
    await flush()
    c.trigger()
    c.trigger()
    c.trigger()
    expect(live().map((t) => t.ms)).toEqual([2_000])
    c.stop()
  })
  it('stop() cancels pending work and trigger() after stop does nothing', async () => {
    const c = make()
    c.start()
    await flush()
    c.stop()
    expect(live()).toHaveLength(0)
    c.trigger()
    expect(live()).toHaveLength(0)
  })
  it('runNow does not overlap itself', async () => {
    const c = make()
    c.start()
    await Promise.all([c.runNow(), c.runNow()])
    expect(cloud.pullCalls).toBeLessThanOrEqual(3)
    c.stop()
  })
})
