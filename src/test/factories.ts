import type { ContentPackRow, DailyLogRow, DsaProblemRow, EventOccurrenceRow, EventRow, LogBlockRow, WeeklyReviewRow, WeeklyTargetRow } from '@/data/types'
import { addDays } from '@/domain/dates'
import { phaseForWeek } from '@/domain/weeks'

/** The fixed fixture clock for tests: a Monday that is week 1 of the plan. Everything else is derived from it. */
export const PLAN_START = '2026-10-05'
export const T0 = addDays(PLAN_START, 21) // a Monday in week 4

let n = 0
const base = () => ({ id: `id-${++n}`, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', deletedAt: null, syncedAt: null })

export const mkEvent = (o: Partial<EventRow> = {}): EventRow => ({
  ...base(), title: 'Event', type: 'CUSTOM', date: T0, criticality: 'SOFT', recurrence: 'NONE', sourceModule: 'CALENDAR', done: false, seeded: false, userModified: false, ...o,
})
export const mkPack = (o: Partial<ContentPackRow> = {}): ContentPackRow => ({
  ...base(), title: 'Pack', topic: 'x', summary: 's', tags: [], source: 'SEEDED', totalCards: 3, estimatedMinutes: 3, seeded: true, userModified: false, ...o,
})
export const mkAnn = (o: Partial<EventOccurrenceRow> & Pick<EventOccurrenceRow, 'eventId' | 'occurrenceDate' | 'status'>): EventOccurrenceRow => ({ ...base(), ...o })

export const mkWeek = (weekNumber: number, o: Partial<WeeklyTargetRow> = {}): WeeklyTargetRow => {
  const startDate = addDays(PLAN_START, (weekNumber - 1) * 7)
  return { ...base(), weekNumber, startDate, endDate: addDays(startDate, 6), phase: phaseForWeek(weekNumber), theme: 'T', dsaTarget: 20, applicationTarget: 5, topics: [], seeded: true, userModified: false, ...o }
}
export const mkWeeks = (count = 18, dsa = 20): WeeklyTargetRow[] => Array.from({ length: count }, (_, i) => mkWeek(i + 1, { dsaTarget: dsa }))

export const mkProblem = (o: Partial<DsaProblemRow> = {}): DsaProblemRow => ({
  ...base(), title: 'P', source: 'LeetCode', pattern: 'Arrays', difficulty: 'MEDIUM', status: 'SOLVED_UNAIDED', solvedDate: T0, reviewDue: null, reviewCount: 0, ...o,
})
export const mkBlock = (o: Partial<LogBlockRow> = {}): LogBlockRow => ({
  ...base(), logId: 'log', date: T0, blockType: 'DEEP_A', track: 'DSA', minutes: 60, aiUsed: false, ...o,
})
export const mkLog = (o: Partial<DailyLogRow> = {}): DailyLogRow => ({
  ...base(), date: T0, weekNumber: 4, phase: 'GET_PRESENTABLE', applicationsSent: 0, conceptsLearned: [], trained: false, aiOffRespected: true, energy: 3, ...o,
})
export const mkReview = (weekNumber: number, q5FuelOk: boolean | null): WeeklyReviewRow => ({ ...base(), weekNumber, q5FuelOk, burnoutFlag: false })
