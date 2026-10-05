import { describe, expect, it } from 'vitest'
import { addDays } from './dates'
import * as P from './progress'
import { PLAN_START, mkBlock, mkLog, mkProblem, mkWeek, mkWeeks } from '@/test/factories'

describe('targets', () => {
  it('DSA target is the SUM of the weekly targets, never a literal', () => {
    expect(P.dsaTargetTotal(mkWeeks(18, 20))).toBe(360)
    expect(P.dsaTargetTotal([mkWeek(1, { dsaTarget: 3 }), mkWeek(2, { dsaTarget: 25 })])).toBe(28)
    expect(P.dsaTargetTotal([])).toBe(0)
    expect(P.applicationTargetTotal([mkWeek(1, { applicationTarget: 4 }), mkWeek(2, { applicationTarget: 6 })])).toBe(10)
  })
  it('FAILED attempts are not "done"; the other three outcomes are', () => {
    const ps = [mkProblem({ status: 'SOLVED_UNAIDED' }), mkProblem({ status: 'SOLVED_WITH_HINT' }), mkProblem({ status: 'LOOKED_AT_SOLUTION' }), mkProblem({ status: 'FAILED' })]
    expect(P.dsaDoneTotal(ps)).toBe(3)
  })
  it('counts within an inclusive range', () => {
    const ps = [mkProblem({ solvedDate: PLAN_START }), mkProblem({ solvedDate: addDays(PLAN_START, 6) }), mkProblem({ solvedDate: addDays(PLAN_START, 7) })]
    expect(P.dsaDoneInRange(ps, PLAN_START, addDays(PLAN_START, 6))).toBe(2)
  })
})

describe('weekVerdict — pro-rata for the current week', () => {
  const w = mkWeek(3, { dsaTarget: 21 })
  const at = (n: number) => addDays(w.startDate, n)

  it('Monday morning is never red, even at 0 actual (nothing has elapsed)', () => {
    expect(P.weekVerdict(w, 21, 0, at(0))).toMatchObject({ verdict: 'ON_TRACK', expected: 0 })
  })
  it('judged against days COMPLETED: Thursday morning (3 days done) expects floor(21*3/7)=9', () => {
    expect(P.weekVerdict(w, 21, 9, at(3))).toMatchObject({ verdict: 'ON_TRACK', expected: 9 })
    expect(P.weekVerdict(w, 21, 8, at(3))).toMatchObject({ verdict: 'BEHIND', expected: 9, shortBy: 1 })
  })
  it('rounds the expectation DOWN so a fractional day is never held against you', () => {
    const w2 = mkWeek(3, { dsaTarget: 20 }) // 20*1/7 = 2.86 → 2
    expect(P.weekVerdict(w2, 20, 2, addDays(w2.startDate, 1)).verdict).toBe('ON_TRACK')
    expect(P.weekVerdict(w2, 20, 1, addDays(w2.startDate, 1)).verdict).toBe('BEHIND')
  })
  it('ahead of pace is simply on track (uncoloured), not a celebration', () => {
    expect(P.weekVerdict(w, 21, 30, at(2)).verdict).toBe('ON_TRACK')
  })
  it('a PAST week is judged on the raw target', () => {
    expect(P.weekVerdict(w, 21, 20, at(9))).toMatchObject({ verdict: 'BEHIND', shortBy: 1, expected: 21 })
    expect(P.weekVerdict(w, 21, 21, at(9)).verdict).toBe('ON_TRACK')
  })
  it('a FUTURE week gets NO verdict — never green', () => {
    expect(P.weekVerdict(w, 21, 0, at(-1))).toMatchObject({ verdict: null, expected: null })
    expect(P.weekVerdict(w, 21, 99, at(-30)).verdict).toBeNull()
  })
  it('the last day of the week (Sunday) expects 6/7 of the target, not all of it', () => {
    expect(P.weekVerdict(w, 21, 18, at(6))).toMatchObject({ verdict: 'ON_TRACK', expected: 18 })
  })
})

describe('burn-up', () => {
  const weeks = mkWeeks(4, 10)
  it('target is cumulative; actual is null for weeks that have not started', () => {
    const today = addDays(PLAN_START, 8) // week 2
    const ps = [mkProblem({ solvedDate: PLAN_START }), mkProblem({ solvedDate: addDays(PLAN_START, 8) }), mkProblem({ solvedDate: addDays(PLAN_START, 3), status: 'FAILED' })]
    const bu = P.dsaBurnUp(weeks, ps, today)
    expect(bu.map((b) => b.target)).toEqual([10, 20, 30, 40])
    expect(bu.map((b) => b.actual)).toEqual([1, 2, null, null])
  })
  it('an in-progress week stops at today (no future leakage)', () => {
    const today = addDays(PLAN_START, 1)
    const ps = [mkProblem({ solvedDate: today }), mkProblem({ solvedDate: addDays(today, 3) })]
    expect(P.dsaBurnUp(weeks, ps, today)[0]!.actual).toBe(1)
  })
})

describe('aggregations', () => {
  const weeks = mkWeeks(3)
  it('minutes by track per week', () => {
    const blocks = [mkBlock({ date: PLAN_START, track: 'DSA', minutes: 60 }), mkBlock({ date: addDays(PLAN_START, 2), track: 'DSA', minutes: 30 }), mkBlock({ date: addDays(PLAN_START, 8), track: 'GENAI', minutes: 45 })]
    const r = P.minutesByTrackPerWeek(weeks, blocks)
    expect(r[0]).toMatchObject({ week: 1, total: 90 })
    expect(r[0]!.byTrack.DSA).toBe(90)
    expect(r[1]!.byTrack.GENAI).toBe(45)
    expect(r[2]!.total).toBe(0)
  })
  it('applications per week sums daily logs against the target', () => {
    const logs = [mkLog({ date: PLAN_START, applicationsSent: 2 }), mkLog({ date: addDays(PLAN_START, 1), applicationsSent: 3 }), mkLog({ date: addDays(PLAN_START, 8), applicationsSent: 1 })]
    expect(P.applicationsPerWeek(weeks, logs).map((r) => r.sent)).toEqual([5, 1, 0])
  })
  it('sleep series includes ONLY days where fuel was actually entered — gaps stay gaps', () => {
    const logs = [
      mkLog({ date: addDays(PLAN_START, 2), sleepHours: 7, fuelEntered: true }),
      mkLog({ date: addDays(PLAN_START, 1), sleepHours: 6, fuelEntered: true }),
      mkLog({ date: addDays(PLAN_START, 3), sleepHours: 7 }), // carried default, never confirmed
      mkLog({ date: addDays(PLAN_START, 4), fuelEntered: true }), // no hours
    ]
    expect(P.sleepSeries(logs)).toEqual([{ date: addDays(PLAN_START, 1), hours: 6 }, { date: addDays(PLAN_START, 2), hours: 7 }])
  })
})

describe('pattern matrix', () => {
  const mk = (pattern: string, statuses: ('SOLVED_UNAIDED' | 'SOLVED_WITH_HINT' | 'LOOKED_AT_SOLUTION' | 'FAILED')[]) => statuses.map((status) => mkProblem({ pattern, status }))
  it('unaided rate = SOLVED_UNAIDED / total attempts', () => {
    const [a] = P.patternMatrix(mk('Arrays', ['SOLVED_UNAIDED', 'SOLVED_UNAIDED', 'SOLVED_WITH_HINT', 'FAILED']), ['Arrays'])
    expect(a).toMatchObject({ attempts: 4, unaided: 2, unaidedRate: 0.5, hint: 1, failed: 1, solution: 0, weak: false })
  })
  it('NEVER flags weak below 3 attempts', () => {
    const [two] = P.patternMatrix(mk('DP', ['FAILED', 'FAILED']), ['DP'])
    expect(two!.unaidedRate).toBe(0)
    expect(two!.weak).toBe(false)
    const [three] = P.patternMatrix(mk('DP', ['FAILED', 'FAILED', 'LOOKED_AT_SOLUTION']), ['DP'])
    expect(three!.weak).toBe(true)
  })
  it('exactly at the threshold rate is not weak; strictly below is', () => {
    expect(P.patternMatrix(mk('X', ['SOLVED_UNAIDED', 'FAILED', 'FAILED', 'SOLVED_UNAIDED']), ['X'])[0]!.weak).toBe(false) // 50%
    expect(P.patternMatrix(mk('X', ['SOLVED_UNAIDED', 'FAILED', 'FAILED', 'FAILED']), ['X'])[0]!.weak).toBe(true) // 25%
  })
  it('untouched patterns have a null rate (not 0) and unknown patterns still appear', () => {
    const r = P.patternMatrix(mk('Graphs', ['SOLVED_UNAIDED']).concat(mk('Exotic', ['FAILED'])), ['Arrays', 'Graphs'])
    expect(r.find((x) => x.pattern === 'Arrays')).toMatchObject({ attempts: 0, unaidedRate: null, weak: false })
    expect(r.map((x) => x.pattern)).toEqual(['Arrays', 'Graphs', 'Exotic'])
  })
})
