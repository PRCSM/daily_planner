import type { Phase } from '@/lib/enums'
import { diffDays } from './dates'
import type { DateStr } from './dates'
import type { WeeklyTargetRow } from '@/data/types'

export const PLAN_WEEKS = 18

/** Week number of `date` relative to the plan start (a Monday). Week 1 is the start week; ≤0 = before the plan, >18 = after. */
export function weekNumberFor(date: DateStr, planStart: DateStr): number {
  return Math.floor(diffDays(planStart, date) / 7) + 1
}

export function phaseForWeek(week: number): Phase {
  if (week <= 1) return 'FROM_SCRATCH'
  if (week <= 4) return 'GET_PRESENTABLE'
  if (week <= 9) return 'UNDER_ABSTRACTIONS'
  if (week <= 14) return 'DESIGN_GENAI'
  return 'CONVERT'
}

export const inPlan = (week: number): boolean => week >= 1 && week <= PLAN_WEEKS

export function weekFor(weeks: WeeklyTargetRow[], date: DateStr): WeeklyTargetRow | undefined {
  return weeks.find((w) => date >= w.startDate && date <= w.endDate)
}

/** Whole days of this week that have COMPLETED before `today` (Monday morning → 0). */
export function daysElapsedInWeek(week: Pick<WeeklyTargetRow, 'startDate'>, today: DateStr): number {
  return Math.max(0, Math.min(7, diffDays(week.startDate, today)))
}

export type WeekPhaseState = 'PAST' | 'CURRENT' | 'FUTURE'
export function weekState(week: Pick<WeeklyTargetRow, 'startDate' | 'endDate'>, today: DateStr): WeekPhaseState {
  if (today < week.startDate) return 'FUTURE'
  if (today > week.endDate) return 'PAST'
  return 'CURRENT'
}

export interface PhaseSpan {
  phase: Phase
  firstWeek: number
  lastWeek: number
  weeks: number
}
/** Contiguous runs of the same phase, for the phase strip. */
export function phaseSpans(weeks: Pick<WeeklyTargetRow, 'weekNumber' | 'phase'>[]): PhaseSpan[] {
  const out: PhaseSpan[] = []
  for (const w of [...weeks].sort((a, b) => a.weekNumber - b.weekNumber)) {
    const last = out[out.length - 1]
    if (last && last.phase === w.phase) {
      last.lastWeek = w.weekNumber
      last.weeks++
    } else out.push({ phase: w.phase, firstWeek: w.weekNumber, lastWeek: w.weekNumber, weeks: 1 })
  }
  return out
}
