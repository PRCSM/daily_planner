import { describe, expect, it } from 'vitest'
import { addDays } from './dates'
import { daysElapsedInWeek, inPlan, phaseForWeek, phaseSpans, weekFor, weekNumberFor, weekState } from './weeks'
import { PLAN_START, mkWeeks } from '@/test/factories'

describe('weeks', () => {
  it('week numbering: Monday starts a week, Sunday ends it', () => {
    expect(weekNumberFor(PLAN_START, PLAN_START)).toBe(1)
    expect(weekNumberFor(addDays(PLAN_START, 6), PLAN_START)).toBe(1)
    expect(weekNumberFor(addDays(PLAN_START, 7), PLAN_START)).toBe(2)
    expect(weekNumberFor(addDays(PLAN_START, 17 * 7 + 6), PLAN_START)).toBe(18)
    expect(weekNumberFor(addDays(PLAN_START, 18 * 7), PLAN_START)).toBe(19)
  })
  it('before the plan is ≤ 0 — never silently week 1', () => {
    expect(weekNumberFor(addDays(PLAN_START, -1), PLAN_START)).toBe(0)
    expect(weekNumberFor(addDays(PLAN_START, -8), PLAN_START)).toBe(-1)
    expect(inPlan(0)).toBe(false)
    expect(inPlan(1)).toBe(true)
    expect(inPlan(18)).toBe(true)
    expect(inPlan(19)).toBe(false)
  })
  it('phases', () => {
    const expected = [1, 2, 2, 2, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 5, 5, 5, 5]
    const order = ['FROM_SCRATCH', 'GET_PRESENTABLE', 'UNDER_ABSTRACTIONS', 'DESIGN_GENAI', 'CONVERT']
    expected.forEach((p, i) => expect(phaseForWeek(i + 1)).toBe(order[p - 1]))
    expect(phaseForWeek(-3)).toBe('FROM_SCRATCH')
    expect(phaseForWeek(40)).toBe('CONVERT')
  })
  it('weekFor / weekState / daysElapsed', () => {
    const weeks = mkWeeks()
    const w3 = weeks[2]!
    expect(weekFor(weeks, w3.startDate)?.weekNumber).toBe(3)
    expect(weekFor(weeks, w3.endDate)?.weekNumber).toBe(3)
    expect(weekFor(weeks, addDays(PLAN_START, -1))).toBeUndefined()
    expect(weekState(w3, w3.startDate)).toBe('CURRENT')
    expect(weekState(w3, w3.endDate)).toBe('CURRENT')
    expect(weekState(w3, addDays(w3.endDate, 1))).toBe('PAST')
    expect(weekState(w3, addDays(w3.startDate, -1))).toBe('FUTURE')
    expect(daysElapsedInWeek(w3, w3.startDate)).toBe(0) // Monday morning: nothing has completed
    expect(daysElapsedInWeek(w3, addDays(w3.startDate, 3))).toBe(3)
    expect(daysElapsedInWeek(w3, addDays(w3.startDate, 40))).toBe(7)
    expect(daysElapsedInWeek(w3, addDays(w3.startDate, -5))).toBe(0)
  })
  it('phaseSpans are contiguous runs summing to 18 weeks', () => {
    const spans = phaseSpans(mkWeeks())
    expect(spans.map((s) => s.weeks)).toEqual([1, 3, 5, 5, 4])
    expect(spans.reduce((n, s) => n + s.weeks, 0)).toBe(18)
  })
})
