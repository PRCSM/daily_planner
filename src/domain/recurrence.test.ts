import { describe, expect, it } from 'vitest'
import { addDays, dayOfWeek, eachDay, startOfWeek } from './dates'
import { describeRecurrence, expandEvents, occurrencesOn, patternDates } from './recurrence'
import { T0, mkAnn, mkEvent } from '@/test/factories'

const MON = startOfWeek(T0) // anchor Monday
const dates = (o: { date: string }[]) => o.map((x) => x.date)

describe('patternDates', () => {
  it('NONE: just the anchor, only if inside the window', () => {
    const e = mkEvent({ date: T0 })
    expect(patternDates(e, T0, T0)).toEqual([T0])
    expect(patternDates(e, addDays(T0, 1), addDays(T0, 9))).toEqual([])
    expect(patternDates(e, addDays(T0, -9), addDays(T0, -1))).toEqual([])
  })
  it('NONE with endDate is a SPAN across every date in range', () => {
    const e = mkEvent({ date: T0, endDate: addDays(T0, 4) })
    expect(patternDates(e, addDays(T0, -10), addDays(T0, 10))).toEqual(eachDay(T0, addDays(T0, 4)))
    expect(patternDates(e, addDays(T0, 2), addDays(T0, 3))).toEqual([addDays(T0, 2), addDays(T0, 3)])
  })
  it('NONE with a nonsense endDate (< date) falls back to a single day', () => {
    expect(patternDates(mkEvent({ date: T0, endDate: addDays(T0, -3) }), addDays(T0, -9), addDays(T0, 9))).toEqual([T0])
  })
  it('DAILY every day from the anchor, never before', () => {
    const e = mkEvent({ date: T0, recurrence: 'DAILY' })
    expect(patternDates(e, addDays(T0, -3), addDays(T0, 2))).toEqual(eachDay(T0, addDays(T0, 2)))
  })
  it('WEEKDAYS is Mon–Fri only', () => {
    const e = mkEvent({ date: MON, recurrence: 'WEEKDAYS' })
    const out = patternDates(e, MON, addDays(MON, 13))
    expect(out).toHaveLength(10)
    expect(out.every((d) => dayOfWeek(d) >= 1 && dayOfWeek(d) <= 5)).toBe(true)
  })
  it('WEEKLY is every 7 days from the anchor, even when the window starts mid-cycle', () => {
    const e = mkEvent({ date: addDays(MON, 2), recurrence: 'WEEKLY' }) // a Wednesday
    expect(patternDates(e, addDays(MON, 3), addDays(MON, 30))).toEqual([addDays(MON, 9), addDays(MON, 16), addDays(MON, 23), addDays(MON, 30)])
    expect(patternDates(e, addDays(MON, -20), addDays(MON, 3))).toEqual([addDays(MON, 2)])
  })
  it('recurrence endDate is inclusive; no endDate runs forever', () => {
    const until = addDays(MON, 14)
    const e = mkEvent({ date: MON, recurrence: 'WEEKLY', endDate: until })
    expect(patternDates(e, MON, addDays(MON, 100))).toEqual([MON, addDays(MON, 7), until])
    expect(patternDates(mkEvent({ date: MON, recurrence: 'WEEKLY' }), MON, addDays(MON, 100)).length).toBe(15)
  })
  it('inverted window → empty; oversized windows are capped, not infinite', () => {
    expect(patternDates(mkEvent({ recurrence: 'DAILY' }), addDays(T0, 5), T0)).toEqual([])
    expect(patternDates(mkEvent({ date: T0, recurrence: 'DAILY' }), T0, addDays(T0, 100000)).length).toBeLessThan(900)
  })
})

describe('expandEvents + annotations', () => {
  const weekly = mkEvent({ id: 'w', title: 'Review', date: MON, recurrence: 'WEEKLY', startTime: '10:00', endTime: '11:00' })

  it('does not materialise: one event expands to many occurrences', () => {
    const occ = expandEvents([weekly], [], MON, addDays(MON, 27))
    expect(dates(occ)).toEqual([MON, addDays(MON, 7), addDays(MON, 14), addDays(MON, 21)])
    expect(new Set(occ.map((o) => o.key)).size).toBe(4)
  })
  it('DONE marks only that occurrence', () => {
    const ann = mkAnn({ eventId: 'w', occurrenceDate: addDays(MON, 7), status: 'DONE', completedAt: 'x' })
    const occ = expandEvents([weekly], [ann], MON, addDays(MON, 14))
    expect(occ.map((o) => o.done)).toEqual([false, true, false])
  })
  it('SKIPPED removes the occurrence', () => {
    const ann = mkAnn({ eventId: 'w', occurrenceDate: addDays(MON, 7), status: 'SKIPPED' })
    expect(dates(expandEvents([weekly], [ann], MON, addDays(MON, 14)))).toEqual([MON, addDays(MON, 14)])
  })
  it('EDITED overrides title/time/notes for one occurrence only', () => {
    const ann = mkAnn({ eventId: 'w', occurrenceDate: MON, status: 'EDITED', overrideTitle: 'Review (long)', overrideStartTime: '09:00', overrideEndTime: '12:00', overrideNotes: 'n' })
    const [first, second] = expandEvents([weekly], [ann], MON, addDays(MON, 7))
    expect(first).toMatchObject({ title: 'Review (long)', startTime: '09:00', endTime: '12:00', notes: 'n', edited: true })
    expect(second).toMatchObject({ title: 'Review', startTime: '10:00', edited: false })
  })
  it('MOVED PLACES the occurrence on a date the pattern never produces', () => {
    const target = addDays(MON, 3) // a Thursday — the weekly-Monday pattern never lands here
    const ann = mkAnn({ eventId: 'w', occurrenceDate: addDays(MON, 7), status: 'MOVED', movedToDate: target })
    const occ = expandEvents([weekly], [ann], MON, addDays(MON, 14))
    expect(dates(occ)).toEqual([MON, target, addDays(MON, 14)])
    const moved = occ.find((o) => o.date === target)!
    expect(moved).toMatchObject({ moved: true, originalDate: addDays(MON, 7), key: `w@${addDays(MON, 7)}` })
    expect(occ.some((o) => o.date === addDays(MON, 7))).toBe(false) // gone from the original date
  })
  it('a moved occurrence appears even when its ORIGINAL date is outside the window', () => {
    const ann = mkAnn({ eventId: 'w', occurrenceDate: addDays(MON, 21), status: 'MOVED', movedToDate: addDays(MON, 2) })
    expect(dates(expandEvents([weekly], [ann], addDays(MON, 1), addDays(MON, 3)))).toEqual([addDays(MON, 2)])
  })
  it('a moved occurrence outside the window is not shown', () => {
    const ann = mkAnn({ eventId: 'w', occurrenceDate: MON, status: 'MOVED', movedToDate: addDays(MON, 40) })
    expect(expandEvents([weekly], [ann], MON, addDays(MON, 6))).toEqual([])
  })
  it('MOVED with a missing event or onto itself is harmless', () => {
    const ghost = mkAnn({ eventId: 'nope', occurrenceDate: MON, status: 'MOVED', movedToDate: addDays(MON, 1) })
    const same = mkAnn({ eventId: 'w', occurrenceDate: MON, status: 'MOVED', movedToDate: MON })
    expect(dates(expandEvents([weekly], [ghost, same], MON, addDays(MON, 6)))).toEqual([MON])
  })
  it('soft-deleted annotations and events are ignored', () => {
    const ann = { ...mkAnn({ eventId: 'w', occurrenceDate: MON, status: 'SKIPPED' }), deletedAt: 'x' }
    expect(expandEvents([weekly], [ann], MON, MON)).toHaveLength(1)
    expect(expandEvents([{ ...weekly, deletedAt: 'x' }], [], MON, MON)).toEqual([])
  })
  it('non-recurring done comes from the event itself', () => {
    const e = mkEvent({ date: T0, done: true })
    expect(occurrencesOn([e], [], T0)[0]!.done).toBe(true)
  })
  it('spans carry their position', () => {
    const e = mkEvent({ date: T0, endDate: addDays(T0, 2) })
    const occ = expandEvents([e], [], T0, addDays(T0, 5))
    expect(occ.map((o) => o.span)).toEqual([
      { index: 0, length: 3, isStart: true, isEnd: false },
      { index: 1, length: 3, isStart: false, isEnd: false },
      { index: 2, length: 3, isStart: false, isEnd: true },
    ])
  })
  it('sorts by date, then time (untimed first), then title', () => {
    const a = mkEvent({ id: 'a', title: 'B', startTime: '10:00' })
    const b = mkEvent({ id: 'b', title: 'A', startTime: '09:00' })
    const c = mkEvent({ id: 'c', title: 'Z' })
    expect(occurrencesOn([a, b, c], [], T0).map((o) => o.eventId)).toEqual(['c', 'b', 'a'])
  })
  it('describes recurrences', () => {
    expect(describeRecurrence(mkEvent())).toBe('One-off')
    expect(describeRecurrence(mkEvent({ recurrence: 'DAILY' }))).toBe('Every day')
    expect(describeRecurrence(mkEvent({ recurrence: 'WEEKDAYS' }))).toBe('Mon–Fri')
    expect(describeRecurrence(mkEvent({ recurrence: 'WEEKLY', date: MON }))).toBe('Weekly on Mon')
  })
})
