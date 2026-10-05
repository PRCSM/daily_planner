import { describe, expect, it } from 'vitest'
import * as D from './dates'
import { T0 } from '@/test/factories'

describe('dates', () => {
  it('addDays / diffDays are inverse for any offset (round-trip property)', () => {
    for (let n = -800; n <= 800; n += 37) expect(D.diffDays(T0, D.addDays(T0, n))).toBe(n)
  })
  it('crosses month, year and leap boundaries without drifting', () => {
    expect(D.addDays('2026-02-28', 1)).toBe('2026-03-01')
    expect(D.addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(D.addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(D.addDays('2026-01-01', -1)).toBe('2025-12-31')
  })
  it('is immune to DST (a 365-day hop is always 365 days)', () => {
    expect(D.diffDays('2026-03-01', '2027-03-01')).toBe(365)
    expect(D.diffDays('2026-03-28', '2026-03-30')).toBe(2)
    expect(D.diffDays('2026-10-24', '2026-10-26')).toBe(2)
  })
  it('validates dates and times strictly', () => {
    expect(D.isValidDate(T0)).toBe(true)
    expect(D.isValidDate('2026-02-30')).toBe(false)
    expect(D.isValidDate('2026-2-3')).toBe(false)
    expect(D.isValidDate(20260101)).toBe(false)
    expect(D.isValidTime('23:59')).toBe(true)
    expect(D.isValidTime('24:00')).toBe(false)
    expect(D.isValidTime('9:00')).toBe(false)
  })
  it('weekday maths: Monday-first week', () => {
    const mon = D.startOfWeek(T0)
    expect(D.dayOfWeek(mon)).toBe(1)
    expect(D.startOfWeek(D.addDays(mon, 6))).toBe(mon) // Sunday belongs to the Monday before
    expect(D.endOfWeek(T0)).toBe(D.addDays(mon, 6))
    expect(D.isWeekend(D.addDays(mon, 5))).toBe(true)
    expect(D.isWeekend(D.addDays(mon, 6))).toBe(true)
    expect(D.isWeekday(D.addDays(mon, 4))).toBe(true)
    expect(D.dayOfWeek(D.addDays(mon, 6))).toBe(0)
  })
  it('eachDay is inclusive; month helpers', () => {
    expect(D.eachDay(T0, D.addDays(T0, 3))).toHaveLength(4)
    expect(D.eachDay(T0, D.addDays(T0, -1))).toEqual([])
    expect(D.startOfMonth('2026-08-17')).toBe('2026-08-01')
    expect(D.endOfMonth('2026-02-10')).toBe('2026-02-28')
    expect(D.addMonths('2026-12-15', 2)).toBe('2027-02-01')
    expect(D.addMonths('2026-03-31', -1)).toBe('2026-02-01')
    expect(D.monthKey('2026-08-17')).toBe('2026-08')
    expect(D.monthLabel('2026-08-17')).toBe('August 2026')
  })
  it('monthGrid is whole Monday-first weeks covering the month', () => {
    const g = D.monthGrid('2026-08-10')
    expect(g.length % 7).toBe(0)
    expect(D.dayOfWeek(g[0]!)).toBe(1)
    expect(g).toContain('2026-08-01')
    expect(g).toContain('2026-08-31')
  })
  it('compare / min / max', () => {
    expect(D.compareDates('2026-01-01', '2026-01-02')).toBe(-1)
    expect(D.compareDates('2026-01-02', '2026-01-01')).toBe(1)
    expect(D.compareDates(T0, T0)).toBe(0)
    expect(D.maxDate('2026-01-01', '2026-01-02')).toBe('2026-01-02')
    expect(D.minDate('2026-01-01', '2026-01-02')).toBe('2026-01-01')
  })
  it('relativeDay derives from the injected today', () => {
    expect(D.relativeDay(T0, T0)).toBe('today')
    expect(D.relativeDay(D.addDays(T0, 1), T0)).toBe('tomorrow')
    expect(D.relativeDay(D.addDays(T0, -1), T0)).toBe('yesterday')
    expect(D.relativeDay(D.addDays(T0, 5), T0)).toBe('in 5d')
    expect(D.relativeDay(D.addDays(T0, -4), T0)).toBe('4d ago')
  })
  it('formats', () => {
    expect(D.formatDay('2026-08-04')).toBe('Tue 4 Aug')
    expect(D.formatLong('2026-08-04')).toBe('Tuesday, 4 August')
  })
  it('wall-clock minutes', () => {
    expect(D.toMinutes('07:30')).toBe(450)
    expect(D.fromMinutes(450)).toBe('07:30')
    expect(D.fromMinutes(-5)).toBe('00:00')
    expect(D.fromMinutes(99999)).toBe('23:59')
    expect(D.durationMinutes('09:00', '10:30')).toBe(90)
    expect(D.durationMinutes('10:00', '09:00')).toBe(0)
    expect(D.snapMinutes(67)).toBe(60)
    expect(D.snapMinutes(68)).toBe(75)
    expect(D.formatDuration(45)).toBe('45m')
    expect(D.formatDuration(120)).toBe('2h')
    expect(D.formatDuration(135)).toBe('2h 15m')
  })
})
