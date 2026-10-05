import { describe, expect, it, vi } from 'vitest'
import { db } from '@/data/db'
import { advanceApplication, createApplication, setFollowUp } from './applications'
import { freshDbPerTest } from '@/test/db'
import { T0 } from '@/test/factories'
import { addDays } from '@/domain/dates'
import { APPLICATION_STATUSES } from '@/lib/enums'
import { canTransition } from '@/domain/applicationsFsm'

freshDbPerTest()
const mk = (startStatus: 'SAVED' | 'APPLIED' = 'SAVED') => createApplication({ company: 'Acme', role: 'SDE', type: 'FULL_TIME', startStatus, url: 'https://acme.test/jobs/1' }, T0)

describe('applications service', () => {
  it('SAVED creates no follow-up and no log entry', async () => {
    const a = await mk()
    expect(a.status).toBe('SAVED')
    expect(await db.events.count()).toBe(0)
    expect(await db.dailyLogs.count()).toBe(0)
  })
  it('applying stamps appliedDate, schedules a follow-up EVENT on the one timeline, and counts toward today’s applications sent', async () => {
    const a = await mk()
    const r = await advanceApplication(a.id, 'APPLIED', T0)
    expect(r.ok).toBe(true)
    const app = (await db.applications.get(a.id))!
    expect(app).toMatchObject({ status: 'APPLIED', appliedDate: T0, nextFollowUp: addDays(T0, 7) })
    const ev = (await db.events.toArray())[0]!
    expect(ev).toMatchObject({ type: 'APPLICATION_TASK', date: addDays(T0, 7), sourceModule: 'APPLICATION', title: 'Follow up: Acme — SDE', linkUrl: 'https://acme.test/jobs/1' })
    expect(app.followUpEventId).toBe(ev.id)
    expect((await db.dailyLogs.toArray())[0]!.applicationsSent).toBe(1)
  })
  it('creating directly as APPLIED does the same in one step', async () => {
    const a = await mk('APPLIED')
    expect(a).toMatchObject({ status: 'APPLIED', appliedDate: T0 })
    expect(await db.events.count()).toBe(1)
    expect((await db.dailyLogs.toArray())[0]!.applicationsSent).toBe(1)
  })
  it('walks a legal path SAVED → APPLIED → OA → OA → INTERVIEW → OFFER, rescheduling follow-ups on new stages', async () => {
    const a = await mk()
    for (const [s, d] of [['APPLIED', 0], ['OA', 3], ['OA', 5], ['INTERVIEW', 9], ['OFFER', 12]] as const) {
      expect((await advanceApplication(a.id, s, addDays(T0, d))).ok, s).toBe(true)
    }
    const final = (await db.applications.get(a.id))!
    expect(final.status).toBe('OFFER')
    expect(final.nextFollowUp).toBeUndefined() // closed out
    expect((await db.events.toArray())[0]!.done).toBe(true)
    expect(await db.events.count()).toBe(1) // ONE follow-up event, rescheduled — not one per stage
  })
  it('illegal transitions are rejected and change nothing — all of them, exhaustively', async () => {
    for (const from of APPLICATION_STATUSES) {
      for (const to of APPLICATION_STATUSES) {
        if (canTransition(from, to)) continue
        const a = await createApplication({ company: `${from}->${to}`, role: 'r', type: 'OTHER', startStatus: 'SAVED' }, T0)
        await db.applications.update(a.id, { status: from }) // force the starting state
        const r = await advanceApplication(a.id, to, T0)
        expect(r, `${from}→${to}`).toMatchObject({ ok: false })
        expect((await db.applications.get(a.id))!.status).toBe(from)
      }
    }
  })
  it('REJECTED is terminal; GHOSTED can revive to INTERVIEW', async () => {
    const a = await mk()
    await advanceApplication(a.id, 'APPLIED', T0)
    await advanceApplication(a.id, 'GHOSTED', addDays(T0, 30))
    expect((await advanceApplication(a.id, 'INTERVIEW', addDays(T0, 31))).ok).toBe(true)
    await advanceApplication(a.id, 'REJECTED', addDays(T0, 40))
    expect((await advanceApplication(a.id, 'APPLIED', addDays(T0, 41)))).toMatchObject({ ok: false })
  })
  it('missing application → a clean failure', async () => {
    expect(await advanceApplication('nope', 'APPLIED', T0)).toEqual({ ok: false, reason: 'Application not found' })
  })
  it('setFollowUp moves or removes the follow-up event', async () => {
    const a = await mk('APPLIED')
    await setFollowUp(a.id, addDays(T0, 20))
    expect((await db.events.toArray())[0]!.date).toBe(addDays(T0, 20))
    await setFollowUp(a.id, undefined)
    expect((await db.events.toArray())[0]!.deletedAt).not.toBeNull()
    expect((await db.applications.get(a.id))!.nextFollowUp).toBeUndefined()
  })
})

describe('applications are written ATOMICALLY (a closed tab or a failed step never leaves half an application)', () => {
  it('if the log write fails, the application and its follow-up event are rolled back', async () => {
    vi.spyOn(db.dailyLogs, 'put').mockRejectedValueOnce(new Error('boom'))
    await expect(createApplication({ company: 'Acme', role: 'SDE', type: 'FULL_TIME', startStatus: 'APPLIED' }, T0)).rejects.toThrow()
    expect(await db.applications.count()).toBe(0)
    expect(await db.events.count()).toBe(0)
    expect(await db.dailyLogs.count()).toBe(0)
    vi.restoreAllMocks()
  })
  it('advancing to APPLIED rolls back the status too when a later step fails', async () => {
    const a = await createApplication({ company: 'Acme', role: 'SDE', type: 'FULL_TIME', startStatus: 'SAVED' }, T0)
    vi.spyOn(db.dailyLogs, 'put').mockRejectedValueOnce(new Error('boom'))
    await expect(advanceApplication(a.id, 'APPLIED', T0)).rejects.toThrow()
    expect((await db.applications.get(a.id))).toMatchObject({ status: 'SAVED' })
    expect((await db.applications.get(a.id))!.appliedDate).toBeUndefined()
    expect(await db.events.count()).toBe(0)
    vi.restoreAllMocks()
  })
})
