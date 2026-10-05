import { TRACKS, type Track } from '@/lib/enums'
import type { DailyLogRow, DsaProblemRow, LogBlockRow, WeeklyTargetRow } from '@/data/types'
import { daysElapsedInWeek, weekState } from './weeks'
import type { DateStr } from './dates'

/** Target = SUM of the seeded weekly targets — never a hardcoded literal. */
export const dsaTargetTotal = (weeks: Pick<WeeklyTargetRow, 'dsaTarget'>[]): number => weeks.reduce((n, w) => n + w.dsaTarget, 0)
export const applicationTargetTotal = (weeks: Pick<WeeklyTargetRow, 'applicationTarget'>[]): number => weeks.reduce((n, w) => n + w.applicationTarget, 0)

/**
 * A problem counts toward the DSA total once it has been worked to a result:
 * unaided / with a hint / after reading the solution (that one is scheduled for review).
 * FAILED attempts are logged for the pattern matrix but are not "done".
 */
export const countsAsDone = (p: Pick<DsaProblemRow, 'status'>): boolean => p.status !== 'FAILED'

export const dsaDoneTotal = (problems: DsaProblemRow[]): number => problems.filter(countsAsDone).length
export function dsaDoneInRange(problems: DsaProblemRow[], from: DateStr, to: DateStr): number {
  return problems.filter((p) => countsAsDone(p) && p.solvedDate >= from && p.solvedDate <= to).length
}

export type Verdict = 'BEHIND' | 'ON_TRACK' | null
export interface WeekVerdict {
  verdict: Verdict
  actual: number
  target: number
  /** Pro-rata expectation for a current week; the full target for a past week; null for the future. */
  expected: number | null
  /** How many short of expectation (>0 only when BEHIND). */
  shortBy: number
}

/**
 * For the CURRENT week "behind" is judged pro-rata against days elapsed, not raw actual<target —
 * otherwise every Monday is red and the signal dies. Future weeks get NO verdict (never green).
 */
export function weekVerdict(week: Pick<WeeklyTargetRow, 'startDate' | 'endDate'>, target: number, actual: number, today: DateStr): WeekVerdict {
  const state = weekState(week, today)
  if (state === 'FUTURE') return { verdict: null, actual, target, expected: null, shortBy: 0 }
  if (state === 'PAST') {
    const behind = actual < target
    return { verdict: behind ? 'BEHIND' : 'ON_TRACK', actual, target, expected: target, shortBy: behind ? target - actual : 0 }
  }
  const expected = Math.floor((target * daysElapsedInWeek(week, today)) / 7)
  const behind = actual < expected
  return { verdict: behind ? 'BEHIND' : 'ON_TRACK', actual, target, expected, shortBy: behind ? expected - actual : 0 }
}

export interface BurnUpPoint {
  week: number
  /** Cumulative target at the END of this week. */
  target: number
  /** Cumulative done at the end of this week — null for future weeks (no fabricated line). */
  actual: number | null
}
export function dsaBurnUp(weeks: WeeklyTargetRow[], problems: DsaProblemRow[], today: DateStr): BurnUpPoint[] {
  let cumTarget = 0
  return [...weeks]
    .sort((a, b) => a.weekNumber - b.weekNumber)
    .map((w) => {
      cumTarget += w.dsaTarget
      const started = today >= w.startDate
      const upTo = today < w.endDate ? today : w.endDate
      const actual = started ? problems.filter((p) => countsAsDone(p) && p.solvedDate <= upTo).length : null
      return { week: w.weekNumber, target: cumTarget, actual }
    })
}

export type TrackMinutes = Record<Track, number>
export const emptyTrackMinutes = (): TrackMinutes => Object.fromEntries(TRACKS.map((t) => [t, 0])) as TrackMinutes

export interface WeekMinutes {
  week: number
  total: number
  byTrack: TrackMinutes
}
export function minutesByTrackPerWeek(weeks: Pick<WeeklyTargetRow, 'weekNumber' | 'startDate' | 'endDate'>[], blocks: Pick<LogBlockRow, 'date' | 'track' | 'minutes'>[]): WeekMinutes[] {
  return weeks.map((w) => {
    const byTrack = emptyTrackMinutes()
    let total = 0
    for (const b of blocks) {
      if (b.date >= w.startDate && b.date <= w.endDate) {
        byTrack[b.track] += b.minutes
        total += b.minutes
      }
    }
    return { week: w.weekNumber, total, byTrack }
  })
}

export function applicationsPerWeek(weeks: WeeklyTargetRow[], logs: Pick<DailyLogRow, 'date' | 'applicationsSent'>[]): { week: number; sent: number; target: number }[] {
  return weeks.map((w) => ({
    week: w.weekNumber,
    target: w.applicationTarget,
    sent: logs.filter((l) => l.date >= w.startDate && l.date <= w.endDate).reduce((n, l) => n + l.applicationsSent, 0),
  }))
}

/** Sleep points only for days where the user actually entered fuel — gaps stay gaps. */
export function sleepSeries(logs: Pick<DailyLogRow, 'date' | 'sleepHours' | 'fuelEntered'>[]): { date: DateStr; hours: number }[] {
  return logs
    .filter((l) => l.fuelEntered && typeof l.sleepHours === 'number')
    .map((l) => ({ date: l.date, hours: l.sleepHours as number }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

export const WEAK_MIN_ATTEMPTS = 3
export const WEAK_RATE = 0.5
export interface PatternStat {
  pattern: string
  attempts: number
  unaided: number
  hint: number
  solution: number
  failed: number
  /** SOLVED_UNAIDED / total attempts; null when there are no attempts. */
  unaidedRate: number | null
  /** Never flagged below 3 attempts. */
  weak: boolean
}
export function patternMatrix(problems: DsaProblemRow[], patterns: readonly string[]): PatternStat[] {
  const known = new Set(patterns)
  const names = [...patterns, ...new Set(problems.map((p) => p.pattern).filter((p) => !known.has(p)))]
  return names.map((pattern) => {
    const ps = problems.filter((p) => p.pattern === pattern)
    const unaided = ps.filter((p) => p.status === 'SOLVED_UNAIDED').length
    const attempts = ps.length
    const unaidedRate = attempts === 0 ? null : unaided / attempts
    return {
      pattern,
      attempts,
      unaided,
      hint: ps.filter((p) => p.status === 'SOLVED_WITH_HINT').length,
      solution: ps.filter((p) => p.status === 'LOOKED_AT_SOLUTION').length,
      failed: ps.filter((p) => p.status === 'FAILED').length,
      unaidedRate,
      weak: attempts >= WEAK_MIN_ATTEMPTS && unaidedRate !== null && unaidedRate < WEAK_RATE,
    }
  })
}
