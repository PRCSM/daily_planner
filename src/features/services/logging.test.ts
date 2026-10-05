import { describe, expect, it } from 'vitest'
import { db } from '@/data/db'
import { ensureSeeded } from '@/data/seed'
import { addDsaProblem, addLogBlock, deleteLogBlock, editLogBlock, patchDay, reviewDsaProblem, setFuel } from './logging'
import { freshDbPerTest } from '@/test/db'
import { T0 } from '@/test/factories'
import { addDays, startOfWeek } from '@/domain/dates'

freshDbPerTest()
const MON = startOfWeek(T0)
const SAT = addDays(MON, 5)
const base = { date: MON, track: 'DSA' as const, minutes: 60, aiUsed: false }

describe('logging service', () => {
  it('creates the day’s log on first block with week + phase derived from the plan', async () => {
    await ensureSeeded()
    await addLogBlock(base)
    const log = (await db.dailyLogs.toArray())[0]!
    expect(log.date).toBe(MON)
    expect(log.weekNumber).toBe(4) // T0 is the Monday of week 4
    expect(log.phase).toBe('GET_PRESENTABLE')
  })
  it('works before the plan is loaded (falls back to the plan start)', async () => {
    await addLogBlock(base)
    expect((await db.dailyLogs.toArray())[0]!.weekNumber).toBe(4)
  })
  it('derives blockType at write time: DEEP_A / DEEP_B / BLOCK_C / AD_HOC on weekdays, WEEKEND on weekends', async () => {
    const a = await addLogBlock(base)
    const b = await addLogBlock({ ...base, track: 'CORE_CS' })
    const c = await addLogBlock({ ...base, track: 'APPLICATIONS', aiUsed: true })
    const d = await addLogBlock({ ...base, track: 'DSA' }) // the 4th block of the day
    expect([a, b, c, d].map((x) => x.blockType)).toEqual(['DEEP_A', 'DEEP_B', 'BLOCK_C', 'AD_HOC'])
    expect((await addLogBlock({ ...base, date: SAT })).blockType).toBe('WEEKEND')
  })
  it('blockType is stored, NOT recomputed, when a block is later edited or its siblings are deleted', async () => {
    const [a, b, c, d] = [await addLogBlock(base), await addLogBlock(base), await addLogBlock(base), await addLogBlock(base)]
    expect(d.blockType).toBe('AD_HOC')
    await deleteLogBlock(a.id)
    await deleteLogBlock(b.id)
    await editLogBlock(d.id, { minutes: 90 })
    expect((await db.logBlocks.get(d.id))!.blockType).toBe('AD_HOC')
    expect((await db.logBlocks.get(c.id))!.blockType).toBe('DEEP_A')
  })
  it('rejects zero/negative minutes and trims topics', async () => {
    await expect(addLogBlock({ ...base, minutes: 0 })).rejects.toThrow()
    expect((await addLogBlock({ ...base, topic: '  two pointers  ' })).topic).toBe('two pointers')
    expect((await addLogBlock({ ...base, topic: '   ' })).topic).toBeUndefined()
  })
  it('aiOffRespected is derived from learning blocks only, and re-derived on edit/delete', async () => {
    const proj = await addLogBlock({ ...base, track: 'PROJECT', aiUsed: true })
    expect((await db.dailyLogs.toArray())[0]!.aiOffRespected).toBe(true) // AI on a shipping block is fine
    const learn = await addLogBlock({ ...base, aiUsed: true })
    expect((await db.dailyLogs.toArray())[0]!.aiOffRespected).toBe(false)
    await editLogBlock(learn.id, { aiUsed: false })
    expect((await db.dailyLogs.toArray())[0]!.aiOffRespected).toBe(true)
    await editLogBlock(learn.id, { aiUsed: true })
    await deleteLogBlock(learn.id)
    expect((await db.dailyLogs.toArray())[0]!.aiOffRespected).toBe(true)
    expect(proj.aiUsed).toBe(true)
  })
  it('backfills any date, creating that date’s own log (not today’s)', async () => {
    await addLogBlock({ ...base, date: addDays(MON, -3) })
    await addLogBlock(base)
    expect((await db.dailyLogs.toArray()).map((l) => l.date).sort()).toEqual([addDays(MON, -3), MON])
  })
  it('patchDay (one-liners, applications stepper) and setFuel mark fuel as ENTERED', async () => {
    await patchDay(MON, { shipped: 'the sheet', blockers: 'none', applicationsSent: 2 })
    let log = (await db.dailyLogs.toArray())[0]!
    expect(log).toMatchObject({ shipped: 'the sheet', applicationsSent: 2 })
    expect(log.fuelEntered).toBeUndefined() // writing a one-liner never fabricates fuel
    await setFuel(MON, { sleepHours: 6.5 })
    log = (await db.dailyLogs.toArray())[0]!
    expect(log).toMatchObject({ sleepHours: 6.5, fuelEntered: true })
    expect(await db.dailyLogs.count()).toBe(1)
  })
  it('DSA: schedule comes from the outcome; unaided → no review; anything else → +7d', async () => {
    const clean = await addDsaProblem({ title: 'Two Sum', pattern: 'Hashing', difficulty: 'EASY', status: 'SOLVED_UNAIDED', solvedDate: MON })
    const hint = await addDsaProblem({ title: '3Sum', pattern: 'Two pointers', difficulty: 'MEDIUM', status: 'SOLVED_WITH_HINT', solvedDate: MON })
    const failed = await addDsaProblem({ title: 'LRU', pattern: 'Hashing', difficulty: 'HARD', status: 'FAILED', solvedDate: MON })
    expect(clean.reviewDue).toBeNull()
    expect(hint.reviewDue).toBe(addDays(MON, 7))
    expect(failed.reviewDue).toBe(addDays(MON, 7))
    expect(clean.source).toBe('LeetCode')
  })
  it('reviewing: clean clears; not clean → +21d from the review date', async () => {
    const p = await addDsaProblem({ title: 'x', pattern: 'DP', difficulty: 'HARD', status: 'LOOKED_AT_SOLUTION', solvedDate: MON })
    const late = addDays(MON, 12)
    const r1 = await reviewDsaProblem(p.id, false, late)
    expect(r1).toMatchObject({ reviewDue: addDays(late, 21), reviewCount: 1, lastReviewedDate: late })
    const r2 = await reviewDsaProblem(p.id, true, addDays(late, 21))
    expect(r2).toMatchObject({ reviewDue: null, reviewCount: 2 })
    await expect(reviewDsaProblem('nope', true, late)).rejects.toThrow()
  })
})
