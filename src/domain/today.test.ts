import { describe, expect, it } from 'vitest'
import { addDays } from './dates'
import { deadlinePill, groupBySection, plannedMinutes, sectionFor, splitToday } from './today'
import { occurrencesOn } from './recurrence'
import { T0, mkEvent } from '@/test/factories'

describe('today', () => {
  it('sections by start time; untimed → Morning', () => {
    expect(sectionFor()).toBe('Morning')
    expect(sectionFor('00:00')).toBe('Morning')
    expect(sectionFor('11:59')).toBe('Morning')
    expect(sectionFor('12:00')).toBe('Afternoon')
    expect(sectionFor('16:59')).toBe('Afternoon')
    expect(sectionFor('17:00')).toBe('Evening')
    expect(sectionFor('23:30')).toBe('Evening')
  })
  it('groupBySection keeps order within a section', () => {
    const g = groupBySection([{ startTime: '19:00', n: 1 }, { n: 2 }, { startTime: '13:00', n: 3 }, { startTime: '20:00', n: 4 }])
    expect(g.Morning.map((x) => x.n)).toEqual([2])
    expect(g.Afternoon.map((x) => x.n)).toEqual([3])
    expect(g.Evening.map((x) => x.n)).toEqual([1, 4])
  })
  it('splits study blocks from due items; INFO items are not "due"', () => {
    const occ = occurrencesOn([mkEvent({ type: 'STUDY_BLOCK' }), mkEvent({ type: 'MILESTONE', criticality: 'HARD' }), mkEvent({ type: 'HIRING_WINDOW', criticality: 'INFO' })], [], T0)
    const { blocks, due } = splitToday(occ)
    expect(blocks).toHaveLength(1)
    expect(due.map((o) => o.event.type)).toEqual(['MILESTONE'])
  })
  it('deadline pill: HARD, not done, within <14 days; nearest wins', () => {
    const far = mkEvent({ title: 'far', criticality: 'HARD', date: addDays(T0, 13) })
    const near = mkEvent({ title: 'near', criticality: 'HARD', date: addDays(T0, 4) })
    expect(deadlinePill([far, near], T0)).toEqual({ title: 'near', date: addDays(T0, 4), daysLeft: 4 })
    expect(deadlinePill([far], T0)?.daysLeft).toBe(13)
  })
  it('exactly 14 days away is outside the horizon; today is inside; yesterday is not', () => {
    expect(deadlinePill([mkEvent({ criticality: 'HARD', date: addDays(T0, 14) })], T0)).toBeNull()
    expect(deadlinePill([mkEvent({ criticality: 'HARD', date: T0 })], T0)?.daysLeft).toBe(0)
    expect(deadlinePill([mkEvent({ criticality: 'HARD', date: addDays(T0, -1) })], T0)).toBeNull()
  })
  it('ignores SOFT/INFO, done, deleted and study blocks', () => {
    const base = { date: addDays(T0, 2) }
    const ev = [mkEvent({ ...base, criticality: 'SOFT' }), mkEvent({ ...base, criticality: 'HARD', done: true }), { ...mkEvent({ ...base, criticality: 'HARD' }), deletedAt: 'x' }, mkEvent({ ...base, criticality: 'HARD', type: 'STUDY_BLOCK' })]
    expect(deadlinePill(ev, T0)).toBeNull()
  })
  it('for a span the deadline is its END', () => {
    const w = mkEvent({ criticality: 'HARD', type: 'HIRING_WINDOW', date: addDays(T0, -20), endDate: addDays(T0, 6) })
    expect(deadlinePill([w], T0)).toMatchObject({ daysLeft: 6, date: addDays(T0, 6) })
  })
  it('planned minutes', () => {
    expect(plannedMinutes({ startTime: '09:00', endTime: '10:15' })).toBe(75)
    expect(plannedMinutes({ startTime: '09:00' })).toBeNull()
    expect(plannedMinutes({ startTime: '10:00', endTime: '09:00' })).toBe(0)
  })
})
